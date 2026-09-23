import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';
import {
	FILTERABLE_EVENTS,
	buildMessageFilters,
	deriveWebhookSecret,
	secretTag,
	type FilterCondition,
} from './webhook';

/** One webhook registered on the gateway, for one n8n webhook URL (test or production). */
export interface RegistrationRecord {
	webhookId: string;
	/** The session it was registered on, which may differ from the node's current setting. */
	sessionId: string;
	/** Registration settings, to spot changes that need a fresh webhook. */
	fingerprint: string;
}

/** What a trigger keeps in node static data. */
export interface TriggerStaticData {
	/** Keyed by n8n webhook URL, so test and production registrations never touch each other. */
	registrations?: Record<string, RegistrationRecord>;
	/** Recent idempotency keys, for dropping duplicate deliveries (best effort). */
	seenKeys?: string[];
}

interface Registration {
	sessionId: string;
	url: string;
	events: string[];
	retryCount: number;
	filters?: { conditions: FilterCondition[] };
	secret: string;
}

export function triggerStaticData(ctx: { getWorkflowStaticData(type: string): IDataObject }) {
	return ctx.getWorkflowStaticData('node') as TriggerStaticData;
}

/** The API key of the node's credential, used to derive webhook secrets. */
export async function credentialApiKey(ctx: {
	getCredentials(type: string): Promise<IDataObject>;
}): Promise<string> {
	return String((await ctx.getCredentials('openWaApi')).apiKey ?? '');
}

export function configuredSessionId(ctx: {
	getNodeParameter(name: string, fallback?: unknown, options?: IDataObject): unknown;
}): string {
	return String(ctx.getNodeParameter('session', '', { extractValue: true }) ?? '').trim();
}

/** Read and validate the trigger's settings for the current webhook URL. */
async function readRegistration(ctx: IHookFunctions): Promise<Registration> {
	const sessionId = configuredSessionId(ctx);
	if (!sessionId) throw new NodeOperationError(ctx.getNode(), 'Session is required');

	const events = [...new Set(ctx.getNodeParameter('events', []) as string[])];
	if (!events.length) throw new NodeOperationError(ctx.getNode(), 'Select at least one event');

	const options = ctx.getNodeParameter('options', {}) as IDataObject;
	let filters: Registration['filters'];
	try {
		filters = buildMessageFilters(options);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error);
	}
	if (filters) {
		const unfilterable = events.filter((event) => !FILTERABLE_EVENTS.includes(event));
		if (unfilterable.length) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Message filters can't be combined with ${unfilterable.join(', ')}`,
				{
					description: `Filters only work with ${FILTERABLE_EVENTS.join(', ')}. Other events carry no sender, chat or text, so OpenWA would silently drop them. Remove the filters, or those events.`,
				},
			);
		}
	}

	const retryCount = Number(options.retryCount ?? 3);
	const url = ctx.getNodeWebhookUrl('default') ?? '';
	return {
		sessionId,
		url,
		events,
		retryCount: Number.isFinite(retryCount) ? retryCount : 3,
		filters,
		secret: deriveWebhookSecret(await credentialApiKey(ctx), url),
	};
}

function fingerprint({
	sessionId,
	url,
	events,
	retryCount,
	filters,
	secret,
}: Registration): string {
	return JSON.stringify({
		sessionId,
		url,
		events: [...events].sort(),
		retryCount,
		filters,
		secret: secretTag(secret),
	});
}

const webhookPath = (sessionId: string, webhookId?: string) =>
	`/api/sessions/${encodeURIComponent(sessionId)}/webhooks${webhookId ? `/${encodeURIComponent(webhookId)}` : ''}`;

const isNotFound = (error: unknown) => error instanceof NodeApiError && error.httpCode === '404';

/** Delete a registered webhook on the session it was created on; a missing one is fine. */
async function deleteWebhook(ctx: IHookFunctions, record: RegistrationRecord) {
	try {
		await openWaApiRequest.call(ctx, 'DELETE', webhookPath(record.sessionId, record.webhookId), {
			sessionId: record.sessionId,
		});
	} catch (error) {
		if (!isNotFound(error)) throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

function currentUrl(ctx: IHookFunctions): string {
	return ctx.getNodeWebhookUrl('default') ?? '';
}

/** Registration hooks shared by every OpenWA trigger node. */
export const webhookMethods = {
	default: {
		async checkExists(this: IHookFunctions): Promise<boolean> {
			const data = triggerStaticData(this);
			const url = currentUrl(this);
			const record = data.registrations?.[url];
			if (!record) return false;

			const registration = await readRegistration(this);
			try {
				const hook = (await openWaApiRequest.call(
					this,
					'GET',
					webhookPath(record.sessionId, record.webhookId),
					{ sessionId: record.sessionId },
				)) as IDataObject;
				if (hook.active !== false && record.fingerprint === fingerprint(registration)) return true;
			} catch (error) {
				if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
				delete data.registrations![url];
				return false;
			}
			// The settings (session, events, filters, key…) changed: replace this URL's webhook.
			await deleteWebhook(this, record);
			delete data.registrations![url];
			return false;
		},

		async create(this: IHookFunctions): Promise<boolean> {
			const registration = await readRegistration(this);
			let hook: IDataObject;
			try {
				hook = (await openWaApiRequest.call(this, 'POST', webhookPath(registration.sessionId), {
					body: {
						url: registration.url,
						events: registration.events,
						secret: registration.secret,
						retryCount: registration.retryCount,
						...(registration.filters ? { filters: registration.filters } : {}),
					},
					sessionId: registration.sessionId,
				})) as IDataObject;
			} catch (error) {
				if (
					error instanceof NodeApiError &&
					error.httpCode === '400' &&
					/destination address is not allowed/i.test(`${error.message} ${error.description ?? ''}`)
				) {
					error.message =
						'The OpenWA gateway refused this n8n webhook URL (private or local address)';
					error.description = `It can't reach ${registration.url}. Use a publicly reachable n8n URL (set WEBHOOK_URL on n8n), or add this host to SSRF_ALLOWED_HOSTS on the gateway.`;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}

			const data = triggerStaticData(this);
			data.registrations = {
				...data.registrations,
				[registration.url]: {
					webhookId: String(hook.id),
					sessionId: registration.sessionId,
					fingerprint: fingerprint(registration),
				},
			};
			return true;
		},

		async delete(this: IHookFunctions): Promise<boolean> {
			const data = triggerStaticData(this);
			const url = currentUrl(this);
			const record = data.registrations?.[url];
			if (record) {
				await deleteWebhook(this, record);
				delete data.registrations![url];
			}
			return true;
		},
	},
};

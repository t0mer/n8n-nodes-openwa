import { randomBytes } from 'crypto';
import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';
import { ALL_EVENTS_WILDCARD } from './events';
import { UNFILTERABLE_MESSAGE_EVENTS, buildMessageFilters, type FilterCondition } from './webhook';

/** What a trigger remembers between activation and deliveries (node static data). */
export interface TriggerStaticData {
	webhookId?: string;
	secret?: string;
	events?: string[];
	/** Registration settings, to spot changes that need a fresh webhook. */
	fingerprint?: string;
	/** Recent idempotency keys, for dropping duplicate deliveries. */
	seenKeys?: string[];
}

interface Registration {
	sessionId: string;
	url: string;
	events: string[];
	retryCount: number;
	filters?: { conditions: FilterCondition[] };
}

export function triggerStaticData(ctx: { getWorkflowStaticData(type: string): IDataObject }) {
	return ctx.getWorkflowStaticData('node') as TriggerStaticData;
}

function clearRegistration(data: TriggerStaticData): void {
	delete data.webhookId;
	delete data.secret;
	delete data.events;
	delete data.fingerprint;
	delete data.seenKeys;
}

/** Read and validate the trigger's settings. */
function readRegistration(ctx: IHookFunctions): Registration {
	const sessionId = String(
		ctx.getNodeParameter('session', '', { extractValue: true }) ?? '',
	).trim();
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
		const unfilterable = events.filter(
			(event) => event === ALL_EVENTS_WILDCARD || UNFILTERABLE_MESSAGE_EVENTS.includes(event),
		);
		if (unfilterable.length) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Message filters can't be combined with ${unfilterable.join(', ')}`,
				{
					description:
						"Those events carry no sender, chat or text, so OpenWA's filters would silently drop them. Remove the filters, or select only message events that carry a message (received, sent, edited, revoked).",
				},
			);
		}
	}

	const retryCount = Number(options.retryCount ?? 3);
	return {
		sessionId,
		url: ctx.getNodeWebhookUrl('default') ?? '',
		events,
		retryCount: Number.isFinite(retryCount) ? retryCount : 3,
		filters,
	};
}

function fingerprint({ sessionId, url, events, retryCount, filters }: Registration): string {
	return JSON.stringify({ sessionId, url, events: [...events].sort(), retryCount, filters });
}

const webhooksPath = (sessionId: string) =>
	`/api/sessions/${encodeURIComponent(sessionId)}/webhooks`;

const isNotFound = (error: unknown) => error instanceof NodeApiError && error.httpCode === '404';

async function deleteWebhook(ctx: IHookFunctions, sessionId: string, webhookId: string) {
	try {
		await openWaApiRequest.call(
			ctx,
			'DELETE',
			`${webhooksPath(sessionId)}/${encodeURIComponent(webhookId)}`,
			{
				sessionId,
			},
		);
	} catch (error) {
		// Already gone on the gateway: nothing left to clean up.
		if (!isNotFound(error)) throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

/** Registration hooks shared by every OpenWA trigger node. */
export const webhookMethods = {
	default: {
		async checkExists(this: IHookFunctions): Promise<boolean> {
			const data = triggerStaticData(this);
			if (!data.webhookId) return false;
			const registration = readRegistration(this);
			try {
				const hook = (await openWaApiRequest.call(
					this,
					'GET',
					`${webhooksPath(registration.sessionId)}/${encodeURIComponent(data.webhookId)}`,
					{ sessionId: registration.sessionId },
				)) as IDataObject;
				if (hook.active !== false && data.fingerprint === fingerprint(registration)) return true;
			} catch (error) {
				if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
				clearRegistration(data);
				return false;
			}
			// The settings changed since it was registered: replace it.
			await deleteWebhook(this, registration.sessionId, data.webhookId);
			clearRegistration(data);
			return false;
		},

		async create(this: IHookFunctions): Promise<boolean> {
			const registration = readRegistration(this);
			const secret = randomBytes(32).toString('hex');
			let hook: IDataObject;
			try {
				hook = (await openWaApiRequest.call(this, 'POST', webhooksPath(registration.sessionId), {
					body: {
						url: registration.url,
						events: registration.events,
						secret,
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
			data.webhookId = String(hook.id);
			data.secret = secret;
			data.events = registration.events;
			data.fingerprint = fingerprint(registration);
			data.seenKeys = [];
			return true;
		},

		async delete(this: IHookFunctions): Promise<boolean> {
			const data = triggerStaticData(this);
			if (data.webhookId) {
				const sessionId = String(
					this.getNodeParameter('session', '', { extractValue: true }) ?? '',
				).trim();
				await deleteWebhook(this, sessionId, data.webhookId);
			}
			clearRegistration(data);
			return true;
		},
	},
};

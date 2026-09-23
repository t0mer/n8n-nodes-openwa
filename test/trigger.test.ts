import { createHmac } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestOptions,
	IWebhookFunctions,
} from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { webhookMethods, type TriggerStaticData } from '../nodes/OpenWa/trigger/lifecycle';
import { receiveWebhook } from '../nodes/OpenWa/trigger/receive';
import { deriveWebhookSecret } from '../nodes/OpenWa/trigger/webhook';

const node = {
	id: '1',
	name: 'OpenWA Trigger',
	type: 'openWaEventTrigger',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};
const apiKey = ['unit', 'test', 'api', 'key'].join('-');
const gateway = 'https://wa.example.com/api/sessions';
const prodUrl = 'https://n8n.example.com/webhook/abc/webhook';
const testUrl = 'https://n8n.example.com/webhook-test/abc/webhook';

/** What n8n-core throws for a failed request: the response is kept as `cause`. */
function httpError(status: number, message: string) {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		httpCode: String(status),
		cause: { response: { status, data: { message, statusCode: status } } },
	});
}

const readParam =
	(params: Record<string, unknown>) =>
	(name: string, fallback?: unknown, opts?: { extractValue?: boolean }) => {
		const value = params[name] ?? fallback;
		return opts?.extractValue && value && typeof value === 'object' && 'value' in value
			? (value as { value: unknown }).value
			: value;
	};

function hookContext(
	params: Record<string, unknown>,
	{
		respond = () => ({ id: 'wh1' }),
		staticData = {},
		url = prodUrl,
		key = apiKey,
	}: {
		respond?: (options: IHttpRequestOptions) => unknown;
		staticData?: TriggerStaticData;
		url?: string;
		key?: string;
	} = {},
) {
	const calls: IHttpRequestOptions[] = [];
	const ctx = {
		getNode: () => node,
		getNodeParameter: readParam(params),
		getNodeWebhookUrl: () => url,
		getWorkflowStaticData: () => staticData,
		getCredentials: async () => ({ baseUrl: 'https://wa.example.com', apiKey: key }),
		helpers: {
			async httpRequestWithAuthentication(_type: string, options: IHttpRequestOptions) {
				calls.push(options);
				const result = respond(options);
				if (result instanceof Error) throw result;
				return result;
			},
		},
	};
	return { ctx: ctx as unknown as IHookFunctions, calls, staticData };
}

const sessionA = { mode: 'id', value: 'sA' };
const base = { session: sessionA, events: ['message.received'], options: {} };

async function registered(params: Record<string, unknown> = base, url = prodUrl) {
	const staticData: TriggerStaticData = {};
	await webhookMethods.default.create.call(hookContext(params, { staticData, url }).ctx);
	return staticData;
}

describe('create', () => {
	it('registers the webhook with a secret derived from the API key and URL', async () => {
		const { ctx, calls, staticData } = hookContext(base);
		expect(await webhookMethods.default.create.call(ctx)).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ method: 'POST', url: `${gateway}/sA/webhooks` });
		expect(calls[0].body).toEqual({
			url: prodUrl,
			events: ['message.received'],
			secret: deriveWebhookSecret(apiKey, prodUrl),
			retryCount: 3,
		});
		expect(staticData.registrations?.[prodUrl]).toMatchObject({
			webhookId: 'wh1',
			sessionId: 'sA',
		});
		expect(JSON.stringify(staticData)).not.toContain(deriveWebhookSecret(apiKey, prodUrl));
	});

	it('sends message filters and the chosen retry count', async () => {
		const { ctx, calls } = hookContext({
			...base,
			events: ['message.received', 'message.sent'],
			options: { onlyFrom: '972501234567', chatType: 'direct', retryCount: 5 },
		});
		await webhookMethods.default.create.call(ctx);
		expect(calls[0].body).toMatchObject({
			retryCount: 5,
			filters: {
				conditions: [
					{ field: 'sender', operator: 'is', value: ['972501234567@c.us'] },
					{ field: 'isGroup', operator: 'equals', value: false },
				],
			},
		});
	});

	it.each([['message.ack'], ['message.reaction'], ['session.status'], ['group.join'], ['*']])(
		'refuses filters combined with %s, before calling the gateway',
		async (event) => {
			const { ctx, calls } = hookContext({
				...base,
				events: ['message.received', event],
				options: { bodyContains: 'hi' },
			});
			await expect(webhookMethods.default.create.call(ctx)).rejects.toThrow(
				`Message filters can't be combined with ${event}`,
			);
			expect(calls).toHaveLength(0);
		},
	);

	it('explains the gateway refusing a private n8n URL', async () => {
		const { ctx } = hookContext(base, {
			respond: () => httpError(400, 'Destination address is not allowed'),
		});
		const error = await webhookMethods.default.create
			.call(ctx)
			.catch((e: Error & { description?: string }) => e);
		expect(error.message).toMatch(/refused this n8n webhook URL/);
		expect(error.description).toMatch(/SSRF_ALLOWED_HOSTS/);
	});

	it('requires a session and at least one event', async () => {
		await expect(
			webhookMethods.default.create.call(
				hookContext({ ...base, session: { mode: 'id', value: '' } }).ctx,
			),
		).rejects.toThrow('Session is required');
		await expect(
			webhookMethods.default.create.call(hookContext({ ...base, events: [] }).ctx),
		).rejects.toThrow('Select at least one event');
	});
});

describe('checkExists', () => {
	it('is false without a registration for this URL', async () => {
		const { ctx, calls } = hookContext(base);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it('is true when the webhook exists with the same settings', async () => {
		const staticData = await registered();
		const { ctx, calls } = hookContext(base, {
			respond: () => ({ id: 'wh1', active: true }),
			staticData,
		});
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(true);
		expect(calls.map((c) => [c.method, c.url])).toEqual([['GET', `${gateway}/sA/webhooks/wh1`]]);
	});

	it('forgets a webhook the gateway no longer has', async () => {
		const staticData = await registered();
		const { ctx } = hookContext(base, {
			respond: () => httpError(404, 'Webhook not found'),
			staticData,
		});
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(staticData.registrations?.[prodUrl]).toBeUndefined();
	});

	it('replaces the webhook when the events changed', async () => {
		const staticData = await registered();
		const { ctx, calls } = hookContext(
			{ ...base, events: ['message.received', 'message.sent'] },
			{
				respond: (o) => (o.method === 'GET' ? { id: 'wh1', active: true } : { success: true }),
				staticData,
			},
		);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(calls.map((c) => c.method)).toEqual(['GET', 'DELETE']);
		expect(staticData.registrations?.[prodUrl]).toBeUndefined();
	});

	it('deletes the old webhook on its original session when the session changed', async () => {
		const staticData = await registered();
		const { ctx, calls } = hookContext(
			{ ...base, session: { mode: 'id', value: 'sB' } },
			{
				respond: (o) => (o.method === 'GET' ? { id: 'wh1', active: true } : { success: true }),
				staticData,
			},
		);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			['GET', `${gateway}/sA/webhooks/wh1`],
			['DELETE', `${gateway}/sA/webhooks/wh1`],
		]);
	});

	it('re-registers when the API key (and so the secret) changed', async () => {
		const staticData = await registered();
		const { ctx } = hookContext(base, {
			respond: (o) => (o.method === 'GET' ? { id: 'wh1', active: true } : { success: true }),
			staticData,
			key: `${apiKey}-rotated`,
		});
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
	});
});

describe('test and production webhooks', () => {
	it('keeps separate registrations and never touches the other one', async () => {
		const staticData = await registered(base, prodUrl);
		const respond = (o: IHttpRequestOptions) =>
			o.method === 'POST' ? { id: 'wh-test' } : { id: 'x', active: true };

		// "Listen for test event" while the workflow is active.
		const test = hookContext(base, { respond, staticData, url: testUrl });
		expect(await webhookMethods.default.checkExists.call(test.ctx)).toBe(false);
		expect(await webhookMethods.default.create.call(test.ctx)).toBe(true);
		expect(await webhookMethods.default.delete.call(test.ctx)).toBe(true);
		expect(test.calls.map((c) => [c.method, c.url])).toEqual([
			['POST', `${gateway}/sA/webhooks`],
			['DELETE', `${gateway}/sA/webhooks/wh-test`],
		]);

		// The production registration is untouched and still recognised.
		expect(staticData.registrations?.[prodUrl]).toMatchObject({ webhookId: 'wh1' });
		const prod = hookContext(base, { respond, staticData, url: prodUrl });
		expect(await webhookMethods.default.checkExists.call(prod.ctx)).toBe(true);
	});
});

describe('delete', () => {
	it('deletes this URL’s webhook on its session and forgets it', async () => {
		const staticData = await registered();
		const { ctx, calls } = hookContext(
			{ ...base, session: { mode: 'id', value: 'sB' } },
			{ respond: () => ({ success: true }), staticData },
		);
		expect(await webhookMethods.default.delete.call(ctx)).toBe(true);
		expect(calls.map((c) => [c.method, c.url])).toEqual([['DELETE', `${gateway}/sA/webhooks/wh1`]]);
		expect(staticData.registrations).toEqual({});
	});

	it('treats an already-deleted webhook as done', async () => {
		const staticData = await registered();
		const { ctx } = hookContext(base, {
			respond: () => httpError(404, 'Webhook not found'),
			staticData,
		});
		expect(await webhookMethods.default.delete.call(ctx)).toBe(true);
		expect(staticData.registrations).toEqual({});
	});
});

describe('receiveWebhook', () => {
	const delivery = {
		event: 'message.received',
		timestamp: '2026-09-23T10:00:00.000Z',
		sessionId: 'sA',
		idempotencyKey: 'msg_sA_ABC',
		deliveryId: 'dlv_1',
		data: { id: 'ABC', body: 'hi' },
	};
	const sign = (raw: Buffer | string, url = prodUrl) =>
		`sha256=${createHmac('sha256', deriveWebhookSecret(apiKey, url)).update(raw).digest('hex')}`;

	function webhookContext({
		params = base as Record<string, unknown>,
		body = delivery as IDataObject,
		headers = {} as IDataObject,
		staticData = {} as TriggerStaticData,
		raw,
		noRawBody = false,
		url = prodUrl,
	}: {
		params?: Record<string, unknown>;
		body?: IDataObject;
		headers?: IDataObject;
		staticData?: TriggerStaticData;
		raw?: Buffer;
		noRawBody?: boolean;
		url?: string;
	} = {}) {
		const rawBody = raw ?? Buffer.from(JSON.stringify(body));
		const response = { code: 200, body: undefined as unknown };
		const res = {
			status(code: number) {
				response.code = code;
				return res;
			},
			json(payload: unknown) {
				response.body = payload;
				return res;
			},
		};
		const ctx = {
			getNodeParameter: readParam(params),
			getNodeWebhookUrl: () => url,
			getCredentials: async () => ({ baseUrl: 'https://wa.example.com', apiKey }),
			getHeaderData: () => ({
				'x-openwa-signature': sign(rawBody, url),
				'x-openwa-event': body.event,
				...headers,
			}),
			getBodyData: () => body,
			getRequestObject: () => (noRawBody ? {} : { rawBody }),
			getResponseObject: () => res,
			getWorkflowStaticData: () => staticData,
			helpers: { returnJsonArray: (items: IDataObject[]) => items.map((json) => ({ json })) },
		};
		return { ctx: ctx as unknown as IWebhookFunctions, response, staticData };
	}

	it('runs the workflow with the delivery when the signature matches', async () => {
		const { ctx } = webhookContext();
		expect(await receiveWebhook.call(ctx)).toEqual({ workflowData: [[{ json: delivery }]] });
	});

	it('verifies test-URL deliveries with the test URL’s secret', async () => {
		const { ctx } = webhookContext({ url: testUrl });
		expect(await receiveWebhook.call(ctx)).toHaveProperty('workflowData');
	});

	it('rejects a bad or missing signature with 401, even with no stored state', async () => {
		const bad = webhookContext({ headers: { 'x-openwa-signature': 'sha256=deadbeef' } });
		expect(await receiveWebhook.call(bad.ctx)).toEqual({ noWebhookResponse: true });
		expect(bad.response.code).toBe(401);

		const missing = webhookContext({ headers: { 'x-openwa-signature': undefined } });
		await receiveWebhook.call(missing.ctx);
		expect(missing.response.code).toBe(401);
	});

	it('rejects a body changed after signing', async () => {
		const { ctx, response } = webhookContext({
			raw: Buffer.from(JSON.stringify({ ...delivery, data: { body: 'changed' } })),
			headers: { 'x-openwa-signature': sign(JSON.stringify(delivery)) },
		});
		expect(await receiveWebhook.call(ctx)).toEqual({ noWebhookResponse: true });
		expect(response.code).toBe(401);
	});

	it('falls back to the parsed body when n8n kept no raw body', async () => {
		const { ctx } = webhookContext({ noRawBody: true });
		expect(await receiveWebhook.call(ctx)).toHaveProperty('workflowData');
	});

	it('skips the check only when Verify Signature is turned off', async () => {
		const off = webhookContext({
			params: { ...base, options: { verifySignature: false } },
			headers: { 'x-openwa-signature': 'nope' },
		});
		expect(await receiveWebhook.call(off.ctx)).toHaveProperty('workflowData');
	});

	it('ignores deliveries for another session', async () => {
		const { ctx, response } = webhookContext({ body: { ...delivery, sessionId: 'sB' } });
		expect(await receiveWebhook.call(ctx)).toEqual({ noWebhookResponse: true });
		expect(response).toEqual({ code: 200, body: { ignored: 'delivery is for another session' } });
	});

	it('acknowledges but ignores events that are not selected; * accepts any', async () => {
		const other = webhookContext({ body: { ...delivery, event: 'message.ack' } });
		expect(await receiveWebhook.call(other.ctx)).toEqual({ noWebhookResponse: true });
		expect(other.response).toEqual({
			code: 200,
			body: { ignored: 'event "message.ack" is not selected' },
		});

		const all = webhookContext({
			params: { ...base, events: ['*'] },
			body: { ...delivery, event: 'call.received' },
		});
		expect(await receiveWebhook.call(all.ctx)).toHaveProperty('workflowData');
	});

	it('drops a repeated delivery unless duplicates are allowed', async () => {
		const staticData: TriggerStaticData = {};
		expect(await receiveWebhook.call(webhookContext({ staticData }).ctx)).toHaveProperty(
			'workflowData',
		);
		const repeat = webhookContext({
			staticData,
			headers: { 'x-openwa-idempotency-key': 'msg_sA_ABC' },
		});
		expect(await receiveWebhook.call(repeat.ctx)).toEqual({ noWebhookResponse: true });
		expect(repeat.response.body).toEqual({ ignored: 'duplicate delivery' });
		expect(staticData.seenKeys).toEqual(['msg_sA_ABC']);

		const allowed = webhookContext({
			staticData,
			params: { ...base, options: { ignoreDuplicates: false } },
		});
		expect(await receiveWebhook.call(allowed.ctx)).toHaveProperty('workflowData');
	});
});

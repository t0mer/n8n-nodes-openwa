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

const node = {
	id: '1',
	name: 'OpenWA Trigger',
	type: 'openWaTrigger',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};
const hooksUrl = 'https://wa.example.com/api/sessions/s1/webhooks';
const n8nUrl = 'https://n8n.example.com/webhook/abc/webhook';

/** What n8n-core throws for a failed request: the response is kept as `cause`. */
function httpError(status: number, message: string) {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		httpCode: String(status),
		cause: { response: { status, data: { message, statusCode: status } } },
	});
}

function hookContext(
	params: Record<string, unknown>,
	respond: (options: IHttpRequestOptions) => unknown = () => ({ id: 'wh1' }),
	staticData: TriggerStaticData = {},
) {
	const calls: IHttpRequestOptions[] = [];
	const ctx = {
		getNode: () => node,
		getNodeParameter: (name: string, fallback?: unknown, opts?: { extractValue?: boolean }) => {
			const value = params[name] ?? fallback;
			return opts?.extractValue && value && typeof value === 'object' && 'value' in value
				? (value as { value: unknown }).value
				: value;
		},
		getNodeWebhookUrl: () => n8nUrl,
		getWorkflowStaticData: () => staticData,
		getCredentials: async () => ({ baseUrl: 'https://wa.example.com', apiKey: 'test' }),
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

const base = { session: { mode: 'id', value: 's1' }, events: ['message.received'], options: {} };

describe('create', () => {
	it('registers the webhook with a generated secret and remembers it', async () => {
		const { ctx, calls, staticData } = hookContext(base);
		expect(await webhookMethods.default.create.call(ctx)).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ method: 'POST', url: hooksUrl });
		const body = calls[0].body as IDataObject;
		expect(body).toMatchObject({ url: n8nUrl, events: ['message.received'], retryCount: 3 });
		expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
		expect(body).not.toHaveProperty('filters');
		expect(staticData).toMatchObject({
			webhookId: 'wh1',
			secret: body.secret,
			events: ['message.received'],
			seenKeys: [],
		});
		expect(staticData.fingerprint).toBeTruthy();
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

	it.each([['message.ack'], ['message.reaction'], ['*']])(
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
		const { ctx } = hookContext(base, () => httpError(400, 'Destination address is not allowed'));
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
	async function registered(params = base) {
		const staticData: TriggerStaticData = {};
		await webhookMethods.default.create.call(hookContext(params, undefined, staticData).ctx);
		return staticData;
	}

	it('is false without a stored webhook', async () => {
		const { ctx, calls } = hookContext(base);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it('is true when the webhook exists with the same settings', async () => {
		const staticData = await registered();
		const { ctx, calls } = hookContext(base, () => ({ id: 'wh1', active: true }), staticData);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(true);
		expect(calls.map((c) => [c.method, c.url])).toEqual([['GET', `${hooksUrl}/wh1`]]);
	});

	it('forgets a webhook the gateway no longer has', async () => {
		const staticData = await registered();
		const { ctx } = hookContext(base, () => httpError(404, 'Webhook not found'), staticData);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(staticData.webhookId).toBeUndefined();
	});

	it('replaces the webhook when the settings changed', async () => {
		const staticData = await registered();
		const { ctx, calls } = hookContext(
			{ ...base, events: ['message.received', 'message.sent'] },
			(o) => (o.method === 'GET' ? { id: 'wh1', active: true } : { success: true }),
			staticData,
		);
		expect(await webhookMethods.default.checkExists.call(ctx)).toBe(false);
		expect(calls.map((c) => c.method)).toEqual(['GET', 'DELETE']);
		expect(staticData.webhookId).toBeUndefined();
	});
});

describe('delete', () => {
	it('deletes the webhook and clears what was stored', async () => {
		const staticData: TriggerStaticData = { webhookId: 'wh1', secret: 's', seenKeys: ['k'] };
		const { ctx, calls } = hookContext(base, () => ({ success: true }), staticData);
		expect(await webhookMethods.default.delete.call(ctx)).toBe(true);
		expect(calls.map((c) => [c.method, c.url])).toEqual([['DELETE', `${hooksUrl}/wh1`]]);
		expect(staticData).toEqual({});
	});

	it('treats an already-deleted webhook as done', async () => {
		const staticData: TriggerStaticData = { webhookId: 'wh1' };
		const { ctx } = hookContext(base, () => httpError(404, 'Webhook not found'), staticData);
		expect(await webhookMethods.default.delete.call(ctx)).toBe(true);
		expect(staticData).toEqual({});
	});
});

describe('receiveWebhook', () => {
	const signingKey = ['unit', 'test', 'webhook', 'key'].join('-');
	const delivery = {
		event: 'message.received',
		timestamp: '2026-09-23T10:00:00.000Z',
		sessionId: 's1',
		idempotencyKey: 'msg_s1_ABC',
		deliveryId: 'dlv_1',
		data: { id: 'ABC', body: 'hi' },
	};

	function webhookContext({
		params = base as Record<string, unknown>,
		body = delivery as IDataObject,
		headers = {} as IDataObject,
		staticData = { secret: signingKey } as TriggerStaticData,
		raw,
	}: {
		params?: Record<string, unknown>;
		body?: IDataObject;
		headers?: IDataObject;
		staticData?: TriggerStaticData;
		raw?: Buffer;
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
		const signature = `sha256=${createHmac('sha256', signingKey).update(rawBody).digest('hex')}`;
		const ctx = {
			getNodeParameter: (name: string, fallback?: unknown) => params[name] ?? fallback,
			getHeaderData: () => ({
				'x-openwa-signature': signature,
				'x-openwa-event': body.event,
				...headers,
			}),
			getBodyData: () => body,
			getRequestObject: () => ({ rawBody }),
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

	it('rejects a bad or missing signature with 401', async () => {
		const bad = webhookContext({ headers: { 'x-openwa-signature': 'sha256=deadbeef' } });
		expect(await receiveWebhook.call(bad.ctx)).toEqual({ noWebhookResponse: true });
		expect(bad.response.code).toBe(401);

		const missing = webhookContext({ headers: { 'x-openwa-signature': undefined } });
		await receiveWebhook.call(missing.ctx);
		expect(missing.response.code).toBe(401);
	});

	it('rejects a body changed after signing', async () => {
		const signedFor = JSON.stringify(delivery);
		const { ctx, response } = webhookContext({
			raw: Buffer.from(JSON.stringify({ ...delivery, data: { body: 'changed' } })),
			headers: {
				'x-openwa-signature': `sha256=${createHmac('sha256', signingKey).update(signedFor).digest('hex')}`,
			},
		});
		expect(await receiveWebhook.call(ctx)).toEqual({ noWebhookResponse: true });
		expect(response.code).toBe(401);
	});

	it('skips the check when Verify Signature is off, or when no secret was stored', async () => {
		const off = webhookContext({
			params: { ...base, options: { verifySignature: false } },
			headers: { 'x-openwa-signature': 'nope' },
		});
		expect(await receiveWebhook.call(off.ctx)).toHaveProperty('workflowData');
		const noSecret = webhookContext({
			staticData: {},
			headers: { 'x-openwa-signature': undefined },
		});
		expect(await receiveWebhook.call(noSecret.ctx)).toHaveProperty('workflowData');
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
		const staticData: TriggerStaticData = { secret: signingKey };
		expect(await receiveWebhook.call(webhookContext({ staticData }).ctx)).toHaveProperty(
			'workflowData',
		);
		const repeat = webhookContext({
			staticData,
			headers: { 'x-openwa-idempotency-key': 'msg_s1_ABC' },
		});
		expect(await receiveWebhook.call(repeat.ctx)).toEqual({ noWebhookResponse: true });
		expect(repeat.response.body).toEqual({ ignored: 'duplicate delivery' });
		expect(staticData.seenKeys).toEqual(['msg_s1_ABC']);

		const allowed = webhookContext({
			staticData,
			params: { ...base, options: { ignoreDuplicates: false } },
		});
		expect(await receiveWebhook.call(allowed.ctx)).toHaveProperty('workflowData');
	});
});

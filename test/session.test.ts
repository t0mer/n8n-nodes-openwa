import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeSession } from '../nodes/OpenWa/actions/session';
import { fakeContext, type Responder } from './fakeContext';

const base = 'https://wa.example.com/api/sessions';

async function run(
	params: Record<string, unknown>,
	response: unknown = { ok: true },
	sessionId = 's1',
) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeSession(ctx, 0, sessionId);
	return { result, calls: calls.map(({ method, url, body, qs }) => ({ method, url, body, qs })) };
}
const one = async (params: Record<string, unknown>, sessionId?: string) =>
	(await run(params, undefined, sessionId)).calls[0];

/** A gateway error as the request helper would receive it. */
const httpError =
	(status: number, message: string): Responder =>
	() =>
		Object.assign(new Error(message), { response: { status, data: { message } } });

const errorOf = (params: Record<string, unknown>, response: Responder, sessionId = 's1') =>
	run(params, response, sessionId).then(
		() => undefined,
		(e: unknown) => e as NodeApiError,
	);

describe('session', () => {
	it('get many pages with limit/offset and the name filter', async () => {
		const { result, calls } = await run(
			{ operation: 'getAll', returnAll: false, limit: 2, sessionFilters: { name: ' my-bot ' } },
			[{ id: 'a' }, { id: 'b' }],
			'',
		);
		expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(calls).toEqual([
			{ method: 'GET', url: base, body: undefined, qs: { limit: 2, offset: 0, name: 'my-bot' } },
		]);
	});

	it('get many without a filter sends no name', async () => {
		const { calls } = await run({ operation: 'getAll', returnAll: true }, [], '');
		expect(calls[0].qs).toEqual({ limit: 1000, offset: 0 });
	});

	it('create sends the name, config and proxy', async () => {
		expect(
			await one(
				{
					operation: 'create',
					sessionName: ' my-bot ',
					sessionOptions: {
						autoRejectCalls: true,
						maxReconnectAttempts: 0,
						proxyUrl: 'socks5://proxy:1080',
						proxyType: 'socks5',
					},
				},
				'',
			),
		).toEqual({
			method: 'POST',
			url: base,
			qs: undefined,
			body: {
				name: 'my-bot',
				config: { autoRejectCalls: true, maxReconnectAttempts: 0 },
				proxyUrl: 'socks5://proxy:1080',
				proxyType: 'socks5',
			},
		});
	});

	it('create with only a name sends only the name', async () => {
		expect((await one({ operation: 'create', sessionName: 'bot-1' }, '')).body).toEqual({
			name: 'bot-1',
		});
	});

	it.each(['ab', 'my bot', 'a'.repeat(51), 'bot_1'])(
		'create rejects the name "%s"',
		async (name) => {
			await expect(run({ operation: 'create', sessionName: name }, {}, '')).rejects.toThrow(
				'Name must be 3–50 characters',
			);
		},
	);

	it.each([
		['get', 'GET', '/s1'],
		['start', 'POST', '/s1/start'],
		['stop', 'POST', '/s1/stop'],
		['logout', 'POST', '/s1/logout'],
		['forceKill', 'POST', '/s1/force-kill'],
		['getConfig', 'GET', '/s1/config'],
		['getProxy', 'GET', '/s1/proxy'],
	])('%s calls %s %s', async (operation, method, path) => {
		expect(await one({ operation })).toEqual({
			method,
			url: `${base}${path}`,
			body: undefined,
			qs: undefined,
		});
	});

	it('get stats needs no session', async () => {
		expect((await one({ operation: 'getStats' }, '')).url).toBe(`${base}/stats/overview`);
	});

	it('delete outputs success for the empty 204 response', async () => {
		const { result, calls } = await run({ operation: 'delete' }, '');
		expect(calls[0]).toMatchObject({ method: 'DELETE', url: `${base}/s1` });
		expect(result).toEqual({ success: true, sessionId: 's1' });
	});

	it('get QR attaches a data URL as PNG binary', async () => {
		const png = Buffer.from('png-bytes').toString('base64');
		const response = { qrCode: `data:image/png;base64,${png}`, status: 'qr_ready' };
		const { result, calls } = await run({ operation: 'getQr' }, response);
		expect(calls[0]).toMatchObject({ method: 'GET', url: `${base}/s1/qr` });
		expect(result).toEqual({
			json: response,
			binary: { data: { data: png, fileName: 'qr.png', mimeType: 'image/png' } },
		});
	});

	it('get QR returns plain JSON when the code is not a data URL', async () => {
		const response = { qrCode: '2@abc,def', status: 'qr_ready' };
		expect((await run({ operation: 'getQr' }, response)).result).toEqual(response);
	});

	it('request pairing code normalizes the phone to digits', async () => {
		expect(
			await one({ operation: 'requestPairingCode', pairingPhoneNumber: '+972 (50) 123-4567' }),
		).toMatchObject({
			method: 'POST',
			url: `${base}/s1/pairing-code`,
			body: { phoneNumber: '972501234567' },
		});
	});

	it.each(['', '972501234567@c.us', 'abc'])('request pairing code rejects "%s"', async (phone) => {
		await expect(
			run({ operation: 'requestPairingCode', pairingPhoneNumber: phone }),
		).rejects.toThrow('Phone Number must be digits');
	});

	it('update config sets values and resets others to null', async () => {
		expect(
			await one({
				operation: 'updateConfig',
				configFields: { autoRejectCalls: false, reconnectBaseDelay: 2000 },
				resetConfig: ['maxReconnectAttempts'],
			}),
		).toEqual({
			method: 'PATCH',
			url: `${base}/s1/config`,
			qs: undefined,
			body: { autoRejectCalls: false, reconnectBaseDelay: 2000, maxReconnectAttempts: null },
		});
	});

	it('update config refuses an empty update', async () => {
		await expect(run({ operation: 'updateConfig' })).rejects.toThrow('Add at least one field');
	});

	it('update config refuses a key that is both set and reset', async () => {
		await expect(
			run({
				operation: 'updateConfig',
				configFields: { maxReconnectAttempts: 3 },
				resetConfig: ['maxReconnectAttempts'],
			}),
		).rejects.toThrow("can't be both updated and reset");
	});

	it.each([
		['http://proxy:8080', 'http://proxy:8080'],
		['  ', null],
	])('update proxy sends "%s" as %s', async (proxyUrl, expected) => {
		expect(await one({ operation: 'updateProxy', proxyUrl })).toMatchObject({
			method: 'PATCH',
			url: `${base}/s1/proxy`,
			body: { proxyUrl: expected },
		});
	});

	it.each([
		['create', 'Session name already exists', ''],
		['delete', 'Session name teardown pending', 's1'],
		['start', 'Another node holds this session', 's1'],
		['stop', 'Another node holds this session', 's1'],
	])('%s surfaces the gateway message on 409', async (operation, message, sessionId) => {
		const error = await errorOf(
			{ operation, sessionName: 'bot-1' },
			httpError(409, message),
			sessionId,
		);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error?.message).toBe(message);
	});

	it('other session routes still read a 409 as session state', async () => {
		const error = await errorOf({ operation: 'logout' }, httpError(409, 'reloading'));
		expect(error?.message).toMatch(/Session "s1" is not ready/);
	});
});

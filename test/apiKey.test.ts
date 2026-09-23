import { NodeApiError, type ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeApiKey, parseList } from '../nodes/OpenWa/actions/apiKey';
import { isSessionless, sessionFields } from '../nodes/OpenWa/descriptions/common';
import { searchApiKeys } from '../nodes/OpenWa/methods/listSearch';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext, type Responder } from './fakeContext';

const base = 'https://wa.example.com/api/auth/api-keys';
const apiKeyId = { mode: 'id', value: ' key 1 ' };
const keyPath = `${base}/key%201`;

async function run(params: Record<string, unknown>, response: unknown = { ok: true }) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeApiKey(ctx, 0);
	return { result, calls: calls.map(({ method, url, body }) => ({ method, url, body })) };
}
const one = async (params: Record<string, unknown>) => (await run(params)).calls[0];

/** A gateway error as the request helper would receive it. */
const httpError =
	(status: number, message: string): Responder =>
	() =>
		Object.assign(new Error(message), { response: { status, data: { message } } });

describe('apiKey', () => {
	it('create sends the name, role and trimmed lists, and returns the key once', async () => {
		const created = { id: 'k1', apiKey: 'owa_k1_secret' };
		const { result, calls } = await run(
			{
				operation: 'create',
				keyName: ' Bot ',
				apiKeyRole: 'viewer',
				apiKeyOptions: {
					allowedIps: ' 192.168.1.1, ,10.0.0.0/8 ',
					allowedSessions: '0a941dac-a965-45e7-b318-74ae8be134f0',
					allowedChats: '120363000000000000@g.us, 972501234567',
					expiresAt: '2027-12-31T23:59:59',
				},
				__timezone: 'Asia/Jerusalem',
			},
			created,
		);
		expect(result).toEqual(created);
		expect(calls).toEqual([
			{
				method: 'POST',
				url: base,
				body: {
					name: 'Bot',
					role: 'viewer',
					allowedIps: ['192.168.1.1', '10.0.0.0/8'],
					allowedSessions: ['0a941dac-a965-45e7-b318-74ae8be134f0'],
					allowedChats: ['120363000000000000@g.us', '972501234567'],
					expiresAt: '2027-12-31T21:59:59.000Z',
				},
			},
		]);
	});

	it('create omits empty options and requires a name', async () => {
		const call = await one({
			operation: 'create',
			keyName: 'Bot',
			apiKeyRole: 'operator',
			apiKeyOptions: { allowedIps: ' , ', expiresAt: '' },
		});
		expect(call.body).toEqual({ name: 'Bot', role: 'operator' });
		await expect(run({ operation: 'create', keyName: ' ' })).rejects.toThrow('Name is required');
		await expect(
			run({ operation: 'create', keyName: 'Bot', apiKeyOptions: { expiresAt: 'soon' } }),
		).rejects.toThrow('Expires At is not a valid date');
	});

	it('get many returns one item per key, up to the limit', async () => {
		const keys = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect((await run({ operation: 'getAll', returnAll: false, limit: 2 }, keys)).result).toEqual(
			keys.slice(0, 2),
		);
		const all = await run({ operation: 'getAll', returnAll: true }, keys);
		expect(all.result).toEqual(keys);
		expect(all.calls).toEqual([{ method: 'GET', url: base, body: undefined }]);
	});

	it('get, revoke and delete address the key by ID', async () => {
		expect(await one({ operation: 'get', apiKeyId })).toMatchObject({
			method: 'GET',
			url: keyPath,
		});
		expect(await one({ operation: 'revoke', apiKeyId })).toMatchObject({
			method: 'POST',
			url: `${keyPath}/revoke`,
		});
		const deleted = await run({ operation: 'delete', apiKeyId }, '');
		expect(deleted.calls[0]).toMatchObject({ method: 'DELETE', url: keyPath });
		expect(deleted.result).toEqual({ success: true, apiKeyId: 'key 1' });
		await expect(run({ operation: 'get', apiKeyId: { mode: 'id', value: ' ' } })).rejects.toThrow(
			'API Key is required',
		);
	});

	it('update sends only the chosen fields and clears a list given empty', async () => {
		expect(
			await one({
				operation: 'update',
				apiKeyId,
				apiKeyUpdateFields: {
					name: ' Renamed ',
					role: 'admin',
					allowedIps: '',
					allowedChats: '972501234567@c.us',
					expiresAt: '2027-01-01T00:00:00Z',
				},
			}),
		).toEqual({
			method: 'PUT',
			url: keyPath,
			body: {
				name: 'Renamed',
				role: 'admin',
				allowedIps: [],
				allowedChats: ['972501234567@c.us'],
				expiresAt: '2027-01-01T00:00:00.000Z',
			},
		});
	});

	it('update rejects no changes, an empty name and an empty expiry', async () => {
		const update = (fields: Record<string, unknown>) =>
			run({ operation: 'update', apiKeyId, apiKeyUpdateFields: fields });
		await expect(update({})).rejects.toThrow('Add at least one field to update');
		await expect(update({ name: ' ' })).rejects.toThrow('Name must not be empty');
		await expect(update({ expiresAt: '' })).rejects.toThrow('Expires At must not be empty');
	});

	it('maps a last-admin 409 to the gateway message, not session state', async () => {
		const error = await run(
			{ operation: 'delete', apiKeyId },
			httpError(409, 'Cannot delete the last admin key'),
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('Cannot delete the last admin key');
	});

	it('validate returns the role, and valid false on 401', async () => {
		const ok = await run({ operation: 'validate' }, { valid: true, role: 'admin' });
		expect(ok.calls).toEqual([
			{ method: 'POST', url: 'https://wa.example.com/api/auth/validate', body: undefined },
		]);
		expect(ok.result).toEqual({ valid: true, role: 'admin' });
		expect(
			(await run({ operation: 'validate' }, httpError(401, 'Invalid API key'))).result,
		).toEqual({ valid: false });
		await expect(run({ operation: 'validate' }, httpError(503, 'down'))).rejects.toBeInstanceOf(
			NodeApiError,
		);
	});

	it('parseList accepts arrays from expressions', () => {
		expect(parseList([' a ', '', 'b'])).toEqual(['a', 'b']);
		expect(parseList(undefined)).toEqual([]);
	});
});

describe('apiKey wiring', () => {
	it('is a sessionless resource of the node with the API key list search', () => {
		const node = new OpenWa();
		const resource = node.description.properties.find((p) => p.name === 'resource');
		expect(resource?.options).toContainEqual({ name: 'API Key', value: 'apiKey' });
		expect(node.methods.listSearch.searchApiKeys).toBe(searchApiKeys);
		expect(isSessionless('apiKey', 'create')).toBe(true);
		expect(isSessionless('apiKey', 'validate')).toBe(true);
		expect(sessionFields()[0].displayOptions?.hide?.resource).toContain('apiKey');
	});

	it('the list search labels keys by name, role and prefix', async () => {
		const { ctx } = fakeContext({}, [
			{ id: 'k1', name: 'Bot', role: 'operator', keyPrefix: 'owa_k1_a', isActive: true },
			{ id: 'k2', name: 'Old', role: 'viewer', keyPrefix: 'owa_k1_b', isActive: false },
		]);
		const lctx = ctx as unknown as ILoadOptionsFunctions;
		expect(await searchApiKeys.call(lctx)).toEqual({
			results: [
				{ name: 'Bot (operator, owa_k1_a…)', value: 'k1' },
				{ name: 'Old (viewer, owa_k1_b…, revoked)', value: 'k2' },
			],
		});
		expect((await searchApiKeys.call(lctx, 'VIEW')).results).toHaveLength(1);
	});
});

import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeWebhook } from '../nodes/OpenWa/actions/webhook';
import { isSessionless } from '../nodes/OpenWa/descriptions/common';
import { webhookFields } from '../nodes/OpenWa/descriptions/webhook';
import { searchWebhooks } from '../nodes/OpenWa/methods/listSearch';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { ALL_EVENTS } from '../nodes/OpenWa/trigger/events';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1/webhooks';
const webhook = { mode: 'id', value: ' wh 1 ' };
const webhookPath = `${base}/wh%201`;
const secret = 'a-sixteen-char-secret';
const filter = { field: 'body', operator: 'contains', value: 'invoice' };

async function run(
	params: Record<string, unknown>,
	response: unknown = { ok: true },
	sessionId = 's1',
) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeWebhook(ctx, 0, sessionId);
	return { result, calls: calls.map(({ method, url, body, qs }) => ({ method, url, body, qs })) };
}
const one = async (params: Record<string, unknown>) => (await run(params)).calls[0];

describe('webhook', () => {
	it('create sends the URL, events and options', async () => {
		expect(
			await one({
				operation: 'create',
				webhookUrl: ' https://example.com/hook ',
				webhookEvents: ['message.received', '*'],
				webhookOptions: {
					secret,
					retryCount: 2,
					headers: { header: [{ name: ' X-Token ', value: 'abc' }] },
					webhookFilters: JSON.stringify([filter]),
				},
			}),
		).toEqual({
			method: 'POST',
			url: base,
			body: {
				url: 'https://example.com/hook',
				events: ['message.received', '*'],
				secret,
				retryCount: 2,
				headers: { 'X-Token': 'abc' },
				filters: { conditions: [filter] },
			},
			qs: undefined,
		});
	});

	it('create sends only URL and events when no options are set', async () => {
		const call = await one({
			operation: 'create',
			webhookUrl: 'https://example.com/hook',
			webhookEvents: ['session.status'],
			webhookOptions: { headers: {}, webhookFilters: '' },
		});
		expect(call.body).toEqual({ url: 'https://example.com/hook', events: ['session.status'] });
	});

	it('create validates URL, events, secret, retry count, headers and filters', async () => {
		const create = (extra: Record<string, unknown>) =>
			run({
				operation: 'create',
				webhookUrl: 'https://example.com/hook',
				webhookEvents: ['*'],
				...extra,
			});
		await expect(create({ webhookUrl: ' ' })).rejects.toThrow('URL is required');
		await expect(create({ webhookEvents: [] })).rejects.toThrow('Select at least one event');
		await expect(create({ webhookOptions: { secret: 'short' } })).rejects.toThrow('16–255');
		await expect(create({ webhookOptions: { secret: 'x'.repeat(256) } })).rejects.toThrow('16–255');
		await expect(create({ webhookOptions: { retryCount: 6 } })).rejects.toThrow('0 to 5');
		await expect(
			create({ webhookOptions: { headers: { header: [{ name: '', value: 'v' }] } } }),
		).rejects.toThrow('Every header needs a name');
		await expect(
			create({
				webhookOptions: { webhookFilters: '[{"field":"a","operator":"like","value":"x"}]' },
			}),
		).rejects.toThrow('"operator"');
	});

	it('get many lists the session webhooks, up to the limit', async () => {
		const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		const { result, calls } = await run({ operation: 'getAll', returnAll: false, limit: 2 }, rows);
		expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(calls).toEqual([{ method: 'GET', url: base, body: undefined, qs: undefined }]);
		expect((await run({ operation: 'getAll', returnAll: true }, rows)).result).toEqual(rows);
	});

	it('get many (all sessions) pages through /api/webhooks without a session', async () => {
		const { result, calls } = await run(
			{ operation: 'getAllSessions', returnAll: false, limit: 5 },
			[{ id: 'a' }],
			'',
		);
		expect(result).toEqual([{ id: 'a' }]);
		expect(calls).toEqual([
			{
				method: 'GET',
				url: 'https://wa.example.com/api/webhooks',
				body: undefined,
				qs: { limit: 5, offset: 0 },
			},
		]);
	});

	it('get delivery failures filters by session ID only when given', async () => {
		const url = 'https://wa.example.com/api/webhooks/delivery-failures';
		const params = { operation: 'getDeliveryFailures', returnAll: false, limit: 10 };
		expect((await run({ ...params, webhookSessionId: ' s2 ' }, [], '')).calls).toEqual([
			{ method: 'GET', url, body: undefined, qs: { limit: 10, offset: 0, sessionId: 's2' } },
		]);
		expect((await run(params, [], '')).calls[0].qs).toEqual({ limit: 10, offset: 0 });
	});

	it('get, delete and test address the webhook by ID', async () => {
		expect(await one({ operation: 'get', webhook })).toEqual({
			method: 'GET',
			url: webhookPath,
			body: undefined,
			qs: undefined,
		});
		const deleted = await run({ operation: 'delete', webhook }, '');
		expect(deleted.calls[0]).toMatchObject({ method: 'DELETE', url: webhookPath });
		expect(deleted.result).toEqual({ success: true, webhookId: 'wh 1' });
		const tested = await run({ operation: 'test', webhook }, { success: false, statusCode: 500 });
		expect(tested.calls[0]).toMatchObject({ method: 'POST', url: `${webhookPath}/test` });
		expect(tested.result).toEqual({ success: false, statusCode: 500, webhookId: 'wh 1' });
		await expect(run({ operation: 'get', webhook: { mode: 'id', value: '' } })).rejects.toThrow(
			'Webhook is required',
		);
	});

	it('update sends only the chosen fields', async () => {
		expect(
			await one({
				operation: 'update',
				webhook,
				webhookUpdateFields: {
					url: 'https://example.com/new',
					webhookEvents: ['call.received'],
					active: false,
					retryCount: 0,
					secret,
					headers: { header: [{ name: 'X-A', value: '1' }] },
					webhookFilters: { conditions: [filter] },
				},
			}),
		).toEqual({
			method: 'PUT',
			url: webhookPath,
			body: {
				url: 'https://example.com/new',
				events: ['call.received'],
				active: false,
				retryCount: 0,
				secret,
				headers: { 'X-A': '1' },
				filters: { conditions: [filter] },
			},
			qs: undefined,
		});
	});

	it('update clears the secret, filters and headers explicitly', async () => {
		const call = await one({
			operation: 'update',
			webhook,
			webhookUpdateFields: { clearSecret: true, clearFilters: true, headers: {} },
		});
		expect(call.body).toEqual({ secret: '', filters: null, headers: {} });
	});

	it('update rejects no changes and conflicting clears', async () => {
		const update = (webhookUpdateFields: Record<string, unknown>) =>
			run({ operation: 'update', webhook, webhookUpdateFields });
		await expect(update({})).rejects.toThrow('Add at least one field');
		await expect(update({ clearSecret: false, clearFilters: false })).rejects.toThrow(
			'Add at least one field',
		);
		await expect(update({ clearSecret: true, secret })).rejects.toThrow('not both');
		await expect(
			update({ clearFilters: true, webhookFilters: JSON.stringify([filter]) }),
		).rejects.toThrow('not both');
		await expect(update({ secret: 'short' })).rejects.toThrow('16–255');
		await expect(update({ url: ' ' })).rejects.toThrow('URL must not be empty');
		await expect(update({ webhookEvents: [] })).rejects.toThrow('Select at least one event');
	});
});

describe('webhook wiring', () => {
	it('is a resource of the node with the webhook list search', () => {
		const node = new OpenWa();
		const resource = node.description.properties.find((p) => p.name === 'resource');
		expect(resource?.options).toContainEqual({ name: 'Webhook', value: 'webhook' });
		expect(node.methods.listSearch.searchWebhooks).toBe(searchWebhooks);
	});

	it('only the cross-session operations are sessionless', () => {
		expect(isSessionless('webhook', 'getAllSessions')).toBe(true);
		expect(isSessionless('webhook', 'getDeliveryFailures')).toBe(true);
		expect(isSessionless('webhook', 'getAll')).toBe(false);
		expect(isSessionless('webhook', 'create')).toBe(false);
	});

	it('offers every trigger event plus the wildcard', () => {
		const events = webhookFields.find((f) => f.name === 'webhookEvents');
		const values = (events?.options as Array<{ value: string }>).map((o) => o.value);
		expect(values).toEqual(expect.arrayContaining(['*', ...ALL_EVENTS.map((e) => e.value)]));
		expect(values).toHaveLength(ALL_EVENTS.length + 1);
	});

	it('the list search labels webhooks by URL and events', async () => {
		const { ctx } = fakeContext({}, [
			{ id: 'w1', url: 'https://a.example/hook', events: ['message.received', 'call.received'] },
			{ id: 'w2', url: 'https://b.example/hook', events: ['*'] },
		]);
		const lctx = {
			...ctx,
			getCurrentNodeParameter: () => 's1',
		} as unknown as ILoadOptionsFunctions;
		expect(await searchWebhooks.call(lctx, 'call')).toEqual({
			results: [{ name: 'https://a.example/hook (message.received, call.received)', value: 'w1' }],
		});
	});
});

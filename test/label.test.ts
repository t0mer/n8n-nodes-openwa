import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeLabel } from '../nodes/OpenWa/actions/label';
import { searchLabels } from '../nodes/OpenWa/methods/listSearch';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { describeOpenWaError } from '../nodes/OpenWa/transport/errors';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1/labels';
const label = { mode: 'id', value: ' 7 ' };

async function run(params: Record<string, unknown>, response: unknown = { success: true }) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeLabel(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body }) => ({ method, url, body })) };
}
const one = async (params: Record<string, unknown>) => (await run(params)).calls[0];

describe('label', () => {
	it('get many returns one item per label, up to the limit', async () => {
		const labels = [{ id: '1' }, { id: '2' }, { id: '3' }];
		const { result, calls } = await run(
			{ operation: 'getAll', returnAll: false, limit: 2 },
			labels,
		);
		expect(result).toEqual([{ id: '1' }, { id: '2' }]);
		expect(calls).toEqual([{ method: 'GET', url: base, body: undefined }]);
		expect((await run({ operation: 'getAll', returnAll: true }, labels)).result).toEqual(labels);
	});

	it('get, delete and get chats address the label by ID', async () => {
		expect(await one({ operation: 'get', label })).toEqual({
			method: 'GET',
			url: `${base}/7`,
			body: undefined,
		});
		expect(await one({ operation: 'delete', label })).toEqual({
			method: 'DELETE',
			url: `${base}/7`,
			body: undefined,
		});
		expect(await one({ operation: 'getChats', label })).toEqual({
			method: 'GET',
			url: `${base}/7/chats`,
			body: undefined,
		});
	});

	it('create or update PUTs the whole label with the colour index', async () => {
		expect(
			await one({ operation: 'upsert', labelId: ' 12 ', labelName: ' VIP ', labelColor: 3 }),
		).toEqual({ method: 'PUT', url: `${base}/12`, body: { name: 'VIP', color: 3 } });
	});

	it('create or update validates the ID and name', async () => {
		await expect(run({ operation: 'upsert', labelId: ' ', labelName: 'x' })).rejects.toThrow(
			'Label ID is required',
		);
		await expect(run({ operation: 'upsert', labelId: '1', labelName: '' })).rejects.toThrow(
			'Name is required',
		);
		await expect(
			run({ operation: 'upsert', labelId: '1', labelName: 'x'.repeat(101) }),
		).rejects.toThrow('at most 100 characters');
	});

	it('chat operations normalize the chat ID', async () => {
		const chat = { chatId: '+972 50-123-4567', label };
		expect(await one({ operation: 'getChatLabels', ...chat })).toEqual({
			method: 'GET',
			url: `${base}/chat/972501234567%40c.us`,
			body: undefined,
		});
		expect(await one({ operation: 'addToChat', ...chat })).toEqual({
			method: 'POST',
			url: `${base}/chat/972501234567%40c.us`,
			body: { labelId: '7' },
		});
		expect(
			await one({ operation: 'removeFromChat', chatId: '120363012345678901@g.us', label }),
		).toEqual({
			method: 'DELETE',
			url: `${base}/chat/120363012345678901%40g.us/7`,
			body: undefined,
		});
	});

	it('requires a label', async () => {
		await expect(
			run({ operation: 'addToChat', chatId: '972501234567', label: { mode: 'list', value: '' } }),
		).rejects.toThrow('Label is required');
	});

	it('is routed by the node', async () => {
		const { ctx, calls } = fakeContext(
			{
				resource: 'label',
				operation: 'getAll',
				returnAll: true,
				session: { mode: 'id', value: 's1' },
			},
			[{ id: '1' }, { id: '2' }],
		);
		const [items] = await new OpenWa().execute.call(ctx);
		expect(items).toHaveLength(2);
		expect(calls[0].url).toBe(base);
	});
});

describe('searchLabels', () => {
	it('lists the labels of the selected session, filtered and sorted', async () => {
		const urls: string[] = [];
		const ctx = {
			getCurrentNodeParameter: () => 's1',
			getNode: () => ({ name: 'OpenWA' }),
			getCredentials: async () => ({ baseUrl: 'https://wa.example.com', apiKey: 'test' }),
			helpers: {
				async httpRequestWithAuthentication(_type: string, options: { url: string }) {
					urls.push(options.url);
					return [
						{ id: '2', name: 'Paid' },
						{ id: '1', name: 'New customer' },
						{ id: '3', name: 'Pending payment' },
					];
				},
			},
		} as unknown as ILoadOptionsFunctions;
		expect(await searchLabels.call(ctx, 'pa')).toEqual({
			results: [
				{ name: 'Paid', value: '2' },
				{ name: 'Pending payment', value: '3' },
			],
		});
		expect(urls).toEqual([base]);
	});
});

describe('422 mapping', () => {
	it('keeps the gateway message and hints at WhatsApp Business', () => {
		const error = describeOpenWaError(422, 'Labels require a WhatsApp Business account', 's1');
		expect(error.message).toBe('Labels require a WhatsApp Business account');
		expect(error.description).toMatch(/WhatsApp Business/);
		expect(describeOpenWaError(422, undefined).message).toMatch(/HTTP 422/);
	});
});

import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeChannel } from '../nodes/OpenWa/actions/channel';
import { searchChannels } from '../nodes/OpenWa/methods/listSearch';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1/channels';
const channelId = '120363012345678901@newsletter';
const channel = { mode: 'id', value: ` ${channelId} ` };
const channelPath = `${base}/120363012345678901%40newsletter`;

async function run(params: Record<string, unknown>, response: unknown = { success: true }) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeChannel(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body, qs }) => ({ method, url, body, qs })) };
}
const one = async (params: Record<string, unknown>) => (await run(params)).calls[0];

describe('channel', () => {
	it('get many returns one item per channel, up to the limit', async () => {
		const channels = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		const { result, calls } = await run(
			{ operation: 'getAll', returnAll: false, limit: 2 },
			channels,
		);
		expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(calls).toEqual([{ method: 'GET', url: base, body: undefined, qs: undefined }]);
		expect((await run({ operation: 'getAll', returnAll: true }, channels)).result).toEqual(
			channels,
		);
	});

	it('get and get messages address the channel by ID', async () => {
		expect(await one({ operation: 'get', channel })).toEqual({
			method: 'GET',
			url: channelPath,
			body: undefined,
			qs: undefined,
		});
		expect(await one({ operation: 'getMessages', channel, limit: 20 })).toEqual({
			method: 'GET',
			url: `${channelPath}/messages`,
			body: undefined,
			qs: { limit: 20 },
		});
	});

	it('create sends the name and an optional description', async () => {
		expect(
			await one({ operation: 'create', channelName: ' News ', channelDescription: '' }),
		).toEqual({ method: 'POST', url: base, body: { name: 'News' }, qs: undefined });
		expect(
			(await one({ operation: 'create', channelName: 'News', channelDescription: ' Updates ' }))
				.body,
		).toEqual({ name: 'News', description: 'Updates' });
	});

	it('create validates the name', async () => {
		await expect(run({ operation: 'create', channelName: ' ' })).rejects.toThrow(
			'Name is required',
		);
		await expect(run({ operation: 'create', channelName: 'x'.repeat(101) })).rejects.toThrow(
			'at most 100 characters',
		);
	});

	it('subscribe extracts the code from an invite link', async () => {
		expect(
			await one({
				operation: 'subscribe',
				channelInviteCode: 'https://whatsapp.com/channel/0029VaAbCdEf123456',
			}),
		).toEqual({
			method: 'POST',
			url: `${base}/subscribe`,
			body: { inviteCode: '0029VaAbCdEf123456' },
			qs: undefined,
		});
		await expect(run({ operation: 'subscribe', channelInviteCode: 'bad code' })).rejects.toThrow(
			'not a valid channel invite code or link',
		);
	});

	it('unsubscribe is a DELETE, delete is a POST to /delete', async () => {
		const unsubscribe = await run({ operation: 'unsubscribe', channel });
		expect(unsubscribe.calls[0]).toEqual({
			method: 'DELETE',
			url: channelPath,
			body: undefined,
			qs: undefined,
		});
		expect(unsubscribe.result).toEqual({ success: true, channelId });
		const del = await run({ operation: 'delete', channel });
		expect(del.calls[0]).toEqual({
			method: 'POST',
			url: `${channelPath}/delete`,
			body: undefined,
			qs: undefined,
		});
		expect(del.result).toEqual({ success: true, channelId });
	});

	it('mute and unmute set the mute flag', async () => {
		expect(await one({ operation: 'mute', channel })).toEqual({
			method: 'POST',
			url: `${channelPath}/mute`,
			body: { mute: true },
			qs: undefined,
		});
		expect((await one({ operation: 'unmute', channel })).body).toEqual({ mute: false });
	});

	it('demote admin and transfer ownership normalize the contact', async () => {
		expect(
			await one({ operation: 'demoteAdmin', channel, channelUserId: '+972 50-123-4567' }),
		).toEqual({
			method: 'POST',
			url: `${channelPath}/admins/demote`,
			body: { userId: '972501234567@c.us' },
			qs: undefined,
		});
		expect(
			await one({ operation: 'transferOwnership', channel, channelNewOwnerId: '12345@lid' }),
		).toEqual({
			method: 'POST',
			url: `${channelPath}/owner/transfer`,
			body: { newOwnerId: '12345@lid' },
			qs: undefined,
		});
		await expect(
			run({ operation: 'transferOwnership', channel, channelNewOwnerId: '1203630@g.us' }),
		).rejects.toThrow('is a group ID, not a contact');
	});

	it('requires a valid channel ID', async () => {
		await expect(run({ operation: 'get', channel: { mode: 'list', value: '' } })).rejects.toThrow(
			'Channel is required',
		);
		await expect(
			run({ operation: 'get', channel: { mode: 'id', value: '120363012345678901@g.us' } }),
		).rejects.toThrow('expected <id>@newsletter');
	});

	it('is routed by the node', async () => {
		const { ctx, calls } = fakeContext(
			{
				resource: 'channel',
				operation: 'getAll',
				returnAll: true,
				session: { mode: 'id', value: 's1' },
			},
			[{ id: 'a' }, { id: 'b' }],
		);
		const [items] = await new OpenWa().execute.call(ctx);
		expect(items).toHaveLength(2);
		expect(calls[0].url).toBe(base);
	});
});

describe('searchChannels', () => {
	it('lists the channels of the selected session, filtered and sorted', async () => {
		const urls: string[] = [];
		const ctx = {
			getCurrentNodeParameter: () => 's1',
			getNode: () => ({ name: 'OpenWA' }),
			getCredentials: async () => ({ baseUrl: 'https://wa.example.com', apiKey: 'test' }),
			helpers: {
				async httpRequestWithAuthentication(_type: string, options: { url: string }) {
					urls.push(options.url);
					return [
						{ id: '2@newsletter', name: 'Release notes' },
						{ id: '1@newsletter', name: 'Deals' },
						{ id: '3@newsletter', name: 'Outage notes' },
					];
				},
			},
		} as unknown as ILoadOptionsFunctions;
		expect(await searchChannels.call(ctx, 'notes')).toEqual({
			results: [
				{ name: 'Outage notes', value: '3@newsletter' },
				{ name: 'Release notes', value: '2@newsletter' },
			],
		});
		expect(urls).toEqual([base]);
	});
});

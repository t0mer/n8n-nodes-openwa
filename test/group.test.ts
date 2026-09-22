import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeGroup } from '../nodes/OpenWa/actions/group';
import { MAX_BINARY_BYTES } from '../nodes/OpenWa/helpers/media';
import { fakeContext } from './fakeContext';

const groupId = '120363012345678901@g.us';
const group = { mode: 'list', value: groupId };
const base = 'https://wa.example.com/api/sessions/s1/groups';
const groupUrl = `${base}/120363012345678901%40g.us`;

async function call(params: Record<string, unknown>, response?: unknown) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeGroup(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body, qs }) => ({ method, url, body, qs })) };
}

describe('executeGroup — single calls', () => {
	it.each([
		['get', 'GET', ''],
		['getInviteLink', 'GET', '/invite-code'],
		['revokeInviteLink', 'POST', '/invite-code/revoke'],
		['getSettings', 'GET', '/settings'],
		['getPicture', 'GET', '/picture'],
		['removePicture', 'DELETE', '/picture'],
		['leave', 'POST', '/leave'],
		['getMembershipRequests', 'GET', '/membership-requests'],
	])('%s → %s %s', async (operation, method, path) => {
		const { calls } = await call({ operation, group });
		expect(calls).toEqual([{ method, url: `${groupUrl}${path}`, body: undefined, qs: undefined }]);
	});

	it('rejects a group ID without @g.us', async () => {
		await expect(
			call({ operation: 'get', group: { mode: 'id', value: '972501234567@c.us' } }),
		).rejects.toThrow('not a valid group ID');
	});
});

describe('executeGroup — lists', () => {
	it('get many pages with limit/offset and honours the limit', async () => {
		const { result, calls } = await call({ operation: 'getAll', returnAll: false, limit: 2 }, [
			{ id: 'a' },
			{ id: 'b' },
		]);
		expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(calls).toEqual([
			{ method: 'GET', url: base, body: undefined, qs: { limit: 2, offset: 0 } },
		]);
	});

	it('get many with Return All pages past 1000 and stops at a short page', async () => {
		const { ctx, calls } = fakeContext(
			{ operation: 'getAll', returnAll: true },
			(options: { qs?: { limit?: number; offset?: number } }) => {
				const { limit = 0, offset = 0 } = options.qs ?? {};
				const count = Math.max(0, Math.min(limit, 1500 - offset));
				return Array.from({ length: count }, (_, k) => ({ id: String(offset + k) }));
			},
		);
		expect(await executeGroup(ctx, 0, 's1')).toHaveLength(1500);
		expect(calls.map((c) => c.qs)).toEqual([
			{ limit: 1000, offset: 0 },
			{ limit: 1000, offset: 1000 },
		]);
	});

	it('get participants returns one entry per member', async () => {
		const participants = [
			{ id: '1@c.us', isAdmin: true },
			{ id: '2@c.us', isAdmin: false },
		];
		const { result } = await call(
			{ operation: 'getParticipants', group },
			{ id: groupId, participants },
		);
		expect(result).toEqual(participants);
	});
});

describe('executeGroup — bodies', () => {
	it('create normalizes participants', async () => {
		const { calls } = await call({
			operation: 'create',
			groupName: ' Team ',
			participants: '+972 50-123-4567, 123456789012345@lid',
		});
		expect(calls).toEqual([
			{
				method: 'POST',
				url: base,
				body: { name: 'Team', participants: ['972501234567@c.us', '123456789012345@lid'] },
				qs: undefined,
			},
		]);
	});

	it('says a group ID is not a contact when one is listed as a participant', async () => {
		await expect(
			call({ operation: 'addParticipants', group, participants: '120363012345678901@g.us' }),
		).rejects.toThrow('is a group ID, not a contact');
	});

	it('create requires participants and a name', async () => {
		await expect(
			call({ operation: 'create', groupName: 'x', participants: ' , ' }),
		).rejects.toThrow('Add at least one participant');
		await expect(
			call({ operation: 'create', groupName: ' ', participants: '1234567' }),
		).rejects.toThrow('Group Name is required');
	});

	it.each([
		['addParticipants', 'POST', '/participants'],
		['removeParticipants', 'DELETE', '/participants'],
		['promoteParticipants', 'POST', '/participants/promote'],
		['demoteParticipants', 'POST', '/participants/demote'],
	])('%s → %s %s', async (operation, method, path) => {
		const { calls } = await call({ operation, group, participants: ['972501234567'] });
		expect(calls).toEqual([
			{
				method,
				url: `${groupUrl}${path}`,
				body: { participants: ['972501234567@c.us'] },
				qs: undefined,
			},
		]);
	});

	it('approve and reject send the requesters, or nothing only when All Pending is chosen', async () => {
		expect(
			(
				await call({
					operation: 'approveRequests',
					group,
					requestTarget: 'specific',
					requesters: '972501234567',
				})
			).calls,
		).toEqual([
			{
				method: 'POST',
				url: `${groupUrl}/membership-requests/approve`,
				body: { participants: ['972501234567@c.us'] },
				qs: undefined,
			},
		]);
		expect(
			(await call({ operation: 'rejectRequests', group, requestTarget: 'all' })).calls,
		).toEqual([
			{ method: 'POST', url: `${groupUrl}/membership-requests/reject`, body: {}, qs: undefined },
		]);
	});

	it('refuses an empty requester list instead of acting on every pending request', async () => {
		const { ctx, calls } = fakeContext({
			operation: 'rejectRequests',
			group,
			requestTarget: 'specific',
			requesters: '',
		});
		await expect(executeGroup(ctx, 0, 's1')).rejects.toThrow('Add at least one requester');
		expect(calls).toHaveLength(0);
	});

	it('get join info and join accept a full invite link', async () => {
		const link = 'https://chat.whatsapp.com/AbCdEf123456';
		expect((await call({ operation: 'getJoinInfo', inviteCode: link })).calls).toEqual([
			{ method: 'GET', url: `${base}/join-info`, body: undefined, qs: { code: 'AbCdEf123456' } },
		]);
		expect((await call({ operation: 'join', inviteCode: link })).calls).toEqual([
			{ method: 'POST', url: `${base}/join`, body: { inviteCode: 'AbCdEf123456' }, qs: undefined },
		]);
	});

	it('update calls only the endpoints for the given fields', async () => {
		const both = await call({
			operation: 'update',
			group,
			groupUpdateFields: { name: 'New', description: '' },
		});
		expect(both.calls).toEqual([
			{ method: 'PUT', url: `${groupUrl}/subject`, body: { subject: 'New' }, qs: undefined },
			{ method: 'PUT', url: `${groupUrl}/description`, body: { description: '' }, qs: undefined },
		]);
		expect(both.result).toEqual({ success: true, groupId, updated: ['name', 'description'] });

		const nameOnly = await call({ operation: 'update', group, groupUpdateFields: { name: 'New' } });
		expect(nameOnly.calls.map((c) => c.url)).toEqual([`${groupUrl}/subject`]);

		await expect(call({ operation: 'update', group, groupUpdateFields: {} })).rejects.toThrow(
			'Add a Name or a Description',
		);
		await expect(
			call({ operation: 'update', group, groupUpdateFields: { name: ' ', description: 'x' } }),
		).rejects.toThrow('Name cannot be empty');
	});

	it('update says the name already changed when the description call fails', async () => {
		const { ctx, calls } = fakeContext(
			{
				operation: 'update',
				group,
				groupUpdateFields: { name: 'New', description: 'x'.repeat(2000) },
			},
			(options: { url?: string }) =>
				String(options.url).endsWith('/description')
					? Object.assign(new Error('Request failed with status code 400'), {
							httpCode: '400',
							cause: { response: { status: 400, data: { message: 'description too long' } } },
						})
					: { success: true },
		);
		const error = await executeGroup(ctx, 0, 's1').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('description too long');
		expect((error as NodeApiError).description).toMatch(/^The name was already updated/);
		expect(calls).toHaveLength(2);
	});

	it('update settings sends only the chosen settings', async () => {
		const { calls } = await call({
			operation: 'updateSettings',
			group,
			groupSettings: { announce: true, ephemeralSeconds: 0 },
		});
		expect(calls).toEqual([
			{
				method: 'PUT',
				url: `${groupUrl}/settings`,
				body: { announce: true, ephemeralSeconds: 0 },
				qs: undefined,
			},
		]);
		await expect(call({ operation: 'updateSettings', group, groupSettings: {} })).rejects.toThrow(
			'at least one setting',
		);
	});

	it('set picture from a URL or from binary data (no file name)', async () => {
		const byUrl = await call({
			operation: 'setPicture',
			group,
			pictureSource: 'url',
			pictureUrl: 'https://example.com/logo.jpg',
		});
		expect(byUrl.calls[0]).toEqual({
			method: 'PUT',
			url: `${groupUrl}/picture`,
			body: { url: 'https://example.com/logo.jpg' },
			qs: undefined,
		});

		const byBinary = await call({
			operation: 'setPicture',
			group,
			pictureSource: 'binary',
			pictureBinaryField: 'data',
			binaryMeta: { mimeType: 'image/png', fileName: 'logo.png' },
			binaryData: Buffer.from('png-bytes'),
		});
		expect(byBinary.calls[0].body).toEqual({
			base64: Buffer.from('png-bytes').toString('base64'),
			mimetype: 'image/png',
		});
	});

	it('set picture rejects non-images and oversized images before calling the API', async () => {
		const picture = {
			operation: 'setPicture',
			group,
			pictureSource: 'binary',
			pictureBinaryField: 'data',
		};
		const { ctx: pdf, calls: pdfCalls } = fakeContext({
			...picture,
			binaryMeta: { mimeType: 'application/pdf' },
		});
		await expect(executeGroup(pdf, 0, 's1')).rejects.toThrow(
			'must be an image, but "data" is application/pdf',
		);
		expect(pdfCalls).toHaveLength(0);

		const { ctx: big, calls: bigCalls } = fakeContext({
			...picture,
			binaryMeta: { mimeType: 'image/jpeg' },
			binaryData: Buffer.alloc(MAX_BINARY_BYTES + 1),
		});
		await expect(executeGroup(big, 0, 's1')).rejects.toThrow('above the 18.0 MB limit');
		expect(bigCalls).toHaveLength(0);
	});
});

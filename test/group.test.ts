import { describe, expect, it } from 'vitest';
import { executeGroup } from '../nodes/OpenWa/actions/group';
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

	it('approve and reject send the requesters, or nothing to act on all pending', async () => {
		expect(
			(await call({ operation: 'approveRequests', group, requesters: '972501234567' })).calls,
		).toEqual([
			{
				method: 'POST',
				url: `${groupUrl}/membership-requests/approve`,
				body: { participants: ['972501234567@c.us'] },
				qs: undefined,
			},
		]);
		expect((await call({ operation: 'rejectRequests', group })).calls).toEqual([
			{ method: 'POST', url: `${groupUrl}/membership-requests/reject`, body: {}, qs: undefined },
		]);
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

		await expect(
			call({ operation: 'update', group, groupUpdateFields: { name: ' ' } }),
		).rejects.toThrow('Add a Name or a Description');
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
		});
		expect(byBinary.calls[0].body).toEqual({
			base64: Buffer.from('mp3-bytes').toString('base64'),
			mimetype: 'audio/mpeg',
		});
	});
});

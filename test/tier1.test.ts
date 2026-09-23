import { NodeApiError, type IExecuteFunctions } from 'n8n-workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCall } from '../nodes/OpenWa/actions/call';
import { executeChat } from '../nodes/OpenWa/actions/chat';
import { executeContact } from '../nodes/OpenWa/actions/contact';
import { executeMessage } from '../nodes/OpenWa/actions/message';
import { executeProfile } from '../nodes/OpenWa/actions/profile';
import { fakeContext } from './fakeContext';

type Executor = (ctx: IExecuteFunctions, i: number, sessionId: string) => Promise<unknown>;
const base = 'https://wa.example.com/api/sessions/s1';
const contact = '972501234567@c.us';
const group = '120363012345678901@g.us';

async function run(
	execute: Executor,
	params: Record<string, unknown>,
	response: unknown = { success: true },
) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await execute(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body, qs }) => ({ method, url, body, qs })) };
}
const one = async (execute: Executor, params: Record<string, unknown>, response?: unknown) =>
	(await run(execute, params, response)).calls[0];

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('chat', () => {
	it('get many pages with limit/offset', async () => {
		const { result, calls } = await run(
			executeChat,
			{ operation: 'getAll', returnAll: false, limit: 2 },
			[{ id: 'a' }, { id: 'b' }],
		);
		expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(calls[0]).toMatchObject({
			method: 'GET',
			url: `${base}/chats`,
			qs: { limit: 2, offset: 0 },
		});
	});

	it.each([
		['markUnread', {}, '/chats/unread', {}],
		['sendChatState', { chatState: 'recording' }, '/chats/typing', { state: 'recording' }],
		['archive', {}, '/chats/archive', { archive: true }],
		['unarchive', {}, '/chats/archive', { archive: false }],
		['pin', {}, '/chats/pin', { pin: true }],
		['unpin', {}, '/chats/pin', { pin: false }],
		['unmute', {}, '/chats/mute', { muteUntil: null }],
		['delete', {}, '/chats/delete', {}],
		['subscribePresence', {}, '/presence/subscribe', {}],
	])('%s posts to %s', async (operation, extra, path, body) => {
		expect(await one(executeChat, { operation, chatId: '+972 50-123-4567', ...extra })).toEqual({
			method: 'POST',
			url: `${base}${path}`,
			body: { chatId: contact, ...body },
			qs: undefined,
		});
	});

	it('mark as read with and without message IDs', async () => {
		expect((await one(executeChat, { operation: 'markRead', chatId: group })).body).toEqual({
			chatId: group,
		});
		expect(
			(await one(executeChat, { operation: 'markRead', chatId: group, messageIds: 'm1, m2' })).body,
		).toEqual({ chatId: group, messageIds: ['m1', 'm2'] });
	});

	it('mute computes the expiry in epoch milliseconds', async () => {
		expect(
			(await one(executeChat, { operation: 'mute', chatId: group, muteFor: '8h' })).body,
		).toEqual({
			chatId: group,
			muteUntil: NOW + 8 * 3600 * 1000,
		});
		expect(
			(await one(executeChat, { operation: 'mute', chatId: group, muteFor: '1w' })).body,
		).toMatchObject({
			muteUntil: NOW + 7 * 24 * 3600 * 1000,
		});
		expect(
			(
				await one(executeChat, {
					operation: 'mute',
					chatId: group,
					muteFor: 'until',
					muteUntil: '2026-10-01T00:00:00Z',
				})
			).body,
		).toMatchObject({ muteUntil: Date.UTC(2026, 9, 1) });
	});

	it('mute rejects past and invalid dates', async () => {
		await expect(
			run(executeChat, {
				operation: 'mute',
				chatId: group,
				muteFor: 'until',
				muteUntil: '2020-01-01T00:00:00Z',
			}),
		).rejects.toThrow('must be in the future');
		await expect(
			run(executeChat, { operation: 'mute', chatId: group, muteFor: 'until', muteUntil: 'soon' }),
		).rejects.toThrow('not a valid date');
	});

	it('clear messages deletes by chat', async () => {
		expect(await one(executeChat, { operation: 'clearMessages', chatId: group })).toMatchObject({
			method: 'DELETE',
			url: `${base}/chats/${encodeURIComponent(group)}/messages`,
		});
	});

	it('get presence, and a clear hint when nothing was reported yet', async () => {
		expect(await one(executeChat, { operation: 'getPresence', chatId: contact })).toMatchObject({
			method: 'GET',
			url: `${base}/presence/${encodeURIComponent(contact)}`,
		});
		const notFound = Object.assign(new Error('Request failed with status code 404'), {
			httpCode: '404',
			cause: { response: { status: 404, data: { message: 'No presence recorded' } } },
		});
		const error = await run(
			executeChat,
			{ operation: 'getPresence', chatId: contact },
			() => notFound,
		).catch((e: NodeApiError) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe(`No presence reported yet for ${contact}`);
		expect((error as NodeApiError).description).toMatch(/Subscribe to Presence/);
	});

	it('treats an empty 200 response as no presence yet', async () => {
		await expect(
			run(executeChat, { operation: 'getPresence', chatId: contact }, () => undefined),
		).rejects.toThrow(`No presence reported yet for ${contact}`);
	});

	it('requires a valid chat', async () => {
		await expect(run(executeChat, { operation: 'pin', chatId: '' })).rejects.toThrow('required');
	});
});

describe('profile → set presence', () => {
	it('maps Online to available', async () => {
		expect(await one(executeProfile, { operation: 'setPresence', online: false })).toEqual({
			method: 'PUT',
			url: `${base}/presence`,
			body: { available: false },
			qs: undefined,
		});
	});
});

describe('call', () => {
	it('rejects a call by ID', async () => {
		expect(await one(executeCall, { operation: 'reject', callId: ' C1 ' })).toMatchObject({
			method: 'POST',
			url: `${base}/calls/C1/reject`,
		});
		await expect(run(executeCall, { operation: 'reject', callId: '' })).rejects.toThrow(
			'Call ID is required',
		);
	});

	it('creates a link now or at a given time', async () => {
		expect((await one(executeCall, { operation: 'createLink', callType: 'video' })).body).toEqual({
			type: 'video',
			startTime: NOW,
		});
		expect(
			(await one(executeCall, { operation: 'createLink', startTime: '2026-09-24T09:30:00Z' })).body,
		).toEqual({ type: 'audio', startTime: Date.UTC(2026, 8, 24, 9, 30) });
		await expect(run(executeCall, { operation: 'createLink', startTime: 'later' })).rejects.toThrow(
			'not a valid date',
		);
	});
});

describe('contact additions', () => {
	const who = { mode: 'id', value: '972501234567' };

	it('save sends the names; remove deletes', async () => {
		expect(
			await one(executeContact, {
				operation: 'save',
				contact: who,
				firstName: ' Dana ',
				lastName: 'Levi',
			}),
		).toMatchObject({
			method: 'PUT',
			url: `${base}/contacts/${encodeURIComponent(contact)}`,
			body: { firstName: 'Dana', lastName: 'Levi' },
		});
		expect(
			(await one(executeContact, { operation: 'save', contact: who, firstName: 'Dana' })).body,
		).toEqual({
			firstName: 'Dana',
		});
		await expect(
			run(executeContact, { operation: 'save', contact: who, firstName: ' ' }),
		).rejects.toThrow('First Name is required');
		expect(await one(executeContact, { operation: 'remove', contact: who })).toMatchObject({
			method: 'DELETE',
			url: `${base}/contacts/${encodeURIComponent(contact)}`,
		});
	});

	it('get blocked outputs one item per ID', async () => {
		const { result } = await run(executeContact, { operation: 'getBlocked' }, ['a@c.us', 'b@lid']);
		expect(result).toEqual([{ id: 'a@c.us' }, { id: 'b@lid' }]);
	});

	it('get profile pictures batches IDs and keeps every requested contact', async () => {
		const { result, calls } = await run(
			executeContact,
			{ operation: 'getProfilePictures', contacts: '972501234567, 972509999999' },
			{ pictures: { [contact]: 'https://pps.example/a.jpg' } },
		);
		expect(calls[0]).toMatchObject({
			url: `${base}/contacts/profile-pictures`,
			qs: { ids: `${contact},972509999999@c.us` },
		});
		expect(result).toEqual([
			{ contactId: contact, url: 'https://pps.example/a.jpg' },
			{ contactId: '972509999999@c.us', url: null },
		]);
	});

	it('get profile pictures refuses more than 50 contacts', async () => {
		const many = Array.from({ length: 51 }, (_, k) => String(972500000000 + k));
		await expect(
			run(executeContact, { operation: 'getProfilePictures', contacts: many }),
		).rejects.toThrow('between 1 and 50 contacts, got 51');
	});
});

describe('message additions', () => {
	const to = { recipientType: 'contact', phoneNumber: '972501234567', options: {} };

	it('get reactions returns one item per emoji group', async () => {
		const groups = [{ emoji: '👍', senders: [{ senderId: 'x', emoji: '👍', timestamp: 1 }] }];
		const { result, calls } = await run(
			executeMessage,
			{ ...to, operation: 'getReactions', messageId: 'm1' },
			groups,
		);
		expect(calls[0]).toMatchObject({
			method: 'GET',
			url: `${base}/messages/${encodeURIComponent(contact)}/m1/reactions`,
		});
		expect(result).toEqual(groups);
	});

	it('get chat history sends the query and enforces the limits', async () => {
		expect(
			await one(
				executeMessage,
				{ ...to, operation: 'getHistory', historyLimit: 20, includeMedia: true },
				[],
			),
		).toMatchObject({
			method: 'GET',
			url: `${base}/messages/${encodeURIComponent(contact)}/history`,
			qs: { limit: 20, includeMedia: true, deep: false },
		});
		await expect(
			run(executeMessage, { ...to, operation: 'getHistory', historyLimit: 500 }, []),
		).rejects.toThrow('Turn on Deep');
		expect(
			(
				await one(
					executeMessage,
					{ ...to, operation: 'getHistory', historyLimit: 500, deep: true },
					[],
				)
			).qs,
		).toMatchObject({ limit: 500, deep: true });
	});
});

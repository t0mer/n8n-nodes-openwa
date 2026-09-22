import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeMessage } from '../nodes/OpenWa/actions/message';
import { executeTemplate } from '../nodes/OpenWa/actions/template';

/** Minimal IExecuteFunctions stand-in: parameters from a map, HTTP calls recorded. */
function fakeContext(params: Record<string, unknown>, response: unknown = { ok: true }) {
	const calls: IHttpRequestOptions[] = [];
	const ctx = {
		getNodeParameter(
			name: string,
			_i: number,
			fallback?: unknown,
			options?: { extractValue?: boolean },
		) {
			const [head, ...rest] = name.split('.');
			let value: unknown = params[head];
			for (const key of rest) value = (value as Record<string, unknown> | undefined)?.[key];
			if (value === undefined) value = fallback;
			if (options?.extractValue && value && typeof value === 'object' && 'value' in value) {
				return (value as { value: unknown }).value;
			}
			return value;
		},
		getNode: () => ({
			id: '1',
			name: 'OpenWA',
			type: 'openWa',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getCredentials: async () => ({ baseUrl: 'https://wa.example.com/', apiKey: 'test' }),
		helpers: {
			async httpRequestWithAuthentication(_type: string, options: IHttpRequestOptions) {
				calls.push(options);
				return response;
			},
		},
	};
	return { ctx: ctx as unknown as IExecuteFunctions, calls };
}

const contact = { recipientType: 'contact', phoneNumber: '+972 50-123-4567', options: {} };
const chatId = '972501234567@c.us';
const base = 'https://wa.example.com/api/sessions/s1';

async function sent(params: Record<string, unknown>) {
	const { ctx, calls } = fakeContext({ ...contact, ...params });
	await executeMessage(ctx, 0, 's1');
	expect(calls).toHaveLength(1);
	return { url: calls[0].url, method: calls[0].method, body: calls[0].body };
}

describe('executeMessage request bodies', () => {
	it('reply', async () => {
		expect(
			await sent({
				operation: 'reply',
				messageId: ' m1 ',
				text: 'Hi @972509999999',
				options: { mentions: '972509999999' },
			}),
		).toEqual({
			url: `${base}/messages/reply`,
			method: 'POST',
			body: {
				chatId,
				quotedMessageId: 'm1',
				text: 'Hi @972509999999',
				mentions: ['972509999999@c.us'],
			},
		});
	});

	it('react, including removing a reaction', async () => {
		expect((await sent({ operation: 'react', messageId: 'm1', emoji: '👍' })).body).toEqual({
			chatId,
			messageId: 'm1',
			emoji: '👍',
		});
		expect((await sent({ operation: 'react', messageId: 'm1' })).body).toEqual({
			chatId,
			messageId: 'm1',
			emoji: '',
		});
	});

	it('forward from a group to the recipient', async () => {
		expect(
			await sent({ operation: 'forward', messageId: 'm1', sourceChat: '120363012345678901@g.us' }),
		).toEqual({
			url: `${base}/messages/forward`,
			method: 'POST',
			body: { fromChatId: '120363012345678901@g.us', toChatId: chatId, messageId: 'm1' },
		});
	});

	it('edit sends the new text as body', async () => {
		expect((await sent({ operation: 'edit', messageId: 'm1', text: 'fixed' })).body).toEqual({
			chatId,
			messageId: 'm1',
			body: 'fixed',
		});
	});

	it('delete defaults to for everyone', async () => {
		expect((await sent({ operation: 'delete', messageId: 'm1' })).body).toEqual({
			chatId,
			messageId: 'm1',
			forEveryone: true,
		});
		expect(
			(await sent({ operation: 'delete', messageId: 'm1', forEveryone: false })).body,
		).toMatchObject({
			forEveryone: false,
		});
	});

	it('send location maps the name to description', async () => {
		expect(
			await sent({
				operation: 'sendLocation',
				latitude: '32.0853',
				longitude: 34.7818,
				options: { locationName: 'Office', address: '1 Main St' },
			}),
		).toEqual({
			url: `${base}/messages/send-location`,
			method: 'POST',
			body: {
				chatId,
				latitude: 32.0853,
				longitude: 34.7818,
				description: 'Office',
				address: '1 Main St',
			},
		});
	});

	it('send location rejects a missing coordinate', async () => {
		await expect(sent({ operation: 'sendLocation', latitude: '', longitude: '1' })).rejects.toThrow(
			'Latitude must be',
		);
	});

	it('send poll', async () => {
		expect(
			(
				await sent({
					operation: 'sendPoll',
					pollQuestion: 'Lunch?',
					pollOptions: ['Pizza', ' Sushi '],
					allowMultipleAnswers: true,
				})
			).body,
		).toEqual({ chatId, name: 'Lunch?', options: ['Pizza', 'Sushi'], allowMultipleAnswers: true });
	});

	it('vote poll uses pollMessageId and allows an empty vote', async () => {
		expect(
			(await sent({ operation: 'votePoll', messageId: 'p1', selectedOptions: ['Pizza'] })).body,
		).toEqual({
			chatId,
			pollMessageId: 'p1',
			options: ['Pizza'],
		});
		expect((await sent({ operation: 'votePoll', messageId: 'p1' })).body).toEqual({
			chatId,
			pollMessageId: 'p1',
			options: [],
		});
	});

	it('send template with variables and link preview', async () => {
		expect(
			await sent({
				operation: 'sendTemplate',
				template: { mode: 'list', value: 't1' },
				templateVariables: { values: [{ name: 'name', value: 'Dana' }] },
				options: { linkPreview: false },
			}),
		).toEqual({
			url: `${base}/messages/send-template`,
			method: 'POST',
			body: { chatId, templateId: 't1', vars: { name: 'Dana' }, linkPreview: false },
		});
	});

	it('ignores hidden options that do not apply to the operation', async () => {
		expect(
			(
				await sent({
					operation: 'react',
					messageId: 'm1',
					emoji: 'x',
					options: { linkPreview: true, mentions: '1' },
				})
			).body,
		).toEqual({ chatId, messageId: 'm1', emoji: 'x' });
	});

	it('requires a message ID', async () => {
		await expect(sent({ operation: 'delete', messageId: '  ' })).rejects.toThrow(
			'Message ID is required',
		);
	});
});

describe('executeTemplate', () => {
	it('create sends name, body and additional fields', async () => {
		const { ctx, calls } = fakeContext({
			operation: 'create',
			templateName: 'welcome',
			templateBody: 'Hi {{name}}',
			additionalFields: { footer: 'Bye' },
		});
		await executeTemplate(ctx, 0, 's1');
		expect(calls[0]).toMatchObject({
			url: `${base}/templates`,
			method: 'POST',
			body: { name: 'welcome', body: 'Hi {{name}}', footer: 'Bye' },
		});
	});

	it('get many slices to the limit', async () => {
		const { ctx } = fakeContext({ operation: 'getAll', returnAll: false, limit: 2 }, [
			{ id: 1 },
			{ id: 2 },
			{ id: 3 },
		]);
		expect(await executeTemplate(ctx, 0, 's1')).toEqual([{ id: 1 }, { id: 2 }]);
	});

	it('update skips blank name/body but keeps a cleared footer', async () => {
		const { ctx, calls } = fakeContext({
			operation: 'update',
			template: { mode: 'id', value: 't1' },
			updateFields: { name: ' ', footer: '' },
		});
		await executeTemplate(ctx, 0, 's1');
		expect(calls[0]).toMatchObject({
			url: `${base}/templates/t1`,
			method: 'PUT',
			body: { footer: '' },
		});
	});

	it('update without fields fails', async () => {
		const { ctx } = fakeContext({
			operation: 'update',
			template: { mode: 'id', value: 't1' },
			updateFields: { body: '' },
		});
		await expect(executeTemplate(ctx, 0, 's1')).rejects.toThrow('at least one field');
	});

	it('delete returns success and the ID for the empty 204', async () => {
		const { ctx, calls } = fakeContext(
			{ operation: 'delete', template: { mode: 'list', value: 't1' } },
			undefined,
		);
		expect(await executeTemplate(ctx, 0, 's1')).toEqual({ success: true, id: 't1' });
		expect(calls[0]).toMatchObject({ url: `${base}/templates/t1`, method: 'DELETE' });
	});
});

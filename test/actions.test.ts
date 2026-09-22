import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeMessage } from '../nodes/OpenWa/actions/message';
import { executeTemplate } from '../nodes/OpenWa/actions/template';

type Responder = (options: IHttpRequestOptions) => unknown;

/**
 * Minimal IExecuteFunctions stand-in: parameters from a map, HTTP calls recorded. `response` is
 * returned for every call, or computed per call when it is a function.
 */
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
				return typeof response === 'function' ? (response as Responder)(options) : response;
			},
			async prepareBinaryData(data: Buffer, fileName?: string, mimeType?: string) {
				return { data: data.toString('base64'), fileName, mimeType };
			},
			assertBinaryData: () => ({ mimeType: 'audio/mpeg', fileName: 'note.mp3' }),
			getBinaryDataBuffer: async () => Buffer.from('mp3-bytes'),
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

describe('executeMessage — contact cards, pins, stars, replies', () => {
	it('send contact card sends digits only', async () => {
		expect(
			await sent({
				operation: 'sendContact',
				contactName: ' Dana ',
				contactNumber: '+972 50-999-9999',
			}),
		).toEqual({
			url: `${base}/messages/send-contact`,
			method: 'POST',
			body: { chatId, contactName: 'Dana', contactNumber: '972509999999' },
		});
	});

	it('send contact card rejects an @lid number', async () => {
		await expect(
			sent({ operation: 'sendContact', contactName: 'Dana', contactNumber: '123456789012345@lid' }),
		).rejects.toThrow('not an @lid ID');
	});

	it('pin defaults to 24 hours and honours the chosen duration', async () => {
		expect((await sent({ operation: 'pin', messageId: 'm1' })).body).toEqual({
			chatId,
			messageId: 'm1',
			durationSeconds: 86400,
		});
		expect(
			(await sent({ operation: 'pin', messageId: 'm1', pinDuration: 604800 })).body,
		).toMatchObject({
			durationSeconds: 604800,
		});
	});

	it('unpin, star and unstar', async () => {
		expect(await sent({ operation: 'unpin', messageId: 'm1' })).toEqual({
			url: `${base}/messages/unpin`,
			method: 'POST',
			body: { chatId, messageId: 'm1' },
		});
		expect(await sent({ operation: 'star', messageId: 'm1' })).toMatchObject({
			url: `${base}/messages/star`,
			body: { chatId, messageId: 'm1', star: true },
		});
		expect(await sent({ operation: 'unstar', messageId: 'm1' })).toMatchObject({
			url: `${base}/messages/star`,
			body: { chatId, messageId: 'm1', star: false },
		});
	});

	it('adds Reply To only to operations that accept quotedMessageId', async () => {
		const options = { quotedMessageId: ' q1 ' };
		expect((await sent({ operation: 'sendText', text: 'hi', options })).body).toMatchObject({
			quotedMessageId: 'q1',
		});
		expect(
			(await sent({ operation: 'sendLocation', latitude: 1, longitude: 2, options })).body,
		).toMatchObject({ quotedMessageId: 'q1' });
		expect(
			(await sent({ operation: 'sendTemplate', template: { value: 't1' }, options })).body,
		).not.toHaveProperty('quotedMessageId');
		expect(
			(await sent({ operation: 'react', messageId: 'm1', emoji: 'x', options })).body,
		).not.toHaveProperty('quotedMessageId');
	});
});

describe('executeMessage — get many', () => {
	it('filters, omits inline media and walks the cursor', async () => {
		const { ctx, calls } = fakeContext(
			{
				operation: 'getAll',
				returnAll: true,
				filters: { chat: '120363012345678901@g.us', sender: '+972 50 123 4567' },
			},
			(options: IHttpRequestOptions) => {
				const after = (options.qs as { after?: string }).after;
				const start = after ? Number(after) + 1 : 0;
				const count = Math.max(0, Math.min(100, 130 - start));
				return {
					messages: Array.from({ length: count }, (_, k) => ({ id: String(start + k) })),
					total: 130,
				};
			},
		);
		const messages = (await executeMessage(ctx, 0, 's1')) as Array<{ id: string }>;
		expect(messages).toHaveLength(130);
		expect(calls.map((call) => call.qs)).toEqual([
			{ inlineMedia: false, chatId: '120363012345678901@g.us', from: '972501234567', limit: 100 },
			{
				inlineMedia: false,
				chatId: '120363012345678901@g.us',
				from: '972501234567',
				limit: 100,
				after: '99',
			},
		]);
		expect(calls[0].url).toBe(`${base}/messages`);
		expect(calls[0].method).toBe('GET');
	});

	it('needs no recipient and respects the limit', async () => {
		const { ctx, calls } = fakeContext(
			{ operation: 'getAll', returnAll: false, limit: 5, filters: { includeMedia: true } },
			{ messages: Array.from({ length: 5 }, (_, k) => ({ id: String(k) })), total: 99 },
		);
		expect(await executeMessage(ctx, 0, 's1')).toHaveLength(5);
		expect(calls[0].qs).toEqual({ inlineMedia: true, limit: 5 });
	});
});

describe('executeMessage — download media', () => {
	it('returns a binary item named from Content-Disposition', async () => {
		const { ctx, calls } = fakeContext(
			{
				...contact,
				operation: 'downloadMedia',
				messageId: 'true_1@c.us_AB',
				outputBinaryField: 'file',
			},
			{
				body: Buffer.from('jpeg-bytes'),
				headers: {
					'content-type': 'image/jpeg',
					'content-disposition': 'attachment; filename="photo.jpg"',
				},
				statusCode: 200,
			},
		);
		const item = (await executeMessage(ctx, 0, 's1')) as {
			json: Record<string, unknown>;
			binary: Record<string, { data: string; fileName?: string; mimeType?: string }>;
		};
		expect(calls[0]).toMatchObject({
			method: 'GET',
			url: `${base}/messages/972501234567%40c.us/true_1%40c.us_AB/media`,
			encoding: 'arraybuffer',
			returnFullResponse: true,
			json: false,
		});
		expect(item.binary.file).toEqual({
			data: Buffer.from('jpeg-bytes').toString('base64'),
			fileName: 'photo.jpg',
			mimeType: 'image/jpeg',
		});
		expect(item.json).toEqual({
			chatId,
			messageId: 'true_1@c.us_AB',
			fileName: 'photo.jpg',
			mimeType: 'image/jpeg',
			fileSize: 10,
		});
	});
});

describe('executeMessage — convert to voice note', () => {
	const converted = { base64: 'T2dnUw==', mimetype: 'audio/ogg; codecs=opus', bytes: 5 };
	const responder = (options: IHttpRequestOptions) =>
		String(options.url).endsWith('/media/convert/voice') ? converted : { messageId: 'x' };

	it('converts a URL source, then sends the Ogg/Opus bytes as a voice note', async () => {
		const { ctx, calls } = fakeContext(
			{
				...contact,
				operation: 'sendAudio',
				mediaSource: 'url',
				mediaUrl: 'https://example.com/a.mp3',
				ptt: true,
				convertToVoiceNote: true,
			},
			responder,
		);
		await executeMessage(ctx, 0, 's1');
		expect(calls.map((call) => [call.url, call.body])).toEqual([
			[`${base}/media/convert/voice`, { url: 'https://example.com/a.mp3' }],
			[
				`${base}/messages/send-audio`,
				{ chatId, ptt: true, base64: converted.base64, mimetype: converted.mimetype },
			],
		]);
	});

	it('converts a binary source by base64 and drops the original file name', async () => {
		const { ctx, calls } = fakeContext(
			{
				...contact,
				operation: 'sendAudio',
				mediaSource: 'binary',
				binaryPropertyName: 'data',
				ptt: true,
				convertToVoiceNote: true,
			},
			responder,
		);
		await executeMessage(ctx, 0, 's1');
		expect(calls[0].body).toEqual({ base64: Buffer.from('mp3-bytes').toString('base64') });
		expect(Object.keys(calls[1].body as object).sort()).toEqual([
			'base64',
			'chatId',
			'mimetype',
			'ptt',
		]);
	});

	it('does not convert when voice note is off', async () => {
		const { ctx, calls } = fakeContext(
			{
				...contact,
				operation: 'sendAudio',
				mediaSource: 'url',
				mediaUrl: 'https://example.com/a.mp3',
				ptt: false,
				convertToVoiceNote: true,
			},
			responder,
		);
		await executeMessage(ctx, 0, 's1');
		expect(calls).toHaveLength(1);
		expect(calls[0].body).toMatchObject({ url: 'https://example.com/a.mp3', ptt: false });
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

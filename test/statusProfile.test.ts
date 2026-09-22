import { NodeApiError, type IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeProfile } from '../nodes/OpenWa/actions/profile';
import { executeStatus } from '../nodes/OpenWa/actions/status';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1';

async function run(
	execute: typeof executeProfile | typeof executeStatus,
	params: Record<string, unknown>,
	response?: unknown,
) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await execute(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body }) => ({ method, url, body })) };
}

describe('executeProfile', () => {
	it('set name trims and enforces 25 characters', async () => {
		expect(
			(await run(executeProfile, { operation: 'setName', profileName: ' Dana ' })).calls,
		).toEqual([{ method: 'PUT', url: `${base}/profile/name`, body: { name: 'Dana' } }]);
		await expect(
			run(executeProfile, { operation: 'setName', profileName: 'x'.repeat(26) }),
		).rejects.toThrow('Name is 26 characters; WhatsApp allows at most 25');
		await expect(run(executeProfile, { operation: 'setName', profileName: ' ' })).rejects.toThrow(
			'Name is required',
		);
	});

	it('set about allows clearing and counts emoji as one character', async () => {
		expect((await run(executeProfile, { operation: 'setAbout', profileAbout: '' })).calls).toEqual([
			{ method: 'PUT', url: `${base}/profile/status`, body: { status: '' } },
		]);
		await expect(
			run(executeProfile, { operation: 'setAbout', profileAbout: '😀'.repeat(139) }),
		).resolves.toBeDefined();
		await expect(
			run(executeProfile, { operation: 'setAbout', profileAbout: 'a'.repeat(140) }),
		).rejects.toThrow('at most 139');
	});

	it('set picture from a URL or an image binary; remove picture', async () => {
		expect(
			(
				await run(executeProfile, {
					operation: 'setPicture',
					profilePictureSource: 'url',
					profilePictureUrl: 'https://example.com/me.jpg',
				})
			).calls,
		).toEqual([
			{
				method: 'PUT',
				url: `${base}/profile/picture`,
				body: { url: 'https://example.com/me.jpg' },
			},
		]);

		const binary = {
			operation: 'setPicture',
			profilePictureSource: 'binary',
			profilePictureBinaryField: 'data',
			binaryData: Buffer.from('png'),
		};
		expect(
			(await run(executeProfile, { ...binary, binaryMeta: { mimeType: 'image/png' } })).calls[0]
				.body,
		).toEqual({
			base64: Buffer.from('png').toString('base64'),
			mimetype: 'image/png',
		});
		await expect(
			run(executeProfile, { ...binary, binaryMeta: { mimeType: 'text/plain' } }),
		).rejects.toThrow('The profile picture must be an image');

		expect((await run(executeProfile, { operation: 'removePicture' })).calls).toEqual([
			{ method: 'DELETE', url: `${base}/profile/picture`, body: undefined },
		]);
	});
});

describe('executeStatus — reading', () => {
	const statuses = { statuses: [{ id: 'a' }, { id: 'b' }] };

	it('get many and get from contact return one entry per status', async () => {
		const all = await run(executeStatus, { operation: 'getAll' }, statuses);
		expect(all.result).toEqual(statuses.statuses);
		expect(all.calls[0]).toMatchObject({ method: 'GET', url: `${base}/status` });

		const fromContact = await run(
			executeStatus,
			{ operation: 'getFromContact', statusContact: '+972 50 123 4567' },
			statuses,
		);
		expect(fromContact.calls[0].url).toBe(`${base}/status/972501234567%40c.us`);
		expect(fromContact.result).toHaveLength(2);
	});

	it('get from contact rejects an empty contact and a group ID', async () => {
		await expect(
			run(executeStatus, { operation: 'getFromContact', statusContact: ' ' }),
		).rejects.toThrow('Contact is required');
		await expect(
			run(executeStatus, { operation: 'getFromContact', statusContact: '120363012345678901@g.us' }),
		).rejects.toThrow('is a group ID, not a contact');
	});

	it('copes with a response without statuses', async () => {
		expect((await run(executeStatus, { operation: 'getAll' }, {})).result).toEqual([]);
	});
});

describe('executeStatus — posting', () => {
	it('post text with recipients, color and font', async () => {
		expect(
			(
				await run(executeStatus, {
					operation: 'postText',
					statusText: 'Hello',
					statusOptions: {
						recipients: '972501234567, 123456789012345@lid',
						backgroundColor: '#112233',
						font: 6,
					},
				})
			).calls,
		).toEqual([
			{
				method: 'POST',
				url: `${base}/status/send-text`,
				body: {
					text: 'Hello',
					recipients: ['972501234567@c.us', '123456789012345@lid'],
					backgroundColor: '#112233',
					font: 6,
				},
			},
		]);
	});

	it('rejects a bad color, too many recipients and empty text', async () => {
		await expect(
			run(executeStatus, {
				operation: 'postText',
				statusText: 'x',
				statusOptions: { backgroundColor: 'green' },
			}),
		).rejects.toThrow('#RRGGBB');
		const many = Array.from({ length: 257 }, (_, k) => String(972500000000 + k));
		await expect(
			run(executeStatus, {
				operation: 'postText',
				statusText: 'x',
				statusOptions: { recipients: many },
			}),
		).rejects.toThrow('257 contacts; the limit is 256');
		await expect(run(executeStatus, { operation: 'postText', statusText: '  ' })).rejects.toThrow(
			'Text is required',
		);
	});

	it('post image by URL with caption; post video from binary', async () => {
		expect(
			(
				await run(executeStatus, {
					operation: 'postImage',
					statusMediaSource: 'url',
					statusMediaUrl: 'https://example.com/p.jpg',
					statusCaption: 'Hi',
					statusOptions: { backgroundColor: '#112233', font: 1 },
				})
			).calls,
		).toEqual([
			{
				method: 'POST',
				url: `${base}/status/send-image`,
				body: { image: { url: 'https://example.com/p.jpg' }, caption: 'Hi' },
			},
		]);

		const video = await run(executeStatus, {
			operation: 'postVideo',
			statusMediaSource: 'binary',
			statusBinaryField: 'data',
			binaryMeta: { mimeType: 'video/mp4' },
			binaryData: Buffer.from('mp4'),
		});
		expect(video.calls[0]).toEqual({
			method: 'POST',
			url: `${base}/status/send-video`,
			body: { video: { base64: Buffer.from('mp4').toString('base64'), mimetype: 'video/mp4' } },
		});
	});

	it('rejects binary of the wrong kind', async () => {
		await expect(
			run(executeStatus, {
				operation: 'postVideo',
				statusMediaSource: 'binary',
				statusBinaryField: 'data',
				binaryMeta: { mimeType: 'image/png' },
			}),
		).rejects.toThrow('The video status must be a video, but "data" is image/png');
	});

	it('post voice converts to Ogg/Opus by default, then posts it', async () => {
		const converted = { base64: 'T2dnUw==', mimetype: 'audio/ogg; codecs=opus', bytes: 5 };
		const { calls } = await run(
			executeStatus,
			{
				operation: 'postVoice',
				statusMediaSource: 'url',
				statusMediaUrl: 'https://example.com/a.mp3',
				statusOptions: { backgroundColor: '#000000' },
			},
			(options: IHttpRequestOptions) =>
				String(options.url).endsWith('/media/convert/voice') ? converted : { statusId: 's' },
		);
		expect(calls).toEqual([
			{
				method: 'POST',
				url: `${base}/media/convert/voice`,
				body: { url: 'https://example.com/a.mp3' },
			},
			{
				method: 'POST',
				url: `${base}/status/send-voice`,
				body: {
					audio: { base64: 'T2dnUw==', mimetype: 'audio/ogg; codecs=opus' },
					backgroundColor: '#000000',
				},
			},
		]);
	});

	it('explains a 503 from conversion instead of suggesting a retry', async () => {
		const disabled = Object.assign(new Error('Request failed with status code 503'), {
			httpCode: '503',
			cause: { response: { status: 503, data: { message: 'Media conversion is disabled' } } },
		});
		const error = await run(
			executeStatus,
			{
				operation: 'postVoice',
				statusMediaSource: 'url',
				statusMediaUrl: 'https://example.com/a.mp3',
			},
			() => disabled,
		).catch((e: unknown) => e as NodeApiError);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toMatch(/could not convert the audio to a voice note/);
		expect(error.description).toMatch(
			/turn off Convert to Voice Note.*Gateway: Media conversion is disabled/,
		);
	});

	it('post voice: any type is fine when converting, audio is required when not', async () => {
		const webm = {
			operation: 'postVoice',
			statusMediaSource: 'binary',
			statusBinaryField: 'data',
			binaryMeta: { mimeType: 'video/webm' },
			binaryData: Buffer.from('webm'),
		};
		const converted = { base64: 'T2dnUw==', mimetype: 'audio/ogg; codecs=opus', bytes: 5 };
		const { calls } = await run(executeStatus, webm, (options: IHttpRequestOptions) =>
			String(options.url).endsWith('/media/convert/voice') ? converted : { statusId: 's' },
		);
		expect(calls[0].body).toEqual({ base64: Buffer.from('webm').toString('base64') });

		await expect(run(executeStatus, { ...webm, statusConvertVoice: false })).rejects.toThrow(
			'The voice status must be an audio file, but "data" is video/webm',
		);
	});

	it('post voice without conversion sends the source as-is', async () => {
		const { calls } = await run(executeStatus, {
			operation: 'postVoice',
			statusMediaSource: 'url',
			statusMediaUrl: 'https://example.com/a.ogg',
			statusConvertVoice: false,
		});
		expect(calls).toEqual([
			{
				method: 'POST',
				url: `${base}/status/send-voice`,
				body: { audio: { url: 'https://example.com/a.ogg' } },
			},
		]);
	});
});

describe('executeStatus — delete and download', () => {
	it('delete returns the gateway message with the status ID', async () => {
		const { result, calls } = await run(
			executeStatus,
			{ operation: 'delete', statusId: ' st1 ' },
			{ message: 'Status deleted' },
		);
		expect(calls).toEqual([{ method: 'DELETE', url: `${base}/status/st1`, body: undefined }]);
		expect(result).toEqual({ message: 'Status deleted', statusId: 'st1' });
	});

	it('download media returns a binary item', async () => {
		const { result } = await run(
			executeStatus,
			{ operation: 'downloadMedia', statusId: 'st1', statusOutputField: 'file' },
			{
				body: Buffer.from('jpeg'),
				headers: {
					'content-type': 'image/jpeg',
					'content-disposition': 'attachment; filename="s.jpg"',
				},
				statusCode: 200,
			},
		);
		expect(result).toEqual({
			json: { statusId: 'st1', fileName: 's.jpg', mimeType: 'image/jpeg', fileSize: 4 },
			binary: {
				file: {
					data: Buffer.from('jpeg').toString('base64'),
					fileName: 's.jpg',
					mimeType: 'image/jpeg',
				},
			},
		});
	});
});

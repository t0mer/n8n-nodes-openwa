import { describe, expect, it } from 'vitest';
import { executeGroup } from '../nodes/OpenWa/actions/group';
import { executeMessage } from '../nodes/OpenWa/actions/message';
import { executeProfile } from '../nodes/OpenWa/actions/profile';
import { executeStatus } from '../nodes/OpenWa/actions/status';
import { MAX_BINARY_BYTES, buildMediaBody, parseBase64 } from '../nodes/OpenWa/helpers/media';
import { fakeContext } from './fakeContext';

const png = Buffer.from('png-bytes').toString('base64');
const base = 'https://wa.example.com/api/sessions/s1';

describe('parseBase64', () => {
	it('strips a data URL prefix and takes its MIME type', () => {
		expect(parseBase64(`data:image/png;base64,${png}`)).toEqual({
			base64: png,
			mimeType: 'image/png',
		});
		expect(parseBase64(`DATA:audio/ogg; codecs=opus;base64,${png}`)).toEqual({
			base64: png,
			mimeType: 'audio/ogg',
		});
		expect(parseBase64(`data:;base64,${png}`)).toEqual({ base64: png, mimeType: undefined });
	});

	it('drops surrounding and embedded whitespace', () => {
		expect(parseBase64(`  ${png.slice(0, 4)}\n${png.slice(4)}  `).base64).toBe(png);
	});

	it('accepts URL-safe and unpadded base64 and sends it as standard padded base64', () => {
		const bytes = Buffer.from([0xfb, 0xff, 0xbf, 0x01]);
		const standard = bytes.toString('base64');
		expect(standard).toBe('+/+/AQ==');
		expect(parseBase64(bytes.toString('base64url')).base64).toBe(standard);
		expect(parseBase64('-_-_AQ').base64).toBe(standard);
		expect(parseBase64('+/+/AQ').base64).toBe(standard);
		expect(parseBase64('data:image/png;base64,-_-_AQ=')).toEqual({
			base64: standard,
			mimeType: 'image/png',
		});
		expect(parseBase64('YWI').base64).toBe('YWI=');
	});

	it('rejects empty and invalid base64', () => {
		expect(() => parseBase64('')).toThrow('The Base64 data is empty');
		expect(() => parseBase64('data:image/png;base64,')).toThrow('empty');
		expect(() => parseBase64('not base64!')).toThrow('not valid base64');
		expect(() => parseBase64('abcde')).toThrow('not valid base64');
		expect(() => parseBase64('ab===')).toThrow('not valid base64');
		expect(() => parseBase64('ab=c')).toThrow('not valid base64');
	});

	it('applies the 18 MB guard to the decoded length', () => {
		const atLimit = Buffer.alloc(MAX_BINARY_BYTES).toString('base64');
		expect(parseBase64(atLimit).base64).toBe(atLimit);
		const over = Buffer.alloc(MAX_BINARY_BYTES + 1).toString('base64');
		expect(() => parseBase64(over)).toThrow(/above the 18\.0 MB limit/);
	});
});

describe('buildMediaBody — Base64 source', () => {
	it('uses the MIME Type field over the data URL one, with an optional file name', () => {
		expect(
			buildMediaBody({
				source: 'base64',
				data: `data:image/png;base64,${png}`,
				mimeType: ' image/webp ',
				fileName: 'a.webp',
			}),
		).toEqual({ base64: png, mimetype: 'image/webp', filename: 'a.webp' });
		expect(buildMediaBody({ source: 'base64', data: `data:image/png;base64,${png}` })).toEqual({
			base64: png,
			mimetype: 'image/png',
		});
	});

	it('requires a MIME type', () => {
		expect(() => buildMediaBody({ source: 'base64', data: png, mimeType: ' ' })).toThrow(
			'MIME Type is required with Base64 data',
		);
	});
});

describe('Base64 media source per operation', () => {
	const contact = { recipientType: 'contact', phoneNumber: '972501234567', options: {} };
	const chatId = '972501234567@c.us';

	it.each([
		['sendImage', 'send-image', { caption: 'Hi' }, { caption: 'Hi' }],
		['sendVideo', 'send-video', {}, {}],
		['sendAudio', 'send-audio', { ptt: true }, { ptt: true }],
		['sendDocument', 'send-document', { fileName: 'a.pdf' }, { filename: 'a.pdf' }],
		['sendSticker', 'send-sticker', {}, {}],
	])('message %s posts flat base64 + mimetype', async (operation, path, params, extra) => {
		const { ctx, calls } = fakeContext({
			...contact,
			operation,
			mediaSource: 'base64',
			mediaBase64: png,
			mediaMimeType: 'image/png',
			...params,
		});
		await executeMessage(ctx, 0, 's1');
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(`${base}/messages/${path}`);
		expect(calls[0].body).toEqual({ chatId, base64: png, mimetype: 'image/png', ...extra });
	});

	it('message send rejects invalid base64 before calling the API', async () => {
		const { ctx, calls } = fakeContext({
			...contact,
			operation: 'sendImage',
			mediaSource: 'base64',
			mediaBase64: '%%%',
			mediaMimeType: 'image/png',
		});
		await expect(executeMessage(ctx, 0, 's1')).rejects.toThrow('not valid base64');
		expect(calls).toHaveLength(0);
	});

	it('status post nests the media and takes the MIME type from a data URL', async () => {
		const { ctx, calls } = fakeContext({
			operation: 'postImage',
			statusMediaSource: 'base64',
			statusMediaBase64: `data:image/jpeg;base64,${png}`,
		});
		await executeStatus(ctx, 0, 's1');
		expect(calls[0].url).toBe(`${base}/status/send-image`);
		expect(calls[0].body).toEqual({ image: { base64: png, mimetype: 'image/jpeg' } });
	});

	it('status post rejects Base64 of the wrong kind', async () => {
		const { ctx, calls } = fakeContext({
			operation: 'postVideo',
			statusMediaSource: 'base64',
			statusMediaBase64: png,
			statusMediaMimeType: 'image/png',
		});
		await expect(executeStatus(ctx, 0, 's1')).rejects.toThrow(
			'The video status must be a video, but the Base64 data is image/png',
		);
		expect(calls).toHaveLength(0);
	});

	it('group and profile pictures send base64 + mimetype and require an image', async () => {
		const group = { mode: 'id', value: '120363012345678901@g.us' };
		const { ctx: g, calls: groupCalls } = fakeContext({
			operation: 'setPicture',
			group,
			pictureSource: 'base64',
			pictureBase64: png,
			pictureMimeType: 'image/png',
		});
		await executeGroup(g, 0, 's1');
		expect(groupCalls[0].body).toEqual({ base64: png, mimetype: 'image/png' });

		const { ctx: p, calls: profileCalls } = fakeContext({
			operation: 'setPicture',
			profilePictureSource: 'base64',
			profilePictureBase64: `data:image/jpeg;base64,${png}`,
		});
		await executeProfile(p, 0, 's1');
		expect(profileCalls[0].url).toBe(`${base}/profile/picture`);
		expect(profileCalls[0].body).toEqual({ base64: png, mimetype: 'image/jpeg' });

		const { ctx: pdf } = fakeContext({
			operation: 'setPicture',
			profilePictureSource: 'base64',
			profilePictureBase64: png,
			profilePictureMimeType: 'application/pdf',
		});
		await expect(executeProfile(pdf, 0, 's1')).rejects.toThrow(
			'The profile picture must be an image, but the Base64 data is application/pdf',
		);
	});
});

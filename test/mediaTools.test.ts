import { NodeApiError, type INodeExecutionData } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeMediaTools } from '../nodes/OpenWa/actions/mediaTools';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1/media/convert';
const voice = { base64: 'T2dnUw==', mimetype: 'audio/ogg; codecs=opus', bytes: 4 };
const video = { base64: 'AAAAIGZ0eXA=', mimetype: 'video/mp4', bytes: 8 };

async function run(params: Record<string, unknown>, response: unknown = voice) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeMediaTools(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body }) => ({ method, url, body })) };
}

describe('executeMediaTools', () => {
	it('check conversion reads the availability flag', async () => {
		const { result, calls } = await run({ operation: 'checkConversion' }, { available: true });
		expect(calls).toEqual([{ method: 'GET', url: base, body: undefined }]);
		expect(result).toEqual({ available: true });
	});

	it('convert to voice note sends a URL and outputs the file as binary, not base64 JSON', async () => {
		const { result, calls } = await run({
			operation: 'convertVoice',
			convertSource: 'url',
			convertUrl: 'https://example.com/media/My%20Note.m4a',
		});
		expect(calls).toEqual([
			{
				method: 'POST',
				url: `${base}/voice`,
				body: { url: 'https://example.com/media/My%20Note.m4a' },
			},
		]);
		expect(result).toEqual({
			json: { fileName: 'My Note.ogg', mimetype: voice.mimetype, bytes: 4 },
			binary: { data: { data: voice.base64, fileName: 'My Note.ogg', mimeType: voice.mimetype } },
		});
	});

	it('convert video sends binary input as base64 and names the output after the input', async () => {
		const { result, calls } = await run(
			{
				operation: 'convertVideo',
				convertSource: 'binary',
				convertBinaryProperty: 'clip',
				convertOutputField: 'mp4',
				binaryMeta: { mimeType: 'video/quicktime', fileName: 'clip.mov' },
				binaryData: Buffer.from('mov-bytes'),
			},
			video,
		);
		expect(calls).toEqual([
			{
				method: 'POST',
				url: `${base}/video`,
				body: { base64: Buffer.from('mov-bytes').toString('base64') },
			},
		]);
		const item = result as INodeExecutionData;
		expect(item.json).toEqual({ fileName: 'clip.mp4', mimetype: 'video/mp4', bytes: 8 });
		expect(Object.keys(item.binary ?? {})).toEqual(['mp4']);
	});

	it('uses a default file name for Base64 input and URLs without one', async () => {
		const b64 = await run({
			operation: 'convertVoice',
			convertSource: 'base64',
			convertBase64: 'data:audio/mpeg;base64,SUQz',
		});
		expect(b64.calls[0].body).toEqual({ base64: 'SUQz' });
		expect((b64.result as INodeExecutionData).json.fileName).toBe('voice.ogg');

		const url = await run(
			{ operation: 'convertVideo', convertSource: 'url', convertUrl: 'https://example.com/' },
			video,
		);
		expect((url.result as INodeExecutionData).json.fileName).toBe('video.mp4');
	});

	it('explains a 503 as conversion being unavailable', async () => {
		const disabled = Object.assign(new Error('Request failed with status code 503'), {
			httpCode: '503',
			cause: { response: { status: 503, data: { message: 'Media conversion is disabled' } } },
		});
		const error = await run(
			{ operation: 'convertVideo', convertSource: 'url', convertUrl: 'https://example.com/a.mov' },
			() => disabled,
		).catch((e: unknown) => e as NodeApiError);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toMatch(/could not convert the video/);
		expect(error.description).toBe(
			'Enable media conversion on the OpenWA gateway. Gateway: Media conversion is disabled',
		);
	});

	it('accepts Base64 input without a MIME type', async () => {
		const { calls } = await run({
			operation: 'convertVoice',
			convertSource: 'base64',
			convertBase64: 'SUQz',
		});
		expect(calls[0]).toEqual({ method: 'POST', url: `${base}/voice`, body: { base64: 'SUQz' } });
	});
});

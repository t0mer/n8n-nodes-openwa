import {
	NodeApiError,
	NodeOperationError,
	type IBinaryData,
	type IDataObject,
	type IExecuteFunctions,
	type IN8nHttpFullResponse,
	type JsonObject,
} from 'n8n-workflow';
import {
	MAX_BINARY_BYTES,
	buildMediaBody,
	parseContentDispositionFilename,
	type MediaInput,
} from '../helpers/media';
import { openWaApiRequest } from '../transport/request';

const ARTICLE_NOUN = { image: 'an image', video: 'a video', audio: 'an audio file' };

/** Parameter names of a URL, binary or Base64 media source. */
export interface MediaFields {
	source: string;
	url: string;
	binary: string;
	base64: string;
	mimeType: string;
}

/**
 * Read a URL, binary or Base64 media source into `{ url }` or `{ base64, mimetype }` (no file
 * name). With `accept`, the media must be of that kind (e.g. `image`); `label` names it in errors.
 */
export async function readMediaInput(
	ctx: IExecuteFunctions,
	i: number,
	fields: MediaFields,
	{ accept, label }: { accept?: 'image' | 'video' | 'audio'; label: string },
): Promise<IDataObject> {
	const source = ctx.getNodeParameter(fields.source, i);
	let input: MediaInput;
	if (source === 'binary') {
		const field = ctx.getNodeParameter(fields.binary, i) as string;
		const binary = ctx.helpers.assertBinaryData(i, field);
		if (accept && !binary.mimeType?.startsWith(`${accept}/`)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`${label} must be ${ARTICLE_NOUN[accept]}, but "${field}" is ${binary.mimeType || 'of unknown type'}`,
				{ itemIndex: i },
			);
		}
		const data = await ctx.helpers.getBinaryDataBuffer(i, field);
		input = { source: 'binary', data, mimeType: binary.mimeType };
	} else if (source === 'base64') {
		input = {
			source: 'base64',
			data: String(ctx.getNodeParameter(fields.base64, i) ?? ''),
			mimeType: String(ctx.getNodeParameter(fields.mimeType, i, '') ?? ''),
		};
	} else {
		input = { source: 'url', url: String(ctx.getNodeParameter(fields.url, i) ?? '') };
	}
	let body;
	try {
		body = buildMediaBody(input);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	const { url, base64, mimetype } = body;
	if (url) return { url };
	if (source === 'base64' && accept && !mimetype?.startsWith(`${accept}/`)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${label} must be ${ARTICLE_NOUN[accept]}, but the Base64 data is ${mimetype}`,
			{ itemIndex: i },
		);
	}
	return { base64, mimetype };
}

/** GET a file from the gateway as n8n binary data, named from Content-Disposition. */
export async function downloadBinary(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
	path: string,
): Promise<{ binary: IBinaryData; fileSize: number }> {
	const response = (await openWaApiRequest.call(
		ctx,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}${path}`,
		{ sessionId, itemIndex: i, raw: true },
	)) as IN8nHttpFullResponse;

	const body = response.body as Buffer | ArrayBuffer;
	const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
	const header = (name: string) => {
		const value = response.headers?.[name];
		return Array.isArray(value) ? value[0] : value;
	};
	// The gateway may label every file application/octet-stream; drop that so n8n infers the
	// real type from the file name.
	const contentType = String(header('content-type') ?? '')
		.split(';')[0]
		.trim();
	const mimeType =
		contentType && contentType !== 'application/octet-stream' ? contentType : undefined;
	const fileName = parseContentDispositionFilename(header('content-disposition'));

	return {
		binary: await ctx.helpers.prepareBinaryData(data, fileName, mimeType),
		fileSize: data.length,
	};
}

/** What the gateway's convert endpoints answer: the converted bytes, their type and size. */
export interface ConvertedMedia {
	base64: string;
	mimetype: string;
	bytes: number;
}

const CONVERT_TARGET = { voice: 'the audio to a voice note', video: 'the video' };

/**
 * Have the gateway convert `media` (url or base64): `voice` to Ogg/Opus, `video` to a
 * WhatsApp-compatible MP4. `hint` is added to the advice when conversion is unavailable.
 */
export async function convertMedia(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
	media: IDataObject,
	kind: 'voice' | 'video',
	hint?: string,
): Promise<ConvertedMedia> {
	try {
		return (await openWaApiRequest.call(
			ctx,
			'POST',
			`/api/sessions/${encodeURIComponent(sessionId)}/media/convert/${kind}`,
			{
				body: media.base64 ? { base64: media.base64 } : { url: media.url },
				sessionId,
				itemIndex: i,
			},
		)) as ConvertedMedia;
	} catch (error) {
		// A 503 here usually means conversion is off or ffmpeg is missing, which retrying won't fix.
		if (error instanceof NodeApiError && error.httpCode === '503') {
			const reason = error.description;
			error.message = `The gateway could not convert ${CONVERT_TARGET[kind]} (media conversion disabled, ffmpeg missing, or the conversion queue is full)`;
			error.description = `Enable media conversion on the OpenWA gateway${hint ? `, or ${hint}` : ''}.${reason ? ` Gateway: ${reason}` : ''}`;
		}
		throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
	}
}

/**
 * Have the gateway convert the audio in `media` (url or base64) to Ogg/Opus, and return the
 * `base64`/`mimetype` to send instead.
 */
export async function convertToVoiceNote(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
	media: IDataObject,
): Promise<IDataObject> {
	const converted = await convertMedia(
		ctx,
		i,
		sessionId,
		media,
		'voice',
		'turn off Convert to Voice Note if the audio is already Ogg/Opus',
	);
	// The converted audio is always sent inline, so sending by URL can't get around the limit.
	if (converted.bytes > MAX_BINARY_BYTES) {
		const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
		throw new NodeOperationError(
			ctx.getNode(),
			`The converted voice note is ${mb(converted.bytes)} MB, above the ${mb(MAX_BINARY_BYTES)} MB inline limit. Shorten the audio, or send it without Convert to Voice Note.`,
			{ itemIndex: i },
		);
	}
	return { base64: converted.base64, mimetype: converted.mimetype };
}

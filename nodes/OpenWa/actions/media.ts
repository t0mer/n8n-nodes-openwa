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

/** Parameter names of a URL-or-binary media source. */
export interface MediaFields {
	source: string;
	url: string;
	binary: string;
}

/**
 * Read a URL-or-binary media source into `{ url }` or `{ base64, mimetype }` (no file name).
 * With `accept`, binary data must be of that kind (e.g. `image`); `label` names it in errors.
 */
export async function readMediaInput(
	ctx: IExecuteFunctions,
	i: number,
	fields: MediaFields,
	{ accept, label }: { accept?: 'image' | 'video' | 'audio'; label: string },
): Promise<IDataObject> {
	let input: MediaInput;
	if (ctx.getNodeParameter(fields.source, i) === 'binary') {
		const field = ctx.getNodeParameter(fields.binary, i) as string;
		const binary = ctx.helpers.assertBinaryData(i, field);
		if (accept && !binary.mimeType?.startsWith(`${accept}/`)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`${label} must be ${accept === 'image' ? 'an' : 'a'} ${accept}, but "${field}" is ${binary.mimeType || 'of unknown type'}`,
				{ itemIndex: i },
			);
		}
		const data = await ctx.helpers.getBinaryDataBuffer(i, field);
		input = { source: 'binary', data, mimeType: binary.mimeType };
	} else {
		input = { source: 'url', url: String(ctx.getNodeParameter(fields.url, i) ?? '') };
	}
	try {
		const { url, base64, mimetype } = buildMediaBody(input);
		return url ? { url } : { base64, mimetype };
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
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
	let converted: { base64: string; mimetype: string; bytes: number };
	try {
		converted = (await openWaApiRequest.call(
			ctx,
			'POST',
			`/api/sessions/${encodeURIComponent(sessionId)}/media/convert/voice`,
			{
				body: media.base64 ? { base64: media.base64 } : { url: media.url },
				sessionId,
				itemIndex: i,
			},
		)) as typeof converted;
	} catch (error) {
		// A 503 here usually means conversion is off or ffmpeg is missing, which retrying won't fix.
		if (error instanceof NodeApiError && error.httpCode === '503') {
			const reason = error.description;
			error.message =
				'The gateway could not convert the audio to a voice note (media conversion disabled, ffmpeg missing, or the conversion queue is full)';
			error.description = `Enable media conversion on the OpenWA gateway, or turn off Convert to Voice Note if the audio is already Ogg/Opus.${reason ? ` Gateway: ${reason}` : ''}`;
		}
		throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
	}
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

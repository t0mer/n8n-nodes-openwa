import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';
import { convertMedia, readMediaInput } from './media';

const SOURCE_FIELDS = {
	source: 'convertSource',
	url: 'convertUrl',
	binary: 'convertBinaryProperty',
	base64: 'convertBase64',
	mimeType: 'convertMimeType',
};

/** Output file name and extension per conversion. */
const OUTPUT = {
	convertVoice: { kind: 'voice', name: 'voice', extension: 'ogg', label: 'Audio' },
	convertVideo: { kind: 'video', name: 'video', extension: 'mp4', label: 'Video' },
} as const;

/** The input file's name (binary name, or the last URL path segment) with a new extension. */
function outputFileName(
	ctx: IExecuteFunctions,
	i: number,
	{ name, extension }: { name: string; extension: string },
): string {
	const source = ctx.getNodeParameter(SOURCE_FIELDS.source, i);
	let input: string | undefined;
	if (source === 'binary') {
		const field = ctx.getNodeParameter(SOURCE_FIELDS.binary, i) as string;
		input = ctx.helpers.assertBinaryData(i, field).fileName;
	} else if (source === 'url') {
		try {
			const path = new URL(String(ctx.getNodeParameter(SOURCE_FIELDS.url, i))).pathname;
			input = decodeURIComponent(path.split('/').pop() ?? '');
		} catch {
			input = undefined;
		}
	}
	const stem = input?.replace(/\.[^.]*$/, '').trim();
	return `${stem || name}.${extension}`;
}

/** Run one Media operation for item `i`. Conversions output the converted file as binary. */
export async function executeMediaTools(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | INodeExecutionData> {
	const operation = ctx.getNodeParameter('operation', i) as string;

	if (operation === 'checkConversion') {
		return (await openWaApiRequest.call(
			ctx,
			'GET',
			`/api/sessions/${encodeURIComponent(sessionId)}/media/convert`,
			{ sessionId, itemIndex: i },
		)) as IDataObject;
	}

	const output = OUTPUT[operation as keyof typeof OUTPUT];
	if (!output) {
		throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
			itemIndex: i,
		});
	}
	// Any format ffmpeg reads is fine, so the input type isn't checked, and the gateway takes no
	// MIME type.
	const media = await readMediaInput(ctx, i, SOURCE_FIELDS, {
		label: output.label,
		mimeTypeOptional: true,
	});
	const converted = await convertMedia(ctx, i, sessionId, media, output.kind);
	const field =
		String(ctx.getNodeParameter('convertOutputField', i, 'data') ?? '').trim() || 'data';
	const binary = await ctx.helpers.prepareBinaryData(
		Buffer.from(converted.base64, 'base64'),
		outputFileName(ctx, i, output),
		converted.mimetype,
	);
	// The bytes are in the binary field; repeating them as base64 would only bloat the item.
	return {
		json: { fileName: binary.fileName, mimetype: converted.mimetype, bytes: converted.bytes },
		binary: { [field]: binary },
	};
}

import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { CAPTION_OPERATIONS, MEDIA_ENDPOINTS } from '../descriptions/media';
import { normalizeContactId, parseMentions, validateGroupId } from '../helpers/chatId';
import { buildMediaBody, type MediaInput } from '../helpers/media';
import { openWaApiRequest } from '../transport/request';
import { checkNumber } from './contact';

/** Run one Message operation for item `i` and return the API response. */
export async function executeMessage(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const chatId = getChatId(ctx, i);
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;

	if (options.checkNumberExists && ctx.getNodeParameter('recipientType', i) === 'contact') {
		await assertNumberExists(ctx, i, sessionId, chatId);
	}

	let endpoint: string;
	let body: IDataObject;
	if (operation === 'sendText') {
		endpoint = 'send-text';
		body = buildTextBody(ctx, i, chatId, options);
	} else if (MEDIA_ENDPOINTS[operation]) {
		endpoint = MEDIA_ENDPOINTS[operation];
		body = await buildMediaRequestBody(ctx, i, operation, chatId);
	} else {
		throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
			itemIndex: i,
		});
	}

	return (await openWaApiRequest.call(
		ctx,
		'POST',
		`/api/sessions/${encodeURIComponent(sessionId)}/messages/${endpoint}`,
		{ body, sessionId, itemIndex: i },
	)) as IDataObject;
}

/** Resolve and validate the recipient chat ID for an item. */
function getChatId(ctx: IExecuteFunctions, i: number): string {
	try {
		if (ctx.getNodeParameter('recipientType', i) === 'group') {
			return validateGroupId(ctx.getNodeParameter('group', i, '', { extractValue: true }));
		}
		return normalizeContactId(ctx.getNodeParameter('phoneNumber', i));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}

async function assertNumberExists(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
	chatId: string,
): Promise<void> {
	const result = await checkNumber(ctx, i, sessionId, chatId);
	if (!result.exists) {
		throw new NodeOperationError(ctx.getNode(), `The number ${result.number} is not on WhatsApp`, {
			itemIndex: i,
			description: 'The message was not sent. Check the number, or turn off "Check Number Exists".',
		});
	}
}

function buildTextBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
): IDataObject {
	const body: IDataObject = { chatId, text: String(ctx.getNodeParameter('text', i) ?? '') };
	if (options.linkPreview !== undefined) body.linkPreview = options.linkPreview;
	if (options.mentions) {
		try {
			body.mentions = parseMentions(options.mentions);
		} catch (error) {
			throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
		}
	}
	return body;
}

async function buildMediaRequestBody(
	ctx: IExecuteFunctions,
	i: number,
	operation: string,
	chatId: string,
): Promise<IDataObject> {
	let input: MediaInput;
	if (ctx.getNodeParameter('mediaSource', i) === 'binary') {
		const field = ctx.getNodeParameter('binaryPropertyName', i) as string;
		const binary = ctx.helpers.assertBinaryData(i, field);
		const data = await ctx.helpers.getBinaryDataBuffer(i, field);
		input = { source: 'binary', data, mimeType: binary.mimeType, fileName: binary.fileName };
	} else {
		input = { source: 'url', url: String(ctx.getNodeParameter('mediaUrl', i) ?? '') };
	}

	let body: IDataObject;
	try {
		body = { chatId, ...buildMediaBody(input) };
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}

	if (CAPTION_OPERATIONS.includes(operation)) {
		const caption = String(ctx.getNodeParameter('caption', i, '') ?? '');
		if (caption) body.caption = caption;
	}
	if (operation === 'sendDocument') {
		const fileName = String(ctx.getNodeParameter('fileName', i, '') ?? '').trim();
		if (fileName) body.filename = fileName;
	}
	if (operation === 'sendAudio') {
		body.ptt = ctx.getNodeParameter('ptt', i, false) as boolean;
	}
	return body;
}

import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { CAPTION_OPERATIONS, MEDIA_ENDPOINTS } from '../descriptions/media';
import { SEND_OPERATIONS } from '../descriptions/message';
import { normalizeContactId, parseMentions, validateGroupId } from '../helpers/chatId';
import { buildMediaBody, type MediaInput } from '../helpers/media';
import { openWaApiRequest } from '../transport/request';
import { checkNumber } from './contact';

type BodyBuilder = (
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
	operation: string,
) => IDataObject | Promise<IDataObject>;

/** Each Message operation: the endpoint it posts to and how its request body is built. */
const OPERATIONS: Record<string, { endpoint: string; build: BodyBuilder }> = {
	sendText: { endpoint: 'send-text', build: buildTextBody },
	reply: { endpoint: 'reply', build: buildReplyBody },
	...Object.fromEntries(
		Object.entries(MEDIA_ENDPOINTS).map(([operation, endpoint]) => [
			operation,
			{ endpoint, build: buildMediaRequestBody },
		]),
	),
};

/** Run one Message operation for item `i` and return the API response. */
export async function executeMessage(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const chatId = getChatId(ctx, i);
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;

	const spec = OPERATIONS[operation];
	if (!spec) {
		throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
			itemIndex: i,
		});
	}

	if (
		options.checkNumberExists &&
		SEND_OPERATIONS.includes(operation) &&
		ctx.getNodeParameter('recipientType', i) === 'contact'
	) {
		await assertNumberExists(ctx, i, sessionId, chatId);
	}

	const body = await spec.build(ctx, i, chatId, options, operation);
	return (await openWaApiRequest.call(
		ctx,
		'POST',
		`/api/sessions/${encodeURIComponent(sessionId)}/messages/${spec.endpoint}`,
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
	const result = await checkNumber(ctx, i, sessionId, chatId, {
		message: 'Check Number Exists needs a phone number, not an @lid ID',
		description: 'Enter the phone number instead, or turn off "Check Number Exists".',
	});
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
	const body: IDataObject = { chatId, text: getText(ctx, i), ...getMentions(ctx, i, options) };
	if (options.linkPreview !== undefined) body.linkPreview = options.linkPreview;
	return body;
}

function buildReplyBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
): IDataObject {
	return {
		chatId,
		quotedMessageId: getMessageId(ctx, i),
		text: getText(ctx, i),
		...getMentions(ctx, i, options),
	};
}

function getText(ctx: IExecuteFunctions, i: number): string {
	return String(ctx.getNodeParameter('text', i) ?? '');
}

/** `{ mentions }` from the Mentions option, or nothing when it is empty. */
function getMentions(ctx: IExecuteFunctions, i: number, options: IDataObject): IDataObject {
	if (!options.mentions) return {};
	try {
		return { mentions: parseMentions(options.mentions) };
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}

function getMessageId(ctx: IExecuteFunctions, i: number): string {
	const messageId = String(ctx.getNodeParameter('messageId', i) ?? '').trim();
	if (!messageId)
		throw new NodeOperationError(ctx.getNode(), 'Message ID is required', { itemIndex: i });
	return messageId;
}

async function buildMediaRequestBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	_options: IDataObject,
	operation: string,
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

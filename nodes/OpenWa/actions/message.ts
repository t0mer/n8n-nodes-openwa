import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { CAPTION_OPERATIONS, MEDIA_ENDPOINTS } from '../descriptions/media';
import { SEND_OPERATIONS } from '../descriptions/message';
import {
	normalizeChatId,
	normalizeContactId,
	parseMentions,
	validateGroupId,
} from '../helpers/chatId';
import { pairsToObject, parseCoordinate, parsePollOptions } from '../helpers/fields';
import { buildMediaBody, type MediaInput } from '../helpers/media';
import { openWaApiRequest } from '../transport/request';
import { checkNumber } from './contact';
import { getTemplateId } from './template';

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
	sendTemplate: { endpoint: 'send-template', build: buildTemplateBody },
	votePoll: { endpoint: 'vote-poll', build: buildVotePollBody },
	sendPoll: { endpoint: 'send-poll', build: buildPollBody },
	sendLocation: { endpoint: 'send-location', build: buildLocationBody },
	delete: { endpoint: 'delete', build: buildDeleteBody },
	edit: { endpoint: 'edit', build: buildEditBody },
	forward: { endpoint: 'forward', build: buildForwardBody },
	react: { endpoint: 'react', build: buildReactBody },
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

function buildReactBody(ctx: IExecuteFunctions, i: number, chatId: string): IDataObject {
	return {
		chatId,
		messageId: getMessageId(ctx, i),
		emoji: String(ctx.getNodeParameter('emoji', i, '') ?? '').trim(),
	};
}

function buildForwardBody(ctx: IExecuteFunctions, i: number, chatId: string): IDataObject {
	let fromChatId: string;
	try {
		fromChatId = normalizeChatId(ctx.getNodeParameter('sourceChat', i));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	return { fromChatId, toChatId: chatId, messageId: getMessageId(ctx, i) };
}

function buildEditBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
): IDataObject {
	return {
		chatId,
		messageId: getMessageId(ctx, i),
		body: getText(ctx, i),
		...getMentions(ctx, i, options),
	};
}

function buildDeleteBody(ctx: IExecuteFunctions, i: number, chatId: string): IDataObject {
	return {
		chatId,
		messageId: getMessageId(ctx, i),
		forEveryone: ctx.getNodeParameter('forEveryone', i, true) as boolean,
	};
}

function buildLocationBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
): IDataObject {
	let latitude: number;
	let longitude: number;
	try {
		latitude = parseCoordinate(ctx.getNodeParameter('latitude', i), 'latitude');
		longitude = parseCoordinate(ctx.getNodeParameter('longitude', i), 'longitude');
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	const body: IDataObject = { chatId, latitude, longitude };
	const name = String(options.locationName ?? '').trim();
	const address = String(options.address ?? '').trim();
	if (name) body.description = name;
	if (address) body.address = address;
	return body;
}

function buildPollBody(ctx: IExecuteFunctions, i: number, chatId: string): IDataObject {
	const name = String(ctx.getNodeParameter('pollQuestion', i) ?? '').trim();
	if (!name)
		throw new NodeOperationError(ctx.getNode(), 'Poll Question is required', { itemIndex: i });
	let options: string[];
	try {
		options = parsePollOptions(ctx.getNodeParameter('pollOptions', i, []), { min: 2, max: 12 });
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	return {
		chatId,
		name,
		options,
		allowMultipleAnswers: ctx.getNodeParameter('allowMultipleAnswers', i, false) as boolean,
	};
}

function buildVotePollBody(ctx: IExecuteFunctions, i: number, chatId: string): IDataObject {
	let options: string[];
	try {
		options = parsePollOptions(ctx.getNodeParameter('selectedOptions', i, []), { min: 0, max: 12 });
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	return { chatId, pollMessageId: getMessageId(ctx, i), options };
}

function buildTemplateBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
): IDataObject {
	const rows = ctx.getNodeParameter('templateVariables.values', i, []) as Array<{
		name?: string;
		value?: string;
	}>;
	let vars: Record<string, string>;
	try {
		vars = pairsToObject(rows);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	const body: IDataObject = {
		chatId,
		templateId: getTemplateId(ctx, i),
		...getMentions(ctx, i, options),
	};
	if (Object.keys(vars).length > 0) body.vars = vars;
	if (options.linkPreview !== undefined) body.linkPreview = options.linkPreview;
	return body;
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

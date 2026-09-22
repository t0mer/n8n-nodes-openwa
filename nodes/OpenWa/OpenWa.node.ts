import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import { recipientFields, sessionField } from './descriptions/common';
import { CAPTION_OPERATIONS, MEDIA_ENDPOINTS, mediaFields } from './descriptions/media';
import { textFields, textOptions } from './descriptions/text';
import { chatIdUser, normalizeContactId, parseMentions, validateGroupId } from './helpers/chatId';
import { buildMediaBody, type MediaInput } from './helpers/media';
import { searchGroups, searchSessions } from './methods/listSearch';
import { openWaApiRequest } from './transport/request';

export class OpenWa implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenWA',
		name: 'openWa',
		icon: { light: 'file:openwa.svg', dark: 'file:openwa.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages through a self-hosted OpenWA gateway',
		defaults: {
			name: 'OpenWA',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openWaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Message', value: 'message' }],
				default: 'message',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Send Audio',
						value: 'sendAudio',
						action: 'Send an audio file',
						description: 'Send an audio file to a contact or group',
					},
					{
						name: 'Send Document',
						value: 'sendDocument',
						action: 'Send a document',
						description: 'Send a document to a contact or group',
					},
					{
						name: 'Send Image',
						value: 'sendImage',
						action: 'Send an image',
						description: 'Send an image to a contact or group',
					},
					{
						name: 'Send Sticker',
						value: 'sendSticker',
						action: 'Send a sticker',
						description: 'Send a sticker to a contact or group',
					},
					{
						name: 'Send Text',
						value: 'sendText',
						action: 'Send a text message',
						description: 'Send a text message to a contact or group',
					},
					{
						name: 'Send Video',
						value: 'sendVideo',
						action: 'Send a video',
						description: 'Send a video to a contact or group',
					},
				],
				default: 'sendText',
			},
			sessionField,
			...recipientFields,
			...textFields,
			...mediaFields,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						displayName: 'Check Number Exists',
						name: 'checkNumberExists',
						type: 'boolean',
						default: false,
						displayOptions: { show: { '/recipientType': ['contact'] } },
						description:
							'Whether to verify the number is registered on WhatsApp before sending. OpenWA accepts sends to unregistered numbers without an error, so this is the only way to catch them.',
					},
					...textOptions,
				],
			},
		],
	};

	methods = {
		listSearch: {
			searchSessions,
			searchGroups,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const sessionId = String(
					this.getNodeParameter('session', i, '', { extractValue: true }) ?? '',
				).trim();
				if (!sessionId) {
					throw new NodeOperationError(this.getNode(), 'Session is required', { itemIndex: i });
				}

				const chatId = getChatId(this, i);
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				if (options.checkNumberExists && this.getNodeParameter('recipientType', i) === 'contact') {
					await assertNumberExists(this, i, sessionId, chatId);
				}

				let endpoint: string;
				let body: IDataObject;
				if (operation === 'sendText') {
					endpoint = 'send-text';
					body = buildTextBody(this, i, chatId, options);
				} else if (MEDIA_ENDPOINTS[operation]) {
					endpoint = MEDIA_ENDPOINTS[operation];
					body = await buildMediaRequestBody(this, i, operation, chatId);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, {
						itemIndex: i,
					});
				}

				const response = (await openWaApiRequest.call(
					this,
					'POST',
					`/api/sessions/${encodeURIComponent(sessionId)}/messages/${endpoint}`,
					{ body, sessionId, itemIndex: i },
				)) as IDataObject;

				returnData.push({ json: response, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeApiError) {
					// Already mapped by the request helper; re-wrapping returns the same error.
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
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
	if (chatId.endsWith('@lid')) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Check Number Exists needs a phone number, not an @lid ID',
			{
				itemIndex: i,
				description: 'Enter the phone number instead, or turn off "Check Number Exists".',
			},
		);
	}
	const number = chatIdUser(chatId);
	const result = (await openWaApiRequest.call(
		ctx,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/contacts/check/${encodeURIComponent(number)}`,
		{ sessionId, itemIndex: i },
	)) as { exists?: boolean };
	if (!result.exists) {
		throw new NodeOperationError(ctx.getNode(), `The number ${number} is not on WhatsApp`, {
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

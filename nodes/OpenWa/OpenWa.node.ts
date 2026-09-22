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
import { textFields, textOptions } from './descriptions/text';
import { normalizeContactId, parseMentions } from './helpers/chatId';
import { searchSessions } from './methods/listSearch';
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
						name: 'Send Text',
						value: 'sendText',
						action: 'Send a text message',
						description: 'Send a text message to a contact or group',
					},
				],
				default: 'sendText',
			},
			sessionField,
			...recipientFields,
			...textFields,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['message'] } },
				options: [...textOptions],
			},
		],
	};

	methods = {
		listSearch: {
			searchSessions,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const sessionId = (
					this.getNodeParameter('session', i, '', { extractValue: true }) as string
				).trim();
				if (!sessionId) {
					throw new NodeOperationError(this.getNode(), 'Session is required', { itemIndex: i });
				}

				const chatId = getChatId(this, i);
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				let endpoint: string;
				let body: IDataObject;
				switch (operation) {
					case 'sendText':
						endpoint = 'send-text';
						body = buildTextBody(this, i, chatId, options);
						break;
					default:
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
		return normalizeContactId(ctx.getNodeParameter('phoneNumber', i) as string);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}

function buildTextBody(
	ctx: IExecuteFunctions,
	i: number,
	chatId: string,
	options: IDataObject,
): IDataObject {
	const body: IDataObject = { chatId, text: ctx.getNodeParameter('text', i) as string };
	if (options.linkPreview !== undefined) body.linkPreview = options.linkPreview;
	if (options.mentions) {
		try {
			body.mentions = parseMentions(options.mentions as string);
		} catch (error) {
			throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
		}
	}
	return body;
}

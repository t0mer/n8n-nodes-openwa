import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import { recipientFields, sessionField } from './descriptions/common';
import { executeContact } from './actions/contact';
import { executeMessage } from './actions/message';
import { contactFields, contactOperations } from './descriptions/contact';
import { mediaFields } from './descriptions/media';
import { textFields, textOptions } from './descriptions/text';
import { searchContacts, searchGroups, searchSessions } from './methods/listSearch';

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
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Message', value: 'message' },
				],
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
			contactOperations,
			sessionField,
			...contactFields,
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
			searchContacts,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const sessionId = String(
					this.getNodeParameter('session', i, '', { extractValue: true }) ?? '',
				).trim();
				if (!sessionId) {
					throw new NodeOperationError(this.getNode(), 'Session is required', { itemIndex: i });
				}

				const resource = this.getNodeParameter('resource', i) as string;
				const response =
					resource === 'contact'
						? await executeContact(this, i, sessionId)
						: await executeMessage(this, i, sessionId);

				for (const json of Array.isArray(response) ? response : [response]) {
					returnData.push({ json, pairedItem: { item: i } });
				}
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

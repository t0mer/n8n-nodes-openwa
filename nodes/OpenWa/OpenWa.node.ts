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
import { isSessionless, recipientFields, sessionFields } from './descriptions/common';
import { executeApiKey } from './actions/apiKey';
import { sendBulk } from './actions/bulk';
import { executeCall } from './actions/call';
import { executeCatalog } from './actions/catalog';
import { executeChannel } from './actions/channel';
import { executeChat } from './actions/chat';
import { executeContact } from './actions/contact';
import { executeGroup } from './actions/group';
import { executeLabel } from './actions/label';
import { executeMediaTools } from './actions/mediaTools';
import { executeMessage } from './actions/message';
import { executeProfile } from './actions/profile';
import { executeSession } from './actions/session';
import { executeStatus } from './actions/status';
import { executeTemplate } from './actions/template';
import { executeWebhook } from './actions/webhook';
import { messageActionFields } from './descriptions/actions';
import { apiKeyFields, apiKeyOperations } from './descriptions/apiKey';
import { bulkFields } from './descriptions/bulk';
import { callFields, callOperations } from './descriptions/call';
import { catalogFields, catalogOperations } from './descriptions/catalog';
import { channelFields, channelOperations } from './descriptions/channel';
import { chatFields, chatOperations } from './descriptions/chat';
import { contactFields, contactOperations } from './descriptions/contact';
import { contactCardFields } from './descriptions/contactCard';
import { groupFields, groupOperations } from './descriptions/group';
import { historyFields } from './descriptions/history';
import { labelFields, labelOperations } from './descriptions/label';
import { locationFields } from './descriptions/location';
import { mediaFields } from './descriptions/media';
import { mediaToolsFields, mediaToolsOperations } from './descriptions/mediaTools';
import { pollFields } from './descriptions/poll';
import { productMessageFields } from './descriptions/product';
import { profileFields, profileOperations } from './descriptions/profile';
import { sessionOperations, sessionResourceFields } from './descriptions/session';
import { statusFields, statusOperations } from './descriptions/status';
import { messageOperations, messageOptions } from './descriptions/message';
import { sendTemplateFields, templateFields, templateOperations } from './descriptions/template';
import { textFields } from './descriptions/text';
import { webhookFields, webhookOperations } from './descriptions/webhook';
import {
	searchApiKeys,
	searchChannels,
	searchContacts,
	searchGroups,
	searchLabels,
	searchSessions,
	searchTemplates,
	searchWebhooks,
} from './methods/listSearch';

type Executor = (
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
) => Promise<IDataObject | IDataObject[] | INodeExecutionData>;

/** A finished item (e.g. with binary data), as opposed to a plain JSON response. */
function isExecutionData(value: unknown): value is INodeExecutionData {
	const item = value as Partial<INodeExecutionData> | undefined;
	return typeof item?.json === 'object' && typeof item?.binary === 'object';
}

const EXECUTORS: Record<string, Executor> = {
	apiKey: executeApiKey,
	call: executeCall,
	catalog: executeCatalog,
	channel: executeChannel,
	chat: executeChat,
	contact: executeContact,
	group: executeGroup,
	label: executeLabel,
	media: executeMediaTools,
	message: executeMessage,
	profile: executeProfile,
	session: executeSession,
	status: executeStatus,
	template: executeTemplate,
	webhook: executeWebhook,
};

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
					{ name: 'API Key', value: 'apiKey' },
					{ name: 'Call', value: 'call' },
					{ name: 'Catalog', value: 'catalog' },
					{ name: 'Channel', value: 'channel' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Group', value: 'group' },
					{ name: 'Label', value: 'label' },
					{ name: 'Media', value: 'media' },
					{ name: 'Message', value: 'message' },
					{ name: 'Profile', value: 'profile' },
					{ name: 'Session', value: 'session' },
					{ name: 'Status', value: 'status' },
					{ name: 'Template', value: 'template' },
					{ name: 'Webhook', value: 'webhook' },
				],
				default: 'message',
			},
			messageOperations,
			apiKeyOperations,
			callOperations,
			catalogOperations,
			channelOperations,
			chatOperations,
			contactOperations,
			templateOperations,
			groupOperations,
			labelOperations,
			mediaToolsOperations,
			profileOperations,
			sessionOperations,
			statusOperations,
			webhookOperations,
			...sessionFields(),
			...apiKeyFields,
			...callFields,
			...catalogFields,
			...channelFields,
			...chatFields,
			...contactFields,
			...templateFields,
			...groupFields,
			...labelFields,
			...mediaToolsFields,
			...profileFields,
			...sessionResourceFields,
			...statusFields,
			...webhookFields,
			...recipientFields,
			...messageActionFields,
			...textFields,
			...mediaFields,
			...locationFields,
			...pollFields,
			...contactCardFields,
			...productMessageFields,
			...bulkFields,
			...historyFields,
			...sendTemplateFields,
			messageOptions,
		],
	};

	methods = {
		listSearch: {
			searchSessions,
			searchGroups,
			searchContacts,
			searchTemplates,
			searchLabels,
			searchChannels,
			searchWebhooks,
			searchApiKeys,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		// Send Bulk turns all input items into batches instead of sending one request per item.
		if (
			items.length > 0 &&
			this.getNodeParameter('resource', 0) === 'message' &&
			this.getNodeParameter('operation', 0) === 'sendBulk'
		) {
			return [await sendBulk(this, items.length)];
		}
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let sessionId = '';
				if (!isSessionless(resource, operation)) {
					sessionId = String(
						this.getNodeParameter('session', i, '', { extractValue: true }) ?? '',
					).trim();
					if (!sessionId) {
						throw new NodeOperationError(this.getNode(), 'Session is required', { itemIndex: i });
					}
				}

				const executor = EXECUTORS[resource];
				if (!executor) {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`, {
						itemIndex: i,
					});
				}
				const response = await executor(this, i, sessionId);

				if (isExecutionData(response)) {
					returnData.push({ ...response, pairedItem: { item: i } });
				} else {
					for (const json of Array.isArray(response) ? response : [response]) {
						returnData.push({ json, pairedItem: { item: i } });
					}
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

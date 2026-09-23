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
import { executeContact } from './actions/contact';
import { executeGroup } from './actions/group';
import { executeMessage } from './actions/message';
import { executeProfile } from './actions/profile';
import { executeStatus } from './actions/status';
import { executeTemplate } from './actions/template';
import { messageActionFields } from './descriptions/actions';
import { contactFields, contactOperations } from './descriptions/contact';
import { contactCardFields } from './descriptions/contactCard';
import { groupFields, groupOperations } from './descriptions/group';
import { historyFields } from './descriptions/history';
import { locationFields } from './descriptions/location';
import { mediaFields } from './descriptions/media';
import { pollFields } from './descriptions/poll';
import { profileFields, profileOperations } from './descriptions/profile';
import { statusFields, statusOperations } from './descriptions/status';
import { messageOperations, messageOptions } from './descriptions/message';
import { sendTemplateFields, templateFields, templateOperations } from './descriptions/template';
import { textFields } from './descriptions/text';
import {
	searchContacts,
	searchGroups,
	searchSessions,
	searchTemplates,
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
	contact: executeContact,
	group: executeGroup,
	message: executeMessage,
	profile: executeProfile,
	status: executeStatus,
	template: executeTemplate,
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
					{ name: 'Contact', value: 'contact' },
					{ name: 'Group', value: 'group' },
					{ name: 'Message', value: 'message' },
					{ name: 'Profile', value: 'profile' },
					{ name: 'Status', value: 'status' },
					{ name: 'Template', value: 'template' },
				],
				default: 'message',
			},
			messageOperations,
			contactOperations,
			templateOperations,
			groupOperations,
			profileOperations,
			statusOperations,
			sessionField,
			...contactFields,
			...templateFields,
			...groupFields,
			...profileFields,
			...statusFields,
			...recipientFields,
			...messageActionFields,
			...textFields,
			...mediaFields,
			...locationFields,
			...pollFields,
			...contactCardFields,
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

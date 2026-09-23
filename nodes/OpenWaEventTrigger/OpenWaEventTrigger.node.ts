import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { searchSessions } from '../OpenWa/methods/listSearch';
import { TRIGGER_WEBHOOKS, triggerProperties } from '../OpenWa/trigger/description';
import { webhookMethods } from '../OpenWa/trigger/lifecycle';
import { receiveWebhook } from '../OpenWa/trigger/receive';

export class OpenWaEventTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenWA Events Trigger',
		name: 'openWaEventTrigger',
		icon: { light: 'file:../OpenWa/openwa.svg', dark: 'file:../OpenWa/openwa.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ ($parameter["events"] || []).join(", ") }}',
		description: 'Starts the workflow on any OpenWA webhook event',
		defaults: { name: 'OpenWA Events Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openWaApi', required: true }],
		webhooks: TRIGGER_WEBHOOKS,
		properties: triggerProperties('all', ['message.received']),
	};

	methods = { listSearch: { searchSessions } };

	webhookMethods = webhookMethods;

	webhook = receiveWebhook;
}

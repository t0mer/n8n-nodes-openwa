import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { searchSessions } from '../OpenWa/methods/listSearch';
import { TRIGGER_WEBHOOKS, triggerProperties } from '../OpenWa/trigger/description';
import { webhookMethods } from '../OpenWa/trigger/lifecycle';
import { receiveWebhook } from '../OpenWa/trigger/receive';

export class OpenWaMessageTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenWA Message Trigger',
		name: 'openWaMessageTrigger',
		icon: { light: 'file:../OpenWa/openwa.svg', dark: 'file:../OpenWa/openwa.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ ($parameter["events"] || []).join(", ") }}',
		description:
			'Starts the workflow when WhatsApp messages are received, sent, acknowledged, revoked, reacted to or edited',
		defaults: { name: 'OpenWA Message Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openWaApi', required: true }],
		webhooks: TRIGGER_WEBHOOKS,
		properties: triggerProperties('message', ['message.received']),
	};

	methods = { listSearch: { searchSessions } };

	webhookMethods = webhookMethods;

	webhook = receiveWebhook;
}

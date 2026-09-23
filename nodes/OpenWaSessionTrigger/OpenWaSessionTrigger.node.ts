import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { searchSessions } from '../OpenWa/methods/listSearch';
import { TRIGGER_WEBHOOKS, triggerProperties } from '../OpenWa/trigger/description';
import { webhookMethods } from '../OpenWa/trigger/lifecycle';
import { receiveWebhook } from '../OpenWa/trigger/receive';

export class OpenWaSessionTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenWA Session Trigger',
		name: 'openWaSessionTrigger',
		icon: { light: 'file:../OpenWa/openwa.svg', dark: 'file:../OpenWa/openwa.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ ($parameter["events"] || []).join(", ") }}',
		description:
			'Starts the workflow when an OpenWA session changes status, needs a QR scan, disconnects or is restricted',
		defaults: { name: 'OpenWA Session Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openWaApi', required: true }],
		webhooks: TRIGGER_WEBHOOKS,
		properties: triggerProperties('session', ['session.status']),
	};

	methods = { listSearch: { searchSessions } };

	webhookMethods = webhookMethods;

	webhook = receiveWebhook;
}

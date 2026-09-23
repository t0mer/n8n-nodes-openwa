import { NodeConnectionTypes, type INodeProperties, type INodeTypeDescription } from 'n8n-workflow';
import { sessionField } from '../descriptions/common';
import { ALL_EVENTS, ALL_EVENTS_WILDCARD, EVENT_FAMILIES, type EventFamily } from './events';

export interface TriggerConfig {
	/** A single event family, or 'all' for the general trigger. */
	family: EventFamily | 'all';
	displayName: string;
	name: string;
	description: string;
	defaultEvents: string[];
}

const messageFilterOptions: INodeProperties[] = [
	{
		displayName: 'Body Contains',
		name: 'bodyContains',
		type: 'string',
		default: '',
		description: 'Only messages whose text contains this (not case-sensitive)',
	},
	{
		displayName: 'Chat Type',
		name: 'chatType',
		type: 'options',
		options: [
			{ name: 'Any', value: 'any' },
			{ name: 'Direct Chats Only', value: 'direct' },
			{ name: 'Groups Only', value: 'group' },
		],
		default: 'any',
	},
	{
		displayName: 'Ignore Messages From Me',
		name: 'ignoreFromMe',
		type: 'boolean',
		default: false,
		description: 'Whether to skip messages sent by the session account itself',
	},
	{
		displayName: 'Only From',
		name: 'onlyFrom',
		type: 'string',
		default: '',
		placeholder: 'e.g. 972501234567, 972509876543',
		description: 'Comma-separated phone numbers or contact IDs; only their messages trigger',
	},
	{
		displayName: 'Only In Chats',
		name: 'onlyInChat',
		type: 'string',
		default: '',
		placeholder: 'e.g. 120363012345678901@g.us',
		description: 'Comma-separated chats (phone numbers, contact IDs or group IDs ending in @g.us)',
	},
];

/** Build the description shared by the OpenWA trigger nodes. */
export function triggerDescription(config: TriggerConfig): INodeTypeDescription {
	const events = config.family === 'all' ? ALL_EVENTS : EVENT_FAMILIES[config.family];
	const eventOptions = [...events]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(({ name, value, description }) => ({ name, value, description }));
	if (config.family === 'all') {
		eventOptions.unshift({
			name: 'All Events',
			value: ALL_EVENTS_WILDCARD,
			description: 'Every event, including ones added to the gateway later',
		});
	}
	const hasMessageEvents = config.family === 'message' || config.family === 'all';
	const eventsField: INodeProperties = {
		displayName: 'Events',
		name: 'events',
		type: 'multiOptions',
		options: eventOptions,
		default: [],
		required: true,
		description: 'The events that start the workflow',
	};
	// Each trigger preselects its most common events.
	eventsField.default = config.defaultEvents;

	return {
		displayName: config.displayName,
		name: config.name,
		icon: { light: 'file:../OpenWa/openwa.svg', dark: 'file:../OpenWa/openwa.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ ($parameter["events"] || []).join(", ") }}',
		description: config.description,
		defaults: { name: config.displayName },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openWaApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				displayName:
					'The OpenWA gateway must be able to reach this n8n webhook URL. It refuses private and local addresses unless they are listed in its SSRF_ALLOWED_HOSTS setting.',
				name: 'reachabilityNotice',
				type: 'notice',
				default: '',
			},
			{
				...sessionField,
				default: { mode: 'list', value: '' },
				description: 'The OpenWA session to listen to',
			},
			eventsField,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					...(hasMessageEvents ? messageFilterOptions : []),
					{
						displayName: 'Ignore Duplicate Deliveries',
						name: 'ignoreDuplicates',
						type: 'boolean',
						default: true,
						description:
							'Whether to skip deliveries already received (same idempotency key). OpenWA delivers at least once, so retries can repeat an event.',
					},
					{
						displayName: 'Retry Count',
						name: 'retryCount',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 5 },
						default: 3,
						description:
							'How many times OpenWA attempts each delivery (0 and 1 mean a single attempt)',
					},
					{
						displayName: 'Verify Signature',
						name: 'verifySignature',
						type: 'boolean',
						default: true,
						description:
							'Whether to reject deliveries whose X-OpenWA-Signature does not match the secret registered with the webhook',
					},
				],
			},
		],
	};
}

import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';
import { ALL_EVENTS, ALL_EVENTS_WILDCARD } from '../trigger/events';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['webhook'], operation },
});

export const webhookOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['webhook'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create a webhook',
			description: 'Register a URL that receives the session events',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a webhook',
			description: 'Remove a webhook from the session',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a webhook',
			description: 'Get a single webhook',
		},
		{
			name: 'Get Delivery Failures',
			value: 'getDeliveryFailures',
			action: 'Get webhook delivery failures',
			description: 'List events whose delivery failed after every retry',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many webhooks',
			description: 'List the webhooks of the session',
		},
		{
			name: 'Get Many (All Sessions)',
			value: 'getAllSessions',
			action: 'Get many webhooks across sessions',
			description: 'List the webhooks of every session the API key can see',
		},
		{
			name: 'Test',
			value: 'test',
			action: 'Test a webhook',
			description: 'Send a test payload to the webhook URL',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update a webhook',
			description: 'Change the URL, events, secret, headers, filters or state of a webhook',
		},
	],
	default: 'getAll',
};

/** Every event the gateway emits, plus the wildcard. */
const eventOptions = [
	{
		name: 'All Events',
		value: ALL_EVENTS_WILDCARD,
		description: 'Every event, including ones added to the gateway later',
	},
	...[...ALL_EVENTS].sort((a, b) => a.name.localeCompare(b.name)),
];

const eventsField: INodeProperties = {
	displayName: 'Events',
	name: 'webhookEvents',
	type: 'multiOptions',
	options: eventOptions,
	default: [],
	description: 'The events to deliver to the URL',
};

const secretField: INodeProperties = {
	displayName: 'Secret',
	name: 'secret',
	type: 'string',
	typeOptions: { password: true },
	default: '',
	description:
		'Signs every delivery with an X-OpenWA-Signature header (HMAC-SHA256 of the body). 16–255 characters. The gateway never returns it.',
};

const headersField: INodeProperties = {
	displayName: 'Headers',
	name: 'headers',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	placeholder: 'Add Header',
	options: [
		{
			displayName: 'Header',
			name: 'header',
			values: [
				{ displayName: 'Name', name: 'name', type: 'string', default: '' },
				{ displayName: 'Value', name: 'value', type: 'string', default: '' },
			],
		},
	],
};

const filtersField: INodeProperties = {
	displayName: 'Filters (JSON)',
	name: 'webhookFilters',
	type: 'json',
	default: '',
	placeholder: '{"conditions": [{"field": "body", "operator": "contains", "value": "invoice"}]}',
	description:
		'Deliver only events matching every condition: {"conditions": [...]} or a bare array of 1–20 {field, operator (is, isNot, contains, equals), value, caseSensitive} objects',
};

const retryCountField: INodeProperties = {
	displayName: 'Retry Count',
	name: 'retryCount',
	type: 'number',
	typeOptions: { minValue: 0, maxValue: 5 },
	default: 3,
	description:
		'Total delivery attempts per event, including the first (0 and 1 both mean a single attempt)',
};

export const webhookFields: INodeProperties[] = [
	{
		displayName: 'Webhook',
		name: 'webhook',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor(['delete', 'get', 'test', 'update']),
		description:
			"A webhook of the session. Don't change or delete the ones OpenWA triggers registered; the triggers manage those.",
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchWebhooks', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 7c9e6679-7425-40de-944b-e07fc1f90ae7',
			},
		],
	},
	{
		displayName: 'URL',
		name: 'webhookUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/webhook',
		displayOptions: showFor(['create']),
		description: 'The URL that receives the events. The gateway must be able to reach it.',
	},
	{ ...eventsField, required: true, displayOptions: showFor(['create']) },
	{
		displayName: 'Options',
		name: 'webhookOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(['create']),
		options: [filtersField, headersField, retryCountField, secretField],
	},
	{
		displayName: 'Update Fields',
		name: 'webhookUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			{
				displayName: 'Active',
				name: 'active',
				type: 'boolean',
				default: true,
				description: 'Whether the webhook receives events',
			},
			{
				displayName: 'Clear Filters',
				name: 'clearFilters',
				type: 'boolean',
				default: false,
				description: 'Whether to remove the filters, so every subscribed event is delivered',
			},
			{
				displayName: 'Clear Secret',
				name: 'clearSecret',
				type: 'boolean',
				default: false,
				description: 'Whether to remove the secret, so deliveries are no longer signed',
			},
			eventsField,
			filtersField,
			{
				...headersField,
				description: 'Replaces all stored headers. Add the field with no headers to remove them.',
			},
			retryCountField,
			secretField,
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/webhook',
			},
		],
	},
	{
		displayName: 'Session ID',
		name: 'webhookSessionId',
		type: 'string',
		default: '',
		displayOptions: showFor(['getDeliveryFailures']),
		description:
			'Only failures of this session. Leave empty for every session the API key can see.',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showFor(['getAll', 'getAllSessions', 'getDeliveryFailures']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['getAll', 'getAllSessions', 'getDeliveryFailures'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
];

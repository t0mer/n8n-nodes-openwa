import type { INodeProperties } from 'n8n-workflow';

const showForGetAll = { show: { resource: ['message'], operation: ['getAll'] } };

export const historyFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showForGetAll,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['message'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showForGetAll,
		options: [
			{
				displayName: 'Chat',
				name: 'chat',
				type: 'string',
				default: '',
				placeholder: 'e.g. 972501234567 or 120363012345678901@g.us',
				description: 'Only messages in this chat: a phone number, a contact ID or a group ID',
			},
			{
				displayName: 'Include Media',
				name: 'includeMedia',
				type: 'boolean',
				default: false,
				description:
					'Whether to include inline media payloads (base64) in the results. Off keeps the output small; use Download Media for files.',
			},
			{
				displayName: 'Sender',
				name: 'sender',
				type: 'string',
				default: '',
				placeholder: 'e.g. 972501234567',
				description:
					'Only messages from this sender: a phone number or a contact ID. A phone number also matches their messages in groups.',
			},
		],
	},
	{
		displayName: 'Limit',
		name: 'historyLimit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 2000 },
		default: 50,
		displayOptions: {
			show: { resource: ['message'], operation: ['getHistory'], deep: [false] },
		},
		description: 'Max number of messages to return. Up to 100, or up to 2000 with Deep turned on.',
	},
	{
		displayName: 'Deep',
		name: 'deep',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['getHistory'] } },
		description:
			'Whether to load older messages from WhatsApp to reach further back (up to 2000; slower, whatsapp-web.js engine only)',
	},
	{
		displayName: 'Include Media',
		name: 'includeMedia',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['getHistory'] } },
		description: 'Whether to download media (base64) for messages that have it. Slower.',
	},
];

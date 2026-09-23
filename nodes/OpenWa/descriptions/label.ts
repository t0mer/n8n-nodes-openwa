import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['label'], operation },
});

/** WhatsApp's label colours are indexes 0–19; the gateway doesn't expose their hex values. */
const COLOR_OPTIONS = Array.from({ length: 20 }, (_, index) => ({
	name: `Color ${index}`,
	value: index,
}));

export const labelOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['label'] } },
	options: [
		{
			name: 'Add to Chat',
			value: 'addToChat',
			action: 'Add a label to a chat',
			description: 'Put a label on a chat',
		},
		{
			name: 'Create or Update',
			value: 'upsert',
			action: 'Create or update a label',
			description: 'Create a new record, or update the current one if it already exists (upsert)',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a label',
			description: 'Delete a label; it disappears from every chat (Baileys engine only)',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a label',
			description: 'Get a single label',
		},
		{
			name: 'Get Chat Labels',
			value: 'getChatLabels',
			action: 'Get the labels of a chat',
			description: 'List the labels on a chat',
		},
		{
			name: 'Get Chats',
			value: 'getChats',
			action: 'Get the chats with a label',
			description: 'List every chat carrying a label (whatsapp-web.js engine only)',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many labels',
			description: 'List the labels of the session (empty on a personal, non-Business account)',
		},
		{
			name: 'Remove From Chat',
			value: 'removeFromChat',
			action: 'Remove a label from a chat',
			description: 'Take a label off a chat',
		},
	],
	default: 'getAll',
};

export const labelFields: INodeProperties[] = [
	{
		displayName: 'Label',
		name: 'label',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor(['addToChat', 'delete', 'get', 'getChats', 'removeFromChat']),
		description:
			'A WhatsApp Business label. The list needs an engine that can read labels (whatsapp-web.js); on Baileys, enter the ID.',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchLabels', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 1',
			},
		],
	},
	{
		displayName: 'Chat',
		name: 'chatId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567 or 120363012345678901@g.us',
		displayOptions: showFor(['addToChat', 'getChatLabels', 'removeFromChat']),
		description:
			'A phone number, a contact ID (@c.us / @lid) or a group ID (@g.us). If an operation fails for a phone number, use the chat ID from Chat → Get Many (often …@lid).',
	},
	{
		displayName: 'Label ID',
		name: 'labelId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 12',
		displayOptions: showFor(['upsert']),
		description:
			'Use an unused ID to create a label. An existing ID replaces that label without warning. Baileys engine only.',
	},
	{
		displayName: 'Name',
		name: 'labelName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. VIP customer',
		displayOptions: showFor(['upsert']),
		description: 'Label name, up to 100 characters',
	},
	{
		displayName: 'Color',
		name: 'labelColor',
		type: 'options',
		options: COLOR_OPTIONS,
		default: 0,
		displayOptions: showFor(['upsert']),
		description:
			"WhatsApp's colour index (0–19). The write replaces the whole label, so the colour is always sent.",
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showFor(['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['label'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

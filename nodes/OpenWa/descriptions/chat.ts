import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['chat'], operation },
});

/** Chat operations that act on one chat. */
export const CHAT_OPERATIONS: string[] = [];

export const chatOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['chat'] } },
	options: [
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many chats',
			description: 'List the chats of the session, one item per chat',
		},
	],
	default: 'getAll',
};

export const chatFields: INodeProperties[] = [
	{
		displayName: 'Chat',
		name: 'chatId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567 or 120363012345678901@g.us',
		displayOptions: showFor(CHAT_OPERATIONS),
		description: 'A phone number, a contact ID (@c.us / @lid) or a group ID (@g.us)',
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
		displayOptions: { show: { resource: ['chat'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

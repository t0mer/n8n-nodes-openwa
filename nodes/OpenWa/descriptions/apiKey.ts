import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['apiKey'], operation },
});

export const apiKeyOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['apiKey'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create an API key',
			description:
				'Create an API key. The full key is in the output only this once; store it right away. Needs an admin key.',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete an API key',
			description: 'Permanently delete an API key. Needs an admin key.',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get an API key',
			description: 'Get a single API key (without the key itself). Needs an admin key.',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many API keys',
			description: 'List the API keys (without the keys themselves). Needs an admin key.',
		},
		{
			name: 'Revoke',
			value: 'revoke',
			action: 'Revoke an API key',
			description: 'Deactivate an API key but keep its record. Needs an admin key.',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update an API key',
			description:
				'Change the name, role, allowed IPs, sessions or chats, or expiry of an API key. Needs an admin key.',
		},
		{
			name: 'Validate',
			value: 'validate',
			action: 'Validate the API key',
			description: "Check whether this node's credential API key is valid, and get its role",
		},
	],
	default: 'getAll',
};

const roleField: INodeProperties = {
	displayName: 'Role',
	name: 'role',
	type: 'options',
	options: [
		{ name: 'Admin', value: 'admin', description: 'Everything, including managing API keys' },
		{ name: 'Operator', value: 'operator', description: 'Read and write, e.g. send messages' },
		{ name: 'Viewer', value: 'viewer', description: 'Read only' },
	],
	default: 'operator',
};

const listFields: INodeProperties[] = [
	{
		displayName: 'Allowed Chats',
		name: 'allowedChats',
		type: 'string',
		default: '',
		placeholder: 'e.g. 120363000000000000@g.us, 972501234567',
		description:
			'Comma-separated chats the key may read and send to: a group (@g.us), a contact (@c.us or @lid) or a bare phone number. Empty means every chat.',
	},
	{
		displayName: 'Allowed IPs',
		name: 'allowedIps',
		type: 'string',
		default: '',
		placeholder: 'e.g. 192.168.1.1, 10.0.0.0/8',
		description:
			'Comma-separated IP addresses or CIDR ranges the key may be used from. Empty means any IP.',
	},
	{
		displayName: 'Allowed Sessions',
		name: 'allowedSessions',
		type: 'string',
		default: '',
		placeholder: 'e.g. 0a941dac-a965-45e7-b318-74ae8be134f0',
		description:
			'Comma-separated session IDs (the UUIDs, not session names; a name never matches) the key may act on. Empty means every session.',
	},
];

const expiresAtField: INodeProperties = {
	displayName: 'Expires At',
	name: 'expiresAt',
	type: 'dateTime',
	default: '',
	description:
		'When the key stops working, in the workflow timezone unless the value has an offset',
};

export const apiKeyFields: INodeProperties[] = [
	{
		displayName: 'API Key',
		name: 'apiKeyId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor(['delete', 'get', 'revoke', 'update']),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchApiKeys', searchable: true },
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
		displayName: 'Name',
		name: 'keyName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Production Bot',
		displayOptions: showFor(['create']),
	},
	{ ...roleField, name: 'apiKeyRole', displayOptions: showFor(['create']) },
	{
		displayName: 'Options',
		name: 'apiKeyOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(['create']),
		options: [...listFields, expiresAtField],
	},
	{
		displayName: 'Update Fields',
		name: 'apiKeyUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			...listFields.map((field) => ({
				...field,
				description: `${field.description} Add the field and leave it empty to remove the restriction.`,
			})),
			expiresAtField,
			{ displayName: 'Name', name: 'name', type: 'string', default: '' },
			roleField,
		],
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
		displayOptions: {
			show: { resource: ['apiKey'], operation: ['getAll'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
];

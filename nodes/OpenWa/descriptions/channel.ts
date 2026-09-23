import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['channel'], operation },
});

export const channelOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['channel'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create a channel',
			description: 'Create a channel owned by the session account',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a channel',
			description:
				'Permanently delete a channel the session account owns; every subscriber loses it. Cannot be undone.',
		},
		{
			name: 'Demote Admin',
			value: 'demoteAdmin',
			action: 'Demote a channel admin',
			description: 'Turn a channel admin back into a subscriber (owner only; Baileys engine only)',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a channel',
			description: 'Get a single channel',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many channels',
			description: 'List the subscribed channels (whatsapp-web.js engine only)',
		},
		{
			name: 'Get Messages',
			value: 'getMessages',
			action: 'Get the messages of a channel',
			description: 'List recent posts of a subscribed channel (whatsapp-web.js engine only)',
		},
		{
			name: 'Mute',
			value: 'mute',
			action: 'Mute a channel',
			description: "Silence a channel's notifications; the subscription is kept",
		},
		{
			name: 'Subscribe',
			value: 'subscribe',
			action: 'Subscribe to a channel',
			description: 'Follow a channel by its invite link or code (Baileys engine only)',
		},
		{
			name: 'Transfer Ownership',
			value: 'transferOwnership',
			action: 'Transfer ownership of a channel',
			description:
				'Make another account the channel owner (owner only; Baileys engine only). Cannot be undone.',
		},
		{
			name: 'Unmute',
			value: 'unmute',
			action: 'Unmute a channel',
			description: "Turn a channel's notifications back on",
		},
		{
			name: 'Unsubscribe',
			value: 'unsubscribe',
			action: 'Unsubscribe from a channel',
			description: 'Stop following a channel (the channel itself is not deleted)',
		},
	],
	default: 'getAll',
};

export const channelFields: INodeProperties[] = [
	{
		displayName: 'Channel',
		name: 'channel',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor([
			'delete',
			'demoteAdmin',
			'get',
			'getMessages',
			'mute',
			'transferOwnership',
			'unmute',
			'unsubscribe',
		]),
		description:
			'A WhatsApp channel. The list needs an engine that can list channels (whatsapp-web.js); on Baileys, enter the ID.',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchChannels', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 120363012345678901@newsletter',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[^@\\s]+@newsletter$',
							errorMessage: 'Channel ID must end with @newsletter',
						},
					},
				],
			},
		],
	},
	{
		displayName: 'Name',
		name: 'channelName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Product updates',
		displayOptions: showFor(['create']),
		description: 'Channel name, up to 100 characters',
	},
	{
		displayName: 'Description',
		name: 'channelDescription',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: showFor(['create']),
		description: 'Optional channel description',
	},
	{
		displayName: 'Invite Link',
		name: 'channelInviteCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://whatsapp.com/channel/0029VaAbCdEf123456',
		displayOptions: showFor(['subscribe']),
		description: 'A channel invite link, or just the code at the end of it',
	},
	{
		displayName: 'Admin',
		name: 'channelUserId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: showFor(['demoteAdmin']),
		description: 'The admin to demote: a phone number or a contact ID (@c.us / @lid)',
	},
	{
		displayName: 'New Owner',
		name: 'channelNewOwnerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: showFor(['transferOwnership']),
		description:
			'The account that becomes the owner: a phone number or a contact ID (@c.us / @lid). Irreversible — the session account cannot take the channel back.',
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
		displayOptions: { show: { resource: ['channel'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 50,
		displayOptions: showFor(['getMessages']),
		description: 'Max number of results to return',
	},
];

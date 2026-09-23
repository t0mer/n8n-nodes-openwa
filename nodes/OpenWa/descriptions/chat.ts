import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['chat'], operation },
});

/** Chat operations that act on one chat. */
export const CHAT_OPERATIONS: string[] = [
	'markRead',
	'markUnread',
	'sendChatState',
	'archive',
	'unarchive',
	'pin',
	'unpin',
	'mute',
	'unmute',
	'delete',
	'clearMessages',
];

export const chatOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['chat'] } },
	options: [
		{
			name: 'Archive',
			value: 'archive',
			action: 'Archive a chat',
			description: 'Move a chat to the archive',
		},
		{
			name: 'Clear Messages',
			value: 'clearMessages',
			action: 'Clear all messages in a chat',
			description: 'Delete every message in a chat, keeping the chat. Cannot be undone.',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a chat',
			description:
				'Remove a chat from the chat list (e.g. a group you have left). Cannot be undone.',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many chats',
			description: 'List the chats of the session, one item per chat',
		},
		{
			name: 'Mark as Read',
			value: 'markRead',
			action: 'Mark a chat as read',
			description: 'Mark a chat, or specific messages in it, as read',
		},
		{
			name: 'Mark as Unread',
			value: 'markUnread',
			action: 'Mark a chat as unread',
			description: 'Mark a chat as unread',
		},
		{
			name: 'Mute',
			value: 'mute',
			action: 'Mute a chat',
			description: 'Mute notifications for a chat',
		},
		{
			name: 'Pin',
			value: 'pin',
			action: 'Pin a chat',
			description: 'Pin a chat to the top of the chat list',
		},
		{
			name: 'Send Chat State',
			value: 'sendChatState',
			action: 'Show typing or recording in a chat',
			description: 'Show "typing…" or "recording…" in a chat, or clear it',
		},
		{
			name: 'Unarchive',
			value: 'unarchive',
			action: 'Unarchive a chat',
			description: 'Move a chat out of the archive',
		},
		{
			name: 'Unmute',
			value: 'unmute',
			action: 'Unmute a chat',
			description: 'Turn notifications for a chat back on',
		},
		{
			name: 'Unpin',
			value: 'unpin',
			action: 'Unpin a chat',
			description: 'Unpin a chat',
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
	{
		displayName: 'Message IDs',
		name: 'messageIds',
		type: 'string',
		default: '',
		placeholder: 'e.g. true_972501234567@c.us_3EB0ABCD',
		displayOptions: showFor(['markRead']),
		description:
			'Comma-separated IDs of messages to mark read. Leave empty to mark the chat read. On the Baileys engine, list the messages to acknowledge each one.',
	},
	{
		displayName: 'State',
		name: 'chatState',
		type: 'options',
		options: [
			{ name: 'Typing', value: 'typing' },
			{ name: 'Recording', value: 'recording' },
			{ name: 'Stop', value: 'paused', description: 'Clear the indicator' },
		],
		default: 'typing',
		displayOptions: showFor(['sendChatState']),
	},
	{
		displayName: 'Mute For',
		name: 'muteFor',
		type: 'options',
		options: [
			{ name: '8 Hours', value: '8h' },
			{ name: '1 Week', value: '1w' },
			{ name: 'Until a Date', value: 'until' },
		],
		default: '8h',
		displayOptions: showFor(['mute']),
	},
	{
		displayName: 'Mute Until',
		name: 'muteUntil',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['chat'], operation: ['mute'], muteFor: ['until'] } },
		description: 'When notifications turn back on. Must be in the future.',
	},
];

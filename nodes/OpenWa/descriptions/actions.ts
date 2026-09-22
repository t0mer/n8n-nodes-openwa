import type { INodeProperties } from 'n8n-workflow';

/** Operations that act on an existing message, identified by Message ID. */
export const MESSAGE_ID_OPERATIONS = ['reply', 'react', 'forward', 'edit', 'delete'];

export const messageActionFields: INodeProperties[] = [
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. true_972501234567@c.us_3EB0ABCD',
		displayOptions: { show: { resource: ['message'], operation: MESSAGE_ID_OPERATIONS } },
		description:
			'ID of the existing message, as returned by a send operation (messageId) or a trigger. The chat above must be the chat that contains it.',
	},
	{
		displayName: 'Emoji',
		name: 'emoji',
		type: 'string',
		default: '',
		placeholder: 'e.g. 👍',
		displayOptions: { show: { resource: ['message'], operation: ['react'] } },
		description: 'The emoji to react with. Leave empty to remove your reaction.',
	},
	{
		displayName: 'Source Chat',
		name: 'sourceChat',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567 or 120363012345678901@g.us',
		displayOptions: { show: { resource: ['message'], operation: ['forward'] } },
		description:
			'The chat that contains the message to forward: a phone number, a contact ID (@c.us / @lid) or a group ID (@g.us). The recipient above is where it is forwarded to.',
	},
	{
		displayName: 'Delete for Everyone',
		name: 'forEveryone',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['message'], operation: ['delete'] } },
		description:
			'Whether to delete the message for everyone in the chat. When off, it is deleted only on this account.',
	},
];

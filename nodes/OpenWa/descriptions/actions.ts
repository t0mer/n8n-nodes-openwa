import type { INodeProperties } from 'n8n-workflow';

/** Operations that act on an existing message, identified by Message ID. */
export const MESSAGE_ID_OPERATIONS = ['reply'];

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
];

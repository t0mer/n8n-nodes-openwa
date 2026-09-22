import type { INodeProperties } from 'n8n-workflow';
import { locationOptions } from './location';
import { MEDIA_ENDPOINTS } from './media';
import { textOptions } from './text';

/** Operations that send a new message (these can pre-check the recipient's number). */
export const SEND_OPERATIONS = [
	'sendText',
	...Object.keys(MEDIA_ENDPOINTS),
	'forward',
	'sendLocation',
	'sendPoll',
	'sendTemplate',
	'sendContact',
];

/** Send operations whose request accepts `quotedMessageId` (send-template does not). */
export const QUOTE_OPERATIONS = [
	'sendText',
	...Object.keys(MEDIA_ENDPOINTS),
	'sendLocation',
	'sendPoll',
	'sendContact',
];

export const messageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['message'] } },
	options: [
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a message',
			description: 'Delete a message for everyone or only for this account',
		},
		{
			name: 'Edit',
			value: 'edit',
			action: 'Edit a message',
			description: 'Change the text of a message sent by this account',
		},
		{
			name: 'Forward',
			value: 'forward',
			action: 'Forward a message',
			description: 'Forward a message from one chat to a contact or group',
		},
		{
			name: 'Pin',
			value: 'pin',
			action: 'Pin a message',
			description: 'Pin a message at the top of its chat',
		},
		{
			name: 'React',
			value: 'react',
			action: 'React to a message',
			description: 'Add or remove an emoji reaction on a message',
		},
		{
			name: 'Reply',
			value: 'reply',
			action: 'Reply to a message',
			description: 'Reply to a message with text, quoting it',
		},
		{
			name: 'Send Audio',
			value: 'sendAudio',
			action: 'Send an audio file',
			description: 'Send an audio file to a contact or group',
		},
		{
			name: 'Send Contact Card',
			value: 'sendContact',
			action: 'Send a contact card',
			description: 'Send a contact card (vCard) to a contact or group',
		},
		{
			name: 'Send Document',
			value: 'sendDocument',
			action: 'Send a document',
			description: 'Send a document to a contact or group',
		},
		{
			name: 'Send Image',
			value: 'sendImage',
			action: 'Send an image',
			description: 'Send an image to a contact or group',
		},
		{
			name: 'Send Location',
			value: 'sendLocation',
			action: 'Send a location',
			description: 'Send a location pin to a contact or group',
		},
		{
			name: 'Send Poll',
			value: 'sendPoll',
			action: 'Send a poll',
			description: 'Send a poll to a contact or group',
		},
		{
			name: 'Send Sticker',
			value: 'sendSticker',
			action: 'Send a sticker',
			description: 'Send a sticker to a contact or group',
		},
		{
			name: 'Send Template',
			value: 'sendTemplate',
			action: 'Send a template',
			description: 'Render a stored template with variables and send it to a contact or group',
		},
		{
			name: 'Send Text',
			value: 'sendText',
			action: 'Send a text message',
			description: 'Send a text message to a contact or group',
		},
		{
			name: 'Send Video',
			value: 'sendVideo',
			action: 'Send a video',
			description: 'Send a video to a contact or group',
		},
		{
			name: 'Star',
			value: 'star',
			action: 'Star a message',
			description: 'Star a message (best-effort on some engines)',
		},
		{
			name: 'Unpin',
			value: 'unpin',
			action: 'Unpin a message',
			description: 'Remove a message pin',
		},
		{
			name: 'Unstar',
			value: 'unstar',
			action: 'Unstar a message',
			description: 'Remove the star from a message',
		},
		{
			name: 'Vote Poll',
			value: 'votePoll',
			action: 'Vote on a poll',
			description: 'Cast or withdraw a vote on a poll',
		},
	],
	default: 'sendText',
};

export const messageOptions: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: { show: { resource: ['message'] } },
	options: [
		{
			displayName: 'Check Number Exists',
			name: 'checkNumberExists',
			type: 'boolean',
			default: false,
			displayOptions: { show: { '/operation': SEND_OPERATIONS, '/recipientType': ['contact'] } },
			description:
				'Whether to verify the number is registered on WhatsApp before sending. OpenWA accepts sends to unregistered numbers without an error, so this is the only way to catch them.',
		},
		{
			displayName: 'Reply To Message ID',
			name: 'quotedMessageId',
			type: 'string',
			default: '',
			placeholder: 'e.g. true_972501234567@c.us_3EB0ABCD',
			displayOptions: { show: { '/operation': QUOTE_OPERATIONS } },
			description:
				'ID of a message in the same chat to quote, turning this send into a reply. A message that cannot be found fails the send.',
		},
		...textOptions,
		...locationOptions,
	],
};

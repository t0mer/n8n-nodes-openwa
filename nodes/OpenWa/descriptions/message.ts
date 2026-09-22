import type { INodeProperties } from 'n8n-workflow';
import { MEDIA_ENDPOINTS } from './media';
import { textOptions } from './text';

/** Operations that send a new message (these can pre-check the recipient's number). */
export const SEND_OPERATIONS = ['sendText', ...Object.keys(MEDIA_ENDPOINTS), 'forward'];

export const messageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['message'] } },
	options: [
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
			name: 'Send Sticker',
			value: 'sendSticker',
			action: 'Send a sticker',
			description: 'Send a sticker to a contact or group',
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
		...textOptions,
	],
};

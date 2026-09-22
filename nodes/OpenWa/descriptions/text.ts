import type { INodeProperties } from 'n8n-workflow';

const showForSendText = { show: { resource: ['message'], operation: ['sendText'] } };

export const textFields: INodeProperties[] = [
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showForSendText,
		description: 'The message text (up to 4096 characters)',
	},
];

export const textOptions: INodeProperties[] = [
	{
		displayName: 'Link Preview',
		name: 'linkPreview',
		type: 'boolean',
		default: false,
		displayOptions: { show: { '/operation': ['sendText'] } },
		description:
			'Whether to show a preview for URLs in the text. On whatsapp-web.js previews are on by default and off suppresses them; on Baileys previews are only generated when this is on.',
	},
	{
		displayName: 'Mentions',
		name: 'mentions',
		type: 'string',
		default: '',
		placeholder: 'e.g. 972501234567, 972509876543',
		displayOptions: { show: { '/operation': ['sendText'] } },
		description:
			'Comma-separated phone numbers to @mention. The text must contain a matching @ mention (e.g. @972501234567) for each one.',
	},
];

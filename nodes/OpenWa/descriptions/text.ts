import type { INodeProperties } from 'n8n-workflow';

/** Operations that take the Text field. */
export const TEXT_OPERATIONS = ['sendText', 'reply'];
/** Operations whose request accepts `mentions`. */
export const MENTION_OPERATIONS = ['sendText', 'reply'];
/** Operations whose request accepts `linkPreview`. */
export const LINK_PREVIEW_OPERATIONS = ['sendText'];

export const textFields: INodeProperties[] = [
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: TEXT_OPERATIONS } },
		description: 'The message text (up to 4096 characters)',
	},
];

export const textOptions: INodeProperties[] = [
	{
		displayName: 'Link Preview',
		name: 'linkPreview',
		type: 'boolean',
		default: false,
		displayOptions: { show: { '/operation': LINK_PREVIEW_OPERATIONS } },
		description:
			'Whether to show a preview for URLs in the text. On whatsapp-web.js previews are on by default and off suppresses them; on Baileys previews are only generated when this is on.',
	},
	{
		displayName: 'Mentions',
		name: 'mentions',
		type: 'string',
		default: '',
		placeholder: 'e.g. 972501234567, 972509876543',
		displayOptions: { show: { '/operation': MENTION_OPERATIONS } },
		description:
			'Comma-separated phone numbers to @mention. The text must contain a matching @ mention (e.g. @972501234567) for each one.',
	},
];

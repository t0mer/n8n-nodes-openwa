import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['status'], operation },
});

/** Operations that post a new status. */
export const POST_OPERATIONS = ['postText', 'postImage', 'postVideo', 'postVoice'];

/** Post operations that take a media file. */
export const MEDIA_POST_OPERATIONS = ['postImage', 'postVideo', 'postVoice'];

export const statusOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['status'] } },
	options: [
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a status',
			description: 'Delete one of your own status updates',
		},
		{
			name: 'Download Media',
			value: 'downloadMedia',
			action: 'Download status media',
			description: 'Download the image, video or voice note of a status as binary data',
		},
		{
			name: 'Get From Contact',
			value: 'getFromContact',
			action: 'Get the statuses of a contact',
			description: 'List the current status updates of one contact, one item per status',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many statuses',
			description: 'List the status updates visible to the session, one item per status',
		},
		{
			name: 'Post Image',
			value: 'postImage',
			action: 'Post an image status',
			description: 'Post an image status update, visible for 24 hours',
		},
		{
			name: 'Post Text',
			value: 'postText',
			action: 'Post a text status',
			description: 'Post a text status update, visible for 24 hours',
		},
		{
			name: 'Post Video',
			value: 'postVideo',
			action: 'Post a video status',
			description: 'Post a video status update, visible for 24 hours',
		},
		{
			name: 'Post Voice',
			value: 'postVoice',
			action: 'Post a voice status',
			description: 'Post an audio status as a voice note, visible for 24 hours',
		},
	],
	default: 'getAll',
};

export const statusFields: INodeProperties[] = [
	{
		displayName: 'Contact',
		name: 'statusContact',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: showFor(['getFromContact']),
		description: 'Phone number in international format, or a contact ID ending in @c.us or @lid',
	},
	{
		displayName: 'Text',
		name: 'statusText',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showFor(['postText']),
		description: 'The status text (up to 4096 characters)',
	},
	{
		displayName: 'Media Source',
		name: 'statusMediaSource',
		type: 'options',
		options: [
			{
				name: 'URL',
				value: 'url',
				description: 'The OpenWA gateway downloads the file from a URL',
			},
			{
				name: 'Binary Data',
				value: 'binary',
				description: 'Upload a file from a previous node (up to 18 MB)',
			},
			{
				name: 'Base64',
				value: 'base64',
				description: 'Send base64-encoded file content (up to 18 MB decoded)',
			},
		],
		default: 'url',
		displayOptions: showFor(MEDIA_POST_OPERATIONS),
	},
	{
		displayName: 'Media URL',
		name: 'statusMediaUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/photo.jpg',
		displayOptions: {
			show: { resource: ['status'], operation: MEDIA_POST_OPERATIONS, statusMediaSource: ['url'] },
		},
		description: 'Public http(s) URL of the file. The OpenWA gateway must be able to reach it.',
	},
	{
		displayName: 'Input Binary Field',
		name: 'statusBinaryField',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: {
				resource: ['status'],
				operation: MEDIA_POST_OPERATIONS,
				statusMediaSource: ['binary'],
			},
		},
		hint: 'The name of the input binary field containing the file',
	},
	{
		displayName: 'Base64 Data',
		name: 'statusMediaBase64',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. data:image/jpeg;base64,iVBORw0KGgo...',
		displayOptions: {
			show: {
				resource: ['status'],
				operation: MEDIA_POST_OPERATIONS,
				statusMediaSource: ['base64'],
			},
		},
		description:
			'The file as base64 text, or as a data URL (<code>data:&lt;mime&gt;;base64,…</code>)',
	},
	{
		displayName: 'MIME Type',
		name: 'statusMediaMimeType',
		type: 'string',
		default: '',
		placeholder: 'e.g. image/jpeg',
		displayOptions: {
			show: {
				resource: ['status'],
				operation: MEDIA_POST_OPERATIONS,
				statusMediaSource: ['base64'],
			},
		},
		description:
			'MIME type of the file. Required for Post Image and Post Video unless Base64 Data is a data URL, which carries its own. Optional for Post Voice, where OpenWA assumes Ogg/Opus.',
	},
	{
		displayName: 'Caption',
		name: 'statusCaption',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		displayOptions: showFor(['postImage', 'postVideo']),
		description: 'Text shown with the image or video (up to 1024 characters)',
	},
	{
		displayName: 'Convert to Voice Note',
		name: 'statusConvertVoice',
		type: 'boolean',
		default: true,
		displayOptions: showFor(['postVoice']),
		description:
			'Whether to have the gateway convert the audio to Ogg/Opus first. WhatsApp only plays a voice status in that format. Requires media conversion (ffmpeg) on the gateway; turn off if the audio is already Ogg/Opus.',
	},
	{
		displayName: 'Options',
		name: 'statusOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(POST_OPERATIONS),
		options: [
			{
				displayName: 'Background Color',
				name: 'backgroundColor',
				type: 'color',
				default: '#25D366',
				displayOptions: { show: { '/operation': ['postText', 'postVoice'] } },
				description:
					'Background color behind the status, as #RRGGBB. For voice statuses only the Baileys engine uses it.',
			},
			{
				displayName: 'Font',
				name: 'font',
				type: 'options',
				options: [
					{ name: 'Default', value: 0 },
					{ name: 'Font 1', value: 1 },
					{ name: 'Font 2', value: 2 },
					{ name: 'Bold', value: 6 },
					{ name: 'Font 7', value: 7 },
					{ name: 'Font 8', value: 8 },
					{ name: 'Font 9', value: 9 },
					{ name: 'Font 10', value: 10 },
				],
				default: 0,
				displayOptions: { show: { '/operation': ['postText'] } },
				description: 'WhatsApp status font. whatsapp-web.js only supports up to Font 7.',
			},
			{
				displayName: 'Recipients',
				name: 'recipients',
				type: 'string',
				default: '',
				placeholder: 'e.g. 972501234567, 972509876543',
				description:
					'Comma-separated phone numbers or contact IDs who can see the status (up to 256). Required on the Baileys engine, which posts only to this list; whatsapp-web.js ignores it and uses your status privacy settings.',
			},
		],
	},
	{
		displayName: 'Status ID',
		name: 'statusId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showFor(['delete', 'downloadMedia']),
		description: 'ID of the status: statusId from a post operation, or the ID field from Get Many',
	},
	{
		displayName: 'Put Output File in Field',
		name: 'statusOutputField',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: showFor(['downloadMedia']),
		hint: 'The name of the output binary field to put the file in',
	},
];

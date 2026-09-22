import type { INodeProperties } from 'n8n-workflow';

/** Media operations and the OpenWA endpoint each one posts to. */
export const MEDIA_ENDPOINTS: Record<string, string> = {
	sendImage: 'send-image',
	sendVideo: 'send-video',
	sendAudio: 'send-audio',
	sendDocument: 'send-document',
	sendSticker: 'send-sticker',
};

/** Operations whose DTO renders a caption. */
export const CAPTION_OPERATIONS = ['sendImage', 'sendVideo', 'sendDocument'];

const mediaOperations = Object.keys(MEDIA_ENDPOINTS);

export const mediaFields: INodeProperties[] = [
	{
		displayName: 'Media Source',
		name: 'mediaSource',
		type: 'options',
		options: [
			{
				name: 'URL',
				value: 'url',
				description: 'The OpenWA gateway downloads the file from a URL (up to 50 MiB)',
			},
			{
				name: 'Binary Data',
				value: 'binary',
				description: 'Upload a binary file from a previous node (up to 18 MB)',
			},
		],
		default: 'url',
		displayOptions: { show: { resource: ['message'], operation: mediaOperations } },
	},
	{
		displayName: 'Media URL',
		name: 'mediaUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/file.jpg',
		displayOptions: {
			show: { resource: ['message'], operation: mediaOperations, mediaSource: ['url'] },
		},
		description: 'Public http(s) URL of the file. The OpenWA gateway must be able to reach it.',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: { resource: ['message'], operation: mediaOperations, mediaSource: ['binary'] },
		},
		hint: 'The name of the input binary field containing the file to send',
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		displayOptions: { show: { resource: ['message'], operation: CAPTION_OPERATIONS } },
		description: 'Text shown with the media (up to 1024 characters)',
	},
	{
		displayName: 'Send as Voice Note',
		name: 'ptt',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['sendAudio'] } },
		description:
			'Whether to send the audio as a voice note (mic bubble with waveform) instead of an audio file. Use Ogg/Opus audio for reliable playback.',
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: '',
		placeholder: 'e.g. invoice.pdf',
		displayOptions: { show: { resource: ['message'], operation: ['sendDocument'] } },
		description:
			'File name shown to the recipient. Defaults to the binary file name, or to the name in the URL.',
	},
];

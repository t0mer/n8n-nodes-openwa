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
			{
				name: 'Base64',
				value: 'base64',
				description: 'Send base64-encoded file content (up to 18 MB decoded)',
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
		displayName: 'Base64 Data',
		name: 'mediaBase64',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. data:image/jpeg;base64,iVBORw0KGgo...',
		displayOptions: {
			show: { resource: ['message'], operation: mediaOperations, mediaSource: ['base64'] },
		},
		description:
			'The file as base64 text, or as a data URL (<code>data:&lt;mime&gt;;base64,…</code>)',
	},
	{
		displayName: 'MIME Type',
		name: 'mediaMimeType',
		type: 'string',
		default: '',
		placeholder: 'e.g. image/jpeg',
		displayOptions: {
			show: { resource: ['message'], operation: mediaOperations, mediaSource: ['base64'] },
		},
		description:
			'MIME type of the file. Required unless Base64 Data is a data URL, which carries its own.',
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
			'Whether to send the audio as a voice note (mic bubble with waveform) instead of an audio file. Use Ogg/Opus audio for reliable playback, or turn on Convert to Voice Note.',
	},
	{
		displayName: 'Convert to Voice Note',
		name: 'convertToVoiceNote',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['sendAudio'], ptt: [true] } },
		description:
			'Whether to have the gateway convert the audio (e.g. MP3, M4A, WAV) to Ogg/Opus first, so it plays as a voice note. Requires media conversion (ffmpeg) to be enabled on the OpenWA gateway.',
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

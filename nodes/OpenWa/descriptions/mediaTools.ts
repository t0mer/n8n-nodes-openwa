import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[], extra: IDisplayOptions['show'] = {}): IDisplayOptions => ({
	show: { resource: ['media'], operation, ...extra },
});

/** Operations that convert a file. */
const CONVERT_OPERATIONS = ['convertVoice', 'convertVideo'];

export const mediaToolsOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['media'] } },
	options: [
		{
			name: 'Check Conversion',
			value: 'checkConversion',
			action: 'Check whether media conversion is available',
			description:
				'Check whether the gateway can convert media (conversion enabled and ffmpeg runnable)',
		},
		{
			name: 'Convert to Voice Note',
			value: 'convertVoice',
			action: 'Convert audio to a voice note',
			description:
				'Convert audio (e.g. MP3, M4A, WAV) to Ogg/Opus, ready for Message → Send Audio as a voice note',
		},
		{
			name: 'Convert Video',
			value: 'convertVideo',
			action: 'Convert a video',
			description:
				'Convert a video to a WhatsApp-compatible MP4 (H.264 + AAC, up to 1280 px), ready for Message → Send Video',
		},
	],
	default: 'convertVoice',
};

export const mediaToolsFields: INodeProperties[] = [
	{
		displayName: 'Media Source',
		name: 'convertSource',
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
		displayOptions: showFor(CONVERT_OPERATIONS),
	},
	{
		displayName: 'Media URL',
		name: 'convertUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/note.m4a',
		displayOptions: showFor(CONVERT_OPERATIONS, { convertSource: ['url'] }),
		description: 'Public http(s) URL of the file. The OpenWA gateway must be able to reach it.',
	},
	{
		displayName: 'Input Binary Field',
		name: 'convertBinaryProperty',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: showFor(CONVERT_OPERATIONS, { convertSource: ['binary'] }),
		hint: 'The name of the input binary field containing the file to convert',
	},
	{
		displayName: 'Base64 Data',
		name: 'convertBase64',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. data:audio/mpeg;base64,SUQzBAAAAAAA...',
		displayOptions: showFor(CONVERT_OPERATIONS, { convertSource: ['base64'] }),
		description:
			'The file as base64 text, or as a data URL (<code>data:&lt;mime&gt;;base64,…</code>)',
	},
	{
		displayName: 'MIME Type',
		name: 'convertMimeType',
		type: 'string',
		default: '',
		placeholder: 'e.g. audio/mpeg',
		displayOptions: showFor(CONVERT_OPERATIONS, { convertSource: ['base64'] }),
		description:
			'MIME type of the file. Required unless Base64 Data is a data URL, which carries its own.',
	},
	{
		displayName: 'Put Output File in Field',
		name: 'convertOutputField',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: showFor(CONVERT_OPERATIONS),
		hint: 'The name of the output binary field to put the converted file in',
	},
];

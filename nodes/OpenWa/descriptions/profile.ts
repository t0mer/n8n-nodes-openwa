import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['profile'], operation },
});

export const profileOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['profile'] } },
	options: [
		{
			name: 'Remove Picture',
			value: 'removePicture',
			action: 'Remove the profile picture',
			description: 'Remove the profile picture of the session account',
		},
		{
			name: 'Set About',
			value: 'setAbout',
			action: 'Set the about text',
			description: 'Set the about (status) text of the session account',
		},
		{
			name: 'Set Name',
			value: 'setName',
			action: 'Set the display name',
			description: 'Set the display name of the session account',
		},
		{
			name: 'Set Picture',
			value: 'setPicture',
			action: 'Set the profile picture',
			description: 'Set the profile picture of the session account from a URL or binary image',
		},
		{
			name: 'Set Presence',
			value: 'setPresence',
			action: 'Set the online presence',
			description: 'Appear online or offline. Offline hands notifications back to the phone.',
		},
	],
	default: 'setAbout',
};

export const profileFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'profileName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showFor(['setName']),
		description: 'New display name, up to 25 characters',
	},
	{
		displayName: 'About',
		name: 'profileAbout',
		type: 'string',
		default: '',
		displayOptions: showFor(['setAbout']),
		description: 'New about text, up to 139 characters. Leave empty to clear it.',
	},
	{
		displayName: 'Picture Source',
		name: 'profilePictureSource',
		type: 'options',
		options: [
			{ name: 'URL', value: 'url', description: 'The gateway downloads the image from a URL' },
			{
				name: 'Binary Data',
				value: 'binary',
				description: 'Upload an image from a previous node (up to 18 MB)',
			},
			{
				name: 'Base64',
				value: 'base64',
				description: 'Send a base64-encoded image (up to 18 MB decoded)',
			},
		],
		default: 'url',
		displayOptions: showFor(['setPicture']),
	},
	{
		displayName: 'Picture URL',
		name: 'profilePictureUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/avatar.jpg',
		displayOptions: {
			show: { resource: ['profile'], operation: ['setPicture'], profilePictureSource: ['url'] },
		},
		description: 'Public http(s) URL of the image. The OpenWA gateway must be able to reach it.',
	},
	{
		displayName: 'Input Binary Field',
		name: 'profilePictureBinaryField',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: { resource: ['profile'], operation: ['setPicture'], profilePictureSource: ['binary'] },
		},
		hint: 'The name of the input binary field containing the image',
	},
	{
		displayName: 'Base64 Data',
		name: 'profilePictureBase64',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. data:image/jpeg;base64,iVBORw0KGgo...',
		displayOptions: {
			show: { resource: ['profile'], operation: ['setPicture'], profilePictureSource: ['base64'] },
		},
		description:
			'The image as base64 text, or as a data URL (<code>data:&lt;mime&gt;;base64,…</code>)',
	},
	{
		displayName: 'MIME Type',
		name: 'profilePictureMimeType',
		type: 'string',
		default: '',
		placeholder: 'e.g. image/jpeg',
		displayOptions: {
			show: { resource: ['profile'], operation: ['setPicture'], profilePictureSource: ['base64'] },
		},
		description:
			'MIME type of the image. Required unless Base64 Data is a data URL, which carries its own.',
	},
	{
		displayName: 'Online',
		name: 'online',
		type: 'boolean',
		default: true,
		displayOptions: showFor(['setPresence']),
		description:
			'Whether to appear online. An always-online linked device suppresses the phone’s own notifications; appear offline to get them back.',
	},
];

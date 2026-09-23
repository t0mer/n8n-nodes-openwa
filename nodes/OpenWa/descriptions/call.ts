import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['call'], operation },
});

export const callOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['call'] } },
	options: [
		{
			name: 'Create Link',
			value: 'createLink',
			action: 'Create a call link',
			description: 'Create a shareable WhatsApp call link',
		},
		{
			name: 'Reject',
			value: 'reject',
			action: 'Reject a call',
			description: 'Reject a ringing incoming call',
		},
	],
	default: 'reject',
};

export const callFields: INodeProperties[] = [
	{
		displayName: 'Call ID',
		name: 'callId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. {{ $json.data.callId }}',
		displayOptions: showFor(['reject']),
		description: 'ID of the ringing call, e.g. data.callId from the OpenWA Call Trigger',
	},
	{
		displayName: 'Call Type',
		name: 'callType',
		type: 'options',
		options: [
			{ name: 'Voice', value: 'audio' },
			{ name: 'Video', value: 'video' },
		],
		default: 'audio',
		displayOptions: showFor(['createLink']),
	},
	{
		displayName: 'Start Time',
		name: 'startTime',
		type: 'dateTime',
		default: '',
		displayOptions: showFor(['createLink']),
		description: 'When the call is scheduled to start. Leave empty for now.',
	},
];

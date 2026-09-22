import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['status'], operation },
});

export const statusOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['status'] } },
	options: [
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
];

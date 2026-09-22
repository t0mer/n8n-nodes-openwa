import type { INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]) => ({ show: { resource: ['contact'], operation } });

export const contactOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['contact'] } },
	options: [
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many contacts',
			description: 'List the contacts known to the session',
		},
	],
	default: 'getAll',
};

export const contactFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showFor(['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

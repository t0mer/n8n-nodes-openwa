import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';
import { groupLocator } from './common';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['group'], operation },
});

/** Group operations that act on one existing group. */
export const GROUP_ID_OPERATIONS = ['get'];

export const groupOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['group'] } },
	options: [
		{
			name: 'Get',
			value: 'get',
			action: 'Get a group',
			description: 'Get a group with its settings and participants',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many groups',
			description: 'List the groups the session account is in',
		},
	],
	default: 'getAll',
};

export const groupFields: INodeProperties[] = [
	groupLocator(showFor(GROUP_ID_OPERATIONS), 'The group to act on'),
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
		displayOptions: { show: { resource: ['group'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

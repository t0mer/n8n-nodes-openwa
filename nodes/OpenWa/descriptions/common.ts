import type { INodeProperties } from 'n8n-workflow';

export const sessionField: INodeProperties = {
	displayName: 'Session',
	name: 'session',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The OpenWA session to send from',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'searchSessions',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 3f2c1a7e-…',
		},
	],
};

import type { INodeProperties } from 'n8n-workflow';

const showForLocation = { show: { resource: ['message'], operation: ['sendLocation'] } };

export const locationFields: INodeProperties[] = [
	{
		displayName: 'Latitude',
		name: 'latitude',
		type: 'string',
		default: '',
		placeholder: 'e.g. 32.0853',
		required: true,
		displayOptions: showForLocation,
		description: 'Latitude in decimal degrees, from -90 to 90',
	},
	{
		displayName: 'Longitude',
		name: 'longitude',
		type: 'string',
		default: '',
		placeholder: 'e.g. 34.7818',
		required: true,
		displayOptions: showForLocation,
		description: 'Longitude in decimal degrees, from -180 to 180',
	},
];

export const locationOptions: INodeProperties[] = [
	{
		displayName: 'Location Name',
		name: 'locationName',
		type: 'string',
		default: '',
		displayOptions: { show: { '/operation': ['sendLocation'] } },
		description: 'Name of the place, shown above the address',
	},
	{
		displayName: 'Address',
		name: 'address',
		type: 'string',
		default: '',
		displayOptions: { show: { '/operation': ['sendLocation'] } },
		description: 'Street address shown under the name',
	},
];

import type { INodeProperties } from 'n8n-workflow';

const showForLocation = { show: { resource: ['message'], operation: ['sendLocation'] } };

export const locationFields: INodeProperties[] = [
	{
		displayName: 'Latitude',
		name: 'latitude',
		type: 'number',
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 6 },
		default: 0,
		required: true,
		displayOptions: showForLocation,
		description: 'Latitude in decimal degrees, e.g. 32.0853',
	},
	{
		displayName: 'Longitude',
		name: 'longitude',
		type: 'number',
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 6 },
		default: 0,
		required: true,
		displayOptions: showForLocation,
		description: 'Longitude in decimal degrees, e.g. 34.7818',
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

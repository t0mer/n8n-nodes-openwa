import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['catalog'], operation },
});

export const catalogOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['catalog'] } },
	options: [
		{
			name: 'Get',
			value: 'get',
			action: 'Get the catalog',
			description: 'Get the business catalog summary (Baileys engine only)',
		},
		{
			name: 'Get Product',
			value: 'getProduct',
			action: 'Get a catalog product',
			description: 'Get a single catalog product (Baileys engine only)',
		},
		{
			name: 'Get Products',
			value: 'getProducts',
			action: 'Get catalog products',
			description: 'List the catalog products (Baileys engine only)',
		},
	],
	default: 'getProducts',
};

export const catalogFields: INodeProperties[] = [
	{
		displayName: 'Product ID',
		name: 'productId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 7891234567890',
		displayOptions: showFor(['getProduct']),
		description: 'ID of the product, e.g. the ID from Get Products',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showFor(['getProducts']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: { resource: ['catalog'], operation: ['getProducts'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
];

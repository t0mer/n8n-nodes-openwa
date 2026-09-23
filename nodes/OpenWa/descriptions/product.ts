import type { INodeProperties } from 'n8n-workflow';

const showForSendProduct = { show: { resource: ['message'], operation: ['sendProduct'] } };

export const productMessageFields: INodeProperties[] = [
	{
		displayName: 'Product ID',
		name: 'productId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 7891234567890',
		displayOptions: showForSendProduct,
		description:
			'ID of a product in the session catalog, e.g. the ID from Catalog → Get Products. The product needs an image.',
	},
	{
		displayName: 'Body',
		name: 'productBody',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		displayOptions: showForSendProduct,
		description: 'Optional text sent with the product card',
	},
];

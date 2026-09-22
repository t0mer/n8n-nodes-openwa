import type { INodeProperties } from 'n8n-workflow';

const showForSendContact = { show: { resource: ['message'], operation: ['sendContact'] } };

export const contactCardFields: INodeProperties[] = [
	{
		displayName: 'Contact Name',
		name: 'contactName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showForSendContact,
		description: 'Name shown on the contact card',
	},
	{
		displayName: 'Contact Phone Number',
		name: 'contactNumber',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: showForSendContact,
		description:
			'Phone number on the card, in international format. Spaces, dashes, parentheses and a leading + are removed.',
	},
];

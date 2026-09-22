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
			name: 'Block',
			value: 'block',
			action: 'Block a contact',
			description: 'Block a contact on the session account',
		},
		{
			name: 'Check Number',
			value: 'checkNumber',
			action: 'Check a phone number',
			description: 'Check whether a phone number is registered on WhatsApp',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a contact',
			description: 'Get a single contact',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many contacts',
			description: 'List the contacts known to the session',
		},
		{
			name: 'Get Profile Picture',
			value: 'getProfilePicture',
			action: 'Get a profile picture',
			description: 'Get the profile picture URL of a contact (null when hidden or unset)',
		},
		{
			name: 'Unblock',
			value: 'unblock',
			action: 'Unblock a contact',
			description: 'Unblock a contact on the session account',
		},
	],
	default: 'getAll',
};

/** Operations that act on a single existing contact. */
const CONTACT_ID_OPERATIONS = ['get', 'getProfilePicture', 'block', 'unblock'];

export const contactFields: INodeProperties[] = [
	{
		displayName: 'Phone Number',
		name: 'number',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: showFor(['checkNumber']),
		description:
			'Phone number in international format. Spaces, dashes, parentheses and a leading + are removed.',
	},
	{
		displayName: 'Contact',
		name: 'contact',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor(CONTACT_ID_OPERATIONS),
		description: 'The contact to act on',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchContacts',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 972501234567 or 123456789012345@lid',
				hint: 'A phone number in international format, or a chat ID ending in @c.us or @lid',
			},
		],
	},
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

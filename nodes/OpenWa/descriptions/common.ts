import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

/** Message operations that don't target one chat, so they have no recipient. */
export const CHATLESS_OPERATIONS = ['getAll'];

/**
 * Operations that need no session, by resource: a list of operation values, or '*' for the
 * whole resource. The Session field is hidden for them and the router passes `''`.
 */
export const SESSIONLESS: Record<string, string[] | '*'> = {};

export function isSessionless(
	resource: string,
	operation: string,
	sessionless: Record<string, string[] | '*'> = SESSIONLESS,
): boolean {
	const entry = sessionless[resource];
	return entry === '*' || (entry?.includes(operation) ?? false);
}

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

/**
 * The Session field, hidden for sessionless operations. n8n ORs `hide` keys, so one field
 * can't say "resource X and operation Y" (and values like `getAll` repeat across resources).
 * Instead there is one copy for every resource without a sessionless entry, plus one copy per
 * partly sessionless resource that hides only its own operations. The copies share the name
 * and are mutually exclusive by resource, so exactly one is shown.
 */
export function sessionFields(
	sessionless: Record<string, string[] | '*'> = SESSIONLESS,
): INodeProperties[] {
	const resources = Object.keys(sessionless);
	if (resources.length === 0) return [sessionField];
	const partial = resources.filter((resource) => sessionless[resource] !== '*');
	return [
		{ ...sessionField, displayOptions: { hide: { resource: resources } } },
		...partial.map((resource) => ({
			...sessionField,
			displayOptions: {
				show: { resource: [resource] },
				hide: { operation: sessionless[resource] as string[] },
			},
		})),
	];
}

export const recipientFields: INodeProperties[] = [
	{
		displayName: 'Recipient Type',
		name: 'recipientType',
		type: 'options',
		options: [
			{ name: 'Contact', value: 'contact' },
			{ name: 'Group', value: 'group' },
		],
		default: 'contact',
		displayOptions: { show: { resource: ['message'] }, hide: { operation: CHATLESS_OPERATIONS } },
		description: 'Whether to send to a single contact or to a group',
	},
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: {
			show: { resource: ['message'], recipientType: ['contact'] },
			hide: { operation: CHATLESS_OPERATIONS },
		},
		description:
			'Recipient phone number in international format. Spaces, dashes, parentheses and a leading + are removed. A full chat ID ending in @c.us or @lid is also accepted.',
	},
	groupLocator(
		{
			show: { resource: ['message'], recipientType: ['group'] },
			hide: { operation: CHATLESS_OPERATIONS },
		},
		'The group to send to',
	),
];

/** Group picker (list from the session, or an @g.us ID), shared by Message and Group. */
export function groupLocator(
	displayOptions: IDisplayOptions,
	description: string,
): INodeProperties {
	return {
		displayName: 'Group',
		name: 'group',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions,
		description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchGroups',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 120363012345678901@g.us',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[^@\\s]+@g\\.us$',
							errorMessage: 'Group ID must end with @g.us',
						},
					},
				],
			},
		],
	};
}

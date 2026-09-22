import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';
import { groupLocator } from './common';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['group'], operation },
});

/** Group operations that act on one existing group. */
export const GROUP_ID_OPERATIONS = [
	'get',
	'getParticipants',
	'update',
	'addParticipants',
	'removeParticipants',
	'promoteParticipants',
	'demoteParticipants',
];

/** Operations that take a Participants list. */
export const PARTICIPANT_OPERATIONS = [
	'create',
	'addParticipants',
	'removeParticipants',
	'promoteParticipants',
	'demoteParticipants',
];

export const groupOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['group'] } },
	options: [
		{
			name: 'Add Participants',
			value: 'addParticipants',
			action: 'Add participants to a group',
			description: 'Add members to a group (requires admin)',
		},
		{
			name: 'Create',
			value: 'create',
			action: 'Create a group',
			description: 'Create a group with the given participants (Baileys engine only)',
		},
		{
			name: 'Demote Participants',
			value: 'demoteParticipants',
			action: 'Demote participants from admin',
			description: 'Remove admin rights from members (requires admin)',
		},
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
		{
			name: 'Get Participants',
			value: 'getParticipants',
			action: 'Get group participants',
			description: 'List the members of a group, one item per participant',
		},
		{
			name: 'Promote Participants',
			value: 'promoteParticipants',
			action: 'Promote participants to admin',
			description: 'Make members group admins (requires admin)',
		},
		{
			name: 'Remove Participants',
			value: 'removeParticipants',
			action: 'Remove participants from a group',
			description: 'Remove members from a group (requires admin). Changes the group.',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update a group',
			description: 'Change the name or description of a group',
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
	{
		displayName: 'Group Name',
		name: 'groupName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showFor(['create']),
		description: 'Name (subject) of the new group',
	},
	{
		displayName: 'Participants',
		name: 'participants',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567, 972509876543',
		displayOptions: showFor(PARTICIPANT_OPERATIONS),
		description:
			'Comma-separated phone numbers (international format) or contact IDs ending in @c.us or @lid',
	},
	{
		displayName: 'Update Fields',
		name: 'groupUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'New group description. Leave empty to clear it.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New group name (subject)',
			},
		],
	},
];

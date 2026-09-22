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
	'getMembershipRequests',
	'approveRequests',
	'rejectRequests',
	'getInviteLink',
	'revokeInviteLink',
	'getSettings',
	'updateSettings',
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
			name: 'Approve Requests',
			value: 'approveRequests',
			action: 'Approve join requests',
			description: 'Approve pending requests to join a group (requires admin)',
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
			name: 'Get Invite Link',
			value: 'getInviteLink',
			action: 'Get the invite link of a group',
			description: 'Get the invite code and link of a group (requires admin)',
		},
		{
			name: 'Get Join Info',
			value: 'getJoinInfo',
			action: 'Preview a group from an invite link',
			description: 'See a group (name, description, members) from its invite link without joining',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many groups',
			description: 'List the groups the session account is in',
		},
		{
			name: 'Get Membership Requests',
			value: 'getMembershipRequests',
			action: 'Get pending join requests',
			description: 'List pending requests to join a group, one item per request',
		},
		{
			name: 'Get Participants',
			value: 'getParticipants',
			action: 'Get group participants',
			description: 'List the members of a group, one item per participant',
		},
		{
			name: 'Get Settings',
			value: 'getSettings',
			action: 'Get group settings',
			description:
				'Get who can send, who can edit info, who can add members, and the disappearing-messages timer',
		},
		{
			name: 'Join',
			value: 'join',
			action: 'Join a group',
			description: 'Join a group with an invite link',
		},
		{
			name: 'Promote Participants',
			value: 'promoteParticipants',
			action: 'Promote participants to admin',
			description: 'Make members group admins (requires admin)',
		},
		{
			name: 'Reject Requests',
			value: 'rejectRequests',
			action: 'Reject join requests',
			description: 'Reject pending requests to join a group (requires admin)',
		},
		{
			name: 'Remove Participants',
			value: 'removeParticipants',
			action: 'Remove participants from a group',
			description: 'Remove members from a group (requires admin). Changes the group.',
		},
		{
			name: 'Revoke Invite Link',
			value: 'revokeInviteLink',
			action: 'Revoke the invite link of a group',
			description:
				'Invalidate the current invite link and generate a new one (requires admin). Changes the group.',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update a group',
			description: 'Change the name or description of a group',
		},
		{
			name: 'Update Settings',
			value: 'updateSettings',
			action: 'Update group settings',
			description:
				'Change who can send, who can edit info, who can add members, or the disappearing-messages timer (requires admin)',
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
	{
		displayName: 'Requesters',
		name: 'requesters',
		type: 'string',
		default: '',
		placeholder: 'e.g. 972501234567, 972509876543',
		displayOptions: showFor(['approveRequests', 'rejectRequests']),
		description:
			'Comma-separated phone numbers or contact IDs of the requests to act on. Leave empty to act on every pending request.',
	},
	{
		displayName: 'Invite Link',
		name: 'inviteCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://chat.whatsapp.com/AbCdEf123456',
		displayOptions: showFor(['getJoinInfo', 'join']),
		description: 'A group invite link, or just the code at the end of it',
	},
	{
		displayName: 'Settings',
		name: 'groupSettings',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		displayOptions: showFor(['updateSettings']),
		options: [
			{
				displayName: 'Disappearing Messages',
				name: 'ephemeralSeconds',
				type: 'options',
				options: [
					{ name: 'Off', value: 0 },
					{ name: '24 Hours', value: 86400 },
					{ name: '7 Days', value: 604800 },
					{ name: '90 Days', value: 7776000 },
				],
				default: 0,
				description: 'How long new messages stay before they disappear',
			},
			{
				displayName: 'Only Admins Can Edit Group Info',
				name: 'locked',
				type: 'boolean',
				default: false,
				description: 'Whether only admins can change the name, description and picture',
			},
			{
				displayName: 'Only Admins Can Send Messages',
				name: 'announce',
				type: 'boolean',
				default: false,
				description: 'Whether only admins can send messages to the group',
			},
			{
				displayName: 'Who Can Add Members',
				name: 'memberAddMode',
				type: 'options',
				options: [
					{ name: 'All Members', value: 'all' },
					{ name: 'Only Admins', value: 'admins' },
				],
				default: 'admins',
			},
		],
	},
];

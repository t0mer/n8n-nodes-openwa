import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['automationRule'], operation },
});

export const automationRuleOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['automationRule'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create an automation rule',
			description: 'Add an auto-reply rule to the session',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete an automation rule',
			description: 'Remove an auto-reply rule from the session',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get an automation rule',
			description: 'Get a single auto-reply rule',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many automation rules',
			description: 'List the auto-reply rules of the session, in evaluation order',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update an automation rule',
			description: 'Change the name, reply, conditions, cooldown or state of a rule',
		},
	],
	default: 'getAll',
};

const conditionsField: INodeProperties = {
	displayName: 'Conditions (JSON)',
	name: 'ruleConditions',
	type: 'json',
	default: '',
	placeholder: '{"conditions": [{"field": "body", "operator": "contains", "value": "price"}]}',
	description:
		'Reply only to inbound messages matching every condition: {"conditions": [...]} or a bare array of 1–20 {field, operator (is, isNot, contains, equals), value, caseSensitive} objects. True/false values need is or isNot; a single string with is or isNot is sent as a one-item list. Leave empty to reply to every inbound message.',
};

const cooldownField: INodeProperties = {
	displayName: 'Cooldown (Seconds)',
	name: 'cooldownSeconds',
	type: 'number',
	typeOptions: { minValue: 0, maxValue: 86400 },
	default: 60,
	description:
		'After replying in a chat, stay silent in that chat for this long (0–86400; 0 disables). Guards against two auto-repliers answering each other forever.',
};

const enabledField: INodeProperties = {
	displayName: 'Enabled',
	name: 'enabled',
	type: 'boolean',
	default: true,
	description: 'Whether the rule is active',
};

export const automationRuleFields: INodeProperties[] = [
	{
		displayName: 'Rule',
		name: 'automationRule',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: showFor(['delete', 'get', 'update']),
		description: 'An automation rule of the session',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchAutomationRules', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 7c9e6679-7425-40de-944b-e07fc1f90ae7',
			},
		],
	},
	{
		displayName: 'Name',
		name: 'ruleName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Greet new enquiries',
		displayOptions: showFor(['create']),
		description: 'Display name for the rule (up to 100 characters)',
	},
	{
		displayName: 'Reply Text',
		name: 'replyText',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showFor(['create']),
		description: 'Text sent back into the chat when the rule matches (up to 4096 characters)',
	},
	{
		displayName: 'Options',
		name: 'ruleOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(['create']),
		options: [conditionsField, cooldownField, enabledField],
	},
	{
		displayName: 'Update Fields',
		name: 'ruleUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			{
				displayName: 'Clear Conditions',
				name: 'clearConditions',
				type: 'boolean',
				default: false,
				description:
					'Whether to remove the conditions, so the rule replies to every inbound message',
			},
			conditionsField,
			cooldownField,
			enabledField,
			{
				displayName: 'Name',
				name: 'ruleName',
				type: 'string',
				default: '',
				description: 'Display name for the rule (up to 100 characters)',
			},
			{
				displayName: 'Reply Text',
				name: 'replyText',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'Text sent back into the chat when the rule matches (up to 4096 characters)',
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
		displayOptions: {
			show: { resource: ['automationRule'], operation: ['getAll'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
];

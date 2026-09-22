import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['template'], operation },
});

/** Template picker, reused by the Template resource and Message → Send Template. */
export function templateLocator(displayOptions: IDisplayOptions): INodeProperties {
	return {
		displayName: 'Template',
		name: 'template',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions,
		description: 'A text template stored on the OpenWA gateway for this session',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 5d0c7a8e-…',
			},
		],
	};
}

export const templateOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['template'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create a template',
			description: 'Create a text template for the session',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a template',
			description: 'Delete a template',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a template',
			description: 'Get a single template',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many templates',
			description: 'List the templates of the session',
		},
		{
			name: 'Update',
			value: 'update',
			action: 'Update a template',
			description: 'Change the name, body, header or footer of a template',
		},
	],
	default: 'getAll',
};

const bodyDescription =
	'Template text. Placeholders in double curly braces, e.g. {{name}}, are filled from the variables given when sending.';

export const templateFields: INodeProperties[] = [
	templateLocator(showFor(['get', 'update', 'delete'])),
	{
		displayName: 'Name',
		name: 'templateName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showFor(['create']),
		description: 'Unique name of the template within the session',
	},
	{
		displayName: 'Body',
		name: 'templateBody',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: showFor(['create']),
		description: bodyDescription,
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['create']),
		options: [
			{
				displayName: 'Footer',
				name: 'footer',
				type: 'string',
				default: '',
				description: 'Text appended after the rendered body',
			},
			{
				displayName: 'Header',
				name: 'header',
				type: 'string',
				default: '',
				description: 'Text prepended before the rendered body',
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			{
				displayName: 'Body',
				name: 'body',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: bodyDescription,
			},
			{
				displayName: 'Footer',
				name: 'footer',
				type: 'string',
				default: '',
				description: 'Text appended after the rendered body. Leave empty to remove it.',
			},
			{
				displayName: 'Header',
				name: 'header',
				type: 'string',
				default: '',
				description: 'Text prepended before the rendered body. Leave empty to remove it.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Unique name of the template within the session',
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
		displayOptions: { show: { resource: ['template'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

const showForSendTemplate: IDisplayOptions = {
	show: { resource: ['message'], operation: ['sendTemplate'] },
};

export const sendTemplateFields: INodeProperties[] = [
	templateLocator(showForSendTemplate),
	{
		displayName: 'Variables',
		name: 'templateVariables',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Variable',
		default: {},
		displayOptions: showForSendTemplate,
		description: 'Values for the {{placeholders}} in the template',
		options: [
			{
				displayName: 'Variable',
				name: 'values',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'e.g. name',
						description: 'Placeholder name, without the curly braces',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},
];

import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]): IDisplayOptions => ({
	show: { resource: ['session'], operation },
});

const autoRejectCallsDescription =
	'Whether to reject every incoming call as soon as it rings (Baileys engine only). The call.received event is still emitted first.';
const maxReconnectAttemptsDescription =
	'Cap on consecutive reconnect attempts by the gateway (0 disables reconnecting). Unlimited by default.';
const reconnectBaseDelayDescription =
	'Base delay of the reconnect backoff in milliseconds (1000–300000, default 5000)';
const proxyUrlDescription =
	'Egress proxy URL, e.g. http://user:pass@proxy.example.com:8080 (http, https, socks4 or socks5). It must be reachable: an unreachable proxy blocks the connection and the session start times out.';

/** Session config keys shared by Create and Update Config. */
const configOptions: INodeProperties[] = [
	{
		displayName: 'Auto Reject Calls',
		name: 'autoRejectCalls',
		type: 'boolean',
		default: false,
		description: autoRejectCallsDescription,
	},
	{
		displayName: 'Max Reconnect Attempts',
		name: 'maxReconnectAttempts',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 20 },
		default: 5,
		description: maxReconnectAttemptsDescription,
	},
	{
		displayName: 'Reconnect Base Delay (Ms)',
		name: 'reconnectBaseDelay',
		type: 'number',
		typeOptions: { minValue: 1000, maxValue: 300000 },
		default: 5000,
		description: reconnectBaseDelayDescription,
	},
];

export const sessionOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['session'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create a session',
			description:
				'Create a new session. Start it, then link it with Get QR Code or a pairing code.',
		},
		{
			name: 'Delete',
			value: 'delete',
			action: 'Delete a session',
			description: 'Delete a session and its stored credentials. Cannot be undone.',
		},
		{
			name: 'Force Kill',
			value: 'forceKill',
			action: 'Force kill a session',
			description:
				'Forcefully tear down a stuck session engine. Destructive: use only when Stop does not work.',
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a session',
			description: 'Get a single session with its status',
		},
		{
			name: 'Get Config',
			value: 'getConfig',
			action: 'Get the config of a session',
			description: 'Get the reconnect and call settings of a session',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many sessions',
			description: 'List the sessions on the gateway, one item per session',
		},
		{
			name: 'Get Proxy',
			value: 'getProxy',
			action: 'Get the proxy of a session',
			description: 'Get the egress proxy of a session (credentials masked)',
		},
		{
			name: 'Get QR Code',
			value: 'getQr',
			action: 'Get the QR code of a session',
			description: 'Get the QR code to link a started session, as JSON and as a PNG image',
		},
		{
			name: 'Get Stats',
			value: 'getStats',
			action: 'Get session statistics',
			description: 'Get session counts and memory usage across the gateway',
		},
		{
			name: 'Log Out',
			value: 'logout',
			action: 'Log out a session',
			description:
				'Unlink the WhatsApp account from the session. Destructive: linking again needs a new QR scan or pairing code.',
		},
		{
			name: 'Request Pairing Code',
			value: 'requestPairingCode',
			action: 'Request a pairing code for a session',
			description: 'Get a code to link the session by phone number instead of a QR scan',
		},
		{
			name: 'Start',
			value: 'start',
			action: 'Start a session',
			description: 'Start a session',
		},
		{
			name: 'Stop',
			value: 'stop',
			action: 'Stop a session',
			description: 'Stop a session, keeping it linked',
		},
		{
			name: 'Update Config',
			value: 'updateConfig',
			action: 'Update the config of a session',
			description: 'Change or reset the reconnect and call settings of a session',
		},
		{
			name: 'Update Proxy',
			value: 'updateProxy',
			action: 'Update the proxy of a session',
			description: 'Set or clear the egress proxy of a session (gateway 0.23.4 or newer)',
		},
	],
	default: 'getAll',
};

export const sessionResourceFields: INodeProperties[] = [
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
		displayOptions: { show: { resource: ['session'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'sessionFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor(['getAll']),
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Only the session with exactly this name',
			},
		],
	},
	{
		displayName: 'Name',
		name: 'sessionName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. my-bot',
		displayOptions: showFor(['create']),
		description: 'Unique session name: 3–50 letters, digits and hyphens',
	},
	{
		displayName: 'Options',
		name: 'sessionOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showFor(['create']),
		options: [
			...configOptions,
			{
				displayName: 'Proxy Type',
				name: 'proxyType',
				type: 'options',
				options: [
					{ name: 'HTTP', value: 'http' },
					{ name: 'HTTPS', value: 'https' },
					{ name: 'SOCKS4', value: 'socks4' },
					{ name: 'SOCKS5', value: 'socks5' },
				],
				default: 'http',
			},
			{
				displayName: 'Proxy URL',
				name: 'proxyUrl',
				type: 'string',
				default: '',
				description: proxyUrlDescription,
			},
		],
	},
	{
		displayName: 'Phone Number',
		name: 'pairingPhoneNumber',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 972501234567',
		displayOptions: showFor(['requestPairingCode']),
		description:
			'Phone number of the WhatsApp account to link, in international format. Spaces, dashes, parentheses and a leading + are removed.',
	},
	{
		displayName: 'Update Fields',
		name: 'configFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['updateConfig']),
		options: configOptions,
	},
	{
		displayName: 'Reset to Default',
		name: 'resetConfig',
		type: 'multiOptions',
		options: [
			{ name: 'Auto Reject Calls', value: 'autoRejectCalls', description: 'Off' },
			{ name: 'Max Reconnect Attempts', value: 'maxReconnectAttempts', description: 'Unlimited' },
			{ name: 'Reconnect Base Delay', value: 'reconnectBaseDelay', description: '5000 ms' },
		],
		default: [],
		displayOptions: showFor(['updateConfig']),
		description: 'Settings to put back to their defaults',
	},
	{
		displayName: 'Proxy URL',
		name: 'proxyUrl',
		type: 'string',
		default: '',
		displayOptions: showFor(['updateProxy']),
		description: `${proxyUrlDescription} Leave empty to remove the proxy`,
	},
];

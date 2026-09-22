import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenWaApi implements ICredentialType {
	name = 'openWaApi';

	displayName = 'OpenWA API';

	icon = {
		light: 'file:../nodes/OpenWa/openwa.svg',
		dark: 'file:../nodes/OpenWa/openwa.dark.svg',
	} as const;

	documentationUrl = 'https://github.com/t0mer/n8n-nodes-openwa?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://wa.example.com',
			description: 'The URL of your OpenWA gateway, without the /api suffix',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/auth/validate',
			method: 'POST',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'valid',
					value: false,
					message: 'The API key was rejected by the OpenWA gateway',
				},
			},
		],
	};
}

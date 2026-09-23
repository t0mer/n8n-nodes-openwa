import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

export type Responder = (options: IHttpRequestOptions) => unknown;

/**
 * Minimal IExecuteFunctions stand-in: parameters from a map, HTTP calls recorded. `response` is
 * returned for every call, or computed per call when it is a function.
 */
export function fakeContext(
	params: Record<string, unknown>,
	response: unknown = { ok: true },
	{
		items = 1,
		continueOnFail = false,
		typeVersion = 1.1,
	}: { items?: number; continueOnFail?: boolean; typeVersion?: number } = {},
) {
	const calls: IHttpRequestOptions[] = [];
	const ctx = {
		getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
		continueOnFail: () => continueOnFail,
		getNodeParameter(
			name: string,
			_i: number,
			fallback?: unknown,
			options?: { extractValue?: boolean },
		) {
			const [head, ...rest] = name.split('.');
			let value: unknown = params[head];
			for (const key of rest) value = (value as Record<string, unknown> | undefined)?.[key];
			if (value === undefined) value = fallback;
			if (options?.extractValue && value && typeof value === 'object' && 'value' in value) {
				return (value as { value: unknown }).value;
			}
			return value;
		},
		getTimezone: () => (params.__timezone as string | undefined) ?? 'UTC',
		getNode: () => ({
			id: '1',
			name: 'OpenWA',
			type: 'openWa',
			typeVersion,
			position: [0, 0],
			parameters: {},
		}),
		getCredentials: async () => ({ baseUrl: 'https://wa.example.com/', apiKey: 'test' }),
		helpers: {
			async httpRequestWithAuthentication(_type: string, options: IHttpRequestOptions) {
				calls.push(options);
				const result = typeof response === 'function' ? (response as Responder)(options) : response;
				if (result instanceof Error) throw result;
				return result;
			},
			async prepareBinaryData(data: Buffer, fileName?: string, mimeType?: string) {
				return { data: data.toString('base64'), fileName, mimeType };
			},
			assertBinaryData: () =>
				(params.binaryMeta as object | undefined) ?? {
					mimeType: 'audio/mpeg',
					fileName: 'note.mp3',
				},
			getBinaryDataBuffer: async () =>
				(params.binaryData as Buffer | undefined) ?? Buffer.from('mp3-bytes'),
		},
	};
	return { ctx: ctx as unknown as IExecuteFunctions, calls };
}

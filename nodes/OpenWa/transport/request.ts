import {
	NodeApiError,
	type IDataObject,
	type IExecuteFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { describeOpenWaError, parseHttpError } from './errors';

interface RequestOptions {
	body?: IDataObject;
	qs?: IDataObject;
	/** Session the request targets, used to name it in error messages. */
	sessionId?: string;
	itemIndex?: number;
	/** Set to false where a 409 is not about session state (e.g. duplicate template name). */
	conflictIsSessionState?: boolean;
	/** Return the full response with the body as bytes (for file downloads). */
	raw?: boolean;
	/** Error statuses whose body is a meaningful answer: returned like a 2xx instead of thrown. */
	okStatuses?: number[];
}

/** Authenticated request to the OpenWA API with errors mapped to clear messages. */
export async function openWaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	{ body, qs, sessionId, itemIndex, conflictIsSessionState, raw, okStatuses }: RequestOptions = {},
): Promise<unknown> {
	const credentials = await this.getCredentials('openWaApi');
	const baseUrl = String(credentials.baseUrl).trim().replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
		qs,
		body,
	};
	if (raw) {
		options.json = false;
		options.encoding = 'arraybuffer';
		options.returnFullResponse = true;
	}
	if (okStatuses) {
		options.ignoreHttpStatusErrors = true;
		options.returnFullResponse = true;
	}

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'openWaApi',
			options,
		);
		if (!okStatuses) return response;
		const { statusCode, body: data } = response as IN8nHttpFullResponse;
		if (statusCode < 400 || okStatuses.includes(statusCode)) return data;
		// Shaped like an HTTP error so the catch below maps it as usual.
		throw { httpCode: String(statusCode), response: { status: statusCode, data } };
	} catch (error) {
		const { status, apiMessage } = parseHttpError(error);
		const { message, description } = describeOpenWaError(
			status,
			apiMessage,
			sessionId,
			conflictIsSessionState,
		);
		throw new NodeApiError(this.getNode(), { message: apiMessage ?? message } as JsonObject, {
			message,
			description,
			httpCode: status ? String(status) : undefined,
			itemIndex,
		});
	}
}

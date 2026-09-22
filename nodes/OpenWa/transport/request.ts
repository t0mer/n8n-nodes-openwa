import {
	NodeApiError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
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
}

/** Authenticated request to the OpenWA API with errors mapped to clear messages. */
export async function openWaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	{ body, qs, sessionId, itemIndex, conflictIsSessionState }: RequestOptions = {},
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

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'openWaApi', options);
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

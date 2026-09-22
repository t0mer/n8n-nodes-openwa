import {
	NodeApiError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { describeOpenWaError, extractApiMessage } from './errors';

interface RequestOptions {
	body?: IDataObject;
	qs?: IDataObject;
	/** Session the request targets, used to name it in error messages. */
	sessionId?: string;
	itemIndex?: number;
}

interface HttpErrorLike {
	httpCode?: string | null;
	description?: string | null;
	message?: string;
	response?: { status?: number; data?: unknown };
	cause?: { response?: { status?: number; data?: unknown } };
}

/** Authenticated request to the OpenWA API with errors mapped to clear messages. */
export async function openWaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	{ body, qs, sessionId, itemIndex }: RequestOptions = {},
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
		const err = error as HttpErrorLike;
		const response = err.response ?? err.cause?.response;
		const status = Number(err.httpCode ?? response?.status) || undefined;
		const apiMessage = extractApiMessage(response?.data) ?? err.description ?? err.message;
		const { message, description } = describeOpenWaError(status, apiMessage ?? undefined, sessionId);
		throw new NodeApiError(this.getNode(), { message: apiMessage ?? message } as JsonObject, {
			message,
			description,
			httpCode: status ? String(status) : undefined,
			itemIndex,
		});
	}
}

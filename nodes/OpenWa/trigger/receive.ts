import type { IDataObject, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { ALL_EVENTS_WILDCARD } from './events';
import { configuredSessionId, credentialApiKey, triggerStaticData } from './lifecycle';
import { deriveWebhookSecret, rememberDelivery, verifySignature } from './webhook';

/** Answer the gateway without starting the workflow. */
function acknowledge(
	ctx: IWebhookFunctions,
	status: number,
	body: IDataObject,
): IWebhookResponseData {
	ctx.getResponseObject().status(status).json(body);
	return { noWebhookResponse: true };
}

const header = (headers: IDataObject, name: string) => {
	const value = headers[name];
	return Array.isArray(value) ? String(value[0]) : value === undefined ? undefined : String(value);
};

/** Handle one OpenWA webhook delivery: verify, check session and event, drop duplicates, run. */
export async function receiveWebhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
	const options = this.getNodeParameter('options', {}) as IDataObject;
	const headers = this.getHeaderData() as IDataObject;
	const body = this.getBodyData();

	if (options.verifySignature !== false) {
		// The secret is derived, not stored, so there is always one to check against (fail closed).
		const secret = deriveWebhookSecret(
			await credentialApiKey(this),
			this.getNodeWebhookUrl('default') ?? '',
		);
		// The HMAC covers the exact bytes sent; re-serializing is only a fallback if n8n kept none.
		const raw = this.getRequestObject().rawBody ?? Buffer.from(JSON.stringify(body));
		if (!verifySignature(raw, header(headers, 'x-openwa-signature'), secret)) {
			return acknowledge(this, 401, { error: 'Invalid or missing X-OpenWA-Signature' });
		}
	}

	const sessionId = configuredSessionId(this);
	if (body.sessionId !== undefined && sessionId && String(body.sessionId) !== sessionId) {
		return acknowledge(this, 200, { ignored: `delivery is for another session` });
	}

	const event = String(body.event ?? header(headers, 'x-openwa-event') ?? '');
	const events = this.getNodeParameter('events', []) as string[];
	if (!events.includes(ALL_EVENTS_WILDCARD) && !events.includes(event)) {
		return acknowledge(this, 200, { ignored: `event "${event}" is not selected` });
	}

	if (options.ignoreDuplicates !== false) {
		const data = triggerStaticData(this);
		const key = header(headers, 'x-openwa-idempotency-key') ?? (body.idempotencyKey as string);
		data.seenKeys = data.seenKeys ?? [];
		if (rememberDelivery(data.seenKeys, key)) {
			return acknowledge(this, 200, { ignored: 'duplicate delivery' });
		}
	}

	return { workflowData: [this.helpers.returnJsonArray([body])] };
}

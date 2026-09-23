import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type INodeExecutionData,
} from 'n8n-workflow';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

const CONFIG_KEYS = ['autoRejectCalls', 'maxReconnectAttempts', 'reconnectBaseDelay'];

/** Run one Session operation for item `i`. Get Many returns one object per session. */
export async function executeSession(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[] | INodeExecutionData> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (
		method: IHttpRequestMethods,
		path: string,
		{ body, qs }: { body?: IDataObject; qs?: IDataObject } = {},
	) =>
		openWaApiRequest.call(ctx, method, `/api/sessions${path}`, {
			body,
			qs,
			sessionId: sessionId || undefined,
			itemIndex: i,
		}) as Promise<IDataObject | IDataObject[]>;
	const session = `/${encodeURIComponent(sessionId)}`;
	const fail = (message: string) =>
		new NodeOperationError(ctx.getNode(), message, { itemIndex: i });

	switch (operation) {
		case 'getAll': {
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const max = returnAll ? undefined : (ctx.getNodeParameter('limit', i) as number);
			const name = String(ctx.getNodeParameter('sessionFilters.name', i, '') ?? '').trim();
			return await fetchPaged(
				async (limit, offset) =>
					(await request('GET', '', {
						qs: { limit, offset, ...(name ? { name } : {}) },
					})) as IDataObject[],
				max,
			);
		}
		case 'create': {
			const name = String(ctx.getNodeParameter('sessionName', i) ?? '').trim();
			if (!/^[A-Za-z0-9-]{3,50}$/.test(name)) {
				throw fail('Name must be 3–50 characters long and use only letters, digits and hyphens');
			}
			const options = ctx.getNodeParameter('sessionOptions', i, {}) as IDataObject;
			const body: IDataObject = { name };
			const config = pick(options, CONFIG_KEYS);
			if (Object.keys(config).length) body.config = config;
			const proxyUrl = String(options.proxyUrl ?? '').trim();
			if (proxyUrl) {
				body.proxyUrl = proxyUrl;
				if (options.proxyType) body.proxyType = options.proxyType;
			}
			return await request('POST', '', { body });
		}
		case 'get':
			return await request('GET', session);
		case 'delete':
			// 204 with no body.
			await request('DELETE', session);
			return { success: true, sessionId };
		case 'start':
		case 'stop':
		case 'logout':
			return await request('POST', `${session}/${operation}`);
		case 'forceKill':
			return await request('POST', `${session}/force-kill`);
		case 'getQr':
			return await getQr(ctx, (await request('GET', `${session}/qr`)) as IDataObject);
		case 'requestPairingCode': {
			const raw = String(ctx.getNodeParameter('pairingPhoneNumber', i) ?? '');
			const phoneNumber = raw.replace(/[\s()+-]/g, '');
			if (!/^\d+$/.test(phoneNumber)) {
				throw fail(`Phone Number must be digits in international format, got "${raw}"`);
			}
			return await request('POST', `${session}/pairing-code`, { body: { phoneNumber } });
		}
		case 'getConfig':
			return await request('GET', `${session}/config`);
		case 'updateConfig': {
			const body = pick(ctx.getNodeParameter('configFields', i, {}) as IDataObject, CONFIG_KEYS);
			for (const key of ctx.getNodeParameter('resetConfig', i, []) as string[]) {
				if (key in body) throw fail(`"${key}" can't be both updated and reset to default`);
				body[key] = null;
			}
			if (Object.keys(body).length === 0) {
				throw fail('Add at least one field to update or reset to default');
			}
			return await request('PATCH', `${session}/config`, { body });
		}
		case 'getProxy':
			return await request('GET', `${session}/proxy`);
		case 'updateProxy': {
			const proxyUrl = String(ctx.getNodeParameter('proxyUrl', i, '') ?? '').trim();
			return await request('PATCH', `${session}/proxy`, { body: { proxyUrl: proxyUrl || null } });
		}
		case 'getStats':
			return await request('GET', '/stats/overview');
		default:
			throw fail(`Unsupported operation "${operation}"`);
	}
}

/** The keys of `source` that are listed and set. */
function pick(source: IDataObject, keys: string[]): IDataObject {
	const result: IDataObject = {};
	for (const key of keys) {
		if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
			result[key] = source[key];
		}
	}
	return result;
}

/** The QR response, plus the image as binary `data` when the gateway sends a data URL. */
async function getQr(
	ctx: IExecuteFunctions,
	response: IDataObject,
): Promise<IDataObject | INodeExecutionData> {
	const match = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(String(response?.qrCode ?? ''));
	if (!match) return response;
	const data = await ctx.helpers.prepareBinaryData(
		Buffer.from(match[2], 'base64'),
		'qr.png',
		match[1],
	);
	return { json: response, binary: { data } };
}

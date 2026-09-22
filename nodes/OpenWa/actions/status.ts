import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';
import { normalizeContactId, parseContactList } from '../helpers/chatId';
import { openWaApiRequest } from '../transport/request';
import { convertToVoiceNote, downloadBinary, readMediaInput } from './media';

/** The gateway accepts at most this many recipients per status. */
const MAX_RECIPIENTS = 256;
/** Post operations that accept a background color. */
const BACKGROUND_OPERATIONS = ['postText', 'postVoice'];

/** Run one Status (Stories) operation for item `i`. List operations return one object per status. */
export async function executeStatus(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[] | INodeExecutionData> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: IDataObject) =>
		openWaApiRequest.call(
			ctx,
			method,
			`/api/sessions/${encodeURIComponent(sessionId)}/status${path}`,
			{
				body,
				sessionId,
				itemIndex: i,
			},
		) as Promise<IDataObject>;
	const list = async (path: string) =>
		((await request('GET', path)) as { statuses?: IDataObject[] }).statuses ?? [];

	switch (operation) {
		case 'getAll':
			return await list('');
		case 'getFromContact': {
			let contactId: string;
			try {
				contactId = normalizeContactId(ctx.getNodeParameter('statusContact', i));
			} catch (error) {
				throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
			}
			return await list(`/${encodeURIComponent(contactId)}`);
		}
		case 'postText': {
			const text = String(ctx.getNodeParameter('statusText', i) ?? '');
			if (!text.trim())
				throw new NodeOperationError(ctx.getNode(), 'Text is required', { itemIndex: i });
			return await request('POST', '/send-text', { text, ...getPostOptions(ctx, i, operation) });
		}
		case 'postImage':
		case 'postVideo': {
			const kind = operation === 'postImage' ? 'image' : 'video';
			const body: IDataObject = {
				[kind]: await readStatusMedia(ctx, i, kind),
				...getPostOptions(ctx, i, operation),
			};
			const caption = String(ctx.getNodeParameter('statusCaption', i, '') ?? '');
			if (caption) body.caption = caption;
			return await request('POST', `/send-${kind}`, body);
		}
		case 'postVoice': {
			const media = await readStatusMedia(ctx, i, 'audio');
			const convert = ctx.getNodeParameter('statusConvertVoice', i, true) as boolean;
			return await request('POST', '/send-voice', {
				audio: convert ? await convertToVoiceNote(ctx, i, sessionId, media) : media,
				...getPostOptions(ctx, i, operation),
			});
		}
		case 'delete': {
			const statusId = getStatusId(ctx, i);
			return { ...(await request('DELETE', `/${encodeURIComponent(statusId)}`)), statusId };
		}
		case 'downloadMedia': {
			const statusId = getStatusId(ctx, i);
			const field =
				String(ctx.getNodeParameter('statusOutputField', i, 'data') ?? '').trim() || 'data';
			const { binary, fileSize } = await downloadBinary(
				ctx,
				i,
				sessionId,
				`/status/${encodeURIComponent(statusId)}/media`,
			);
			return {
				json: { statusId, fileName: binary.fileName, mimeType: binary.mimeType, fileSize },
				binary: { [field]: binary },
			};
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** Options shared by the post operations; only those that apply to `operation` are read. */
function getPostOptions(ctx: IExecuteFunctions, i: number, operation: string): IDataObject {
	const options = ctx.getNodeParameter('statusOptions', i, {}) as IDataObject;
	const body: IDataObject = {};
	try {
		const recipients = parseContactList(options.recipients);
		if (recipients.length > MAX_RECIPIENTS) {
			throw new Error(
				`Recipients lists ${recipients.length} contacts; the limit is ${MAX_RECIPIENTS}`,
			);
		}
		if (recipients.length) body.recipients = recipients;
		if (BACKGROUND_OPERATIONS.includes(operation) && options.backgroundColor !== undefined) {
			const color = String(options.backgroundColor).trim();
			if (!/^#[0-9a-f]{6}$/i.test(color)) {
				throw new Error(`Background Color must be a #RRGGBB hex color, got "${color}"`);
			}
			body.backgroundColor = color;
		}
		if (operation === 'postText' && options.font !== undefined) body.font = Number(options.font);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	return body;
}

/** The status media as `{ url }` or `{ base64, mimetype }`; binary must be of the right kind. */
async function readStatusMedia(
	ctx: IExecuteFunctions,
	i: number,
	kind: 'image' | 'video' | 'audio',
): Promise<IDataObject> {
	return await readMediaInput(
		ctx,
		i,
		{ source: 'statusMediaSource', url: 'statusMediaUrl', binary: 'statusBinaryField' },
		{ accept: kind, label: `The ${kind === 'audio' ? 'voice' : kind} status` },
	);
}

function getStatusId(ctx: IExecuteFunctions, i: number): string {
	const statusId = String(ctx.getNodeParameter('statusId', i) ?? '').trim();
	if (!statusId)
		throw new NodeOperationError(ctx.getNode(), 'Status ID is required', { itemIndex: i });
	return statusId;
}

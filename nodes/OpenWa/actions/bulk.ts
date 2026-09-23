import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type IPairedItemData,
} from 'n8n-workflow';
import { BULK_CAPTION_TYPES, BULK_TYPES } from '../descriptions/bulk';
import { documentFileName, type MediaBody } from '../helpers/media';
import { openWaApiRequest } from '../transport/request';
import { getChatId, getMentions, getText, readMessageMedia } from './message';

/** Most messages the gateway accepts in one send-bulk request. */
export const MAX_BATCH_MESSAGES = 100;
/** OpenWA's default request body limit (`BODY_SIZE_LIMIT`, 25 MB), which one batch must fit. */
export const MAX_BATCH_BODY_BYTES = 25 * 1024 * 1024;
/** Room kept in each batch for everything but the messages (options, Batch ID). */
const ENVELOPE_BYTES = 4096;

interface Entry {
	item: number;
	message: IDataObject;
}

const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * Send Bulk: every input item becomes one message, grouped by session into batches of up to
 * 100 messages and 25 MB, each posted once. Every batch is built and checked before the first is posted. Outputs
 * one item per batch, paired with all its input items. An item that can't be built (or a batch
 * that fails) becomes an error item with Continue On Fail. Outputs are ordered by their first
 * input item.
 */
export async function sendBulk(
	ctx: IExecuteFunctions,
	itemCount: number,
): Promise<INodeExecutionData[]> {
	// Indexed by each output's first input item (unique: an item is in one batch or errors
	// alone), so the output follows input order.
	const output: INodeExecutionData[] = [];
	const bySession = new Map<string, Entry[]>();

	for (let i = 0; i < itemCount; i++) {
		try {
			const sessionId = String(
				ctx.getNodeParameter('session', i, '', { extractValue: true }) ?? '',
			).trim();
			if (!sessionId) {
				throw new NodeOperationError(ctx.getNode(), 'Session is required', { itemIndex: i });
			}
			const message = await buildBulkMessage(ctx, i);
			const entries = bySession.get(sessionId) ?? [];
			entries.push({ item: i, message });
			bySession.set(sessionId, entries);
		} catch (error) {
			if (!ctx.continueOnFail()) throw toNodeError(ctx, error, i);
			output[i] = { json: { error: (error as Error).message }, pairedItem: { item: i } };
		}
	}

	// Build and check every batch before posting any, so a bad batch can't leave the run half-sent.
	const ready: Array<{
		sessionId: string;
		first: number;
		pairedItem: IPairedItemData[];
		body: IDataObject;
	}> = [];
	for (const [sessionId, entries] of bySession) {
		const batches = splitBatches(entries);
		for (const [n, batch] of batches.entries()) {
			const first = batch[0].item;
			const pairedItem = batch.map(({ item }) => ({ item }));
			try {
				const body = buildBatchBody(ctx, first, batch, batches.length > 1 ? n + 1 : undefined);
				ready.push({ sessionId, first, pairedItem, body });
			} catch (error) {
				if (!ctx.continueOnFail()) throw toNodeError(ctx, error, first);
				output[first] = { json: { error: (error as Error).message }, pairedItem };
			}
		}
	}

	for (const { sessionId, first, pairedItem, body } of ready) {
		try {
			const response = (await openWaApiRequest.call(
				ctx,
				'POST',
				`/api/sessions/${encodeURIComponent(sessionId)}/messages/send-bulk`,
				{ body, sessionId, itemIndex: first },
			)) as IDataObject;
			output[first] = { json: response, pairedItem };
		} catch (error) {
			if (!ctx.continueOnFail()) throw toNodeError(ctx, error, first);
			output[first] = { json: { error: (error as Error).message }, pairedItem };
		}
	}
	return output.filter(Boolean);
}

/**
 * Greedily splits a session's messages into batches of at most 100 that fit the request limit
 * (leaving room for the options and Batch ID). A message too large on its own gets its own
 * batch, which buildBatchBody then refuses.
 */
function splitBatches(entries: Entry[]): Entry[][] {
	const batches: Entry[][] = [];
	let batch: Entry[] = [];
	let bytes = 0;
	for (const entry of entries) {
		const size = Buffer.byteLength(JSON.stringify(entry.message)) + 1;
		const full =
			batch.length === MAX_BATCH_MESSAGES || bytes + size > MAX_BATCH_BODY_BYTES - ENVELOPE_BYTES;
		if (batch.length && full) {
			batches.push(batch);
			batch = [];
			bytes = 0;
		}
		batch.push(entry);
		bytes += size;
	}
	if (batch.length) batches.push(batch);
	return batches;
}

/** The send-bulk request for one batch; options come from the batch's first item. */
function buildBatchBody(
	ctx: IExecuteFunctions,
	first: number,
	batch: Entry[],
	suffix: number | undefined,
): IDataObject {
	const options = ctx.getNodeParameter('options', first, {}) as IDataObject;
	const delay = Number(options.delayBetweenMessages ?? 3000);
	if (!Number.isInteger(delay) || delay < 1000 || delay > 60000) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Delay Between Messages must be a whole number of milliseconds from 1000 to 60000, got ${options.delayBetweenMessages}`,
			{ itemIndex: first },
		);
	}
	const body: IDataObject = {
		messages: batch.map(({ message }) => message),
		options: {
			delayBetweenMessages: delay,
			randomizeDelay: options.randomizeDelay ?? true,
			stopOnError: options.stopOnError ?? false,
		},
	};
	const batchId = String(options.batchId ?? '').trim();
	if (batchId) body.batchId = suffix ? `${batchId}-${suffix}` : batchId;

	const bytes = Buffer.byteLength(JSON.stringify(body));
	if (bytes > MAX_BATCH_BODY_BYTES) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${batch.length === 1 ? 'A message' : `A batch of ${batch.length} messages`} is ${toMb(bytes)} MB, above OpenWA's ${toMb(MAX_BATCH_BODY_BYTES)} MB request limit`,
			{
				itemIndex: first,
				description:
					'Binary and Base64 media are sent inside the request. Send the media by URL instead (the gateway downloads it), or feed fewer media items into each run.',
			},
		);
	}
	return body;
}

/** One `BulkMessageItemDto` from item `i`: `{ chatId, type, content }`. */
async function buildBulkMessage(ctx: IExecuteFunctions, i: number): Promise<IDataObject> {
	const chatId = getChatId(ctx, i);
	const type = ctx.getNodeParameter('bulkType', i) as string;
	if (!BULK_TYPES[type]) {
		throw new NodeOperationError(ctx.getNode(), `Unsupported bulk message type "${type}"`, {
			itemIndex: i,
		});
	}
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const content: IDataObject = {};

	if (type === 'text') {
		const text = getText(ctx, i);
		if (!text.trim())
			throw new NodeOperationError(ctx.getNode(), 'Text is required', { itemIndex: i });
		assertMaxLength(ctx, i, 'Text', text, 4096);
		content.text = text;
	} else {
		const media: IDataObject = { ...(await readMessageMedia(ctx, i)) };
		if (type === 'document') {
			const fileName = documentFileName(
				String(ctx.getNodeParameter('fileName', i, '') ?? '').trim(),
				media as MediaBody,
			);
			if (fileName) media.filename = fileName;
		} else {
			// The gateway only uses a file name for documents.
			delete media.filename;
		}
		if (type === 'audio') media.ptt = ctx.getNodeParameter('ptt', i, false) as boolean;
		content[type] = media;
		if (BULK_CAPTION_TYPES.includes(type)) {
			const caption = String(ctx.getNodeParameter('caption', i, '') ?? '');
			assertMaxLength(ctx, i, 'Caption', caption, 1024);
			if (caption) content.caption = caption;
		}
	}
	return { chatId, type, content: { ...content, ...getMentions(ctx, i, options) } };
}

/** Checked here so one bad item fails alone instead of the gateway rejecting its whole batch. */
function assertMaxLength(
	ctx: IExecuteFunctions,
	i: number,
	label: string,
	value: string,
	max: number,
): void {
	if (value.length > max) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${label} is ${value.length} characters, above the ${max}-character limit`,
			{ itemIndex: i },
		);
	}
}

function toNodeError(ctx: IExecuteFunctions, error: unknown, itemIndex: number) {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(ctx.getNode(), error as Error, { itemIndex });
}

/** Get Batch Status / Cancel Batch for a Send Bulk batch. */
export async function executeBatch(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
	operation: 'getBatchStatus' | 'cancelBatch',
): Promise<IDataObject> {
	const batchId = String(ctx.getNodeParameter('batchId', i) ?? '').trim();
	if (!batchId)
		throw new NodeOperationError(ctx.getNode(), 'Batch ID is required', { itemIndex: i });
	const path = `/api/sessions/${encodeURIComponent(sessionId)}/messages/batch/${encodeURIComponent(batchId)}`;
	return (await openWaApiRequest.call(
		ctx,
		operation === 'cancelBatch' ? 'POST' : 'GET',
		operation === 'cancelBatch' ? `${path}/cancel` : path,
		{ sessionId, itemIndex: i },
	)) as IDataObject;
}

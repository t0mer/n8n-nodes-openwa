import type { INodeProperties } from 'n8n-workflow';
import { CAPTION_OPERATIONS, mediaFields } from './media';
import { textFields } from './text';

/** Bulk message types and the single-send operation whose fields each one reuses. */
export const BULK_TYPES: Record<string, string> = {
	text: 'sendText',
	image: 'sendImage',
	video: 'sendVideo',
	audio: 'sendAudio',
	document: 'sendDocument',
};

/**
 * A copy of a single-send field for Send Bulk, shown for the bulk types whose operation shows
 * the original. The copies share the original's name, so the same parameter is read either way.
 */
function forBulk(field: INodeProperties): INodeProperties | undefined {
	const operations = (field.displayOptions?.show?.operation ?? []) as string[];
	const types = Object.keys(BULK_TYPES).filter((type) => operations.includes(BULK_TYPES[type]));
	if (types.length === 0) return undefined;
	return {
		...field,
		displayOptions: {
			show: { ...field.displayOptions?.show, operation: ['sendBulk'], bulkType: types },
		},
	};
}

export const bulkFields: INodeProperties[] = [
	{
		displayName: 'Batch ID',
		name: 'batchId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. batch_abc123',
		displayOptions: {
			show: { resource: ['message'], operation: ['getBatchStatus', 'cancelBatch'] },
		},
		description: 'The batchId returned by Send Bulk',
	},
	{
		displayName: 'Bulk Message Type',
		name: 'bulkType',
		type: 'options',
		options: [
			{ name: 'Audio', value: 'audio' },
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'Text', value: 'text' },
			{ name: 'Video', value: 'video' },
		],
		default: 'text',
		displayOptions: { show: { resource: ['message'], operation: ['sendBulk'] } },
		description: 'The kind of message each input item becomes (stickers cannot be sent in bulk)',
	},
	// Convert to Voice Note needs a gateway call per item, so bulk audio must already be Ogg/Opus.
	...[...textFields, ...mediaFields]
		.filter((field) => field.name !== 'convertToVoiceNote')
		.map(forBulk)
		.filter((field): field is INodeProperties => field !== undefined),
];

/** Send Bulk entries of the Options collection, read from the first item of each batch. */
export const bulkOptions: INodeProperties[] = [
	{
		displayName: 'Batch ID',
		name: 'batchId',
		type: 'string',
		default: '',
		placeholder: 'e.g. newsletter-2026-09',
		displayOptions: { show: { '/operation': ['sendBulk'] } },
		description:
			'Custom ID for the batch (the gateway generates one when empty). When the input needs more than one batch (over 100 messages or 25 MB), batches get the suffixes -1, -2 and so on.',
	},
	{
		displayName: 'Delay Between Messages (Ms)',
		name: 'delayBetweenMessages',
		type: 'number',
		typeOptions: { minValue: 1000, maxValue: 60000 },
		default: 3000,
		displayOptions: { show: { '/operation': ['sendBulk'] } },
		description: 'Milliseconds the gateway waits between two messages (1000–60000)',
	},
	{
		displayName: 'Randomize Delay',
		name: 'randomizeDelay',
		type: 'boolean',
		default: true,
		displayOptions: { show: { '/operation': ['sendBulk'] } },
		description: 'Whether to add a random 0–2 seconds to each delay',
	},
	{
		displayName: 'Stop On Error',
		name: 'stopOnError',
		type: 'boolean',
		default: false,
		displayOptions: { show: { '/operation': ['sendBulk'] } },
		description: 'Whether the gateway stops the batch at the first failed message',
	},
];

/** Bulk types whose content takes a caption. */
export const BULK_CAPTION_TYPES = Object.keys(BULK_TYPES).filter((type) =>
	CAPTION_OPERATIONS.includes(BULK_TYPES[type]),
);

import type { INodeProperties } from 'n8n-workflow';

const showForSendPoll = { show: { resource: ['message'], operation: ['sendPoll'] } };

export const pollFields: INodeProperties[] = [
	{
		displayName: 'Poll Question',
		name: 'pollQuestion',
		type: 'string',
		default: '',
		required: true,
		displayOptions: showForSendPoll,
		description: 'The question or title of the poll',
	},
	{
		displayName: 'Poll Options',
		name: 'pollOptions',
		type: 'string',
		typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Poll Option' },
		default: [],
		required: true,
		displayOptions: showForSendPoll,
		description: 'The answers to choose from (2 to 12, each one different)',
	},
	{
		displayName: 'Allow Multiple Answers',
		name: 'allowMultipleAnswers',
		type: 'boolean',
		default: false,
		displayOptions: showForSendPoll,
		description: 'Whether voters can pick more than one option',
	},
	{
		displayName: 'Selected Options',
		name: 'selectedOptions',
		type: 'string',
		typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Selected Option' },
		default: [],
		displayOptions: { show: { resource: ['message'], operation: ['votePoll'] } },
		description:
			'The option texts to vote for, exactly as they appear on the poll. Replaces your current vote; leave empty to withdraw it.',
	},
];

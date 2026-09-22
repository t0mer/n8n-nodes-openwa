import {
	NodeOperationError,
	type ILoadOptionsFunctions,
	type INodeListSearchResult,
} from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';

interface Group {
	id: string;
	name: string;
}

interface Session {
	id: string;
	name: string;
	status: string;
	phone?: string;
}

function matches(filter: string | undefined, ...values: Array<string | undefined>): boolean {
	if (!filter) return true;
	const needle = filter.toLowerCase();
	return values.some((value) => value?.toLowerCase().includes(needle));
}

export async function searchSessions(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const sessions = (await openWaApiRequest.call(this, 'GET', '/api/sessions')) as Session[];
	return {
		results: sessions
			.filter((session) => matches(filter, session.name, session.id, session.phone))
			.map((session) => ({
				name: `${session.name} (${session.status})`,
				value: session.id,
			})),
	};
}

export async function searchGroups(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const sessionId = String(
		this.getCurrentNodeParameter('session', { extractValue: true }) ?? '',
	).trim();
	if (!sessionId) {
		throw new NodeOperationError(this.getNode(), 'Select a session first to list its groups');
	}
	const groups = (await openWaApiRequest.call(
		this,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/groups`,
		{ sessionId },
	)) as Group[];
	return {
		results: groups
			.filter((group) => matches(filter, group.name, group.id))
			.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
			.map((group) => ({ name: group.name || group.id, value: group.id })),
	};
}

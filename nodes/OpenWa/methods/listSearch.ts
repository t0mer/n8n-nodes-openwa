import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';

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

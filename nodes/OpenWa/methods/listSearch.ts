import {
	NodeOperationError,
	type ILoadOptionsFunctions,
	type INodeListSearchResult,
} from 'n8n-workflow';
import { PAGE_SIZE } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

interface Group {
	id: string;
	name: string;
}

interface Contact {
	id: string;
	number?: string;
	name?: string;
	pushName?: string;
}

interface Template {
	id: string;
	name: string;
}

interface Label {
	id: string;
	name: string;
}

interface Channel {
	id: string;
	name: string;
}

interface Webhook {
	id: string;
	url: string;
	events?: string[];
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

/** The session chosen in the node, required by list searches scoped to a session. */
function getSelectedSessionId(ctx: ILoadOptionsFunctions, what: string): string {
	const sessionId = String(
		ctx.getCurrentNodeParameter('session', { extractValue: true }) ?? '',
	).trim();
	if (!sessionId) {
		throw new NodeOperationError(ctx.getNode(), `Select a session first to list its ${what}`);
	}
	return sessionId;
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
	const sessionId = getSelectedSessionId(this, 'groups');
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

export async function searchContacts(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const sessionId = getSelectedSessionId(this, 'contacts');
	// One page per call; n8n asks for the next page (by offset token) as the user scrolls.
	const offset = Number(paginationToken) || 0;
	const contacts = (await openWaApiRequest.call(
		this,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/contacts`,
		{ qs: { limit: PAGE_SIZE, offset }, sessionId },
	)) as Contact[];
	return {
		results: contacts
			.filter((contact) =>
				matches(filter, contact.name, contact.pushName, contact.number, contact.id),
			)
			.map((contact) => {
				const label = contact.name || contact.pushName;
				const number = contact.number || contact.id;
				return { name: label ? `${label} (${number})` : number, value: contact.id };
			})
			.sort((a, b) => a.name.localeCompare(b.name)),
		paginationToken: contacts.length === PAGE_SIZE ? String(offset + PAGE_SIZE) : undefined,
	};
}

export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const sessionId = getSelectedSessionId(this, 'templates');
	const templates = (await openWaApiRequest.call(
		this,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/templates`,
		{ sessionId },
	)) as Template[];
	return {
		results: templates
			.filter((template) => matches(filter, template.name, template.id))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((template) => ({ name: template.name, value: template.id })),
	};
}

export async function searchLabels(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const sessionId = getSelectedSessionId(this, 'labels');
	const labels = (await openWaApiRequest.call(
		this,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/labels`,
		{ sessionId },
	)) as Label[];
	return {
		results: labels
			.filter((label) => matches(filter, label.name, label.id))
			.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
			.map((label) => ({ name: label.name || label.id, value: label.id })),
	};
}

export async function searchChannels(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const sessionId = getSelectedSessionId(this, 'channels');
	const channels = (await openWaApiRequest.call(
		this,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/channels`,
		{ sessionId },
	)) as Channel[];
	return {
		results: channels
			.filter((channel) => matches(filter, channel.name, channel.id))
			.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
			.map((channel) => ({ name: channel.name || channel.id, value: channel.id })),
	};
}

export async function searchWebhooks(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const sessionId = getSelectedSessionId(this, 'webhooks');
	const webhooks = (await openWaApiRequest.call(
		this,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/webhooks`,
		{ sessionId },
	)) as Webhook[];
	return {
		results: webhooks
			.filter((webhook) => matches(filter, webhook.url, webhook.id, ...(webhook.events ?? [])))
			.map((webhook) => ({
				name: `${webhook.url} (${(webhook.events ?? []).join(', ')})`,
				value: webhook.id,
			})),
	};
}

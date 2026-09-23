/** OpenWA webhook event families, one per typed trigger node. */
export type EventFamily = 'message' | 'session' | 'group' | 'call' | 'status';

export interface EventInfo {
	name: string;
	value: string;
	description: string;
}

export const EVENT_FAMILIES: Record<EventFamily, EventInfo[]> = {
	message: [
		{
			name: 'Message Received',
			value: 'message.received',
			description: 'An incoming message arrives',
		},
		{
			name: 'Message Sent',
			value: 'message.sent',
			description: 'A message is sent from this session',
		},
		{
			name: 'Message Ack',
			value: 'message.ack',
			description: 'A delivery or read receipt updates a sent message',
		},
		{
			name: 'Message Failed',
			value: 'message.failed',
			description: 'WhatsApp reports that a sent message failed',
		},
		{
			name: 'Message Revoked',
			value: 'message.revoked',
			description: 'A message is deleted for everyone',
		},
		{
			name: 'Message Reaction',
			value: 'message.reaction',
			description: 'A reaction is added, changed or removed',
		},
		{
			name: 'Message Edited',
			value: 'message.edited',
			description: 'A message text or caption is edited',
		},
	],
	session: [
		{ name: 'Session Status', value: 'session.status', description: 'The session status changes' },
		{ name: 'Session QR', value: 'session.qr', description: 'A new pairing QR code is generated' },
		{
			name: 'Session Authenticated',
			value: 'session.authenticated',
			description: 'The session pairs and becomes ready',
		},
		{
			name: 'Session Disconnected',
			value: 'session.disconnected',
			description: 'The session disconnects on the WhatsApp side',
		},
		{
			name: 'Session Reconnect Loop',
			value: 'session.reconnect_loop',
			description: 'The session keeps failing to reconnect (every 5th attempt)',
		},
		{
			name: 'Session Restriction',
			value: 'session.restriction',
			description: 'WhatsApp places or lifts a restriction on the account',
		},
	],
	group: [
		{
			name: 'Group Join',
			value: 'group.join',
			description: 'Participants are added to or join a group',
		},
		{
			name: 'Group Leave',
			value: 'group.leave',
			description: 'Participants leave or are removed from a group',
		},
		{
			name: 'Group Update',
			value: 'group.update',
			description: 'Group name, description or settings change',
		},
		{
			name: 'Group Join Request',
			value: 'group.join_request',
			description: 'Someone asks to join a group you administer',
		},
	],
	call: [
		{
			name: 'Call Received',
			value: 'call.received',
			description: 'An incoming call starts ringing',
		},
		{
			name: 'Call Accepted',
			value: 'call.accepted',
			description: 'A call was answered (Baileys engine only)',
		},
		{
			name: 'Call Rejected',
			value: 'call.rejected',
			description: 'A call was declined (Baileys engine only)',
		},
		{
			name: 'Call Missed',
			value: 'call.missed',
			description: 'A call was not picked up (Baileys engine only)',
		},
	],
	status: [
		{
			name: 'Status Received',
			value: 'status.received',
			description: 'A contact posts a status update (story)',
		},
		{
			name: 'Presence Update',
			value: 'presence.update',
			description: 'A subscribed chat comes online, starts typing or stops',
		},
	],
};

/** Every event, for the general trigger. */
export const ALL_EVENTS: EventInfo[] = Object.values(EVENT_FAMILIES).flat();

/** Subscribes to every event, including those added to the gateway later. */
export const ALL_EVENTS_WILDCARD = '*';

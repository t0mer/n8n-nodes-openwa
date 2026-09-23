# @t0mer/n8n-nodes-openwa

An [n8n](https://n8n.io/) community node that sends WhatsApp messages through a self-hosted OpenWA gateway.

It sends text, media, locations, polls, contact cards and templates to **contacts** and **groups**; replies to, reacts to, forwards, edits, deletes, pins and stars messages; reads message history and downloads media; manages text templates and groups (create, participants, admins, join requests, invite links, settings, picture); posts and reads status updates (stories); updates the account profile; and looks up and manages contacts (list, get, check a number, profile picture, block/unblock, resolve a phone number). It can also be used as a tool by n8n AI Agents.

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Triggers](#triggers)
- [Chat ID formats](#chat-id-formats)
- [Size limits](#size-limits)
- [Error handling](#error-handling)
- [Example workflows](#example-workflows)
- [Development](#development)
- [License](#license)

## Prerequisites

- A running OpenWA instance, reachable from your n8n server.
- An OpenWA **API key**.
- At least one OpenWA **session** that is connected (status `ready`) to a WhatsApp account.
- n8n 1.x or later (self-hosted or Cloud).

## Installation

### Community Nodes (recommended)

1. In n8n, open **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `@t0mer/n8n-nodes-openwa` and confirm.

> The unscoped `n8n-nodes-openwa` on npm is a different, unrelated package. Use the scoped name above.

See the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details.

### Manual install (self-hosted Docker)

Install the package into a folder on the host and point n8n at it with `N8N_CUSTOM_EXTENSIONS`:

```bash
mkdir -p ~/n8n-custom && cd ~/n8n-custom
npm install @t0mer/n8n-nodes-openwa
```

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_CUSTOM_EXTENSIONS: /home/node/custom-nodes
    volumes:
      - ~/n8n-custom/node_modules/@t0mer/n8n-nodes-openwa:/home/node/custom-nodes/n8n-nodes-openwa
```

Restart n8n after installing or upgrading.

## Credentials

Create an **OpenWA API** credential:

| Field | Description |
|---|---|
| **Base URL** | The URL of your OpenWA gateway, e.g. `https://wa.example.com`. Don't include `/api`; a trailing slash is removed automatically. |
| **API Key** | Your OpenWA API key, sent in the `X-API-Key` header. |

When you save, n8n tests the credential by calling `POST /api/auth/validate`. A wrong key fails with `Authentication failed — check your OpenWA API key`.

## Operations

### Message

| Operation | OpenWA endpoint | Extra fields |
|---|---|---|
| Send Text | `send-text` | Text; options: Link Preview, Mentions |
| Send Image | `send-image` | Media, Caption |
| Send Video | `send-video` | Media, Caption |
| Send Audio | `send-audio` | Media, Send as Voice Note |
| Send Document | `send-document` | Media, Caption, File Name |
| Send Sticker | `send-sticker` | Media |
| Send Location | `send-location` | Latitude, Longitude; options: Location Name, Address |
| Send Poll | `send-poll` | Poll Question, Poll Options (2–12, all different), Allow Multiple Answers |
| Send Template | `send-template` | Template, Variables; options: Link Preview, Mentions |
| Reply | `reply` | Message ID, Text; option: Mentions |
| React | `react` | Message ID, Emoji (empty removes your reaction) |
| Forward | `forward` | Message ID, Source Chat (the recipient is the destination) |
| Edit | `edit` | Message ID, Text (the new text); option: Mentions |
| Delete | `delete` | Message ID, Delete for Everyone (default on) |
| Vote Poll | `vote-poll` | Message ID (the poll), Selected Options (empty withdraws your vote) |
| Send Contact Card | `send-contact` | Contact Name, Contact Phone Number |
| Pin / Unpin | `pin` / `unpin` | Message ID; Pin Duration (24 hours, 7 days or 30 days) |
| Star / Unstar | `star` | Message ID. Best-effort on whatsapp-web.js, which may silently ignore it. |
| Get Many | `GET /messages` | Return All or Limit; filters: Chat, Sender, Include Media. One item per message, newest first. No recipient needed. |
| Download Media | `GET /messages/{chatId}/{messageId}/media` | Message ID, Put Output File in Field (default `data`). Outputs the file as binary data. |
| Get Reactions | `GET /messages/{chatId}/{messageId}/reactions` | Message ID. One item per emoji, with who reacted. |
| Get Chat History | `GET /messages/{chatId}/history` | Live from WhatsApp (not the gateway's store): Limit (up to 100, or 2000 with Deep), Include Media (not with Deep). One item per message. |

Common fields:

- **Session**: pick a session from the list (shows name and status) or enter its ID.
- **Recipient Type**: `Contact` or `Group`.
  - **Phone Number** (contact): international format. `+`, spaces, dashes and parentheses are stripped and `@c.us` is appended. `+972 50-123-4567` becomes `972501234567@c.us`.
  - **Group**: pick a group of the selected session from the list, or enter its ID (must end with `@g.us`).
- **Media Source** (media operations):
  - `URL`: the gateway downloads the file itself.
  - `Binary Data`: sends the file from a binary field of the input item (default field `data`), e.g. from an HTTP Request or Read/Write Files from Disk node. The mimetype and file name come from the binary metadata.
- **Message ID** (Reply, React, Forward, Edit, Delete, Vote Poll, Pin, Star, Download Media): the `messageId` returned when the message was sent, or `waMessageId` (not `id`) from Get Many. The recipient must be the chat that contains the message. You can only edit messages sent by this account.
- **Options → Check Number Exists** (contacts only, operations that send a new message): looks the number up with `GET /contacts/check/{number}` before sending and fails the item if it is not on WhatsApp. OpenWA otherwise accepts sends to unregistered numbers without error.
- **Options → Reply To Message ID** (Send Text, media, Location, Poll, Contact Card): quote a message in the same chat, turning the send into a reply.
- **Send Audio → Convert to Voice Note** (shown when Send as Voice Note is on): the gateway converts the audio (MP3, M4A, WAV, …) to Ogg/Opus before sending, so it plays as a voice note. Needs media conversion (ffmpeg) enabled on the gateway; otherwise the node fails with a retryable 503.
- **Options → Mentions** (Send Text, Reply, Edit, Send Template): comma-separated numbers to @mention. The text must contain a matching `@<number>` token for each one, e.g. `Hi @972501234567`.

Each item outputs the OpenWA response:

```json
{ "messageId": "true_972501234567@c.us_3EB0123456789", "timestamp": 1758585600 }
```

A `messageId` means the gateway accepted the message. It does not confirm delivery.

List operations output one item per entry, and **no items** when the list is empty, so the next node doesn't run. Turn on the node's **Always Output Data** setting if a workflow must continue either way. React, Delete and Vote Poll output `{ "success": true }`.

### Chat

| Operation | OpenWA endpoint | Fields / output |
|---|---|---|
| Get Many | `GET /chats` | Return All or Limit. One item per chat (`id`, `name`, `kind`, `unreadCount`, `archived`, `pinned`, `muted`, …). |
| Mark as Read / Mark as Unread | `POST /chats/read`, `/unread` | Mark as Read can take specific Message IDs. |
| Send Chat State | `POST /chats/typing` | Typing, Recording, or Stop |
| Archive / Unarchive | `POST /chats/archive` | — |
| Pin / Unpin | `POST /chats/pin` | — |
| Mute / Unmute | `POST /chats/mute` | Mute For: 8 hours, 1 week, or until a date (read in the workflow's timezone) |
| Subscribe to Presence | `POST /presence/subscribe` | Needed for the `presence.update` trigger event and for Get Presence (not supported on every engine) |
| Get Presence | `GET /presence/{chatId}` | The last reported online/typing state. `participants` is empty when nothing was reported yet. |
| Delete | `POST /chats/delete` | Removes the chat from the list. Can't be undone. |
| Clear Messages | `DELETE /chats/{chatId}/messages` | Deletes every message, keeping the chat. Can't be undone. |

- **Chat**: a phone number, a contact ID (`@c.us` / `@lid`) or a group ID (`@g.us`).
- Some gateway operations, such as Mute, only accept the chat's own ID. If an operation fails for a phone number, use the chat's `id` from Chat → Get Many (often `…@lid`).

### Call

| Operation | OpenWA endpoint | Fields / output |
|---|---|---|
| Reject | `POST /calls/{callId}/reject` | Call ID, e.g. `{{ $json.data.callId }}` from the OpenWA Call Trigger |
| Create Link | `POST /calls/link` | Call Type (voice or video), Start Time (empty means now, read in the workflow's timezone). Outputs `{ link }`. |

### Contact

| Operation | OpenWA endpoint | Output |
|---|---|---|
| Block | `POST /contacts/{contactId}/block` | `{ success, message }` |
| Check Number | `GET /contacts/check/{number}` | `{ number, exists, whatsappId }` |
| Get | `GET /contacts/{contactId}` | The contact (`id`, `number`, `name`, `pushName`, `isMyContact`, `isBlocked`, `profilePicUrl`) |
| Get Many | `GET /contacts` | One item per contact. Use **Return All**, or **Limit** (default 50). |
| Get Phone Number | `GET /contacts/{contactId}/phone` | `{ contactId, phone }`. Resolves an ID such as an `@lid` to a phone number; `phone` is `null` when the gateway doesn't know it. |
| Get Profile Picture | `GET /contacts/{contactId}/profile-picture` | `{ url }`. `url` is `null` when the contact has no picture or hides it. |
| Unblock | `DELETE /contacts/{contactId}/block` | `{ success, message }` |
| Save | `PUT /contacts/{contactId}` | First Name, Last Name. Adds to the address book or renames. |
| Remove | `DELETE /contacts/{contactId}` | Removes from the address book (the chat is kept) |
| Get Blocked | `GET /contacts/blocked` | One item per blocked contact, `{ id }` |
| Get Profile Pictures | `GET /contacts/profile-pictures` | Contacts (up to 50). One item per contact, `{ contactId, url }` (`url` is `null` when hidden or unset). |

- **Contact**: pick a contact of the selected session from the list (searchable by name, number or ID), or enter a phone number or a chat ID ending in `@c.us` or `@lid`.
- **Phone Number** (Check Number): international format; `@lid` IDs can't be checked.
- Block and Unblock change the WhatsApp account's state. Keep that in mind when giving the node to an AI Agent.

### Group

| Operation | OpenWA endpoint | Fields / output |
|---|---|---|
| Get Many | `GET /groups` | Return All, or Limit (default 50). One item per group. |
| Get | `GET /groups/{groupId}` | The group with its settings and participants |
| Get Participants | `GET /groups/{groupId}` | One item per member (`id`, `number`, `name`, `isAdmin`, `isSuperAdmin`) |
| Create | `POST /groups` | Group Name, Participants. Baileys engine only (whatsapp-web.js answers 501). |
| Update | `PUT /groups/{groupId}/subject`, `/description` | Name and/or Description (empty clears it). Outputs `{ success, groupId, updated }`. |
| Add / Remove Participants | `POST` / `DELETE /groups/{groupId}/participants` | Participants. Output has a per-participant `results` list. |
| Promote / Demote Participants | `POST /groups/{groupId}/participants/promote`, `/demote` | Participants |
| Get Membership Requests | `GET /groups/{groupId}/membership-requests` | One item per pending join request |
| Approve / Reject Requests | `POST /groups/{groupId}/membership-requests/approve`, `/reject` | Requests: Specific Requesters (listed below) or All Pending Requests |
| Get Invite Link | `GET /groups/{groupId}/invite-code` | `{ inviteCode, inviteLink }` |
| Revoke Invite Link | `POST /groups/{groupId}/invite-code/revoke` | Old link stops working; outputs the new one |
| Get Join Info | `GET /groups/join-info?code=` | Invite Link (full link or code). Preview without joining. |
| Join | `POST /groups/join` | Invite Link. Outputs `{ success, groupId }`. |
| Get / Update Settings | `GET` / `PUT /groups/{groupId}/settings` | Only Admins Can Send Messages, Only Admins Can Edit Group Info, Who Can Add Members, Disappearing Messages (off, 24 hours, 7 days, 90 days) |
| Get / Set / Remove Picture | `GET` / `PUT` / `DELETE /groups/{groupId}/picture` | Set: Picture Source (URL, or a binary image up to 18 MB) |
| Leave | `POST /groups/{groupId}/leave` | — |

- **Group**: pick one from the list, or enter its ID (ending in `@g.us`).
- **Participants / Requesters**: comma-separated phone numbers or contact IDs (`@c.us`, `@lid`), or an array from an expression.
- Most changes need the session account to be a group admin. WhatsApp's refusal comes back as a 403 with the gateway's message.
- Leave, Remove Participants, Revoke Invite Link, Remove Picture, and Approve/Reject with All Pending Requests change the group and can't be undone from the node. Keep that in mind when giving the node to an AI Agent.

### Status

Status updates (stories) last 24 hours.

| Operation | OpenWA endpoint | Fields / output |
|---|---|---|
| Get Many | `GET /status` | One item per status visible to the session, newest first |
| Get From Contact | `GET /status/{contactId}` | Contact (phone number or contact ID). One item per status. |
| Post Text | `POST /status/send-text` | Text; options: Background Color, Font, Recipients |
| Post Image / Post Video | `POST /status/send-image`, `/send-video` | Media Source (URL, or binary up to 18 MB of the matching type), Caption; option: Recipients |
| Post Voice | `POST /status/send-voice` | Media Source, Convert to Voice Note (on by default); options: Background Color, Recipients |
| Delete | `DELETE /status/{statusId}` | Status ID (one of your own) |
| Download Media | `GET /status/{statusId}/media` | Status ID, Put Output File in Field. Outputs the file as binary data. |

- Post operations output `{ statusId, timestamp, expiresAt }`.
- **Recipients** (up to 256 phone numbers or contact IDs): the Baileys engine posts **only** to this list, so it's effectively required there. whatsapp-web.js ignores it and uses the account's status privacy settings.
- **Post Voice → Convert to Voice Note**: WhatsApp plays a voice status only as Ogg/Opus and the gateway doesn't transcode on its own, so the node converts it first by default. This needs media conversion (ffmpeg) on the gateway. Turn it off if your audio is already Ogg/Opus.

### Profile

Changes the session's own WhatsApp account.

| Operation | OpenWA endpoint | Fields |
|---|---|---|
| Set Name | `PUT /profile/name` | Name (up to 25 characters) |
| Set About | `PUT /profile/status` | About (up to 139 characters; empty clears it) |
| Set Picture | `PUT /profile/picture` | Picture Source (URL, or a binary image up to 18 MB) |
| Remove Picture | `DELETE /profile/picture` | — |
| Set Presence | `PUT /presence` | Online on/off. An always-online linked device suppresses the phone's notifications; go offline to get them back. |

### Template

Text templates are stored on the gateway per session. Placeholders in double curly braces, e.g. `{{name}}`, are filled from the **Variables** of Message → Send Template.

| Operation | OpenWA endpoint | Fields |
|---|---|---|
| Create | `POST /templates` | Name, Body; additional: Header, Footer |
| Delete | `DELETE /templates/{id}` | Template. Outputs `{ success, id }`. |
| Get | `GET /templates/{id}` | Template |
| Get Many | `GET /templates` | Return All, or Limit (default 50) |
| Update | `PUT /templates/{id}` | Template; at least one of Name, Body, Header, Footer |

- **Template**: pick one from the list, or enter its ID.
- Template names are unique per session. Creating or renaming to a name that exists fails with the gateway's message.

## Triggers

Trigger nodes start a workflow when OpenWA reports an event. On activation, a trigger registers a webhook for its session on the gateway, with a secret it generates. On deactivation, it deletes the webhook. There's one trigger per event family, plus a general one:

| Node | Events |
|---|---|
| **OpenWA Message Trigger** | `message.received`, `message.sent`, `message.ack`, `message.failed`, `message.revoked`, `message.reaction`, `message.edited` |
| **OpenWA Session Trigger** | `session.status`, `session.qr`, `session.authenticated`, `session.disconnected`, `session.reconnect_loop`, `session.restriction` |
| **OpenWA Group Trigger** | `group.join`, `group.leave`, `group.update`, `group.join_request` |
| **OpenWA Call Trigger** | `call.received`, `call.accepted`, `call.rejected`, `call.missed` (only `call.received` on whatsapp-web.js) |
| **OpenWA Status & Presence Trigger** | `status.received`, `presence.update` (only for chats you subscribed to presence for) |
| **OpenWA Events Trigger** | Any of the above, or **All Events** (`*`) |

Each run outputs one item with the OpenWA delivery:

```json
{
  "event": "message.received",
  "timestamp": "2026-09-23T10:00:00.000Z",
  "sessionId": "…",
  "idempotencyKey": "msg_…",
  "deliveryId": "dlv_…",
  "data": { "id": "…", "from": "…", "body": "Hi", "type": "chat", "isGroup": false }
}
```

**The gateway must be able to reach n8n.** OpenWA refuses webhook URLs on private or local addresses (`localhost`, `192.168.x.x`, …). If activation fails with *"refused this n8n webhook URL"*, you have two options:
- expose n8n on a public URL and set n8n's `WEBHOOK_URL` to it; or
- add the n8n host to `SSRF_ALLOWED_HOSTS` on the gateway.

Each session can have up to 16 webhooks. Every active trigger uses one, and so does a trigger listening for a test event (removed when the test ends). Deliveries for another session are ignored.

**Options:**
- **Verify Signature** (on by default): each delivery's `X-OpenWA-Signature` (HMAC-SHA256 of the raw body) is checked against the trigger's secret. Mismatches get `401` and don't run the workflow.
  - The secret is derived from your API key and the webhook URL, so nothing secret is stored in the workflow.
  - Rotating the API key re-registers the webhook on the next activation.
- **Ignore Duplicate Deliveries** (on by default): OpenWA delivers *at least once* and retries failures, so the same event can arrive twice. The trigger drops repeats of an idempotency key it has seen recently.
  - This is best effort: a retry that arrives while the first run is still in progress, or that lands on another n8n worker in queue mode, can still get through.
  - For strict once-only processing, dedupe on `idempotencyKey` in your own storage.
- **Retry Count**: delivery attempts per event, 0–5 (default 3).
- **Message filters** (Message Trigger and OpenWA Events Trigger): Only From, Only In Chats, Body Contains, Chat Type (direct or groups) and Ignore Messages From Me. OpenWA applies them on the gateway, so filtered-out events never reach n8n.
  - They only work with `message.received`, `message.sent`, `message.edited` and `message.revoked`. Other events carry no sender or text, so the gateway would silently drop them.
  - The node refuses filters combined with any other event, including All Events.

To try a trigger, click **Listen for test event** (n8n registers a temporary webhook), then send a WhatsApp message to the session's number, or from it.

## Chat ID formats

| Recipient | Format | Example |
|---|---|---|
| Contact | `<digits>@c.us` | `972501234567@c.us` |
| Contact (linked ID) | `<id>@lid` | `123456789012345@lid` |
| Group | `<id>@g.us` | `120363012345678901@g.us` |

You can enter a phone number (normalized for you), or a full `@c.us` / `@lid` ID, which is used unchanged.

## Size limits

| Source | Limit | Why |
|---|---|---|
| Binary Data | ~18 MB | OpenWA's request body limit (`BODY_SIZE_LIMIT`) is 25 MB by default, and base64 encoding inflates files by about a third. The node rejects larger files before sending. |
| URL | 50 MiB | OpenWA's media download cap (`MEDIA_DOWNLOAD_MAX_BYTES`). |

To send files larger than 18 MB, host them somewhere the gateway can reach and use the URL source.

## Error handling

| HTTP status | Meaning | Message in n8n |
|---|---|---|
| 400 | Session not active, validation failed, or URL unreachable | The gateway's own message |
| 401 | Bad API key | Check your OpenWA API key |
| 404 | Session not found | Names the session |
| 409 | Session not `ready` (reconnecting or reloading) | Transient, retry shortly |
| 413 | Media too large | States the limits above |
| 501 | Not supported by the active engine | The gateway's own message |
| 503 | WhatsApp, a proxy or media conversion is unavailable | Retryable |

With **Settings → On Error → Continue**, a failed item outputs `{ "error": "<message>" }` and the rest of the items are still sent.

## Example workflows

**Alert a group when a form is submitted**

`Form Trigger` → `OpenWA` (Send Text, Recipient Type: Group, Text: `New lead: {{ $json.name }}`)

**Send a generated PDF to a customer**

`HTTP Request` (download the invoice, Response Format: File) → `OpenWA` (Send Document, Media Source: Binary Data, File Name: `invoice-{{ $json.id }}.pdf`, Caption: `Your invoice`)

**Voice note from a URL**

`OpenWA` (Send Audio, Media Source: URL, Media URL: `https://example.com/note.ogg`, Send as Voice Note: on). Use Ogg/Opus audio for voice notes to play reliably.

## Development

Requires Node.js 24 LTS.

```bash
npm install
npm run dev     # n8n with the node loaded and hot reload, at http://localhost:5678
npm test        # unit tests (vitest)
npm run lint
npm run build
```

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)

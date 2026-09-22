# n8n-nodes-openwa

An [n8n](https://n8n.io/) community node that sends WhatsApp messages through a self-hosted OpenWA gateway.

It sends text, images, videos, audio (including voice notes), documents and stickers to **contacts** and **groups**, and looks up and manages contacts (list, get, check a number, profile picture, block/unblock, resolve a phone number). It can also be used as a tool by n8n AI Agents.

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
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
3. Enter `n8n-nodes-openwa` and confirm.

See the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details.

### Manual install (self-hosted Docker)

Install the package into a folder on the host and point n8n at it with `N8N_CUSTOM_EXTENSIONS`:

```bash
mkdir -p ~/n8n-custom && cd ~/n8n-custom
npm install n8n-nodes-openwa
```

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_CUSTOM_EXTENSIONS: /home/node/custom-nodes
    volumes:
      - ~/n8n-custom/node_modules/n8n-nodes-openwa:/home/node/custom-nodes/n8n-nodes-openwa
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

Common fields:

- **Session**: pick a session from the list (shows name and status) or enter its ID.
- **Recipient Type**: `Contact` or `Group`.
  - **Phone Number** (contact): international format. `+`, spaces, dashes and parentheses are stripped and `@c.us` is appended. `+972 50-123-4567` becomes `972501234567@c.us`.
  - **Group**: pick a group of the selected session from the list, or enter its ID (must end with `@g.us`).
- **Media Source** (media operations):
  - `URL`: the gateway downloads the file itself.
  - `Binary Data`: sends the file from a binary field of the input item (default field `data`), e.g. from an HTTP Request or Read/Write Files from Disk node. The mimetype and file name come from the binary metadata.
- **Options → Check Number Exists** (contacts only): looks the number up with `GET /contacts/check/{number}` before sending and fails the item if it is not on WhatsApp. OpenWA otherwise accepts sends to unregistered numbers without error.
- **Options → Mentions** (text): comma-separated numbers to @mention. The text must contain a matching `@<number>` token for each one, e.g. `Hi @972501234567`.

Each item outputs the OpenWA response:

```json
{ "messageId": "true_972501234567@c.us_3EB0123456789", "timestamp": 1758585600 }
```

A `messageId` means the gateway accepted the message. It does not confirm delivery.

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

- **Contact**: pick a contact of the selected session from the list (searchable by name, number or ID), or enter a phone number or a chat ID ending in `@c.us` or `@lid`.
- **Phone Number** (Check Number): international format; `@lid` IDs can't be checked.
- Block and Unblock change the WhatsApp account's state. Keep that in mind when giving the node to an AI Agent.

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
| 503 | Upstream or proxy failure | Retryable |

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

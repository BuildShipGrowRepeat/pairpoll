---
seoTitle: "Pairpoll REST API reference | Pairpoll"
description: "Use Pairpoll's REST API to authenticate creators, create polls, upload media, manage voting, read results and export data."
title: "REST API reference"
nav: "API"
order: 4
---

The base path is `https://pairpoll.com/api/v1`. For a local server, use `http://localhost:4321/api/v1`. JSON uses UTF-8. Send a creator API key with every creator request:

```sh
export PAIRPOLL_API_URL=https://pairpoll.com
export PAIRPOLL_API_KEY=ppk_your_key
curl "$PAIRPOLL_API_URL/api/v1/whoami" \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY"
```

Browser sessions also work on creator endpoints. Session-only account and key endpoints do not accept API keys.

Errors have this shape:

```json
{"error":{"code":"poll_not_found","message":"This poll was not found."}}
```

Successful empty operations return `{"ok":true}`. Poll and voter responses use `Cache-Control: no-store`.

## Create and upload

Create a draft:

```sh
curl "$PAIRPOLL_API_URL/api/v1/polls" \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind":"image",
    "question":"Which image is strongest?",
    "topSize":3,
    "playsOnce":false,
    "voterCap":50
  }'
```

Keep the returned `id` for the next requests, for example `POLL_ID=<id>`. `kind` is `image` or `video`. `question` is 1 to 200 characters. `topSize` is 1, 3 or 5. `voterCap` is 1 to 200. `playsOnce` can be true only for videos.

Upload one raw file per request. Do not use multipart:

```sh
curl -X POST "$PAIRPOLL_API_URL/api/v1/polls/$POLL_ID/items" \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY" \
  -H "Content-Length: $(wc -c < one.png)" \
  -H "X-File-Name: one.png" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @one.png
```

Files are JPEG, PNG, WebP or GIF up to 10 MB, or MP4 or WebM up to 30 MB. The server checks the bytes, not the extension. Add 2 to 16 items of one kind.

For a video poster, upload raw image bytes to `POST /polls/:id/items/:item/poster` with `Content-Length`.

Open the ready draft:

```sh
curl -X POST "$PAIRPOLL_API_URL/api/v1/polls/$POLL_ID/open" \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY"
```

The response includes `code`. The voter link is `<PAIRPOLL_API_URL>/p/<code>`. Opening freezes settings and items.

## Creator endpoints

All endpoints below accept a creator session or bearer API key unless marked session-only.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health. No authentication. |
| `GET` | `/whoami` | Return the creator email. |
| `GET`, `POST` | `/polls` | List polls or create a draft. |
| `GET`, `PATCH`, `DELETE` | `/polls/:id` | Read, edit a draft or delete a poll. |
| `POST` | `/polls/:id/duplicate` | Copy settings and files to a new draft. |
| `POST` | `/polls/:id/items` | Upload one raw item. |
| `POST` | `/polls/:id/items/:item/poster` | Upload one video poster. |
| `DELETE` | `/polls/:id/items/:item` | Remove a draft item. |
| `POST` | `/polls/:id/items/reorder` | Send `{ids:[...]}` with every item once. |
| `POST` | `/polls/:id/open` | Open a ready draft. |
| `POST` | `/polls/:id/close` | Close voting permanently. |
| `GET` | `/polls/:id/results` | Read ranking and voter runs. |
| `GET` | `/polls/:id/export?format=json\|csv` | Export results. |
| `POST` | `/polls/:id/sharing` | Send `{enabled,shareNames?}` for a public result link. |
| `DELETE` | `/polls/:id/runs/:run` | Remove one voter result. |

An unknown, expired, deleted or other creator's poll returns `404 poll_not_found`.

## Results

```sh
curl "$PAIRPOLL_API_URL/api/v1/polls/$POLL_ID/results" \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY"
```

The response contains `poll`, `items`, `ranking`, `runs` and `finished`. Ranking entries have `id`, `rank`, `points` and `firsts`. Runs include the voter name, state and top item IDs. Only finished runs count in the overall ranking. Equal points and first places share a rank.

## CLI device sign-in

| Method | Path | Access and response |
| --- | --- | --- |
| `POST` | `/device` | Public. Returns `{secret,code,expiresAt}`. |
| `GET` | `/device` | Bearer device secret. Returns pending, expired or `{status:"approved",key}` once. |
| `POST` | `/device/approve` | Browser session only. Send `{code}`. |

The device secret and API key never belong in a URL.

## Browser account and keys

| Method | Path | Access |
| --- | --- | --- |
| `POST` | `/auth/link` | Public email sign-in request with Turnstile. |
| `POST` | `/auth/consume` | Consume a sign-in token and set the session cookie. |
| `POST` | `/auth/logout` | Browser session only. |
| `GET`, `POST` | `/keys` | Browser session only. |
| `DELETE` | `/keys/:id` | Browser session only. |
| `GET` | `/account/me` | Browser session only. |
| `POST` | `/account/logout-everywhere` | Browser session only. |
| `DELETE` | `/account` | Browser session only. |

Cookie mutations require an `Origin` that exactly matches the request origin.

## Voting, shared results and media

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/public/:code` | Read the public poll state and item IDs. |
| `POST` | `/public/:code/join` | Set the voter cookie, then admit or resume a voter. |
| `GET` | `/public/:code/me` | Read the current voter state. |
| `POST` | `/public/:code/events` | Record a played or vote event. |
| `POST` | `/public/:code/report` | Report a poll. |
| `GET` | `/shared/:code` | Read enabled shared results. |
| `GET`, `HEAD` | `/media/:id` | Read media for a live poll, with single-range support. |

Voter endpoints use the opaque HttpOnly voter cookie. Keep the same cookie across requests. Joining requires a Turnstile token for action `join`.

## Limits and lifecycle

Accounts can create 10 polls per UTC day, keep 20 unexpired polls and upload 1 GB per UTC day. Polls expire 30 days after creation. Closing is final. Deletion denies access at once and queues file cleanup.

See the repository's [docs/API.md](https://github.com/BuildShipGrowRepeat/pairpoll/blob/main/docs/API.md) for every validation and error code.

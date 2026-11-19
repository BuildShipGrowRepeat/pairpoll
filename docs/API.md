# Pairpoll REST API

The base path is `/api/v1`. All times are Unix milliseconds unless marked otherwise. JSON is UTF-8. Responses containing poll or voter data use `Cache-Control: no-store`. Successful deletion and other empty operations return `{"ok":true}`. Poll deletion removes access immediately; file and row cleanup happens later.

Creator endpoints accept `Authorization: Bearer <api-key>` or the browser session cookie. Session-only endpoints do not accept API keys. Voter endpoints use an HttpOnly voter cookie; keep the same cookie across requests. Cookies are Secure and SameSite=Lax. Any mutation carrying cookies must send an `Origin` exactly matching the request origin. Sign-in consumption and joining also require this Origin because they set cookies. Browser fetch sends Origin on these POST requests. Browser and bearer clients must use HTTPS outside local development.

Errors are JSON: `{"error":{"code":"poll_not_found","message":"This poll was not found.","details":...}}`. `details` is optional. Unsupported methods return 405 `method_not_allowed` and an `Allow` header. Unknown endpoints return 404 `not_found`. Invalid JSON returns 400 `invalid_json`; JSON over 64 KB returns 413 `request_too_large`. Missing or invalid creator authentication returns 401 `authentication_required`; session-only endpoints use 401 `session_required`. Cookie mutations with the wrong or absent Origin return 403 `invalid_origin`. Unexpected failures return 500 `internal_error`.

## Data

A poll has `id`, `code`, `kind` (`image` or `video`), `question`, `topSize` (1, 3, or 5), `playsOnce`, `voterCap`, `admittedCount`, `status` (`draft`, `open`, or `closed`), `createdAt`, `expiresAt`, `shareCode` (string or null), and `shareNames`. A detailed poll also has `items`, ordered by `position`. Each item has `id`, `position`, `mime`, `bytes`, `mediaId`, `posterId` (string or null), and creator-visible `label`.

Poll creation requires `kind` and `question`. Defaults are `topSize: 3`, `playsOnce: false`, and `voterCap: 50`. Questions are 1–200 characters, voter caps 1–200. `playsOnce` can be true only for videos. Draft updates accept any subset of settings except changing `kind`. A poll expires 30 days after creation. The account limits are 10 new polls per UTC day, 20 unexpired polls, and 1 GB uploaded per UTC day. Files are JPEG, PNG, WebP or GIF up to 10 MB, or MP4 or WebM up to 30 MB. File type is checked from bytes.

A voter state has `revision`, `index`, `total`, `pair` (two item IDs or null), `played` (two booleans), and `ranking` (item IDs or null). Each event must send the current `revision` and `index`. A 409 `voter_state_conflict` contains the current state in `error.details` so the client can recover.

Results have `poll`, `items`, `ranking`, `runs`, and `finished`. Ranking entries contain `id`, `rank`, `points`, and `firsts`. Runs contain `id`, `name`, `createdAt`, `completedAt`, `status`, `index`, `total`, and `ranking`. Only finished runs count in the ranking. The shared result omits voter runs unless sharing names was enabled; then it contains only finished runs with `name` and `ranking`.

## Authentication and account

| Method and path | Access | Request and success response |
| --- | --- | --- |
| GET `/health` | Public | `{"ok":true}`. |
| GET `/whoami` | Creator | `{email}` for the browser session or API key. |
| POST `/auth/link` | Public | `{email, token}` where `token` is the Turnstile response for action `signin`. Always returns `{"ok":true}`, including invalid, throttled, blocked, or unverified requests. |
| POST `/auth/consume` | Sign-in token | `{token}` from the confirmation link. Sets a session cookie and returns `{email}`. 400 `invalid_link` if invalid, expired or used. |
| POST `/auth/logout` | Session | Revokes this session and clears the cookie. |
| POST `/device` | Public | Starts CLI sign-in; returns 201 `{secret, code, expiresAt}`. 429 `device_limit` if throttled. Keep the secret private. |
| GET `/device` | Device secret | Send `Authorization: Bearer <secret>`. Returns `{status:"pending"}`, `{status:"expired"}`, or `{status:"approved",key}`. The key is returned once. |
| POST `/device/approve` | Session | `{code}`; returns `{"ok":true}`. 400 `invalid_device_code` if invalid, expired, used or throttled. |
| GET `/keys` | Session | Array of `{id,name,createdAt}`. |
| POST `/keys` | Session | `{name}` (optional; defaults to `API key`). Returns 201 `{id,name,createdAt,key}`. Save the key now; it is shown only once. |
| DELETE `/keys/:id` | Session | Revokes the key. 404 `key_not_found`. |
| GET `/account/me` | Session | `{email}`. |
| POST `/account/logout-everywhere` | Session | Revokes all sessions and clears this cookie. API keys remain active. |
| DELETE `/account` | Session | Revokes credentials, denies access to polls and queues all account data and files for deletion; clears the cookie. |

## Creator polls

All routes in this section require a creator session or API key. An unknown, expired, deleted, or other creator's poll returns 404 `poll_not_found`.

| Method and path | Request and success response |
| --- | --- |
| GET `/polls` | Array of polls. |
| POST `/polls` | Poll settings; returns the detailed draft poll with 201. |
| GET `/polls/:id` | Detailed poll. |
| PATCH `/polls/:id` | Partial settings object; returns the detailed poll. Draft only. |
| DELETE `/polls/:id` | Queues the poll and files for deletion. |
| POST `/polls/:id/duplicate` | Copies settings and files to a new draft; returns the detailed poll with 201. |
| POST `/polls/:id/items` | Raw file bytes, `Content-Length` required, optional URL-encoded `X-File-Name`. Returns the item with 201. Draft only. Do not use multipart. |
| POST `/polls/:id/items/:item/poster` | Raw image bytes and `Content-Length`; returns the updated item with 201. Video drafts only; one poster per item. |
| DELETE `/polls/:id/items/:item` | Removes the item and queues its files for deletion. Draft only. |
| POST `/polls/:id/items/reorder` | `{ids:[...itemIds]}` containing every item once; returns the detailed poll. Draft only. |
| POST `/polls/:id/open` | Opens a draft with 2–16 ready items; returns the detailed poll. Settings and items freeze. |
| POST `/polls/:id/close` | Closes an open poll; returns the detailed poll. Closing is final. |
| GET `/polls/:id/results` | Results object, including voter names. |
| GET `/polls/:id/export?format=json` | Same results object. `format` defaults to `json`; `csv` returns a CSV attachment including voter names. |
| POST `/polls/:id/sharing` | `{enabled:boolean,shareNames?:boolean}`. Returns the detailed poll and its `shareCode`, or null when disabled. Requires an opened poll. The read-only page is `/results/<shareCode>`. |
| DELETE `/polls/:id/runs/:run` | Removes the voter and result. An admitted place is not freed. 404 `run_not_found`. |

Settings may return 400 `invalid_kind`, `invalid_text`, `invalid_top_size`, `invalid_plays_once`, `invalid_voter_cap`, or `invalid_settings`. Uploads may return 400 `empty_upload` or `upload_size_mismatch`, 411 `length_required`, 413 `upload_too_large`, 415 `unsupported_media`, or 502 `media_save_failed`. Item operations can return 404 `item_not_found`, 409 `item_limit`, `poster_not_allowed`, or `poster_exists`. Reordering can return 400 `invalid_item_order`. Mutations can return 409 `poll_frozen`, `poll_changed`, `poll_closed`, `poll_not_open`, or `items_not_ready`. Sharing can return 400 `invalid_sharing`; export can return 400 `invalid_format`. Creation or duplication can return 429 `poll_limit`; uploads and duplication can return 429 `upload_limit`. Duplication can return 502 `media_missing` or `media_copy_timeout`.

## Voting and shared results

| Method and path | Access | Request and success response |
| --- | --- | --- |
| GET `/public/:code` | Public | `{code,kind,question,topSize,playsOnce,status,items}`. Status can also be `full` or `expired`; draft and expired polls have no items. Items omit file labels. |
| POST `/public/:code/join` | Public | `{name,token}`, with a Turnstile response for action `join`. On the first call, sets the voter cookie and returns 202 `{status:"cookie_set"}` without consuming the Turnstile token; repeat the same request after the cookie is stored. The second call returns voter state; an existing browser run resumes. Name is 1–60 characters. |
| GET `/public/:code/me` | Voter cookie | Current voter state. |
| POST `/public/:code/events` | Voter cookie | `{type:"played",revision,index,itemId}` or `{type:"vote",revision,index,winner}`; returns the next voter state. Both videos must finish before voting when play-once is enabled. |
| POST `/public/:code/report` | Public | `{reason}`; reason is 1–500 characters. |
| GET `/shared/:code` | Public | Read-only shared results. 404 `poll_not_found` if the share link is disabled, expired or unknown. |
| GET or HEAD `/media/:id` | Public for open/closed polls; owner for drafts | Media bytes, with canonical content type, no-store and nosniff. Single `Range: bytes=...` requests return 206 and `Content-Range`; unsatisfiable ranges return 416. HEAD has no body. Unknown or inaccessible media returns 404 `media_not_found` for GET and an empty 404 for HEAD. |

Voting may return 400 `invalid_text` or `invalid_event`, 401 `voter_cookie_required`, 403 `turnstile_failed`, 404 `poll_not_found` or `run_not_found`, 409 `poll_full`, `poll_closed`, `poll_not_open`, or `voter_state_conflict`, 410 `poll_expired` or `run_deleted`, and 429 `join_limit`. Reports can return 400 `invalid_text`, 404 `poll_not_found`, or 429 `too_many_reports`.

## Owner and local development

Owner routes require a browser session whose email is listed in `OWNER_EMAILS`. Other signed-in users receive 403 `owner_required`.

| Method and path | Request and success response |
| --- | --- |
| GET `/owner?offset=0` | `{counts,reports,accounts}`. Reports are paginated in groups of 100; offset must be a non-negative integer or 400 `invalid_offset` is returned. |
| POST `/owner/polls/:id/takedown` | Queues the poll and its files for deletion. 404 `poll_not_found`. |
| POST `/owner/accounts/:id/block` | Blocks the account and revokes its credentials. 404 `account_not_found`. |
| GET `/dev/mail` | Local development only, on localhost: array of `{email,link,createdAt}` for unexpired links. Otherwise 404 `not_found`. Do not expose this mailbox publicly. |

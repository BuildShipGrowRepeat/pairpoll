# Pairpoll: product spec

Pairpoll is a free, open-source web tool. A creator uploads a few videos or images, gets one link, and sends it to their own people. Each person sees the items two at a time and picks the better one. The creator gets each person's top list and an overall ranking. AI agents can do everything a creator can through an API, a CLI and an MCP server.

Owner: Vladimir Terekhov (personal project, "built at Attract Group"). Domain: pairpoll.com (not bought yet). Nothing is deployed or published until Vladimir says so. All work in this repository is local.

Items marked **Decided** were confirmed by Vladimir on 19 Nov 2026. Items marked **Assumed** are our best default; they are listed again in "Open questions" for him.

## Rule one: no over-engineering

Meet the requirement as simply as possible. No speculative abstractions, no configuration for imagined futures, no dependency for a few lines, no features outside this spec. Every UI element must earn its place. When unsure whether something is needed, leave it out and note it in your report. Reviews flag anything beyond this spec.

## Decided

- Free and open source first. Paid parts (plans, billing, teams) are out of scope until strangers use it.
- A person can create a poll in the browser. An agent can create one through the API, CLI or MCP server.
- Creators sign in by email with a one-time link, no password. Voters never sign in.
- Each creator can make API keys for their agents.
- A poll holds one kind of item: videos or images, 2 to 16 of them.
- Creator settings per poll, and nothing more: the question shown to voters, top size (1, 3 or 5), "each video plays once" on or off (videos only), and the maximum number of voters.
- No voter comments, no custom branding, no other voting formats.
- Abuse limits: invisible Cloudflare Turnstile check on sign-in and when a voter starts; caps per account; one run per browser per poll; a voter cap per poll; files and data deleted automatically after 30 days; the creator sees each voter (name, time) and can delete any entry.
- Hosting on Cloudflare. Media in R2.
- Organic search and AI-assistant visibility are a main goal. Launch page set: home, 8 use pages, 4 "free alternative to" pages, 3 guides, agent docs, About.
- About page names Vladimir Terekhov, Attract Group, and his other projects (getkira.com, viralix.video, milltrue.com) in one short line.
- Positioning: "a free poll for images and videos, ranked head to head". Not only for ads. Avoid the words "bracket", "tier list" and "rate my photos" as positioning.

## Assumed (confirm with Vladimir)

- Licence: MIT.
- Stack: one Cloudflare Worker built with Astro and its Cloudflare adapter; D1 (SQLite) for data; R2 for media; a cron trigger for the 30-day cleanup; TypeScript. Marketing pages are prerendered; app pages and API are server-rendered. Interactive parts are plain TypeScript in Astro pages, with no UI framework unless a builder shows a clear need. The scaffold builder verifies this against current official docs and installed versions and reports any change.
- Uploads go through the Worker into R2 (no S3 keys, works locally). Media is served by the Worker from R2 with HTTP Range support under unguessable keys.
- No transcoding. Videos: MP4 or WebM, up to 30 MB each. Images: JPEG, PNG, WebP or GIF, up to 10 MB each. The server checks size and real file type (magic bytes), not the file name.
- Poster stills for videos: the browser upload page and the CLI capture one frame and upload it with the video; when missing, the page shows the video's own first frame.
- Account caps: 10 new polls per day, 20 live polls. Voter cap per poll: default 50, maximum 200.
- Email sending and analytics providers are not chosen. Locally, the sign-in link is shown by a dev-only mailbox (console and a dev page). Keep one small function for "send email" and one place for an analytics snippet.
- MCP and API authentication is a bearer API key. OAuth for the Claude and ChatGPT chat apps comes after the first deploy, because it cannot be tested without a public URL.
- Chat apps cannot pass an attached video to a connector, and fetching files from URLs on the server is deferred (it opens the server to abuse). So the MCP tool that adds items returns a link to the browser upload page for that draft poll.
- Voter names are visible only to the poll's creator. Poll links are unlisted: `noindex`, unguessable code.
- A "Report this poll" link on every voter page, stored for the owner of the service to review.

## How voting works

The mechanics come from an earlier private prototype.

- A voter opens the poll link, reads the short rules, types a name and starts.
- The voter sees pairs. For videos with "plays once" on: each video plays once, with no replay, pause or seek, and the vote buttons appear after both have played. With it off, and for images, the voter can look freely.
- The knockout runs until the voter's top list (1, 3 or 5) is settled. The prototype's `replay` function derives the whole state from the list of votes; keep that design and generalise the top size and 2 to 16 items. Item order is shuffled per voter. Voters never see file names.
- A voter can close the page and resume in the same browser. At the end they see their own top list.
- Overall ranking: points per place in each voter's top list (top size minus place index), ties broken by number of first places. Same as the prototype.
- The creator's results page shows the overall ranking, each voter with status and top list, and the join link. The creator can delete a voter, close the poll, or delete the poll with its files.

## Technical contract (from the Astra spec review, accepted 19 Nov)

These bind every builder. Where a point depends on a current Cloudflare, Astro or MCP limit or API, verify it against current docs.

**Voting**
- Places are tournament placements. Top size K = min(chosen size, number of items). The logic must return exactly K places for every item count 2 to 16, every K in 1, 3, 5, and every bye arrangement; test all of them. The prototype's fifth-place rule is known to fail for some sizes: fix it, do not copy it.
- One row per voter run: seed, ordered votes, revision. The server computes the next pair and rejects a vote that is not for the current pair; writes are conditional on the revision; a conflicting retry returns the current state. Results are computed on read.
- "Plays once" means once per pair. A reload during a pair does not unlock voting without playback finishing; a video that fails to load offers a retry and is not counted as watched. Videos play with sound available and start on the voter's tap. Do not buffer both videos fully on phones.

**Poll lifecycle**
- draft, then open, then closed. Items and settings freeze when the poll first opens. Closed is final.
- Admission against the voter cap is atomic and counts every admitted run, finished or not. Deleting a voter removes their result but does not free a place.
- Only finished runs count in the overall ranking. Equal points and equal first places share a rank.
- A poll expires 30 days after creation. Expired or deleting polls deny access at once; cleanup of R2 objects and rows runs in bounded batches and retries until done (object references are kept until the object is gone). This covers posters, abandoned draft uploads and reports.

**Sign-in, sessions, keys**
- Sign-in tokens: random, stored hashed, short-lived, single use, consumed atomically by an explicit POST from a confirmation page (so mail scanners that open links do not sign anyone in). The sign-in request always answers the same way, and is rate-limited per email and per IP.
- Sessions and API keys are stored hashed and can be revoked. An API key is shown once. Creating or revoking keys needs a browser session, not a key.
- Session cookie: Secure, HttpOnly, SameSite=Lax. Every mutating request with a cookie checks the Origin. Every creator endpoint checks ownership.
- CLI login: the CLI starts a device request (expiring secret plus a short code), the signed-in user confirms the code in the browser, and the CLI exchanges the secret once for a key. The key never travels in a URL and is stored in a file only the user can read.

**Voters**
- A voter is recognised by an opaque HttpOnly cookie; a run is unique per poll and browser. This is best effort and the spec says so. Voter credentials never appear in URLs or in the creator's results.
- Turnstile is verified on the server (expected hostname and action). Joining is rate-limited per IP.

**Uploads and media**
- One file per request, streamed with an enforced byte ceiling; the type is read from a bounded prefix; failed uploads are cleaned up. Posters are optional and validated like images. Add a daily upload-bytes cap per account next to the poll caps.
- R2 stays private. Media is addressed by an opaque id and every request checks that the poll is live. Responses: correct single-range support (HEAD, 206, 416, Content-Range, Content-Length), canonical Content-Type, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` for now.

**Text**
- Names, questions and reports are length-limited plain text and always escaped on output. Reports are rate-limited.

**Data model (minimum)**: accounts; credentials (hash, account, kind: sign-in token, session or API key; expiry; revoked); device_requests; polls (owner, code, settings, status, admitted count, expiry); items (poll, position, object key, poster key, bytes, mime, status); runs (poll, browser hash, name, seed, votes, playback state, revision, completed, deleted); reports; usage (account, day, poll count, uploaded bytes).

**REST, under `/api/v1`** (C = creator session or key, S = browser session only, V = voter cookie):
- `POST /auth/link` public; `POST /auth/consume` token; `POST /auth/logout` S.
- `POST /device`, `GET /device` device secret; `POST /device/approve` S.
- `GET /keys`, `POST /keys`, `DELETE /keys/:id` S.
- `GET /polls`, `POST /polls` C; `GET`, `PATCH` (draft only), `DELETE /polls/:id` C.
- `POST /polls/:id/items`, `DELETE /polls/:id/items/:item` (draft only) C.
- `POST /polls/:id/open`, `POST /polls/:id/close` C; `GET /polls/:id/results` C; `DELETE /polls/:id/runs/:run` C.
- `GET /public/:code` public; `POST /public/:code/join` Turnstile; `GET /public/:code/me` V; `POST /public/:code/events` V (playback finished, vote); `POST /public/:code/report` public, throttled.
- `GET`, `HEAD /media/:id` live poll only.

The MCP tools call the same handlers as the REST API and keep no state of their own.

## Complete product (Vladimir, 19 Nov: "build what a complete platform needs")

Complete means every path a real creator, voter or service owner meets is finished, not that more voting features are added. The poll settings stay as decided. In scope:

- **Account:** a settings page with the email, sign out, sign out everywhere, and "delete my account and all my polls".
- **Polls:** edit a draft, reorder and remove items, preview as a voter before opening, duplicate a poll, close, delete. Clear empty, loading and error states.
- **Results:** live refresh, export as CSV and JSON, and an optional read-only results link the creator can switch on and off to show the outcome to others (no voter names on it unless the creator chooses).
- **Voter page states:** not found, not open yet, closed, full, expired, and "you already finished" with the voter's own top list.
- **Service owner:** an owner-only page (accounts listed in an `OWNER_EMAILS` setting) with the report queue, take down a poll, block an account, and simple counts (accounts, polls, runs, stored bytes).
- **Site basics:** 404 and error pages, favicon and app icons, Open Graph images, a contact and abuse address placeholder, terms and privacy drafts.

Out of scope still: payments, teams, voter comments, custom branding, other voting formats, webhooks, email notifications other than sign-in.

## Surfaces

| Path | What |
| --- | --- |
| `/` | Home |
| `/for/<use>` | 8 use pages: thumbnails, ad creatives, logos, designs, photos, product images, video cuts, app screenshots |
| `/alternatives/<tool>` | 4 pages: PickFu, PollUnit, Lyssna, OpinionX |
| `/guides/<slug>` | 3 guides: how voting in pairs works; how many voters you need; how to test ads before spending |
| `/docs`, `/docs/api`, `/docs/cli`, `/docs/mcp`, `/docs/agents` | Agent and developer docs, each also served as plain Markdown at the same path plus `.md` |
| `/llms.txt` | Index for AI agents |
| `/about`, `/terms`, `/privacy` | About; terms and privacy are drafts for Vladimir to review |
| `/signin` | Email sign-in |
| `/app` | Creator's polls |
| `/app/new` | Create a poll: kind, files, question, settings |
| `/app/polls/<id>` | Results and management |
| `/app/keys` | API keys |
| `/p/<code>` | Voter page |
| `/api/v1/*` | REST API (session cookie or bearer key) |
| `/mcp` | Remote MCP server (Streamable HTTP, bearer key) |

Agent access must cover: create a poll, add items (file upload for API and CLI; an upload-page link for MCP), open and close it, read results, list polls, delete a voter, delete a poll. The CLI lives in `packages/cli` (command `pairpoll`), signs in through a browser approval step that stores an API key, and can create a poll from a folder of files in one command. Publishing the CLI to npm is not done until Vladimir says so.

## Marketing pages

- Every factual claim about another tool must come from `docs/research.md` (with its source link) or be checked on that tool's own site first. No invented numbers, testimonials, user counts or logos.
- Use pages show a small live demo: a sample poll with original placeholder artwork made for this project, playable without sign-in, nothing stored.
- Copy is plain and short. Follow the humanizer skill at `~/.claude/skills/humanizer/SKILL.md`. Never use em dashes.
- Technical SEO: one title and description per page, canonical URLs, sitemap, robots.txt, Open Graph image, structured data where it truthfully applies, fast pages with little JavaScript.

## Quality bar

- Works well on a phone and on desktop. Voting is mobile first.
- Accessible: keyboard use, visible focus, labels, reduced-motion support.
- Tests that give real regression confidence: the knockout logic, the API's permission checks and limits, and one end-to-end browser test of create, vote, results. No mock-only or redundant tests.
- Typecheck, lint and tests pass before a milestone is reported done.

## Working rules for builders

- Stay inside this folder. Start nothing in Docker. Use the local Cloudflare simulators that ship with wrangler.
- Check current official docs (context7 or the vendor site) against installed versions before using a library API.
- Never print or commit secrets. Local secrets go in `.dev.vars`, which is git-ignored.
- Git: local commits only, staged by path (never `git add -A`), no remote, no push, no AI attribution in messages.
- Temporary files go in your scratch or `$TMPDIR`, never in the repository. Delete your own temporary files before you finish. Stop any server you started.
- Keep `docs/STATE.md` current (at most 100 lines): what works, how to run it, known gaps.

## Open questions for Vladimir

1. Licence: MIT?
2. Email provider for sign-in links (for example Resend or Cloudflare's email service).
3. Analytics (for example PostHog or Cloudflare Web Analytics).
4. OAuth so the Claude and ChatGPT chat apps can connect, after the first deploy.
5. Publishing the CLI to npm and the repository to GitHub, and under which accounts.
6. Terms, privacy and About text review.
7. Limits: file sizes, polls per day, 30-day deletion.

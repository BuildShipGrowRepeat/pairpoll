# State

Updated 19 Nov 2026. Everything in `docs/SPEC.md` is built. Live at https://pairpoll.com; code public at https://github.com/BuildShipGrowRepeat/pairpoll (MIT).

## Production (Cloudflare, Vladimir's account)

- Worker `pairpoll` on custom domain pairpoll.com (no `www`, no workers.dev URL), cron 03:00 daily, D1 `pairpoll` (weur), R2 `pairpoll-media` (weur), invisible Turnstile widget `pairpoll`.
- Secrets on the Worker: `TURNSTILE_SECRET_KEY`, `OWNER_EMAILS`, `RESEND_API_KEY`.
- Deploy from this checkout: `npx wrangler d1 migrations apply DB --remote` (if new migrations), `npm run build`, `npx wrangler deploy`. No staging environment.
- Email: sign-in links go through Resend's HTTP API (`src/server/email.ts`), sender `signin@pairpoll.com`, free plan shared with another of the owner's domains (3,000 emails a month, 100 a day in total). Domain verified in Resend (Ireland); DKIM, two CNAMEs and DMARC `p=none` are in Cloudflare DNS. Delivery to an outside address checked 19 Nov. Cloudflare Email Routing forwards `hello@pairpoll.com` to the owner.

## What exists

- One Cloudflare Worker (Astro 7 + `@astrojs/cloudflare`). `src/worker.ts` serves the site, OAuth provider and daily cleanup cron. D1 `DB` for data, R2 `MEDIA` for files, and KV `OAUTH_KV` for hashed OAuth clients, grants and tokens. Migrations `0001`–`0003`.
- Voting: `src/lib/knockout.ts` replays top-1/3/5 knockouts for 2–16 items (every size, top size and bye arrangement tested). Plays-once videos, resume in the same browser, voter cap, Turnstile on sign-in and join.
- REST API `/api/v1` (contract in `docs/API.md`): email sign-in, sessions, API keys, CLI device approval, polls, uploads, voting, results, CSV/JSON export, share links, media with ranges, account deletion, owner moderation.
- MCP: `/mcp`, stateless Streamable HTTP, eight tools (`create_poll`, `get_upload_link`, `open_poll`, `close_poll`, `get_results`, `list_polls`, `delete_voter`, `delete_poll`). Existing API keys still work. Claude and ChatGPT apps use OAuth 2.1 authorization code with PKCE S256, refresh tokens, resource indicators, CIMD or DCR, one MCP-only scope, consent, and connected-app revocation at `/app/keys`.
- CLI: `packages/cli` (`pairpoll`), no dependencies, not published. Device login, create from files or a folder (ffmpeg posters for videos), open, close, results (`--json`, `--csv`), list, delete-voter, delete, logout. Checks file sizes before creating a poll.
- Creator app: `/signin`, `/signin/confirm`, `/signin/device`, `/app`, `/app/new`, `/app/polls/<id>` (draft editor, then results), `/app/polls/<id>/preview`, `/app/keys`, `/app/account`, `/app/owner` (only for `OWNER_EMAILS`; others get 404).
- Voters: `/p/<code>` with every state (not open, closed, full, expired, finished, removed) and a report link; shared results `/results/<shareCode>`.
- Marketing: home, 9 use pages, 4 alternative pages, 4 guides, About, Terms, Privacy, 404, 500, docs (`/docs`, quick start, agents, CLI, API, MCP) with `.md` copies, `/docs.md`, `/llms.txt`, sitemap, robots, icons, `og.png`.
- Analytics: Cloudflare Web Analytics beacon on every page; Google Analytics 4 only after Accept in a blocking consent pop-up (Marketing, Docs and App layouts, not voter pages), choice in localStorage, "Cookie settings" in the footer. IDs `PUBLIC_GA_ID` and `PUBLIC_CF_BEACON_TOKEN` in `astro.config.mjs` (`env.schema`); empty turns each off.
- Pages rendered on request send `Cache-Control: no-store` and `frame-ancestors 'none'` (`src/middleware.ts`). All HTML sends `nosniff` and a `Referrer-Policy`; `public/_headers` also sets long caching for fonts and one day for icons and `og.png`.
- Design system: `docs/DESIGN.md`. Component preview `/design` exists only under `astro dev` (`src/dev/design.astro`); it is not in the build or the sitemap.
- Tests: unit (knockout), Worker-level against real local D1/R2 (`test/worker`), CLI (`packages/cli/test`), e2e (`e2e`: smoke and private-page headers, image poll with two voters, plays-once video poll with a reload, editor: failed autosave before opening, upload cancelled during draft creation, analytics consent pop-up).

## Try it locally

1. `npm install`, `cp .dev.vars.example .dev.vars` (Turnstile test keys; add `OWNER_EMAILS=you@example.com` to see the owner page), `npm run db:migrate:local`.
2. `npx astro dev --ignore-lock` (foreground; Astro 7 backgrounds plain `npm run dev` when it detects an agent, stop that with `npx astro dev stop`). Open http://localhost:4321.
3. Browser: `/signin`, enter any email, click "Open the sign-in link" (dev only, no mail is sent). Create a poll, open it, vote in a private window, watch the results update.
4. CLI: from the repo root `alias pairpoll="node $PWD/packages/cli/bin/pairpoll.js"`, `export PAIRPOLL_API_URL=http://localhost:4321`, `pairpoll login` (approve the code in the signed-in browser), then `pairpoll create ./folder --question "Which?" --open`. The key is saved in `~/.config/pairpoll/config.json` (mode 0600); `pairpoll logout` deletes the file.
5. MCP API key: create a key at `/app/keys`, then `claude mcp add --transport http pairpoll http://localhost:4321/mcp --header "Authorization: Bearer <key>"`. OAuth: build and run the workerd preview, then use MCP Inspector against its HTTPS tunnel; production chat apps use `https://pairpoll.com/mcp`. Setups are on `/docs/mcp`.
6. Gates: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. Stop any dev server on port 4321 before e2e; Playwright starts its own on fresh state in `.wrangler/e2e-state` (wiped each run, so rate limits never carry over; `npm run dev` data is untouched).

## Checked end to end (19 Nov, local dev server)

- CLI: device login approved in a headless browser, whoami, image poll from a folder with `--open`, two voters through the real voter page, results `--json`/`--csv`, list, close, delete, logout; a WebM poll with `--play-once` and ffmpeg posters. Key file 0600, folder 0700.
- MCP with the official client SDK 2.4.0: tool list, create, upload link (lands on that draft's editor, through sign-in when signed out), open, results, list, delete voter, close, delete. No key and a wrong key get 401. `claude mcp get` connects; `codex mcp add` works.
- OAuth in workerd: DCR, browser-bound consent transaction, authorization code + PKCE S256, token refresh, resource-bound MCP tool call, wrong verifier, code replay, redirect mismatch, grant revocation, account deletion, blocked account, token expiry and existing API-key access.
- Every curl and CLI example in the docs runs as written; all docs pages, their `.md` copies and `/llms.txt` load.
- An H.264 MP4 plays-once poll played to the end and was voted on in headless Chromium (revision 1243).
- Every page type at 1440x900 and 390x844: no overflow, broken images, console errors (other than Turnstile test-widget warnings) or dead internal links.

## Checked in production (19 Nov)

- Browser: email sign-in, image poll with uploads, reorder, preview, open, voter join with real Turnstile, vote, resume, results, shared results, close, keys, account and owner pages, CLI device login.
- OAuth with a test client: registration, consent, PKCE token, MCP tool calls, code replay revokes the grant.
- API, CLI and MCP: about 180 REST requests, 35 CLI runs and 30 MCP tool calls covering limits, validation, media ranges, export, sharing, duplicate and delete.
- All sitemap pages, internal and external links, docs `.md` copies.

## Not verified

- Real phones, Safari and Firefox, iOS video and sound rules.
- H.264 playback in browsers other than the headless Chromium above.
- Screen readers (labels, focus and keyboard paths were built, not tested with one).
- In production: the cron, a video poll, connector sign-in from the real Claude and ChatGPT apps.
- `astro dev` also serves repository files, so locally `/docs/api.md` returns `docs/API.md` (same path on a case-insensitive disk). The build serves the right page.

## Still needed

- Test Claude and ChatGPT connector sign-in against production (OAuth is deployed, not yet tried from the real apps).
- npm publish of the CLI (the docs then drop the repository alias).
- Vladimir's review of Terms, Privacy and About.
- `www.pairpoll.com` redirect.
- E2E on another machine: run `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to an installed Chromium.

## Open questions (from docs/SPEC.md)

1. (settled) No paid plan; sign-in emails go through Resend's free plan.
2. (settled) Licence MIT; email through Cloudflare.
3. (settled) Analytics: Google Analytics 4 with consent, plus Cloudflare Web Analytics.
4. (built) OAuth for Claude and ChatGPT apps; live verification from the real apps remains.
5. Publishing the CLI to npm and the repository to GitHub, and under which accounts.
6. Terms, privacy and About text review.
7. Limits: file sizes, polls per day, 30-day deletion.

## Versions

astro 7.4.13, @astrojs/cloudflare 14.4.9 (vite 8.3.8), @modelcontextprotocol/server 2.4.0, @cloudflare/workers-oauth-provider 1.2.4, zod 4.6.7, wrangler 4.165.0 (workerd 1.20261118.1), @cloudflare/vitest-plugin 1.8.5, vitest 5.1.1, @playwright/test 1.65.1, typescript 6.0.3 (`@astrojs/check` and typescript-eslint do not support 7 yet), eslint 10.15.0. Node 24.11.1, npm 11.7.0. Compatibility date 2026-11-01 with `nodejs_compat` and `global_fetch_strictly_public`. OAuth follows MCP authorization revision 2026-07-28.

## Stack notes

- Bindings: `import { env } from "cloudflare:workers"` (`Astro.locals.runtime` is gone). Binding types come from `npm run types` (git-ignored `worker-configuration.d.ts`).
- `session: false` and `imageService: "compile"` keep the adapter from adding KV and Images bindings.
- Worker tests use `@cloudflare/vitest-plugin` with a stub entry; they test server functions, not Astro routing or the `scheduled` entry.
- Codex `workspace-write` sandbox: typecheck and unit/Worker tests pass; e2e cannot run there (wrangler registry and Chromium launch are blocked).

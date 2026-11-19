# State

Updated 19 Nov 2026. Everything in `docs/SPEC.md` is built and runs locally. Nothing is deployed or published.

## What exists

- One Cloudflare Worker (Astro 7 + `@astrojs/cloudflare`). `src/worker.ts` serves the site and runs the daily cleanup cron. D1 `DB` for data, R2 `MEDIA` for files, migrations `0001`–`0002`.
- Voting: `src/lib/knockout.ts` replays top-1/3/5 knockouts for 2–16 items (every size, top size and bye arrangement tested). Plays-once videos, resume in the same browser, voter cap, Turnstile on sign-in and join.
- REST API `/api/v1` (contract in `docs/API.md`): email sign-in, sessions, API keys, CLI device approval, polls, uploads, voting, results, CSV/JSON export, share links, media with ranges, account deletion, owner moderation.
- MCP: `/mcp`, stateless Streamable HTTP, bearer API key only, eight tools (`create_poll`, `get_upload_link`, `open_poll`, `close_poll`, `get_results`, `list_polls`, `delete_voter`, `delete_poll`).
- CLI: `packages/cli` (`pairpoll`), no dependencies, not published. Device login, create from files or a folder (ffmpeg posters for videos), open, close, results (`--json`, `--csv`), list, delete-voter, delete, logout. Checks file sizes before creating a poll.
- Creator app: `/signin`, `/signin/confirm`, `/signin/device`, `/app`, `/app/new`, `/app/polls/<id>` (draft editor, then results), `/app/polls/<id>/preview`, `/app/keys`, `/app/account`, `/app/owner` (only for `OWNER_EMAILS`; others get 404).
- Voters: `/p/<code>` with every state (not open, closed, full, expired, finished, removed) and a report link; shared results `/results/<shareCode>`.
- Marketing: home, 8 use pages, 4 alternative pages, 3 guides, About, Terms, Privacy, 404, 500, docs (`/docs`, quick start, agents, CLI, API, MCP) with `.md` copies, `/docs.md`, `/llms.txt`, sitemap, robots, icons, `og.png`.
- Pages rendered on request send `Cache-Control: no-store` and `frame-ancestors 'none'` (`src/middleware.ts`).
- Design system: `docs/DESIGN.md`. Component preview `/design` exists only under `astro dev` (`src/dev/design.astro`); it is not in the build or the sitemap.
- Tests: unit (knockout), Worker-level against real local D1/R2 (`test/worker`), CLI (`packages/cli/test`), e2e (`e2e`: smoke and private-page headers, image poll with two voters, plays-once video poll with a reload, editor: failed autosave before opening, upload cancelled during draft creation).

## Try it locally

1. `npm install`, `cp .dev.vars.example .dev.vars` (Turnstile test keys; add `OWNER_EMAILS=you@example.com` to see the owner page), `npm run db:migrate:local`.
2. `npx astro dev --ignore-lock` (foreground; Astro 7 backgrounds plain `npm run dev` when it detects an agent, stop that with `npx astro dev stop`). Open http://localhost:4321.
3. Browser: `/signin`, enter any email, click "Open the sign-in link" (dev only, no mail is sent). Create a poll, open it, vote in a private window, watch the results update.
4. CLI: from the repo root `alias pairpoll="node $PWD/packages/cli/bin/pairpoll.js"`, `export PAIRPOLL_API_URL=http://localhost:4321`, `pairpoll login` (approve the code in the signed-in browser), then `pairpoll create ./folder --question "Which?" --open`. The key is saved in `~/.config/pairpoll/config.json` (mode 0600); `pairpoll logout` deletes the file.
5. MCP: create a key at `/app/keys`, then `claude mcp add --transport http pairpoll http://localhost:4321/mcp --header "Authorization: Bearer <key>"`. Codex and Cursor setups are on `/docs/mcp`.
6. Gates: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. Stop any dev server on port 4321 before e2e; Playwright starts its own on fresh state in `.wrangler/e2e-state` (wiped each run, so rate limits never carry over; `npm run dev` data is untouched).

## Checked end to end (19 Nov, local dev server)

- CLI: device login approved in a headless browser, whoami, image poll from a folder with `--open`, two voters through the real voter page, results `--json`/`--csv`, list, close, delete, logout; a WebM poll with `--play-once` and ffmpeg posters. Key file 0600, folder 0700.
- MCP with the official client SDK 2.4.0: tool list, create, upload link (lands on that draft's editor, through sign-in when signed out), open, results, list, delete voter, close, delete. No key and a wrong key get 401. `claude mcp get` connects; `codex mcp add` works.
- Every curl and CLI example in the docs runs as written; all docs pages, their `.md` copies and `/llms.txt` load.
- An H.264 MP4 plays-once poll played to the end and was voted on in headless Chromium (revision 1243).
- Every page type at 1440x900 and 390x844: no overflow, broken images, console errors (other than Turnstile test-widget warnings) or dead internal links.

## Not verified

- Real phones, Safari and Firefox, iOS video and sound rules.
- H.264 playback in browsers other than the headless Chromium above.
- Screen readers (labels, focus and keyboard paths were built, not tested with one).
- Real email delivery (no provider), real Turnstile (test keys only), production deployment, the cron on Cloudflare.
- `astro dev` also serves repository files, so locally `/docs/api.md` returns `docs/API.md` (same path on a case-insensitive disk). The build serves the right page.

## Needed before production

- Email provider for sign-in links (fill in `sendSignInEmail` in `src/server/email.ts`).
- Real Turnstile site key and secret (`TURNSTILE_SITE_KEY` in `wrangler.jsonc`, `TURNSTILE_SECRET_KEY` as a secret).
- Cloudflare resources: D1 database (replace the placeholder `database_id`), R2 bucket `pairpoll-media`, the pairpoll.com domain; apply migrations remotely.
- `OWNER_EMAILS` set to Vladimir's address.
- Analytics provider and its snippet (no snippet exists yet; it would go in `src/layouts/Base.astro`).
- OAuth for the Claude and ChatGPT chat apps (needs a public URL). Claude Code, Codex and Cursor work with an API key now.
- npm publish of the CLI (the docs then drop the repository alias) and the GitHub repository.
- Vladimir's review of Terms, Privacy and About; `hello@pairpoll.com` is a placeholder.
- Playwright uses the local headless Chromium 1243 (path in `playwright.config.ts`); elsewhere remove `executablePath` and run `npx playwright install chromium`.

## Open questions (from docs/SPEC.md)

1. Licence: MIT?
2. Email provider (for example Resend or Cloudflare's email service).
3. Analytics (for example PostHog or Cloudflare Web Analytics).
4. OAuth for the Claude and ChatGPT chat apps after the first deploy.
5. Publishing the CLI to npm and the repository to GitHub, and under which accounts.
6. Terms, privacy and About text review.
7. Limits: file sizes, polls per day, 30-day deletion.

## Versions

astro 7.4.13, @astrojs/cloudflare 14.4.9 (vite 8.3.8), @modelcontextprotocol/server 2.4.0, zod 4.6.7, wrangler 4.165.0 (workerd 1.20261118.1), @cloudflare/vitest-plugin 1.8.5, vitest 5.1.1, @playwright/test 1.65.1, typescript 6.0.3 (`@astrojs/check` and typescript-eslint do not support 7 yet), eslint 10.15.0. Node 24.11.1, npm 11.7.0. Compatibility date 2026-11-01 with `nodejs_compat`.

## Stack notes

- Bindings: `import { env } from "cloudflare:workers"` (`Astro.locals.runtime` is gone). Binding types come from `npm run types` (git-ignored `worker-configuration.d.ts`).
- `session: false` and `imageService: "compile"` keep the adapter from adding KV and Images bindings.
- Worker tests use `@cloudflare/vitest-plugin` with a stub entry; they test server functions, not Astro routing or the `scheduled` entry.
- Codex `workspace-write` sandbox: typecheck and unit/Worker tests pass; e2e cannot run there (wrangler registry and Chromium launch are blocked).

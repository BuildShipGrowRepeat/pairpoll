# State

Updated 19 Nov 2026. The server API and agent access surfaces are implemented locally; browser UI work continues separately.

## What exists

- One Cloudflare Worker built with Astro and `@astrojs/cloudflare`. Entry `src/worker.ts` exports Astro's fetch handler and the bounded daily cleanup job.
- Bindings in `wrangler.jsonc`: D1 `DB` (placeholder `database_id`), R2 `MEDIA`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and optional comma-separated `OWNER_EMAILS`.
- `migrations/0002_product.sql` replaces the applied scaffold table with accounts, credentials, polls, items, voter runs, reports, usage and upload bookkeeping.
- `/api/v1` implements email sign-in, sessions, API keys, CLI device approval, API-key identity, creator polls, uploads, voting, results/export/sharing, media ranges, account deletion and owner moderation. `docs/API.md` is the exact contract.
- `src/lib/knockout.ts` replays deterministic top-1/3/5 tournaments for 2–16 items. Unit tests cover all supported sizes and observed bye arrangements; Worker tests exercise real local D1 and R2 boundaries.
- `packages/cli` provides the private `pairpoll` command: device login, local key storage, local file and folder uploads, optional ffmpeg video posters, poll lifecycle, results/CSV and JSON output. It is not published.
- `/mcp` is a stateless Streamable HTTP MCP server. It requires a bearer API key and exposes eight creator tools backed by the same server functions as REST.
- Agent docs cover quick start, REST, CLI and MCP. `/llms.txt` indexes the plain Markdown copies.

## UI and marketing site (stage 1)

- Brand and design system: `docs/DESIGN.md`. Tokens and shared classes in `src/styles`, components in `src/components`, layouts `Base` (SEO), `Marketing`, `Docs`, `App` (noindex), `Voter` (noindex) in `src/layouts`. Component preview at `/design` (noindex, not in the sitemap; remove before launch if unwanted).
- Pages: home, `/about`, `/terms`, `/privacy`, 404, hubs `/for`, `/alternatives`, `/guides`, `/docs`, one example entry each (`/for/thumbnails`, `/alternatives/pickfu`, `/guides/how-voting-in-pairs-works`, `/docs/agents`), docs as raw Markdown (`/docs.md`, `/docs/<slug>.md`), `/sitemap.xml`, `robots.txt`, favicon, app icons, default `og.png`.
- Clean URLs: `build.format: "file"`, `trailingSlash: "never"`; `/about/` redirects to `/about`.
- **Drafts awaiting Vladimir's review:** Terms and Privacy (plain-language, written from the spec), and the About copy. Contact address `hello@pairpoll.com` is a placeholder.
- The home page links all eight planned use pages; seven are not written yet and return 404 until their entries exist.
- The demo (`src/components/demo`) uses its own minimal knockout (`demo-knockout.ts`); swap it for `replay` from `src/lib/knockout.ts` in stage 2.
- Font: Schibsted Grotesk, SIL OFL 1.1, self-hosted (`public/fonts`, licence in `OFL.txt`). Demo artwork in `public/demo` is original placeholder art.

## How to run

See `AGENTS.md` (commands) and `README.md` (setup). Local D1 and R2 state lives in `.wrangler/state` and is shared by `wrangler d1 migrations apply --local`, `astro dev` and `astro preview`.

## Installed versions

astro 7.4.13, @astrojs/cloudflare 14.4.9 (uses @cloudflare/vite-plugin and vite 8.3.8), @modelcontextprotocol/server 2.4.0, zod 4.6.7, wrangler 4.165.0 (workerd 1.20261118.1), @cloudflare/vitest-plugin 1.8.5, vitest 5.1.1, @playwright/test 1.65.1, typescript 6.0.3, @astrojs/check 0.9.12, eslint 10.15.0, typescript-eslint 8.73.0, eslint-plugin-astro 3.2.1, @eslint/js 10.0.1, @types/node 24. Node 24.11.1, npm 11.7.0. Compatibility date 2026-11-01 with `nodejs_compat`.

## Differences from the spec's assumed stack

The stack is as assumed. Details that changed in current versions:

- Bindings are read with `import { env } from "cloudflare:workers"`; `Astro.locals.runtime.env` was removed in adapter v13.
- Cron: wrangler `main` points at a custom `src/worker.ts` that wraps `handle` from `@astrojs/cloudflare/handler`; the adapter's old `workerEntryPoint` option is gone.
- Local dev runs inside workerd through Cloudflare's Vite plugin (not the old `platformProxy`), so dev uses the same local D1/R2 simulators as wrangler.
- Vitest integration is now `@cloudflare/vitest-plugin` (`cloudflareTest()`), replacing `@cloudflare/vitest-pool-workers`. It cannot load the Astro Worker entry, so Worker-level tests use a stub entry (`test/worker/main.ts`) and test server functions directly against bindings, not full HTTP requests through Astro.
- TypeScript 6, not 7: `@astrojs/check` and typescript-eslint do not support TypeScript 7 yet.
- `session: false` in `astro.config.mjs`, otherwise the adapter adds a KV binding for Astro sessions. `imageService: "compile"`, otherwise it adds a Cloudflare Images binding.
- Astro 7 detects AI agents and backgrounds `astro dev` / `astro preview`; stop with `npx astro dev stop` / `npx astro preview stop`. Playwright starts dev with `--ignore-lock` to keep it in the foreground.

## Known gaps

- Playwright uses the headless Chromium already on this Mac (revision 1243, path hard-coded in `playwright.config.ts`); Playwright 1.65 expects 1255. On another machine remove `executablePath` and run `npx playwright install chromium`.
- Codex `workspace-write` sandbox (checked 19 Nov): `npm test` and `npm run typecheck` pass (wrangler prints a harmless EPERM about its log file in ~/Library/Preferences). `npm run test:e2e` fails: wrangler cannot write its dev registry in ~/Library/Preferences, and even with that redirected, Chromium cannot launch (`MachPortRendezvousServer ... Permission denied`). Run e2e outside the sandbox.
- Worker-level tests cover server functions against D1 and R2, not Astro route dispatch or the `scheduled` entry end to end.
- `worker-configuration.d.ts` is generated and git-ignored; `dev`, `build`, `typecheck` and `test` regenerate it.
- Production email delivery is intentionally unset until a provider is chosen. Local sign-in mail is stored in the dev-only mailbox and logged.
- OAuth for Claude and ChatGPT chat app connections remains planned for after the first public deployment. Claude Code, Codex and Cursor can use the MCP endpoint with an API key now.
- `database_id` and `TURNSTILE_SITE_KEY` are placeholders until the first deploy.

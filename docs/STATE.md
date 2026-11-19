# State

Updated 19 Nov 2026. Scaffold only: no product features yet.

## What exists

- One Cloudflare Worker built with Astro and `@astrojs/cloudflare`. Entry `src/worker.ts` exports Astro's `fetch` handler and an empty `scheduled` handler (cron `0 3 * * *`, for the 30-day cleanup).
- Bindings in `wrangler.jsonc`: D1 `DB` (placeholder `database_id`), R2 `MEDIA`, var `TURNSTILE_SITE_KEY` (placeholder), required secret `TURNSTILE_SECRET_KEY`. `.dev.vars.example` holds Cloudflare's always-pass Turnstile test keys (invisible widget).
- Placeholder routes: `/` (prerendered), `/app` (server-rendered, reads D1), `/api/v1/health` (JSON `{"ok":true}`). Plain HTML, base layout `src/layouts/Base.astro`.
- `migrations/0001_init.sql`: placeholder `app_meta` table that the backend builder replaces.
- Tests: `test/unit` (Vitest, Node), `test/worker` (Vitest in workerd with real local D1 and R2, migrations applied in a setup file), `e2e` (Playwright against `astro dev`). Each holds one trivial test; replace the unit placeholder with the first real test.
- `packages/cli`: workspace package `pairpoll`, bin prints its version.

## How to run

See `AGENTS.md` (commands) and `README.md` (setup). Local D1 and R2 state lives in `.wrangler/state` and is shared by `wrangler d1 migrations apply --local`, `astro dev` and `astro preview`.

## Installed versions

astro 7.4.13, @astrojs/cloudflare 14.4.9 (uses @cloudflare/vite-plugin and vite 8.3.8), wrangler 4.165.0 (workerd 1.20261118.1), @cloudflare/vitest-plugin 1.8.5, vitest 5.1.1, @playwright/test 1.65.1, typescript 6.0.3, @astrojs/check 0.9.12, eslint 10.15.0, typescript-eslint 8.73.0, eslint-plugin-astro 3.2.1, @eslint/js 10.0.1, @types/node 24. Node 24.11.1, npm 11.7.0. Compatibility date 2026-11-01 with `nodejs_compat`.

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
- Worker-level tests do not cover the Astro routes or the `scheduled` handler end to end; the e2e test covers routes.
- `worker-configuration.d.ts` is generated and git-ignored; `dev`, `build`, `typecheck` and `test` regenerate it.
- No real schema, auth, email, Turnstile check, media upload, CLI commands, MCP endpoint, content collections or design yet.
- `database_id` and `TURNSTILE_SITE_KEY` are placeholders until the first deploy.

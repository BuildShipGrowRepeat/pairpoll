# Pairpoll

Read `docs/SPEC.md` first: it is the product spec and the source of truth. `docs/STATE.md` says what exists now.

## Where things live

| What | Where |
| --- | --- |
| Domain logic (knockout, ranking, validation); pure TypeScript, no bindings | `src/lib/` |
| Database (D1), media (R2), auth, sessions, email, Turnstile; code that takes bindings | `src/server/` |
| D1 schema changes, one SQL file each (`NNNN_name.sql`), never edit an applied one | `migrations/` |
| REST API routes (thin: parse, check permission, call `src/server`) | `src/pages/api/v1/` |
| MCP endpoint | `src/pages/mcp.ts` |
| Pages: marketing at the top level, creator app in `app/`, voter page in `p/` | `src/pages/` |
| Layouts, components, styles | `src/layouts/`, `src/components/`, `src/styles/` |
| Marketing and docs content collections | `src/content/`, `src/content.config.ts` |
| Worker entry: Astro's fetch handler plus the cron (`scheduled`) handler | `src/worker.ts` |
| CLI (`pairpoll` command) | `packages/cli/` |
| Tests: pure logic, Worker-level (real local D1/R2), browser | `test/unit/`, `test/worker/`, `e2e/` |

## How the stack works

- Astro 7 with `@astrojs/cloudflare` 14 on one Worker. Pages are prerendered by default; add `export const prerender = false` to server-rendered pages and API routes.
- Bindings: `import { env } from "cloudflare:workers"` then `env.DB`, `env.MEDIA`. `Astro.locals.runtime` no longer exists.
- Binding types come from `npm run types` (writes git-ignored `worker-configuration.d.ts`); rerun after editing `wrangler.jsonc`.
- Worker-level tests run in workerd with `@cloudflare/vitest-plugin`; migrations are applied before each test file. They cannot load `src/worker.ts` (Astro virtual modules), so test `src/server` and `src/lib` functions directly with `env` from `cloudflare:workers`.
- No UI framework. Interactive parts are plain TypeScript in `<script>` tags.

## Commands

```sh
cp .dev.vars.example .dev.vars   # once; Turnstile test keys only
npm install
npm run db:migrate:local         # apply migrations to the local D1 in .wrangler/
npm run dev                      # http://localhost:4321
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

Astro 7 detects AI agents and runs `astro dev` and `astro preview` in the background: stop them with `npx astro dev stop` / `npx astro preview stop`, or run dev in the foreground with `npx astro dev --ignore-lock`. `npm run preview` serves the build in workerd.

## Working rules (in brief; full text in docs/SPEC.md)

- Rule one: no over-engineering. Simplest thing that meets the spec; nothing speculative; no dependency for a few lines. When unsure, leave it out and say so in your report.
- Stay inside this folder. No Docker. Use wrangler's local simulators. No deploy, no Cloudflare login, no accounts.
- Check current official docs against the installed version before using a library API.
- Never print or commit secrets. Local secrets go in `.dev.vars` (git-ignored).
- Tests must give real regression confidence; no mock-only or redundant tests.
- Typecheck, lint and tests pass before a milestone is reported done.
- Git: local commits only, stage files by path (never `git add -A` or `git add .`), no remote, no push, no AI attribution.
- Temporary files go outside the repository; delete them and stop any server you started before finishing.
- Keep `docs/STATE.md` current (at most 100 lines).

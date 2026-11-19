# Pairpoll: a free poll for images and videos, ranked head to head

[Pairpoll](https://pairpoll.com) is a free, open-source image and video poll, and a pairwise ranking tool. Upload 2 to 16 images or videos, share one link, and each voter picks the better of two until their top list is settled. You get every voter's top list and one overall ranking.

It works in the browser for people, and through a REST API, a CLI and an MCP server for AI agents such as Claude Code, Codex and Cursor.

## What people use it for

- Testing ad creatives and video cuts before spending on them
- Choosing a YouTube thumbnail with real votes instead of an AI rating
- Picking a logo, a design, a product image or an app screenshot
- "This or that" polls with pictures for a team, clients or friends

## How it works

1. **Create a poll.** Sign in with an email link, add your images or videos (one kind per poll), and write the question.
2. **Share one link.** Voters need no account. They type a name and start.
3. **Voters pick in pairs.** Each voter sees two items at a time and picks one. A short knockout settles their top 1, top 3 or top 5. Item order is shuffled for every voter.
4. **Read the results.** You see each voter's top list and an overall ranking, and you can export both as CSV or JSON or share a results link.

Pairwise comparison is easier and more honest than asking people to rank a long list: nobody has to hold eight videos in their head at once.

## Features

- Image polls (up to 10 MB each) and video polls (MP4 or WebM, up to 30 MB each)
- "Each video plays once" option: no replay, pause or seek, so every option gets the same attention
- Top list size of 1, 3 or 5, and a cap on the number of voters
- Voters resume where they stopped in the same browser
- Per-voter top lists, overall ranking, CSV and JSON export, shareable results page
- Polls are unlisted and deleted automatically after 30 days
- Bot protection with Cloudflare Turnstile, no tracking cookies for voters

## For AI agents

An agent can create and manage polls with an API key.

**MCP server** (Claude Code shown; Codex and Cursor are in the docs):

```sh
claude mcp add --transport http pairpoll https://pairpoll.com/mcp \
  --header "Authorization: Bearer <your key>"
```

Tools: `create_poll`, `get_upload_link`, `open_poll`, `close_poll`, `get_results`, `list_polls`, `delete_voter`, `delete_poll`.

**CLI**, for polls made from local files:

```sh
pairpoll login
pairpoll create ./thumbnails --question "Which thumbnail would you click?" --top 3 --open
pairpoll results <poll-id> --json
```

**REST API:**

```sh
curl https://pairpoll.com/api/v1/polls \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"image","question":"Which image is strongest?","topSize":3}'
```

Full reference: [docs](https://pairpoll.com/docs), also available as plain text at [pairpoll.com/llms.txt](https://pairpoll.com/llms.txt).

## Run it yourself

Pairpoll is one Cloudflare Worker built with [Astro](https://astro.build), with a D1 database for data and an R2 bucket for files. It fits in Cloudflare's free plan.

Local development needs Node 22.23.4 or newer:

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Open http://localhost:4321. Locally no email is sent: the sign-in page shows the link.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.

Where things live is described in [AGENTS.md](AGENTS.md); the product spec is [docs/SPEC.md](docs/SPEC.md) and the API contract is [docs/API.md](docs/API.md).

## Deploy your own

You need a Cloudflare account, Node 22.23.4 or newer, a [Turnstile](https://developers.cloudflare.com/turnstile/) widget, and a [Resend](https://resend.com) account with a verified sending domain. Create the resources, then copy the ids they print into `wrangler.jsonc`:

```sh
npx wrangler login
npx wrangler d1 create pairpoll              # database_id -> d1_databases[0].database_id (binding DB)
npx wrangler r2 bucket create pairpoll-media # bucket_name -> r2_buckets[0].bucket_name (binding MEDIA)
npx wrangler kv namespace create OAUTH_KV    # id -> kv_namespaces[0].id (binding OAUTH_KV)
```

In the Cloudflare dashboard create a Turnstile widget (invisible) and put its site key in `vars.TURNSTILE_SITE_KEY` in `wrangler.jsonc`. Then set the three secrets the Worker requires (`secrets.required`):

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY  # secret key of that widget
npx wrangler secret put OWNER_EMAILS          # comma-separated emails allowed to open the owner page
npx wrangler secret put RESEND_API_KEY        # sends the sign-in emails
npx wrangler d1 migrations apply DB --remote
npm run build
npx wrangler deploy
```

Analytics are optional. `PUBLIC_GA_ID` and `PUBLIC_CF_BEACON_TOKEN` are set in `astro.config.mjs` and baked into the build; set them to your own ids or to empty strings, or the build sends data to pairpoll.com's analytics.

These files are specific to pairpoll.com and must be edited:

- `wrangler.jsonc`: `routes` (your domain; or remove `routes`, set `workers_dev` to `true` and use the `*.workers.dev` address)
- `src/server/email.ts`: the `from` address, which must be on your verified Resend domain
- `astro.config.mjs`: `site`
- `src/worker.ts`: the two `https://pairpoll.com` origins in the cron handler (OAuth cleanup)
- `src/layouts/Base.astro`, `public/robots.txt`, `public/llms.txt` and the pages in `src/pages` and `src/content` (about, terms, privacy, home, guides, docs): canonical URLs, example URLs and the owner's details

## About

Pairpoll is a personal project by Vladimir Terekhov, built at [Attract Group](https://attractgroup.com).

## Licence

[MIT](LICENSE)

# Pairpoll

Pairpoll is a free, open-source poll for images and videos, ranked head to head. A creator uploads 2 to 16 items, shares one link, and each voter picks the better of two until their top list is settled. The creator gets each voter's top list and an overall ranking, and AI agents can do the same through an API, a CLI and an MCP server.

## Local setup

Needs Node 22.23.4 or newer.

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Then open http://localhost:4321. Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.

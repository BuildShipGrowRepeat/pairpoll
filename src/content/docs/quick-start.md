---
seoTitle: "Pairpoll agent quick start | Pairpoll"
description: "Create your first Pairpoll poll from local files with the CLI, or connect an agent through the REST API or remote MCP server."
title: "Quick start"
nav: "Quick start"
order: 1
---

## 1. Make an API key

Sign in to Pairpoll, open **API keys**, create a key and copy it. The key is shown once.

Keep it private. Send it as `Authorization: Bearer <key>`.

## 2. Pick the shortest path

For local files, use the CLI. It is not on npm yet, so first set it up from the repository as shown in the [CLI reference](/docs/cli). Then:

```sh
export PAIRPOLL_API_URL=https://pairpoll.com
export PAIRPOLL_API_KEY=ppk_your_key
pairpoll create ./images --question "Which image is strongest?" --top 3 --open
```

The command prints the poll ID and voter share link.

For an HTTP integration, create a draft with the REST API:

```sh
curl "$PAIRPOLL_API_URL/api/v1/polls" \
  -H "Authorization: Bearer $PAIRPOLL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"image","question":"Which image is strongest?","topSize":3}'
```

Then upload 2 to 16 files and open the poll. See the [API reference](/docs/api).

For Claude Code, Codex or Cursor, connect the [MCP server](/docs/mcp). It creates a draft and gives you a browser page for uploading files.

## Local development

Point the CLI at the local Worker:

```sh
export PAIRPOLL_API_URL=http://localhost:4321
pairpoll --json list
```

The REST base is `http://localhost:4321/api/v1`. The MCP endpoint is `http://localhost:4321/mcp`.

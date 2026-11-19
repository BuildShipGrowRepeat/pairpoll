---
seoTitle: "Pairpoll remote MCP server | Pairpoll"
description: "Connect Claude Code, Codex or Cursor to Pairpoll's remote Streamable HTTP MCP server with an API key and use its poll tools."
title: "MCP server"
nav: "MCP"
order: 5
---

Pairpoll serves a stateless Streamable HTTP MCP server at `/mcp`. It is local until the first deployment:

```text
http://localhost:4321/mcp
```

Every request needs a Pairpoll API key as a bearer token.

## Claude Code

```sh
export PAIRPOLL_API_URL=http://localhost:4321
claude mcp add --transport http pairpoll "$PAIRPOLL_API_URL/mcp" \
  --header "Authorization: Bearer $PAIRPOLL_API_KEY"
```

Run `claude mcp get pairpoll` to check it.

## Codex

```sh
export PAIRPOLL_API_URL=http://localhost:4321
codex mcp add pairpoll \
  --url "$PAIRPOLL_API_URL/mcp" \
  --bearer-token-env-var PAIRPOLL_API_KEY
```

Run `codex mcp list` to check it.

## Cursor

Add this to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` for one project:

```json
{
  "mcpServers": {
    "pairpoll": {
      "url": "${env:PAIRPOLL_API_URL}/mcp",
      "headers": {
        "Authorization": "Bearer ${env:PAIRPOLL_API_KEY}"
      }
    }
  }
}
```

Restart Cursor after changing the environment variable or config.

## Tools

- `create_poll` creates an empty image or video draft.
- `get_upload_link` checks that you own a draft and returns its browser upload page.
- `open_poll` opens a ready draft and returns the voter share link.
- `close_poll` closes voting. This is final.
- `get_results` returns the overall ranking and voter runs.
- `list_polls` lists your unexpired polls.
- `delete_voter` removes one voter result without freeing a voter place.
- `delete_poll` denies access and queues the poll data and files for deletion.

The tool descriptions include each input and lifecycle rule. Results are also returned as structured data.

## File uploads and chat apps

The server does not fetch files from URLs. Use `get_upload_link` and add the local files in your browser. Claude and ChatGPT chat apps cannot pass their attachments to Pairpoll.

Claude and ChatGPT chat apps also require OAuth for a normal connector sign-in. OAuth is planned after the first deployment. The API-key setup above is for Claude Code, Codex and Cursor.

After deployment, set `PAIRPOLL_API_URL` to the public HTTPS origin and reconnect the client.

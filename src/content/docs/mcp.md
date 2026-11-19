---
seoTitle: "Pairpoll remote MCP server | Pairpoll"
description: "Connect Claude, ChatGPT, Claude Code, Codex or Cursor to Pairpoll's remote MCP server and use its poll tools."
title: "MCP server"
nav: "MCP"
order: 5
---

Pairpoll serves a stateless Streamable HTTP MCP server at:

```text
https://pairpoll.com/mcp
```

Claude and ChatGPT apps sign in with OAuth. Developer tools can keep using a Pairpoll API key as a bearer token.

## Claude and ChatGPT apps

Add `https://pairpoll.com/mcp` as a custom connector or remote MCP server. Choose Pairpoll's detected OAuth sign-in and the client's published identity or automatic registration. Pairpoll sends you to the existing email one-time-link sign-in, then shows the app name and where it will return. Approve it to connect.

The app can create and manage polls and read results in your Pairpoll account. Disconnect it at **Pairpoll → API keys → Connected apps**.

Chat apps cannot pass attached images or videos to connectors. When a tool returns an upload link, open it and add the files in your browser. Pairpoll does not fetch files from URLs.

## Claude Code

```sh
export PAIRPOLL_API_URL=https://pairpoll.com
export PAIRPOLL_API_KEY=ppk_your_key
claude mcp add --transport http pairpoll "$PAIRPOLL_API_URL/mcp" \
  --header "Authorization: Bearer $PAIRPOLL_API_KEY"
```

Run `claude mcp get pairpoll` to check it.

## Codex

```sh
export PAIRPOLL_API_URL=https://pairpoll.com
export PAIRPOLL_API_KEY=ppk_your_key
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

## File uploads

The server does not fetch files from URLs. Use `get_upload_link` and add the local files in your browser. Claude and ChatGPT chat apps cannot pass their attachments to Pairpoll.

For local API-key testing, set `PAIRPOLL_API_URL=http://localhost:4321`. OAuth-capable clients need the public HTTPS endpoint.

---
seoTitle: "Pairpoll for AI agents: API, CLI and MCP | Pairpoll"
description: "Choose the Pairpoll REST API, command-line tool or MCP server to create image and video polls, share them and read ranked results."
title: "Pairpoll for AI agents"
nav: "Agents"
order: 2
---

Agents can create a poll, add files, open voting, read results, remove a voter, close a poll and delete it. Every method acts for one Pairpoll creator through an API key.

## Choose a way in

**Use the CLI for local files.** It can take files or a folder, upload each item, open the poll and print the share link in one command. It is the simplest option for a coding agent with shell access.

**Use the REST API for direct integration.** It exposes every creator action under `/api/v1`. Use it when your program already handles HTTP and local file bytes.

**Use MCP from an agent client.** The remote Streamable HTTP server is at `/mcp`. Its tools create and manage polls without a custom integration.

## Files in chat apps

Claude and ChatGPT chat apps cannot pass an attached image or video to this MCP server. Pairpoll also does not fetch files from URLs. The MCP flow creates a draft and returns a browser upload page. Upload the files there, then ask the agent to open the poll.

Coding agents that can read local files should use the CLI or REST API instead.

## Start here

- [Quick start](/docs/quick-start)
- [CLI reference](/docs/cli)
- [REST API reference](/docs/api)
- [MCP server](/docs/mcp)

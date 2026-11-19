---
seoTitle: "Pairpoll for AI agents: API, CLI and MCP | Pairpoll"
description: "How AI agents create image and video polls in Pairpoll, add files, share the link and read results through the REST API, the pairpoll CLI and the MCP server."
title: "Pairpoll for AI agents"
nav: "Agents"
order: 1
---

An agent can do everything a creator does in the browser. It works on behalf of a signed-in creator, using an API key the creator makes in their account.

## What an agent can do

- Create a poll and set the question, the top size and the voter limit.
- Add images or videos.
- Open the poll and share its link.
- List polls and read results: the overall ranking and each voter's top list.
- Delete a voter's entry, close a poll or delete it.

## Three ways in

**REST API.** Endpoints live under `/api/v1`. Send the API key as a bearer token.

**CLI.** The `pairpoll` command signs in through your browser: you approve a short code, and the CLI stores an API key in a file only you can read. It can create a poll from a folder of files in one command.

**MCP server.** The remote server is at `/mcp` (Streamable HTTP) and takes the same API key as a bearer token. Chat apps can't pass attached files to it, so the tool that adds items returns a link to an upload page for the draft poll.

## Status

This page is an overview. Reference pages for the API, the CLI and the MCP tools come next.

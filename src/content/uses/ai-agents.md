---
seoTitle: "Poll MCP server for Claude, ChatGPT and agents | Pairpoll"
description: "Pairpoll's MCP server lets Claude, ChatGPT or a coding agent create an image or video poll, share the link and read the ranking. Free, for your audience."
title: "Let your AI assistant run the poll"
name: "AI assistants"
blurb: "Let Claude, ChatGPT or a coding agent set up the poll and read the results."
lead: "Ask Claude, ChatGPT or a coding agent to make an image or video poll. It creates the poll, gives you the link to share and reads the ranking back to you. Pairpoll is free, and the voters are your own people."
order: 12
demo: designs
picture: "agents"
---

## What your assistant can do

Pairpoll's MCP server at `https://pairpoll.com/mcp` gives an assistant eight tools:

- create an image or video poll as a draft
- get the upload page where you add the files
- open the poll and get the voter link
- read the results: the overall ranking and each voter's top list
- list your polls
- close a poll
- remove one voter's result
- delete a poll with its files

The same things work through the command line tool and the REST API, which can also upload the files directly.

## Three ways to connect

**Chat apps such as Claude and ChatGPT.** Add `https://pairpoll.com/mcp` as a custom connector and sign in with your Pairpoll email. The [MCP server page](/docs/mcp) has the steps. You can disconnect an app at any time from your Pairpoll account.

**Coding agents such as Claude Code, Codex and Cursor.** Create an API key in your Pairpoll account and add the MCP server with that key. The [MCP server page](/docs/mcp) has the command for each.

**Scripts and agents with a shell.** The [`pairpoll` command line tool](/docs/cli) makes a poll from a folder of files in one step. The [REST API](/docs/api) does the same over HTTP.

## Things to ask

- "Make a poll of these four thumbnails, top 3, and send me the link."
- "Set up a video poll where each video plays once. Up to 30 voters."
- "How is the logo poll going? Who's in the lead?"
- "Close the cover poll and give me the top 3 with points."

## Limits

- Chat apps can't pass your attached files to a connector. The assistant gives you an upload link instead, and you add the images or videos in your browser. The command line tool and the API upload files directly.
- Pairpoll doesn't fetch files from web addresses.
- Pairpoll doesn't find voters. You share the link with your own audience, customers or team.
- A poll holds 2 to 16 images or 2 to 16 videos, and up to 200 voters.

## Pairpoll and panel MCP servers

Some research services also have MCP servers. [PickFu's](https://www.pickfu.com/docs/integrations/mcp-server.md), for example, creates surveys for its paid respondents and quotes a price before a survey goes out. Use a service like that when you need answers from strangers in a target group. Use Pairpoll when your own viewers, customers or team should decide. [PickFu and Pairpoll compared](/alternatives/pickfu) goes into more detail.

## Common questions

### Is it free?

Yes. Pairpoll is free and open source. Polls, files and votes are deleted 30 days after a poll is created.

### Can the assistant see who voted?

It reads the same results you see: each voter's name, status and top list. Voters never sign in.

### Do I need to install anything?

Not for chat apps or coding agents that support remote MCP servers. The command line tool needs Node.js 22 or newer.

## Related

- [Pairpoll for AI agents](/docs/agents): the full recipe an agent can follow.
- [Choose the best AI-generated image](/for/ai-images)
- [How voting in pairs works](/guides/how-voting-in-pairs-works)

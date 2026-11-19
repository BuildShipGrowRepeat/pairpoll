---
seoTitle: "Pairpoll CLI reference | Pairpoll"
description: "Use the pairpoll command to sign in, upload local image or video files, open and close polls, export results and manage polls."
title: "CLI reference"
nav: "CLI"
order: 3
---

The `pairpoll` command is for people and agents with local file access. The package is not published to npm yet. Until it is, run it from a checkout of the Pairpoll repository. It needs Node.js 22 or newer and nothing else:

```sh
alias pairpoll="node /path/to/pairpoll/packages/cli/bin/pairpoll.js"
pairpoll --help
```

## Sign in

```sh
export PAIRPOLL_API_URL=https://pairpoll.com
pairpoll login
```

The CLI has no default server, so set the API URL first. For a local server, use `http://localhost:4321`. The command prints a short code and browser URL, waits for approval, then stores the API key in a private config file. On macOS and Linux the default is `~/.config/pairpoll/config.json`. On Windows it is in the Pairpoll folder under `%APPDATA%`.

```sh
pairpoll whoami
pairpoll logout
```

Logout removes the local key. It does not revoke it. Revoke the key in the browser if it should stop working.

## Create a poll

```sh
pairpoll create ./one.png ./two.png \
  --question "Which image is strongest?" \
  --top 3 \
  --max-voters 50 \
  --open
```

You can pass files, folders or both. A folder adds its direct files in name order. One poll accepts 2 to 16 images or 2 to 16 videos. Do not mix them.

Options:

- `--top 1|3|5` sets the number of ranked places. The default is 3.
- `--play-once` is for videos. Each video must finish once per pair before a voter can choose.
- `--max-voters N` accepts 1 to 200. The default is 50.
- `--open` opens voting after upload. Without it, the poll stays a draft.

If `ffmpeg` is on `PATH`, the CLI uploads one poster frame for each video.

## Manage polls

```sh
pairpoll list
pairpoll open <poll-id>
pairpoll close <poll-id>
pairpoll results <poll-id>
pairpoll results <poll-id> --json
pairpoll results <poll-id> --csv
pairpoll delete-voter <poll-id> <voter-id>
pairpoll delete <poll-id>
```

The voter ID is a run `id` from `pairpoll results <poll-id> --json`. Removing a voter deletes their result but does not free their place under the voter limit. Closing and deletion are final.

## Agent output and local servers

Add `--json` to any command for machine-readable output. Login emits one JSON line while waiting and one after approval. Errors use standard error. Usage errors exit with code 2. Other failures exit with code 1.

```sh
export PAIRPOLL_API_URL=https://pairpoll.com
export PAIRPOLL_API_KEY=ppk_your_key
pairpoll --json list
```

`--api-url` overrides `PAIRPOLL_API_URL`. `PAIRPOLL_API_KEY` overrides the saved key.

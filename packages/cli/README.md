# Pairpoll CLI

The `pairpoll` command creates image and video polls, uploads local files and reads results.

## Run it from this repository

The CLI has no dependencies. From the repository root:

```sh
alias pairpoll="node $PWD/packages/cli/bin/pairpoll.js"
pairpoll --help
```

The alias works from any folder, so relative file paths resolve where you run the command. (`npm exec --workspace pairpoll` runs inside `packages/cli`, where relative paths break.)

The package is private and is not published to npm.

## Sign in

```sh
pairpoll login
```

The CLI connects to `https://pairpoll.com` by default. The command prints a short code and a browser URL, then waits for approval. It stores the issued API key in `~/.config/pairpoll/config.json` on macOS and Linux, or the Pairpoll folder under `%APPDATA%` on Windows. The directory is private and the file mode is `0600` where the platform supports it.

Use `pairpoll logout` to remove the local file. Logout does not revoke the API key. Revoke it from the API keys page if it should stop working.

## Commands

```sh
pairpoll whoami
pairpoll create ./files --question "Which is strongest?" --top 3 --open
pairpoll open <poll-id>
pairpoll close <poll-id>
pairpoll results <poll-id>
pairpoll results <poll-id> --json
pairpoll results <poll-id> --csv
pairpoll list
pairpoll delete-voter <poll-id> <voter-id>
pairpoll delete <poll-id>
```

Folders include their direct files, sorted by name. A poll must contain 2 to 16 supported images or 2 to 16 supported videos. When `ffmpeg` is on `PATH`, the CLI also uploads one poster frame for each video.

Add `--json` to any command for machine-readable output. Login emits one JSON line while it waits and one after approval. Errors go to standard error and return exit code `1`; usage errors return `2`.

## Local servers and agents

Set either environment variable or pass the URL on the command line:

```sh
export PAIRPOLL_API_URL=http://localhost:4321
export PAIRPOLL_API_KEY=ppk_your_key
pairpoll --json list

pairpoll --api-url http://localhost:4321 --json list
```

Command-line `--api-url` wins over `PAIRPOLL_API_URL`, which wins over the saved URL and the `https://pairpoll.com` default. `PAIRPOLL_API_KEY` wins over the saved key.

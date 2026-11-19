/* global setTimeout */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { parseArgs, UsageError } from "./args.js";
import { PairpollClient, ApiError, normalizeApiUrl } from "./client.js";
import { clearConfig, readConfig, writeConfig } from "./config.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const DEFAULT_API_URL = "https://pairpoll.com";
// Same ceilings as the server, checked before anything is created or read into memory.
const MAX_BYTES = { image: 10_000_000, video: 30_000_000 };

const HELP = `Usage: pairpoll [--api-url URL] [--json] <command>

Commands:
  login
  logout
  whoami
  create <files or folder...> --question <text> [--top 1|3|5] [--play-once] [--max-voters N] [--open]
  open <poll-id>
  close <poll-id>
  results <poll-id> [--json|--csv]
  list
  delete-voter <poll-id> <voter-id>
  delete <poll-id>`;

function output(json, value, text) {
  console.log(json ? JSON.stringify(value) : text);
}

async function apiSettings(apiUrlOption, requireKey = true) {
  const saved = await readConfig();
  const selectedUrl = apiUrlOption || process.env.PAIRPOLL_API_URL || saved.apiUrl || DEFAULT_API_URL;
  const apiUrl = normalizeApiUrl(selectedUrl);
  const savedUrl = saved.apiUrl ? normalizeApiUrl(saved.apiUrl) : null;
  const apiKey = process.env.PAIRPOLL_API_KEY || (savedUrl === apiUrl ? saved.apiKey : undefined);
  if (requireKey && !apiKey) throw new UsageError("Not signed in. Run pairpoll login or set PAIRPOLL_API_KEY.");
  return { apiUrl, apiKey, saved };
}

async function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const path = resolve(input);
    const info = await stat(path).catch(() => null);
    if (!info) throw new UsageError(`File or folder not found: ${input}`);
    if (info.isFile()) files.push(path);
    else if (info.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      files.push(...entries.filter((entry) => entry.isFile() && !entry.name.startsWith(".")).map((entry) => join(path, entry.name)).sort());
    } else throw new UsageError(`Not a regular file or folder: ${input}`);
  }
  const unique = [...new Set(files)];
  if (unique.length < 2 || unique.length > 16) throw new UsageError("Choose 2 to 16 files.");
  return unique;
}

function fileKind(path) {
  const extension = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  throw new UsageError(`Unsupported file extension: ${basename(path)}`);
}

function ffmpegAvailable() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

async function videoPoster(path) {
  const directory = await mkdtemp(join(tmpdir(), "pairpoll-poster-"));
  const poster = join(directory, "poster.jpg");
  try {
    const result = spawnSync("ffmpeg", ["-loglevel", "error", "-i", path, "-frames:v", "1", "-f", "image2", poster], { stdio: "ignore" });
    return result.status === 0 && existsSync(poster) ? await readFile(poster) : null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function login(args) {
  const { apiUrl, saved } = await apiSettings(args.apiUrl, false);
  const client = new PairpollClient(apiUrl);
  const device = await client.startDevice();
  const approvalUrl = new URL("/signin/device", `${apiUrl}/`);
  approvalUrl.searchParams.set("code", device.code);
  if (args.json) console.log(JSON.stringify({ status: "pending", code: device.code, url: approvalUrl.href, expiresAt: device.expiresAt }));
  else console.log(`Open ${approvalUrl.href}\nEnter code ${device.code}\nWaiting for approval...`);
  while (Date.now() < device.expiresAt) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    const exchange = await client.exchangeDevice(device.secret);
    if (exchange.status === "approved") {
      await writeConfig({ ...saved, apiUrl, apiKey: exchange.key });
      output(args.json, { status: "signed_in", apiUrl }, "Signed in.");
      return;
    }
    if (exchange.status === "expired") break;
  }
  throw new Error("The sign-in code expired. Run pairpoll login again.");
}

async function create(args, client, apiUrl) {
  const files = await collectFiles(args.files);
  const kinds = new Set(files.map(fileKind));
  if (kinds.size !== 1) throw new UsageError("Use only images or only videos in one poll.");
  const kind = [...kinds][0];
  if (args.playsOnce && kind !== "video") throw new UsageError("--play-once is available only for videos.");
  for (const path of files) {
    if ((await stat(path)).size > MAX_BYTES[kind]) {
      throw new UsageError(`${basename(path)} is too large. ${kind === "image" ? "Images" : "Videos"} can be up to ${MAX_BYTES[kind] / 1_000_000} MB.`);
    }
  }
  const poll = await client.create({
    kind,
    question: args.question,
    topSize: args.topSize,
    playsOnce: args.playsOnce,
    voterCap: args.voterCap,
  });
  const makePosters = kind === "video" && ffmpegAvailable();
  try {
    for (const path of files) {
      const item = await client.upload(poll.id, basename(path), await readFile(path));
      if (makePosters) {
        const poster = await videoPoster(path);
        if (poster) await client.uploadPoster(poll.id, item.id, poster);
      }
    }
  } catch (error) {
    error.message = `${error.message} Draft poll: ${poll.id}`;
    throw error;
  }
  const finished = args.open ? await client.open(poll.id) : await client.get(poll.id);
  return { poll: finished, shareUrl: new URL(`/p/${poll.code}`, `${apiUrl}/`).href };
}

export async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.command === "help") {
      console.log(HELP);
      return 0;
    }
    if (args.command === "version") {
      console.log(pkg.version);
      return 0;
    }
    if (args.command === "login") {
      await login(args);
      return 0;
    }
    if (args.command === "logout") {
      await clearConfig();
      output(args.json, { ok: true }, "Signed out on this device. Revoke the API key in Pairpoll if it should stop working everywhere.");
      return 0;
    }

    const { apiUrl, apiKey } = await apiSettings(args.apiUrl);
    const client = new PairpollClient(apiUrl, apiKey);
    if (args.command === "whoami") {
      const result = await client.whoami();
      output(args.json, result, result.email);
    } else if (args.command === "list") {
      const polls = await client.list();
      output(args.json, { polls }, polls.length ? polls.map((poll) => `${poll.id}\t${poll.status}\t${poll.question}`).join("\n") : "No polls.");
    } else if (args.command === "create") {
      const result = await create(args, client, apiUrl);
      output(args.json, result, `${result.poll.id}\n${result.shareUrl}\nStatus: ${result.poll.status}`);
    } else if (args.command === "open") {
      const poll = await client.open(args.pollId);
      const result = { poll, shareUrl: new URL(`/p/${poll.code}`, `${apiUrl}/`).href };
      output(args.json, result, `${result.shareUrl}\nStatus: ${poll.status}`);
    } else if (args.command === "close") {
      const poll = await client.close(args.pollId);
      output(args.json, { poll }, `Closed ${poll.id}.`);
    } else if (args.command === "results") {
      if (args.csv) process.stdout.write(await client.resultsCsv(args.pollId));
      else {
        const results = await client.results(args.pollId);
        output(args.json, results, JSON.stringify(results, null, 2));
      }
    } else if (args.command === "delete-voter") {
      const result = await client.deleteVoter(args.pollId, args.voterId);
      output(args.json, result, `Removed voter ${args.voterId}.`);
    } else if (args.command === "delete") {
      const result = await client.delete(args.pollId);
      output(args.json, result, `Deleted ${args.pollId}.`);
    }
    return 0;
  } catch (error) {
    const json = args?.json || argv.includes("--json");
    const code = error instanceof ApiError ? error.code : error instanceof UsageError ? "usage_error" : "unexpected_error";
    const value = { error: { code, message: error instanceof Error ? error.message : "Something went wrong." } };
    console.error(json ? JSON.stringify(value) : `Error: ${value.error.message}`);
    if (error instanceof UsageError && !json) console.error(`\n${HELP}`);
    return error instanceof UsageError ? 2 : 1;
  }
}

import { replay, type Pair } from "../lib/knockout.js";
import { ServerError } from "./errors.js";
import { hashToken, randomToken, readCookie } from "./security.js";
import { ACTIVE_OWNER, LIVE_POLL, plainText, publicItemView, readItems, type PollRow, type PollStatus, type TopSize } from "./polls.js";

export const VOTER_COOKIE = "pairpoll_voter";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const COOKIE_AGE = 30 * 24 * 60 * 60;

export interface RunRow {
  id: string;
  name: string;
  seed: number;
  votes: string;
  playback: string;
  revision: number;
  completed_at: number | null;
  deleted_at: number | null;
  created_at: number;
}

export interface VoterState {
  revision: number;
  index: number;
  total: number;
  pair: Pair | null;
  played: [boolean, boolean];
  ranking: string[] | null;
}

export type VoterEvent =
  | { type: "played"; revision: number; index: number; itemId: string }
  | { type: "vote"; revision: number; index: number; winner: string };

export const newVoterToken = randomToken;

export function voterCookie(value: string) {
  return `${VOTER_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_AGE}; Secure; HttpOnly; SameSite=Lax`;
}

export function voterToken(request: Request) {
  const token = readCookie(request, VOTER_COOKIE);
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

async function browserHash(value: string | null | undefined) {
  if (!value || !TOKEN_PATTERN.test(value)) {
    throw new ServerError(401, "voter_cookie_required", "Open the join link in this browser to start.");
  }
  return hashToken(value);
}

export function stateOf(run: RunRow, ids: string[], topSize: TopSize): VoterState {
  const result = replay(ids, run.seed, JSON.parse(run.votes), topSize);
  const watched: string[] = JSON.parse(run.playback);
  return {
    revision: run.revision,
    index: result.matches.length,
    total: result.total,
    pair: result.next,
    played: result.next ? [watched.includes(result.next[0]), watched.includes(result.next[1])] : [false, false],
    ranking: result.ranking,
  };
}

export async function getPublicPoll(db: D1Database, code: string, now = Date.now()) {
  const poll = await db.prepare(`
    SELECT p.* FROM polls p JOIN accounts a ON a.id = p.owner_id
    WHERE p.code = ? AND p.deleting_at IS NULL AND ${ACTIVE_OWNER}
  `).bind(code).first<PollRow>();
  if (!poll) throw new ServerError(404, "poll_not_found", "This poll was not found.");
  let status: PollStatus | "expired" | "full" = poll.status;
  if (poll.expires_at <= now) status = "expired";
  else if (poll.status === "open" && poll.admitted_count >= poll.voter_cap) status = "full";
  return {
    code: poll.code,
    kind: poll.kind,
    question: status === "expired" ? "" : poll.question,
    topSize: poll.top_size,
    playsOnce: Boolean(poll.plays_once),
    status,
    items: status === "draft" || status === "expired" ? [] : (await readItems(db, poll.id)).map(publicItemView),
  };
}

async function liveRun(db: D1Database, code: string, hash: string, now: number) {
  return db.prepare(`
    SELECT r.id, r.name, r.seed, r.votes, r.playback, r.revision, r.completed_at, r.deleted_at, r.created_at,
      p.id AS poll_id, p.top_size, p.plays_once, p.status
    FROM runs r JOIN polls p ON p.id = r.poll_id
    WHERE p.code = ? AND r.browser_hash = ? AND ${LIVE_POLL}
  `).bind(code, hash, now).first<RunRow & {
    poll_id: string; top_size: TopSize; plays_once: number; status: PollStatus;
  }>();
}

function checkRun<R extends RunRow>(run: R | null): R {
  if (!run) throw new ServerError(404, "run_not_found", "No vote was started in this browser.");
  if (run.deleted_at !== null) throw new ServerError(410, "run_deleted", "The creator removed this vote.");
  return run;
}

export async function getVoterState(db: D1Database, code: string, token: string | null, now = Date.now()) {
  const run = checkRun(await liveRun(db, code, await browserHash(token), now));
  const items = await readItems(db, run.poll_id);
  if (items.length < 2) throw new ServerError(404, "poll_not_found", "This poll was not found.");
  return stateOf(run, items.map((item) => item.id), run.top_size);
}

export async function joinPoll(db: D1Database, code: string, name: unknown, token: string | null, now = Date.now()) {
  const hash = await browserHash(token);
  const existing = await liveRun(db, code, hash, now);
  if (existing) return getVoterState(db, code, token, now);

  const cleanName = plainText(name, 60, "your name");
  const id = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  // Only an actual new row can spend a place. A deleted run retains its browser hash.
  await db.batch([
    db.prepare(`
      INSERT INTO runs (id, poll_id, browser_hash, name, seed, created_at)
      SELECT ?, p.id, ?, ?, ?, ? FROM polls p
      WHERE p.code = ? AND p.status = 'open' AND p.admitted_count < p.voter_cap AND ${LIVE_POLL}
      ON CONFLICT(poll_id, browser_hash) DO NOTHING
    `).bind(id, hash, cleanName, seed, now, code, now),
    db.prepare(`
      UPDATE polls SET admitted_count = admitted_count + 1
      WHERE id = (SELECT poll_id FROM runs WHERE id = ?)
    `).bind(id),
  ]);

  if (await liveRun(db, code, hash, now)) return getVoterState(db, code, token, now);
  const poll = await getPublicPoll(db, code, now);
  if (poll.status === "expired") throw new ServerError(410, "poll_expired", "This poll has expired.");
  if (poll.status === "full") throw new ServerError(409, "poll_full", "This poll has reached its voter limit.");
  if (poll.status === "closed") throw new ServerError(409, "poll_closed", "This poll is closed.");
  throw new ServerError(409, "poll_not_open", "This poll is not open yet.");
}

function conflict(state: VoterState, message: string): never {
  throw new ServerError(409, "voter_state_conflict", message, state);
}

export async function recordVoterEvent(
  db: D1Database, code: string, token: string | null, event: VoterEvent, now = Date.now(),
) {
  if (!event || (event.type !== "played" && event.type !== "vote") ||
      !Number.isSafeInteger(event.revision) || !Number.isSafeInteger(event.index)) {
    throw new ServerError(400, "invalid_event", "Send a playback or vote event for the current pair.");
  }
  const hash = await browserHash(token);
  const run = checkRun(await liveRun(db, code, hash, now));
  if (run.status !== "open") throw new ServerError(409, "poll_closed", "This poll is closed.");
  const items = await readItems(db, run.poll_id);
  if (items.length < 2) throw new ServerError(404, "poll_not_found", "This poll was not found.");
  const ids = items.map((item) => item.id);
  const state = stateOf(run, ids, run.top_size);
  if (event.revision !== state.revision || event.index !== state.index || !state.pair) {
    conflict(state, "The current pair has changed.");
  }

  let votes: string[] = JSON.parse(run.votes);
  let played: string[] = JSON.parse(run.playback);
  let completedAt: number | null = null;
  if (event.type === "played") {
    if (!run.plays_once || !state.pair.includes(event.itemId)) {
      conflict(state, "Choose a video from the current pair.");
    }
    if (played.includes(event.itemId)) return state;
    played = [...played, event.itemId];
  } else {
    if (!state.pair.includes(event.winner)) conflict(state, "Choose an item from the current pair.");
    if (run.plays_once && !state.played.every(Boolean)) conflict(state, "Finish both videos before voting.");
    votes = [...votes, event.winner];
    played = [];
    if (replay(ids, run.seed, votes, run.top_size).ranking) completedAt = now;
  }

  const updated = await db.prepare(`
    UPDATE runs AS r SET votes = ?, playback = ?, revision = revision + 1, completed_at = ?
    WHERE id = ? AND revision = ? AND deleted_at IS NULL AND completed_at IS NULL
      AND EXISTS (SELECT 1 FROM polls p WHERE p.id = r.poll_id AND p.status = 'open' AND ${LIVE_POLL})
    RETURNING id, name, seed, votes, playback, revision, completed_at, deleted_at, created_at
  `).bind(JSON.stringify(votes), JSON.stringify(played), completedAt, run.id, state.revision, now).first<RunRow>();
  if (!updated) {
    const current = checkRun(await liveRun(db, code, hash, now));
    if (current.status !== "open") throw new ServerError(409, "poll_closed", "This poll is closed.");
    conflict(stateOf(current, ids, current.top_size), "The current pair has changed.");
  }
  return stateOf(updated, ids, run.top_size);
}

export async function deleteRun(db: D1Database, ownerId: string, pollId: string, runId: string, now = Date.now()) {
  const row = await db.prepare(`
    UPDATE runs AS r SET deleted_at = COALESCE(deleted_at, ?), name = '', seed = 0,
      votes = '[]', playback = '[]', completed_at = NULL
    WHERE r.id = ? AND r.poll_id = ? AND EXISTS (
      SELECT 1 FROM polls p WHERE p.id = r.poll_id AND p.owner_id = ? AND ${LIVE_POLL}
    )
    RETURNING id
  `).bind(now, runId, pollId, ownerId, now).first<{ id: string }>();
  if (!row) throw new ServerError(404, "run_not_found", "This voter was not found.");
}

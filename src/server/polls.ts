import { ServerError } from "./errors.js";

export const MAX_ITEMS = 16;
export const POLL_LIFETIME = 30 * 24 * 60 * 60 * 1000;
export const DAILY_POLL_LIMIT = 10;
export const LIVE_POLL_LIMIT = 20;
export const DAILY_UPLOAD_LIMIT = 1_000_000_000;

export type PollKind = "image" | "video";
export type PollStatus = "draft" | "open" | "closed";
export type TopSize = 1 | 3 | 5;

interface PollSettings {
  kind: PollKind;
  question: string;
  topSize: TopSize;
  playsOnce: boolean;
  voterCap: number;
}

interface SettingsInput {
  kind?: unknown;
  question?: unknown;
  topSize?: unknown;
  playsOnce?: unknown;
  voterCap?: unknown;
}

export interface PollRow {
  id: string;
  owner_id: string;
  code: string;
  kind: PollKind;
  question: string;
  top_size: TopSize;
  plays_once: number;
  voter_cap: number;
  admitted_count: number;
  status: PollStatus;
  created_at: number;
  expires_at: number;
  share_code: string | null;
  share_names: number;
}

export interface ItemRow {
  id: string;
  position: number;
  label: string;
  mime: string;
  bytes: number;
  object_key: string;
  poster_key: string | null;
  poster_bytes: number;
  poster_mime: string | null;
}

export const ACTIVE_OWNER = "a.blocked_at IS NULL AND a.deleting_at IS NULL";
export const LIVE_POLL = `p.deleting_at IS NULL AND p.expires_at > ?
  AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = p.owner_id AND ${ACTIVE_OWNER})`;
const HAS_POLL_BUDGET = `
  COALESCE((SELECT poll_count FROM usage WHERE account_id = a.id AND day = ?), 0) < ?
  AND (SELECT COUNT(*) FROM polls p WHERE p.owner_id = a.id
    AND p.deleting_at IS NULL AND p.expires_at > ?) < ?
`;

export function utcDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export function plainText(value: unknown, limit: number, field: string): string {
  if (typeof value !== "string") {
    throw new ServerError(400, "invalid_text", `Enter ${field}.`);
  }
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || [...clean].length > limit || /\p{Cc}/u.test(clean)) {
    throw new ServerError(400, "invalid_text", `Enter ${field} using 1 to ${limit} characters.`);
  }
  return clean;
}

function settings(input: SettingsInput, previous?: PollRow): PollSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ServerError(400, "invalid_settings", "Send poll settings.");
  }
  const kind = input.kind === undefined ? previous?.kind : input.kind;
  if (kind !== "image" && kind !== "video") {
    throw new ServerError(400, "invalid_kind", "Choose images or videos.");
  }
  if (previous && kind !== previous.kind) {
    throw new ServerError(400, "invalid_kind", "The item type is set when the poll is created.");
  }
  const question = plainText(input.question === undefined ? previous?.question : input.question, 200, "a question");
  const topSize = input.topSize === undefined ? previous?.top_size ?? 3 : input.topSize;
  if (topSize !== 1 && topSize !== 3 && topSize !== 5) {
    throw new ServerError(400, "invalid_top_size", "Choose a top list of 1, 3 or 5.");
  }
  const playsOnce = input.playsOnce === undefined ? Boolean(previous?.plays_once) : input.playsOnce;
  if (typeof playsOnce !== "boolean" || (kind === "image" && playsOnce)) {
    throw new ServerError(400, "invalid_plays_once", "Play once is available for videos.");
  }
  const voterCap = input.voterCap === undefined ? previous?.voter_cap ?? 50 : input.voterCap;
  if (typeof voterCap !== "number" || !Number.isInteger(voterCap) || voterCap < 1 || voterCap > 200) {
    throw new ServerError(400, "invalid_voter_cap", "Choose a voter limit from 1 to 200.");
  }
  return { kind, question, topSize, playsOnce, voterCap };
}

export function pollView(row: PollRow) {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    question: row.question,
    topSize: row.top_size,
    playsOnce: Boolean(row.plays_once),
    voterCap: row.voter_cap,
    admittedCount: row.admitted_count,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    shareCode: row.share_code,
    shareNames: Boolean(row.share_names),
  };
}

export function publicItemView(row: ItemRow) {
  return {
    id: row.id,
    position: row.position,
    mime: row.mime,
    bytes: row.bytes,
    mediaId: row.object_key,
    posterId: row.poster_key,
  };
}

export function itemView(row: ItemRow) {
  return { ...publicItemView(row), label: row.label };
}

export async function readItems(db: D1Database, pollId: string) {
  const { results } = await db.prepare(`
    SELECT id, position, label, mime, bytes, object_key, poster_key, poster_bytes, poster_mime
    FROM items WHERE poll_id = ? AND status = 'ready' ORDER BY position, id
  `).bind(pollId).all<ItemRow>();
  return results;
}

export async function ownedPollRow(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  const row = await db.prepare(`
    SELECT p.* FROM polls p WHERE p.id = ? AND p.owner_id = ? AND ${LIVE_POLL}
  `).bind(pollId, ownerId, now).first<PollRow>();
  if (!row) throw new ServerError(404, "poll_not_found", "This poll was not found.");
  return row;
}

export async function draftPollRow(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  const row = await ownedPollRow(db, ownerId, pollId, now);
  if (row.status !== "draft") {
    throw new ServerError(409, "poll_frozen", "Items and settings are locked once voting opens.");
  }
  return row;
}

export async function listPolls(db: D1Database, ownerId: string, now = Date.now()) {
  const { results } = await db.prepare(`
    SELECT p.* FROM polls p WHERE p.owner_id = ? AND ${LIVE_POLL} ORDER BY p.created_at DESC, p.id
  `).bind(ownerId, now).all<PollRow>();
  return results.map(pollView);
}

export async function getPoll(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  const poll = await ownedPollRow(db, ownerId, pollId, now);
  return { ...pollView(poll), items: (await readItems(db, pollId)).map(itemView) };
}

function pollBudgetParameters(now: number): [string, number, number, number] {
  return [utcDay(now), DAILY_POLL_LIMIT, now, LIVE_POLL_LIMIT];
}

export function pollLimitError() {
  return new ServerError(429, "poll_limit", "You have reached your poll limit.");
}

export async function checkPollBudget(db: D1Database, ownerId: string, now: number) {
  const hasBudget = await db.prepare(`
    SELECT 1 FROM accounts a WHERE a.id = ? AND ${ACTIVE_OWNER} AND ${HAS_POLL_BUDGET}
  `).bind(ownerId, ...pollBudgetParameters(now)).first();
  if (!hasBudget) throw pollLimitError();
}

// This insert and the matching usage charge share a D1 transaction.
export function insertPoll(
  db: D1Database, ownerId: string, id: string, code: string, input: PollSettings, now: number,
  copies?: { sourceId: string; keys: string[] },
) {
  const copiesReady = copies ? `
    AND EXISTS (SELECT 1 FROM polls p WHERE p.id = ? AND ${LIVE_POLL})
    AND (SELECT COUNT(*) FROM uploads WHERE deleting_at IS NULL
      AND object_key IN (SELECT value FROM json_each(?))) = ?
  ` : "";
  return db.prepare(`
    INSERT INTO polls (id, owner_id, code, kind, question, top_size, plays_once, voter_cap, created_at, expires_at)
    SELECT ?, a.id, ?, ?, ?, ?, ?, ?, ?, ?
    FROM accounts a WHERE a.id = ? AND ${ACTIVE_OWNER} AND ${HAS_POLL_BUDGET}
      ${copiesReady}
  `).bind(id, code, input.kind, input.question, input.topSize, Number(input.playsOnce),
    input.voterCap, now, now + POLL_LIFETIME, ownerId, ...pollBudgetParameters(now),
    ...(copies ? [copies.sourceId, now, JSON.stringify(copies.keys), copies.keys.length] : []));
}

export function chargeNewPoll(db: D1Database, ownerId: string, pollId: string, now: number) {
  return db.prepare(`
    INSERT INTO usage (account_id, day, poll_count)
    SELECT ?, ?, 1 WHERE EXISTS (SELECT 1 FROM polls WHERE id = ?)
    ON CONFLICT(account_id, day) DO UPDATE SET poll_count = poll_count + 1
  `).bind(ownerId, utcDay(now), pollId);
}

export async function createPoll(db: D1Database, ownerId: string, input: SettingsInput, now = Date.now()) {
  const validated = settings(input);
  const id = crypto.randomUUID();
  const [created] = await db.batch([
    insertPoll(db, ownerId, id, crypto.randomUUID(), validated, now),
    chargeNewPoll(db, ownerId, id, now),
  ]);
  if (!created.meta.changes) throw pollLimitError();
  return getPoll(db, ownerId, id, now);
}

export async function updatePoll(db: D1Database, ownerId: string, pollId: string, input: SettingsInput, now = Date.now()) {
  const previous = await draftPollRow(db, ownerId, pollId, now);
  const updated = settings(input, previous);
  const { meta } = await db.prepare(`
    UPDATE polls AS p SET question = ?, top_size = ?, plays_once = ?, voter_cap = ?
    WHERE p.id = ? AND p.owner_id = ? AND p.status = 'draft' AND ${LIVE_POLL}
      AND p.question = ? AND p.top_size = ? AND p.plays_once = ? AND p.voter_cap = ?
  `).bind(updated.question, updated.topSize, Number(updated.playsOnce), updated.voterCap,
    pollId, ownerId, now, previous.question, previous.top_size, previous.plays_once, previous.voter_cap).run();
  if (!meta.changes) {
    await draftPollRow(db, ownerId, pollId, now);
    throw new ServerError(409, "poll_changed", "The poll changed. Reload it and try again.");
  }
  return getPoll(db, ownerId, pollId, now);
}

export async function openPoll(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  const { meta } = await db.prepare(`
    UPDATE polls AS p SET status = 'open'
    WHERE p.id = ? AND p.owner_id = ? AND p.status = 'draft' AND ${LIVE_POLL}
      AND (SELECT COUNT(*) FROM items WHERE poll_id = p.id AND status = 'ready') BETWEEN 2 AND ?
      AND NOT EXISTS (SELECT 1 FROM items WHERE poll_id = p.id AND status = 'uploading')
      AND NOT EXISTS (SELECT 1 FROM uploads WHERE poll_id = p.id AND deleting_at IS NULL)
  `).bind(pollId, ownerId, now, MAX_ITEMS).run();
  if (!meta.changes) {
    const current = await ownedPollRow(db, ownerId, pollId, now);
    if (current.status === "closed") {
      throw new ServerError(409, "poll_closed", "A closed poll cannot reopen.");
    }
    if (current.status === "draft") {
      throw new ServerError(409, "items_not_ready", "Add at least two items and let uploads finish before opening.");
    }
  }
  return getPoll(db, ownerId, pollId, now);
}

export async function closePoll(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  await db.prepare(`
    UPDATE polls AS p SET status = 'closed'
    WHERE p.id = ? AND p.owner_id = ? AND p.status = 'open' AND ${LIVE_POLL}
  `).bind(pollId, ownerId, now).run();
  const poll = await getPoll(db, ownerId, pollId, now);
  if (poll.status === "draft") throw new ServerError(409, "poll_not_open", "Open the poll before closing it.");
  return poll;
}

export async function deletePoll(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  const row = await db.prepare(`
    UPDATE polls AS p SET deleting_at = ?
    WHERE p.id = ? AND p.owner_id = ? AND ${LIVE_POLL} RETURNING id
  `).bind(now, pollId, ownerId, now).first<{ id: string }>();
  if (!row) throw new ServerError(404, "poll_not_found", "This poll was not found.");
}

export async function reorderItems(db: D1Database, ownerId: string, pollId: string, ids: unknown, now = Date.now()) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_ITEMS ||
      ids.some((id) => typeof id !== "string" || id.length !== 36) || new Set(ids).size !== ids.length) {
    throw new ServerError(400, "invalid_item_order", "Send every item once in the new order.");
  }
  const order = JSON.stringify(ids);
  const { meta } = await db.prepare(`
    WITH requested AS (SELECT key AS position, value AS id FROM json_each(?))
    UPDATE items AS i SET position = (SELECT position FROM requested WHERE id = i.id)
    WHERE i.poll_id = ? AND i.status = 'ready'
      AND EXISTS (SELECT 1 FROM polls p WHERE p.id = i.poll_id AND p.owner_id = ? AND p.status = 'draft' AND ${LIVE_POLL})
      AND NOT EXISTS (SELECT 1 FROM items WHERE poll_id = i.poll_id AND status = 'uploading')
      AND (SELECT COUNT(*) FROM items WHERE poll_id = i.poll_id AND status = 'ready') = ?
      AND NOT EXISTS (
        SELECT 1 FROM requested r WHERE NOT EXISTS (
          SELECT 1 FROM items WHERE id = r.id AND poll_id = i.poll_id AND status = 'ready'
        )
      )
  `).bind(order, pollId, ownerId, now, ids.length).run();
  if (meta.changes !== ids.length) {
    await draftPollRow(db, ownerId, pollId, now);
    throw new ServerError(409, "poll_changed", "The items changed. Reload the poll and try again.");
  }
  return getPoll(db, ownerId, pollId, now);
}

export async function setResultsSharing(
  db: D1Database, ownerId: string, pollId: string, enabled: boolean, shareNames = false, now = Date.now(),
) {
  if (typeof enabled !== "boolean" || typeof shareNames !== "boolean") {
    throw new ServerError(400, "invalid_sharing", "Choose whether to share the results and voter names.");
  }
  const { meta } = await db.prepare(`
    UPDATE polls AS p SET share_code = CASE WHEN ? THEN COALESCE(share_code, ?) ELSE NULL END, share_names = ?
    WHERE p.id = ? AND p.owner_id = ? AND p.status <> 'draft' AND ${LIVE_POLL}
  `).bind(Number(enabled), crypto.randomUUID(), Number(enabled && shareNames), pollId, ownerId, now).run();
  if (!meta.changes) {
    await ownedPollRow(db, ownerId, pollId, now);
    throw new ServerError(409, "poll_not_open", "Open the poll before sharing results.");
  }
  return getPoll(db, ownerId, pollId, now);
}

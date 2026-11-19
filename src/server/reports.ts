import { ServerError } from "./errors.js";
import { LIVE_POLL, plainText } from "./polls.js";
import { consumeRateLimit } from "./security.js";

export async function submitReport(db: D1Database, code: string, reason: unknown, ip: string, now = Date.now()) {
  if (!await consumeRateLimit(db, "poll_report", ip, 5, 60 * 60 * 1000, now)) {
    throw new ServerError(429, "too_many_reports", "Try reporting again later.");
  }
  const text = plainText(reason, 500, "a reason for reporting this poll");
  const { meta } = await db.prepare(`
    INSERT INTO reports (id, poll_id, reason, created_at)
    SELECT ?, p.id, ?, ? FROM polls p WHERE p.code = ? AND ${LIVE_POLL}
  `).bind(crypto.randomUUID(), text, now, code, now).run();
  if (!meta.changes) throw new ServerError(404, "poll_not_found", "This poll was not found.");
}

export async function takeDownPoll(db: D1Database, pollId: string, now = Date.now()) {
  const row = await db.prepare(`
    UPDATE polls SET deleting_at = COALESCE(deleting_at, ?) WHERE id = ? RETURNING id
  `).bind(now, pollId).first<{ id: string }>();
  if (!row) throw new ServerError(404, "poll_not_found", "This poll was not found.");
}

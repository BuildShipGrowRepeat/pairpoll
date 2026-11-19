import { pruneAuthData } from "./account.js";
import { POLL_LIFETIME, utcDay } from "./polls.js";
import { ABANDONED_UPLOAD_AGE, discardUploads } from "./upload-reservations.js";

const MEDIA_BATCH = 100;
const MEDIA_ROUNDS = 5;
const ROW_BATCH = 1000;

export async function runCleanup(db: D1Database, bucket: R2Bucket, now = Date.now()) {
  await db.prepare(`
    UPDATE polls SET deleting_at = ?
    WHERE id IN (SELECT id FROM polls WHERE expires_at <= ? AND deleting_at IS NULL
      ORDER BY expires_at, id LIMIT ?)
  `).bind(now, now, MEDIA_BATCH).run();

  const { results: uploads } = await db.prepare(`
    SELECT object_key FROM uploads WHERE deleting_at IS NOT NULL OR created_at <= ?
    ORDER BY created_at, object_key LIMIT ?
  `).bind(now - ABANDONED_UPLOAD_AGE, MEDIA_BATCH).all<{ object_key: string }>();
  await discardUploads(db, bucket, uploads.map((row) => row.object_key), now);

  // A few batches per daily run, kept well under the per-invocation query limit.
  for (let round = 0; round < MEDIA_ROUNDS; round++) {
    const { results: items } = await db.prepare(`
      SELECT i.id, i.object_key, i.poster_key FROM items i JOIN polls p ON p.id = i.poll_id
      WHERE (i.status = 'deleting' OR p.deleting_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM uploads WHERE item_id = i.id)
      ORDER BY i.created_at, i.id LIMIT ?
    `).bind(MEDIA_BATCH).all<{ id: string; object_key: string; poster_key: string | null }>();
    if (!items.length) break;
    const keys = items.flatMap((item) => item.poster_key ? [item.object_key, item.poster_key] : [item.object_key]);
    await bucket.delete(keys);
    await db.prepare("DELETE FROM items WHERE id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(items.map((item) => item.id))).run();
    if (items.length < MEDIA_BATCH) break;
  }

  // Delete child rows in bounded batches. Keep each poll until every stored file and child row is gone.
  await db.batch([
    db.prepare(`
      DELETE FROM reports WHERE id IN (
        SELECT r.id FROM reports r JOIN polls p ON p.id = r.poll_id
        WHERE p.deleting_at IS NOT NULL ORDER BY p.deleting_at, r.id LIMIT ?
      )
    `).bind(ROW_BATCH),
    db.prepare(`
      DELETE FROM runs WHERE id IN (
        SELECT r.id FROM runs r JOIN polls p ON p.id = r.poll_id
        WHERE p.deleting_at IS NOT NULL ORDER BY p.deleting_at, r.id LIMIT ?
      )
    `).bind(ROW_BATCH),
    db.prepare(`
      DELETE FROM polls WHERE id IN (
        SELECT p.id FROM polls p WHERE p.deleting_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM items WHERE poll_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM uploads WHERE poll_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM reports WHERE poll_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM runs WHERE poll_id = p.id)
        ORDER BY p.deleting_at, p.id LIMIT ?
      )
    `).bind(MEDIA_BATCH),
    db.prepare(`
      DELETE FROM usage WHERE (account_id, day) IN (
        SELECT account_id, day FROM usage WHERE day < ? ORDER BY day, account_id LIMIT ?
      )
    `).bind(utcDay(now - POLL_LIFETIME), ROW_BATCH),
  ]);
  await pruneAuthData(db, now);
}

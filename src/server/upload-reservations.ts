import { utcDay } from "./polls.js";

export const ABANDONED_UPLOAD_AGE = 60 * 60 * 1000;

export const HAS_UPLOAD_BUDGET = `COALESCE(
  (SELECT uploaded_bytes FROM usage WHERE account_id = p.owner_id AND day = ?), 0
) + ? <= ?`;

export function chargeUpload(db: D1Database, ownerId: string, marker: string, size: number, now: number) {
  return db.prepare(`
    INSERT INTO usage (account_id, day, uploaded_bytes)
    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM uploads WHERE object_key = ? AND deleting_at IS NULL)
    ON CONFLICT(account_id, day) DO UPDATE SET uploaded_bytes = uploaded_bytes + excluded.uploaded_bytes
  `).bind(ownerId, utcDay(now), size, marker);
}

export async function discardUploads(db: D1Database, bucket: R2Bucket, keys: string[], now: number) {
  if (keys.length === 0) return;
  const { results } = await db.prepare(`
    UPDATE uploads SET deleting_at = COALESCE(deleting_at, ?)
    WHERE object_key IN (SELECT value FROM json_each(?))
    RETURNING object_key
  `).bind(now, JSON.stringify(keys)).all<{ object_key: string }>();
  const claimed = results.map((row) => row.object_key);
  if (claimed.length === 0) return;

  await bucket.delete(claimed);
  const identifiers = JSON.stringify(claimed);
  await db.batch([
    db.prepare(`
      DELETE FROM items WHERE status = 'uploading' AND object_key IN (SELECT value FROM json_each(?))
    `).bind(identifiers),
    db.prepare(`DELETE FROM uploads WHERE object_key IN (SELECT value FROM json_each(?))`).bind(identifiers),
  ]);
}

export async function discardFailedUploads(db: D1Database, bucket: R2Bucket, keys: string[], now: number) {
  try {
    await discardUploads(db, bucket, keys, now);
  } catch {
    // The reservation remains in D1 for the next cleanup run.
    console.warn("Could not remove unfinished media. Scheduled cleanup will retry.");
  }
}

import type { SessionAuth } from "./auth";

export async function signOutEverywhere(db: D1Database, auth: SessionAuth): Promise<void> {
  if (auth.kind !== "session") return;
  await db.prepare(`
    UPDATE credentials SET revoked_at = ?
    WHERE account_id = ? AND kind = 'session' AND revoked_at IS NULL
  `).bind(Date.now(), auth.accountId).run();
}

export async function deleteAccount(db: D1Database, auth: SessionAuth): Promise<boolean> {
  if (auth.kind !== "session") return false;
  const now = Date.now();
  // Poll rows retain the object keys until background cleanup removes the files.
  const [marked] = await db.batch([
    db.prepare(`
      UPDATE accounts SET deleting_at = ?
      WHERE id = ? AND deleting_at IS NULL AND blocked_at IS NULL
        AND EXISTS (
          SELECT 1 FROM credentials
          WHERE id = ? AND account_id = ? AND kind = 'session'
            AND revoked_at IS NULL AND expires_at > ?
        )
    `).bind(now, auth.accountId, auth.credentialId, auth.accountId, now),
    db.prepare(`
      UPDATE polls SET deleting_at = ?
      WHERE owner_id = ? AND deleting_at IS NULL
        AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND deleting_at IS NOT NULL)
    `).bind(now, auth.accountId, auth.accountId),
    db.prepare(`
      DELETE FROM credentials WHERE account_id = ?
        AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND deleting_at IS NOT NULL)
    `).bind(auth.accountId, auth.accountId),
    db.prepare(`
      DELETE FROM device_requests WHERE account_id = ?
        AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND deleting_at IS NOT NULL)
    `).bind(auth.accountId, auth.accountId),
  ]);
  return marked.meta.changes === 1;
}

export async function pruneAuthData(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare(`
      DELETE FROM credentials WHERE id IN (
        SELECT id FROM credentials WHERE expires_at <= ? OR revoked_at IS NOT NULL LIMIT 500
      )
    `).bind(now),
    db.prepare(`
      DELETE FROM device_requests WHERE id IN (
        SELECT id FROM device_requests WHERE expires_at <= ? LIMIT 500
      )
    `).bind(now),
    db.prepare(`
      DELETE FROM rate_limits WHERE (scope, identifier_hash) IN (
        SELECT scope, identifier_hash FROM rate_limits WHERE expires_at <= ? LIMIT 500
      )
    `).bind(now),
    db.prepare(`
      DELETE FROM accounts WHERE id IN (
        SELECT id FROM accounts a WHERE deleting_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM polls WHERE owner_id = a.id)
        LIMIT 100
      )
    `),
  ]);
}

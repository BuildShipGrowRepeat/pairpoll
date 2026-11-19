import type { SessionAuth } from "./auth";

const OAUTH_GRANT_LIFETIME = 30 * 24 * 60 * 60 * 1000;

export async function signOutEverywhere(db: D1Database, auth: SessionAuth): Promise<void> {
  if (auth.kind !== "session") return;
  await db.prepare(`
    UPDATE credentials SET revoked_at = ?
    WHERE account_id = ? AND kind = 'session' AND revoked_at IS NULL
  `).bind(Date.now(), auth.accountId).run();
}

export async function deleteAccount(
  db: D1Database,
  auth: SessionAuth,
  revokeOAuth: (accountId: string) => Promise<void> = async () => {},
): Promise<boolean> {
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
      INSERT INTO oauth_account_cleanup (account_id, created_at)
      SELECT id, ? FROM accounts WHERE id = ? AND deleting_at IS NOT NULL
      ON CONFLICT (account_id) DO NOTHING
    `).bind(now, auth.accountId),
    db.prepare(`
      DELETE FROM credentials WHERE account_id = ?
        AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND deleting_at IS NOT NULL)
    `).bind(auth.accountId, auth.accountId),
    db.prepare(`
      DELETE FROM device_requests WHERE account_id = ?
        AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND deleting_at IS NOT NULL)
    `).bind(auth.accountId, auth.accountId),
  ]);
  if (marked.meta.changes !== 1) return false;
  try {
    await revokeOAuth(auth.accountId);
  } catch (error) {
    console.error("OAuth account revocation will be retried", error);
  }
  return true;
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
      DELETE FROM oauth_consent_states WHERE handle_hash IN (
        SELECT handle_hash FROM oauth_consent_states WHERE expires_at <= ? LIMIT 1000
      )
    `).bind(now),
    db.prepare(`
      DELETE FROM oauth_grant_states WHERE (account_id, grant_id) IN (
        SELECT account_id, grant_id FROM oauth_grant_states
        WHERE cleanup_pending = 0 AND COALESCE(code_exchanged_at, revoked_at) <= ?
        LIMIT 500
      )
    `).bind(now - OAUTH_GRANT_LIFETIME),
    db.prepare(`
      DELETE FROM accounts WHERE id IN (
        SELECT id FROM accounts a WHERE deleting_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM polls WHERE owner_id = a.id)
        LIMIT 100
      )
    `),
  ]);
}

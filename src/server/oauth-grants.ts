import { hashToken } from "./security.js";

const GRANT_ID = /^[A-Za-z0-9_-]{16}$/;
const CONSENT_LIFETIME = 10 * 60 * 1000;

export function oauthGrantIdFromToken(token: string, accountId: string): string | null {
  const parts = token.split(":");
  if (parts.length < 3) return null;
  parts.pop();
  const grantId = parts.pop();
  return parts.join(":") === accountId && grantId && GRANT_ID.test(grantId) ? grantId : null;
}

export function validOAuthGrantId(grantId: string): boolean {
  return GRANT_ID.test(grantId);
}

export async function claimOAuthAuthorizationCode(
  db: D1Database,
  accountId: string,
  grantId: string,
): Promise<boolean> {
  if (!GRANT_ID.test(grantId)) return false;
  const { meta } = await db.prepare(`
    INSERT INTO oauth_grant_states (account_id, grant_id, code_exchanged_at)
    VALUES (?, ?, ?)
    ON CONFLICT (account_id, grant_id) DO NOTHING
  `).bind(accountId, grantId, Date.now()).run();
  return meta.changes === 1;
}

export async function oauthGrantIsActive(
  db: D1Database,
  accountId: string,
  grantId: string,
): Promise<boolean> {
  if (!GRANT_ID.test(grantId)) return false;
  const row = await db.prepare(`
    SELECT grant_id FROM oauth_grant_states
    WHERE account_id = ? AND grant_id = ? AND code_exchanged_at IS NOT NULL AND revoked_at IS NULL
  `).bind(accountId, grantId).first();
  return row !== null;
}

export async function markOAuthGrantsRevoked(
  db: D1Database,
  accountId: string,
  grantIds: string[],
): Promise<void> {
  const ids = [...new Set(grantIds.filter((id) => GRANT_ID.test(id)))];
  if (!ids.length) return;
  const now = Date.now();
  await db.batch(ids.map((grantId) => db.prepare(`
    INSERT INTO oauth_grant_states (account_id, grant_id, revoked_at, cleanup_pending)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (account_id, grant_id) DO UPDATE SET
      revoked_at = COALESCE(revoked_at, excluded.revoked_at), cleanup_pending = 1
  `).bind(accountId, grantId, now)));
}

export async function acknowledgeOAuthGrantCleanup(
  db: D1Database,
  accountId: string,
  grantId: string,
): Promise<void> {
  await db.prepare(`
    UPDATE oauth_grant_states SET cleanup_pending = 0 WHERE account_id = ? AND grant_id = ?
  `).bind(accountId, grantId).run();
}

export async function enqueueOAuthAccountCleanup(db: D1Database, accountId: string): Promise<void> {
  await db.prepare(`
    INSERT INTO oauth_account_cleanup (account_id, created_at) VALUES (?, ?)
    ON CONFLICT (account_id) DO NOTHING
  `).bind(accountId, Date.now()).run();
}

export async function acknowledgeOAuthAccountCleanup(db: D1Database, accountId: string): Promise<void> {
  await db.prepare("DELETE FROM oauth_account_cleanup WHERE account_id = ?").bind(accountId).run();
}

export async function revokedOAuthGrantIds(db: D1Database, accountId: string): Promise<Set<string>> {
  const { results } = await db.prepare(`
    SELECT grant_id FROM oauth_grant_states WHERE account_id = ? AND revoked_at IS NOT NULL
  `).bind(accountId).all<{ grant_id: string }>();
  return new Set(results.map((row) => row.grant_id));
}

export async function recordOAuthConsent(
  db: D1Database,
  handle: string,
  accountId: string,
): Promise<void> {
  await db.prepare(`
    INSERT INTO oauth_consent_states (handle_hash, account_id, expires_at) VALUES (?, ?, ?)
  `).bind(await hashToken(handle), accountId, Date.now() + CONSENT_LIFETIME).run();
}

export async function consumeOAuthConsent(
  db: D1Database,
  handle: string,
  accountId: string,
): Promise<boolean> {
  const row = await db.prepare(`
    DELETE FROM oauth_consent_states
    WHERE handle_hash = ? AND account_id = ? AND expires_at > ?
    RETURNING account_id
  `).bind(await hashToken(handle), accountId, Date.now()).first();
  return row !== null;
}

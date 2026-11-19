import type { CreatorAuth } from "./auth";

export function ownerAccess(auth: CreatorAuth | null, ownerEmails: string | undefined): boolean {
  if (auth?.kind !== "session" || !ownerEmails) return false;
  return ownerEmails.toLowerCase().split(",").some((email) => email.trim() === auth.email);
}

export async function getOwnerOverview(
  db: D1Database,
  auth: CreatorAuth | null,
  ownerEmails: string | undefined,
  reportOffset = 0,
) {
  if (!ownerAccess(auth, ownerEmails)) return null;

  const [counts, reports, accounts] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM accounts) AS accounts,
        (SELECT COUNT(*) FROM polls) AS polls,
        (SELECT COUNT(*) FROM runs WHERE deleted_at IS NULL) AS runs,
        (SELECT COALESCE(SUM(bytes + poster_bytes), 0) FROM items) AS storedBytes
    `).first<{ accounts: number; polls: number; runs: number; storedBytes: number }>(),
    db.prepare(`
      SELECT r.id, r.reason, r.created_at AS createdAt,
        p.id AS pollId, p.code AS pollCode, p.question,
        a.id AS accountId, a.email, a.blocked_at AS blockedAt
      FROM reports r
      JOIN polls p ON p.id = r.poll_id
      JOIN accounts a ON a.id = p.owner_id
      WHERE p.deleting_at IS NULL AND p.expires_at > ?
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 100 OFFSET ?
    `).bind(Date.now(), reportOffset).all<{
      id: string;
      reason: string;
      createdAt: number;
      pollId: string;
      pollCode: string;
      question: string;
      accountId: string;
      email: string;
      blockedAt: number | null;
    }>(),
    db.prepare(`
      SELECT id, email, created_at AS createdAt, blocked_at AS blockedAt
      FROM accounts WHERE deleting_at IS NULL ORDER BY created_at DESC LIMIT 100
    `).all<{ id: string; email: string; createdAt: number; blockedAt: number | null }>(),
  ]);
  return { counts, reports: reports.results, accounts: accounts.results };
}

export async function blockAccount(
  db: D1Database,
  auth: CreatorAuth | null,
  ownerEmails: string | undefined,
  account: string,
): Promise<boolean> {
  if (!auth || !ownerAccess(auth, ownerEmails)) return false;
  const now = Date.now();
  const selector = account.trim().toLowerCase();
  const [blocked] = await db.batch([
    db.prepare(`
      UPDATE accounts SET blocked_at = COALESCE(blocked_at, ?)
      WHERE (id = ? OR email = ?) AND deleting_at IS NULL
        AND EXISTS (
          SELECT 1 FROM credentials c JOIN accounts a ON a.id = c.account_id
          WHERE c.id = ? AND c.account_id = ? AND c.kind = 'session'
            AND c.revoked_at IS NULL AND c.expires_at > ?
            AND a.blocked_at IS NULL AND a.deleting_at IS NULL
        )
    `).bind(now, selector, selector, auth.credentialId, auth.accountId, now),
    db.prepare(`
      DELETE FROM credentials WHERE account_id IN (
        SELECT id FROM accounts WHERE (id = ? OR email = ?) AND blocked_at IS NOT NULL
      )
    `).bind(selector, selector),
    db.prepare(`
      DELETE FROM device_requests WHERE account_id IN (
        SELECT id FROM accounts WHERE (id = ? OR email = ?) AND blocked_at IS NOT NULL
      )
    `).bind(selector, selector),
  ]);
  return blocked.meta.changes === 1;
}

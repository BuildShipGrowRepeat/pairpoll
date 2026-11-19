import { isLocalDevelopment } from "./security";

export async function sendSignInEmail(
  db: D1Database,
  request: Request,
  credentialId: string,
  link: string,
  dev: boolean,
): Promise<void> {
  // Real delivery can be added here once a provider is chosen.
  if (!isLocalDevelopment(request, dev)) return;

  const stored = await db.prepare(`
    INSERT INTO dev_mail (credential_id, link)
    SELECT id, ? FROM credentials WHERE id = ?
  `).bind(link, credentialId).run();
  if (stored.meta.changes === 1) console.info(`Local sign-in link: ${link}`);
}

export async function readDevMail(db: D1Database, request: Request, dev: boolean) {
  if (!isLocalDevelopment(request, dev)) return null;

  const { results } = await db.prepare(`
    SELECT a.email, m.link, c.created_at AS createdAt
    FROM dev_mail m
    JOIN credentials c ON c.id = m.credential_id
    JOIN accounts a ON a.id = c.account_id
    WHERE c.expires_at > ? AND c.revoked_at IS NULL
      AND a.blocked_at IS NULL AND a.deleting_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT 30
  `).bind(Date.now()).all<{ email: string; link: string; createdAt: number }>();
  return results;
}

import { env } from "cloudflare:workers";
import { isLocalDevelopment } from "./security";

export async function sendSignInEmail(
  db: D1Database,
  request: Request,
  credentialId: string,
  to: string,
  link: string,
  dev: boolean,
): Promise<void> {
  if (!isLocalDevelopment(request, dev)) {
    // Resend HTTP API. A failed send is logged, never shown: the page must not reveal which emails exist.
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Pairpoll <signin@pairpoll.com>",
          to,
          subject: "Your Pairpoll sign-in link",
          text: `Open this link to sign in to Pairpoll:\n\n${link}\n\nIt works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
        }),
      });
      if (!response.ok) console.error("Sign-in email failed:", response.status, await response.text());
    } catch (error) {
      console.error("Sign-in email failed:", (error as Error).message);
    }
    return;
  }

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

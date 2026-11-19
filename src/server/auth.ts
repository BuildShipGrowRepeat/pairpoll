import { sendSignInEmail } from "./email";
import {
  consumeRateLimit,
  hashToken,
  randomToken,
  readBearer,
  readCookie,
  requestIp,
  sameOrigin,
  verifyTurnstile,
} from "./security";

const HOUR = 60 * 60 * 1000;
const LINK_LIFETIME = 15 * 60 * 1000;
const SESSION_LIFETIME = 30 * 24 * HOUR;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const KEY_PATTERN = /^ppk_[0-9a-f]{64}$/;
const SESSION_COOKIE = "pp_session";

interface Identity {
  accountId: string;
  email: string;
  credentialId: string;
}

export type SessionAuth = Identity & { kind: "session" };
export type CreatorAuth = SessionAuth | (Identity & { kind: "api_key" });

export function generateKey(): string {
  return `ppk_${randomToken()}`;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_LIFETIME / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function authenticateCredential<K extends CreatorAuth["kind"]>(
  db: D1Database,
  token: string,
  kind: K,
): Promise<(Identity & { kind: K }) | null> {
  const hash = await hashToken(token);
  const identity = await db.prepare(`
    SELECT a.id AS accountId, a.email, c.id AS credentialId
    FROM credentials c JOIN accounts a ON a.id = c.account_id
    WHERE c.hash = ? AND c.kind = ? AND c.revoked_at IS NULL
      AND (c.expires_at IS NULL OR c.expires_at > ?)
      AND a.blocked_at IS NULL AND a.deleting_at IS NULL
  `).bind(hash, kind, Date.now()).first<Identity>();
  return identity ? { ...identity, kind } : null;
}

function cookieOriginAllowed(request: Request): boolean {
  return ["GET", "HEAD", "OPTIONS"].includes(request.method) || sameOrigin(request);
}

export async function authenticateSession(
  db: D1Database,
  request: Request,
): Promise<SessionAuth | null> {
  if (request.headers.has("Authorization") || !cookieOriginAllowed(request)) return null;
  const token = readCookie(request, SESSION_COOKIE);
  return token && TOKEN_PATTERN.test(token) ? authenticateCredential(db, token, "session") : null;
}

export async function authenticate(
  db: D1Database,
  request: Request,
): Promise<CreatorAuth | null> {
  if (!request.headers.has("Authorization")) return authenticateSession(db, request);
  if (readCookie(request, SESSION_COOKIE) !== null && !cookieOriginAllowed(request)) return null;
  const key = readBearer(request);
  return key && KEY_PATTERN.test(key) ? authenticateCredential(db, key, "api_key") : null;
}

export async function requestSignInLink(
  db: D1Database,
  request: Request,
  input: { email: string; token: string; turnstileSecret: string; dev: boolean },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const now = Date.now();
  if (!(await consumeRateLimit(db, "signin-ip", requestIp(request), 30, HOUR, now))) return;
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return;
  if (!(await verifyTurnstile(request, input.token, input.turnstileSecret, "signin", input.dev))) return;
  if (!(await consumeRateLimit(db, "signin-email", email, 5, HOUR, now))) return;

  const token = randomToken();
  const credentialId = crypto.randomUUID();
  const hash = await hashToken(token);
  const [, issued] = await db.batch([
    db.prepare(`
      INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)
      ON CONFLICT (email) DO NOTHING
    `).bind(crypto.randomUUID(), email, now),
    db.prepare(`
      INSERT INTO credentials (id, account_id, kind, hash, created_at, expires_at)
      SELECT ?, id, 'link', ?, ?, ? FROM accounts
      WHERE email = ? AND blocked_at IS NULL AND deleting_at IS NULL
    `).bind(credentialId, hash, now, now + LINK_LIFETIME, email),
  ]);
  if (issued.meta.changes !== 1) return;

  const link = new URL("/signin/confirm", request.url);
  link.searchParams.set("token", token);
  await sendSignInEmail(db, request, credentialId, email, link.href, input.dev);
}

export async function consumeSignInLink(
  db: D1Database,
  token: string,
): Promise<{ token: string; email: string } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const session = randomToken();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const [linkHash, sessionHash] = await Promise.all([hashToken(token), hashToken(session)]);
  // The link can create one session and is removed in the same transaction.
  const [, , account] = await db.batch<{ email: string }>([
    db.prepare(`
      INSERT INTO credentials (id, account_id, kind, hash, created_at, expires_at)
      SELECT ?, c.account_id, 'session', ?, ?, ?
      FROM credentials c JOIN accounts a ON a.id = c.account_id
      WHERE c.hash = ? AND c.kind = 'link' AND c.expires_at > ? AND c.revoked_at IS NULL
        AND a.blocked_at IS NULL AND a.deleting_at IS NULL
    `).bind(sessionId, sessionHash, now, now + SESSION_LIFETIME, linkHash, now),
    db.prepare(`
      DELETE FROM credentials WHERE hash = ? AND kind = 'link'
        AND EXISTS (SELECT 1 FROM credentials WHERE id = ?)
    `).bind(linkHash, sessionId),
    db.prepare(`
      SELECT a.email FROM accounts a JOIN credentials c ON c.account_id = a.id WHERE c.id = ?
    `).bind(sessionId),
  ]);
  return account.results[0] ? { token: session, email: account.results[0].email } : null;
}

export async function signOut(db: D1Database, auth: SessionAuth): Promise<void> {
  await db.prepare(`
    UPDATE credentials SET revoked_at = ?
    WHERE id = ? AND account_id = ? AND kind = 'session' AND revoked_at IS NULL
  `).bind(Date.now(), auth.credentialId, auth.accountId).run();
}

export async function listKeys(db: D1Database, auth: SessionAuth) {
  if (auth.kind !== "session") return [];
  const { results } = await db.prepare(`
    SELECT id, name, created_at AS createdAt FROM credentials
    WHERE account_id = ? AND kind = 'api_key' AND revoked_at IS NULL
    ORDER BY created_at DESC
  `).bind(auth.accountId).all<{ id: string; name: string; createdAt: number }>();
  return results;
}

export async function createKey(
  db: D1Database,
  auth: SessionAuth,
  name = "API key",
): Promise<{ id: string; name: string; createdAt: number; key: string } | null> {
  if (auth.kind !== "session") return null;
  const key = generateKey();
  const hash = await hashToken(key);
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const label = name.trim().slice(0, 80) || "API key";
  const { meta } = await db.prepare(`
    INSERT INTO credentials (id, account_id, kind, hash, name, created_at)
    SELECT ?, c.account_id, 'api_key', ?, ?, ?
    FROM credentials c JOIN accounts a ON a.id = c.account_id
    WHERE c.id = ? AND c.account_id = ? AND c.kind = 'session'
      AND c.revoked_at IS NULL AND c.expires_at > ?
      AND a.blocked_at IS NULL AND a.deleting_at IS NULL
  `).bind(id, hash, label, createdAt, auth.credentialId, auth.accountId, createdAt).run();
  return meta.changes === 1 ? { id, name: label, createdAt, key } : null;
}

export async function revokeKey(db: D1Database, auth: SessionAuth, id: string): Promise<boolean> {
  if (auth.kind !== "session") return false;
  const now = Date.now();
  const { meta } = await db.prepare(`
    UPDATE credentials SET revoked_at = ?
    WHERE id = ? AND account_id = ? AND kind = 'api_key' AND revoked_at IS NULL
      AND EXISTS (
        SELECT 1 FROM credentials
        WHERE id = ? AND account_id = ? AND kind = 'session'
          AND revoked_at IS NULL AND expires_at > ?
      )
  `).bind(now, id, auth.accountId, auth.credentialId, auth.accountId, now).run();
  return meta.changes === 1;
}

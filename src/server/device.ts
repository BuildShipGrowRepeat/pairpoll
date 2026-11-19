import { generateKey, type SessionAuth } from "./auth";
import { consumeRateLimit, hashToken, randomToken, requestIp } from "./security";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEVICE_LIFETIME = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export async function startDeviceRequest(
  db: D1Database,
  request: Request,
): Promise<{ secret: string; code: string; expiresAt: number } | null> {
  const now = Date.now();
  if (!(await consumeRateLimit(db, "device-ip", requestIp(request), 30, HOUR, now))) return null;

  const secret = randomToken();
  const hash = await hashToken(secret);
  const expiresAt = now + DEVICE_LIFETIME;
  for (let attempt = 0; attempt < 3; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
    const { meta } = await db.prepare(`
      INSERT INTO device_requests (id, secret_hash, code, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (code) DO NOTHING
    `).bind(crypto.randomUUID(), hash, code, expiresAt).run();
    if (meta.changes === 1) return { secret, code, expiresAt };
  }
  return null;
}

export async function approveDeviceRequest(
  db: D1Database,
  auth: SessionAuth,
  submittedCode: string,
): Promise<boolean> {
  if (auth.kind !== "session") return false;
  const code = submittedCode.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) return false;
  const now = Date.now();
  if (!(await consumeRateLimit(db, "device-approve", auth.accountId, 30, HOUR, now))) return false;

  const { meta } = await db.prepare(`
    UPDATE device_requests SET account_id = ?
    WHERE code = ? AND expires_at > ? AND account_id IS NULL
      AND EXISTS (
        SELECT 1 FROM credentials c JOIN accounts a ON a.id = c.account_id
        WHERE c.id = ? AND c.account_id = ? AND c.kind = 'session'
          AND c.revoked_at IS NULL AND c.expires_at > ?
          AND a.blocked_at IS NULL AND a.deleting_at IS NULL
      )
  `).bind(auth.accountId, code, now, auth.credentialId, auth.accountId, now).run();
  return meta.changes === 1;
}

type DeviceExchange = { status: "pending" } | { status: "expired" } | { status: "approved"; key: string };

export async function exchangeDeviceRequest(db: D1Database, secret: string): Promise<DeviceExchange> {
  if (!/^[0-9a-f]{64}$/.test(secret)) return { status: "expired" };

  const now = Date.now();
  const id = crypto.randomUUID();
  const key = generateKey();
  const [secretHash, keyHash] = await Promise.all([hashToken(secret), hashToken(key)]);
  const [issued, , pending] = await db.batch([
    db.prepare(`
      INSERT INTO credentials (id, account_id, kind, hash, name, created_at)
      SELECT ?, a.id, 'api_key', ?, 'Pairpoll CLI', ?
      FROM device_requests d JOIN accounts a ON a.id = d.account_id
      WHERE d.secret_hash = ? AND d.expires_at > ?
        AND a.blocked_at IS NULL AND a.deleting_at IS NULL
    `).bind(id, keyHash, now, secretHash, now),
    db.prepare(`
      DELETE FROM device_requests WHERE secret_hash = ?
        AND EXISTS (SELECT 1 FROM credentials WHERE id = ?)
    `).bind(secretHash, id),
    db.prepare(`
      SELECT id FROM device_requests WHERE secret_hash = ? AND account_id IS NULL AND expires_at > ?
    `).bind(secretHash, now),
  ]);
  if (issued.meta.changes === 1) return { status: "approved", key };
  return { status: pending.results.length ? "pending" : "expired" };
}

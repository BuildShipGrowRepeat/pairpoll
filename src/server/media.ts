import { ServerError } from "./errors.js";
import {
  chargeNewPoll, checkPollBudget, createPoll, DAILY_UPLOAD_LIMIT, draftPollRow, getPoll, insertPoll, itemView,
  LIVE_POLL, MAX_ITEMS, ownedPollRow, pollLimitError, pollView, readItems, utcDay, type ItemRow,
} from "./polls.js";
import {
  chargeUpload, discardFailedUploads, HAS_UPLOAD_BUDGET,
} from "./upload-reservations.js";
import { fileLabel, putStream, readUpload, STREAM_TIMEOUT } from "./upload-stream.js";

function uploadLimit() {
  return new ServerError(429, "upload_limit", "You have reached today's upload limit.");
}

function itemNotFound() {
  return new ServerError(404, "item_not_found", "This item was not found.");
}

export async function uploadItem(
  db: D1Database, bucket: R2Bucket, ownerId: string, pollId: string, request: Request, now = Date.now(),
) {
  const poll = await draftPollRow(db, ownerId, pollId, now);
  const file = await readUpload(request, poll.kind);
  const id = crypto.randomUUID();
  const key = crypto.randomUUID();
  try {
    const [reserved] = await db.batch([
      db.prepare(`
        INSERT INTO items (id, poll_id, position, label, object_key, bytes, mime, status, created_at)
        SELECT ?, p.id,
          COALESCE((SELECT MAX(position) FROM items WHERE poll_id = p.id AND status <> 'deleting'), -1) + 1,
          ?, ?, ?, ?, 'uploading', ?
        FROM polls p WHERE p.id = ? AND p.owner_id = ? AND p.status = 'draft' AND ${LIVE_POLL}
          AND (SELECT COUNT(*) FROM items WHERE poll_id = p.id AND status <> 'deleting') < ?
          AND ${HAS_UPLOAD_BUDGET}
      `).bind(id, fileLabel(request), key, file.size, file.mime, now, pollId, ownerId, now, MAX_ITEMS,
        utcDay(now), file.size, DAILY_UPLOAD_LIMIT),
      db.prepare(`
        INSERT INTO uploads (object_key, poll_id, item_id, created_at)
        SELECT ?, poll_id, id, ? FROM items WHERE id = ?
      `).bind(key, now, id),
      chargeUpload(db, ownerId, key, file.size, now),
    ]);
    if (!reserved.meta.changes) {
      await draftPollRow(db, ownerId, pollId, now);
      const count = await db.prepare(`
        SELECT COUNT(*) AS count FROM items WHERE poll_id = ? AND status <> 'deleting'
      `).bind(pollId).first<number>("count");
      if ((count ?? 0) >= MAX_ITEMS) throw new ServerError(409, "item_limit", "A poll holds up to 16 items.");
      throw uploadLimit();
    }

    await putStream(bucket, key, file.stream, file.size, file.mime);
    const publishNow = Date.now();
    const [published] = await db.batch<ItemRow>([
      db.prepare(`
        UPDATE items AS i SET status = 'ready' WHERE id = ? AND status = 'uploading'
          AND EXISTS (SELECT 1 FROM uploads WHERE object_key = ? AND deleting_at IS NULL)
          AND EXISTS (SELECT 1 FROM polls p WHERE p.id = i.poll_id AND p.status = 'draft' AND ${LIVE_POLL})
        RETURNING id, position, label, mime, bytes, object_key, poster_key, poster_bytes, poster_mime
      `).bind(id, key, publishNow),
      db.prepare(`
        DELETE FROM uploads WHERE object_key = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND status = 'ready')
      `).bind(key, id),
    ]);
    if (!published.results[0]) throw new ServerError(409, "poll_changed", "The poll changed during the upload.");
    return itemView(published.results[0]);
  } catch (error) {
    await discardFailedUploads(db, bucket, [key], now);
    throw error;
  } finally {
    file.close();
  }
}

export async function uploadPoster(
  db: D1Database, bucket: R2Bucket, ownerId: string, pollId: string, itemId: string, request: Request, now = Date.now(),
) {
  const poll = await draftPollRow(db, ownerId, pollId, now);
  if (poll.kind !== "video") throw new ServerError(409, "poster_not_allowed", "Only videos can have a poster.");
  const item = (await readItems(db, pollId)).find((row) => row.id === itemId);
  if (!item) throw itemNotFound();
  if (item.poster_key) throw new ServerError(409, "poster_exists", "This item already has a poster.");

  const file = await readUpload(request, "image");
  const key = crypto.randomUUID();
  try {
    const [reserved] = await db.batch([
      db.prepare(`
        INSERT INTO uploads (object_key, poll_id, item_id, created_at)
        SELECT ?, p.id, i.id, ? FROM items i JOIN polls p ON p.id = i.poll_id
        WHERE i.id = ? AND p.id = ? AND p.owner_id = ? AND p.status = 'draft' AND ${LIVE_POLL}
          AND i.status = 'ready' AND i.poster_key IS NULL
          AND NOT EXISTS (SELECT 1 FROM uploads WHERE item_id = i.id AND deleting_at IS NULL)
          AND ${HAS_UPLOAD_BUDGET}
      `).bind(key, now, itemId, pollId, ownerId, now, utcDay(now), file.size, DAILY_UPLOAD_LIMIT),
      chargeUpload(db, ownerId, key, file.size, now),
    ]);
    if (!reserved.meta.changes) {
      await draftPollRow(db, ownerId, pollId, now);
      const current = (await readItems(db, pollId)).find((row) => row.id === itemId);
      if (!current) throw itemNotFound();
      if (current.poster_key || await db.prepare(`
        SELECT 1 FROM uploads WHERE item_id = ? AND deleting_at IS NULL
      `).bind(itemId).first()) {
        throw new ServerError(409, "poster_exists", "This item already has a poster upload.");
      }
      throw uploadLimit();
    }
    await putStream(bucket, key, file.stream, file.size, file.mime);
    const publishNow = Date.now();
    const [published] = await db.batch<ItemRow>([
      db.prepare(`
        UPDATE items AS i SET poster_key = ?, poster_mime = ?, poster_bytes = ?
        WHERE id = ? AND status = 'ready' AND poster_key IS NULL
          AND EXISTS (SELECT 1 FROM uploads WHERE object_key = ? AND deleting_at IS NULL)
          AND EXISTS (SELECT 1 FROM polls p WHERE p.id = i.poll_id AND p.status = 'draft' AND ${LIVE_POLL})
        RETURNING id, position, label, mime, bytes, object_key, poster_key, poster_bytes, poster_mime
      `).bind(key, file.mime, file.size, itemId, key, publishNow),
      db.prepare(`
        DELETE FROM uploads WHERE object_key = ? AND EXISTS (SELECT 1 FROM items WHERE id = ? AND poster_key = ?)
      `).bind(key, itemId, key),
    ]);
    if (!published.results[0]) throw new ServerError(409, "poll_changed", "The poll changed during the upload.");
    return itemView(published.results[0]);
  } catch (error) {
    await discardFailedUploads(db, bucket, [key], now);
    throw error;
  } finally {
    file.close();
  }
}

export async function removeItem(db: D1Database, ownerId: string, pollId: string, itemId: string, now = Date.now()) {
  await draftPollRow(db, ownerId, pollId, now);
  const row = await db.prepare(`
    UPDATE items AS i SET status = 'deleting' WHERE id = ? AND poll_id = ? AND status = 'ready'
      AND EXISTS (SELECT 1 FROM polls p WHERE p.id = i.poll_id AND p.owner_id = ? AND p.status = 'draft' AND ${LIVE_POLL})
    RETURNING id
  `).bind(itemId, pollId, ownerId, now).first<{ id: string }>();
  if (!row) {
    await draftPollRow(db, ownerId, pollId, now);
    throw itemNotFound();
  }
}

export async function duplicatePoll(db: D1Database, bucket: R2Bucket, ownerId: string, pollId: string, now = Date.now()) {
  const source = pollView(await ownedPollRow(db, ownerId, pollId, now));
  const items = await readItems(db, pollId);
  if (!items.length) return createPoll(db, ownerId, source, now);
  await checkPollBudget(db, ownerId, now);

  const objects: { key: string; sourceItem: string; sourceKey: string; mime: string; bytes: number }[] = [];
  const copies = items.map((item, position) => {
    const id = crypto.randomUUID();
    const key = crypto.randomUUID();
    const poster = item.poster_key ? crypto.randomUUID() : null;
    objects.push({ key, sourceItem: item.id, sourceKey: item.object_key, mime: item.mime, bytes: item.bytes });
    if (poster && item.poster_key && item.poster_mime) {
      objects.push({
        key: poster, sourceItem: item.id, sourceKey: item.poster_key, mime: item.poster_mime, bytes: item.poster_bytes,
      });
    }
    return { ...item, id, position, object_key: key, poster_key: poster };
  });
  const keys = objects.map((object) => object.key);
  const bytes = objects.reduce((total, object) => total + object.bytes, 0);
  const id = crypto.randomUUID();
  const objectsJson = JSON.stringify(objects);
  try {
    // File copies are staged against the source until the new draft can be published in one transaction.
    const [reserved] = await db.batch([
      db.prepare(`
        INSERT INTO uploads (object_key, poll_id, item_id, created_at)
        SELECT j.value ->> '$.key', p.id, j.value ->> '$.sourceItem', ?
        FROM polls p, json_each(?) j
        WHERE p.id = ? AND p.owner_id = ? AND ${LIVE_POLL} AND ${HAS_UPLOAD_BUDGET}
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) copy WHERE NOT EXISTS (
              SELECT 1 FROM items i WHERE i.id = (copy.value ->> '$.sourceItem') AND i.poll_id = p.id
                AND i.status = 'ready' AND (copy.value ->> '$.sourceKey') IN (i.object_key, i.poster_key)
            )
          )
      `).bind(now, objectsJson, pollId, ownerId, now, utcDay(now), bytes, DAILY_UPLOAD_LIMIT, objectsJson),
      chargeUpload(db, ownerId, keys[0], bytes, now),
    ]);
    if (reserved.meta.changes !== keys.length) {
      await ownedPollRow(db, ownerId, pollId, now);
      const used = await db.prepare("SELECT uploaded_bytes FROM usage WHERE account_id = ? AND day = ?")
        .bind(ownerId, utcDay(now)).first<number>("uploaded_bytes");
      if ((used ?? 0) + bytes > DAILY_UPLOAD_LIMIT) throw uploadLimit();
      throw new ServerError(409, "poll_changed", "The source poll changed. Reload it and try again.");
    }

    const deadline = Date.now() + STREAM_TIMEOUT;
    for (const object of objects) {
      const stored = await bucket.get(object.sourceKey);
      if (!stored || !("body" in stored)) throw new ServerError(502, "media_missing", "A source file could not be copied.");
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await stored.body.cancel();
        throw new ServerError(502, "media_copy_timeout", "The files took too long to copy. Try again.");
      }
      await putStream(bucket, object.key, stored.body, object.bytes, object.mime, remaining);
    }
    const publishNow = Date.now();
    const [created] = await db.batch([
      insertPoll(db, ownerId, id, crypto.randomUUID(), source, publishNow, { sourceId: pollId, keys }),
      chargeNewPoll(db, ownerId, id, publishNow),
      db.prepare(`
        INSERT INTO items (id, poll_id, position, label, object_key, poster_key, bytes, mime,
          poster_bytes, poster_mime, status, created_at)
        SELECT j.value ->> '$.id', ?, j.value ->> '$.position', j.value ->> '$.label',
          j.value ->> '$.object_key', j.value ->> '$.poster_key', j.value ->> '$.bytes', j.value ->> '$.mime',
          j.value ->> '$.poster_bytes', j.value ->> '$.poster_mime', 'ready', ?
        FROM json_each(?) j WHERE EXISTS (SELECT 1 FROM polls WHERE id = ?)
      `).bind(id, publishNow, JSON.stringify(copies), id),
      db.prepare(`
        DELETE FROM uploads WHERE object_key IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM polls WHERE id = ?)
      `).bind(JSON.stringify(keys), id),
    ]);
    if (!created.meta.changes) {
      await ownedPollRow(db, ownerId, pollId, publishNow);
      throw pollLimitError();
    }
    return getPoll(db, ownerId, id, publishNow);
  } catch (error) {
    await discardFailedUploads(db, bucket, keys, now);
    throw error;
  }
}

// One well-formed range: the bytes to send, or null when it lies outside the file (416).
// Anything else (malformed, several ranges) is ignored: undefined, and the whole file is sent.
export function byteRange(header: string, bytes: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  if (!match[1]) {
    const suffix = Math.min(bytes, Number(match[2]));
    return suffix > 0 ? { offset: bytes - suffix, length: suffix } : null;
  }
  const offset = Number(match[1]);
  if (match[2] && Number(match[2]) < offset) return undefined;
  const end = match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1;
  return end >= offset ? { offset, length: end - offset + 1 } : null;
}

export async function serveMedia(
  db: D1Database, bucket: R2Bucket, request: Request, mediaId: string, ownerId: string | null = null, now = Date.now(),
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("Allow", "GET, HEAD");
    return new Response(null, { status: 405, headers });
  }
  const file = await db.prepare(`
    SELECT CASE WHEN i.object_key = ?1 THEN i.bytes ELSE i.poster_bytes END AS bytes,
      CASE WHEN i.object_key = ?1 THEN i.mime ELSE i.poster_mime END AS mime
    FROM items i JOIN polls p ON p.id = i.poll_id
    WHERE (i.object_key = ?1 OR i.poster_key = ?1) AND i.status = 'ready'
      AND ${LIVE_POLL} AND (p.status <> 'draft' OR p.owner_id = ?3)
  `).bind(mediaId, now, ownerId).first<{ bytes: number; mime: string }>();
  if (!file) return new Response(null, { status: 404, headers });

  if (request.method === "HEAD" && !await bucket.head(mediaId)) {
    return new Response(null, { status: 404, headers });
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", file.mime);
  headers.set("Content-Length", String(file.bytes));
  if (request.method === "HEAD") return new Response(null, { headers });

  const requested = request.headers.get("Range")?.trim();
  const range = requested && !request.headers.has("If-Range") && /^bytes\s*=/i.test(requested)
    ? byteRange(requested, file.bytes) : undefined;
  if (range === null) {
    headers.set("Content-Range", `bytes */${file.bytes}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  const stored = await bucket.get(mediaId, range ? { range } : undefined);
  if (!stored || !("body" in stored)) {
    headers.delete("Content-Length");
    headers.delete("Content-Type");
    return new Response(null, { status: 404, headers });
  }
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${file.bytes}`);
    headers.set("Content-Length", String(range.length));
  }
  return new Response(stored.body, { status: range ? 206 : 200, headers });
}

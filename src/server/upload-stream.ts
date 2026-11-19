import { ServerError } from "./errors.js";
import type { PollKind } from "./polls.js";

const PREFIX_SIZE = 512;
const FILE_LIMIT = { image: 10_000_000, video: 30_000_000 };
export const STREAM_TIMEOUT = 10 * 60 * 1000;

function matches(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[index + offset] === byte);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function mediaMime(bytes: Uint8Array, kind: PollKind) {
  if (kind === "image") {
    if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) return "image/gif";
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP" &&
        ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 4))) return "image/webp";
    return null;
  }
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === "ftyp" &&
      /^(isom|iso[2-9]|mp4[12]|avc1|dash|M4V |MSNV|cmfc|cmfs)$/.test(ascii(bytes, 8, 4))) return "video/mp4";
  if (matches(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    for (let offset = 4; offset + 7 <= bytes.length; offset++) {
      // EBML DocType element with the four-byte value "webm".
      if (matches(bytes, [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d], offset)) {
        return "video/webm";
      }
    }
  }
  return null;
}

function sizeMismatch() {
  return new ServerError(400, "upload_size_mismatch", "The file length does not match Content-Length.");
}

export async function readUpload(request: Request, kind: PollKind) {
  const length = request.headers.get("Content-Length");
  if (length === null) throw new ServerError(411, "length_required", "Send the file with a Content-Length header.");
  if (!/^\d+$/.test(length) || Number(length) < 1 || !request.body) {
    throw new ServerError(400, "empty_upload", "Send one file in the request body.");
  }
  const size = Number(length);
  if (size > FILE_LIMIT[kind]) {
    throw new ServerError(413, "upload_too_large", `Files of this type can be up to ${FILE_LIMIT[kind] / 1_000_000} MB.`);
  }

  const reader = request.body.getReader();
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, STREAM_TIMEOUT);
  const close = () => {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  };
  const prefix = new Uint8Array(Math.min(PREFIX_SIZE, size));
  let offset = 0;
  let remainder: Uint8Array | undefined;
  try {
    while (offset < prefix.length) {
      const chunk = await reader.read();
      if (chunk.done) throw sizeMismatch();
      const available = Math.min(chunk.value.byteLength, prefix.length - offset);
      prefix.set(chunk.value.subarray(0, available), offset);
      offset += available;
      if (chunk.value.byteLength > available) remainder = chunk.value.subarray(available);
    }
    let seen = offset + (remainder?.byteLength ?? 0);
    if (seen > size) throw sizeMismatch();
    const mime = mediaMime(prefix, kind);
    if (!mime) {
      throw new ServerError(415, "unsupported_media", kind === "image"
        ? "Upload a JPEG, PNG, WebP or GIF image." : "Upload an MP4 or WebM video.");
    }

    const parts = remainder ? [prefix, remainder] : [prefix];
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const part = parts.shift();
        if (part) {
          controller.enqueue(part);
          return;
        }
        const chunk = await reader.read();
        if (chunk.done) {
          if (seen !== size) controller.error(sizeMismatch());
          else controller.close();
          return;
        }
        seen += chunk.value.byteLength;
        if (seen > size) controller.error(sizeMismatch());
        else controller.enqueue(chunk.value);
      },
      cancel: close,
    });
    return { size, mime, stream, close };
  } catch (error) {
    close();
    throw error;
  }
}

export async function putStream(
  bucket: R2Bucket, key: string, input: ReadableStream, size: number, mime: string,
  timeout = STREAM_TIMEOUT,
) {
  // R2 requires a stream with a known length. This also rejects extra or missing bytes.
  const { readable, writable } = new FixedLengthStream(size);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    const write = input.pipeTo(writable, { signal: abort.signal });
    const upload = bucket.put(key, readable, { httpMetadata: { contentType: mime } })
      .catch((error: unknown) => {
        abort.abort(error);
        throw error;
      });
    const [written, stored] = await Promise.allSettled([write, upload]);
    if (written.status === "rejected" && written.reason instanceof ServerError) throw written.reason;
    if (stored.status === "rejected" || written.status === "rejected" || !stored.value) {
      throw new ServerError(502, "media_save_failed", "The file could not be saved. Try uploading it again.");
    }
  } finally {
    clearTimeout(timer);
  }
}

export function fileLabel(request: Request) {
  const encoded = request.headers.get("X-File-Name") ?? "";
  let label = encoded;
  try {
    label = decodeURIComponent(encoded);
  } catch {
    // A literal percent sign is also valid in a file name.
  }
  return (label.split(/[/\\]/).pop() ?? "").replace(/\p{Cc}/gu, "").trim().slice(0, 255);
}

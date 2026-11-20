import { byteRange } from "./media.js";

// Workers static assets ignore Range and always send the whole file. Safari plays a video only
// after a 206 answer, so the demo videos in public/videos/ go through here.
// The assets binding does not always send Content-Length. Then the file is read once per
// isolate, chunk by chunk, only to count its bytes.
const sizes = new Map<string, number>();
async function countBytes(url: string, assets: Fetcher) {
  const key = new URL(url).pathname;
  let bytes = sizes.get(key) ?? 0;
  if (bytes) return bytes;
  const reader = (await assets.fetch(url)).body!.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) bytes += chunk.value.byteLength;
  sizes.set(key, bytes);
  return bytes;
}

export async function serveSiteVideo(request: Request, assets: Fetcher) {
  const asset = await assets.fetch(request.url, { method: request.method });
  const requested = request.headers.get("Range");
  if (asset.status !== 200 || !asset.body || request.method !== "GET" || !requested) return asset;
  const bytes = Number(asset.headers.get("Content-Length")) || await countBytes(request.url, assets);

  const range = byteRange(requested, bytes);
  if (range === undefined) return asset;
  const headers = new Headers(asset.headers);
  headers.set("Accept-Ranges", "bytes");
  if (range === null) {
    await asset.body.cancel();
    headers.set("Content-Range", `bytes */${bytes}`);
    headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${bytes}`);
  headers.set("Content-Length", String(range.length));

  // Stream the slice: skip the bytes before it, stop after it. Nothing is held in memory.
  let skip = range.offset;
  let left = range.length;
  const slice = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (skip >= chunk.byteLength) {
        skip -= chunk.byteLength;
        return;
      }
      const part = chunk.subarray(skip, skip + left);
      skip = 0;
      left -= part.byteLength;
      controller.enqueue(part);
      if (left === 0) controller.terminate();
    },
  });
  const body = asset.body.pipeThrough(slice).pipeThrough(new FixedLengthStream(range.length));
  return new Response(body, { status: 206, headers });
}

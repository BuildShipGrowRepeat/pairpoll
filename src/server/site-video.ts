import { byteRange } from "./media.js";

// Workers static assets ignore Range and always send the whole file. Safari plays a video only
// after a 206 answer, so the demo videos in public/videos/ go through here.
export async function serveSiteVideo(request: Request, assets: Fetcher) {
  const asset = await assets.fetch(request.url, { method: request.method });
  const requested = request.headers.get("Range");
  if (asset.status !== 200 || request.method !== "GET" || !requested) return asset;

  const bytes = await asset.arrayBuffer();
  const range = byteRange(requested, bytes.byteLength);
  const headers = new Headers(asset.headers);
  headers.set("Accept-Ranges", "bytes");
  if (range === undefined) return new Response(bytes, { headers });
  if (range === null) {
    headers.set("Content-Range", `bytes */${bytes.byteLength}`);
    headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${bytes.byteLength}`);
  headers.set("Content-Length", String(range.length));
  return new Response(bytes.slice(range.offset, range.offset + range.length), { status: 206, headers });
}

/* global fetch, Headers */

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid API URL: ${value}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("The API URL must use HTTP or HTTPS.");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Use HTTPS, except for a local Pairpoll server.");
  }
  return url.href.replace(/\/$/, "");
}

export class PairpollClient {
  constructor(apiUrl, apiKey) {
    this.apiUrl = normalizeApiUrl(apiUrl);
    this.apiKey = apiKey;
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (options.json !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.apiUrl}/api/v1${path}`, {
      method: options.method || "GET",
      headers,
      body: options.json === undefined ? options.body : JSON.stringify(options.json),
    });
    if (!response.ok) {
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      const error = payload?.error;
      throw new ApiError(response.status, error?.code || "request_failed", error?.message || `Pairpoll returned HTTP ${response.status}.`, error?.details);
    }
    return options.text ? response.text() : response.json();
  }

  startDevice() { return this.request("/device", { method: "POST" }); }
  exchangeDevice(secret) {
    const client = new PairpollClient(this.apiUrl, secret);
    return client.request("/device");
  }
  whoami() { return this.request("/whoami"); }
  list() { return this.request("/polls"); }
  get(pollId) { return this.request(`/polls/${pollId}`); }
  create(settings) { return this.request("/polls", { method: "POST", json: settings }); }
  upload(pollId, name, bytes) {
    return this.request(`/polls/${pollId}/items`, {
      method: "POST",
      headers: { "Content-Length": String(bytes.byteLength), "X-File-Name": encodeURIComponent(name) },
      body: bytes,
    });
  }
  uploadPoster(pollId, itemId, bytes) {
    return this.request(`/polls/${pollId}/items/${itemId}/poster`, {
      method: "POST",
      headers: { "Content-Length": String(bytes.byteLength) },
      body: bytes,
    });
  }
  open(pollId) { return this.request(`/polls/${pollId}/open`, { method: "POST" }); }
  close(pollId) { return this.request(`/polls/${pollId}/close`, { method: "POST" }); }
  results(pollId) { return this.request(`/polls/${pollId}/results`); }
  resultsCsv(pollId) { return this.request(`/polls/${pollId}/export?format=csv`, { text: true }); }
  delete(pollId) { return this.request(`/polls/${pollId}`, { method: "DELETE" }); }
}

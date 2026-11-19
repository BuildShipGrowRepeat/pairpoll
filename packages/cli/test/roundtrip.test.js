import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";

const execute = promisify(execFile);
const pollId = "11111111-1111-4111-8111-111111111111";
const code = "share-code";
let server;
let apiUrl;
let directory;
let uploads = 0;
let created = 0;

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe(`Bearer ppk_${"1".repeat(64)}`);
    if (request.method === "POST" && request.url === "/api/v1/polls") {
      const settings = JSON.parse((await readBody(request)).toString("utf8"));
      created++;
      expect(settings).toMatchObject({ kind: "image", question: "Pick one", topSize: 3, voterCap: 12 });
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: pollId, code, status: "draft", ...settings }));
      return;
    }
    if (request.method === "POST" && request.url === `/api/v1/polls/${pollId}/items`) {
      const bytes = await readBody(request);
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      uploads++;
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: `item-${uploads}` }));
      return;
    }
    if (request.method === "GET" && request.url === `/api/v1/polls/${pollId}`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: pollId,
        code,
        status: "draft",
        question: "Pick one",
        items: [{ id: "item-1" }, { id: "item-2" }],
      }));
      return;
    }
    if (request.method === "GET" && request.url === `/api/v1/polls/${pollId}/results`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ poll: { id: pollId }, items: [], ranking: [], runs: [], finished: 0 }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found", message: "Not found" } }));
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
  directory = await mkdtemp(join(tmpdir(), "pairpoll-cli-test-"));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  await Promise.all([writeFile(join(directory, "one.png"), png), writeFile(join(directory, "two.png"), png)]);
});

afterAll(async () => {
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(directory, { recursive: true, force: true });
});

test("create uploads files and results reads the same poll", async () => {
  const env = { ...process.env, PAIRPOLL_API_KEY: `ppk_${"1".repeat(64)}` };
  const cli = new URL("../bin/pairpoll.js", import.meta.url);
  const created = await execute(process.execPath, [
    cli.pathname, "create", directory, "--question", "Pick one", "--max-voters", "12",
    "--api-url", apiUrl, "--json",
  ], { env });
  expect(JSON.parse(created.stdout)).toMatchObject({
    poll: { id: pollId, status: "draft", items: [{ id: "item-1" }, { id: "item-2" }] },
    shareUrl: `${apiUrl}/p/${code}`,
  });
  expect(uploads).toBe(2);

  const results = await execute(process.execPath, [
    cli.pathname, "results", pollId, "--api-url", apiUrl, "--json",
  ], { env });
  expect(JSON.parse(results.stdout)).toMatchObject({ poll: { id: pollId }, finished: 0 });
});

test("create stops before making a poll when a file is over the size limit", async () => {
  const env = { ...process.env, PAIRPOLL_API_KEY: `ppk_${"1".repeat(64)}` };
  const cli = new URL("../bin/pairpoll.js", import.meta.url);
  const large = await mkdtemp(join(tmpdir(), "pairpoll-cli-large-"));
  try {
    await writeFile(join(large, "one.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(large, "two.png"), "");
    await truncate(join(large, "two.png"), 10_000_001);
    const before = created;
    const failed = await execute(process.execPath, [
      cli.pathname, "create", large, "--question", "Pick one", "--api-url", apiUrl, "--json",
    ], { env }).catch((error) => error);
    expect(failed.code).toBe(2);
    expect(JSON.parse(failed.stderr).error.message).toContain("two.png is too large");
    expect(created).toBe(before);
  } finally {
    await rm(large, { recursive: true, force: true });
  }
});

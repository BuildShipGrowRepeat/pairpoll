import { expect, test } from "vitest";
import { ALL } from "../../src/pages/api/v1/[...path]";

async function call(path: string, request: Request) {
  if (typeof ALL !== "function") throw new Error("API handler is not callable");
  return ALL({ request, params: { path } } as never);
}

test("normalized sign-in consume paths still require the exact Origin", async () => {
  const response = await call("/auth/consume", new Request("https://pairpoll.test/api/v1//auth/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.test" },
    body: JSON.stringify({ token: "a".repeat(64) }),
  }));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_origin" } });
});

test("JSON bodies are bounded before they are parsed", async () => {
  const response = await call("auth/link", new Request("https://pairpoll.test/api/v1/auth/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "70000" },
    body: "{}",
  }));
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ error: { code: "request_too_large" } });
});

test("joining establishes the voter cookie before admission", async () => {
  const response = await call("public/code/join", new Request("https://pairpoll.test/api/v1/public/code/join", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://pairpoll.test" },
    body: JSON.stringify({ name: "Voter", token: "not-consumed-yet" }),
  }));
  expect(response.status).toBe(202);
  expect(response.headers.get("Set-Cookie")).toContain("pairpoll_voter=");
  expect(await response.json()).toEqual({ status: "cookie_set" });
});

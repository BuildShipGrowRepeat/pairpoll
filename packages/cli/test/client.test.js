import { expect, test } from "vitest";
import { normalizeApiUrl } from "../src/client.js";

test("API URLs require HTTPS outside loopback", () => {
  expect(normalizeApiUrl("http://127.0.0.1:4321")).toBe("http://127.0.0.1:4321");
  expect(() => normalizeApiUrl("http://pairpoll.example")).toThrow("Use HTTPS");
});

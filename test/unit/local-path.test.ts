import { expect, test } from "vitest";
import { localPath } from "../../src/lib/local-path";

test("keeps paths on this site", () => {
  expect(localPath("/app/polls/abc?tab=voters#top")).toBe("/app/polls/abc?tab=voters#top");
  expect(localPath("/signin/device?code=ABCD1234")).toBe("/signin/device?code=ABCD1234");
  // Still encoded, a backslash is just a character in a local path.
  expect(localPath("/%5Cexample.org")).toBe("/%5Cexample.org");
});

test("falls back for anything that leaves the site", () => {
  for (const value of [
    null,
    "",
    "app",
    "//example.org",
    "/\\example.org",
    "\\/example.org",
    "/\t/example.org",
    "/\n/example.org",
    "/./\\example.org",
    "/.//example.org",
    "https://example.org/app",
    "javascript:alert(1)",
    decodeURIComponent("/%5Cexample.org"),
    decodeURIComponent("%2F%2Fexample.org"),
  ]) {
    expect(localPath(value), String(value)).toBe("/app");
  }
});

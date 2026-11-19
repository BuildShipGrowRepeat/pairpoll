import { describe, expect, test } from "vitest";
import { parseArgs, UsageError } from "../src/args.js";

describe("CLI argument parsing", () => {
  test("parses create options and global flags in any position", () => {
    expect(parseArgs([
      "create", "one.png", "two.png", "--top=5", "--question", "Pick one", "--play-once",
      "--max-voters", "20", "--open", "--api-url", "http://localhost:4321", "--json",
    ])).toEqual({
      command: "create",
      files: ["one.png", "two.png"],
      question: "Pick one",
      topSize: 5,
      playsOnce: true,
      voterCap: 20,
      open: true,
      apiUrl: "http://localhost:4321",
      json: true,
    });
  });

  test("rejects conflicting result formats", () => {
    expect(() => parseArgs(["results", "11111111-1111-4111-8111-111111111111", "--csv", "--json"])).toThrow(UsageError);
  });

  test("rejects poll IDs that could change the request path", () => {
    expect(() => parseArgs(["delete", "../keys/key-id"])).toThrow(UsageError);
  });
});

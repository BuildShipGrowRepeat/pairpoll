import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { setResultsSharing } from "../../src/server/polls";
import { getResults, getSharedResults, resultsCsv } from "../../src/server/results";
import {
  deleteRun, getVoterState, joinPoll, newVoterToken, recordVoterEvent,
} from "../../src/server/runs";
import {
  NOW, account, clearData, expectCode, finishRun, readyPoll,
} from "./support";

beforeEach(clearData);

test("shared ranks include only finished runs, tie correctly, and hide names by default", async () => {
  const owner = await account("results@example.com");
  const created = await readyPoll(owner, { topSize: 1 });
  await finishRun(created.code, "First", created.items[0].id);
  await finishRun(created.code, "Second", created.items[1].id);
  await joinPoll(env.DB, created.code, "Unfinished", newVoterToken(), NOW);
  const sharedPoll = await setResultsSharing(env.DB, owner, created.id, true);

  const ownerResults = await getResults(env.DB, owner, created.id, NOW);
  expect(ownerResults.finished).toBe(2);
  expect(ownerResults.ranking).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: created.items[0].id, rank: 1, points: 1, firsts: 1 }),
    expect.objectContaining({ id: created.items[1].id, rank: 1, points: 1, firsts: 1 }),
  ]));
  const shared = await getSharedResults(env.DB, sharedPoll.shareCode!, NOW);
  expect(shared.finished).toBe(2);
  expect(shared).not.toHaveProperty("runs");
});

test("enabling names shares only finished voters and revoking the link denies it", async () => {
  const owner = await account("sharing@example.com");
  const created = await readyPoll(owner, { topSize: 1 });
  await finishRun(created.code, "Finished", created.items[0].id);
  await joinPoll(env.DB, created.code, "Still voting", newVoterToken(), NOW);
  const enabled = await setResultsSharing(env.DB, owner, created.id, true, true, NOW);
  const shared = await getSharedResults(env.DB, enabled.shareCode!, NOW);
  expect(shared.runs).toEqual([{ name: "Finished", ranking: [created.items[0].id] }]);

  await setResultsSharing(env.DB, owner, created.id, false, false, NOW);
  await expectCode(getSharedResults(env.DB, enabled.shareCode!, NOW), "poll_not_found");
});

test("CSV output neutralises formulas in item labels, voter names and ranked labels", async () => {
  const owner = await account("csv@example.com");
  const created = await readyPoll(owner, { topSize: 1 });
  await env.DB.prepare("UPDATE items SET label = ? WHERE id = ?").bind("=SUM(1,1)", created.items[0].id).run();
  await env.DB.prepare("UPDATE items SET label = ? WHERE id = ?").bind("@command", created.items[1].id).run();
  await finishRun(created.code, "+Voter", created.items[0].id);
  const csv = resultsCsv(await getResults(env.DB, owner, created.id, NOW));
  expect(csv).toContain("\"'=SUM(1,1)\"");
  expect(csv).toContain("\"'@command\"");
  expect(csv).toContain("\"'+Voter\"");
  expect(csv).not.toMatch(/,"[=+\-@]/);
});

test("playback state survives reloads and resets after each vote", async () => {
  const owner = await account("playback@example.com");
  const created = await readyPoll(owner, { kind: "video", topSize: 1, playsOnce: true, items: 3 });
  const token = newVoterToken();
  let state = await joinPoll(env.DB, created.code, "Voter", token, NOW);
  const firstPair = state.pair!;
  state = await recordVoterEvent(env.DB, created.code, token, {
    type: "played", revision: state.revision, index: state.index, itemId: firstPair[0],
  }, NOW);
  expect((await getVoterState(env.DB, created.code, token, NOW)).played).toEqual([true, false]);
  await expect(recordVoterEvent(env.DB, created.code, token, {
    type: "vote", revision: state.revision, index: state.index, winner: firstPair[0],
  }, NOW)).rejects.toMatchObject({
    code: "voter_state_conflict", details: expect.objectContaining({ played: [true, false] }),
  });
  state = await recordVoterEvent(env.DB, created.code, token, {
    type: "played", revision: state.revision, index: state.index, itemId: firstPair[1],
  }, NOW);
  expect(state.played).toEqual([true, true]);
  state = await recordVoterEvent(env.DB, created.code, token, {
    type: "vote", revision: state.revision, index: state.index, winner: firstPair[0],
  }, NOW);
  expect(state.pair).not.toBeNull();
  expect(state.played).toEqual([false, false]);
  expect((await getVoterState(env.DB, created.code, token, NOW)).played).toEqual([false, false]);
});

test("deleting a voter does not free an admitted place", async () => {
  const owner = await account("deleted-voter@example.com");
  const created = await readyPoll(owner, { topSize: 1, voterCap: 1 });
  const firstToken = newVoterToken();
  await finishRun(created.code, "First", created.items[0].id, firstToken);
  const run = await env.DB.prepare("SELECT id FROM runs WHERE poll_id = ?").bind(created.id).first<{ id: string }>();
  await deleteRun(env.DB, owner, created.id, run!.id, NOW);

  await expectCode(getVoterState(env.DB, created.code, firstToken, NOW), "run_deleted");
  await expectCode(joinPoll(env.DB, created.code, "Second", newVoterToken(), NOW), "poll_full");
  expect(await getResults(env.DB, owner, created.id, NOW)).toMatchObject({ finished: 0, runs: [] });
  expect(await env.DB.prepare("SELECT admitted_count FROM polls WHERE id = ?").bind(created.id)
    .first<number>("admitted_count")).toBe(1);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE poll_id = ?").bind(created.id)
    .first<number>("count")).toBe(1);
});

test("concurrent votes commit once and return the stored state to the loser", async () => {
  const owner = await account("concurrent-votes@example.com");
  const created = await readyPoll(owner, { topSize: 1 });
  const token = newVoterToken();
  const initial = await joinPoll(env.DB, created.code, "Voter", token, NOW);
  const event = {
    type: "vote" as const, revision: initial.revision, index: initial.index, winner: initial.pair![0],
  };
  const results = await Promise.allSettled([
    recordVoterEvent(env.DB, created.code, token, event, NOW),
    recordVoterEvent(env.DB, created.code, token, event, NOW),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({
    code: "voter_state_conflict", details: { revision: 1, ranking: [event.winner] },
  });
  expect(await env.DB.prepare("SELECT revision FROM runs WHERE poll_id = ?").bind(created.id)
    .first<number>("revision")).toBe(1);
});

test("a second join in the same browser resumes the original run", async () => {
  const owner = await account("same-browser@example.com");
  const created = await readyPoll(owner, { topSize: 1 });
  const token = newVoterToken();
  const first = await joinPoll(env.DB, created.code, "Original", token, NOW);
  const second = await joinPoll(env.DB, created.code, "Replacement", token, NOW);
  expect(second).toEqual(first);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE poll_id = ?").bind(created.id)
    .first<number>("count")).toBe(1);
  expect(await env.DB.prepare("SELECT name FROM runs WHERE poll_id = ?").bind(created.id)
    .first<string>("name")).toBe("Original");
  expect(await env.DB.prepare("SELECT admitted_count FROM polls WHERE id = ?").bind(created.id)
    .first<number>("admitted_count")).toBe(1);
});

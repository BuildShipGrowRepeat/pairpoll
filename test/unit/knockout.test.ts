import { expect, test } from "vitest";
import { replay } from "../../src/lib/knockout";

const items = (count: number) => Array.from({ length: count }, (_, i) => `item-${i}`);

test("every supported field and top size produces tournament placements across seeds and choices", () => {
  for (let count = 2; count <= 16; count++) {
    const ids = items(count);
    for (const topSize of [1, 3, 5] as const) {
      for (let seed = 0; seed < 256; seed++) {
        for (let strategy = 0; strategy < 4; strategy++) {
          const votes: string[] = [];
          let state = replay(ids, seed, votes, topSize);
          const expectedTotal = count - 1
            + (topSize >= 3 && count >= 4 ? 1 : 0)
            + (topSize >= 5 && count >= 5 ? Math.min(4, count - 4) - 1 : 0);
          expect(state.total).toBe(expectedTotal);
          while (state.next) {
            expect(state.ranking).toBeNull();
            expect(state.next[0]).not.toBe(state.next[1]);
            expect(state.next.every((id) => ids.includes(id))).toBe(true);
            const pair = state.next;
            votes.push(pair[(strategy >> (votes.length % 2)) & 1]);
            const continued = replay(ids, seed, votes, topSize);
            expect(continued.matches.at(-1)).toEqual(pair);
            expect(continued.total).toBe(expectedTotal);
            state = continued;
          }
          expect(state.matches).toHaveLength(expectedTotal);
          expect(state.ranking).toHaveLength(Math.min(topSize, count));
          expect(new Set(state.ranking).size).toBe(state.ranking!.length);
          expect(state.ranking!.every((id) => ids.includes(id))).toBe(true);

          // The last main match decides first and second. The preceding rounds
          // supply the semifinal and quarterfinal losers for placement matches.
          const final = state.matches[count - 2];
          const finalWinner = votes[count - 2];
          expect(state.ranking![0]).toBe(finalWinner);
          if (topSize > 1) expect(state.ranking![1]).toBe(final.find((id) => id !== finalWinner));
          if (topSize >= 3 && count >= 3) {
            const semifinalCount = Math.min(2, count - 2);
            const semifinalStart = count - 2 - semifinalCount;
            const semifinalLosers = state.matches.slice(semifinalStart, count - 2)
              .map((pair, i) => pair.find((id) => id !== votes[semifinalStart + i]));
            expect(semifinalLosers).toContain(state.ranking![2]);
            if (semifinalCount === 2) {
              expect(new Set(state.matches[count - 1])).toEqual(new Set(semifinalLosers));
              expect(state.ranking![2]).toBe(votes[count - 1]);
              if (topSize === 5) expect(semifinalLosers).toContain(state.ranking![3]);
            }
          }
          if (topSize === 5 && count >= 5) {
            const quarterCount = Math.min(4, count - 4);
            const quarterStart = count - 4 - quarterCount;
            const quarterLosers = state.matches.slice(quarterStart, quarterStart + quarterCount)
              .map((pair, i) => pair.find((id) => id !== votes[quarterStart + i]));
            expect(quarterLosers).toContain(state.ranking![4]);
            if (quarterCount > 1) expect(state.ranking![4]).toBe(votes.at(-1));
          }
        }
      }
    }
  }
}, 120_000);

test("all possible voting paths for small tournaments finish with distinct places", () => {
  for (let count = 2; count <= 6; count++) {
    for (const topSize of [1, 3, 5] as const) {
      for (const seed of [0, 1, 42, 0xffffffff]) {
        const ids = items(count);
        const visit = (votes: string[]) => {
          const state = replay(ids, seed, votes, topSize);
          if (state.next) {
            for (const winner of state.next) visit([...votes, winner]);
          } else {
            expect(state.ranking).toHaveLength(Math.min(count, topSize));
            expect(new Set(state.ranking).size).toBe(state.ranking!.length);
          }
        };
        visit([]);
      }
    }
  }
});

test("replay is deterministic and rejects invalid or extra votes", () => {
  const ids = items(5);
  const initial = replay(ids, 17, [], 5);
  expect(initial).toEqual(replay(ids, 17, [], 5));
  expect(() => replay(ids, 17, ["unknown"], 5)).toThrow(/current pair/);
  const votes: string[] = [];
  let state = initial;
  while (state.next) {
    votes.push(state.next[0]);
    state = replay(ids, 17, votes, 5);
  }
  expect(state).toEqual(replay(ids, 17, votes, 5));
  expect(() => replay(ids, 17, [...votes, votes[0]], 5)).toThrow(/complete/);
});

test("rejects invalid tournament inputs", () => {
  expect(() => replay(["a"], 0, [], 1)).toThrow();
  expect(() => replay(items(17), 0, [], 1)).toThrow();
  expect(() => replay(["a", "a"], 0, [], 1)).toThrow();
  expect(() => replay(items(2), -1, [], 1)).toThrow();
  expect(() => replay(items(2), 2 ** 32, [], 1)).toThrow();
  expect(() => replay(items(2), 0.5, [], 1)).toThrow();
  expect(() => replay(items(2), 0, [], 2 as 1)).toThrow();
});

test("covers every distinct arrangement of first-round byes", () => {
  for (let count = 3; count <= 16; count++) {
    const ids = items(count);
    const size = 2 ** Math.ceil(Math.log2(count));
    const firstMatches = count - size / 2;
    const secondMatches = size / 4;
    // A second-round match can have zero, one or two first-round winners.
    const possible = new Set<string>();
    const enumerate = (groups: number[], remaining: number) => {
      if (groups.length === secondMatches) {
        if (remaining === 0) possible.add(groups.join(","));
        return;
      }
      for (let i = 0; i <= Math.min(2, remaining); i++) enumerate([...groups, i], remaining - i);
    };
    enumerate([], firstMatches);
    const observed = new Set<string>();
    for (let seed = 0; seed < 256 && observed.size < possible.size; seed++) {
      const votes: string[] = [];
      let state = replay(ids, seed, votes, 1);
      while (votes.length < firstMatches + secondMatches) {
        votes.push(state.next![0]);
        state = replay(ids, seed, votes, 1);
      }
      const firstWinners = new Set(votes.slice(0, firstMatches));
      const arrangement = state.matches.slice(firstMatches, firstMatches + secondMatches)
        .map((pair) => pair.filter((id) => firstWinners.has(id)).length);
      observed.add(arrangement.join(","));
    }
    expect(observed, `field size ${count}`).toEqual(possible);
  }
});

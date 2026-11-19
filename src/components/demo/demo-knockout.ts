/*
  Minimal knockout for the marketing demo only: no shuffle, top 3 at most, nothing stored.
  Stage 2 swaps this for the real module in src/lib. Keep the same shape: the whole state
  is replayed from the item list and the picks made so far.
*/

export interface DemoState {
  pair: [string, string] | null;
  done: number;
  total: number;
  top: string[];
}

class Pending {
  constructor(public pair: [string, string]) {}
}

function run(ids: string[], topSize: number, choose: (index: number, a: string, b: string) => string | undefined) {
  let played = 0;
  const match = (a: string, b: string): [string, string] => {
    const winner = choose(played, a, b);
    if (winner === undefined) throw new Pending([a, b]);
    played += 1;
    return winner === a ? [a, b] : [b, a];
  };

  let size = 1;
  while (size < ids.length) size *= 2;
  const half = size / 2;
  let field: (string | null)[] = [];
  for (let i = 0; i < half; i++) field.push(ids[i], ids[half + i] ?? null);

  let second: string | undefined;
  let semiLosers: string[] = [];
  while (field.length > 1) {
    const next: (string | null)[] = [];
    const losers: string[] = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i];
      const b = field[i + 1];
      if (a === null || b === null) {
        next.push(a ?? b);
        continue;
      }
      const [winner, loser] = match(a, b);
      next.push(winner);
      losers.push(loser);
    }
    if (field.length === 2) second = losers[0];
    if (field.length === 4) semiLosers = losers;
    field = next;
  }

  const top = [field[0], second];
  if (topSize >= 3 && semiLosers.length === 2) top.push(match(semiLosers[0], semiLosers[1])[0]);
  else if (topSize >= 3 && semiLosers.length === 1) top.push(semiLosers[0]);
  return { played, top: top.filter((id): id is string => Boolean(id)).slice(0, topSize) };
}

export function replayDemo(ids: string[], picks: string[], topSize = 3): DemoState {
  const total = run(ids, topSize, (_i, a) => a).played;
  try {
    const { top } = run(ids, topSize, (i) => picks[i]);
    return { pair: null, done: picks.length, total, top };
  } catch (error) {
    if (error instanceof Pending) return { pair: error.pair, done: picks.length, total, top: [] };
    throw error;
  }
}

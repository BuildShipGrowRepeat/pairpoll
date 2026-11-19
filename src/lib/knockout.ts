export type Pair = [string, string];

export interface Replay {
  matches: Pair[];
  next: Pair | null;
  ranking: string[] | null;
  total: number;
}

// Replaying the same seed and ordered winners always yields the same tournament.
export function replay(ids: string[], seed: number, winners: string[], topSize: 1 | 3 | 5): Replay {
  if (ids.length < 2 || ids.length > 16 || new Set(ids).size !== ids.length) {
    throw new Error("A tournament needs 2 to 16 distinct items");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("Seed must be an unsigned 32-bit integer");
  }
  if (topSize !== 1 && topSize !== 3 && topSize !== 5) {
    throw new Error("Top size must be 1, 3 or 5");
  }

  let randomState = seed;
  const random = () => {
    randomState = (randomState + 0x6d2b79f5) >>> 0;
    let value = randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = <T>(items: T[]): T[] => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const matches: Pair[] = [];
  let next: Pair | null = null;
  let total = 0;
  const play = (a: string, b: string): Pair => {
    const pair: Pair = random() < 0.5 ? [a, b] : [b, a];
    const index = total++;
    if (index < winners.length) {
      const winner = winners[index];
      if (winner !== pair[0] && winner !== pair[1]) throw new Error("Winner is not in the current pair");
      matches.push(pair);
      return [winner, winner === pair[0] ? pair[1] : pair[0]];
    }
    next ??= pair;
    return pair;
  };

  let size = 1;
  while (size < ids.length) size *= 2;
  const order = shuffle(ids);
  const half = size / 2;
  const pairs: [string, string | null][] = [];
  for (let i = 0; i < half; i++) pairs.push([order[i], order[half + i] ?? null]);
  let field = shuffle(pairs).flat();
  let second = "";
  let semiLosers: string[] = [];
  let quarterLosers: string[] = [];
  while (field.length > 1) {
    const advancing: string[] = [];
    const losers: string[] = [];
    for (let i = 0; i < field.length; i += 2) {
      const first = field[i];
      const other = field[i + 1];
      if (first === null || other === null) {
        advancing.push((first ?? other)!);
      } else {
        const [winner, loser] = play(first, other);
        advancing.push(winner);
        losers.push(loser);
      }
    }
    if (field.length === 2) second = losers[0];
    if (field.length === 4) semiLosers = losers;
    if (field.length === 8) quarterLosers = losers;
    field = advancing;
  }

  const ranking = [field[0]!, second];
  if (topSize >= 3) {
    if (semiLosers.length === 2) ranking.push(...play(semiLosers[0], semiLosers[1]));
    else ranking.push(...semiLosers);
  }
  if (topSize >= 5 && quarterLosers.length > 0) {
    let pool = shuffle(quarterLosers);
    while (pool.length > 1) {
      const advancing: string[] = [];
      for (let i = 0; i < pool.length; i += 2) {
        advancing.push(i + 1 < pool.length ? play(pool[i], pool[i + 1])[0] : pool[i]);
      }
      pool = advancing;
    }
    ranking.push(pool[0]);
  }
  if (winners.length > total) throw new Error("Tournament is already complete");
  return { matches, next, ranking: next ? null : ranking.slice(0, Math.min(topSize, ids.length)), total };
}

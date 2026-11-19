// Where votes go. The server driver talks to /api/v1/public; the preview driver replays the
// same knockout in the browser and stores nothing.
import { replay } from "../../lib/knockout";
import { api, ApiError, type VoterState } from "../app/client";

export interface Driver {
  join(name: string, token: () => Promise<string>): Promise<VoterState>;
  played(state: VoterState, itemId: string): Promise<VoterState>;
  vote(state: VoterState, winner: string): Promise<VoterState>;
}

/** A 409 conflict carries the current state; continue from it instead of failing. */
async function event(code: string, body: Record<string, unknown>): Promise<VoterState> {
  try {
    return await api<VoterState>(`/public/${encodeURIComponent(code)}/events`, "POST", body);
  } catch (error) {
    if (error instanceof ApiError && error.code === "voter_state_conflict" && error.details) return error.details as VoterState;
    throw error;
  }
}

export function serverDriver(code: string): Driver {
  const path = `/public/${encodeURIComponent(code)}/join`;
  return {
    async join(name, token) {
      const body = { name, token: await token() };
      // The first call only sets the voter cookie (202) and does not use up the check token.
      const first = await api<VoterState | { status: "cookie_set" }>(path, "POST", body);
      return "status" in first ? api<VoterState>(path, "POST", body) : first;
    },
    played: (state, itemId) => event(code, { type: "played", revision: state.revision, index: state.index, itemId }),
    vote: (state, winner) => event(code, { type: "vote", revision: state.revision, index: state.index, winner }),
  };
}

export function previewDriver(ids: string[], topSize: 1 | 3 | 5): Driver {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const winners: string[] = [];
  let watched: string[] = [];
  let revision = 0;
  const state = (): VoterState => {
    const result = replay(ids, seed, winners, topSize);
    return {
      revision,
      index: result.matches.length,
      total: result.total,
      pair: result.next,
      played: result.next ? [watched.includes(result.next[0]), watched.includes(result.next[1])] : [false, false],
      ranking: result.ranking,
    };
  };
  return {
    join: async () => state(),
    played: async (_state, itemId) => {
      watched = [...watched, itemId];
      revision++;
      return state();
    },
    vote: async (_state, winner) => {
      winners.push(winner);
      watched = [];
      revision++;
      return state();
    },
  };
}

/** The number of pairs a voter sees; it depends only on the item count and top size. */
export function pairCount(ids: string[], topSize: 1 | 3 | 5): number {
  return ids.length >= 2 ? replay(ids, 0, [], topSize).total : 0;
}

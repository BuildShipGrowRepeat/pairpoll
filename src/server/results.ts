import { ServerError } from "./errors.js";
import { itemView, LIVE_POLL, pollView, type ItemRow, type PollRow } from "./polls.js";
import { stateOf, type RunRow } from "./runs.js";

interface RankingRow {
  id: string;
  rank: number;
  points: number;
  firsts: number;
}

async function buildResults(db: D1Database, key: string, ownerId: string | null, now: number) {
  const predicate = ownerId === null ? "p.share_code = ? AND p.status <> 'draft'" : "p.id = ? AND p.owner_id = ?";
  const parameters = ownerId === null ? [key, now] : [key, ownerId, now];
  const [pollRows, itemRows, runRows] = await db.batch<PollRow | ItemRow | RunRow>([
    db.prepare(`SELECT p.* FROM polls p WHERE ${predicate} AND ${LIVE_POLL}`).bind(...parameters),
    db.prepare(`
      SELECT i.id, i.position, i.label, i.mime, i.bytes, i.object_key, i.poster_key, i.poster_bytes, i.poster_mime
      FROM items i JOIN polls p ON p.id = i.poll_id
      WHERE i.status = 'ready' AND ${predicate} AND ${LIVE_POLL}
      ORDER BY i.position, i.id
    `).bind(...parameters),
    db.prepare(`
      SELECT r.id, r.name, r.seed, r.votes, r.playback, r.revision, r.completed_at, r.deleted_at, r.created_at
      FROM runs r JOIN polls p ON p.id = r.poll_id
      WHERE r.deleted_at IS NULL AND ${predicate} AND ${LIVE_POLL}
      ORDER BY r.created_at, r.id
    `).bind(...parameters),
  ]);
  const poll = pollRows.results[0] as PollRow | undefined;
  if (!poll) throw new ServerError(404, "poll_not_found", "This poll was not found.");

  const items = (itemRows.results as ItemRow[]).map(itemView);
  const ids = items.map((item) => item.id);
  const runs = (runRows.results as RunRow[]).map((row) => {
    const state = stateOf(row, ids, poll.top_size);
    const ranking = row.completed_at === null ? null : state.ranking;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      status: ranking === null ? "in_progress" as const : "finished" as const,
      index: state.index,
      total: state.total,
      ranking,
    };
  });

  const scores = new Map(ids.map((id) => [id, { id, rank: 0, points: 0, firsts: 0 }]));
  let finished = 0;
  for (const run of runs) {
    if (!run.ranking) continue;
    finished++;
    const top = run.ranking;
    top.forEach((id, index) => {
      const score = scores.get(id)!;
      score.points += top.length - index;
      if (index === 0) score.firsts++;
    });
  }
  const ranking: RankingRow[] = [...scores.values()].sort((a, b) => b.points - a.points || b.firsts - a.firsts);
  ranking.forEach((row, index) => {
    const previous = ranking[index - 1];
    row.rank = previous && row.points === previous.points && row.firsts === previous.firsts
      ? previous.rank : index + 1;
  });
  return { poll: pollView(poll), items, ranking, runs, finished };
}

export function getResults(db: D1Database, ownerId: string, pollId: string, now = Date.now()) {
  return buildResults(db, pollId, ownerId, now);
}

export async function getSharedResults(db: D1Database, shareCode: string, now = Date.now()) {
  const { poll, items, ranking, runs, finished } = await buildResults(db, shareCode, null, now);
  return {
    question: poll.question,
    kind: poll.kind,
    topSize: poll.topSize,
    status: poll.status,
    items: items.map((item, index) => ({ ...item, label: `Item ${index + 1}` })),
    ranking,
    finished,
    ...(poll.shareNames ? {
      runs: runs.filter((run) => run.ranking).map(({ name, ranking }) => ({ name, ranking })),
    } : {}),
  };
}

function csvCell(value: string | number | null) {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  // Treat user-entered names and labels as text when opened in a spreadsheet.
  const text = /^[=+\-@\t\r\n]/.test(value.trimStart()) ? "'" + value : value;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function resultsCsv(results: Awaited<ReturnType<typeof getResults>>) {
  const labels = new Map(results.items.map((item, index) => [item.id, item.label || `Item ${index + 1}`]));
  const rows: Array<Array<string | number | null>> = [
    ["type", "rank", "item_id", "item", "points", "first_places", "voter_id", "voter_name",
      "started_at", "finished_at", "status", "top_items"],
    ...results.ranking.map((item) =>
      ["item", item.rank, item.id, labels.get(item.id) ?? "", item.points, item.firsts,
        null, null, null, null, null, null]),
    ...results.runs.map((run) =>
      ["voter", null, null, null, null, null, run.id, run.name, new Date(run.createdAt).toISOString(),
        run.completedAt === null ? null : new Date(run.completedAt).toISOString(), run.status,
        run.ranking === null ? null : JSON.stringify(run.ranking.map((id) => labels.get(id) ?? id))]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

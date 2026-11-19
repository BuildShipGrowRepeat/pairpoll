import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { closePoll, createPoll, deletePoll, draftPollRow, listPolls, openPoll } from "../polls.js";
import { getResults } from "../results.js";
import { deleteRun } from "../runs.js";
import { ServerError } from "../errors.js";
import { MCP_SCOPE } from "./scope.js";

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function toolError(error: unknown) {
  const known = error instanceof ServerError;
  const value = known
    ? { error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } }
    : { error: { code: "internal_error", message: "Something went wrong. Try again." } };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function run<T>(operation: () => Promise<T>) {
  return operation().then(toolResult, toolError);
}

const pollId = z.uuid().describe("The poll ID returned by create_poll or list_polls.");
const oauthTool = {
  _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] },
} as const;

export function createPairpollMcpServer(db: D1Database, ownerId: string, requestUrl: string) {
  const origin = new URL(requestUrl).origin;
  const server = new McpServer(
    { name: "pairpoll", version: "1.0.0" },
    { instructions: "Create a draft, send the creator to get_upload_link to add files, then call open_poll. Pairpoll does not fetch files from URLs." },
  );

  server.registerTool("create_poll", {
    ...oauthTool,
    title: "Create a Pairpoll draft",
    description: "Create an empty image or video poll draft. This does not upload files or open voting. Next call get_upload_link so the creator can add 2 to 16 files in the browser.",
    inputSchema: z.object({
      kind: z.enum(["image", "video"]).describe("All files in the poll must have this type."),
      question: z.string().min(1).max(200).describe("The question voters see."),
      topSize: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional().describe("How many ranked places each voter produces. Defaults to 3."),
      playsOnce: z.boolean().optional().describe("For video polls only, require each video to finish once per pair before voting. Defaults to false."),
      voterCap: z.number().int().min(1).max(200).optional().describe("Maximum admitted voters. Defaults to 50."),
    }),
  }, (input) => run(() => createPoll(db, ownerId, input)));

  server.registerTool("get_upload_link", {
    ...oauthTool,
    title: "Get the browser upload link",
    description: "Return the browser page for adding local files to a draft poll. Use this because MCP chat clients cannot pass attached images or videos to Pairpoll, and Pairpoll does not fetch remote URLs.",
    inputSchema: z.object({ pollId }),
  }, ({ pollId: id }) => run(async () => {
    await draftPollRow(db, ownerId, id);
    return { pollId: id, uploadUrl: new URL(`/app/polls/${id}`, origin).href };
  }));

  server.registerTool("open_poll", {
    ...oauthTool,
    title: "Open a poll",
    description: "Open a draft after 2 to 16 files are ready. Opening freezes its settings and files and returns the voter share link.",
    inputSchema: z.object({ pollId }),
  }, ({ pollId: id }) => run(async () => {
    const poll = await openPoll(db, ownerId, id);
    return { poll, shareUrl: new URL(`/p/${poll.code}`, origin).href };
  }));

  server.registerTool("close_poll", {
    ...oauthTool,
    title: "Close a poll",
    description: "Stop new votes on an open poll. Closing is final and the poll cannot reopen.",
    inputSchema: z.object({ pollId }),
  }, ({ pollId: id }) => run(() => closePoll(db, ownerId, id)));

  server.registerTool("get_results", {
    ...oauthTool,
    title: "Get poll results",
    description: "Return the overall ranking and every admitted voter run for a poll owned by this API key. Only finished runs count in the overall ranking.",
    inputSchema: z.object({ pollId }),
  }, ({ pollId: id }) => run(() => getResults(db, ownerId, id)));

  server.registerTool("list_polls", {
    ...oauthTool,
    title: "List polls",
    description: "List all unexpired polls owned by this API key, newest first. Use the returned poll ID with the other tools.",
    inputSchema: z.object({}),
  }, () => run(async () => ({ polls: await listPolls(db, ownerId) })));

  server.registerTool("delete_voter", {
    ...oauthTool,
    title: "Delete a voter result",
    description: "Permanently remove one voter run and its result from an owned poll. This does not free a place in the poll's voter limit.",
    inputSchema: z.object({
      pollId,
      voterId: z.uuid().describe("The voter run ID returned by get_results."),
    }),
  }, ({ pollId: id, voterId }) => run(async () => {
    await deleteRun(db, ownerId, id, voterId);
    return { ok: true };
  }));

  server.registerTool("delete_poll", {
    ...oauthTool,
    title: "Delete a poll",
    description: "Permanently deny access to an owned poll and queue its files and data for deletion.",
    inputSchema: z.object({ pollId }),
  }, ({ pollId: id }) => run(async () => {
    await deletePoll(db, ownerId, id);
    return { ok: true };
  }));

  return server;
}

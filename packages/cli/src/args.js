export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function value(tokens, index, option) {
  const current = tokens[index];
  const equals = current.indexOf("=");
  if (equals !== -1) return { value: current.slice(equals + 1), consumed: 1 };
  if (tokens[index + 1] === undefined) throw new UsageError(`${option} needs a value.`);
  return { value: tokens[index + 1], consumed: 2 };
}

function positiveInteger(input, option) {
  if (!/^\d+$/.test(input) || Number(input) < 1) throw new UsageError(`${option} needs a positive whole number.`);
  return Number(input);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pollId(input, command) {
  if (!UUID.test(input)) throw new UsageError(`Usage: pairpoll ${command} <poll-id>`);
  return input;
}

export function parseArgs(argv) {
  const tokens = [...argv];
  let apiUrl;
  let json = false;
  const rest = [];
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    if (token === "--json") {
      json = true;
      index++;
    } else if (token === "--api-url" || token.startsWith("--api-url=")) {
      const found = value(tokens, index, "--api-url");
      apiUrl = found.value;
      index += found.consumed;
    } else {
      rest.push(token);
      index++;
    }
  }

  const command = rest.shift();
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", apiUrl, json };
  }
  if (command === "--version" || command === "-v") return { command: "version", apiUrl, json };

  if (["login", "logout", "whoami", "list"].includes(command)) {
    if (rest.length) throw new UsageError(`${command} does not take arguments.`);
    return { command, apiUrl, json };
  }

  if (["open", "close", "delete"].includes(command)) {
    if (rest.length !== 1 || rest[0].startsWith("-")) throw new UsageError(`Usage: pairpoll ${command} <poll-id>`);
    return { command, pollId: pollId(rest[0], command), apiUrl, json };
  }

  if (command === "delete-voter") {
    if (rest.length !== 2 || !rest.every((id) => UUID.test(id))) throw new UsageError("Usage: pairpoll delete-voter <poll-id> <voter-id>");
    return { command, pollId: rest[0], voterId: rest[1], apiUrl, json };
  }

  if (command === "results") {
    let csv = false;
    const ids = [];
    for (const token of rest) {
      if (token === "--csv") csv = true;
      else if (token.startsWith("-")) throw new UsageError(`Unknown option: ${token}`);
      else ids.push(token);
    }
    if (ids.length !== 1) throw new UsageError("Usage: pairpoll results <poll-id> [--json|--csv]");
    if (json && csv) throw new UsageError("Choose --json or --csv, not both.");
    return { command, pollId: pollId(ids[0], command), csv, apiUrl, json };
  }

  if (command === "create") {
    const files = [];
    let question;
    let topSize = 3;
    let playsOnce = false;
    let voterCap = 50;
    let open = false;
    for (let index = 0; index < rest.length;) {
      const token = rest[index];
      if (token === "--question" || token.startsWith("--question=")) {
        const found = value(rest, index, "--question");
        question = found.value;
        index += found.consumed;
      } else if (token === "--top" || token.startsWith("--top=")) {
        const found = value(rest, index, "--top");
        const top = positiveInteger(found.value, "--top");
        if (![1, 3, 5].includes(top)) throw new UsageError("--top must be 1, 3 or 5.");
        topSize = top;
        index += found.consumed;
      } else if (token === "--max-voters" || token.startsWith("--max-voters=")) {
        const found = value(rest, index, "--max-voters");
        voterCap = positiveInteger(found.value, "--max-voters");
        if (voterCap > 200) throw new UsageError("--max-voters must be from 1 to 200.");
        index += found.consumed;
      } else if (token === "--play-once") {
        playsOnce = true;
        index++;
      } else if (token === "--open") {
        open = true;
        index++;
      } else if (token.startsWith("-")) {
        throw new UsageError(`Unknown option: ${token}`);
      } else {
        files.push(token);
        index++;
      }
    }
    if (!files.length || !question) {
      throw new UsageError("Usage: pairpoll create <files or folder...> --question <text> [--top 1|3|5] [--play-once] [--max-voters N] [--open]");
    }
    return { command, files, question, topSize, playsOnce, voterCap, open, apiUrl, json };
  }

  throw new UsageError(`Unknown command: ${command}`);
}

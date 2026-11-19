// Browser helpers shared by the creator app and the voter page: API calls, safe DOM building,
// formatting, copying, confirmation dialogs and screen-reader announcements.
import type { getPoll } from "../../server/polls";
import type { getResults, getSharedResults } from "../../server/results";
import type { getPublicPoll, VoterState } from "../../server/runs";

export type Poll = Awaited<ReturnType<typeof getPoll>>;
export type Item = Poll["items"][number];
export type Results = Awaited<ReturnType<typeof getResults>>;
export type SharedResults = Awaited<ReturnType<typeof getSharedResults>>;
export type PublicPoll = Awaited<ReturnType<typeof getPublicPoll>>;
export type { VoterState };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const OFFLINE = "Pairpoll could not be reached. Check your connection and try again.";

function toError(status: number, data: unknown): ApiError {
  const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
  return new ApiError(status, error?.code ?? "internal_error", error?.message ?? "Something went wrong. Try again.", error?.details);
}

/** JSON request to /api/v1. Throws ApiError with the server's code and message. */
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", OFFLINE);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw toError(response.status, data);
  return data as T;
}

/** Uploads one file as the raw request body, reporting progress from 0 to 1. */
export function upload<T>(path: string, file: Blob, name: string | null, onProgress: (share: number) => void): {
  done: Promise<T>;
  abort: () => void;
} {
  const xhr = new XMLHttpRequest();
  const done = new Promise<T>((resolve, reject) => {
    xhr.open("POST", `/api/v1${path}`);
    if (name) xhr.setRequestHeader("X-File-Name", encodeURIComponent(name));
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status < 300 ? resolve(xhr.response as T) : reject(toError(xhr.status, xhr.response)));
    xhr.onerror = () => reject(new ApiError(0, "network", OFFLINE));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "The upload was stopped."));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}

export const mediaUrl = (id: string) => `/api/v1/media/${encodeURIComponent(id)}`;

/** Small contact-sheet strip of the first four items, as on the polls list. */
export function sheetStrip(kind: "image" | "video", items: Item[]) {
  return h(
    "span",
    { class: "sheet-strip", "aria-hidden": "true" },
    Array.from({ length: 4 }, (_, index) => h("span", { class: "frame" }, items[index] && thumb(kind, items[index]))),
  );
}

export function thumb(kind: "image" | "video", item: Pick<Item, "mediaId" | "posterId">) {
  if (kind === "image" || item.posterId) return h("img", { src: mediaUrl(item.posterId ?? item.mediaId), alt: "", loading: "lazy" });
  return h("video", { src: `${mediaUrl(item.mediaId)}#t=0.1`, preload: "metadata", muted: true, playsinline: true });
}

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null;

/**
 * Builds an element. Strings become text nodes, so user text is never parsed as HTML.
 * Props: `class`, `on<event>` handlers, `dataset`, booleans as present/absent attributes, others as attributes.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2), value as EventListener);
    } else if (key === "dataset") {
      Object.assign(element.dataset, value);
    } else if (key === "value" || key === "checked") {
      (element as unknown as Record<string, unknown>)[key] = value;
    } else {
      element.setAttribute(key, value === true ? "" : String(value));
    }
  }
  // appendChild: the Workers types replace Element.append with HTMLRewriter's signature.
  for (const child of flatten(children)) element.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  return element;
}

function flatten(children: Child[]): (Node | string)[] {
  return children.flatMap((child) => {
    if (child === null || child === undefined || child === false) return [];
    if (Array.isArray(child)) return flatten(child);
    return typeof child === "number" ? [String(child)] : [child];
  });
}

// The grease-pencil loop (same path as PickLoop.astro). Static markup, no user text.
const LOOP_PATH = "M16 9C40 1 80 0 94 9 102 16 101 80 95 90 86 102 24 101 9 94 0 88-1 30 4 18 9 7 26 0 44-1";
export function loop(className: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", LOOP_PATH);
  svg.appendChild(path);
  return svg;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 minutes ago", "in 29 days". */
export function fromNow(ms: number, now = Date.now()): string {
  const diff = ms - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return relative.format(Math.round(diff / size), unit);
  }
  return "just now";
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fileSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

let announcer: HTMLElement | null = null;
/** Reads a short message to screen readers without moving focus. */
export function announce(message: string) {
  announcer ??= document.body.appendChild(h("div", { class: "visually-hidden", role: "status", "aria-live": "polite" }));
  announcer.textContent = "";
  window.setTimeout(() => (announcer!.textContent = message), 50);
}

/** Copies text and confirms on the button itself for two seconds. */
export async function copyText(button: HTMLButtonElement, text: string) {
  const label = button.dataset.label ?? button.textContent ?? "Copy";
  button.dataset.label = label;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    announce("Copied to the clipboard.");
  } catch {
    button.textContent = "Select and copy";
  }
  window.setTimeout(() => (button.textContent = label), 2000);
}

/** A read-only text field with a copy button, used for links and API keys. */
export function copyField(value: string, label: string, buttonLabel = "Copy link"): HTMLElement {
  const input = h("input", { class: "input copy-input", readonly: true, value, "aria-label": label, onfocus: () => input.select() });
  const button = h("button", { type: "button", class: "btn btn--primary", onclick: () => copyText(button, value) }, buttonLabel);
  return h("div", { class: "copy-field" }, input, button);
}

interface ConfirmOptions {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  /** When set, the person must type this word before the confirm button works. */
  typed?: string;
}

/** A modal confirmation. Resolves true only when the confirm button is used. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const input = options.typed
      ? h("input", { class: "input", id: "confirm-typed", autocomplete: "off", autocapitalize: "off", spellcheck: "false" })
      : null;
    const confirm = h(
      "button",
      { type: "submit", class: `btn ${options.danger ? "btn--danger" : "btn--primary"}`, disabled: Boolean(options.typed) },
      options.confirm,
    );
    input?.addEventListener("input", () => {
      confirm.disabled = input.value.trim().toLowerCase() !== options.typed!.toLowerCase();
    });
    const dialog = h(
      "dialog",
      { class: "dialog", "aria-labelledby": "confirm-title" },
      h(
        "form",
        { method: "dialog" },
        h("h2", { id: "confirm-title" }, options.title),
        h("p", null, options.body),
        input &&
          h("div", { class: "field" }, h("label", { class: "field-label", for: "confirm-typed" }, `Type ${options.typed} to confirm`), input),
        h(
          "div",
          { class: "actions dialog-actions" },
          confirm,
          h("button", { type: "button", class: "btn btn--quiet", onclick: () => dialog.close("cancel") }, "Cancel"),
        ),
      ),
    );
    confirm.value = "confirm";
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "confirm");
      dialog.remove();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

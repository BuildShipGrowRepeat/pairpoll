// Invisible Cloudflare Turnstile check. The widget is rendered once and run on submit,
// so every submission gets a fresh single-use token.
interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(container: HTMLElement): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const FAILED = "The security check did not load. Reload the page and try again.";
let script: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    tag.async = true;
    tag.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error(FAILED)));
    tag.onerror = () => {
      script = null;
      reject(new Error(FAILED));
    };
    document.head.appendChild(tag);
  });
  return script;
}

export function createCheck(container: HTMLElement, sitekey: string, action: string) {
  let widget: string | null = null;
  let used = false;
  let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;
  const settle = (token: string | null) => {
    const current = pending;
    pending = null;
    if (token) current?.resolve(token);
    else current?.reject(new Error("The security check failed. Try again."));
  };

  const ready = load().then((turnstile) => {
    widget = turnstile.render(container, {
      sitekey,
      action,
      execution: "execute",
      appearance: "interaction-only",
      callback: (token: string) => settle(token),
      "error-callback": () => settle(null),
      "expired-callback": () => (used = true),
    });
    return turnstile;
  });
  // Start loading early; failures surface when a token is requested.
  ready.catch(() => {});

  return {
    async token(): Promise<string> {
      const turnstile = await ready;
      if (used && widget) turnstile.reset(widget);
      used = true;
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => settle(null), 30_000);
        pending = {
          resolve: (token) => (window.clearTimeout(timer), resolve(token)),
          reject: (error) => (window.clearTimeout(timer), reject(error)),
        };
        turnstile.execute(container);
      });
    },
  };
}

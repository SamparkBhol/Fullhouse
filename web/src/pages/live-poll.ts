import { isCurrent } from "../router.ts";

export type PollState =
  | { kind: "checking" }
  | { kind: "fresh"; at: number; changed: boolean }
  | { kind: "paused" }
  | { kind: "failed"; at: number; retryMs: number | null; detail: string };

export interface PollOptions<T> {
  ticket: number;
  url(): string;
  token?: string;
  every(): number | null;
  onData(body: T): void;
  onState(state: PollState): void;
}

export interface Poller {
  checkNow(): void;
  reschedule(): void;
}

class CheckFailed extends Error {
  constructor(
    readonly detail: string,
    readonly retryMs = 0,
  ) {
    super(detail);
  }
}

function failureOf(status: number, retryAfter: string | null): CheckFailed {
  const wait = Number(retryAfter) * 1000;
  if (status === 429) return new CheckFailed("Too many checks from this address.", Number.isFinite(wait) ? wait : 60_000);
  if (status === 401) return new CheckFailed("This needs the owner link for this venue.");
  return new CheckFailed(`The server answered ${status}.`);
}

// Polls with If-None-Match, so an unchanged answer is a 304 with no body. A hidden tab stops polling
// and a visible one checks at once. Leaving the page stops it for good.
export function startPolling<T>(o: PollOptions<T>): Poller {
  let etag: string | null = null;
  let etagUrl = "";
  let timer = 0;
  let busy = false;
  let again = false;
  const live = () => isCurrent(o.ticket);

  const schedule = (ms: number | null): void => {
    window.clearTimeout(timer);
    if (ms !== null && live() && document.visibilityState === "visible") timer = window.setTimeout(() => void check(), ms);
  };

  // A check asked for while one is running, such as a new range, runs as soon as the first one ends.
  async function check(): Promise<void> {
    if (!live()) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    const url = o.url();
    if (url !== etagUrl) {
      etag = null;
      etagUrl = url;
    }
    o.onState({ kind: "checking" });
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (etag) headers["If-None-Match"] = etag;
      if (o.token) headers.Authorization = `Bearer ${o.token}`;
      let res: Response;
      try {
        res = await fetch(url, { headers, cache: "no-store", credentials: "same-origin" });
      } catch {
        throw new CheckFailed("No answer from the server.");
      }
      // An answer for a range the viewer has since left is dropped; the check queued by the change runs next.
      if (!live() || o.url() !== url) return;
      if (res.status === 304) {
        o.onState({ kind: "fresh", at: Date.now(), changed: false });
      } else if (res.ok) {
        const body = (await res.json()) as T;
        etag = res.headers.get("etag");
        o.onData(body);
        o.onState({ kind: "fresh", at: Date.now(), changed: true });
      } else {
        throw failureOf(res.status, res.headers.get("retry-after"));
      }
      schedule(o.every());
    } catch (err) {
      if (!live()) return;
      const every = o.every();
      const wait = err instanceof CheckFailed ? err.retryMs : 0;
      const retryMs = every === null ? null : Math.max(every, wait);
      o.onState({ kind: "failed", at: Date.now(), retryMs, detail: err instanceof CheckFailed ? err.detail : "The answer could not be read." });
      schedule(retryMs);
    } finally {
      busy = false;
      if (again) {
        again = false;
        void check();
      }
    }
  }

  const onVisibility = (): void => {
    if (!live()) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
      return;
    }
    if (o.every() === null) return;
    if (document.visibilityState === "hidden") {
      window.clearTimeout(timer);
      o.onState({ kind: "paused" });
    } else {
      void check();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  void check();
  return { checkNow: () => void check(), reschedule: () => schedule(o.every()) };
}

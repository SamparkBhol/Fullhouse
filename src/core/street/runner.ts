import type { Provenance } from "../../shared/contract.ts";
import { QlooError, type QlooErrorKind } from "../qloo/errors.ts";
import type { Qloo } from "../qloo/client.ts";
import type { Params } from "../qloo/request.ts";
import { limiter } from "./concurrency.ts";

// A ref is the call's place in issue order. Steps cite refs; the read turns them into provenance rows at the end,
// so the order does not depend on which answer arrived first.
export interface Fetched {
  body: unknown;
  ref: number;
}

export interface Runner {
  call(call: string, path: string, params: Params, label: string): Promise<Fetched | null>;
  notes(): string[];
  provenance(): { rows: Provenance[]; rowOf: (ref: number) => number };
  answered(): number;
  firstError(): QlooError | null;
}

const KIND_TEXT: Record<QlooErrorKind, string> = {
  auth: "Qloo refused the key",
  rate: "Qloo rate limit",
  bad_request: "Qloo rejected the request",
  not_found: "nothing found",
  server: "Qloo server error",
  budget: "daily budget spent",
  network: "network error",
  timeout: "timed out",
};

export const BUDGET_NOTE = "The daily Qloo call budget ran out during this read, so the remaining calls were skipped.";

export function failureNote(label: string, err: QlooError): string {
  return err.kind === "not_found" ? `${label} came back empty.` : `${label} failed (${KIND_TEXT[err.kind]}), so that part of the read is missing.`;
}

export function createRunner(q: Qloo, cap: number, concurrency: number): Runner {
  const throttle = limiter(concurrency);
  const done = new Map<number, Provenance>();
  const notes: Array<{ ref: number; text: string }> = [];
  let issued = 0;
  let sent = 0;
  let stopped = false;
  let first: QlooError | null = null;

  async function call(name: string, path: string, params: Params, label: string): Promise<Fetched | null> {
    const ref = issued++;
    if (stopped) return null;
    if (sent >= cap) {
      notes.push({ ref, text: `${label} was skipped because this read reached its cap of ${cap} Qloo calls.` });
      return null;
    }
    sent++;
    try {
      const res = await throttle(() => q.get(name, path, params));
      done.set(ref, res.prov);
      return { body: res.body, ref };
    } catch (err) {
      if (!(err instanceof QlooError) || err.kind === "auth") throw err;
      first ??= err;
      if (err.kind === "budget") {
        if (!stopped) notes.push({ ref, text: BUDGET_NOTE });
        stopped = true;
      } else {
        notes.push({ ref, text: failureNote(label, err) });
      }
      return null;
    }
  }

  function provenance(): { rows: Provenance[]; rowOf: (ref: number) => number } {
    const refs = [...done.keys()].sort((a, b) => a - b);
    const index = new Map(refs.map((ref, i) => [ref, i]));
    return { rows: refs.map((ref) => done.get(ref) as Provenance), rowOf: (ref) => index.get(ref) ?? -1 };
  }

  return {
    call,
    notes: () => [...notes].sort((a, b) => a.ref - b.ref).map((n) => n.text),
    provenance,
    answered: () => done.size,
    firstError: () => first,
  };
}

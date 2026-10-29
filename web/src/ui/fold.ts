import type { Because, Provenance } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { callName } from "../calls.ts";
import { h } from "../dom.ts";
import { openReceipt, reasons } from "./receipt.ts";

type Child = HTMLElement | string | null;

export interface FoldPart {
  heading?: string;
  because: Because[];
  nested?: boolean;
}

export interface FoldOptions {
  heading: string;
  plain: string[];
  parts?: FoldPart[];
  calls: Provenance[];
  callNames?: string[];
  tz?: string;
}

function known(i: number, calls: Provenance[]): boolean {
  return Number.isInteger(i) && i >= 0 && i < calls.length;
}

export function callsUsed(parts: FoldPart[], calls: Provenance[], names: string[] = []): number[] {
  const used = new Set<number>();
  for (const p of parts) for (const b of p.because) if (known(b.provenance, calls)) used.add(b.provenance);
  calls.forEach((c, i) => {
    if (names.includes(c.call)) used.add(i);
  });
  return [...used].sort((a, b) => a - b);
}

function callRow(index: number, calls: Provenance[], tz?: string): HTMLElement {
  const p = calls[index] as Provenance;
  return h(
    "li",
    null,
    h(
      "button",
      { type: "button", class: "fold-call", onclick: () => openReceipt(calls, index, { tz }) },
      h("span", { class: "fold-call-no" }, `Call ${index + 1}`),
      h("span", null, `${callName(p.call)}. ${plural(p.resultCount, "result", "results")}${p.cached ? ", from the cache" : ""}.`),
    ),
  );
}

// A long list of receipts folds once more under its own heading, so the drawer opens short.
function nestedPart(p: FoldPart, opts: FoldOptions): HTMLElement {
  return h("details", { class: "fold-sub" }, h("summary", null, `${p.heading}, ${plural(p.because.length, "line", "lines")}`), reasons(p.because, opts.calls, opts.tz));
}

// One part of the Receipts drawer: plain words first, then each reason with the Qloo call it came from.
export function receiptPart(opts: FoldOptions, ...extra: (HTMLElement | null)[]): HTMLElement {
  const parts = (opts.parts ?? []).filter((p) => p.because.length);
  const used = callsUsed(parts, opts.calls, opts.callNames);
  const body: Child[] = [
    ...opts.plain.map((t) => h("p", { class: "fold-plain" }, t)),
    ...extra,
    ...parts.flatMap((p) => (p.nested && p.heading ? [nestedPart(p, opts)] : [p.heading ? h("h4", { class: "fold-head" }, p.heading) : null, reasons(p.because, opts.calls, opts.tz)])),
  ];
  if (used.length) {
    body.push(
      h("h4", { class: "fold-head" }, used.length === 1 ? "The Qloo call" : `The ${used.length} Qloo calls`),
      h("ul", { class: "fold-calls" }, used.map((i) => callRow(i, opts.calls, opts.tz))),
    );
  }
  return h("section", { class: "fold" }, h("h3", { class: "fold-title" }, opts.heading), h("div", { class: "fold-body" }, body));
}

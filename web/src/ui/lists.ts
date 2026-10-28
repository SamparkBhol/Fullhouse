import type { Because, Provenance } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { reasons } from "./receipt.ts";

export interface Listed {
  because: Because[];
}

// Every result in one Qloo list carries the same rank line, so a list says it once and each row keeps the rest.
export function sharedLine(items: Listed[]): Because | null {
  const first = items[0]?.because[0];
  if (!first) return null;
  const same = items.every((i) => i.because[0]?.text === first.text && i.because[0]?.provenance === first.provenance);
  return same ? first : null;
}

export function ownReasons(item: Listed, shared: Because | null): Because[] {
  return shared ? item.because.slice(1) : item.because;
}

export function listReason(shared: Because | null, calls: Provenance[], tz: string): HTMLElement | null {
  return shared ? h("div", { class: "list-reason" }, reasons([shared], calls, tz)) : null;
}

export function moreRows(rows: HTMLElement[], shown: number, label: (n: number) => string, listClass: string): HTMLElement | null {
  const rest = rows.slice(shown);
  if (!rest.length) return null;
  return h("details", { class: "more" }, h("summary", null, label(rest.length)), h("ol", { class: listClass, start: String(shown + 1) }, rest));
}

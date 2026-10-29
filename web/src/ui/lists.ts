import type { Because } from "../../../src/shared/contract.ts";

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

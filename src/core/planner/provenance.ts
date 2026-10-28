import type { StreetRead } from "../../shared/contract.ts";

export function provIndex(read: StreetRead, calls: string[]): number {
  for (const call of calls) {
    for (let i = read.provenance.length - 1; i >= 0; i--) {
      const p = read.provenance[i];
      if (p && p.call === call && (p.resultCount > 0 || call === calls[calls.length - 1])) return i;
    }
  }
  return -1;
}

export function streetTagsIndex(read: StreetRead): number {
  return provIndex(read, ["street_tags"]);
}

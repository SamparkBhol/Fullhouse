import type { Provenance, StreetRead } from "../../shared/contract.ts";

function rowKey(p: Provenance): string {
  return `${p.call}|${p.endpoint}|${JSON.stringify(Object.entries(p.params).sort(([a], [b]) => a.localeCompare(b)))}`;
}

// Calls made after the read join its receipt list, so every reason still points at a row of the read. A call made again
// replaces its old row in place.
export function appendRows(read: StreetRead, rows: Provenance[]): { read: StreetRead; at: number[] } {
  const out = [...read.provenance];
  const at = rows.map((r) => {
    const i = out.findIndex((o) => rowKey(o) === rowKey(r));
    if (i >= 0) {
      out[i] = r;
      return i;
    }
    out.push(r);
    return out.length - 1;
  });
  return { read: { ...read, provenance: out }, at };
}

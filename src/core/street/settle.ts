import type { Because, Provenance, StreetRead } from "../../shared/contract.ts";
import { settleMatch } from "../pair/settle.ts";

export type DraftRead = Omit<StreetRead, "provenance">;

function remap(list: Because[], rowOf: (ref: number) => number): Because[] {
  return list.flatMap((b) => {
    const row = rowOf(b.provenance);
    return row < 0 ? [] : [{ ...b, provenance: row }];
  });
}

// Steps cite calls by ref; the finished read cites rows of its provenance list.
export function settleProvenance(draft: DraftRead, rows: Provenance[], rowOf: (ref: number) => number): StreetRead {
  const { match, ...rest } = draft;
  const read: StreetRead = {
    ...rest,
    heat: rest.heat.flatMap((h) => (rowOf(h.provenance) < 0 ? [] : [{ ...h, provenance: rowOf(h.provenance) }])),
    lovedPlaces: rest.lovedPlaces.map((p) => ({ ...p, because: remap(p.because, rowOf) })),
    rising: rest.rising.map((r) => ({ ...r, because: remap(r.because, rowOf) })),
    gaps: rest.gaps.map((g) => ({ ...g, because: remap(g.because, rowOf) })),
    provenance: rows,
  };
  if (match) read.match = settleMatch(match, rowOf);
  return read;
}

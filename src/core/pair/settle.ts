import type { Because, Fit, Match, MatchPartner } from "../../shared/contract.ts";

function remapBecause(list: Because[], rowOf: (ref: number) => number): Because[] {
  return list.flatMap((b) => {
    const row = rowOf(b.provenance);
    return row < 0 ? [] : [{ ...b, provenance: row }];
  });
}

function remapFit(fit: Fit | undefined, rowOf: (ref: number) => number): Fit | undefined {
  if (!fit) return undefined;
  return {
    ...fit,
    checks: fit.checks.map((c) => {
      if (c.provenance === undefined) return c;
      const row = rowOf(c.provenance);
      const { provenance: _, ...rest } = c;
      return row < 0 ? rest : { ...rest, provenance: row };
    }),
  };
}

function remapPartner(p: MatchPartner, rowOf: (ref: number) => number): MatchPartner {
  const out: MatchPartner = { ...p, because: remapBecause(p.because, rowOf) };
  const fit = remapFit(p.fit, rowOf);
  if (fit) out.fit = fit;
  return out;
}

// Steps cite calls by ref; once the read has its rows, every reason and check cites a row instead.
export function settleMatch(match: Match, rowOf: (ref: number) => number): Match {
  const out: Match = {
    ...match,
    partner: remapPartner(match.partner, rowOf),
    runnersUp: match.runnersUp.map((p) => remapPartner(p, rowOf)),
    provenance: match.provenance.map(rowOf).filter((row) => row >= 0),
  };
  if (out.partner.fit) out.fit = out.partner.fit;
  return out;
}

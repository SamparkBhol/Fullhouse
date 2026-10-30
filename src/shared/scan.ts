import type { PairFormat } from "./contract.ts";

export interface ScanFormatCount {
  format: PairFormat;
  label: string;
  n: number;
}

// Totals over venues, never a venue's name: a partner is never named before its own yes.
// Medians and formats are over the pair the engine picked for each venue that got one.
export interface ScanTotals {
  venues: number;
  matched: number;
  twoWay: number;
  medianFit: number | null;
  medianWalk: number | null;
  openTogether: number;
  formats: ScanFormatCount[];
}

export interface ScanCity {
  city: string;
  totals: ScanTotals;
}

export interface ScanRecord {
  at: string;
  calls: number;
  method: string;
  // A pair counts as two way only within this many minutes on foot.
  walkMax: number;
  overall: ScanTotals;
  cities: ScanCity[];
}

export interface ScanAnswer {
  scan: ScanRecord | null;
}

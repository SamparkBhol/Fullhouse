// The Monday rule, shared so the owner sees what the next run will do with the turnout they log.
export const DREW_LITTLE = 0.4;
export const DREW_WELL = 0.6;

export type TurnoutNext = "keep_format" | "change_format" | "no_change";

export interface TurnoutVerdict {
  share: number;
  next: TurnoutNext;
}

export function turnoutVerdict(headcount: number, cap: number | undefined): TurnoutVerdict | null {
  if (!cap || cap <= 0 || !Number.isFinite(headcount)) return null;
  const share = headcount / cap;
  return { share, next: share < DREW_LITTLE ? "change_format" : share >= DREW_WELL ? "keep_format" : "no_change" };
}

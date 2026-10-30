import type { FitKey } from "./contract.ts";

// The numbers the engine runs on, kept here so How it works prints the same ones the engine uses.
export const READ_CAP = 30;
export const BACK_CHECKS = 8;
export const PAIR_CANDIDATES = 8;
export const LOVED_TAKE = 50;
export const LOVED_RADIUS_M = 1200;
// Within this many points the top two are as good as level, and the shorter walk wins.
export const NEAR_TIE = 5;
// The board lists at least this many places from the top of the list, plus every place scored further down.
export const BOARD_TOP = 15;
export const FIT_MAX: Record<FitKey, number> = { crowd: 25, back: 25, partners: 15, open: 15, walk: 10, taste: 10 };
export const FIT_LABELS: Record<FitKey, string> = {
  crowd: "Crowd pull",
  back: "Loves you back",
  partners: "Good partners",
  open: "Open together",
  walk: "Close enough to walk",
  taste: "Shared taste",
};

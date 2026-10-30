import type { FitKey } from "./contract.ts";

// The numbers the engine runs on, kept here so How it works prints the same ones the engine uses.
export const READ_CAP = 30;
export const BACK_CHECKS = 8;
// Qloo answers are kept this long, and a search near the owner reaches this far.
export const CACHE_TTL_SEC = 86400;
export const NEAR_MILES = 1;
export const PAIR_CANDIDATES = 8;
export const LOVED_TAKE = 50;
export const LOVED_RADIUS_M = 1200;
// Within this many points the top two are as good as level, and the shorter walk wins.
export const NEAR_TIE = 5;
// The board lists at least this many places from the top of the list, plus every place scored further down.
export const BOARD_TOP = 15;
// The invite shows the partner this many places from the top of its own crowd's list.
export const THEIR_TOP = 5;
// Below this a count says more about an empty room than about the night, so public pages and the partner leave it out.
export const COUNT_SHOWN_FROM = 3;
export const FIT_MAX: Record<FitKey, number> = { crowd: 25, back: 25, partners: 15, open: 15, walk: 10, taste: 10 };
export const FIT_CHECKS = Object.keys(FIT_MAX).length;
// The quiet night a new venue starts with until its owner sets the real one.
export const DEFAULT_SLOT = { weekday: 2, start: "19:00", durationMin: 180 } as const;
// The open together check looks this many evenings ahead.
export const EVENINGS = 7;
// A venue nobody opens for this long stops its Monday runs, and after the second it is deleted with everything in it.
export const PAUSE_AFTER_DAYS = 56;
// The Monday run wakes at this hour in the venue's own time zone.
export const MONDAY_HOUR = 9;
// Each kind of pick is asked for this many titles, so "top ten" is what both crowds share.
export const PICKS_PER_TYPE = 10;
// A gap is a tag at least this many of the loved places carry and the venue does not.
export const MIN_CARRIERS = 2;
// This many different people reporting a public page takes it offline.
export const REPORTS_TO_HIDE = 3;
export const DELETE_AFTER_DAYS = 180;
export const FIT_LABELS: Record<FitKey, string> = {
  crowd: "Crowd pull",
  back: "Loves you back",
  partners: "Good partners",
  open: "Open together",
  walk: "Close enough to walk",
  taste: "Shared taste",
};

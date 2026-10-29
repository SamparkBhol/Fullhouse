import type { KindGroup, NightStop } from "../../shared/contract.ts";
import { parseHHMM } from "../planner/time.ts";
import type { Side } from "./stops.ts";

const EVENING_FROM = 17 * 60;

// Music belongs in a bar, a pub or a record shop, and in a cafe once it is evening. Never over a book club,
// a screening, a show, a late view, or a live room's own set.
function musicRoom(group: KindGroup | null, stop: NightStop): boolean {
  if (group === "drinks" || group === "record") return true;
  if (group !== "coffee") return false;
  const t = parseHHMM(stop.start);
  return t !== null && t.h * 60 + t.m >= EVENING_FROM;
}

export function playlistStops(stops: NightStop[], sides: Side[]): Array<"venue" | "partner"> {
  return stops.filter((s) => musicRoom(sides.find((x) => x.at === s.at)?.group ?? null, s)).map((s) => s.at);
}

import type { TheirPlace } from "../../shared/contract.ts";
import { ordinal, shortName } from "../../shared/words.ts";
import { esc } from "./html.ts";

// The partner's own crowd's list from the reverse read: its first places, and the asking venue at its real rank.
export interface TheirList {
  top: TheirPlace[];
  rank: number;
  of: number;
}

function row(rank: number, name: string, you: boolean): string {
  return `<li class="their-row${you ? " their-you" : ""}"><span class="their-rank">${rank}</span><span class="their-name">${esc(shortName(name))}</span></li>`;
}

export function theirListPanel(list: TheirList | undefined, venueName: string): string {
  if (!list?.top.length) return "";
  const v = shortName(venueName);
  const inTop = list.rank <= list.top.length;
  const rows = list.top.map((p) => row(p.rank, inTop && p.rank === list.rank ? venueName : p.name, inTop && p.rank === list.rank));
  const last = list.top[list.top.length - 1]!.rank;
  const gap = !inTop && list.rank > last + 1 ? `<li class="their-gap" aria-hidden="true"><span class="their-rank"></span></li>` : "";
  const you = inTop ? "" : row(list.rank, venueName, true);
  return (
    `<section class="panel their" aria-labelledby="their-title"><h2 id="their-title">Your crowd's list nearby</h2>` +
    `<ol class="their-rows">${rows.join("")}${gap}${you}</ol>` +
    `<p class="their-line">${esc(`${v} is ${ordinal(list.rank)} of the ${list.of} places your crowd loves nearby.`)}</p></section>`
  );
}

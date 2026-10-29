import type { NightStop } from "../../shared/contract.ts";
import { plainName, possessive, shortName } from "../../shared/words.ts";
import { esc, safeHref } from "./html.ts";

// A partner's stop is proposed until the partner has confirmed its own time and what runs there.
export type PublicStop = Pick<NightStop, "at" | "name" | "start" | "end" | "what" | "walkMin" | "afterHours"> & { address?: string; proposed?: boolean };

// Guests walk to both doors, so each stop carries its street address when the listing has one.
export function publicStops(stops: NightStop[] | undefined, addresses: Record<string, string | undefined> = {}): PublicStop[] | undefined {
  if (!stops?.length) return undefined;
  return stops.map((s) => {
    const address = addresses[s.at];
    return {
      at: s.at,
      name: s.name,
      start: s.start,
      end: s.end,
      what: s.what,
      ...(s.walkMin ? { walkMin: s.walkMin } : {}),
      ...(s.afterHours ? { afterHours: true } : {}),
      ...(address ? { address } : {}),
    };
  });
}

export function mapsHref(name: string, address: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${plainName(name)}, ${address}`)}`;
}

export function mapLink(name: string, address: string): string {
  return `<p class="map"><a href="${safeHref(mapsHref(name, address))}" rel="noopener noreferrer">Open in maps</a></p>`;
}

function minutes(n: number): string {
  return `${n} minute${n === 1 ? "" : "s"}`;
}

// The walk sits inside its stop's item, so the list holds exactly one item per stop.
export function stopsHtml(stops: PublicStop[]): string {
  const items = stops.map((s, i) => {
    const next = stops[i + 1];
    const side = s.at === "partner" ? "them" : "you";
    const walk = next && s.walkMin ? `<p class="stop-walk">Then about ${minutes(s.walkMin)} on foot to ${esc(shortName(next.name))}</p>` : "";
    const late = s.afterHours ? `<p class="stop-note">Opens late for it</p>` : "";
    const proposed = s.proposed ? `<p class="stop-note stop-proposed">Proposed, subject to ${esc(possessive(shortName(s.name)))} programme</p>` : "";
    const address = s.address ? `<p class="stop-address">${esc(s.address)}</p>${mapLink(s.name, s.address)}` : "";
    return (
      `<li class="stop stop-${side}"><p class="stop-time"><time>${esc(s.start)}</time><small>to ${esc(s.end)}</small></p><span class="rail" aria-hidden="true"></span>` +
      `<div class="stop-body"><h3>${esc(shortName(s.name))}</h3><p class="stop-what">${esc(s.what)}</p>${proposed}${late}${address}</div>${walk}</li>`
    );
  });
  return `<ol class="stops">${items.join("")}</ol>`;
}

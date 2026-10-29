import type { Night, Venue } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { formatName, longDate, shortDate, todayIn } from "../format.ts";
import { cover, hasImage } from "./cover.ts";

function status(night: Night, live: boolean, past: boolean): { text: string; lit: boolean } {
  if (night.headcount !== undefined) return { text: `${plural(night.headcount, "person", "people")} came`, lit: false };
  if (night.withdrawnAt) return { text: "Taken down", lit: false };
  if (past) return { text: "Log the turnout", lit: false };
  return { text: `${plural(night.rsvps, "RSVP", "RSVPs")} so far`, lit: live };
}

// Every night that went out, newest first, as the small poster it was, with where it stands now.
export function nightPosters(venueId: string, venue: Venue, nights: Night[], liveId: string | null): HTMLElement {
  const today = todayIn(venue.tz);
  const base = `/v/${encodeURIComponent(venueId)}`;
  const sorted = [...nights].sort((a, b) => b.date.localeCompare(a.date));
  return h(
    "ol",
    { class: "posters" },
    sorted.map((n) => {
      const past = n.date < today;
      const live = n.id === liveId;
      const s = status(n, live, past);
      const name = n.feature?.name || n.copy?.eventTitle || formatName(n.format, n.feature?.type);
      return h(
        "li",
        { class: live ? "mini mini-live" : "mini" },
        h(
          "a",
          { class: "mini-link", href: `${base}/nights/${encodeURIComponent(n.id)}` },
          h("span", { class: "tape tape-mid", "aria-hidden": "true" }),
          h("span", { class: "mini-when" }, h("span", { class: "sr-only" }, `${longDate(n.date)}, `), h("span", { "aria-hidden": "true" }, shortDate(n.date)), ` ${n.start}`),
          h("span", { class: "mini-kind" }, formatName(n.format, n.feature?.type)),
          n.feature && hasImage(n.feature) ? h("span", { class: "flyer-print mini-print" }, cover(n.feature, { className: "mini-art" })) : null,
          h("strong", { class: "mini-title" }, name),
          h("span", { class: s.lit ? "mini-status lit-text" : "mini-status" }, s.text),
        ),
      );
    }),
  );
}

import type { EntityRef, Night, VenueState } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { longDate } from "../format.ts";
import { loadToken, savedVenues } from "../store.ts";
import { cover, hasImage } from "../ui/cover.ts";
import { liveNight } from "../venue-context.ts";

const MAX_VENUES = 3;
const MAX_COVERS = 5;

// Only a night that is out on the street right now counts: published, not past, not taken down, with its page up.
function publicNight(state: VenueState): Night | null {
  const n = liveNight(state);
  if (!n || n.withdrawnAt || !n.eventSlug) return null;
  return n.actions.some((a) => a.kind === "event_page" && a.ok) ? n : null;
}

function artOf(n: Night): Pick<EntityRef, "name" | "type" | "image">[] {
  return [...(n.feature ? [n.feature] : []), ...n.playlist, ...n.partners].filter(hasImage).slice(0, MAX_COVERS);
}

// The landing flyer carries art only from a real night that one of this phone's own venues has out on the street.
export function landingArt(slot: HTMLElement): void {
  const mine = savedVenues()
    .map((v) => ({ v, token: loadToken(v.id) }))
    .filter((x): x is { v: (typeof x)["v"]; token: string } => Boolean(x.token))
    .slice(0, MAX_VENUES);
  if (!mine.length) return;
  void Promise.all(mine.map(({ v, token }) => api.state(v.id, token).catch(() => null))).then((states) => {
    for (const state of states) {
      const night = state ? publicNight(state) : null;
      const art = night ? artOf(night) : [];
      if (!state || !night || !art.length || !slot.isConnected) continue;
      replace(
        slot,
        h("div", { class: "flyer-wall" }, art.map((e) => h("span", { class: "flyer-print" }, cover(e, { className: "wall-cover" })))),
        h(
          "p",
          { class: "flyer-wall-line" },
          "From your night at ",
          state.venue.entity.name,
          ", ",
          h("a", { class: "wall-link", href: `/e/${encodeURIComponent(night.eventSlug ?? "")}` }, longDate(night.date)),
          ".",
        ),
      );
      slot.hidden = false;
      return;
    }
  });
}

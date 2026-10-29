import type { Night } from "../../../src/shared/contract.ts";
import { h, replace } from "../dom.ts";
import { moment } from "../format.ts";
import { fitHeadlines } from "../ui/flyer.ts";
import { bigCount, darkWindow, draftWindow, liveWindow } from "../ui/home-window.ts";
import { receiptsDrawer } from "../ui/receipts.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { tapedNote } from "../ui/taped.ts";
import { nightPosters } from "../ui/timeline.ts";
import { lastLogged, mondayLine } from "../ui/turnout.ts";
import { windowSection } from "../ui/window-display.ts";
import { picksPart } from "../ui/street-receipts.ts";
import { liveNight, withVenue, type VenueCtx } from "../venue-context.ts";
import { numbersStrip } from "./dashboard-strip.ts";

export function venuePage(id: string): Promise<void> {
  return withVenue(id, "nights", (ctx, main) => renderHome(ctx, main), { fresh: true });
}

function mondayNote(ctx: VenueCtx): HTMLElement {
  const { state } = ctx;
  const venue = state.venue;
  const last = lastLogged(state.nights);
  const line = last ? mondayLine(last, venue) : null;
  return tapedNote(
    "Every Monday",
    "Your venue's agent reads the street again and drafts the next night. It never publishes on its own.",
    h("p", { class: "meta" }, state.nextAlarm ? `Next run ${moment(state.nextAlarm, venue.tz)}.` : "No Monday run is scheduled yet."),
    line ? h("p", { class: "meta" }, `Last logged night: ${line}`) : null,
  );
}

function renderHome(ctx: VenueCtx, main: HTMLElement): void {
  const { state } = ctx;
  const venue = state.venue;
  const base = `/v/${encodeURIComponent(ctx.id)}`;
  title(venue.entity.name);
  const live = liveNight(state);
  // Once one plan for a date is published, the other plans drawn up for that date, and any older drafts, are spent.
  const taken = new Set(state.nights.map((n) => n.date));
  const latest = state.proposals
    .filter((p) => p.status === "proposed" && !taken.has(p.date) && (!live || p.date > live.date))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const gone: Night[] = state.nights.filter((n) => n.id !== live?.id);
  const count = live ? bigCount(live.rsvps) : null;

  const main1 = live && count ? liveWindow(base, state, live, count) : latest ? draftWindow(base, state, latest, false) : darkWindow(ctx, state);
  const next = live ? (latest ? draftWindow(base, state, latest, true) : null) : null;
  const numbers = numbersStrip(ctx.id, ctx.token, venue.tz, Boolean(live), count ? (n) => count.set(n) : undefined);

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide home-page" },
      h("h1", { class: "sr-only" }, "Your nights"),
      h("div", { class: "home-front" }, main1, mondayNote(ctx)),
      h("div", { class: "home-row" }, numbers, next),
      state.read ? windowSection(ctx.id, venue, state.read) : null,
      h(
        "section",
        { class: "home-posters", "aria-labelledby": "past-title" },
        h("h2", { id: "past-title" }, "Published nights"),
        gone.length || live
          ? nightPosters(ctx.id, venue, [...(live ? [live] : []), ...gone], live?.id ?? null)
          : h("p", { class: "meta" }, "Nothing published yet. Nights you approve appear here with their RSVPs and turnout."),
      ),
      state.read ? receiptsDrawer({ parts: [picksPart(state.read, venue.entity.name, venue.tz)], calls: state.read.provenance, limits: state.read.limits, tz: venue.tz }) : null,
    ),
  );
  fitHeadlines(main);
  focusHeading();
}

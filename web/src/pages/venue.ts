import type { Night } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import { readDate, slotLine } from "../format.ts";
import { inviteLine } from "../first-run/invite-line.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { draftPanel, liveCount, livePanel, nightsPanel, partnerPanel, quietPanel } from "../ui/home-parts.ts";
import { pairLedgerList } from "../ui/ledger.ts";
import { credit, focusHeading, title } from "../ui/shell.ts";
import { agentPanel } from "../ui/agent-run.ts";
import { lastLogged, mondayLine } from "../ui/turnout.ts";
import { liveNight, withVenue, type VenueCtx } from "../venue-context.ts";
import { numbersStrip } from "./dashboard-strip.ts";

export function venuePage(id: string): Promise<void> {
  return withVenue(id, "nights", (ctx, main) => renderHome(ctx, main), { fresh: true });
}

function mondayPanel(ctx: VenueCtx): HTMLElement {
  const panel = agentPanel(ctx.id, ctx.token, ctx.state, () => void venuePage(ctx.id));
  const last = lastLogged(ctx.state.nights);
  const line = last ? mondayLine(last, ctx.state.venue) : null;
  if (line) panel.append(h("p", { class: "meta" }, `Last logged night: ${line}`));
  return panel;
}

function renderHome(ctx: VenueCtx, main: HTMLElement): void {
  const { state } = ctx;
  const venue = state.venue;
  const base = `/v/${encodeURIComponent(ctx.id)}`;
  title(plainName(venue.entity.name));
  credit(state.read ? `Taste data from Qloo, read ${readDate(state.read.at, venue.tz)}. Scores and plans by Full House.` : "Taste data from Qloo. Scores and plans by Full House.");
  const live = liveNight(state);
  // Once one plan for a date is published, the other plans drawn up for that date, and any older drafts, are spent.
  const taken = new Set(state.nights.map((n) => n.date));
  const latest = state.proposals
    .filter((p) => p.status === "proposed" && !taken.has(p.date) && (!live || p.date > live.date))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const count = live ? liveCount(live.rsvps) : null;
  const front = live && count ? livePanel(base, state, live, count) : latest ? draftPanel(base, state, latest, false) : quietPanel(ctx, state);
  const next = live && latest ? draftPanel(base, state, latest, true) : null;
  const published: Night[] = state.nights;
  replace(
    main,
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "wrap" },
        screenHead(plainName(venue.entity.name), `${slotLine(venue.quietSlot)}${venue.assumed?.slot ? ", assumed until you change it" : ""}. ${venue.city}.`),
        inviteLine(ctx),
        h(
          "div",
          { class: "screen-grid home-grid" },
          h("div", { class: "stack" }, front, next, numbersStrip(ctx.id, ctx.token, venue.tz, Boolean(live), count ? (n) => count.set(n) : undefined), nightsPanel(base, state, published, live?.id ?? null)),
          h("div", { class: "stack" }, partnerPanel(base, state), pairLedgerList(state.ledgers), mondayPanel(ctx)),
        ),
      ),
    ),
  );
  focusHeading();
}

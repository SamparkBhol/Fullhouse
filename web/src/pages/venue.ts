import type { Night, NightPlan, StreetRead } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { count, formatName, moment, prettyTag, shortDate, todayIn, weekdayName } from "../format.ts";
import { navigate } from "../router.ts";
import { fitHeadlines, flyer } from "../ui/flyer.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { liveNight, refreshState, rememberPlanResponse, withVenue, type VenueCtx } from "../venue-context.ts";

export const READ_LINES = [
  "What the street around you likes",
  "Your venue's own taste profile on Qloo",
  "Places nearby that your audience loves, and what they offer that you do not",
  "Where on the map that taste is strongest",
  "Artists, books, films, shows and podcasts your audience loves",
];

export function venuePage(id: string): Promise<void> {
  return withVenue(id, "nights", (ctx, main) => renderHome(ctx, main), { fresh: true });
}

function originLine(plan: NightPlan, tz: string): string {
  if (plan.origin === "monday") return `Drafted by your Monday read, ${moment(plan.createdAt, tz)}.`;
  if (plan.origin === "refine") return `Changed at your request, ${moment(plan.createdAt, tz)}.`;
  return `Planned ${moment(plan.createdAt, tz)}.`;
}

function streetSummary(ctx: VenueCtx, read: StreetRead): HTMLElement {
  const base = `/v/${encodeURIComponent(ctx.id)}`;
  const topTags = read.streetTags.slice(0, 3).map((t) => prettyTag(t.name));
  const gap = read.gaps[0];
  const topPicks = read.rising.filter((r) => r.rank === 1).map((r) => r.name);
  return h(
    "section",
    { class: "block", "aria-labelledby": "street-title" },
    h("h2", { id: "street-title" }, "The street"),
    h("p", { class: "meta" }, `Read ${moment(read.at, ctx.state.venue.tz)}.`),
    h(
      "dl",
      { class: "facts" },
      h("dt", null, "The street's taste"),
      h("dd", null, topTags.length ? topTags.join(", ") : "Qloo returned no taste tags for this street."),
      h("dt", null, "You do not serve yet"),
      h("dd", null, gap ? prettyTag(gap.tag.name) : "No gap found between you and the places your audience loves."),
      h("dt", null, "Your audience's top picks"),
      h("dd", null, topPicks.length ? topPicks.slice(0, 4).join(", ") : "Qloo returned no artists, books, films, shows or podcasts for your venue."),
    ),
    h("p", { class: "actions" }, h("a", { class: "button button-quiet", href: `${base}/street` }, "Open the street read")),
  );
}

function nightRow(ctx: VenueCtx, night: Night): HTMLElement {
  const base = `/v/${encodeURIComponent(ctx.id)}`;
  const today = todayIn(ctx.state.venue.tz);
  const past = night.date < today;
  const status = night.headcount !== undefined
    ? `${count(night.headcount, "person", "people")} came`
    : past
      ? "Log the turnout"
      : count(night.rsvps, "RSVP", "RSVPs");
  return h(
    "li",
    null,
    h(
      "a",
      { class: "row-link", href: `${base}/nights/${encodeURIComponent(night.id)}` },
      h("strong", null, night.copy?.eventTitle || formatName(night.format)),
      h("span", null, `${shortDate(night.date)}, ${night.start}`),
      h("span", { class: !past && night.headcount === undefined ? "lit-text" : "" }, status),
    ),
  );
}

async function planNight(ctx: VenueCtx, button: HTMLButtonElement, slot: HTMLElement): Promise<void> {
  button.disabled = true;
  replace(slot, loading(`Planning a night for ${weekdayName(ctx.state.venue.quietSlot.weekday)}`, ["Scoring what the street likes against your venue", "Choosing partners within walking distance", "Writing the copy and checking every name"]));
  try {
    const response = await api.plan(ctx.id, ctx.token, {});
    rememberPlanResponse(response);
    await refreshState(ctx);
    navigate(`/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(response.plan.id)}`);
  } catch (err) {
    button.disabled = false;
    replace(slot, failure(err, () => void planNight(ctx, button, slot)));
  }
}

async function readStreet(ctx: VenueCtx, button: HTMLButtonElement, slot: HTMLElement, after: () => void): Promise<void> {
  button.disabled = true;
  replace(slot, loading("Reading the street around your venue", READ_LINES));
  try {
    await api.read(ctx.id, ctx.token);
    await refreshState(ctx);
    after();
  } catch (err) {
    button.disabled = false;
    replace(slot, failure(err, () => void readStreet(ctx, button, slot, after)));
  }
}

function renderHome(ctx: VenueCtx, main: HTMLElement): void {
  const { state } = ctx;
  const venue = state.venue;
  const base = `/v/${encodeURIComponent(ctx.id)}`;
  title(venue.entity.name);
  const live = liveNight(state);
  const proposals = state.proposals.filter((p) => p.status === "proposed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = proposals[0];
  const published = state.nights.filter((n) => n.id !== live?.id).sort((a, b) => b.date.localeCompare(a.date));

  const window = h("div", { class: "home-window" });
  if (live) {
    window.append(
      h(
        "section",
        { class: "block", "aria-labelledby": "live-title" },
        h("h2", { id: "live-title" }, "On the street now"),
        h("a", { class: "flyer-link", href: `${base}/nights/${encodeURIComponent(live.id)}` }, flyer(live, venue, { live: true, compact: true, headingLevel: "h3" })),
        h("p", { class: "rsvp-line" }, h("span", { class: "lit-text big-number" }, String(live.rsvps)), ` ${live.rsvps === 1 ? "person has" : "people have"} said they are coming.`),
      ),
    );
  }
  const nextSection = h("section", { class: "block", "aria-labelledby": "next-title" }, h("h2", { id: "next-title" }, live ? "Next draft" : "Your next night"));
  if (latest) {
    nextSection.append(
      h("a", { class: "flyer-link", href: `${base}/night/${encodeURIComponent(latest.id)}` }, flyer(latest, venue, { compact: true, headingLevel: "h3" })),
      h("p", { class: "draft-note" }, "Draft. Nobody sees it until you publish it. ", originLine(latest, venue.tz)),
      h("p", { class: "actions" }, h("a", { class: "button", href: `${base}/night/${encodeURIComponent(latest.id)}` }, "Open the plan")),
    );
  } else {
    const slot = h("div", { "aria-live": "polite" });
    const button = h("button", { class: "button button-big", type: "button" }, state.read ? `Plan a night for ${weekdayName(venue.quietSlot.weekday)}` : "Read the street");
    if (state.read) {
      button.addEventListener("click", () => void planNight(ctx, button, slot));
      nextSection.append(
        h(
          "div",
          { class: "flyer-blank" },
          h("p", null, `No night is planned yet. Full House will plan one for your next ${weekdayName(venue.quietSlot.weekday)} from the street read.`),
          h("p", { class: "actions" }, button),
        ),
        slot,
      );
    } else {
      button.addEventListener("click", () => void readStreet(ctx, button, slot, () => renderHome(ctx, main)));
      nextSection.append(
        h(
          "div",
          { class: "flyer-blank" },
          h("p", null, "First, Full House reads the street around your venue from Qloo. It takes under a minute and sends only your venue's public listing and its location."),
          h("p", { class: "actions" }, button),
        ),
        slot,
      );
    }
  }
  window.append(nextSection);

  const side = h("div", { class: "home-side" });
  if (state.read) side.append(streetSummary(ctx, state.read));
  side.append(
    h(
      "section",
      { class: "block", "aria-labelledby": "monday-title" },
      h("h2", { id: "monday-title" }, "Every Monday"),
      h(
        "p",
        null,
        "Every Monday morning your venue's agent reads the street again and drafts the next night. It never publishes on its own.",
      ),
      h("p", { class: "meta" }, state.nextAlarm ? `Next run: ${moment(state.nextAlarm, venue.tz)}.` : "No Monday run is scheduled yet."),
    ),
  );
  const pastSection = h(
    "section",
    { class: "block", "aria-labelledby": "past-title" },
    h("h2", { id: "past-title" }, "Published nights"),
    published.length
      ? h("ul", { class: "plain-list" }, published.map((n) => nightRow(ctx, n)))
      : h("p", null, live ? "No other nights yet. Past nights appear here with their RSVPs and turnout." : "Nothing published yet. Nights you approve appear here with their RSVPs and turnout."),
  );
  side.append(pastSection);

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide" },
      h("h1", { class: "page-title" }, "Your nights"),
      h("div", { class: "split" }, window, side),
    ),
  );
  fitHeadlines(main);
  focusHeading();
}

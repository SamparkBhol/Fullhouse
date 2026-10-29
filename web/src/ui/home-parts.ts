import type { Night, NightPlan, VenueState } from "../../../src/shared/contract.ts";
import { plural, weekdayName } from "../../../src/shared/words.ts";
import { h, prefersReducedMotion, uid } from "../dom.ts";
import { readThenPlan } from "../first-night.ts";
import { longDate, moment, nightKind, shortDate, todayIn, walkMinutes } from "../format.ts";
import { evening } from "./evening.ts";
import { verdict } from "./fit.ts";
import { pairCard } from "./pair.ts";

export interface LiveCount {
  el: HTMLElement;
  set(n: number): void;
}

function panel(heading: string, chip: HTMLElement | null, ...body: (Node | null)[]): HTMLElement {
  const id = uid("home");
  return h("section", { class: "panel", "aria-labelledby": id }, h("div", { class: "panel-head" }, h("h2", { id }, heading), chip), ...body);
}

// The yes count of the night that is out. Until the first yes it is a plain line, so a zero is never the biggest thing here.
export function liveCount(start: number): LiveCount {
  const figure = h("span", { class: "rsvp-big" }, String(start));
  const words = h("span");
  const el = h("p", { class: "rsvp-line", "aria-live": "polite" }, figure, words);
  let shown = start;
  const say = (n: number): void => {
    figure.hidden = n === 0;
    words.textContent = n === 0 ? "Nobody has pressed I am going yet. The count shows here when they do." : ` ${n === 1 ? "person has" : "people have"} said they are coming.`;
  };
  say(start);
  return {
    el,
    set(n: number) {
      if (n === shown) return;
      figure.textContent = String(n);
      say(n);
      shown = n;
      if (prefersReducedMotion()) return;
      figure.classList.remove("count-tick");
      void figure.offsetWidth;
      figure.classList.add("count-tick");
    },
  };
}

function originLine(plan: NightPlan, tz: string): string {
  if (plan.origin === "monday") return `Drafted by your Monday read, ${moment(plan.createdAt, tz)}.`;
  if (plan.origin === "refine") return `Changed at your request, ${moment(plan.createdAt, tz)}.`;
  return `Planned ${moment(plan.createdAt, tz)}.`;
}

export function livePanel(base: string, state: VenueState, live: Night, count: LiveCount): HTMLElement {
  const href = `${base}/nights/${encodeURIComponent(live.id)}`;
  return panel(
    "Your next night",
    h("span", { class: "chip chip-yes" }, "Published"),
    h("p", { class: "panel-lead" }, `${nightKind(live)}, ${longDate(live.date)}. ${live.copy.eventTitle}`),
    evening(live, state.venue),
    count.el,
    h("p", { class: "small" }, "Counted on the event page. No names, no emails."),
    h("p", { class: "actions actions-tight" }, h("a", { class: "btn", href }, "Open your night")),
  );
}

export function draftPanel(base: string, state: VenueState, plan: NightPlan, second: boolean): HTMLElement {
  const href = `${base}/night/${encodeURIComponent(plan.id)}`;
  return panel(
    second ? "Next draft" : "Your next night",
    h("span", { class: "chip chip-line" }, "Draft"),
    h("p", { class: "panel-lead" }, `${nightKind(plan)}, ${longDate(plan.date)}. Nobody sees it until you publish it. ${originLine(plan, state.venue.tz)}`),
    second ? null : evening(plan, state.venue),
    h("p", { class: "actions actions-tight" }, h("a", { class: second ? "btn btn-quiet" : "btn", href }, "Open the plan")),
  );
}

// Nothing planned yet: the quiet night itself, and the one button that plans it.
export function quietPanel(ctx: { id: string; token: string }, state: VenueState): HTMLElement {
  const slot = h("div", { "aria-live": "polite" });
  const day = weekdayName(state.venue.quietSlot.weekday);
  const button = state.read
    ? h("button", { class: "btn", type: "button" }, `Plan a night for ${day}`)
    : h("a", { class: "btn", href: `/v/${encodeURIComponent(ctx.id)}/first` }, "Read your crowd");
  if (button instanceof HTMLButtonElement) {
    button.addEventListener("click", () => {
      button.disabled = true;
      void readThenPlan(ctx.id, ctx.token, state.venue.quietSlot.weekday, slot, false, () => (button.disabled = false));
    });
  }
  return panel(
    `${day} is quiet`,
    null,
    h(
      "p",
      { class: "panel-lead" },
      state.read
        ? `Full House plans your next ${day} with your partner from the latest read.`
        : "Full House reads your crowd, finds the place nearby that it also loves, then plans the night you could run together. It sends only your venue's public listing and its location.",
    ),
    h("p", { class: "actions actions-tight" }, button),
    slot,
  );
}

export function partnerPanel(base: string, state: VenueState): HTMLElement | null {
  const m = state.read?.match;
  if (!m) return null;
  const fit = m.fit ?? m.partner.fit;
  const venue = state.venue;
  return h(
    "section",
    { class: "panel panel-pair", "aria-labelledby": "partner-title" },
    h("h2", { id: "partner-title" }, "Your partner"),
    pairCard({
      you: { name: venue.entity.name, ...(venue.entity.image ? { image: venue.entity.image } : {}) },
      them: { name: m.partner.name, ...(m.partner.image ? { image: m.partner.image } : {}) },
      walkMin: m.partner.walkMin ?? walkMinutes(m.partner.distanceM),
      size: "small",
      className: "pair-flat",
    }),
    fit ? verdict(fit.score, `From the read on ${moment(m.readAt, venue.tz)}.`) : null,
    h("p", { class: "actions actions-tight" }, h("a", { class: "btn btn-quiet", href: `${base}/first/match` }, "See why, or swap")),
  );
}

function nightStatus(night: Night, live: boolean, past: boolean): string {
  if (night.headcount !== undefined) return `${plural(night.headcount, "person", "people")} came`;
  if (night.withdrawnAt) return "Taken down";
  if (past) return "Log the turnout";
  return live ? `${plural(night.rsvps, "yes", "yeses")} so far` : "Published";
}

// Every night that went out, newest first, with where it stands now.
export function nightsPanel(base: string, state: VenueState, nights: Night[], liveId: string | null): HTMLElement {
  const today = todayIn(state.venue.tz);
  const sorted = [...nights].sort((a, b) => b.date.localeCompare(a.date));
  return panel(
    "Published nights",
    null,
    sorted.length
      ? h(
          "ul",
          { class: "nights" },
          sorted.map((n) => {
            const [wd = "", ...rest] = shortDate(n.date).split(" ");
            return h(
              "li",
              null,
              h(
                "a",
                { class: n.id === liveId ? "night-row night-row-live" : "night-row", href: `${base}/nights/${encodeURIComponent(n.id)}` },
                h("span", { class: "night-row-date" }, h("span", { class: "sr-only" }, `${longDate(n.date)}, `), h("span", { "aria-hidden": "true" }, rest.join(" ")), h("small", { "aria-hidden": "true" }, `${wd} ${n.start}`)),
                h("span", null, h("span", { class: "night-row-title" }, n.copy?.eventTitle || n.feature?.name || nightKind(n)), h("span", { class: "night-row-kind" }, nightKind(n))),
                h("span", { class: "night-row-status" }, nightStatus(n, n.id === liveId, n.date < today)),
              ),
            );
          }),
        )
      : h("p", { class: "empty" }, "Nothing published yet. Nights you publish show here with their RSVPs and turnout."),
  );
}

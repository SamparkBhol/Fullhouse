import type { Night, NightPlan, VenueState } from "../../../src/shared/contract.ts";
import { weekdayName } from "../../../src/shared/words.ts";
import { h, prefersReducedMotion } from "../dom.ts";
import { readThenPlan } from "../first-night.ts";
import { moment } from "../format.ts";
import { flyer } from "./flyer.ts";
import { bigWindow } from "./night-room.ts";
import { ledge } from "./ledge.ts";
import { shopWindow } from "./window.ts";

export interface BigCount {
  el: HTMLElement;
  set(n: number): void;
}

// The yes count of the night that is out, in window light. It ticks over once when a check brings a new number.
// Until the first yes it is a plain line, so a zero is never the biggest thing in the window.
export function bigCount(start: number): BigCount {
  const figure = h("span", { class: "rsvp-big lit-text" }, String(start));
  const words = h("span", { class: "rsvp-words" });
  const el = h("p", { class: "rsvp-line", "aria-live": "polite" }, figure, words);
  let shown = start;
  const say = (n: number): void => {
    figure.hidden = n === 0;
    el.classList.toggle("rsvp-none", n === 0);
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

export function liveWindow(base: string, state: VenueState, live: Night, count: BigCount): HTMLElement {
  return bigWindow({
    lettering: "On the street now",
    lit: true,
    flyer: h("a", { class: "flyer-link", href: `${base}/nights/${encodeURIComponent(live.id)}` }, flyer(live, state.venue, { live: true, compact: true, headingLevel: "h3" })),
    side: h(
      "div",
      { class: "rsvp-room" },
      count.el,
      h("p", { class: "meta" }, "Counted on the event page. No names, no emails."),
      h("p", { class: "actions" }, h("a", { class: "button button-big button-lamp", href: `${base}/nights/${encodeURIComponent(live.id)}` }, "Open your night")),
    ),
  });
}

function draftSide(href: string, plan: NightPlan, tz: string): HTMLElement {
  return h(
    "div",
    { class: "draft-side" },
    h("p", { class: "say-line" }, "Your next night is drawn up."),
    h("p", { class: "say-why" }, `It goes out only when you publish it. ${originLine(plan, tz)}`),
    h("p", { class: "actions" }, h("a", { class: "button button-big button-lamp", href }, "Open the plan")),
  );
}

export function draftWindow(base: string, state: VenueState, plan: NightPlan, small: boolean): HTMLElement {
  const href = `${base}/night/${encodeURIComponent(plan.id)}`;
  const sheet = h("a", { class: "flyer-link", href }, flyer(plan, state.venue, { pinned: true, compact: true, headingLevel: "h3" }));
  if (small) {
    return ledge(
      { label: "Next draft", className: "ledge-next" },
      sheet,
      h("p", { class: "draft-note" }, "Draft. Nobody sees it until you publish it. ", originLine(plan, state.venue.tz)),
      h("p", { class: "actions" }, h("a", { class: "button", href }, "Open the plan")),
    );
  }
  return bigWindow({ lettering: "Your next night. Nobody sees it until you publish it.", flyer: sheet, side: draftSide(href, plan, state.venue.tz) });
}

// Nothing planned yet: the window is dark, which is the quiet night itself.
export function darkWindow(ctx: { id: string; token: string }, state: VenueState): HTMLElement {
  const slot = h("div", { "aria-live": "polite" });
  const day = weekdayName(state.venue.quietSlot.weekday);
  // A venue never read goes through the first run, which reads its crowd and finds its match on the way.
  const button = state.read
    ? h("button", { class: "button button-big button-lamp", type: "button" }, `Plan a night for ${day}`)
    : h("a", { class: "button button-big button-lamp", href: `/v/${encodeURIComponent(ctx.id)}/first` }, "Read your crowd");
  if (button instanceof HTMLButtonElement) {
    button.addEventListener("click", () => {
      button.disabled = true;
      void readThenPlan(ctx.id, ctx.token, state.venue.quietSlot.weekday, slot, false, () => (button.disabled = false));
    });
  }
  return shopWindow(
    { size: "big", dark: true, lettering: `Nothing in the window for ${day} yet`, className: "win-empty-night" },
    h("p", { class: "say-line" }, `${day} is quiet.`),
    h(
      "p",
      { class: "say-why" },
      state.read
        ? `Full House will plan your next ${day} from the street read.`
        : `Full House reads your crowd from Qloo, finds the place nearby it also loves, then plans the night you could run together. It sends only your venue's public listing and its location.`,
    ),
    h("p", { class: "actions" }, button),
    slot,
  );
}

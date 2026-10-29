import type { Night, Venue } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import { nightKind, shortDate } from "../format.ts";

let top: HTMLElement;
let strip: HTMLElement;
let main: HTMLElement;
let foot: HTMLElement;

export type Tab = "nights" | "street" | "numbers" | "proof" | "venue";
export type Step = "crowd" | "match" | "night" | "ask";

const STEPS: [Step, string, string][] = [
  ["crowd", "Your crowd", ""],
  ["match", "Your partner", "match"],
  ["night", "The night", "night"],
  ["ask", "Ask them", "ask"],
];

export const PUBLIC_CREDIT = "Taste data from Qloo. Map data from OpenStreetMap contributors.";
// App screens without a map credit only the taste data; the screens with a map add the map credit themselves.
const APP_CREDIT = "Taste data from Qloo. Scores and plans by Full House.";

export function mark(): HTMLElement {
  return h("a", { class: "mark", href: "/" }, h("span", { class: "mark-doors", "aria-hidden": "true" }, h("i"), h("i")), "Full House");
}

export function mountShell(root: HTMLElement): HTMLElement {
  top = h("header", { class: "top" });
  strip = h("div", { class: "live-strip", hidden: true });
  main = h("main", { id: "main", tabindex: "-1" });
  foot = h("footer", { class: "foot" });
  replace(root, h("a", { class: "skip", href: "#main" }, "Skip to content"), top, strip, main, foot);
  return main;
}

export function page(): HTMLElement {
  return main;
}

let linked = false;

// The one line on each screen that names where the taste data came from. Public pages keep the mark and links beside it.
export function credit(text: string): void {
  foot.className = linked ? "foot" : "foot foot-plain";
  const line = h("p", { class: "foot-credit" }, text);
  replace(foot, h("div", { class: "wrap" }, ...(linked ? [mark(), h("a", { href: "/how" }, "How it works"), h("a", { href: "/live" }, "Live numbers")] : []), line));
}

export function publicHeader(opts: { find?: boolean } = {}): void {
  strip.hidden = true;
  top.className = "top";
  replace(
    top,
    h(
      "div",
      { class: "wrap top-row" },
      mark(),
      h(
        "nav",
        { class: "nav", "aria-label": "Full House" },
        h("a", { href: "/how" }, "How it works"),
        h("a", { href: "/live" }, "Live numbers"),
        h("a", { class: "btn btn-small", href: opts.find ? "#find" : "/#find" }, "Find your neighbour"),
      ),
    ),
  );
  linked = true;
  credit(PUBLIC_CREDIT);
}

// The first run keeps the venue's name in view and the four steps, but no tabs, so the only way on is the next step.
export function runHeader(venue: Venue, step: Step): void {
  strip.hidden = true;
  top.className = "top top-app";
  const base = `/v/${encodeURIComponent(venue.id)}/first`;
  const at = STEPS.findIndex(([key]) => key === step);
  const items = STEPS.map(([key, label, path], i) => {
    const state = i < at ? "done" : i === at ? "now" : "";
    const body = [h("span", { class: "step-no" }, String(i + 1)), h("span", { class: "step-label" }, label)];
    const inner =
      i < at && key !== "ask"
        ? h("a", { class: "step", href: path ? `${base}/${path}` : base }, ...body)
        : h("span", { class: "step", "aria-current": i === at ? "step" : null }, ...body);
    return h("li", { class: state || null }, inner);
  });
  replace(top, h("div", { class: "wrap top-row" }, mark(), h("span", { class: "app-venue venue-name" }, plainName(venue.entity.name)), h("ol", { class: "stepper", "aria-label": "Steps" }, items)));
  linked = false;
  credit(APP_CREDIT);
}

export function venueHeader(venue: Venue, active: Tab | null, live?: Night | null): void {
  top.className = "top top-venue";
  const base = `/v/${encodeURIComponent(venue.id)}`;
  const items: [Tab, string, string][] = [
    ["nights", "Nights", base],
    ["street", "Street", `${base}/street`],
    ["numbers", "Numbers", `${base}/dashboard`],
    ["proof", "Proof", `${base}/proof`],
    ["venue", "Venue", `${base}/venue`],
  ];
  replace(
    top,
    h(
      "div",
      { class: "wrap top-row" },
      mark(),
      h("span", { class: "app-venue venue-name" }, plainName(venue.entity.name)),
      h("nav", { class: "tabs", "aria-label": "Your venue" }, h("ul", null, items.map(([key, label, href]) => h("li", null, h("a", { href, "aria-current": key === active ? "page" : null }, label))))),
    ),
  );
  if (live && active !== "nights") {
    replace(
      strip,
      h(
        "div",
        { class: "wrap" },
        h("span", { class: "live-dot", "aria-hidden": "true" }),
        h("span", null, "Your next night is out: "),
        h("a", { href: `${base}/nights/${encodeURIComponent(live.id)}` }, `${nightKind(live)}, ${shortDate(live.date)}`),
      ),
    );
    strip.hidden = false;
  } else strip.hidden = true;
  linked = false;
  credit(APP_CREDIT);
}

export function title(text: string): void {
  document.title = text === "Full House" ? text : `${text} | Full House`;
}

export function focusHeading(): void {
  const heading = main.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

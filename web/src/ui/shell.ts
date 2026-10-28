import type { Night, Venue } from "../../../src/shared/contract.ts";
import { h, replace } from "../dom.ts";
import { formatName, shortDate, slotLine } from "../format.ts";

let fascia: HTMLElement;
let tabs: HTMLElement;
let main: HTMLElement;

export type Tab = "nights" | "street" | "numbers" | "proof" | "venue";

export function mountShell(root: HTMLElement): HTMLElement {
  fascia = h("div", { class: "fascia-inner" });
  tabs = h("nav", { class: "tabs", "aria-label": "Your venue", hidden: true });
  main = h("main", { id: "main", tabindex: "-1" });
  const footer = h(
    "footer",
    { class: "foot" },
    h("a", { href: "/how" }, "How Full House works"),
    h("p", null, "Street data from Qloo. Map data from OpenStreetMap contributors."),
  );
  replace(
    root,
    h("a", { class: "skip", href: "#main" }, "Skip to content"),
    h("header", { class: "fascia" }, fascia, tabs),
    main,
    footer,
  );
  return main;
}

export function page(): HTMLElement {
  return main;
}

function topRow(big: boolean): HTMLElement {
  return h(
    "div",
    { class: "fascia-top" },
    h("a", { class: big ? "wordmark wordmark-big" : "wordmark", href: "/" }, "Full House"),
    h("a", { class: "fascia-link", href: "/live", "aria-current": location.pathname === "/live" ? "page" : null }, "Live numbers"),
  );
}

export function plainFascia(): void {
  document.body.classList.remove("has-tabs");
  tabs.hidden = true;
  replace(fascia, topRow(true));
}

export function venueFascia(venue: Venue, active: Tab | null, live?: Night | null): void {
  document.body.classList.add("has-tabs");
  const base = `/v/${encodeURIComponent(venue.id)}`;
  replace(
    fascia,
    topRow(false),
    h("p", { class: "venue-name" }, venue.entity.name),
    h("p", { class: "venue-meta" }, `${venue.city}. ${slotLine(venue.quietSlot)}.`),
    live
      ? h(
          "p",
          { class: "fascia-live" },
          "On the street now: ",
          h("a", { href: `${base}/nights/${encodeURIComponent(live.id)}` }, `${formatName(live.format, live.feature?.type)}, ${shortDate(live.date)}`),
        )
      : null,
  );
  const items: [Tab, string, string][] = [
    ["nights", "Nights", base],
    ["street", "Street", `${base}/street`],
    ["numbers", "Numbers", `${base}/dashboard`],
    ["proof", "Proof", `${base}/proof`],
    ["venue", "Venue", `${base}/venue`],
  ];
  replace(
    tabs,
    h(
      "ul",
      null,
      items.map(([key, label, href]) =>
        h("li", null, h("a", { href, "aria-current": key === active ? "page" : null }, label)),
      ),
    ),
  );
  tabs.hidden = false;
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

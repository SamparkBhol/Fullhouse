import type { StatsBody } from "../../../src/shared/stats.ts";
import { doorCounter, saying, type Counter } from "../charts/counter.ts";
import { clockTime, longDay, viewerZone } from "../charts/time.ts";
import { h, replace } from "../dom.ts";
import { ticket } from "../router.ts";
import { startPolling } from "./live-poll.ts";

const EVERY_MS = 60_000;

type Shown = "venues" | "nightsPublished" | "rsvps";

const CELLS: [Shown, string, string, "chalk" | "lit"][] = [
  ["venues", "venue set up", "venues set up", "chalk"],
  ["nightsPublished", "night published", "nights published", "chalk"],
  ["rsvps", "RSVP", "RSVPs", "lit"],
];

// The landing page's line of door counters: what this server has counted since it began, opening /live.
export function liveStrip(): HTMLElement {
  const tz = viewerZone();
  const counters = new Map<Shown, Counter>(CELLS.map(([key, one, many, tone]) => [key, doorCounter(saying(one, many), tone)]));
  const cells = h("div", { class: "strip-body" });
  const when = h("p", { class: "strip-when" }, "Checking now.");
  const fill = (s: StatsBody): void => {
    if (!s.since) {
      replace(cells, h("p", null, "Nothing counted on this server yet. Venues, nights and RSVPs show here as they happen."));
      return;
    }
    replace(
      cells,
      h(
        "ul",
        { class: "strip-cells" },
        CELLS.map(([key, one, many]) => {
          const n = s.allTime[key];
          const c = counters.get(key);
          c?.set(n);
          return h("li", { class: "strip-cell" }, c?.el ?? null, h("span", { class: "strip-unit", "aria-hidden": "true" }, n === 1 ? one : many));
        }),
      ),
      h("p", { class: "strip-since" }, `Since ${longDay(s.since, tz)}.`),
    );
  };
  startPolling<StatsBody>({
    ticket: ticket(),
    url: () => "/api/stats?range=24h",
    every: () => EVERY_MS,
    onData: fill,
    onState: (st) => {
      if (st.kind === "fresh") when.textContent = `Checks every minute. Last check ${clockTime(st.at, tz)}.`;
      else if (st.kind === "failed") when.textContent = `The check at ${clockTime(st.at, tz)} failed. ${st.detail}`;
      else if (st.kind === "paused") when.textContent = "Paused while this tab is hidden.";
    },
  });
  return h(
    "section",
    { class: "live-strip", "aria-labelledby": "live-strip-title" },
    h("h2", { class: "strip-title", id: "live-strip-title" }, "Counted on this server"),
    cells,
    h("p", { class: "strip-open" }, h("a", { href: "/live" }, "See the live numbers")),
    when,
  );
}

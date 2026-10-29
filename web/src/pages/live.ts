import { STATS_MAX_AGE_S, type StatsBody } from "../../../src/shared/stats.ts";
import { longDay, viewerZone, zoneName } from "../charts/time.ts";
import { h } from "../dom.ts";
import { credit, focusHeading, page, publicHeader, title } from "../ui/shell.ts";
import { mountBoard } from "./live-board.ts";
import { callsPane, statRow } from "./live-panels.ts";
import { budgetPane, copyPane } from "./live-side.ts";
import { agentsPane, endpointsPane, logPane } from "./live-tables.ts";

function intro(body: StatsBody | null, zone: string): string {
  const tz = zoneName(zone);
  if (!body) return `What Full House is doing on this server. Times are in your time zone, ${tz}.`;
  if (!body.since) return `Nothing has been counted on this server yet. Times are in your time zone, ${tz}.`;
  return `Counted on this server since ${longDay(body.since, zone)}. Each answer is at most ${STATS_MAX_AGE_S[body.range]} seconds old. Times are in your time zone, ${tz}.`;
}

export function livePage(): void {
  publicHeader();
  credit("Counted by Full House on this server. Taste data from Qloo.");
  title("Live numbers");
  const tz = viewerZone();
  mountBoard<StatsBody>(page(), {
    name: "live",
    heading: "Live numbers",
    intro: (body) => intro(body, tz),
    tz,
    url: (range) => `/api/stats?range=${range}`,
    withRange: true,
    defaultRefresh: "30s",
    extra: h("p", { class: "board-plain" }, h("a", { href: "/live.txt" }, "The same numbers as plain text")),
    // Two columns on a wide screen, the charts and tables on the left; on a phone they read in this order.
    panes: (body, tools) => [
      statRow(body, tools),
      h(
        "div",
        { class: "board-cols" },
        h("div", { class: "board-col board-main" }, callsPane(body, tools), endpointsPane(body), agentsPane(body)),
        h("div", { class: "board-col board-side" }, budgetPane(body), copyPane(body, tools), logPane(body, tz)),
      ),
    ],
  });
  focusHeading();
}

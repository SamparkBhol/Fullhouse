import { RANGE_WORDS, type StatsBody } from "../../../src/shared/stats.ts";
import { fitChart } from "../charts/fit.ts";
import { barGauge } from "../charts/gauge.ts";
import { legend, pane } from "../charts/panel.ts";
import { splitBar } from "../charts/split.ts";
import { asTable } from "../charts/table.ts";
import { count, untilWords } from "../charts/time.ts";
import { h } from "../dom.ts";
import { empty } from "../ui/states.ts";
import type { BoardTools } from "./live-board.ts";

// Live Qloo calls per night an owner put out, from the same range's counters. Shown only once a night is out.
function costLine(body: StatsBody): HTMLElement | null {
  const t = body.totals;
  if (!t.nightsPublished) return null;
  const each = Math.round(t.qlooCalls / t.nightsPublished);
  return h("p", { class: "pane-note" }, `In ${RANGE_WORDS[body.range]}: ${count(each)} live taste data ${each === 1 ? "call" : "calls"} per published night.`);
}

// Three numbers: set aside, spent live, and the difference. A request sets calls aside in blocks of ten and hands back
// what it did not use when it ends; an answer from the cache never touches the budget.
function gapLine(counted: number, live: number): HTMLElement | null {
  if (counted <= live) return null;
  return h(
    "p",
    { class: "pane-note" },
    `${count(counted)} set aside, ${count(live)} spent on live calls, ${count(counted - live)} still held by requests running now or lost to retries and failed calls. Blocks go back when a request ends, and cached answers never touch the budget.`,
  );
}

const BUDGET_TITLE = "Today's call budget";

export function budgetPane(body: StatsBody): HTMLElement {
  const b = body.budget;
  const newCap = Math.floor(b.budget * b.newVenueShare);
  const host = h("div", { class: "gauge-host" });
  fitChart(host, (w) => barGauge({ value: b.counted, max: b.budget, mark: { at: newCap, label: "New venues stop here" } }, w));
  return pane({
    key: "budget",
    title: BUDGET_TITLE,
    line: `One daily budget covers every call for taste data. New venues may use ${Math.round(b.newVenueShare * 100)} percent, so venues already running always have room.`,
    span: "side",
    body: [
      h("p", { class: "gauge-figure" }, h("strong", { class: "figure" }, count(b.liveCalls)), ` live ${b.liveCalls === 1 ? "call" : "calls"} of ${count(b.budget)} today`),
      host,
      gapLine(b.counted, b.liveCalls),
      costLine(body),
      h("p", { class: "pane-note" }, `Resets at 00:00 UTC, in ${untilWords(Date.parse(b.resetsAt) - Date.now())}.`),
      asTable("budget", {
        caption: BUDGET_TITLE,
        head: ["Measure", "Calls"],
        rows: [
          ["Set aside today", b.counted],
          ["Spent on live calls", b.liveCalls],
          ["Held or lost to retries", Math.max(0, b.counted - b.liveCalls)],
          ["Daily budget", b.budget],
          ["Where new venues stop", newCap],
        ],
        numeric: [false, true],
      }),
    ],
  });
}

export function copyPane(body: StatsBody, tools: BoardTools): HTMLElement {
  const t = body.totals;
  const line = "Each plan's words come from the model, with every name checked against the plan, or from a fixed template.";
  if (t.copyModel + t.copyTemplate === 0) {
    return pane({ key: "copy", title: "Who wrote the copy", line, span: "side", body: [empty(`No plans in ${RANGE_WORDS[tools.range]}. Each plan made shows here.`)] });
  }
  const host = h("div", { class: "split-host" });
  fitChart(host, (w) => splitBar({ solid: t.copyModel, hatched: t.copyTemplate }, w));
  return pane({
    key: "copy",
    title: "Who wrote the copy",
    line,
    span: "side",
    body: [
      host,
      legend([
        { label: "The model", mark: "solid", value: count(t.copyModel) },
        { label: "Template", mark: "hatched", value: count(t.copyTemplate) },
      ]),
      asTable("copy", {
        caption: "Who wrote the copy",
        head: ["Written by", "Plans"],
        rows: [
          ["The model", t.copyModel],
          ["Template", t.copyTemplate],
        ],
        numeric: [false, true],
      }),
    ],
  });
}

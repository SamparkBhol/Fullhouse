import { RANGE_WORDS, type StatsBody } from "../../../src/shared/stats.ts";
import { fitChart } from "../charts/fit.ts";
import { segmentGauge } from "../charts/gauge.ts";
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
  return h("p", { class: "pane-note" }, `In ${RANGE_WORDS[body.range]}: ${count(each)} live Qloo ${each === 1 ? "call" : "calls"} per published night.`);
}

// What the gauge counts and the live calls differ by: retries, failed calls, and calls set aside by requests still running.
function gapLine(counted: number, live: number): HTMLElement | null {
  if (counted <= live) return null;
  return h(
    "p",
    { class: "pane-note" },
    `${count(counted)} counted against the budget. Requests set calls aside in blocks of ten and hand back what they do not use, so the ${count(counted - live)} more are retries, failed calls and requests still running.`,
  );
}

export function budgetPane(body: StatsBody): HTMLElement {
  const b = body.budget;
  const newCap = Math.floor(b.budget * b.newVenueShare);
  const host = h("div", { class: "gauge-host" });
  fitChart(host, (w) => segmentGauge({ value: b.counted, max: b.budget, mark: { at: newCap, label: "New venues stop here" } }, w));
  return pane({
    key: "budget",
    title: "Today's Qloo budget",
    line: `One daily budget covers every Qloo call. New venues may use ${Math.round(b.newVenueShare * 100)} percent, so venues already running always have room.`,
    span: "side",
    body: [
      h("p", { class: "gauge-figure" }, h("strong", null, count(b.liveCalls)), ` live ${b.liveCalls === 1 ? "call" : "calls"} of ${count(b.budget)} today`),
      host,
      gapLine(b.counted, b.liveCalls),
      costLine(body),
      h("p", { class: "pane-note" }, `Resets at 00:00 UTC, in ${untilWords(Date.parse(b.resetsAt) - Date.now())}.`),
      asTable("budget", {
        caption: "Today's Qloo budget",
        head: ["Measure", "Calls"],
        rows: [
          ["Live calls today", b.liveCalls],
          ["Counted against the budget", b.counted],
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

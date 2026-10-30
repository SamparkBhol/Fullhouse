import type { AgentRun, AgentStep, VenueState } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { ApiFailure, api } from "../api.ts";
import { h } from "../dom.ts";
import { explain } from "../errors.ts";
import { clock, moment } from "../format.ts";

const POLL_MS = 1000;

function callsWords(calls: number, cached: number): string {
  if (!calls) return "No Qloo calls";
  const base = plural(calls, "Qloo call", "Qloo calls");
  return cached ? `${base}, ${cached} from cache` : base;
}

function seconds(ms: number): string {
  return ms < 950 ? "under a second" : `${(ms / 1000).toFixed(1)} seconds`;
}

function stepRow(step: AgentStep, tz: string): HTMLElement {
  const mark = step.status === "failed" ? "Failed. " : step.status === "skipped" ? "Skipped. " : "";
  return h(
    "li",
    { class: `agent-step agent-step-${step.status}` },
    h("time", { class: "agent-time", datetime: step.at }, clock(step.at, tz)),
    h(
      "div",
      { class: "agent-body" },
      h("p", { class: "agent-did" }, step.did),
      h("p", { class: "agent-outcome" }, mark ? h("span", { class: "agent-mark" }, mark) : null, step.outcome),
      h("p", { class: "agent-calls" }, `${callsWords(step.calls, step.cached)}, ${seconds(step.ms)}`),
    ),
  );
}

function runView(run: AgentRun, state: VenueState, base: string): HTMLElement {
  const tz = state.venue.tz;
  const took = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  const open = run.planId && state.proposals.some((p) => p.id === run.planId);
  return h(
    "div",
    { class: "agent-run" },
    h(
      "div",
      { class: "panel-head" },
      h("h3", null, `Last run, ${moment(run.startedAt, tz)}`),
      h("span", { class: run.by === "owner" ? "chip chip-yes" : "chip chip-line" }, run.by === "owner" ? "Started by you" : "Ran on its own"),
    ),
    h("ol", { class: "agent-steps" }, run.steps.map((s) => stepRow(s, tz))),
    h("p", { class: "meta agent-total" }, `${callsWords(run.calls, run.cached)} in all, finished in ${seconds(Number.isFinite(took) ? took : 0)}.`),
    open ? h("p", { class: "actions actions-tight" }, h("a", { class: "btn btn-quiet btn-small", href: `${base}/night/${encodeURIComponent(run.planId ?? "")}` }, "Read the draft")) : null,
  );
}

function earlier(runs: AgentRun[], tz: string): HTMLElement | null {
  if (!runs.length) return null;
  return h(
    "details",
    { class: "agent-earlier" },
    h("summary", null, plural(runs.length, "earlier run", "earlier runs")),
    h(
      "ul",
      { class: "agent-earlier-list" },
      runs.map((r) =>
        h("li", null, `${moment(r.startedAt, tz)}, ${r.by === "owner" ? "started by the owner" : "on its own"}, ${callsWords(r.calls, r.cached).toLowerCase()}${r.title ? `, drafted ${r.title}` : ", drafted nothing"}.`),
      ),
    ),
  );
}

// The button runs the same routine the alarm runs. While it works the line counts the Qloo calls the server has finished.
function runButton(id: string, token: string, done: () => void): { el: HTMLElement } {
  const status = h("p", { class: "meta agent-status", role: "status", "aria-live": "polite" });
  const button = h("button", { class: "btn btn-small", type: "button" }, "Run it now");
  const hint = h("p", { class: "small" }, "It runs the same steps as Monday morning and publishes nothing. You can run it once an hour.");
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Running. Waiting for the first Qloo call.";
    let live = true;
    const poll = async (): Promise<void> => {
      if (!live) return;
      try {
        const p = await api.progress(id, token);
        if (live && p.done.length) status.textContent = `Running. ${plural(p.done.length, "Qloo call", "Qloo calls")} finished so far.`;
      } catch {
        // The next check tries again.
      }
      if (live) window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    try {
      await api.runMonday(id, token);
      live = false;
      done();
    } catch (err) {
      live = false;
      button.disabled = false;
      status.textContent = err instanceof ApiFailure && err.code === "run_limit" && err.detail ? err.detail : explain(err).body;
    }
  });
  return { el: h("div", { class: "agent-control" }, h("div", { class: "actions actions-tight" }, button), status, hint) };
}

export function agentPanel(id: string, token: string, state: VenueState, onDone: () => void): HTMLElement {
  const venue = state.venue;
  const base = `/v/${encodeURIComponent(id)}`;
  const [last, ...rest] = state.runs ?? [];
  return h(
    "section",
    { class: "panel", "aria-labelledby": "monday-title" },
    h("h2", { id: "monday-title" }, "Every Monday"),
    h("p", null, "Full House reads the street again, checks your partner still fits, and drafts the next night. It never publishes on its own."),
    h("p", { class: "meta" }, state.nextAlarm ? `Next run ${moment(state.nextAlarm, venue.tz)}.` : "No Monday run is scheduled yet."),
    runButton(id, token, onDone).el,
    last ? runView(last, state, base) : h("p", { class: "meta agent-none" }, "It has not run for this venue yet. The steps of its first run show here."),
    earlier(rest, venue.tz),
  );
}

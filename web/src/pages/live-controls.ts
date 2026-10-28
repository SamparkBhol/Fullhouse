import type { StatsRange } from "../../../src/shared/stats.ts";
import { h } from "../dom.ts";
import { clockTime } from "../charts/time.ts";
import type { PollState } from "./live-poll.ts";

export type RefreshChoice = "off" | "10s" | "30s" | "1m";

export const REFRESH_MS: Record<RefreshChoice, number | null> = { off: null, "10s": 10_000, "30s": 30_000, "1m": 60_000 };

export const RANGE_OPTIONS: [StatsRange, string][] = [
  ["24h", "24 hours"],
  ["7d", "7 days"],
  ["30d", "30 days"],
];

export const REFRESH_OPTIONS: [RefreshChoice, string][] = [
  ["off", "Off"],
  ["10s", "10 s"],
  ["30s", "30 s"],
  ["1m", "1 min"],
];

const EVERY_WORDS: Record<number, string> = { 10_000: "10 s", 20_000: "20 s", 30_000: "30 s", 60_000: "minute" };

// Grafana's pickers as radio groups: one tab stop each, arrow keys move between options.
export function segmented<T extends string>(legend: string, name: string, options: [T, string][], value: T, onChange: (v: T) => void): HTMLFieldSetElement {
  return h(
    "fieldset",
    { class: "seg" },
    h("legend", null, legend),
    h(
      "div",
      { class: "seg-options" },
      options.map(([v, label]) =>
        h(
          "label",
          null,
          h("input", { type: "radio", name, value: v, checked: v === value, onchange: () => onChange(v) }),
          h("span", null, label),
        ),
      ),
    ),
  );
}

export function readChoice<T extends string>(param: string, options: [T, string][], fallback: T): T {
  const raw = new URLSearchParams(location.search).get(param);
  return options.some(([v]) => v === raw) ? (raw as T) : fallback;
}

// The pickers live in the query string, so a copied link opens the same view. Defaults stay out of it.
export function keepInUrl(param: string, value: string, fallback: string): void {
  const query = new URLSearchParams(location.search);
  if (value === fallback) query.delete(param);
  else query.set(param, value);
  const search = query.toString();
  history.replaceState(history.state, "", `${location.pathname}${search ? `?${search}` : ""}${location.hash}`);
}

// The line under the pickers says exactly what the page is doing: how often it checks, when it last did,
// and whether anything changed. The square is filled only while it is polling. Screen readers hear only
// a failure or a pause, not every routine check.
export function refreshLine(tz = "UTC"): { el: HTMLElement; show(state: PollState, every: number | null): void } {
  const line = h("span");
  const square = h("span", { class: "pulse pulse-off", "aria-hidden": "true" });
  const heard = h("span", { class: "sr-only", role: "status" });
  const el = h("p", { class: "refresh-line" }, square, line, heard);
  let lastAt: number | null = null;
  const last = () => (lastAt ? ` Last check ${clockTime(lastAt, tz, true)}` : "");
  return {
    el,
    show(state, every) {
      const polling = every !== null;
      let words: string;
      let mode = polling ? "on" : "off";
      if (state.kind === "checking") words = lastAt ? `Checking now.${last()}.` : "Checking now.";
      else if (state.kind === "paused") {
        words = "Paused while this tab is hidden.";
        mode = "off";
      } else if (state.kind === "failed") {
        const retry = state.retryMs === null ? "Press Check now to try again." : `Trying again in ${Math.round(state.retryMs / 1000)} s.`;
        words = `The check at ${clockTime(state.at, tz, true)} failed. ${state.detail} ${retry}`;
        mode = "failed";
      } else {
        lastAt = state.at;
        const what = state.changed ? "numbers updated" : "nothing new";
        words = polling ? `Checks every ${EVERY_WORDS[every] ?? `${every / 1000} s`}.${last()}, ${what}.` : `Auto refresh off.${last()}.`;
      }
      square.className = `pulse pulse-${mode}`;
      line.textContent = words;
      heard.textContent = state.kind === "failed" || state.kind === "paused" ? words : "";
    },
  };
}

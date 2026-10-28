import type { StatsRange } from "../../../src/shared/stats.ts";
import { doorCounter, type Counter, type Say } from "../charts/counter.ts";
import { openTables, reopenTables } from "../charts/panel.ts";
import { h, replace } from "../dom.ts";
import { ticket } from "../router.ts";
import { loading } from "../ui/states.ts";
import { keepInUrl, RANGE_OPTIONS, readChoice, REFRESH_MS, REFRESH_OPTIONS, refreshLine, segmented, type RefreshChoice } from "./live-controls.ts";
import { startPolling, type PollState } from "./live-poll.ts";

export interface BoardTools {
  range: StatsRange;
  tz: string;
  counter(key: string, say: Say, tone?: "chalk" | "lit"): Counter;
}

export interface BoardSpec<T> {
  name: string;
  heading: string;
  intro(body: T | null): string;
  tz: string;
  url(range: StatsRange): string;
  token?: string;
  withRange: boolean;
  defaultRefresh: RefreshChoice;
  extra?: Node | null;
  panes(body: T, tools: BoardTools): Node[];
}

interface FocusPlace {
  pane: string;
  index: number;
}

const FOCUSABLE = "[tabindex='0'], summary, a[href], button";

// A poll redraws the panes, so whatever had keyboard focus gets it back in the new pane.
function focusPlace(root: HTMLElement): FocusPlace | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const pane = active.closest<HTMLElement>("[data-pane]");
  if (!pane) return null;
  return { pane: pane.dataset.pane ?? "", index: [...pane.querySelectorAll(FOCUSABLE)].indexOf(active) };
}

function restoreFocus(root: HTMLElement, place: FocusPlace | null): void {
  if (!place || place.index < 0) return;
  const pane = [...root.querySelectorAll<HTMLElement>("[data-pane]")].find((p) => p.dataset.pane === place.pane);
  pane?.querySelectorAll<HTMLElement>(FOCUSABLE)[place.index]?.focus({ preventScroll: true });
}

function failed(detail: string): HTMLElement {
  return h(
    "section",
    { class: "state state-failure board-failed", role: "alert" },
    h("p", { class: "state-title" }, "The numbers did not load."),
    h("p", null, detail),
  );
}

// The frame both dashboards share: title, pickers, the refresh line and the panes, kept fresh by one poller.
export function mountBoard<T>(main: HTMLElement, spec: BoardSpec<T>): void {
  let range: StatsRange = spec.withRange ? readChoice("range", RANGE_OPTIONS, "24h") : "24h";
  let refresh = readChoice("refresh", REFRESH_OPTIONS, spec.defaultRefresh);
  let lastState: PollState = { kind: "checking" };
  let shown = false;
  const counters = new Map<string, Counter>();
  const tools = (): BoardTools => ({
    range,
    tz: spec.tz,
    counter(key, say, tone = "chalk") {
      const held = counters.get(key);
      if (held) return held;
      const made = doorCounter(say, tone);
      counters.set(key, made);
      return made;
    },
  });
  const intro = h("p", { class: "board-intro" }, spec.intro(null));
  const status = refreshLine(spec.tz);
  const body = h("div", { class: `board-body board-body-${spec.name}` }, loading("Counting"));

  const draw = (data: T): void => {
    const place = focusPlace(body);
    const open = openTables(body);
    replace(body, ...spec.panes(data, tools()));
    reopenTables(body, open);
    restoreFocus(body, place);
    intro.textContent = spec.intro(data);
    shown = true;
  };
  const onState = (state: PollState): void => {
    lastState = state;
    status.show(state, REFRESH_MS[refresh]);
    if (state.kind === "failed" && !shown) replace(body, failed(state.detail));
  };
  const poller = startPolling<T>({
    ticket: ticket(),
    url: () => spec.url(range),
    ...(spec.token ? { token: spec.token } : {}),
    every: () => REFRESH_MS[refresh],
    onData: draw,
    onState,
  });

  const rangePicker = spec.withRange
    ? segmented("Range", "range", RANGE_OPTIONS, range, (v) => {
        range = v;
        keepInUrl("range", v, "24h");
        counters.clear();
        shown = false;
        replace(body, loading("Counting"));
        poller.checkNow();
      })
    : null;
  const refreshPicker = segmented("Auto refresh", "refresh", REFRESH_OPTIONS, refresh, (v) => {
    refresh = v;
    keepInUrl("refresh", v, spec.defaultRefresh);
    if (REFRESH_MS[v] === null) {
      poller.reschedule();
      status.show(lastState, null);
    } else {
      poller.checkNow();
    }
  });

  replace(
    main,
    h(
      "div",
      { class: `board board-${spec.name}` },
      h(
        "div",
        { class: "board-inner" },
        h(
          "div",
          { class: "board-head" },
          h("div", { class: "board-titles" }, h("h1", null, spec.heading), intro, status.el),
          h(
            "div",
            { class: "board-controls" },
            rangePicker,
            refreshPicker,
            h("button", { class: "button button-quiet board-check", type: "button", onclick: () => poller.checkNow() }, "Check now"),
            spec.extra ?? null,
          ),
        ),
        body,
      ),
    ),
  );
}

import type { RunProgress } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { loading } from "./states.ts";

export interface ServerStep {
  label: string;
  // The step is done once a finished Qloo call's name matches, or, with no pattern, when the answer arrives.
  call?: RegExp;
}

const POLL_MS = 700;

// Each line ticks only when the server says its call finished; nothing here moves on a timer.
export function serverProgress(heading: string, steps: ServerStep[], poll: () => Promise<RunProgress>, seen?: (p: RunProgress) => void): { el: HTMLElement; finish: () => void } {
  const el = loading(heading);
  const items = steps.map((s) => h("li", { class: "state-step" }, h("span", { class: "sr-only state-mark" }, "Waiting: "), s.label));
  const list = h("ul", { class: "state-lines" }, items);
  el.querySelector(".state-title")?.after(list);
  const tick = (i: number) => {
    const li = items[i];
    if (!li || li.classList.contains("state-done")) return;
    li.classList.add("state-done");
    const mark = li.querySelector(".state-mark");
    if (mark) mark.textContent = "Done: ";
  };
  let stopped = false;
  const loop = async (): Promise<void> => {
    if (stopped || !el.isConnected) return;
    try {
      const p = await poll();
      if (stopped) return;
      seen?.(p);
      steps.forEach((s, i) => {
        if (s.call && p.done.some((c) => s.call!.test(c))) tick(i);
      });
    } catch {
      // A missed check is tried again on the next one.
    }
    window.setTimeout(() => void loop(), POLL_MS);
  };
  window.setTimeout(() => void loop(), POLL_MS);
  return {
    el,
    finish: () => {
      stopped = true;
      steps.forEach((_, i) => tick(i));
    },
  };
}

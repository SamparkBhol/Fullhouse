import { h, replace } from "../dom.ts";
import { s } from "./svg.ts";

export type Mark = "solid" | "hatched" | "outline" | "tick" | "lit" | "stop";

export interface HoverRow {
  label: string;
  value: string;
  mark?: Mark;
}

export interface HoverSpec {
  name: string;
  xs: number[];
  top: number;
  bottom: number;
  describe(i: number): { title: string; rows: HoverRow[] };
  start?: number;
}

function nearest(xs: number[], x: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs((xs[i] ?? 0) - x) < Math.abs((xs[best] ?? 0) - x)) best = i;
  return best;
}

// One layer for every chart: a crosshair and a tooltip that follow the pointer, and arrow keys that
// walk the same points for keyboard users, with each point read out politely.
export function hoverFrame(svg: SVGSVGElement, spec: HoverSpec): HTMLElement {
  const line = s("line", { class: "crosshair", x1: 0, x2: 0, y1: spec.top, y2: spec.bottom, visibility: "hidden" });
  svg.appendChild(line);
  const tip = h("div", { class: "tip", hidden: true });
  const say = h("p", { class: "sr-only", "aria-live": "polite" });
  const frame = h("div", { class: "chart-frame", tabindex: "0", role: "group", "aria-label": `${spec.name}. Arrow keys read each point.` }, svg, tip, say);
  let current = -1;

  const show = (i: number, announce: boolean): void => {
    if (!spec.xs.length) return;
    current = Math.max(0, Math.min(spec.xs.length - 1, i));
    const x = spec.xs[current] ?? 0;
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("visibility", "visible");
    const d = spec.describe(current);
    replace(
      tip,
      h("p", { class: "tip-title" }, d.title),
      h("ul", null, d.rows.map((r) => h("li", null, r.mark ? h("span", { class: `key key-${r.mark}`, "aria-hidden": "true" }) : null, h("span", null, r.label), h("strong", null, r.value)))),
    );
    tip.hidden = false;
    const width = frame.clientWidth;
    if (x > width / 2) {
      tip.style.left = "";
      tip.style.right = `${Math.max(0, width - x + 12)}px`;
    } else {
      tip.style.right = "";
      tip.style.left = `${x + 12}px`;
    }
    if (announce) say.textContent = `${d.title}. ${d.rows.map((r) => `${r.label} ${r.value}`).join(". ")}.`;
  };

  const hide = (): void => {
    line.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };

  const fromPointer = (e: PointerEvent): void => {
    const box = svg.getBoundingClientRect();
    show(nearest(spec.xs, e.clientX - box.left), false);
  };
  svg.addEventListener("pointermove", fromPointer);
  svg.addEventListener("pointerdown", fromPointer);
  svg.addEventListener("pointerleave", () => {
    if (document.activeElement !== frame) hide();
  });
  frame.addEventListener("focus", () => show(current >= 0 ? current : (spec.start ?? spec.xs.length - 1), true));
  frame.addEventListener("blur", hide);
  frame.addEventListener("keydown", (e) => {
    const moves: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: spec.xs.length - 1 };
    if (e.key === "Escape") {
      hide();
      return;
    }
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show(next, true);
  });
  return frame;
}

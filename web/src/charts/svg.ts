const NS = "http://www.w3.org/2000/svg";

type SvgAttrs = Record<string, string | number | null | undefined | false>;

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: SvgAttrs = {}, ...children: (SVGElement | null | false)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(key, String(value));
  }
  for (const child of children) if (child) el.appendChild(child);
  return el;
}

export function text(x: number, y: number, label: string, attrs: SvgAttrs = {}): SVGTextElement {
  const t = s("text", { x, y, ...attrs });
  t.textContent = label;
  return t;
}

let patternCount = 0;

// Hatched marks mean reused: an answer from the cache, copy from a template. Solid means made fresh.
export function hatch(className: string): { id: string; def: SVGPatternElement } {
  patternCount += 1;
  const id = `hatch${patternCount}`;
  const def = s(
    "pattern",
    { id, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
    s("rect", { width: 5, height: 5, class: `${className} hatch-ground` }),
    s("line", { x1: 0, y1: 0, x2: 0, y2: 5, class: `${className} hatch-line` }),
  );
  return { id, def };
}

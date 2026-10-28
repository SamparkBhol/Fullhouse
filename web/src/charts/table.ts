import { h } from "../dom.ts";

export type Cell = string | number;

export interface TableSpec {
  caption: string;
  head: string[];
  rows: Cell[][];
  numeric?: boolean[];
}

export function dataTable(spec: TableSpec): HTMLTableElement {
  const align = (i: number) => (spec.numeric?.[i] ? "num" : null);
  return h(
    "table",
    { class: "data-table" },
    h("caption", { class: "sr-only" }, spec.caption),
    h("thead", null, h("tr", null, spec.head.map((label, i) => h("th", { scope: "col", class: align(i) }, label)))),
    h(
      "tbody",
      null,
      spec.rows.map((row) =>
        h(
          "tr",
          null,
          row.map((cell, i) => (i === 0 ? h("th", { scope: "row", "data-label": spec.head[i] ?? "" }, String(cell)) : h("td", { class: align(i), "data-label": spec.head[i] ?? "" }, String(cell)))),
        ),
      ),
    ),
  );
}

// Every chart carries its numbers as a table one tap away, for screen readers and for checking.
export function asTable(key: string, spec: TableSpec): HTMLDetailsElement {
  return h("details", { class: "as-table", "data-key": key }, h("summary", null, "Show as a table"), h("div", { class: "table-scroll" }, dataTable(spec)));
}

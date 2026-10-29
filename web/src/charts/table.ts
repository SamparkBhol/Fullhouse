import { h } from "../dom.ts";

export type Cell = string | number;

export interface TableSpec {
  caption: string;
  head: string[];
  rows: Cell[][];
  numeric?: boolean[];
}

// The roles are spelled out because a phone lays the rows out as blocks, and some browsers drop table semantics then.
export function dataTable(spec: TableSpec): HTMLTableElement {
  const align = (i: number) => (spec.numeric?.[i] ? "num" : null);
  return h(
    "table",
    { class: "data-table", role: "table" },
    h("caption", { class: "sr-only" }, spec.caption),
    h("thead", { role: "rowgroup" }, h("tr", { role: "row" }, spec.head.map((label, i) => h("th", { scope: "col", role: "columnheader", class: align(i) }, label)))),
    h(
      "tbody",
      { role: "rowgroup" },
      spec.rows.map((row) =>
        h(
          "tr",
          { role: "row" },
          row.map((cell, i) =>
            i === 0
              ? h("th", { scope: "row", role: "rowheader", "data-label": spec.head[i] ?? "" }, String(cell))
              : h("td", { class: align(i), role: "cell", "data-label": spec.head[i] ?? "" }, String(cell)),
          ),
        ),
      ),
    ),
  );
}

// Every chart carries its numbers as a table one tap away, for screen readers and for checking.
export function asTable(key: string, spec: TableSpec): HTMLDetailsElement {
  return h("details", { class: "as-table disclose", "data-key": key }, h("summary", null, "Show as a table"), h("div", { class: "table-scroll" }, dataTable(spec)));
}

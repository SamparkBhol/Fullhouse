import type { Provenance } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { openReceipt } from "./receipt.ts";

export interface DrawerOptions {
  parts: (HTMLElement | null)[];
  calls: Provenance[];
  limits?: string[];
  tz?: string;
}

function limitsPart(limits: string[] | undefined): HTMLElement | null {
  const items = (limits ?? []).filter((l) => l && l.trim());
  if (!items.length) return null;
  return h("section", { class: "limits", "aria-label": "Limits of this read" }, h("h3", { class: "limits-head" }, "What this does not tell you"), h("ul", null, items.map((l) => h("li", null, l))));
}

// Every page with Qloo data ends with one closed drawer: how each part is known, the calls, and the limits.
export function receiptsDrawer(opts: DrawerOptions): HTMLElement {
  const n = opts.calls.length;
  const all = n
    ? h("p", { class: "receipts-all" }, h("button", { type: "button", class: "button button-ink", onclick: () => openReceipt(opts.calls, null, { tz: opts.tz }) }, `All ${plural(n, "Qloo call", "Qloo calls")}`))
    : null;
  return h(
    "details",
    { class: "receipts" },
    h(
      "summary",
      null,
      h("span", { class: "receipts-name" }, "Receipts"),
      h("span", { class: "receipts-what" }, n ? `How we know each part, the ${plural(n, "Qloo call", "Qloo calls")} behind it, and what it does not tell you.` : "How we know each part, and what it does not tell you."),
    ),
    h("div", { class: "receipts-paper" }, ...opts.parts, limitsPart(opts.limits), all),
  );
}

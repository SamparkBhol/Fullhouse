import type { Because, Provenance } from "../../../src/shared/contract.ts";
import { callName } from "../calls.ts";
import { h } from "../dom.ts";
import { count, moment } from "../format.ts";

let open: HTMLDialogElement | null = null;

function line(p: Provenance, index: number, tz?: string): HTMLElement {
  const params = Object.entries(p.params ?? {});
  const facts = [
    count(p.resultCount, "result", "results"),
    typeof p.ms === "number" ? `${Math.round(p.ms)} ms` : null,
    p.cached ? `cached, first read ${moment(p.at, tz)}` : `live, ${moment(p.at, tz)}`,
  ].filter(Boolean);
  return h(
    "li",
    { id: `call-${index + 1}`, class: "receipt-line" },
    h("p", { class: "receipt-call" }, h("span", { class: "receipt-no" }, `Call ${index + 1}`), " ", callName(p.call)),
    h("p", { class: "receipt-endpoint" }, `GET ${p.endpoint}`),
    params.length
      ? h(
          "dl",
          { class: "receipt-params" },
          params.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]),
        )
      : null,
    h("p", { class: "receipt-facts" }, facts.join(", ")),
  );
}

export function openReceipt(provenance: Provenance[], focus: number | null, opts: { heading?: string; tz?: string } = {}): void {
  open?.close();
  const closeButton = h("button", { class: "button button-quiet receipt-close", type: "button" }, "Close");
  const list = h("ol", { class: "receipt-list" }, provenance.map((p, i) => line(p, i, opts.tz)));
  const dialog = h(
    "dialog",
    { class: "receipt", "aria-labelledby": "receipt-title" },
    h(
      "div",
      { class: "receipt-paper" },
      h(
        "div",
        { class: "receipt-head" },
        h("h2", { id: "receipt-title" }, opts.heading ?? "Qloo calls behind this read"),
        closeButton,
      ),
      h(
        "p",
        { class: "receipt-note" },
        "Every call Full House made to Qloo for this venue, with its endpoint and parameters. The API key is never shown, and nothing about your customers is sent.",
      ),
      provenance.length ? list : h("p", null, "No Qloo calls are recorded for this."),
    ),
  );
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (open === dialog) open = null;
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  open = dialog;
  dialog.showModal();
  if (focus !== null && focus >= 0 && focus < provenance.length) {
    const target = dialog.querySelector<HTMLElement>(`#call-${focus + 1}`);
    if (target) {
      target.classList.add("receipt-focus");
      target.setAttribute("tabindex", "-1");
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }
  }
}

export function reasons(because: Because[] | undefined, provenance: Provenance[] | undefined, tz?: string): HTMLElement | null {
  const items = because ?? [];
  if (!items.length) return null;
  const calls = provenance ?? [];
  return h(
    "ul",
    { class: "because" },
    items.map((b) => {
      const known = Number.isInteger(b.provenance) && b.provenance >= 0 && b.provenance < calls.length;
      if (!known) return h("li", null, h("span", { class: "because-text" }, b.text));
      return h(
        "li",
        null,
        h(
          "button",
          {
            type: "button",
            class: "because-row",
            onclick: () => openReceipt(calls, b.provenance, { tz }),
          },
          h("span", { class: "because-text" }, b.text),
          h("span", { class: "because-call" }, `Call ${b.provenance + 1}`),
        ),
      );
    }),
  );
}

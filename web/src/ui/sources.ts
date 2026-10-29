import type { Because, Provenance } from "../../../src/shared/contract.ts";
import { plural } from "../../../src/shared/words.ts";
import { callName } from "../calls.ts";
import { h } from "../dom.ts";
import { moment } from "../format.ts";

let open: HTMLDialogElement | null = null;

function callItem(p: Provenance, index: number, tz?: string): HTMLElement {
  const params = Object.entries(p.params ?? {});
  const facts = [
    plural(p.resultCount, "result", "results"),
    typeof p.ms === "number" ? `${Math.round(p.ms)} ms` : null,
    p.cached ? `from the cache, first asked ${moment(p.at, tz)}` : `asked ${moment(p.at, tz)}`,
  ].filter(Boolean);
  return h(
    "li",
    { id: `call-${index + 1}`, class: "call" },
    h("p", { class: "call-name" }, h("span", { class: "call-no" }, `Call ${index + 1}`), callName(p.call)),
    h("p", { class: "call-endpoint" }, `GET ${p.endpoint}`),
    params.length ? h("dl", { class: "call-params" }, params.map(([k, v]) => [h("dt", null, k), h("dd", null, v)])) : null,
    h("p", { class: "call-facts" }, facts.join(", ")),
  );
}

// Every call behind a screen in one sheet, opened at the one a reason points to.
export function openCalls(provenance: Provenance[], focus: number | null, opts: { tz?: string } = {}): void {
  open?.close();
  const close = h("button", { class: "btn btn-quiet btn-small", type: "button" }, "Close");
  const dialog = h(
    "dialog",
    { class: "sheet-dialog", "aria-labelledby": "calls-title" },
    h("div", { class: "sheet-head" }, h("h2", { id: "calls-title" }, "Every call behind this read"), close),
    h(
      "div",
      { class: "sheet-body" },
      h("p", { class: "sheet-note" }, "Each request Full House made for this venue, with its endpoint and parameters. The API key is never shown, and nothing about your customers is sent."),
      provenance.length ? h("ol", null, provenance.map((p, i) => callItem(p, i, opts.tz))) : h("p", null, "No calls are recorded for this."),
    ),
  );
  close.addEventListener("click", () => dialog.close());
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
      target.classList.add("call-focus");
      target.setAttribute("tabindex", "-1");
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }
  }
}

export function reasons(because: Because[] | undefined, calls: Provenance[] | undefined, tz?: string): HTMLElement | null {
  const items = because ?? [];
  if (!items.length) return null;
  const list = calls ?? [];
  return h(
    "ul",
    { class: "because" },
    items.map((b) => {
      const known = Number.isInteger(b.provenance) && b.provenance >= 0 && b.provenance < list.length;
      if (!known) return h("li", null, h("span", { class: "because-text" }, b.text));
      return h(
        "li",
        null,
        h(
          "button",
          { type: "button", class: "because-row", onclick: () => openCalls(list, b.provenance, { tz }) },
          h("span", { class: "because-text" }, b.text),
          h("span", { class: "because-call" }, `Call ${b.provenance + 1}`),
        ),
      );
    }),
  );
}

export interface SourcePart {
  heading?: string;
  because: Because[];
  nested?: boolean;
}

export interface SourceOptions {
  heading: string;
  plain: string[];
  parts?: SourcePart[];
  calls: Provenance[];
  callNames?: string[];
  tz?: string;
}

function callsUsed(parts: SourcePart[], calls: Provenance[], names: string[] = []): number[] {
  const used = new Set<number>();
  for (const p of parts) for (const b of p.because) if (Number.isInteger(b.provenance) && b.provenance >= 0 && b.provenance < calls.length) used.add(b.provenance);
  calls.forEach((c, i) => {
    if (names.includes(c.call)) used.add(i);
  });
  return [...used].sort((a, b) => a - b);
}

// One part of the sources: plain words first, then each reason with the call it came from.
export function sourcePart(opts: SourceOptions, ...extra: (HTMLElement | null)[]): HTMLElement {
  const parts = (opts.parts ?? []).filter((p) => p.because.length);
  const used = callsUsed(parts, opts.calls, opts.callNames);
  return h(
    "section",
    { class: "fold" },
    h("h3", null, opts.heading),
    ...opts.plain.map((t) => h("p", { class: "fold-plain" }, t)),
    ...extra,
    ...parts.flatMap((p) =>
      p.nested && p.heading
        ? [h("details", { class: "fold-sub disclose" }, h("summary", null, `${p.heading}, ${plural(p.because.length, "line", "lines")}`), reasons(p.because, opts.calls, opts.tz))]
        : [p.heading ? h("h4", { class: "fold-head" }, p.heading) : null, reasons(p.because, opts.calls, opts.tz)],
    ),
    used.length
      ? [
          h("h4", { class: "fold-head" }, used.length === 1 ? "The call" : `The ${used.length} calls`),
          h(
            "ul",
            { class: "fold-calls" },
            used.map((i) => {
              const p = opts.calls[i] as Provenance;
              return h(
                "li",
                null,
                h(
                  "button",
                  { type: "button", class: "fold-call", onclick: () => openCalls(opts.calls, i, { tz: opts.tz }) },
                  h("span", { class: "fold-call-no" }, `Call ${i + 1}`),
                  h("span", null, `${callName(p.call)}. ${plural(p.resultCount, "result", "results")}${p.cached ? ", from the cache" : ""}.`),
                ),
              );
            }),
          ),
        ]
      : null,
  );
}

function limitsPart(limits: string[] | undefined): HTMLElement | null {
  const items = (limits ?? []).filter((l) => l && l.trim());
  if (!items.length) return null;
  return h("section", { class: "limits", "aria-label": "Limits of this read" }, h("h3", null, "What this does not tell you"), h("ul", null, items.map((l) => h("li", null, l))));
}

// The end of a screen with taste data: one closed disclosure with how each part is known, the calls and the limits.
export function sourcesDrawer(opts: { parts: (HTMLElement | null)[]; calls: Provenance[]; limits?: string[]; tz?: string }): HTMLElement {
  const n = opts.calls.length;
  return h(
    "details",
    { class: "sources disclose" },
    h("summary", null, h("span", null, "Where this came from"), h("span", { class: "sources-what" }, n ? plural(n, "call", "calls") : "")),
    h(
      "div",
      { class: "sources-body" },
      ...opts.parts,
      limitsPart(opts.limits),
      n ? h("p", null, h("button", { type: "button", class: "btn btn-quiet", onclick: () => openCalls(opts.calls, null, { tz: opts.tz }) }, `See all ${plural(n, "call", "calls")}`)) : null,
    ),
  );
}

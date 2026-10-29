import type { Fit, FitCheck } from "../../../src/shared/contract.ts";
import { verdictWord } from "../../../src/shared/verdict.ts";
import { h, prefersReducedMotion } from "../dom.ts";

function checkRow(c: FitCheck, full: boolean): HTMLElement {
  const share = c.max > 0 ? Math.max(0, Math.min(1, c.points / c.max)) : 0;
  const bar = h("span", { class: "bar", "aria-hidden": "true" }, h("i"));
  (bar.firstElementChild as HTMLElement).style.width = `${Math.round(share * 100)}%`;
  return h(
    "li",
    { class: c.pass ? "check" : "check check-miss", "data-key": c.key },
    h("b", { class: "check-label" }, c.label),
    bar,
    h("em", null, `${c.points} of ${c.max}`),
    h("span", { class: "sr-only" }, c.pass ? "Passes." : "Does not pass."),
    full ? h("span", { class: "check-sentence" }, c.sentence) : null,
  );
}

export function checksList(checks: FitCheck[], full = false): HTMLElement {
  return h("ul", { class: full ? "checks checks-full" : "checks" }, checks.map((c) => checkRow(c, full)));
}

export function verdict(score: number, sub: string | null, opts: { bare?: boolean } = {}): HTMLElement {
  return h(
    "div",
    { class: opts.bare ? "verdict verdict-bare" : "verdict" },
    h("p", { class: "score" }, h("span", { class: "score-value" }, String(score)), h("small", null, "of 100")),
    h("p", { class: "verdict-head" }, verdictWord(score)),
    sub ? h("p", { class: "verdict-sub" }, sub) : null,
  );
}

// The one moment that moves on its own: the check bars fill once after the match lands. The score itself is the
// real number from the first frame, so no screenshot ever catches it mid count.
export function playOnce(root: HTMLElement): void {
  if (prefersReducedMotion()) return;
  root.classList.add("fill");
}

export function fitPanel(fit: Fit, sub: string | null, id = "fit"): HTMLElement {
  const head = `${id}-title`;
  return h(
    "section",
    { class: "panel", id, "aria-labelledby": head },
    h("h2", { class: "sr-only", id: head }, `Fit score, ${fit.score} of 100`),
    verdict(fit.score, sub, { bare: true }),
    checksList(fit.checks, true),
  );
}

import type { Considered, Match, Verdict } from "../../../src/shared/contract.ts";
import { BOARD_SHOWN, boardRows, boardSentence } from "../../../src/shared/board.ts";
import { capFirst, ordinal, shortName } from "../../../src/shared/words.ts";
import { h, uid } from "../dom.ts";

// Said to a screen reader before each reason, so the verdict is never carried by colour alone.
const SAID: Record<Verdict, string> = {
  partner: "Chosen.",
  runner_up: "Runner up.",
  scored: "Scored lower.",
  rival: "Rival.",
  not_a_room: "Not a room.",
  no_owner: "No owner to ask.",
  closed: "Closed.",
  you: "Your venue.",
};

// Rows whose reason does not already name the kind of place carry it beside the name.
const WITH_KIND = new Set<Verdict>(["partner", "runner_up", "scored", "no_owner", "closed"]);

function reason(r: Considered): (HTMLElement | string)[] {
  const lead = r.verdict === "partner" ? "Chosen. " : r.verdict === "runner_up" ? "Runner up. " : null;
  const scorePart = r.score !== undefined ? `${r.score} of 100` : null;
  const rest = scorePart && r.reason.startsWith(scorePart) ? r.reason.slice(scorePart.length) : r.reason;
  const bold = [lead, scorePart && r.reason.startsWith(scorePart) ? scorePart : null].filter(Boolean).join("");
  return bold ? [h("b", null, bold), rest] : [rest];
}

export type SwapHandler = (row: Considered, button: HTMLButtonElement) => void;

// The kind, and the walk unless the reason is already the walk.
function metaOf(r: Considered): string | null {
  if (!WITH_KIND.has(r.verdict)) return null;
  return /minutes? on foot/.test(r.reason) ? capFirst(r.kind) : `${capFirst(r.kind)}, ${r.walkMin} min on foot`;
}

function choiceRow(r: Considered, swap?: SwapHandler): HTMLElement {
  const meta = metaOf(r);
  const said = r.verdict === "partner" || r.verdict === "runner_up" ? null : h("span", { class: "sr-only" }, `${SAID[r.verdict]} `);
  let button: HTMLButtonElement | null = null;
  if (swap && r.verdict === "runner_up") {
    const b = h("button", { type: "button", class: "btn btn-quiet btn-small choice-swap", "aria-label": `Swap to ${shortName(r.name)}` }, "Swap");
    b.addEventListener("click", () => swap(r, b));
    button = b;
  }
  return h(
    "li",
    { class: `choice choice-${r.verdict.replace("_", "-")}` },
    h("span", { class: "choice-rank" }, h("span", { class: "sr-only" }, `${ordinal(r.rank)} on the list. `), h("span", { "aria-hidden": "true" }, String(r.rank))),
    h(
      "div",
      { class: "choice-body" },
      h("p", { class: "choice-name" }, h("span", null, shortName(r.name)), meta ? h("span", { class: "choice-meta" }, ` ${meta}`) : null),
      h("p", { class: "choice-why" }, said, ...reason(r)),
    ),
    button,
  );
}

export function choiceList(rows: Considered[], swap?: SwapHandler): HTMLElement {
  return h("ol", { class: "choices" }, rows.map((r) => choiceRow(r, swap)));
}

// The board: the venue's list in Qloo's order with what Full House decided about each place, the partner in plum.
export function decisionPanel(m: Match, opts: { swap?: SwapHandler } = {}): HTMLElement | null {
  const rows = m.considered ?? [];
  if (!rows.length) return null;
  const of = m.consideredOf ?? rows.length;
  const { shown, folded } = boardRows(rows, BOARD_SHOWN);
  const head = uid("board");
  const sentence = boardSentence(rows, of);
  const lower = of - rows.length;
  return h(
    "section",
    { class: "panel decision", id: "board", "aria-labelledby": head },
    h("h2", { id: head }, "How Full House chose"),
    sentence ? h("p", { class: "decision-lead" }, sentence) : null,
    choiceList(shown, opts.swap),
    folded.length ? h("details", { class: "disclose more choices-more" }, h("summary", null, `${folded.length} more on the board`), choiceList(folded, opts.swap)) : null,
    lower > 0 ? h("p", { class: "decision-foot" }, `The other ${lower} places on the list rank lower and were not among those Full House scored.`) : null,
  );
}

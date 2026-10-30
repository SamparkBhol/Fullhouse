import type { ExamplePlace } from "../../../src/shared/contract.ts";
import { capFirst, shortName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { longDate, readDate, streetPart } from "../format.ts";
import type { Example } from "../joint.ts";
import { checksList, verdict } from "../ui/fit.ts";
import { pairCard, splitBar } from "../ui/pair.ts";
import { choiceList } from "../ui/decision.ts";
import { boardSentence } from "../../../src/shared/board.ts";
import { LOVED_TAKE } from "../../../src/shared/engine.ts";

function sub(p: ExamplePlace, city: string | null): string | null {
  const where = p.neighborhood?.trim() || streetPart(p.address, city ?? undefined);
  return [p.kind ? capFirst(p.kind) : null, where].filter(Boolean).join(", ") || null;
}

function both(ex: Example): string | null {
  const crowd = ex.checks.find((c) => c.key === "crowd");
  const back = ex.checks.find((c) => c.key === "back");
  if (crowd?.pass && back?.pass) return "Each crowd counts the other place among the ones it loves nearby.";
  if (crowd?.pass) return `Your crowd loves ${shortName(ex.partner.name)}.`;
  return null;
}

function nightLine(ex: Example): HTMLElement | null {
  const [a, b] = ex.stops;
  const when = ex.date ? `${longDate(ex.date)}.` : null;
  const plan = a && b ? `${capFirst(a.what)} at ${shortName(a.name)} from ${a.start}, then ${b.what.charAt(0).toLowerCase()}${b.what.slice(1)} at ${shortName(b.name)} from ${b.start}.` : ex.title ? `${ex.title}.` : null;
  if (!when && !plan) return null;
  return h(
    "div",
    { class: "night-line" },
    when ? h("b", null, when) : null,
    when && plan ? " " : null,
    plan,
    ex.split ? splitBar(ex.split, ex.venue.name, ex.partner.name) : null,
  );
}

// A real pair from a stored read, with the checks behind its score.
export function examplePair(ex: Example): HTMLElement {
  return pairCard(
    {
      you: { name: ex.venue.name, ...(ex.venue.image ? { image: ex.venue.image } : {}), sub: sub(ex.venue, ex.city) },
      them: { name: ex.partner.name, ...(ex.partner.image ? { image: ex.partner.image } : {}), sub: sub(ex.partner, ex.city) },
      walkMin: ex.minutes,
      className: "example",
    },
    ex.fit !== null ? verdict(ex.fit, both(ex)) : null,
    ex.checks.length ? checksList(ex.checks) : null,
    nightLine(ex),
    h("figcaption", { class: "source" }, `${ex.agreed ? "A real pair, agreed by both places" : "A pair Full House proposed, not yet agreed"}${ex.readAt ? `, read on ${readDate(ex.readAt)}` : ""}. Checks by Full House.`),
  );
}

// What each side brings, said once, and the top of the example's board beside it once the example arrives.
export function decisionBand(): { el: HTMLElement; fill: (ex: Example) => void } {
  const of = h("span", null, String(LOVED_TAKE));
  const board = h("figure", { class: "decides-board", hidden: true });
  const el = h(
    "section",
    { class: "band band-white", "aria-labelledby": "decides-title" },
    h(
      "div",
      { class: "wrap decides" },
      h(
        "div",
        { class: "decides-text" },
        h("h2", { id: "decides-title" }, h("span", { class: "line" }, "Qloo ranks."), " ", h("span", { class: "line" }, "Full House decides.")),
        h("p", null, h("b", null, "What Qloo gives. "), "The ", of, " places a crowd loves nearby, each of those places' own crowd, and the books and films two crowds share."),
        h("p", null, h("b", null, "What Full House adds. "), "Six checks on every place it scores, the reverse read, rivals and rooms ruled out, the night built from the two kinds of place, the day both are open, and the count of who sent whom."),
      ),
      board,
    ),
  );
  const fill = (ex: Example): void => {
    if (!ex.considered.length) return;
    const total = ex.consideredOf ?? ex.considered.length;
    of.textContent = String(total);
    const sentence = boardSentence(ex.considered, total, `${shortName(ex.venue.name)}'s crowd`);
    const more = total - ex.considered.length;
    replace(
      board,
      h("figcaption", { class: "decision-lead" }, sentence),
      choiceList(ex.considered),
      h("p", { class: "decision-foot" }, `${more > 0 ? `${more} more places on the list. ` : ""}${ex.readAt ? `Read on ${readDate(ex.readAt)}.` : ""}`),
    );
    board.hidden = false;
  };
  return { el, fill };
}

// The landing shows the example only when the server holds one; otherwise the hero is the search alone.
export function loadExample(slot: HTMLElement, hero: HTMLElement, board?: (ex: Example) => void): void {
  void api.example().then((ex) => {
    if (!ex || !slot.isConnected) return;
    replace(slot, examplePair(ex));
    slot.hidden = false;
    hero.classList.remove("hero-solo");
    board?.(ex);
  });
}

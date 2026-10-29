import type { ExamplePlace } from "../../../src/shared/contract.ts";
import { capFirst, shortName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { longDate, readDate, streetPart } from "../format.ts";
import type { Example } from "../joint.ts";
import { checksList, verdict } from "../ui/fit.ts";
import { pairCard, splitBar } from "../ui/pair.ts";

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

// The landing shows the example only when the server holds one; otherwise the hero is the search alone.
export function loadExample(slot: HTMLElement, hero: HTMLElement): void {
  void api.example().then((ex) => {
    if (!ex || !slot.isConnected) return;
    replace(slot, examplePair(ex));
    slot.hidden = false;
    hero.classList.remove("hero-solo");
  });
}

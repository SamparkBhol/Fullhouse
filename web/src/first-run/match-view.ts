import type { LovedPlace } from "../../../src/shared/contract.ts";
import { plainName, weekdayName } from "../../../src/shared/words.ts";
import { shortName } from "../ui/split-bar.ts";
import { h } from "../dom.ts";
import { prettyTag, walkMinutes } from "../format.ts";
import type { Match, MatchPartner } from "../joint.ts";
import { describingTags } from "../tags.ts";
import { cover } from "../ui/cover.ts";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function minutesLine(p: Pick<LovedPlace, "distanceM">): string {
  const n = walkMinutes(p.distanceM);
  return n === null ? "a short walk away" : `${n} minute${n === 1 ? "" : "s"} away`;
}

// Qloo's own opening hours for the night's weekday, or a plain warning when it has none.
export function hoursFor(p: Pick<LovedPlace, "hours" | "name">, weekday: number): string {
  const spans = (p.hours?.[DAY_KEYS[weekday] ?? ""] ?? []).filter((s) => !s.closed && s.opens && s.closes);
  const day = `${weekdayName(weekday)}s`;
  if (spans.length) return `Open ${day} ${spans.map((s) => `${s.opens} to ${s.closes}`).join(" and ")}.`;
  if ((p.hours?.[DAY_KEYS[weekday] ?? ""] ?? []).some((s) => s.closed)) return `Qloo lists it as closed on ${day}. Pick another day or check first.`;
  return "Qloo has no hours for it, check first.";
}

export function matchHead(m: Match): HTMLElement {
  return h("h1", { class: "first-line first-line-match" }, `Your crowd's other favourite place is ${shortName(m.partner.name)}, ${minutesLine(m.partner)}.`);
}

export function partnerPhoto(p: MatchPartner): HTMLElement {
  return cover(p, { shape: "square", className: "match-photo", eager: true });
}

export function sharedList(m: Match): HTMLElement {
  const tags = m.shared.slice(0, 3).map((t) => prettyTag(t.name));
  return h(
    "section",
    { class: "match-shared", "aria-labelledby": "shared-title" },
    h("h2", { id: "shared-title" }, "What both crowds share"),
    tags.length
      ? h("ul", { class: "shared-tags" }, tags.map((t) => h("li", null, t)))
      : h("p", { class: "meta" }, "Qloo's comparison of the two places returned no tags they share."),
  );
}

export function runnerUp(p: MatchPartner, onSwap: (button: HTMLButtonElement) => void): HTMLElement {
  const kind = describingTags(p.tags, 2);
  const button = h(
    "button",
    { type: "button", class: "runner" },
    cover(p, { shape: "square", className: "runner-photo" }),
    h(
      "span",
      { class: "runner-words" },
      h("strong", { class: "runner-name" }, plainName(p.name)),
      h("span", { class: "runner-meta" }, [minutesLine(p), ...kind].join(". ")),
      h("span", { class: "runner-do" }, "Swap to this one"),
    ),
  );
  button.addEventListener("click", () => onSwap(button));
  return h("li", null, button);
}

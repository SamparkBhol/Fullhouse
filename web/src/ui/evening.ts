import type { NightPlan, NightStop, Venue } from "../../../src/shared/contract.ts";
import { TYPE_PLURAL, listWords, plainName, possessive, shortName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { byLine, planMatch } from "../joint.ts";
import { displayTitle, nightKind } from "../format.ts";
import { cover } from "./cover.ts";
import { splitBar } from "./pair.ts";

function walkItem(min: number): HTMLElement {
  return h(
    "li",
    { class: "stop stop-walk" },
    h("span", { "aria-hidden": "true" }),
    h("span", { class: "rail", "aria-hidden": "true" }),
    h("div", { class: "stop-body" }, `About ${min} minute${min === 1 ? "" : "s"} on foot, together`),
  );
}

function stopItem(s: Pick<NightStop, "start" | "end" | "name" | "what" | "afterHours">, side: "you" | "them", notes: string[], proposed = false): HTMLElement {
  return h(
    "li",
    { class: `stop stop-${side}` },
    h("time", null, s.start, h("small", null, `to ${s.end}`)),
    h("span", { class: "rail", "aria-hidden": "true" }),
    h(
      "div",
      { class: "stop-body" },
      h("h3", null, shortName(s.name)),
      h("p", { class: "stop-what" }, s.what),
      proposed ? h("p", { class: "stop-note stop-proposed" }, `Proposed, subject to ${possessive(shortName(s.name))} programme`) : null,
      s.afterHours ? h("p", { class: "stop-note" }, "Opens late for it") : null,
      ...notes.map((n) => h("p", { class: "stop-note" }, n)),
    ),
  );
}

function playlistNote(plan: NightPlan): string | null {
  const names = plan.playlist.map((a) => a.name).slice(0, 3);
  return names.length ? `Playlist here: ${listWords(names)} and more` : null;
}

// The evening in order: one stop per place, and the walk between them. The partner's stop reads as proposed until
// the partner has set its own time and what runs there.
export function evening(plan: NightPlan, venue: Venue, opts: { partnerProposed?: boolean } = {}): HTMLElement {
  const stops = plan.pair?.stops;
  if (!stops?.length) {
    const what = plan.feature ? `${nightKind(plan)} on ${plan.feature.name}` : nightKind(plan);
    return h("ol", { class: "stops" }, stopItem({ start: plan.start, end: plan.end, name: venue.entity.name, what }, "you", []));
  }
  const playlist = playlistNote(plan);
  const at = plan.pair?.playlistAt ?? [];
  const everywhere = at.length > 1;
  const items: HTMLElement[] = [];
  stops.forEach((s, i) => {
    const notes = playlist && !everywhere && at.includes(s.at) ? [playlist] : [];
    items.push(stopItem(s, s.at === "venue" ? "you" : "them", notes, s.at === "partner" && opts.partnerProposed === true));
    if (i < stops.length - 1 && s.walkMin) items.push(walkItem(s.walkMin));
  });
  const list = h("ol", { class: "stops" }, items);
  return playlist && everywhere ? h("div", null, list, h("p", { class: "stop-playlist" }, `${playlist.replace(/^Playlist here/, "Playlist at both places")}.`)) : list;
}

// What ties the picks together and the notes on the day. The link is left out where the lead already says it.
export function eveningNotes(plan: NightPlan, opts: { leadSaid?: string | null } = {}): HTMLElement | null {
  const link = plan.pair?.link?.trim() && !opts.leadSaid?.includes(plan.pair.link.trim()) ? plan.pair.link.trim() : null;
  const note = plan.day?.note?.trim() || null;
  if (!link && !note) return null;
  return h("div", null, link ? h("p", { class: "night-link" }, link) : null, note ? h("ul", { class: "night-notes" }, splitSentences(note).map((t) => h("li", null, t))) : null);
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
}

// The caption says the rule that chose the pick, never the bar: nearly every pick two neighbours share sits between
// 45 and 55, so the split is a tie, not a finding. The adaptation line stays out when the lead already says it.
function pickWhy(plan: NightPlan, venue: Venue, leadSaid: string | null | undefined): string {
  const f = plan.feature!;
  const m = planMatch(plan);
  const reason = plan.why.find((b) => b.text.includes(f.name) || b.text.includes(f.name.split(":")[0] ?? ""))?.text ?? "";
  const known = /better known than (\d+) in 100/.exec(reason)?.[1];
  const adapted = plan.pair?.link?.startsWith("The film is made from the book") && !leadSaid?.includes("made from the book");
  const share = m?.split ? `Both crowds share it about evenly, ${m.split.venue} to ${m.split.partner}, as nearly every pick two neighbours share does.` : "";
  if (adapted) return `Chosen because the film is made from it. ${share}`.trim();
  if (m?.split) return `${known ? `Better known than ${known} in 100 ${TYPE_PLURAL[f.type]}, so people come for it. ` : ""}${share}`.trim();
  if (f.venueSignal === false) return `Liked around ${shortName(venue.entity.name)}, with no rank for your crowd.`;
  const side = plan.limits.find((l) => /is the pick of|is one people around/.test(l));
  return side ?? `The pick of people who like ${plainName(venue.entity.name)}.`;
}

// The pick the night is built on, with the rule that chose it.
export function featurePick(plan: NightPlan, venue: Venue, opts: { leadSaid?: string | null } = {}): HTMLElement | null {
  const f = plan.feature;
  if (!f) return null;
  const m = planMatch(plan);
  const by = byLine(f);
  const why = pickWhy(plan, venue, opts.leadSaid);
  return h(
    "div",
    { class: "feature" },
    cover(f, { className: "feature-cover" }),
    h(
      "div",
      null,
      h("h3", null, m?.split ? "The pick both crowds share" : "The pick"),
      h("p", { class: "feature-name" }, displayTitle(f.name), by ? h("span", { class: "item-by" }, ` by ${by}`) : null),
      h("p", { class: "feature-why" }, why),
    ),
    m?.split ? splitBar(m.split, venue.entity.name, m.partner.name) : null,
  );
}

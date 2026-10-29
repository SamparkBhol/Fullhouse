import type { Night, NightPlan, Venue } from "../../../src/shared/contract.ts";
import { listWords, plainName } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { dayOnly, formatName, hours, longDate } from "../format.ts";
import { cover, hasImage } from "./cover.ts";
import { shortName } from "./split-bar.ts";

export interface FlyerOptions {
  live?: boolean;
  taped?: boolean;
  pinned?: boolean;
  justTaped?: boolean;
  compact?: boolean;
  headingLevel?: "h1" | "h2" | "h3";
}

// A long title is printed up to its subtitle, the way a bookshop window card would print it.
export function displayTitle(name: string): string {
  const cut = /^(.{4,}?)\s*[:(]/.exec(name);
  return name.length > 32 && cut?.[1] ? cut[1].trim() : name;
}

// The feature is a real Qloo pick, so it heads the flyer; a model headline can drift to one word like "Film".
function headline(plan: NightPlan): string {
  return (plan.feature?.name ? displayTitle(plan.feature.name) : "") || plan.copy?.posterHeadline?.trim() || plan.copy?.eventTitle || formatName(plan.format, plan.feature?.type);
}

// The band already prints the date, so a poster line that repeats it is left off.
function subLine(plan: NightPlan): string | null {
  const sub = plan.copy?.posterSub?.trim();
  if (!sub) return null;
  return sub.includes(longDate(plan.date)) || sub.includes(dayOnly(plan.date)) ? null : sub;
}

function lengthClass(text: string): string {
  const longestWord = Math.max(...text.split(/\s+/).map((w) => w.length));
  if (text.length > 42 || longestWord > 14) return "flyer-title flyer-title-s";
  if (text.length > 22 || longestWord > 10) return "flyer-title flyer-title-m";
  return "flyer-title";
}

// The feature's cover is printed beside the headline in the flyer's one ink, like a gig poster run off on a copier.
function flyerHead(plan: NightPlan, heading: HTMLElement): HTMLElement {
  const f = plan.feature;
  if (!f || !hasImage(f)) return heading;
  return h("div", { class: "flyer-head" }, heading, h("span", { class: "flyer-print" }, cover(f, { className: "flyer-art", eager: true })));
}

// A partner is named on the sheet only once it has said yes on its own invite page; until then the owner sees who is asked.
function withLine(plan: NightPlan | Night): string | null {
  const invites = "invites" in plan ? (plan.invites ?? []) : [];
  const named = (status: string): string[] => invites.filter((i) => i.status === status).map((i) => plainName(i.partner.name));
  const yes = named("accepted");
  if (yes.length) return `With ${listWords(yes)}`;
  const waiting = named("waiting");
  return waiting.length ? `Waiting for ${listWords(waiting)}` : null;
}

// The sheet says where the night happens: a night the partner hosts is at the partner, a shared one at both.
function placeOf(plan: NightPlan, venue: Venue): { name: string; address?: string } {
  const m = plan.match;
  if (m?.host === "partner") return { name: shortName(m.partner.name), ...(m.partner.address ? { address: m.partner.address } : {}) };
  if (m?.host === "both") return { name: `${shortName(venue.entity.name)} and ${shortName(m.partner.name)}` };
  return { name: venue.entity.name, ...(venue.entity.address ? { address: venue.entity.address } : {}) };
}

export function flyer(plan: NightPlan | Night, venue: Venue, opts: FlyerOptions = {}): HTMLElement {
  const at = placeOf(plan, venue);
  const title = headline(plan);
  const sub = subLine(plan);
  const Heading = opts.headingLevel ?? "h2";
  const partners = withLine(plan);
  const classes = ["flyer"];
  const taped = opts.live || opts.taped;
  if (taped) classes.push("flyer-taped");
  else if (opts.pinned) classes.push("flyer-pinned");
  if (opts.live) classes.push("flyer-live");
  if (opts.justTaped) classes.push("flyer-taped-now");
  if (opts.compact) classes.push("flyer-compact");
  return h(
    "article",
    { class: classes.join(" "), "aria-label": `Flyer for ${title}` },
    taped ? [h("span", { class: "tape tape-left", "aria-hidden": "true" }), h("span", { class: "tape tape-right", "aria-hidden": "true" })] : null,
    !taped && opts.pinned ? h("span", { class: "tape tape-mid", "aria-hidden": "true" }) : null,
    h("p", { class: "flyer-when" }, h("span", null, longDate(plan.date)), h("span", null, hours(plan.start, plan.end))),
    h("p", { class: "flyer-format" }, formatName(plan.format, plan.feature?.type)),
    flyerHead(plan, h(Heading, { class: lengthClass(title) }, title)),
    sub ? h("p", { class: "flyer-sub" }, sub) : null,
    !opts.compact && plan.copy?.eventDescription ? h("p", { class: "flyer-body" }, plan.copy.eventDescription) : null,
    !opts.compact && partners ? h("p", { class: "flyer-with" }, partners) : null,
    h(
      "p",
      { class: "flyer-where" },
      `At ${at.name}`,
      !opts.compact && at.address ? h("span", null, at.address) : null,
    ),
  );
}

export function fitHeadlines(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(".flyer-title")) {
    el.style.fontSize = "";
    let size = parseFloat(getComputedStyle(el).fontSize);
    let guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > 24 && guard < 24) {
      size -= 2;
      el.style.fontSize = `${size}px`;
      guard += 1;
    }
  }
}

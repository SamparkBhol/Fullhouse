import type { NightPlan, Venue } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { dayOnly, formatName, hours, longDate } from "../format.ts";

export interface FlyerOptions {
  live?: boolean;
  taped?: boolean;
  justTaped?: boolean;
  compact?: boolean;
  headingLevel?: "h1" | "h2" | "h3";
}

// The feature is a real Qloo pick, so it heads the flyer; a model headline can drift to one word like "Film".
function headline(plan: NightPlan): string {
  return plan.feature?.name || plan.copy?.posterHeadline?.trim() || plan.copy?.eventTitle || formatName(plan.format);
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

export function flyer(plan: NightPlan, venue: Venue, opts: FlyerOptions = {}): HTMLElement {
  const title = headline(plan);
  const sub = subLine(plan);
  const Heading = opts.headingLevel ?? "h2";
  const partners = (plan.partners ?? []).map((p) => p.name);
  const classes = ["flyer"];
  const taped = opts.live || opts.taped;
  if (taped) classes.push("flyer-taped");
  if (opts.live) classes.push("flyer-live");
  if (opts.justTaped) classes.push("flyer-taped-now");
  if (opts.compact) classes.push("flyer-compact");
  return h(
    "article",
    { class: classes.join(" "), "aria-label": `Flyer for ${title}` },
    taped ? [h("span", { class: "tape tape-left", "aria-hidden": "true" }), h("span", { class: "tape tape-right", "aria-hidden": "true" })] : null,
    h("p", { class: "flyer-when" }, h("span", null, longDate(plan.date)), h("span", null, hours(plan.start, plan.end))),
    h("p", { class: "flyer-format" }, formatName(plan.format)),
    h(Heading, { class: lengthClass(title) }, title),
    sub ? h("p", { class: "flyer-sub" }, sub) : null,
    !opts.compact && plan.copy?.eventDescription ? h("p", { class: "flyer-body" }, plan.copy.eventDescription) : null,
    !opts.compact && partners.length ? h("p", { class: "flyer-with" }, `With ${joinNames(partners)}`) : null,
    h(
      "p",
      { class: "flyer-where" },
      `At ${venue.entity.name}`,
      !opts.compact && venue.entity.address ? h("span", null, venue.entity.address) : null,
    ),
  );
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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

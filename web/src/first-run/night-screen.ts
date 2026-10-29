import type { NightPlan } from "../../../src/shared/contract.ts";
import { plainName, shortName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { dayOnly, longDate, nightKind, readDate } from "../format.ts";
import { planMatch } from "../joint.ts";
import { isCurrent, navigate, ticket } from "../router.ts";
import { evening, eveningNotes, featurePick } from "../ui/evening.ts";
import { linksPanel } from "../ui/ledger.ts";
import { serverProgress, type ServerStep } from "../ui/progress.ts";
import { credit, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { weekStrip, whyDay } from "../ui/week.ts";
import { nightTitle } from "./ask.ts";
import { limitsLine, screenHead } from "./crowd-screen.ts";
import { firstPath, planOf, rememberInvite, showPlan, type Run } from "./run.ts";
import { inviteNote, sendInvite } from "./share.ts";

const PICKING: ServerStep[] = [
  { label: "Asking what people who like both places love", call: /^insights_/ },
  { label: "Choosing the format from the two kinds of place and the picks both crowds share most evenly" },
  { label: "Writing the words and checking every name, which can take half a minute" },
];

async function ask(run: Run, plan: NightPlan, button: HTMLButtonElement, slot: HTMLElement): Promise<void> {
  const m = planMatch(plan);
  if (!m) return;
  button.disabled = true;
  replace(slot, loading(`Making the invite for ${shortName(m.partner.name)}`));
  try {
    const invite = await api.invite(run.ctx.id, run.ctx.token, plan.id, m.partner.id);
    rememberInvite(run.ctx.id, invite);
    await sendInvite(invite, inviteNote(invite, run.ctx.state.venue.entity.name, nightTitle(plan)));
    navigate(firstPath(run.ctx.id, "ask"));
  } catch (err) {
    button.disabled = false;
    replace(slot, failure(err, () => void ask(run, plan, button, slot)));
  }
}

export function nightHeading(plan: NightPlan): string {
  return `${nightKind(plan)}, ${longDate(plan.date)}.`;
}

function draw(run: Run, main: HTMLElement, plan: NightPlan, others: NightPlan[]): void {
  const venue = run.ctx.state.venue;
  const name = plainName(venue.entity.name);
  const m = planMatch(plan);
  showPlan(run, plan, others);
  const status = h("div", { "aria-live": "polite" });
  const card = h("section", { class: "panel", "aria-labelledby": "evening-title" });
  const week = weekStrip(plan, venue, (weekday) => {
    for (const input of week.querySelectorAll("input")) input.disabled = true;
    replace(status, loading("Planning that evening instead"));
    planOf(run, { weekday })
      .then((r) => draw(run, main, r.plan, r.alternatives))
      .catch((err: unknown) => replace(status, failure(err, () => draw(run, main, plan, others))));
  });
  const primary = m
    ? h("button", { class: "btn", type: "button" }, `Ask ${shortName(m.partner.name)}`)
    : h("a", { class: "btn", href: `/v/${encodeURIComponent(run.ctx.id)}/night/${encodeURIComponent(plan.id)}/approve` }, "Review and publish");
  if (primary instanceof HTMLButtonElement) primary.addEventListener("click", () => void ask(run, plan, primary, status));
  const next = others[0];
  const another = next
    ? h("button", { class: "btn btn-quiet", type: "button", onclick: () => draw(run, main, next, [...others.slice(1), plan]) }, "Another idea")
    : h("button", { class: "btn btn-quiet", type: "button", disabled: true }, "No other idea for this pair");
  replace(
    card,
    h("h2", { id: "evening-title" }, "The evening"),
    evening(plan, venue),
    eveningNotes(plan, { leadSaid: plan.pair?.why ?? null }),
    featurePick(plan, venue, { leadSaid: plan.pair?.why ?? null }),
    h("p", { class: "actions" }, primary, another),
    status,
  );
  credit(`Taste data from Qloo, read ${readDate(plan.readAt, venue.tz)}. Plan by Full House.`);
  replace(
    main,
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "wrap" },
        screenHead(nightHeading(plan), plan.pair?.why ?? plan.why[0]?.text ?? null, h("p", { class: "small" }, h("a", { href: `/v/${encodeURIComponent(run.ctx.id)}/night/${encodeURIComponent(plan.id)}` }, "Every detail of this plan and where it came from"))),
        h(
          "div",
          { class: "screen-grid" },
          card,
          h(
            "div",
            null,
            h("section", { class: "panel", "aria-labelledby": "why-day" }, h("h2", { id: "why-day" }, `Why ${dayOnly(plan.date)}`), h("p", null, whyDay(plan, venue)), week),
            linksPanel(plan),
          ),
        ),
        limitsLine(name),
      ),
    ),
  );
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
}

export async function nightScreen(run: Run, main: HTMLElement): Promise<void> {
  title("The night");
  const steps = serverProgress("Planning the night", PICKING, () => api.progress(run.ctx.id, run.ctx.token));
  const frame = (...children: (HTMLElement | null)[]) => replace(main, h("div", { class: "screen" }, h("div", { class: "wrap" }, ...children)));
  frame(screenHead("The night", "Two stops, one at each place, built on what both crowds love."), h("section", { class: "panel screen-one" }, steps.el));
  const at = ticket();
  try {
    const r = await planOf(run);
    steps.finish();
    if (!isCurrent(at)) return;
    title(nightHeading(r.plan));
    draw(run, main, r.plan, r.alternatives);
  } catch (err) {
    if (!isCurrent(at)) return;
    frame(screenHead("The night", null), failure(err, () => void nightScreen(run, main)));
  }
}

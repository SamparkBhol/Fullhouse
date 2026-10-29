import type { NightPlan } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { shortName } from "../ui/split-bar.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { planMatch } from "../joint.ts";
import { isCurrent, navigate, ticket } from "../router.ts";
import { fitHeadlines } from "../ui/flyer.ts";
import { title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { nightTitle } from "./ask.ts";
import { limitsLine } from "./crowd-screen.ts";
import { dayChips, nightCard } from "./night-view.ts";
import { firstPath, planOf, rememberInvite, showPlan, type Run } from "./run.ts";
import { inviteNote, sendInvite } from "./share.ts";

const PICKING = [
  "Asking Qloo what people who like both places love",
  "Choosing the pick the two crowds share most evenly",
  "Writing the words and checking every name, which can take half a minute",
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

function draw(run: Run, main: HTMLElement, plan: NightPlan, others: NightPlan[]): void {
  const venue = run.ctx.state.venue;
  const name = plainName(venue.entity.name);
  const m = planMatch(plan);
  showPlan(run, plan, others);
  const status = h("div", { "aria-live": "polite" });
  const card = h("div", { class: "night-slot", "aria-live": "polite" });
  const chips = dayChips(plan, (weekday) => {
    replace(card, loading("Planning that day instead", PICKING));
    for (const input of chips.querySelectorAll("input")) input.disabled = true;
    planOf(run, { weekday })
      .then((r) => draw(run, main, r.plan, r.alternatives))
      .catch((err: unknown) => {
        replace(card, failure(err, () => draw(run, main, plan, others)));
      });
  });
  const primary = m
    ? h("button", { class: "button button-big button-lamp", type: "button" }, `Ask ${shortName(m.partner.name)}`)
    : h("a", { class: "button button-big button-lamp", href: `/v/${encodeURIComponent(run.ctx.id)}/night/${encodeURIComponent(plan.id)}/approve` }, "Review and publish");
  if (primary instanceof HTMLButtonElement) primary.addEventListener("click", () => void ask(run, plan, primary, status));
  const another = others[0]
    ? h("button", { class: "link-button", type: "button", onclick: () => draw(run, main, others[0] as NightPlan, [...others.slice(1), plan]) }, "Another idea")
    : null;
  const heading = h("h1", { class: "first-line", tabindex: "-1" }, m?.split ? "The night both crowds want" : "Your crowd's night");
  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide first night-first" },
      heading,
      card,
    ),
  );
  replace(
    card,
    nightCard(
      plan,
      venue,
      chips,
      h("p", { class: "actions first-next" }, primary),
      status,
      h(
        "p",
        { class: "first-quiet" },
        another,
        h("a", { href: `/v/${encodeURIComponent(run.ctx.id)}/night/${encodeURIComponent(plan.id)}` }, "Every detail and where it came from"),
      ),
      limitsLine(name),
    ),
  );
  fitHeadlines(main);
  heading.focus({ preventScroll: true });
}

export async function nightScreen(run: Run, main: HTMLElement): Promise<void> {
  title("The night both crowds want");
  replace(main, h("div", { class: "wrap first" }, h("h1", { class: "first-line" }, "The night both crowds want"), loading("Picking the night", PICKING)));
  const at = ticket();
  try {
    const r = await planOf(run);
    if (!isCurrent(at)) return;
    draw(run, main, r.plan, r.alternatives);
  } catch (err) {
    if (!isCurrent(at)) return;
    replace(main, h("div", { class: "wrap first" }, h("h1", { class: "first-line" }, "The night both crowds want"), failure(err, () => void nightScreen(run, main))));
  }
}

import type { NightPlan } from "../../../src/shared/contract.ts";
import { h, replace } from "../dom.ts";
import { formatName, longDate } from "../format.ts";
import { navigate } from "../router.ts";
import { fitHeadlines, flyer } from "../ui/flyer.ts";
import { nightEvidence } from "../ui/night-evidence.ts";
import { refineBox } from "../ui/refine.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { planGroup, withVenue, type VenueCtx } from "../venue-context.ts";

export function nightPage(id: string, planId: string): Promise<void> {
  return withVenue(
    id,
    "nights",
    (ctx, main) => {
      if (ctx.state.nights.some((n) => n.id === planId)) {
        navigate(`/v/${encodeURIComponent(id)}/nights/${encodeURIComponent(planId)}`, { replace: true });
        return;
      }
      const group = planGroup(ctx.state, planId);
      if (group.plan) renderPlan(ctx, main, group.plan, group.alternatives);
      else renderGone(id, main);
    },
    { fresh: true },
  );
}

function renderGone(id: string, main: HTMLElement): void {
  title("Plan not found");
  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "This plan is gone"),
      h("p", null, "It may have been replaced by a newer plan or by your Monday read."),
      h("p", null, h("a", { class: "button", href: `/v/${encodeURIComponent(id)}` }, "Back to your nights")),
    ),
  );
  focusHeading();
}

function switcher(plans: NightPlan[], onPick: (p: NightPlan) => void): HTMLElement | null {
  if (plans.length < 2) return null;
  const group = h("div", { class: "options", role: "group", "aria-label": "Choose between plans" });
  for (const [i, p] of plans.entries()) {
    const button = h("button", { type: "button", class: "option", "aria-pressed": i === 0 ? "true" : "false" }, formatName(p.format), p.feature ? h("span", null, p.feature.name) : null);
    button.addEventListener("click", () => {
      for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      onPick(p);
    });
    group.append(button);
  }
  return group;
}

function renderPlan(ctx: VenueCtx, main: HTMLElement, plan: NightPlan, alternatives: NightPlan[]): void {
  const venue = ctx.state.venue;
  const calls = ctx.state.read?.provenance ?? [];
  const all = [plan, ...alternatives];
  title(`${formatName(plan.format)}, ${longDate(plan.date)}`);
  const windowCol = h("div", { class: "night-window" });
  const evidenceCol = h("div", { class: "night-side" });

  const draw = (selected: NightPlan): void => {
    const approveHref = `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(selected.id)}/approve`;
    const toRefine = (): void => {
      const box = evidenceCol.querySelector<HTMLTextAreaElement>(".refine textarea");
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
    };
    replace(
      windowCol,
      flyer(selected, venue, { headingLevel: "h2" }),
      h("p", { class: "draft-note" }, "Draft. Nobody sees this until you publish it."),
      h(
        "p",
        { class: "actions" },
        h("a", { class: "button button-big", href: approveHref }, "Review and publish"),
        h("button", { class: "button button-quiet button-big", type: "button", onclick: toRefine }, "Change it"),
      ),
    );
    replace(evidenceCol, nightEvidence(selected, calls, venue.tz), refineBox(ctx, selected));
    fitHeadlines(windowCol);
  };

  const options = switcher(all, draw);
  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide" },
      h("h1", { class: "page-title" }, `A night for ${longDate(plan.date)}`),
      options ? h("p", { class: "meta" }, `${all.length} plans for this night. Tap one to see it.`) : null,
      options,
      h("div", { class: "split split-night" }, windowCol, evidenceCol),
    ),
  );
  draw(plan);
  focusHeading();
}

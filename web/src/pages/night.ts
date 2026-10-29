import type { NightPlan } from "../../../src/shared/contract.ts";
import { h, replace } from "../dom.ts";
import { formatName, longDate } from "../format.ts";
import { navigate } from "../router.ts";
import { fitHeadlines, flyer } from "../ui/flyer.ts";
import { bigWindow, featureSay } from "../ui/night-room.ts";
import { nightReceipts } from "../ui/night-receipts.ts";
import { asItWillRead, onTheCounter, onTheSpeakers, walkingOver } from "../ui/night-windows.ts";
import { refineBox } from "../ui/refine.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { ledgeRow } from "../ui/ledge.ts";
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

// Publishing is the one thing that turns the window light on, so its button is the one in lamp light.
function publishBar(approveHref: string, refine: HTMLElement, another: HTMLElement | null): HTMLElement {
  const change = h("button", { class: "button button-quiet button-big", type: "button", "aria-expanded": "false" }, "Change it");
  change.addEventListener("click", () => {
    const open = refine.hidden;
    refine.hidden = !open;
    change.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const box = refine.querySelector<HTMLTextAreaElement>("textarea");
    box?.scrollIntoView({ block: "center" });
    box?.focus({ preventScroll: true });
  });
  return h(
    "div",
    { class: "publish-bar" },
    h("a", { class: "button button-big button-lamp", href: approveHref }, "Review and publish"),
    change,
    another,
    h("p", { class: "publish-note" }, "The next screen lists everything that goes out: the event page, the poster, the calendar and the notes to partners. You tick what you want."),
  );
}

function renderPlan(ctx: VenueCtx, main: HTMLElement, plan: NightPlan, alternatives: NightPlan[]): void {
  const venue = ctx.state.venue;
  const read = ctx.state.read;
  const calls = read?.provenance ?? [];
  const name = venue.entity.name;
  title(`${formatName(plan.format, plan.feature?.type)}, ${longDate(plan.date)}`);
  const stage = h("div", { class: "night-stage" });

  const draw = (selected: NightPlan, others: NightPlan[]): void => {
    const next = others[0];
    const another = next ? h("button", { class: "link-button publish-another", type: "button", onclick: () => draw(next, [...others.slice(1), selected]) }, "Another idea") : null;
    const approveHref = `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(selected.id)}/approve`;
    const refine = h("div", { class: "refine-slot", hidden: true }, refineBox(ctx, selected));
    replace(
      stage,
      bigWindow({
        lettering: "Draft. Only you can see it.",
        flyer: flyer(selected, venue, { pinned: true, compact: true, headingLevel: "h2" }),
        side: featureSay(selected, name),
      }),
      ledgeRow("The rest of the night", walkingOver(selected, name), onTheCounter(selected, name), onTheSpeakers(selected)),
      h("div", { class: "night-foot" }, asItWillRead(selected), publishBar(approveHref, refine, another)),
      refine,
      nightReceipts(selected, name, calls, venue.tz),
    );
    fitHeadlines(stage);
  };

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide night-page" },
      h("h1", { class: "page-title" }, `A night for ${longDate(plan.date)}`),
      stage,
    ),
  );
  draw(plan, alternatives);
  focusHeading();
}

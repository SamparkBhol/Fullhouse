import type { NightPlan } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import { dayOnly, readDate } from "../format.ts";
import { navigate } from "../router.ts";
import { evening, eveningNotes, featurePick } from "../ui/evening.ts";
import { linksPanel } from "../ui/ledger.ts";
import { nightSources } from "../ui/night-sources.ts";
import { menuPanel, nearbyPanel, playlistPanel, wordsPanel } from "../ui/plan-parts.ts";
import { refineBox } from "../ui/refine.ts";
import { credit, focusHeading, title } from "../ui/shell.ts";
import { weekStrip, whyDay } from "../ui/week.ts";
import { planGroup, withVenue, type VenueCtx } from "../venue-context.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { nightHeading } from "../first-run/night-screen.ts";

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
      { class: "screen" },
      h("div", { class: "wrap" }, screenHead("This plan is gone", "A newer plan or your Monday read replaced it."), h("p", { class: "actions" }, h("a", { class: "btn", href: `/v/${encodeURIComponent(id)}` }, "Back to your nights"))),
    ),
  );
  focusHeading();
}

function renderPlan(ctx: VenueCtx, main: HTMLElement, first: NightPlan, alternatives: NightPlan[]): void {
  const venue = ctx.state.venue;
  const name = plainName(venue.entity.name);
  const calls = ctx.state.read?.provenance ?? [];
  credit(`Taste data from Qloo. Plan by Full House.`);
  const draw = (plan: NightPlan, others: NightPlan[]): void => {
    title(nightHeading(plan).replace(/\.$/, ""));
    credit(`Taste data from Qloo, read ${readDate(plan.readAt, venue.tz)}. Plan by Full House.`);
    const refine = h("div", { hidden: true }, refineBox(ctx, plan));
    const change = h("button", { class: "btn btn-quiet", type: "button", "aria-expanded": "false" }, "Change it");
    change.addEventListener("click", () => {
      const open = refine.hidden;
      refine.hidden = !open;
      change.setAttribute("aria-expanded", String(open));
      if (!open) return;
      const box = refine.querySelector<HTMLTextAreaElement>("textarea");
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
    });
    const next = others[0];
    const another = next ? h("button", { class: "btn btn-quiet", type: "button", onclick: () => draw(next, [...others.slice(1), plan]) }, "Another idea") : h("button", { class: "btn btn-quiet", type: "button", disabled: true }, "No other idea for this pair");
    const approve = `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(plan.id)}/approve`;
    replace(
      main,
      h(
        "div",
        { class: "screen" },
        h(
          "div",
          { class: "wrap" },
          screenHead(nightHeading(plan), plan.pair?.why ?? plan.why[0]?.text ?? null, h("p", { class: "small" }, "Draft. Nobody sees it until you publish it.")),
          h(
            "div",
            { class: "screen-grid" },
            h(
              "div",
              { class: "stack" },
              h(
                "section",
                { class: "panel", "aria-labelledby": "evening-title" },
                h("h2", { id: "evening-title" }, "The evening"),
                evening(plan, venue),
                eveningNotes(plan, { leadSaid: plan.pair?.why ?? null }),
                featurePick(plan, venue, { leadSaid: plan.pair?.why ?? null }),
                h("p", { class: "actions" }, h("a", { class: "btn", href: approve }, "Review and publish"), change, another),
                h("p", { class: "small" }, "The next screen lists everything that goes out, and you tick what you want."),
              ),
              refine,
              wordsPanel(plan),
            ),
            h(
              "div",
              { class: "stack" },
              h("section", { class: "panel", "aria-labelledby": "why-day" }, h("h2", { id: "why-day" }, `Why ${dayOnly(plan.date)}`), h("p", null, whyDay(plan, venue)), weekStrip(plan, venue, null)),
              linksPanel(plan),
              nearbyPanel(plan, venue.entity.name),
              menuPanel(plan),
              playlistPanel(plan),
            ),
          ),
          nightSources(plan, name, calls, venue.tz),
        ),
      ),
    );
    focusHeading();
  };
  draw(first, alternatives);
}

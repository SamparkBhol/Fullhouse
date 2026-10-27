import type { NightPlan, Provenance } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { distance, formatName, longDate, prettyTag, walk } from "../format.ts";
import { navigate } from "../router.ts";
import { fitHeadlines, flyer } from "../ui/flyer.ts";
import { openReceipt, reasons } from "../ui/receipt.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { empty, failure, limitsLine, loading } from "../ui/states.ts";
import { planGroup, refreshState, rememberPlanResponse, withVenue, type VenueCtx } from "../venue-context.ts";

export const LICENCE_NOTE =
  "A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service.";

const REFINE_EXAMPLES = ["Make it Friday", "No live music", "Under 40 people", "Start at 20:00", "Something with films instead"];

export function nightPage(id: string, planId: string): Promise<void> {
  return withVenue(
    id,
    "nights",
    (ctx, main) => {
      const night = ctx.state.nights.find((n) => n.id === planId);
      if (night) {
        navigate(`/v/${encodeURIComponent(id)}/nights/${encodeURIComponent(planId)}`, { replace: true });
        return;
      }
      const group = planGroup(ctx.state, planId);
      if (!group.plan) {
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
        return;
      }
      renderPlan(ctx, main, group.plan, group.alternatives);
    },
    { fresh: true },
  );
}

function evidence(ctx: VenueCtx, plan: NightPlan): HTMLElement {
  const tz = ctx.state.venue.tz;
  const calls: Provenance[] = ctx.state.read?.provenance ?? [];
  const parts: HTMLElement[] = [];

  parts.push(
    h(
      "section",
      { class: "block", "aria-labelledby": "why-title" },
      h("h2", { id: "why-title" }, "Why this night"),
      plan.feature
        ? h(
            "div",
            { class: "pick" },
            h("p", { class: "pick-name" }, plan.feature.name),
            h("p", { class: "meta" }, `The feature of the night, picked from what the street leans toward.`),
            reasons(plan.feature.because, calls, tz),
          )
        : h("p", null, "This night has no single feature. It is built around the street's taste tags below."),
      plan.why.length ? h("div", { class: "pick" }, h("p", { class: "pick-name" }, "The night as a whole"), reasons(plan.why, calls, tz)) : null,
    ),
  );

  parts.push(
    h(
      "section",
      { class: "block", "aria-labelledby": "theme-title" },
      h("h2", { id: "theme-title" }, "Theme"),
      plan.themeTags.length
        ? h("p", { class: "theme" }, plan.themeTags.map((t) => prettyTag(t.name)).join(", "))
        : h("p", { class: "meta" }, "No theme tags came with this plan."),
    ),
  );

  parts.push(
    h(
      "section",
      { class: "block", "aria-labelledby": "partners-title" },
      h("h2", { id: "partners-title" }, "Partners nearby"),
      plan.partners.length
        ? h(
            "ul",
            { class: "picks" },
            plan.partners.map((p) =>
              h(
                "li",
                { class: "pick" },
                h("div", { class: "pick-head" }, h("p", { class: "pick-name" }, p.name), h("p", { class: "pick-dist" }, distance(p.distanceM))),
                h("p", { class: "meta" }, [p.address, walk(p.distanceM)].filter(Boolean).join(", ")),
                reasons(p.because, calls, tz),
              ),
            ),
          )
        : empty("No loved place nearby shares this night's theme, so the plan has no partners."),
    ),
  );

  parts.push(
    h(
      "section",
      { class: "block", "aria-labelledby": "menu-title" },
      h("h2", { id: "menu-title" }, "Menu ideas"),
      plan.menuIdeas.length
        ? h("ul", { class: "picks" }, plan.menuIdeas.map((m) => h("li", { class: "pick" }, h("p", { class: "pick-name" }, m.text), reasons(m.because, calls, tz))))
        : empty("The street's tags gave no menu ideas for this night."),
    ),
  );

  parts.push(
    h(
      "section",
      { class: "block", "aria-labelledby": "playlist-title" },
      h("h2", { id: "playlist-title" }, "Playlist"),
      plan.playlist.length
        ? h("ol", { class: "playlist" }, plan.playlist.map((a) => h("li", null, a.name)))
        : h("p", { class: "meta" }, "Qloo returned no artists for this street, so there is no playlist."),
      h("p", { class: "note" }, LICENCE_NOTE),
    ),
  );

  const unverified = plan.checks?.unverified ?? [];
  parts.push(
    h(
      "section",
      { class: "block", "aria-labelledby": "copy-title" },
      h("h2", { id: "copy-title" }, "The words"),
      h("p", { class: "written-by" }, plan.copy.writtenBy === "model" ? "Copy written by the model" : "Copy from template"),
      h(
        "p",
        { class: plan.checks?.claimsVerified ? "claim claim-ok" : "claim claim-held" },
        plan.checks?.claimsVerified
          ? "Claim check passed: every name in the copy is in the Qloo brief."
          : unverified.length
            ? `Claim check held back names that are not in the Qloo brief: ${unverified.join(", ")}. Template copy is used where they appeared.`
            : "Claim check did not pass, so the template copy is used.",
      ),
      h("h3", null, "Social post"),
      h("p", { class: "quote" }, plan.copy.social),
      h(
        "details",
        { class: "pitch" },
        h("summary", null, "Note to partners"),
        h("p", { class: "quote" }, h("strong", null, plan.copy.partnerPitch.subject)),
        h("p", { class: "quote pre" }, plan.copy.partnerPitch.body),
      ),
    ),
  );

  const limits = limitsLine(plan.limits);
  if (limits) parts.push(limits);
  if (calls.length) {
    parts.push(
      h(
        "p",
        { class: "actions" },
        h("button", { class: "button button-quiet", type: "button", onclick: () => openReceipt(calls, null, { tz }) }, `All ${calls.length} Qloo calls behind this plan`),
      ),
    );
  }
  return h("div", { class: "night-evidence" }, parts);
}

function refineBox(ctx: VenueCtx, plan: NightPlan): HTMLElement {
  const area = h("textarea", { id: uid("refine"), rows: "3", maxlength: "300", placeholder: "Make it Friday, no live music, under 40 people" });
  const slot = h("div", { "aria-live": "polite" });
  const examples = h(
    "div",
    { class: "examples" },
    REFINE_EXAMPLES.map((ex) =>
      h(
        "button",
        {
          type: "button",
          class: "chip",
          onclick: () => {
            area.value = area.value.trim() ? `${area.value.trim()}, ${ex.toLowerCase()}` : ex;
            area.focus();
          },
        },
        ex,
      ),
    ),
  );
  const form = h(
    "form",
    { class: "form refine" },
    h("label", { for: area.id }, "What should change?"),
    h("p", { class: "hint" }, "Say it in your own words, or tap an example."),
    examples,
    area,
    h("p", { class: "actions" }, h("button", { class: "button", type: "submit" }, "Change the plan")),
    slot,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const request = area.value.trim();
    if (!request) {
      replace(slot, h("p", { class: "form-error", role: "alert" }, "Type what should change first."));
      area.focus();
      return;
    }
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    replace(slot, loading("Changing the plan", ["Reading your request", "Planning again from the same street read"]));
    try {
      const response = await api.refine(ctx.id, ctx.token, plan.id, request);
      rememberPlanResponse(response);
      await refreshState(ctx).catch(() => undefined);
      navigate(`/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(response.plan.id)}`, { replace: true });
    } catch (err) {
      if (button) button.disabled = false;
      replace(slot, failure(err, () => form.requestSubmit()));
    }
  });
  return h("section", { class: "block", "aria-labelledby": "refine-title" }, h("h2", { id: "refine-title" }, "Change it"), form);
}

function renderPlan(ctx: VenueCtx, main: HTMLElement, plan: NightPlan, alternatives: NightPlan[]): void {
  const venue = ctx.state.venue;
  const all = [plan, ...alternatives];
  let selected = plan;
  title(`${formatName(plan.format)}, ${longDate(plan.date)}`);

  const windowCol = h("div", { class: "night-window" });
  const evidenceCol = h("div", { class: "night-side" });
  const switcher =
    all.length > 1
      ? h(
          "div",
          { class: "options", role: "group", "aria-label": "Choose between plans" },
          all.map((p, i) =>
            h(
              "button",
              {
                type: "button",
                class: "option",
                "aria-pressed": i === 0 ? "true" : "false",
                onclick: (event: Event) => {
                  selected = p;
                  for (const b of switcher?.querySelectorAll("button") ?? []) b.setAttribute("aria-pressed", "false");
                  (event.currentTarget as HTMLElement).setAttribute("aria-pressed", "true");
                  draw();
                },
              },
              formatName(p.format),
            ),
          ),
        )
      : null;

  const draw = (): void => {
    const approveHref = `/v/${encodeURIComponent(ctx.id)}/night/${encodeURIComponent(selected.id)}/approve`;
    replace(
      windowCol,
      flyer(selected, venue, { headingLevel: "h2" }),
      h("p", { class: "draft-note" }, "Draft. Nobody sees this until you publish it."),
      h(
        "p",
        { class: "actions" },
        h("a", { class: "button button-big", href: approveHref }, "Review and publish"),
        h(
          "button",
          {
            class: "button button-quiet button-big",
            type: "button",
            onclick: () => {
              const box = evidenceCol.querySelector<HTMLTextAreaElement>(".refine textarea");
              box?.scrollIntoView({ block: "center" });
              box?.focus({ preventScroll: true });
            },
          },
          "Change it",
        ),
      ),
    );
    replace(evidenceCol, evidence(ctx, selected), refineBox(ctx, selected));
    fitHeadlines(windowCol);
  };

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide" },
      h("h1", { class: "page-title" }, `A night for ${longDate(plan.date)}`),
      switcher ? h("p", { class: "meta" }, `${all.length} plans for this night. Tap one to see it.`) : null,
      switcher,
      h("div", { class: "split split-night" }, windowCol, evidenceCol),
    ),
  );
  draw();
  focusHeading();
}

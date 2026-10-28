import type { NightPlan } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { navigate } from "../router.ts";
import { failure, loading } from "./states.ts";
import { refreshState, rememberPlanResponse, type VenueCtx } from "../venue-context.ts";

const EXAMPLES = ["Make it Friday", "No live music", "Under 40 people", "Start at 20:00", "Something with films instead"];

function exampleChips(area: HTMLTextAreaElement): HTMLElement {
  return h(
    "div",
    { class: "examples" },
    EXAMPLES.map((ex) =>
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
}

export function refineBox(ctx: VenueCtx, plan: NightPlan): HTMLElement {
  const area = h("textarea", { id: uid("refine"), rows: "3", maxlength: "300", placeholder: "Make it Friday, no live music, under 40 people" });
  const slot = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form refine" },
    h("label", { for: area.id }, "What should change?"),
    h("p", { class: "hint" }, "Say it in your own words, or tap an example."),
    exampleChips(area),
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
    replace(slot, loading("Changing the plan", ["Reading your request", "Planning again from the same street read", "Writing the copy and checking every name"]));
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

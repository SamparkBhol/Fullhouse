import type { NightPlan } from "../../../src/shared/contract.ts";
import { weekdayName } from "../../../src/shared/words.ts";
import { weekdayOf } from "./week.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { navigate } from "../router.ts";
import { failure, loading } from "./states.ts";
import { refreshState, rememberPlanResponse, type VenueCtx } from "../venue-context.ts";

// Requests the owner could make of this plan: the next evening, no live music, an hour later, another kind of night.
function examples(plan: NightPlan): string[] {
  const day = weekdayName((weekdayOf(plan.date) + 1) % 7);
  const at = /^(\d{2}):(\d{2})$/.exec(plan.start);
  const later = at ? { h: Number(at[1]), m: at[2] } : null;
  return [
    `Make it ${day}`,
    "No live music",
    later && later.h < 22 ? `Start at ${String(later.h + 1).padStart(2, "0")}:${later.m}` : null,
    plan.format === "film" ? "Something with books instead" : "Something with films instead",
  ].filter((x): x is string => Boolean(x));
}

function exampleChips(area: HTMLTextAreaElement, list: string[]): HTMLElement {
  return h(
    "div",
    { class: "examples" },
    list.map((ex) =>
      h(
        "button",
        {
          type: "button",
          class: "chip-btn",
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
  const list = examples(plan);
  const area = h("textarea", { id: uid("refine"), rows: "3", maxlength: "300", placeholder: list.slice(0, 3).join(", ").replace(/, (\w)/g, (_, c: string) => `, ${c.toLowerCase()}`) });
  const slot = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form refine" },
    h("div", { class: "field-row" }, h("label", { for: area.id }, "What should change?"), h("p", { class: "hint" }, "Say it in your own words, or tap an example."), exampleChips(area, list), area),
    h("p", { class: "actions actions-tight" }, h("button", { class: "btn", type: "submit" }, "Change the plan")),
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
    replace(slot, loading("Changing the plan", ["Reading your request", "Planning again from the same street read", "Writing the words and checking every name, which can take half a minute"]));
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
  return h("section", { class: "panel", "aria-label": "Change the plan" }, form);
}

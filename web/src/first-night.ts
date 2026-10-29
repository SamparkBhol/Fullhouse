import { weekdayName } from "../../src/shared/words.ts";
import { api } from "./api.ts";
import { replace } from "./dom.ts";
import { navigate } from "./router.ts";
import { failure, loading } from "./ui/states.ts";
import { rememberPlanResponse } from "./venue-context.ts";

export const READ_LINES = [
  "Places nearby that your crowd also loves",
  "The books, shows, artists, podcasts and films they love",
  "Where on the street your crowd gathers",
];

// One press from a new venue to its first flyer: read the street, plan the quiet night, open the plan.
// A caller that is still showing something the owner needs, such as the owner link, opens the plan itself.
export async function readThenPlan(id: string, token: string, weekday: number, slot: HTMLElement, needsRead: boolean, onFail: () => void, onReady?: (href: string) => void): Promise<void> {
  try {
    if (needsRead) {
      replace(slot, loading("Reading your street", READ_LINES));
      await api.read(id, token);
    }
    replace(
      slot,
      loading(`Planning ${weekdayName(weekday)}`, [
        "Scoring what your audience loves against your venue",
        "Choosing partners within walking distance that are open that night",
        "Writing the words and checking every name, which can take half a minute",
      ]),
    );
    const response = await api.plan(id, token, {});
    rememberPlanResponse(response);
    const href = `/v/${encodeURIComponent(id)}/night/${encodeURIComponent(response.plan.id)}`;
    if (onReady) onReady(href);
    else navigate(href);
  } catch (err) {
    onFail();
    replace(slot, failure(err, () => void readThenPlan(id, token, weekday, slot, needsRead, onFail, onReady)));
  }
}

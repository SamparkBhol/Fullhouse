import { weekdayName } from "../../src/shared/words.ts";
import { api } from "./api.ts";
import { replace } from "./dom.ts";
import { navigate } from "./router.ts";
import { failure, loading } from "./ui/states.ts";
import { rememberPlanResponse } from "./venue-context.ts";

export const READ_LINES = [
  "What the street around you likes",
  "Your venue's own taste profile on Qloo",
  "Places nearby that your audience loves, and what they offer that you do not",
  "Where on the map that taste is strongest",
  "Artists, books, films, shows and podcasts your audience loves",
];

// One press from a new venue to its first flyer: read the street, plan the quiet night, open the plan.
export async function readThenPlan(id: string, token: string, weekday: number, slot: HTMLElement, needsRead: boolean, onFail: () => void): Promise<void> {
  try {
    if (needsRead) {
      replace(slot, loading("Reading the street, 12 Qloo calls", READ_LINES));
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
    navigate(`/v/${encodeURIComponent(id)}/night/${encodeURIComponent(response.plan.id)}`);
  } catch (err) {
    onFail();
    replace(slot, failure(err, () => void readThenPlan(id, token, weekday, slot, needsRead, onFail)));
  }
}

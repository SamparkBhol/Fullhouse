import { h, replace } from "../dom.ts";
import { askScreen } from "../first-run/ask.ts";
import { crowdScreen } from "../first-run/crowd-screen.ts";
import { matchScreen } from "../first-run/match-screen.ts";
import { nightScreen } from "../first-run/night-screen.ts";
import { firstPath, rememberedInvite, runFor } from "../first-run/run.ts";
import { api } from "../api.ts";
import { navigate } from "../router.ts";
import { runFascia, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { planGroup, withVenue, type VenueCtx } from "../venue-context.ts";

export type Step = "crowd" | "match" | "night" | "ask";

async function openAsk(ctx: VenueCtx, main: HTMLElement): Promise<void> {
  title("Waiting for an answer");
  replace(main, h("div", { class: "wrap" }, loading("Opening your invite")));
  try {
    const held = rememberedInvite(ctx.id);
    const all = await api.invites(ctx.id, ctx.token);
    const invite = all.find((i) => i.id === held?.id) ?? [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!invite) {
      navigate(firstPath(ctx.id, "night"), { replace: true });
      return;
    }
    const plan = planGroup(ctx.state, invite.planId).plan;
    askScreen(ctx, main, invite, plan);
  } catch (err) {
    replace(main, h("div", { class: "wrap" }, h("h1", { class: "sr-only" }, "Your invite"), failure(err, () => void openAsk(ctx, main))));
  }
}

export function firstRunPage(id: string, step: Step): Promise<void> {
  return withVenue(
    id,
    null,
    async (ctx, main) => {
      runFascia(ctx.state.venue);
      const run = runFor(ctx);
      if (step === "ask") return openAsk(ctx, main);
      if (step === "match") return matchScreen(run, main);
      if (step === "night") return nightScreen(run, main);
      return crowdScreen(run, main);
    },
    { fresh: step === "ask" },
  );
}

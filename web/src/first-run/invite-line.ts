import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import type { VenueCtx } from "../venue-context.ts";
import { shortName } from "../../../src/shared/words.ts";
import { firstPath, rememberInvite } from "./run.ts";

// An invite still open, or answered yes for a night not yet out, is one line on venue home with the way back to it.
export function inviteLine(ctx: VenueCtx): HTMLElement {
  const slot = h("div", { class: "notice invite-line", "aria-live": "polite", hidden: true });
  const out = new Set(ctx.state.nights.map((n) => n.id));
  void api
    .invites(ctx.id, ctx.token)
    .then((all) => {
      const open = all.filter((i) => !out.has(i.planId) && i.status !== "declined").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!open || !slot.isConnected) return;
      rememberInvite(ctx.id, open);
      const them = shortName(open.partner.name);
      replace(
        slot,
        h(
          "p",
          null,
          open.status === "accepted" ? `${them} is in. ` : `Waiting for ${them} to answer. `,
          h("a", { href: firstPath(ctx.id, "ask") }, open.status === "accepted" ? "Publish the night" : "Open the invite"),
        ),
      );
      slot.hidden = false;
    })
    .catch(() => undefined);
  return slot;
}

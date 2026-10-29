import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { noteFrame } from "../ui/note-frame.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { tapedNote } from "../ui/taped.ts";
import { refreshState, withVenue } from "../venue-context.ts";

function codeFromFragment(): string | null {
  const raw = location.hash.replace(/^#/, "");
  const code = new URLSearchParams(raw).get("c");
  if (code) history.replaceState(null, "", location.pathname);
  return code;
}

// The confirmation link carries a one time code, never the owner token, so it only works on a phone already signed in.
export function confirmPage(id: string): Promise<void> {
  const code = codeFromFragment();
  return withVenue(id, "venue", async (ctx, main) => {
    title("Confirm your email");
    const slot = h("div", { "aria-live": "polite" }, loading("Confirming"));
    replace(main, h("div", { class: "wrap wrap-wide notes-page" }, h("h1", null, "Confirm your email"), noteFrame("Your email", tapedNote("Your email", slot))));
    focusHeading();
    if (!code) {
      replace(slot, h("p", null, "This link has no confirmation code. Open the link from the email again."));
      return;
    }
    try {
      const venue = await api.confirmEmail(ctx.id, ctx.token, code);
      await refreshState(ctx).catch(() => undefined);
      replace(
        slot,
        h("p", { class: "notice", role: "status" }, `Confirmed. ${venue.ownerEmail ?? "Your email"} gets the Monday draft from now on.`),
        h("p", { class: "actions" }, h("a", { class: "button button-big button-lamp", href: `/v/${encodeURIComponent(ctx.id)}` }, "Back to your nights")),
      );
    } catch (err) {
      replace(slot, failure(err));
    }
  });
}

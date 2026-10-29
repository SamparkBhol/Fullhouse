import { h } from "../dom.ts";
import type { Invite } from "../joint.ts";

export interface InviteNote {
  subject: string;
  body: string;
}

export function inviteNote(invite: Invite, venueName: string, nightTitle: string): InviteNote {
  return {
    subject: `${venueName} and ${invite.partner.name}, one night together`,
    body: `Hi, we run ${venueName}, a short walk from you. Qloo's taste data says people who like our place also love yours, so we would like to put on one night together: ${nightTitle}. This page shows the night and what our two crowds share, with a button to say yes or no.\n\n${invite.url}`,
  };
}

export function mailHref(note: InviteNote): string {
  return `mailto:?subject=${encodeURIComponent(note.subject)}&body=${encodeURIComponent(note.body)}`;
}

// The owner's own share sheet when the phone has one, otherwise a draft in the owner's own mail app.
export async function sendInvite(invite: Invite, note: InviteNote): Promise<"shared" | "mail" | "cancelled"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  const data: ShareData = { title: note.subject, text: note.body.replace(invite.url, "").trim(), url: invite.url };
  if (nav.share && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  const a = h("a", { href: mailHref(note), hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  return "mail";
}

export function copyButton(label: string, text: () => string, field?: HTMLInputElement): { button: HTMLButtonElement; status: HTMLElement } {
  const status = h("p", { class: "copy-status", role: "status" });
  const button = h("button", { class: "button button-quiet", type: "button" }, label);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text());
      status.textContent = "Copied.";
    } catch {
      field?.focus();
      field?.select();
      status.textContent = "Selected. Copy it with your phone's copy button.";
    }
  });
  return { button, status };
}

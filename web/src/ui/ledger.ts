import type { Night, NightPlan, PairLedger } from "../../../src/shared/contract.ts";
import { plural, shortName } from "../../../src/shared/words.ts";
import { h, safeHref, uid } from "../dom.ts";
import { planMatch } from "../joint.ts";

function linkRow(side: "you" | "them", label: string, url: string | undefined, count: number | null, waiting: string): HTMLElement {
  const href = safeHref(url);
  return h(
    "div",
    { class: `link-row link-${side}` },
    h("i", { "aria-hidden": "true" }),
    h("div", null, h("b", null, label), href ? h("a", { class: "link-url", href }, url ?? href) : h("span", { class: "link-url" }, waiting)),
    count === null ? null : h("span", { class: "link-count" }, h("strong", null, String(count)), "came through it"),
  );
}

// The two sign up links, one per place, and who came through which. Only Full House holds this count.
export function linksPanel(plan: NightPlan | Night): HTMLElement | null {
  const m = planMatch(plan);
  if (!m || !plan.pair) return null;
  const night = "actions" in plan ? plan : null;
  const them = shortName(m.partner.name);
  const id = uid("links");
  const l = night?.ledger;
  const links = night?.shareLinks;
  const waiting = night ? "Not made for this night" : "Made when you publish";
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, "Who comes from where"),
    h("p", null, `Two sign up links, one for each of you. Full House counts every guest by the link they used, and you both see the count.`),
    h(
      "div",
      { class: "links" },
      linkRow("you", "Your link", links?.venue, l ? l.fromVenue : null, waiting),
      linkRow("them", `${them}'s link`, links?.partner, l ? l.fromPartner : null, night ? `${them} sees it after its yes` : waiting),
    ),
    l ? h("p", { class: "ledger-line" }, `From your link ${l.fromVenue}. From ${them}'s link ${l.fromPartner}.${l.direct ? ` ${plural(l.direct, "person", "people")} found the page another way.` : ""}`) : null,
  );
}

// Across every night with the same partner: the swap, added up.
export function pairLedgerList(ledgers: PairLedger[] | undefined): HTMLElement | null {
  if (!ledgers?.length) return null;
  const id = uid("pairs");
  return h(
    "section",
    { class: "panel", "aria-labelledby": id },
    h("h2", { id }, "Your swaps so far"),
    h("p", null, "Every night with the same partner, added up by the link each guest used."),
    h(
      "ul",
      { class: "ledger-pairs" },
      ledgers.map((p) => {
        const total = p.sent + p.received;
        const bar = total ? h("span", { class: "split", "aria-hidden": "true" }, h("i"), h("i")) : null;
        if (bar) {
          (bar.children[0] as HTMLElement).style.flex = String(p.sent);
          (bar.children[1] as HTMLElement).style.flex = String(p.received);
        }
        return h(
          "li",
          null,
          h("div", null, h("b", null, shortName(p.partnerName)), h("span", { class: "item-sub" }, plural(p.nights, "night together", "nights together"))),
          h("span", { class: "num" }, `You sent ${p.sent}, they sent ${p.received}`),
          bar,
        );
      }),
    ),
  );
}

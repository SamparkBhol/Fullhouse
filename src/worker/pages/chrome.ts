import { REPORTS_TO_HIDE } from "../../shared/engine.ts";
import { numberWord } from "../../shared/words.ts";
import { esc } from "./html.ts";
import { PAGE_CSS } from "./style.ts";

export const CREDIT = "Taste data from Qloo. Scores and plan by Full House.";

export function head(title: string, description: string, url: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(description)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:site_name" content="Full House">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(description)}">` +
    `<meta property="og:url" content="${esc(url)}">` +
    `<meta name="twitter:card" content="summary">` +
    `<style>${PAGE_CSS}</style></head>`
  );
}

export const DOORS = `<span class="mark-doors" aria-hidden="true"><i></i><i></i></span>`;

// One word beside the venue's name until the venue confirms it runs its page, with the reason one tap away.
export function unconfirmedWord(venueName: string): string {
  const v = esc(venueName);
  return `<details class="state"><summary>unconfirmed</summary><p>This page was set up through Full House by someone who says they run ${v}. ${v} has not confirmed that from an address on its own website yet.</p></details>`;
}

export function topBar(aside?: string, note = ""): string {
  const side = aside ? `<span class="top-venue"><span class="top-name">${esc(aside)}</span>${note}</span>` : "";
  return `<header class="top"><div class="wrap"><a class="mark" href="/">${DOORS}Full House</a>${side}</div></header>`;
}

// Lines arrive as HTML already escaped by the caller; acts are links or forms.
export function footer(lines: string[], acts = ""): string {
  const body = lines.map((l) => `<p>${l}</p>`).join("");
  return `<footer class="foot"><div class="wrap">${body}${acts ? `<div class="foot-acts">${acts}</div>` : ""}</div></footer>`;
}

export function panel(id: string, heading: string, body: string, cls = ""): string {
  return `<section class="panel${cls ? ` ${cls}` : ""}" aria-labelledby="${id}"><h2 id="${id}">${esc(heading)}</h2>${body}</section>`;
}

function plainPage(title: string, description: string, heading: string, text: string): string {
  return (
    head(title, description, "/") +
    `<body>${topBar()}<main class="screen"><div class="wrap"><div class="plain"><h1>${esc(heading)}</h1><p class="lead">${esc(text)}</p></div></div></main>` +
    footer([], `<a href="/">Find your neighbour on Full House</a>`) +
    `</body></html>`
  );
}

export function renderMissing(): string {
  return plainPage("Night not found", "This night is not on Full House.", "That night is not here", "The link may be mistyped, or the night was taken down.");
}

export function renderReported(hidden: boolean): string {
  const text = hidden
    ? "Enough people reported this page that it is offline until the person who set it up puts it back."
    : `The owner sees the number of reports on their night page. A page reported by ${numberWord(REPORTS_TO_HIDE)} different people goes offline.`;
  return plainPage("Report received", "Thanks for telling us.", "Thanks, the report is in", text);
}

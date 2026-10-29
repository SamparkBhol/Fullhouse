import { describeDate } from "../../core/index.ts";
import { plainName, shortName } from "../../shared/words.ts";
import { qrSvg } from "../qr/svg.ts";
import { DOORS, head } from "./chrome.ts";
import { headWithArt } from "./event_art.ts";
import { creditLine, eventUrl, headline, titleAt, type PublicNight } from "./event.ts";
import { esc } from "./html.ts";
import { PRINT_SCRIPT } from "./style.ts";

// The partner goes on paper only once it has confirmed its own stop; until then the poster shows the venue's part alone.
function where(n: PublicNight): string {
  const confirmed = n.partner?.confirmed === true;
  const withLine = n.partner && confirmed ? `<p>With ${esc(shortName(n.partner.hosts ? n.venueName : n.partner.name))}</p>` : "";
  const stops = n.stops?.filter((s) => s.at === "venue" || confirmed);
  if (stops?.length) {
    const rows = stops.map((s) => `<li><b>${esc(s.start)}</b><strong>${esc(shortName(s.name))}</strong>${s.address ? `<br>${esc(s.address)}` : ""}</li>`);
    return `<div class="p-where"><ol>${rows.join("")}</ol>${withLine}</div>`;
  }
  const place = n.placeName ?? n.venueName;
  return `<div class="p-where"><p><strong>${esc(plainName(place))}</strong>${n.address ? `<br>${esc(n.address)}` : ""}</p>${withLine}</div>`;
}

function posterTitle(text: string): string {
  return `<h1${text.length > 32 ? ' class="long"' : ""}>${esc(text)}</h1>`;
}

export function renderPoster(n: PublicNight, origin: string): string {
  const url = eventUrl(origin, n.slug);
  const shortUrl = eventUrl(origin, n.shortSlug ?? n.slug).replace(/^https?:\/\//, "");
  const when = `${describeDate(n.date)}, ${n.start} to ${n.end}`;
  let qr = "";
  if (n.published.page) {
    try {
      qr = `<div class="p-qr">${qrSvg(url, `QR code for ${shortUrl}`)}</div>`;
    } catch {
      qr = "";
    }
  }
  const source = `<p class="p-src">${esc(creditLine(n))}</p>`;
  const foot = n.published.page
    ? `<div><p class="p-url">${esc(shortUrl)}</p><p class="p-src">Scan the code or type the link to say you are coming.</p>${source}</div>${qr}`
    : `<div>${source}</div>`;
  return (
    head(`Poster for ${n.title}`, `${titleAt(n)}, ${when}`, `${url}/poster`) +
    `<body><div class="print-bar"><button class="btn" id="print" type="button">Print the poster</button><span>A4 portrait. Turn off headers and footers in the print dialog.</span></div>` +
    `<main class="poster">` +
    `<p class="p-mark">${DOORS}Full House</p>` +
    `<p class="when">${esc(when)}</p>` +
    (n.kind ? `<p class="kind">${esc(n.kind)}</p>` : "") +
    headWithArt(posterTitle(n.stops?.length && n.partner?.confirmed ? headline(n) : n.feature || n.posterHeadline || n.title), n.art) +
    (n.by ? `<p class="p-sub">${esc(n.by)}</p>` : "") +
    (n.posterSub ? `<p class="p-sub">${esc(n.posterSub)}</p>` : "") +
    where(n) +
    (n.reason ? `<p class="p-why">${esc(n.reason)}.</p>` : "") +
    `<div class="p-foot">${foot}</div>` +
    `</main><script>${PRINT_SCRIPT}</script></body></html>`
  );
}

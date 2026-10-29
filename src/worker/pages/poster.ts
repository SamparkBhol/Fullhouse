import { describeDate } from "../../core/index.ts";
import { plainName } from "../../shared/words.ts";
import { qrSvg } from "../qr/svg.ts";
import { headWithArt } from "./event_art.ts";
import { eventUrl, head, postedBy, titleAt, type PublicNight } from "./event.ts";
import { esc } from "./html.ts";
import { PRINT_SCRIPT } from "./style.ts";

export function renderPoster(n: PublicNight, origin: string): string {
  const url = eventUrl(origin, n.slug);
  const shortUrl = url.replace(/^https?:\/\//, "");
  const when = `${describeDate(n.date)}, ${n.start} to ${n.end}`;
  const reason = n.reason ? `${n.reason}. ${n.source}.` : `${n.source}.`;
  let qr = "";
  if (n.published.page) {
    try {
      qr = `<div class="p-qr">${qrSvg(url, `QR code for ${shortUrl}`)}</div>`;
    } catch {
      qr = "";
    }
  }
  const foot = n.published.page
    ? `<div><p class="p-url">${esc(shortUrl)}</p><p class="p-src">Scan the code or type the link to say you are coming. ${postedBy(n)}</p></div>${qr}`
    : `<div><p class="p-src">${postedBy(n)}</p></div>`;
  const place = n.placeName ?? n.venueName;
  const withLine = n.partner ? `<br>With ${esc(plainName(n.partner.hosts ? n.venueName : n.partner.name))}` : "";
  return (
    head(`Poster: ${n.title}`, `${titleAt(n)}, ${when}`, `${url}/poster`) +
    `<body><div class="print-bar"><button id="print" type="button">Print the poster</button><span>A4 portrait. Turn off headers and footers in the print dialog.</span></div>` +
    `<main class="poster">` +
    `<p class="when">${esc(when)}</p>` +
    (n.kind ? `<p class="kind">${esc(n.kind)}</p>` : "") +
    headWithArt(`<h1>${esc(n.feature || n.posterHeadline || n.title)}</h1>`, n.art) +
    (n.by ? `<p class="p-sub">${esc(n.by)}</p>` : "") +
    (n.posterSub ? `<p class="p-sub">${esc(n.posterSub)}</p>` : "") +
    `<p class="p-where"><strong>${esc(place)}</strong>${n.address ? `<br>${esc(n.address)}` : ""}${withLine}</p>` +
    `<p class="p-why">${esc(reason)}</p>` +
    `<div class="p-foot">${foot}</div>` +
    `</main><script>${PRINT_SCRIPT}</script></body></html>`
  );
}

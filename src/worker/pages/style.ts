import { rootRule } from "../../shared/tokens.ts";
import { sha256base64 } from "../tokens.ts";

export const FONT_PATH = "/e/_/archivo-wdth.woff2";

const TAPE_EDGE =
  "polygon(2% 0,98% 0,100% 14%,97% 30%,100% 47%,96% 63%,100% 80%,97% 100%,3% 100%,0 84%,3% 68%,0 52%,4% 35%,0 18%)";

// The event page is the app's published flyer at full size; it shares the tokens and the flyer's anatomy.
export const PAGE_CSS = [
  rootRule(),
  `@font-face{font-family:"Archivo Variable";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(${FONT_PATH}) format("woff2-variations"),url(${FONT_PATH}) format("woff2")}`,
  "*{box-sizing:border-box}",
  "html{background:var(--street);color:var(--chalk);-webkit-text-size-adjust:100%;color-scheme:dark}",
  "body{margin:0;font-family:var(--face);font-size:var(--s18);line-height:1.5}",
  "a{color:inherit;text-decoration-thickness:1.5px;text-underline-offset:3px}",
  "a:focus-visible,button:focus-visible{outline:3px solid var(--chalk);outline-offset:3px}",
  ".fascia{background:var(--fascia);padding:14px 16px 16px;border-bottom:3px solid var(--lit)}",
  ".fascia p{margin:0;font-size:var(--s14);font-stretch:125%;font-weight:700;color:var(--mist)}",
  ".fascia .sign{margin:4px 0 0;font-size:var(--s24);font-weight:650;line-height:1.1;color:var(--chalk);overflow-wrap:anywhere}",
  ".sheet{max-width:40rem;margin:0 auto;padding:32px 16px 56px}",
  ".flyer{position:relative;background:var(--paper);color:var(--ink);padding:0 20px 24px;margin:8px 0 32px;transform:rotate(-0.8deg);",
  "box-shadow:0 0 0 1px rgba(255,194,74,.55),0 0 36px 8px rgba(255,194,74,.36),0 0 110px 34px rgba(255,194,74,.16)}",
  `.flyer::before,.flyer::after{content:"";position:absolute;top:-13px;width:96px;height:28px;background:var(--tape);clip-path:${TAPE_EDGE}}`,
  ".flyer::before{left:14px;transform:rotate(-5deg)}",
  ".flyer::after{right:14px;transform:rotate(4deg)}",
  ".when{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 12px;margin:0 -20px 18px;padding:12px 20px;background:var(--ink);color:var(--paper);font-weight:650;font-size:var(--s16);font-variant-numeric:tabular-nums}",
  ".kind{margin:0;font-size:var(--s21);font-weight:700;line-height:1.2}",
  ".flyer h1{margin:4px 0 16px;font-stretch:62%;font-weight:820;line-height:.9;letter-spacing:-.01em;font-size:clamp(3rem,15vw,var(--s72));overflow-wrap:break-word}",
  ".flyer .desc p{margin:0 0 12px}",
  ".flyer .place{margin:16px 0 0;padding-top:10px;border-top:3px solid var(--ink);font-weight:700;font-size:var(--s16)}",
  ".flyer .place span{display:block;font-weight:400}",
  ".tz,.note,.limits{font-size:var(--s14)}",
  ".flyer .tz,.flyer .note{margin:8px 0 0}",
  ".rsvp{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:0 0 36px}",
  ".count{margin:0;font-size:var(--s48);font-stretch:62%;font-weight:820;line-height:1;color:var(--lit);font-variant-numeric:tabular-nums}",
  ".rsvp form{margin:0}",
  "button{font:inherit;font-weight:650;font-size:var(--s18);background:var(--chalk);color:var(--ink);border:2px solid var(--chalk);border-radius:var(--radius);padding:0 22px;min-height:48px;cursor:pointer}",
  "button:hover{background:#fff;border-color:#fff}",
  ".going{margin:0;font-weight:650}",
  "h2{margin:0 0 10px;font-size:var(--s24);font-stretch:87.5%;font-weight:700;line-height:1.15}",
  "section{margin:0 0 32px}",
  "ul{margin:0 0 10px;padding-left:22px}",
  "li{margin:0 0 6px}",
  ".limits{margin:0;color:var(--mist)}",
  ".links{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px 20px}",
  ".links a{display:inline-flex;align-items:center;min-height:44px;color:var(--lit);font-weight:650}",
  "footer{font-size:var(--s14);color:var(--mist);border-top:1px solid var(--rule);padding-top:16px}",
  "@media (min-width:720px){.flyer{padding:0 28px 28px}.when{margin:0 -28px 22px;padding:12px 28px}}",
  ".print-bar{max-width:210mm;margin:0 auto;padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:var(--s16)}",
  ".poster{background:#fff;color:var(--ink);width:100%;max-width:210mm;aspect-ratio:210/297;margin:0 auto 32px;padding:9% 8% 7%;display:flex;flex-direction:column;gap:18px}",
  ".poster .when{margin:0;padding:0;background:none;color:var(--ink);justify-content:flex-start;font-size:clamp(16px,3.2vw,24px)}",
  ".poster .kind{font-size:clamp(18px,3.6vw,30px)}",
  ".poster h1{margin:0;font-stretch:62%;font-weight:820;line-height:.9;font-size:clamp(48px,11vw,96px);overflow-wrap:break-word}",
  ".p-sub{margin:0;font-size:clamp(18px,3.6vw,30px);line-height:1.25}",
  ".p-where{margin:0;font-size:clamp(16px,3vw,24px)}",
  ".p-where strong{font-stretch:125%;font-weight:650}",
  ".p-why{margin:0;font-size:clamp(14px,2.4vw,19px);border-left:4px solid var(--ink);padding-left:12px}",
  ".p-foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}",
  ".p-qr svg{width:36mm;height:36mm;display:block}",
  ".p-url{margin:0;font-weight:650;font-size:clamp(16px,3vw,24px);overflow-wrap:anywhere}",
  ".p-src{margin:6px 0 0;font-size:var(--s14)}",
  "@page{size:A4;margin:0}",
  "@media print{html,body{background:#fff}.print-bar{display:none}",
  ".poster{margin:0;width:210mm;height:297mm;max-width:none;aspect-ratio:auto;padding:20mm 17mm 16mm}",
  ".poster h1{font-size:60pt}.poster .when{font-size:17pt}.poster .kind{font-size:20pt}.p-sub{font-size:21pt}.p-where{font-size:16pt}.p-why{font-size:13pt}.p-url{font-size:16pt}}",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}",
].join("");

export const PRINT_SCRIPT = 'document.getElementById("print").addEventListener("click",function(){window.print()});';

let hashes: Promise<{ style: string; script: string }> | undefined;

export function pageHashes(): Promise<{ style: string; script: string }> {
  hashes ??= Promise.all([sha256base64(PAGE_CSS), sha256base64(PRINT_SCRIPT)]).then(([s, j]) => ({
    style: `sha256-${s}`,
    script: `sha256-${j}`,
  }));
  return hashes;
}

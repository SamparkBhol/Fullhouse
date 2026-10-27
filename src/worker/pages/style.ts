import { sha256base64 } from "../tokens.ts";

export const FONT_PATH = "/e/_/archivo-wdth.woff2";

export const PAGE_CSS = [
  `@font-face{font-family:"Archivo Variable";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(${FONT_PATH}) format("woff2-variations"),url(${FONT_PATH}) format("woff2")}`,
  ":root{--street:#33506E;--fascia:#243A53;--chalk:#F3F5F8;--mist:#B9C7D7;--paper:#F6D8DB;--ink:#1D3150;--lit:#FFC24A;--stop:#FFB3A6;",
  "--type:\"Archivo Variable\",Archivo,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif}",
  "*{box-sizing:border-box}",
  "html{background:var(--street);color:var(--chalk);-webkit-text-size-adjust:100%}",
  "body{margin:0;font-family:var(--type);font-size:18px;line-height:1.5;font-variant-numeric:tabular-nums}",
  "a{color:inherit;text-underline-offset:3px}",
  "a:focus-visible,button:focus-visible{outline:3px solid var(--chalk);outline-offset:3px}",
  ".fascia{background:var(--fascia);padding:14px 16px 12px;border-bottom:3px solid var(--lit)}",
  ".fascia p{margin:0;font-size:14px;color:var(--mist)}",
  ".fascia .sign{margin:2px 0 0;font-stretch:125%;font-weight:650;font-size:24px;line-height:1.15;color:var(--chalk)}",
  ".sheet{max-width:40rem;margin:0 auto;padding:28px 16px 56px}",
  ".flyer{position:relative;background:var(--paper);color:var(--ink);padding:36px 20px 24px;margin:8px 0 28px;",
  "box-shadow:0 0 0 1px rgba(255,194,74,.5),0 0 44px 10px rgba(255,194,74,.42)}",
  ".flyer::before,.flyer::after{content:\"\";position:absolute;top:-10px;width:86px;height:24px;background:rgba(243,245,248,.72)}",
  ".flyer::before{left:14px;transform:rotate(-4deg)}",
  ".flyer::after{right:14px;transform:rotate(3deg)}",
  ".when{margin:0 0 10px;font-weight:600;font-size:16px}",
  ".flyer h1{margin:0 0 16px;font-stretch:62%;font-weight:820;line-height:.9;font-size:clamp(48px,13vw,72px);overflow-wrap:anywhere}",
  ".flyer .desc p{margin:0 0 12px}",
  ".flyer .place{margin:16px 0 0;font-weight:600}",
  ".flyer .place span{display:block;font-weight:400}",
  ".tz,.note,.limits{font-size:14px}",
  ".flyer .tz,.flyer .note{margin:8px 0 0}",
  ".rsvp{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:0 0 32px}",
  ".count{margin:0;font-size:36px;font-weight:650;line-height:1.1;color:var(--lit)}",
  ".rsvp form{margin:0}",
  "button{font:inherit;font-weight:600;font-size:18px;background:var(--chalk);color:var(--ink);border:0;border-radius:6px;padding:0 22px;min-height:48px;cursor:pointer}",
  ".going{margin:0;font-weight:600}",
  "h2{margin:0 0 8px;font-size:21px;font-weight:650}",
  "section{margin:0 0 28px}",
  "ul{margin:0 0 10px;padding-left:22px}",
  "li{margin:0 0 6px}",
  ".limits{margin:0;color:var(--mist)}",
  ".links{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px 20px}",
  "footer{font-size:14px;color:var(--mist)}",
  ".print-bar{max-width:210mm;margin:0 auto;padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:16px}",
  ".poster{background:#fff;color:var(--ink);width:100%;max-width:210mm;aspect-ratio:210/297;margin:0 auto 32px;padding:9% 8% 7%;display:flex;flex-direction:column;gap:18px}",
  ".poster .when{font-size:clamp(16px,3.2vw,24px)}",
  ".poster h1{margin:0;font-stretch:62%;font-weight:820;line-height:.9;font-size:clamp(48px,11vw,96px);overflow-wrap:anywhere}",
  ".p-sub{margin:0;font-size:clamp(18px,3.6vw,30px);line-height:1.25}",
  ".p-where{margin:0;font-size:clamp(16px,3vw,24px)}",
  ".p-where strong{font-stretch:125%;font-weight:650}",
  ".p-why{margin:0;font-size:clamp(14px,2.4vw,19px);border-left:4px solid var(--ink);padding-left:12px}",
  ".p-foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}",
  ".p-qr svg{width:36mm;height:36mm;display:block}",
  ".p-url{margin:0;font-weight:650;font-size:clamp(16px,3vw,24px);overflow-wrap:anywhere}",
  ".p-src{margin:6px 0 0;font-size:14px}",
  "@page{size:A4;margin:0}",
  "@media print{html,body{background:#fff}.print-bar{display:none}",
  ".poster{margin:0;width:210mm;height:297mm;max-width:none;aspect-ratio:auto;padding:20mm 17mm 16mm}",
  ".poster h1{font-size:60pt}.poster .when{font-size:17pt}.p-sub{font-size:21pt}.p-where{font-size:16pt}.p-why{font-size:13pt}.p-url{font-size:16pt}}",
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

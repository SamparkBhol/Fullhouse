import { TAPE_EDGE } from "./style_event.ts";

// The poster is the same flyer for A4 in the one ink on white, so it prints on any paper the owner has.
export const POSTER_CSS = [
  ".print-bar{max-width:210mm;margin:0 auto;padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:var(--s16)}",
  ".poster{position:relative;background:#fff;color:var(--ink);width:100%;max-width:210mm;aspect-ratio:210/297;margin:22px auto 32px;padding:9% 8% 7%;display:flex;flex-direction:column;gap:18px}",
  `.poster::before,.poster::after{content:"";position:absolute;top:-13px;width:110px;height:30px;background:var(--tape);clip-path:${TAPE_EDGE}}`,
  ".poster::before{left:18px;transform:rotate(-4deg)}",
  ".poster::after{right:18px;transform:rotate(3deg)}",
  ".poster .when{margin:0;padding:0;background:none;color:var(--ink);justify-content:flex-start;font-size:clamp(16px,3.2vw,24px)}",
  ".poster .kind{font-size:clamp(18px,3.6vw,30px)}",
  ".poster h1{margin:0;font-stretch:62%;font-weight:820;line-height:.9;font-size:clamp(48px,11vw,96px);overflow-wrap:break-word}",
  ".poster .head{margin:0;gap:6mm}",
  ".poster .print-square{width:48mm}",
  ".poster .print-portrait{width:40mm}",
  ".p-sub{margin:0;font-size:clamp(18px,3.6vw,30px);line-height:1.25}",
  ".p-where{margin:0;font-size:clamp(16px,3vw,24px)}",
  ".p-where strong{font-stretch:125%;font-weight:650}",
  ".p-why{margin:0;font-size:clamp(14px,2.4vw,19px);border-left:4px solid var(--ink);padding-left:12px}",
  ".p-foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}",
  ".p-qr svg{width:36mm;height:36mm;display:block}",
  ".p-url{margin:0;font-weight:650;font-size:clamp(16px,3vw,24px);overflow-wrap:anywhere}",
  ".p-src{margin:6px 0 0;font-size:var(--s14)}",
  "@page{size:A4;margin:0}",
  "@media print{html,body{background:#fff}.print-bar{display:none}.poster::before,.poster::after{display:none}",
  ".poster{margin:0;width:210mm;height:297mm;max-width:none;aspect-ratio:auto;padding:20mm 17mm 16mm}",
  ".poster h1{font-size:60pt}.poster .when{font-size:17pt}.poster .kind{font-size:20pt}.p-sub{font-size:21pt}.p-where{font-size:16pt}.p-why{font-size:13pt}.p-url{font-size:16pt}}",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}",
].join("");

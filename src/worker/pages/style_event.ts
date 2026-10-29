import { rootRule } from "../../shared/design_tokens.ts";

export const FONT_PATH = "/e/_/archivo-wdth.woff2";

export const TAPE_EDGE =
  "polygon(2% 0,98% 0,100% 14%,97% 30%,100% 47%,96% 63%,100% 80%,97% 100%,3% 100%,0 84%,3% 68%,0 52%,4% 35%,0 18%)";

const LIT_GLOW = "0 0 0 1px rgba(255,194,74,.55),0 0 36px 8px rgba(255,194,74,.36),0 0 110px 34px rgba(255,194,74,.16)";

// The guest's view of the app's lit window: the flyer taped inside, the yes count under the pendant.
// The frame clips rather than hides its overflow, so the yes count can ride the bottom of a phone screen.
export const EVENT_CSS = [
  rootRule(),
  `@font-face{font-family:"Archivo Variable";font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(${FONT_PATH}) format("woff2-variations"),url(${FONT_PATH}) format("woff2")}`,
  "*{box-sizing:border-box}",
  "html{background:var(--street);color:var(--chalk);-webkit-text-size-adjust:100%;color-scheme:dark}",
  "body{margin:0;font-family:var(--face);font-size:var(--s18);line-height:1.5}",
  "a{color:inherit;text-decoration-thickness:1.5px;text-underline-offset:3px}",
  "a:focus-visible,button:focus-visible{outline:3px solid var(--chalk);outline-offset:3px}",
  ".fascia{background:var(--fascia);padding:14px max(16px,calc(50% + -22rem + 16px)) 16px;border-bottom:3px solid var(--lit)}",
  ".fascia p{margin:0;font-size:var(--s14);font-stretch:125%;font-weight:700;color:var(--mist)}",
  ".fascia .sign{margin:4px 0 0;font-size:var(--s24);font-weight:650;line-height:1.1;color:var(--chalk);overflow-wrap:anywhere}",
  ".sheet{max-width:44rem;margin:0 auto;padding:12px 16px 56px}",
  ".win{margin:24px 0 0}",
  ".win-frame{border:2px solid var(--frame);border-radius:var(--radius);background:var(--interior);overflow:clip}",
  ".win-room{position:relative;background:radial-gradient(ellipse 72% 58% at 50% 0,rgba(255,198,107,.3),rgba(255,198,107,.1) 46%,rgba(255,198,107,0) 72%),var(--interior)}",
  ".win-dark .win-room{background:color-mix(in srgb,var(--interior) 55%,var(--street))}",
  ".pendant{position:absolute;top:0;left:50%;width:30px;height:28px;transform:translateX(-50%)}",
  '.pendant::before{content:"";position:absolute;left:14px;top:0;width:2px;height:16px;background:rgba(243,245,248,.3)}',
  '.pendant::after{content:"";position:absolute;left:3px;top:15px;width:24px;height:11px;border-radius:12px 12px 1px 1px;background:var(--lamp)}',
  ".win-inside{position:relative;padding:44px 14px 24px}",
  ".win-sill{height:10px;margin:0 -8px;background:var(--sill);border-top:2px solid color-mix(in srgb,var(--sill) 70%,var(--chalk))}",
  ".flyer{position:relative;z-index:1;background:var(--paper);color:var(--ink);padding:0 20px 24px;margin:14px auto 28px;max-width:32rem;transform:rotate(-0.8deg)}",
  `.flyer.lit{box-shadow:${LIT_GLOW}}`,
  `.flyer::before,.flyer::after{content:"";position:absolute;top:-13px;width:96px;height:28px;background:var(--tape);clip-path:${TAPE_EDGE}}`,
  ".flyer::before{left:14px;transform:rotate(-5deg)}",
  ".flyer::after{right:14px;transform:rotate(4deg)}",
  ".when{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 12px;margin:0 -20px 18px;padding:18px 20px 12px;background:var(--ink);color:var(--paper);font-weight:650;font-size:var(--s16);font-variant-numeric:tabular-nums}",
  ".kind{margin:0;font-size:var(--s21);font-weight:700;line-height:1.2}",
  ".flyer h1{margin:4px 0 16px;font-stretch:62%;font-weight:820;line-height:.9;letter-spacing:-.01em;font-size:clamp(3rem,15vw,var(--s72));overflow-wrap:break-word}",
  ".head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:16px;margin:4px 0 16px}",
  ".head h1{margin:0}",
  ".print{display:block;background:var(--ink);mix-blend-mode:multiply}",
  ".print img{display:block;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.2) brightness(1.08);mix-blend-mode:screen}",
  ".print-square{width:clamp(96px,28vw,168px);aspect-ratio:1}",
  ".print-portrait{width:clamp(80px,24vw,140px);aspect-ratio:2/3}",
  ".flyer .desc p{margin:0 0 12px}",
  ".flyer .place{margin:16px 0 0;padding-top:10px;border-top:3px solid var(--ink);font-weight:700;font-size:var(--s16)}",
  ".flyer .place span{display:block;font-weight:400}",
  ".tz,.note,.limits{font-size:var(--s14)}",
  ".flyer .tz,.flyer .note{margin:8px 0 0}",
  ".rsvp{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;margin:0 -14px -24px;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));background:var(--interior);border-top:1px solid var(--frame)}",
  ".count{margin:0;font-size:var(--s24);font-stretch:62%;font-weight:820;line-height:1;color:var(--lit);font-variant-numeric:tabular-nums}",
  ".win-dark .count{color:var(--chalk)}",
  ".win-dark .rsvp{position:static;background:none;border:0}",
  ".rsvp form{margin:0}",
  "button{font:inherit;font-weight:650;font-size:var(--s18);background:var(--chalk);color:var(--ink);border:2px solid var(--chalk);border-radius:var(--radius);padding:0 22px;min-height:48px;cursor:pointer}",
  "button:hover{background:#fff;border-color:#fff}",
  ".rsvp button{min-height:52px;padding:0 18px;background:var(--lamp);border-color:var(--lamp)}",
  ".rsvp button:hover{background:#ffd38f;border-color:#ffd38f}",
  ".going{margin:0;font-weight:650}",
  "h2{margin:0 0 10px;font-size:var(--s24);font-stretch:87.5%;font-weight:700;line-height:1.15}",
  ".ledge{margin:40px 0 0}",
  ".ledge h2{margin:0 0 14px;font-size:var(--s21)}",
  ".ledge>p{margin:0 0 12px;max-width:40ch}",
  ".ledge .limits{margin:0;color:var(--mist)}",
  "ul{margin:0 0 10px;padding-left:22px}",
  "li{margin:0 0 6px}",
  ".near-why{color:var(--mist);font-size:var(--s16)}",
  ".near{list-style:none;padding:0;display:grid;gap:14px;margin:0}",
  ".near li{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start;margin:0;padding:7px 10px 7px 7px;background:var(--chalk);color:var(--ink);transform:rotate(-0.6deg)}",
  ".near li:nth-child(2n){transform:rotate(0.5deg)}",
  ".near img,.near .blank{display:block;width:96px;height:96px;object-fit:cover;background:var(--ink)}",
  ".near .blank{display:flex;align-items:flex-end;padding:6px;overflow:hidden;background:var(--paper);color:var(--ink);font-stretch:62%;font-weight:820;font-size:var(--s16);line-height:.95}",
  ".near p{margin:0;display:grid}",
  ".near strong{font-size:var(--s18);font-weight:700;line-height:1.2}",
  ".near span{color:var(--ink-soft);font-size:var(--s14);font-variant-numeric:tabular-nums}",
  ".near span:first-of-type{color:var(--ink);font-size:var(--s16);font-stretch:75%;font-weight:760}",
  ".links{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px 20px;margin:0}",
  ".links a{display:inline-flex;align-items:center;min-height:44px;color:var(--lit);font-weight:650}",
  "footer{margin-top:36px;font-size:var(--s14);color:var(--mist);border-top:2px dashed var(--frame);padding-top:16px}",
  "footer p{margin:0 0 12px}",
  "button.quiet{background:transparent;color:var(--mist);border-color:var(--rule);font-size:var(--s14);font-weight:500}",
  "button.quiet:hover{background:transparent;color:var(--chalk);border-color:var(--mist)}",
  "@media (min-width:720px){.near{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.near li{grid-template-columns:minmax(0,1fr);padding:7px 7px 12px}.near img,.near .blank{width:100%;height:auto;aspect-ratio:1}" +
    ".flyer{padding:0 28px 28px}.when{margin:0 -28px 22px;padding:18px 28px 12px}.win-inside{padding:52px 28px 32px}" +
    '.win-room::after{content:"";position:absolute;inset:0;pointer-events:none;background:rgba(243,245,248,.045);clip-path:polygon(58% 0,70% 0,36% 100%,24% 100%)}' +
    ".rsvp{margin:0 -28px -32px;padding:14px 28px}.count{font-size:var(--s36)}}",
  "@media (min-width:960px){.sheet{max-width:64rem}.fascia{padding-left:max(16px,calc(50% + -32rem + 16px));padding-right:max(16px,calc(50% + -32rem + 16px))}" +
    ".win-inside{display:grid;grid-template-columns:minmax(0,32rem) minmax(0,1fr);gap:48px;align-items:start}.flyer{margin:14px 0 8px}" +
    ".rsvp{position:static;flex-direction:column;align-items:flex-start;gap:22px;margin:0;padding:96px 0 0;background:none;border:0}.count{font-size:var(--s72);max-width:10ch}.rsvp button{min-height:56px;padding:0 24px;font-size:var(--s21)}" +
    ".ledge,footer{max-width:44rem}}",
].join("");

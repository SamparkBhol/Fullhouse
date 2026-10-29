// The invite reuses the event page's flyer and postcards; only the ask, the split bar and the answer are its own.
export const INVITE_CSS = [
  ".by{margin:-8px 0 14px;font-size:var(--s18);font-weight:650}",
  ".invite .ask{margin:28px 0 10px;font-size:clamp(2rem,8vw,var(--s48));font-stretch:75%;font-weight:800;line-height:1}",
  ".invite .lede{margin:0 0 24px;max-width:40ch}",
  ".invite .flyer{margin:24px 0 0}",
  ".invite .flyer .fname{margin:0;font-stretch:62%;font-weight:820;line-height:.9;letter-spacing:-.01em;font-size:clamp(2.6rem,12vw,var(--s60));overflow-wrap:break-word}",
  ".split{display:block;width:100%;height:20px;margin:4px 0 10px}",
  ".split-a{fill:var(--paper)}",
  ".split-b{fill:var(--chalk)}",
  ".split-line{margin:0 0 8px;font-weight:700;font-variant-numeric:tabular-nums}",
  ".aggregate{margin:32px 0 0;color:var(--mist)}",
  ".answer{margin:28px 0 0}",
  ".answer form{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 12px}",
  ".answer .yes{background:var(--lamp);border-color:var(--lamp)}",
  ".answer .yes:hover{background:#ffd38f;border-color:#ffd38f}",
  ".answer .limits{color:var(--mist);max-width:44ch}",
].join("");

import { sha256base64 } from "../crypto.ts";
import { BASE_CSS } from "./style_base.ts";
import { EVENT_CSS } from "./style_event.ts";
import { INVITE_CSS } from "./style_invite.ts";
import { NIGHT_CSS } from "./style_night.ts";
import { POSTER_CSS } from "./style_poster.ts";

export { FONT_PATH } from "./style_base.ts";

// One stylesheet for every public page, so the page CSP carries a single hash.
export const PAGE_CSS = BASE_CSS + NIGHT_CSS + EVENT_CSS + INVITE_CSS + POSTER_CSS;

export const PRINT_SCRIPT = 'document.getElementById("print").addEventListener("click",function(){window.print()});';

let hashes: Promise<{ style: string; script: string }> | undefined;

export function pageHashes(): Promise<{ style: string; script: string }> {
  hashes ??= Promise.all([sha256base64(PAGE_CSS), sha256base64(PRINT_SCRIPT)]).then(([s, j]) => ({
    style: `sha256-${s}`,
    script: `sha256-${j}`,
  }));
  return hashes;
}

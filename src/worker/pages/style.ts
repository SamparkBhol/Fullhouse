import { sha256base64 } from "../crypto.ts";
import { EVENT_CSS } from "./style_event.ts";
import { POSTER_CSS } from "./style_poster.ts";

export { FONT_PATH, TAPE_EDGE } from "./style_event.ts";

// The event page is the app's lit window at full size; it shares the tokens and the flyer's anatomy.
export const PAGE_CSS = EVENT_CSS + POSTER_CSS;

export const PRINT_SCRIPT = 'document.getElementById("print").addEventListener("click",function(){window.print()});';

let hashes: Promise<{ style: string; script: string }> | undefined;

export function pageHashes(): Promise<{ style: string; script: string }> {
  hashes ??= Promise.all([sha256base64(PAGE_CSS), sha256base64(PRINT_SCRIPT)]).then(([s, j]) => ({
    style: `sha256-${s}`,
    script: `sha256-${j}`,
  }));
  return hashes;
}

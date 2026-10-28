// QR Code Model 2, byte mode, error correction level M, versions 1 to 10 (up to 213 bytes).
// The construction follows ISO/IEC 18004 in the same order as Project Nayuki's reference encoder.
import { MAX_VERSION, dataCodewords, encodeData, interleave } from "./codewords.ts";
import { Grid, drawCodewords, drawFormat, drawFunctionPatterns } from "./layout.ts";
import { applyMask, penalty } from "./mask.ts";

export interface QrMatrix {
  version: number;
  size: number;
  mask: number;
  modules: boolean[][];
}

export function encodeQr(text: string, forceMask?: number): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= MAX_VERSION && 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
  if (ver > MAX_VERSION) throw new Error("text too long for a version 10 QR code");
  const size = ver * 4 + 17;
  const g = new Grid(size);
  drawFunctionPatterns(g, ver);
  drawCodewords(g, interleave(encodeData(bytes, ver), ver));
  let best = forceMask ?? 0;
  if (forceMask === undefined) {
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(g, m);
      drawFormat(g, m);
      const score = penalty(g);
      if (score < bestScore) {
        best = m;
        bestScore = score;
      }
      applyMask(g, m);
    }
  }
  applyMask(g, best);
  drawFormat(g, best);
  return { version: ver, size, mask: best, modules: g.modules };
}

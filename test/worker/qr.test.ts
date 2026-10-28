import { describe, expect, it } from "vitest";
import { dataCodewords } from "../../src/worker/qr/codewords.ts";
import { encodeQr } from "../../src/worker/qr/encode.ts";
import { formatBits, versionBits } from "../../src/worker/qr/layout.ts";
import { maskHit } from "../../src/worker/qr/mask.ts";
import { rsDivisor, rsRemainder } from "../../src/worker/qr/rs.ts";
import { qrSvg } from "../../src/worker/qr/svg.ts";

// ISO/IEC 18004 table values for level M, written out here rather than derived, so the reader below
// does not share the encoder's arithmetic.
const BLOCKS: Record<number, { blocks: number; ec: number; total: number }> = {
  1: { blocks: 1, ec: 10, total: 26 },
  2: { blocks: 1, ec: 16, total: 44 },
  3: { blocks: 1, ec: 26, total: 70 },
  4: { blocks: 2, ec: 18, total: 100 },
  5: { blocks: 2, ec: 24, total: 134 },
  6: { blocks: 4, ec: 16, total: 172 },
  7: { blocks: 4, ec: 18, total: 196 },
  8: { blocks: 4, ec: 22, total: 242 },
  9: { blocks: 5, ec: 22, total: 292 },
  10: { blocks: 5, ec: 26, total: 346 },
};
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

function gfExp(): number[] {
  const exp: number[] = [];
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp.push(x);
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  return exp;
}
const EXP = gfExp();
const LOG: number[] = [];
EXP.forEach((v, i) => (LOG[v] = i));
const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[((LOG[a] ?? 0) + (LOG[b] ?? 0)) % 255]!);

function syndromesZero(block: number[], ec: number): boolean {
  for (let i = 0; i < ec; i++) {
    let s = 0;
    const alpha = EXP[i]!;
    for (const c of block) s = mul(s, alpha) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

function readQr(m: boolean[][]): { text: string; mask: number; rsOk: boolean } {
  const size = m.length;
  const ver = (size - 17) / 4;
  const at = (r: number, c: number): boolean => m[r]?.[c] ?? false;
  let fmt = 0;
  const put = (bitIndex: number, dark: boolean) => {
    if (dark) fmt |= 1 << bitIndex;
  };
  for (let i = 0; i <= 5; i++) put(i, at(i, 8));
  put(6, at(7, 8));
  put(7, at(8, 8));
  put(8, at(8, 7));
  for (let i = 9; i <= 14; i++) put(i, at(8, 14 - i));
  const data = (fmt ^ 0x5412) >> 10;
  const ecl = data >> 3;
  const mask = data & 7;
  if (ecl !== 0) throw new Error(`expected level M, read ${ecl}`);

  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (r0: number, c0: number, h: number, w: number) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && c >= 0 && r < size && c < size) fn[r]![c] = true;
  };
  mark(0, 0, 9, 9);
  mark(0, size - 8, 9, 8);
  mark(size - 8, 0, 8, 9);
  mark(6, 0, 1, size);
  mark(0, 6, size, 1);
  const pos = ALIGN[ver]!;
  const inFinder = (r: number, c: number) => (r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9);
  for (const r of pos) for (const c of pos) if (!inFinder(r, c)) mark(r - 2, c - 2, 5, 5);
  if (ver >= 7) {
    mark(0, size - 11, 6, 3);
    mark(size - 11, 0, 3, 6);
  }

  const bits: number[] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let k = 0; k < size; k++) {
      const row = upward ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (fn[row]![c]) continue;
        bits.push(at(row, c) !== maskHit(mask, c, row) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const spec = BLOCKS[ver]!;
  const words: number[] = [];
  for (let i = 0; i + 8 <= spec.total * 8; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const dataTotal = spec.total - spec.blocks * spec.ec;
  const shortData = Math.floor(dataTotal / spec.blocks);
  const longCount = dataTotal % spec.blocks;
  const sizes = Array.from({ length: spec.blocks }, (_, i) => shortData + (i >= spec.blocks - longCount ? 1 : 0));
  const blocks: number[][] = sizes.map(() => []);
  let k = 0;
  for (let i = 0; i < shortData + 1; i++) {
    for (let b = 0; b < spec.blocks; b++) if (i < sizes[b]!) blocks[b]!.push(words[k++]!);
  }
  for (let i = 0; i < spec.ec; i++) for (let b = 0; b < spec.blocks; b++) blocks[b]!.push(words[k++]!);
  const rsOk = blocks.every((b) => syndromesZero(b, spec.ec));
  const dataWords = blocks.flatMap((b, i) => b.slice(0, sizes[i]));

  const stream = dataWords.flatMap((w) => Array.from({ length: 8 }, (_, i) => (w >> (7 - i)) & 1));
  let p = 0;
  const take = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (stream[p++] ?? 0);
    return v;
  };
  if (take(4) !== 4) throw new Error("expected byte mode");
  const len = take(ver <= 9 ? 8 : 16);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = take(8);
  return { text: new TextDecoder().decode(bytes), mask, rsOk };
}

describe("QR encoder", () => {
  it("computes Reed Solomon error correction like the HELLO WORLD 1-M example", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("produces the published level M format strings", () => {
    const table = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
    table.forEach((bits, mask) => expect(formatBits(mask).toString(2).padStart(15, "0")).toBe(bits));
  });

  it("produces the published version 7 information string", () => {
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
  });

  it("knows the level M data capacities", () => {
    expect(dataCodewords(1)).toBe(16);
    expect(dataCodewords(5)).toBe(86);
    expect(dataCodewords(10)).toBe(216);
  });

  it("draws finders, timing and the dark module", () => {
    const qr = encodeQr("https://x.example/e/a");
    const m = qr.modules;
    const s = qr.size;
    for (const [r, c] of [
      [0, 0],
      [0, s - 7],
      [s - 7, 0],
    ] as const) {
      expect(m[r]![c]).toBe(true);
      expect(m[r + 1]![c + 1]).toBe(false);
      expect(m[r + 3]![c + 3]).toBe(true);
    }
    for (let i = 8; i < s - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
    expect(m[s - 8]![8]).toBe(true);
  });

  it("reads back the exact URL for every size an event link can take, with valid error correction", () => {
    const urls = [
      "https://fh.example/e/x",
      "https://fullhouse.someone.workers.dev/e/jazz-on-vinyl-night-abcdefghijkm-xyz23",
      `https://fullhouse.someone.workers.dev/e/${"a".repeat(120)}`,
      `https://x.example/${"b".repeat(190)}`,
    ];
    const versions = new Set<number>();
    for (const url of urls) {
      const qr = encodeQr(url);
      versions.add(qr.version);
      const back = readQr(qr.modules);
      expect(back.text).toBe(url);
      expect(back.mask).toBe(qr.mask);
      expect(back.rsOk).toBe(true);
    }
    expect([...versions].some((v) => v >= 7)).toBe(true);
  });

  it("reads back correctly under every mask", () => {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeQr("https://fullhouse.example/e/night-abcdefghijkm-xyz23", mask);
      expect(readQr(qr.modules).text).toBe("https://fullhouse.example/e/night-abcdefghijkm-xyz23");
    }
  });

  it("refuses text longer than version 10 holds", () => {
    expect(() => encodeQr("x".repeat(400))).toThrow();
  });

  it("draws an SVG with a quiet zone", () => {
    const svg = qrSvg("https://x.example/e/a", "QR code");
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain('fill="#fff"');
  });
});

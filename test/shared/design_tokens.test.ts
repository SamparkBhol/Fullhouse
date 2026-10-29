import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKENS, rootRule } from "../../src/shared/design_tokens.ts";
import { PAGE_CSS } from "../../src/worker/pages/style.ts";

const tokensCss = readFileSync(new URL("../../web/src/styles/tokens.css", import.meta.url), "utf8");

function declared(css: string): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1] as string] = (m[2] as string).trim();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("design tokens", () => {
  it("are the same in the owner app stylesheet and the shared module", () => {
    expect(declared(tokensCss)).toEqual({ ...TOKENS });
  });

  it("open the stylesheet of the event page and poster", () => {
    expect(PAGE_CSS.startsWith(rootRule())).toBe(true);
  });

  it("keep the stone page, the green for your place and the plum for theirs", () => {
    expect(TOKENS).toMatchObject({ page: "#f4f5f2", ink: "#14201a", you: "#0d6a4a", them: "#8a2f63" });
  });

  it("give every text colour at least 4.5 to 1 on the page and on white", () => {
    for (const text of [TOKENS.ink, TOKENS["ink-2"], TOKENS["ink-3"], TOKENS.you, TOKENS.them]) {
      expect(contrast(text, TOKENS.page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, TOKENS.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("#ffffff", TOKENS.you)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", TOKENS.them)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(TOKENS.you, TOKENS["you-tint"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(TOKENS.them, TOKENS["them-tint"])).toBeGreaterThanOrEqual(4.5);
  });
});

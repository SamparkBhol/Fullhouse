import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKENS, rootRule } from "../../src/shared/tokens.ts";
import { PAGE_CSS } from "../../src/worker/pages/style.ts";

const tokensCss = readFileSync(new URL("../../web/src/styles/tokens.css", import.meta.url), "utf8");

function declared(css: string): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1] as string] = (m[2] as string).trim();
  return out;
}

describe("design tokens", () => {
  it("are the same in the owner app stylesheet and the shared module", () => {
    expect(declared(tokensCss)).toEqual({ ...TOKENS });
  });

  it("open the stylesheet of the event page and poster", () => {
    expect(PAGE_CSS.startsWith(rootRule())).toBe(true);
  });

  it("keep the colours from the design direction", () => {
    expect(TOKENS).toMatchObject({ street: "#33506e", paper: "#f6d8db", ink: "#1d3150", lit: "#ffc24a" });
  });
});

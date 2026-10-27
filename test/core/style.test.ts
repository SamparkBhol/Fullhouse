import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/core/index.ts";

const root = new URL("../../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const owned = [...files(join(root, "src/core")), ...files(join(root, "test/core")), ...files(join(root, "test/fixtures"))];

describe("house rules for core files", () => {
  it("has no em or en dashes, and no banned words", () => {
    for (const f of owned) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/[\u2013\u2014]/);
      for (const w of BANNED_WORDS) expect(text.toLowerCase().includes(w), `${f} ${w}`).toBe(false);
    }
  });

  it("has no spaced hyphen used as a dash in comments or strings meant for people", () => {
    for (const f of owned) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        const comment = line.match(/\/\/(.*)$/)?.[1] ?? "";
        expect(comment, `${f}:${i + 1}`).not.toMatch(/\s-\s/);
        for (const s of line.match(/"[^"]*"|`[^`]*`/g) ?? []) {
          if (/\$\{[^}]*\s-\s/.test(s)) continue;
          expect(s, `${f}:${i + 1}`).not.toMatch(/[A-Za-z]\s-\s[A-Za-z]/);
        }
      });
    }
  });

  it("keeps production core free of test and e2e imports", () => {
    for (const f of files(join(root, "src/core"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/from\s+["'][^"']*(test|e2e|fixtures)\//);
    }
  });
});

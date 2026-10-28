// Usage: no-ai-config.ts <wrangler.toml> <out.toml>
// Writes a copy of the Worker config without the [ai] binding, with its paths rebased to the new folder.
// Local runs use it when the remote AI binding is not wanted, so the app takes its template copy path.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const PATH_KEYS = new Set(["main", "directory"]);

function withoutAi(toml: string, fromDir: string, toDir: string): string {
  const out: string[] = [];
  let inAi = false;
  for (const line of toml.split("\n")) {
    const table = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(line);
    if (table) inAi = table[1]?.trim() === "ai";
    if (inAi) continue;
    const kv = /^(\s*)([A-Za-z_]+)(\s*=\s*)"([^"]+)"(.*)$/.exec(line);
    if (kv && PATH_KEYS.has(kv[2] ?? "")) {
      const rebased = relative(toDir, resolve(fromDir, kv[4] ?? "")) || ".";
      out.push(`${kv[1]}${kv[2]}${kv[3]}"${rebased}"${kv[5]}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error("no-ai-config needs the source config and the output path");
  process.exit(2);
}
const from = resolve(source);
const to = resolve(target);
writeFileSync(to, withoutAi(readFileSync(from, "utf8"), dirname(from), dirname(to)));

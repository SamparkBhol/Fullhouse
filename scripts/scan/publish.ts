import { readFileSync } from "node:fs";

const [recordPath, secretPath, site] = process.argv.slice(2);
if (!recordPath || !secretPath || !site) throw new Error("usage: publish <record.json> <token secret file> <site origin>");
if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) throw new Error("the site must be https, or http on loopback");
const secret = readFileSync(secretPath, "utf8").trim();
if (!secret) throw new Error("the token secret file is empty");
const body = readFileSync(recordPath, "utf8");
JSON.parse(body);

const res = await fetch(`${site.replace(/\/+$/, "")}/api/admin/scan`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
  body,
});
const text = await res.text();
console.log(`${res.status} ${text.slice(0, 300)}`);
if (res.status !== 201) process.exit(1);
const check = await fetch(`${site.replace(/\/+$/, "")}/api/scan`, { headers: { accept: "application/json" } });
const stored = (await check.json()) as { scan: { at: string; overall: { venues: number } } | null };
console.log(stored.scan ? `stored scan of ${stored.scan.at}, ${stored.scan.overall.venues} venues` : "no scan stored");

import { writeFileSync } from "node:fs";
import { startFakeQloo } from "./server.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const apiKey = process.env.FAKE_QLOO_KEY ?? "";
const fake = await startFakeQloo({ apiKey, port: Number(arg("port") ?? 0) });
const urlFile = arg("url-file");
if (urlFile) writeFileSync(urlFile, `${fake.url}\n`);
console.log(`fake Qloo listening on ${fake.url}`);

const stop = (): void => {
  void fake.close().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

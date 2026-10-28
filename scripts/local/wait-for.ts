// Usage: wait-for.ts <url> [seconds]. Exits 0 once the url answers 2xx, 1 when time runs out.
const [url, seconds = "60"] = process.argv.slice(2);
if (!url) {
  console.error("wait-for needs a url");
  process.exit(2);
}
const deadline = Date.now() + Number(seconds) * 1000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) process.exit(0);
  } catch {
    // Not listening yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
console.error(`${url} did not answer within ${seconds} s`);
process.exit(1);

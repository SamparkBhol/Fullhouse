// Usage: wait-for.ts <url> [seconds] [pid]. Exits 0 once the url answers 2xx, 1 when time runs out or the pid exits.
export {};

const [url, seconds = "60", pid] = process.argv.slice(2);
if (!url) {
  console.error("wait-for needs a url");
  process.exit(2);
}

function alive(p: number): boolean {
  try {
    process.kill(p, 0);
    return true;
  } catch {
    return false;
  }
}

const deadline = Date.now() + Number(seconds) * 1000;
while (Date.now() < deadline) {
  if (pid && !alive(Number(pid))) {
    console.error(`the process serving ${url} exited`);
    process.exit(1);
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) process.exit(0);
  } catch {
    // Not listening yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
console.error(`${url} did not answer within ${seconds} s`);
process.exit(1);

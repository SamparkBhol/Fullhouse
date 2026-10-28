import type { Grid } from "./layout.ts";

export function maskHit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

export function applyMask(g: Grid, mask: number): void {
  for (let y = 0; y < g.size; y++) {
    const row = g.modules[y];
    if (!row) continue;
    for (let x = 0; x < g.size; x++) {
      if (!g.fn[y]?.[x] && maskHit(mask, x, y)) row[x] = !row[x];
    }
  }
}

export function penalty(g: Grid): number {
  const size = g.size;
  let result = 0;
  const addHistory = (run: number, history: number[]): void => {
    if (history[0] === 0) run += size;
    history.pop();
    history.unshift(run);
  };
  const countPatterns = (h: number[]): number => {
    const n = h[1] ?? 0;
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && (h[0] ?? 0) >= n * 4 && (h[6] ?? 0) >= n ? 1 : 0) + (core && (h[6] ?? 0) >= n * 4 && (h[0] ?? 0) >= n ? 1 : 0);
  };
  const terminate = (color: boolean, run: number, history: number[]): number => {
    if (color) {
      addHistory(run, history);
      run = 0;
    }
    run += size;
    addHistory(run, history);
    return countPatterns(history);
  };
  for (const vertical of [false, true]) {
    for (let a = 0; a < size; a++) {
      let color = false;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        const m = vertical ? g.get(a, b) : g.get(b, a);
        if (m === color) {
          run++;
          if (run === 5) result += 3;
          else if (run > 5) result++;
        } else {
          addHistory(run, history);
          if (!color) result += countPatterns(history) * 40;
          color = m;
          run = 1;
        }
      }
      result += terminate(color, run, history) * 40;
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = g.get(x, y);
      if (c === g.get(x + 1, y) && c === g.get(x, y + 1) && c === g.get(x + 1, y + 1)) result += 3;
    }
  }
  let dark = 0;
  for (const row of g.modules) for (const m of row) if (m) dark++;
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return result;
}

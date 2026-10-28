// Function patterns, format and version bits, and the zigzag placement of the codewords.
const FORMAT_BITS_M = 0;

export function formatBits(mask: number): number {
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

export class Grid {
  readonly modules: boolean[][];
  readonly fn: boolean[][];
  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  setFn(x: number, y: number, dark: boolean): void {
    const row = this.modules[y];
    const frow = this.fn[y];
    if (!row || !frow) return;
    row[x] = dark;
    frow[x] = true;
  }
  get(x: number, y: number): boolean {
    return this.modules[y]?.[x] ?? false;
  }
}

export function drawFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const size = g.size;
  for (let i = 0; i <= 5; i++) g.setFn(8, i, bit(bits, i));
  g.setFn(8, 7, bit(bits, 6));
  g.setFn(8, 8, bit(bits, 7));
  g.setFn(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) g.setFn(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) g.setFn(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) g.setFn(8, size - 15 + i, bit(bits, i));
  g.setFn(8, size - 8, true);
}

export function drawFunctionPatterns(g: Grid, ver: number): void {
  const size = g.size;
  for (let i = 0; i < size; i++) {
    g.setFn(6, i, i % 2 === 0);
    g.setFn(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) g.setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const pos = alignmentPositions(ver);
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      const cx = pos[i] ?? 0;
      const cy = pos[j] ?? 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) g.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(g, 0);
  if (ver >= 7) {
    const bits = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const dark = bit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.setFn(a, b, dark);
      g.setFn(b, a, dark);
    }
  }
}

export function drawCodewords(g: Grid, data: number[]): void {
  const size = g.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        const row = g.modules[y];
        if (row && !g.fn[y]?.[x] && i < data.length * 8) {
          row[x] = bit(data[i >>> 3] ?? 0, 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

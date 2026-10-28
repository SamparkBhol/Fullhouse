import { encodeQr } from "./encode.ts";

export function qrSvg(text: string, label: string): string {
  const qr = encodeQr(text);
  const quiet = 4;
  const dim = qr.size + quiet * 2;
  let path = "";
  qr.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="${label.replace(/[<>&"]/g, "")}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

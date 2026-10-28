// Charts are drawn at the width they are given, so text stays at its real size and gaps stay 2 px.
// The host redraws when its width changes and stops listening once it leaves the page.
export function fitChart(host: HTMLElement, draw: (width: number) => Node): void {
  let last = -1;
  const render = (width: number): void => {
    const w = Math.floor(width);
    if (w <= 0 || w === last) return;
    last = w;
    host.replaceChildren(draw(w));
  };
  if (typeof ResizeObserver === "undefined") {
    requestAnimationFrame(() => render(host.clientWidth || 320));
    return;
  }
  const observer = new ResizeObserver((entries) => {
    if (!host.isConnected) {
      observer.disconnect();
      return;
    }
    const entry = entries[entries.length - 1];
    if (entry) render(entry.contentRect.width);
  });
  observer.observe(host);
}

export interface IcsComponent {
  name: string;
  props: Map<string, string>;
  children: IcsComponent[];
}

// RFC 5545: CRLF line ends, folded lines continue after one space or tab, and every BEGIN has its END.
export function parseIcs(text: string): IcsComponent {
  if (!text.endsWith("\r\n") || /(?<!\r)\n/.test(text)) throw new Error("lines must end with CRLF");
  const raw = text.slice(0, -2).split("\r\n");
  const lines: string[] = [];
  for (const line of raw) {
    if (new TextEncoder().encode(line).length > 75) throw new Error(`line longer than 75 octets: ${line.slice(0, 30)}`);
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  const root: IcsComponent = { name: "", props: new Map(), children: [] };
  const stack = [root];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`not a content line: ${line}`);
    const key = line.slice(0, colon).split(";")[0] as string;
    const value = line.slice(colon + 1);
    const top = stack[stack.length - 1] as IcsComponent;
    if (key === "BEGIN") {
      const child = { name: value, props: new Map(), children: [] };
      top.children.push(child);
      stack.push(child);
    } else if (key === "END") {
      if (top.name !== value) throw new Error(`END:${value} closes ${top.name}`);
      stack.pop();
    } else {
      top.props.set(key, value);
    }
  }
  if (stack.length !== 1) throw new Error("a component was never closed");
  const [calendar] = root.children;
  if (!calendar || root.children.length !== 1) throw new Error("expected one VCALENDAR");
  return calendar;
}

export function icsDate(value: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!m) throw new Error(`not a UTC date time: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}

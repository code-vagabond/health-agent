// The Google Health API returns each timestamp as UTC (e.g. "2026-06-21T23:26:00Z")
// alongside a sibling "<base>UtcOffset" field (e.g. "7200s" = +2h). The wall-clock
// local time the user actually experienced is UTC + offset. The API never folds
// these together, so `--local` walks the response and, for every `<base>Time` field
// that has a matching `<base>UtcOffset` sibling, adds a `<base>TimeLocal` field with
// the offset applied (e.g. "2026-06-22T01:26:00+02:00"). The original UTC fields are
// left untouched.

function parseOffsetSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(-?\d+)s$/.exec(raw.trim());
  return m ? parseInt(m[1], 10) : null;
}

function toLocalIso(utc: string, offsetSeconds: number): string | null {
  const ms = Date.parse(utc);
  if (Number.isNaN(ms)) return null;
  // Shift the instant by the offset, render as ISO, then swap the trailing `Z`
  // for the explicit offset suffix so the string reads as local wall-clock time.
  const shifted = new Date(ms + offsetSeconds * 1000).toISOString().replace(/(\.\d+)?Z$/, '');
  const sign = offsetSeconds < 0 ? '-' : '+';
  const abs = Math.abs(offsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${shifted}${sign}${hh}:${mm}`;
}

// Recursively adds `<base>TimeLocal` next to any `<base>Time` that has a
// `<base>UtcOffset` sibling. Mutates in place and returns the same node.
export function localizeTimes(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (const item of node) localizeTimes(item);
    return node;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const m = /^(.*)Time$/.exec(key);
      if (m && typeof obj[key] === 'string') {
        const base = m[1];
        const offset = parseOffsetSeconds(obj[`${base}UtcOffset`]);
        if (offset !== null) {
          const local = toLocalIso(obj[key] as string, offset);
          if (local) obj[`${base}TimeLocal`] = local;
        }
      }
      localizeTimes(obj[key]);
    }
    return node;
  }
  return node;
}

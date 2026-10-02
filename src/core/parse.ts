// Parsers for YouTube's display strings. InnerTube is always queried with hl=en,
// so these only need to understand English formatting.

const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/** "21.3M subscribers" → 21300000, "5,728,713,104 views" → 5728713104, "No views" → 0. */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim();
  if (/^no\b/i.test(t)) return 0;
  const m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*([KMB])?\b/i);
  if (!m) return null;
  const num = Number((m[1] as string).replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const mult = m[2] ? (SUFFIX[m[2].toUpperCase()] ?? 1) : 1;
  return Math.round(num * mult);
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** "Joined Mar 21, 2008" / "Mar 21, 2008" → "2008-03-21". */
export function parseDisplayDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[(m[1] as string).toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${(m[2] as string).padStart(2, "0")}`;
}

/** Any parseable date string → ISO-8601 UTC, e.g. "2009-10-24T23:57:33-07:00" → "2009-10-25T06:57:33.000Z". */
export function toUtcIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "1:02:03" → 3723, "12:23" → 743. */
export function parseClock(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** "http://www.youtube.com/@mkbhd" → "@mkbhd". */
export function handleFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/youtube\.com\/(@[^/?#]+)/);
  return m ? decodeURIComponent(m[1] as string) : null;
}

/** Unwrap youtube.com/redirect?q=<target> links from channel "about" panels. */
export function unwrapRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("youtube.com") && u.pathname === "/redirect") {
      return u.searchParams.get("q") ?? url;
    }
  } catch {}
  return url;
}

export interface Chapter {
  title: string;
  startSeconds: number;
}

/**
 * Chapters from description timestamps, following YouTube's own rules:
 * first starts at 0:00, at least 3, ascending.
 */
export function parseDescriptionChapters(description: string | null | undefined): Chapter[] {
  if (!description) return [];
  const chapters: Chapter[] = [];
  for (const line of description.split("\n")) {
    const m = line.match(/^\s*[[(]?((?:\d+:)?\d{1,2}:\d{2})[\])]?\s*[-–—:|]?\s*(.+?)\s*$/);
    if (!m) continue;
    const start = parseClock(m[1]);
    if (start === null) continue;
    const prev = chapters.at(-1);
    if (prev && start <= prev.startSeconds) continue;
    chapters.push({ title: m[2] as string, startSeconds: start });
  }
  if (chapters.length < 3 || chapters[0]?.startSeconds !== 0) return [];
  return chapters;
}

const AGE_UNITS: Record<string, number> = {
  s: 1,
  sec: 1,
  second: 1,
  m: 60,
  min: 60,
  minute: 60,
  h: 3600,
  hr: 3600,
  hour: 3600,
  d: 86400,
  day: 86400,
  w: 7 * 86400,
  wk: 7 * 86400,
  week: 7 * 86400,
  mo: 30 * 86400,
  month: 30 * 86400,
  y: 365 * 86400,
  yr: 365 * 86400,
  year: 365 * 86400,
};

/**
 * "2d ago", "Streamed 8y ago", "3 weeks ago" → approximate ISO timestamp. Listings only
 * expose relative ages, so the result is accurate to about one unit of the given age.
 */
export function parseRelativeAge(text: string | null | undefined, now = Date.now()): string | null {
  if (!text) return null;
  const m = text.match(/(\d+)\s*([a-z]+?)s?\s+ago\b/i);
  if (!m) return null;
  const unit = AGE_UNITS[(m[2] as string).toLowerCase()];
  if (!unit) return null;
  return new Date(now - Number(m[1]) * unit * 1000).toISOString();
}

/** --since value: ISO date/datetime, or a relative span like 30d, 12w, 6mo, 1y. */
export function parseSince(value: string, now = Date.now()): Date | null {
  const rel = value.trim().match(/^(\d+)\s*(d|w|mo|y)$/i);
  if (rel) {
    const unit = AGE_UNITS[(rel[2] as string).toLowerCase()] as number;
    return new Date(now - Number(rel[1]) * unit * 1000);
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

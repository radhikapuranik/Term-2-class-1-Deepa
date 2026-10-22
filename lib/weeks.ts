const DAY = 86_400_000;

export function parseWeek(week: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week.trim());
  if (!m) return null;
  const w = Number(m[2]);
  if (w < 1 || w > 53) return null;
  return { year: Number(m[1]), week: w };
}

/** Monday (UTC) of an ISO week label like 2026-W42. */
export function weekToMonday(week: string): Date | null {
  const p = parseWeek(week);
  if (!p) return null;
  const jan4 = Date.UTC(p.year, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  const week1Monday = jan4 - jan4Dow * DAY;
  const monday = new Date(week1Monday + (p.week - 1) * 7 * DAY);
  return weekLabel(monday) === week.trim() ? monday : null; // rejects W53 in 52-week years
}

export function weekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // Thursday of this week decides the ISO year
  const year = d.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Thursday = jan4 - jan4Dow * DAY + 3 * DAY;
  const week = 1 + Math.round((d.getTime() - week1Thursday) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function addWeeks(week: string, n: number): string {
  const monday = weekToMonday(week);
  if (!monday) throw new Error(`Bad ISO week: ${week}`);
  return weekLabel(new Date(monday.getTime() + n * 7 * DAY));
}

/** The `count` consecutive ISO weeks ending at `last`, oldest first. */
export function weekRange(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addWeeks(last, i - (count - 1)));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekMondayIso(week: string): string | null {
  const m = weekToMonday(week);
  return m ? isoDate(m) : null;
}

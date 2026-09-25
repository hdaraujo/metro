/** Wall-clock parts of an instant in Europe/Lisbon, which is where the timetable's times live. */
export interface LisbonClock {
  /** Calendar date in Lisbon, `YYYY-MM-DD`. */
  date: string;
  /** Day of the week, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Seconds since Lisbon midnight. */
  seconds: number;
}

const lisbonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partsOf(now: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const { type, value } of lisbonParts.formatToParts(now)) parts[type] = value;
  return parts;
}

export function lisbonClock(now: Date): LisbonClock {
  const p = partsOf(now);
  const date = `${p.year}-${p.month}-${p.day}`;
  return {
    date,
    weekday: weekdayOf(date),
    seconds: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second),
  };
}

function utcMidnight(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** Day of the week of a `YYYY-MM-DD` calendar date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(utcMidnight(date)).getUTCDay();
}

/** The calendar date before `date` (`YYYY-MM-DD`). */
export function previousDate(date: string): string {
  return new Date(utcMidnight(date) - 86_400_000).toISOString().slice(0, 10);
}

/** `'25:12:28'` → 90748. Timetable times may run past 24:00 for trips after midnight. */
export function parseServiceTime(time: string): number {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Invalid service time "${time}"`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Lisbon wall-clock time as `HH:MM`, e.g. `'10:42'`. */
export function formatLisbonHM(now: Date): string {
  const p = partsOf(now);
  return `${p.hour}:${p.minute}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Lisbon calendar date as `D Mon YYYY`, e.g. `'5 Sep 2026'`. */
export function formatLisbonDate(instant: Date): string {
  const [year, month, day] = lisbonClock(instant).date.split('-').map(Number);
  return `${day} ${MONTHS[month! - 1]} ${year}`;
}

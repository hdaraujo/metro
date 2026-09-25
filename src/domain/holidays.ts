import { weekdayOf } from './lisbonTime';
import type { DayType } from './types';

const FIXED_HOLIDAYS = [
  '01-01', // Ano Novo
  '04-25', // Dia da Liberdade
  '05-01', // Dia do Trabalhador
  '06-10', // Dia de Portugal
  '08-15', // Assunção de Nossa Senhora
  '10-05', // Implantação da República
  '11-01', // Todos os Santos
  '12-01', // Restauração da Independência
  '12-08', // Imaculada Conceição
  '12-25', // Natal
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Easter Sunday for a Gregorian year (anonymous Gregorian algorithm), as `YYYY-MM-DD`. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const cache = new Map<number, Set<string>>();

/**
 * Portuguese national public holidays for `year`, as `YYYY-MM-DD` dates.
 *
 * The Coimbra municipal holiday (4 July, Rainha Santa Isabel) is deliberately not included: it is
 * an open question whether Metrobus runs the Sunday timetable on that day.
 */
export function portugueseHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const [, easterMonth, easterDay] = easterSunday(year).split('-').map(Number);
  const easterOffset = (days: number) =>
    new Date(Date.UTC(year, easterMonth! - 1, easterDay! + days)).toISOString().slice(0, 10);
  const holidays = new Set([
    ...FIXED_HOLIDAYS.map((monthDay) => `${year}-${monthDay}`),
    easterOffset(-2), // Sexta-feira Santa
    easterOffset(0), // Páscoa
    easterOffset(60), // Corpo de Deus
  ]);
  cache.set(year, holidays);
  return holidays;
}

/** Which timetable runs on a Lisbon calendar date: holidays and Sundays run `Dom`. */
export function dayTypeFor(date: string): DayType {
  if (portugueseHolidays(Number(date.slice(0, 4))).has(date)) return 'Dom';
  const weekday = weekdayOf(date);
  if (weekday === 0) return 'Dom';
  if (weekday === 6) return 'Sab';
  return 'DU';
}

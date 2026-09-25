import { describe, expect, it } from 'vitest';
import { dayTypeFor, easterSunday, portugueseHolidays } from './holidays';

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('computes Easter %d as %s', (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe('portugueseHolidays', () => {
  it('includes the moveable holidays for 2026', () => {
    const holidays = portugueseHolidays(2026);
    expect(holidays.has('2026-04-03')).toBe(true); // Good Friday
    expect(holidays.has('2026-04-05')).toBe(true); // Easter
    expect(holidays.has('2026-06-04')).toBe(true); // Corpus Christi
  });

  it('includes the moveable holidays for 2027', () => {
    const holidays = portugueseHolidays(2027);
    expect(holidays.has('2027-03-26')).toBe(true);
    expect(holidays.has('2027-03-28')).toBe(true);
    expect(holidays.has('2027-05-27')).toBe(true);
  });

  it('includes the fixed holidays', () => {
    const holidays = portugueseHolidays(2026);
    const fixed = ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01'];
    for (const monthDay of [...fixed, '12-08', '12-25']) {
      expect(holidays.has(`2026-${monthDay}`)).toBe(true);
    }
    expect(holidays.size).toBe(13);
  });

  it('does not include the Coimbra municipal holiday', () => {
    expect(portugueseHolidays(2026).has('2026-07-04')).toBe(false);
  });
});

describe('dayTypeFor', () => {
  it('maps weekdays, Saturdays and Sundays', () => {
    expect(dayTypeFor('2026-09-23')).toBe('DU'); // Wednesday
    expect(dayTypeFor('2026-09-26')).toBe('Sab');
    expect(dayTypeFor('2026-09-27')).toBe('Dom');
  });

  it('runs the Sunday timetable on holidays', () => {
    expect(dayTypeFor('2026-10-05')).toBe('Dom'); // Monday holiday
    expect(dayTypeFor('2026-04-03')).toBe('Dom'); // Good Friday
    expect(dayTypeFor('2026-08-15')).toBe('Dom'); // Saturday holiday
  });
});

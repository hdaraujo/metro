import { describe, expect, it } from 'vitest';
import {
  formatLisbonDate,
  formatLisbonHM,
  lisbonClock,
  parseServiceTime,
  previousDate,
  weekdayOf,
} from './lisbonTime';

describe('lisbonClock', () => {
  it('uses UTC+1 in summer', () => {
    expect(lisbonClock(new Date('2026-07-15T09:30:15Z'))).toEqual({
      date: '2026-07-15',
      weekday: 3,
      seconds: 10 * 3600 + 30 * 60 + 15,
    });
  });

  it('uses UTC+0 in winter', () => {
    expect(lisbonClock(new Date('2026-01-15T09:30:15Z'))).toEqual({
      date: '2026-01-15',
      weekday: 4,
      seconds: 9 * 3600 + 30 * 60 + 15,
    });
  });

  it('rolls the date over at Lisbon midnight, not UTC midnight', () => {
    const clock = lisbonClock(new Date('2026-07-15T23:30:00Z'));
    expect(clock.date).toBe('2026-07-16');
    expect(clock.seconds).toBe(30 * 60);
  });

  it('handles the spring DST changeover (29 March 2026, 01:00 → 02:00)', () => {
    expect(lisbonClock(new Date('2026-03-29T00:59:59Z')).seconds).toBe(59 * 60 + 59);
    expect(lisbonClock(new Date('2026-03-29T01:00:00Z')).seconds).toBe(2 * 3600);
  });

  it('handles the autumn DST changeover (25 October 2026, 02:00 → 01:00)', () => {
    expect(lisbonClock(new Date('2026-10-25T00:30:00Z')).seconds).toBe(3600 + 30 * 60);
    expect(lisbonClock(new Date('2026-10-25T01:30:00Z')).seconds).toBe(3600 + 30 * 60);
    expect(lisbonClock(new Date('2026-10-25T02:30:00Z')).seconds).toBe(2 * 3600 + 30 * 60);
  });
});

describe('calendar helpers', () => {
  it('computes the weekday of a date', () => {
    expect(weekdayOf('2026-09-25')).toBe(5);
    expect(weekdayOf('2026-09-27')).toBe(0);
  });

  it('steps back one day across month and year boundaries', () => {
    expect(previousDate('2026-09-25')).toBe('2026-09-24');
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(previousDate('2024-03-01')).toBe('2024-02-29');
    expect(previousDate('2027-01-01')).toBe('2026-12-31');
  });
});

describe('parseServiceTime', () => {
  it('parses times past midnight of the service day', () => {
    expect(parseServiceTime('25:12:28')).toBe(90_748);
  });

  it('parses ordinary times', () => {
    expect(parseServiceTime('00:00:00')).toBe(0);
    expect(parseServiceTime('10:47:04')).toBe(38_824);
  });

  it('rejects malformed times', () => {
    expect(() => parseServiceTime('10:47')).toThrow();
  });
});

describe('formatLisbonHM', () => {
  it('formats Lisbon wall-clock time', () => {
    expect(formatLisbonHM(new Date('2026-09-23T09:42:30Z'))).toBe('10:42');
    expect(formatLisbonHM(new Date('2026-12-23T00:05:00Z'))).toBe('00:05');
  });
});

describe('formatLisbonDate', () => {
  it('formats the Lisbon calendar date as D Mon YYYY', () => {
    expect(formatLisbonDate(new Date('2026-09-05T12:00:00Z'))).toBe('5 Sep 2026');
    expect(formatLisbonDate(new Date('2026-06-30T23:30:00Z'))).toBe('1 Jul 2026');
  });
});

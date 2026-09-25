import { describe, expect, it } from 'vitest';
import { formatCountdown, spokenCountdown } from './countdown';

describe('formatCountdown', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatCountdown(184)).toBe('3:04');
    expect(formatCountdown(45)).toBe('0:45');
  });

  it('does not cap minutes at 59', () => {
    expect(formatCountdown(3785)).toBe('63:05');
  });

  it('clamps zero and negative input to 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-12)).toBe('0:00');
  });
});

describe('spokenCountdown', () => {
  it('spells out minutes and seconds, singular and plural', () => {
    expect(spokenCountdown(184)).toBe('3 minutes 4 seconds');
    expect(spokenCountdown(61)).toBe('1 minute 1 second');
    expect(spokenCountdown(45)).toBe('45 seconds');
    expect(spokenCountdown(120)).toBe('2 minutes');
  });

  it('clamps zero and negative input to 0 seconds', () => {
    expect(spokenCountdown(0)).toBe('0 seconds');
    expect(spokenCountdown(-5)).toBe('0 seconds');
  });
});

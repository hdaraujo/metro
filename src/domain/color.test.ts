import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColor } from './color';

describe('readableTextColor', () => {
  it('gives dark text on the bright U3 green', () => {
    expect(readableTextColor('#00FF40')).toBe('#14161a');
  });

  it('gives white text on the U1 blue', () => {
    expect(readableTextColor('#2B6CC4')).toBe('#ffffff');
  });

  // By WCAG contrast the saturated S1, S2 and U2 colours read better with dark text
  // (S2 #FF0000: 4.53 dark vs 4.00 white), so the higher-contrast rule picks dark for them.
  it.each([
    ['S1', '#0080FF'],
    ['S2', '#FF0000'],
    ['U2', '#FF5349'],
  ])('gives the higher-contrast (dark) text on %s (%s)', (_line, hex) => {
    expect(readableTextColor(hex)).toBe('#14161a');
    expect(contrastRatio(hex, '#14161a')).toBeGreaterThan(contrastRatio(hex, '#ffffff'));
  });

  it('gives white text on dark colours', () => {
    expect(readableTextColor('#dc1a32')).toBe('#ffffff');
    expect(readableTextColor('#14161a')).toBe('#ffffff');
  });

  it('accepts short hex and rejects garbage', () => {
    expect(readableTextColor('#fff')).toBe('#14161a');
    expect(() => readableTextColor('red')).toThrow();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});

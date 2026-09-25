const DARK_TEXT = '#14161a';
const LIGHT_TEXT = '#ffffff';

function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Invalid hex colour "${hex}"`);
  let digits = match[1]!;
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join('');
  const channel = (offset: number) => {
    const c = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** White or near-black text, whichever contrasts more with the background `hex`. */
export function readableTextColor(hex: string): string {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

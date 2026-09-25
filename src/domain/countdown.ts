const wholeSeconds = (seconds: number) => Math.max(0, Math.floor(seconds));

/** 184 → '3:04'; 45 → '0:45'; 3785 → '63:05'. Minutes are not capped at 59. Negative input clamps to 0. */
export function formatCountdown(seconds: number): string {
  const s = wholeSeconds(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** Screen-reader text: 184 → '3 minutes 4 seconds'; 61 → '1 minute 1 second'; 45 → '45 seconds'; 120 → '2 minutes'. */
export function spokenCountdown(seconds: number): string {
  const s = wholeSeconds(seconds);
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  if (minutes === 0) return plural(rest, 'second');
  if (rest === 0) return plural(minutes, 'minute');
  return `${plural(minutes, 'minute')} ${plural(rest, 'second')}`;
}

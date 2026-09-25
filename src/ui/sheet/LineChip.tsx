import { readableTextColor } from '../../domain/color';

export function LineChip({ line, color }: { line: string; color: string }) {
  return (
    <span className="line-chip" style={{ background: color, color: readableTextColor(color) }}>
      {line}
    </span>
  );
}

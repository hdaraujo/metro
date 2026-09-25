import { readableTextColor } from '../../domain/color';
import { BusIcon } from '../icons';
import { ScheduledBadge } from './ScheduledBadge';

export function NearestBusRow({ line, color }: { line: string; color: string }) {
  return (
    <div className="bus-row">
      <div className="bus-row__icon" style={{ background: color, color: readableTextColor(color) }}>
        <BusIcon size={20} />
      </div>
      <div className="bus-row__text">
        <div className="bus-row__title">Nearest bus · {line}</div>
        <div className="bus-row__subtitle">Heading towards this stop</div>
      </div>
      <ScheduledBadge />
    </div>
  );
}

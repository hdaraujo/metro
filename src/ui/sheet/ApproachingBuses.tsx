import { formatCountdown, spokenCountdown } from '../../domain/countdown';
import type { BusPosition, LineId } from '../../domain/types';
import { LineChip } from './LineChip';
import { ScheduledBadge } from './ScheduledBadge';

/** At most this many rows, so the sheet stays compact and leaves the map in view. */
const MAX_ROWS = 4;

interface BusRowProps {
  bus: BusPosition;
  color: string;
  /** Show the Scheduled badge in the row, for when no header badge covers it. */
  badge?: boolean;
}

/** One approaching bus: its line, destination and countdown. */
export function BusRow({ bus, color, badge }: BusRowProps) {
  const seconds = bus.arrivalAtStopSeconds ?? 0;
  return (
    <li className="bus-list__row">
      <LineChip line={bus.line} color={color} />
      <span className="bus-list__destination">to {bus.destination}</span>
      {badge && <ScheduledBadge />}
      <span className="bus-list__time" aria-hidden="true">
        {formatCountdown(seconds)}
      </span>
      <span className="visually-hidden">{spokenCountdown(seconds)} away</span>
    </li>
  );
}

interface ApproachingBusesProps {
  /** The buses heading to the stop, soonest first. */
  buses: readonly BusPosition[];
  colorOf: (line: LineId) => string;
}

/** The buses heading to the nearest stop, each with a countdown, all under one Scheduled badge. */
export function ApproachingBuses({ buses, colorOf }: ApproachingBusesProps) {
  const shown = buses.slice(0, MAX_ROWS);
  return (
    <section className="approaching" aria-labelledby="approaching-title">
      <div className="approaching__header">
        <h2 id="approaching-title" className="approaching__title">
          Heading to this stop
        </h2>
        <ScheduledBadge />
      </div>
      {/* Off: the countdowns tick every second and must not flood the sheet's live region. */}
      <ul className="bus-list" aria-live="off">
        {shown.map((bus) => (
          <BusRow key={bus.tripId} bus={bus} color={colorOf(bus.line)} />
        ))}
      </ul>
    </section>
  );
}

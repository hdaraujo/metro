import { formatCountdown, spokenCountdown } from '../../domain/countdown';
import type { BusPosition, LineId } from '../../domain/types';
import { LineChip } from './LineChip';
import { ScheduledBadge } from './ScheduledBadge';

/** At most this many rows, so the phone sheet never pushes the page into scrolling. */
const MAX_ROWS = 5;

interface ApproachingBusesProps {
  /** The buses heading to the stop, soonest first. */
  buses: readonly BusPosition[];
  colorOf: (line: LineId) => string;
}

/** The buses heading to the nearest stop, each with a countdown, all under one Scheduled badge. */
export function ApproachingBuses({ buses, colorOf }: ApproachingBusesProps) {
  const shown = buses.slice(0, MAX_ROWS);
  const more = buses.length - shown.length;
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
        {shown.map((bus) => {
          const seconds = bus.arrivalAtStopSeconds ?? 0;
          return (
            <li key={bus.tripId} className="bus-list__row">
              <LineChip line={bus.line} color={colorOf(bus.line)} />
              <span className="bus-list__destination">to {bus.destination}</span>
              <span className="bus-list__time" aria-hidden="true">
                {formatCountdown(seconds)}
              </span>
              <span className="visually-hidden">{spokenCountdown(seconds)} away</span>
            </li>
          );
        })}
      </ul>
      {more > 0 && <p className="bus-list__more">+{more} more heading here</p>}
    </section>
  );
}

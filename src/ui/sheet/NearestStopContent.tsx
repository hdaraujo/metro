import { formatDistance } from '../../domain/geo';
import { formatLisbonDate, formatLisbonHM } from '../../domain/lisbonTime';
import type { BusPosition, LineId, Stop } from '../../domain/types';
import { LineChip } from './LineChip';
import { NearestBusRow } from './NearestBusRow';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const FALLBACK_LINE_COLOR = '#1f5fa8';

interface NearestStopContentProps {
  stop: Stop;
  distanceMeters: number;
  lineColors: Record<LineId, string>;
  bus: BusPosition | null;
  /** When the timetable data was fetched, UTC ISO 8601. */
  fetchedAt: string;
  now: Date;
}

export function NearestStopContent({
  stop,
  distanceMeters,
  lineColors,
  bus,
  fetchedAt,
  now,
}: NearestStopContentProps) {
  const colorOf = (line: LineId) => lineColors[line] ?? FALLBACK_LINE_COLOR;
  const fetched = new Date(fetchedAt);
  const stale = now.getTime() - fetched.getTime() > STALE_AFTER_MS;

  return (
    <>
      <div className="stop-heading">
        <div className="eyebrow">{'// NEAREST STOP'}</div>
        <div className="stop-heading__row">
          <h1 className="stop-name">{stop.name}</h1>
          <span className="stop-distance">{formatDistance(distanceMeters)} away</span>
        </div>
      </div>
      <div className="lines-row">
        <span className="lines-row__label">Lines</span>
        {stop.lines.map((line) => (
          <LineChip key={line} line={line} color={colorOf(line)} />
        ))}
      </div>
      {bus && (
        <>
          <div className="rule" />
          <NearestBusRow line={bus.line} color={colorOf(bus.line)} />
          <p className="estimate-note">
            Position estimated from the timetable at {formatLisbonHM(new Date(bus.at))}. Live
            positions replace it once a live feed is available.
            {stale && ` Timetable data from ${formatLisbonDate(fetched)} may be out of date.`}
          </p>
        </>
      )}
    </>
  );
}

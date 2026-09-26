import { formatDistance } from '../../domain/geo';
import { formatLisbonDate } from '../../domain/lisbonTime';
import type { BusPosition, LineId, Stop } from '../../domain/types';
import { ApproachingBuses, BusRow } from './ApproachingBuses';
import { LineChip } from './LineChip';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const FALLBACK_LINE_COLOR = '#1f5fa8';

interface NearestStopContentProps {
  stop: Stop;
  distanceMeters: number;
  lineColors: Record<LineId, string>;
  /** The buses heading to this stop, soonest first. */
  approaching: readonly BusPosition[];
  /** When the timetable data was fetched, UTC ISO 8601. */
  fetchedAt: string;
  now: Date;
  /** The minimised phone sheet: the stop and its soonest bus only. */
  collapsed?: boolean;
}

export function NearestStopContent({
  stop,
  distanceMeters,
  lineColors,
  approaching,
  fetchedAt,
  now,
  collapsed,
}: NearestStopContentProps) {
  const colorOf = (line: LineId) => lineColors[line] ?? FALLBACK_LINE_COLOR;
  const fetched = new Date(fetchedAt);
  const stale = now.getTime() - fetched.getTime() > STALE_AFTER_MS;

  const heading = (
    <div className="stop-heading__row">
      <h1 className="stop-name">{stop.name}</h1>
      <span className="stop-distance">{formatDistance(distanceMeters)} away</span>
    </div>
  );
  const staleNote = stale && (
    <p className="stale-note">
      Timetable data from {formatLisbonDate(fetched)} may be out of date.
    </p>
  );

  if (collapsed) {
    const soonest = approaching[0];
    return (
      <>
        {heading}
        {soonest && (
          // Off: the countdown ticks every second and must not flood the sheet's live region.
          <ul className="bus-list" aria-live="off">
            <BusRow bus={soonest} color={colorOf(soonest.line)} badge />
          </ul>
        )}
        {staleNote}
      </>
    );
  }

  return (
    <>
      <div className="stop-heading">
        <div className="eyebrow">{'// NEAREST STOP'}</div>
        {heading}
      </div>
      <div className="lines-row">
        <span className="lines-row__label">Lines</span>
        {stop.lines.map((line) => (
          <LineChip key={line} line={line} color={colorOf(line)} />
        ))}
      </div>
      {approaching[0] && (
        <>
          <div className="rule" />
          <ApproachingBuses buses={approaching} colorOf={colorOf} />
        </>
      )}
      {staleNote}
    </>
  );
}

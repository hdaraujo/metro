import {
  busesInDirection,
  directionLabel,
  type DirectionAtStop,
  type DirectionFilter,
} from '../../domain/directions';
import { formatDistance } from '../../domain/geo';
import { formatLisbonDate } from '../../domain/lisbonTime';
import type { BusPosition, LineId, Stop } from '../../domain/types';
import { ApproachingBuses, BusRow, NO_BUSES_IN_DIRECTION } from './ApproachingBuses';
import type { StopKind } from '../map/markers';
import { LineChip } from './LineChip';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const FALLBACK_LINE_COLOR = '#1f5fa8';

interface NearestStopContentProps {
  /** The stop shown in the sheet: the nearest one, or one the user tapped on the map. */
  stop: Stop;
  kind: StopKind;
  /** How far the user is from the stop; null when their location is not known. */
  distanceMeters: number | null;
  lineColors: Record<LineId, string>;
  /** The buses heading to this stop, soonest first. */
  approaching: readonly BusPosition[];
  /** Directions this stop is served in (see directionsAtStop). */
  directions: readonly DirectionAtStop[];
  /** The effective filter; always 'both' when the stop is not served in both directions. */
  directionFilter: DirectionFilter;
  onCycleDirection: () => void;
  /** When the timetable data was fetched, UTC ISO 8601. */
  fetchedAt: string;
  now: Date;
  /** The minimised phone sheet: the stop and its soonest bus only. */
  collapsed?: boolean;
}

/**
 * The sheet's stop content, for the nearest stop or a stop the user selected on the map: its name,
 * distance, lines and the buses heading to it.
 */
export function NearestStopContent({
  stop,
  kind,
  distanceMeters,
  lineColors,
  approaching,
  directions,
  directionFilter,
  onCycleDirection,
  fetchedAt,
  now,
  collapsed,
}: NearestStopContentProps) {
  const colorOf = (line: LineId) => lineColors[line] ?? FALLBACK_LINE_COLOR;
  const fetched = new Date(fetchedAt);
  const stale = now.getTime() - fetched.getTime() > STALE_AFTER_MS;
  // The list follows the direction filter; whether the section shows at all does not.
  const shown = busesInDirection(approaching, directionFilter);

  const heading = (
    <div className="stop-heading__row">
      <h1 className="stop-name">{stop.name}</h1>
      {distanceMeters !== null && (
        <span className="stop-distance">{formatDistance(distanceMeters)} away</span>
      )}
    </div>
  );
  const staleNote = stale && (
    <p className="stale-note">
      Timetable data from {formatLisbonDate(fetched)} may be out of date.
    </p>
  );

  if (collapsed) {
    const soonest = shown[0];
    return (
      <>
        {heading}
        {soonest ? (
          // Off: the countdown ticks every second and must not flood the sheet's live region.
          <ul className="bus-list" aria-live="off">
            <BusRow bus={soonest} color={colorOf(soonest.line)} badge />
          </ul>
        ) : (
          approaching[0] && <p className="approaching__empty">{NO_BUSES_IN_DIRECTION}</p>
        )}
        {staleNote}
      </>
    );
  }

  return (
    <>
      <div className="stop-heading">
        <div className="eyebrow">
          {kind === 'selected' ? '// SELECTED STOP' : '// NEAREST STOP'}
        </div>
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
          <ApproachingBuses
            buses={shown}
            colorOf={colorOf}
            direction={
              directions.length === 2
                ? {
                    label: directionLabel(directionFilter, directions),
                    onCycle: onCycleDirection,
                  }
                : undefined
            }
          />
        </>
      )}
      {staleNote}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { dayTypeFor } from '../../domain/holidays';
import { lisbonClock, previousDate } from '../../domain/lisbonTime';
import type { DayType, Network, Trip } from '../../domain/types';
import { fetchTrips, stopIdsByName } from '../../sources/metrobusTimetable';

/** How long to wait before retrying a day type whose trips failed to load. */
const RETRY_AFTER_MS = 60_000;

interface TimetableState {
  /** The network the trips were resolved against; a refreshed network starts from scratch. */
  network?: Network;
  trips: Map<DayType, Trip[]>;
  failedAt: Map<DayType, number>;
}

/** Day types whose trips may be running now: today's, plus yesterday's until 04:00. */
function neededDayTypes(now: Date): DayType[] {
  const clock = lisbonClock(now);
  const needed = new Set([dayTypeFor(clock.date)]);
  if (clock.seconds < 4 * 3600) needed.add(dayTypeFor(previousDate(clock.date)));
  return [...needed];
}

/**
 * Trips for the day types needed at `now`, loaded lazily after the network. The trips are cleared
 * whenever the network is refreshed (every 6 hours), so they are re-read alongside it.
 */
export function useTimetable(
  network: Network | undefined,
  now: Date,
): { tripsByDayType: ReadonlyMap<DayType, readonly Trip[]>; loading: boolean } {
  const [state, setState] = useState<TimetableState>({ trips: new Map(), failedAt: new Map() });
  const inFlight = useRef(new WeakMap<Network, Set<DayType>>());
  const latestNetwork = useRef(network);
  const neededKey = neededDayTypes(now).join(',');

  const current = state.network === network ? state : undefined;
  const nowMs = now.getTime();

  useEffect(() => {
    latestNetwork.current = network;
    if (!network) return;
    const flying = inFlight.current.get(network) ?? new Set<DayType>();
    inFlight.current.set(network, flying);
    const stopIdByName = stopIdsByName(network.stops);
    for (const dayType of neededKey.split(',') as DayType[]) {
      if (current?.trips.has(dayType)) continue;
      const failedAt = current?.failedAt.get(dayType);
      if (failedAt !== undefined && nowMs - failedAt < RETRY_AFTER_MS) continue;
      if (flying.has(dayType)) continue;
      flying.add(dayType);

      const settle = (update: (s: TimetableState) => void) => {
        flying.delete(dayType);
        setState((previous) => {
          // A result for a network that has since been refreshed is dropped.
          if (network !== latestNetwork.current) return previous;
          const base: TimetableState =
            previous.network === network
              ? { network, trips: new Map(previous.trips), failedAt: new Map(previous.failedAt) }
              : { network, trips: new Map(), failedAt: new Map() };
          update(base);
          return base;
        });
      };
      fetchTrips(dayType, stopIdByName).then(
        (trips) =>
          settle((s) => {
            s.trips.set(dayType, trips);
            s.failedAt.delete(dayType);
          }),
        (error: unknown) => {
          console.error(error);
          settle((s) => s.failedAt.set(dayType, Date.now()));
        },
      );
    }
  }, [network, neededKey, current, nowMs]);

  const tripsByDayType = useMemo(() => current?.trips ?? new Map<DayType, Trip[]>(), [current]);
  const loading =
    network !== undefined &&
    neededKey
      .split(',')
      .some((d) => !tripsByDayType.has(d as DayType) && !current?.failedAt.has(d as DayType));

  return { tripsByDayType, loading };
}

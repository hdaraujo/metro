import { MapPinOffIcon } from '../icons';

interface LocationOffContentProps {
  onRetry: () => void;
  /** The minimised phone sheet: the title row only. */
  collapsed?: boolean;
}

export function LocationOffContent({ onRetry, collapsed }: LocationOffContentProps) {
  const row = (
    <div className="notice__row">
      <div className="notice__icon">
        <MapPinOffIcon size={20} />
      </div>
      <h1 className="notice__title">Location is off</h1>
    </div>
  );
  if (collapsed) return row;
  return (
    <>
      {row}
      <p className="notice__text">
        Metro uses your location to find your nearest stop. Allow location for this site in your
        browser, then try again. You can still explore the map.
      </p>
      <button type="button" className="button-primary" onClick={onRetry}>
        Try again
      </button>
    </>
  );
}

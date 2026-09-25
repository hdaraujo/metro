import { MapPinOffIcon } from '../icons';

export function LocationOffContent({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <div className="notice__row">
        <div className="notice__icon">
          <MapPinOffIcon size={20} />
        </div>
        <h1 className="notice__title">Location is off</h1>
      </div>
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

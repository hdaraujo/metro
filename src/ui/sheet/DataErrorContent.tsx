import { MapPinOffIcon } from '../icons';

/** Shown when the stops could not be loaded and there is no earlier copy to fall back on. */
export function DataErrorContent({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <div className="notice__row">
        <div className="notice__icon">
          <MapPinOffIcon size={20} />
        </div>
        <h1 className="notice__title">Couldn't load Metrobus stops</h1>
      </div>
      <p className="notice__text">Check your connection and try again.</p>
      <button type="button" className="button-primary" onClick={onRetry}>
        Try again
      </button>
    </>
  );
}

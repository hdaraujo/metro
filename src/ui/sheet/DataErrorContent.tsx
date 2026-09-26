import { MapPinOffIcon } from '../icons';

interface DataErrorContentProps {
  onRetry: () => void;
  /** The minimised phone sheet: the title row only. */
  collapsed?: boolean;
}

/** Shown when the stops could not be loaded and there is no earlier copy to fall back on. */
export function DataErrorContent({ onRetry, collapsed }: DataErrorContentProps) {
  const row = (
    <div className="notice__row">
      <div className="notice__icon">
        <MapPinOffIcon size={20} />
      </div>
      <h1 className="notice__title">Couldn't load Metrobus stops</h1>
    </div>
  );
  if (collapsed) return row;
  return (
    <>
      {row}
      <p className="notice__text">Check your connection and try again.</p>
      <button type="button" className="button-primary" onClick={onRetry}>
        Try again
      </button>
    </>
  );
}

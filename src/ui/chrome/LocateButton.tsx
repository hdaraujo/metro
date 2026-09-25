import type { GeolocationStatus } from '../hooks/useGeolocation';
import { CrosshairIcon, CrosshairOffIcon } from '../icons';

interface LocateButtonProps {
  status: GeolocationStatus;
  /** Located: re-frame the map. */
  onRecentre: () => void;
  /** Unavailable: ask for the location again. */
  onRetry: () => void;
  className?: string;
}

export function LocateButton({ status, onRecentre, onRetry, className = '' }: LocateButtonProps) {
  const classes = `locate-button ${status === 'unavailable' ? 'locate-button--off' : ''} ${className}`;
  if (status === 'unavailable') {
    return (
      <button
        type="button"
        className={classes.trim()}
        aria-label="Try to find my location"
        onClick={onRetry}
      >
        <CrosshairOffIcon size={22} />
      </button>
    );
  }
  const locating = status === 'locating';
  return (
    <button
      type="button"
      className={classes.trim()}
      aria-label={
        locating ? 'Centre on my location (waiting for location)' : 'Centre on my location'
      }
      disabled={locating}
      onClick={onRecentre}
    >
      <CrosshairIcon size={22} />
    </button>
  );
}

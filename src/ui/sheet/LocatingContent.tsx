import { SpinnerIcon } from '../icons';

export function LocatingContent({ title = 'Finding your location…' }: { title?: string }) {
  return (
    <>
      <div className="locating">
        <div className="locating__row">
          <SpinnerIcon size={20} className="spinner" />
          <h1 className="locating__title">{title}</h1>
        </div>
        <p className="body-text">
          When your browser asks, allow location access so Metro can find the stop nearest to you.
        </p>
      </div>
      <div className="skeleton" aria-hidden="true">
        <div className="eyebrow">{'// NEAREST STOP'}</div>
        <div className="skeleton__bar" />
        <div className="skeleton__chips">
          <div className="skeleton__chip" />
          <div className="skeleton__chip" />
        </div>
      </div>
    </>
  );
}

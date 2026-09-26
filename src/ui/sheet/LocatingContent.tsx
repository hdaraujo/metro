import { SpinnerIcon } from '../icons';

interface LocatingContentProps {
  title?: string;
  /** The minimised phone sheet: the title row only. */
  collapsed?: boolean;
}

export function LocatingContent({
  title = 'Finding your location…',
  collapsed,
}: LocatingContentProps) {
  const row = (
    <div className="locating__row">
      <SpinnerIcon size={20} className="spinner" />
      <h1 className="locating__title">{title}</h1>
    </div>
  );
  if (collapsed) return row;
  return (
    <>
      <div className="locating">
        {row}
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

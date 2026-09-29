import { SwapIcon } from '../icons';

interface DirectionButtonProps {
  /** What the list shows now, e.g. "Both directions" or "To Coimbra B". */
  label: string;
  onCycle: () => void;
}

/** Cycles the approaching list through both directions, one direction and the other. */
export function DirectionButton({ label, onCycle }: DirectionButtonProps) {
  return (
    <button type="button" className="direction-button" onClick={onCycle} title={label}>
      <SwapIcon size={16} />
      <span className="visually-hidden">Direction: </span>
      <span className="direction-button__label">{label}</span>
    </button>
  );
}

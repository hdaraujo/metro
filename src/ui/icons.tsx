/** Inline SVG icons, copied from the approved artboards (24×24 grid, stroked with currentColor). */
import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function Icon({
  size = 24,
  strokeWidth = 1.75,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function BusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M4 11h16" />
      <path d="M8 15h.01" />
      <path d="M16 15h.01" />
      <path d="M6 18v2" />
      <path d="M18 18v2" />
    </Icon>
  );
}

export function CrosshairIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function CrosshairOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <circle cx="12" cy="12" r="7" />
      <path d="m5 5 14 14" />
    </Icon>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  );
}

export function MapPinOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.75 7.09a3 3 0 0 1 2.16 2.16" />
      <path d="M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568" />
      <path d="m2 2 20 20" />
      <path d="M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533" />
      <path d="M9.13 9.13a3 3 0 0 0 3.74 3.74" />
    </Icon>
  );
}

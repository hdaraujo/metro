import type { ReactNode, Ref } from 'react';

interface SheetProps {
  ref?: Ref<HTMLElement>;
  /** `phone`: bottom sheet with a grab handle. `panel`: the desktop floating panel with the title. */
  variant: 'phone' | 'panel';
  label: string;
  busy?: boolean;
  children: ReactNode;
}

export function Sheet({ ref, variant, label, busy, children }: SheetProps) {
  return (
    <section
      ref={ref}
      className={`sheet sheet--${variant}`}
      aria-label={label}
      aria-live="polite"
      aria-busy={busy || undefined}
    >
      {variant === 'phone' ? (
        // Decorative: the sheet is not draggable.
        <div className="sheet__handle" aria-hidden="true" />
      ) : (
        <>
          <div className="panel__title">Metro</div>
          <div className="rule" />
        </>
      )}
      {children}
    </section>
  );
}

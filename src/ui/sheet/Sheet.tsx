import { type PointerEvent, type ReactNode, type Ref } from 'react';

/** How far a vertical swipe must travel, in pixels, to minimise or restore the phone sheet. */
const SWIPE_MIN_PX = 40;

interface SheetProps {
  ref?: Ref<HTMLElement>;
  /** `phone`: bottom sheet with a grab handle. `panel`: the desktop floating panel with the title. */
  variant: 'phone' | 'panel';
  label: string;
  busy?: boolean;
  /** Phone only: the sheet is minimised to its essentials. */
  collapsed?: boolean;
  /** Phone only: makes the handle a toggle and lets a swipe minimise (down) or restore (up). */
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}

export function Sheet({
  ref,
  variant,
  label,
  busy,
  collapsed = false,
  onCollapsedChange,
  children,
}: SheetProps) {
  const collapsible = variant === 'phone' && onCollapsedChange !== undefined;

  // The release is heard on the window, so a swipe still counts when the pointer ends outside the
  // sheet (a mouse is not captured the way a touch is). No pointer capture: it would retarget a
  // child button's click.
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!onCollapsedChange || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    const done = () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onCancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === e.pointerId) done();
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      done();
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (Math.abs(dy) < SWIPE_MIN_PX || Math.abs(dy) <= Math.abs(dx)) return;
      if (dy > 0 && !collapsed) onCollapsedChange(true);
      else if (dy < 0 && collapsed) onCollapsedChange(false);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  let top: ReactNode;
  if (variant === 'panel') {
    top = (
      <>
        <div className="panel__title">Metro</div>
        <div className="rule" />
      </>
    );
  } else if (collapsible) {
    top = (
      <button
        type="button"
        className="sheet__handle-button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand' : 'Minimise'}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <span className="sheet__handle" aria-hidden="true" />
      </button>
    );
  } else {
    // Decorative: without a collapse handler the sheet cannot be minimised.
    top = <div className="sheet__handle" aria-hidden="true" />;
  }

  return (
    <section
      ref={ref}
      className={`sheet sheet--${variant}${collapsed ? ' sheet--collapsed' : ''}`}
      aria-label={label}
      aria-live="polite"
      aria-busy={busy || undefined}
      onPointerDown={collapsible ? onPointerDown : undefined}
    >
      {top}
      {children}
    </section>
  );
}

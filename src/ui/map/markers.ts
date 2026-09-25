/** DOM builders for the map's markers. Styles live in `styles/app.css` (`.marker-*`). */
import { readableTextColor } from '../../domain/color';
import { formatCountdown, spokenCountdown } from '../../domain/countdown';

// The same bus glyph as `BusIcon` in `icons.tsx`, as markup for a non-React element.
const BUS_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M4 11h16"/>' +
  '<path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 18v2"/><path d="M18 18v2"/></svg>';

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

/** The user's position: an 18px blue dot inside a 68px halo. */
export function createUserMarker(): HTMLElement {
  const el = div('marker-user');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Your location');
  return el;
}

/** The nearest stop: a red dot in a halo, with the stop's name in a pill above it. */
export function createStopMarker(name: string): HTMLElement {
  const el = div('marker-stop');
  el.setAttribute('role', 'img');
  el.append(div('marker-stop__dot'), div('marker-stop__label'));
  updateStopMarker(el, name);
  return el;
}

export function updateStopMarker(el: HTMLElement, name: string): void {
  el.setAttribute('aria-label', `Nearest stop: ${name}`);
  const label = el.querySelector<HTMLElement>('.marker-stop__label');
  if (label) label.textContent = name;
}

export interface BusMarkerView {
  line: string;
  color: string;
  destination: string;
  /** Seconds until the bus reaches `stopName`; null when it is not heading there. */
  secondsToStop: number | null;
  stopName: string | null;
  /** Faded: a stop is selected but this bus is not heading to it. */
  dimmed: boolean;
}

/**
 * A bus whose position is estimated from the timetable: a dashed pill in the line colour, so that
 * an estimate never looks like a live position. A bus heading to the selected stop shows its
 * countdown in a tag under the pill.
 */
export function createBusMarker(view: BusMarkerView): HTMLElement {
  const el = div('marker-bus');
  el.setAttribute('role', 'img');
  const pill = div('marker-bus__pill');
  pill.innerHTML = BUS_ICON_SVG;
  pill.append(document.createElement('span'));
  el.append(pill, div('marker-bus__tag'));
  updateBusMarker(el, view);
  return el;
}

export function updateBusMarker(el: HTMLElement, view: BusMarkerView): void {
  const { line, color, destination, secondsToStop, stopName, dimmed } = view;
  const approaching = secondsToStop !== null;
  el.classList.toggle('marker-bus--approaching', approaching);
  el.classList.toggle('marker-bus--dimmed', dimmed);
  el.setAttribute(
    'aria-label',
    approaching
      ? `Scheduled position of line ${line} bus to ${destination}, ${spokenCountdown(secondsToStop)} from ${stopName ?? 'the stop'}`
      : `Scheduled position of line ${line} bus to ${destination}`,
  );

  const pill = el.querySelector<HTMLElement>('.marker-bus__pill');
  if (pill) {
    pill.style.background = color;
    pill.style.color = readableTextColor(color);
    const span = pill.querySelector('span');
    if (span) span.textContent = line;
  }

  const tag = el.querySelector<HTMLElement>('.marker-bus__tag');
  if (!tag) return;
  const time = tag.querySelector<HTMLElement>('.marker-bus__time');
  if (approaching) {
    if (time) {
      time.textContent = formatCountdown(secondsToStop);
    } else {
      const newTime = document.createElement('span');
      newTime.className = 'marker-bus__time';
      newTime.textContent = formatCountdown(secondsToStop);
      tag.replaceChildren(newTime);
    }
    tag.hidden = false;
  } else {
    // No tag at all, rather than an empty yellow box.
    if (tag.hasChildNodes()) tag.replaceChildren();
    tag.hidden = true;
  }
}

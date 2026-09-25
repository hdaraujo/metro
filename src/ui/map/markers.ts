/** DOM builders for the map's markers. Styles live in `styles/app.css` (`.marker-*`). */
import { readableTextColor } from '../../domain/color';

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

/**
 * A bus whose position is estimated from the timetable: a dashed pill in the line colour, with a
 * "Scheduled" tag under it, so that an estimate never looks like a live position.
 */
export function createBusMarker(line: string, color: string): HTMLElement {
  const el = div('marker-bus');
  el.setAttribute('role', 'img');
  const pill = div('marker-bus__pill');
  pill.innerHTML = BUS_ICON_SVG;
  pill.append(document.createElement('span'));
  const tag = div('marker-bus__tag');
  tag.textContent = 'Scheduled';
  el.append(pill, tag);
  updateBusMarker(el, line, color);
  return el;
}

export function updateBusMarker(el: HTMLElement, line: string, color: string): void {
  el.setAttribute('aria-label', `Scheduled position of line ${line} bus`);
  const pill = el.querySelector<HTMLElement>('.marker-bus__pill');
  if (!pill) return;
  pill.style.background = color;
  pill.style.color = readableTextColor(color);
  const span = pill.querySelector('span');
  if (span) span.textContent = line;
}

import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const FIXTURES: Record<string, string> = {
  'stops.json': fixture('stops.json'),
  'route-shapes.json': fixture('route-shapes.json'),
  // Every day type gets the weekday sample; the clock below is a weekday anyway.
  trips: fixture('trips-DU.sample.json'),
};

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Portagem stop, Coimbra. */
const NEAR_PORTAGEM = { latitude: 40.2075, longitude: -8.4307 };
/**
 * Wednesday 23 September 2026, 10:44 in Lisbon. Three buses are running: U1 u1-DU-0-852 to Vale
 * das Flores reaches Portagem at 10:47:04, U1 u1-DU-1-823 to Coimbra B at 10:53:18, and S2
 * s2-DU-0-701 to Serpins passed it at 10:25:35. The sheet also lists the U1 trips that have not
 * left their terminus yet, so its 4 rows alternate: Vale das Flores (10:47:04), Coimbra B
 * (10:53:18), Vale das Flores (u1-DU-0-585, 11:04:04), Coimbra B (u1-DU-1-539, 11:08:18).
 */
const WEEKDAY_10_44_LISBON = new Date('2026-09-23T09:44:00Z');

const U1_TO_VALE_DAS_FLORES = /^Scheduled position of line U1 bus to Vale das Flores, /;
const U1_TO_COIMBRA_B = /^Scheduled position of line U1 bus to Coimbra B, /;
const S2_TO_SERPINS = 'Scheduled position of line S2 bus to Serpins';

// ---------- Where things are on screen ----------
// Stops are drawn on the map's canvas, not as DOM elements, so a test works out where a stop is
// from the DOM markers whose coordinates it knows.

interface Coords {
  lat: number;
  lng: number;
}
interface Pixel {
  x: number;
  y: number;
}
interface Anchor {
  coords: Coords;
  pixel: Pixel;
}
type Projector = (coords: Coords) => Pixel;

const STOPS: { name: string; coords: Coords }[] = JSON.parse(fixture('stops.json'));
function stopCoords(name: string): Coords {
  const stop = STOPS.find((s) => s.name === name);
  if (!stop) throw new Error(`No stop named ${name} in the fixture`);
  return stop.coords;
}

/** Web Mercator as MapLibre draws it (512px tiles), on a world `worldSize` pixels wide. */
function worldPx({ lat, lng }: Coords, worldSize: number): Pixel {
  const phi = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * worldSize,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * worldSize,
  };
}

/** Projects linearly from `origin`, on a world `worldSize` pixels wide. The map never rotates. */
function projectorFrom(origin: Anchor, worldSize: number): Projector {
  const o = worldPx(origin.coords, worldSize);
  return (coords) => {
    const p = worldPx(coords, worldSize);
    return { x: origin.pixel.x + p.x - o.x, y: origin.pixel.y + p.y - o.y };
  };
}

/** The current camera, worked out from two markers on screen. */
function projectorFromAnchors(a: Anchor, b: Anchor): Projector {
  const pa = worldPx(a.coords, 1);
  const pb = worldPx(b.coords, 1);
  const worldSize =
    Math.hypot(a.pixel.x - b.pixel.x, a.pixel.y - b.pixel.y) / Math.hypot(pa.x - pb.x, pa.y - pb.y);
  return projectorFrom(a, worldSize);
}

/** The map's opening camera: centred on Coimbra at zoom 13, before any framing. */
function initialProjector(viewport: { width: number; height: number }): Projector {
  return projectorFrom(
    {
      coords: { lat: 40.2056, lng: -8.4196 },
      pixel: { x: viewport.width / 2, y: viewport.height / 2 },
    },
    512 * 2 ** 13,
  );
}

async function centreOf(locator: Locator): Promise<Pixel> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The marker has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function anchor(locator: Locator, coords: Coords): Promise<Anchor> {
  return { coords, pixel: await centreOf(locator) };
}

/** The part of the map the UI leaves clear: above the phone sheet, right of the desktop panel. */
async function visibleMapArea(page: Page, testInfo: TestInfo) {
  const viewport = page.viewportSize()!;
  const mobile = testInfo.project.name === 'mobile';
  return {
    left: mobile ? 0 : 24 + 380,
    right: viewport.width,
    top: 0,
    bottom: mobile ? (await page.locator('.sheet').boundingBox())!.y : viewport.height,
  };
}

/** Waits until every marker sits inside the visible map area. */
async function expectFramed(page: Page, testInfo: TestInfo, markers: Locator[]) {
  for (const marker of markers) await expect(marker).toBeVisible();
  await expect(async () => {
    const area = await visibleMapArea(page, testInfo);
    for (const marker of markers) {
      const { x, y } = await centreOf(marker);
      expect(x).toBeGreaterThan(area.left);
      expect(x).toBeLessThan(area.right);
      expect(y).toBeGreaterThan(area.top);
      expect(y).toBeLessThan(area.bottom);
    }
  }).toPass();
}

/**
 * A point of the visible map at least 48px from every stop, where the map itself takes the click
 * (not the wordmark, the locate button or the attribution).
 */
async function emptyMapPoint(page: Page, testInfo: TestInfo, project: Projector): Promise<Pixel> {
  const area = await visibleMapArea(page, testInfo);
  const stops = STOPS.map((s) => project(s.coords));
  const candidates: Pixel[] = [];
  for (let y = 80; y < area.bottom; y += 20) {
    for (let x = area.left + 20; x < area.right; x += 20) {
      if (stops.every((s) => Math.hypot(s.x - x, s.y - y) >= 48)) candidates.push({ x, y });
    }
  }
  const point = await page.evaluate(
    (points) =>
      points.find(({ x, y }) =>
        document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'),
      ) ?? null,
    candidates,
  );
  if (!point) throw new Error('No empty point on the map');
  return point;
}

/**
 * Clicks Parque and waits for it to be selected. Parque is at least 630 m from any other stop, so
 * it is a reliable target; the click is repeated until the map has drawn the stops.
 */
async function selectParque(page: Page, project: Projector): Promise<Locator> {
  const { x, y } = project(stopCoords('Parque'));
  const sheet = page.getByRole('region', { name: 'Selected stop' });
  await expect(async () => {
    await page.mouse.click(x, y);
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  return sheet;
}

async function stubNetwork(page: Page) {
  await page.route('https://planearviagem.metromondego.pt/data/**', (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const body = file.startsWith('trips-') ? FIXTURES.trips : FIXTURES[file];
    if (body === undefined) return route.fulfill({ status: 404 });
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
  );
}

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
  await page.clock.install({ time: WEEKDAY_10_44_LISBON });
});

test.describe('located near Portagem', () => {
  test.use({ geolocation: NEAR_PORTAGEM, permissions: ['geolocation'] });

  test('shows the nearest stop and every scheduled bus', async ({ page }) => {
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('// NEAREST STOP')).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    await expect(sheet.getByText(/\d+ m away/)).toBeVisible();
    for (const line of ['S1', 'S2', 'U1', 'U2']) {
      await expect(sheet.locator('.lines-row').getByText(line, { exact: true })).toBeVisible();
    }
    await expect(
      sheet.getByRole('heading', { level: 2, name: 'Heading to this stop' }),
    ).toBeVisible();
    const rows = sheet.getByRole('listitem');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('to Vale das Flores');
    await expect(rows.nth(1)).toContainText('to Coimbra B');
    await expect(rows.nth(2)).toContainText('to Vale das Flores');
    await expect(rows.nth(3)).toContainText('to Coimbra B');
    await expect(sheet.getByText('Scheduled', { exact: true })).toHaveCount(1);
    await expect(sheet.getByText(/more heading here/)).toHaveCount(0);
    await expect(sheet.getByText(/Estimated at/)).toHaveCount(0);

    await expect(
      page.getByRole('button', { name: 'Centre on my location', exact: true }),
    ).toBeEnabled();

    await expect(page.getByRole('img', { name: /^Scheduled position of line/ })).toHaveCount(3);
    const approachingMarker = page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES });
    await expect(approachingMarker).toBeVisible();
    await expect(approachingMarker).toHaveClass(/marker-bus--approaching/);
    await expect(approachingMarker.locator('.marker-bus__time')).toHaveText(/^\d+:\d{2}$/);
    await expect(approachingMarker.locator('.marker-bus__tag')).toHaveText(/^\d+:\d{2}$/);
    await expect(approachingMarker).not.toContainText('Scheduled');
    const passedMarker = page.getByRole('img', { name: S2_TO_SERPINS, exact: true });
    await expect(passedMarker).toBeAttached();
    await expect(passedMarker).toHaveClass(/marker-bus--dimmed/);
    await expect(passedMarker.locator('.marker-bus__time')).toHaveCount(0);
    await expect(passedMarker.locator('.marker-bus__tag')).toBeHidden();
    await expect(passedMarker).not.toContainText('Scheduled');
    // No bus on the map carries the word; the sheet's single badge covers the list.
    await expect(page.locator('.marker-bus').getByText('Scheduled')).toHaveCount(0);
    const stopMarker = page.getByRole('img', { name: 'Nearest stop: Portagem' });
    await expect(stopMarker).toBeVisible();

    // The user is about 4 m from Portagem, so both markers are drawn at the same spot.
    const centre = async (box: ReturnType<typeof stopMarker.boundingBox>) => {
      const b = (await box)!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const user = await centre(page.getByRole('img', { name: 'Your location' }).boundingBox());
    const stop = await centre(stopMarker.boundingBox());
    expect(Math.hypot(user.x - stop.x, user.y - stop.y)).toBeLessThan(10);
  });

  test.describe('default view', () => {
    // Without animation, `fitBounds` lands on the final frame at once.
    test.use({ reducedMotion: 'reduce' });

    test('default view frames the stop and the soonest bus in each direction', async ({
      page,
    }, testInfo) => {
      await page.goto('/');
      const sheet = page.getByRole('region', { name: 'Nearest stop' });
      await expect(sheet).toBeVisible();
      const markers = [
        page.getByRole('img', { name: 'Nearest stop: Portagem' }),
        page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES }),
        page.getByRole('img', { name: U1_TO_COIMBRA_B }),
      ];
      for (const marker of markers) await expect(marker).toBeVisible();

      const viewport = page.viewportSize()!;
      const mobile = testInfo.project.name === 'mobile';
      await expect(async () => {
        const sheetTop = mobile ? (await sheet.boundingBox())!.y : viewport.height;
        const panelRight = mobile ? 0 : 24 + 380;
        for (const marker of markers) {
          const box = (await marker.boundingBox())!;
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          expect(x).toBeGreaterThan(panelRight);
          expect(x).toBeLessThan(viewport.width);
          expect(y).toBeGreaterThan(0);
          expect(y).toBeLessThan(sheetTop);
        }
      }).toPass();
    });
  });

  test('the map loads and the locate button re-frames without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Nearest stop' })).toBeVisible();
    await expect(page.getByText('Heading to this stop')).toBeVisible();
    await page.getByRole('button', { name: 'Centre on my location', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Your location' })).toBeVisible();
    // Includes MapLibre's "Worker failed to load", which would leave the routes and stops undrawn.
    expect(errors).toEqual([]);
  });

  test('countdown ticks every second', async ({ page }) => {
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet.getByRole('listitem').first()).toBeVisible();
    const sheetTime = sheet.locator('.bus-list__time').first();
    const marker = page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES });
    // The map (and so its markers) must finish loading before the clock is paused.
    await expect(marker).toBeVisible();
    const markerTime = marker.locator('.marker-bus__time');

    // u1-DU-0-852 reaches Portagem at 10:47:04. Pause a minute in, well after loading has finished.
    await page.clock.pauseAt(new Date('2026-09-23T09:45:00Z'));
    await expect(sheetTime).toHaveText('2:04');
    await expect(markerTime).toHaveText('2:04');
    await page.clock.runFor(1000);
    await expect(sheetTime).toHaveText('2:03');
    await expect(markerTime).toHaveText('2:03');
  });

  test('desktop: renders inside the 380px panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop layout only');
    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Nearest stop' });
    await expect(panel.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    await expect(panel.getByText('Metro', { exact: true })).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.width).toBe(380);
    expect(box?.x).toBe(24);
    expect(box?.y).toBe(24);
  });

  test('phone: renders in the bottom sheet under the wordmark', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box?.width).toBe(viewport.width);
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(viewport.height);
    await expect(page.getByText('Metro', { exact: true })).toBeVisible();
  });

  test('phone: the page stays clear of the system bars', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    // With `viewport-fit=cover`, some Android phones hid the sheet's last rows under the
    // navigation bar while reporting no safe-area inset.
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).not.toContain('viewport-fit=cover');
  });

  test('phone: the sheet minimises and restores', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet.getByRole('listitem')).toHaveCount(4);
    const expandedHeight = (await sheet.boundingBox())!.height;

    const minimise = sheet.getByRole('button', { name: 'Minimise' });
    await expect(minimise).toHaveAttribute('aria-expanded', 'true');
    await minimise.click();

    const expand = sheet.getByRole('button', { name: 'Expand' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    const rows = sheet.getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('to Vale das Flores');
    await expect(sheet.getByText('Scheduled', { exact: true })).toHaveCount(1);
    await expect(sheet.getByText('// NEAREST STOP')).toHaveCount(0);
    await expect(
      sheet.getByRole('heading', { level: 2, name: 'Heading to this stop' }),
    ).toHaveCount(0);
    expect((await sheet.boundingBox())!.height).toBeLessThan(expandedHeight);

    await expand.click();
    await expect(sheet.getByRole('listitem')).toHaveCount(4);
    await expect(
      sheet.getByRole('heading', { level: 2, name: 'Heading to this stop' }),
    ).toBeVisible();
  });

  test('phone: swiping the sheet minimises and restores it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet.getByRole('listitem')).toHaveCount(4);

    const swipe = async (fromY: (box: { y: number; height: number }) => number, dy: number) => {
      const box = (await sheet.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = fromY(box);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy, { steps: 5 });
      await page.mouse.up();
    };

    await swipe((box) => box.y + 60, 120);
    await expect(sheet.getByRole('button', { name: 'Expand' })).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(1);

    await swipe((box) => box.y + box.height / 2, -120);
    await expect(sheet.getByRole('button', { name: 'Minimise' })).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(4);
  });

  test('cycles the direction filter', async ({ page }) => {
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    const button = sheet.getByRole('button', { name: /^Direction: / });
    const rows = sheet.getByRole('listitem');
    await expect(button).toHaveAccessibleName('Direction: Both directions');
    await expect(rows).toHaveCount(4);

    await button.click();
    await expect(button).toHaveAccessibleName(/^Direction: To Vale das Flores/);
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) await expect(row).toContainText('to Vale das Flores');

    await button.click();
    await expect(button).toHaveAccessibleName('Direction: To Coimbra B');
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) await expect(row).toContainText('to Coimbra B');
    // The map is not filtered: every bus stays, and the other direction keeps its countdown.
    await expect(page.getByRole('img', { name: /^Scheduled position of line/ })).toHaveCount(3);
    await expect(
      page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES }).locator('.marker-bus__tag'),
    ).toHaveText(/^\d+:\d{2}$/);
    await expect(
      page.getByRole('img', { name: U1_TO_COIMBRA_B }).locator('.marker-bus__tag'),
    ).toHaveText(/^\d+:\d{2}$/);

    await button.click();
    await expect(button).toHaveAccessibleName('Direction: Both directions');
    await expect(rows).toHaveCount(4);
  });

  test('phone: the minimised sheet follows the direction filter', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    const button = sheet.getByRole('button', { name: /^Direction: / });
    await expect(button).toHaveAccessibleName('Direction: Both directions');
    await button.click();
    await button.click();
    await expect(button).toHaveAccessibleName('Direction: To Coimbra B');

    await sheet.getByRole('button', { name: 'Minimise' }).click();
    await expect(sheet.getByRole('button', { name: 'Expand' })).toBeVisible();
    const rows = sheet.getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('to Coimbra B');
    await expect(rows.getByText('Scheduled', { exact: true })).toHaveCount(1);
    await expect(button).toHaveCount(0);

    await sheet.getByRole('button', { name: 'Expand' }).click();
    await expect(button).toHaveAccessibleName('Direction: To Coimbra B');
  });

  test('desktop: the panel has no minimise control', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop layout only');
    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Nearest stop' });
    await expect(panel.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Minimise|Expand/ })).toHaveCount(0);
  });

  test('buses draw beneath the sheet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Nearest stop' })).toBeVisible();
    await expect(page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES })).toBeVisible();
    // No tick may move the markers while one is placed over the sheet.
    await page.clock.pauseAt(new Date('2026-09-23T09:45:00Z'));

    const sheetOnTop = await page.evaluate(() => {
      const marker = document.querySelector<HTMLElement>('.marker-bus--approaching')!;
      const sheet = document.querySelector<HTMLElement>('.sheet')!;
      // Markers ignore the pointer, which `elementFromPoint` would skip over.
      marker.style.pointerEvents = 'auto';
      const m = marker.getBoundingClientRect();
      const s = sheet.getBoundingClientRect();
      const cx = s.left + s.width / 2;
      const cy = s.top + s.height / 2;
      const dx = cx - (m.left + m.width / 2);
      const dy = cy - (m.top + m.height / 2);
      marker.style.transform = `translate(${dx}px, ${dy}px) ${marker.style.transform}`;
      return document.elementFromPoint(cx, cy)?.closest('.sheet') !== null;
    });
    expect(sheetOnTop).toBe(true);
  });
});

/** About 200 m south of Portagem, which is still the nearest stop; the next one is 520 m away. */
const SOUTH_OF_PORTAGEM = { latitude: 40.2057, longitude: -8.4307 };

test.describe('selecting a stop', () => {
  // Without animation, `fitBounds` lands on the final frame at once.
  test.use({
    geolocation: SOUTH_OF_PORTAGEM,
    permissions: ['geolocation'],
    reducedMotion: 'reduce',
  });

  const userCoords = { lat: SOUTH_OF_PORTAGEM.latitude, lng: SOUTH_OF_PORTAGEM.longitude };

  /** Opens the app, waits for the default framing and returns its projector. */
  async function openDefaultView(page: Page, testInfo: TestInfo): Promise<Projector> {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Nearest stop' })).toBeVisible();
    const user = page.getByRole('img', { name: 'Your location' });
    const portagem = page.getByRole('img', { name: 'Nearest stop: Portagem' });
    await expectFramed(page, testInfo, [
      user,
      portagem,
      page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES }),
      page.getByRole('img', { name: U1_TO_COIMBRA_B }),
    ]);
    return projectorFromAnchors(
      await anchor(user, userCoords),
      await anchor(portagem, stopCoords('Portagem')),
    );
  }

  /** The camera of the selected view on Parque. */
  async function parqueProjector(page: Page): Promise<Projector> {
    return projectorFromAnchors(
      await anchor(page.getByRole('img', { name: 'Selected stop: Parque' }), stopCoords('Parque')),
      await anchor(page.getByRole('img', { name: 'Your location' }), userCoords),
    );
  }

  test('selects a stop and frames it', async ({ page }, testInfo) => {
    const sheet = await selectParque(page, await openDefaultView(page, testInfo));
    await expect(sheet.getByText('// SELECTED STOP')).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1, name: 'Parque' })).toBeVisible();
    await expect(sheet.getByText(/\d+(\.\d)? (m|km) away/)).toBeVisible();
    // At 10:44, u1-DU-0-852 reaches Parque at 10:48:28 and u1-DU-1-823 at 10:51:43, then two U1
    // trips that have not left their terminus yet: u1-DU-0-585 at 11:05:28, u1-DU-1-539 at 11:06:43.
    const rows = sheet.getByRole('listitem');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('to Vale das Flores');
    await expect(rows.nth(1)).toContainText('to Coimbra B');
    await expect(rows.nth(2)).toContainText('to Vale das Flores');
    await expect(rows.nth(3)).toContainText('to Coimbra B');

    const stopMarker = page.getByRole('img', { name: 'Selected stop: Parque' });
    await expect(stopMarker).toBeVisible();
    await expect(page.getByRole('img', { name: /^Nearest stop: / })).toHaveCount(0);
    const toValeDasFlores = page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES });
    const toCoimbraB = page.getByRole('img', { name: U1_TO_COIMBRA_B });
    await expect(toValeDasFlores).toHaveAttribute('aria-label', / from Parque$/);
    await expect(toCoimbraB).toHaveAttribute('aria-label', / from Parque$/);
    await expect(page.getByRole('img', { name: S2_TO_SERPINS, exact: true })).toHaveClass(
      /marker-bus--dimmed/,
    );

    await expectFramed(page, testInfo, [stopMarker, toValeDasFlores, toCoimbraB]);
  });

  test('tapping away returns to the nearest stop', async ({ page }, testInfo) => {
    await selectParque(page, await openDefaultView(page, testInfo));
    await expect(page.getByRole('img', { name: 'Selected stop: Parque' })).toBeVisible();
    const { x, y } = await emptyMapPoint(page, testInfo, await parqueProjector(page));
    await page.mouse.click(x, y);

    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    const portagem = page.getByRole('img', { name: 'Nearest stop: Portagem' });
    await expect(portagem).toBeVisible();
    await expectFramed(page, testInfo, [
      page.getByRole('img', { name: 'Your location' }),
      portagem,
      page.getByRole('img', { name: U1_TO_VALE_DAS_FLORES }),
      page.getByRole('img', { name: U1_TO_COIMBRA_B }),
    ]);
  });

  test('tapping empty map with nothing selected changes nothing', async ({ page }, testInfo) => {
    const project = await openDefaultView(page, testInfo);
    const { x, y } = await emptyMapPoint(page, testInfo, project);
    await page.mouse.click(x, y);
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Selected stop' })).toHaveCount(0);
  });

  test('the locate button clears the selection', async ({ page }, testInfo) => {
    await selectParque(page, await openDefaultView(page, testInfo));
    await page.getByRole('button', { name: 'Centre on my location', exact: true }).click();
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
  });

  test('tapping the nearest stop keeps "Nearest stop"', async ({ page }, testInfo) => {
    await selectParque(page, await openDefaultView(page, testInfo));
    await expect(page.getByRole('img', { name: 'Selected stop: Parque' })).toBeVisible();
    const { x, y } = (await parqueProjector(page))(stopCoords('Portagem'));
    await page.mouse.click(x, y);
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('// NEAREST STOP')).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1, name: 'Portagem' })).toBeVisible();
  });

  test('desktop: the cursor points over a stop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    const project = await openDefaultView(page, testInfo);
    const canvas = page.locator('.maplibregl-canvas');
    const cursor = () => canvas.evaluate((el) => (el as HTMLElement).style.cursor);

    const parque = project(stopCoords('Parque'));
    await expect(async () => {
      await page.mouse.move(parque.x, parque.y);
      expect(await cursor()).toBe('pointer');
    }).toPass();

    const empty = await emptyMapPoint(page, testInfo, project);
    await page.mouse.move(empty.x, empty.y);
    await expect.poll(cursor).toMatch(/^(auto)?$/);
  });
});

test.describe('location denied', () => {
  test.use({ permissions: [] });

  test('explains that location is off and keeps the map', async ({ page }) => {
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Location unavailable' });
    await expect(sheet.getByRole('heading', { name: 'Location is off' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try to find my location' })).toBeEnabled();
    await expect(page.locator('.maplibregl-canvas')).toBeAttached();
  });

  test.describe('selecting', () => {
    test.use({ reducedMotion: 'reduce' });

    test('selects a stop without a location', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Location unavailable' })).toBeVisible();
      // The buses show once the stops and the trips have loaded.
      await expect(page.getByRole('img', { name: S2_TO_SERPINS, exact: true })).toBeAttached();

      const sheet = await selectParque(page, initialProjector(page.viewportSize()!));
      await expect(sheet.getByRole('heading', { level: 1, name: 'Parque' })).toBeVisible();
      await expect(sheet.locator('.stop-distance')).toHaveCount(0);
      await expect(sheet.getByRole('listitem')).toHaveCount(4);
      const stopMarker = page.getByRole('img', { name: 'Selected stop: Parque' });
      await expect(stopMarker).toBeVisible();

      // With no location there is no second marker to work out the camera from. West of Parque
      // the closest stop is Portagem, over 420 m away, so a point 48px west of Parque is empty at
      // any zoom the selected view can have.
      const parque = await centreOf(stopMarker);
      await page.mouse.click(parque.x - 48, parque.y);
      await expect(page.getByRole('region', { name: 'Location unavailable' })).toBeVisible();
      await expect(page.getByRole('img', { name: /^Selected stop: / })).toHaveCount(0);
    });
  });
});

test('attribution links to the OpenStreetMap copyright page', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'OpenStreetMap' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
});

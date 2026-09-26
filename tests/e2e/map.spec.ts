import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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
 * s2-DU-0-701 to Serpins passed it at 10:25:35.
 */
const WEEKDAY_10_44_LISBON = new Date('2026-09-23T09:44:00Z');

const U1_TO_VALE_DAS_FLORES = /^Scheduled position of line U1 bus to Vale das Flores, /;
const U1_TO_COIMBRA_B = /^Scheduled position of line U1 bus to Coimbra B, /;
const S2_TO_SERPINS = 'Scheduled position of line S2 bus to Serpins';

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
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('to Vale das Flores');
    await expect(rows.nth(1)).toContainText('to Coimbra B');
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

  test('phone: the sheet minimises and restores', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet.getByRole('listitem')).toHaveCount(2);
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
    await expect(sheet.getByRole('listitem')).toHaveCount(2);
    await expect(
      sheet.getByRole('heading', { level: 2, name: 'Heading to this stop' }),
    ).toBeVisible();
  });

  test('phone: swiping the sheet minimises and restores it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
    await page.goto('/');
    const sheet = page.getByRole('region', { name: 'Nearest stop' });
    await expect(sheet.getByRole('listitem')).toHaveCount(2);

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
    await expect(sheet.getByRole('listitem')).toHaveCount(2);
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
});

test('attribution links to the OpenStreetMap copyright page', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'OpenStreetMap' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
});

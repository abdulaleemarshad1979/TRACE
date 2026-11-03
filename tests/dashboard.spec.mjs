import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dashboard/TRACE.html')).href;

test('uses the exact staging Realtime Database and waits for sign-in', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#projForm')).toBeHidden();
  await expect(page.locator('#app')).toBeHidden();
  expect(await page.evaluate(() => CFG.d)).toBe('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app');
});

test('signed-in control room displays live unit and SOS', async ({ page }) => {
  const now = Date.now();
  await page.addInitScript(() => {
    localStorage.setItem('rm_cfg', JSON.stringify({ k: 'test-key', d: 'https://trace-demo.firebaseio.test', p: 'trace-demo' }));
    localStorage.setItem('rm_au', JSON.stringify({ rt: 'test-refresh', uid: 'admin-1', email: 'admin@example.test' }));
    localStorage.setItem('rm_poll', '1');
  });
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id_token: 'test-id', expires_in: '3600', refresh_token: 'test-refresh', user_id: 'admin-1' }) }));
  await page.route('https://trace-demo.firebaseio.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    let data = {};
    if (pathname === '/devices.json') data = { unit1: { ps: 'Central', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '1000000000', force: 'route' } };
    if (pathname === '/live.json') data = { unit1: { lat: 16.98, lng: 82.24, t: now, up: now, gps: true, bat: 81, sig: 4, spd: 28 } };
    if (pathname === '/config.json') data = { routes: { r1: { ps: 'Central', route: 'Route 1', sd: 'North', force: 'route' } }, stations: {}, settings: { election: '', autoSos: false } };
    if (pathname === '/events.json') data = { sos1: { type: 'sos', uid: 'unit1', t: now, lat: 16.98, lng: 82.24 } };
    if (pathname.startsWith('/track/')) data = {};
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#counts')).toContainText('All phones');
  await expect(page.locator('#counts')).toContainText('1');
  await expect(page.locator('.trace-trip')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.trace-trip')).toContainText('28 km/h');
  await expect(page.locator('.trace-trip')).toContainText('81%');
  await page.locator('#tabs [data-tab="alerts"]').click();
  await expect(page.locator('#pane')).toContainText('pressed NEED HELP');
  await expect(page.locator('#counts')).toContainText('SOS');
});

test('groups on the initial map are fitted and malformed fixes do not hide valid phones', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  expect(await page.evaluate(() => Object.keys(CONF).length)).toBe(0);
  const result = await page.evaluate(() => {
    document.querySelector('#login').hidden = true;
    document.querySelector('#app').hidden = false;
    initMap();
    DEV.remote = { ps: 'Test PS', route: 'Route 1', sd: 'Test' };
    DEV.bad = { ps: 'Test PS', route: 'Route 2', sd: 'Test' };
    LIVE.remote = { lat: 16.5, lng: 81.1, t: Date.now(), up: Date.now(), gps: true };
    LIVE.bad = { lat: 'bad', lng: null, t: Date.now(), up: Date.now() };
    MAP.setView([17, 81.8], 10);
    fitted = false;
    renderMap();
    return { contains: MAP.getBounds().contains([16.5, 81.1]), fitted, invalidMarker: !!MK.bad };
  });
  expect(result).toEqual({ contains: true, fitted: true, invalidMarker: false });
});

test('incomplete saved sign-in returns to login instead of an empty live dashboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rm_au', '{}'));
  await page.goto(url);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

async function controlRoom(page, overrides = {}) {
  const writes = [];
  await page.addInitScript(() => {
    localStorage.setItem('rm_cfg', JSON.stringify({ k: 'test-key', d: 'https://trace-demo.firebaseio.test', p: 'trace-demo' }));
    localStorage.setItem('rm_au', JSON.stringify({ rt: 'test-refresh', uid: 'admin-1', email: 'admin@example.test' }));
    localStorage.setItem('rm_poll', '1');
  });
  const data = {
    '/roles/admin-1.json': 'admin',
    '/config.json': {
      routes: { r1: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Example Sub-division', villages: 'First village, Second village, Third village', officer: '', election: 'Election 2026', force: 'route' } },
      stations: { s1: { name: 'Example primary school polling location', ps: 'Example Rural Police Station', route: 'Route 12', lat: 17, lng: 81.8, sens: 'Normal' } },
      settings: { election: '', autoSos: false }
    },
    '/devices.json': {}, '/live.json': {}, '/events.json': {}, ...overrides
  };
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'test-id', expires_in: '3600', refresh_token: 'test-refresh', user_id: 'admin-1' } }));
  await page.route('https://trace-demo.firebaseio.test/**', route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() === 'PATCH') writes.push({ pathname, body: request.postDataJSON() });
    return route.fulfill({ json: data[pathname] ?? null });
  });
  await page.route(/https:\/\/.*(?:tile\.openstreetmap\.org|arcgisonline\.com)\//, route => route.abort());
  await page.goto(url);
  await expect(page.locator('#app')).toBeVisible();
  await expect.poll(() => page.evaluate(() => USER_ROLE)).toBe(data['/roles/admin-1.json']);
  await expect.poll(() => page.evaluate(() => Object.keys(CONF.routes || {}).length)).toBe(1);
  await expect(page.locator('#counts .cnt')).toHaveCount(6);
  await expect(page.locator('#fSd')).toContainText('All sub-divisions');
  return writes;
}

test('fresh route phones remain visible when registration is missing or a route lock is stale', async ({ page }) => {
  const now = Date.now();
  await controlRoom(page, {
    '/devices.json': { registered: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Example Sub-division', force: 'route' } },
    '/live.json': {
      registered: { lat: 17, lng: 81.8, up: now, t: now, gps: true, duty: true },
      unregistered: { lat: 17.001, lng: 81.801, up: now, t: now, gps: true, duty: true, ps: 'Other PS', route: 'Route 1', sd: 'Example Sub-division' }
    }
  });
  const result = await page.evaluate(() => {
    LOCK[lockKey(DEV.registered)] = { uid: 'previous-phone' };
    return { ids: devIds(), count: devIds().length, other: DEV.unregistered?.route };
  });
  expect(result.ids).toEqual(['registered', 'unregistered']);
  expect(result.count).toBe(2);
  expect(result.other).toBe('Route 1');
});

test('closed incidents leave the live incident map and ticker', async ({ page }) => {
  await controlRoom(page);
  const result = await page.evaluate(() => {
    const now = Date.now();
    INC.closed = { no: 7, t: now, lat: 17, lng: 81.8, place: 'Closed location', status: 'closed' };
    INC.open = { no: 8, t: now, lat: 17.01, lng: 81.81, place: 'Open location', status: 'open' };
    drawIncidents(); ticker();
    return { markers: LAYER_INC.getLayers().length, ticker: document.querySelector('#tkText').textContent, list: incList().map(x => x.no) };
  });
  expect(result.markers).toBe(1);
  expect(result.ticker).toContain('Open location');
  expect(result.ticker).not.toContain('Closed location');
  expect(result.list).toEqual([8]);
});

test('closing a polling incident attends its linked tension report', async ({ page }) => {
  const writes = await controlRoom(page);
  await page.evaluate(() => {
    const now = Date.now();
    EVT.tension1 = { type: 'loc', uid: 'officer1', sid: 's1', sname: 'Example primary school polling location', status: 'tension', t: now };
    INC.inc1 = { no: 1, t: now, lat: 17, lng: 81.8, place: 'Example primary school polling location', status: 'open', sourceEventId: 'tension1' };
    UI.tab = 'inc'; UI.incSel = 'inc1'; renderTabs(); renderPane();
  });
  page.once('dialog', dialog => dialog.accept('Resolved'));
  await page.locator('[data-act="incClose"][data-id="inc1"]').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes.map(w => w.pathname)).toEqual(['/incidents/inc1.json', '/events/tension1.json']);
  expect(await page.evaluate(() => ({ closed: INC.inc1.status, attended: EVT.tension1.ackBy, hot: hot(EVT.tension1) }))).toEqual({ closed: 'closed', attended: 'admin@example.test', hot: false });
});

test('every geocoded polling station keeps its own ballot marker at its exact coordinates', async ({ page }) => {
  await controlRoom(page);
  const result = await page.evaluate(() => {
    for (let i = 0; i < 120; i++) CONF.stations['dense' + i] = { name: 'Polling ' + i, ps: 'Example Rural Police Station', route: 'Route 12', lat: 17 + (i % 12) * .002, lng: 81.8 + Math.floor(i / 12) * .002 };
    CONF.stations.far = { name: 'Suspect coordinate', ps: 'Example Rural Police Station', route: 'Route 12', lat: 16, lng: 80 };
    fitted = true;
    const originalBounds = MAP.getBounds;
    const originalZoom = MAP.getZoom;
    MAP.getBounds = () => L.latLngBounds([[16.9, 81.7], [17.1, 81.9]]);
    MAP.getZoom = () => 10;
    stationsSig = '';
    renderMap();
    const low = LAYER_S.getLayers().map(marker => ({ position: marker.getLatLng(), html: marker.options.icon.options.html }));
    MAP.getZoom = () => 16;
    stationsSig = '';
    renderMap();
    MAP.getBounds = originalBounds;
    MAP.getZoom = originalZoom;
    return { low, expanded: LAYER_S.getLayers().length, suspect: stationGeoIssue(CONF.stations.far) };
  });
  expect(result.low).toHaveLength(121);
  expect(result.expanded).toBe(121);
  expect(result.suspect).toContain('over 40 km');
  expect(result.low.every(x => x.html.includes('assets/ballot.png'))).toBe(true);
  expect(result.low.some(x => x.position.lat === 17.002 && x.position.lng === 81.8)).toBe(true);
});

test('polling import skips a coordinate isolated from its police station', async ({ page }) => {
  const stations = Object.fromEntries(Array.from({ length: 4 }, (_, i) => ['near' + i, {
    name: 'Nearby ' + i, ps: 'Example Rural Police Station', route: 'Route 12', el: 'Election 2026',
    lat: 17 + i * .002, lng: 81.8 + i * .002
  }]));
  const writes = await controlRoom(page, { '/config.json': {
    routes: { r1: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'North', election: 'Election 2026', force: 'route' } },
    stations, settings: { election: 'Election 2026', autoSos: false }
  } });
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.locator('details[data-sec="ps"] summary').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-act="psImport"]').click();
  await (await chooser).setFiles({ name: 'locations.csv', mimeType: 'text/csv', buffer: Buffer.from(
    'Election,Police Station,Route,Polling Location,Latitude,Longitude\n' +
    'Election 2026,Example Rural Police Station,Route 12,Nearby new,17.003,81.803\n' +
    'Election 2026,Example Rural Police Station,Route 12,Ocean outlier,16,81.734731\n'
  ) });
  await expect.poll(() => writes.length).toBe(1);
  expect(Object.values(writes[0].body).map(p => p.name)).toEqual(['Nearby new']);
  await expect(page.locator('.toast').last()).toContainText('1 rows skipped');
});

test('clear all archives past activity and attended SOS while keeping active SOS', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, {
    '/devices.json': { unit1: { ps: 'Example Rural Police Station', route: 'Route 12', election: 'Election 2026' } },
    '/events.json': {
      activity: { type: 'start', uid: 'unit1', t: now - 2000 },
      attended: { type: 'sos', uid: 'unit1', t: now - 3000, ackBy: 'operator', ackAt: now - 1000 },
      active: { type: 'sos', uid: 'unit1', t: now - 1000 }
    }
  });
  await page.locator('#tabs [data-tab="alerts"]').click();
  await expect(page.locator('#pane')).toContainText('started duty');
  await expect(page.locator('#pane .alert.sos')).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#pane')).not.toContainText('started duty');
  await expect(page.locator('#pane .alert.sos')).toHaveCount(1);
  expect(writes).toEqual([expect.objectContaining({ pathname: '/events/attended.json', body: expect.objectContaining({ cleared: true }) })]);
});

for (const width of [1920, 1536, 1280, 768, 390]) {
  test(`all eight tabs fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await controlRoom(page);
    for (const tab of ['sum', 'veh', 'loc', 'alerts', 'inc', 'replay', 'report', 'setup']) {
      await page.locator(`#tabs [data-tab="${tab}"]`).click();
      await expect(page.locator(`#tabs [data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
      if (['sum', 'veh', 'loc'].includes(tab)) await expect(page.locator('#map')).toBeVisible();
      else await expect(page.locator('#map')).toBeHidden();
      if (tab === 'sum') {
        await expect(page.locator('.c-alerts')).toHaveCount(0);
        await expect(page.locator('#dSum .psbars')).toHaveCount(0);
      }
      const issues = await page.evaluate(() => {
        const failures = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('page horizontal overflow');
        for (const el of document.querySelectorAll('.hdr, .bar, .cnt, .pane, .donut li, .dash .ch')) {
          if (!el.getClientRects().length) continue;
          const r = el.getBoundingClientRect();
          if (r.left < -1 || r.right > innerWidth + 1) failures.push(`${el.className} outside viewport`);
          if (el.scrollWidth > el.clientWidth + 2) failures.push(`${el.className} content clipped`);
        }
        return failures;
      });
      expect(issues, `${tab} at ${width}px`).toEqual([]);
      if (tab === 'setup') {
        await expect(page.locator('#map')).toBeHidden();
        const routes = page.locator('details[data-sec="routes"]');
        await expect.poll(async () => {
          if (!(await routes.evaluate(el => el.open))) await routes.locator('summary').click();
          return routes.locator('table.t').isVisible();
        }).toBe(true);
        const work = await page.locator('.work').boundingBox(), pane = await page.locator('#pane').boundingBox();
        expect(pane.width).toBeGreaterThan(work.width - 5);
        expect(await page.locator('details[data-sec="routes"] table.t').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(1000);
        expect(await page.locator('details[data-sec="routes"] table.t th').first().evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(60);
        if (width === 1536) await page.screenshot({ path: '.local-data/settings-fixed.png' });
      }
      if (tab === 'sum' && [1536, 390].includes(width)) await page.screenshot({ path: `.local-data/layout-${width}.png`, fullPage: true });
    }
  });
}

test('administrator creates a mobile login and assigns its route without changing admin session', async ({ page }) => {
  const writes = await controlRoom(page);
  const authRequests = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    authRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: { localId: 'officer-1', idToken: 'member-id', refreshToken: 'member-refresh' } });
  });
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Assign member', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Assign a member' });
  await modal.getByLabel('Officer name and rank').fill('Example Officer');
  await modal.getByLabel('Mobile number').fill('9876543210');
  await modal.getByLabel('Password', { exact: true }).fill('Example-test-password');
  await modal.getByRole('button', { name: 'Save assignment' }).click();
  await expect(modal).toBeHidden();
  expect(writes).toEqual([{ pathname: '/.json', body: {
    'roles/officer-1': 'route',
    'assignments/officer-1': { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Example Sub-division', election: 'Election 2026', officer: 'Example Officer', mobile: '+919876543210' },
    'config/routes/r1/memberUid': 'officer-1', 'config/routes/r1/officer': 'Example Officer', 'config/routes/r1/mobile': '+919876543210'
  } }]);
  expect(authRequests).toEqual([{ email: 'phone919876543210@members.track.invalid', password: 'Example-test-password', returnSecureToken: true }]);
  expect(await page.evaluate(() => AU.uid)).toBe('admin-1');
  expect(JSON.stringify(writes)).not.toContain('password');
});

test('existing mobile login requires its password and preserves the current admin login', async ({ page }) => {
  const writes = await controlRoom(page);
  let validPassword = false;
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    if (route.request().url().includes('signUp')) return route.fulfill({ status: 400, json: { error: { message: 'EMAIL_EXISTS' } } });
    return validPassword ? route.fulfill({ json: { localId: 'officer-1' } }) : route.fulfill({ status: 400, json: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
  });
  const attempt = () => page.evaluate(async () => {
    try { await provisionMember('r1', { mobile: '+91 98765 43210', officer: 'Officer', password: 'Example-password' }); return 'saved'; }
    catch (e) { return e.message; }
  });
  expect(await attempt()).toContain('current password');
  expect(writes).toHaveLength(0);
  validPassword = true;
  expect(await attempt()).toBe('saved');
  expect(writes).toHaveLength(1);
  expect(await page.evaluate(() => AU.uid)).toBe('admin-1');
});

test('assignment rejects privileged accounts, other routes and active duty without writes', async ({ page }) => {
  const writes = await controlRoom(page, {
    '/roles/privileged.json': 'admin',
    '/assignments/assigned.json': { ps: 'Other PS', route: 'Route 1' },
    '/live/active.json': { duty: true }
  });
  for (const [uid, message] of [['privileged', 'administrator or monitor'], ['assigned', 'another route'], ['active', 'Stop duty']]) {
    const error = await page.evaluate(async uid => {
      try { await saveMemberAssignment('r1', { uid, officer: 'Example Officer', mobile: '' }); }
      catch (e) { return e.message; }
    }, uid);
    expect(error).toContain(message);
  }
  expect(writes).toEqual([]);
});

test('monitor cannot assign members', async ({ page }) => {
  const writes = await controlRoom(page, { '/roles/admin-1.json': 'monitor' });
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.getByRole('button', { name: 'Assign member', exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => {
    try { await saveMemberAssignment('r1', { uid: 'officer-1', officer: 'Officer', mobile: '' }); }
    catch (e) { return e.message; }
  })).toContain('Only a control-room administrator');
  expect(writes).toEqual([]);
});

test('changed coverage requires review before creating member credentials', async ({ page }) => {
  const writes = await controlRoom(page);
  await page.evaluate(() => CONF.routes.r1.coverageStatus = 'proposed');
  const error = await page.evaluate(async () => {
    try { await provisionMember('r1', { mobile: '9876543210', officer: 'Officer', password: 'Example-password' }); }
    catch (e) { return e.message; }
  });
  expect(error).toContain('Review and confirm');
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Assign member', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Example primary school polling location')).toBeVisible();
  const box = await dialog.locator('form').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
});

test('live journey card has cross mark button, dismisses on click, does not auto-lock onto devIds[0], and updates reactively', async ({ page }) => {
  const now = Date.now();
  await page.addInitScript(() => {
    localStorage.setItem('rm_cfg', JSON.stringify({ k: 'test-key', d: 'https://trace-demo.firebaseio.test', p: 'trace-demo' }));
    localStorage.setItem('rm_au', JSON.stringify({ rt: 'test-refresh', uid: 'admin-1', email: 'admin@example.test' }));
    localStorage.setItem('rm_poll', '1');
  });
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id_token: 'test-id', expires_in: '3600', refresh_token: 'test-refresh', user_id: 'admin-1' }) }));
  await page.route('https://trace-demo.firebaseio.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    let data = {};
    if (pathname === '/devices.json') data = {
      unit1: { ps: 'Central', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '1000000000', force: 'route' },
      unit2: { ps: 'Central', route: 'Route 2', sd: 'North', officer: 'Officer B', mobile: '2000000000', force: 'route' }
    };
    if (pathname === '/live.json') data = {
      unit1: { lat: 16.98, lng: 82.24, t: now, up: now, gps: true, bat: 81, sig: 4, spd: 28 },
      unit2: { lat: 16.99, lng: 82.25, t: now, up: now, gps: true, bat: 65, sig: 3, spd: 15 }
    };
    if (pathname === '/config.json') data = { routes: { r1: { ps: 'Central', route: 'Route 1', sd: 'North', force: 'route' }, r2: { ps: 'Central', route: 'Route 2', sd: 'North', force: 'route' } }, stations: {}, settings: { election: '', autoSos: false } };
    if (pathname === '/events.json') data = {};
    if (pathname.startsWith('/track/')) data = {};
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  await expect(page.locator('#app')).toBeVisible();

  // Card is visible initially
  const card = page.locator('.trace-trip');
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card).toContainText('28 km/h');

  // Verify cross mark button exists with correct symbol and click to dismiss
  const closeBtn = card.locator('#tripClose');
  await expect(closeBtn).toBeVisible();
  await expect(closeBtn).toHaveText('×');
  await closeBtn.click();

  // Card is now dismissed and hidden
  await expect(card).toBeHidden();

  // Trigger live data update or interval render - must NOT auto-lock onto devIds()[0]
  await page.evaluate(() => {
    LIVE.unit1.spd = 35;
    if (typeof onLive === 'function') onLive('/unit1');
    if (typeof renderTrip === 'function') renderTrip();
  });
  await page.waitForTimeout(300);
  await expect(card).toBeHidden();

  // Select unit2 (UI.sel changes) - should reset dismissed state and show card for unit2
  await page.evaluate(() => {
    selectDev('unit2');
  });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Route 2');
  await expect(card).toContainText('15 km/h');
  await expect(card).toContainText('65%');

  // Reactively update unit2 live data
  await page.evaluate(() => {
    LIVE.unit2.spd = 55;
    LIVE.unit2.bat = 90;
    if (typeof onLive === 'function') onLive('/unit2');
  });
  await expect(card).toContainText('55 km/h');
  await expect(card).toContainText('90%');

  // Dismiss unit2 card
  await card.locator('#tripClose').click();
  await expect(card).toBeHidden();

  // Selecting unit2 again resets dismissed state and shows card
  await page.evaluate(() => {
    selectDev('unit2');
  });
  await expect(card).toBeVisible();
});

test('settings tables allow horizontal scrolling without text wrapping letter by letter', async ({ page }) => {
  await controlRoom(page);
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.locator('body')).toHaveClass(/v-setup/);

  // Live trip overlay should be hidden in Settings
  await expect(page.locator('.trace-trip')).toBeHidden();

  const routes = page.locator('details[data-sec="routes"]');
  if (!(await routes.evaluate(el => el.open))) await routes.locator('summary').click();

  const routesTable = routes.locator('table.t');
  await expect(routesTable).toBeVisible();

  // Verify headers have white-space: nowrap
  const headerWhiteSpaces = await routesTable.locator('th').evaluateAll(ths => ths.map(th => window.getComputedStyle(th).whiteSpace));
  for (const ws of headerWhiteSpaces) {
    expect(ws).toBe('nowrap');
  }

  // Verify table cells have minimum widths preventing letter squeezing
  const cellWidths = await routesTable.locator('th').evaluateAll(ths => ths.map(th => th.getBoundingClientRect().width));
  for (const w of cellWidths) {
    expect(w).toBeGreaterThanOrEqual(90);
  }

  // Verify wrapper allows horizontal scrolling
  const tw = routes.locator('.tw');
  const overflowX = await tw.evaluate(el => window.getComputedStyle(el).overflowX);
  expect(['auto', 'scroll']).toContain(overflowX);
});

test('settings accordion contains only Routes, Polling locations, and Registered phones', async ({ page }) => {
  await controlRoom(page);
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.locator('body')).toHaveClass(/v-setup/);

  // Should have routes, ps, dev
  await expect(page.locator('details[data-sec="routes"]')).toBeVisible();
  await expect(page.locator('details[data-sec="ps"]')).toBeVisible();
  await expect(page.locator('details[data-sec="dev"]')).toBeVisible();

  // Titles should not have number prefixes 1., 3., 4.
  const routesSummary = await page.locator('details[data-sec="routes"] summary').textContent();
  expect(routesSummary).not.toMatch(/^1\.\s/);
  const psSummary = await page.locator('details[data-sec="ps"] summary').textContent();
  expect(psSummary).not.toMatch(/^3\.\s/);
  const devSummary = await page.locator('details[data-sec="dev"] summary').textContent();
  expect(devSummary).not.toMatch(/^4\.\s/);

  // Removed sections should NOT exist
  await expect(page.locator('details[data-sec="qr"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="rules"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="after"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="poll"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="clear"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="locks"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="vers"]')).toHaveCount(0);
  await expect(page.locator('details[data-sec="notes"]')).toHaveCount(0);

  // Election dropdowns must not offer "+ Add a new election"
  await expect(page.locator('#setElec option[value="__new"]')).toHaveCount(0);
  await expect(page.locator('#setElec option:has-text("Add a new election")')).toHaveCount(0);
  await expect(page.locator('#setElec2 option[value="__new"]')).toHaveCount(0);
  await expect(page.locator('#setElec2 option:has-text("Add a new election")')).toHaveCount(0);
});

test('active tab displays 5 status cards, active units and active routes with click-to-center', async ({ page }) => {
  const now = Date.now();
  await controlRoom(page, {
    '/devices.json': { unit1: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Example Sub-division', officer: 'Officer Test', mobile: '9999999999', force: 'route' } },
    '/live.json': { unit1: { lat: 17.0, lng: 81.8, t: now, up: now, gps: true, bat: 75, spd: 35 } }
  });
  const activeTab = page.locator('#tabs [data-tab="active"]');
  await expect(activeTab).toBeVisible();
  await activeTab.click();
  await expect(activeTab).toHaveAttribute('aria-selected', 'true');

  // Verify status cards grid
  const grid = page.locator('.active-grid5');
  await expect(grid).toBeVisible();

  // Verify 5 status cards
  await expect(grid.locator('.active-stat-card, [data-act="centerLatest"]')).toHaveCount(5);

  // Verify search input
  await expect(page.locator('#activeQ')).toBeVisible();

  // Verify view sub-buttons (Active Units / Active Routes)
  const unitsBtn = page.locator('button[data-act="activeSub"][data-sub="units"]');
  const routesBtn = page.locator('button[data-act="activeSub"][data-sub="routes"]');
  await expect(unitsBtn).toBeVisible();
  await expect(routesBtn).toBeVisible();

  // Verify active card rendered
  const activeCards = page.locator('.active-card');
  const count = await activeCards.count();
  expect(count).toBeGreaterThan(0);

  // Verify card has metrics: Status, Speed, Battery, Last seen
  const firstCard = activeCards.first();
  await expect(firstCard.locator('.active-metrics')).toBeVisible();
  const gpsStates = await page.evaluate(() => {
    LIVE.unit1.spd = 0;
    const stopped = status('unit1').k;
    LIVE.unit1.t = Date.now() - 50000;
    return { stopped, stale: status('unit1').k };
  });
  expect(gpsStates).toEqual({ stopped: 'stop', stale: 'weak' });

  // Click center on map button
  const centerBtn = firstCard.locator('button[data-act="centerDev"]').first();
  await expect(centerBtn).toBeVisible();
  await centerBtn.click();

  // Center opens the map on Live Tracking.
  await expect(page.locator('#tabs [data-tab="veh"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.veh.sel')).toBeVisible();

  // Switch to routes sub-view
  await activeTab.click();
  await routesBtn.click();
  await expect(page.locator('.active-card')).toBeVisible();
});


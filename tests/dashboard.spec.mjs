import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dashboard/TRACE.html')).href;
const siUrl = pathToFileURL(path.resolve('dashboard/si-monitor.html')).href;

test('SI monitor shows only assigned mandal routes and their live phones', async ({ page }) => {
  const now = Date.now(), reads = [];
  await page.addInitScript(() => localStorage.setItem('rm_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })));
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  const data = {
    '/roles/si-1.json': 'si_monitor',
    '/siScopes/si-1.json': { mandal: 'Kadiyam', officer: 'SI Example', routes: { r1: true, r2: true }, stations: { s1: true } },
    '/config/routes/r1.json': { ps: 'Kadiyam PS', route: 'Route 1', memberUid: 'unit-1' },
    '/config/routes/r2.json': { ps: 'Kadiyam PS', route: 'Route 2' },
    '/config/stations/s1.json': { name: 'Kadiyam polling booth', ps: 'Kadiyam PS', route: 'Route 1', lat: 16.91, lng: 81.84 },
    '/devices/unit-1.json': { ps: 'Kadiyam PS', officer: 'HC Example', mobile: '9000000000' },
    '/live/unit-1.json': { lat: 17.15, lng: 82.1, up: now, gps: true, duty: true },
    '/events.json': { sos1: { uid: 'unit-1', type: 'sos', t: now } }
  };
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => {
    reads.push(new URL(route.request().url()).pathname);
    route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(siUrl);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#mandal')).toHaveText('Kadiyam');
  await expect(page.locator('#routes')).toContainText('Kadiyam PS');
  await expect(page.locator('#routes')).toContainText('HC Example');
  await expect(page.locator('#routes')).toContainText('No assigned phone');
  await expect(page.locator('#alert')).toContainText('1 open SOS');
  await expect(page.locator('#mapNote')).toContainText('1 polling booths');
  await expect.poll(() => page.evaluate(() => map.getBounds().contains([17.15, 82.1]))).toBe(true);
  expect(await page.locator('#map .leaflet-interactive').count()).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => localStorage.getItem('rm_au'))).toBeNull();
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('rm_si_au'))).uid).toBe('si-1');
  expect(reads).not.toContain('/config/routes/r3.json');
  expect(reads).not.toContain('/devices.json');
  expect(reads).not.toContain('/live.json');
  expect(reads).not.toContain('/config/stations.json');
});

test('viewer distinguishes a connected phone from a phone with a GPS position', async ({ page }) => {
  const now = Date.now();
  await page.addInitScript(() => sessionStorage.setItem('rm_si_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })));
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  const data = {
    '/roles/si-1.json': 'si_monitor',
    '/siScopes/si-1.json': { mandal: 'Bommuru', routes: { r1: true, deleted: true }, stations: { s1: true } },
    '/config/routes/r1.json': { ps: 'Bommuru PS', route: 'Route 1', memberUid: 'unit-1' },
    '/config/stations/s1.json': { name: 'Booth', lat: 17, lng: 81.8 },
    '/live/unit-1.json': { up: now, gps: true, duty: true }
  };
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(siUrl);
  await expect(page.locator('#routes')).toContainText('Waiting for GPS fix');
  await expect(page.locator('#routes tr')).toHaveCount(1);
  await expect(page.locator('#mapNote')).toContainText('0 phone locations · 1 phone waiting for GPS fix');
  data['/live/unit-1.json'] = { lat: 17.15, lng: 82.1, up: now, gps: true, duty: true };
  await page.evaluate(() => refresh());
  await expect(page.locator('#routes')).toContainText('Live');
  await expect.poll(() => page.evaluate(() => map.getBounds().contains([17.15, 82.1]))).toBe(true);
  data['/live/unit-1.json'] = { lat: 17.3, lng: 82.3, up: now, gps: true, duty: true };
  await page.evaluate(() => refresh());
  expect(await page.evaluate(() => map.getBounds().contains([17.3, 82.3]))).toBe(true);
});

test('SI monitor accepts the command control room mobile login', async ({ page }) => {
  const signIns = [];
  await page.addInitScript(() => localStorage.setItem('rm_au', JSON.stringify({ rt: 'admin-refresh', uid: 'admin-1', email: 'admin@example.test' })));
  await page.route('https://identitytoolkit.googleapis.com/**', route => { signIns.push(route.request().postDataJSON()); route.fulfill({ json: { localId: 'si-1', idToken: 'si-token', refreshToken: 'si-refresh', expiresIn: '3600' } }); });
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => {
    const data = { '/roles/si-1.json': 'si_monitor', '/siScopes/si-1.json': { mandal: 'Kadiyam', routes: { r1: true } }, '/config/routes/r1.json': { ps: 'Kadiyam PS', route: 'Route 1' } };
    route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(siUrl);
  await expect(page.getByRole('link', { name: /Administrator Login/ })).toBeVisible();
  await page.locator('#mobile').fill('+91 98765 43210');
  await page.locator('#password').fill('Example-password');
  await page.locator('#togglePassword').click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  await page.locator('#loginForm [type=submit]').click();
  await expect(page.locator('#mandal')).toHaveText('Kadiyam');
  expect(signIns[0].email).toBe('si919876543210@members.track.invalid');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('rm_au'))).uid).toBe('admin-1');
});

test('viewer and administrator use the same sign-in page', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#lMobile')).toBeVisible();
  await expect(page.locator('#lRank')).toBeVisible();
  await expect(page.locator('#lRank option')).toHaveText(['Choose rank', 'Incharge', 'Striking Force', 'Sub-Striking Force', 'DSP']);
  await expect(page.locator('#lEmail')).toBeHidden();
  await page.getByRole('button', { name: 'Administrator Login' }).click();
  await expect(page.locator('#lEmail')).toBeVisible();
  await expect(page.locator('#lMobile')).toBeHidden();
  await page.getByRole('button', { name: 'Viewer Login' }).click();
  await expect(page.locator('#lMobile')).toBeVisible();
  await expect(page).toHaveURL(url);
  expect(await page.evaluate(() => localStorage.getItem('rm_au'))).toBeNull();
});

test('viewer signs in on the main page and sees only assigned routes', async ({ page }) => {
  const now = Date.now(), reads = [], signIns = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => { signIns.push(route.request().postDataJSON()); route.fulfill({ json: { localId: 'si-1', idToken: 'si-token', refreshToken: 'si-refresh', expiresIn: '3600' } }); });
  const data = {
    '/roles/si-1.json': 'si_monitor',
    '/siScopes/si-1.json': { mandal: 'Kadiyam', officer: 'Example Officer', rank: 'Incharge', routes: { r1: true, r2: true }, stations: { s1: true } },
    '/config/routes/r1.json': { ps: 'Kadiyam PS', route: 'Route 1', memberUid: 'unit-1' },
    '/config/routes/r2.json': { ps: 'Kadiyam PS', route: 'Route 2' },
    '/config/stations/s1.json': { name: 'Kadiyam polling booth', ps: 'Kadiyam PS', route: 'Route 1', lat: 16.91, lng: 81.84 },
    '/devices/unit-1.json': { officer: 'HC Example' },
    '/live/unit-1.json': { lat: 17.15, lng: 82.1, up: now, gps: true, duty: true },
    '/events.json': null
  };
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => { const pathname = new URL(route.request().url()).pathname; reads.push(pathname); route.fulfill({ json: data[pathname] ?? null }); });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  await page.locator('#lMobile').fill('9876543210');
  await page.locator('#lRank').selectOption('Incharge');
  await page.locator('#lPw').fill('Example-password');
  await page.locator('#lAgree').check();
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#viewerApp')).toBeVisible();
  await expect(page.locator('#viewerMandal')).toHaveText('Kadiyam');
  await expect(page.locator('#viewerOfficer')).toContainText('Incharge');
  await expect(page.locator('#viewerRoutes')).toContainText('No assigned phone');
  await expect(page.locator('#viewerRoutes')).toContainText('HC Example');
  await expect(page.locator('#viewerMapNote')).toContainText('1 polling booths');
  expect(await page.evaluate(() => VIEWER_MAP.getBounds().contains([17.15, 82.1]))).toBe(true);
  await expect(page).toHaveURL(url);
  expect(signIns[0].email).toBe('si919876543210@members.track.invalid');
  expect(reads).not.toContain('/devices.json');
  expect(reads).not.toContain('/live.json');
  expect(reads).not.toContain('/config/routes/r3.json');
});

test('viewer shares a location after sign-in and stops it on request', async ({ page }) => {
  const writes = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: success => { setTimeout(() => success({ coords: { latitude: 17.08, longitude: 81.9, accuracy: 12 } }), 0); return 1; },
      clearWatch: () => {}, getCurrentPosition: () => {}
    } });
  });
  await page.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { localId: 'si-1', idToken: 'si-token', refreshToken: 'si-refresh', expiresIn: '3600' } }));
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push({ method: request.method(), path: pathname, body: request.postDataJSON?.() });
    const data = { '/roles/si-1.json': 'si_monitor', '/siScopes/si-1.json': { mandal: 'Kadiyam', routes: { r1: true } }, '/config/routes/r1.json': { ps: 'Kadiyam PS', route: 'Route 1' } };
    route.fulfill({ json: data[pathname] ?? null });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  await page.locator('#lMobile').fill('9876543210');
  await page.locator('#lRank').selectOption('Incharge');
  await page.locator('#lPw').fill('Example-password');
  await page.locator('#lAgree').check();
  await page.locator('#loginSubmit').click();
  await expect.poll(() => writes.find(w => w.method === 'PUT' && w.path === '/viewerLive/si-1.json')?.body).toMatchObject({ lat: 17.08, lng: 81.9, acc: 12 });
  await expect(page.locator('#viewerShareStatus')).toContainText('visible to the control room');
  await page.locator('#viewerShare').click();
  await expect.poll(() => writes.some(w => w.method === 'DELETE' && w.path === '/viewerLive/si-1.json')).toBe(true);
  await expect(page.locator('#viewerShare')).toHaveText('Start sharing location');
});

test('administrator map shows fresh viewers in a distinct teal layer', async ({ page }) => {
  await page.route('https://server.arcgisonline.com/**', route => route.abort());
  await page.goto(url);
  const result = await page.evaluate(() => {
    USER_ROLE = 'admin';
    document.querySelector('#login').hidden = true;
    document.querySelector('#app').hidden = false;
    initMap();
    VIEWER_LIVE.si1 = { lat: 17.08, lng: 81.9, acc: 15, t: Date.now() };
    SI_SCOPES.si1 = { officer: 'Viewer Example', mandal: 'Kadiyam', rank: 'Incharge' };
    drawViewerLocations();
    const marker = ADMIN_VIEWER_MARKERS.si1;
    const live = { color: marker.options.fillColor, label: marker.getTooltip().getContent(), units: Object.keys(MK).length };
    VIEWER_LIVE.si1.t = Date.now() - 121000;
    drawViewerLocations();
    return { ...live, staleGone: !ADMIN_VIEWER_MARKERS.si1 };
  });
  expect(result.color).toBe('#00a8c9');
  expect(result.label).toContain('Viewer Example');
  expect(result.label).toContain('Kadiyam');
  expect(result.units).toBe(0);
  expect(result.staleGone).toBe(true);
});

test('an existing viewer without a saved rank can use the new choices', async ({ page }) => {
  await page.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { localId: 'legacy-si', idToken: 'legacy-token', refreshToken: 'legacy-refresh', expiresIn: '3600' } }));
  const data = {
    '/roles/legacy-si.json': 'si_monitor',
    '/siScopes/legacy-si.json': { mandal: 'Kadiyam', officer: 'Existing Officer', routes: { r1: true } },
    '/config/routes/r1.json': { ps: 'Kadiyam PS', route: 'Route 1' }
  };
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  await page.locator('#lMobile').fill('9876543210');
  await page.locator('#lRank').selectOption('Incharge');
  await page.locator('#lPw').fill('Example-password');
  await page.locator('#lAgree').check();
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#viewerApp')).toBeVisible();
  await expect(page.locator('#viewerOfficer')).toContainText('Existing Officer');
});

test('administrator creates a scoped viewer login with rank', async ({ page }) => {
  const signUps = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => { signUps.push(route.request().postDataJSON()); route.fulfill({ json: { localId: 'si-new', idToken: 'secondary-token', refreshToken: 'secondary-refresh' } }); });
  const writes = await controlRoom(page);
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Create viewer login' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create viewer login' });
  await dialog.locator('[name=officer]').fill('SI Example');
  await dialog.locator('[name=rank]').selectOption('Striking Force');
  await dialog.locator('[name=mobile]').fill('9876543210');
  await dialog.locator('[name=password]').fill('Example-password-123');
  await dialog.locator('[name=mandal]').selectOption('Kadiyam');
  await dialog.locator('[name=routeId]').check();
  await dialog.getByRole('button', { name: 'Save viewer login' }).click();
  await expect(dialog).toHaveCount(0);
  expect(signUps[0].email).toBe('si919876543210@members.track.invalid');
  expect(writes).toContainEqual({ pathname: '/.json', body: { 'roles/si-new': 'si_monitor', 'siScopes/si-new': { mandal: 'Kadiyam', officer: 'SI Example', rank: 'Striking Force', mobile: '+919876543210', routes: { r1: true }, stations: { s1: true } } } });
});

test('administrator can list and edit viewer access without an orphaning revoke action', async ({ page }) => {
  const writes = await controlRoom(page);
  const scope = { mandal: 'Kadiyam', officer: 'Existing Officer', rank: 'Incharge', mobile: '+919876543210', routes: { r1: true }, stations: { s1: true } };
  await page.route('https://trace-demo.firebaseio.test/siScopes.json**', route => route.fulfill({ json: { 'si-existing': scope } }));
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Manage viewer logins' }).click();
  const list = page.getByRole('dialog', { name: 'Viewer logins' });
  await expect(list).toContainText('Existing Officer');
  await list.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit viewer login' });
  await edit.locator('[name=officer]').fill('Updated Officer');
  await edit.getByRole('button', { name: 'Save viewer login' }).click();
  await expect(edit).toHaveCount(0);
  expect(writes).toContainEqual({ pathname: '/.json', body: { 'roles/si-existing': 'si_monitor', 'siScopes/si-existing': { ...scope, officer: 'Updated Officer' } } });
  await page.getByRole('button', { name: 'Manage viewer logins' }).click();
  const reopened = page.getByRole('dialog', { name: 'Viewer logins' });
  await expect(reopened.getByRole('button', { name: 'Delete login' })).toBeVisible();
  await expect(reopened.getByRole('button', { name: 'Revoke access' })).toHaveCount(0);
});

test('editing a viewer adds routes from another mandal without removing existing routes', async ({ page }) => {
  const writes = await controlRoom(page);
  await page.evaluate(() => {
    CONF.routes = {
      old: { ps: 'Kadiyam PS', route: 'Route 1' },
      next: { ps: 'Nidadavole PS', route: 'Route 2' }
    };
    CONF.stations = {
      oldBooth: { ps: 'Kadiyam PS', route: 'Route 1' },
      nextBooth: { ps: 'Nidadavole PS', route: 'Route 2' }
    };
  });
  const scope = { mandal: 'Kadiyam', officer: 'Existing Officer', rank: 'Incharge', mobile: '+919876543210', routes: { old: true }, stations: { oldBooth: true } };
  await page.route('https://trace-demo.firebaseio.test/siScopes.json**', route => route.fulfill({ json: { 'si-existing': scope } }));
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Manage viewer logins' }).click();
  await page.getByRole('dialog', { name: 'Viewer logins' }).getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit viewer login' });
  await expect(edit.locator('[name=routeId][value=old]')).toBeChecked();
  await edit.locator('[name=mandal]').selectOption('Nidadavole');
  await expect(edit.locator('[name=routeId][value=old]')).toBeChecked();
  await edit.locator('[name=mandal]').selectOption('Kadiyam');
  await edit.locator('[data-si-browse]').selectOption('Nidadavole');
  await expect(edit.locator('[name=mandal]')).toHaveValue('Kadiyam');
  await expect(edit.locator('[name=routeId][value=next]')).toBeVisible();
  await edit.locator('[name=routeId][value=next]').check();
  await expect(edit.locator('[data-si-count]')).toHaveText('2 selected');
  await edit.getByRole('button', { name: 'Save viewer login' }).click();
  await expect(edit).toHaveCount(0);
  expect(writes).toContainEqual({ pathname: '/.json', body: { 'roles/si-existing': 'si_monitor', 'siScopes/si-existing': { ...scope, routes: { old: true, next: true }, stations: { oldBooth: true, nextBooth: true } } } });
});

test('administrator can delete a viewer sign-in with its current password', async ({ page }) => {
  const writes = await controlRoom(page);
  const scope = { mandal: 'Kadiyam', officer: 'Viewer', rank: 'Incharge', mobile: '+919876543210', routes: { r1: true } };
  await page.route('https://trace-demo.firebaseio.test/siScopes.json**', route => route.fulfill({ json: { 'si-existing': scope } }));
  const actions = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    const action = new URL(route.request().url()).pathname.split(':').pop(); actions.push(action);
    route.fulfill({ json: action === 'signInWithPassword' ? { localId: 'si-existing', idToken: 'viewer-token' } : {} });
  });
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Manage viewer logins' }).click();
  await page.getByRole('dialog', { name: 'Viewer logins' }).getByRole('button', { name: 'Delete login' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete viewer login' });
  await dialog.getByLabel('Current viewer password').fill('Original-password');
  await dialog.getByRole('button', { name: 'Delete login' }).click();
  await expect.poll(() => actions).toEqual(['signInWithPassword', 'delete']);
  await expect.poll(() => writes.some(w => w.body['roles/si-existing'] === null && w.body['siScopes/si-existing'] === null)).toBe(true);
});

test('selecting a mandal shows only its matching routes and booth assignments', async ({ page }) => {
  await controlRoom(page);
  await page.evaluate(() => {
    CONF.routes = {
      k1: { ps: 'Kadiyam PS', route: 'Route 1' },
      n1: { ps: 'Nidadavole PS', route: 'Route 1' }
    };
    CONF.stations = {
      boothK: { name: 'Kadiyam booth', ps: 'Kadiyam PS', route: 'Route 1', lat: 17, lng: 81.8 },
      boothN: { name: 'Nidadavole booth', ps: 'Nidadavole PS', route: 'Route 1', lat: 17.1, lng: 81.9 }
    };
  });
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Create viewer login' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create viewer login' });
  await dialog.locator('[name=mandal]').selectOption('Kadiyam');
  await expect(dialog.locator('[data-si-row]')).toHaveCount(2);
  await expect(dialog.locator('[data-si-row]').filter({ hasText: 'Kadiyam PS' })).toBeVisible();
  await expect(dialog.locator('[data-si-row]').filter({ hasText: 'Nidadavole PS' })).toBeHidden();
  expect(await page.evaluate(() => siStationIds(['k1']))).toEqual(['boothK']);
});

test('importing new routes keeps old routes visible when All elections is selected', async ({ page }) => {
  const writes = await controlRoom(page);
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.locator('#setElec')).toHaveValue('');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import from Excel' }).first().click();
  await (await chooser).setFiles({ name: 'new-routes.csv', mimeType: 'text/csv', buffer: Buffer.from('Election,PS,Route\nNew Election,Kadiyam PS,Route 2\n') });
  await expect.poll(() => page.evaluate(() => Object.keys(CONF.routes || {}).length)).toBe(2);
  await expect(page.locator('#setElec')).toHaveValue('');
  await expect(page.locator('#setElec')).toContainText('All elections (2 routes)');
  await expect.poll(() => writes.some(w => w.pathname === '/config/routes.json')).toBe(true);
  expect(writes.some(w => w.pathname === '/config/settings.json' && w.body.election === 'New Election')).toBe(false);
});

test('removing a polling location deletes its database record and clears the dashboard copy', async ({ page }) => {
  await controlRoom(page);
  const deletes = [];
  await page.route('https://trace-demo.firebaseio.test/config/stations/s1.json**', route => {
    if (route.request().method() === 'DELETE') deletes.push(new URL(route.request().url()).pathname);
    route.fulfill({ json: null });
  });
  await page.evaluate(() => psEditModal('s1'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove location' }).click();
  await expect.poll(() => deletes).toEqual(['/config/stations/s1.json']);
  await expect.poll(() => page.evaluate(() => CONF.stations.s1)).toBeUndefined();
});

test('removing a route deletes its database record and clears the dashboard copy', async ({ page }) => {
  const writes = await controlRoom(page);
  await page.evaluate(() => routeModal('r1'));
  await page.getByRole('button', { name: 'Delete route' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete route?' });
  await expect(confirmation).toContainText('Are you sure');
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Delete route' }).click();
  await page.getByRole('dialog', { name: 'Delete route?' }).getByRole('button', { name: 'Yes, delete route' }).click();
  await expect.poll(() => writes.find(write => write.pathname === '/.json')?.body).toMatchObject({ 'config/routes/r1': null });
  await expect.poll(() => page.evaluate(() => CONF.routes.r1)).toBeUndefined();
});

test('Edit route removes the officer and mobile only after confirmation, keeping the route', async ({ page }) => {
  const writes = await controlRoom(page, { '/config.json': {
    routes: { r1: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Example Sub-division', officer: 'Officer A', mobile: '+919876543210', election: 'Election 2026' } },
    stations: {}, settings: { election: '' }
  } });
  await page.evaluate(() => routeModal('r1'));
  await page.getByRole('button', { name: 'Remove officer & mobile' }).click();
  const first = page.getByRole('dialog', { name: 'Remove person' });
  await first.getByRole('button', { name: 'Cancel' }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove officer & mobile' }).click();
  await page.getByRole('dialog', { name: 'Remove person' }).getByRole('button', { name: 'Yes, remove person' }).click();
  await expect.poll(() => writes.find(w => w.pathname === '/config/routes/r1.json')?.body).toEqual({ officer: null, mobile: null });
  expect(await page.evaluate(() => ({ exists: !!CONF.routes.r1, officer: CONF.routes.r1.officer, mobile: CONF.routes.r1.mobile }))).toEqual({ exists: true });
  await expect(page.locator('.modal')).toHaveCount(0);
});

test('Edit route removes a linked officer login before allowing route deletion', async ({ page }) => {
  const writes = await controlRoom(page, { '/config.json': {
    routes: { r1: { ps: 'Bommuru PS', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '+919876543210', memberUid: 'officer-1' } },
    stations: {}, settings: { election: '' }
  }, '/roles/officer-1.json': 'route', '/assignments/officer-1.json': { routeId: 'r1', ps: 'Bommuru PS', route: 'Route 1' } });
  const authActions = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    const action = new URL(route.request().url()).pathname.split(':').pop(); authActions.push(action);
    route.fulfill({ json: action === 'signInWithPassword' ? { localId: 'officer-1', idToken: 'member-token' } : {} });
  });
  await page.evaluate(() => routeModal('r1'));
  await page.getByRole('button', { name: 'Remove officer & mobile' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove person' });
  await confirmation.getByLabel('Current person password').fill('Existing-password');
  await confirmation.getByRole('button', { name: 'Yes, remove person' }).click();
  await expect.poll(() => writes.find(w => w.pathname === '/.json')?.body?.['assignments/officer-1']).toBeNull();
  expect(authActions).toEqual(['signInWithPassword', 'delete']);
  expect(await page.evaluate(() => !!CONF.routes.r1)).toBe(true);
  await page.evaluate(() => routeModal('r1'));
  await page.getByRole('button', { name: 'Delete route' }).click();
  await page.getByRole('dialog', { name: 'Delete route?' }).getByRole('button', { name: 'Yes, delete route' }).click();
  await expect.poll(() => writes.some(w => w.pathname === '/.json' && w.body['config/routes/r1'] === null)).toBe(true);
  expect(await page.evaluate(() => !!CONF.routes.r1)).toBe(false);
});

test('deleting an election removes its saved name, routes, and polling locations together', async ({ page }) => {
  const writes = await controlRoom(page, { '/config.json': {
    routes: { r1: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'North', election: 'Election 2026' } },
    stations: { s1: { name: 'Booth', el: 'Election 2026', lat: 17, lng: 81.8 } },
    elections: { e1: { name: 'Election 2026' } },
    settings: { election: 'Election 2026' }
  } });
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.locator('details[data-sec="routes"]')).toHaveAttribute('open', '');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-act="delElec"]').first().click();
  await expect.poll(() => writes.find(write => write.pathname === '/.json')?.body).toMatchObject({
    'config/settings/election': null,
    'config/stations/s1': null,
    'config/routes/r1': null,
    'config/elections/e1': null
  });
  await expect.poll(() => page.evaluate(() => trackElectionNames())).toEqual([]);
});

test('uses the exact staging Realtime Database and waits for sign-in', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#projForm')).toBeHidden();
  await expect(page.locator('#app')).toBeHidden();
  expect(await page.evaluate(() => CFG.d)).toBe('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app');
  const rules = await page.evaluate(() => JSON.parse(rulesText()).rules);
  expect(rules.siScopes).toBeDefined();
  expect(rules.mandals).toBeDefined();
});

test('signed-in control room displays live unit and SOS', async ({ page }) => {
  const now = Date.now();
  await page.addInitScript(() => {
    localStorage.setItem('rm_cfg', JSON.stringify({ k: 'test-key', d: 'https://trace-demo.firebaseio.test', p: 'trace-demo' }));
    localStorage.setItem('rm_au', JSON.stringify({ rt: 'test-refresh', uid: 'admin-1', email: 'admin@example.test' }));
    localStorage.setItem('rm_poll_force', '1');
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
    localStorage.setItem('rm_poll_force', '1');
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
    if (request.method() === 'PATCH') {
      writes.push({ pathname, body: request.postDataJSON() });
      const event = /^\/events\/([^/]+)\.json$/.exec(pathname);
      if (event && data['/events.json']?.[event[1]]) Object.assign(data['/events.json'][event[1]], request.postDataJSON());
    }
    return route.fulfill({ json: data[pathname] ?? null });
  });
  await page.route(/https:\/\/.*(?:tile\.openstreetmap\.org|arcgisonline\.com)\//, route => route.abort());
  await page.goto(url);
  await expect(page.locator('#app')).toBeVisible();
  await expect.poll(() => page.evaluate(() => USER_ROLE)).toBe(data['/roles/admin-1.json']);
  await expect.poll(() => page.evaluate(() => Object.keys(CONF.routes || {}).length)).toBe(Object.keys(data['/config.json'].routes).length);
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
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await controlRoom(page);
  await page.evaluate(() => {
    const now = Date.now();
    EVT.tension1 = { type: 'loc', uid: 'officer1', sid: 's1', sname: 'Example primary school polling location', status: 'tension', t: now };
    INC.inc1 = { no: 1, t: now, lat: 17, lng: 81.8, place: 'Example primary school polling location', status: 'open', sourceEventId: 'tension1' };
    UI.tab = 'inc'; UI.incSel = 'inc1'; renderTabs(); renderPane();
  });
  await page.locator('[data-act="incClose"][data-id="inc1"]').click();
  const dialog = page.locator('.modal:has(form[aria-label="Close incident 1"])');
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="action"]').fill('Resolved');
  await dialog.locator('[data-confirm]').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes.map(w => w.pathname)).toEqual(['/incidents/inc1.json', '/events/tension1.json']);
  expect(writes[0].body).toMatchObject({ status: 'closed', action: 'Resolved', closedBy: 'admin@example.test' });
  expect(await page.evaluate(() => ({ closed: INC.inc1.status, attended: EVT.tension1.ackBy, hot: hot(EVT.tension1) }))).toEqual({ closed: 'closed', attended: 'admin@example.test', hot: false });
  await expect(page.locator('#pane')).not.toContainText('Example primary school polling location');
});

test('incident close stays open on a write failure and succeeds on retry', async ({ page }) => {
  await controlRoom(page);
  await page.evaluate(() => { INC.inc1 = { no: 1, t: Date.now(), lat: 17, lng: 81.8, place: 'Test incident', status: 'open' }; UI.tab = 'inc'; UI.incSel = 'inc1'; renderPane(); });
  const fail = route => route.fulfill({ status: 500, json: { error: 'Temporary failure' } });
  await page.route('https://trace-demo.firebaseio.test/incidents/inc1.json**', fail);
  await page.locator('[data-act="incClose"]').click();
  const dialog = page.locator('.modal:has(form[aria-label="Close incident 1"])');
  await dialog.locator('[data-confirm]').click();
  await expect(dialog.locator('[data-error]')).toContainText('Database error 500');
  expect(await page.evaluate(() => INC.inc1.status)).toBe('open');
  await page.unroute('https://trace-demo.firebaseio.test/incidents/inc1.json**', fail);
  await dialog.locator('[data-confirm]').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => INC.inc1.status)).toBe('closed');
});

test('read-only monitor sees the incident close permission clearly', async ({ page }) => {
  await controlRoom(page, { '/roles/admin-1.json': 'monitor' });
  await page.evaluate(() => { INC.inc1 = { no: 1, t: Date.now(), lat: 17, lng: 81.8, place: 'Test incident', status: 'open' }; UI.tab = 'inc'; UI.incSel = 'inc1'; renderPane(); });
  await expect(page.locator('#pane [data-act="incClose"]')).toHaveCount(0);
  await expect(page.locator('#pane')).toContainText('An administrator account is required to close incidents.');
});

test('incident register loads more records only when requested', async ({ page }) => {
  await controlRoom(page);
  await page.evaluate(() => {
    for (let i = 1; i <= 45; i++) INC['inc' + i] = { no: i, t: Date.now() - i, lat: 17, lng: 81.8, place: 'Place ' + i, status: 'open' };
    UI.tab = 'inc'; UI.incSel = null; renderPane();
  });
  await expect(page.locator('#pane [data-act="incPick"]')).toHaveCount(20);
  await page.locator('[data-act="incMore"]').click();
  await expect(page.locator('#pane [data-act="incPick"]')).toHaveCount(40);
  await page.locator('[data-act="incMore"]').click();
  await expect(page.locator('#pane [data-act="incPick"]')).toHaveCount(45);
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
    const expanded = LAYER_S.getLayers().map(marker => ({ position: marker.getLatLng(), html: marker.options.icon.options.html }));
    return { low, expanded, suspect: stationGeoIssue(CONF.stations.far) };
  });
  expect(result.low).toHaveLength(0);
  expect(result.expanded).toHaveLength(121);
  expect(result.suspect).toContain('over 40 km');
  expect(result.expanded.every(x => x.html.includes('assets/ballot.png'))).toBe(true);
  expect(result.expanded.some(x => x.position.lat === 17.002 && x.position.lng === 81.8)).toBe(true);
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
    'assignments/officer-1': { routeId: 'r1', ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Example Sub-division', election: 'Election 2026', officer: 'Example Officer', mobile: '+919876543210' },
    'config/routes/r1/memberUid': 'officer-1', 'config/routes/r1/officer': 'Example Officer', 'config/routes/r1/mobile': '+919876543210'
  } }]);
  expect(authRequests).toEqual([{ email: 'phone919876543210@members.track.invalid', password: 'Example-test-password', returnSecureToken: true }]);
  expect(await page.evaluate(() => AU.uid)).toBe('admin-1');
  expect(JSON.stringify(writes)).not.toContain('password');
});

test('editing a route preserves its assigned member', async ({ page }) => {
  const writes = await controlRoom(page, { '/config.json': {
    routes: { r1: { ps: 'Bommuru PS', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '+919876543210', memberUid: 'officer-1' } },
    stations: {}, settings: { election: '' }
  } });
  await page.evaluate(() => routeModal('r1'));
  await page.locator('.modal [data-k="villages"]').fill('New area');
  await page.locator('.modal [data-save]').click();
  await expect.poll(() => writes.find(write => write.pathname === '/config/routes/r1.json')?.body?.villages).toBe('New area');
  expect(await page.evaluate(() => CONF.routes.r1.memberUid)).toBe('officer-1');
});

test('removing an assigned phone revokes its route access and clears current data', async ({ page }) => {
  const writes = await controlRoom(page, {
    '/config.json': { routes: { r1: { ps: 'Bommuru PS', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '+919876543210', memberUid: 'officer-1' } }, stations: {}, settings: { election: '' } },
    '/devices.json': { 'officer-1': { ps: 'Bommuru PS', route: 'Route 1', officer: 'Officer A' } },
    '/roles/officer-1.json': 'route',
    '/assignments/officer-1.json': { routeId: 'r1', ps: 'Bommuru PS', route: 'Route 1' }
  });
  const authActions = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    const action = new URL(route.request().url()).pathname.split(':').pop(); authActions.push(action);
    route.fulfill({ json: action === 'signInWithPassword' ? { localId: 'officer-1', idToken: 'member-token' } : {} });
  });
  await page.evaluate(() => devModal('officer-1'));
  await page.getByRole('button', { name: 'Remove phone and assignment' }).click();
  await page.getByRole('dialog', { name: 'Delete record?' }).getByRole('button', { name: 'Yes, remove' }).click();
  const person = page.getByRole('dialog', { name: 'Remove person' });
  await person.getByLabel('Current person password').fill('Existing-password');
  await person.getByRole('button', { name: 'Yes, remove person' }).click();
  await expect.poll(() => writes.find(write => write.pathname === '/.json')?.body).toMatchObject({
    'roles/officer-1': null,
    'assignments/officer-1': null,
    'config/routes/r1/memberUid': null,
    'devices/officer-1': null,
    'live/officer-1': null
  });
  await expect.poll(() => page.evaluate(() => ({ member: CONF.routes.r1.memberUid, device: DEV['officer-1'], live: LIVE['officer-1'] }))).toEqual({});
  expect(authActions).toEqual(['signInWithPassword', 'delete']);
  expect(await page.evaluate(() => !!CONF.routes.r1)).toBe(true);
});

test('a route member is deleted only after confirmation and the route remains', async ({ page }) => {
  const writes = await controlRoom(page, {
    '/config.json': { routes: { r1: { ps: 'Bommuru PS', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '+919876543210', memberUid: 'officer-1' } }, stations: {}, settings: { election: '' } },
    '/roles/officer-1.json': 'route',
    '/assignments/officer-1.json': { routeId: 'r1', ps: 'Bommuru PS', route: 'Route 1' }
  });
  const authActions = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    const action = new URL(route.request().url()).pathname.split(':').pop(); authActions.push(action);
    route.fulfill({ json: action === 'signInWithPassword' ? { localId: 'officer-1', idToken: 'member-token' } : {} });
  });
  await page.evaluate(() => memberModal('r1'));
  await page.getByRole('button', { name: 'Remove person', exact: true }).click();
  const person = page.getByRole('dialog', { name: 'Remove person' });
  await expect(person).toContainText('The route will stay in the list.');
  await person.getByRole('button', { name: 'Cancel' }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove person', exact: true }).click();
  const confirmed = page.getByRole('dialog', { name: 'Remove person' });
  await confirmed.getByLabel('Current person password').fill('Existing-password');
  await confirmed.getByRole('button', { name: 'Yes, remove person' }).click();
  await expect.poll(() => writes.find(write => write.pathname === '/.json')?.body?.['assignments/officer-1']).toBeNull();
  await expect(page.getByRole('dialog', { name: 'Assign a member' })).toHaveCount(0);
  expect(await page.evaluate(() => CONF.routes.r1.memberUid)).toBeUndefined();
  expect(await page.evaluate(() => !!CONF.routes.r1)).toBe(true);
  expect(authActions).toEqual(['signInWithPassword', 'delete']);
});

test('removing an imported officer clears the person fields without deleting the route', async ({ page }) => {
  const writes = await controlRoom(page);
  await page.evaluate(() => { CONF.routes.r1.officer = 'Imported Officer'; CONF.routes.r1.mobile = '+919876543210'; });
  await page.evaluate(() => memberModal('r1'));
  await page.getByRole('button', { name: 'Remove person', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove person' });
  await expect(confirmation).toContainText('no member sign-in is linked');
  await confirmation.getByRole('button', { name: 'Yes, remove person' }).click();
  await expect.poll(() => writes.find(w => w.pathname === '/config/routes/r1.json')?.body).toEqual({ officer: null, mobile: null });
  expect(await page.evaluate(() => ({ exists: !!CONF.routes.r1, officer: CONF.routes.r1.officer }))).toEqual({ exists: true });
});

test('an older unlinked member matching the officer mobile is deleted with the person', async ({ page }) => {
  const writes = await controlRoom(page, {
    '/assignments.json': { older: { ps: 'Example Rural Police Station', route: 'Route 12', mobile: '+919876543210' } },
    '/roles/older.json': 'route'
  });
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    const action = new URL(route.request().url()).pathname.split(':').pop();
    route.fulfill({ json: action === 'signInWithPassword' ? { localId: 'older', idToken: 'member-token' } : {} });
  });
  await page.evaluate(() => { CONF.routes.r1.officer = 'Older Officer'; CONF.routes.r1.mobile = '+919876543210'; });
  await page.evaluate(() => memberModal('r1'));
  await page.getByRole('button', { name: 'Remove person', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove person' });
  await confirmation.getByLabel('Current person password').fill('Existing-password');
  await confirmation.getByRole('button', { name: 'Yes, remove person' }).click();
  await expect.poll(() => writes.find(w => w.pathname === '/.json')?.body).toMatchObject({
    'roles/older': null, 'assignments/older': null, 'devices/older': null, 'live/older': null,
    'config/routes/r1/officer': null, 'config/routes/r1/mobile': null
  });
  expect(await page.evaluate(() => !!CONF.routes.r1)).toBe(true);
});

test('route settings follow the chosen police station and election', async ({ page }) => {
  await controlRoom(page);
  await page.evaluate(() => {
    CONF.routes.r2 = { ps: 'Other PS', sd: 'Other Division', route: 'Route 1', election: 'Election 2026' };
    CONF.routes.r3 = { ps: 'Example Rural Police Station', sd: 'Example Sub-division', route: 'Route 3', election: 'Other Election' };
    CONF.routes.r4 = { ps: 'Example Rural Police Station', sd: 'Example Sub-division', route: 'Route 4' };
    CONF.settings.election = 'Election 2026';
    render();
  });
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.locator('details[data-sec="routes"] summary')).toContainText('Routes (2');
  await page.locator('#fPs').selectOption('Example Rural Police Station');
  await expect(page.locator('details[data-sec="routes"] summary')).toContainText('Routes (1');
  await expect(page.locator('details[data-sec="routes"] tbody tr')).toHaveCount(1);
  await expect(page.locator('details[data-sec="routes"] tbody')).toContainText('Route 12');
});

test('removing shown routes deletes only those routes and their member records', async ({ page }) => {
  const writes = await controlRoom(page, {
    '/roles.json': { 'admin-1': 'admin', 'officer-1': 'route', 'orphan-1': 'route' },
    '/assignments.json': {
      'officer-1': { routeId: 'r1', ps: 'Example Rural Police Station', route: 'Route 12' },
      'orphan-1': { ps: 'Example Rural Police Station', route: 'Route 12' }
    }
  });
  await page.evaluate(() => {
    CONF.routes.r1.memberUid = 'officer-1';
    CONF.routes.r2 = { ps: 'Other PS', sd: 'Other Division', route: 'Route 1', election: 'Election 2026', memberUid: 'officer-2' };
    CONF.settings.election = 'Election 2026';
    render();
  });
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.locator('#fPs').selectOption('Example Rural Police Station');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove shown routes' }).click();
  await expect.poll(() => writes.find(w => w.pathname === '/.json')?.body).toMatchObject({
    'config/routes/r1': null,
    'roles/officer-1': null, 'assignments/officer-1': null, 'devices/officer-1': null, 'live/officer-1': null,
    'roles/orphan-1': null, 'assignments/orphan-1': null
  });
  expect(writes.find(w => w.pathname === '/.json').body).not.toHaveProperty('config/routes/r2');
  await expect.poll(() => page.evaluate(() => Object.keys(CONF.routes))).toEqual(['r2']);
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
    '/config/routes.json': { r2: { ps: 'Other PS', route: 'Route 1', memberUid: 'assigned' } },
    '/live/active.json': { duty: true }
  });
  for (const [uid, message] of [['privileged', 'administrator or monitor'], ['assigned', 'Remove that assignment first'], ['active', 'Stop duty']]) {
    const error = await page.evaluate(async uid => {
      try { await saveMemberAssignment('r1', { uid, officer: 'Example Officer', mobile: '' }); }
      catch (e) { return e.message; }
    }, uid);
    expect(error).toContain(message);
  }
  expect(writes).toEqual([]);
});

test('a removed route link does not block reassigning the same authenticated member', async ({ page }) => {
  const writes = await controlRoom(page, {
    '/roles/orphan.json': 'route',
    '/assignments/orphan.json': { ps: 'Chagallu PS', route: 'Route 1', officer: 'Former officer', mobile: '+917013297559' },
    '/config/routes.json': { r1: { ps: 'Example Rural Police Station', route: 'Route 12' } }
  });
  await page.evaluate(() => saveMemberAssignment('r1', { uid: 'orphan', officer: 'New officer', mobile: '+917013297559' }));
  expect(writes.find(write => write.pathname === '/.json')?.body?.['assignments/orphan']).toMatchObject({ routeId: 'r1', ps: 'Example Rural Police Station', route: 'Route 12' });
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
    localStorage.setItem('rm_poll_force', '1');
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

async function longRouteList(page) {
  const routes = {};
  for (let i = 1; i <= 60; i++) routes[`r${i}`] = { ps: 'Example Rural Police Station', route: `Route ${i}`, sd: 'Example Sub-division', villages: 'First village', officer: '', election: 'Election 2026', force: 'route' };
  await controlRoom(page, { '/config.json': { routes, stations: {}, settings: { election: '', autoSos: false } } });
  await page.locator('#tabs [data-tab="setup"]').click();
  const list = page.locator('details[data-sec="routes"] .tw');
  await expect(list).toBeVisible();
  await list.evaluate(el => { el.scrollTop = 400; });
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(400);
  await page.waitForTimeout(1100); // setting the position counts as scrolling; let that pass
  return list;
}

test('a long list keeps its place when the page refreshes itself', async ({ page }) => {
  const list = await longRouteList(page);

  // a phone report changes nothing in this list: it is left alone, so a scrollbar being dragged keeps working
  await page.evaluate(() => { window.drawnList = document.querySelector('details[data-sec="routes"] .tw'); render(); });
  expect(await page.evaluate(() => window.drawnList.isConnected)).toBe(true);
  expect(await list.evaluate(el => el.scrollTop)).toBe(400);

  // the list really changed: it is redrawn, in the same place
  await page.evaluate(() => { const draw = paneSetup; paneSetup = () => draw() + '<p id="listChanged">changed</p>'; render(); });
  await expect(page.locator('#listChanged')).toBeVisible();
  expect(await page.evaluate(() => window.drawnList.isConnected)).toBe(false);
  expect(await list.evaluate(el => el.scrollTop)).toBe(400);

  // saving a row redraws at once and also stays on that row
  await page.evaluate(() => renderPane());
  expect(await list.evaluate(el => el.scrollTop)).toBe(400);
});

test('the page waits for scrolling to pause before redrawing a list', async ({ page }) => {
  const list = await longRouteList(page);
  const stillThere = await page.evaluate(async () => {
    const el = document.querySelector('details[data-sec="routes"] .tw');
    window.drawnList = el;
    const scrolled = new Promise(done => el.addEventListener('scroll', done, { once: true }));
    el.scrollTop = 450; await scrolled;
    const draw = paneSetup; paneSetup = () => draw() + '<p id="listChanged">changed</p>';
    render();
    return el.isConnected && !document.querySelector('#listChanged');
  });
  expect(stillThere).toBe(true);
  // nothing else needs to arrive: the waiting redraw follows on its own
  await expect(page.locator('#listChanged')).toBeVisible();
  expect(await list.evaluate(el => el.scrollTop)).toBe(450);
  // putting the list back is not scrolling, so later redraws are not held up
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => { const old = document.querySelector('details[data-sec="routes"] .tw'); const draw = paneSetup; paneSetup = () => draw() + '<p id="listAgain">again</p>'; render(); return old.isConnected; })).toBe(false);
  await expect(page.locator('#listAgain')).toBeVisible();
});

test('a list starts at the top after choosing another tab or election', async ({ page }) => {
  const list = await longRouteList(page);
  await page.locator('#setElec').selectOption('Election 2026');
  await expect(page.locator('details[data-sec="routes"] summary')).toContainText('Election 2026');
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(0);

  await list.evaluate(el => { el.scrollTop = 400; });
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(400);
  await page.locator('#tabs [data-tab="alerts"]').click();
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(list).toBeVisible();
  expect(await list.evaluate(el => el.scrollTop)).toBe(0);
});

test('big screen numbers finish on the right value when a refresh lands during the count-up', async ({ page }) => {
  await controlRoom(page);
  const number = page.locator('#pane .tile b').first();
  await page.evaluate(() => { document.body.classList.add('wall'); UI.tab = 'sum'; renderPane(); });
  await expect(number).toBeVisible();
  const settled = await number.textContent();
  await page.evaluate(async () => {
    const el = document.querySelector('#pane .tile b');
    PREVNUM[el.dataset.k] = parseInt(el.textContent, 10) + 50;
    renderPane();
    await new Promise(done => setTimeout(done, 300));
    render();
  });
  await page.waitForTimeout(1600);
  await expect(number).toHaveText(settled);
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
    const betweenUpdates = status('unit1').k;
    LIVE.unit1.t = Date.now() - 100000;
    return { stopped, betweenUpdates, stale: status('unit1').k };
  });
  expect(gpsStates).toEqual({ stopped: 'stop', betweenUpdates: 'stop', stale: 'weak' });

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

async function openControlRoom(page) {
  const now = Date.now();
  await page.addInitScript(() => {
    localStorage.setItem('rm_cfg', JSON.stringify({ k: 'test-key', d: 'https://trace-demo.firebaseio.test', p: 'trace-demo' }));
    localStorage.setItem('rm_au', JSON.stringify({ rt: 'test-refresh', uid: 'admin-1', email: 'admin@example.test' }));
    localStorage.setItem('rm_poll_force', '1');
  });
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'test-id', expires_in: '3600', refresh_token: 'test-refresh', user_id: 'admin-1' } }));
  await page.route('https://trace-demo.firebaseio.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const data = {
      '/roles/admin-1.json': 'admin',
      '/devices.json': { unit1: { ps: 'Central', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '1000000000', force: 'route' }, unit2: { ps: 'East', route: 'Route 2', sd: 'North', officer: 'Officer B', mobile: '1000000001', force: 'route' } },
      '/live.json': { unit1: { lat: 16.98, lng: 82.24, t: now, up: now, gps: true, bat: 81, sig: 4, spd: 28, acc: 12 }, unit2: { lat: 17.02, lng: 82.3, t: now, up: now, gps: true, bat: 50, sig: 3, spd: 0, acc: 40 } },
      '/config.json': { routes: { r1: { ps: 'Central', route: 'Route 1', sd: 'North', force: 'route' }, r2: { ps: 'East', route: 'Route 2', sd: 'North', force: 'route' } }, stations: {}, settings: { election: '', autoSos: false } },
    };
    route.fulfill({ json: data[pathname] ?? {} });
  });
  await page.route(/arcgisonline|openstreetmap/, route => route.abort());
  await page.goto(url);
  await expect(page.locator('#counts')).toContainText('All phones');
}

async function expectMapFillsWindow(page) {
  const size = page.viewportSize();
  await expect.poll(async () => {
    const box = await page.locator('#map').boundingBox();
    return box && [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)];
  }).toEqual([0, 0, size.width, size.height]);
  for (const hidden of ['.hdr', '#tabs', '.bar', '#counts', 'aside.panel', '.ticker', '#dash']) await expect(page.locator(hidden)).toBeHidden();
  await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
  await expect(page.locator('#mapExit')).toBeVisible();
  // Leaflet has to know the new size, or tiles and markers stop short of the window edge.
  await expect.poll(() => page.evaluate(() => { const s = MAP.getSize(); return [s.x, s.y]; })).toEqual([size.width, size.height]);
}

test('Open full map on the Summary shows only the map and Exit returns to the Summary', async ({ page }) => {
  await openControlRoom(page);
  await expect(page.locator('#dash')).toBeVisible();
  await page.getByRole('button', { name: 'Open full map' }).click();
  await expectMapFillsWindow(page);
  expect(page.url()).toContain('#fullmap');

  await page.locator('#mapExit').click();
  await expect(page.locator('#mapExit')).toBeHidden();
  await expect(page.locator('#dash')).toBeVisible();
  await expect(page.locator('.hdr')).toBeVisible();
  await expect(page.locator('#tabs')).toBeVisible();
  await expect(page.locator('#dMap #map')).toBeVisible();
  expect(page.url()).not.toContain('#fullmap');
});

test('Full map button on Live Tracking shows only the map; Esc and Back both return', async ({ page }) => {
  await openControlRoom(page);
  await page.locator('#tabs [data-tab="veh"]').click();
  await expect(page.locator('aside.panel')).toBeVisible();
  const fullMap = page.locator('.fullmapctl a');
  await fullMap.click();
  await expectMapFillsWindow(page);
  await expect(fullMap).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(page.locator('#mapExit')).toBeHidden();
  await expect(page.locator('aside.panel')).toBeVisible();
  await expect(page.locator('#tabs [data-tab="veh"]')).toHaveAttribute('aria-selected', 'true');

  await fullMap.click();
  await expectMapFillsWindow(page);
  await page.goBack();
  await expect(page.locator('#mapExit')).toBeHidden();
  await expect(page.locator('aside.panel')).toBeVisible();
});

test('Full map fills a phone screen and keeps showing live positions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openControlRoom(page);
  await page.getByRole('button', { name: 'Open full map' }).click();
  await expectMapFillsWindow(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { MAP.setView([16.98, 82.24], 15, { animate: false }); });
  await expect(page.locator('#map .vm').first()).toBeVisible();
  await page.evaluate(() => {
    Object.assign(LIVE.unit1, { lat: 16.981, t: Date.now(), up: Date.now() });
    onLive('/unit1'); schedule();
  });
  // A new position is on screen quickly: redraw plus the marker's short slide, with no long catch-up glide.
  await expect.poll(() => page.evaluate(() => MK.unit1.getLatLng().lat), { timeout: 3000 }).toBeCloseTo(16.981, 5);
});

/* The next report from unit1, as the live stream would deliver it. */
const report = (page, fields) => page.evaluate(fields => {
  const now = Date.now();
  Object.assign(LIVE.unit1, { t: now, up: now, gps: true, duty: true, acc: 12 }, fields);
  onLive('/unit1'); schedule();
}, fields);
/* These tests deliver the reports themselves, so stop the fixture's fixed positions being read back over them. */
const stopReadingLive = page => page.evaluate(() => { const s = STREAMS.find(x => x.path === 'live'); clearInterval(s.timer); clearTimeout(s.retry); });
const openMapOnUnit1 = async page => {
  await openControlRoom(page);
  await stopReadingLive(page);
  await page.getByRole('button', { name: 'Open full map' }).click();
  await page.evaluate(() => { MAP.setView([16.98, 82.24], 16, { animate: false }); });
  await expect(page.locator('#map .vm').first()).toBeVisible();
};
/* Every position the marker is drawn at for a while, frame by frame. */
const watchMarker = (page, ms) => page.evaluate(ms => new Promise(done => {
  const seen = [], t0 = performance.now();
  const frame = now => { const p = MK.unit1.getLatLng(); seen.push([now, p.lat, p.lng]); if (now - t0 < ms) requestAnimationFrame(frame); else done(seen); };
  requestAnimationFrame(frame);
}), ms);
const metres = (a, b) => Math.hypot((a[1] - b[1]) * 111320, (a[2] - b[2]) * 111320 * Math.cos(a[1] * Math.PI / 180));

test("a moving phone's marker keeps travelling between reports and eases onto the next one", async ({ page }) => {
  await openMapOnUnit1(page);
  // Heading east at 36 km/h, which is 10 metres a second.
  await report(page, { lat: 16.981, lng: 82.24, spd: 36, hdg: 90 });
  const path = await watchMarker(page, 6000);
  const last = path[path.length - 1];
  expect(last[1]).toBeCloseTo(16.981, 5);
  const east = (last[2] - 82.24) * 111320 * Math.cos(16.981 * Math.PI / 180);
  expect(east).toBeGreaterThan(40);
  expect(east).toBeLessThan(62);
  // Never stands still and then jumps: always eastward, and no faster than a quick catch-up.
  for (let i = 1; i < path.length; i++) {
    expect(path[i][2]).toBeGreaterThanOrEqual(path[i - 1][2]);
    if (path[i][0] > path[i - 1][0]) expect(metres(path[i], path[i - 1]) / ((path[i][0] - path[i - 1][0]) / 1000)).toBeLessThan(80);
  }
  // Once on course, it moves at about the phone's real speed.
  const tail = path.filter(p => p[0] > last[0] - 2000);
  const speed = metres(last, tail[0]) / ((last[0] - tail[0][0]) / 1000);
  expect(speed).toBeGreaterThan(7);
  expect(speed).toBeLessThan(11);

  // The next report is a little ahead of the estimate, so the marker carries on forward onto it.
  await report(page, { lat: 16.981, lng: last[2] + 0.0002, spd: 36, hdg: 90 });
  const next = await watchMarker(page, 1500);
  for (let i = 1; i < next.length; i++) expect(next[i][2]).toBeGreaterThanOrEqual(next[i - 1][2]);
});

for (const [name, fields, sos] of [
  ['parked', { spd: 0, hdg: 90 }],
  ['with no direction', { spd: 36, hdg: 0 }],
  ['with poor GPS accuracy', { spd: 36, hdg: 90, acc: 200 }],
  ['with GPS off', { spd: 36, hdg: 90, gps: false }],
  ['in SOS', { spd: 36, hdg: 90 }, true],
]) test(`a phone ${name} shows exactly its reported position, with no estimate`, async ({ page }) => {
  await openMapOnUnit1(page);
  if (sos) await page.evaluate(() => { EVT.sos1 = { type: 'sos', uid: 'unit1', t: Date.now(), lat: 16.98, lng: 82.24 }; });
  await report(page, { lat: 16.981, lng: 82.24, ...fields });
  await expect.poll(() => page.evaluate(() => MK.unit1.getLatLng().lat), { timeout: 3000 }).toBeCloseTo(16.981, 5);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => { const p = MK.unit1.getLatLng(); return [p.lat, p.lng]; })).toEqual([16.981, 82.24]);
});

for (const [name, reportAge, sets] of [['recent report sets off straight away', 0, true], ['old report stays where it is', 60000, false]]) test(`a marker first drawn from a ${name}`, async ({ page }) => {
  await openMapOnUnit1(page);
  await page.evaluate(reportAge => {
    const t = Date.now() - reportAge;
    LAYER_V.removeLayer(MK.unit1); delete MK.unit1;
    Object.assign(LIVE.unit1, { lat: 16.98, lng: 82.24, t, up: t, gps: true, duty: true, acc: 12, spd: 36, hdg: 90 });
    render(); render();
  }, reportAge);
  await page.waitForTimeout(1500);
  const lng = await page.evaluate(() => MK.unit1.getLatLng().lng);
  if (sets) expect(lng).toBeGreaterThan(82.24004);
  else expect(lng).toBe(82.24);
});

test('a phone that goes quiet returns to its last reported position', async ({ page }) => {
  await page.clock.install();
  await openMapOnUnit1(page);
  await report(page, { lat: 16.981, lng: 82.24, spd: 36, hdg: 90 });
  await expect.poll(() => page.evaluate(() => MK.unit1.getLatLng().lng)).toBeGreaterThan(82.2401);
  await page.clock.fastForward(36000);
  await expect.poll(() => page.evaluate(() => { const p = MK.unit1.getLatLng(); return [p.lat, p.lng]; }), { timeout: 8000 }).toEqual([16.981, 82.24]);
  expect(await page.evaluate(() => Object.keys(GL))).toEqual([]);
});

test('190 moving phones can all glide without tying up the browser', async ({ page }) => {
  await openControlRoom(page);
  await stopReadingLive(page);
  const result = await page.evaluate(async () => {
    const now = Date.now();
    for (let i = 0; i < 190; i++) {
      const u = 'load' + i;
      DEV[u] = { ps: 'PS ' + (i % 29), route: 'Route ' + i, sd: 'SD ' + (i % 4), officer: 'Officer', mobile: '1', force: 'route' };
      LIVE[u] = { lat: 17 + (i % 14) * 0.01, lng: 81.8 + Math.floor(i / 14) * 0.01, t: now - 30000, up: now - 30000, gps: true, bat: 80, sig: 4, spd: 40, hdg: 45, acc: 12 };
    }
    MAP.setView([17.06, 81.86], 13, { animate: false });
    render();
    for (let i = 0; i < 190; i++) { const L_ = LIVE['load' + i]; L_.t = L_.up = Date.now(); L_.lat += 0.002; }
    render();
    const moving = Object.keys(GL).length;
    let busy = 0, frames = 0;
    const original = glideFrame;
    glideFrame = function (time) { const started = performance.now(); original(time); busy += performance.now() - started; frames++; };
    const before = MK.load0.getLatLng().lng, started = performance.now();
    await new Promise(done => setTimeout(done, 4000));
    const share = busy / (performance.now() - started);
    glideFrame = original;
    return { moving, frames, share, moved: MK.load0.getLatLng().lng > before };
  });
  expect(result.moving).toBe(190);
  expect(result.moved).toBe(true);
  expect(result.frames).toBeGreaterThanOrEqual(10);
  // Limit allows for slower test machines.
  expect(result.share).toBeLessThan(0.5);
});

test('redraws stay quick and few while 190 phones report', async ({ page }) => {
  await openControlRoom(page);
  const result = await page.evaluate(async () => {
    const now = Date.now();
    for (let i = 0; i < 190; i++) {
      const u = 'load' + i;
      DEV[u] = { ps: 'PS ' + (i % 29), route: 'Route ' + i, sd: 'SD ' + (i % 4), officer: 'Officer', mobile: '1', force: 'route' };
      LIVE[u] = { lat: 17 + (i % 14) * 0.03, lng: 81.8 + Math.floor(i / 14) * 0.03, t: now, up: now, gps: true, bat: 80, sig: 4, spd: 20, acc: 12 };
      TRAIL[u] = Array.from({ length: 300 }, (_, k) => [now - (300 - k) * 30000, 17 + k * 0.00001, 81.8, 12, 20]);
    }
    for (let i = 0; i < 1500; i++) EVT['load-event-' + i] = { type: 'loc', uid: 'load' + (i % 190), t: now - i * 1000 };
    UI.tab = 'sum'; renderTabs(); renderPane();
    let renders = 0, slowest = 0;
    const original = render;
    render = function () { const started = performance.now(); original.apply(this, arguments); renders++; slowest = Math.max(slowest, performance.now() - started); };
    let n = 0;
    const reports = setInterval(() => { const u = 'load' + (n++ % 190); LIVE[u].t = LIVE[u].up = Date.now(); onLive('/' + u); schedule(); }, 150);
    await new Promise(done => setTimeout(done, 6200));
    clearInterval(reports);
    render = original;
    return { renders, slowest };
  });
  // Often enough that new positions show promptly, without a redraw for every report. Limits allow for slower test machines.
  expect(result.renders).toBeGreaterThanOrEqual(5);
  expect(result.renders).toBeLessThanOrEqual(14);
  expect(result.slowest).toBeLessThan(1000);
});

test('a computer left on slow polling by an older version goes back to live streaming', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('rm_poll', '1'); localStorage.setItem('rm_poll_until', String(Date.now() + 1000)); } });
  await page.goto(url);
  const state = await page.evaluate(() => [localStorage.getItem('rm_poll'), pollForced(), pollUntil() > Date.now()]);
  expect(state).toEqual([null, false, true]);
  await expect.poll(() => page.evaluate(() => pollUntil() > Date.now()), { timeout: 3000 }).toBe(false);
});

/* Streams the test controls, so one can go quiet with no error at all, as a frozen connection does. */
async function streamingControlRoom(page) {
  const reads = [];
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('rm_cfg', JSON.stringify({ k: 'test-key', d: 'https://trace-demo.firebaseio.test', p: 'trace-demo' }));
    localStorage.setItem('rm_au', JSON.stringify({ rt: 'test-refresh', uid: 'admin-1', email: 'admin@example.test' }));
    window.OPENED = [];
    window.EventSource = class {
      constructor(address) { this.branch = new URL(address).pathname.slice(1, -5); this.readyState = 1; this.on = {}; OPENED.push(this); setTimeout(() => this.onopen?.()); }
      addEventListener(name, listener) { this.on[name] = listener; }
      emit(name, data) { if (this.readyState === 1) this.on[name]?.({ data: JSON.stringify(data) }); }
      close() { this.readyState = 2; }
    };
    window.openCount = branch => OPENED.filter(s => s.branch === branch).length;
    window.putTo = (branch, data) => OPENED.filter(s => s.branch === branch).forEach(s => s.emit('put', { path: '/', data }));
  });
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'test-id', expires_in: '3600', refresh_token: 'test-refresh', user_id: 'admin-1' } }));
  await page.route('https://trace-demo.firebaseio.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    reads.push(pathname);
    route.fulfill({ json: pathname === '/roles/admin-1.json' ? 'admin' : {} });
  });
  await page.route(/arcgisonline|openstreetmap/, route => route.abort());
  await page.goto(url);
  await expect(page.locator('#app')).toBeVisible();
  await expect.poll(() => page.evaluate(() => openCount('live'))).toBe(1);
  await expect(page.locator('#conn')).toHaveText('Live');
  return reads;
}

test('a frozen stream reconnects by itself and nothing on screen shows it happening', async ({ page }) => {
  const reads = await streamingControlRoom(page);
  await page.evaluate(() => {
    putTo('config', { routes: { r1: { ps: 'Central', route: 'Route 1', sd: 'North', force: 'route' } }, stations: {}, settings: { election: '', autoSos: false } });
    putTo('devices', { unit1: { ps: 'Central', route: 'Route 1', sd: 'North', officer: 'Officer A', mobile: '1000000000', force: 'route' } });
    putTo('live', { unit1: { lat: 16.98, lng: 82.24, t: Date.now(), up: Date.now(), gps: true, bat: 81, sig: 4, spd: 28, acc: 12 } });
  });
  await page.getByRole('button', { name: 'Open full map' }).click();
  await page.evaluate(() => { MAP.setView([16.98, 82.24], 15, { animate: false }); });
  await expect.poll(() => page.evaluate(() => MK.unit1?.getLatLng().lat)).toBeCloseTo(16.98, 5);
  await page.evaluate(() => {
    window.NOT_RELOADED = true; window.CONN_SEEN = new Set(); window.TOASTS = 0;
    new MutationObserver(() => CONN_SEEN.add($('#conn').textContent)).observe($('#conn'), { childList: true, characterData: true, subtree: true });
    new MutationObserver(list => list.forEach(x => x.addedNodes.forEach(n => { if (n.classList?.contains('toast')) TOASTS++; }))).observe(document.body, { childList: true });
  });

  await page.clock.fastForward(46000);
  await expect.poll(() => page.evaluate(() => openCount('live'))).toBe(2);
  await page.evaluate(() => putTo('live', { unit1: { lat: 16.99, lng: 82.24, t: Date.now(), up: Date.now(), gps: true, bat: 81, sig: 4, spd: 28, acc: 12 } }));
  await expect.poll(() => page.evaluate(() => MK.unit1.getLatLng().lat), { timeout: 3000 }).toBeCloseTo(16.99, 5);

  const seen = await page.evaluate(() => ({ reloaded: !window.NOT_RELOADED, labels: [...CONN_SEEN], toasts: TOASTS, firstClosed: OPENED.find(s => s.branch === 'live').readyState === 2, stillFullMap: document.body.classList.contains('map-full') }));
  expect(seen).toEqual({ reloaded: false, labels: ['Live'], toasts: 0, firstClosed: true, stillFullMap: true });
  expect(reads).not.toContain('/live.json');
});

test('a healthy stream is left alone and costs no extra reads', async ({ page }) => {
  const reads = await streamingControlRoom(page);
  const opened = await page.evaluate(() => OPENED.length);
  for (let i = 0; i < 6; i++) {
    await page.clock.fastForward(30000);
    await page.evaluate(() => OPENED.forEach(s => s.branch === 'live' ? s.emit('patch', { path: '/', data: {} }) : s.emit('keep-alive', null)));
  }
  expect(await page.evaluate(() => OPENED.length)).toBe(opened);
  expect(reads).not.toContain('/live.json');
});

test('only the stream that went silent is reopened, so a frozen SOS feed is caught too', async ({ page }) => {
  await streamingControlRoom(page);
  for (let i = 0; i < 2; i++) {
    await page.clock.fastForward(30000);
    await page.evaluate(() => OPENED.forEach(s => { if (s.branch !== 'events') s.emit('keep-alive', null); }));
  }
  await expect.poll(() => page.evaluate(() => openCount('events'))).toBe(2);
  expect(await page.evaluate(() => openCount('live'))).toBe(1);
});

test('a network where reopening achieves nothing falls back to reading at intervals', async ({ page }) => {
  const reads = await streamingControlRoom(page);
  for (let opened = 2; opened <= 4; opened++) {
    await page.clock.fastForward(46000);
    await expect.poll(() => page.evaluate(() => openCount('live'))).toBe(opened);
  }
  expect(reads).not.toContain('/live.json');
  await page.clock.fastForward(46000);
  await expect.poll(() => page.evaluate(() => STREAMS.find(s => s.path === 'live').mode)).toBe('poll');
  await expect.poll(() => reads.includes('/live.json')).toBe(true);
  await expect(page.locator('#conn')).toHaveText('Live · auto-refresh');
});

test('coming back to the page after the computer slept reconnects at once', async ({ page }) => {
  await streamingControlRoom(page);
  await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 50000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(() => openCount('live'))).toBe(2);
});

const viewerFixture = now => ({
  '/roles/si-1.json': 'si_monitor',
  '/siScopes/si-1.json': { mandal: 'Kadiyam', officer: 'SI Example', routes: { r1: true, r2: true }, stations: { s1: true, s2: true } },
  '/config/routes/r1.json': { ps: 'Kadiyam PS', route: 'Route 1', memberUid: 'unit-1' },
  '/config/routes/r2.json': { ps: 'Kadiyam PS', route: 'Route 2', memberUid: 'unit-2' },
  '/config/stations/s1.json': { name: 'Booth 1', ps: 'Kadiyam PS', route: 'Route 1', lat: 16.91, lng: 81.84 },
  '/config/stations/s2.json': { name: 'Booth 2', ps: 'Kadiyam PS', route: 'Route 2', lat: 16.92, lng: 81.85 },
  '/devices/unit-1.json': { ps: 'Kadiyam PS', officer: 'HC Example', mobile: '9000000000' },
  '/devices/unit-2.json': { ps: 'Kadiyam PS', officer: 'PC Example', mobile: '9000000001' },
  '/live/unit-1.json': { lat: 16.95, lng: 81.9, up: now, t: now, gps: true, duty: true, acc: 10 },
  '/live/unit-2.json': { lat: 16.96, lng: 81.91, up: now, t: now, gps: true, duty: true, acc: 40 },
  '/events.json': {},
});

test('viewer refresh re-reads only positions and latest events, so many viewers stay light', async ({ page }) => {
  const reads = [], data = viewerFixture(Date.now());
  await page.addInitScript(() => sessionStorage.setItem('rm_si_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })));
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => {
    const address = new URL(route.request().url());
    reads.push(address.pathname + address.search);
    route.fulfill({ json: data[address.pathname] ?? null });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(siUrl);
  await expect(page.locator('#routes')).toContainText('HC Example');
  expect(reads.filter(x => x.startsWith('/events.json')).every(x => x.includes('limitToLast=15'))).toBe(true);
  reads.length = 0;
  await page.evaluate(() => refresh());
  expect(reads.map(x => x.split('?')[0]).sort()).toEqual(['/events.json', '/events.json', '/live/unit-1.json', '/live/unit-2.json']);
});

test('standalone viewer full map shows only the map', async ({ page }) => {
  const data = viewerFixture(Date.now());
  await page.addInitScript(() => sessionStorage.setItem('rm_si_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })));
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(siUrl);
  await expect(page.locator('#routes')).toContainText('HC Example');
  await page.locator('#fullMap').click();
  await expect.poll(async () => { const b = await page.locator('#map').boundingBox(); return [b.x, b.y, b.width, b.height]; }).toEqual([0, 0, 1440, 900]);
  await expect.poll(() => page.evaluate(() => { const s = map.getSize(); return [s.x, s.y]; })).toEqual([1440, 900]);
  await expect(page.locator('#fullMap')).toHaveText(/Exit full map/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#fullMap')).toHaveText(/Full map/);
  await expect.poll(async () => (await page.locator('#map').boundingBox()).width).toBeLessThan(1440);
});

test('viewer portal on the main site has a full map too', async ({ page }) => {
  const data = viewerFixture(Date.now());
  await page.addInitScript(() => localStorage.setItem('rm_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })));
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(url);
  await expect(page.locator('#viewerRoutes')).toContainText('HC Example');
  await page.locator('#viewerFullMap').click();
  await expect.poll(async () => { const b = await page.locator('#viewerMap').boundingBox(); return [b.x, b.y, b.width, b.height]; }).toEqual([0, 0, 1440, 900]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewerFullMap')).toHaveText(/Full map/);
  await expect.poll(async () => (await page.locator('#viewerMap').boundingBox()).width).toBeLessThan(1440);
});

for (const [name, address, table, seed] of [
  ['standalone viewer', siUrl, '#routes', () => sessionStorage.setItem('rm_si_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' }))],
  ['viewer portal', url, '#viewerRoutes', () => localStorage.setItem('rm_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' }))],
]) test(`${name} catches up as soon as someone comes back to its tab`, async ({ page }) => {
  const reads = [], data = viewerFixture(Date.now());
  await page.addInitScript(seed);
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    reads.push(pathname);
    route.fulfill({ json: data[pathname] ?? null });
  });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(address);
  await expect(page.locator(table)).toContainText('HC Example');
  reads.length = 0;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // The regular read is at least 10 seconds away, so a read this soon can only be the catch-up.
  await expect.poll(() => reads.includes('/live/unit-1.json'), { timeout: 3000 }).toBe(true);
});

for (const [name, address, table, seed, refreshNow, marker] of [
  ['standalone viewer', siUrl, '#routes', () => sessionStorage.setItem('rm_si_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })), () => refresh(), () => { const p = markers['unit-1'].getLatLng(); return [p.lat, p.lng]; }],
  ['viewer portal', url, '#viewerRoutes', () => localStorage.setItem('rm_au', JSON.stringify({ rt: 'si-refresh', uid: 'si-1', email: 'si919876543210@members.track.invalid' })), () => refreshViewer(), () => { const p = VIEWER_MARKERS['unit-1'].getLatLng(); return [p.lat, p.lng]; }],
]) test(`${name} map moves smoothly instead of jumping`, async ({ page }) => {
  const data = viewerFixture(Date.now());
  await page.addInitScript(seed);
  await page.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { id_token: 'si-token', expires_in: '3600', refresh_token: 'si-refresh', user_id: 'si-1' } }));
  await page.route('https://officer-8eb52-default-rtdb.asia-southeast1.firebasedatabase.app/**', route => route.fulfill({ json: data[new URL(route.request().url()).pathname] ?? null }));
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.goto(address);
  await expect(page.locator(table)).toContainText('HC Example');
  expect(await page.evaluate(marker)).toEqual([16.95, 81.9]);
  // A new report about 110 metres north, still heading east at 36 km/h.
  const now = Date.now();
  data['/live/unit-1.json'] = { lat: 16.951, lng: 81.9, up: now, t: now, gps: true, duty: true, acc: 10, spd: 36, hdg: 90 };
  await page.evaluate(refreshNow);
  expect((await page.evaluate(marker))[0]).toBeLessThan(16.9505);
  await expect.poll(async () => (await page.evaluate(marker))[0], { timeout: 5000 }).toBeCloseTo(16.951, 5);
  await expect.poll(async () => (await page.evaluate(marker))[1], { timeout: 5000 }).toBeGreaterThan(81.9002);
});

const reportingUnit = { unit1: { sd: 'Rural', ps: 'Example Rural Police Station', route: 'Route 12', officer: 'HC Example', mobile: '9000000000', force: 'route' } };
const reportingConfig = {
  routes: { r1: { ps: 'Example Rural Police Station', route: 'Route 12', sd: 'Rural', force: 'route' } },
  stations: { s1: { name: 'ZP School Booth 12', ps: 'Example Rural Police Station', route: 'Route 12', lat: 17, lng: 81.8, voters: 1000 } },
  settings: { election: '', autoSos: false }
};
// the records the Route app writes from its Polling and SOS pages
const phoneReports = now => ({
  votes1: { type: 'votes', uid: 'unit1', t: now - 60000, ps: 'Example Rural Police Station', sid: 's1', sname: 'ZP School Booth 12', note: '', n: 250, lat: 17, lng: 81.8 },
  report1: { type: 'loc', status: 'loc', uid: 'unit1', t: now - 50000, ps: 'Example Rural Police Station', sid: 's1', sname: 'ZP School Booth 12', note: 'Crowd building at the gate' },
  tension1: { type: 'loc', status: 'tension', uid: 'unit1', t: now - 40000, ps: 'Example Rural Police Station', sid: '', sname: '', note: 'Argument between agents' }
});

test('a voice message from a phone does not stop Alerts showing SOS and reports', async ({ page }) => {
  const now = Date.now(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': {
    voice1: { type: 'msg', uid: 'unit1', t: now - 5000, voice: 'clip1', text: 'Voice message from patrol' },
    sos1: { type: 'sos', uid: 'unit1', t: now - 2000, lat: 17, lng: 81.8 }
  } });
  await page.locator('#tabs [data-tab="alerts"]').click();
  await expect(page.locator('#pane')).toContainText('pressed NEED HELP');
  await expect(page.locator('#pane')).toContainText('Example Rural Police Station – Route 12 sent a voice message');
  await expect(page.locator('#pane [data-act="voicePlay"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark attended' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a section that fails to draw says so instead of leaving the last screen showing', async ({ page }) => {
  await controlRoom(page);
  await page.evaluate(() => { const original = paneInc; paneInc = () => { throw new Error('broken record'); }; UI.tab = 'inc'; renderPane(); paneInc = original; });
  await expect(page.locator('#pane')).toContainText('This section could not be drawn');
  await expect(page.locator('#pane')).toContainText('broken record');
});

test('Polling page reports show on the home card, in Alerts and in Locations', async ({ page }) => {
  const now = Date.now();
  await controlRoom(page, { '/config.json': reportingConfig, '/devices.json': reportingUnit, '/events.json': phoneReports(now) });
  const home = page.locator('#dPs');
  await expect(home).toContainText('25.0%');
  await expect(home).toContainText('250 votes of 1,000 voters');
  await expect(home).toContainText('1 of 1 locations reported');
  await expect(home).toContainText('Situation report at ZP School Booth 12 – Crowd building at the gate');
  await expect(home.locator('.ps-reports li.urgent')).toContainText('Argument between agents');
  await page.locator('#tabs [data-tab="alerts"]').click();
  const pane = page.locator('#pane');
  await expect(pane).toContainText('Reports from officers (3)');
  await expect(pane).toContainText('250 votes polled at ZP School Booth 12 (25.0% of 1,000 voters)');
  await expect(pane).not.toContainText('LOC');
  await expect(pane.locator('.alert.urgent')).toContainText('Tension – Argument between agents');
  await page.locator('#tabs [data-tab="loc"]').click();
  await pane.locator('.ps-turnout').click();
  await expect(pane).toContainText('250 votes polled of 1,000 voters');
  await expect(pane).toContainText('SITUATION REPORT – Crowd building at the gate');
});

test('the home polling card links to the turnout and to every report', async ({ page }) => {
  const now = Date.now();
  await controlRoom(page, { '/config.json': reportingConfig, '/devices.json': reportingUnit, '/events.json': phoneReports(now) });
  await page.locator('#dPs .ps-all').click();
  await expect(page.locator('#pane')).toContainText('Reports from officers (3)');
  await page.locator('#tabs [data-tab="sum"]').click();
  await page.locator('#dPs .ps-turnout').click();
  await expect(page.locator('#tabs [data-tab="loc"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pane')).toContainText('Poll percentage');
});

test('a phone report with no polling location still counts as an open alert until attended', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': { tension1: phoneReports(now).tension1 } });
  expect(await page.evaluate(() => alertCount())).toBe(1);
  await page.locator('#tabs [data-tab="alerts"]').click();
  await page.locator('#pane .alert.urgent').getByRole('button', { name: 'Mark attended' }).click();
  await expect(page.locator('#pane .alert.urgent')).toHaveCount(0);
  await expect(page.locator('#pane')).toContainText('attended by admin@example.test');
  expect(writes).toEqual([expect.objectContaining({ pathname: '/events/tension1.json', body: expect.objectContaining({ ackBy: 'admin@example.test' }) })]);
  await expect.poll(() => page.evaluate(() => alertCount())).toBe(0);
});

test('a route with no polling location the phone can list is pointed out', async ({ page }) => {
  await controlRoom(page, { '/config.json': {
    routes: { r1: { ps: 'Kadiyam PS', route: 'Route 1', sd: 'Rural', memberUid: 'unit1' } },
    stations: { s1: { name: 'Booth', ps: 'Kadiyam PS', route: 'R1', lat: 17, lng: 81.8 } },
    settings: { election: '' }
  } });
  await page.locator('#tabs [data-tab="loc"]').click();
  await expect(page.locator('#pane')).toContainText('1 assigned route has no polling locations on the phone');
  await expect(page.locator('#pane')).toContainText('Kadiyam PS · Route 1');
});

test('a phone update while Mark attended is held down does not lose the click', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': { sos1: { type: 'sos', uid: 'unit1', t: now - 2000, lat: 17, lng: 81.8 } } });
  await page.locator('#tabs [data-tab="alerts"]').click();
  const button = page.locator('#pane').getByRole('button', { name: 'Mark attended' });
  const box = await button.boundingBox();
  await page.evaluate(() => { document.querySelector('[data-act="ack"]').dataset.before = '1'; });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => schedule(true));
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => document.querySelector('[data-act="ack"]').dataset.before)).toBe('1');
  await page.mouse.up();
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.locator('#pane')).toContainText('Attended by admin@example.test');
  // and the redraw that waited still happens
  await page.evaluate(() => { LIVE.unit1 = { lat: 17, lng: 81.8, t: Date.now(), up: Date.now(), gps: true, duty: true, bat: 15 }; schedule(true); });
  await expect(page.locator('#pane')).toContainText('battery 15%');
});

test('Mark attended clears every press of SOS from that unit', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': {
    sos1: { type: 'sos', uid: 'unit1', t: now - 30000 }, sos2: { type: 'sos', uid: 'unit1', t: now - 20000 }, sos3: { type: 'sos', uid: 'unit1', t: now - 10000 }
  } });
  await page.locator('#tabs [data-tab="alerts"]').click();
  await expect(page.locator('#pane .alert.sos')).toHaveCount(1);
  await expect(page.locator('#pane')).toContainText('pressed NEED HELP 3 times');
  await page.locator('#pane').getByRole('button', { name: 'Mark attended' }).click();
  await expect(page.locator('#pane .alert.sos.done')).toHaveCount(1);
  expect(writes.map(x => x.pathname).sort()).toEqual(['/events/sos1.json', '/events/sos2.json', '/events/sos3.json']);
  expect(await page.evaluate(() => sosOpen('unit1'))).toBe(false);
  await page.locator('#pane').getByRole('button', { name: 'Remove from list' }).click();
  await expect(page.locator('#pane .alert.sos')).toHaveCount(0);
  expect(writes.filter(x => x.body.cleared)).toHaveLength(3);
});

test('an SOS can be attended from its Vehicles card', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': { sos1: { type: 'sos', uid: 'unit1', t: now - 2000 } } });
  await page.locator('#tabs [data-tab="veh"]').click();
  await page.locator('#pane').getByRole('button', { name: 'Mark SOS attended' }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.locator('#pane').getByRole('button', { name: 'Mark SOS attended' })).toHaveCount(0);
});

test('the SOS popup can mark it attended, and skips popups for presses already attended', async ({ page }) => {
  const writes = await controlRoom(page, { '/devices.json': reportingUnit });
  await page.waitForTimeout(3500);   // the first pass only records what is already there
  await page.evaluate(() => { const t = Date.now(); EVT.sos1 = { type: 'sos', uid: 'unit1', t, lat: 17, lng: 81.8 }; EVT.sos2 = { type: 'sos', uid: 'unit1', t: t + 1, lat: 17, lng: 81.8 }; });
  const popup = page.locator('.bigalert');
  await expect(popup).toContainText('SOS – NEED HELP', { timeout: 8000 });
  await popup.getByRole('button', { name: 'Mark attended' }).click();
  await expect(popup).toHaveCount(0);
  expect(writes.map(x => x.pathname).sort()).toEqual(['/events/sos1.json', '/events/sos2.json']);
  await page.waitForTimeout(600);
  await expect(popup).toHaveCount(0);
});

test('closing an incident made from an SOS popup attends the SOS', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': { sos1: { type: 'sos', uid: 'unit1', t: now - 2000, lat: 17, lng: 81.8 } } });
  await page.evaluate(() => { INC.i1 = { no: 1, t: Date.now(), lat: 17, lng: 81.8, place: 'SOS place', status: 'open', sourceEventId: 'sos1' }; closeIncidentDialog('i1'); });
  await page.getByRole('button', { name: 'Close incident' }).click();
  await expect.poll(() => writes.some(x => x.pathname === '/events/sos1.json')).toBe(true);
  await expect.poll(() => page.evaluate(() => sosOpen('unit1'))).toBe(false);
});

test('an account without administrator rights is told why it cannot attend an SOS', async ({ page }) => {
  const now = Date.now();
  const writes = await controlRoom(page, { '/roles/admin-1.json': 'monitor', '/devices.json': reportingUnit, '/events.json': { sos1: { type: 'sos', uid: 'unit1', t: now - 2000 } } });
  await page.locator('#tabs [data-tab="alerts"]').click();
  await page.locator('#pane').getByRole('button', { name: 'Mark attended' }).click();
  await expect(page.locator('.toast')).toContainText('An administrator account is required');
  expect(writes).toEqual([]);
});

test('reading at intervals still shows late reports, wrong phone clocks and an SOS attended elsewhere', async ({ page }) => {
  const now = Date.now(), events = { start1: { type: 'start', uid: 'unit1', t: now - 1000 }, sos1: { type: 'sos', uid: 'unit1', t: now - 500 } };
  await controlRoom(page, { '/devices.json': reportingUnit, '/events.json': events });
  await expect.poll(() => page.evaluate(() => sosOpen('unit1'))).toBe(true);
  const read = () => page.evaluate(() => STREAMS.find(x => x.path === 'events').poll());
  events.late = { type: 'votes', uid: 'unit1', t: now - 45 * 60000, sid: 's1', sname: 'Booth', n: 10 };   // queued offline
  await read();
  expect(await page.evaluate(() => !!EVT.late)).toBe(true);
  events.fastClock = { type: 'start', uid: 'unit1', t: now + 3600000 };
  await read();
  events.afterFastClock = { type: 'sos', uid: 'unit1', t: now };
  await read();
  expect(await page.evaluate(() => !!EVT.afterFastClock)).toBe(true);
  events.sos1.ackBy = events.afterFastClock.ackBy = 'other-operator';
  await read();
  expect(await page.evaluate(() => sosOpen('unit1'))).toBe(false);
});

/* a stand-in for Firebase Authentication: an old password really stops working */
async function fakeAuth(page, accounts, limit) {
  const calls = [];
  await page.route('https://identitytoolkit.googleapis.com/**', route => {
    const action = /accounts:(\w+)/.exec(route.request().url())[1], body = route.request().postDataJSON();
    calls.push({ action, email: body.email, hasToken: !!body.idToken });
    if (action === 'signInWithPassword') {
      if (limit && limit()) return route.fulfill({ status: 400, json: { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : Too many failed attempts.' } } });
      const account = accounts[body.email];
      if (!account) return route.fulfill({ status: 400, json: { error: { message: 'EMAIL_NOT_FOUND' } } });
      if (account.password !== body.password) return route.fulfill({ status: 400, json: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
      return route.fulfill({ json: { localId: account.uid, idToken: 'token-' + account.uid, refreshToken: 'refresh' } });
    }
    if (action === 'signUp') return route.fulfill({ status: 400, json: { error: { message: 'EMAIL_EXISTS' } } });
    if (action === 'update') {
      const account = Object.values(accounts).find(x => 'token-' + x.uid === body.idToken);
      if (!account) return route.fulfill({ status: 400, json: { error: { message: 'INVALID_ID_TOKEN' } } });
      account.password = body.password;
      return route.fulfill({ json: { localId: account.uid, idToken: 'new', refreshToken: 'new' } });
    }
    return route.fulfill({ status: 400, json: { error: { message: 'UNEXPECTED' } } });
  });
  return calls;
}
const passwordData = {
  '/assignments.json': {
    a1: { officer: 'Officer One', ps: 'Kadiyam PS', route: 'Route 1', mobile: '9000000001' },
    a2: { officer: 'Officer Two', ps: 'Kadiyam PS', route: 'Route 2', mobile: '9000000002' },
    noPhone: { officer: 'Officer Three', ps: 'Kadiyam PS', route: 'Route 3', mobile: '' }
  },
  '/siScopes.json': { v1: { officer: 'Viewer One', mandal: 'Kadiyam', mobile: '+919000000003' } },
  '/live.json': { a1: { duty: true, up: Date.now(), lat: 17, lng: 81.8, t: Date.now() } },
  '/devices.json': { a1: { ps: 'Kadiyam PS', route: 'Route 1' } }
};
const passwordAccounts = () => ({
  'phone919000000001@members.track.invalid': { uid: 'a1', password: 'Old-password-1' },
  'phone919000000002@members.track.invalid': { uid: 'a2', password: 'Different-old-2' },
  'si919000000003@members.track.invalid': { uid: 'v1', password: 'Old-password-1' }
});
async function openChangeAll(page) {
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Change all passwords' }).click();
  await expect(page.locator('.pw-modal')).toBeVisible();
  return page.locator('.pw-modal');
}
const pwRow = (modal, mobile) => modal.locator('tbody tr', { hasText: mobile });

test('change all passwords replaces each password and reports only the wrong ones', async ({ page }) => {
  const accounts = passwordAccounts();
  const writes = await controlRoom(page, passwordData);
  const calls = await fakeAuth(page, accounts);
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
  const modal = await openChangeAll(page);
  await expect(modal).toContainText('1 phone is on duty now');
  await expect(pwRow(modal, '9000000001')).toContainText('On duty now');
  await expect(pwRow(modal, 'Officer Three')).toContainText('No valid mobile number');
  await expect(pwRow(modal, 'Officer Three').locator('[data-pick]')).toBeDisabled();
  await modal.locator('[data-fill-current]').fill('Old-password-1');
  await modal.locator('[data-fill-new]').fill('New-password-9');
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(modal.locator('[data-progress]')).toContainText('2 changed, 1 not changed');
  expect(dialogs[0]).toContain('Change the password of 3 people');
  expect(dialogs[0]).toContain('1 phone is on duty');
  await expect(pwRow(modal, '9000000001')).toContainText('Changed');
  await expect(pwRow(modal, '9000000003')).toContainText('Changed');
  await expect(pwRow(modal, '9000000002')).toContainText('Current password is wrong');
  expect(accounts['phone919000000001@members.track.invalid'].password).toBe('New-password-9');
  expect(accounts['si919000000003@members.track.invalid'].password).toBe('New-password-9');
  expect(accounts['phone919000000002@members.track.invalid'].password).toBe('Different-old-2');
  // retrying touches only the one that failed
  calls.length = 0;
  await pwRow(modal, '9000000002').locator('[data-current]').fill('Different-old-2');
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(pwRow(modal, '9000000002')).toContainText('Changed');
  expect(calls.map(x => x.email).filter(Boolean)).toEqual(['phone919000000002@members.track.invalid']);
  expect(accounts['phone919000000002@members.track.invalid'].password).toBe('New-password-9');
  // the database never receives a password, and the administrator stays signed in
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => AU.uid)).toBe('admin-1');
  expect(await page.evaluate(() => localStorage.getItem('rm_au'))).not.toContain('New-password');
  await expect(modal.getByRole('button', { name: 'Download new passwords' })).toBeVisible();
  const download = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Download new passwords' }).click();
  expect((await download).suggestedFilename()).toBe('TRACK-new-passwords.xlsx');
  dialogs.length = 0;
  await modal.getByRole('button', { name: 'Close' }).click();
  expect(dialogs).toEqual([]);
  await expect(modal).toHaveCount(0);
});

test('change passwords can search and select one police station', async ({ page }) => {
  const data = {
    ...passwordData,
    '/assignments.json': {
      ...passwordData['/assignments.json'],
      a3: { officer: 'Officer Four', ps: 'Rajamahendravaram PS', route: 'Route 1', mobile: '9000000004' }
    }
  };
  const accounts = {
    ...passwordAccounts(),
    'phone919000000004@members.track.invalid': { uid: 'a3', password: 'Old-password-4' }
  };
  await controlRoom(page, data);
  const calls = await fakeAuth(page, accounts);
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
  const modal = await openChangeAll(page);
  await modal.getByLabel('Search PS').fill('raja');
  await expect(modal.locator('[data-ps-select] option')).toHaveText(['All logins (including viewers)', 'All route officers (all PS)', 'Rajamahendravaram PS']);
  await modal.getByLabel('Select PS').selectOption('Rajamahendravaram PS');
  await expect(modal.locator('[data-scope-count]')).toContainText('Only eligible logins at this PS are selected');
  await expect(pwRow(modal, '9000000004')).toBeVisible();
  await expect(pwRow(modal, '9000000001')).toBeHidden();
  await expect(pwRow(modal, '9000000003')).toBeHidden();
  await modal.locator('[data-fill-current]').fill('Old-password-4');
  await modal.locator('[data-fill-new]').fill('New-password-4');
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(pwRow(modal, '9000000004')).toContainText('Changed');
  expect(dialogs[0]).toContain('Change the password of 1 person');
  expect(calls.map(x => x.email).filter(Boolean)).toEqual(['phone919000000004@members.track.invalid']);
  expect(accounts['phone919000000004@members.track.invalid'].password).toBe('New-password-4');
  expect(accounts['phone919000000001@members.track.invalid'].password).toBe('Old-password-1');
  await modal.getByLabel('Select PS').selectOption('');
  await expect(pwRow(modal, '9000000001')).toBeVisible();
  await modal.getByLabel('Select PS').selectOption('__all_routes__');
  await expect(modal.locator('[data-scope-count]')).toContainText('4 route officers');
  await expect(pwRow(modal, '9000000003')).toBeHidden();
  await expect(pwRow(modal, '9000000001').locator('[data-pick]')).toBeChecked();
});

test('change all passwords stops when Firebase pauses sign-ins', async ({ page }) => {
  let tries = 0;
  const accounts = passwordAccounts();
  await controlRoom(page, passwordData);
  await fakeAuth(page, accounts, () => ++tries > 1);
  page.on('dialog', dialog => dialog.accept());
  const modal = await openChangeAll(page);
  await modal.locator('[data-fill-current]').fill('Old-password-1');
  await modal.locator('[data-fill-new]').fill('New-password-9');
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(modal.locator('.err')).toContainText('paused sign-ins');
  await expect(modal.locator('tbody')).toContainText('Not tried');
  expect(tries).toBe(2);
});

test('change all passwords checks its entries and asks before closing unsaved results', async ({ page }) => {
  const accounts = passwordAccounts();
  await controlRoom(page, passwordData);
  const calls = await fakeAuth(page, accounts);
  const modal = await openChangeAll(page);
  await modal.locator('[data-fill-new]').fill('New-password-9');
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(modal.locator('.err')).toContainText('Enter both passwords for 3 more people');
  expect(calls).toEqual([]);
  await modal.locator('[data-fill-current]').fill('Old-password-1');
  await modal.locator('[data-fill-new]').fill('short');
  page.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(pwRow(modal, '9000000001')).toContainText('at least 8 characters');
  expect(calls).toEqual([]);
  // the same password again is not a change
  await modal.locator('[data-fill-new]').fill('Old-password-1');
  page.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(pwRow(modal, '9000000001')).toContainText('must be different');
  expect(calls).toEqual([]);
  // cancelling the question changes nothing
  await modal.locator('[data-fill-new]').fill('New-password-9');
  page.once('dialog', dialog => dialog.dismiss());
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  expect(calls).toEqual([]);
  await pwRow(modal, '9000000002').locator('[data-pick]').uncheck();
  await pwRow(modal, '9000000003').locator('[data-pick]').uncheck();
  page.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Change passwords', exact: true }).click();
  await expect(pwRow(modal, '9000000001')).toContainText('Changed');
  await expect(modal.locator('[data-progress]')).toContainText('1 changed');
  expect(accounts['phone919000000002@members.track.invalid'].password).toBe('Different-old-2');
  let asked = '';
  page.once('dialog', dialog => { asked = dialog.message(); dialog.dismiss(); });
  await modal.getByRole('button', { name: 'Close' }).click();
  expect(asked).toContain('without downloading the new passwords');
  await expect(modal).toBeVisible();
});

test('change all passwords can make a different password for each person and fill from Excel', async ({ page }) => {
  await controlRoom(page, passwordData);
  await fakeAuth(page, passwordAccounts());
  const modal = await openChangeAll(page);
  await modal.getByRole('button', { name: 'Make a different new password for each person' }).click();
  const made = await modal.locator('[data-new]').evaluateAll(inputs => inputs.map(x => x.value).filter(Boolean));
  expect(made).toHaveLength(3);
  expect(new Set(made).size).toBe(3);
  made.forEach(password => expect(password).toMatch(/^[A-HJ-NP-Z2-9]{10}$/));
  const download = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Download list as Excel' }).click();
  expect((await download).suggestedFilename()).toBe('TRACK-passwords.xlsx');
  const sheet = await page.evaluate(() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Login', 'Mobile', 'Current password', 'New password'], ['Route app', 9000000001, 12345678, 'Excel-new-1'], ['Viewer', '+91 90000 00003', 'Excel-old-3', 'Excel-new-3'], ['', '9999999999', 'x', 'y']]), 'Sheet1'); return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }); });
  const chooser = page.waitForEvent('filechooser');
  await modal.getByRole('button', { name: 'Fill from Excel' }).click();
  await (await chooser).setFiles({ name: 'passwords.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(sheet, 'base64') });
  await expect(modal.locator('[data-progress]')).toContainText('Filled 2 from Excel; 1 mobile number was not found');
  await expect(pwRow(modal, '9000000001').locator('[data-current]')).toHaveValue('12345678');
  await expect(pwRow(modal, '9000000001').locator('[data-new]')).toHaveValue('Excel-new-1');
  await expect(pwRow(modal, '9000000003').locator('[data-new]')).toHaveValue('Excel-new-3');
});

test('Assign member can replace this person\'s password', async ({ page }) => {
  const accounts = { 'phone919876543210@members.track.invalid': { uid: 'officer-1', password: 'Current-password' } };
  const writes = await controlRoom(page);
  await fakeAuth(page, accounts);
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Assign member' }).click();
  const modal = page.locator('.member-modal');
  await modal.locator('[name=officer]').fill('Officer One');
  await modal.locator('[name=mobile]').fill('9876543210');
  await modal.locator('[name=password]').fill('Current-password');
  await expect(modal.locator('[name=newPassword]')).toBeHidden();
  await modal.getByLabel("Change this person's password").check();
  await modal.locator('[name=newPassword]').fill('Replacement-1');
  await modal.locator('[name=confirmPassword]').fill('Replacement-2');
  await modal.getByRole('button', { name: 'Save assignment' }).click();
  await expect(modal.locator('.err')).toContainText('do not match');
  expect(writes).toEqual([]);
  expect(accounts['phone919876543210@members.track.invalid'].password).toBe('Current-password');
  await modal.locator('[name=confirmPassword]').fill('Replacement-1');
  await modal.getByRole('button', { name: 'Save assignment' }).click();
  await expect(modal).toHaveCount(0);
  expect(accounts['phone919876543210@members.track.invalid'].password).toBe('Replacement-1');
  expect(writes).toHaveLength(1);
  expect(JSON.stringify(writes)).not.toContain('Replacement-1');
  expect(await page.evaluate(() => AU.uid)).toBe('admin-1');
  await expect(page.locator('.toast')).toContainText('password changed');
});

test('Assign member leads to Change all passwords, and only administrators are offered it', async ({ page }) => {
  await controlRoom(page, passwordData);
  await page.locator('#tabs [data-tab="setup"]').click();
  await page.getByRole('button', { name: 'Assign member' }).click();
  await page.locator('.member-modal').getByRole('button', { name: 'Change all passwords…' }).click();
  await expect(page.locator('.pw-modal #pwTitle')).toHaveText('Change all passwords');
  await expect(page.locator('.member-modal')).toHaveCount(1);
});

test('a monitor is not offered Change all passwords', async ({ page }) => {
  await controlRoom(page, { '/roles/admin-1.json': 'monitor' });
  await page.locator('#tabs [data-tab="setup"]').click();
  await expect(page.locator('[data-act="routeAdd"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change all passwords' })).toHaveCount(0);
  await expect(page.evaluate(() => changeAllPasswordsModal())).rejects.toThrow('Only a control-room administrator');
});

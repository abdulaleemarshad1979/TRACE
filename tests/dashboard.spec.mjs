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
  await expect(page.getByText('SOS from Central', { exact: false }).first()).toBeVisible();
  await expect(page.locator('#counts')).toContainText('SOS');
  await expect(page.locator('.trace-trip')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.trace-trip')).toContainText('28 km/h');
  await expect(page.locator('.trace-trip')).toContainText('81%');
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

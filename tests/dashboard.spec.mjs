import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('dashboard/TRACE.html')).href;

test('requires explicit Firebase project configuration', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#projForm')).toBeVisible();
  await expect(page.locator('#cfgText')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
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

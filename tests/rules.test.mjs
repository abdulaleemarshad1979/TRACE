import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';

test('Realtime Database grants only approved roles and route ownership', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-trace',
    database: { rules: readFileSync(new URL('../firebase/database.rules.json', import.meta.url), 'utf8') },
  });
  try {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(async ctx => {
      await set(ref(ctx.database(), '/'), {
        roles: { admin: 'admin', monitor: 'monitor', routeA: 'route', routeB: 'route', stranger: 'route' },
        assignments: { routeA: { ps: 'PS-1', route: 'R-1' }, routeB: { ps: 'PS-2', route: 'R-2' } },
        voice: { privateA: { uid: 'routeA', a: 'audio' }, privateB: { uid: 'routeB', a: 'audio' } },
      });
    });
    const anon = env.unauthenticatedContext().database();
    const admin = env.authenticatedContext('admin').database();
    const monitor = env.authenticatedContext('monitor').database();
    const routeA = env.authenticatedContext('routeA').database();
    const routeB = env.authenticatedContext('routeB').database();
    const stranger = env.authenticatedContext('stranger').database();

    await assertFails(get(ref(anon, 'live/routeA')));
    await assertFails(set(ref(anon, 'live/routeA'), { lat: 1 }));
    await assertSucceeds(get(ref(admin, 'live')));
    await assertSucceeds(get(ref(monitor, 'live')));
    await assertFails(get(ref(routeA, 'live/routeB')));
    await assertSucceeds(set(ref(routeA, 'live/routeA'), { lat: 1, lng: 2, duty: true }));
    await assertFails(set(ref(routeA, 'live/routeB'), { lat: 1 }));
    await assertFails(set(ref(stranger, 'live/stranger'), { lat: 1 }));
    await assertSucceeds(set(ref(routeA, 'track/routeA/20261102/mobile/1'), [1, 2, 3, 4]));
    await assertFails(set(ref(routeB, 'track/routeA/20261102/mobile/2'), [1, 2, 3, 4]));
    await assertSucceeds(set(ref(admin, 'assignments/routeA'), { ps: 'PS-1', route: 'R-1' }));
    await assertFails(set(ref(routeA, 'assignments/routeA'), { ps: 'PS-X', route: 'R-X' }));
    await assertSucceeds(set(ref(routeA, 'devices/routeA'), { ps: 'PS-1', route: 'R-1' }));
    await assertFails(set(ref(routeA, 'devices/routeA'), { ps: 'PS-X', route: 'R-1' }));
    await assertSucceeds(set(ref(routeA, 'events/sos-1'), { uid: 'routeA', type: 'sos', t: 1 }));
    await assertSucceeds(get(ref(routeA, 'events/sos-1')));
    await assertFails(get(ref(routeB, 'events/sos-1')));
    await assertFails(set(ref(routeB, 'events/sos-1'), { uid: 'routeB', type: 'sos', t: 2 }));
    await assertFails(set(ref(stranger, 'events/sos-2'), { uid: 'stranger', type: 'sos', t: 2 }));
    await assertSucceeds(get(ref(routeA, 'voice/privateA')));
    await assertFails(get(ref(routeA, 'voice/privateB')));
    await assertFails(get(ref(routeA, 'voice')));
    await assertSucceeds(get(ref(monitor, 'voice/privateA')));
  } finally {
    await env.cleanup();
  }
});

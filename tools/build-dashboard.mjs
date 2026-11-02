import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let html = fs.readFileSync(path.join(root, 'dashboard/source.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dashboard/vercel-theme.css'), 'utf8');
const trip = fs.readFileSync(path.join(root, 'dashboard/live-trip.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'firebase/database.rules.json'), 'utf8'));
const staging = JSON.parse(fs.readFileSync(path.join(root, 'config/staging.json'), 'utf8'));
if (!staging.apiKey || !staging.databaseURL?.startsWith('https://') || !staging.projectId) throw new Error('Staging Firebase config is incomplete');

// Configure runtime config
html = html.replace(/\/\/ Kakinada project[^\n]*\nconst DEFAULT_CFG = \{[^\n]*\};/, 'const DEFAULT_CFG = null;');
if (/AIza[0-9A-Za-z_-]{25,}/.test(html)) throw new Error('Unexpected embedded API key in dashboard source');
const runtimeConfig = { k: staging.apiKey, d: staging.databaseURL.replace(/\/+$/, ''), p: staging.projectId, sender: staging.messagingSenderId || '', appId: staging.appId || '' };
if (!html.includes('const DEFAULT_CFG = null;')) throw new Error('Dashboard config injection point missing');
html = html.replace('const DEFAULT_CFG = null;', `const DEFAULT_CFG = ${JSON.stringify(runtimeConfig)};`);

// Rebrand to TRACK & East Godavari District Police
html = html.replace('<title>TRACE — Tracking Routes, Alerting &amp; Coordinating Emergencies</title>', '<title>TRACK — East Godavari District Police</title>');
html = html.replace('<h1>TRACE <small class="abbr">(Tracking Routes, Alerting &amp; Coordinating Emergencies)</small><br>Election Control Room</h1>', '<h1>TRACK <small class="abbr">(Tactical Route Alert &amp; Coordination Kit)</small><br>East Godavari District Police Control Room</h1>');
html = html.replace('<div class="note">Route mobiles and polling locations</div>', '<div class="note">East Godavari District Police · Patrol Tracking &amp; Emergency Dispatch</div>');

html = html.replaceAll('KAKINADA DISTRICT POLICE', 'EAST GODAVARI DISTRICT POLICE');
html = html.replaceAll('Kakinada District Police', 'East Godavari District Police');
html = html.replaceAll('Kakinada District', 'East Godavari District');
html = html.replaceAll('DPO Kakinada', 'DPO East Godavari');
html = html.replaceAll('SP, Kakinada', 'SP, East Godavari');
html = html.replaceAll('TRACE', 'TRACK');

// Center map on Rajamahendravaram / East Godavari (17.0005, 81.8040)
html = html.replace('setView([16.96, 82.24], 11)', 'setView([17.0005, 81.8040], 11)');

// Operational routes and coordinates are loaded only from the authenticated database.
// Never seed invented polling centers or embed election deployment data in public HTML.
html = html.replace(/<div class="officers"[^>]*>[\s\S]*?<\/div>\s*<div class="hright">/, '<div class="hright">');
html = html.replace(/<div class="lhead"><img[^>]*>/, '<div class="lhead"><div class="trace-mark" style="background:#2563eb;color:#fff;font-weight:bold;padding:4px 10px;border-radius:6px;">TRACK</div>');
html = html.replace(/<img class="logo"[^>]*>/, '<div class="trace-mark" style="background:#2563eb;color:#fff;font-weight:bold;padding:4px 10px;border-radius:6px;">TRACK</div>');
html = html.replace(/autoSos: true/, 'autoSos: false');
html = html.replace('function notify(title, text, kind) { if (kind && !wantNote(kind)) return; if (NATIVE) try { Android.notify(title, text); } catch (e) { } }', 'function notify(title, text, kind) { if (kind && !wantNote(kind)) return; if (NATIVE) { try { Android.notify(title, text); } catch (e) { } } else if ("Notification" in window && Notification.permission === "granted") { new Notification(title, { body: text, tag: kind || "track" }); } }');
html = html.replace("if (e.type === 'reached') toast(`${dname(e.uid)} reached the spot at ${fT(e.t)}`);", "if (e.type === 'reached') toast(`${dname(e.uid)} reached the spot at ${fT(e.t)}`); if (e.voice && e.uid && e.uid !== AU.uid) notify('Voice from ' + dname(e.uid), 'Open TRACK to play the message', 'report');");
html = html.replace("const b = e.target.closest && e.target.closest('#bellBtn,#sideBtn'); if (!b) return;", "const b = e.target.closest && e.target.closest('#bellBtn,#sideBtn'); if (!b) return; if (b.id === 'bellBtn' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();");
html = html.replace(/return \{ k: k\[1\], d: db\.replace\(\/\\\/\+\$\/, ''\), p: p \? p\[1\] : '' \};/, "return { k: k[1], d: db.replace(/\\/+$/, ''), p: p ? p[1] : '', sender: (/messagingSenderId\\s*[\\\"']?\\s*:\\s*[\\\"']([^\\\"']+)/.exec(txt)||[])[1] || '', appId: (/appId\\s*[\\\"']?\\s*:\\s*[\\\"']([^\\\"']+)/.exec(txt)||[])[1] || '' };");
html = html.replace('Android.setAuth(CFG.k, CFG.d, AU.rt, AU.email)', 'Android.setAuth(CFG.k, CFG.d, AU.rt, AU.email, AU.uid, CFG.p || "", CFG.sender || "", CFG.appId || "")');
html = html.replace(/<label class="row" style="margin-top:10px"><input type="checkbox" id="setAutoSos"[^\n]*/, '<p class="note">SOS backup dispatch requires an operator to send the message.</p>');
html = html.replace(/async function autoDispatch\(\) \{[\s\S]*?\n\}\nsetInterval\(\(\) => \{ drawPulses\(\); checkBigAlerts\(\); autoDispatch\(\);/, 'setInterval(() => { drawPulses(); checkBigAlerts();');
html = html.replace(/function rulesText\(\) \{[\s\S]*?\n\}\n\n\/\* route add/, `function rulesText() { return JSON.stringify(${JSON.stringify(rules)}, null, 2); }\n\n/* route add`);
html = html.replace('</style></head><body>', `</style><style>\n${css}\n</style></head><body>`);
html = html.replace('</script></body></html>', `\n${trip}\n</script></body></html>`);

const embeddedKeys = [...new Set(html.match(/AIza[0-9A-Za-z_-]{25,}/g) || [])];
if (embeddedKeys.some(key => key !== staging.apiKey) || html.includes('function autoDispatch')) throw new Error('Unexpected API key or auto dispatch remains');

// Write out both TRACK.html and TRACE.html (for backwards compatibility), plus dist/index.html
fs.writeFileSync(path.join(root, 'dashboard/TRACK.html'), html);
fs.writeFileSync(path.join(root, 'dashboard/TRACE.html'), html);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log(`Built dashboard/TRACK.html & dist/index.html (${Buffer.byteLength(html)} bytes) for East Godavari District Police`);

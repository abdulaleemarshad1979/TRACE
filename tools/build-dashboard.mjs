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

// Pre-populate all 29 East Godavari Police Stations
const EAST_GODAVARI_POLICE_STATIONS = [
  { id: 'PS-01', name: 'I Town L&O PS', sub_division: 'Rajahmundry Urban', lat: 17.0051, lng: 81.7778 },
  { id: 'PS-02', name: 'II Town L&O PS', sub_division: 'Rajahmundry Urban', lat: 16.9924, lng: 81.7821 },
  { id: 'PS-03', name: 'III Town L&O PS', sub_division: 'Rajahmundry Urban', lat: 17.0142, lng: 81.7915 },
  { id: 'PS-04', name: 'Prakash Nagar PS', sub_division: 'Rajahmundry Urban', lat: 17.0215, lng: 81.7850 },
  { id: 'PS-05', name: 'Bommuru PS', sub_division: 'Rajahmundry Urban', lat: 16.9785, lng: 81.8152 },
  { id: 'PS-06', name: 'Rajanagaram PS', sub_division: 'Rajahmundry Rural', lat: 17.0850, lng: 81.9012 },
  { id: 'PS-07', name: 'Kadiyam PS', sub_division: 'Rajahmundry Rural', lat: 16.9150, lng: 81.8420 },
  { id: 'PS-08', name: 'Dowleswaram PS', sub_division: 'Rajahmundry Rural', lat: 16.9421, lng: 81.7745 },
  { id: 'PS-09', name: 'Korukonda PS', sub_division: 'Rajahmundry Rural', lat: 17.1720, lng: 81.8210 },
  { id: 'PS-10', name: 'Gokavaram PS', sub_division: 'Rajahmundry Rural', lat: 17.2415, lng: 81.8820 },
  { id: 'PS-11', name: 'Seetha Nagaram PS', sub_division: 'Rajahmundry Rural', lat: 17.2012, lng: 81.7015 },
  { id: 'PS-12', name: 'Anaparthi PS', sub_division: 'Mandapeta Sub-division', lat: 16.9950, lng: 81.9540 },
  { id: 'PS-13', name: 'Biccavolu PS', sub_division: 'Mandapeta Sub-division', lat: 17.0210, lng: 82.0450 },
  { id: 'PS-14', name: 'Rangampeta PS', sub_division: 'Mandapeta Sub-division', lat: 17.0512, lng: 81.9820 },
  { id: 'PS-15', name: 'Kovvuru town PS', sub_division: 'Kovvur Sub-division', lat: 17.0125, lng: 81.7280 },
  { id: 'PS-16', name: 'Kovvuru rural PS', sub_division: 'Kovvur Sub-division', lat: 17.0250, lng: 81.7150 },
  { id: 'PS-17', name: 'Chagallu PS', sub_division: 'Kovvur Sub-division', lat: 16.9720, lng: 81.6520 },
  { id: 'PS-18', name: 'Thallapudi PS', sub_division: 'Kovvur Sub-division', lat: 17.0950, lng: 81.6810 },
  { id: 'PS-19', name: 'Gopalapuram PS', sub_division: 'Kovvur Sub-division', lat: 17.1120, lng: 81.5420 },
  { id: 'PS-20', name: 'Devarapalli PS', sub_division: 'Kovvur Sub-division', lat: 17.0320, lng: 81.5710 },
  { id: 'PS-21', name: 'Nidadavolu PS', sub_division: 'Kovvur Sub-division', lat: 16.9120, lng: 81.6710 },
  { id: 'PS-22', name: 'Samisragudem PS', sub_division: 'Kovvur Sub-division', lat: 16.9450, lng: 81.6420 },
  { id: 'PS-23', name: 'Undrajavaram PS', sub_division: 'Kovvur Sub-division', lat: 16.8520, lng: 81.7120 },
  { id: 'PS-24', name: 'Peravali PS', sub_division: 'Kovvur Sub-division', lat: 16.7820, lng: 81.7450 },
  { id: 'PS-25', name: 'Nallajarla PS', sub_division: 'Kovvur Sub-division', lat: 16.9520, lng: 81.4820 },
  { id: 'PS-26', name: 'Mandapeta town PS', sub_division: 'Mandapeta Sub-division', lat: 16.8650, lng: 81.9320 },
  { id: 'PS-27', name: 'Mandapeta rural PS', sub_division: 'Mandapeta Sub-division', lat: 16.8780, lng: 81.9150 },
  { id: 'PS-28', name: 'Angara PS', sub_division: 'Mandapeta Sub-division', lat: 16.8210, lng: 81.9850 },
  { id: 'PS-29', name: 'Rayavaram PS', sub_division: 'Mandapeta Sub-division', lat: 16.8920, lng: 82.0210 }
];

const defaultStations = {};
const defaultRoutes = {};
EAST_GODAVARI_POLICE_STATIONS.forEach((ps, idx) => {
  const sid = `ps_${idx + 1}`;
  defaultStations[sid] = {
    name: `${ps.name} Polling Center`,
    ps: ps.name,
    sd: ps.sub_division,
    lat: ps.lat,
    lng: ps.lng,
    cat: 'Standard'
  };
  defaultRoutes[`rt_${idx + 1}`] = {
    ps: ps.name,
    route: 'Route 1',
    sd: ps.sub_division,
    force: 'route'
  };
});

html = html.replace('const DEV = {}, LIVE = {}, EVT = {}, CONF = {};', `const DEV = {}, LIVE = {}, EVT = {}, CONF = ${JSON.stringify({ stations: defaultStations, routes: defaultRoutes, settings: { district: "East Godavari District Police", autoSos: false } })};`);

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

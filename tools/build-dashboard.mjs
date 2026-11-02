import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let html = fs.readFileSync(path.join(root, 'dashboard/source.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dashboard/vercel-theme.css'), 'utf8');
const trip = fs.readFileSync(path.join(root, 'dashboard/live-trip.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'firebase/database.rules.json'), 'utf8'));
const staging = JSON.parse(fs.readFileSync(path.join(root, 'config/staging.json'), 'utf8'));
if (!staging.apiKey || !staging.databaseURL?.startsWith('https://') || !staging.projectId) throw new Error('Staging Firebase config is incomplete');

// The supplied dashboard is the functional compatibility base. Remove its
// previous deployment identity and require a project chosen by the operator.
html = html.replace(/\/\/ Kakinada project[^\n]*\nconst DEFAULT_CFG = \{[^\n]*\};/, 'const DEFAULT_CFG = null;');
if (/AIza[0-9A-Za-z_-]{25,}/.test(html)) throw new Error('Unexpected embedded API key in dashboard source');
const runtimeConfig = { k: staging.apiKey, d: staging.databaseURL.replace(/\/+$/, ''), p: staging.projectId, sender: staging.messagingSenderId || '', appId: staging.appId || '' };
if (!html.includes('const DEFAULT_CFG = null;')) throw new Error('Dashboard config injection point missing');
html = html.replace('const DEFAULT_CFG = null;', `const DEFAULT_CFG = ${JSON.stringify(runtimeConfig)};`);
html = html.replaceAll('KAKINADA DISTRICT POLICE', 'TRACE CONTROL ROOM');
html = html.replaceAll('Kakinada District Police', 'TRACE Control Room');
html = html.replaceAll('Kakinada District', 'All districts');
html = html.replaceAll('DPO Kakinada', 'Control Room');
html = html.replaceAll('SP, Kakinada', 'your organisation');
html = html.replaceAll('for official election duty', 'for authorised operations');
html = html.replace(/<div class="officers"[^>]*>[\s\S]*?<\/div>\s*<div class="hright">/, '<div class="hright">');
html = html.replace(/<div class="lhead"><img[^>]*>/, '<div class="lhead"><div class="trace-mark">T</div>');
html = html.replace(/<img class="logo"[^>]*>/, '<div class="trace-mark">T</div>');
html = html.replace(/autoSos: true/, 'autoSos: false');
html = html.replace('function notify(title, text, kind) { if (kind && !wantNote(kind)) return; if (NATIVE) try { Android.notify(title, text); } catch (e) { } }', 'function notify(title, text, kind) { if (kind && !wantNote(kind)) return; if (NATIVE) { try { Android.notify(title, text); } catch (e) { } } else if ("Notification" in window && Notification.permission === "granted") { new Notification(title, { body: text, tag: kind || "trace" }); } }');
html = html.replace("if (e.type === 'reached') toast(`${dname(e.uid)} reached the spot at ${fT(e.t)}`);", "if (e.type === 'reached') toast(`${dname(e.uid)} reached the spot at ${fT(e.t)}`); if (e.voice && e.uid && e.uid !== AU.uid) notify('Voice from ' + dname(e.uid), 'Open TRACE to play the message', 'report');");
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
fs.writeFileSync(path.join(root, 'dashboard/TRACE.html'), html);
console.log(`Built dashboard/TRACE.html (${Buffer.byteLength(html)} bytes)`);

/* Live journey details: same Firebase stream and selected unit as the map. */
(function () {
  const panel = document.createElement('section');
  panel.className = 'trace-trip'; panel.setAttribute('aria-label', 'Live journey'); panel.hidden = true;
  document.body.appendChild(panel);
  function renderTrip() {
    if (document.querySelector('#app')?.hidden || typeof UI === 'undefined') { panel.hidden = true; return; }
    const uid = UI.sel || (typeof devIds === 'function' ? devIds()[0] : null);
    const live = uid && LIVE[uid];
    if (!live || live.lat == null || live.lng == null) { panel.hidden = true; return; }
    const points = TRAIL[uid] || [];
    let metres = 0;
    for (let i = 1; i < points.length; i++) if (points[i][0] - points[i - 1][0] < 20 * 60000) metres += hav(points[i - 1][1], points[i - 1][2], points[i][1], points[i][2]);
    const age = Date.now() - (live.t || 0), stale = age > 2 * 60000;
    const sites = stations().filter(p => p.lat && p.lng && p.ps === (DEV[uid] || {}).ps && (!p.route || norm(p.route) === norm((DEV[uid] || {}).route)));
    const nearest = sites.map(p => ({ name: p.name, m: hav(+live.lat, +live.lng, +p.lat, +p.lng) })).sort((a,b) => a.m - b.m)[0];
    const incomingVoice = Object.values(EVT).filter(e => e.voice && e.uid && DEV[e.uid] && e.uid !== AU.uid).sort((a,b) => b.t - a.t)[0];
    panel.hidden = false;
    panel.innerHTML = `<h3>● ${esc(dname(uid))} <small>· ${stale ? 'Location stale' : 'Live journey'}</small></h3>
      <small>Last GPS fix ${esc(ago(live.t))} · ${(+live.lat).toFixed(5)}, ${(+live.lng).toFixed(5)}</small>
      <div class="trip-grid"><div><b>${Math.round(+live.spd || 0)} km/h</b><span>Speed</span></div><div><b>${+live.bat >= 0 ? Math.round(+live.bat) + '%' : '—'}</b><span>Battery</span></div><div><b>${fKm(metres)}</b><span>Today travelled</span></div></div>
      <div class="trip-foot"><span>${live.gps === false ? 'GPS disabled' : 'GPS on'} · Signal ${+live.sig >= 0 ? live.sig + '/4' : 'unknown'}${nearest ? '<br>Nearest site: ' + esc(nearest.name) + ' · ' + fKm(nearest.m) + ' straight line' : ''}</span><button type="button" id="tripCenter">Center</button></div>
      ${incomingVoice ? `<div class="trip-foot"><span>Voice from ${esc(dname(incomingVoice.uid))} · ${esc(ago(incomingVoice.t))}</span><button type="button" id="tripVoice">Play</button></div>` : ''}`;
    panel.querySelector('#tripCenter').onclick = () => MAP.setView([+live.lat, +live.lng], Math.max(MAP.getZoom(), 14));
    if (incomingVoice) panel.querySelector('#tripVoice').onclick = () => playVoice(incomingVoice.voice);
  }
  setInterval(renderTrip, 5000);
  document.addEventListener('click', () => setTimeout(renderTrip, 100));
})();

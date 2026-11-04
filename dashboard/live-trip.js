/* Live journey details: same Firebase stream and selected unit as the map. */
(function () {
  const panel = document.createElement('section');
  panel.className = 'trace-trip';
  panel.setAttribute('aria-label', 'Live journey');
  panel.hidden = true;
  document.body.appendChild(panel);

  let dismissed = false;
  let lastSel = typeof UI !== 'undefined' ? UI.sel : null;
  let shownUid = null, shownHtml = '', tripTimer = 0;

  function renderTrip() {
    if (document.querySelector('#app')?.hidden || typeof UI === 'undefined') {
      panel.hidden = true;
      return;
    }
    if (UI.tab === 'setup') {
      panel.hidden = true;
      return;
    }
    if (UI.sel !== lastSel) {
      lastSel = UI.sel;
      if (UI.sel) dismissed = false;
    }
    if (dismissed) {
      panel.hidden = true;
      return;
    }
    const uid = UI.sel || (!dismissed && !document.body.classList.contains('map-full') && typeof devIds === 'function' ? devIds()[0] : null);
    if (!uid) {
      panel.hidden = true;
      return;
    }
    shownUid = uid;
    const live = LIVE[uid];
    if (!live || live.lat == null || live.lng == null) {
      panel.hidden = true;
      return;
    }
    const points = TRAIL[uid] || [];
    let metres = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] - points[i - 1][0] < 20 * 60000) {
        metres += hav(points[i - 1][1], points[i - 1][2], points[i][1], points[i][2]);
      }
    }
    const age = Date.now() - (live.t || 0), stale = age > 90000;
    const speedText = age <= 45000 && live.gps !== false ? `${Math.round(+live.spd || 0)} km/h` : '—';
    const sites = stations().filter(p => p.lat && p.lng && p.ps === (DEV[uid] || {}).ps && (!p.route || norm(p.route) === norm((DEV[uid] || {}).route)));
    const nearest = sites.map(p => ({ name: p.name, m: hav(+live.lat, +live.lng, +p.lat, +p.lng) })).sort((a, b) => a.m - b.m)[0];
    const incomingVoice = Object.values(EVT).filter(e => e.voice && e.uid && DEV[e.uid] && e.uid !== AU.uid).sort((a, b) => b.t - a.t)[0];

    panel.hidden = false;
    const html = `
      <div class="trip-head">
        <h3>● ${esc(dname(uid))} <small>· ${stale ? 'Location stale' : 'Live journey'}</small></h3>
        <button type="button" class="trip-close" id="tripClose" aria-label="Dismiss journey card" title="Dismiss">×</button>
      </div>
      <small>Last GPS fix ${esc(ago(live.t))} · ${(+live.lat).toFixed(5)}, ${(+live.lng).toFixed(5)}</small>
      <div class="trip-grid">
        <div><b>${speedText}</b><span>Speed</span></div>
        <div><b>${+live.bat >= 0 ? Math.round(+live.bat) + '%' : '—'}</b><span>Battery</span></div>
        <div><b>${fKm(metres)}</b><span>Today travelled</span></div>
      </div>
      <div class="trip-foot">
        <span>${live.gps === false ? 'GPS disabled' : 'GPS on'} · Signal ${+live.sig >= 0 ? live.sig + '/4' : 'unknown'}${nearest ? '<br>Nearest site: ' + esc(nearest.name) + ' · ' + fKm(nearest.m) + ' straight line' : ''}</span>
        <button type="button" id="tripCenter">Center</button>
      </div>
      ${incomingVoice ? `<div class="trip-foot"><span>Voice from ${esc(dname(incomingVoice.uid))} · ${esc(ago(incomingVoice.t))}</span><button type="button" id="tripVoice">Play</button></div>` : ''}
    `;
    if (html === shownHtml) return;
    shownHtml = html;
    panel.innerHTML = html;

    const closeBtn = panel.querySelector('#tripClose');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        dismissed = true;
        panel.hidden = true;
      };
    }
    const centerBtn = panel.querySelector('#tripCenter');
    if (centerBtn) {
      centerBtn.onclick = () => MAP.setView([+live.lat, +live.lng], Math.max(MAP.getZoom(), 14));
    }
    const voiceBtn = panel.querySelector('#tripVoice');
    if (voiceBtn && incomingVoice) {
      voiceBtn.onclick = () => playVoice(incomingVoice.voice);
    }
  }

  // Reactive updates on live data stream
  if (typeof onLive === 'function') {
    const origOnLive = onLive;
    onLive = function (path) {
      origOnLive.apply(this, arguments);
      // at peak several phones report every second; only the unit on this card needs a refresh
      const uid = String(path || '').split('/').filter(Boolean)[0];
      if ((!uid || uid === shownUid) && !tripTimer) tripTimer = setTimeout(() => { tripTimer = 0; renderTrip(); }, 300);
    };
  }

  // Reactive updates on general render cycles
  if (typeof render === 'function') {
    const origRender = render;
    render = function () {
      origRender.apply(this, arguments);
      renderTrip();
    };
  }

  // Reset dismissed state when a unit is selected/clicked
  if (typeof selectDev === 'function') {
    const origSelectDev = selectDev;
    selectDev = function (u, pan) {
      dismissed = false;
      lastSel = u;
      const res = origSelectDev.apply(this, arguments);
      renderTrip();
      return res;
    };
  }

  if (typeof UI !== 'undefined') {
    let currentSelVal = UI.sel;
    try {
      Object.defineProperty(UI, 'sel', {
        get() { return currentSelVal; },
        set(v) {
          currentSelVal = v;
          lastSel = v;
          if (v) dismissed = false;
          renderTrip();
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) { }
  }

  document.addEventListener('click', (e) => {
    const vehEl = e.target.closest && e.target.closest('.veh[data-u], [data-act="sel"]');
    if (vehEl && vehEl.dataset && vehEl.dataset.u) {
      dismissed = false;
      lastSel = vehEl.dataset.u;
    }
    setTimeout(renderTrip, 50);
  });

  setInterval(renderTrip, 3000);
  window.renderTrip = renderTrip;
})();


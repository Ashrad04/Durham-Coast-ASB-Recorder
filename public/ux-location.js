(() => {
  let currentView = document.querySelector('.view.active')?.id?.replace('view-', '') || 'dashboard';
  let draftDirty = false;
  let suppressHistory = false;
  let drawerHistoryOpen = false;

  const originalNav = nav;
  const originalResetForm = resetForm;
  const originalSetEntryLocation = setEntryLocation;
  const originalSelectCategory = selectCategory;
  const originalOpenIncident = openIncident;

  function addUxStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .location-formats{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#52645f}
      .location-format-chip{background:#f5f8f7;border:1px solid #dfe7e3;border-radius:10px;padding:7px 9px}
      .location-format-chip strong{color:#17302b}
      .location-reference-panel{margin:14px 0;padding:14px;background:#f5f8f7;border:1px solid #dfe7e3;border-radius:12px}
      .location-reference-panel h3{margin:0 0 8px}
      .location-reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .location-reference-item{background:#fff;border:1px solid #e4ebe7;border-radius:10px;padding:10px}
      .location-reference-item span{display:block;color:#667871;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
      .location-reference-item strong{font-size:14px;color:#17302b;word-break:break-word}
      .location-reference-item a{display:inline-block;margin-top:6px;font-size:12px}
      @media(max-width:600px){.location-reference-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function activeViewName() {
    return document.querySelector('.view.active')?.id?.replace('view-', '') || currentView || 'dashboard';
  }

  function formHasMeaningfulInput() {
    if (draftDirty) return true;
    if (selectedCategory || entryLocation || evidence?.length) return true;
    const form = $('incidentForm');
    if (!form) return false;
    const ids = ['description','site','locationDescription','habitatAffected','vehicleRegistration','vehicleDescription','personDetails','sensitiveNotes','policeRef','partnerRef','assignedTo','linkedIncidentRef','tags'];
    return ids.some(id => $(id)?.value?.trim());
  }

  function confirmLeaveDraft() {
    if (!formHasMeaningfulInput()) return true;
    return window.confirm('You have an incident form in progress. Leave this screen without saving? Your draft will remain only while this page stays open.');
  }

  function navigateView(name, { fromHistory = false, replace = false } = {}) {
    const before = activeViewName();
    if (before === 'log' && name !== 'log' && !suppressHistory && !confirmLeaveDraft()) return false;

    originalNav(name);
    currentView = name;

    if (!fromHistory) {
      const state = { ...(history.state || {}), dcaView: name, dcaDrawer: false };
      const hash = name === 'dashboard' ? location.pathname + location.search : `#${name}`;
      if (replace) history.replaceState(state, '', hash);
      else if (history.state?.dcaView !== name || history.state?.dcaDrawer) history.pushState(state, '', hash);
    }
    return true;
  }

  nav = function(name) {
    return navigateView(name);
  };

  window.addEventListener('popstate', event => {
    const target = event.state?.dcaView || 'dashboard';
    const drawer = $('detailDrawer');

    if (drawer && !drawer.classList.contains('hidden') && !event.state?.dcaDrawer) {
      drawer.classList.add('hidden');
      drawerHistoryOpen = false;
      return;
    }

    const before = activeViewName();
    if (before === 'log' && target !== 'log' && !confirmLeaveDraft()) {
      history.pushState({ dcaView: 'log', dcaDrawer: false }, '', '#log');
      return;
    }

    suppressHistory = true;
    try {
      originalNav(target);
      currentView = target;
    } finally {
      suppressHistory = false;
    }
  });

  window.addEventListener('beforeunload', event => {
    if (!formHasMeaningfulInput()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function markDirty() { draftDirty = true; }

  const form = $('incidentForm');
  if (form) {
    form.addEventListener('input', markDirty, true);
    form.addEventListener('change', markDirty, true);
  }

  selectCategory = function(cat) {
    markDirty();
    return originalSelectCategory(cat);
  };

  setEntryLocation = function(lat, lng, accuracy = null, pan = false) {
    markDirty();
    const result = originalSetEntryLocation(lat, lng, accuracy, pan);
    renderEntryGridReference(lat, lng);
    return result;
  };

  resetForm = function() {
    const result = originalResetForm();
    draftDirty = false;
    const box = $('entryGridReference');
    if (box) box.textContent = '—';
    return result;
  };

  function injectEntryGridReference() {
    const coordRow = document.querySelector('#entryMap + .coord-row') || $('coordText')?.parentElement;
    if (!coordRow || $('entryLocationFormats')) return;
    const wrap = document.createElement('div');
    wrap.id = 'entryLocationFormats';
    wrap.className = 'location-formats';
    wrap.innerHTML = '<div class="location-format-chip">British Grid: <strong id="entryGridReference">—</strong></div><div class="location-format-chip">Grid reference is calculated from the selected GPS/map point.</div>';
    coordRow.insertAdjacentElement('afterend', wrap);
  }

  function degToRad(d) { return d * Math.PI / 180; }

  function wgs84ToOsgbGrid(latDeg, lonDeg) {
    const aW = 6378137.0, bW = 6356752.314245;
    const phiW = degToRad(latDeg), lamW = degToRad(lonDeg);
    const e2W = 1 - (bW * bW) / (aW * aW);
    const nuW = aW / Math.sqrt(1 - e2W * Math.sin(phiW) ** 2);
    const x1 = nuW * Math.cos(phiW) * Math.cos(lamW);
    const y1 = nuW * Math.cos(phiW) * Math.sin(lamW);
    const z1 = (1 - e2W) * nuW * Math.sin(phiW);

    const tx = -446.448, ty = 125.157, tz = -542.060;
    const scale = 20.4894e-6;
    const secToRad = Math.PI / (180 * 3600);
    const rx = -0.1502 * secToRad, ry = -0.2470 * secToRad, rz = -0.8421 * secToRad;
    const x2 = tx + (1 + scale) * x1 - rz * y1 + ry * z1;
    const y2 = ty + rz * x1 + (1 + scale) * y1 - rx * z1;
    const z2 = tz - ry * x1 + rx * y1 + (1 + scale) * z1;

    const a = 6377563.396, b = 6356256.909;
    const e2 = 1 - (b * b) / (a * a);
    const p = Math.hypot(x2, y2);
    let phi = Math.atan2(z2, p * (1 - e2));
    for (let i = 0; i < 12; i++) {
      const nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
      const next = Math.atan2(z2 + e2 * nu * Math.sin(phi), p);
      if (Math.abs(next - phi) < 1e-12) { phi = next; break; }
      phi = next;
    }
    const lam = Math.atan2(y2, x2);

    const F0 = 0.9996012717;
    const phi0 = degToRad(49), lam0 = degToRad(-2);
    const N0 = -100000, E0 = 400000;
    const n = (a - b) / (a + b);
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
    const nu = a * F0 / Math.sqrt(1 - e2 * sinPhi ** 2);
    const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi ** 2, 1.5);
    const eta2 = nu / rho - 1;
    const dPhi = phi - phi0;
    const M = b * F0 * (
      (1 + n + 5/4*n**2 + 5/4*n**3) * dPhi
      - (3*n + 3*n**2 + 21/8*n**3) * Math.sin(dPhi) * Math.cos(phi + phi0)
      + (15/8*n**2 + 15/8*n**3) * Math.sin(2*dPhi) * Math.cos(2*(phi + phi0))
      - (35/24*n**3) * Math.sin(3*dPhi) * Math.cos(3*(phi + phi0))
    );
    const I = M + N0;
    const II = nu/2 * sinPhi * cosPhi;
    const III = nu/24 * sinPhi * cosPhi**3 * (5 - tanPhi**2 + 9*eta2);
    const IIIA = nu/720 * sinPhi * cosPhi**5 * (61 - 58*tanPhi**2 + tanPhi**4);
    const IV = nu * cosPhi;
    const V = nu/6 * cosPhi**3 * (nu/rho - tanPhi**2);
    const VI = nu/120 * cosPhi**5 * (5 - 18*tanPhi**2 + tanPhi**4 + 14*eta2 - 58*tanPhi**2*eta2);
    const dLam = lam - lam0;
    const northing = I + II*dLam**2 + III*dLam**4 + IIIA*dLam**6;
    const easting = E0 + IV*dLam + V*dLam**3 + VI*dLam**5;
    return { easting, northing };
  }

  function gridLetters(easting, northing, digits = 8) {
    if (!Number.isFinite(easting) || !Number.isFinite(northing) || easting < 0 || easting >= 700000 || northing < 0 || northing >= 1300000) return null;
    const e100k = Math.floor(easting / 100000), n100k = Math.floor(northing / 100000);
    let l1 = (19 - n100k) - ((19 - n100k) % 5) + Math.floor((e100k + 10) / 5);
    let l2 = ((19 - n100k) * 5) % 25 + (e100k % 5);
    if (l1 > 7) l1++;
    if (l2 > 7) l2++;
    const letters = String.fromCharCode(65 + l1, 65 + l2);
    const p = digits / 2;
    const divisor = 10 ** (5 - p);
    const e = Math.floor((easting % 100000) / divisor).toString().padStart(p, '0');
    const n = Math.floor((northing % 100000) / divisor).toString().padStart(p, '0');
    return `${letters} ${e} ${n}`;
  }

  function locationRefs(lat, lng) {
    const grid = wgs84ToOsgbGrid(Number(lat), Number(lng));
    return {
      gridRef: gridLetters(grid.easting, grid.northing, 8) || 'Outside British National Grid',
      easting: Math.round(grid.easting),
      northing: Math.round(grid.northing)
    };
  }

  function renderEntryGridReference(lat, lng) {
    injectEntryGridReference();
    const target = $('entryGridReference');
    if (!target) return;
    try { target.textContent = locationRefs(lat, lng).gridRef; }
    catch { target.textContent = 'Unavailable'; }
  }

  async function loadWhat3Words(lat, lng, targetId, linkId) {
    const target = $(targetId), link = $(linkId);
    if (!target) return;
    target.textContent = 'Looking up…';
    try {
      const r = await apiFetch(`/api/location/w3w?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      const data = await r.json();
      if (!r.ok) {
        target.textContent = r.status === 503 ? 'Not configured' : 'Unavailable';
        if (r.status === 503) target.title = 'A what3words API key must be configured on the server.';
        return;
      }
      target.textContent = data.words ? `///${data.words}` : 'Unavailable';
      if (link && data.map) {
        link.href = data.map;
        link.classList.remove('hidden');
      }
    } catch {
      target.textContent = 'Unavailable';
    }
  }

  openIncident = async function(id) {
    const result = await originalOpenIncident(id);
    if (!adminMode) return result;
    const i = incidents.find(x => String(x.id) === String(id));
    if (!i) return result;
    const lat = Number(i.latitude), lng = Number(i.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return result;

    const drawer = $('drawerContent');
    if (drawer && !$('adminLocationReferences')) {
      const refs = locationRefs(lat, lng);
      const panel = document.createElement('div');
      panel.id = 'adminLocationReferences';
      panel.className = 'location-reference-panel';
      panel.innerHTML = `<h3>Location references</h3><div class="location-reference-grid">
        <div class="location-reference-item"><span>British National Grid</span><strong>${esc(refs.gridRef)}</strong><small>E ${refs.easting} · N ${refs.northing}</small></div>
        <div class="location-reference-item"><span>Latitude / longitude</span><strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong></div>
        <div class="location-reference-item"><span>what3words</span><strong id="adminW3W">Looking up…</strong><a id="adminW3WLink" class="hidden" target="_blank" rel="noopener noreferrer">Open in what3words ↗</a></div>
      </div>`;
      const grid = drawer.querySelector('.detail-grid');
      if (grid) grid.insertAdjacentElement('afterend', panel);
      else drawer.prepend(panel);
      loadWhat3Words(lat, lng, 'adminW3W', 'adminW3WLink');
    }

    if (!drawerHistoryOpen && !$('detailDrawer')?.classList.contains('hidden')) {
      history.pushState({ dcaView: activeViewName(), dcaDrawer: true }, '', location.href);
      drawerHistoryOpen = true;
    }
    return result;
  };

  document.querySelectorAll('[data-close-drawer]').forEach(el => {
    el.addEventListener('click', () => {
      if (drawerHistoryOpen && history.state?.dcaDrawer) {
        drawerHistoryOpen = false;
        history.back();
      }
    });
  });

  addUxStyles();
  injectEntryGridReference();

  const hashView = location.hash.replace('#', '');
  const validViews = ['dashboard', 'log', 'records'];
  currentView = validViews.includes(hashView) ? hashView : activeViewName();
  history.replaceState({ dcaView: currentView, dcaDrawer: false }, '', currentView === 'dashboard' ? location.pathname + location.search : `#${currentView}`);
  if (activeViewName() !== currentView) {
    suppressHistory = true;
    try { originalNav(currentView); } finally { suppressHistory = false; }
  }
})();
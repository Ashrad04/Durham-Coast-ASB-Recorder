(() => {
  const DRAFT_KEY = 'dca_incident_draft_v3';
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const validViews = ['dashboard', 'log', 'records'];

  let currentView = document.querySelector('.view.active')?.id?.replace('view-', '') || 'dashboard';
  let draftDirty = false;
  let suppressGuard = false;
  let drawerHistoryOpen = false;
  let detailMap = null;
  let leaveModalOpen = false;
  let saveTimer = null;

  const baseNav = nav;
  const baseResetForm = resetForm;
  const baseSetEntryLocation = setEntryLocation;
  const baseSelectCategory = selectCategory;
  const baseOpenIncident = openIncident;
  const baseRenderRecords = renderRecords;

  const categoryIcons = {
    'Vehicles / off-road use': '🚙',
    'Camping / fires': '🔥',
    'Fly-tipping / waste': '🗑',
    'Vandalism / damage': '🛠',
    'Environmental damage': '🌿',
    'Unauthorised access': '⛔',
    'Dog-related issue': '🐕',
    'Public order / threatening behaviour': '⚠',
    'Substance misuse': '◌',
    'Other': '…'
  };

  function addUxStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .location-formats{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#52645f}
      .location-format-chip{background:#f5f8f7;border:1px solid #dfe7e3;border-radius:10px;padding:8px 10px}
      .location-format-chip strong{color:#17302b}
      .location-reference-panel{margin:14px 0;padding:14px;background:#f5f8f7;border:1px solid #dfe7e3;border-radius:12px}
      .location-reference-panel h3{margin:0 0 8px}
      .location-reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .location-reference-item{background:#fff;border:1px solid #e4ebe7;border-radius:10px;padding:10px;min-width:0}
      .location-reference-item span{display:block;color:#667871;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
      .location-reference-item strong{font-size:14px;color:#17302b;word-break:break-word}
      .location-reference-item small{display:block;color:#667871;margin-top:5px;line-height:1.4}
      .location-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
      .location-actions button,.location-actions a{border:1px solid #cfdad5;background:#fff;color:#174d43;border-radius:9px;padding:7px 9px;font-weight:750;font-size:12px;text-decoration:none}
      .admin-detail-map{height:250px;border-radius:12px;overflow:hidden;border:1px solid #dfe7e3;margin:10px 0}
      .location-audit-note{font-size:12px;color:#667871;line-height:1.45;margin-top:8px}
      .incident-map-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#fff;border:2px solid #174d43;box-shadow:0 2px 8px rgba(0,0,0,.24);font-size:18px;line-height:1}
      .incident-map-icon.approx{border-style:dashed;opacity:.9}
      .incident-icon-wrapper{background:transparent!important;border:0!important}
      .ux-modal-overlay{position:fixed;inset:0;z-index:3200;background:rgba(8,25,21,.72);display:grid;place-items:center;padding:18px;backdrop-filter:blur(4px)}
      .ux-modal{width:min(520px,100%);background:#fff;border-radius:18px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.28)}
      .ux-modal h2{margin:0 0 8px}.ux-modal p{color:#52645f;line-height:1.5;margin:0 0 16px}
      .ux-modal-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .ux-modal-actions button{border-radius:10px;padding:10px 13px;font-weight:800}
      .draft-badge{display:inline-block;background:#edf5f2;color:#174d43;border:1px solid #c9ded7;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:800;margin-bottom:10px}
      .save-confirm-ref{font-size:21px;font-weight:900;color:#174d43;background:#edf5f2;border-radius:12px;padding:12px;text-align:center;margin:12px 0}
      @media(max-width:600px){.location-reference-grid{grid-template-columns:1fr}.ux-modal-actions{flex-direction:column-reverse}.ux-modal-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function activeViewName() {
    return document.querySelector('.view.active')?.id?.replace('view-', '') || currentView || 'dashboard';
  }

  function iconForCategory(category) {
    return categoryIcons[category] || '•';
  }

  function leafletCategoryIcon(category, approximate = false) {
    return L.divIcon({
      className: 'incident-icon-wrapper',
      html: `<div class="incident-map-icon${approximate ? ' approx' : ''}">${esc(iconForCategory(category))}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -17]
    });
  }

  function showModal({ title, body, buttons = [], badge = '' }) {
    document.getElementById('uxModalOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'uxModalOverlay';
    overlay.className = 'ux-modal-overlay';
    overlay.innerHTML = `<div class="ux-modal">${badge ? `<div class="draft-badge">${esc(badge)}</div>` : ''}<h2>${esc(title)}</h2><div class="ux-modal-body">${body}</div><div class="ux-modal-actions"></div></div>`;
    const actions = overlay.querySelector('.ux-modal-actions');
    buttons.forEach(btn => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = btn.className || 'secondary';
      b.textContent = btn.label;
      b.onclick = () => btn.onClick?.(overlay);
      actions.appendChild(b);
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeModal() {
    document.getElementById('uxModalOverlay')?.remove();
    leaveModalOpen = false;
  }

  function meaningfulText() {
    const ids = ['description','site','locationDescription','habitatAffected','vehicleRegistration','vehicleDescription','personDetails','sensitiveNotes','policeRef','partnerRef','assignedTo','linkedIncidentRef','tags'];
    return ids.some(id => $(id)?.value?.trim());
  }

  function formHasMeaningfulInput() {
    if (draftDirty || selectedCategory || entryLocation || evidence?.length) return true;
    if (meaningfulText()) return true;
    const checks = ['peopleAtRisk','environmentalDamage','infrastructureDamage','designatedSiteImpact','vehicleInvolved','followUpRequired'];
    return checks.some(id => $(id)?.checked);
  }

  function serialiseDraft() {
    const form = $('incidentForm');
    if (!form || !formHasMeaningfulInput()) return null;
    const fields = {};
    form.querySelectorAll('input,select,textarea').forEach(el => {
      if (!el.id || ['file','button','submit'].includes(el.type)) return;
      fields[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? Boolean(el.checked) : el.value;
    });
    return {
      version: 3,
      saved_at: Date.now(),
      category: selectedCategory || '',
      location: entryLocation ? { ...entryLocation } : null,
      fields
    };
  }

  function saveDraftNow() {
    try {
      const draft = serialiseDraft();
      if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function scheduleDraftSave() {
    draftDirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraftNow, 250);
  }

  function clearDraft() {
    clearTimeout(saveTimer);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d || !d.saved_at || Date.now() - Number(d.saved_at) > DRAFT_MAX_AGE) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      return d;
    } catch { return null; }
  }

  function restoreDraft(draft) {
    if (!draft) return;
    suppressGuard = true;
    try {
      baseResetForm();
      if (draft.category) baseSelectCategory(draft.category);
      const fields = draft.fields || {};
      Object.entries(fields).forEach(([id, value]) => {
        const el = $(id);
        if (!el || el.type === 'file') return;
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = Boolean(value);
        else el.value = value ?? '';
      });
      if (draft.location && Number.isFinite(Number(draft.location.latitude)) && Number.isFinite(Number(draft.location.longitude))) {
        baseSetEntryLocation(Number(draft.location.latitude), Number(draft.location.longitude), draft.location.accuracy_m ?? null, true);
        renderEntryGridReference(Number(draft.location.latitude), Number(draft.location.longitude), draft.location.accuracy_m ?? null);
      }
      $('vehicleFields')?.classList.toggle('hidden', !$('vehicleInvolved')?.checked);
      $('followUpDateWrap')?.classList.toggle('hidden', !$('followUpRequired')?.checked);
      draftDirty = true;
    } finally { suppressGuard = false; }
  }

  function performNavigation(name, { replace = false, push = true } = {}) {
    if (!validViews.includes(name)) name = 'dashboard';
    suppressGuard = true;
    try {
      baseNav(name);
      currentView = name;
      const state = { dcaView: name, dcaDrawer: false };
      const url = name === 'dashboard' ? location.pathname + location.search : `#${name}`;
      if (replace) history.replaceState(state, '', url);
      else if (push && (history.state?.dcaView !== name || history.state?.dcaDrawer)) history.pushState(state, '', url);
    } finally { suppressGuard = false; }
  }

  function discardCurrentDraft() {
    suppressGuard = true;
    try {
      clearDraft();
      baseResetForm();
      draftDirty = false;
      const box = $('entryGridReference');
      if (box) box.textContent = '—';
    } finally { suppressGuard = false; }
  }

  function requestLeave(target, fromPopState = false) {
    if (leaveModalOpen) return;
    if (!formHasMeaningfulInput()) {
      performNavigation(target, { replace: fromPopState, push: !fromPopState });
      return;
    }
    leaveModalOpen = true;
    showModal({
      title: 'Incident form in progress',
      badge: 'UNFINISHED DRAFT',
      body: '<p>You have unsaved incident information. You can keep editing, save the draft on this device and leave, or discard it.</p><p><small>Photos are not retained in the browser draft and will need to be selected again after reopening.</small></p>',
      buttons: [
        { label: 'Discard and leave', className: 'danger-button', onClick: () => { discardCurrentDraft(); closeModal(); performNavigation(target, { replace: fromPopState, push: !fromPopState }); } },
        { label: 'Save draft and leave', className: 'secondary', onClick: () => { saveDraftNow(); closeModal(); performNavigation(target, { replace: fromPopState, push: !fromPopState }); } },
        { label: 'Continue editing', className: 'primary', onClick: () => closeModal() }
      ]
    });
  }

  nav = function(name) {
    const before = activeViewName();
    if (before === 'log' && name !== 'log' && !suppressGuard) {
      requestLeave(name, false);
      return false;
    }
    performNavigation(name, { push: true });
    return true;
  };

  window.addEventListener('popstate', event => {
    const drawer = $('detailDrawer');
    if (drawer && !drawer.classList.contains('hidden') && !event.state?.dcaDrawer) {
      drawer.classList.add('hidden');
      drawerHistoryOpen = false;
      if (detailMap) { try { detailMap.remove(); } catch {} detailMap = null; }
      return;
    }

    const target = validViews.includes(event.state?.dcaView) ? event.state.dcaView : 'dashboard';
    const before = activeViewName();
    if (before === 'log' && target !== 'log' && formHasMeaningfulInput()) {
      history.pushState({ dcaView: 'log', dcaDrawer: false }, '', '#log');
      requestLeave(target, true);
      return;
    }
    performNavigation(target, { replace: true, push: false });
  });

  window.addEventListener('beforeunload', event => {
    if (!formHasMeaningfulInput()) return;
    saveDraftNow();
    event.preventDefault();
    event.returnValue = '';
  });

  const form = $('incidentForm');
  if (form) {
    form.addEventListener('input', scheduleDraftSave, true);
    form.addEventListener('change', scheduleDraftSave, true);
  }

  selectCategory = function(cat) {
    const result = baseSelectCategory(cat);
    if (!suppressGuard) scheduleDraftSave();
    return result;
  };

  setEntryLocation = function(lat, lng, accuracy = null, pan = false) {
    const result = baseSetEntryLocation(lat, lng, accuracy, pan);
    renderEntryGridReference(lat, lng, accuracy);
    if (!suppressGuard) scheduleDraftSave();
    return result;
  };

  resetForm = function() {
    const result = baseResetForm();
    draftDirty = false;
    clearDraft();
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
    wrap.innerHTML = '<div class="location-format-chip">British Grid: <strong id="entryGridReference">—</strong></div><div class="location-format-chip" id="entryGridAccuracy">Grid reference is calculated from the selected GPS/map point.</div>';
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

  function digitsForAccuracy(accuracy) {
    const a = Number(accuracy);
    if (!Number.isFinite(a) || a <= 0) return 8;
    if (a <= 10) return 8;
    if (a <= 100) return 6;
    return 4;
  }

  function locationRefs(lat, lng, accuracy = null) {
    const grid = wgs84ToOsgbGrid(Number(lat), Number(lng));
    const digits = digitsForAccuracy(accuracy);
    return {
      gridRef: gridLetters(grid.easting, grid.northing, digits) || 'Outside British National Grid',
      easting: Math.round(grid.easting),
      northing: Math.round(grid.northing),
      digits
    };
  }

  function renderEntryGridReference(lat, lng, accuracy = null) {
    injectEntryGridReference();
    const target = $('entryGridReference');
    const note = $('entryGridAccuracy');
    if (!target) return;
    try {
      const refs = locationRefs(lat, lng, accuracy);
      target.textContent = refs.gridRef;
      if (note) note.textContent = Number.isFinite(Number(accuracy)) && Number(accuracy) > 0
        ? `${refs.digits}-figure reference shown to reflect GPS accuracy of about ±${Math.round(Number(accuracy))} m.`
        : `${refs.digits}-figure reference from the manually selected map point.`;
    } catch {
      target.textContent = 'Unavailable';
    }
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const old = button?.textContent;
      if (button) { button.textContent = 'Copied'; setTimeout(() => button.textContent = old, 1200); }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  function injectAdminLocationPanel(i) {
    if (!adminMode) return;
    const lat = Number(i.latitude), lng = Number(i.longitude), accuracy = Number(i.accuracy_m);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const drawer = $('drawerContent');
    if (!drawer) return;

    drawer.querySelector('#adminLocationReferences')?.remove();
    const refs = locationRefs(lat, lng, Number.isFinite(accuracy) ? accuracy : null);
    const gridFinder = `https://gridreferencefinder.com/index.php?x=${encodeURIComponent(refs.easting)}&y=${encodeURIComponent(refs.northing)}`;
    const googleMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    const osMaps = `https://explore.osmaps.com/?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=17&style=Standard&type=2d`;

    const panel = document.createElement('div');
    panel.id = 'adminLocationReferences';
    panel.className = 'location-reference-panel';
    panel.innerHTML = `<h3>Exact incident location</h3>
      <div id="adminDetailMap" class="admin-detail-map"></div>
      <div class="location-reference-grid">
        <div class="location-reference-item"><span>British National Grid</span><strong>${esc(refs.gridRef)}</strong><small>${refs.digits}-figure reference${Number.isFinite(accuracy) && accuracy > 0 ? ` · GPS accuracy ±${Math.round(accuracy)} m` : ' · manual map point'}</small><div class="location-actions"><button type="button" data-copy="${esc(refs.gridRef)}">Copy grid ref</button><a href="${gridFinder}" target="_blank" rel="noopener noreferrer">Grid Ref Finder ↗</a></div></div>
        <div class="location-reference-item"><span>Easting / Northing</span><strong>E ${refs.easting} · N ${refs.northing}</strong><div class="location-actions"><button type="button" data-copy="${refs.easting}, ${refs.northing}">Copy E/N</button></div></div>
        <div class="location-reference-item"><span>Latitude / longitude</span><strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong><div class="location-actions"><button type="button" data-copy="${lat.toFixed(6)}, ${lng.toFixed(6)}">Copy coordinates</button></div></div>
        <div class="location-reference-item"><span>Open exact point</span><strong>External mapping</strong><div class="location-actions"><a href="${googleMaps}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><a href="${osMaps}" target="_blank" rel="noopener noreferrer">OS Maps ↗</a></div><small>Opening an external map sends the coordinates to that service.</small></div>
      </div>
      <div class="location-audit-note"><strong>Original submitted location.</strong> This view does not silently overwrite the point recorded with the incident. Any future location-edit feature should retain the original value in the audit history.</div>`;

    const detailGrid = drawer.querySelector('.detail-grid');
    if (detailGrid) detailGrid.insertAdjacentElement('afterend', panel);
    else drawer.prepend(panel);

    panel.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyText(btn.dataset.copy, btn)));

    setTimeout(() => {
      try {
        if (detailMap) { detailMap.remove(); detailMap = null; }
        detailMap = L.map('adminDetailMap', { zoomControl: true }).setView([lat, lng], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '© OpenStreetMap contributors' }).addTo(detailMap);
        L.marker([lat, lng], { icon: leafletCategoryIcon(i.category, false) }).addTo(detailMap).bindPopup(`<strong>${esc(i.incident_ref || 'Incident')}</strong><br>${esc(i.category || 'Incident')}`);
        if (Number.isFinite(accuracy) && accuracy > 0) L.circle([lat, lng], { radius: accuracy, weight: 1, fillOpacity: .08 }).addTo(detailMap);
        detailMap.invalidateSize();
      } catch {}
    }, 80);
  }

  openIncident = async function(id) {
    if (detailMap) { try { detailMap.remove(); } catch {} detailMap = null; }
    const result = await baseOpenIncident(id);
    if (!adminMode) return result;
    const i = incidents.find(x => String(x.id) === String(id));
    if (i) injectAdminLocationPanel(i);

    if (!drawerHistoryOpen && !$('detailDrawer')?.classList.contains('hidden')) {
      history.pushState({ dcaView: activeViewName(), dcaDrawer: true }, '', location.href);
      drawerHistoryOpen = true;
    }
    return result;
  };

  document.querySelectorAll('[data-close-drawer]').forEach(el => {
    el.addEventListener('click', () => {
      if (detailMap) { try { detailMap.remove(); } catch {} detailMap = null; }
      if (drawerHistoryOpen && history.state?.dcaDrawer) {
        drawerHistoryOpen = false;
        history.back();
      }
    });
  });

  renderRecords = function() {
    baseRenderRecords();
    if (!recordLayer || !recordsMap) return;
    recordLayer.clearLayers();
    const points = [];
    incidents.forEach(i => {
      const lat = Number(i.latitude), lng = Number(i.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      points.push([lat, lng]);
      const marker = L.marker([lat, lng], { icon: leafletCategoryIcon(i.category, !adminMode) }).addTo(recordLayer);
      if (adminMode) {
        marker.bindPopup(`<strong>${esc(i.incident_ref || '')}</strong><br>${esc(i.category || 'Incident')}<br>${esc(i.site || '')}`);
        if (i.id) marker.on('click', () => openIncident(i.id));
      } else {
        marker.bindPopup(`<strong>${esc(iconForCategory(i.category))} ${esc(i.category || 'Incident')}</strong><br>${esc(i.site || 'Durham Coast')}<br><small>Approximate location. Ticket details restricted.</small>`);
      }
    });
    if (points.length) recordsMap.fitBounds(L.latLngBounds(points).pad(.12), { maxZoom: adminMode ? 14 : 13 });
  };

  async function enhancedSaveIncident(e) {
    e.preventDefault();
    $('formMsg').textContent = '';
    if (!selectedCategory) { $('formMsg').textContent = 'Select an incident category.'; return; }
    if (!$('description').value.trim()) { $('formMsg').textContent = 'Add a brief incident description.'; return; }
    if (!$('occurredAt').value) { $('formMsg').textContent = 'Add the incident date and time.'; return; }
    if (!entryLocation) { $('formMsg').textContent = 'Set the incident location using GPS or the map.'; return; }

    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Saving…';
    try {
      const r = await apiFetch('/api/incidents', { method: 'POST', body: JSON.stringify(payload()) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not save incident');
      const ref = data?.incident?.incident_ref || 'Saved';
      clearDraft();
      suppressGuard = true;
      try { baseResetForm(); draftDirty = false; } finally { suppressGuard = false; }
      try { await loadIncidents(); } catch {}

      showModal({
        title: 'Incident saved',
        badge: 'SUBMISSION COMPLETE',
        body: `<p>The incident has been added to the shared system.</p><div class="save-confirm-ref">${esc(ref)}</div><p><small>Keep this reference if you need to discuss or follow up the report.</small></p>`,
        buttons: [
          { label: 'Return to overview', className: 'secondary', onClick: () => { closeModal(); performNavigation('dashboard', { push: true }); } },
          { label: 'Log another incident', className: 'secondary', onClick: () => { closeModal(); performNavigation('log', { replace: true, push: false }); } },
          { label: 'Copy reference', className: 'primary', onClick: overlay => copyText(ref, overlay.querySelector('.primary')) }
        ]
      });
    } catch (err) {
      $('formMsg').textContent = err.message || 'Could not save incident.';
      saveDraftNow();
    } finally {
      $('saveBtn').disabled = false;
      $('saveBtn').textContent = 'Save incident';
    }
  }

  if (form) form.onsubmit = enhancedSaveIncident;

  function offerStoredDraft() {
    const draft = readDraft();
    if (!draft) return;
    showModal({
      title: 'Unfinished incident found',
      badge: 'SAVED ON THIS DEVICE',
      body: '<p>An unfinished incident was saved in this browser. Resume it or discard it before starting another report.</p><p><small>For security and browser-storage limits, photos are not stored in the draft.</small></p>',
      buttons: [
        { label: 'Discard draft', className: 'danger-button', onClick: () => { clearDraft(); closeModal(); } },
        { label: 'Resume incident', className: 'primary', onClick: () => { restoreDraft(draft); closeModal(); performNavigation('log', { push: true }); } }
      ]
    });
  }

  addUxStyles();
  injectEntryGridReference();

  const hashView = location.hash.replace('#', '');
  currentView = validViews.includes(hashView) ? hashView : activeViewName();
  history.replaceState({ dcaView: currentView, dcaDrawer: false }, '', currentView === 'dashboard' ? location.pathname + location.search : `#${currentView}`);
  if (activeViewName() !== currentView) performNavigation(currentView, { replace: true, push: false });

  setTimeout(offerStoredDraft, 450);
})();
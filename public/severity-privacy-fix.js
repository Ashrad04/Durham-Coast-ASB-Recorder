(() => {
  const severitySelect = document.getElementById('severity');
  const severityGuide = document.querySelector('.severity-guide');
  if (!severitySelect || !severityGuide) return;

  const style = document.createElement('style');
  style.textContent = `
    .severity-native-label{display:none!important}
    .severity-guide{grid-template-columns:repeat(5,1fr)!important}
    .severity-level{cursor:pointer;transition:.15s ease;position:relative;user-select:none}
    .severity-level:hover{border-color:#99b6ac;transform:translateY(-1px)}
    .severity-level.selected{border:2px solid #174d43;background:#edf5f2;box-shadow:0 0 0 2px rgba(23,77,67,.08)}
    .severity-level.selected::after{content:'✓';position:absolute;top:8px;right:10px;font-weight:900;color:#174d43}
    .severity-level:focus-visible{outline:3px solid rgba(23,77,67,.28);outline-offset:2px}
    .severity-choice-note{font-size:12px;color:#667871;margin:2px 0 8px}
    .public-map-notice{background:#fff8e7;border:1px solid #edd9a7;border-radius:10px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.45;color:#5b4a25}
    @media(max-width:900px){.severity-guide{grid-template-columns:repeat(3,1fr)!important}}
    @media(max-width:620px){.severity-guide{grid-template-columns:1fr 1fr!important}}
    @media(max-width:420px){.severity-guide{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);

  severitySelect.closest('label')?.classList.add('severity-native-label');

  const notAssessed = document.createElement('div');
  notAssessed.className = 'severity-level';
  notAssessed.dataset.severity = 'Not assessed';
  notAssessed.tabIndex = 0;
  notAssessed.setAttribute('role', 'button');
  notAssessed.innerHTML = '<strong>Not assessed</strong><small>Use this if the impact is unclear or a reviewer should determine severity later.</small>';
  severityGuide.insertBefore(notAssessed, severityGuide.firstChild);

  [...severityGuide.querySelectorAll('.severity-level')].forEach(card => {
    if (!card.dataset.severity) card.dataset.severity = card.querySelector('strong')?.textContent?.trim() || '';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => chooseSeverity(card.dataset.severity));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        chooseSeverity(card.dataset.severity);
      }
    });
  });

  const note = document.createElement('div');
  note.className = 'severity-choice-note';
  note.textContent = 'Tap a severity box to select it.';
  severityGuide.insertAdjacentElement('beforebegin', note);

  function syncSeverityCards() {
    const value = severitySelect.value || 'Not assessed';
    severityGuide.querySelectorAll('.severity-level').forEach(card => {
      const selected = card.dataset.severity === value;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function chooseSeverity(value) {
    severitySelect.value = value;
    severitySelect.dispatchEvent(new Event('change', { bubbles: true }));
    syncSeverityCards();
  }

  severitySelect.addEventListener('change', syncSeverityCards);
  const existingResetForm = resetForm;
  resetForm = function() {
    const result = existingResetForm();
    setTimeout(syncSeverityCards, 0);
    return result;
  };
  document.addEventListener('click', () => setTimeout(syncSeverityCards, 0), true);
  syncSeverityCards();

  const currentRenderRecords = renderRecords;
  const categorySymbols = {
    'Vehicles / off-road use':'🚙','Camping / fires':'🔥','Fly-tipping / waste':'🗑','Vandalism / damage':'🛠',
    'Environmental damage':'🌿','Unauthorised access':'⛔','Dog-related issue':'🐕','Public order / threatening behaviour':'⚠',
    'Substance misuse':'◌','Other':'…'
  };

  function publicIcon(category) {
    const symbol = categorySymbols[category] || '•';
    return L.divIcon({
      className:'incident-icon-wrapper',
      html:`<div class="incident-map-icon approx">${esc(symbol)}</div>`,
      iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-17]
    });
  }

  function disablePublicMapZoom() {
    if (!recordsMap) return;
    recordsMap.setMaxZoom(9);
    if (recordsMap.getZoom() > 9) recordsMap.setZoom(9);
    recordsMap.touchZoom?.disable();
    recordsMap.scrollWheelZoom?.disable();
    recordsMap.doubleClickZoom?.disable();
    recordsMap.boxZoom?.disable();
    recordsMap.keyboard?.disable();
  }

  function enableAdminMapZoom() {
    if (!recordsMap) return;
    recordsMap.setMaxZoom(20);
    recordsMap.touchZoom?.enable();
    recordsMap.scrollWheelZoom?.enable();
    recordsMap.doubleClickZoom?.enable();
    recordsMap.boxZoom?.enable();
    recordsMap.keyboard?.enable();
  }

  renderRecords = function() {
    if (adminMode) {
      enableAdminMapZoom();
      return currentRenderRecords();
    }

    const result = currentRenderRecords();
    if (!recordLayer || !recordsMap) return result;

    disablePublicMapZoom();
    recordLayer.clearLayers();
    const points = [];

    incidents.forEach(i => {
      const lat = Number(i.latitude), lng = Number(i.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      points.push([lat,lng]);
      L.circle([lat,lng], {
        radius: 5000,
        interactive: false,
        fillOpacity: 0.06,
        opacity: 0.2,
        weight: 1
      }).addTo(recordLayer);
      const marker = L.marker([lat,lng], { icon: publicIcon(i.category) }).addTo(recordLayer);
      marker.bindPopup(`<strong>${esc(i.category || 'Incident')}</strong><br><small>Generalised area only. This symbol is deliberately displaced from the submitted location; exact coordinates are restricted to administrators.</small>`);
    });

    if (points.length) recordsMap.fitBounds(L.latLngBounds(points).pad(.25), { maxZoom: 9 });
    disablePublicMapZoom();

    const panel = document.querySelector('#view-records .records-toolbar');
    if (panel && !document.getElementById('publicMapPrivacyNotice')) {
      const notice = document.createElement('div');
      notice.id = 'publicMapPrivacyNotice';
      notice.className = 'public-map-notice';
      notice.innerHTML = '<strong>Privacy-protected map:</strong> non-admin symbols are deliberately displaced by several kilometres and represent only a broad area. Pinch, wheel and double-click zoom are disabled here. The precise submitted location is available only after admin login.';
      panel.insertAdjacentElement('afterend', notice);
    }
    return result;
  };

  const existingLoginAdmin = loginAdmin;
  loginAdmin = async function() {
    await existingLoginAdmin();
    if (adminMode) {
      document.getElementById('publicMapPrivacyNotice')?.remove();
      enableAdminMapZoom();
      try { await loadIncidents(); } catch {}
      renderAll();
    }
  };

  const existingExitAdmin = exitAdmin;
  exitAdmin = function(message='') {
    const result = existingExitAdmin(message);
    disablePublicMapZoom();
    return result;
  };
})();

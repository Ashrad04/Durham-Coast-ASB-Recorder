(() => {
  const PUBLIC_MAX_ZOOM = 10;
  const baseRenderRecords = renderRecords;

  const style = document.createElement('style');
  style.textContent = `
    .map-date-tools{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:0 0 10px;padding:10px;background:#f8faf9;border:1px solid #dfe7e3;border-radius:12px}
    .map-date-tools label{margin:0;font-size:11px;color:#667871;font-weight:750}
    .map-date-tools input{display:block;margin-top:4px;min-width:140px}
    .map-date-tools button{white-space:nowrap}
    .map-priority-legend{font-size:12px;color:#667871;margin:7px 0 10px;display:flex;align-items:center;gap:7px}
    .map-priority-ring-swatch{width:17px;height:17px;border:3px solid #b42318;border-radius:50%;display:inline-block;box-sizing:border-box;background:#fff}
    @media(max-width:620px){.map-date-tools{align-items:stretch}.map-date-tools label{width:calc(50% - 4px)}.map-date-tools input{min-width:0;width:100%}}
  `;
  document.head.appendChild(style);

  function isPriority(i) {
    return adminMode ? ['High', 'Critical'].includes(i?.severity) : i?.high_priority === true;
  }

  function addPriorityRings() {
    if (!recordLayer || !recordsMap) return;
    incidents.forEach(i => {
      if (!isPriority(i)) return;
      const lat = Number(i.latitude), lng = Number(i.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      L.circleMarker([lat, lng], {
        radius: 20,
        color: '#b42318',
        weight: 3,
        opacity: 0.95,
        fill: false,
        interactive: false
      }).addTo(recordLayer);
    });
  }

  function setPublicLimitedZoom() {
    if (!recordsMap) return;
    recordsMap.setMaxZoom(PUBLIC_MAX_ZOOM);
    if (recordsMap.getZoom() > PUBLIC_MAX_ZOOM) recordsMap.setZoom(PUBLIC_MAX_ZOOM);
    recordsMap.touchZoom?.enable();
    recordsMap.scrollWheelZoom?.enable();
    recordsMap.doubleClickZoom?.enable();
    recordsMap.boxZoom?.enable();
    recordsMap.keyboard?.enable();
  }

  function syncAdminDateTools() {
    const from = document.getElementById('adminMapFrom');
    const to = document.getElementById('adminMapTo');
    if (from) from.value = document.getElementById('filterFrom')?.value || '';
    if (to) to.value = document.getElementById('filterTo')?.value || '';
  }

  async function applyAdminDates(from, to) {
    const sourceFrom = document.getElementById('filterFrom');
    const sourceTo = document.getElementById('filterTo');
    if (sourceFrom) sourceFrom.value = from || '';
    if (sourceTo) sourceTo.value = to || '';
    syncAdminDateTools();
    await loadIncidents();
  }

  function dateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function ensureAdminDateTools() {
    const mapEl = document.getElementById('recordsMap');
    if (!mapEl) return;
    let tools = document.getElementById('adminMapDateTools');
    if (!adminMode) {
      tools?.classList.add('hidden');
      return;
    }
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'adminMapDateTools';
      tools.className = 'map-date-tools';
      tools.innerHTML = `
        <label>From<input id="adminMapFrom" type="date"></label>
        <label>To<input id="adminMapTo" type="date"></label>
        <button id="adminMapApply" class="secondary" type="button">Apply dates</button>
        <button id="adminMap30" class="secondary" type="button">Last 30 days</button>
        <button id="adminMapYear" class="secondary" type="button">This year</button>
        <button id="adminMapAll" class="secondary" type="button">All dates</button>`;
      mapEl.parentElement.insertBefore(tools, mapEl);
      document.getElementById('adminMapApply').onclick = () => applyAdminDates(
        document.getElementById('adminMapFrom').value,
        document.getElementById('adminMapTo').value
      );
      document.getElementById('adminMap30').onclick = () => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);
        applyAdminDates(dateString(from), dateString(to));
      };
      document.getElementById('adminMapYear').onclick = () => {
        const now = new Date();
        applyAdminDates(`${now.getFullYear()}-01-01`, dateString(now));
      };
      document.getElementById('adminMapAll').onclick = () => applyAdminDates('', '');
    }
    tools.classList.remove('hidden');
    syncAdminDateTools();
  }

  function ensurePriorityLegend() {
    const mapEl = document.getElementById('recordsMap');
    if (!mapEl || document.getElementById('mapPriorityLegend')) return;
    const legend = document.createElement('div');
    legend.id = 'mapPriorityLegend';
    legend.className = 'map-priority-legend';
    legend.innerHTML = '<span class="map-priority-ring-swatch"></span><span>High / Critical incident</span>';
    mapEl.insertAdjacentElement('afterend', legend);
  }

  renderRecords = function() {
    const result = baseRenderRecords();
    if (!recordLayer || !recordsMap) return result;

    if (adminMode) {
      ensureAdminDateTools();
    } else {
      ensureAdminDateTools();
      setPublicLimitedZoom();
      const count = document.getElementById('recordCount');
      if (count) count.textContent = `${incidents.length} incident${incidents.length === 1 ? '' : 's'} shown · last 30 days`;
      const notice = document.getElementById('publicMapPrivacyNotice');
      if (notice) notice.innerHTML = '<strong>Map restricted for privacy</strong>';
    }

    addPriorityRings();
    ensurePriorityLegend();
    return result;
  };
})();

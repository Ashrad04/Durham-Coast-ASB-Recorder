(() => {
  let publicSummary = { total: 0, open: 0, high: 0, last30: 0 };

  const originalApiFetch = apiFetch;
  const originalRenderDashboard = renderDashboard;
  const originalRenderRecords = renderRecords;
  const originalOpenIncident = openIncident;
  const originalLoginAdmin = loginAdmin;
  const originalExitAdmin = exitAdmin;

  apiFetch = async function(url, options = {}) {
    const response = await originalApiFetch(url, options);
    const method = String(options.method || 'GET').toUpperCase();
    if (!adminMode && method === 'GET' && String(url).startsWith('/api/incidents') && !String(url).includes('/actions') && response.ok) {
      try {
        const data = await response.clone().json();
        if (data && data.restricted && data.summary) {
          publicSummary = {
            total: Number(data.summary.total || 0),
            open: Number(data.summary.open || 0),
            high: Number(data.summary.high || 0),
            last30: Number(data.summary.last30 || 0)
          };
        }
      } catch {}
    }
    return response;
  };

  function setRestrictedView(restricted) {
    const recentPanel = $('recentList')?.closest('.panel');
    const filterPanel = document.querySelector('#view-records .filter-panel');
    const exportWrap = document.querySelector('#view-records .records-toolbar > div');
    const recordsHeading = document.querySelector('#view-records .page-heading h2');
    const recordsIntro = document.querySelector('#view-records .page-heading p');
    const mapNav = document.querySelector('.bottom-nav [data-nav="records"]');

    if (filterPanel) filterPanel.classList.toggle('hidden', restricted);
    if (exportWrap) exportWrap.classList.toggle('hidden', restricted);
    if (recordsHeading) recordsHeading.textContent = restricted ? 'Incident map' : 'Incidents';
    if (recordsIntro) recordsIntro.textContent = restricted
      ? 'Approximate incident locations and aggregate activity only. Ticket details are restricted to administrators.'
      : 'Filter, map and update the collective record.';
    if (mapNav) mapNav.innerHTML = restricted ? '<span>◉</span>Map overview' : '<span>◉</span>Map & records';

    if (recentPanel) {
      const heading = recentPanel.querySelector('.panel-heading h3');
      const eyebrow = recentPanel.querySelector('.panel-heading .eyebrow');
      const viewAll = recentPanel.querySelector('[data-nav="records"]');
      if (heading) heading.textContent = restricted ? 'Incident information' : 'Latest incidents';
      if (eyebrow) eyebrow.textContent = restricted ? 'RESTRICTED TICKETS' : 'RECENT ACTIVITY';
      if (viewAll) viewAll.textContent = restricted ? 'View map' : 'View all';
    }
  }

  renderDashboard = function() {
    if (adminMode) {
      setRestrictedView(false);
      return originalRenderDashboard();
    }
    setRestrictedView(true);
    $('statTotal').textContent = publicSummary.total;
    $('statOpen').textContent = publicSummary.open;
    $('statHigh').textContent = publicSummary.high;
    $('stat30').textContent = publicSummary.last30;
    $('recentList').innerHTML = '<div class="empty-state"><strong>Ticket details are admin-only.</strong><br><span class="muted">All users can log an incident and view aggregate counts and the basic incident map. Descriptions, reporter details, evidence, references, actions and exact ticket records are not shown here.</span></div>';
  };

  renderRecords = function() {
    if (adminMode) {
      setRestrictedView(false);
      return originalRenderRecords();
    }

    setRestrictedView(true);
    $('recordCount').textContent = `${publicSummary.total} incident${publicSummary.total === 1 ? '' : 's'} logged`;
    $('recordsList').innerHTML = '<div class="empty-state"><strong>Individual tickets are restricted.</strong><br><span class="muted">Map points are deliberately approximate and show only a broad incident category and site/area where available.</span></div>';

    if (!recordLayer || !recordsMap) return;
    recordLayer.clearLayers();
    const points = [];
    incidents.forEach(i => {
      const lat = Number(i.latitude), lng = Number(i.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      points.push([lat, lng]);
      const marker = L.marker([lat, lng]).addTo(recordLayer);
      marker.bindPopup(`<strong>${esc(i.category || 'Incident')}</strong><br>${esc(i.site || 'Durham Coast')}<br><small>Approximate location. Ticket details restricted.</small>`);
    });
    if (points.length) {
      recordsMap.fitBounds(L.latLngBounds(points).pad(.12), { maxZoom: 13 });
    }
  };

  openIncident = async function(id) {
    if (!adminMode) return;
    return originalOpenIncident(id);
  };

  loginAdmin = async function() {
    await originalLoginAdmin();
    if (adminMode) {
      try { await loadIncidents(); } catch {}
      renderAll();
    }
  };

  exitAdmin = function(message = '') {
    originalExitAdmin(message);
    Promise.resolve(loadIncidents()).then(() => renderAll()).catch(() => renderAll());
  };

  document.addEventListener('DOMContentLoaded', () => setRestrictedView(!adminMode));
})();

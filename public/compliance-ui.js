(() => {
  const baseApiFetch = apiFetch;
  const baseOpenIncident = openIncident;
  const baseShowAdminPanel = showAdminPanel;
  const baseExitAdmin = exitAdmin;
  const baseLogin = login;
  const ADMIN_IDLE_MS = 30 * 60 * 1000;
  let lastAdminActivity = Date.now();

  const style = document.createElement('style');
  style.textContent = `
    .privacy-link{color:inherit;text-decoration:underline;text-underline-offset:2px;font-weight:750}
    .top-privacy-link{border:0;background:transparent;color:#fff;font-size:12px;font-weight:800;padding:8px 5px;text-decoration:underline;text-underline-offset:3px}
    .micro-privacy{font-size:12px;color:#667871;margin:7px 0 0;line-height:1.35}
    .governance-zone{margin-top:18px;border-top:1px solid #dfe7e3;padding-top:14px}
    .governance-zone h3{margin:0 0 4px}.governance-zone>p{margin:0 0 10px}
    .governance-actions{display:flex;gap:8px;flex-wrap:wrap}
    .governance-panel{margin-top:10px;display:grid;gap:8px}
    .governance-item{border:1px solid #dfe7e3;border-radius:10px;padding:10px;background:#f8faf9;font-size:12px;line-height:1.45}
    .governance-item strong{display:block;color:#17302b;margin-bottom:3px}
    .retention-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end}
    .retention-row input[type=date]{min-width:145px}
    .retention-row label{margin:0;font-size:11px}
    .audit-event{border-bottom:1px solid #e6ece9;padding:8px 0;font-size:12px;line-height:1.4}
    .audit-event:last-child{border-bottom:0}
    .privacy-footer{padding:14px 16px 82px;text-align:center;font-size:12px;color:#667871}
    @media(max-width:600px){.retention-row{grid-template-columns:1fr}.retention-row input[type=date]{width:100%}}
  `;
  document.head.appendChild(style);

  function currentActorHeaders(options = {}) {
    const headers = { ...(options.headers || {}) };
    if (profile?.name) headers['x-user-name'] = profile.name;
    if (profile?.org) headers['x-user-org'] = profile.org;
    return headers;
  }

  apiFetch = async function(url, options = {}) {
    options = { ...options, headers: currentActorHeaders(options) };
    const response = await baseApiFetch(url, options);
    if (adminMode && response.status === 403 && !String(url).startsWith('/api/admin/login')) {
      const clone = response.clone();
      try {
        const data = await clone.json();
        if (/expired|administrator access required/i.test(data?.error || '')) {
          setTimeout(() => exitAdmin('Administrator session expired.'), 0);
        }
      } catch {}
    }
    return response;
  };

  function addPrivacyLinks() {
    const note = document.querySelector('#loginOverlay .privacy-note');
    if (note) note.innerHTML = 'Only add personal information when needed. <a class="privacy-link" href="/privacy.html" target="_blank" rel="noopener">Privacy</a>';

    const topActions = document.querySelector('.top-actions');
    if (topActions && !document.getElementById('topPrivacyLink')) {
      const a = document.createElement('a');
      a.id = 'topPrivacyLink';
      a.className = 'top-privacy-link';
      a.href = '/privacy.html';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Privacy';
      topActions.insertBefore(a, topActions.firstChild);
    }

    if (!document.getElementById('privacyFooter')) {
      const footer = document.createElement('div');
      footer.id = 'privacyFooter';
      footer.className = 'privacy-footer';
      footer.innerHTML = '<a class="privacy-link" href="/privacy.html" target="_blank" rel="noopener">Privacy</a> · Only add information needed for incident management.';
      document.body.appendChild(footer);
    }
  }

  function shortenNotices() {
    const mapNotice = document.getElementById('publicMapPrivacyNotice');
    if (mapNotice) mapNotice.innerHTML = '<strong>Map restricted for privacy</strong>';

    const recordsIntro = document.querySelector('#view-records .page-heading p');
    if (recordsIntro && !adminMode) recordsIntro.textContent = 'Privacy-restricted incident overview.';

    const restrictedList = document.querySelector('#recordsList .empty-state');
    if (restrictedList && !adminMode) restrictedList.innerHTML = '<strong>Ticket details restricted to administrators.</strong>';

    const sensitive = document.querySelector('.sensitive-box p');
    if (sensitive) sensitive.textContent = 'Only add personal details where necessary.';

    const photoGrid = document.querySelector('.photo-choice-grid');
    if (photoGrid && !document.getElementById('photoPrivacyNote')) {
      const p = document.createElement('p');
      p.id = 'photoPrivacyNote';
      p.className = 'micro-privacy';
      p.textContent = 'Upload only what is needed.';
      photoGrid.insertAdjacentElement('afterend', p);
    }

    const vehicleFields = document.getElementById('vehicleFields');
    if (vehicleFields && !document.getElementById('vehiclePrivacyNote')) {
      const p = document.createElement('p');
      p.id = 'vehiclePrivacyNote';
      p.className = 'micro-privacy';
      p.textContent = 'Restricted to authorised users.';
      vehicleFields.prepend(p);
    }
  }

  function makePublicNameOptional() {
    const nameInput = document.getElementById('loginName');
    const orgInput = document.getElementById('loginOrg');
    const label = nameInput?.closest('label');
    if (label && !label.dataset.privacyAdjusted) {
      label.dataset.privacyAdjusted = '1';
      for (const node of [...label.childNodes]) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('Recorder name')) node.textContent = 'Recorder name ';
      }
      const hint = document.createElement('span');
      hint.className = 'required-note';
      hint.textContent = '(optional for member of public)';
      label.insertBefore(hint, nameInput);
    }

    login = async function() {
      const org = orgInput?.value?.trim() || '';
      if (org === 'Member of public' && !nameInput?.value?.trim()) nameInput.value = 'Member of public';
      return baseLogin();
    };
    const button = document.getElementById('loginBtn');
    if (button) button.onclick = login;
  }

  openIncident = async function(id) {
    const result = await baseOpenIncident(id);
    if (adminMode) {
      const incident = incidents.find(x => x.id === id);
      if (incident?.incident_ref) {
        apiFetch('/api/admin/audit-event', {
          method: 'POST',
          body: JSON.stringify({ event: 'view_incident', incident_ref: incident.incident_ref })
        }).catch(() => {});
      }
    }
    return result;
  };

  async function loadRetention(panel) {
    panel.innerHTML = '<div class="muted">Loading retention review…</div>';
    try {
      const r = await apiFetch('/api/admin/retention');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not load retention review.');
      const policy = data.policy_configured
        ? `Default review period: ${data.default_review_days} days.`
        : 'Retention period not configured. Set it only after Information Governance approval.';
      const rows = (data.incidents || []).slice(0, 100);
      panel.innerHTML = `<div class="governance-item"><strong>${data.due_count || 0} record(s) due for review</strong>${esc(policy)}</div>` +
        (rows.length ? rows.map(i => {
          const review = i.retention_review_at ? String(i.retention_review_at).slice(0, 10) : '';
          return `<div class="governance-item retention-row" data-retention-id="${esc(i.id)}">
            <div><strong>${esc(i.incident_ref)} · ${esc(i.category || 'Incident')}</strong>${esc(i.status || '')}</div>
            <label>Review date<input class="retention-date" type="date" value="${esc(review)}"></label>
            <label><input class="retention-hold" type="checkbox" ${i.retention_hold ? 'checked' : ''}> Hold</label>
            <button type="button" class="secondary retention-save">Save</button>
          </div>`;
        }).join('') : '<div class="governance-item">No active records.</div>');

      panel.querySelectorAll('.retention-save').forEach(btn => {
        btn.onclick = async () => {
          const row = btn.closest('[data-retention-id]');
          btn.disabled = true;
          try {
            const rr = await apiFetch(`/api/admin/retention/${encodeURIComponent(row.dataset.retentionId)}`, {
              method: 'POST',
              body: JSON.stringify({ review_at: row.querySelector('.retention-date').value, hold: row.querySelector('.retention-hold').checked })
            });
            const rd = await rr.json();
            if (!rr.ok) throw new Error(rd.error || 'Could not save retention review.');
            btn.textContent = 'Saved';
            setTimeout(() => { btn.textContent = 'Save'; }, 1000);
          } catch (e) {
            alert(e.message);
          } finally { btn.disabled = false; }
        };
      });
    } catch (e) {
      panel.innerHTML = `<div class="governance-item">${esc(e.message)}</div>`;
    }
  }

  async function loadAudit(panel) {
    panel.innerHTML = '<div class="muted">Loading audit log…</div>';
    try {
      const r = await apiFetch('/api/admin/audit?limit=50');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not load audit log.');
      const rows = data.events || [];
      panel.innerHTML = rows.length ? rows.map(e => `<div class="audit-event"><strong>${esc(e.event_type)}</strong>${e.incident_ref ? ` · ${esc(e.incident_ref)}` : ''}<br><span>${new Date(e.occurred_at).toLocaleString()} · ${esc(e.actor_name)} · ${esc(e.actor_org)}</span></div>`).join('') : '<div class="governance-item">No audit events yet.</div>';
    } catch (e) {
      panel.innerHTML = `<div class="governance-item">${esc(e.message)}</div>`;
    }
  }

  function injectGovernanceControls() {
    const card = document.querySelector('#adminPanelOverlay .admin-panel-card');
    if (!card || document.getElementById('governanceZone')) return;
    const zone = document.createElement('div');
    zone.id = 'governanceZone';
    zone.className = 'governance-zone';
    zone.innerHTML = `<h3>Data governance</h3><p class="privacy-note">Admin-only audit and retention controls.</p>
      <div class="governance-actions"><button id="retentionBtn" class="secondary" type="button">Retention review</button><button id="auditBtn" class="secondary" type="button">Audit log</button></div>
      <div id="governancePanel" class="governance-panel"></div>`;
    card.appendChild(zone);
    document.getElementById('retentionBtn').onclick = () => loadRetention(document.getElementById('governancePanel'));
    document.getElementById('auditBtn').onclick = () => loadAudit(document.getElementById('governancePanel'));
  }

  showAdminPanel = function(message = '') {
    const result = baseShowAdminPanel(message);
    if (adminMode) setTimeout(injectGovernanceControls, 0);
    return result;
  };

  exitAdmin = function(message = '') {
    if (adminToken) apiFetch('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
    return baseExitAdmin(message);
  };

  ['pointerdown','keydown','touchstart','scroll'].forEach(event => {
    window.addEventListener(event, () => { lastAdminActivity = Date.now(); }, { passive: true });
  });
  setInterval(() => {
    if (adminMode && Date.now() - lastAdminActivity > ADMIN_IDLE_MS) exitAdmin('Administrator session ended after inactivity.');
  }, 30000);

  const observer = new MutationObserver(() => {
    shortenNotices();
    addPrivacyLinks();
    if (adminMode) injectGovernanceControls();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  makePublicNameOptional();
  addPrivacyLinks();
  shortenNotices();
})();

(() => {
  const style = document.createElement('style');
  style.textContent = `
    :root{
      --coast-ink:#17302b;
      --coast-green:#174d43;
      --coast-green-2:#276b5f;
      --coast-mist:#eef4f1;
      --coast-stone:#f6f4ef;
      --coast-sand:#eee6d6;
      --coast-line:#dce5e1;
      --coast-danger:#b42318;
      --coast-amber:#a45f12;
      --coast-shadow:0 12px 34px rgba(19,55,48,.08);
    }

    body{background:linear-gradient(180deg,#f7f8f6 0,#f3f6f4 45%,#f6f4ef 100%);letter-spacing:-.005em}
    main{padding-top:30px}
    .topbar{height:76px;background:#163f37;box-shadow:0 5px 22px rgba(15,45,39,.16)}
    .topbar h1{font-size:23px;letter-spacing:-.025em}.topbar .eyebrow{opacity:.72}

    .hero{position:relative;overflow:hidden;background:#174d43!important;border:1px solid rgba(255,255,255,.08);box-shadow:0 16px 38px rgba(19,55,48,.16);padding:34px}
    .hero::after{content:'';position:absolute;width:330px;height:330px;border:60px solid rgba(255,255,255,.045);border-radius:50%;right:-150px;top:-170px;pointer-events:none}
    .hero> *{position:relative;z-index:1}.hero h2{font-size:34px;letter-spacing:-.035em}.hero p{font-size:15px;line-height:1.55;max-width:650px}
    .hero .primary{box-shadow:0 6px 20px rgba(0,0,0,.13);transition:transform .16s ease,box-shadow .16s ease}.hero .primary:hover{transform:translateY(-1px);box-shadow:0 9px 24px rgba(0,0,0,.17)}

    .stats-grid{gap:12px;margin:20px 0 22px}.stat-card{position:relative;overflow:hidden;border-color:#dce5e1;padding:19px 20px 18px;box-shadow:0 5px 18px rgba(23,77,67,.035);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
    .stat-card:hover{transform:translateY(-1px);border-color:#bfd0ca;box-shadow:0 9px 22px rgba(23,77,67,.07)}
    .stat-card::before{content:attr(data-stat-icon);position:absolute;right:16px;top:13px;width:31px;height:31px;border-radius:10px;display:grid;place-items:center;background:#eef4f1;color:#174d43;font-size:16px;font-weight:900}
    .stat-card span{font-size:12px;text-transform:uppercase;letter-spacing:.055em;font-weight:800}.stat-card strong{font-size:32px;letter-spacing:-.035em}
    .stat-card.stat-priority::before{background:#fff0ee;color:#b42318}.stat-card.stat-recent::before{background:#f5efe3;color:#805c20}

    .panel,.form-card{border-color:#dce5e1;border-radius:20px;box-shadow:0 6px 24px rgba(23,77,67,.045);padding:24px;margin-bottom:20px}
    .panel-heading{padding-bottom:4px}.panel-heading h3,.page-heading h2,.step-heading h3{letter-spacing:-.02em}.page-heading h2{font-size:28px}.step-heading h3{font-size:18px}.step-heading p,.page-heading p{line-height:1.5}
    .step-number{width:38px;height:38px;border-radius:12px;background:#eaf2ef;box-shadow:inset 0 0 0 1px #d6e3df}

    .category-grid{gap:11px}.category-btn{position:relative;min-height:82px;border-radius:14px;padding:14px 11px;border-color:#dce5e1;transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
    .category-btn:hover{transform:translateY(-1px);border-color:#abc2ba;box-shadow:0 5px 14px rgba(23,77,67,.06)}.category-btn span{font-size:24px}.category-btn.active{background:#edf5f2;box-shadow:0 0 0 2px rgba(23,77,67,.09)}

    input,select,textarea{border-color:#cddbd6;border-radius:11px;min-height:44px;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
    textarea{min-height:92px}.check-card{border-radius:14px;transition:border-color .15s ease,background .15s ease,transform .15s ease}.check-card:hover{border-color:#b5c8c1;background:#fbfcfb;transform:translateY(-1px)}
    .sensitive-box,.conditional,.status-guide{border-radius:14px}

    .form-progress{position:sticky;top:86px;z-index:40;display:flex;gap:7px;margin:-3px 0 18px;padding:8px;background:rgba(247,248,246,.94);backdrop-filter:blur(12px);border:1px solid rgba(220,229,225,.9);border-radius:14px;box-shadow:0 7px 20px rgba(23,77,67,.05);overflow:auto}
    .form-progress button{flex:1;min-width:112px;border:0;background:transparent;color:#667871;border-radius:10px;padding:8px 10px;font-size:11px;font-weight:800;text-align:left;white-space:nowrap;transition:.15s ease}
    .form-progress button span{display:inline-grid;place-items:center;width:21px;height:21px;border-radius:7px;background:#e7eeeb;color:#174d43;margin-right:5px}.form-progress button.active{background:#174d43;color:#fff}.form-progress button.active span{background:rgba(255,255,255,.18);color:#fff}

    .optional-details{margin-top:16px;border:1px solid #dce5e1;border-radius:14px;background:#fafbf9;overflow:hidden}.optional-details>summary{cursor:pointer;list-style:none;padding:14px 15px;font-weight:850;color:#174d43;display:flex;justify-content:space-between;align-items:center}.optional-details>summary::-webkit-details-marker{display:none}.optional-details>summary::after{content:'+';font-size:20px;font-weight:500;color:#667871}.optional-details[open]>summary::after{content:'−'}.optional-details-body{padding:0 15px 16px;border-top:1px solid #e5ebe8}.optional-details-hint{font-size:12px;color:#667871;margin:12px 0 2px;line-height:1.45}

    .filter-panel{border-radius:16px;padding:13px;box-shadow:0 4px 18px rgba(23,77,67,.035)}
    .records-toolbar{margin:15px 4px 10px;font-weight:650}.records-toolbar>span{color:#405b54}
    .map-shell{background:#fff;border:1px solid #dce5e1;border-radius:20px;padding:14px;box-shadow:var(--coast-shadow);margin-bottom:18px}
    .map-shell-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 11px}.map-shell-title{display:flex;align-items:center;gap:10px}.map-shell-title-icon{width:34px;height:34px;border-radius:11px;background:#eaf2ef;display:grid;place-items:center;color:#174d43;font-size:17px}.map-shell-head h3{font-size:16px;margin:0}.map-shell-head p{font-size:11px;color:#667871;margin:2px 0 0}.map-reset{padding:8px 10px!important;font-size:11px!important;white-space:nowrap}.map-shell .records-map{margin:0;height:470px;border-radius:14px;border-color:#d7e2de}.map-shell .map-date-tools{margin:0 0 10px;border-radius:12px;background:#f8faf9}.map-shell .map-priority-legend{margin:10px 3px 1px}.public-map-notice{display:inline-flex!important;width:auto;align-items:center;margin:4px 0 10px!important;padding:7px 10px!important;border-radius:999px!important;background:#f6f1e7!important;border-color:#e5d8ba!important;color:#725c2d!important}

    .incident-card{position:relative;border-radius:16px;padding:15px 16px;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}.incident-card:hover{transform:translateY(-1px);box-shadow:0 7px 18px rgba(23,77,67,.06)}
    .incident-card.has-priority{border-left:4px solid #b42318}.incident-title{display:flex;align-items:center;gap:8px;letter-spacing:-.01em}.incident-category-icon{width:28px;height:28px;border-radius:9px;background:#eef4f1;display:inline-grid;place-items:center;font-size:16px;flex:0 0 auto}
    .badge{border:1px solid transparent;padding:5px 9px}.badge.status-new{background:#eef2f0;color:#53655f}.badge.status-reviewed{background:#edf3f8;color:#315c77}.badge.status-assigned{background:#eeeafa;color:#5b4a8b}.badge.status-action-in-progress{background:#fff2df;color:#8a5717}.badge.status-monitoring{background:#edf5f2;color:#236457}.badge.status-closed{background:#ecefed;color:#53625d}.badge.high,.badge.critical{border-color:#efcbc6}

    .empty-state.polished-empty{padding:28px 18px}.empty-state-icon{display:grid;place-items:center;width:42px;height:42px;margin:0 auto 10px;border-radius:14px;background:#eef4f1;color:#174d43;font-size:21px}.empty-state.polished-empty strong{color:#304a44}

    .admin-mode-banner{position:sticky;top:76px;z-index:850;display:flex;align-items:center;justify-content:center;gap:7px;background:#fff4dd;border-bottom:1px solid #ead7a8;color:#6a4a11;font-size:11px;font-weight:850;letter-spacing:.025em;padding:7px 12px}.admin-mode-banner::before{content:'';width:7px;height:7px;border-radius:50%;background:#a45f12;box-shadow:0 0 0 3px rgba(164,95,18,.13)}

    .drawer-panel{background:#fbfcfb;padding:30px;box-shadow:-18px 0 60px rgba(0,0,0,.16)}.polished-case>.incident-ref,.polished-case>h2{display:none}.case-header{background:#173f37;color:#fff;border-radius:18px;padding:18px;margin:4px 0 18px;display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;box-shadow:0 10px 26px rgba(23,63,55,.14)}.case-header-icon{width:50px;height:50px;border-radius:15px;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:26px}.case-header-main{min-width:0}.case-header-ref{font-size:11px;font-weight:850;letter-spacing:.06em;color:#cfe2dc}.case-header h2{font-size:21px;line-height:1.15;margin:4px 0 9px;letter-spacing:-.025em}.case-header-meta{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.case-header .badge{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.18)}.case-header .badge.priority{background:#fff0ee;color:#9f241b;border-color:#ffd4cf}.case-header-date{font-size:11px;color:#d9e8e4}.case-description{font-size:15px;line-height:1.58;color:#304a44;background:#fff;border:1px solid #e0e7e4;border-radius:14px;padding:14px 15px}.case-section-title{font-size:13px;text-transform:uppercase;letter-spacing:.055em;color:#667871;margin:21px 0 8px}.detail-grid{gap:9px}.detail-item{background:#fff;border:1px solid #e2e9e6;border-radius:12px;padding:11px}.timeline{background:#fff;border:1px solid #e1e8e5;border-left:3px solid #d9e4e0;border-radius:14px;padding:4px 14px 4px 21px;margin:0}.timeline-item{padding:6px 0}

    .bottom-nav{height:72px;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);box-shadow:0 -5px 22px rgba(23,77,67,.07)}.bottom-nav button{max-width:210px;transition:color .15s ease,transform .15s ease}.bottom-nav button.active{font-weight:850}.bottom-nav button.active:not(.log-nav) span{background:#eaf2ef;border-radius:10px;width:34px;height:28px;display:grid;place-items:center}.bottom-nav .log-nav span{width:40px;height:40px;margin-top:-9px;box-shadow:0 7px 16px rgba(23,77,67,.22)}.bottom-nav button:active{transform:scale(.98)}

    button,.incident-card,.category-btn{transition-duration:.16s!important}.primary:active,.secondary:active{transform:translateY(1px)}

    @media(max-width:850px){
      main{padding-top:20px}.hero{padding:26px}.hero h2{font-size:29px}.panel,.form-card{padding:18px}.map-shell{padding:10px}.map-shell .records-map{height:380px}.drawer-panel{padding:25px 16px}.form-progress{top:82px;margin-left:-2px;margin-right:-2px}
    }
    @media(max-width:520px){
      .topbar{height:70px}.admin-mode-banner{top:70px}.hero{border-radius:18px;padding:22px}.hero h2{font-size:27px}.stats-grid{gap:8px}.stat-card{padding:15px}.stat-card strong{font-size:27px}.stat-card::before{width:28px;height:28px;right:11px;top:11px}.form-progress{top:76px;border-radius:12px;padding:6px}.form-progress button{min-width:96px;padding:7px 8px}.map-shell-head{align-items:flex-start}.map-shell .records-map{height:350px}.case-header{padding:15px;grid-template-columns:42px 1fr}.case-header-icon{width:42px;height:42px;font-size:22px}.case-header h2{font-size:18px}.bottom-nav{height:70px}
    }
  `;
  document.head.appendChild(style);

  const symbols = {
    'Vehicles / off-road use':'🚙','Camping / fires':'🔥','Fly-tipping / waste':'🗑','Vandalism / damage':'🛠',
    'Environmental damage':'🌿','Unauthorised access':'⛔','Dog-related issue':'🐕','Public order / threatening behaviour':'⚠',
    'Substance misuse':'◌','Other':'…'
  };

  function symbolFor(category) { return symbols[category] || '•'; }
  function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

  function enhanceStats() {
    const cards = [...document.querySelectorAll('.stats-grid .stat-card')];
    const config = [
      ['↗','stat-open'],['!','stat-priority'],['30','stat-recent'],['Σ','stat-total']
    ];
    cards.forEach((card,i) => {
      card.dataset.statIcon = config[i]?.[0] || '•';
      if (config[i]?.[1]) card.classList.add(config[i][1]);
    });
  }

  function enhanceIncidentCards() {
    document.querySelectorAll('.incident-card').forEach(card => {
      const id = card.dataset.id;
      const incident = incidents.find(x => String(x.id) === String(id));
      if (!incident) return;
      const title = card.querySelector('.incident-title');
      if (title && !title.querySelector('.incident-category-icon')) {
        const icon = document.createElement('span');
        icon.className = 'incident-category-icon';
        icon.setAttribute('aria-hidden','true');
        icon.textContent = symbolFor(incident.category);
        title.prepend(icon);
      }
      card.classList.toggle('has-priority', ['High','Critical'].includes(incident.severity));
      card.querySelectorAll('.badge').forEach(badge => {
        const text = badge.textContent.trim();
        if (['New','Reviewed','Assigned','Action in progress','Monitoring','Closed'].includes(text)) {
          badge.classList.add(`status-${slug(text)}`);
        }
      });
    });
  }

  function enhanceEmptyStates() {
    document.querySelectorAll('.empty-state').forEach(el => {
      if (el.querySelector('.empty-state-icon')) return;
      el.classList.add('polished-empty');
      const icon = document.createElement('div');
      icon.className = 'empty-state-icon';
      icon.setAttribute('aria-hidden','true');
      icon.textContent = el.closest('#view-records') ? '◉' : '○';
      el.prepend(icon);
    });
  }

  function ensureProgress() {
    const form = document.getElementById('incidentForm');
    if (!form || document.getElementById('formProgress')) return;
    const targets = [
      ['1','What happened?', form.querySelector('.form-card:has(#description)')],
      ['2','Where & when', form.querySelector('.form-card:has(#occurredAt)')],
      ['3','Evidence', form.querySelector('.form-card:has(#peopleAtRisk)')],
      ['4','Follow-up', form.querySelector('.form-card:has(#sourceType)')]
    ].filter(x => x[2]);
    if (!targets.length) return;
    const nav = document.createElement('div');
    nav.id = 'formProgress';
    nav.className = 'form-progress';
    nav.setAttribute('aria-label','Incident form steps');
    targets.forEach(([n,label,target],index) => {
      target.dataset.formStep = n;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.targetStep = n;
      btn.innerHTML = `<span>${n}</span>${label}`;
      if (index === 0) btn.classList.add('active');
      btn.onclick = () => target.scrollIntoView({behavior:'smooth',block:'start'});
      nav.appendChild(btn);
    });
    form.insertAdjacentElement('beforebegin', nav);

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.targetStep === visible.target.dataset.formStep));
      }, { rootMargin:'-22% 0px -58% 0px', threshold:[0,.1,.3,.6] });
      targets.forEach(x => observer.observe(x[2]));
    }
  }

  function ensureOptionalDetails() {
    const card = document.getElementById('sourceType')?.closest('.form-card');
    const guide = card?.querySelector('.status-guide');
    if (!card || !guide || document.getElementById('additionalReportingDetails')) return;
    const details = document.createElement('details');
    details.id = 'additionalReportingDetails';
    details.className = 'optional-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Additional reporting details';
    const body = document.createElement('div');
    body.className = 'optional-details-body';
    body.innerHTML = '<p class="optional-details-hint">Add partner references, assignment, follow-up dates or tags where useful.</p>';
    details.append(summary, body);
    const nodes = [];
    let node = guide.nextElementSibling;
    while (node) { const next = node.nextElementSibling; nodes.push(node); node = next; }
    nodes.forEach(n => body.appendChild(n));
    guide.insertAdjacentElement('afterend', details);

    const shouldOpen = () => {
      const ids = ['policeRef','partnerRef','leadOrg','assignedTo','linkedIncidentRef','followUpRequired','followUpDate','tags'];
      return ids.some(id => {
        const el = document.getElementById(id);
        return el && (el.type === 'checkbox' ? el.checked : Boolean(el.value?.trim()));
      });
    };
    card.addEventListener('input', () => { if (shouldOpen()) details.open = true; }, true);
    card.addEventListener('change', () => { if (shouldOpen()) details.open = true; }, true);
    setTimeout(() => { if (shouldOpen()) details.open = true; }, 0);
  }

  function ensureMapShell() {
    const map = document.getElementById('recordsMap');
    if (!map) return;
    let shell = document.getElementById('recordsMapShell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'recordsMapShell';
      shell.className = 'map-shell';
      const head = document.createElement('div');
      head.className = 'map-shell-head';
      head.innerHTML = `<div class="map-shell-title"><div class="map-shell-title-icon" aria-hidden="true">⌖</div><div><h3>Incident map</h3><p id="mapShellSubtitle">Spatial overview of logged incidents</p></div></div><button id="resetMapView" class="secondary map-reset" type="button">Reset view</button>`;
      map.parentElement.insertBefore(shell, map);
      shell.appendChild(head);
      shell.appendChild(map);
      document.getElementById('resetMapView').onclick = () => {
        if (!recordsMap) return;
        if (adminMode) {
          const points = incidents.map(i => [Number(i.latitude),Number(i.longitude)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
          if (points.length) recordsMap.fitBounds(L.latLngBounds(points).pad(.12), {maxZoom:13});
          else recordsMap.fitBounds([[54.43,-2.35],[55.08,-1.12]], {maxZoom:9});
        } else {
          recordsMap.fitBounds([[54.43,-2.35],[55.08,-1.12]], {padding:[12,12],maxZoom:9,animate:false});
        }
      };
    }
    const tools = document.getElementById('adminMapDateTools');
    if (tools && tools.parentElement !== shell) shell.insertBefore(tools, map);
    const legend = document.getElementById('mapPriorityLegend');
    if (legend && legend.parentElement !== shell) shell.appendChild(legend);
    const subtitle = document.getElementById('mapShellSubtitle');
    if (subtitle) subtitle.textContent = adminMode ? 'Exact incident locations · authorised view' : 'Generalised locations · last 30 days';
  }

  function syncAdminBanner() {
    let banner = document.getElementById('adminModeBanner');
    if (adminMode) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'adminModeBanner';
        banner.className = 'admin-mode-banner';
        banner.textContent = 'Administrator mode · full incident details visible';
        document.querySelector('.topbar')?.insertAdjacentElement('afterend', banner);
      }
      banner.classList.remove('hidden');
    } else banner?.classList.add('hidden');
  }

  function enhanceDrawer(id) {
    const d = document.getElementById('drawerContent');
    const incident = incidents.find(x => String(x.id) === String(id));
    if (!d || !incident || d.querySelector('.case-header')) return;
    d.classList.add('polished-case');
    const header = document.createElement('div');
    header.className = 'case-header';
    const priority = ['High','Critical'].includes(incident.severity);
    header.innerHTML = `<div class="case-header-icon" aria-hidden="true">${esc(symbolFor(incident.category))}</div><div class="case-header-main"><div class="case-header-ref">${esc(incident.incident_ref || 'INCIDENT')}</div><h2>${esc(incident.category || 'Incident')}</h2><div class="case-header-meta"><span class="badge${priority ? ' priority' : ''}">${esc(incident.severity || 'Not assessed')}</span><span class="badge">${esc(incident.status || 'New')}</span><span class="case-header-date">${incident.occurred_at ? new Date(incident.occurred_at).toLocaleString() : ''}</span></div></div>`;
    d.prepend(header);
    const description = [...d.children].find(el => el.tagName === 'P' && !el.classList.contains('privacy-note'));
    if (description) description.classList.add('case-description');
    const grid = d.querySelector('.detail-grid');
    if (grid && !grid.previousElementSibling?.classList.contains('case-section-title')) {
      const h = document.createElement('h3');
      h.className = 'case-section-title';
      h.textContent = 'Case details';
      grid.insertAdjacentElement('beforebegin', h);
    }
    const timeline = d.querySelector('.timeline');
    if (timeline && !timeline.previousElementSibling?.classList.contains('case-section-title')) {
      const h = document.createElement('h3');
      h.className = 'case-section-title';
      h.textContent = 'Activity history';
      timeline.insertAdjacentElement('beforebegin', h);
    }
  }

  function enhanceAll() {
    enhanceStats();
    enhanceIncidentCards();
    enhanceEmptyStates();
    ensureMapShell();
    syncAdminBanner();
  }

  ensureProgress();
  ensureOptionalDetails();
  enhanceStats();

  const baseRenderDashboard = renderDashboard;
  renderDashboard = function() {
    const result = baseRenderDashboard();
    enhanceStats();
    enhanceIncidentCards();
    enhanceEmptyStates();
    syncAdminBanner();
    return result;
  };

  const baseRenderRecords = renderRecords;
  renderRecords = function() {
    const result = baseRenderRecords();
    ensureMapShell();
    enhanceIncidentCards();
    enhanceEmptyStates();
    syncAdminBanner();
    return result;
  };

  const baseOpenIncident = openIncident;
  openIncident = async function(id) {
    const result = await baseOpenIncident(id);
    enhanceDrawer(id);
    return result;
  };

  const baseLoginAdmin = loginAdmin;
  loginAdmin = async function() {
    const result = await baseLoginAdmin();
    syncAdminBanner();
    ensureMapShell();
    return result;
  };

  const baseExitAdmin = exitAdmin;
  exitAdmin = function(message='') {
    const result = baseExitAdmin(message);
    syncAdminBanner();
    ensureMapShell();
    return result;
  };

  document.addEventListener('DOMContentLoaded', enhanceAll, {once:true});
  setTimeout(enhanceAll, 350);
})();

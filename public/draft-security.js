(() => {
  const DRAFT_KEY = 'dca_incident_draft_v3';
  const restrictedDraftFields = new Set([
    'vehicleRegistration',
    'vehicleDescription',
    'personDetails',
    'sensitiveNotes',
    'policeRef',
    'partnerRef',
    'assignedTo',
    'linkedIncidentRef'
  ]);

  function sanitiseDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || !draft.fields) return;
      let changed = false;
      restrictedDraftFields.forEach(id => {
        if (Object.prototype.hasOwnProperty.call(draft.fields, id)) {
          delete draft.fields[id];
          changed = true;
        }
      });
      if (changed) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }

  let timer = null;
  function scheduleSanitise() {
    clearTimeout(timer);
    timer = setTimeout(sanitiseDraft, 400);
  }

  const form = document.getElementById('incidentForm');
  if (form) {
    form.addEventListener('input', scheduleSanitise, true);
    form.addEventListener('change', scheduleSanitise, true);
  }
  window.addEventListener('beforeunload', sanitiseDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sanitiseDraft(); });
  sanitiseDraft();
})();
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const SENSITIVE_ACCESS_CODE = process.env.SENSITIVE_ACCESS_CODE || '';
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const usePostgres = Boolean(process.env.DATABASE_URL);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'incidents.json');
const pool = usePostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
}) : null;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const clean = (v, max = 5000) => v == null ? '' : String(v).trim().slice(0, max);
const asBool = v => v === true || v === 'true' || v === 1 || v === '1';
const asNum = v => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireAccess(req, res, next) {
  if (!ACCESS_CODE || safeEqual(req.get('x-access-code'), ACCESS_CODE)) return next();
  res.status(401).json({ error: 'Access code required or incorrect.' });
}

function canSeeSensitive(req) {
  return Boolean(SENSITIVE_ACCESS_CODE) && safeEqual(req.get('x-sensitive-code'), SENSITIVE_ACCESS_CODE);
}

function makeAdminToken() {
  const expiry = Date.now() + (8 * 60 * 60 * 1000);
  const nonce = crypto.randomBytes(18).toString('hex');
  const payload = `${expiry}.${nonce}`;
  const sig = crypto.createHmac('sha256', ADMIN_CODE).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function isAdmin(req) {
  if (!ADMIN_CODE) return false;
  const token = clean(req.get('x-admin-token'), 500);
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiryText, nonce, suppliedSig] = parts;
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !nonce) return false;
  const payload = `${expiryText}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', ADMIN_CODE).update(payload).digest('hex');
  return safeEqual(suppliedSig, expectedSig);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(403).json({ error: 'Admin access required.' });
}

const adminAttempts = new Map();
function adminAttemptKey(req) {
  return clean((req.get('x-forwarded-for') || req.ip || 'unknown').split(',')[0], 100);
}
function adminLoginAllowed(req) {
  const key = adminAttemptKey(req);
  const now = Date.now();
  const state = adminAttempts.get(key);
  if (!state || now - state.started > 15 * 60 * 1000) {
    adminAttempts.set(key, { started: now, failures: 0 });
    return true;
  }
  return state.failures < 5;
}
function recordAdminFailure(req) {
  const key = adminAttemptKey(req);
  const now = Date.now();
  const state = adminAttempts.get(key);
  if (!state || now - state.started > 15 * 60 * 1000) adminAttempts.set(key, { started: now, failures: 1 });
  else state.failures += 1;
}
function clearAdminFailures(req) { adminAttempts.delete(adminAttemptKey(req)); }

function normaliseEvidence(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 3).map(x => ({
    name: clean(x?.name, 200),
    type: clean(x?.type, 100),
    data: clean(x?.data, 4500000)
  })).filter(x => x.data.startsWith('data:image/'));
}

function validateIncident(body) {
  const latitude = asNum(body.latitude);
  const longitude = asNum(body.longitude);
  const occurred = new Date(body.occurred_at || Date.now());
  if (!clean(body.reporter_name, 200) || !clean(body.reporter_org, 200)) throw Object.assign(new Error('Recorder name and organisation are required.'), { status: 400 });
  if (!clean(body.category, 120)) throw Object.assign(new Error('Incident category is required.'), { status: 400 });
  if (!clean(body.description, 8000)) throw Object.assign(new Error('A brief incident description is required.'), { status: 400 });
  if (Number.isNaN(occurred.getTime())) throw Object.assign(new Error('Incident date/time is invalid.'), { status: 400 });
  if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw Object.assign(new Error('A valid incident location is required.'), { status: 400 });
  }
  return {
    occurred_at: occurred.toISOString(),
    time_precision: clean(body.time_precision, 40) || 'Exact',
    reported_at: new Date().toISOString(),
    reporter_name: clean(body.reporter_name, 200),
    reporter_org: clean(body.reporter_org, 200),
    source_type: clean(body.source_type, 100) || 'Staff / partner observation',
    category: clean(body.category, 120),
    subcategory: clean(body.subcategory, 150),
    severity: clean(body.severity, 40) || 'Medium',
    description: clean(body.description, 8000),
    site: clean(body.site, 250),
    location_description: clean(body.location_description, 1000),
    latitude,
    longitude,
    accuracy_m: asNum(body.accuracy_m),
    location_precision: clean(body.location_precision, 50) || 'Exact point',
    people_at_risk: asBool(body.people_at_risk),
    environmental_damage: asBool(body.environmental_damage),
    habitat_affected: clean(body.habitat_affected, 1000),
    infrastructure_damage: asBool(body.infrastructure_damage),
    designated_site_impact: asBool(body.designated_site_impact),
    vehicle_involved: asBool(body.vehicle_involved),
    evidence_json: normaliseEvidence(body.evidence_json),
    police_ref: clean(body.police_ref, 150),
    partner_ref: clean(body.partner_ref, 300),
    lead_org: clean(body.lead_org, 200),
    assigned_to: clean(body.assigned_to, 200),
    status: clean(body.status, 60) || 'New',
    follow_up_required: asBool(body.follow_up_required),
    follow_up_date: clean(body.follow_up_date, 20) || null,
    linked_incident_ref: clean(body.linked_incident_ref, 80),
    tags: clean(body.tags, 500),
    sensitive: {
      vehicle_registration: clean(body.vehicle_registration, 100),
      vehicle_description: clean(body.vehicle_description, 1000),
      identifiable_person_details: clean(body.identifiable_person_details, 2000),
      sensitive_notes: clean(body.sensitive_notes, 3000)
    }
  };
}

async function initStorage() {
  if (!usePostgres) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try { await fs.access(DATA_FILE); } catch { await fs.writeFile(DATA_FILE, '[]\n', 'utf8'); }
    return;
  }
  await pool.query('CREATE SEQUENCE IF NOT EXISTS asb_incident_seq START 1');
  await pool.query(`CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY, incident_ref TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurred_at TIMESTAMPTZ NOT NULL, time_precision TEXT, reported_at TIMESTAMPTZ NOT NULL, reporter_name TEXT NOT NULL, reporter_org TEXT NOT NULL,
    source_type TEXT, category TEXT NOT NULL, subcategory TEXT, severity TEXT, description TEXT NOT NULL, site TEXT, location_description TEXT,
    latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, accuracy_m DOUBLE PRECISION, location_precision TEXT,
    people_at_risk BOOLEAN DEFAULT FALSE, environmental_damage BOOLEAN DEFAULT FALSE, habitat_affected TEXT, infrastructure_damage BOOLEAN DEFAULT FALSE,
    designated_site_impact BOOLEAN DEFAULT FALSE, vehicle_involved BOOLEAN DEFAULT FALSE, evidence_json JSONB DEFAULT '[]'::jsonb,
    police_ref TEXT, partner_ref TEXT, lead_org TEXT, assigned_to TEXT, status TEXT DEFAULT 'New', follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE, linked_incident_ref TEXT, tags TEXT,
    deleted_at TIMESTAMPTZ, deleted_by TEXT, delete_reason TEXT
  )`);
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS deleted_by TEXT');
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS delete_reason TEXT');
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_sensitive (
    incident_id UUID PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
    vehicle_registration TEXT, vehicle_description TEXT, identifiable_person_details TEXT, sensitive_notes TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS incident_actions (
    id UUID PRIMARY KEY, incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, action_at TIMESTAMPTZ NOT NULL,
    action_by TEXT NOT NULL, organisation TEXT NOT NULL, action_type TEXT, note TEXT NOT NULL, status_after TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_occurred ON incidents(occurred_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents(latitude, longitude)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_deleted ON incidents(deleted_at)');
}

async function readJson() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); } catch { return []; }
}
async function writeJson(rows) { await fs.writeFile(DATA_FILE, JSON.stringify(rows, null, 2) + '\n', 'utf8'); }

async function nextReference() {
  const year = new Date().getFullYear();
  if (usePostgres) {
    const r = await pool.query("SELECT nextval('asb_incident_seq') AS n");
    return `DCA-${year}-${String(r.rows[0].n).padStart(5, '0')}`;
  }
  const rows = await readJson();
  const n = rows.reduce((m, x) => Math.max(m, Number((x.incident_ref || '').split('-').pop()) || 0), 0) + 1;
  return `DCA-${year}-${String(n).padStart(5, '0')}`;
}

function stripSensitive(row, include) {
  const copy = { ...row };
  if (!include) delete copy.sensitive;
  return copy;
}

async function listIncidents(filters = {}, includeSensitive = false, options = {}) {
  const includeDeleted = Boolean(options.includeDeleted);
  const onlyDeleted = Boolean(options.onlyDeleted);
  if (!usePostgres) {
    let rows = await readJson();
    rows = rows.filter(r => onlyDeleted ? Boolean(r.deleted_at) : includeDeleted ? true : !r.deleted_at);
    const q = clean(filters.q, 200).toLowerCase();
    if (q) rows = rows.filter(r => `${r.incident_ref} ${r.category} ${r.subcategory} ${r.site} ${r.description} ${r.reporter_org}`.toLowerCase().includes(q));
    if (filters.status) rows = rows.filter(r => r.status === filters.status);
    if (filters.category) rows = rows.filter(r => r.category === filters.category);
    if (filters.org) rows = rows.filter(r => r.reporter_org === filters.org || r.lead_org === filters.org);
    if (filters.from) rows = rows.filter(r => new Date(r.occurred_at) >= new Date(filters.from));
    if (filters.to) rows = rows.filter(r => new Date(r.occurred_at) < new Date(`${filters.to}T23:59:59.999Z`));
    return rows.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).map(r => stripSensitive(r, includeSensitive));
  }

  const clauses = [];
  const values = [];
  if (onlyDeleted) clauses.push('i.deleted_at IS NOT NULL');
  else if (!includeDeleted) clauses.push('i.deleted_at IS NULL');
  if (filters.q) {
    values.push(`%${clean(filters.q, 200)}%`);
    const p = `$${values.length}`;
    clauses.push(`(i.incident_ref ILIKE ${p} OR i.category ILIKE ${p} OR i.subcategory ILIKE ${p} OR i.site ILIKE ${p} OR i.description ILIKE ${p} OR i.reporter_org ILIKE ${p})`);
  }
  if (filters.status) { values.push(filters.status); clauses.push(`i.status = $${values.length}`); }
  if (filters.category) { values.push(filters.category); clauses.push(`i.category = $${values.length}`); }
  if (filters.org) { values.push(filters.org); clauses.push(`(i.reporter_org = $${values.length} OR i.lead_org = $${values.length})`); }
  if (filters.from) { values.push(filters.from); clauses.push(`i.occurred_at >= $${values.length}::date`); }
  if (filters.to) { values.push(filters.to); clauses.push(`i.occurred_at < ($${values.length}::date + INTERVAL '1 day')`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const join = includeSensitive ? 'LEFT JOIN incident_sensitive s ON s.incident_id=i.id' : '';
  const sensitive = includeSensitive ? ", json_build_object('vehicle_registration',s.vehicle_registration,'vehicle_description',s.vehicle_description,'identifiable_person_details',s.identifiable_person_details,'sensitive_notes',s.sensitive_notes) AS sensitive" : '';
  const r = await pool.query(`SELECT i.* ${sensitive} FROM incidents i ${join} ${where} ORDER BY i.occurred_at DESC LIMIT 10000`, values);
  return r.rows;
}

async function saveIncident(d) {
  const id = crypto.randomUUID();
  const incidentRef = await nextReference();
  const created = new Date().toISOString();
  if (!usePostgres) {
    const rows = await readJson();
    const record = { id, incident_ref: incidentRef, created_at: created, updated_at: created, actions: [], deleted_at: null, deleted_by: '', delete_reason: '', ...d };
    rows.push(record);
    await writeJson(rows);
    return stripSensitive(record, false);
  }
  const fields = ['id','incident_ref','created_at','updated_at','occurred_at','time_precision','reported_at','reporter_name','reporter_org','source_type','category','subcategory','severity','description','site','location_description','latitude','longitude','accuracy_m','location_precision','people_at_risk','environmental_damage','habitat_affected','infrastructure_damage','designated_site_impact','vehicle_involved','evidence_json','police_ref','partner_ref','lead_org','assigned_to','status','follow_up_required','follow_up_date','linked_incident_ref','tags'];
  const vals = [id,incidentRef,created,created,d.occurred_at,d.time_precision,d.reported_at,d.reporter_name,d.reporter_org,d.source_type,d.category,d.subcategory,d.severity,d.description,d.site,d.location_description,d.latitude,d.longitude,d.accuracy_m,d.location_precision,d.people_at_risk,d.environmental_damage,d.habitat_affected,d.infrastructure_damage,d.designated_site_impact,d.vehicle_involved,JSON.stringify(d.evidence_json),d.police_ref,d.partner_ref,d.lead_org,d.assigned_to,d.status,d.follow_up_required,d.follow_up_date,d.linked_incident_ref,d.tags];
  const placeholders = vals.map((_, i) => i === 26 ? `$${i + 1}::jsonb` : `$${i + 1}`).join(',');
  const r = await pool.query(`INSERT INTO incidents (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`, vals);
  const s = d.sensitive;
  if (s.vehicle_registration || s.vehicle_description || s.identifiable_person_details || s.sensitive_notes) {
    await pool.query('INSERT INTO incident_sensitive (incident_id,vehicle_registration,vehicle_description,identifiable_person_details,sensitive_notes) VALUES ($1,$2,$3,$4,$5)', [id,s.vehicle_registration,s.vehicle_description,s.identifiable_person_details,s.sensitive_notes]);
  }
  return r.rows[0];
}

async function getActions(id) {
  if (!usePostgres) {
    const row = (await readJson()).find(x => x.id === id);
    return (row?.actions || []).sort((a, b) => new Date(b.action_at) - new Date(a.action_at));
  }
  return (await pool.query('SELECT * FROM incident_actions WHERE incident_id=$1 ORDER BY action_at DESC', [id])).rows;
}

async function addAction(id, body) {
  const action = {
    id: crypto.randomUUID(),
    action_at: body.action_at ? new Date(body.action_at).toISOString() : new Date().toISOString(),
    action_by: clean(body.action_by, 200),
    organisation: clean(body.organisation, 200),
    action_type: clean(body.action_type, 120),
    note: clean(body.note, 5000),
    status_after: clean(body.status_after, 60)
  };
  if (!action.action_by || !action.organisation || !action.note) throw Object.assign(new Error('Action author, organisation and note are required.'), { status: 400 });
  if (!usePostgres) {
    const rows = await readJson();
    const incident = rows.find(x => x.id === id && !x.deleted_at);
    if (!incident) throw Object.assign(new Error('Incident not found.'), { status: 404 });
    incident.actions = incident.actions || [];
    incident.actions.push(action);
    if (action.status_after) incident.status = action.status_after;
    incident.updated_at = new Date().toISOString();
    await writeJson(rows);
    return action;
  }
  const exists = await pool.query('SELECT 1 FROM incidents WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!exists.rowCount) throw Object.assign(new Error('Incident not found.'), { status: 404 });
  await pool.query('INSERT INTO incident_actions (id,incident_id,action_at,action_by,organisation,action_type,note,status_after) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [action.id,id,action.action_at,action.action_by,action.organisation,action.action_type,action.note,action.status_after]);
  if (action.status_after) await pool.query('UPDATE incidents SET status=$1,updated_at=NOW() WHERE id=$2', [action.status_after,id]);
  else await pool.query('UPDATE incidents SET updated_at=NOW() WHERE id=$1', [id]);
  return action;
}

async function archiveIncident(id, body) {
  const actorName = clean(body.actor_name, 200);
  const actorOrg = clean(body.actor_org, 200);
  const reason = clean(body.reason, 1000);
  if (!actorName || !actorOrg) throw Object.assign(new Error('Admin name and organisation are required for the audit record.'), { status: 400 });
  if (!reason) throw Object.assign(new Error('A reason for removing the record is required.'), { status: 400 });
  const deletedBy = `${actorName} · ${actorOrg}`;
  if (!usePostgres) {
    const rows = await readJson();
    const incident = rows.find(x => x.id === id && !x.deleted_at);
    if (!incident) throw Object.assign(new Error('Incident not found or already archived.'), { status: 404 });
    incident.deleted_at = new Date().toISOString();
    incident.deleted_by = deletedBy;
    incident.delete_reason = reason;
    incident.updated_at = new Date().toISOString();
    await writeJson(rows);
    return { incident_ref: incident.incident_ref };
  }
  const r = await pool.query('UPDATE incidents SET deleted_at=NOW(),deleted_by=$1,delete_reason=$2,updated_at=NOW() WHERE id=$3 AND deleted_at IS NULL RETURNING incident_ref', [deletedBy, reason, id]);
  if (!r.rowCount) throw Object.assign(new Error('Incident not found or already archived.'), { status: 404 });
  return r.rows[0];
}

async function restoreIncident(id) {
  if (!usePostgres) {
    const rows = await readJson();
    const incident = rows.find(x => x.id === id && x.deleted_at);
    if (!incident) throw Object.assign(new Error('Archived incident not found.'), { status: 404 });
    incident.deleted_at = null;
    incident.deleted_by = '';
    incident.delete_reason = '';
    incident.updated_at = new Date().toISOString();
    await writeJson(rows);
    return { incident_ref: incident.incident_ref };
  }
  const r = await pool.query("UPDATE incidents SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_at=NOW() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING incident_ref", [id]);
  if (!r.rowCount) throw Object.assign(new Error('Archived incident not found.'), { status: 404 });
  return r.rows[0];
}

function csvEscape(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

app.get('/api/config', (req, res) => res.json({
  protected: Boolean(ACCESS_CODE),
  sensitive_protected: Boolean(SENSITIVE_ACCESS_CODE),
  admin_enabled: Boolean(ADMIN_CODE),
  storage: usePostgres ? 'postgresql' : 'local-json'
}));

app.get('/api/health', async (req, res) => {
  try { if (usePostgres) await pool.query('SELECT 1'); res.json({ ok: true, storage: usePostgres ? 'postgresql' : 'local-json' }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

app.post('/api/admin/login', requireAccess, (req, res) => {
  if (!ADMIN_CODE) return res.status(404).json({ error: 'Admin mode is not configured.' });
  if (!adminLoginAllowed(req)) return res.status(429).json({ error: 'Too many incorrect attempts. Try again later.' });
  if (!safeEqual(clean(req.body?.code, 200), ADMIN_CODE)) {
    recordAdminFailure(req);
    return res.status(403).json({ error: 'Incorrect admin code.' });
  }
  clearAdminFailures(req);
  res.json({ ok: true, token: makeAdminToken(), expires_in_hours: 8 });
});

app.get('/api/admin/status', requireAccess, (req, res) => res.json({ admin: isAdmin(req) }));

app.get('/api/incidents', requireAccess, async (req, res) => {
  try { res.json({ incidents: await listIncidents(req.query, canSeeSensitive(req)) }); }
  catch (e) { res.status(500).json({ error: 'Could not load incidents.', detail: e.message }); }
});

app.post('/api/incidents', requireAccess, async (req, res) => {
  try { res.status(201).json({ incident: await saveIncident(validateIncident(req.body || {})) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Could not save incident.' }); }
});

app.delete('/api/incidents/:id', requireAccess, requireAdmin, async (req, res) => {
  try { res.json({ archived: await archiveIncident(req.params.id, req.body || {}) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Could not archive incident.' }); }
});

app.get('/api/admin/deleted', requireAccess, requireAdmin, async (req, res) => {
  try { res.json({ incidents: await listIncidents(req.query, false, { includeDeleted: true, onlyDeleted: true }) }); }
  catch (e) { res.status(500).json({ error: 'Could not load archived incidents.', detail: e.message }); }
});

app.post('/api/admin/incidents/:id/restore', requireAccess, requireAdmin, async (req, res) => {
  try { res.json({ restored: await restoreIncident(req.params.id) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Could not restore incident.' }); }
});

app.get('/api/incidents/:id/actions', requireAccess, async (req, res) => {
  try { res.json({ actions: await getActions(req.params.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/incidents/:id/actions', requireAccess, async (req, res) => {
  try { res.status(201).json({ action: await addAction(req.params.id, req.body || {}) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/export.csv', requireAccess, async (req, res) => {
  try {
    const rows = await listIncidents(req.query, false);
    const cols = ['incident_ref','occurred_at','time_precision','reported_at','reporter_name','reporter_org','source_type','category','subcategory','severity','description','site','location_description','latitude','longitude','accuracy_m','location_precision','people_at_risk','environmental_damage','habitat_affected','infrastructure_damage','designated_site_impact','vehicle_involved','police_ref','partner_ref','lead_org','assigned_to','status','follow_up_required','follow_up_date','linked_incident_ref','tags','created_at','updated_at'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="durham-coast-asb-incidents.csv"');
    res.send([cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export.geojson', requireAccess, async (req, res) => {
  try {
    const rows = await listIncidents(req.query, false);
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="durham-coast-asb-incidents.geojson"');
    res.json({ type: 'FeatureCollection', features: rows.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude)] },
      properties: Object.fromEntries(Object.entries(r).filter(([k]) => !['latitude','longitude','evidence_json','sensitive','deleted_at','deleted_by','delete_reason'].includes(k)))
    })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initStorage()
  .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`Durham Coast ASB Recorder listening on ${PORT}; storage=${usePostgres ? 'PostgreSQL' : 'local JSON'}`)))
  .catch(err => { console.error('Storage initialisation failed:', err); process.exit(1); });

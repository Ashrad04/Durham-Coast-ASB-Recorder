const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const SENSITIVE_ACCESS_CODE = process.env.SENSITIVE_ACCESS_CODE || '';
const usePostgres = Boolean(process.env.DATABASE_URL);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'incidents.json');

const pool = usePostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
}) : null;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireAccess(req, res, next) {
  if (!ACCESS_CODE) return next();
  if (safeEqual(req.get('x-access-code'), ACCESS_CODE)) return next();
  res.status(401).json({ error: 'Access code required or incorrect.' });
}

function sensitiveAllowed(req) {
  if (!SENSITIVE_ACCESS_CODE) return false;
  return safeEqual(req.get('x-sensitive-code'), SENSITIVE_ACCESS_CODE);
}

function clean(value, max = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function num(value) {
  if (value === '' || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map(item => ({
    name: clean(item?.name, 200),
    type: clean(item?.type, 100),
    data: clean(item?.data, 4_500_000)
  })).filter(item => item.data.startsWith('data:image/'));
}

function validateIncident(body) {
  const latitude = num(body.latitude);
  const longitude = num(body.longitude);
  const occurredAt = new Date(body.occurred_at || Date.now());
  const category = clean(body.category, 120);
  const description = clean(body.description, 8000);
  const reporterName = clean(body.reporter_name, 200);
  const reporterOrg = clean(body.reporter_org, 200);

  if (!reporterName || !reporterOrg) throw Object.assign(new Error('Recorder name and organisation are required.'), { status: 400 });
  if (!category) throw Object.assign(new Error('Incident category is required.'), { status: 400 });
  if (!description) throw Object.assign(new Error('A brief incident description is required.'), { status: 400 });
  if (Number.isNaN(occurredAt.getTime())) throw Object.assign(new Error('Incident date/time is invalid.'), { status: 400 });
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw Object.assign(new Error('A valid incident location is required.'), { status: 400 });
  }

  return {
    occurred_at: occurredAt.toISOString(),
    time_precision: clean(body.time_precision, 40) || 'Exact',
    reported_at: new Date().toISOString(),
    reporter_name: reporterName,
    reporter_org: reporterOrg,
    source_type: clean(body.source_type, 100) || 'Staff / partner observation',
    category,
    subcategory: clean(body.subcategory, 150),
    severity: clean(body.severity, 40) || 'Medium',
    description,
    site: clean(body.site, 250),
    location_description: clean(body.location_description, 1000),
    latitude,
    longitude,
    accuracy_m: num(body.accuracy_m),
    location_precision: clean(body.location_precision, 50) || 'Exact point',
    people_at_risk: bool(body.people_at_risk),
    environmental_damage: bool(body.environmental_damage),
    habitat_affected: clean(body.habitat_affected, 1000),
    infrastructure_damage: bool(body.infrastructure_damage),
    designated_site_impact: bool(body.designated_site_impact),
    vehicle_involved: bool(body.vehicle_involved),
    evidence_json: normaliseEvidence(body.evidence_json),
    police_ref: clean(body.police_ref, 150),
    partner_ref: clean(body.partner_ref, 300),
    lead_org: clean(body.lead_org, 200),
    assigned_to: clean(body.assigned_to, 200),
    status: clean(body.status, 60) || 'New',
    follow_up_required: bool(body.follow_up_required),
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id UUID PRIMARY KEY,
      incident_ref TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      occurred_at TIMESTAMPTZ NOT NULL,
      time_precision TEXT,
      reported_at TIMESTAMPTZ NOT NULL,
      reporter_name TEXT NOT NULL,
      reporter_org TEXT NOT NULL,
      source_type TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      severity TEXT,
      description TEXT NOT NULL,
      site TEXT,
      location_description TEXT,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      accuracy_m DOUBLE PRECISION,
      location_precision TEXT,
      people_at_risk BOOLEAN DEFAULT FALSE,
      environmental_damage BOOLEAN DEFAULT FALSE,
      habitat_affected TEXT,
      infrastructure_damage BOOLEAN DEFAULT FALSE,
      designated_site_impact BOOLEAN DEFAULT FALSE,
      vehicle_involved BOOLEAN DEFAULT FALSE,
      evidence_json JSONB DEFAULT '[]'::jsonb,
      police_ref TEXT,
      partner_ref TEXT,
      lead_org TEXT,
      assigned_to TEXT,
      status TEXT DEFAULT 'New',
      follow_up_required BOOLEAN DEFAULT FALSE,
      follow_up_date DATE,
      linked_incident_ref TEXT,
      tags TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incident_sensitive (
      incident_id UUID PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
      vehicle_registration TEXT,
      vehicle_description TEXT,
      identifiable_person_details TEXT,
      sensitive_notes TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incident_actions (
      id UUID PRIMARY KEY,
      incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      action_at TIMESTAMPTZ NOT NULL,
      action_by TEXT NOT NULL,
      organisation TEXT NOT NULL,
      action_type TEXT,
      note TEXT NOT NULL,
      status_after TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_occurred ON incidents(occurred_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents(latitude, longitude)');
}

async function readJson() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); } catch { return []; }
}
async function writeJson(data) { await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8'); }

async function nextReference() {
  const year = new Date().getFullYear();
  if (usePostgres) {
    const r = await pool.query("SELECT nextval('asb_incident_seq') AS n");
    return `DCA-${year}-${String(r.rows[0].n).padStart(5, '0')}`;
  }
  const records = await readJson();
  const n = records.reduce((m, r) => Math.max(m, Number((r.incident_ref || '').split('-').pop()) || 0), 0) + 1;
  return `DCA-${year}-${String(n).padStart(5, '0')}`;
}

function stripSensitive(record, includeSensitive) {
  const copy = { ...record };
  if (!includeSensitive) delete copy.sensitive;
  return copy;
}

async function listIncidents(filters, includeSensitive) {
  if (!usePostgres) {
    let rows = await readJson();
    const q = clean(filters.q, 200).toLowerCase();
    if (q) rows = rows.filter(r => `${r.incident_ref} ${r.category} ${r.subcategory} ${r.site} ${r.description} ${r.reporter_org}`.toLowerCase().includes(q));
    if (filters.status) rows = rows.filter(r => r.status === filters.status);
    if (filters.category) rows = rows.filter(r => r.category === filters.category);
    if (filters.org) rows = rows.filter(r => r.reporter_org === filters.org || r.lead_org === filters.org);
    if (filters.from) rows = rows.filter(r => new Date(r.occurred_at) >= new Date(filters.from));
    if (filters.to) rows = rows.filter(r => new Date(r.occurred_at) < new Date(`${filters.to}T23:59:59.999Z`));
    return rows.sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at)).map(r => stripSensitive(r, includeSensitive));
  }

  const clauses = [];
  const values = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  if (filters.q) add('(i.incident_ref ILIKE ? OR i.category ILIKE ? OR i.subcategory ILIKE ? OR i.site ILIKE ? OR i.description ILIKE ? OR i.reporter_org ILIKE ?)', `%${filters.q}%`);
  if (filters.q) {
    const p = values.length;
    values.push(...Array(5).fill(values[p-1]));
    clauses[clauses.length - 1] = clauses[clauses.length - 1]
      .replace(`$${p} OR i.category ILIKE $${p}`, `$${p} OR i.category ILIKE $${p+1}`)
      .replace(`i.subcategory ILIKE $${p}`, `i.subcategory ILIKE $${p+2}`)
      .replace(`i.site ILIKE $${p}`, `i.site ILIKE $${p+3}`)
      .replace(`i.description ILIKE $${p}`, `i.description ILIKE $${p+4}`)
      .replace(`i.reporter_org ILIKE $${p}`, `i.reporter_org ILIKE $${p+5}`);
  }
  if (filters.status) add('i.status = ?', filters.status);
  if (filters.category) add('i.category = ?', filters.category);
  if (filters.org) {
    values.push(filters.org);
    clauses.push(`(i.reporter_org = $${values.length} OR i.lead_org = $${values.length})`);
  }
  if (filters.from) add('i.occurred_at >= ?::date', filters.from);
  if (filters.to) add("i.occurred_at < (?::date + INTERVAL '1 day')", filters.to);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sensitiveJoin = includeSensitive ? 'LEFT JOIN incident_sensitive s ON s.incident_id=i.id' : '';
  const sensitiveSelect = includeSensitive ? ", json_build_object('vehicle_registration',s.vehicle_registration,'vehicle_description',s.vehicle_description,'identifiable_person_details',s.identifiable_person_details,'sensitive_notes',s.sensitive_notes) AS sensitive" : '';
  const r = await pool.query(`SELECT i.* ${sensitiveSelect} FROM incidents i ${sensitiveJoin} ${where} ORDER BY i.occurred_at DESC LIMIT 10000`, values);
  return r.rows;
}

async function saveIncident(data) {
  const id = crypto.randomUUID();
  const incidentRef = await nextReference();
  const createdAt = new Date().toISOString();
  if (!usePostgres) {
    const rows = await readJson();
    const record = { id, incident_ref: incidentRef, created_at: createdAt, updated_at: createdAt, actions: [], ...data };
    rows.push(record);
    await writeJson(rows);
    return stripSensitive(record, false);
  }

  const d = data;
  const r = await pool.query(`INSERT INTO incidents (
    id,incident_ref,created_at,updated_at,occurred_at,time_precision,reported_at,reporter_name,reporter_org,source_type,category,subcategory,severity,description,site,location_description,latitude,longitude,accuracy_m,location_precision,people_at_risk,environmental_damage,habitat_affected,infrastructure_damage,designated_site_impact,vehicle_involved,evidence_json,police_ref,partner_ref,lead_org,assigned_to,status,follow_up_required,follow_up_date,linked_incident_ref,tags
  ) VALUES (
    $1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28,$29,$30,$31,$32,$33,$34,$35
  ) RETURNING *`, [
    id,incidentRef,createdAt,d.occurred_at,d.time_precision,d.reported_at,d.reporter_name,d.reporter_org,d.source_type,d.category,d.subcategory,d.severity,d.description,d.site,d.location_description,d.latitude,d.longitude,d.accuracy_m,d.location_precision,d.people_at_risk,d.environmental_damage,d.habitat_affected,d.infrastructure_damage,d.designated_site_impact,d.vehicle_involved,JSON.stringify(d.evidence_json),d.police_ref,d.partner_ref,d.lead_org,d.assigned_to,d.status,d.follow_up_required,d.follow_up_date,d.linked_incident_ref,d.tags
  ]);
  const s = d.sensitive;
  if (s.vehicle_registration || s.vehicle_description || s.identifiable_person_details || s.sensitive_notes) {
    await pool.query('INSERT INTO incident_sensitive (incident_id,vehicle_registration,vehicle_description,identifiable_person_details,sensitive_notes) VALUES ($1,$2,$3,$4,$5)', [id,s.vehicle_registration,s.vehicle_description,s.identifiable_person_details,s.sensitive_notes]);
  }
  return r.rows[0];
}

async function addAction(incidentId, body) {
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
    const incident = rows.find(r => r.id === incidentId);
    if (!incident) throw Object.assign(new Error('Incident not found.'), { status: 404 });
    incident.actions = incident.actions || [];
    incident.actions.push(action);
    if (action.status_after) incident.status = action.status_after;
    incident.updated_at = new Date().toISOString();
    await writeJson(rows);
    return action;
  }
  await pool.query('INSERT INTO incident_actions (id,incident_id,action_at,action_by,organisation,action_type,note,status_after) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [action.id,incidentId,action.action_at,action.action_by,action.organisation,action.action_type,action.note,action.status_after]);
  if (action.status_after) await pool.query('UPDATE incidents SET status=$1, updated_at=NOW() WHERE id=$2', [action.status_after,incidentId]);
  else await pool.query('UPDATE incidents SET updated_at=NOW() WHERE id=$1', [incidentId]);
  return action;
}

async function getActions(incidentId) {
  if (!usePostgres) {
    const rows = await readJson();
    return (rows.find(r => r.id === incidentId)?.actions || []).sort((a,b) => new Date(b.action_at)-new Date(a.action_at));
  }
  const r = await pool.query('SELECT * FROM incident_actions WHERE incident_id=$1 ORDER BY action_at DESC', [incidentId]);
  return r.rows;
}

app.get('/api/config', (req,res) => res.json({ protected: Boolean(ACCESS_CODE), sensitive_protected: Boolean(SENSITIVE_ACCESS_CODE), storage: usePostgres ? 'postgresql' : 'local-json' }));
app.get('/api/health', async (req,res) => {
  try { if (usePostgres) await pool.query('SELECT 1'); res.json({ ok:true, storage: usePostgres ? 'postgresql' : 'local-json' }); }
  catch (e) { res.status(503).json({ ok:false, error:e.message }); }
});

app.get('/api/incidents', requireAccess, async (req,res) => {
  try { res.json({ incidents: await listIncidents(req.query, sensitiveAllowed(req)) }); }
  catch (e) { res.status(500).json({ error:'Could not load incidents.', detail:e.message }); }
});

app.post('/api/incidents', requireAccess, async (req,res) => {
  try { res.status(201).json({ incident: await saveIncident(validateIncident(req.body || {})) }); }
  catch (e) { res.status(e.status || 500).json({ error:e.message || 'Could not save incident.' }); }
});

app.get('/api/incidents/:id/actions', requireAccess, async (req,res) => {
  try { res.json({ actions: await getActions(req.params.id) }); }
  catch (e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/incidents/:id/actions', requireAccess, async (req,res) => {
  try { res.status(201).json({ action: await addAction(req.params.id, req.body || {}) }); }
  catch (e) { res.status(e.status || 500).json({ error:e.message }); }
});

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

app.get('/api/export.csv', requireAccess, async (req,res) => {
  try {
    const rows = await listIncidents(req.query, false);
    const cols = ['incident_ref','occurred_at','time_precision','reported_at','reporter_name','reporter_org','source_type','category','subcategory','severity','description','site','location_description','latitude','longitude','accuracy_m','location_precision','people_at_risk','environmental_damage','habitat_affected','infrastructure_damage','designated_site_impact','vehicle_involved','police_ref','partner_ref','lead_org','assigned_to','status','follow_up_required','follow_up_date','linked_incident_ref','tags','created_at','updated_at'];
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="durham-coast-asb-incidents.csv"');
    res.send([cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/export.geojson', requireAccess, async (req,res) => {
  try {
    const rows = await listIncidents(req.query, false);
    res.setHeader('Content-Type','application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="durham-coast-asb-incidents.geojson"');
    res.json({ type:'FeatureCollection', features:rows.map(r => ({ type:'Feature', geometry:{ type:'Point', coordinates:[Number(r.longitude),Number(r.latitude)] }, properties:Object.fromEntries(Object.entries(r).filter(([k]) => !['latitude','longitude','evidence_json','sensitive'].includes(k))) })) });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

initStorage().then(() => app.listen(PORT,'0.0.0.0',() => console.log(`Durham Coast ASB Recorder listening on ${PORT}; storage=${usePostgres ? 'PostgreSQL':'local JSON'}`))).catch(err => { console.error(err); process.exit(1); });

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const PUBLIC_PORT = Number(process.env.PORT || 3000);
const INNER_PROXY_PORT = Number(process.env.INNER_PROXY_PORT || 3002);
const INTERNAL_APP_PORT = Number(process.env.INTERNAL_APP_PORT || 3001);
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const AUDIT_SALT = process.env.AUDIT_SALT || process.env.PUBLIC_MAP_SALT || ADMIN_CODE || 'durham-coast-audit';
const ADMIN_IDLE_MINUTES = Math.max(5, Number(process.env.ADMIN_IDLE_MINUTES || 30) || 30);
const RETENTION_REVIEW_DAYS = Math.max(0, Math.floor(Number(process.env.RETENTION_REVIEW_DAYS || 0) || 0));
const PG_SSL = process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: PG_SSL }) : null;

const adminActivity = new Map();
const submissionAttempts = new Map();

function clean(v, max = 500) {
  return v == null ? '' : String(v).trim().slice(0, max);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function securityHeaders(extra = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(self), camera=(self), microphone=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'content-security-policy': "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https://unpkg.com https://*.tile.openstreetmap.org; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';",
    ...extra
  };
}

function rawAdminToken(req) {
  return clean(req.headers['x-admin-token'], 500);
}

function tokenHash(token) {
  return crypto.createHmac('sha256', AUDIT_SALT).update(String(token || '')).digest('hex');
}

function validAdminToken(token) {
  if (!ADMIN_CODE || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiryText, nonce, suppliedSig] = parts;
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !nonce) return false;
  const payload = `${expiryText}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', ADMIN_CODE).update(payload).digest('hex');
  return safeEqual(suppliedSig, expectedSig);
}

function isAdmin(req, touch = true) {
  const token = rawAdminToken(req);
  if (!validAdminToken(token)) return false;
  const key = tokenHash(token);
  const now = Date.now();
  const lastSeen = adminActivity.get(key);
  if (lastSeen && now - lastSeen > ADMIN_IDLE_MINUTES * 60 * 1000) {
    adminActivity.delete(key);
    return false;
  }
  if (touch) adminActivity.set(key, now);
  return true;
}

function clientIp(req) {
  return clean((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0], 120);
}

function ipHash(req) {
  return crypto.createHmac('sha256', AUDIT_SALT).update(clientIp(req)).digest('hex').slice(0, 24);
}

function actor(req) {
  return {
    name: clean(req.headers['x-user-name'], 200) || 'Unspecified user',
    org: clean(req.headers['x-user-org'], 200) || 'Unspecified organisation'
  };
}

async function audit(req, eventType, incidentRef = '', metadata = {}) {
  if (!pool) return;
  const a = actor(req);
  try {
    await pool.query(
      `INSERT INTO app_audit (event_type,actor_name,actor_org,incident_ref,metadata,ip_hash)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [clean(eventType, 80), a.name, a.org, clean(incidentRef, 80) || null, JSON.stringify(metadata || {}), ipHash(req)]
    );
  } catch (e) {
    console.error('Audit write failed:', e.message);
  }
}

async function initComplianceStorage(attempt = 0) {
  if (!pool) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS app_audit (
      id BIGSERIAL PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_type TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_org TEXT NOT NULL,
      incident_ref TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_hash TEXT
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_app_audit_time ON app_audit(occurred_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_app_audit_incident ON app_audit(incident_ref)');
    await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS retention_review_at DATE');
    await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS retention_hold BOOLEAN NOT NULL DEFAULT FALSE');
    if (RETENTION_REVIEW_DAYS > 0) {
      await pool.query(`ALTER TABLE incidents ALTER COLUMN retention_review_at SET DEFAULT (CURRENT_DATE + ${RETENTION_REVIEW_DAYS})`);
      await pool.query(`UPDATE incidents SET retention_review_at=(created_at::date + ${RETENTION_REVIEW_DAYS}) WHERE retention_review_at IS NULL`);
    }
    console.log(`Compliance layer ready; admin idle=${ADMIN_IDLE_MINUTES}m; retention=${RETENTION_REVIEW_DAYS || 'policy-not-configured'}`);
  } catch (e) {
    if (attempt < 12) return setTimeout(() => initComplianceStorage(attempt + 1), 1000);
    console.error('Compliance storage initialisation failed:', e.message);
  }
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, securityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store'
  }));
  res.end(body);
}

function innerOptions(req) {
  const headers = { ...req.headers, host: `127.0.0.1:${INNER_PROXY_PORT}` };
  delete headers['content-length'];
  return { hostname: '127.0.0.1', port: INNER_PROXY_PORT, path: req.url, method: req.method, headers };
}

function collectInner(req, callback) {
  const upstream = http.request(innerOptions(req), upstreamRes => {
    const chunks = [];
    upstreamRes.on('data', chunk => chunks.push(chunk));
    upstreamRes.on('end', () => callback(null, upstreamRes, Buffer.concat(chunks)));
  });
  upstream.on('error', err => callback(err));
  req.pipe(upstream);
}

function proxyRaw(req, res) {
  const upstream = http.request(innerOptions(req), upstreamRes => {
    const contentType = String(upstreamRes.headers['content-type'] || '');
    const requestPath = new URL(req.url, 'http://localhost').pathname;
    if (contentType.includes('text/html')) {
      const chunks = [];
      upstreamRes.on('data', chunk => chunks.push(chunk));
      upstreamRes.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        if ((requestPath === '/' || requestPath === '/index.html') && !html.includes('/compliance-ui.js')) {
          html = html.replace('</body>', '  <script src="/compliance-ui.js"></script>\n</body>');
        }
        const body = Buffer.from(html);
        const headers = securityHeaders({ ...upstreamRes.headers, 'content-length': body.length, 'cache-control': 'no-store' });
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        res.writeHead(upstreamRes.statusCode || 200, headers);
        res.end(body);
      });
      return;
    }
    res.writeHead(upstreamRes.statusCode || 200, securityHeaders(upstreamRes.headers));
    upstreamRes.pipe(res);
  });
  upstream.on('error', () => sendJson(res, 502, { error: 'Application service unavailable.' }));
  req.pipe(upstream);
}

function readJsonBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) return reject(Object.assign(new Error('Request too large.'), { status: 413 }));
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function submissionAllowed(req) {
  const key = ipHash(req);
  const now = Date.now();
  const state = submissionAttempts.get(key);
  if (!state || now - state.started > 60 * 60 * 1000) {
    submissionAttempts.set(key, { started: now, count: 1 });
    return true;
  }
  state.count += 1;
  return state.count <= 30;
}

function handleAdminLogin(req, res) {
  collectInner(req, (err, upstreamRes, body) => {
    if (err) return sendJson(res, 502, { error: 'Application service unavailable.' });
    const status = upstreamRes.statusCode || 500;
    try {
      const data = JSON.parse(body.toString('utf8'));
      if (status >= 200 && status < 300 && data.token) {
        adminActivity.set(tokenHash(data.token), Date.now());
        audit(req, 'admin_login_success', '', { idle_timeout_minutes: ADMIN_IDLE_MINUTES });
      } else audit(req, 'admin_login_failed', '', { status });
    } catch {
      audit(req, status >= 200 && status < 300 ? 'admin_login_success' : 'admin_login_failed', '', { status });
    }
    res.writeHead(status, securityHeaders({ 'content-type': upstreamRes.headers['content-type'] || 'application/json', 'cache-control': 'no-store' }));
    res.end(body);
  });
}

async function handleAuditEvent(req, res) {
  try {
    const body = await readJsonBody(req);
    if (clean(body.event, 80) !== 'view_incident') return sendJson(res, 400, { error: 'Unsupported audit event.' });
    await audit(req, 'view_incident', clean(body.incident_ref, 80));
    return sendJson(res, 201, { ok: true });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e.message || 'Could not record audit event.' });
  }
}

async function handleAuditList(req, res, url) {
  if (!pool) return sendJson(res, 503, { error: 'Audit storage unavailable.' });
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  try {
    const r = await pool.query(`SELECT id,occurred_at,event_type,actor_name,actor_org,incident_ref,metadata FROM app_audit ORDER BY occurred_at DESC LIMIT $1`, [limit]);
    await audit(req, 'view_audit_log', '', { limit });
    return sendJson(res, 200, { events: r.rows });
  } catch {
    return sendJson(res, 500, { error: 'Could not load audit log.' });
  }
}

async function handleRetentionList(req, res) {
  if (!pool) return sendJson(res, 503, { error: 'Retention controls unavailable.' });
  try {
    const r = await pool.query(`SELECT id,incident_ref,category,status,created_at,retention_review_at,retention_hold FROM incidents WHERE deleted_at IS NULL ORDER BY retention_review_at NULLS LAST,created_at`);
    const today = new Date().toISOString().slice(0, 10);
    const due = r.rows.filter(x => x.retention_review_at && String(x.retention_review_at).slice(0, 10) <= today && !x.retention_hold).length;
    await audit(req, 'view_retention_review');
    return sendJson(res, 200, { policy_configured: RETENTION_REVIEW_DAYS > 0, default_review_days: RETENTION_REVIEW_DAYS || null, due_count: due, incidents: r.rows });
  } catch {
    return sendJson(res, 500, { error: 'Could not load retention review.' });
  }
}

async function handleRetentionUpdate(req, res, id) {
  if (!pool) return sendJson(res, 503, { error: 'Retention controls unavailable.' });
  try {
    const body = await readJsonBody(req);
    const reviewAt = clean(body.review_at, 20);
    if (reviewAt && !/^\d{4}-\d{2}-\d{2}$/.test(reviewAt)) return sendJson(res, 400, { error: 'Review date must be YYYY-MM-DD.' });
    const hold = body.hold === true;
    const r = await pool.query(`UPDATE incidents SET retention_review_at=$1::date,retention_hold=$2 WHERE id=$3 RETURNING incident_ref,retention_review_at,retention_hold`, [reviewAt || null, hold, id]);
    if (!r.rowCount) return sendJson(res, 404, { error: 'Incident not found.' });
    await audit(req, 'retention_updated', r.rows[0].incident_ref, { review_at: reviewAt || null, hold });
    return sendJson(res, 200, { incident: r.rows[0] });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e.message || 'Could not update retention review.' });
  }
}

const child = spawn(process.execPath, ['secure-proxy.js'], {
  env: { ...process.env, PORT: String(INNER_PROXY_PORT), INTERNAL_APP_PORT: String(INTERNAL_APP_PORT) },
  stdio: 'inherit'
});
child.on('exit', (code, signal) => {
  console.error(`Inner security proxy exited (code=${code}, signal=${signal || 'none'}).`);
  process.exit(code || 1);
});

setTimeout(() => initComplianceStorage(), 800);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const tokenPresented = Boolean(rawAdminToken(req));

  if (path === '/api/admin/login' && req.method === 'POST') return handleAdminLogin(req, res);
  if (path === '/api/admin/status' && req.method === 'GET') return sendJson(res, 200, { admin: isAdmin(req), idle_timeout_minutes: ADMIN_IDLE_MINUTES });

  const admin = isAdmin(req);

  if (path === '/api/admin/logout' && req.method === 'POST') {
    const token = rawAdminToken(req);
    if (token) adminActivity.delete(tokenHash(token));
    audit(req, 'admin_logout');
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/api/compliance-config' && req.method === 'GET') {
    return sendJson(res, 200, { admin_idle_minutes: ADMIN_IDLE_MINUTES, retention_policy_configured: RETENTION_REVIEW_DAYS > 0, default_retention_review_days: RETENTION_REVIEW_DAYS || null });
  }

  if (path === '/api/incidents' && req.method === 'POST' && !submissionAllowed(req)) {
    return sendJson(res, 429, { error: 'Too many incident submissions from this connection. Try again later.' });
  }

  const adminOnly =
    /^\/api\/incidents\/[^/]+\/actions$/.test(path) ||
    (req.method === 'DELETE' && /^\/api\/incidents\/[^/]+$/.test(path)) ||
    path === '/api/admin/deleted' ||
    /^\/api\/admin\/incidents\/[^/]+\/restore$/.test(path) ||
    path === '/api/export.csv' || path === '/api/export.geojson';

  if ((adminOnly || (tokenPresented && path === '/api/incidents' && req.method === 'GET')) && !admin) {
    return sendJson(res, 403, { error: 'Administrator session expired or access denied.' });
  }

  if (path === '/api/admin/audit-event' && req.method === 'POST') {
    if (!admin) return sendJson(res, 403, { error: 'Administrator access required.' });
    return handleAuditEvent(req, res);
  }
  if (path === '/api/admin/audit' && req.method === 'GET') {
    if (!admin) return sendJson(res, 403, { error: 'Administrator access required.' });
    return handleAuditList(req, res, url);
  }
  if (path === '/api/admin/retention' && req.method === 'GET') {
    if (!admin) return sendJson(res, 403, { error: 'Administrator access required.' });
    return handleRetentionList(req, res);
  }
  const retentionMatch = path.match(/^\/api\/admin\/retention\/([^/]+)$/);
  if (retentionMatch && req.method === 'POST') {
    if (!admin) return sendJson(res, 403, { error: 'Administrator access required.' });
    return handleRetentionUpdate(req, res, clean(retentionMatch[1], 80));
  }

  if (admin && path === '/api/incidents' && req.method === 'GET') audit(req, 'list_incidents');
  if (admin && /^\/api\/incidents\/[^/]+\/actions$/.test(path)) audit(req, req.method === 'POST' ? 'add_incident_action' : 'view_incident_actions');
  if (admin && req.method === 'DELETE' && /^\/api\/incidents\/[^/]+$/.test(path)) audit(req, 'archive_incident');
  if (admin && path === '/api/admin/deleted') audit(req, 'view_archived_incidents');
  if (admin && /^\/api\/admin\/incidents\/[^/]+\/restore$/.test(path)) audit(req, 'restore_incident');
  if (admin && path === '/api/export.csv') audit(req, 'export_csv');
  if (admin && path === '/api/export.geojson') audit(req, 'export_geojson');

  proxyRaw(req, res);
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => console.log(`Compliance proxy listening on ${PUBLIC_PORT}; security proxy on ${INNER_PROXY_PORT}`));

for (const sig of ['SIGTERM','SIGINT']) {
  process.on(sig, () => {
    child.kill(sig);
    server.close(() => process.exit(0));
    pool?.end().catch(() => {});
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PUBLIC_PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.INTERNAL_APP_PORT || 3001);
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const W3W_API_KEY = process.env.W3W_API_KEY || '';

function clean(v, max = 500) {
  return v == null ? '' : String(v).trim().slice(0, max);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function isAdmin(req) {
  if (!ADMIN_CODE) return false;
  const token = clean(req.headers['x-admin-token']);
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiryText, nonce, suppliedSig] = parts;
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || !nonce) return false;
  const payload = `${expiryText}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', ADMIN_CODE).update(payload).digest('hex');
  return safeEqual(suppliedSig, expectedSig);
}

function roundCoordinate(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store'
  });
  res.end(body);
}

function upstreamOptions(req) {
  const headers = { ...req.headers, host: `127.0.0.1:${INTERNAL_PORT}` };
  delete headers['content-length'];
  return {
    hostname: '127.0.0.1',
    port: INTERNAL_PORT,
    path: req.url,
    method: req.method,
    headers
  };
}

function collectUpstream(req, callback) {
  const upstream = http.request(upstreamOptions(req), upstreamRes => {
    const chunks = [];
    upstreamRes.on('data', chunk => chunks.push(chunk));
    upstreamRes.on('end', () => callback(null, upstreamRes, Buffer.concat(chunks)));
  });
  upstream.on('error', err => callback(err));
  req.pipe(upstream);
}

function proxyRaw(req, res) {
  const upstream = http.request(upstreamOptions(req), upstreamRes => {
    const contentType = String(upstreamRes.headers['content-type'] || '');
    if (contentType.includes('text/html')) {
      const chunks = [];
      upstreamRes.on('data', chunk => chunks.push(chunk));
      upstreamRes.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        const scripts = [];
        if (!html.includes('/privacy-ui.js')) scripts.push('  <script src="/privacy-ui.js"></script>');
        if (!html.includes('/ux-location.js')) scripts.push('  <script src="/ux-location.js"></script>');
        if (scripts.length) html = html.replace('</body>', `${scripts.join('\n')}\n</body>`);
        const body = Buffer.from(html);
        const headers = { ...upstreamRes.headers, 'content-length': body.length, 'cache-control': 'no-store' };
        delete headers['content-encoding'];
        res.writeHead(upstreamRes.statusCode || 200, headers);
        res.end(body);
      });
      return;
    }
    res.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', () => sendJson(res, 502, { error: 'Application service unavailable.' }));
  req.pipe(upstream);
}

function handlePublicIncidentList(req, res) {
  collectUpstream(req, (err, upstreamRes, body) => {
    if (err) return sendJson(res, 502, { error: 'Application service unavailable.' });
    const status = upstreamRes.statusCode || 500;
    if (status !== 200) {
      res.writeHead(status, { 'content-type': upstreamRes.headers['content-type'] || 'application/json', 'cache-control': 'no-store' });
      return res.end(body);
    }
    try {
      const data = JSON.parse(body.toString('utf8'));
      const rows = Array.isArray(data.incidents) ? data.incidents : [];
      const now = Date.now();
      const summary = {
        total: rows.length,
        open: rows.filter(r => r.status !== 'Closed').length,
        high: rows.filter(r => r.severity === 'High' || r.severity === 'Critical').length,
        last30: rows.filter(r => {
          const t = new Date(r.occurred_at).getTime();
          return Number.isFinite(t) && now - t <= 30 * 86400000;
        }).length
      };
      const incidents = rows.map(r => ({
        category: clean(r.category, 120) || 'Incident',
        site: clean(r.site, 120),
        latitude: roundCoordinate(r.latitude),
        longitude: roundCoordinate(r.longitude)
      })).filter(r => r.latitude != null && r.longitude != null);
      return sendJson(res, 200, { restricted: true, summary, incidents });
    } catch {
      return sendJson(res, 502, { error: 'Could not prepare restricted incident summary.' });
    }
  });
}

function handlePublicIncidentCreate(req, res) {
  collectUpstream(req, (err, upstreamRes, body) => {
    if (err) return sendJson(res, 502, { error: 'Application service unavailable.' });
    const status = upstreamRes.statusCode || 500;
    if (status < 200 || status >= 300) {
      res.writeHead(status, { 'content-type': upstreamRes.headers['content-type'] || 'application/json', 'cache-control': 'no-store' });
      return res.end(body);
    }
    try {
      const data = JSON.parse(body.toString('utf8'));
      return sendJson(res, status, { incident: { incident_ref: clean(data?.incident?.incident_ref, 80) } });
    } catch {
      return sendJson(res, status, { incident: { incident_ref: '' } });
    }
  });
}

async function handleWhat3Words(req, res, url) {
  if (!W3W_API_KEY) return sendJson(res, 503, { error: 'what3words API is not configured.' });
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return sendJson(res, 400, { error: 'Valid latitude and longitude are required.' });
  }

  try {
    const endpoint = new URL('https://api.what3words.com/v3/convert-to-3wa');
    endpoint.searchParams.set('coordinates', `${lat},${lng}`);
    endpoint.searchParams.set('language', 'en');
    const response = await fetch(endpoint, {
      headers: { 'X-Api-Key': W3W_API_KEY },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return sendJson(res, response.status, { error: data?.error?.message || 'what3words lookup failed.' });
    return sendJson(res, 200, {
      words: clean(data.words, 200),
      nearest_place: clean(data.nearestPlace, 200),
      map: clean(data.map, 500)
    });
  } catch {
    return sendJson(res, 502, { error: 'what3words lookup is temporarily unavailable.' });
  }
}

const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(INTERNAL_PORT) },
  stdio: 'inherit'
});
child.on('exit', (code, signal) => {
  console.error(`Internal app exited (code=${code}, signal=${signal || 'none'}).`);
  process.exit(code || 1);
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const admin = isAdmin(req);

  if (path === '/api/location/w3w' && req.method === 'GET') {
    if (!admin) return sendJson(res, 403, { error: 'Administrator access required.' });
    return handleWhat3Words(req, res, url);
  }
  if (path === '/api/incidents' && req.method === 'GET' && !admin) {
    return handlePublicIncidentList(req, res);
  }
  if (path === '/api/incidents' && req.method === 'POST' && !admin) {
    return handlePublicIncidentCreate(req, res);
  }
  if (/^\/api\/incidents\/[^/]+\/actions$/.test(path) && !admin) {
    return sendJson(res, 403, { error: 'Ticket details and updates are restricted to administrators.' });
  }
  if ((path === '/api/export.csv' || path === '/api/export.geojson') && !admin) {
    return sendJson(res, 403, { error: 'Incident exports are restricted to administrators.' });
  }

  proxyRaw(req, res);
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`Secure proxy listening on ${PUBLIC_PORT}; internal app on ${INTERNAL_PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    child.kill(sig);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
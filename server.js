const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const TTL_MS = 30 * 60 * 1000; // links stay active for 30 minutes
const MAX_ROSES = 10000;       // memory guard
const MAX_MESSAGE = 500;
const BG_PRESETS = ['blush', 'midnight', 'sunset', 'lavender', 'mint', 'cream'];
const HEX = /^#[0-9a-f]{6}$/i;
const PUBLIC = path.join(__dirname, 'public');

// ---------- Storage ----------
// Uses Upstash Redis (REST) when its env vars are set, so roses survive restarts and
// host sleep; otherwise falls back to in-memory storage for local development.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(endpoint, body) {
  const res = await fetch(REDIS_URL + endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  return res.json();
}

const redisStore = {
  async isFull() { return false; },
  async save(id, rose) {
    await redis('', ['SET', `rose:${id}`, JSON.stringify(rose), 'PX', TTL_MS]);
  },
  // Returns { rose, remainingMs } or null (Redis removes expired keys itself)
  async load(id) {
    const [get, ttl] = await redis('/pipeline', [['GET', `rose:${id}`], ['PTTL', `rose:${id}`]]);
    if (!get.result || ttl.result <= 0) return null;
    return { rose: JSON.parse(get.result), remainingMs: ttl.result };
  },
};

const roses = new Map(); // id -> { color, bg, message, expiresAt }
const memoryStore = {
  async isFull() { return roses.size >= MAX_ROSES; },
  async save(id, rose) { roses.set(id, { ...rose, expiresAt: Date.now() + TTL_MS }); },
  async load(id) {
    const r = roses.get(id);
    if (!r) return null;
    const remainingMs = r.expiresAt - Date.now();
    if (remainingMs <= 0) { roses.delete(id); return 'expired'; }
    const { expiresAt, ...rose } = r;
    return { rose, remainingMs };
  },
};

const store = REDIS_URL && REDIS_TOKEN ? redisStore : memoryStore;

if (store === memoryStore) {
  // Sweep expired roses every minute
  setInterval(() => {
    const now = Date.now();
    for (const [id, r] of roses) if (r.expiresAt <= now) roses.delete(id);
  }, 60 * 1000).unref();
}

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/rose.js': ['rose.js', 'text/javascript; charset=utf-8'],
};

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendFile(res, file, type) {
  fs.readFile(path.join(PUBLIC, file), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Server error'); }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function createRose(req, res) {
  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { error: 'Invalid request body' });
  }
  const color = String(data.color || '');
  const bg = String(data.bg || '');
  const message = String(data.message || '').trim();

  if (!HEX.test(color)) return sendJSON(res, 400, { error: 'Invalid rose color' });
  if (!HEX.test(bg) && !BG_PRESETS.includes(bg)) return sendJSON(res, 400, { error: 'Invalid background' });
  if (!message) return sendJSON(res, 400, { error: 'Message cannot be empty' });
  if (message.length > MAX_MESSAGE) return sendJSON(res, 400, { error: `Message must be under ${MAX_MESSAGE} characters` });
  try {
    if (await store.isFull()) return sendJSON(res, 503, { error: 'Too many roses right now, try again shortly' });
    const id = crypto.randomBytes(9).toString('base64url');
    await store.save(id, { color, bg, message });
    sendJSON(res, 201, { id, url: `/r/${id}`, remainingMs: TTL_MS });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: 'Could not save your rose, please try again' });
  }
}

async function getRose(res, id) {
  try {
    const found = await store.load(id);
    if (found === 'expired') return sendJSON(res, 410, { error: 'expired' });
    if (!found) return sendJSON(res, 404, { error: 'not_found' });
    const { rose, remainingMs } = found;
    sendJSON(res, 200, { color: rose.color, bg: rose.bg, message: rose.message, remainingMs });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: 'server_error' });
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && pathname === '/api/roses') return createRose(req, res);

  if (req.method === 'GET') {
    const apiMatch = pathname.match(/^\/api\/roses\/([A-Za-z0-9_-]{1,32})$/);
    if (apiMatch) return getRose(res, apiMatch[1]);
    if (/^\/r\/[A-Za-z0-9_-]{1,32}$/.test(pathname)) return sendFile(res, 'view.html', 'text/html; charset=utf-8');
    if (STATIC[pathname]) return sendFile(res, ...STATIC[pathname]);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () =>
  console.log(`🌹 Send a Rose running at http://localhost:${PORT} (storage: ${store === redisStore ? 'Upstash Redis' : 'in-memory'})`)
);

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const DATABASE_KEY = 'deviation_skill_database';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS edit_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      use_count INTEGER NOT NULL DEFAULT 0
    )
  `).run();
}

function editKeyFromRequest(request) {
  const header = request.headers.get('X-Edit-Key') || '';
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  return (header || bearer).trim();
}

function isValidKeyFormat(key) {
  return /^[A-Za-z0-9]{20}$/.test(String(key || '').trim());
}

async function hashKey(key) {
  const bytes = new TextEncoder().encode(String(key || '').trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hasValidEditKey(db, request) {
  const key = editKeyFromRequest(request);
  if (!isValidKeyFormat(key)) return false;
  const keyHash = await hashKey(key);
  const row = await db.prepare('SELECT id FROM edit_keys WHERE key_hash = ?').bind(keyHash).first();
  if (!row) return false;
  await db.prepare(`
    UPDATE edit_keys
    SET last_used_at = CURRENT_TIMESTAMP,
        use_count = use_count + 1
    WHERE id = ?
  `).bind(row.id).run();
  return true;
}

function text(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function normalizeDatabase(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const deviations = Array.isArray(source.deviations) ? source.deviations : [];
  const shops = source.shops && typeof source.shops === 'object' ? source.shops : {};
  const normalizedShops = {};

  for (const shopName of ['cat', 'dino', 'snow', 'wish']) {
    normalizedShops[shopName] = [...new Set((Array.isArray(shops[shopName]) ? shops[shopName] : []).map(skill => text(skill)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  const normalizedDeviations = deviations
    .map(deviation => {
      const item = deviation && typeof deviation === 'object' ? deviation : {};
      const name = text(item.name);
      if (!name) return null;
      return {
        name,
        image: text(item.image, 1000),
        skills: [...new Set((Array.isArray(item.skills) ? item.skills : []).map(skill => text(skill)).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { deviations: normalizedDeviations, shops: normalizedShops };
}

async function readDatabase(db) {
  await ensureSchema(db);
  const row = await db.prepare('SELECT value, updated_at FROM app_state WHERE key = ?').bind(DATABASE_KEY).first();
  if (!row?.value) return { database: null, updated_at: null };
  try {
    return { database: normalizeDatabase(JSON.parse(row.value)), updated_at: row.updated_at };
  } catch {
    return { database: null, updated_at: row.updated_at };
  }
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return jsonResponse({ error: 'D1 binding DB is not configured' }, 500);
  const { database, updated_at } = await readDatabase(db);
  return jsonResponse({ database, updated_at });
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  if (!db) return jsonResponse({ error: 'D1 binding DB is not configured' }, 500);
  await ensureSchema(db);
  if (!(await hasValidEditKey(db, context.request))) {
    return jsonResponse({ error: 'A valid edit key is required to save the database.' }, 401);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const database = normalizeDatabase(payload.database || payload);
  await db.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).bind(DATABASE_KEY, JSON.stringify(database)).run();

  const skillCount = new Set([
    ...Object.values(database.shops).flat(),
    ...database.deviations.flatMap(deviation => deviation.skills)
  ]).size;

  return jsonResponse({ ok: true, deviationCount: database.deviations.length, skillCount });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}

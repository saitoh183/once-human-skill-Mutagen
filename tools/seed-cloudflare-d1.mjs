import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const databaseName = 'oncehuman-skill-mutagen';
const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const source = await readFile(new URL('../data/deviation-database.js', import.meta.url), 'utf8');
const jsonText = source.match(/window\.DEVIATION_SKILL_DATABASE\s*=\s*(\{[\s\S]*\});\s*$/)?.[1];
if (!jsonText) throw new Error('Could not extract DEVIATION_SKILL_DATABASE JSON.');
const database = JSON.parse(jsonText);

const statements = [];
statements.push(`CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
statements.push(`CREATE TABLE IF NOT EXISTS edit_keys (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at TEXT, use_count INTEGER NOT NULL DEFAULT 0);`);
statements.push(`INSERT INTO app_state (key, value, updated_at) VALUES ('deviation_skill_database', ${sqlString(JSON.stringify(database))}, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`);

const editKey = process.env.SKILL_MUTAGEN_EDIT_KEY || '';
if (editKey) {
  if (!/^[A-Za-z0-9]{20}$/.test(editKey)) throw new Error('SKILL_MUTAGEN_EDIT_KEY must be 20 alphanumeric characters.');
  const hash = await sha256(editKey);
  statements.push(`INSERT INTO edit_keys (id, key_hash, label, created_at) VALUES ('default-admin', ${sqlString(hash)}, 'Darkpixx', CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET key_hash = excluded.key_hash, label = excluded.label;`);
}

const sqlPath = join(tmpdir(), `skill-mutagen-seed-${Date.now()}.sql`);
await writeFile(sqlPath, `${statements.join('\n')}\n`, 'utf8');

const args = ['wrangler', 'd1', 'execute', databaseName, mode, '--file', sqlPath];
const result = spawnSync('npx', args, { stdio: 'inherit', shell: false });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Seeded ${database.deviations.length} deviations into ${databaseName} (${mode}).`);

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

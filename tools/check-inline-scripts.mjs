import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const html = await readFile(new URL('../Deviation-Skills.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
for (const [index, script] of scripts.entries()) {
  const path = join(tmpdir(), `skill-mutagen-inline-${index + 1}.js`);
  await writeFile(path, script, 'utf8');
  const result = spawnSync('node', ['--check', path], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Checked ${scripts.length} inline script(s).`);

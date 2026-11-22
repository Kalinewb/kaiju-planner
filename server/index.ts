import { serve } from '@hono/node-server';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { Auth } from './auth.ts';
import { createApp } from './app.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = resolve(process.env.KAIJU_DATA ?? join(root, 'data'));
const dbPath = join(dataDir, 'kaiju.db');
const db = openDb(dbPath);

/** Copies the database to a new file. Never overwrites: an existing name gets a counter. */
export function safetyCopy(): string {
  const dir = join(dataDir, 'pre-import-copies');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let p = join(dir, `kaiju-${stamp}.db`);
  for (let i = 2; existsSync(p); i++) p = join(dir, `kaiju-${stamp}-${i}.db`);
  db.exec(`VACUUM INTO '${p.replace(/'/g, "''")}'`);
  return p;
}

const store = new Store(db);
const auth = new Auth(db, Number(process.env.KAIJU_SESSION_DAYS ?? 14));
const app = createApp({ store, auth, trustedProxies: (process.env.KAIJU_TRUSTED_PROXIES ?? '').split(',').map((x) => x.trim().replace(/^::ffff:/, '')).filter(Boolean), webDir: join(root, 'dist', 'web'), filesDir: join(dataDir, 'files'), safetyCopy });

const port = Number(process.env.PORT ?? 3210);
const host = process.env.HOST ?? '0.0.0.0';
serve({ fetch: app.fetch, port, hostname: host }, () => {
  console.log(`Kaiju Planner listening on http://${host}:${port}`);
  if (!auth.hasPassword()) console.warn('No password is set yet. Run: npm run set-password');
});

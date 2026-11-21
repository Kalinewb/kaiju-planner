// Usage: node server/cli.ts set-password   (prompts)   |   KAIJU_NEW_PASSWORD=... node server/cli.ts set-password
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { openDb } from './db.ts';
import { Auth, MIN_PASSWORD } from './auth.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(join(resolve(process.env.KAIJU_DATA ?? join(root, 'data')), 'kaiju.db'));
const auth = new Auth(db);

if (process.argv[2] === 'set-password') {
  let pw = process.env.KAIJU_NEW_PASSWORD;
  if (!pw) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pw = await rl.question(`New password (at least ${MIN_PASSWORD} characters): `);
    rl.close();
  }
  try { auth.setPassword(pw); console.log('Password saved. All existing logins were signed out.'); }
  catch (e) { console.error((e as Error).message); process.exit(1); }
} else {
  console.log('Commands: set-password');
}

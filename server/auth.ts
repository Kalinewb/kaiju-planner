import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export const MIN_PASSWORD = 12;

export class Auth {
  db: DatabaseSync;
  sessionDays: number;
  constructor(db: DatabaseSync, sessionDays = 14) { this.db = db; this.sessionDays = sessionDays; }

  hasPassword(): boolean { return !!this.db.prepare("SELECT 1 FROM settings WHERE key='password'").get(); }
  setPassword(pw: string) {
    if (pw.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
    this.db.prepare("INSERT INTO settings (key,value) VALUES ('password',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hashPassword(pw));
    this.db.prepare('DELETE FROM sessions').run(); // changing the password logs everyone out
  }
  check(pw: string): boolean {
    const r = this.db.prepare("SELECT value FROM settings WHERE key='password'").get() as { value: string } | undefined;
    if (!r) return false;
    return verifyPassword(pw, r.value);
  }
  private h(token: string) { return createHash('sha256').update(token).digest('hex'); }
  createSession(): { token: string; maxAge: number } {
    const token = randomBytes(32).toString('base64url');
    const maxAge = this.sessionDays * 86400;
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?,?)').run(this.h(token), Date.now() + maxAge * 1000);
    return { token, maxAge };
  }
  validSession(token: string | undefined): boolean {
    if (!token) return false;
    const r = this.db.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(this.h(token)) as { expires_at: number } | undefined;
    return !!r && r.expires_at > Date.now();
  }
  destroy(token: string | undefined) { if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(this.h(token)); }
}

export function isPrivateIp(ip: string): boolean {
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1' || /^127\./.test(ip)) return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip)) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}

/** Slows down password guessing: 5 free tries, then a lockout that doubles up to one hour. */
export class LoginLimiter {
  private m = new Map<string, { fails: number; until: number }>();
  now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  retryAfter(key: string): number {
    const e = this.m.get(key);
    return e && e.until > this.now() ? Math.ceil((e.until - this.now()) / 1000) : 0;
  }
  fail(key: string) {
    const e = this.m.get(key) ?? { fails: 0, until: 0 };
    e.fails++;
    if (e.fails >= 5) e.until = this.now() + Math.min(60, 2 ** (e.fails - 5)) * 60_000;
    this.m.set(key, e);
  }
  ok(key: string) { this.m.delete(key); }
}

/** Access tokens for Claude Code. Only a hash is stored, so a token is shown once and cannot be read back. */
/** drafts: read and add drafts. manager: also change statuses (with a reason) and add comments. Neither can approve, delete or touch settings. */
const TOKEN_SCOPES = ['drafts', 'manager'];

export class ApiTokens {
  db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }
  private h(t: string) { return createHash('sha256').update(t).digest('hex'); }
  create(name: string, scope: string = 'drafts'): { id: string; token: string; scope: string } {
    const n = name.trim().slice(0, 60);
    if (!n) throw new Error('Give the token a name.');
    if (!TOKEN_SCOPES.includes(scope)) throw new Error('Unknown token power level.');
    const token = 'kpt_' + randomBytes(32).toString('base64url');
    const id = randomBytes(8).toString('hex');
    this.db.prepare('INSERT INTO api_tokens (id,name,token_hash,created_at,scope) VALUES (?,?,?,?,?)').run(id, n, this.h(token), new Date().toISOString(), scope);
    return { id, token, scope };
  }
  verify(token: string): { id: string; name: string; scope: string } | null {
    if (!/^kpt_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
    const r = this.db.prepare('SELECT id, name, scope FROM api_tokens WHERE token_hash=?').get(this.h(token)) as { id: string; name: string; scope: string } | undefined;
    if (!r) return null;
    this.db.prepare('UPDATE api_tokens SET last_used=? WHERE id=?').run(new Date().toISOString(), r.id);
    return r;
  }
  list() { return this.db.prepare('SELECT id, name, scope, created_at, last_used FROM api_tokens ORDER BY created_at').all(); }
  revoke(id: string) { this.db.prepare('DELETE FROM api_tokens WHERE id=?').run(id); }
}

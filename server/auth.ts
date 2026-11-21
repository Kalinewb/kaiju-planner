import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
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

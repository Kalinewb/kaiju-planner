import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Auth, LoginLimiter, isPrivateIp, MIN_PASSWORD } from './auth.ts';
import { Store, HttpError } from './store.ts';
import { buildBrief } from '../shared/brief.ts';
import { KINDS } from '../shared/schema.ts';
import { aiStatus, saveAiSettings, chat, chatHistory, clearChat, suggestLinks, acceptProposal } from './ai.ts';
import type { FetchLike } from './ai.ts';

export interface AppOptions {
  store: Store;
  auth: Auth;
  trustProxy?: boolean;        // trust forwarded headers from everyone (tests only)
  trustedProxies?: string[];   // trust forwarded headers only when the connection comes from one of these addresses
  webDir?: string;
  limiter?: LoginLimiter;
  fetchImpl?: FetchLike;        // how the server talks to Claude (replaced in tests)
  safetyCopy?: () => string; // writes a never-overwriting copy of the database, returns its path
}

const COOKIE = 'kaiju_session';

export function createApp(o: AppOptions) {
  const { store, auth } = o;
  const limiter = o.limiter ?? new LoginLimiter();
  const app = new Hono();

  const socketIp = (c: Context): string => {
    try { return (getConnInfo(c).remote.address ?? 'unknown').replace(/^::ffff:/, ''); } catch { return 'unknown'; }
  };
  // Forwarded headers (who really connected, was it HTTPS) are only believed from a proxy you named.
  // Otherwise anyone could type them in and dodge the login limits.
  const trusts = (c: Context) => !!o.trustProxy || (o.trustedProxies ?? []).includes(socketIp(c));
  const clientIp = (c: Context): string => {
    if (trusts(c)) {
      const xff = c.req.header('x-forwarded-for');
      if (xff) return xff.split(',').pop()!.trim(); // last entry = added by our proxy; earlier ones can be forged by the client
    }
    return socketIp(c);
  };
  const isHttps = (c: Context) => (trusts(c) ? c.req.header('x-forwarded-proto')?.split(',')[0].trim() === 'https' : new URL(c.req.url).protocol === 'https:');

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'same-origin');
    c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra as object | undefined) }, err.status as 400);
    console.error(err);
    return c.json({ error: 'Something went wrong on the server.' }, 500);
  });

  // Block cross-site writes
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (origin) {
        const host = (trusts(c) && c.req.header('x-forwarded-host')) || c.req.header('host');
        if (new URL(origin).host !== host) return c.json({ error: 'Blocked: request came from another site.' }, 403);
      }
    }
    await next();
  });

  // ---------- auth ----------
  app.get('/api/auth/status', (c) => c.json({
    passwordSet: auth.hasPassword(),
    loggedIn: auth.validSession(getCookie(c, COOKIE)),
    minPassword: MIN_PASSWORD,
  }));

  app.post('/api/auth/login', async (c) => {
    if (!auth.hasPassword()) return c.json({ error: 'No password has been set yet. Run the set-password command on the server.' }, 503);
    const ip = clientIp(c);
    if (!isHttps(c) && !isPrivateIp(ip))
      return c.json({ error: 'Login is only allowed over HTTPS when you are not on your home network.' }, 403);
    const wait = limiter.retryAfter(ip);
    if (wait) return c.json({ error: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute(s).` }, 429);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.password !== 'string' || !auth.check(body.password)) {
      limiter.fail(ip);
      return c.json({ error: 'Wrong password.' }, 401);
    }
    limiter.ok(ip);
    const { token, maxAge } = auth.createSession();
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', secure: isHttps(c), path: '/', maxAge });
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    auth.destroy(getCookie(c, COOKIE));
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // Everything below needs a login
  app.use('/api/*', async (c, next) => {
    if (!auth.validSession(getCookie(c, COOKIE))) return c.json({ error: 'Please log in.' }, 401);
    await next();
  });

  app.post('/api/auth/change-password', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (typeof b.current !== 'string' || !auth.check(b.current)) return c.json({ error: 'Your current password is wrong.' }, 401);
    if (typeof b.next !== 'string' || b.next.length < MIN_PASSWORD) return c.json({ error: `The new password must be at least ${MIN_PASSWORD} characters.` }, 400);
    auth.setPassword(b.next);
    const { token, maxAge } = auth.createSession();
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', secure: isHttps(c), path: '/', maxAge });
    return c.json({ ok: true });
  });

  // ---------- records ----------
  app.get('/api/kinds', (c) => c.json(KINDS));
  app.get('/api/entities', (c) => c.json(store.list({ project_id: c.req.query('project'), kind: c.req.query('kind'), q: c.req.query('q') })));
  app.post('/api/entities', async (c) => {
    const b = await c.req.json();
    return c.json(store.create({ kind: b.kind, project_id: b.project_id, data: b.data, status: b.status, flags: b.flags }), 201);
  });
  app.get('/api/entities/:id', (c) => {
    const e = store.get(c.req.param('id'));
    return c.json({ entity: e, revisions: store.revisions(e.id), referencedBy: e.kind === 'project' ? [] : store.referencedBy(e.id) });
  });
  app.patch('/api/entities/:id', async (c) => {
    const b = await c.req.json();
    return c.json(store.update(c.req.param('id'), { data: b.data, flags: b.flags }));
  });
  app.post('/api/entities/:id/status', async (c) => {
    const b = await c.req.json();
    return c.json(store.setStatus(c.req.param('id'), b.status, b.confirmed === true));
  });
  app.post('/api/entities/:id/approve', (c) => c.json(store.approve(c.req.param('id'))));
  app.delete('/api/entities/:id', (c) => { store.remove(c.req.param('id'), c.req.query('force') === '1'); return c.json({ ok: true }); });
  app.post('/api/reorder', async (c) => { const b = await c.req.json(); store.reorder(b.ids); return c.json({ ok: true }); });

  app.get('/api/overview', (c) => c.json(store.list({ kind: 'project' }).map((p) => ({ project: p, summary: store.summary(p.id) }))));
  app.get('/api/projects/:id/summary', (c) => c.json(store.summary(c.req.param('id'))));
  app.get('/api/projects/:id/links', (c) => c.json(store.links(c.req.param('id'))));
  app.get('/api/projects/:id/history', (c) => c.json(store.history(c.req.param('id'))));
  app.get('/api/history', (c) => c.json(store.history(null, 50)));

  app.post('/api/links', async (c) => c.json(store.addLink(await c.req.json()), 201));
  app.post('/api/links/:id/confirm', (c) => { store.confirmLink(c.req.param('id')); return c.json({ ok: true }); });
  app.delete('/api/links/:id', (c) => { store.removeLink(c.req.param('id')); return c.json({ ok: true }); });

  app.get('/api/entities/:id/brief', (c) => {
    const target = store.get(c.req.param('id'));
    if (target.kind !== 'feature' && target.kind !== 'task') throw new HttpError(400, 'Briefs are made for features or tasks.');
    const pid = target.project_id!;
    const all = store.list({ project_id: pid });
    return c.json(buildBrief({
      project: store.get(pid), target,
      parts: all.filter((e) => e.kind === 'part'), features: all.filter((e) => e.kind === 'feature'),
      tasks: all.filter((e) => e.kind === 'task'), decisions: all.filter((e) => e.kind === 'decision'), links: store.links(pid),
    }));
  });

  // ---------- export / import ----------
  app.get('/api/export', (c) => {
    const data = store.export(c.req.query('project'));
    c.header('Content-Disposition', `attachment; filename="kaiju-planner-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(data);
  });
  app.post('/api/import', bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
    const file = await c.req.json().catch(() => null);
    const backup = o.safetyCopy ? o.safetyCopy() : null; // always keep what you have before changing anything
    const r = store.import(file);
    return c.json({ ...r, safetyCopy: backup });
  });

  // ---------- optional Claude assistant (suggestions only) ----------
  const doFetch: FetchLike = o.fetchImpl ?? ((url, init) => fetch(url, init));
  app.get('/api/ai/status', (c) => c.json(aiStatus(store.db)));
  app.post('/api/ai/settings', async (c) => c.json(saveAiSettings(store.db, await c.req.json().catch(() => ({})))));
  app.get('/api/ai/chat/:pid', (c) => c.json(chatHistory(store.db, c.req.param('pid'))));
  app.delete('/api/ai/chat/:pid', (c) => { clearChat(store.db, c.req.param('pid')); return c.json({ ok: true }); });
  app.post('/api/ai/chat', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json(await chat(store.db, store, doFetch, b.project_id, b.message)); });
  app.post('/api/ai/suggest-links', async (c) => { const b = await c.req.json().catch(() => ({})); return c.json(await suggestLinks(store.db, store, doFetch, b.project_id)); });
  app.post('/api/ai/accept-feature', async (c) => { const b = await c.req.json(); return c.json(acceptProposal(store, b.project_id, b), 201); });

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  // ---------- web app ----------
  if (o.webDir && existsSync(o.webDir)) {
    const rel = relative(process.cwd(), o.webDir) || '.';
    app.use('/*', serveStatic({ root: rel }));
    const index = readFileSync(join(o.webDir, 'index.html'), 'utf8');
    app.get('*', (c) => c.html(index));
  }
  return app;
}

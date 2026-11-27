import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { Auth, ApiTokens, LoginLimiter, isPrivateIp, MIN_PASSWORD } from './auth.ts';
import { bulkImport } from './bulk.ts';
import { Store, HttpError } from './store.ts';
import { buildBrief } from '../shared/brief.ts';
import { KINDS, ISSUE_OPEN, ISSUE_RETEST, ISSUE_CLOSED, ISSUE_OWNER_ONLY } from '../shared/schema.ts';
import { buildIssueBrief } from '../shared/issue-brief.ts';
import { buildDesignSpec, parseElements } from '../shared/uikit.ts';
import { descendantIds, pathTo } from '../shared/tree.ts';
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
  filesDir?: string;            // where uploaded screenshots are kept
  safetyCopy?: () => string; // writes a never-overwriting copy of the database, returns its path
}

const COOKIE = 'kaiju_session';

export function createApp(o: AppOptions) {
  const { store, auth } = o;
  const limiter = o.limiter ?? new LoginLimiter();
  const tokens = new ApiTokens(store.db);
  const app = new Hono<{ Variables: { principal: 'owner' | 'claude'; scope: string } }>();

  const socketIp = (c: Context<any>): string => {
    try { return (getConnInfo(c).remote.address ?? 'unknown').replace(/^::ffff:/, ''); } catch { return 'unknown'; }
  };
  // Forwarded headers (who really connected, was it HTTPS) are only believed from a proxy you named.
  // Otherwise anyone could type them in and dodge the login limits.
  const trusts = (c: Context<any>) => !!o.trustProxy || (o.trustedProxies ?? []).includes(socketIp(c));
  const clientIp = (c: Context<any>): string => {
    if (trusts(c)) {
      const xff = c.req.header('x-forwarded-for');
      if (xff) return xff.split(',').pop()!.trim(); // last entry = added by our proxy; earlier ones can be forged by the client
    }
    return socketIp(c);
  };
  const isHttps = (c: Context<any>) => (trusts(c) ? c.req.header('x-forwarded-proto')?.split(',')[0].trim() === 'https' : new URL(c.req.url).protocol === 'https:');

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
    const authz = c.req.header('authorization');
    if (authz?.startsWith('Bearer ')) {
      // Access token for Claude Code: can read, add drafts and suggest. A manager token can also set statuses (including
      // Completed), comment, delete records (not projects) and restore them. No token can approve or change settings.
      const ip = clientIp(c);
      if (!isHttps(c) && !isPrivateIp(ip)) return c.json({ error: 'Tokens are only accepted over HTTPS when you are not on your home network.' }, 403);
      const wait = limiter.retryAfter(ip);
      if (wait) return c.json({ error: 'Too many bad attempts. Try again later.' }, 429);
      const tok = tokens.verify(authz.slice(7).trim());
      if (!tok) { limiter.fail(ip); return c.json({ error: 'Invalid or revoked token.' }, 401); }
      const m = c.req.method; const path = c.req.path;
      const allowed = (m === 'GET' && !/^\/api\/(auth|ai|tokens)(\/|$)/.test(path))
        || (m === 'POST' && (path === '/api/entities' || path === '/api/links' || path === '/api/bulk' || path === '/api/files'))
        || (m === 'PATCH' && /^\/api\/entities\/[^/]+$/.test(path))
        || (tok.scope === 'manager' && m === 'POST' && /^\/api\/entities\/[^/]+\/(status|comments)$/.test(path))
        || (tok.scope === 'manager' && m === 'DELETE' && /^\/api\/entities\/[^/]+$/.test(path))
        || (tok.scope === 'manager' && m === 'POST' && /^\/api\/trash\/[^/]+\/restore$/.test(path));
      if (!allowed) return c.json({ error: 'This token cannot do that. Changing statuses, commenting, deleting and restoring need a manager token. Approving and settings can only be done by you in the app.' }, 403);
      c.set('principal', 'claude'); c.set('scope', tok.scope);
      return next();
    }
    if (!auth.validSession(getCookie(c, COOKIE))) return c.json({ error: 'Please log in.' }, 401);
    c.set('principal', 'owner');
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
    if (c.get('principal') === 'claude') {
      if (b.kind === 'brief') throw new HttpError(403, 'Briefs are made and approved by you in the app.');
      const data: Record<string, unknown> = { ...(b.data ?? {}) };
      delete data.original_input;
      if (b.kind === 'feature') { data.origin = 'Imported by Claude Code'; data.original_input = ''; }
      const prov = Object.fromEntries(Object.entries(data).filter(([k, v]) => typeof v === 'string' && v !== '' && k !== 'origin').map(([k]) => [k, 'ai' as const]));
      return c.json(store.create({ kind: b.kind, project_id: b.project_id, data, status: b.kind === 'feature' ? 'Proposed' : undefined, flags: b.flags, prov, actor: 'Claude Code' }), 201);
    }
    return c.json(store.create({ kind: b.kind, project_id: b.project_id, data: b.data, status: b.status, flags: b.flags }), 201);
  });
  app.get('/api/entities/:id', (c) => {
    const e = store.get(c.req.param('id'));
    return c.json({ entity: e, revisions: store.revisions(e.id), referencedBy: e.kind === 'project' ? [] : store.referencedBy(e.id) });
  });
  app.patch('/api/entities/:id', async (c) => {
    const b = await c.req.json();
    if (c.get('principal') === 'claude') {
      const data: Record<string, unknown> = { ...(b.data ?? {}) };
      delete data.original_input; delete data.origin;
      store.assertAiMayEdit(c.req.param('id'), Object.keys(data));
      const prov = Object.fromEntries(Object.keys(data).map((k) => [k, 'ai' as const]));
      return c.json(store.update(c.req.param('id'), { data, flags: b.flags, prov, actor: 'Claude Code' }));
    }
    return c.json(store.update(c.req.param('id'), { data: b.data, flags: b.flags }));
  });
  app.post('/api/entities/:id/status', async (c) => {
    const b = await c.req.json();
    if (c.get('principal') === 'claude') {
      // The owner gave this token the power to change statuses, but every change needs a stated reason.
      const target = store.get(c.req.param('id'));
      if (target.kind === 'issue' && ISSUE_OWNER_ONLY.includes(b.status)) throw new HttpError(403, `Only you can set an issue to "${b.status}". Claude can say "Fixed (needs retest)" and you verify it.`);
      const note = typeof b.note === 'string' ? b.note.trim() : '';
      if (note.length < 3) throw new HttpError(400, 'Say why in "note" (at least 3 characters). Every status change by Claude needs a reason.');
      return c.json(store.setStatus(c.req.param('id'), b.status, true, 'Claude Code', note.slice(0, 1000)));
    }
    return c.json(store.setStatus(c.req.param('id'), b.status, b.confirmed === true));
  });
  app.get('/api/entities/:id/comments', (c) => { store.get(c.req.param('id')); return c.json(store.comments(c.req.param('id'))); });
  app.post('/api/entities/:id/comments', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    return c.json(store.addComment(c.req.param('id'), String(b.body ?? ''), c.get('principal') === 'claude' ? 'Claude Code' : 'You'), 201);
  });
  app.delete('/api/comments/:id', (c) => { store.removeComment(c.req.param('id')); return c.json({ ok: true }); });
  app.get('/api/projects/:id/comment-counts', (c) => c.json(store.commentCounts(c.req.param('id'))));
  app.post('/api/entities/:id/approve', (c) => c.json(store.approve(c.req.param('id'))));
  app.delete('/api/entities/:id', (c) => {
    const id = c.req.param('id');
    if (c.get('principal') === 'claude') {
      // Allowed with a manager token because everything is snapshotted first and can be restored. Whole projects stay owner-only.
      if (store.get(id).kind === 'project') throw new HttpError(403, 'Deleting a whole project is something only you can do.');
      const reason = (c.req.query('reason') ?? '').trim();
      if (reason.length < 3) throw new HttpError(400, 'Say why in "reason" (at least 3 characters). Every deletion by Claude needs a reason.');
      return c.json({ ok: true, trash_id: store.remove(id, true, 'Claude Code', reason.slice(0, 1000)) });
    }
    return c.json({ ok: true, trash_id: store.remove(id, c.req.query('force') === '1', 'You', (c.req.query('reason') ?? '').slice(0, 1000)) });
  });
  app.get('/api/trash', (c) => c.json(store.trash(c.req.query('project'))));
  app.post('/api/trash/:id/restore', (c) => c.json(store.restore(c.req.param('id'), c.get('principal') === 'claude' ? 'Claude Code' : 'You')));
  app.delete('/api/trash/:id', (c) => { store.purgeTrash(c.req.param('id')); return c.json({ ok: true }); });
  app.post('/api/trash/empty', (c) => { store.purgeTrash(); return c.json({ ok: true }); });
  app.post('/api/reorder', async (c) => { const b = await c.req.json(); store.reorder(b.ids); return c.json({ ok: true }); });

  app.get('/api/overview', (c) => c.json(store.list({ kind: 'project' }).map((p) => ({ project: p, summary: store.summary(p.id) }))));
  app.get('/api/projects/:id/summary', (c) => c.json(store.summary(c.req.param('id'))));
  app.get('/api/projects/:id/links', (c) => c.json(store.links(c.req.param('id'))));
  app.get('/api/projects/:id/history', (c) => c.json(store.history(c.req.param('id'))));
  app.get('/api/history', (c) => c.json(store.history(null, 50)));

  app.post('/api/links', async (c) => {
    const b = await c.req.json();
    if (c.get('principal') === 'claude') return c.json(store.addLink({ project_id: b.project_id, from_id: b.from_id, to_id: b.to_id, type: b.type, note: typeof b.note === 'string' ? b.note : '', source: 'ai', confirmed: false, actor: 'Claude Code' }), 201);
    return c.json(store.addLink(b), 201);
  });
  app.post('/api/bulk', bodyLimit({ maxSize: 5 * 1024 * 1024 }), async (c) => {
    const b = await c.req.json().catch(() => null);
    return c.json(bulkImport(store, b, { dry_run: b?.dry_run === true, setStatus: c.get('principal') === 'owner' || c.get('scope') === 'manager' }));
  });
  // ---------- uploaded pictures (screenshots) ----------
  const IMG: { mime: string; ext: string; ok: (b: Uint8Array) => boolean }[] = [
    { mime: 'image/png', ext: 'png', ok: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { mime: 'image/jpeg', ext: 'jpg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/gif', ext: 'gif', ok: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
    { mime: 'image/webp', ext: 'webp', ok: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  ];
  const filesDir = o.filesDir;
  app.post('/api/files', bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
    if (!filesDir) throw new HttpError(503, 'File storage is not set up on this server.');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const kind = IMG.find((k) => k.ok(bytes));
    if (!kind || bytes.length < 16) throw new HttpError(400, 'Only PNG, JPEG, GIF and WEBP pictures are accepted (SVG is not).');
    mkdirSync(filesDir, { recursive: true });
    const id = randomUUID();
    writeFileSync(join(filesDir, id), bytes);
    store.db.prepare('INSERT INTO files (id,mime,size,name,created_at) VALUES (?,?,?,?,?)').run(id, kind.mime, bytes.length, (c.req.header('x-filename') ?? '').slice(0, 200), new Date().toISOString());
    return c.json({ id, url: `/api/files/${id}`, mime: kind.mime, size: bytes.length }, 201);
  });
  app.get('/api/files/:id', (c) => {
    const row = store.db.prepare('SELECT mime FROM files WHERE id = ?').get(c.req.param('id')) as { mime: string } | undefined;
    if (!row || !filesDir || !/^[0-9a-f-]{36}$/.test(c.req.param('id'))) throw new HttpError(404, 'Not found');
    const data = readFileSync(join(filesDir, c.req.param('id')));
    return new Response(data, { headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  });

  // ---------- UI designs ----------
  app.get('/api/entities/:id/design-spec', (c) => {
    const part = store.get(c.req.param('id'));
    if (part.kind !== 'part') throw new HttpError(400, 'Ask for the design of a component.');
    const pages = store.list({ project_id: part.project_id!, kind: 'page' }).filter((p) => p.data.part_id === part.id);
    const spec = buildDesignSpec(part.title, pages.map((p) => ({ name: p.title, elements: parseElements(p.data.elements) })));
    return c.json({ markdown: spec.markdown, gaps: spec.gaps, pages: pages.map((p) => ({ id: p.id, name: p.title })) });
  });

  // ---------- issues (QA) ----------
  const issuesFor = (pid: string, q: Record<string, string | undefined>) => {
    const all = store.list({ project_id: pid });
    const parts = all.filter((e) => e.kind === 'part'); const features = all.filter((e) => e.kind === 'feature');
    const states = q.status === 'open' ? ISSUE_OPEN : q.status === 'retest' ? ISSUE_RETEST : q.status === 'closed' ? ISSUE_CLOSED : null;
    const scope = q.part ? new Set([q.part, ...(q.inside === '1' ? descendantIds(parts, q.part) : [])]) : null;
    const needle = (q.q ?? '').toLowerCase();
    const issues = all.filter((e) => e.kind === 'issue')
      .filter((e) => (!states || states.includes(e.status)) && (!q.severity || (e.data.severity || 'Not set') === q.severity)
        && (!scope || scope.has(e.data.part_id) || (!e.data.part_id && !!e.data.feature_id && scope.has(features.find((f) => f.id === e.data.feature_id)?.data.part_id ?? '')))
        && (!needle || (e.title + ' ' + (e.data.problem ?? '')).toLowerCase().includes(needle)));
    return { issues, parts, features };
  };
  app.get('/api/projects/:id/issues', (c) => {
    const pid = c.req.param('id');
    const { issues, parts } = issuesFor(pid, c.req.query());
    const counts = store.commentCounts(pid);
    return c.json(issues.map((i) => ({ issue: i, where: i.data.part_id ? pathTo(parts, i.data.part_id).map((p) => p.title).join(' > ') : '', comment_count: counts[i.id] ?? 0 })));
  });
  app.get('/api/projects/:id/issues-brief', (c) => {
    const pid = c.req.param('id');
    const { issues, parts, features } = issuesFor(pid, c.req.query());
    return c.json({ count: issues.length, markdown: buildIssueBrief({ issues, parts, features, comments: store.commentsFor(pid), title: c.req.query('title') }) });
  });
  app.get('/api/entities/:id/issue-brief', (c) => {
    const i = store.get(c.req.param('id'));
    if (i.kind !== 'issue') throw new HttpError(400, 'That is not an issue.');
    const pid = i.project_id!;
    const all = store.list({ project_id: pid });
    return c.json({ count: 1, markdown: buildIssueBrief({ issues: [i], parts: all.filter((e) => e.kind === 'part'), features: all.filter((e) => e.kind === 'feature'), comments: store.commentsFor(pid), title: `Issue: ${i.title}` }) });
  });
  app.get('/api/projects/:id/attention', (c) => c.json(store.attention(c.req.param('id'))));
  app.post('/api/projects/:id/approve-many', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (!Array.isArray(b.ids) || b.ids.some((x: unknown) => typeof x !== 'string')) throw new HttpError(400, 'Send a list of ids.');
    if (b.ids.length > 500) throw new HttpError(400, 'Approve at most 500 at a time.');
    return c.json(store.approveMany(c.req.param('id'), b.ids));
  });
  app.get('/api/projects/:id/snapshot', (c) => {
    const id = c.req.param('id');
    const all = store.list({ project_id: id });
    const pick = (k: string) => all.filter((e) => e.kind === k);
    return c.json({ project: store.get(id), parts: pick('part'), features: pick('feature'), tasks: pick('task'), phases: pick('phase'), decisions: pick('decision'), docs: pick('doc'), debt: pick('debt'), issues: pick('issue'), pages: pick('page'), qa: pick('qa'), shots: pick('shot'), links: store.links(id), summary: store.summary(id) });
  });

  // Access tokens (owner only)
  app.get('/api/tokens', (c) => c.json(tokens.list()));
  app.post('/api/tokens', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    try { return c.json(tokens.create(String(b.name ?? ''), String(b.scope ?? 'drafts')), 201); } catch (e) { throw new HttpError(400, (e as Error).message); }
  });
  app.delete('/api/tokens/:id', (c) => { tokens.revoke(c.req.param('id')); return c.json({ ok: true }); });
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

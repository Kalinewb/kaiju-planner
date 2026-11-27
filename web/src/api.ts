import type { Entity, Link } from '../../shared/schema.ts';

export class ApiError extends Error {
  status: number; body: any;
  constructor(status: number, body: any) { super(body?.error ?? 'Request failed'); this.status = status; this.body = body; }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (f: () => void) => { onUnauthorized = f; };

/** Every successful change bumps this, so every list on screen reloads and nothing goes stale. */
export const mutations = { n: 0, subs: new Set<() => void>() };
let bumpTimer: ReturnType<typeof setTimeout> | undefined;
const bump = () => { mutations.n++; clearTimeout(bumpTimer); bumpTimer = setTimeout(() => mutations.subs.forEach((f) => f()), 60); };

async function req<T>(method: string, path: string, body?: unknown, silent = false): Promise<T> {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, json);
  if (method !== 'GET' && !silent && !path.startsWith('/auth/')) bump();
  return json as T;
}

export interface Summary {
  features: number; featuresCompleted: number; featuresInDevelopment: number; featuresPlanned: number; featuresIdeas: number; featuresAwaitingApproval: number; issuesOpen: number;
  tasksOpen: number; tasksTotal: number; parts: number; progress: number;
  openQuestions: { id: string; kind: string; title: string; field: string; flag: string }[];
  recent: HistoryItem[];
}
export interface HistoryItem { id: string; project_id: string; entity_id: string; kind: string; action: string; summary: string; actor: string; at: string }
export interface Brief { markdown: string; complete: boolean; questions: string[] }

export interface AiStatus { hasKey: boolean; keyHint: string; enabled: boolean; model: string; models: string[] }
export interface Proposal { kind: 'feature'; data: Record<string, string>; part_id: string; user_said: string; unclear_fields: string[]; open_questions: string[]; my_suggestions: string[] }
export interface LinkSuggestion { from_id: string; to_id: string; type: string; reason: string }

export interface TrashRow { id: string; entity_id: string; kind: string; title: string; project_id: string | null; deleted_at: string; deleted_by: string; reason: string }
export interface TokenInfo { id: string; name: string; scope: string; created_at: string; last_used: string | null }
export interface CommentRow { id: string; entity_id: string; author: string; body: string; at: string }

export interface AttentionItem { id: string; kind: string; title: string; status: string; why: string; part_id: string }
export interface Attention { decide: AttentionItem[]; drafts: AttentionItem[]; count: number; issues_open: number }
export interface IssueRow { issue: Entity; where: string; comment_count: number }

export const api = {
  reorder: (ids: string[]) => req('POST', '/reorder', { ids }),
  issues: (pid: string, q: Record<string, string> = {}) => req<IssueRow[]>('GET', `/projects/${pid}/issues?` + new URLSearchParams(q)),
  issuesBrief: (pid: string, q: Record<string, string> = {}) => req<{ count: number; markdown: string }>('GET', `/projects/${pid}/issues-brief?` + new URLSearchParams(q)),
  issueBrief: (id: string) => req<{ count: number; markdown: string }>('GET', `/entities/${id}/issue-brief`),
  attention: (pid: string) => req<Attention>('GET', `/projects/${pid}/attention`),
  approveMany: (pid: string, ids: string[]) => req<{ approved: number; ids: string[]; skipped: { id: string; title: string; reason: string }[] }>('POST', `/projects/${pid}/approve-many`, { ids }),
  tokens: () => req<TokenInfo[]>('GET', '/tokens'),
  createToken: (name: string, scope = 'drafts') => req<{ id: string; token: string; scope: string }>('POST', '/tokens', { name, scope }),
  comments: (id: string) => req<CommentRow[]>('GET', `/entities/${id}/comments`),
  addComment: (id: string, body: string) => req<CommentRow>('POST', `/entities/${id}/comments`, { body }),
  removeComment: (id: string) => req('DELETE', `/comments/${id}`),
  revokeToken: (id: string) => req('DELETE', `/tokens/${id}`),
  aiStatus: () => req<AiStatus>('GET', '/ai/status'),
  aiSettings: (b: { apiKey?: string; enabled?: boolean; model?: string }) => req<AiStatus>('POST', '/ai/settings', b),
  aiHistory: (pid: string) => req<{ id: string; role: 'user' | 'assistant'; content: string; at: string }[]>('GET', `/ai/chat/${pid}`),
  aiClear: (pid: string) => req('DELETE', `/ai/chat/${pid}`),
  aiChat: (project_id: string, message: string) => req<{ reply: string; proposals: Proposal[] }>('POST', '/ai/chat', { project_id, message }),
  aiSuggestLinks: (project_id: string) => req<{ suggestions: LinkSuggestion[]; note: string }>('POST', '/ai/suggest-links', { project_id }),
  aiAccept: (project_id: string, p: Proposal) => req<Entity>('POST', '/ai/accept-feature', { project_id, data: p.data, part_id: p.part_id, unclear_fields: p.unclear_fields }),
  addAiLink: (b: { project_id: string; from_id: string; to_id: string; type: string; note: string }) => req<Link>('POST', '/links', { ...b, source: 'ai', confirmed: false }),
  authStatus: () => req<{ passwordSet: boolean; loggedIn: boolean; minPassword: number }>('GET', '/auth/status'),
  login: (password: string) => req<{ ok: true }>('POST', '/auth/login', { password }),
  logout: () => req('POST', '/auth/logout', {}),
  changePassword: (current: string, next: string) => req('POST', '/auth/change-password', { current, next }),
  list: (p: { project?: string; kind?: string; q?: string }) => req<Entity[]>('GET', '/entities?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])),
  get: (id: string) => req<{ entity: Entity; revisions: { id: string; approved_at: string; data: Record<string, string> }[]; referencedBy: { id: string; kind: string; title: string; field: string }[] }>('GET', `/entities/${id}`),
  create: (b: { kind: string; project_id?: string; data?: Record<string, string>; status?: string; flags?: Record<string, string> }) => req<Entity>('POST', '/entities', b),
  update: (id: string, b: { data?: Record<string, string>; flags?: Record<string, string | null> }, silent = false) => req<Entity>('PATCH', `/entities/${id}`, b, silent),
  setStatus: (id: string, status: string, confirmed = false) => req<Entity>('POST', `/entities/${id}/status`, { status, confirmed }),
  approve: (id: string) => req<Entity>('POST', `/entities/${id}/approve`, {}),
  remove: (id: string, force = false, reason = '') => req<{ ok: true; trash_id: string }>('DELETE', `/entities/${id}?${new URLSearchParams({ ...(force ? { force: '1' } : {}), ...(reason ? { reason } : {}) })}`),
  trash: (project?: string) => req<TrashRow[]>('GET', `/trash${project ? `?project=${project}` : ''}`),
  restore: (trashId: string) => req<Entity>('POST', `/trash/${trashId}/restore`, {}),
  purge: (trashId: string) => req('DELETE', `/trash/${trashId}`),
  emptyTrash: () => req('POST', '/trash/empty', {}),
  upload: async (file: File | Blob, name = '') => {
    const res = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', headers: { 'x-filename': name || (file as File).name || '' }, body: file });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, j);
    return j as { id: string; url: string };
  },
  overview: () => req<{ project: Entity; summary: Summary }[]>('GET', '/overview'),
  summary: (pid: string) => req<Summary>('GET', `/projects/${pid}/summary`),
  links: (pid: string) => req<Link[]>('GET', `/projects/${pid}/links`),
  addLink: (b: { project_id: string; from_id: string; to_id: string; type: string; confirmed?: boolean }) => req<Link>('POST', '/links', b),
  confirmLink: (id: string) => req('POST', `/links/${id}/confirm`, {}),
  removeLink: (id: string) => req('DELETE', `/links/${id}`),
  history: (pid: string) => req<HistoryItem[]>('GET', `/projects/${pid}/history`),
  recent: () => req<HistoryItem[]>('GET', '/history'),
  brief: (id: string) => req<Brief>('GET', `/entities/${id}/brief`),
  importFile: (file: unknown) => req<{ imported: number; projects: string[]; safetyCopy: string | null }>('POST', '/import', file),
};

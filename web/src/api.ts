import type { Entity, Link } from '../../shared/schema.ts';

export class ApiError extends Error {
  status: number; body: any;
  constructor(status: number, body: any) { super(body?.error ?? 'Request failed'); this.status = status; this.body = body; }
}

export let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (f: () => void) => { onUnauthorized = f; };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export interface Summary {
  features: number; featuresCompleted: number; featuresInDevelopment: number; featuresPlanned: number; featuresIdeas: number;
  tasksOpen: number; tasksTotal: number; parts: number; progress: number;
  openQuestions: { id: string; kind: string; title: string; field: string; flag: string }[];
  recent: HistoryItem[];
}
export interface HistoryItem { id: string; project_id: string; entity_id: string; kind: string; action: string; summary: string; actor: string; at: string }
export interface Brief { markdown: string; complete: boolean; questions: string[] }

export const api = {
  authStatus: () => req<{ passwordSet: boolean; loggedIn: boolean; minPassword: number }>('GET', '/auth/status'),
  login: (password: string) => req<{ ok: true }>('POST', '/auth/login', { password }),
  logout: () => req('POST', '/auth/logout', {}),
  changePassword: (current: string, next: string) => req('POST', '/auth/change-password', { current, next }),
  list: (p: { project?: string; kind?: string; q?: string }) => req<Entity[]>('GET', '/entities?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])),
  get: (id: string) => req<{ entity: Entity; revisions: { id: string; approved_at: string; data: Record<string, string> }[]; referencedBy: { id: string; kind: string; title: string; field: string }[] }>('GET', `/entities/${id}`),
  create: (b: { kind: string; project_id?: string; data?: Record<string, string>; status?: string; flags?: Record<string, string> }) => req<Entity>('POST', '/entities', b),
  update: (id: string, b: { data?: Record<string, string>; flags?: Record<string, string | null> }) => req<Entity>('PATCH', `/entities/${id}`, b),
  setStatus: (id: string, status: string, confirmed = false) => req<Entity>('POST', `/entities/${id}/status`, { status, confirmed }),
  approve: (id: string) => req<Entity>('POST', `/entities/${id}/approve`, {}),
  remove: (id: string, force = false) => req('DELETE', `/entities/${id}${force ? '?force=1' : ''}`),
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

// The structure of a project is a tree of components (plugin > subplugin > addon ...).
// Everything here is derived from each component's "Lives inside" (parent_id) field.
import type { Entity } from './schema.ts';

export interface TreeNode { part: Entity; children: TreeNode[]; depth: number }

export function buildTree(parts: Entity[]): TreeNode[] {
  const ids = new Set(parts.map((p) => p.id));
  const kids = new Map<string, Entity[]>();
  const roots: Entity[] = [];
  for (const p of parts) {
    const par = p.data.parent_id;
    if (par && ids.has(par) && par !== p.id) kids.set(par, [...(kids.get(par) ?? []), p]); else roots.push(p);
  }
  const make = (p: Entity, depth: number, seen: Set<string>): TreeNode => {
    seen.add(p.id);
    return { part: p, depth, children: (kids.get(p.id) ?? []).filter((c) => !seen.has(c.id)).map((c) => make(c, depth + 1, seen)) };
  };
  return roots.map((r) => make(r, 0, new Set()));
}

export function descendantIds(parts: Entity[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string, seen: Set<string>) => {
    for (const p of parts) if (p.data.parent_id === pid && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); walk(p.id, seen); }
  };
  walk(id, new Set([id]));
  return out;
}

/** Top-level first: [Plugin, Subplugin, ...this]. */
export function pathTo(parts: Entity[], id: string): Entity[] {
  const by = new Map(parts.map((p) => [p.id, p]));
  const out: Entity[] = [];
  const seen = new Set<string>();
  let cur = by.get(id);
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = cur.data.parent_id ? by.get(cur.data.parent_id) : undefined; }
  return out;
}

/** The component a task belongs to: its own, else the one of its feature. */
export function taskPart(t: Entity, features: Entity[]): string {
  return t.data.part_id || features.find((f) => f.id === t.data.feature_id)?.data.part_id || '';
}

export interface NodeStats { features: number; featuresCompleted: number; tasks: number; tasksOpen: number; progress: number; children: number }

export function nodeStats(parts: Entity[], features: Entity[], tasks: Entity[], id: string, includeInside: boolean): NodeStats {
  const ids = new Set(includeInside ? [id, ...descendantIds(parts, id)] : [id]);
  const fs = features.filter((f) => f.status !== 'Rejected' && ids.has(f.data.part_id));
  const ts = tasks.filter((t) => ids.has(taskPart(t, features)));
  const doneT = ts.filter((t) => t.status === 'Completed').length;
  const doneF = fs.filter((f) => f.status === 'Completed').length;
  const progress = ts.length ? Math.round((doneT / ts.length) * 100) : fs.length ? Math.round((doneF / fs.length) * 100) : 0;
  return { features: fs.length, featuresCompleted: doneF, tasks: ts.length, tasksOpen: ts.length - doneT, progress, children: parts.filter((p) => p.data.parent_id === id).length };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { Store } from '../server/store.ts';
import { bulkImport } from '../server/bulk.ts';
import { buildTree, descendantIds, pathTo, nodeStats } from '../shared/tree.ts';

const mk = () => { const store = new Store(openDb(':memory:')); const pid = store.create({ kind: 'project', data: { name: 'P' } }).id; return { store, pid }; };

test('components nest and a component cannot be moved inside itself or its own contents', () => {
  const { store, pid } = mk();
  const a = store.create({ kind: 'part', project_id: pid, data: { name: 'Plugin A', type: 'Plugin' } });
  const b = store.create({ kind: 'part', project_id: pid, data: { name: 'Sub B', type: 'Subplugin', parent_id: a.id } });
  const c = store.create({ kind: 'part', project_id: pid, data: { name: 'Addon C', type: 'Addon', parent_id: b.id } });
  assert.throws(() => store.update(a.id, { data: { parent_id: c.id } }), /inside something it contains/);
  assert.throws(() => store.update(a.id, { data: { parent_id: a.id } }), /inside itself/);
  assert.throws(() => store.create({ kind: 'part', project_id: pid, data: { name: 'X', parent_id: 'nope' } }), /does not exist/);
  const parts = store.list({ project_id: pid, kind: 'part' });
  assert.deepEqual(descendantIds(parts, a.id).sort(), [b.id, c.id].sort());
  assert.deepEqual(pathTo(parts, c.id).map((p) => p.title), ['Plugin A', 'Sub B', 'Addon C']);
  const tree = buildTree(parts);
  assert.equal(tree.length, 1); assert.equal(tree[0].children[0].children[0].part.title, 'Addon C');
  assert.equal(store.update(c.id, { data: { parent_id: a.id } }).data.parent_id, a.id); // moving to a valid place works
});

test('deleting a component with contents asks first and keeps the contents (they move to the top level)', () => {
  const { store, pid } = mk();
  const a = store.create({ kind: 'part', project_id: pid, data: { name: 'A' } });
  const b = store.create({ kind: 'part', project_id: pid, data: { name: 'B', parent_id: a.id } });
  const f = store.create({ kind: 'feature', project_id: pid, data: { name: 'F', part_id: a.id } });
  assert.throws(() => store.remove(a.id, false), /point to this one/);
  store.remove(a.id, true);
  assert.equal(store.get(b.id).data.parent_id, ''); assert.equal(store.get(f.id).data.part_id, '');
});

test('phases, decisions and docs can be scoped to a component', () => {
  const { store, pid } = mk();
  const a = store.create({ kind: 'part', project_id: pid, data: { name: 'A' } });
  for (const kind of ['phase', 'decision', 'doc']) assert.equal(store.create({ kind, project_id: pid, data: { name: 'x', part_id: a.id } }).data.part_id, a.id);
});

test('roll-up counts include everything inside only when asked', () => {
  const { store, pid } = mk();
  const a = store.create({ kind: 'part', project_id: pid, data: { name: 'A' } });
  const b = store.create({ kind: 'part', project_id: pid, data: { name: 'B', parent_id: a.id } });
  const f1 = store.create({ kind: 'feature', project_id: pid, data: { name: 'F1', part_id: a.id } });
  store.approve(f1.id);
  const f2 = store.create({ kind: 'feature', project_id: pid, data: { name: 'F2', part_id: b.id } });
  store.approve(f2.id);
  const t = store.create({ kind: 'task', project_id: pid, data: { name: 'T', feature_id: f2.id } }); // belongs to B through its feature
  store.setStatus(t.id, 'Completed', true);
  const all = (k: string) => store.list({ project_id: pid, kind: k });
  const direct = nodeStats(all('part'), all('feature'), all('task'), a.id, false);
  const deep = nodeStats(all('part'), all('feature'), all('task'), a.id, true);
  assert.equal(direct.features, 1); assert.equal(direct.tasks, 0); assert.equal(direct.children, 1);
  assert.equal(deep.features, 2); assert.equal(deep.tasks, 1); assert.equal(deep.progress, 100);
});

test('bulk import builds nested components even when children are listed before parents', () => {
  const { store } = mk();
  const r = bulkImport(store, {
    project: { name: 'Nested' },
    parts: [
      { name: 'Addon C', type: 'Addon', parent: 'Sub B' },
      { name: 'Sub B', type: 'Subplugin', parent: 'Plugin A' },
      { name: 'Plugin A', type: 'Plugin' },
      { name: 'Orphan', parent: 'Missing' },
    ],
    phases: [{ name: 'Plugin A v1', part: 'Plugin A' }],
    docs: [{ name: 'Notes', part: 'Sub B' }],
  });
  const parts = store.list({ project_id: r.project_id!, kind: 'part' });
  assert.deepEqual(pathTo(parts, parts.find((p) => p.title === 'Addon C')!.id).map((p) => p.title), ['Plugin A', 'Sub B', 'Addon C']);
  assert.equal(parts.find((p) => p.title === 'Addon C')!.data.type, 'Addon');
  assert.match(JSON.stringify(r.skipped), /Missing.{1,3} was not found/);
  assert.equal(store.list({ project_id: r.project_id!, kind: 'phase' })[0].data.part_id, parts.find((p) => p.title === 'Plugin A')!.id);
  assert.equal(store.list({ project_id: r.project_id!, kind: 'doc' })[0].data.part_id, parts.find((p) => p.title === 'Sub B')!.id);
});

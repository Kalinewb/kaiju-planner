import { api } from './api.ts';
import { toast } from './toast.tsx';

/** Deletes something (it goes to the trash first) and offers Undo for ten seconds. */
export async function removeWithUndo(id: string, title: string, force = false) {
  const r = await api.remove(id, force);
  toast(`Deleted "${title || 'Untitled'}"`, { action: { label: 'Undo', run: async () => { try { await api.restore(r.trash_id); toast(`Restored "${title || 'Untitled'}".`); } catch (x) { toast((x as Error).message, { tone: 'bad' }); } } } });
  return r;
}

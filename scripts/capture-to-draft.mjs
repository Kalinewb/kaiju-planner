// Turns what the live notch reports about a view into a DRAFT page skeleton in the planner.
//   node scripts/capture-to-draft.mjs <view> <component name> [--import]
// The notch's `design` call lists the components it drew (type, size) but not their text, so the draft has
// the right NUMBER of rows, switches and buttons with placeholder labels. Rename them from the screenshot.
// Without --import it only prints the page. The planner marks everything it receives as an unapproved draft.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const [view, part] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!view || !part) { console.error('Usage: node scripts/capture-to-draft.mjs <view> <component name> [--import]'); process.exit(1); }
const qs = (...a) => execFileSync('qs', ['-p', '/usr/share/omarchy/shell', 'ipc', 'call', ...a], { encoding: 'utf8' });
qs('notch', 'view', view); await new Promise((r) => setTimeout(r, 1500));
const design = JSON.parse(qs('notch', 'design')); qs('notch', 'collapse');
const list = design[view] ?? design.settings ?? [];
const rows = list.filter((x) => x.type === 'CursorFill' && x.height >= 26 && x.height <= 34);
const switches = list.filter((x) => Math.round(x.width) === 42 && Math.round(x.height) === 22);
const buttons = list.filter((x) => /Button$/.test(x.type) || /^ActionButton/.test(x.type));
const el = (type, props) => ({ type, props });
const elements = [el('header', { title: view[0].toUpperCase() + view.slice(1), back: 'false', close: 'false' })];
rows.forEach((_, i) => elements.push(el('row', { label: `Row ${i + 1}`, detail: '', clickable: 'true' })));
switches.forEach((_, i) => elements.push(el('switch', { label: `Switch ${i + 1}`, on: 'false' })));
if (buttons.length) elements.push(el('buttons', { labels: buttons.slice(0, 4).map((_, i) => `Button ${i + 1}`).join(', '), kinds: 'quiet', align: 'right' }));
const page = { name: `${view} (captured skeleton)`, part, elements, notes: `Skeleton from the live notch ${new Date().toISOString().slice(0, 10)}: ${rows.length} rows, ${switches.length} switches, ${buttons.length} buttons. Labels are placeholders; rename them from the screenshot.` };
console.log(JSON.stringify(page, null, 2));
if (process.argv.includes('--import')) {
  const env = JSON.parse(readFileSync(process.env.HOME + '/.claude.json', 'utf8')).mcpServers['kaiju-planner'].env;
  const H = { Authorization: 'Bearer ' + env.KAIJU_TOKEN, 'Content-Type': 'application/json' };
  const projects = await (await fetch(`${env.KAIJU_URL}/api/entities?kind=project`, { headers: H })).json();
  const proj = projects.find((p) => /notch/i.test(p.title ?? p.name ?? ''));
  if (!proj) { console.error('No project with "notch" in its name.'); process.exit(1); }
  const r = await fetch(`${env.KAIJU_URL}/api/bulk`, { method: 'POST', headers: H, body: JSON.stringify({ project_id: proj.id, pages: [page] }) });
  console.log(r.status, (await r.text()).slice(0, 300));
}

// Turns issues into Markdown that Claude Code can act on. Claude's own suggestions are labelled as such.
import { pathTo } from './tree.ts';
import type { Entity } from './schema.ts';

export interface IssueBriefInput {
  issues: Entity[];
  parts: Entity[];
  features: Entity[];
  comments: Record<string, { author: string; body: string; at: string }[]>;
  title?: string;
}

const clean = (s: string | undefined) => (s ?? '').trim();

export function buildIssueBrief(inp: IssueBriefInput): string {
  const out: string[] = [];
  out.push(`# ${inp.title ?? 'Issues to look at'}\n`);
  out.push('> How to read this: each issue says what is wrong and, where the owner or Claude proposed one, a suggested fix. A fix marked **AI suggestion** is an idea, not an instruction. If something is unclear, ask the owner. Do not mark an issue Verified: only the owner can.\n');
  if (!inp.issues.length) { out.push('_No matching issues._\n'); return out.join('\n'); }
  const order = ['Blocker', 'High', 'Medium', 'Low', 'Not set'];
  const sorted = [...inp.issues].sort((a, b) => order.indexOf(a.data.severity || 'Not set') - order.indexOf(b.data.severity || 'Not set'));
  for (const i of sorted) {
    const part = inp.parts.find((p) => p.id === i.data.part_id);
    const feat = inp.features.find((f) => f.id === i.data.feature_id);
    const trail = part ? pathTo(inp.parts, part.id).map((p) => p.title).join(' > ') : '';
    out.push(`## ${i.title || 'Untitled'}\n`);
    out.push([
      `- **Status:** ${i.status}`, `- **Severity:** ${i.data.severity || 'Not set'}`, `- **Kind:** ${i.data.type || 'Bug'}`,
      trail && `- **Where:** ${trail}${feat ? ` > feature "${feat.title}"` : ''}`,
      !trail && feat && `- **Where:** feature "${feat.title}"`,
      part?.data.version && `- **Component version:** ${part.data.version}${part.data.commit ? ` (${part.data.commit})` : ''}`,
      part?.data.repo && `- **Repository:** ${part.data.repo}`,
      i.data.found_in && `- **Found in:** ${i.data.found_in}`,
      i.prov.problem === 'ai' && '- **Reported by:** Claude (not yet confirmed by the owner)',
    ].filter(Boolean).join('\n') + '\n');
    out.push(`**What is wrong**\n\n${clean(i.data.problem) || '_Not described._'}\n`);
    if (clean(i.data.steps)) out.push(`**How to see it**\n\n${clean(i.data.steps)}\n`);
    if (clean(i.data.expected)) out.push(`**Expected**\n\n${clean(i.data.expected)}\n`);
    out.push(`**Suggested fix${clean(i.data.fix) && i.prov.fix === 'ai' ? ' (AI suggestion, not an instruction)' : clean(i.data.fix) ? ' (from the owner)' : ''}**\n\n${clean(i.data.fix) || '_None yet._'}\n`);
    const cs = inp.comments[i.id] ?? [];
    if (cs.length) out.push(`**Discussion**\n\n${cs.map((c) => `- ${c.author} (${c.at.slice(0, 10)}): ${c.body.replace(/\n/g, ' ')}`).join('\n')}\n`);
  }
  return out.join('\n');
}

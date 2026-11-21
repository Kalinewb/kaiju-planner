// Builds the Claude Code implementation brief.
// RULE: only APPROVED information is written as an instruction. Everything else is labelled,
// and anything missing goes under "Questions Before Implementation". Nothing is invented.
import { KINDS, lines } from './schema.ts';
import type { Entity, Link } from './schema.ts';
import { pathTo } from './tree.ts';

export interface BriefInput {
  project: Entity;
  target: Entity; // feature or task
  parts: Entity[];
  features: Entity[];
  tasks: Entity[];
  decisions: Entity[];
  links: Link[];
}

const NONE = '_Not provided._';
const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : NONE);

export function buildBrief(inp: BriefInput): { markdown: string; complete: boolean; questions: string[] } {
  const { project, target } = inp;
  const questions: string[] = [];
  const isTask = target.kind === 'task';

  // The feature that carries the requirements
  let feature: Entity | undefined = target;
  if (isTask) feature = inp.features.find((f) => f.id === target.data.feature_id);

  const pa = project.approved;
  if (!pa) questions.push('The project definition has not been approved yet, so no project context can be given as an instruction.');
  if (!feature) questions.push('This task is not linked to a feature.');
  else if (!feature.approved) questions.push(`The feature "${feature.title}" has not been approved. Nothing below can be treated as a requirement until it is.`);
  const fa = feature?.approved ?? null;

  if (fa) {
    for (const k of ['description', 'expected_result', 'requirements', 'acceptance'] as const)
      if (!(fa[k] ?? '').trim()) questions.push(`"${KINDS.feature.fields.find((f) => f.key === k)!.label}" is empty for this feature.`);
    for (const [k, flag] of Object.entries(feature!.flags))
      questions.push(`${KINDS.feature.fields.find((f) => f.key === k)?.label ?? k}: ${flag === 'clarify' ? 'marked as needing clarification' : 'marked as not decided'}.`);
    if (feature!.approved && Object.keys(feature!.data).some((k) => (feature!.data[k] ?? '') !== (fa[k] ?? '')))
      questions.push('There are edits to this feature that you have not approved yet. This brief uses the last approved version only.');
  }
  if (fa && !fa.testing_plan?.trim() && !feature?.flags.testing_plan) questions.push('How should this be tested? Nothing has been approved.');
  if (isTask && !target.approved) { /* tasks are not approvable; their text is context, not requirements */ }

  const part = inp.parts.find((p) => p.id === (fa?.part_id ?? feature?.data.part_id ?? target.data.part_id));
  const linkedIds = (type: string, confirmed: boolean) =>
    inp.links.filter((l) => l.type === type && l.confirmed === confirmed && feature && (l.from_id === feature.id || l.to_id === feature.id))
      .map((l) => (l.from_id === feature!.id ? l.to_id : l.from_id));
  const nameOf = (id: string) => inp.features.find((f) => f.id === id)?.title || inp.parts.find((p) => p.id === id)?.title || id;
  const confirmedDeps = [...new Set([...linkedIds('depends_on', true), ...linkedIds('related', true)])];
  const possibleDeps = [...new Set([...linkedIds('depends_on', false), ...linkedIds('related', false)])];
  const existing = confirmedDeps.map((id) => inp.features.find((f) => f.id === id)).filter((f): f is Entity => !!f && f.status === 'Completed');
  for (const id of confirmedDeps) {
    const f = inp.features.find((x) => x.id === id);
    if (f && f.status !== 'Completed') questions.push(`Confirmed dependency "${f.title}" is not completed yet (status: ${f.status}).`);
  }
  const openDecisions = inp.decisions.filter((d) => d.status === 'Not decided' || d.status === 'Proposed');
  for (const d of openDecisions) questions.push(`Decision still open: "${d.title}".`);

  const section = (n: number, title: string, body: string) => `## ${n}. ${title}\n\n${body}\n`;
  const out: string[] = [];
  const complete = questions.length === 0;

  out.push(`# Implementation brief: ${target.title || 'Untitled'}\n`);
  out.push(complete
    ? '> Status: no open questions were found in the approved planning information.\n'
    : `> **Status: NOT COMPLETE.** There are ${questions.length} open question(s) in "Questions Before Implementation". Do not guess the answers. Ask the product owner.\n`);
  out.push('> How to read this: everything under "Instructions" was approved by the product owner. Anything labelled **Suggestion** or **Not approved** is only context and must not be treated as a requirement. If something is missing, ask. Do not invent it.\n');

  out.push(section(1, 'Project context', pa
    ? [`**Project:** ${pa.name}`, pa.description && `**What it is:** ${pa.description}`, pa.problem && `**Problem it solves:** ${pa.problem}`, pa.users && `**Intended users:** ${pa.users}`, pa.constraints && `**Known limitations:** ${pa.constraints}`, pa.out_of_scope && `**Out of scope:** ${pa.out_of_scope}`].filter(Boolean).join('\n\n')
    : '_The project definition is not approved, so no context is given as an instruction._'));
  out.push(section(2, 'Project objectives', pa ? bullets(lines(pa.objectives)) : NONE));

  if (!fa) {
    out.push(section(3, 'Feature description', '_Not approved. No instruction can be given._'));
  } else {
    out.push(section(3, 'Feature description', [`**${fa.name}**`, fa.description || NONE, fa.problem && `**Problem it solves:** ${fa.problem}`, fa.users && `**Who uses it:** ${fa.users}`].filter(Boolean).join('\n\n')));
  }
  out.push(section(4, 'Approved requirements (instructions)', fa ? bullets(lines(fa.requirements)) : '_None approved._'));
  out.push(section(5, 'Expected behavior', fa ? [fa.behavior && `**How it should work:** ${fa.behavior}`, fa.expected_result && `**Expected result:** ${fa.expected_result}`].filter(Boolean).join('\n\n') || NONE : NONE));
  const trail = part ? pathTo(inp.parts, part.id) : [];
  out.push(section(6, 'Related parts of the application', part
    ? `- **${part.title}**${part.data.type ? ` (${part.data.type})` : ''}${part.approved?.purpose || part.data.purpose ? `: ${part.approved?.purpose ?? part.data.purpose}` : ''}${trail.length > 1 ? `\n- Where it sits: ${trail.map((p) => `${p.title}${p.data.type ? ` (${p.data.type})` : ''}`).join(' > ')}` : ''}`
    : NONE));
  out.push(section(7, 'Confirmed dependencies', bullets(confirmedDeps.map((id) => `${nameOf(id)}`))
    + (possibleDeps.length ? `\n\n**Not confirmed (possible relationships, do not treat as facts):**\n${bullets(possibleDeps.map(nameOf))}` : '')));
  out.push(section(8, 'Relevant existing functionality', bullets(existing.map((f) => `${f.title}${f.approved?.description ? `: ${f.approved.description}` : ''}`))));
  out.push(section(9, 'Things that must not be changed', fa ? bullets(lines(fa.must_not_change)) : NONE));

  const tasks = isTask ? [target] : inp.tasks.filter((t) => t.data.feature_id === target.id);
  out.push(section(10, 'Implementation tasks', tasks.length
    ? tasks.map((t) => `- [${t.status === 'Completed' ? 'x' : ' '}] **${t.title}**${t.data.description ? `: ${t.data.description}` : ''}${t.data.technical_notes ? `\n  - Technical notes (from the owner): ${t.data.technical_notes}` : ''}`).join('\n')
    : '_No tasks have been created for this yet._'));
  const accept = [...(fa ? lines(fa.acceptance) : []), ...(isTask ? lines(target.data.acceptance) : [])];
  out.push(section(11, 'Acceptance criteria', bullets(accept)));
  out.push(section(12, 'Testing requirements', fa?.testing_plan?.trim() ? fa.testing_plan : '_No testing requirements were approved. See questions._'));
  out.push(section(13, 'Documentation requirements', fa?.docs_notes?.trim() ? fa.docs_notes : '_No documentation requirements were approved._'));

  const sugg: string[] = [];
  if (feature && feature.data.technical_notes && !isTask) sugg.push(`Technical notes (not approved as requirements): ${feature.data.technical_notes}`);
  for (const [k, v] of Object.entries(feature?.data ?? {})) {
    if (fa && (fa[k] ?? '') !== v && v.trim()) sugg.push(`Unapproved edit to "${KINDS.feature.fields.find((f) => f.key === k)?.label ?? k}": ${v.replace(/\n/g, ' ')}`);
  }
  for (const [k, p] of Object.entries(feature?.prov ?? {})) if (p === 'ai' && !fa?.[k]) sugg.push(`AI suggestion for "${k}" (not approved).`);

  out.push(`## 14. Unresolved questions / Questions Before Implementation\n\n${questions.length ? questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '_None found in the approved information. This does not mean nothing is missing, so ask if something is unclear._'}\n`);
  out.push(`## Suggestions and unapproved information (context only)\n\n${bullets(sugg)}\n`);
  out.push(`---\n_Generated from approved planning information on ${new Date().toISOString().slice(0, 10)}. Edit before approving if needed._\n`);
  return { markdown: out.join('\n'), complete: questions.length === 0, questions };
}

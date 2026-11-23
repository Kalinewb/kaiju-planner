// Shared by server and web. Defines every kind of record, its fields, and its statuses.
// Plain-language labels and help texts live here so the UI never invents its own wording.

export type FieldType = 'text' | 'long' | 'select' | 'ref' | 'date';

export interface Field {
  key: string;
  label: string;
  help?: string;
  type: FieldType;
  options?: string[];
  refKind?: string; // for type 'ref': which kind of record this points to
  futureOnly?: boolean; // only shown for features created through "Future feature planning"
  hidden?: boolean; // stored, but not shown as an editable form field
  suggestions?: string[]; // free text, but offer these as quick picks
  advanced?: boolean;     // tucked into "More fields" in forms
}

export interface KindDef {
  kind: string;
  label: string;
  plural: string;
  help: string;
  titleField: string;
  approvable: boolean; // can be approved (snapshot kept)
  statuses?: string[];
  needsApprovalFrom?: number; // statuses at this index or later require an approved snapshot
  fields: Field[];
}

export const PART_TYPES = ['Plugin', 'Subplugin', 'Integration', 'Addon', 'Module', 'Library', 'Group'];
export const INSTALL_STATES = ['Not set', 'Not installed', 'Installed', 'Installed and pinned', 'Local copy only'];
export const PRIORITIES = ['Not set', 'Low', 'Medium', 'High', 'Critical'];
export const COMPLEXITY = ['Not estimated', 'Small', 'Medium', 'Large', 'Very large'];

export const FEATURE_STATUSES = [
  'Idea', 'Proposed', 'Needs clarification', 'Under review', 'Approved', 'Planned',
  'In development', 'Testing', 'Completed', 'Rejected', 'On hold',
];
// These only make sense once the user has approved the feature.
export const FEATURE_NEEDS_APPROVAL = ['Approved', 'Planned', 'In development', 'Testing', 'Completed'];

export const TASK_STATUSES = ['Backlog', 'Planned', 'In progress', 'In review', 'Testing', 'Completed'];
export const PART_STATUSES = ['Not started', 'Planned', 'In development', 'Testing', 'Completed', 'On hold'];
export const PHASE_STATUSES = ['Not started', 'In progress', 'Completed', 'On hold'];
export const PROJECT_STATUSES = ['Defining', 'Planning', 'In development', 'Testing', 'Live', 'On hold', 'Archived'];
export const DECISION_STATUSES = ['Not decided', 'Proposed', 'Approved', 'Rejected', 'Superseded'];
export const ISSUE_STATUSES = ['Open', 'Confirmed', 'In progress', 'Fixed (needs retest)', 'Verified', "Won't fix", 'Duplicate'];
export const ISSUE_OPEN = ['Open', 'Confirmed', 'In progress'];
export const ISSUE_RETEST = ['Fixed (needs retest)'];
export const ISSUE_CLOSED = ['Verified', "Won't fix", 'Duplicate'];
/** Only the owner can sign these off. Claude may report, comment and say "fixed, please retest". */
export const ISSUE_OWNER_ONLY = ['Verified', "Won't fix"];
export const ISSUE_TYPES = ['Bug', 'Visual / UX', 'Performance', 'Docs', 'Question', 'Idea'];
export const SEVERITIES = ['Not set', 'Low', 'Medium', 'High', 'Blocker'];
export const DEBT_STATUSES = ['Open', 'Planned', 'Resolved', 'Dismissed'];
export const DOC_SECTIONS = [
  'General', 'How the application is structured', 'Technical setup', 'Data storage', 'Integrations',
  'Feature descriptions', 'Known limitations', 'Future improvements', 'Technical issues', 'Important decisions',
];

const t = (key: string, label: string, help?: string): Field => ({ key, label, help, type: 'text' });
const l = (key: string, label: string, help?: string): Field => ({ key, label, help, type: 'long' });
const s = (key: string, label: string, options: string[], help?: string): Field => ({ key, label, help, type: 'select', options });
const r = (key: string, label: string, refKind: string, help?: string): Field => ({ key, label, help, type: 'ref', refKind });

export const KINDS: Record<string, KindDef> = {
  project: {
    kind: 'project', label: 'Project', plural: 'Projects', titleField: 'name', approvable: true,
    help: 'One piece of software you want to plan.',
    statuses: PROJECT_STATUSES,
    fields: [
      t('name', 'Project name'),
      l('description', 'What do you want to build?'),
      l('problem', 'What problem should it solve?'),
      l('users', 'Who is it intended for?'),
      l('vision', 'Project vision', 'The big picture: what this looks like when it works well.'),
      l('objectives', 'Main objectives', 'What do you want the application to accomplish? One per line.'),
      l('scope', 'Project scope', 'What is included.'),
      l('core_functionality', 'Core functionality', 'The things it absolutely must do. Your own ideas about functionality go here.'),
      l('out_of_scope', 'Out of scope', 'What it will deliberately not do.'),
      l('constraints', 'Known limitations', 'Budget, time, devices, skills, rules, anything that limits the project.'),
      l('success', 'Success criteria', 'How will you know it worked?'),
    ],
  },
  part: {
    kind: 'part', label: 'Component', plural: 'Structure', titleField: 'name', approvable: true,
    help: 'A building block of the project. It can contain other building blocks, for example a plugin containing subplugins, addons and integrations.',
    statuses: PART_STATUSES,
    fields: [
      t('name', 'Name'),
      { key: 'type', label: 'What kind of thing is it?', type: 'text', suggestions: PART_TYPES, help: 'For example Plugin, Subplugin, Addon, Integration. Type your own if none fit.' },
      r('parent_id', 'Lives inside', 'part', 'Leave empty for something at the top level of the project.'),
      t('version', 'Version', 'For example 1.2.0. Leave empty if it has none.'),
      s('install_state', 'Install state', INSTALL_STATES),
      t('repo', 'Repository link', 'Where the code lives, for example a GitHub address.'),
      t('commit', 'Branch or commit', 'The branch or commit this info refers to.'),
      { key: 'facts_verified_on', label: 'Version and install info last checked', type: 'date', help: 'When you (or someone you trust) last confirmed the version, install state and link. Used to show how stale they are.' },
      l('description', 'Description'),
      l('purpose', 'Purpose', 'Why does this part exist?'),
      l('responsibilities', 'What it is responsible for'),
      l('notes', 'Notes'),
    ],
  },
  feature: {
    kind: 'feature', label: 'Feature', plural: 'Features', titleField: 'name', approvable: true,
    help: 'Something you want the application to be able to do. An idea is not a feature until you approve it.',
    statuses: FEATURE_STATUSES, needsApprovalFrom: 4,
    fields: [
      t('name', 'Feature name'),
      l('original_input', 'Your original words', 'Exactly what you first said. It is kept as you wrote it and is never rewritten.'),
      l('description', 'Description'),
      l('problem', 'Problem it solves'),
      l('users', 'Who should use it'),
      l('behavior', 'How you imagine it working'),
      l('expected_result', 'Expected result', 'What should happen, including unusual situations.'),
      r('part_id', 'Component it belongs to', 'part'),
      s('priority', 'Priority', PRIORITIES),
      s('complexity', 'Complexity estimate', COMPLEXITY, 'Your own guess is fine. Leave as "Not estimated" if you are unsure.'),
      l('requirements', 'Requirements', 'One per line. Only approved requirements are given to Claude Code as instructions.'),
      l('acceptance', 'Acceptance criteria', 'One per line. How you will check that it works.'),
      l('must_not_change', 'Things that must not be changed', 'Existing behaviour that has to stay as it is.'),
      l('testing_plan', 'How it should be tested'),
      l('docs_notes', 'Documentation to update'),
      l('technical_notes', 'Technical notes'),
      l('affected', 'Which existing parts might be affected?', undefined),
      l('needs_new', 'Does it need something that does not exist yet?'),
      l('may_change', 'Could it change existing functionality?'),
      l('decisions_needed', 'Other decisions that need to be made'),
    ].map((f, i) => (i >= 16 ? { ...f, futureOnly: true } : f)).concat([{ key: 'origin', label: 'Where this came from', type: 'text', hidden: true } as Field]),
  },
  task: {
    kind: 'task', label: 'Task', plural: 'Tasks', titleField: 'name', approvable: false,
    help: 'A small piece of development work, usually part of a feature.',
    statuses: TASK_STATUSES,
    fields: [
      t('name', 'Task name'),
      l('description', 'Description'),
      r('feature_id', 'Related feature', 'feature'),
      r('phase_id', 'Roadmap phase', 'phase', 'Which phase of the roadmap this belongs to.'),
      r('part_id', 'Component it belongs to', 'part'),
      s('priority', 'Priority', PRIORITIES),
      l('acceptance', 'Acceptance criteria'),
      l('technical_notes', 'Technical notes'),
    ],
  },
  phase: {
    kind: 'phase', label: 'Roadmap phase', plural: 'Roadmap phases', titleField: 'name', approvable: false,
    help: 'A stretch of development with its own goals. You choose the phases and the dates.',
    statuses: PHASE_STATUSES,
    fields: [
      t('name', 'Name'),
      l('description', 'Description'),
      l('goals', 'Goals'),
      r('part_id', 'Belongs to', 'part', 'Leave empty for a phase of the whole project.'),
      { key: 'start', label: 'Planned start (optional)', type: 'date', help: 'Only dates you enter are shown. Nothing is guessed.' },
      { key: 'end', label: 'Planned end (optional)', type: 'date' },
    ],
  },
  decision: {
    kind: 'decision', label: 'Decision', plural: 'Decisions', titleField: 'name', approvable: true,
    help: 'A record of an important choice: what was decided, why, and what else it affects.',
    statuses: DECISION_STATUSES,
    fields: [
      t('name', 'Decision title'),
      r('part_id', 'Belongs to', 'part', 'Leave empty if it affects the whole project.'),
      l('question', 'What needs to be decided'),
      l('options', 'Available options', 'One per line.'),
      l('pros_cons', 'Advantages and disadvantages'),
      l('chosen', 'Chosen solution', 'Leave empty until you have actually decided.'),
      l('reason', 'Reason for the decision'),
      l('consequences', 'Consequences'),
      { key: 'decided_on', label: 'Date decided', type: 'date' },
    ],
  },
  doc: {
    kind: 'doc', label: 'Documentation page', plural: 'Documentation', titleField: 'name', approvable: false,
    help: 'Notes about how the application works. You do not need to understand every detail to store them.',
    fields: [
      t('name', 'Title'),
      s('section', 'Section', DOC_SECTIONS),
      r('part_id', 'Belongs to', 'part', 'Leave empty for project-wide documentation.'),
      r('phase_id', 'Roadmap phase (if it is the plan for one)', 'phase'),
      l('body', 'Content'),
    ],
  },
  debt: {
    kind: 'debt', label: 'Technical debt item', plural: 'Technical debt', titleField: 'name', approvable: false,
    help: 'Something that works for now but may need attention later, like a temporary fix that should be replaced.',
    statuses: DEBT_STATUSES,
    fields: [
      t('name', 'Title'),
      l('description', 'What is the issue?'),
      l('why_matters', 'Why might it matter later?'),
      r('part_id', 'Component it belongs to', 'part'),
      r('feature_id', 'Related feature', 'feature'),
    ],
  },
  issue: {
    kind: 'issue', label: 'Issue', plural: 'Issues', titleField: 'name', approvable: false,
    help: 'Something wrong, found while testing or using the project: what is wrong, how to see it, and a suggested fix. Claude can read these when you ask.',
    statuses: ISSUE_STATUSES,
    fields: [
      t('name', 'Short title', 'One line, for example "Eject leaves monitors off".'),
      r('part_id', 'Which component?', 'part'),
      r('feature_id', 'Which feature? (optional)', 'feature'),
      s('type', 'What kind of problem?', ISSUE_TYPES),
      s('severity', 'How bad is it?', SEVERITIES),
      l('problem', 'What is wrong?', 'Describe what you saw.'),
      l('fix', 'Suggested fix', 'Your idea, or leave empty and ask Claude for one. Claude\'s suggestions are labelled.'),
      l('steps', 'How to see it', 'Steps to reproduce, one per line.'),
      l('expected', 'What you expected instead'),
      t('found_in', 'Found in version or commit'),
    ],
  },
  page: {
    kind: 'page', label: 'Screen page', plural: 'Screen pages', titleField: 'name', approvable: false,
    help: 'One page of a component\'s screen design, built from the UI kit\'s elements in the UI builder.',
    fields: [
      t('name', 'Page name'),
      r('part_id', 'Component', 'part'),
      { key: 'elements', label: 'Elements', type: 'long', hidden: true },
      { key: 'width', label: 'Preview width', type: 'text', hidden: true },
      { key: 'height', label: 'Preview height', type: 'text', hidden: true },
      { key: 'surface', label: 'Surface', type: 'text', hidden: true },
      l('notes', 'Notes for Claude Code'),
    ],
  },
  qa: {
    kind: 'qa', label: 'QA checklist', plural: 'QA checklists', titleField: 'name', approvable: false,
    help: 'A checklist for testing something: tick each check as pass, fail or skip. One per feature, one per plugin, or whatever fits.',
    fields: [
      t('name', 'Checklist name'),
      r('part_id', 'Component', 'part'),
      r('feature_id', 'Feature (optional)', 'feature'),
      { key: 'items', label: 'Checks', type: 'long', hidden: true },
      { key: 'runs', label: 'Past runs', type: 'long', hidden: true },
      l('notes', 'Notes (how to set up the test, what to have ready)'),
    ],
  },
  shot: {
    kind: 'shot', label: 'Screenshot', plural: 'Screenshots', titleField: 'name', approvable: false,
    help: 'A picture of what something really looks like, or of a mock-up, so you can see it next to the plan.',
    fields: [
      t('name', 'Title'),
      r('part_id', 'Component', 'part'),
      s('source', 'What is it?', ['Real screenshot', 'Mock-up', 'Reference from somewhere else']),
      l('caption', 'What to look at'),
      { key: 'file', label: 'Image', type: 'text', hidden: true },
      t('taken_on', 'Taken on (date)'),
    ],
  },
  brief: {
    kind: 'brief', label: 'Implementation brief', plural: 'Implementation briefs', titleField: 'name', approvable: true,
    help: 'Instructions for Claude Code, built from approved information only.',
    statuses: ['Draft', 'Approved'],
    fields: [t('name', 'Title'), l('text', 'Brief (Markdown)'), t('source_id', 'Source record')],
  },
};

const ADVANCED: Record<string, string[]> = {
  project: ['vision', 'scope', 'core_functionality', 'out_of_scope', 'constraints', 'success'],
  part: ['commit', 'facts_verified_on', 'purpose', 'responsibilities', 'notes'],
  feature: ['original_input', 'problem', 'users', 'behavior', 'expected_result', 'complexity', 'must_not_change', 'testing_plan', 'docs_notes', 'technical_notes'],
  task: ['acceptance', 'technical_notes'],
  decision: ['pros_cons', 'consequences', 'decided_on'],
  issue: ['steps', 'expected', 'found_in'],
};
for (const [kind, keys] of Object.entries(ADVANCED)) for (const f of KINDS[kind].fields) if (keys.includes(f.key)) f.advanced = true;

export const LINK_TYPES: Record<string, string> = {
  depends_on: 'needs',
  related: 'is related to',
  phase_feature: 'is planned in',
};

export type Category = 'user' | 'approved' | 'ai' | 'clarify' | 'undecided';
export const CATEGORY_LABEL: Record<Category, string> = {
  user: 'You wrote this',
  approved: 'You approved this',
  ai: 'AI suggestion',
  clarify: 'Needs clarification',
  undecided: 'Not decided',
};

export interface Entity {
  id: string;
  project_id: string | null;
  kind: string;
  status: string;
  title: string;
  data: Record<string, string>;
  prov: Record<string, 'user' | 'ai'>;
  flags: Record<string, 'clarify' | 'undecided'>;
  approved: Record<string, string> | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Link {
  id: string;
  project_id: string;
  from_id: string;
  to_id: string;
  type: string;
  confirmed: boolean;
  source: 'user' | 'ai';
  note: string;
  created_at: string;
}

export function fieldCategory(e: Pick<Entity, 'data' | 'prov' | 'flags' | 'approved'>, key: string): Category {
  const flag = e.flags[key];
  if (flag) return flag;
  const cur = e.data[key] ?? '';
  if (e.approved && (e.approved[key] ?? '') === cur && cur !== '') return 'approved';
  if (e.prov[key] === 'ai') return 'ai';
  return 'user';
}

export function hasUnapprovedChanges(e: Pick<Entity, 'data' | 'approved'>): boolean {
  if (!e.approved) return false;
  const keys = new Set([...Object.keys(e.data), ...Object.keys(e.approved)]);
  for (const k of keys) if ((e.data[k] ?? '') !== (e.approved[k] ?? '')) return true;
  return false;
}

export const lines = (v: string | undefined): string[] =>
  (v ?? '').split('\n').map((x) => x.trim().replace(/^[-*]\s+/, '')).filter(Boolean);

// QA checklists: a list of checks, each pass / fail / skip / not yet tested.
export type QaState = 'todo' | 'pass' | 'fail' | 'skip';
export interface QaItem { id: string; text: string; state: QaState; note: string }
export interface QaRun { at: string; pass: number; fail: number; skip: number; total: number }
export const QA_STATES: QaState[] = ['todo', 'pass', 'fail', 'skip'];
export const QA_LABEL: Record<QaState, string> = { todo: 'Not tested', pass: 'Pass', fail: 'Fail', skip: 'Skip' };
const uid = () => Math.random().toString(36).slice(2, 9);
export const newItem = (text: string): QaItem => ({ id: uid(), text, state: 'todo', note: '' });

export function parseItems(json: string | undefined): QaItem[] {
  if (!json || !json.trim()) return [];
  let v: unknown;
  try { v = JSON.parse(json); } catch { throw new Error('The checks are not valid JSON.'); }
  if (!Array.isArray(v)) throw new Error('The checks must be a list.');
  if (v.length > 300) throw new Error('A checklist can have at most 300 checks.');
  return v.map((raw, i) => {
    const r = raw as Partial<QaItem>;
    if (typeof r?.text !== 'string' || !r.text.trim()) throw new Error(`Check ${i + 1} needs some text.`);
    if (r.text.length > 500) throw new Error(`Check ${i + 1} is longer than 500 characters.`);
    const state = QA_STATES.includes(r.state as QaState) ? (r.state as QaState) : 'todo';
    const note = typeof r.note === 'string' ? r.note.slice(0, 1000) : '';
    return { id: typeof r.id === 'string' && r.id ? r.id.slice(0, 20) : uid(), text: r.text.trim(), state, note };
  });
}
export function parseRuns(json: string | undefined): QaRun[] {
  try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v.slice(-50) : []; } catch { return []; }
}
export const tally = (items: QaItem[]) => ({
  pass: items.filter((i) => i.state === 'pass').length, fail: items.filter((i) => i.state === 'fail').length,
  skip: items.filter((i) => i.state === 'skip').length, todo: items.filter((i) => i.state === 'todo').length, total: items.length,
});

import { ELEMENT_BY_TYPE, conditionText, splitOptions } from './uikit.ts';
import type { El } from './uikit.ts';

/** Ready-made checks for the elements of one designed page, so a checklist can start from the design. */
export function checksFromDesign(pageName: string, els: El[], nameOfPage: (v: string) => string = (v) => v): string[] {
  const out: string[] = [`Page "${pageName}" looks like the design (compare with its screenshot under Looks)`];
  for (const el of els) {
    const p = el.props; const name = p.label || p.title || p.text || ELEMENT_BY_TYPE[el.type]?.label || el.type;
    const where = `${pageName} > ${name}`;
    switch (el.type) {
      case 'selector': out.push(`${where}: choosing each of ${splitOptions(p.options).join(', ')} makes only that one active`); break;
      case 'switch': out.push(`${where}: turns on and off, and the change sticks`); break;
      case 'stepper': out.push(`${where}: stays between ${p.from} and ${p.to}`); break;
      case 'slider': out.push(`${where}: moves across its range and shows the value`); break;
      case 'dropdown': out.push(`${where}: opens, picks one of ${splitOptions(p.options).join(', ')}, closes with Esc`); break;
      case 'field': out.push(`${where}: Enter saves, Esc reverts an unsaved change`); break;
      case 'button': out.push(`${where}: does what "${p.label}" says${p.opens ? ` and opens "${nameOfPage(p.opens)}"` : ''}`); break;
      case 'buttons': out.push(`${where}: each button does what its label says`); break;
      case 'row': if (p.clickable === 'true') out.push(`${where}: Enter, Space and a click all activate it${p.opens ? ` and open "${nameOfPage(p.opens)}"` : ''}`); break;
      case 'notice': case 'toast': out.push(`${where}: appears when it should and reads correctly`); break;
      case 'confirm': out.push(`${where}: Cancel and Esc do nothing, Confirm does the action`); break;
      default: break;
    }
    const cond = conditionText(el, els);
    if (cond) out.push(`${where}: shown only if ${cond}, and hidden otherwise`);
  }
  return out;
}

import { createContext, useContext } from 'react';

/** Where the user is looking: the whole project, or one component (optionally with everything inside it). */
export interface Scope {
  nodeId: string | null;
  includeInside: boolean;
  ids: Set<string> | null; // component ids that count as "in scope"; null = whole project
  base: string;            // URL prefix for pages in this scope
  projectBase: string;     // URL prefix of the whole project
}
export const ScopeContext = createContext<Scope>({ nodeId: null, includeInside: false, ids: null, base: '', projectBase: '' });
export const useScope = () => useContext(ScopeContext);

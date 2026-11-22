# Ease-of-use audit: Kaiju Planner (2026-11-22)

**Verdict:** the planner is clear in what it says and safe in what it does, but it is **heavy to scan once a project has 30+ components**, and it is **quiet when you act** (no confirmation that a save worked, no undo). Both are cheap to fix. 5 fixes would remove most of the friction.

## How to read this

- **P1** fix first, **P2** next, **P3** when convenient. Effort: **S** under an hour, **M** a few hours.
- Every finding has the evidence I measured. Nothing here is a guess about taste.

## Scorecard (1 = painful, 5 = effortless)

| Area | Score | Why |
|---|---|---|
| Language and clarity | 4 | Plain words, helpful empty states, each page says what it is for. |
| Common tasks | 3 | Most are 1 to 3 clicks, but quick capture is buried in a wizard. |
| Navigation at scale | 2.5 | The sidebar tree pushes key links off screen with 30 components. |
| Feedback and recovery | 2.5 | No "saved", no undo, no warning about unsaved edits. |
| Forms | 4 | Essentials first, rest folded, one status control everywhere. |
| Accessibility | 3.5 | Every control is labelled; contrast, target size, titles and focus handling have gaps. |
| Phone | 3.5 | 8 of 9 checked pages fit with no sideways scroll. |
| Consistency | 3.5 | Two different side panels behave differently. |

## What was checked

- **21 pages x light and dark** at 1280 px, **9 pages** at 375 px (phone).
- A realistic copy of your Notch project: **68 records** (30 components in a tree, 14 features, 10 issues, decisions, debt, docs).
- Automated: labels on every control, text contrast (WCAG AA 4.5:1), click-target size (WCAG 2.2: 24 px), sideways overflow, headings, landmarks, page titles.
- Interaction: 9 everyday tasks counted in clicks, save feedback, panel behaviour with Escape, history page.
- Not done: a real screen reader, real users, and your live homelab copy.

## Everyday tasks, counted

| Task | Clicks | Verdict |
|---|---|---|
| See what needs me | 1 (Needs you) | Good |
| Find a plugin's version or install state | 2 (Structure, Table), or Ctrl+K | Good |
| Mark a component Completed | 3 (open, status, confirm) | Good |
| Change another status | 2 | Good |
| Approve one or many drafts | 3, plus ticks | Good |
| Report an issue | 3 plus typing | Good |
| Move a component | 1 drag, or 4 via Edit | OK, drag has no keyboard route |
| Add a one-line feature idea | 3 (Features, Describe, name, Save and finish later) | **Poor: lands on a full page, shortcut hidden inside a 7-step wizard** |
| Re-find something old (history) | n/a | **Poor: 71 rows, one filter, no search** |

## Findings

### P1

| # | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|
| 1 | **Sidebar is too long at scale.** The component tree is fully open, so Project Definition and the folded groups sit far below the fold. | 36 tree rows; sidebar is about 2,090 px tall in an 800 px window. | Open only the first level by default, give the tree its own scroll area with a height cap, remember what the user opened. | S |
| 2 | **No confirmation that a save worked.** | Clicking Save on a feature changes nothing visible and there is no status region for screen readers. | A small "Saved" confirmation (and a polite live region). | S |
| 3 | **No inline quick-add.** Capturing one idea means opening a wizard. | See task table. | A one-line "Add a feature / issue / task" field at the top of each list. | M |
| 4 | **Two side-panel systems.** Decisions, docs, debt, tasks and roadmap use an older panel. | It has no dialog role and **Escape does not close it**. The newer panel (issues, structure) does both. | Switch the old ones to the shared panel. | S |
| 5 | **Dense pages.** Needs you and the Structure tree carry too many always-visible controls. | Needs you: about 160 controls and 1,000 words for 50 drafts. Structure: about 148 controls (3 buttons per row). | Show row actions on hover or focus, or behind one "..." menu; show the first 10 drafts per group with "show more". | M |

### P2

| # | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|
| 6 | **"Fixed (needs retest)" issues do not appear in Needs you**, although only you can verify them. | The Needs you list covers decisions, questions and drafts only. | Add them as a third group. | S |
| 7 | **History is hard to use.** | 71 rows in one list, one filter, no search, not grouped by day, entries do not link to the item. | Group by day, add search, link each entry. | M |
| 8 | **Every page has the same tab title** ("Kaiju Planner"). | Checked on 4 routes. | Set the title per page. | S |
| 9 | **Contrast just under AA.** | Type badges (Plugin, Subplugin, Integration) measure **4.3:1** in dark theme (29 on the Structure page); "Approved" badges **4.4:1** in light. Limit is 4.5. | Nudge the badge colours. | S |
| 10 | **Small click targets.** | Tree arrows are 20 px wide; several `text-xs` links and buttons are under 24 px. | Minimum 24 px, 32 px on touch. | S |
| 11 | **Needs you overflows sideways on a phone.** | Filter drop-downs with long component paths. | Let the filters wrap and truncate. | S |
| 12 | **No warning about unsaved edits.** | No leave-page guard in the code. | Ask before leaving a changed form. | S |
| 13 | **No undo** for moves, status changes or bulk approve. | Only delete asks first. | A 10-second "Undo" message after those actions. | M |
| 14 | **A render error would blank the page.** | No error boundary in the app. | One error boundary with a friendly message and a reload button. | S |

### P3

| # | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|
| 15 | Two top-level headings on a component's Issues tab. | 2 `h1` found. | Component title stays `h1`, page title becomes `h2`. | S |
| 16 | Changing status inside an edit panel closes the panel. | It reuses the "saved" callback. | Keep the panel open. | S |
| 17 | No "skip to content" link, and `main` has no id. | Checked. | Add one. | S |
| 18 | Drag-to-move has no keyboard alternative. | Only mouse drag in the tree. | A "Move..." action in the row menu. | M |
| 19 | Tips are easy to miss: Ctrl+K, Table and Map views, drag to move. | Each has a single line of help. | A "Tips" line on first visit. | S |

## What already works well

- **Every control is labelled** on all 21 pages in both themes (0 unlabelled).
- **No sideways scrolling** on 8 of 9 phone pages.
- **One status control** everywhere, with in-app confirmation before Completed and a clear "approve first" lock.
- **Safety is visible:** nothing is approved or completed silently, and AI work is labelled.
- **Empty states** tell you the next step, landmarks and a focus outline exist, and Ctrl+K search works.

## Suggested order

1. #1, #2, #4 (about 2 hours, the biggest feel difference).
2. #6, #8, #9, #10, #11 (about 2 hours, all small).
3. #3, #5, #7 (about a day, they change how big projects feel).
4. The rest as time allows.

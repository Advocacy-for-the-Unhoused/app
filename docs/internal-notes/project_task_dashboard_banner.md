---
name: project-task-dashboard-banner
description: "SHIPPED 2026-07-08 — Home dashboard 'Your Tasks' card showing the signed-in user's incomplete Task Board tasks"
metadata: 
  node_type: memory
  type: project
  originSessionId: c821e419-809b-4dd9-9e3b-3b54565db4bd
---

**DONE — shipped 2026-07-08 (commit 51a50b8).** The Home dashboard now has a "📋 Your Tasks" card (`#myTasksCard`) showing the signed-in user's incomplete tasks from the Task Board, placed after the Boston banner / before "Quick Actions". Each row deep-links to the Tasks tab (`onclick="switchTab('tasks')"`), shows a team-colored dot + team label + due chip (overdue/soon/plain, reusing the board's `tbDueClass`/`tbFmtDue`), caps at 5 rows with a "View all N" footer, and hides entirely when the user has zero incomplete tasks.

**How it works (for future edits):**
- `window.tbGetMyTasks(fullName)` — added inside the task board IIFE, exposed on window (index.html). Async: re-fetches the change log via `tbRun('tbGetAllChanges')`, runs `tbApplyChanges` to rebuild `tbTeams` (deterministic — same as the board), then returns this person's `!done` tasks sorted by soonest dueDate. Safe to call before the board tab is ever opened: never touches board DOM, never flips `tbInitialized`.
- `window.renderMyTasksCard()` — global fn in the switchTab `<script>` (index.html). Reads `volunteerProfile.fullName`, calls tbGetMyTasks, renders escaped rows. Called from `switchTab('home')` (right after loadDashboard).
- **Name matching:** assignees are stored as FULL roster names, but `volunteerProfile.firstName` was only the first token. So `getMemberInfo` + `buildMemberResult_` (Code.gs) now also return `fullName` (col B verbatim); app.js stores `fullName: info.fullName || volunteerName` in both `volunteerProfile` blocks (Google + Apple paths). Match is case-insensitive on trimmed full name. **Requires the Code.gs deploy** (done @84) — without it fullName is undefined and the card is always empty.
- **CSS gotcha handled:** rows are `<button>`s, so the global `button{}` rule bleeds in — it forced `text-transform:uppercase` (inherited by `.my-task-text` → fixed with `text-transform:none`), `margin-top:20px` (fixed with `margin:0 0 8px`), and `button:hover` (0,1,1) dark fill won over the base row rule (fixed with explicit `.my-task-row:hover`/`:active`). See [[feedback-flex-button-width]].
- **Dark mode:** card mirrors `.dash-goal` (white bg + `--card-border` + orange shadow). Inner row colors are HARDCODED dark-on-light (`#1a1311` text, `rgba(26,19,17,0.04)` bg) — never the adaptive `--stat-*`/`--camp-cream` vars, which go cream in dark mode and vanish on the white card. See [[feedback-adaptive-vars-context]].

Verified in preview: real tbGetMyTasks pulled live GAS data + filtered correctly; all render states (overflow, chips, natural-case text) and dark-mode legibility confirmed. (Screenshots time out in preview because the GSI login iframe hangs the renderer — used inspect/eval instead.)

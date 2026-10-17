---
name: project-task-board
description: "Task board feature — data model, GAS backend, assignee system, notifications, and due dates"
metadata: 
  node_type: memory
  type: project
  originSessionId: c821e419-809b-4dd9-9e3b-3b54565db4bd
---

## Data storage
- Changes log in "Task Changes" sheet of ROSTER_SS_ID spreadsheet
- Columns: Type | Key | Value | Extra | Timestamp
- Client replays all changes on load via `tbApplyChanges()` on top of `HARDCODED_TEAMS`
- Change types: newTeam, deleteTeam, teamRename, teamColor, teamMeetingDate, teamMeetingTime, newTask, deleteTask, taskDone, taskAssignee, taskText, taskDueDate

## Team members + View Team modal (added 2026-07-05)
- Each team has a `members` array: `{ name, oversees }` — seeded in HARDCODED_TEAMS (officer NOT duplicated in members)
- "View Team" button (meeting-pill style) on every card → `tbOpenTeamView(name)` opens `#tb-team-modal-bg`
- Officer row first (badge in team color) + members below; edit gate `tbCanManageTeam()` = `/[AZPVW]/.test(position)` — NOTE since 2026-07-09 `V` = "active general volunteer" (not "Vice President"), so this gate now grants team-management (add/remove members, reassign officer) to **every active volunteer**. User confirmed 2026-07-09 this is intentional — keep the collaborative behavior. See [[project-app-store-bugs]] item 1.
- Branch Coord team (name matches /branch coord/i) shows per-member "oversees" branch `<select>`; branch list from `action=getBranches` (GAS, added 2026-07-05) with hardcoded 5-branch fallback, cached in `tbBranchList`
- Change types: `teamMemberAdd`/`teamMemberRemove` (key = `team||member`, replayed in order), `memberOversees` (deduped), `teamOfficer` (deduped, key = team name). NO GAS changes needed — tbSaveChange is generic
- Member key helpers: `tbMemberKey()` / `tbSplitMemberKey()` split on first `||`
- Officer edit uses `prompt()` + roster validation
- **Global button width:100% gotcha hit again** — modal buttons/selects need explicit `width:auto; margin:0` or they crush flex siblings to 0 (see [[feedback-flex-button-width]])

## Task instructions (added 2026-07-06)
- Optional `instructions` field per task — lengthy explanations from the task creator, shown only in the Task Details modal (`.tb-task-instr` block: pre-wrap, orange left border, own dark-mode rules) under an "Instructions" label
- Card indicator: `bi-journal-text` icon (`.task-instr-ico`) prefixes task text when instructions exist
- Change type `taskInstructions` (deduped); `newTask` extra JSON also accepts `instructions`. No Code.gs changes (tbSaveChange generic)
- Edit view (`tbTaskViewEdit`) has two labeled textareas (`#tb-task-edit-ta` title, `#tb-task-instr-ta` instructions); `tbTaskViewSave` diffs and posts only changed fields
- Two ways to add instructions: (1) task details → Edit Task, OR (2) **at creation time** in the quick-add row (added 2026-07-07)
- **Quick-add instructions (2026-07-07)**: `.add-task-row` is now a flex column: `.add-task-main` (title input + `.add-task-instr-btn` journal-icon toggle) then a collapsible `.add-task-instr-wrap` (textarea + `.add-task-submit` "Add task" button), shown when row has `.instr-open`. `tbAddTaskKey` now delegates to shared `tbCommitAddTask(row, teamName)`; new `tbAddTaskBtn(btn,teamName)` + `tbToggleAddInstr(btn)` (both window-exposed). Enter in title still commits (reads both fields); textarea Enter = newline, use the button. Submit needs explicit `width:auto` (global button{width:100%} trap). No Code.gs change — `newTask` extra JSON already carries+replays `instructions`.

## Task Details modal + overflow-proof layout (added 2026-07-05)
- Clicking task text no longer inline-edits — it opens `#tb-task-modal-bg` via `tbOpenTaskView(id)`: full text (pre-wrap, scrollable), meta rows (team/assignee/due/status), "Edit Task" → textarea (`tbTaskViewEdit`/`tbTaskViewSave`, saves via existing `taskText` change type). `tbEditTaskText` + `.task-text-input` were deleted.
- `.task-text-btn` clamps to 2 lines (`-webkit-line-clamp:2` + `overflow-wrap:anywhere`); `.assignee-tag` is `display:inline-block; max-width:84px` with ellipsis (text-overflow doesn't work on inline-flex) — task text can never cross the assignee divider.
- Team card header **always stacks** (name row / officer / pill row) — the desktop row layout was removed because name + officer + meeting pill + View Team competed for width and overlapped. `.team-header-bottom` has `flex-wrap:wrap`; `.meeting-pill` is `flex:1 1 auto; min-width:0; width:auto` (global `button{width:100%}` otherwise makes each pill a full row).
- **Dark mode**: all Tasks-tab modals (`.modal-box` in add-team, view-team, task-details, hours-prompt) adapt via a `@media (prefers-color-scheme: dark)` block at the end of the tasks CSS (~line 2297) — dark box `#211815`, inputs/selects/textarea `#2b211d` + cream text, btn-primary gets cream border/shadow, hours-prompt `<p>` needs `!important` (inline style). Rest of the tab stays cream by design. Content area is only ~335px wide on a 375px phone; task text column ≈ 95-110px.

## Assignee system
- **Roster-enforced since 2026-07-05**: tbEditAssignee save validates against tbLoadRosterNames() case-insensitively, canonicalizes spelling, rejects unknown names with tbToastError (skips validation only if roster list is empty/failed to load)
- **Old-data cleanup (2026-07-08, confirmed working in production)**: `tbSanitizeAssignees()` runs on every load (fired from `tbLoadData` after `tbApplyChanges`). Clears any task assignee not on the roster (case-insensitive) — fixes pre-enforcement free-text junk like "haha"/"duck" that the change log replays unconditionally — and persists a `taskAssignee`=`''` clear per task so the fix is permanent for all clients. Skips entirely if roster fails to load (never wrongly clears). New tasks are already safe: created with empty assignee, and tbEditAssignee is the only assignee-set path. No Code.gs change — reuses tbGetRosterNames + tbSaveChange. Frontend-only, no clasp deploy.
- Assignees are stored as **full roster names** (e.g. "Sanya Bhagat", not "Sanya")
- Notification lookup: GAS matches assignee string case-insensitively against Roster column B → gets email from column D → looks up FCM token
- Autocomplete: frontend calls `tbGetRosterNames()` (GAS) lazily on first edit, populates a `<datalist id="tb-roster-dl">` for native browser suggestions
- All HARDCODED_TEAMS assignees were updated 2026-06-14 to use full names matching the Roster

## Notifications
- **On assignment**: `tbSaveChange` (GAS) fires push "Task Assigned — You've been assigned '[task text]'" when type=taskAssignee
- **Due tomorrow**: `tbCheckDueDates()` (GAS) runs daily at 9am via time-based trigger; reconstructs task state from change log, sends push to assignee if dueDate = tomorrow and task not done
- Trigger installed by running `setupMeetingTrigger()` or `setupAllTriggers()` in GAS editor (setupTaskDueTrigger is called automatically from setupMeetingTrigger)

## Due dates
- Each task has a `dueDate` field (stored as 'yyyy-MM-dd' string)
- Displayed as a chip below task text: gray=future, orange=due today/tomorrow, red=overdue
- Clicking chip opens native date picker via `tbEditDueDate(id)`
- Change type: taskDueDate (deduped per task)

## Window exposure (critical)
- All task board code lives inside an IIFE — functions are NOT globally scoped
- Every function called from an `onclick="..."` attribute MUST be explicitly assigned to `window.*` at the bottom of the IIFE (index.html ~line 5817)
- Current list: initTaskBoard, tbOpenModal, tbCloseModal, tbPickColor, tbConfirmAddTeam, tbEditTeamName, tbConfirmDeleteTeam, tbEditMeeting, tbToggleDone, tbCloseHoursPrompt, tbGoToHours, tbToggleShowDone, tbEditAssignee, tbAddTaskKey, tbAddTaskBtn, tbToggleAddInstr, tbDeleteTask, tbEditDueDate, tbOpenTeamView, tbCloseTeamView, tbAddMemberCommit, tbRemoveMember, tbSetOversees, tbEditOfficer, tbOpenTaskView, tbCloseTaskView, tbRenderTaskView, tbTaskViewEdit, tbTaskViewSave, tbGetMyTasks (tbEditTaskText removed 2026-07-05; tbAddTaskBtn/tbToggleAddInstr added 2026-07-07; tbGetMyTasks added 2026-07-08 — async, feeds the Home "Your Tasks" card, see [[project-task-dashboard-banner]])
- Missing a window assignment = onclick fires but function not found = silent no-op

## HARDCODED_TEAMS assignee reference (as of 2026-06-14)
Web Dev (officer: Sanya Bhagat): Sanya Bhagat, Pranav Warrier, Dharshna Karthick
Social Media (officer: Sreenidhi Rajesh): Priyanka Jagannath, Evalynn Ashley, Maanya Shettigar, Sreenisha Rajesh, Akshaya Mavalur
Finance (officer: Yaashwanth Narendran): Yaashwanth Narendran, Madhav Warrier
Branch Coord (officer: Maanya Shettigar): Maanya Shettigar, Lakshya Chauhan
Admin Tasks (officer: Madhav Saxena): Madhav Saxena, Yaashwanth Narendran, Sreenidhi Rajesh, Maanya Shettigar, Dilpreet Gill

Note: Madhav Warrier (madhav.s.warrier@gmail.com) is in the Roster sheet further down — not in the first batch of entries.

---
name: project-meeting-schedule
description: "Branch Management panel — meeting schedule, leadership, fundraising tracker; GAS keys, role gates, UI structure"
metadata: 
  node_type: memory
  type: project
  originSessionId: b45ea0b5-dc53-4d34-9bce-40886106c698
---

# Branch Management Panel (renamed from "Branch Meetings" 2026-06-14)

Admin tab section renamed: eyebrow "BRANCHES", title "Branch Management". Replaces the old "Branch Meetings" section.

## GAS storage

### Meeting Config sheet (ROSTER_SS_ID, "Meeting Config")

| Key | Meaning |
|-----|---------|
| `meetingDay_<bc>` | Branch meeting day (0=Sun … 6=Sat) |
| `meetingTime_<bc>` | Branch meeting time (24h "HH:MM") |
| `cancel_<bc>` | "Yes"/"No" — cancel this week; auto-reset after push fires |
| `goal_<bc>` | Branch fundraising goal (float, default = BRANCH_GOAL_TARGET = 5000) |

### Branches sheet (ROSTER_SS_ID, "Branches")

Dynamically managed. Seeded from `BRANCH_NAMES` constant on first access.  
Columns: A = code (e.g. "A"), B = name (e.g. "Hopkinton")  
Add Branch writes here + initializes Meeting Config keys.

## GAS actions

- `action=getBranchManagement` → `{ branches: [{ code, name, meetingDay, meetingTime, cancelled, goal, raised, leadership }] }`
  - `raised` = live sum from DONATIONS_SS_ID Sheet1 col F (branch code) col B (amount)
  - `leadership` = roster members with non-empty col A (role code) for that branch
- `action=addBranch&code=X&name=Name` → `{ ok: true }` — A/Z only; writes to Branches sheet + initializes config keys
- `action=saveBranchGoal&branchCode=A&goal=7500` → `{ ok: true }` — saves `goal_A` to Meeting Config
- `action=setBranchLeaderRole&email=x@y.com&roleCode=P` → `{ ok: true }` — updates roster col A; pass empty roleCode to remove from leadership
- `action=saveMeetingConfig&branchCode=A&day=2` / `&time=17:00` → saves meeting schedule
- `action=cancelMeeting&branchCode=A&cancelled=Yes` → saves cancel flag

## Branch card UI (2026-06-14)

Each branch renders as a card with a clickable dark header. Clicking the header collapses/expands the body.
- Header: `display:flex; justify-content:space-between` with branch name + code on the left, chevron `<i id="branch-chevron-{code}">` on the right
- Body: `<div id="branch-body-{code}">` — set `display:none` to collapse, chevron rotates 180°
- Toggle function: `toggleBranchCard(branchCode)` (window-exposed)
- Branches start expanded by default

## Frontend functions (window-exposed)

- `loadBranchManagement()` — main loader; also aliased as `window.loadMeetingConfig` for backward compat
- `showAddBranchForm()` — toggles inline Add Branch form (A/Z only)
- `submitAddBranch()` — reads #nb-code / #nb-name, calls addBranch action
- `showAddLeaderForm(branchCode)` — toggles inline add-leader form per branch
- `submitAddLeader(branchCode)` — reads dropdown + role input, calls setBranchLeaderRole
- `removeLeader(email, branchCode)` — confirm + calls setBranchLeaderRole with empty roleCode
- `toggleGoalEdit(branchCode)` — toggles goal view vs edit mode
- `saveGoal(branchCode)` — reads #goal-input-X, calls saveBranchGoal
- `saveMeetingDay/Time/Cancel` — unchanged meeting schedule helpers

## Role gates

| Who | Can see | Can edit |
|-----|---------|----------|
| A / Z | All branches | All branches (meeting, leadership, goal, add branch) |
| P | Own branch only | Own branch (meeting, leadership, goal) |
| C (Branch Coord, added 2026-07-05) | All branches (read-only) | Add Branch only |

`action=getBranches` (added 2026-07-05) returns `{ branches: getBranches_() }` — lightweight branch list used by the task board's oversees dropdown.

Leadership = any roster member with a non-empty role code in col A.  
"Add to Leadership" populates from `getRosterMembers` filtered to non-leaders in that branch.

## checkMeetingNotifications (hourly trigger — unchanged)

Loops over branches from BRANCH_NAMES constant (not dynamic Branches sheet). Push notifications still use hardcoded branch list.

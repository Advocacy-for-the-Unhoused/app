---
name: project-admin-tab
description: "Current state of #tabAdmin — 7 collapsible sections, auth gate plan, hours editor, volunteer approvals, comp requests"
metadata:
  node_type: memory
  type: project
  originSessionId: 6aa85aac-9fec-495c-a409-d5f827436f83
---

# Admin Tab (`#tabAdmin`) — Current State (as of 2026-06-17)

All admin controls live in `#tabAdmin`. No per-page admin gates remain. All per-section gates were removed 2026-06-13.

## Auth Gate (not yet built)

**Plan:** At sign-in, check `window.volunteerProfile.email` against a hardcoded officer list → set `window.isAdmin = true` in `app.js onSignedIn()`. `switchTab('admin')` checks `window.isAdmin` — if false, show `#admin-lock` card instead.

**Known officers:** Madhav Saxena (madhavsaxenaninja@gmail.com), Maanya Shettigar, Sanya Bhagat, Sreenidhi Rajesh, Yaashwanth Narendran.

**Where to wire it:** `onSignedIn()` in app.js (lines 1–139); `switchTab('admin')` in index.html (~line 2411).

Currently gated only by position regex `/[AZP]/` on the nav tab visibility.

---

## Structure

All sections collapsible by default. `toggleAdminSection(id)` collapses others when one opens.

**Restructured 2026-07-05 — Boston sections nested under one parent panel:**

```
#tabAdmin
  .admin-section #boston-section         ← "Boston Trip" PARENT panel (eyebrow "July 2026")
      .admin-section #finance-section    ← Finance Panel (vol costs, paid status)
      .admin-section #reg-section        ← Trip Registrations
      .admin-section #qual-section       ← Qualified Persons
      .admin-section #settings-section   ← Trip Banner toggle (bostonBannerToggle)
  .admin-section #hours-section          ← Volunteer Hours Editor
      #hrs-pending-pill  (badge: pending count)
      .hrs-tabs  (Pending Requests | Assign Hours | All Hours)
  .admin-section #pending-section        ← Volunteer Approvals
      #pending-count-pill / #pending-vol-body
  .admin-section #comp-section           ← Reimbursement Requests
      #comp-count-pill / #comp-requests-body
  .admin-section #meeting-section        ← Branch Management
      #meeting-config-body               ← rendered by loadBranchManagement()
```

`toggleAdminSection(id)` is **nesting-aware**: collapses others but never an ancestor/descendant of the toggled section. CSS: `.admin-section.open > .admin-section-body` (direct child!), nested sections get `border-left: 3px solid var(--orange); margin-left: 12px`.

**Admin gate is `/[AZPC]/` since 2026-07-05** (C = Branch Coord team member — needs access to add branches). In Branch Management, C sees ALL branches read-only + the Add Branch button; branch canEdit stays `/[AZP]/`-based.

## CSS variables

`#tabAdmin` has its own `--orange`, `--cream`, `--dark`, `--border`, `--green` variables defined inline — same values as `#tabBoston` and `#tabTasks`. See [[feedback-admin-css-vars]].

## Data loading

`switchTab('admin')` calls `window.loadAdmin()` which:
1. Loads Finance Panel via `action=getAllVolunteers`
2. Calls `loadRegistrations()` → `action=getQualifiedNames`
3. Calls `loadHoursSection()` → `action=getAllHours` + `action=getRosterMembers`
4. Calls `loadPendingVolunteers()` (added 2026-06-17)
5. Calls `loadCompRequests()` (added 2026-06-17)

---

## Finance Panel paid-toggle-strip layout

Each volunteer card (`#finance-section .vol-card`) has `.paid-toggle-strip` rows. Buttons shortened:
- Train: "Mark Train" (unpaid) / "Unmark" (paid)
- Full payment: "Mark Paid" (unpaid) / "Unmark" (paid)

**CSS fix:** `.paid-toggle-btn` needs `width: fit-content`. `.paid-toggle-strip-label` has `flex: 1; min-width: 0; overflow: hidden`. See [[feedback-flex-button-width]].

---

## Hours Editor

### Backend actions (Code.gs)
- `action=getRosterMembers` → `{ members: [{name, email, branchCode}] }` sorted alphabetically
- `action=getAllHours` → `{ records: [{rowIndex, email, name, eventName, date, hours, approved}] }` — rows from row 2
- `action=approveHours` + `rowIndex` → sets col F = "Yes"
- `action=denyHours` + `rowIndex` → sets col F = "Denied" (non-destructive since 2026-06-17)
- `action=adminAssignHours` + `email`, `eventName`, `eventDate`, `hours` → appends pre-approved row

### Frontend variables (IIFE-scoped)
- `hrsAllRecords` — all hour records from `getAllHours`
- `hrsRoster` — `{name, email}` array from `getRosterMembers`
- `hrsAssignEmail` — resolved email from autocomplete (cleared on manual input)

### Autocomplete pattern
`#hrs-assign-name` text input with `oninput/onfocus → hrsFilterNames`, `onblur → setTimeout(hrsHideDropdown, 180)`. Dropdown uses `onmousedown` (not onclick) to fire before blur. `hrsAssignEmail` must be set (not manually typed) to submit.

---

## Volunteer Approvals section

### GAS functions
- `getPendingVolunteers()` → `[{rowIndex, name, phone, email, photoUrl, branchCode}]` — Status="Pending" rows only
- `approveVolunteer(rowIndex)` → sets Status="Approved", inserts into Roster after last row with matching branch code (col F)
- `denyVolunteer(rowIndex)` → sets Status="Denied"
- Both send push to volunteer.

### Permission rules
- A/Z: see all branches
- P: see only own branch (filtered client-side by `pendingCanSeeBranch`)

### Frontend functions (all window-exposed)
`loadPendingVolunteers`, `renderPendingVolunteers`, `pendingApprove(rowIndex)`, `pendingDeny(rowIndex)`

### "Pending Volunteers" sheet layout
Sheet in ROSTER_SS_ID: Col A=Name, B=Phone, C=Email, D=Photo URL, E=Branch Code, F=Status. Data from row 2.

---

## Comp Requests section — see [[project-comp-requests]]

---

## All Hours tab (3rd tab in hours section)

`switchHrsTab('all')` → `#hrs-panel-all`. `renderAllHours()` aggregates `hrsAllRecords` by email, sorts by total hours descending. Each person is a `.hrs-person-row` (clickable) + `.hrs-breakdown` (hidden until click). `toggleHrsBreakdown(key)` toggles `.open`. Unapproved entries show red "pending" badge.

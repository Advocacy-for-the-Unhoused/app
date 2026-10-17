---
name: project-afu-portal
description: "Complete AFU Volunteer Portal app structure — files, auth, tabs, GAS backend, spreadsheet IDs, branch config, Boston trip, and notification infrastructure."
metadata:
  node_type: memory
  type: project
  originSessionId: 2b361f7a-9de0-49a0-8e22-da723ae96d16
---

# AFU (Advocacy for the Unhoused) Volunteer Portal

Single-page PWA served as a static file. No build step — edit `index.html`, `app.js`, `Code.gs` directly.

---

## Files

| File | Size | Role |
|------|------|------|
| `index.html` | ~664KB / ~3100 lines | Entire frontend: all CSS, HTML tabs, inline `<script>` blocks |
| `app.js` | ~710 lines | Sign-in, donations, hours, volunteer registration, QR scanner |
| `Code.gs` | ~783 lines | Google Apps Script backend (deployed as web app) |
| `service-worker.js` | small | PWA service worker — caches assets for offline use |
| `originalbostonindex.html` | ~613KB | Original standalone Boston trip form — reference/archive only |

---

## Backend: SCRIPT_URL + action routing

**Single endpoint** (defined at top of `app.js`):
```
https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec
```

All requests are `POST` with `Content-Type: application/x-www-form-urlencoded`.
`Code.gs` dispatches in `doPost(e)` on `e.parameter.action` (or legacy `e.parameter.lookupEmail`, `e.parameter.udi`, `e.parameter.getDashboard`).

**Boston tab** uses `gasCall(method, params, onSuccess, onFailure)` wrapper inside its IIFE — same URL, same pattern.

**To add a new backend action:** add `else if (p.action === "yourAction") { ... }` in `Code.gs doPost`, then call from frontend with `fetch(SCRIPT_URL, { method:'POST', body:'action=yourAction&param=value' })`.

**`window.gasFetch(body, opts)` — shared request helper (added 2026-07-07):** early inline `<script>` in `index.html` `<head>`. Wraps the POST-to-SCRIPT_URL pattern, checks `res.ok`, rejects HTML error pages, and returns parsed JSON. Purpose: GAS intermittently 404s its `googleusercontent.com/macros/echo` redirect under concurrent request load (e.g. the finance panel's `loadAdmin()` firing ~7 loaders at once), which surfaced as "Failed to load" / `Unexpected token '<'`. Helper **retries read actions** (name matches `/^(get|tbGet)/i`) 3× with backoff so a flaky 404 self-heals; **write actions are NOT retried** (retries=0, at-most-once — a 404 can mean the row already committed, so retrying would duplicate). Prefer `window.gasFetch` over raw `fetch(...).then(r=>r.json())` for any new GAS call. Already routed: `gasCall` (Boston), `tbRun` (task board), `loadQualifiedPersons`, `loadPendingVolunteers`, `loadCompRequests`. GOTCHA that bit us: the helper's `/* */` doc comment must not contain `*/` in prose (e.g. `get*/tbGet*`) — it closes the comment early and breaks the entire inline script, leaving `window.gasFetch` undefined. See [[feedback-no-gas-run]].

---

## Spreadsheet IDs (Code.gs constants)

```js
DONATIONS_SS_ID   = "1t6CbQ_QkK5ptPPZ9MtlNit2zpz5wY7siu5hc8oCdeZg"  // donations log
ROSTER_SS_ID      = "1hcKgLSqLw1Fn4S7kOtBXXwt2ZL307WK1JTH-1jsMHaM"  // volunteer roster + hours
UDI_TRACKER_SS_ID = "11QQE2yxYs-wI0r1jyjenXNI19KM5P49ervmcGDlWoyw"  // UDI slip tracker
BOSTON_SHEET_ID   = "1_BGGoyYgYK__XGkE3VqlxN7oqDuPbyq7YAZshFil8v8"  // Boston trip data
// HOURS_SS_ID and SHEET_ID both equal ROSTER_SS_ID
```

**Sheet names used:**
- Roster SS: `"Roster"` (col A = blank, col B = full name, col C = phone, col D = email, col E = position, col F = branch code, col G = photo URL, col H = Active?, col I = DoB). `getRosterMembers` returns `{name, phone, email}`., `"volunteer hours"` (rows from row 4; col B=email, C=eventName, D=date, E=hours, F=approved), `"Pending Volunteers"` (A=Name, B=Phone, C=Email, D=Photo URL, E=Branch Code, F=Status)
- Boston SS: `"Qualified Persons Form"` (col A=name, B=email, **C=DoB as date value** (was "Minor? Yes/No" before 2026-06-15; legacy Yes/No rows still handled), D=phone, E=timestamp, F=shirt, G=infoConfirmed, H=parentName, I=parentEmail, J=parentPhone, K=feeAck, L=permission, M=signature), `"Costs"` (col A=name, B=branch, C=email, D=trainTicket, E=shirtCost, F=empty, G=busCost, H=paid, I=trainPaid), `"Food"` (A=id, B=email, C=item, D=cost), `"Itinerary"` (A=key, B=value)
- Donations SS: `"Sheet1"` (A=udi, B=amount, D=volunteerName, F=branchLetter)
- Roster SS (new sheet): `"Comp Requests"` (A=ID, B=Name, C=Email, D=Branch, E=Amount, F=Description, G=PayMethod, H=PayHandle, I=ImageUrl, J=Status, K=SubmittedAt) — auto-created by `getCompSheet_()`

---

## All backend actions (Code.gs)

**General:**
- `lookupEmail` (legacy GET/POST param) → `getMemberInfo(email)` — roster lookup by email; returns `{ firstName, branchCode, branchName, position, photoUrl }` (photoUrl = col G Drive URL)
- `action=registerVolunteer` → saves to Pending Volunteers, emails branch president + NOTIFY_ALL
- `action=generateSlips` + `dateString`, `branchCode` → creates Google Doc + PDF of UDI slips
- `action=getEventTypes` → returns event list from hours sheet col A
- `action=getMyHours` + `email` → returns volunteer's hours records
- `action=submitHours` + `email`, `eventName`, `eventDate`, `hours` → appends to hours sheet (col F = "No")
- `action=getRosterMembers` → returns `{ members: [{name, email, branchCode}] }` from Roster sheet, sorted by name (branchCode = col F single letter)
- `action=getPendingVolunteers` → returns `{ volunteers: [{rowIndex, name, phone, email, photoUrl, branchCode}] }` — only Status="Pending" rows from "Pending Volunteers" sheet
- `action=approveVolunteer` + `rowIndex` → sets Status="Approved" in Pending sheet, inserts new row into Roster **after the last existing row with the same branch code** (col F) so the sheet stays branch-grouped; falls back to end of sheet if no match. Sends push to volunteer.
- `action=denyVolunteer` + `rowIndex` → sets Status="Denied" in Pending sheet, sends push to volunteer
- `action=getAllHours` → returns `{ records: [{rowIndex, email, name, eventName, date, hours, approved}] }` for admin view; joins Roster for names
- `action=approveHours` + `rowIndex` → sets col F = "Yes"
- `action=denyHours` + `rowIndex` → **deletes the row** from the sheet
- `action=adminAssignHours` + `email`, `eventName`, `eventDate`, `hours` → appends pre-approved row (col F = "Yes")
- `getDashboard` + `branch` → returns hoursApproved, donationCount, goalRaised, recentActivity
- `udi` (legacy) → `handleDonation` — logs donation, dedupes by UDI
- `action=getMeetingConfig` → returns full Meeting Config sheet as key/value object
- `action=saveMeetingConfig` + `branchCode`, `day` or `time` → writes `meetingDay_<bc>` / `meetingTime_<bc>` to Meeting Config sheet
- `action=cancelMeeting` + `branchCode`, `cancelled` ("Yes"/"No") → writes `cancel_<bc>` to Meeting Config sheet
- `action=getBranches` (added 2026-07-05) → `{ branches: [{code, name}] }` from Branches sheet — lightweight, used by task board oversees dropdown

**Reimbursement requests (added 2026-06-16):** See [[project-comp-requests]] for full details.
- `action=submitCompRequest` + `email, amount, description, payMethod, payHandle, imageBase64, imageMime` → uploads receipt image to branch Drive folder, appends to "Comp Requests" sheet, pushes A/Z/FO
- `action=getCompRequests` → returns `{ requests: [...] }` all rows (admin view)
- `action=getMyCompRequests` + `email` → volunteer's own requests only
- `action=approveCompRequest` + `id` → sets Status=Approved, pushes volunteer
- `action=denyCompRequest` + `id` → sets Status=Denied, pushes volunteer
- `action=deleteAccount` + `email` → clears **col D only** (email cell) in Roster sheet — does NOT delete the row; returns `{ success: true }` or `{ error }`. Called from `deleteAccount()` in app.js which also clears biometric key and signs the user out.
- `action=updateProfilePhoto` + `email`, `photoBase64`, `photoMime` (added 2026-07-18) → for volunteers who skipped the onboarding photo. `updateProfilePhoto_()` finds the roster row by email, uploads to the branch Drive folder (`BRANCH_CONFIG[branchName].folderId`), writes the shareable URL to **Roster col G**, returns `{ success, photoUrl }` (thumbnail form). Frontend: tappable `.dash-profile-card` on Home (`#dashProfileCard`, `onclick="openProfilePhotoPicker()"`) → hidden `#profilePhotoInput` → `handleProfilePhotoPick()` in index.html inline script (uses `window.gasFetch`, optimistic avatar preview with revert-on-failure). The "add a photo" prompt (`＋` badge + `#dashPhotoHint`) shows only when `.dash-profile-card.no-photo`, toggled by `window.refreshProfilePhotoUI()` (called from `switchTab('home')`) based on `window.volunteerProfile.hasRosterPhoto`. **`hasRosterPhoto` = `!!info.photoUrl`** (roster col G present) — set in BOTH sign-in paths in app.js; distinct from `photoUrl` which falls back to the Google OAuth picture, so Google users with no roster photo still get prompted. Deployed @90.

**Boston trip:**
- `action=getQualifiedNames` → returns `[{name, email, isMinor, dob, phone, rowIndex, isRegistered}]` from "Qualified Persons Form"; `isMinor` computed dynamically from DoB (age < 18); backwards-compatible with legacy Yes/No in col C
- `action=addQualifiedPerson&name=&email=&phone=&dob=YYYY-MM-DD` → appends to Qualified Persons Form (col C = date), **also writes DoB to Roster col I** via `saveDobToRoster_()`; old param was `isMinor=true/false` (removed 2026-06-15)
- `action=bostonSubmitForm` + form fields → writes registration data to Boston sheet
- `action=getVolunteerBill` + `email` → returns costs + food items for one volunteer
- `action=getAllVolunteers` → full roster with costs + food for admin view
- `action=updateVolunteerPaid` + `email`, `paid` → marks col G Yes/No
- `action=updateVolunteerTrainPaid` + `email`, `paid` → marks col H Yes/No
- `action=updateVolunteerFixed` + `email`, `key` (trainTicket/shirtCost/busCost), `val` → updates Costs sheet
- `action=addFoodItem` + `email`, `item`, `cost` → appends to Food sheet
- `action=updateFoodItem` + `id`, `item`, `cost` → updates Food row
- `action=deleteFoodItem` + `id` → deletes Food row
- `action=getItineraryData` → returns key/value pairs from Itinerary sheet
- `action=saveItineraryData` + `data` (JSON string) → upserts Itinerary rows

---

## Branch configuration (Code.gs)

```js
BRANCH_NAMES = { "A": "Hopkinton", "H": "Holliston", "W": "Westford", "S": "Shrewsbury", "M": "Medway" }
BRANCH_CODES = { "Hopkinton": "A", "Holliston": "H", "Westford": "W", "Shrewsbury": "S", "Medway": "M" }

BRANCH_CONFIG = {
  "Hopkinton": { presidentEmail: "dilpreet.whjr@gmail.com",        folderId: "1VT5CX3h0GfCWiNrksW7kXEqMe5KPCbDc" },
  "Westford":  { presidentEmail: "aradhyaak11@gmail.com",           folderId: "1muPAyc8bxzLzuxiBPOcPNP0CZwf5bmWk" },
  "Holliston": { presidentEmail: "diyasimhadri11@gmail.com",        folderId: "1s_sE1bsaAQWEfIYS5rhg9_Pic1IdsEcc" },
  "Medway":    { presidentEmail: "advaith.shivkumar1021@gmail.com", folderId: "1xGaoA4nhTHYkf6yQtRIEjpBMLWKwrPuc" },
}

NOTIFY_ALL = "maanya.shettigar@gmail.com"   // CC'd on all branch registrations
BRANCH_GOAL_TARGET = 5000                    // fundraising goal per branch (dollars)
```

Boston branch colors: `{ A: '#378ADD', W: '#1D9E75', H: '#D4537E', M: '#BA7517' }`

---

## Auth flow (app.js)

1. User clicks "Sign in with Google" → Google Identity Services → `window.onSignedIn()`
2. `onSignedIn` parses JWT (`window.googleCredential`) to get email, name, photo
3. POST `lookupEmail=<email>` to SCRIPT_URL → `getMemberInfo` checks Roster sheet
4. **Not found** → show volunteer registration form (pre-filled from JWT)
5. **Found** → set `window.volunteerProfile`, show `#appContent`, show `#mainNav`, call `switchTab('home')`

```js
window.volunteerProfile = {
  firstName: string,
  branchName: string,
  branchCode: string,   // single letter: A/H/W/S/M
  email: string,        // Google account email — primary user key everywhere
  photoUrl: string | null,   // prefers roster col G Drive URL; falls back to Google OAuth picture
  position: string      // concatenated position codes e.g. "AP", "Z", "" for general volunteer
}
```

**New volunteer registration** (`action=registerVolunteer`):
- Saves to "Pending Volunteers" sheet
- Uploads photo to branch Google Drive folder
- Emails branch president + NOTIFY_ALL via `GmailApp.sendEmail()`
- Frontend then calls `proceedAfterRegistration()` → shows app with "pending approval" state

---

## app.js module breakdown

- **Lines 1–139** — Auth: `onSignedIn`, JWT parse, roster lookup, `loadDashboard` wiring
- **Lines 141–216** — IndexedDB offline sync: `getDB`, `saveDonationOffline`, `syncDonations` (auto-runs on `online` event)
- **Lines 220–272** — Donation UI: `submitDonation`, `restart` — creates UDI (`branchCode + 3-digit number`)
- **Lines 276–374** — QR/barcode scanner: dynamically loads `html5-qrcode`, camera modal
- **Lines 378–455** — UDI slip generator: `runGenerateSlips` → `action=generateSlips` → returns Google Doc + PDF URLs
- **Lines 459–625** — Hours tracker: `loadEventTypes`, `loadMyHours`, `submitHoursRequest`
- **Lines 629–710** — Volunteer registration: `submitRegistration`, `proceedAfterRegistration`

---

## index.html tab structure

`switchTab(name)` in `index.html` controls 6 tabs:

| Tab ID | Name | Content |
|--------|------|---------|
| `tabHome` | home | Dashboard: **only tab with the AFU title card** (`<h1>AFU</h1>` + `.subtitle`); name, branch, hours, donations, goal bar, recent activity + Boston banner |
| `tabDonations` | donations | UDI entry form + QR scanner + UDI slip generator |
| `tabHours` | hours | Hours submission form + history list |
| `tabAdmin` | admin | Admin tools: Finance Panel, Trip Registrations, Volunteer Hours, App Settings, Qualified Persons |
| `tabBoston` | boston | Boston Trip 2026 permission form + payment + admin |
| `tabTasks` | tasks | Task board — teams with tasks, assignees, done states, meeting dates |

Bottom nav: `<nav id="mainNav" class="bottom-nav hidden">` — **5 nav buttons: Tasks · Donate · Home (centered, larger) · Hours · Admin**. Boston removed from nav. Starts hidden, shown after login.

Boston tab is still accessible via the `.boston-banner` card on the Home dashboard. Banner auto-hides after Jul 7 2026; admin can toggle it via App Settings in Admin tab.

---

## Task Board tab (`#tabTasks`)

**Structure:** IIFE at the bottom of `index.html` (after the Boston IIFE). CSS scoped to `#tabTasks`. All functions prefixed `tb` and exposed to `window` for `onclick` handlers.

**Key element IDs:** `tb-canvas`, `tb-modal-bg`, `tb-modal-name`, `tb-color-swatches`, `tb-toast`, `tb-status-dot`, `tb-sync-label`

**Data model — `HARDCODED_TEAMS`:** Baked-in baseline state (reflects all historical sheet changes as of 2026-06-13). Future changes are saved and replayed on top via GAS. Each team object:
```js
{ name, officer, color, meetingDate, meetingTime, tasks: [{id, text, assignee, done}] }
```

**Current teams (hardcoded baseline as of 2026-06-13):**

| Team | Color | Officer | Meeting |
|------|-------|---------|---------|
| Web Dev | #378ADD | Sanya Bhagat | 2026-06-09 15:30 |
| Social Media | #7F77DD | Sreenidhi Rajesh | 2026-06-09 17:00 |
| Finance | #1D9E75 | Yaashwanth Narendran | — |
| Branch Coord | #C8522D | Maanya Shettigar | 2026-06-09 16:30 |
| Admin Tasks | #888780 | Madhav Saxena | — |

**GAS functions (in `Code.gs`):** `tbGetSheet()`, `tbGetAllChanges()`, `tbSaveChange(type, key, value, extra)` — use `ROSTER_SS_ID` spreadsheet, sheet name `"Task Changes"`. Columns: Type | Key | Value | Extra | Timestamp.

**Change types:** `newTeam`, `deleteTeam`, `teamRename`, `teamColor`, `teamMeetingDate`, `teamMeetingTime`, `newTask`, `deleteTask`, `taskDone`, `taskAssignee`, `taskText`. Dedup types (last value wins): taskDone, taskAssignee, taskText, teamRename, teamColor, teamMeetingDate, teamMeetingTime.

**`initTaskBoard`** — lazy, called on first tab switch. Calls `tbGetAllChanges()` via `fetch(SCRIPT_URL)` (action=tbGetAllChanges), applies changes on top of `HARDCODED_TEAMS`, then renders.

**Task board sync (fixed 2026-06-13):** `tbRun(action, ...args)` wraps `fetch(SCRIPT_URL)` — NOT `google.script.run`. `Code.gs doPost` has `action=tbGetAllChanges` and `action=tbSaveChange` routes. `tbSaveChange` POST params: `type`, `key`, `value`, `extra`.

**IIFE scope:** All functions internal except those exposed to `window`: `initTaskBoard`, `tbOpenModal`, `tbCloseModal`, `tbPickColor`, `tbConfirmAddTeam`, `tbEditTeamName`, `tbConfirmDeleteTeam`, `tbEditMeeting`, `tbToggleDone`, `tbEditTaskText`, `tbEditAssignee`, `tbAddTaskKey`, `tbDeleteTask`.

**CSS scoping pattern:** All task board styles prefixed `#tabTasks .classname`. Toast positioned `bottom: calc(72px + 16px + env(safe-area-inset-bottom))` to clear the fixed bottom nav.

**Sticky header (`<header class="site-header">`):** Contains functional elements — `#tb-status-dot`, `#tb-sync-label`, and the `+ Team` button (`tbOpenModal`). The wordmark/branding div was removed (2026-06-17); do NOT remove the header itself.

---

## Home tab title card

The `<h1>AFU</h1>` + `<div class="subtitle">Advocacy for the Unhoused</div>` markup lives **inside `#tabHome`**, immediately before the `.dash-profile-card`. It is the ONLY tab with this branding title — no other tab should have it.

The CSS selectors are scoped: `#tabHome h1` and `#tabHome .subtitle` (not global `h1`/`.subtitle`). Moving them back to global scope would make the title appear on every tab.

---

## Boston tab specifics (index.html)

- **IIFE**: lines ~2112–3111. All functions are local. **Must be explicitly exported to `window`** to work from HTML `onclick` attributes. Block of `window.X = X` assignments lives just before the closing `})();`.
- **IIFE scope trap**: `onclick` attributes evaluate in global scope. IIFE-local *variables* (not just functions) are invisible there too. E.g. `selectedPerson` is IIFE-local — `onclick="showPaymentView(selectedPerson)"` passes `undefined`. Fix: export a wrapper function that closes over the local variable, e.g. `window.viewMyBill = function() { showPaymentView(selectedPerson); }`.
- **Exported functions**: `openAdminModal`, `closeAdminModal`, `checkAdminPassword`, `handleRegSubmit`, `showPaymentView`, `viewMyBill`, `showView`, `openItinEditor`, `closeItinEditor`, `saveItinerary`, `loadAdmin`, `setFilter`, `exitAdmin`, `backToLookup`, `toggleCard`, `showAddFoodRow`, `commitAddFood`, `saveFoodItem`, `deleteFoodItem`
- **Key IIFE-local variables**: `selectedPerson` (the looked-up volunteer object, set by `selectPerson(p)`), `adminUnlocked`, `currentFilter`, `qualifiedNames`
- **Finance panel vol-cards**: start collapsed by default (`.vol-card-body { display:none }`); clicking header toggles `expanded` class via `toggleCard()` which shows the body. Each card has a color bar, name, email, total, paid badge, and expandable cost/food editor.
- **Sub-views** inside `#tabBoston`: `view-lookup` (auto-lookup by email on tab open), `view-registration`, `view-payment`, `view-admin`, `view-itinerary` — switched by `showView(name)`
- **Admin**: no password — `openAdminModal()` calls `showAdmin()` directly
- **CSS variables**: `--orange`, `--dark`, `--cream`, `--green`, `--blue`, `--border`, `--zelle`, `--paypal` scoped to `#tabBoston` (main app uses `--camp-*` prefixed names)
- **gasCall wrapper**: Boston uses its own `gasCall(method, params, onSuccess, onFailure)` function instead of direct fetch — same SCRIPT_URL

---

## Notification infrastructure

**Email already works** — `Code.gs` uses `GmailApp.sendEmail(to, subject, body, {htmlBody})`. Already used for:
- New volunteer registration → emails branch president + `NOTIFY_ALL`

**To add a new notification action:**
1. Add to `Code.gs doPost`: `else if (p.action === "sendNotification") { GmailApp.sendEmail(p.to, p.subject, p.body); result = { success: true }; }`
2. Call from frontend: `fetch(SCRIPT_URL, { method:'POST', body: 'action=sendNotification&to=...&subject=...&body=...' })`
3. To notify all Boston volunteers: use `action=getAllVolunteers` to get emails, then loop + send

**Who to notify:**
- Current user: `window.volunteerProfile.email`
- All Boston trip participants: `action=getAllVolunteers` → array with `.email` per volunteer
- Branch presidents: hardcoded in `BRANCH_CONFIG[branchName].presidentEmail`
- Global notify address: `NOTIFY_ALL = "maanya.shettigar@gmail.com"`

**Push notifications**: `service-worker.js` exists and is registered — could be extended for Web Push API if needed (would require a push server + VAPID keys).

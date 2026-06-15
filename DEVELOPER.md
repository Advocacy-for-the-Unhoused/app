# AFU Volunteer Portal — Developer Documentation

> **Advocacy for the Unhoused (AFU)** — Internal volunteer management app.  
> Written by Madhav Saxena. Last updated June 2026.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [File Structure](#3-file-structure)
4. [How the Backend Works](#4-how-the-backend-works)
5. [Spreadsheets — Data Layer](#5-spreadsheets--data-layer)
6. [Auth Flow](#6-auth-flow)
7. [Tab-by-Tab Breakdown](#7-tab-by-tab-breakdown)
8. [Admin Tab](#8-admin-tab)
9. [Push Notifications](#9-push-notifications)
10. [Position Codes & Permissions](#10-position-codes--permissions)
11. [Branch Configuration](#11-branch-configuration)
12. [Deployment Workflow](#12-deployment-workflow)
13. [Common Patterns & How-Tos](#13-common-patterns--how-tos)
14. [Known Gaps / Pending Work](#14-known-gaps--pending-work)

---

## 1. Overview

This is a **single-page progressive web app (PWA)** for AFU volunteers. It handles:

- Member sign-in (Google OAuth)
- Donation tracking (UDI system)
- Volunteer hours submission & approval
- Task board for internal teams
- Boston Trip 2026 registration & payment management
- Branch management (meetings, goals, leadership)
- Admin tools (volunteer approvals, hours editor, finance)
- Push notifications (FCM)

There is **no build step, no framework, no npm install needed** for the frontend. Edit the files directly and deploy.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS — single `index.html` file + `app.js` |
| Backend | Google Apps Script (GAS) — `Code.gs` deployed as a web app |
| Database | Google Sheets (multiple spreadsheets — see Section 5) |
| Auth | Google Identity Services (GSI) — JWT-based |
| Push notifications | Firebase Cloud Messaging (FCM) via Capacitor |
| Mobile wrapper | Capacitor (iOS — pending Apple enrollment) |
| PWA | `service-worker.js` — caches assets for offline |
| Deploy tool | `clasp` (Google Apps Script CLI) |

---

## 3. File Structure

```
APP/
├── index.html              Main app — ALL frontend: CSS, HTML, JS (≈3100 lines)
├── app.js                  Auth, donations, hours, scanner, volunteer registration (≈710 lines)
├── Code.gs                 GAS backend — handles all HTTP requests (≈900 lines)
├── appsscript.json         GAS project manifest
├── service-worker.js       PWA offline cache
├── .clasp.json             Clasp config (links to the GAS project)
├── .claspignore            Only Code.gs + appsscript.json get pushed to GAS
├── www/                    Copy of root files — used by Capacitor for iOS build
│   ├── index.html          (auto-synced from root by pre-commit git hook)
│   ├── app.js
│   └── service-worker.js
└── originalbostonindex.html  Archive — original standalone Boston form (do not edit)
```

> **`www/` is auto-synced.** A pre-commit git hook copies root files → `www/` on every commit. Never edit `www/` directly.

---

## 4. How the Backend Works

### Single endpoint, action routing

All frontend → backend communication goes through **one URL** (defined as `SCRIPT_URL` at the top of `app.js`):

```
https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec
```

All requests are HTTP `POST` with `Content-Type: application/x-www-form-urlencoded`.

`Code.gs` receives every request in `doPost(e)` and routes on `e.parameter.action`:

```js
// Code.gs pattern
function doPost(e) {
  const p = e.parameter;
  if (p.action === "getMyHours") {
    result = getMyHours(p.email);
  } else if (p.action === "submitHours") {
    result = submitHours(p.email, p.eventName, p.eventDate, p.hours);
  }
  // ... etc
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Calling from the frontend

```js
// Standard pattern — used everywhere in app.js and index.html
fetch(SCRIPT_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'action=submitHours&email=' + encodeURIComponent(email) + '&hours=2'
}).then(r => r.json()).then(data => {
  if (data.error) { /* handle error */ }
  else { /* use data */ }
});
```

> **Never use `google.script.run`.** This app is a static file served externally — `google.script.run` only works inside GAS's own HTML service. Always use `fetch(SCRIPT_URL, ...)`.

### SCRIPT_URL scope note

`SCRIPT_URL` is a `const` defined in `app.js`, **not** on `window`. Inline scripts inside `index.html` that need it must use `window.SCRIPT_URL` (which app.js sets) or hardcode the URL with a fallback:

```js
// In index.html inline scripts:
var su = window.SCRIPT_URL || 'https://script.google.com/macros/s/AKfycb.../exec';
```

### Boston tab: `gasCall` wrapper

The Boston trip IIFE uses its own thin wrapper instead of raw fetch:

```js
function gasCall(method, params, onSuccess, onFailure) { ... }
```

Same URL, same pattern — just a convenience wrapper.

### Adding a new backend action

1. In `Code.gs doPost`, add:
   ```js
   } else if (p.action === "myNewAction") {
     result = myNewAction(p.someParam);
   }
   ```
2. Write the `myNewAction(param)` function in `Code.gs`.
3. Call from frontend with `fetch(SCRIPT_URL, { method:'POST', body:'action=myNewAction&someParam=value' })`.
4. Run `clasp push --force` then `clasp deploy ...` to make it live (see Section 12).

---

## 5. Spreadsheets — Data Layer

### Spreadsheet IDs (Code.gs constants)

```js
DONATIONS_SS_ID   = "1t6CbQ_QkK5ptPPZ9MtlNit2zpz5wY7siu5hc8oCdeZg"  // Donations log
ROSTER_SS_ID      = "1hcKgLSqLw1Fn4S7kOtBXXwt2ZL307WK1JTH-1jsMHaM"  // Main data spreadsheet
UDI_TRACKER_SS_ID = "11QQE2yxYs-wI0r1jyjenXNI19KM5P49ervmcGDlWoyw"  // UDI slip tracker
BOSTON_SHEET_ID   = "1_BGGoyYgYK__XGkE3VqlxN7oqDuPbyq7YAZshFil8v8"  // Boston trip data
// HOURS_SS_ID and SHEET_ID are both the same as ROSTER_SS_ID
```

### Roster spreadsheet (ROSTER_SS_ID) — Sheet tabs

#### `Roster` sheet
Primary member directory. Data starts at row 2 (row 1 = headers).

| Col | Letter | Contents |
|-----|--------|---------|
| 1 | A | Role code (leadership only — e.g. "P", "A") |
| 2 | B | Full name |
| 3 | C | Phone number |
| 4 | D | Email address (primary key everywhere) |
| 5 | E | Position codes (concatenated, e.g. "AP", "Z", blank = general volunteer) |
| 6 | F | Branch code (single letter: A/W/H/M/S) |
| 7 | G | Photo URL (Google Drive direct link) |
| 8 | H | Active? ("Yes"/"No") |
| 9 | I | Date of Birth (date value — written by Boston qualification flow) |

#### `volunteer hours` sheet
Data starts at row 4 (rows 1–3 are headers/labels).

| Col | Letter | Contents |
|-----|--------|---------|
| 2 | B | Volunteer email |
| 3 | C | Event name |
| 4 | D | Event date |
| 5 | E | Hours |
| 6 | F | Approved ("Yes" / "No") |

#### `Pending Volunteers` sheet
New volunteer registrations waiting for approval. Data starts at row 2.

| Col | Letter | Contents |
|-----|--------|---------|
| A | 1 | Full name |
| B | 2 | Phone |
| C | 3 | Email |
| D | 4 | Photo URL (Google Drive) |
| E | 5 | Branch code |
| F | 6 | Status ("Pending" / "Approved" / "Denied") |

#### `FCM Tokens` sheet
Push notification tokens. Auto-created on first use.

| Col | Contents |
|-----|---------|
| A | Email |
| B | FCM token |
| C | Last updated timestamp |

#### `Meeting Config` sheet
Key-value store. Auto-created on first use.

| Key format | Example | Meaning |
|-----------|---------|---------|
| `meetingDay_A` | `2` | Day of week (0=Sun, 6=Sat) for branch A |
| `meetingTime_A` | `17:00` | Meeting time in 24h format |
| `cancel_A` | `No` | Cancel this week's meeting? Auto-resets after push |
| `goal_A` | `5000` | Fundraising goal for branch A |

#### `Branches` sheet
Dynamic branch list. Seeded from `BRANCH_NAMES` constant. Columns: A = code, B = name.

#### `Task Changes` sheet
Append-only change log for the task board.

| Col | Contents |
|-----|---------|
| A | Change type (e.g. `taskDone`, `newTask`, `taskAssignee`) |
| B | Key (e.g. team name or task ID) |
| C | Value |
| D | Extra (secondary payload) |
| E | Timestamp |

---

### Boston spreadsheet (BOSTON_SHEET_ID)

#### `Qualified Persons Form` sheet
Who is cleared to attend the Boston trip. Data from row 2.

| Col | Contents |
|-----|---------|
| A | Name |
| B | Email |
| C | Date of Birth (date value; legacy rows may have "Yes"/"No" for Minor) |
| D | Phone |
| E | Timestamp added |
| F | Shirt size |
| G | Info confirmed |
| H | Parent name (minors) |
| I | Parent email |
| J | Parent phone |
| K | Fee acknowledged |
| L | Permission granted |
| M | Signature |

#### `Costs` sheet
Per-volunteer trip costs.

| Col | Contents |
|-----|---------|
| A | Name |
| B | Branch |
| C | Email |
| D | Train ticket cost |
| E | Shirt cost |
| F | Bus cost |
| G | Paid? ("Yes"/"No") |
| H | Train paid? ("Yes"/"No") |

#### `Food` sheet
Food orders. Col A = ID, B = email, C = item, D = cost.

#### `Itinerary` sheet
Key-value pairs for the trip itinerary. Col A = key, B = value.

---

### Donations spreadsheet (DONATIONS_SS_ID) — `Sheet1`

| Col | Contents |
|-----|---------|
| A | UDI (unique donation identifier, e.g. "A001") |
| B | Amount |
| D | Volunteer name |
| F | Branch letter |

---

## 6. Auth Flow

```
User opens app
  └─ Google Identity Services (GSI) sign-in button
       └─ onSignedIn(credential) in app.js
            └─ Parse JWT → get email, name, photo
            └─ POST lookupEmail=<email> to SCRIPT_URL
                 ├─ NOT FOUND → Show registration form (pre-filled from Google account)
                 │     └─ submitRegistration() → action=registerVolunteer
                 │           → saves to "Pending Volunteers" sheet
                 │           → emails branch president + NOTIFY_ALL
                 │           → shows app in "pending approval" state
                 └─ FOUND → set window.volunteerProfile, show app, call switchTab('home')
```

### `window.volunteerProfile` object

This global is set once on sign-in and used everywhere for permission checks:

```js
window.volunteerProfile = {
  firstName: "Sanya",
  branchName: "Hopkinton",
  branchCode: "A",           // single letter
  email: "sanya@gmail.com",  // primary key — used to identify the user everywhere
  photoUrl: "https://...",   // prefers Roster col G; falls back to Google profile photo
  position: "AP"             // concatenated position codes from Roster col E
}
```

---

## 7. Tab-by-Tab Breakdown

`switchTab(name)` in `index.html` controls visibility. The bottom nav has 5 buttons: Tasks · Donate · Home · Hours · Admin.

### Home tab (`#tabHome`)
- Shows volunteer's name, branch, hours summary, donations, fundraising goal bar, recent activity feed
- Boston trip banner card (links to Boston tab) — auto-hides after July 7, 2026; can be toggled in Admin > App Settings
- Data loaded by `loadDashboard()` in `app.js` via legacy `getDashboard` action

### Donations tab (`#tabDonations`)
- Manual UDI entry form — submits `udi` (unique donation ID like "A001") to backend
- QR/barcode scanner (uses `html5-qrcode` library, loaded dynamically)
- UDI Slip Generator — creates a Google Doc + PDF of slips for a date/branch combo
- Offline sync: failed donations saved to IndexedDB, retried on `online` event

**UDI format:** `<branchCode><3-digit-number>` — e.g. `A001`, `W042`

### Hours tab (`#tabHours`)
- Dropdown of event types (loaded from `action=getEventTypes`)
- Date + hours form → `action=submitHours` (saves as "No" = pending approval)
- History list of the current user's hours → `action=getMyHours`

### Boston tab (`#tabBoston`)
- Multi-view tab: `view-lookup`, `view-registration`, `view-payment`, `view-admin`, `view-itinerary`
- Switched by `showView(name)` function
- On tab open: auto-looks up current user's email → shows their registration status or registration form
- The entire Boston tab is one large IIFE (immediately-invoked function expression)

> **IIFE scope trap:** All functions and variables inside the Boston IIFE are private. To use them from HTML `onclick` attributes (which evaluate in global scope), they must be explicitly exported: `window.myFunction = myFunction;`. The block of exports lives at the bottom of the IIFE.

### Tasks tab (`#tabTasks`)
- Kanban-style task board for internal teams
- Teams and tasks are loaded from the `Task Changes` sheet (append-only change log)
- A hardcoded baseline (`HARDCODED_TEAMS`) is defined in the IIFE; changes are replayed on top of it on load
- Lazy-loaded on first tab switch via `initTaskBoard()`
- See Section 8 for admin context; task board is visible to all logged-in users

---

## 8. Admin Tab

The admin tab (`#tabAdmin`) is only shown to users whose position code matches `/[AZP]/` (A = super admin, Z = org coordinator, P = branch president).

All sections are collapsible. `toggleAdminSection(id)` collapses others when one is opened.

### Sections (in order)

#### Finance Panel (`#finance-section`)
- Lists all Boston trip volunteers with their costs
- Collapsible volunteer cards showing train cost, shirt, bus, food items
- Admins can mark individual cost components as paid/unpaid
- "Push Payment Reminder" button sends FCM push to the volunteer
- Data: `action=getAllVolunteers`

#### Trip Registrations (`#reg-section`)
- Shows everyone who has completed the Boston trip registration form
- Read-only list pulled from the Qualified Persons sheet
- Data: `action=getQualifiedNames`

#### Volunteer Hours Editor (`#hours-section`)
Three sub-tabs:
- **Pending Requests** — hours submitted by volunteers waiting for approval; Approve sets col F = "Yes", Deny deletes the row
- **Assign Hours** — admin can assign pre-approved hours to any roster member (name autocomplete → resolves to email)
- **All Hours** — aggregate view per person, expandable to see individual event rows
- Data: `action=getAllHours` + `action=getRosterMembers`

#### App Settings (`#settings-section`)
- Toggle the Boston trip banner on the Home tab on/off
- Other org-wide settings

#### Volunteer Approvals (`#pending-section`)
- Shows new volunteer registrations waiting for review (from "Pending Volunteers" sheet)
- Approve: moves to Roster sheet, inserted after the last existing row with the same branch code (keeps the sheet branch-grouped)
- Deny: marks Status = "Denied"
- Both actions send a push notification to the volunteer
- A/Z see all branches; P sees only their own branch
- Data: `action=getPendingVolunteers`

#### Qualified Persons (`#qual-section`)
- Shows all roster members grouped by branch
- Checkbox marks someone as qualified for the Boston trip → writes to "Qualified Persons Form" sheet
- When adding: shows a confirm form where admin enters Date of Birth; DoB is pre-filled if already stored in Roster col I
- Backend looks up name/phone from Roster directly (doesn't trust frontend-passed values)
- A/Z can edit anyone; P can only edit their own branch; others see checkboxes but can't toggle
- Data: `action=getQualifiedNames` + `action=getRosterMembers`

#### Branch Management (`#meeting-section`)
- One card per branch showing meeting schedule (day/time), fundraising goal vs. actual, leadership list
- Admins can set meeting day/time, cancel this week's meeting, edit the fundraising goal
- A/Z-only: Add Branch button, edit any branch, manage leadership roles
- P: can only edit their own branch
- "Add to Leadership" pulls from roster members not already in leadership
- Data: `action=getBranchManagement`

---

## 9. Push Notifications

Push notifications use **Firebase Cloud Messaging (FCM)**. The setup is fully built end-to-end.

### How it works

1. When the app loads on a native device (iOS via Capacitor), `registerPushNotifications()` in `app.js` requests permission and gets an FCM token
2. Token is stored via `action=storeFcmToken` → saved to the "FCM Tokens" sheet in ROSTER_SS_ID
3. When GAS wants to send a push, it looks up the token by email, gets a Google OAuth token via service account, and calls the FCM HTTP v1 API

### What triggers a push

| Trigger | Who gets it |
|---------|------------|
| Volunteer submits hours | Branch president |
| Hours approved | The volunteer |
| Hours denied | The volunteer |
| New volunteer registers | Branch president + all Z-coded users |
| Volunteer approved/denied | The volunteer |
| Task assigned | The assignee |
| Task due tomorrow | The assignee (daily 9am GAS trigger) |
| Boston payment reminder | Specific volunteer (admin button) |
| Boston deadline reminder | All registered Boston volunteers |
| 4h before branch meeting | All volunteers of that branch |

### GAS helper functions (Code.gs)

- `getFcmToken_(email)` — look up a token by email
- `getFcmTokensByBranch_(branchCode)` — all tokens for a branch
- `getFcmTokensByPositionCode_(code)` — all tokens for a position code
- `sendPush_(token, title, body)` — send to one device
- `sendPushToMany_(tokens, title, body)` — send to multiple devices

### Firebase project

- Project ID: `afu-volunteer-portal`
- Service account credentials stored in GAS Script Properties (`FCM_SERVICE_ACCOUNT`, `FCM_PROJECT_ID`)
- iOS: `GoogleService-Info.plist` in `ios/App/App/` (APNs blocked until Apple enrollment FZK3534QZM is complete)

### Meeting notification trigger

An hourly time-based trigger runs `checkMeetingNotifications()` in GAS. It sends "Meeting Today!" or "No Meeting This Week" pushes 4 hours before the configured meeting time, then resets cancel flags.

---

## 10. Position Codes & Permissions

Position codes live in Roster col E (concatenated, e.g. `"AP"` means super admin + branch president).

| Code | Role | Admin access |
|------|------|-------------|
| `A` | Super Admin | Full — sees and edits everything |
| `Z` | Org Coordinator (Maanya) | Same as A |
| `P` | Branch President | Admin tab; only own branch |
| `V` | Vice President | No admin |
| `W` | Web Dev team member | No admin |
| `S` | Social Media team | No admin |
| `F` | Finance team | No admin |
| `C` | Branch Coordinator | No admin |
| blank | General volunteer | No admin |

**Admin tab gate:** `switchTab('admin')` checks `/[AZP]/.test(position)`.

**Branch-scoped gates:** P users can only see/edit their own `branchCode`. A/Z see all branches.

---

## 11. Branch Configuration

Branches are identified by a single-letter code everywhere.

| Code | Branch |
|------|--------|
| A | Hopkinton |
| W | Westford |
| H | Holliston |
| M | Medway |
| S | Shrewsbury |

Branch colors (used throughout the UI):

```js
{ A: '#378ADD', W: '#1D9E75', H: '#D4537E', M: '#BA7517' }
```

Branch-specific config in `Code.gs`:

```js
BRANCH_CONFIG = {
  "Hopkinton": { presidentEmail: "dilpreet.whjr@gmail.com",        folderId: "1VT5..." },
  "Westford":  { presidentEmail: "aradhyaak11@gmail.com",           folderId: "1muP..." },
  "Holliston": { presidentEmail: "diyasimhadri11@gmail.com",        folderId: "1s_s..." },
  "Medway":    { presidentEmail: "advaith.shivkumar1021@gmail.com", folderId: "1xGa..." },
}
NOTIFY_ALL = "maanya.shettigar@gmail.com"  // CC'd on all new registrations
```

`folderId` is the Google Drive folder where volunteer photos for that branch are stored.

---

## 12. Deployment Workflow

There are two separate deployment steps every time `Code.gs` changes.

### Step 1 — Push to Apps Script

```powershell
# From C:\Users\madha\Downloads\Boston permission form\APP
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
& "C:\Users\madha\AppData\Roaming\npm\clasp.cmd" push --force
```

### Step 2 — Deploy (makes it live)

```powershell
& "C:\Users\madha\AppData\Roaming\npm\clasp.cmd" deploy `
  --deploymentId "AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS" `
  --description "Describe what changed"
```

> **`clasp push` alone is not enough.** You must also run `deploy` or the live site keeps using the old backend code.

### Frontend changes

Frontend changes (`index.html`, `app.js`) are deployed automatically via `git push` — the pre-commit hook syncs to `www/` and GitHub serves the files. No extra step needed.

### Clasp project details

| Field | Value |
|-------|-------|
| Script ID | `1RJJ4Kn_AG0UpQHnNWDVZhS7T07ptBnv5-an2hHZskUl3jV2fdYGGw90H` |
| Live deployment ID | `AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS` |
| Live URL (SCRIPT_URL) | `https://script.google.com/macros/s/AKfycbwM8Dr.../exec` |
| Files pushed | Only `Code.gs` and `appsscript.json` (`.claspignore` excludes everything else) |

---

## 13. Common Patterns & How-Tos

### How to add a new tab

1. Add a tab ID to the `switchTab` function in `index.html`
2. Add the HTML section: `<div id="tabYourTab" class="tab-content hidden">...</div>`
3. Add a nav button to `#mainNav` if needed
4. Load data on tab switch inside the `switchTab` case

### How to add a new GAS action

See Section 4. The pattern is always the same: `doPost` route → function → return JSON.

### How to add CSS to the admin tab

`#tabAdmin` has its own CSS variable block. If you add a new color variable, add it to both `#tabAdmin` and `#tabBoston` — they each have separate variable scopes. The main app uses `--camp-*` prefixed names; Boston/Admin tabs use shorter names (`--orange`, `--dark`, `--cream`, `--green`, `--blue`).

### How to export a function from the Boston IIFE

The Boston tab is one big IIFE. Functions only work from HTML `onclick` if explicitly exported at the bottom of the IIFE:

```js
// At the bottom of the Boston IIFE:
window.myFunction = myFunction;
```

### How to embed JSON in a GAS HTML template

Use `<?!= ?>` (unescaped output), not `<?= ?>` (escaped). Escaped output breaks JSON:

```html
<!-- Correct: -->
<script>var data = <?!= JSON.stringify(myData) ?>;</script>
```

### How to add a new branch

1. In the admin tab, A/Z users can use the "Add Branch" form in the Branch Management section
2. This calls `action=addBranch&code=X&name=Name` which writes to the `Branches` sheet and initializes Meeting Config keys
3. Also add the new branch to `BRANCH_CONFIG` in `Code.gs` (president email + Drive folder ID) and update `BRANCH_NAMES` / `BRANCH_CODES` constants

### Task board — adding tasks or changing baseline

The task board has a `HARDCODED_TEAMS` array at the top of the tasks IIFE in `index.html`. This is the baseline state — it reflects the sheet as of the last time someone manually updated it. Changes made through the UI are saved to the `Task Changes` sheet and replayed on top of the baseline on load. If the baseline gets out of date, update `HARDCODED_TEAMS` to match the current sheet state and clear old change log rows.

---

## 14. Known Gaps / Pending Work

### Email-based admin gate (not built yet)
Currently any logged-in user who has an A/Z/P position code in the Roster will see the admin tab. The plan was to also hardcode a list of known officer emails in `app.js` and set `window.isAdmin = true` in `onSignedIn()`. Gate `switchTab('admin')` on that flag. This adds a secondary safety layer.

### iOS push notifications (blocked)
FCM is fully set up on the backend. The iOS side is blocked on completing Apple Developer enrollment (enrollment ID: FZK3534QZM). Once enrolled, the steps are:
1. Upload APNs Auth Key to the Firebase console
2. Add Firebase iOS SDK (SPM) in Xcode
3. Run the Capacitor iOS build

### Meeting notification trigger uses hardcoded branches
`checkMeetingNotifications()` in `Code.gs` loops over the `BRANCH_NAMES` constant, not the dynamic `Branches` sheet. If a new branch is added via the UI, it won't get meeting notifications until `BRANCH_NAMES` is updated in code and redeployed.

### Boston banner auto-hides July 7 2026
The home tab banner linking to the Boston trip is hardcoded to hide after `2026-07-07`. After the trip, remove the banner code entirely from `#tabHome` and the App Settings toggle.

### `adminUnlocked` variable
The Boston IIFE still has an `adminUnlocked` local variable that's never used. The admin panel was moved to `#tabAdmin` and the password flow was removed. Safe to delete.

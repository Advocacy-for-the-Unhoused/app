# AFU Volunteer Portal — Bug Audit (2026-07-09)

Deep read of `app.js`, `Code.gs`, `index.html` (all inline scripts), `service-worker.js`.
Ordered by severity.

## Status update (2026-07-12 design/bug sweep)

| Item | Status |
|------|--------|
| S1 pending-vols XSS | ✅ Fixed earlier — `renderPendingVolunteers` uses `crEsc()` on name/email/phone/photoUrl |
| S2 qual-list XSS | ✅ Fixed earlier — `renderQualList` uses `crEsc()` |
| S3 hours eventName XSS | ✅ Fixed earlier — `loadMyHours` uses `escHours()` |
| S4 task assignee XSS | ✅ Fixed earlier — `tbTaskHTML` uses `tbEsc()` |
| S5 no server-side auth | ⚠️ OPEN (architectural — GAS "Anyone" web app; needs signed-token redesign) |
| F1 wrong biometric key | ✅ Fixed earlier — `deleteAccount()` calls `clearStoredAuth()` |
| F2 denied shows pending | ✅ Fixed earlier — three-state in `loadMyHours` + `renderAllHours`/`renderPendingHours` |
| F3 blank role code | ✅ Fixed earlier — `approveVolunteer` writes `'V'` |
| F4 stuck reg button | ✅ Fixed earlier — email check precedes disable |
| L1 pre-4am reminder | ✅ Fixed 2026-07-12 — notify slot rolls to previous day |
| L2 isMinor snapshot | ✅ Fixed 2026-07-12 — `getQualifiedNames` computes from DoB in col C (Date or string), returns `dob`; `addQualifiedPerson` stores DoB. **Was worse than logged: online-form rows (col C = Date) made all minors read as adults.** |
| L3 SW staleness | ✅ Fixed 2026-07-12 — cache key keeps query string, so `?v=` bumps actually bust |
| L4 silent duplicate UDI | ✅ Fixed 2026-07-12 — `syncDonations` returns duplicate UDIs; `submitDonation` warns instead of showing success |
| L5 compCanApprove substring | ⚠️ OPEN (safe with current single-letter codes; revisit if multi-char codes added) |
| L6 orphan webp icons | ✅ Deleted 2026-07-12 |
| L7 SCRIPT_URL literals | ⚠️ OPEN (fragile-but-correct; consolidate on next URL rotation) |

---

## 🔴 Security

### S1. Stored XSS — Admin → Volunteer Approvals
`index.html` `renderPendingVolunteers()` (~L4006–4027). `v.name`, `v.email`, `v.phone` are
concatenated into `innerHTML` raw, and `v.photoUrl` is injected into an `<img src="…">`
attribute raw (L4008).
**Attack path:** any Google user who isn't on the roster is shown the registration form and
can submit an arbitrary first/last name / phone (e.g. `<img src=x onerror=…>`). When the Branch
President opens **Admin → Volunteer Approvals**, the payload executes in their session.
The Boston-tab renders (`renderRegistrations`, `buildVolCard`) already use `esc()`; this path does not.

### S2. Stored XSS — Admin → Qualified Persons
`index.html` `renderQualList()` (L3851–3852). `m.name` and `m.email` are inserted into `innerHTML`
without escaping. Names come from the Roster (populated from registration), same injection source as S1.

### S3. Unescaped event name in volunteer Hours history
`app.js` `loadMyHours()` (L702). `${r.eventName}` is inserted raw while `r.notes` right below it is
escaped with `escHours()`. Event name is free text the volunteer types. Lower blast radius (shows only
in the user's own history — admin views `renderPendingHours`/`renderAllHours` do escape it), but it's an
inconsistent gap.

### S4. Unescaped assignee tag on task cards
`index.html` `tbTaskHTML()` (L6209 → L6227). `tagText = task.assignee || '+ assign'` is emitted without
`tbEsc()`, though every other dynamic value in the same template is escaped. Assignees are roster names
(registration-sourced), so same class as S1/S2.

### S5. No server-side authorization on privileged actions
`Code.gs` `doPost()` routes purely on `e.parameter.action` with **no identity or role check**.
`approveHours`, `denyHours`, `approveVolunteer`, `denyVolunteer`, `adminAssignHours`, `deleteAccount`,
`setBranchLeaderRole`, `approveCompRequest`, `updateVolunteer*`, etc. are all callable by anyone who can
POST to the public `/exec` URL. The client-side `/[AZPC]/` gate is cosmetic. (Architectural — inherent to
the "Anyone" GAS web-app deployment, but worth recording.)

---

## 🟠 Correctness / Functional

### F1. `deleteAccount` clears the wrong biometric key
`app.js` `deleteAccount()` (L1063) calls `Preferences.remove({ key: 'biometricAuth' })`, but stored auth
lives under `BIOMETRIC_AUTH_KEY = 'afu_stored_auth'` (L787, written by `storeAuthForBiometric`). The stale
credential is never removed, so **Face ID / Touch ID auto-signs the just-deleted account back in** on next
launch. Should call `clearStoredAuth()` (which uses the correct key).

### F2. Denied hours display as "Pending" forever
`Code.gs` `denyHours` writes col F = `"Denied"` (L174). `app.js` `loadMyHours` (L667–669, L693) treats any
value ≠ `"yes"` as pending, so a denied request shows **"⏳ Pending"** to the volunteer indefinitely and is
counted in the "N pending approval" badge. Admin's **All Hours** breakdown has the same flaw:
`renderAllHours` (index.html L5673) labels a `"Denied"` record as `pending`. (The pending *queue*
`renderPendingHours` correctly excludes `denied`.)

### F3. Newly approved volunteers get a blank role code → excluded from roster lists
`Code.gs` `approveVolunteer` (L590–591) inserts the new Roster row with col A (role code) = `''`.
The current convention (set 2026-07-09) treats **blank col A as inactive**, and `getRosterMembers`
(L713) skips blank-col-A rows. Result: a freshly approved volunteer does **not** appear in
**Admin → Assign Hours** autocomplete or **Qualified Persons** until an admin manually sets a code.
Approval should write `'V'` (active general volunteer).

### F4. Registration button gets stuck when email is missing
`app.js` `submitRegistration` disables the button and sets "Submitting…" (L998) *before* the empty-email
check (L1002–1006), which `return`s without re-enabling it. If email is blank (Apple sign-in without an
email), the button is permanently stuck.

---

## 🟡 Lower / edge / known

### L1. Meeting reminder never fires for meetings before 4:00 AM
`Code.gs` `checkMeetingNotifications` (L1709/1712): `notifyH = meetH - 4` goes negative and never equals
`nowH` (0–23). No practical impact today. (Previously logged.)

### L2. `isMinor` is a snapshot, not recomputed from DoB
`Code.gs` `getQualifiedNames` (L928) reads col C `"Yes"/"No"` set at add-time and omits `dob` from the
return, so the UI can't recompute age. A minor who turns 18 stays flagged "minor". (Previously logged.)

### L3. Service-worker cache-first staleness
`service-worker.js` strips the query string from sub-resource requests (L47) and serves them cache-first,
so `app.js?v=N` version bumps are ignored unless `CACHE_NAME` is also bumped every deploy. Latent
maintenance risk (index.html is network-first so it's fine; JS/assets are the exposure).

### L4. Duplicate-UDI donation silently reported as success
`app.js` `syncDonations` (L346) treats `error === "UDI exists"` like success and drops the offline record.
If a volunteer re-enters a UDI number that already exists, they see the success screen even though no new
donation row was created. (Idempotency is intentional; the *silent* success is the gap.)

### L5. `compCanApprove()` substring match
`index.html` L4204 uses `pos.includes('A')`; safe while role codes are single letters + `FO`, but any
future multi-char code containing `A` would grant reimbursement-approval access. (Previously logged.)

### L6. Orphan `icons/*.webp` (7 untracked files)
Leftover from an abandoned image-optimization pass; manifest/index reference only the `.png` icons, so no
runtime effect. Cleanup only. (Previously logged.)

### L7. `SCRIPT_URL` duplicated as string literals
The `/exec` URL is hardcoded in several inline blocks (`QUAL_GAS_URL`, `pendingSU`, `crSU`, …) because
`window.SCRIPT_URL` is never set. Currently correct but fragile — a URL rotation means editing many spots.
(Previously logged as item 9.)

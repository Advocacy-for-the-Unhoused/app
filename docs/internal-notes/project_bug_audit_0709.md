---
name: project-bug-audit-0709
description: "2026-07-09 full-app bug audit — ALL items fixed as of 2026-07-12 except S5 (no server auth, intentional), L5 (compCanApprove substring), L7 (SCRIPT_URL literals). Status table lives in repo BUG_AUDIT.md."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1442bab8-a315-4428-8768-9f2468456b40
---

# Bug Audit 2026-07-09

Full deliverable committed as `BUG_AUDIT.md` in the repo root (now includes a status table).

## ✅ Remaining items FIXED 2026-07-12 (commit 68df5cc, GAS deploy @87) — design/bug sweep
- **L2 isMinor**: `getQualifiedNames` now computes isMinor from DoB when col C holds a Date or date-string (legacy Yes/No still honored), returns `dob`; `addQualifiedPerson` stores the DoB itself in col C. Live check: 42 people / 31 minors, all current rows are legacy Yes/No.
- **L1**: pre-4am meeting reminders roll the notify slot to the previous day.
- **L3 SW staleness FIXED FOR REAL**: service-worker now caches on the full URL (query string kept), so `app.js?v=N` bumps bust the cache alone. This bug served ME stale app.js during preview testing. CACHE_NAME v15 / app.js?v=15. The "bump both" habit is still fine but no longer load-bearing.
- **L4**: duplicate UDI now alerts "already recorded" instead of showing the success screen (`syncDonations` returns duplicate UDI list; `submitDonation` checks it).
- **L6**: orphan icons/*.webp deleted.
- Contrast fixes (Guideline 4 sweep): `.activity-empty` #bbb→#767676, `.cr-photo-placeholder` 0.4→0.6 alpha, `.cr-pay-method-opt label` 0.5→0.65 alpha.

## Still open (accepted)
- **S5** no server-side auth (intentional per user; architectural).
- **L5** compCanApprove `includes('A')` substring — safe with single-letter codes.
- **L7** SCRIPT_URL duplicated string literals.

## ✅ FIXED + shipped 2026-07-09 (commit 8eda16b, pushed main; Code.gs clasp deploy @85)
All XSS spots below now escape (crEsc/tbEsc/escHours). F1–F4 all fixed. Bumped app.js?v=13 +
service-worker afu-cache-v13. Frontend is in www/ ready for the next Codemagic iOS build; F3
(Code.gs) is already live via clasp deploy @85. **iOS IPA build itself still must be started in
Codemagic (macOS, manual) — cannot be triggered from Windows.**
- XSS renderPendingVolunteers / renderQualList / hrs name dropdown (now index-based `hrsSelectMatch`) / app.js loadMyHours eventName / tbTaskHTML assignee — all escaped.
- F1 deleteAccount now calls `clearStoredAuth()` (key afu_stored_auth).
- F2 three-state hours (approved/denied/pending, default pending): app.js `hoursState()`+`STATUS_META`, new `.status-denied` CSS; admin renderAllHours shows denied tag + excludes denied from per-person totals. (denyHours already wrote "Denied" — no Code.gs change needed.)
- F3 approveVolunteer writes col A='V' (active) instead of ''.
- F4 submitRegistration validates email before disabling the button.
S5 (no server-side auth) intentionally NOT fixed per user.

## Original findings (below) — the **open** items the earlier XSS audit ([[project-app-store-bugs]]) missed.

## Security / XSS (still unescaped — the escHtml/esc/crEsc fixes missed these)
- **renderPendingVolunteers** (index.html ~L4006-4027): `v.name`/`v.email`/`v.phone` raw in innerHTML, `v.photoUrl` raw in `<img src>`. Registration form is open to any Google user → stored XSS in Branch President's Volunteer Approvals view. Highest-priority.
- **renderQualList** (index.html L3851-3852): `m.name`/`m.email` raw. Same roster-name source.
- **app.js loadMyHours** (L702): `r.eventName` raw while `r.notes` IS escaped. Self-XSS (own history; admin hours views already escape).
- **tbTaskHTML** (index.html L6209/6227): `task.assignee` not run through `tbEsc` though rest of template is.
- **No server-side auth** in Code.gs doPost — every privileged action callable by anyone with the public /exec URL; client `/[AZPC]/` gate is cosmetic. Architectural.

## Correctness
- **app.js deleteAccount L1063** removes Preferences key `'biometricAuth'` but stored auth key is `BIOMETRIC_AUTH_KEY='afu_stored_auth'` (L787) → biometric still auto-signs the deleted account back in. Should call `clearStoredAuth()`.
- **Denied hours show "Pending" forever**: denyHours writes col F="Denied" (Code.gs L174); app.js loadMyHours (L667-669,693) treats non-"yes" as pending; admin renderAllHours (index.html L5673) also mislabels Denied as "pending". (renderPendingHours queue correctly excludes denied.)
- **approveVolunteer (Code.gs L590-591)** inserts Roster col A (role code)='' — but blank col A = inactive under the 2026-07-09 convention, so getRosterMembers (L713 guard) hides newly approved vols from Assign Hours + Qualified Persons. Should write 'V'. See [[project-app-store-bugs]] item 1.
- **app.js submitRegistration** disables button "Submitting…" (L998) before the empty-email return (L1002-1006) → button stuck when Apple sign-in gives no email.

## Lower/known (already in [[project-app-store-bugs]] or harmless)
Meeting reminder < 4AM never fires; isMinor snapshot not recomputed; SW cache-first needs CACHE_NAME bump each deploy; duplicate-UDI silently "succeeds" in syncDonations; compCanApprove substring 'A'; orphan icons/*.webp; SCRIPT_URL duplicated literals.

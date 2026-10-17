---
name: project-app-store-bugs
description: "V2 backlog — bugs deferred from the 2026-06-17 pre-App-Store audit; items 2-6,10 were fixed that day"
metadata:
  node_type: memory
  type: project
  originSessionId: e80844ad-70d8-41a4-8da9-f8a7e20a898e
---

# V2 Bug Backlog (deferred from 2026-06-17 audit)

## ✅ RESOLVED

### 1. `getRosterMembers` skips general volunteers (`Code.gs`) — FIXED 2026-07-09 (data-only)
Col A (role code) was blank for general volunteers; the `if (!col A) continue` guard (Code.gs ~L713) skipped them, so Admin → Assign Hours and Qualified Persons showed only officers.
**Fix:** User populated col A = `V` for **all active volunteers**, so they're no longer blank → the existing guard now includes them. **No code change needed.** Verified live: `getRosterMembers` returns 49 members (was ~a dozen officers). Deactivation model: inactive = **blank col A** (user confirmed), which the guard still skips — so no col H filter needed.
**Note — `V` was repurposed:** it used to mean "Vice President"; now means "active general volunteer". See [[project-push-notifications]] position table and the tbCanManageTeam consequence in [[project-task-board]].

---

## 🟡 MEDIUM — both FIXED 2026-07-09 (commit 83f8521)

### 7. Push toast injects raw HTML (`app.js`) — ✅ FIXED
`showNativeToast` title/body now wrapped in `escHtml()`.

### 8. Dashboard activity text unescaped (`app.js`) — ✅ FIXED
"Recent Activity" feed `item.text`/`item.time` now wrapped in `escHtml()` in BOTH render paths (Google `onSignedIn` loadDashboard + Apple path).

**Shared helper added:** module-level `escHtml(s)` near the top of app.js (hoisted; `[&<>"']`→entities, null/undefined→''). Reuse it for any new `innerHTML` with spreadsheet/user data. Two older local copies still exist (`escAttr` in loadEventTypes, `escHours` in loadMyHours) — could be consolidated onto escHtml later but left as-is. Verified with `node --check` + 7 unit cases incl. `<script>`/`<img onerror>` payloads.

---

## 🔵 LOW

### 15. Dead "Demo Account" button on login screen — ✅ FIXED (removed)
Verified 2026-07-07: no `demoSignIn`/"Demo Account" references remain in index.html. The button (which threw `ReferenceError` on the login screen — exactly the kind of thing an App Review reviewer would tap) is gone.



### 9. `window.SCRIPT_URL` never set
Always falls to hardcoded URL — currently correct but fragile. See [[feedback-script-url-scope]].

### 11. `addQualifiedPerson` col C is Yes/No, not DoB
Yes/No is correct for now — age computed from DoB next year.

### 12. Meeting notification never fires for meetings before 4 AM
No practical impact.

### 13. `compCanApprove()` substring match on position
All codes single letters currently — safe.

### 14. `getQualifiedNames` omits `dob` from return value
UI can't recompute `isMinor` from age.

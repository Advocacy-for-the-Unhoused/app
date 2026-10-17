---
name: project-comp-requests
description: "Reimbursement/compensation request system — volunteer submission (Hours tab), admin approval (Admin tab), GAS backend, sheet layout, and permission rules"
metadata: 
  node_type: memory
  type: project
  originSessionId: efc1112e-a79b-43d3-912d-1259e0f4b4c6
---

# Compensation / Reimbursement Requests

Built 2026-06-16. Volunteers who shop for HAU can submit expense requests with a receipt photo; A/Z/FO officers can approve or deny from the Admin tab.

---

## Volunteer UI — Hours tab (`#tabHours`)

Two new cards below the existing "Log an Event" card:

**`#expense-form-card`** — submission form:
- `#cr-desc` — text input: what was purchased
- `#cr-amount` — number input: dollar amount
- `#cr-photo-area` / `#cr-photo-input` — file input (accept image/*, capture=environment); handled by `crHandlePhoto(input)` → base64-encodes into `crPhotoBase64` / `crPhotoMime` module-level vars
- Radio group `name="cr-pay"` — ids `cr-pay-venmo`, `cr-pay-zelle`, `cr-pay-cash` (Cash checked by default); `crUpdateHandle()` shows/hides `#cr-handle-wrap`
- `#cr-handle` — Venmo/Zelle username (hidden for Cash)
- Submit: `window.submitExpenseRequest()` → `action=submitCompRequest`

**`#my-expenses-card`** — history (hidden until requests exist):
- Loaded by `window.loadMyCompRequests()` → `action=getMyCompRequests`
- Shown newest-first; each row: description, pay method + handle, date, amount, status badge (pending/approved/denied)
- Auto-called on every hours tab switch and after successful submission

---

## Admin UI — Admin tab (`#comp-section`)

New collapsible section, positioned after `#pending-section` and before `#qual-section`.

- Opens with `toggleAdminSection('comp-section')` + calls `loadCompRequests()`
- `#comp-count-pill` — orange badge: count of Pending requests (hidden if 0)
- `#comp-requests-body` — rendered by `renderCompRequests(requests, body)`

**Permission check:** `compCanApprove()` returns true if position includes 'A', 'Z', or 'FO'. Non-authorized users see "Access restricted" message instead of requests.

**Card layout per request (`.cr-card`):**
- Volunteer name, branch, submitted date, description, pay method tag (color-coded: Venmo=blue, Zelle=purple, Cash=green)
- Amount (large, right-aligned)
- "View Receipt" link → Drive URL opens in new tab (only shown if image was uploaded)
- Approve/Deny buttons (only on Pending; approved/denied show status badge instead)

**Admin functions (main script block, all exported to `window`):**
- `loadCompRequests()` — fetches `action=getCompRequests`, calls `renderCompRequests`
- `renderCompRequests(requests, body)` — groups Pending/Approved/Denied, updates pill badge
- `approveCompRequest(id)` — POST `action=approveCompRequest&id=…`, reloads on success
- `denyCompRequest(id)` — confirm dialog, POST `action=denyCompRequest&id=…`, reloads on success

---

## GAS Backend (Code.gs)

### Sheet: "Comp Requests" in ROSTER_SS_ID

Auto-created by `getCompSheet_()` on first use.

| Col | Field | Notes |
|-----|-------|-------|
| A | ID | `cr` + Date.now().toString(36) + random |
| B | Name | Full name from Roster |
| C | Email | Lowercase |
| D | Branch | Single letter code |
| E | Amount | Float |
| F | Description | Free text |
| G | PayMethod | Venmo / Zelle / Cash |
| H | PayHandle | Blank for Cash |
| I | ImageUrl | Drive uc?export=view URL; blank if no image |
| J | Status | Pending / Approved / Denied |
| K | SubmittedAt | Date object |

### Actions

- `action=submitCompRequest` + `email, amount, description, payMethod, payHandle, imageBase64, imageMime`
  - Uploads receipt to volunteer's branch Drive folder (same `folderId` as profile photos in BRANCH_CONFIG)
  - Appends row; notifies all A + Z + FO token-holders via push
- `action=getCompRequests` → returns `{ requests: [...] }` (all rows)
- `action=getMyCompRequests` + `email` → returns `{ requests: [...] }` filtered to that volunteer
- `action=approveCompRequest` + `id` → sets Status=Approved, push to volunteer
- `action=denyCompRequest` + `id` → sets Status=Denied, push to volunteer

### Functions

`getCompSheet_()`, `submitCompRequest_(email, amount, description, payMethod, payHandle, imageBase64, imageMime)`, `getCompRequests_()`, `getMyCompRequests_(email)`, `approveCompRequest_(id)`, `denyCompRequest_(id)`

---

## CSS classes

**Admin cards:** `.cr-list`, `.cr-card`, `.cr-card-hdr`, `.cr-card-meta`, `.cr-card-name`, `.cr-card-sub`, `.cr-card-desc`, `.cr-amount`, `.cr-pay-tag` (+ `.venmo` / `.zelle` / `.cash`), `.cr-bill-link`, `.cr-actions`, `.cr-btn`, `.cr-btn-approve`, `.cr-btn-deny`, `.cr-status-badge` (+ `.approved` / `.denied`), `.cr-group-hdr`

**Volunteer form:** `.cr-pay-method-group`, `.cr-pay-method-opt`, `.cr-photo-area`, `.cr-photo-placeholder`

**Volunteer history:** `.my-cr-row`, `.my-cr-info`, `.my-cr-desc`, `.my-cr-meta`, `.my-cr-right`, `.my-cr-amount`, `.my-cr-status` (+ `.pending` / `.approved` / `.denied`)

**Helper function:** `crEsc(s)` — local HTML-escape util defined in main script block alongside comp request functions.

---

## Permission summary

| Role | Can submit | Can approve/deny |
|------|-----------|-----------------|
| General volunteer | Yes | No |
| P (branch president) | Yes | No |
| FO (finance officer) | Yes | Yes |
| A (admin) | Yes | Yes |
| Z (super admin) | Yes | Yes |

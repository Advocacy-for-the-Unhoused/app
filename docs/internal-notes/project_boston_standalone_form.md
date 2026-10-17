---
name: project-boston-standalone-form
description: "Standalone online Boston permission form (Integrated boston trip online form/) — separate GAS web app, manual deploy, shares the Boston sheet"
metadata: 
  node_type: memory
  type: project
  originSessionId: f3cd9649-c687-4cd3-882d-126ebffb13bd
---

`Integrated boston trip online form/` (Code.gs + index.html) is a **standalone**
Google Apps Script web app — the public online permission form used when the iOS
app isn't available. Trip date: **June 30, 2026**.

**Deployment is MANUAL** — no `.clasp.json`. To ship changes, paste Code.gs and
index.html into the Apps Script editor and redeploy the web app. (Different from
the main app's clasp workflow in [[feedback-clasp-push-workflow]].)

- Uses `google.script.run` (correct here — it's an HtmlService web app served via
  `doGet`, NOT the static PWA, so [[feedback-no-gas-run]] does NOT apply).
- Shares the **same Boston sheet** `1_BGGoyYgYK__XGkE3VqlxN7oqDuPbyq7YAZshFil8v8`
  as the main app. Sheet col C = **Date of Birth** (not Yes/No) since 2026-06-15.
- index.html is ~629KB (embedded base64 shirt/QR images on lines ~489,493,633,634)
  — Read in small offset/limit chunks; static preview screenshots time out, use
  `preview_eval` to verify DOM instead.

**Fixed 2026-06-26 (commit 1fc89b3):**
- `getQualifiedNames` was reading col C as `'yes'` → everyone flagged Adult, minors
  never got the parent form. Now computes `isMinor` from DoB via `resolveMinor_` +
  `isUnder18_` helpers (legacy Yes/No still handled).
- `submitForm` now resolves the target row by **email** first (then rowIndex+name,
  then unique name match) instead of trusting the page-load rowIndex. Sheet can now
  be reordered / have rows inserted without a "Name mismatch" error.

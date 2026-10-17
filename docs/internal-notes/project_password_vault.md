---
name: project-password-vault
description: "Password Vault in Admin tab — org credentials stored in Google Sheet, role-gated edit, server-logged reveals"
metadata: 
  node_type: memory
  type: project
  originSessionId: bf6f5112-b09e-423e-9bee-67604349f97b
---

# Password Vault (Admin tab `#pw-section`)

Built 2026-07-17. Central store for the org's operational credentials (Namecheap, Zoho, Stripe, US Bank, IRS, socials, etc.). Lives as the last section in `#tabAdmin`, after Branch Management. See [[project-admin-tab]].

## Sheets (in ROSTER_SS_ID, auto-created)
- **"Passwords"**: ID | Category | Service | Username | Password | Notes | UpdatedAt | UpdatedBy | Security(col I: Low/High). Password+Notes stored ENCRYPTED (`v1:` base64).
- **"Password Access Log"**: Timestamp | Email | Name | Service | Action (Added/Edited/Deleted/Revealed/Revealed (high)/Reveal blocked (bad passphrase))

## Encryption + passphrase (added 2026-07-17, deploy @89)
- **At-rest encryption**: password & notes encrypted via HMAC-SHA256-CTR keystream + encrypt-then-MAC. Master key auto-gen in Script Properties `PW_ENC_KEY` (never in sheet/git). `pwEncrypt_`/`pwDecrypt_`; `v1:` prefix = encrypted, no prefix = legacy plaintext (decrypt returns as-is). Decrypt only server-side on successful reveal.
- **Security levels**: Low = any view-role officer reveals (logged). High = ALSO requires vault passphrase. `getPasswords` returns `security` per row (blank col I → High default). Current: socials/blog/Parks&Rec/Reference = Low; all finance/gov/email/domain/Google/Mailchimp/Make = High.
- **Passphrase**: stored ONLY as SHA-256 hash in Script Properties `PW_HIGH_HASH`. Current value = `notcheeseclock` (set via action=setVaultPassphrase). `revealPassword` takes `passphrase` param; returns `{needPassphrase:true}` if missing/wrong.
- **Extra actions**: `setVaultPassphrase` (A/Z, stores hash), `migrateVault` (A/Z; encrypts plaintext rows in place + sets Low/High from `lowServices` pipe-list, else High). Both callable via curl two-step.
- **Frontend**: Low/High badges, inline passphrase prompt (session-cached in `pwPass` var + Lock button to clear), security selector on add/edit form.

## Roles
- `PW_VIEW_ROLES = /[AZPC]/` — list + reveal (same gate as admin tab access)
- `PW_EDIT_ROLES = /[AZ]/` — add/edit/delete
- Role checked **server-side** via `getMemberInfo(email).position`, not just UI.

## Backend (Code.gs, actions)
`getPasswords` (list, NO secret fields, returns `{passwords, canEdit}`), `revealPassword` (logs access, returns password+notes+username), `savePassword` (upsert; id blank=new), `deletePassword`, `getPasswordAccessLog` (A/Z only, last 100). Helpers: `getPasswordSheet_`, `getPasswordLogSheet_`, `pwLog_`, `pwPosition_`, `pwName_`. Deployed @88.

## Frontend (index.html)
Self-contained `<script>` IIFE + `<style>` right after `<!-- End Admin Tab -->`. All fns on `window.pw*` (loadPasswordVault, pwReveal, pwCopy, pwShowForm, pwSave, pwDelete, pwToggleLog, pwSetFilter). Uses `window.gasFetch`. Secrets masked until per-entry Reveal (which logs). Search box, category grouping, copy buttons, inline add/edit form, access-log viewer.

## Security decisions
- **No credentials in code** — repo is public (advocacy-for-the-unhoused.github.io). Data was seeded directly into the Sheet over the wire via curl POSTs to SCRIPT_URL, never committed. If re-seeding, do the same; never hardcode secrets in Code.gs/index.html.
- Committed + pushed (88f813e then 76ed841, 2026-07-17). iOS/codemagic intentionally NOT built (user conserving minutes).
- **Server-auth note:** backend still identifies user via client-supplied `p.email` (SCRIPT_URL public). Google-ID-token verification was REJECTED as the fix because biometric sign-in (app.js biometricSignIn → onSignedIn(stored)) never gets a fresh JWT — it'd lock out native users. Instead chosen: Low/High split + passphrase gate on High. So Low (socials) still enumerable by anyone with URL+officer-email; High needs the passphrase too. User accepted this tradeoff.

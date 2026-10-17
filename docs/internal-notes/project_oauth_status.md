---
name: project-oauth-status
description: Google OAuth consent screen verification status and domain safety notes
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ad1da3b-bf51-4ae9-a7a5-4d25756ec8f9
---

## Status: VERIFIED by Google (confirmed 2026-06-17)

Google Cloud Console → APIs & Services → OAuth Consent Screen shows "Your app has been verified by Google." Users will not see the "unverified app" warning screen.

## Domain safety

- **Do not add afu.com** as an authorized domain anywhere (Google Cloud, Firebase, App Store) — AFU does not own that domain
- Authorized domains on consent screen: uses Firebase defaults only (`firebaseapp.com` / `web.app`) — no custom domain added, which is correct
- Privacy policy and ToS URLs must point to a Firebase-hosted URL if added (e.g., `afu-volunteer-portal.web.app/privacy`), not afu.com

## Non-blocking warnings on console

- **Cross-Account Protection** — not configured; optional, not required for launch
- **Use secure flows** — recommends authorization code flow over implicit; not blocking, revisit post-launch

## If a custom domain is added in the future

Impact is contained:
- OAuth Consent Screen: add new domain to Authorized Domains → Google re-verification (usually fast since already verified)
- Firebase Console: add domain to Authorized Domains (one click)
- Update Privacy Policy / ToS URLs in consent screen and App Store listing
- Bundle ID, client IDs, FCM, Codemagic — all unaffected

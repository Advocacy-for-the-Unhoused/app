---
name: project-codemagic-build
description: "Codemagic CI/CD iOS build pipeline — base64 key gotcha, SPM structure, build history; build 21 (1.0 build 3) succeeded to TestFlight 2026-07-05"
metadata: 
  node_type: memory
  type: project
  originSessionId: fd11e7b8-237d-48c9-8115-01b1ee32d515
---

Codemagic is used to build and publish the AFU Volunteer Portal iOS app to TestFlight/App Store.

**App ID:** `6a2dc1d69d484f43dab17dc1`  
**Workflow:** `ios-app-store`  
**API token:** `<REDACTED — rotate in Codemagic; ask Madhav for the current token privately>`

## Critical Discovery: Key Format
`APP_STORE_CONNECT_PRIVATE_KEY` in Codemagic's `ios_credentials` group is stored as **base64-encoded PEM**, not raw PEM or a file path. Must `base64.b64decode()` it before writing to `/tmp/asc_key.p8` and using `@file:` prefix.

Working Python snippet:
```python
import os, base64
key = os.environ.get('APP_STORE_CONNECT_PRIVATE_KEY', '')
decoded = base64.b64decode(key).decode('utf-8')
with open('/tmp/asc_key.p8', 'w') as f:
    f.write(decoded)
```
Then: `export APP_STORE_CONNECT_PRIVATE_KEY="@file:/tmp/asc_key.p8"`

## iOS Project Structure
- Uses **Swift Package Manager (SPM)**, NOT CocoaPods
- Package manifest: `ios/App/CapApp-SPM/Package.swift`
- Apple Sign In plugin: `@capawesome/capacitor-apple-sign-in@0.1.0` (Capacitor 8 compatible)
  - Package name: `CapawesomeCapacitorAppleSignIn`
  - Plugin class: `AppleSignInPlugin`, jsName: `"AppleSignIn"`
  - API: `AppleSignIn.signIn({ scopes: ['EMAIL', 'FULL_NAME'] })`
  - Replaced `@capacitor-community/apple-sign-in` (Capacitor 7 only)

## Triggering builds via API (confirmed usable 2026-07-06)
I can trigger builds myself — no need to ask the user to click. POST to the API with the token:
```
curl -X POST "https://api.codemagic.io/builds" \
  -H "Content-Type: application/json" -H "x-auth-token: <API token above>" \
  -d '{"appId":"6a2dc1d69d484f43dab17dc1","workflowId":"ios-app-store","branch":"main"}'
```
Returns `{"buildId":"..."}`. Poll status: `GET https://api.codemagic.io/builds/{buildId}` (same x-auth-token header) → `.build.status` is `queued`|`building`|`finished`|`failed`. Fetch logs from the build object / build actions if it fails.

## Build History
- **2026-07-18 build (buildId `6a5b047fe48e02212de1c9de`, v1.0 build 7): SUCCESS → published to TestFlight.** All 8 actions green. Carries the App Review rejection-2 fixes (788fec9 SIWA prefill + donation copy, ff08680 real account deletion + privacy policy), 68df5cc bug sweep, Password Vault, and profile-photo-from-Home. Triggered via API after a full pre-flight audit confirming all fixes in code, no secrets, www/ synced, pbxproj already at 7. **This is the build to select for App Store resubmission.**
- **2026-07-09 build (buildId `6a4fb5125573e1d2d6a16d15`, v1.0 build 6): SUCCESS → published to TestFlight.** All 8 actions green incl. Publishing, ~5 min. Carries the **"Profile Photo (Optional)" registration label** change (5.1.1 personal-data optics — photo was already never enforced in submitRegistration; only name+branch required). Bumped `CURRENT_PROJECT_VERSION` 5→6 (both Debug+Release) first. Triggered via API.
- **2026-07-09 build (buildId `6a4f98e57bbdfda8508f77b1`, v1.0 build 5): SUCCESS → published to TestFlight.** All 8 actions green incl. Publishing. Carries the Home "Your Tasks" card, the innerHTML XSS sanitization (escHtml), and getMemberInfo `fullName`. Required bumping `CURRENT_PROJECT_VERSION` 4→5 in project.pbxproj (both Debug+Release) first — the yaml does NOT auto-increment, so a duplicate build number would be rejected at upload. Triggered via API, ~5.5 min.
- **2026-07-06 Codemagic build #28 (buildId `6a4c71c6dd957a0cea6c7fa1`, v1.0 build 4): SUCCESS → published to TestFlight.** First build with iOS push wired (Firebase Messaging SPM, plist bundled, aps-environment) — see [[project-push-notifications]]. Triggered via API. All actions green incl. code signing (confirms Push capability enabled on App ID) and Build IPA (Firebase SPM compiled fine). ~4 min. Pending: user device-tests push on build 4.
- Builds 10-12: EC curve error — OpenSSL 3.x rejects Apple's .p8 key when passed as PEM via Python JWT
- Builds 13-16: Various `app-store-connect` CLI auth failures; key was base64 the whole time
- Build 17: Confirmed signing was silently failing all along; prior success (build 14) was cached machine profile
- Build 18: Shell escaping in `python3 -c "..."` mangled the fix
- Build 19: Diagnostic revealed key is base64-encoded (starts with `LS0tLS1CRUDJTI...`)
- Build 21 (6a4a96fef1b3b90dd6de60b8, 2026-07-05): **1.0 build 3** with capgo social-login Google fix + optional phone — succeeded, published to TestFlight. Awaiting user device test + App Store resubmission (see [[project-appstore-rejection-v1]]).
- Build 20 (6a33918102ee20d754098c89): base64-decode fix — built and **submitted to App Store review 2026-06-18**, REJECTED 2026-06-23 (phone required + GoogleAuth plugin missing). Note: this binary still contains the 7 IIFE-exposure bugs (see [[feedback-iife-window-exposure]]) fixed in git afterward; they are admin-only so unlikely to affect review. Bundled `www/` is frozen in this IPA — git pushes do NOT patch it (no live-update/Appflow configured); fixes ship in the next build only.

## App Store Listing
Screenshots, description, age rating, privacy policy: **NOT needed for TestFlight**. Only needed before App Store Review (public release). Get TestFlight working first.

**Why:** App Store Review and TestFlight are separate steps; TestFlight only needs a valid IPA.  
**How to apply:** Don't block CI/CD work on incomplete App Store listing; handle listing after TestFlight confirms.

---
name: project-appstore-rejection-v1
description: App Store submission status — 1.0(2) rejected 2026-06-23 (fixed), 1.0(6) rejected 2026-07-10 on Guideline 4 (SIWA re-asks name/email) + 3.2.2(iv) (donations); both fixed in commit 788fec9 2026-07-12; need Codemagic build 7 + reviewer reply
metadata:
  node_type: memory
  type: project
  originSessionId: 72d7a0ad-dee7-45ca-ba76-b2dc59287f82
  modified: 2026-07-29T07:00:11.750Z
---

# App Store submission status

## 2026-07-28 pre-submission deep audit (beyond code correctness)
Prior audits kept "passing" because they only checked JS/HTML correctness; all 4 rejections came from things code review can't see (native binary linking 2.1(a), runtime reviewer UX Guideline 4, policy 3.2.2). This pass checked the build layer:
- **NEW FIX — app privacy manifest was missing.** Added `ios/App/App/PrivacyInfo.xcprivacy` (commit `00bc7d7`) + wired into pbxproj Resources phase (hand-edited: fileRef `A1B2C3D4...0003`, buildFile `...0004`). Declares `NSPrivacyAccessedAPICategoryUserDefaults` reason `CA92.1` — `@capacitor/preferences` uses UserDefaults and ships NO manifest of its own, so without this Apple's pipeline flags **ITMS-91053** (enforced since May 2024, didn't exist during earlier submissions). Also declares NSPrivacyTracking=false + collected data types (name/email/phone/photos/otherUserContent/deviceID, all App Functionality, no tracking). **The ASC App Privacy nutrition label must MATCH these** or it's a mismatch flag.
- **Facebook SDK IS bundled** via `@capgo/capacitor-social-login` — its `Package.swift` unconditionally links `facebook-ios-sdk >=18.0.3` + GoogleSignIn + Alamofire even though only Google is used. AppDelegate does NOT init Facebook (only `FirebaseApp.configure()`) and Info.plist has no FacebookAppID → dormant, no launch crash (FBSDK v18 doesn't hard-crash unless FB APIs called). But its presence means the privacy label must be honest.
- **`getMemberInfo` (Code.gs:397) ignores the Active? column (col H) entirely** — anyone whose email is on the Roster roams the FULL app regardless of Active Yes/No. The only gate is roster membership: not-on-roster → forced to registration form (app.js:132), then "pending" access after submit. **Reviewer demo account `madhavsindia@gmail.com` MUST be on the roster and NOT deleted** — `deleteAccount_` wipes col D email, which would make it un-findable → registration wall → rejection.
- **Build bumped 7 → 8** (CURRENT_PROJECT_VERSION). Build 8 is now the one to cut/submit — it carries the privacy manifest + the HAU→AFU branding fix (commit `ae62b56`), neither of which is in TestFlight build 7. Branding fix is web-layer so it only ships if a NEW native build is cut.
- **NEW FIX 2026-07-29 (commit `8aa9c98`) — removed ALL in-app Zelle/PayPal payment surfaces** for Guideline 3.2.2(iv). Realized the 3.2.2 rejection's "collect charitable donations" almost certainly targeted (a) the "Submit Donation"/"Donate" LABELS in build 6 (already renamed to Record/Save Record post-build-6) AND/OR (b) the Boston Zelle/PayPal buttons, which pointed at PERSONAL accounts (Zelle `madhavsindia@gmail.com`, `paypal.me/MadhavendraSaxena`). Apple's own remedy for a non-Benevity/Candid nonprofit is website-link or SMS only — NOT PayPal.me/Zelle deep-links. User chose to REMOVE rather than reframe. Stripped: `ZELLE_URL`/`PAYPAL_URL` consts, the "Pre-pay your train ticket" button banner, `zellePayHTML()` pay-methods block, hidden `#zelle-qr-data` base64 QR img, QR injection. Bill view now shows amounts only; footer says payment arranged with leadership off-app. The comp-request reimbursement handle selector (Venmo/Zelle radio — how a volunteer is paid BACK) is unrelated, collects no money, LEFT intact. All inline scripts node-syntax-checked clean. NOTE: reviewer-notes paragraph about "external Zelle/PayPal links open in Safari" is now OBSOLETE — remove it.
- Still UNVERIFIABLE from code (the actual historical rejection causes): native Google/Apple sign-in on a real device; GAS web-app deployment set to "Anyone" + within quota at review time; demo account live state.

## Rejection 2: 1.0 (6) rejected 2026-07-10 (reviewed on iPad Air 11" M3)
Two new guidelines; **both fixed in commit `788fec9` (2026-07-12)**. **Build 7 built & published to TestFlight 2026-07-18** (buildId `6a5b047fe48e02212de1c9de`) after a final audit re-verified every fix in code. Remaining: in App Store Connect select build 7, reply to the rejection thread (3.2.2 explanation below), ensure demo account `madhavsindia@gmail.com` (A/Z) with fresh password in reviewer notes, then resubmit.

### Guideline 4 — SIWA asked for name/email again
Registration form after Apple sign-in required first/last name + email that Authentication Services already provided. Fix: `prefillRegistrationIdentity(fname, lname, email)` in app.js (used by BOTH Google and Apple paths) — fills `regFname/regLname/regEmail`, hides `#regNameRow` / `#regEmailGroup` when supplied, shows read-only `#regIdentity` summary chip; regDesc changes to "Choose your branch to finish". Apple returns name/email ONLY on first authorization, so `capacitorAppleSignIn()` in index.html caches them in localStorage key `afu_apple_identity_<sub>` and merges on repeat sign-ins. Fallback: missing fields stay visible/editable.

### Deep audit pass (2026-07-12, commit `ff08680` + GAS deploy @86)
Full re-audit beyond the two cited issues found and fixed:
- **5.1.1(v) account deletion was fake**: `deleteAccount_` cleared only email (col D) — name/phone/photo/DoB stayed, and the Apple sub in col J let "deleted" Apple users sign right back in. Now clears B,C,D,G,I,J, sets H=No, and `removeFcmTokens_` deletes the user's FCM Tokens rows. Deployed to GAS; confirm-dialog copy updated.
- **Privacy policy** now names Sign in with Apple + Face ID on-device statement + accurate deletion description.
- "Welcome to HAU!" → "Welcome to AFU!" brand fix.
- Verified OK: Apple button same size as Google (4.8 prominence); no horizontal overflow on any tab at 768px or 1180px (iPad); camera/photo/FaceID purpose strings present; Boston Zelle/PayPal is 3.1.5(a) physical-services (allowed, opens externally).

### Guideline 3.2.2(iv) — "collects charitable donations in app"
App never collects money — Donations tab is a ledger for cash collected in person. Apple misread the "Donate" nav + "Submit Donation" button. Fix: nav renamed "Record", heading "Record a Donation" with explicit copy "No money is collected, processed, or transferred in this app", button "Save Record", dash tile "Record Donation", welcome-tour slide reworded. Reviewer reply must ALSO explain this (copy change alone may not clear a 3.2.2 flag): the app is an internal volunteer tool; donations are handed to volunteers as cash at physical fundraisers; the app only records the UDI + amount to a spreadsheet ledger. Boston Zelle/PayPal links are payment for physical services (trip transport) under 3.1.5(a) and open in the system browser — not donations.

## History: 1.0 (2) rejected 2026-06-23
Submission `7be143d2-4f13-432c-9820-c83239f0be7d` was rejected on two guidelines. **Both fixed in commit `44cb160` (2026-07-05)** and re-verified in current code 2026-07-07. First fixed in build 3 (Codemagic 21); the **latest TestFlight build is now 1.0 (4)** (Codemagic 28, adds push) which also carries both fixes — see [[project-codemagic-build]]. Resubmit build 4.

### Issue 1 — 5.1.1(v): phone number required at registration
Apple: apps must not require personal info not essential to core function.
Fix: `submitRegistration()` in app.js no longer requires phone; label changed to "Phone Number (Optional)" in index.html. Code.gs accepts empty phone unchanged.

### Issue 2 — 2.1(a): "Sign in with Google" crashed
Error: `undefined is not an object (evaluating 'window.Capacitor.Plugins.GoogleAuth.signIn')`.
**Root cause:** `@codetrix-studio/capacitor-google-auth` is Capacitor-6-era with NO Package.swift — the iOS project uses SPM, so the plugin was silently never linked into the native build.
**Fix:** replaced with `@capgo/capacitor-social-login@8.x` (official successor, Capacitor 8 + SPM). Native sign-in in index.html now:
```js
await SocialLogin.initialize({ google: { iOSClientId: '1016131808942-vckq48aah23fmk42vdmknpe8il1tfn3n...', webClientId: '1016131808942-6m77i0gq14t71g01q8o8qkaon29ilsv6...' } });
const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['profile','email'] } });
// user profile in result.profile {email, givenName, familyName, name, imageUrl}
```
capacitor.config.json: `plugins.SocialLogin.providers = { google: true, apple/facebook/twitter: false }` (NOTE: provider disabling only affects the CocoaPods podspec — via SPM the Facebook SDK + Alamofire still get linked, but dormant/uninitialized, which is fine).
Info.plist already had `GIDClientID` + reversed-client-id URL scheme. Apple Sign In still uses the separate `@capawesome/capacitor-apple-sign-in` plugin.

## Current phase: device testing via TestFlight
**Build 6 (1.0 build 6) is now the latest on TestFlight (published 2026-07-09, Codemagic buildId `6a4fb5125573e1d2d6a16d15`)** — carries build 5's work (push, Home "Your Tasks" card, XSS sanitization, getMemberInfo fullName) plus the "Profile Photo (Optional)" registration label. Device-test + resubmit should target build 6. (History: build 5 buildId `6a4f98e57bbdfda8508f77b1`; build 4 before that.) The gate before App Store resubmission is verifying Google sign-in **on a real device** — the whole reason 2.1(a) happened is the plugin looked fine in code/browser but was never linked into the native binary, so code review alone can't confirm the fix. Install from TestFlight and actually tap "Sign in with Google." For the user's own device (iPad/iPhone) the fastest path is **TestFlight Internal Testing** (no Beta App Review needed): add the Apple ID under App Store Connect → Users and Access, add to an internal group, assign the build, then install via the TestFlight app from the email invite. External/public-link testing exists too but the first external build needs Beta App Review.

## To resubmit to App Store
In App Store Connect: select build 4 on the 1.0 version page, reply to the rejection message noting both fixes, resubmit. Also required before public release (not for TestFlight): screenshots, description, **public** privacy-policy URL, age rating, and **demo account credentials in "Notes for Reviewer"** — the app is login-gated behind Google/Apple OAuth, so without a way in the reviewer auto-rejects. See [[project-capacitor-ios]] and [[project-appstore-screenshots]].

### Reviewer demo account
Demo Google account for App Review notes: **`madhavsindia@gmail.com`** (password not stored here — kept out of memory on purpose; user rotates it around submission time). This account should carry admin (A/Z) access so the reviewer sees the full app. Draft "Notes for Reviewer" + rejection-thread reply text prepared 2026-07-07.

Related: [[project-codemagic-build]], [[project-capacitor-ios]], [[feedback-cap-sync-windows]]

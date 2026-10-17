---
name: project-apple-signin
description: "Sign in with Apple implementation status — plugin, roster column, GAS action, frontend flow"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6d85f0e8-dc4c-4eec-bd1c-427a4991cb9a
---

Sign in with Apple is fully implemented and wired end-to-end ([[project-capacitor-ios]]). All steps complete as of 2026-06-17.

**Why:** Apple requires alternative sign-in options; Google-only is a rejection risk. Apple also returns email only on first login, requiring a stable identifier (sub) stored in the roster.

## Roster column
- **Col J (index 9)** = Apple sub (user identifier, stable across sessions)
- Written on first Apple login; used for all subsequent lookups
- Col D (email) remains the Google Sign-In lookup key

## GAS backend (Code.gs)
- `action=appleSignIn` → calls `appleSignIn_(sub, email)`
  - First tries col J lookup (returning user)
  - Falls back to col D email lookup (first login) → writes sub to col J
  - Returns same shape as getMemberInfo + `email` field (roster email, needed since Apple doesn't return it on repeat logins)
- `buildMemberResult_(row)` helper — shared result builder, also returns `email` from col D

## Frontend (index.html + app.js)
- `#appleSignInBtn` — hidden by default, shown on `window.Capacitor.isNativePlatform()`
- `capacitorAppleSignIn()` in index.html — calls `SignInWithApple.authorize({ requestedScopes: [0, 1] })`, passes `user` (sub), `email`, `givenName`, `familyName` to `onAppleSignedIn`
- `window.onAppleSignedIn(sub, email, givenName, familyName)` in app.js — full sign-in flow parallel to `onSignedIn`; stores email in biometric key so Face ID replay works via normal email lookup

## Done (2026-06-17)
- `@capacitor-community/apple-sign-in@7.1.0` installed in APP/ with `--legacy-peer-deps`
- `npx cap sync ios` run — plugin confirmed in Package.swift (8 plugins total)
- Committed + pushed to main

## All steps complete (2026-06-17)
1. Apple Developer enrollment approved (ID: FZK3534QZM) ✓
2. App ID `com.afu.volunteerportal` registered on developer.apple.com ✓
3. "Sign in with Apple" capability enabled on the App ID ✓
4. `@capacitor-community/apple-sign-in` npm installed + cap sync ✓
5. `App.entitlements` created with `com.apple.developer.applesignin` entitlement ✓
6. `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` wired into Debug + Release target configs in pbxproj ✓

## Onboarding for unrecognized Apple users (fixed 2026-06-17)
When an Apple sign-in email is not in the roster, the app shows the registration form. Fixes applied:
- `volunteerEmail` is now set before showing the reg card (was empty → registration submitted with no email)
- `window._pendingAppleSub` carries the Apple sub through registration → cleared after success
- `submitRegistration` falls back to `regEmail.value` if `volunteerEmail` is empty; sends `appleSub` param
- Email field made editable if Apple didn't return one (repeat sign-in before account recognized)
- Description text changed from "Google account" to generic "account" (id=`regDesc`)

**Pending Volunteers sheet layout** now has a 7th column: `G = Apple Sub`
- `handleVolunteerRegistration` writes it; `approveVolunteer` reads col G and writes to col J of Roster

**Switching between Google and Apple:** if a user is on the roster via Google and later tries Apple Sign-In with the same email, the first Apple login matches by email and auto-writes the sub to col J — no manual step needed.

## How to apply
Sign in with Apple is fully complete for both new and returning users. No further code/config steps needed — the next gate is triggering a Codemagic build to verify everything compiles end-to-end.

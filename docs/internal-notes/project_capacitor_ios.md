---
name: project-capacitor-ios
description: "Capacitor iOS wrapping status — what's done, what's pending, build pipeline, and plugin setup"
metadata:
  node_type: memory
  type: project
  originSessionId: 05929651-6f8e-4c8c-968b-4b7f157d466d
---

The AFU Volunteer Portal is wrapped as a native iOS app using Capacitor 8. Capacitor embeds the web app (index.html / app.js) in a WKWebView with access to native plugins.

**Why:** Apple requires more than a repackaged website. Native plugins (haptics, status bar, offline banner, push notifications) plus the Capacitor shell satisfy guideline 4.2.

## Primary deployment: PWA via GitHub

The app is a **PWA first** — repo `https://github.com/Advocacy-for-the-Unhoused/app`, served live via GitHub Pages at the custom domain **`https://app.hauhelps.org`** (CNAME file at repo root). Every push to `main` auto-deploys within ~1 min; verified live + reflecting latest commits 2026-06-18. This is the channel to share for registration — no App Store dependency. The iOS Capacitor wrapper is secondary.

```
index.html / app.js  ←  edit here (root)
      ↓  pre-commit hook auto-copies to www/
    www/              ←  Capacitor webDir + GitHub Pages source
      ↓  git push → GitHub Pages (PWA live)
      ↓  Codemagic CI (iOS build, when wrapper is active)
    .ipa              →  TestFlight / App Store
```

- **UI/logic changes** (index.html, app.js): commit + push. Done. No local cap sync needed.
- **Backend changes** (Code.gs): clasp push + deploy only. No app rebuild.
- **Native plugin changes**: `npx cap sync ios` + Codemagic rebuild (only when working on iOS wrapper).

## What's done

- `manifest.json` with 192/512/1024 icons; `www/` is Capacitor webDir
- Capacitor initialized: bundle ID `com.afu.volunteerportal`, app name "AFU Volunteer Portal"
- `@capacitor/ios` added; iOS Xcode project at `ios/`
- Google Sign-In: `@capgo/capacitor-social-login@8.x` (replaced `@codetrix-studio/capacitor-google-auth` 2026-07-05 — codetrix had no SPM support so it was never linked into the iOS build, causing the App Review 2.1(a) rejection; see [[project-appstore-rejection-v1]])
- `@capacitor/haptics`, `@capacitor/network`, `@capacitor/status-bar` installed
- `@capacitor/push-notifications` installed with `--legacy-peer-deps`
- Google Sign-In: native button auto-shows on `window.Capacitor.isNativePlatform()`, GSI button in browser
- iOS OAuth client ID in `ios/App/App/Info.plist`; `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSFaceIDUsageDescription` all set
- `codemagic.yaml` — workflow: `ios-app-store`; **automatic signing** via Apple Developer Portal integration (ios_credentials env group with APP_STORE_CONNECT_PRIVATE_KEY, _KEY_IDENTIFIER, _ISSUER_ID); CocoaPods, IPA build, TestFlight submit
- Apple Developer enrollment completed (ID: FZK3534QZM); App ID `com.afu.volunteerportal` registered; "Sign in with Apple" capability enabled on developer.apple.com
- App Store Connect API key `R4WPW69326` (App Manager role) connected to Codemagic; `ios_credentials` env group created and populated
- Native features: haptics on donation/hours/scan, status bar `#1A1311` dark, offline red banner
- GitHub repo connected: `https://github.com/Advocacy-for-the-Unhoused/app` — Codemagic watches main branch
- `.clasp.json` added to APP/ — Code.gs can be pushed directly
- `GoogleService-Info.plist` **committed to repo since 2026-07-06** (was gitignored; un-ignored so Codemagic can bundle it — iOS Firebase config isn't a real secret, ships in every app bundle)
- Sign in with Apple fully implemented in code (col J sub, GAS `appleSignIn_` action, `onAppleSignedIn` in app.js) — see [[project-apple-signin]]
- Push notifications: JS/backend done since June; **native iOS Firebase SDK wired 2026-07-06 (commit 8570bfb)** — swapped `@capacitor/push-notifications` → `@capacitor-firebase/messaging@8.3.0`, `FirebaseApp.configure()` in AppDelegate, `aps-environment=production` entitlement, plist bundled + un-gitignored. Needs a Codemagic rebuild + device test to actually deliver. See [[project-push-notifications]]
- **Biometric sign-in (Face ID / Touch ID)** fully implemented: `@aparajita/capacitor-biometric-auth@10` + `@capacitor/preferences@8` installed; auto-prompts on launch; email stored in Capacitor Preferences under `afu_stored_auth` — see [[project-biometric-auth]]
- Dark/light mode (adaptive CSS vars + `@media prefers-color-scheme: light`), safe area insets (`viewport-fit=cover` + `env(safe-area-inset-top)`), 44px touch targets, portrait lock, arm64 requirement — all done for Apple compliance
- Privacy policy in-app modal (bottom-sheet, shown from login screen)
- Account deletion: `deleteAccount()` in app.js + `action=deleteAccount` in Code.gs (clears col D email only, does NOT delete row)
- Dynamic Type: `text-size-adjust: auto` on html; minimum text sizes 0.72rem
- App name changed to "AFU" (`CFBundleDisplayName` in Info.plist + h1/title in index.html)
- Sign in with Apple: fully complete — plugin installed, App.entitlements wired, capability enabled on developer.apple.com (see [[project-apple-signin]])

## Status (build pipeline working)

- ~~APNs Auth Key~~ — DONE 2026-06-17
- ~~Sign in with Apple~~ — DONE 2026-06-17 (plugin, entitlements, cap sync, pbxproj wired)
- ~~Trigger Codemagic build~~ — DONE; automatic signing + `GoogleService-Info.plist` verified. Latest TestFlight build is **1.0 (4)** (Codemagic build 28, 2026-07-06, adds push); build 3 (Codemagic 21) was the first with the rejection fixes.
- Current phase: **build 6 (1.0 build 6) is the latest on TestFlight (2026-07-09, buildId `6a4fb5125573e1d2d6a16d15`)** — adds "Profile Photo (Optional)" registration label on top of build 5 (Home "Your Tasks" card, XSS sanitization, getMemberInfo fullName, push). Device-test build 6 via TestFlight (Google sign-in + push), then App Store resubmit — see [[project-appstore-rejection-v1]] and [[project-codemagic-build]]
- Still needed for public release: App Store Connect assets — screenshots (see [[project-appstore-screenshots]]), description, **public** privacy policy URL, age rating; demo account credentials in "Notes for Reviewer"

**Bundle ID note:** `com.afu.volunteerportal` is fine despite not owning afu.com — no Universal Links or Sign in with Apple web flows means Apple never checks domain ownership.

**App Store Connect capability note:** When registering App ID, enable Push Notifications only — no Broadcast capability needed (that's for live sports/news feeds).

## Key files

- `capacitor.config.json` — plugin config, GoogleAuth serverClientId
- `ios/App/App/Info.plist` — iOS OAuth client ID, URL scheme, privacy descriptions
- `codemagic.yaml` — full build + TestFlight publish config with automatic signing
- `.clasp.json` / `.claspignore` — clasp wired to Code.gs GAS project
- `www/` — Capacitor webDir (auto-synced from root via pre-commit hook)

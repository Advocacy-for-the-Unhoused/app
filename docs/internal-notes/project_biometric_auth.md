---
name: project-biometric-auth
description: "Biometric sign-in (Face ID / Touch ID) implementation — plugin, flow, storage key, and in-app push toast"
metadata: 
  node_type: memory
  type: project
  originSessionId: 096826fe-259a-4cbc-af10-f5aa4faecda8
---

Biometric sign-in is fully implemented in code as of 2026-06-17 (commit 2f504b9).

**Why:** Apple guideline 4.2 requires genuine native functionality. Biometric sign-in plus push toasts and haptics demonstrate the app is more than a repackaged website.

## Flow
1. First launch → user signs in with Google (or Apple). After `onSignedIn` sets `window.volunteerProfile`, `storeAuthForBiometric(payload)` saves `{email, given_name, family_name, picture}` to Capacitor Preferences under key `afu_stored_auth`.
2. Every subsequent launch → `initBiometricSignIn()` (called in DOMContentLoaded, native-only) checks for stored auth + calls `BiometricAuth.checkBiometry()`. If available, shows the Face ID / Touch ID button and auto-prompts after 700ms.
3. Biometric passes → `biometricSignIn()` calls `window.onSignedIn(storedPayload)` directly — no Google OAuth round-trip.
4. Biometric cancelled → Google Sign-In button stays visible as fallback. Stored auth is preserved for next time.

## Plugins installed (2026-06-17)
- `@aparajita/capacitor-biometric-auth@10.0.0` — `BiometricAuth` plugin; `BiometryType` enum: `none=0, touchId=1, faceId=2`
- `@capacitor/preferences@8.0.1` — `Preferences` plugin for local key-value storage

Both registered in `ios/App/CapApp-SPM/Package.swift` via `npx cap sync ios`.

## Key functions in app.js
- `storeAuthForBiometric(payload)` — saves after sign-in
- `getStoredAuth()` / `clearStoredAuth()` — read / wipe stored credentials
- `initBiometricSignIn()` — called on DOMContentLoaded; shows button + auto-prompts
- `biometricSignIn(auto)` — performs the actual challenge; `auto=true` suppresses error haptic on cancel

## Key UI in index.html
- `#biometricSignInBtn` — hidden by default; `.btn-biometric-native` class (dark AFU theme)
- `#biometricSignInOr` — "— or —" separator between Google and biometric buttons
- `.native-push-toast` / `.native-toast-title` / `.native-toast-body` — in-app push banner styles

## In-app push toast (also added this session)
`showNativeToast(title, body, tab)` in app.js — shows a slide-in banner from top when a push notification arrives while the app is open. Tapping routes to `tab` via `switchTab()`. `pushNotificationActionPerformed` listener handles background tap routing.

## Info.plist
`NSFaceIDUsageDescription` = "Use Face ID to sign in quickly without re-entering your credentials each time."

## How to apply
When working on auth or sign-in flows, remember biometric is tied to the `afu_stored_auth` Preferences key. If sign-out is ever added, call `clearStoredAuth()` so the biometric button disappears on next launch.

# Android app — setup, testing and shipping

The Android app is the same website (`www/`) wrapped by Capacitor, exactly like
iOS. This guide covers what's different and the account steps only a person
with the AFU logins can do. Read [HANDOFF.md](../HANDOFF.md) first.

| | iOS | Android |
|---|---|---|
| Native project | `ios/` | `android/` |
| App ID | bundle ID `com.afu.volunteerportal` | package name `com.afu.volunteerportal` |
| Firebase config | `ios/App/App/GoogleService-Info.plist` | `android/app/google-services.json` |
| Signing | Apple certificate (Codemagic makes it) | **upload keystore** you create once — back it up |
| Build file | `.ipa` | `.aab` (app bundle) |
| Beta testing | TestFlight | Play Console → **Internal testing** |
| Build number | `CURRENT_PROJECT_VERSION` (bump by hand) | `versionCode` (Codemagic sets it automatically) |
| CI workflow | `ios-app-store` | `android-play` |

---

## 1. What is different on Android (already handled in code)

- **Sign in with Apple is iOS-only.** The button is hidden on Android
  (`index.html`, the native sign-in `DOMContentLoaded` block). Android users
  sign in with Google. Someone who joined *only* through Apple's "Hide My
  Email" relay can't sign in on Android, because their roster email is an
  `@privaterelay.appleid.com` address.
- **Back button.** `initAndroidBackButton()` in `app.js`: Back closes the top
  popup, else returns to Home, else puts the app in the background. Without
  it, Back would quit the app even with a popup open.
- **Biometric sign-in** shows "Fingerprint" / "Face Unlock" on Android
  (`biometryName()` in `app.js`).
- **Notification wording** points to Android's Settings app, not iOS's.
- **Service worker** is only registered on the website, not inside the apps.
  On Android it would otherwise really run and could serve old cached files
  after an app update.
- **Push notifications:** a notification channel "AFU updates" is created in
  `MainActivity.java`. The white status-bar icon is `ic_stat_notify`. The
  backend (`Code.gs sendPush_`) needs **no change**; the same Firebase service
  account sends to iOS and Android.
- **Permissions** (`android/app/src/main/AndroidManifest.xml`): camera (QR
  scanner), notifications. The Google advertising-ID permission that the
  sign-in library pulls in is removed (the app has no ads or tracking).
- **Facebook SDK:** the social-login plugin's `cap sync` hook reads
  `"facebook": false` from `capacitor.config.json` and leaves Facebook out of
  the Android build (only empty placeholder classes remain). The iOS-only
  `patches/` file is not involved on Android.
- **Icons/splash** were generated from `assets/icon-only.png` (the same image
  as the iOS icon), including an Android 13+ "themed" monochrome icon.

---

## 2. Google sign-in on Android — what you must set up

### Your two Google Cloud projects

A Google OAuth client ID starts with the **project number** of the Google
Cloud project it lives in. The app uses two projects:

| What | Project number | Where it's used |
|---|---|---|
| Google sign-in client IDs (web `1016131808942-6m77…`, iOS `1016131808942-vckq…`) | **1016131808942** | `index.html` `ensureSocialLoginInit()`, iOS `Info.plist` |
| Firebase `afu-volunteer-portal` (push) | **475682222670** | `GoogleService-Info.plist` (`GCM_SENDER_ID`), `google-services.json` |

They are **different projects**. That matters:

- On Android, Google sign-in (Android's "Credential Manager") only works if
  there is an **Android-type OAuth client in the same project as the web
  client ID** (`1016131808942`), registered with the package name
  `com.afu.volunteerportal` **and the SHA-1 fingerprint of the key that signed
  the installed app**.
- Adding SHA-1s in the **Firebase** console creates Android clients in the
  *Firebase* project (`475682222670`). **That alone will not make Google
  sign-in work**, because the app's web client ID is in the other project.
- So: Firebase is only for **push**. Google sign-in is set up in Google Cloud
  Console, in project `1016131808942`. You don't need a new project, and you
  should not change the client IDs in the code.

### Steps

1. Open <https://console.cloud.google.com>, use the project picker, and choose
   the project whose **Project number** (shown on its Dashboard / Project
   settings) is `1016131808942`. To double-check: **APIs & Services →
   Credentials** should list the existing web client `1016131808942-6m77…`.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Application type: Android.**
   - Package name: `com.afu.volunteerportal`
   - SHA-1: one of the fingerprints below.
3. Repeat step 2 for **each** SHA-1 (one Android client per fingerprint):
   - **Debug** (your Mac, for emulator builds from Android Studio):
     ```bash
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```
     (This file appears after your first build in Android Studio.)
   - **Upload key** (section 4 below) — for builds you sign yourself.
   - **Play App Signing key** — Google re-signs what people download from
     Play with its own key. Find it in Play Console → your app → search
     "App signing" → *App signing key certificate* → SHA-1. **If this one is
     missing, sign-in works on your emulator but fails for every Play user.**
4. The OAuth consent screen is already verified. Adding Android clients to the
   same project shouldn't need re-verification.

If sign-in fails with error **10** / "developer error", the SHA-1 of the build
you're running isn't registered in project `1016131808942`.

---

## 3. Firebase (push notifications)

1. <https://console.firebase.google.com> → project **afu-volunteer-portal** →
   ⚙ Project settings → **Add app → Android**.
2. Package name `com.afu.volunteerportal`, nickname "AFU Android". SHA-1 is
   optional here (not needed for push).
3. Download **`google-services.json`** and put it at
   `android/app/google-services.json`. Commit it, like the iOS plist. It isn't
   a secret: it ships inside every app. The Gradle build picks it up
   automatically. Without it the app still builds, but push is off.
4. No Apple-style key upload is needed for Android.
5. Backend: nothing to do. `FCM_SERVICE_ACCOUNT` already covers Android.

---

## 4. Upload keystore (do this once, keep it forever)

Google Play identifies your updates by this key. **If you lose the keystore or
its password, you need Google support to reset it**, so store both in AFU's
password manager. Never commit them (`*.jks` and `*.keystore` are gitignored).

```bash
keytool -genkeypair -v -keystore afu-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Get its SHA-1 (add it in section 2):

```bash
keytool -list -v -keystore afu-upload.jks -alias upload
```

To build a signed release on your own Mac, create `android/keystore.properties`
(gitignored):

```properties
storeFile=/absolute/path/to/afu-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

---

## 5. Testing on your Mac with the Android emulator

You don't need an Android phone.

**One-time setup**

1. Install **Android Studio** from <https://developer.android.com/studio>
   (pick Apple chip or Intel to match your Mac). On first launch choose
   **Standard** setup; it downloads the Android SDK.
2. Install a "Google Play" emulator: **Device Manager** (phone icon on the
   right, or *More Actions → Virtual Device Manager*) → **+ / Create virtual
   device** → pick a phone that shows the **Play Store icon** (e.g. *Pixel 8*)
   → system image **API 36, "Google Play"** (download it) → Finish.
3. Start the emulator (▶). In it, open **Settings → Google → sign in** with a
   Google account. Google sign-in and push need a signed-in Play account.
4. For fingerprint sign-in: emulator **Settings → Security → Fingerprint
   unlock**, set a PIN, and when it asks you to touch the sensor, open the
   emulator's **⋯ (Extended controls) → Fingerprint → Touch sensor**.
5. Camera (QR scanner): the emulator's back camera shows a virtual room. To
   use your Mac's webcam: Device Manager → ✎ edit the device → *Advanced
   settings* → Camera back: **Webcam0**.

**Each time you test a branch**

```bash
git checkout android-setup
```

```bash
npm install --legacy-peer-deps
```

```bash
npx cap sync android
```

```bash
npx cap open android
```

Android Studio opens the `android/` project. Wait for "Gradle sync" to
finish, choose your emulator in the toolbar, and press **Run ▶**.

- Like iOS, the app runs the copy of `www/` taken at the last `cap sync`.
  After changing `index.html` / `app.js`, copy them to `www/` (the pre-commit
  hook does this on commit) and run `npx cap sync android` again.
- **See the web console / errors:** open Chrome on your Mac → go to
  `chrome://inspect` → under the emulator, click **inspect** next to AFU.
- **Test push:** sign in, tap *Turn On Notifications*, check that your email
  gets a fresh row in the "FCM Tokens" sheet, then trigger something that
  sends a push (e.g. approve hours for that account).
- **Test Back:** open a popup (e.g. the scanner or an action sheet), use the
  emulator's Back. The popup should close and the app should stay open.

---

## 6. Google Play Console

AFU already has an **organization** developer account, so the 12-tester /
14-day rule for personal accounts doesn't apply.

1. **Create app** → name "AFU", default language, App, Free.
2. **Play App Signing**: accept Google-managed signing when you upload the
   first bundle. Then copy the **App signing key SHA-1** into Google Cloud
   (section 2, step 3).
3. **First upload must be manual:** Test and release → Testing → **Internal
   testing** → Create new release → upload the `.aab` (from Codemagic's
   artifacts or a local `./gradlew bundleRelease`). Add yourself (and other
   AFU testers) to the internal tester list and open the opt-in link on the
   test device/emulator account.
4. **App content** forms (Policy → App content):
   - **Privacy policy URL**: the same public URL used for the App Store.
   - **Data safety**: matches what the app actually collects (see
     `privacy.html`): name, email, phone (optional), photos, user content,
     device push token; for app functionality only; no ads, no tracking; data
     encrypted in transit; users can request deletion.
   - **Account deletion**: Play requires a **web link** where people can
     request deletion without the app (in-app deletion alone isn't enough).
     Use `https://app.hauhelps.org/delete-account.html` (`delete-account.html`
     at the repo root; live once merged to `main`). It covers in-app deletion,
     deletion by email, and deleting only some data (e.g. a phone number),
     which AFU handles by email within 30 days.
   - **Ads**: no. **Content rating** questionnaire.
   - **Target audience**: some volunteers are under 18. Choose the age groups
     honestly; picking any group **under 13** brings in Google's Families
     policy requirements.
   - **App access**: give reviewers a demo Google account, like the App
     Store "Notes for Reviewer".
5. **Store listing**: short + full description, 512×512 icon (use
   `icons/icon-512.png`), 1024×500 feature graphic, at least 2 phone
   screenshots (from the emulator: the camera button in the emulator toolbar).

---

## 7. Codemagic (automatic builds to Play)

The `android-play` workflow in `codemagic.yaml` builds a signed `.aab` and
uploads it to **Internal testing** as a draft. It runs on Codemagic's
default build machine, the same one the iOS workflow uses.

One-time setup:

1. **Keystore:** Codemagic → Teams → *Code signing identities* → **Android
   keystores** → upload `afu-upload.jks`, enter its password, alias `upload`
   and key password, and set the **reference name** to
   `afu_upload_keystore`.
2. **Play access (service account):**
   - In Google Cloud (either project is fine; Firebase's is a good home) →
     IAM & Admin → **Service accounts** → create one (e.g. `codemagic-play`)
     → *Keys* → Add key → JSON → download.
   - Play Console → **Users and permissions** → Invite new user → the
     service account's email → app access for AFU with *Release to testing
     tracks* (and *View app information*).
   - Codemagic → app → Environment variables → group **`google_play`** →
     variable `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` = the whole JSON file
     contents, marked Secure.
3. Do the **first upload manually** (section 6, step 3). Play rejects API
   uploads for an app that has never had a bundle uploaded.
4. Start a build: Codemagic → AFU → Start new build → workflow
   **AFU Android Play Build**, branch of your choice. `versionCode` is set to
   (latest on Play + 1) automatically.
5. In Play Console, open the draft release on Internal testing and **Roll
   out**.

---

## 8. Order of operations (checklist)

1. ☐ Merge/check out `android-setup`; build and run on the emulator (section 5).
   Google sign-in will fail until step 3, which is expected.
2. ☐ Firebase: add Android app, commit `google-services.json` (section 3).
3. ☐ Google Cloud project `1016131808942`: Android OAuth client with your
   **debug** SHA-1 (section 2). Re-test sign-in, push, fingerprint, scanner,
   Back.
4. ☐ Create the upload keystore; back it up; add its SHA-1 (section 4 + 2).
5. ☐ Play Console: create app; manual first upload to Internal testing; accept
   Play App Signing; add **its** SHA-1 (section 6 + 2).
6. ☐ Install from the internal-testing link and re-test Google sign-in (this
   is the copy real users get).
7. ☐ Codemagic: keystore + `google_play` group; run `android-play` (section 7).
8. ☐ Store listing, Data safety, account-deletion link, content rating,
   reviewer access → promote to Production → submit for review.

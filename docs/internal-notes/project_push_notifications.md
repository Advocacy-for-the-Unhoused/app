---
name: project-push-notifications
description: "Push notification system — position codes, FCM setup, what's built in Code.gs, what's still needed in index.html"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4a677b66-43a7-4fbd-9bfa-162280e8a581
---

# Push Notification System

## Position Code System (col E of Roster sheet)
Single letters, concatenated, no separator. Blank = general volunteer.

| Code | Role | Admin access |
|------|------|-------------|
| `A` | Super Admin | Full — sees/edits everything |
| `P` | Branch President | Admin panel access |
| `V` | Active general volunteer (was "Vice President" until 2026-07-09) | No admin |
| `W` | Web Dev team | — |
| `S` | Social Media team | — |
| `F` | Finance team | — |
| `C` | Branch Coord team member | — |
| `Z` | Branch Coordination officer (Maanya) | Same as A |
| blank | General volunteer | — |

Admin gate: position must match `/[AZP]/` to see admin tab.
Z (not A) gets notified for new volunteer registrations.

## GAS Changes — DONE in Code.gs

### getMemberInfo now returns `position` (col E)
- Return shape: `{ firstName, branchCode, branchName, position }`
- Removed the col E fallback for branchCode (it was wrong — col E is position, col F is branchCode)

### New doPost routes added
- `action=storeFcmToken&email=...&token=...` → upserts FCM Tokens sheet
- `action=getMeetingConfig` → returns Meeting Config sheet as key/value object
- `action=saveMeetingConfig&day=N&time=HH:MM` → saves day/time
- `action=cancelMeeting&branchCode=X&cancelled=Yes/No` → toggles cancel flag
- `action=sendBostonPaymentReminder&email=...` → push single volunteer
- `action=sendBostonDeadlineReminder` → push all Boston registrants

### Modified existing actions
- `submitHours` → after save, pushes branch president of the submitter
- `approveHours` → reads row first (email, eventName, hours), then approves, then pushes volunteer
- `denyHours` → reads row first (email, eventName), then deletes, then pushes volunteer
- `handleVolunteerRegistration` → after emails, pushes branch president + all Z-tagged users
- `tbSaveChange` → when type==='taskAssignee', looks up assignee name in Roster → pushes them

### New helper functions appended to Code.gs
- `getFcmSheet_()` — gets/creates "FCM Tokens" sheet in ROSTER_SS_ID (cols: Email, Token, Updated)
- `storeFcmToken_(email, token)` — upsert
- `getFcmToken_(email)` — lookup
- `getFcmTokensByBranch_(branchCode)` — all active members of branch → tokens
- `getFcmTokensByPositionCode_(code)` — all active members with code in position → tokens
- `getFcmAccessToken_()` — JWT → OAuth token using service account from Script Properties
- `sendPush_(token, title, body)` — FCM HTTP v1 single send
- `sendPushToMany_(tokens, title, body)` — FCM HTTP v1 batch send (one access token, multiple sends)
- `getMeetingConfigSheet_()` — gets/creates "Meeting Config" sheet in ROSTER_SS_ID
- `getMeetingConfig_()` — returns key/value object
- `setMeetingConfigKey_(key, value)` — upsert
- `checkMeetingNotifications()` — hourly trigger: sends push 4h before meeting, resets cancel flags
- `setupMeetingTrigger()` — run once from Apps Script editor to install hourly trigger

### Script Properties — DONE (set 2026-06-13)
- `FCM_PROJECT_ID` = `afu-volunteer-portal`
- `FCM_SERVICE_ACCOUNT` = service account JSON for `firebase-adminsdk-fbsvc@afu-volunteer-portal.iam.gserviceaccount.com`

### New sheets created auto on first use
- "FCM Tokens" in ROSTER_SS_ID — cols: Email | Token | Updated
- "Meeting Config" in ROSTER_SS_ID — rows: meetingDay|1, meetingTime|17:00, cancel_A|No ... cancel_M|No

## Frontend Changes — DONE in app.js

### volunteerProfile now includes `position`
```js
window.volunteerProfile = { ..., position: info.position || '' }
```

### registerPushNotifications() added to app.js
- Guards with `window.Capacitor?.isNativePlatform()`
- Requests permission, calls `PushNotifications.register()`
- On `registration` event, POSTs `action=storeFcmToken` to SCRIPT_URL
- Called right after `window.volunteerProfile` is set in `onSignedIn`

### @capacitor/push-notifications installed
- Run with `--legacy-peer-deps` (Capacitor 8 compat)

## Frontend Changes — ALL DONE in index.html

### Admin tab structure ✓
- `switchTab('admin')` gates on `/[AZP]/` regex — shows `#admin-lock` or `#admin-content`
- `#admin-content` div opens and closes correctly

### Meeting Scheduler section ✓
- Collapsible `.admin-section` with `id="meeting-config-body"` inside `#admin-content`
- CSS in `<style>` block: `.meeting-row`, `.meeting-label`, `.meeting-field`, `.meeting-cancel-grid`, etc.
- JS in standalone `<script>` block at bottom of `</body>`:
  - `loadMeetingConfig()` — fetches getMeetingConfig, renders day/time pickers + cancel checkboxes
  - `saveMeetingDay(day)` — POST saveMeetingConfig
  - `saveMeetingTime(time)` — POST saveMeetingConfig
  - `saveMeetingCancel(branchCode, bool)` — POST cancelMeeting
  - All exposed to `window`
- A/Z see all 5 branch cancel rows; P sees only their own branchCode row

### Boston payment reminder button ✓
- `buildVolCard`: "Push Payment Reminder" button added before `vol-card-subtotals`, shown only if `!vol.paid`
- `sendPaymentReminder(email)` in same standalone script → POST `sendBostonPaymentReminder`

### Boston deadline reminder button ✓
- "Notify All: Deadline" button added next to Refresh in the vol-roster header bar
- `sendBostonDeadlineReminderAll()` → POST `sendBostonDeadlineReminder`

### CSS ✓
- `.push-reminder-btn` and all meeting scheduler classes added to `<style>` block

### setupMeetingTrigger() — DONE (run 2026-06-13)
Hourly trigger for `checkMeetingNotifications` is installed in Apps Script. No need to run again.

### Firebase project — DONE (created 2026-06-13)
- Project ID: `afu-volunteer-portal`
- `GoogleService-Info.plist` placed in `ios/App/App/`
- **APNs Auth Key uploaded to Firebase 2026-06-17** — Key ID `2Y73U73KA5`, Team ID `8549YWF992`, production row, `com.afu.volunteerportal`. Full chain (GAS → FCM → APNs → device) is configured.

### Native iOS Firebase SDK — WIRED 2026-07-06 (commit 8570bfb)
The native link was the missing piece all along; JS/backend were done since June but no FCM token was ever produced so every send failed silently.
- **Swapped `@capacitor/push-notifications` → `@capacitor-firebase/messaging@8.3.0`** (capawesome, full SPM support, pulls firebase-ios-sdk 12.7). The old plugin returns raw **APNs** tokens on iOS; backend uses FCM HTTP v1 which only accepts **FCM** tokens → mismatch. New plugin's `getToken()` returns the real FCM token.
- `registerPushNotifications()` in app.js rewritten: `FirebaseMessaging.checkPermissions/requestPermissions/getToken`, listeners `tokenReceived` / `notificationReceived` / `notificationActionPerformed` (was `registration`/`pushNotificationReceived`/`pushNotificationActionPerformed`).
- `FirebaseApp.configure()` added to `AppDelegate.swift` (`import FirebaseCore`).
- `aps-environment` = `production` added to `App.entitlements` (was missing — push capability). Production because TestFlight/App Store use prod APNs.
- `GoogleService-Info.plist` registered in `project.pbxproj` (4 refs: PBXBuildFile A1B2C3D4…0002, PBXFileReference …0001, App PBXGroup, Resources phase) so it's bundled; **un-gitignored** so Codemagic (clones repo) can see it. Plist BUNDLE_ID/PROJECT_ID verified matching.
- Package.swift Windows backslash paths fixed to forward slashes (CI regenerates on macOS anyway).
- **Shipped: Codemagic build #28 (v1.0 build 4) succeeded → TestFlight 2026-07-06.** Code signing passed, so Push capability IS enabled on the App ID. See [[project-codemagic-build]].
### END-TO-END PUSH CONFIRMED WORKING on real device 2026-07-08 ✅
The full GAS → FCM → APNs → iPad chain was validated live: submit hours from iPad → approve from laptop → push delivered. The whole push system is now proven, not just wired. No code changes were needed.

**Root cause of the initial failure (diagnostic lesson):** first attempt got nothing because **the iPad was still on a pre-Build-4 TestFlight build.** Two pieces of evidence:
- **FCM Tokens sheet was EMPTY** (header row only, zero tokens for anyone). So `approveHours`'s `getFcmToken_(volEmail)` returned null and the `if(token)` guard sent nothing — send code was always fine, the token was simply never stored.
- **TestFlight showed an "Update" button (not "Open")** = installed build was older than latest (Build 4). Builds < 4 lack the `FirebaseMessaging` plugin, so `registerPushNotifications()` hits `if (!FirebaseMessaging) return;` and never stores a token. Hours submission still worked from the old build because that's plain fetch, not the native plugin.
- **Fix was purely on-device:** tap Update → Build 4, reopen, sign in, tap Allow → token landed in the sheet → push worked.

**Reusable diagnostic (if push ever breaks again):** the "FCM Tokens" sheet (in ROSTER_SS) is the clean split point — empty/stale row = frontend registration problem (check the device is on the latest build via TestFlight "Update" vs "Open", and that iOS notification permission was granted); fresh row present but no delivery = Firebase→APNs→device leg.

## Meeting notification behavior
- All 5 branches meet on the SAME day and time (org-wide setting)
- GAS hourly trigger fires; if today == meetingDay AND current hour == meetingTime - 4h: send push
- 10-minute fire window (nowM <= 9) prevents double-sends
- Not-cancelled branches get: "Meeting Today!" push
- Cancelled branches get: "No Meeting This Week" push with the day name
- After sending, cancel flags reset to "No" automatically

# HIG + App Store Review — Full Audit & Issue Log

**App:** AFU Volunteer Portal (`com.afu.volunteerportal`, v1.0 build 8) — Capacitor 8 / WKWebView wrapper around `index.html` + `app.js`, Apps Script backend.
**Audited:** 2026-10-22, against Apple's Human Interface Guidelines and the App Review Guidelines.
**Method:** I read the iOS project (Info.plist, entitlements, privacy manifest, AppDelegate, launch screen, icon, pbxproj, Codemagic config), all of `app.js`, the UI markup and CSS in `index.html`, the privacy policy, and the backend paths that matter for review. I also rendered the app locally at iPhone (375×812) and iPad (1180×820) sizes, in light and dark mode, and measured text sizes and tap targets on each tab with a script.
**Supersedes** the issue log in [APP_STORE_GUIDELINE_AUDIT.md](APP_STORE_GUIDELINE_AUDIT.md). Its guideline-by-guideline table is still valid apart from the corrections in §5.

**Severity:** 🔴 Critical (rejection or data-exposure risk, fix before submitting) · 🟠 High · 🟡 Medium · ⚪ Low · 🔍 Can't be confirmed from code; check on a device or in App Store Connect.

---

## Summary

| Severity | Count | Headline |
|---|---|---|
| 🔴 Critical | 2 | Public "Reviewer demo access" button opens a real personal account with no auth; backend hardening still not deployed |
| 🟠 High | 6 | 174 text styles under 11pt, no Dynamic Type, iPad shows a 500px phone column, broken sign-in layout, push prompt timing, links to private Drive files |
| 🟡 Medium | 10 | Sticky hover, alerts used for everything, emoji tab icons, screens with no back navigation, VoiceOver semantics, motion, tap targets, keyboards, receipt camera-only, contrast leftovers |
| ⚪ Low | 7 | In-app theme override, splash-style launch screen, remote Google Fonts, uppercase text, external links leave the app, etc. |
| 🔍 Submission | 6 | Build number, privacy label match, Facebook-removal build, carried-over App Store Connect items |

---

## 1. 🔴 Critical

### C1 — "Reviewer demo access" signs anyone into a real personal account, with no authentication
**Where:** [index.html:3094](index.html:3094) (button on the sign-in card), [app.js:169-177](app.js:169) (`demoSignIn`), [Code.gs:294](Code.gs:294) (`requireDeleteActor_`).
**Guidelines:** 1.6 Data Security, 5.1.1 Privacy, 2.1(a) (a built-in demo mode needs Apple's prior approval; the default is a demo account in Review Notes).

The button is visible to **every App Store user**. One tap calls `onSignedIn({ email: 'madhavsindia@gmail.com' })`, which signs the user into the developer's own roster account. No password, code or OAuth is involved. Confirmed rendered on the sign-in screen.

What any user can then do:
- **See the account's real data:** name, branch, hours, activity feed, tasks and Boston trip info.
- **Act as that person:** record donations, submit hours and reimbursement requests, and upload a profile photo, all attributed to the developer.
- **Delete the account permanently.** Home → Delete My Account passes `requireDeleteActor_` because actor equals target. That hard-deletes the roster row, hours, forms and Drive photos. App Reviewers routinely test account deletion, so the **next reviewer then lands on the registration wall and the app is rejected** under 2.1 (this is the exact failure the internal notes warn about).
- **Take over the account's push notifications.** `registerPushNotifications()` → `storeFcmToken` upserts the stranger's device token onto that email. The owner stops getting pushes and the stranger gets them.
- **Stay signed in.** `storeAuthForBiometric` saves the session, so Face ID on that stranger's phone keeps reopening the account.

**Fix (pick one):**
1. **Preferred:** remove the button from the shipped UI. Give App Review a dedicated, non-personal demo account in Review Notes. If Google's location check blocks the reviewer, use a **Sign in with Apple** demo Apple ID, which has no location challenge, or a username/password demo login that is checked on the server.
2. Or keep a demo path that requires a **reviewer access code** typed into a password field and **checked on the server** (code given only in Review Notes). Then block `deleteAccount` and `storeFcmToken` for the demo email on the server, and reseed the demo data on a timer. Mention the demo mode in Review Notes; 2.1(a) expects Apple's approval for built-in demo modes.
3. Whichever you choose, the demo account must not be anyone's real personal account.

### C2 — Security and deletion fixes are still not live (carried over from the earlier audit's #3)
**Guidelines:** 1.6, 5.1.1(v).
The 2026-10-21 hardening (role gates, private-image proxy, complete account deletion, Apple token verification) exists only in source. Still owed:
- `clasp push` + `clasp deploy`, then reset web-app access to **Anyone**.
- Manually revoke public link-sharing on photos and receipts uploaded before the fix.
- A new native build so `www/` ships.

Until that's done, the reviewer tests the old backend, which the earlier rejection already flagged.

---

## 2. 🟠 High

### H1 — Text below the 11pt minimum: 123 CSS rules + 51 inline styles
**HIG:** Typography (11pt minimum on iOS); Accessibility. **Guideline risk:** 4.0 Design.
A scan of `index.html` found 123 stylesheet rules and 51 inline `style=` sizes under 11px, going down to **7.7px** (`.admin-stat-lbl`, `.itin-stop-tag`). Counts by size: 7.7px ×2, 8.0 ×8, 8.3 ×9, 8.8 ×8, 9.3 ×21, 9.6 ×22, 9.9 ×18, 10.4 ×26, 10.9 ×8.
Measured in the rendered app:
- **Admin:** 19 visible elements under 11px, including the filter buttons and the "Notify All" and "Refresh" buttons (9.9px).
- **Boston:** 11 elements, including every form label (**9.3px**), the shirt note and the acknowledgment titles. **This is a user-facing form that parents sign.**
- **Data rows** rendered at runtime use the same tiny classes: `.hrs-btn` Approve/Deny at 8.8px, `.reg-row-badge` at 8px, `.pv-meta` and `.cr-card-sub` at ~9.6px.

Earlier today's pass fixed Home, Record, Hours and Reimburse, which now measure 0 elements under 11px. **Fix:** raise the floor to 0.6875rem (11px) everywhere, starting with the Boston form and the Admin action buttons.

### H2 — Dynamic Type is not supported
**HIG:** Typography → Dynamic Type; Accessibility.
`html { -webkit-text-size-adjust: 100% }` ([index.html:61](index.html:61)), with fixed `rem` sizes on custom fonts. Text ignores the user's iOS **Larger Text** setting completely.
**Fix:** in WKWebView, add `html { font: -apple-system-body; }` and then set `font-family` back to Montserrat. That makes `1rem` follow the system text size, so every rem-based size scales. Then check that layouts survive the accessibility sizes.
**Status:** fixed in code (uncommitted, 2026-10-24). The rule is gated to iOS WebKit, the root is rescaled so the default size stays 16px, and it is capped at 2x (32px). `html.dt-large` (XXL and up) stacks the home grid. The browser sweep found no overflow at sizes up to the cap. Still needs a check on a device or the Simulator.

### H3 — iPad gets a 500px phone column
**HIG:** Layout (iPad); Guideline 2.4.1 / 4.0. The rejection of 1.0 (6) was **reviewed on an iPad Air 11"**.
The project is universal (`TARGETED_DEVICE_FAMILY = "1,2"`). `#appContent` is `max-width: 500px`, so at 1180px wide it uses **500 of 1180px** (measured), while the bottom tab bar stretches the full width. The result looks like a stretched phone app.
**Fix:** either (a) add a ≥768px layout (a wider container and a two-column dashboard grid and forms), or (b) ship **iPhone-only** (`TARGETED_DEVICE_FAMILY = 1`). iPhone apps run on iPad in compatibility mode and reviewers judge them as iPhone apps.
**Status:** fixed with option (a), in code (2026-10-24). The app stays universal. A `min-width: 700px` block (so iPad mini portrait at 744pt is covered too) widens `#appContent` to 1040px. Home becomes a two-column dashboard: profile beside stats, and Your Tasks beside Recent Activity, with 4 tiles across at ≥1000px. Record, Hours and Reimburse put the form beside its companion panel, and a lone form is centered at 640px. The Task Board shows two columns of cards. Admin and Boston stay single-column, widened to 820px and 720px. The tab bar items are centered at a fixed width. Phones (<700px) are unchanged. The browser check at 744, 820, 1000 and 1180px wide, in light and dark mode, found no overflow. Still needs a check on an iPad or the iPad Simulator.

### H4 — Sign-in screen: the Face ID button sits below the links
**HIG:** Sign in with Apple / Authentication; Layout.
Rendered order ([index.html:3072-3108](index.html:3072)): Google → Apple → "— or —" → **Privacy Policy** → **Reviewer demo access** → **Sign in with Face ID**. The "— or —" separator introduces two text links instead of the alternative sign-in button, and the main returning-user action ends up last, under small links.
**Fix:** move `#biometricSignInOr` and `#biometricSignInBtn` above the links, and keep Privacy Policy as the last item. The demo link goes away with C1.

### H5 — Notification permission is requested during sign-in, and again on every launch
**HIG:** Privacy → Requesting permission; Notifications (ask in context, when the benefit is clear).
`registerPushNotifications()` is awaited inside `onSignedIn`, `onAppleSignedIn` and `enterPendingMode` ([app.js:254](app.js:254), [389](app.js:389), [1437](app.js:1437)) **before the app UI is shown**. The user sees a `confirm()` pre-prompt over the login screen, then the iOS prompt, and only then the app plus the welcome tour.
If the user taps Cancel, nothing is remembered. The pre-prompt comes back on **every** sign-in, including every Face ID auto-login at launch.
**Fix:** store the decline. Ask later, from context: after the first hours submission ("Get notified when it's approved?") or from a Notifications row on Home → Account.

### H6 — Links that probably don't work in the native app (2.1 App Completeness) 🔍
- **Print Slips → "Open Google Doc" / "Download PDF"** ([app.js:760](app.js:760)). The Doc and PDF are created in Drive folder `17glZ…` with no explicit sharing ([Code.gs:1556-1564](Code.gs:1556)). Any volunteer who isn't the script owner (**including the reviewer**, who is an approved volunteer and can see Print Slips) opens Safari onto a Google "You need access" page, unless that folder is shared by link. **Check the folder's sharing.** Better: return the PDF bytes and show them in-app, or share the link explicitly.
- **Admin → "View Receipt"** ([index.html:5078-5086](index.html:5078)) calls `window.open(blobURL)`. In Capacitor's WKWebView, a `_blank` open is handed to the system. Safari can't resolve a `blob:` URL that belongs to the web view, so the receipt most likely never appears. **Test on a device.** Fix: show the data URL in an in-app modal `<img>`.

---

## 3. 🟡 Medium

### M1 — Hover styles stick after a tap on iOS
27 `:hover` rules and **zero** `@media (hover: hover)` guards. The global `button:hover` ([index.html:246](index.html:246)) turns the button dark and shifts it 3px. On touch screens, the hover state stays applied after the tap until the user taps somewhere else, so every button looks pressed or stuck. **HIG:** feedback. **Fix:** wrap the hover rules in `@media (hover: hover)`.

### M2 — Native alerts used for everything
**76 `alert()` + 16 `confirm()`**. **HIG:** Alerts (save them for important, actionable information; button labels should name the action).
- Success messages as blocking alerts: "Reminder sent!", "Saved offline…", "Notifications sent to all registrants!", "Archived as…".
- Raw server errors shown to users: `'Update failed: ' + res.error`, `'Error: ' + res.error`.
- **Delete My Account** ([app.js:1348](app.js:1348)) and Sign Out use `confirm()`, whose buttons are a generic **OK/Cancel**. They can't read **Delete** or use the destructive (red) style.
- The push pre-prompt is also an OK/Cancel `confirm()`.

**Fix:** use inline status or toasts for success (the app already has `.hours-msg` and `showNativeToast`), friendly error copy, and a custom sheet or `@capacitor/dialog` with a destructive **Delete Account** button.

### M3 — Tab bar uses colour emoji as icons
The icons are 📋 🤝 🏠 ⏱ ⚙️ ([index.html:4146-4172](index.html:4146)). **HIG:** Tab bars, Icons. Emoji are full colour and can't be tinted. The selected tab is shown only by label colour and a 4px dot, and in light mode the inactive and active icons look identical. Labels are 11.5px uppercase with tracking, and Home is 1.4× wider.
**Fix:** Bootstrap Icons is already bundled, so use monochrome glyphs (`bi-house` / `bi-house-fill` etc.), filled when selected and tinted with `--orange-text`, with sentence-case labels.

### M4 — Screens with no navigation state or Back button
Reimbursement (from a Home tile) and Boston Trip (from the Home banner) aren't tabs. While they're open, no tab is highlighted ([index.html:4315-4319](index.html:4315)) and neither screen has a title bar or Back button. **HIG:** Navigation. **Fix:** keep Home highlighted, and add a small header with a "‹ Home" back control on these screens.

### M5 — VoiceOver and semantics gaps
- 20 clickable `div`/`span`/`i` elements without `role="button"` or `tabindex`: every admin section header, the profile card, the Boston banner, the photo pickers and the modal backdrops. VoiceOver doesn't announce them as buttons.
- Only 15 `aria-label`s in the whole app. The scan button is just "📷" ([index.html:3378](index.html:3378)) and VoiceOver reads it as "camera".
- The registration form's `<label>`s for First/Last name, Email, Phone and Branch have no `for=` ([index.html:3125-3145](index.html:3125)).
- Boston acknowledgment checkboxes are **18×18px** tap targets.

**HIG:** Accessibility.

### M6 — No reduced-motion handling
0 `prefers-reduced-motion` rules. The welcome-tour slide, the push toast's spring animation, the UDI panel expand, the 28-second loading bar and button transforms all ignore the Reduce Motion setting. **HIG:** Motion.

### M7 — Admin tap targets under 44pt
Measured: filter buttons, "Notify All: Deadline" and "Refresh" are **36px** tall. The Boston-banner toggle switch is **40×22**. The date input is 41px. In the welcome tour, **Skip** has `min-height: auto` and 45% opacity ([app.js:1503-1509](app.js:1503)). **HIG:** 44×44pt minimum hit target.

### M8 — Keyboards and autofill
- UDI digits, donation amount, hours and reimbursement amount use `type="number"` with no `inputmode`. Use `inputmode="numeric"` for UDI and `inputmode="decimal"` for amounts to get the right iOS keypad.
- Registration name fields lack `autocomplete="given-name"` / `"family-name"`, and phone lacks `autocomplete="tel"`.
- At 375px the Boston form's two-column Email/Phone fields are **128px** wide and the phone placeholder is cut off ("(555) 555-55"). Stack them below ~400px.

### M9 — The receipt photo can only come from the camera
`<input … capture="environment">` ([index.html:3568](index.html:3568)) opens the camera directly on iOS, but the copy says "Tap to take a photo **or upload**". Users can't pick an existing photo or a screenshot of an e-receipt. **Fix:** drop `capture` so iOS shows its Camera / Photo Library chooser.

### M10 — Contrast left over from the earlier pass
Already noted in commit 44a3844 and still open: the task-board assignee tag (team colour on dark cards) and the `.my-cr-status.pending` amber chip (`#c97c1a` on a light amber tint, about 3:1). Also the welcome **Skip** at 45% opacity. Recheck both themes per WCAG AA (4.5:1 for text).

---

## 4. ⚪ Low

| # | Issue | Guidance |
|---|---|---|
| L1 | Home has an in-app **Appearance** toggle that overrides the system setting ([index.html:3329-3338](index.html:3329)). The default does follow the system, which is good. | HIG Dark Mode advises against app-specific appearance settings. Fine to keep; consider removing it. |
| L2 | The launch screen is a full-bleed branded splash image on a white `systemBackground`. | HIG Launch screens: it should look like the first screen (e.g. a plain dark `#1A1311` background), not a splash. |
| L3 | Montserrat and Abril Fatface load from `fonts.googleapis.com` at runtime ([index.html:11](index.html:11)). Offline first launch falls back to system fonts, and the user's IP goes to Google, which the privacy policy doesn't mention. | Bundle the fonts in `vendor/` like Bootstrap Icons. |
| L4 | Most labels and buttons are uppercase with wide letter-spacing. | HIG favours sentence/title case for legibility. Brand call: at least keep long labels in sentence case. |
| L5 | External links (Google Doc/PDF, hauhelps.org, privacy URL) leave the app for Safari. | Use `@capacitor/browser` (SFSafariViewController) so users stay in the app. |
| L6 | Sign in with Apple is a hand-built HTML button. It matches the spec now, but the 2026-08 rejection was over this button. | The native `ASAuthorizationAppleIDButton` is the zero-risk option if it's ever flagged again. |
| L7 | Old "HAU" branding remains on the T-shirt artwork and on the printed slip text (`hauhelps.org`). | Cosmetic, and it's real merchandise; only matters if a reviewer sees it as a mismatched name. |

---

## 5. 🔍 Submission checklist & corrections to the earlier audit

**Still owed before submitting** (carried over plus new):
1. **Build number.** `CURRENT_PROJECT_VERSION = 8` and Codemagic doesn't auto-increment it. Build 7 was rejected in August; if build 8 was ever uploaded, bump to 9+ before the next build, or App Store Connect will refuse the upload.
2. **Facebook SDK removal** (commit f782dc9) needs a Mac: `npm install && npx cap sync ios`, reset SPM caches, device-test Google sign-in, then regenerate the Privacy Report and confirm `ep1.facebook.com` is gone.
3. **The App Privacy label in App Store Connect must match `PrivacyInfo.xcprivacy`:** Name, Email, Phone, Photos, Other User Content, Device ID, User ID, Other Financial Info (Venmo/Zelle handle), Other Contact Info (parent contact), Other Data (DOB, signatures). All marked Linked, App Functionality, no tracking.
4. From the earlier audit: deploy the backend (C2); Support URL in App Store Connect; screenshots of the signed-in app; an honest age rating (not Kids); the 3.2.2 donations-ledger explanation in Review Notes.
5. **Review Notes after C1:** demo credentials for a non-personal account, plus a one-line description of any demo mode.
6. **UGC (1.2):** any member can create Task Board teams and tasks that others see, and there's no report/block option. Low risk because content stays inside the organisation, but have an answer ready.

**Corrections to [APP_STORE_GUIDELINE_AUDIT.md](APP_STORE_GUIDELINE_AUDIT.md):**
- **4.5.6:** that audit says the app uses Bootstrap Icons rather than Apple emoji. In fact the UI uses Unicode emoji throughout (tab bar, tiles, banners). That's **allowed**; 4.5.6 only forbids embedding Apple emoji images or using them on other platforms. Still a pass, but see M3 for the HIG side.
- **2.5.19 / #7 Facebook SDK:** fixed in code (f782dc9). Only the Mac rebuild is left (item 2 above).
- **2.1 demo account:** the demo path is now a **public in-app button**, which turns a checklist item into Critical issue **C1**.

---

## 6. Already compliant (verified)

- **Purpose strings:** Camera, Photo Library and Face ID purpose strings are present and specific. There's no unused permission key.
- **Encryption and push setup:** `ITSAppUsesNonExemptEncryption=false` is appropriate (HTTPS only). The `aps-environment=production` and Sign in with Apple entitlements match the features.
- **Privacy manifest:** declares no tracking and the UserDefaults reason `CA92.1`, and it's wired into the Resources build phase.
- **App icon:** 1024×1024, RGB with no alpha channel (an alpha channel would be rejected).
- **iPad orientations:** all four supported, which multitasking requires.
- **Safe areas:** the top inset, bottom tab-bar inset and push toast all respect them.
- **Pinch-to-zoom:** still allowed. Typed fields are at least 16px, so iOS doesn't auto-zoom on focus.
- **Sign-in buttons:** all 44pt tall; "Sign in with Apple" follows Apple's spec (official glyph, SF Pro, exact sentence-case label, black on white).
- **Account deletion:** easy to find (Home → Account), with an accurate description in the confirmation and the privacy policy.
- **Registration:** an age gate requires 13+. Name and email from Apple/Google aren't asked for again (Guideline 4 fix intact).
- **Face ID:** offers a "Sign In Another Way" fallback, and nothing biometric leaves the device.
- **Bundled code:** the QR scanner library is bundled, not downloaded (2.5.2).
- **Donations:** the Record screen states clearly that no money is collected (3.2.2).
- **Home, Record, Hours and Reimburse tabs:** no text under 11px and no tap targets under 44pt (measured at 375px).

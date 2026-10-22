# App Store Review Guidelines — Full Audit

**App:** AFU Volunteer Portal (`com.afu.volunteerportal`) — Capacitor-wrapped PWA, internal tool for Advocacy for the Unhoused volunteers.
**Audited:** 2026-10-22 against the live [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
**Legend:** ✅ Pass · ⬜ N/A · ⚠️ Issue logged · 🔍 Verify at runtime / in App Store Connect (can't be confirmed from code).

Every numbered guideline is listed. Issues are logged inline and collected in **§Issue Log** at the end.

---

## 1. Safety

| # | Verdict | Notes |
|---|---------|-------|
| 1.1 Objectionable content | ✅ | Volunteer management tool. No objectionable content. |
| 1.1.1 defamatory/mean-spirited | ✅ | None. |
| 1.1.2 violence | ✅ | None. |
| 1.1.3 weapons | ✅ | None. |
| 1.1.4 sexual/porn | ✅ | None. |
| 1.1.5 religious | ✅ | None. |
| 1.1.6 false info/features | ✅ | None. |
| 1.1.7 profiting from tragedy | ✅ | Nonprofit for the unhoused; no exploitation. |
| 1.2 User-generated content | 🔍 | UGC is limited and private (hours notes, task text, typed signatures, receipt/profile photos) visible only to officers/named teammates — not a public feed. No filtering/report/block UI exists. **Low risk** because content isn't broadcast publicly, but if a reviewer treats task boards/photos as UGC, Apple expects a report + block mechanism. See Issue #8. |
| 1.2.1 Creator content | ⬜ | No creator-content model. |
| 1.3 Kids Category | ⬜ | Not submitted to Kids Category. Must NOT be (see 5.1.4). |
| 1.4 Physical harm | ✅ | None. |
| 1.4.1 medical | ⬜ | Not a medical app; no sensor health claims. |
| 1.4.2 drug dosage | ⬜ | N/A. |
| 1.4.3 tobacco/drugs/alcohol | ✅ | None. |
| 1.4.4 DUI/checkpoints | ⬜ | N/A. |
| 1.4.5 risky challenges | ✅ | None. |
| 1.5 Developer information | ⚠️🔍 | In-app + public privacy policy lists a working contact (`president@advocacyfortheunhoused.org`). **Confirm a Support URL and contact are set in App Store Connect** (required in the listing, not just the app). See Issue #1. |
| 1.6 Data Security | ⚠️ | **Most significant finding.** Backend is a public Apps Script endpoint (`ANYONE_ANONYMOUS`) that identifies the user by a **client-supplied email**. 2026-10-21 hardening closed Apple account-takeover (real code-flow token exchange) and role-gated privileged writes, but **roster reads remain enumerable** by anyone who knows an officer email — an accepted design tradeoff, not a closed hole. Also, the hardening is **not live until the owner completes the owed deploy steps** (clasp deploy + manual revoke of already-public Drive files). See Issues #2 and #3. |
| 1.7 Reporting criminal activity | ⬜ | N/A. |

---

## 2. Performance

| # | Verdict | Notes |
|---|---------|-------|
| 2.1 App completeness | 🔍 | Must submit a working **demo account** (`madhavsindia@gmail.com`) in Reviewer Notes — the app is fully login-gated. That account must be **on the roster and not deleted** (deletion wipes it → registration wall → rejection), and the GAS web app must be set to **"Anyone"** access and within quota at review time (`clasp` redeploy resets this). See Issue #4. |
| 2.1(a) demo/backend on | 🔍 | Same as above — backend services (GAS, Firebase) must be live and the demo account functional. |
| 2.1(b) IAP visible | ⬜ | No in-app purchases. |
| 2.2 Beta testing | ✅ | Production build, not a beta/demo shell. |
| 2.3 Accurate metadata | 🔍 | ASC-side. |
| 2.3.1 review notes specific | 🔍 | Must re-explain the donations-ledger point (historically flagged 3.2.2) in review notes. |
| 2.3.2 featured IAP | ⬜ | N/A. |
| 2.3.3 screenshots show app in use | ⚠️🔍 | Historically the app showed only a login page to reviewers. Screenshots must show the **signed-in** experience, not the Google/Apple login screen. See Issue #5. |
| 2.3.4 previews | 🔍 | If an app preview is used, real footage only. |
| 2.3.5 correct category | 🔍 | Recommend a non-Kids category (e.g. Productivity / Social Networking). |
| 2.3.6 honest age rating | ⚠️🔍 | Answer honestly. App is 13+, collects personal data from minors and has typed-signature forms; set rating accordingly (likely 17+ is unnecessary, but do not mark "Made for Kids"). See Issue #6. |
| 2.3.7 unique name/no keyword stuffing | ✅ | "AFU Volunteer Portal" — fine. |
| 2.3.8 metadata 4+ | ✅ | Suitable. Do not use "For Kids". |
| 2.3.9 own asset rights | ✅ | Org's own branding/icons. |
| 2.3.10 no other-platform refs | 🔍 | Ensure metadata/screenshots don't reference Android/web. |
| 2.3.11 pre-order | ⬜ | N/A. |
| 2.3.12 What's New | 🔍 | Fill appropriately. |
| 2.3.13 in-app events | ⬜ | None. |
| 2.3.14 creative assets | 🔍 | ASC-side. |
| 2.4.1 iPhone app on iPad | ✅ | Runs on iPad; internal notes verify no overflow at 768px/1180px. iPad supports all orientations (Info.plist). |
| 2.4.2 power efficiency | ✅ | No background mining/drain; push via APNs, no persistent polling. |
| 2.4.3 tvOS | ⬜ | N/A. |
| 2.4.4 no forced restarts/settings | ✅ | None. |
| 2.4.5 Mac App Store | ⬜ | iOS only. |
| 2.5.1 public APIs only | ✅ | Capacitor + standard plugins; no private APIs. |
| 2.5.2 no downloading code | ✅ | Static bundled web assets; `html5-qrcode` is bundled (vendored), not remotely executed. GAS calls are data only. |
| 2.5.3 no malware | ✅ | None. |
| 2.5.4 background services | ✅ | Only push (remote notifications). No undeclared background modes. |
| 2.5.5 IPv6 | 🔍 | HTTPS to Google/Apple/Firebase — these are IPv6-ready; no hardcoded IPv4. Likely fine. |
| 2.5.6 WebKit | ✅ | Capacitor uses WKWebView. |
| 2.5.8 no alt home screen | ⬜ | N/A. |
| 2.5.9 no altering system switches | ✅ | None. |
| 2.5.11 SiriKit | ⬜ | None. |
| 2.5.12 CallKit/spam | ⬜ | None. |
| 2.5.13 Face ID via LocalAuthentication | ✅ | `@aparajita/capacitor-biometric-auth` uses LocalAuthentication; biometric data stays on device (stated in privacy policy). Under-13 alternative N/A (app is 13+). |
| 2.5.14 recording consent/indicator | ✅ | No silent recording; camera is user-initiated (QR/photo). |
| 2.5.15 file browsing | ⬜ | N/A. |
| 2.5.16 extensions/App Clips | ⬜ | None. |
| 2.5.17 Matter | ⬜ | N/A. |
| 2.5.18 display ads | ✅ | No ads. |
| 2.5.19 no hidden features | ⚠️ | No malicious/dormant *features*, but the bundle links the **Facebook iOS SDK + Alamofire** via `@capgo/capacitor-social-login` even though only Google is used. It's uninitialized/dormant (no FacebookAppID, not configured in AppDelegate), so not a 2.5.19 violation per se — but its presence must be reflected honestly in the privacy label and can draw reviewer questions. See Issue #7. |

---

## 3. Business

| # | Verdict | Notes |
|---|---------|-------|
| 3.1.1 In-app purchase | ⬜ | No digital content/features sold. Nothing to unlock. |
| 3.1.1(a) external purchase links | ⬜ | N/A. |
| 3.1.2 subscriptions | ⬜ | None. |
| 3.1.3 other purchase methods | ✅ | All in-app Zelle/PayPal payment surfaces were **removed** (commit `8aa9c98`). No purchasing of any kind occurs in-app. |
| 3.1.4 hardware content | ⬜ | N/A. |
| 3.1.5 cryptocurrency | ⬜ | None. |
| 3.2.1 acceptable (nonprofit) | ✅ | Legitimate nonprofit internal tool. Note: Apple only permits **in-app fundraising via Apple Pay or approved platforms (Benevity/Candid)** — the app deliberately collects **no money** at all, which is compliant. |
| 3.2.2 unacceptable | ⚠️🔍 | Historically rejected under 3.2.2(iv) because the reviewer read the donations **ledger** as in-app charity collection. Copy is now fixed ("Record a Donation", "No money is collected…", "Save Record"). **The reviewer reply must still explain** that donations are cash handed to volunteers in person and the app only records a UDI + amount. See Issue #9. |

---

## 4. Design

| # | Verdict | Notes |
|---|---------|-------|
| 4.1 Copycats | ✅ | Original app for a specific org. |
| 4.2 Minimum functionality | ✅ | Beyond a web wrapper: native Google/Apple sign-in, Face ID/Touch ID, push notifications, QR scanning, haptics. Internal notes confirm this was deliberately addressed for 4.2. |
| 4.2.1 ARKit | ⬜ | N/A. |
| 4.2.2 not web clipping/aggregator | ✅ | Full interactive tool with native features. |
| 4.2.3 works standalone | ✅ | No large deferred download; service worker caches assets. |
| 4.2.6 template/generated | ✅ | Hand-built, submitted by the org. |
| 4.2.7 remote desktop | ⬜ | N/A. |
| 4.3 Spam | ✅ | Single app; no per-city duplicates (note the handoff mentions avoiding separate apps — good). |
| 4.4 Extensions | ⬜ | None. |
| 4.5.1 Apple RSS/scraping | ⬜ | N/A. |
| 4.5.2 Apple Music | ⬜ | N/A. |
| 4.5.3 Game Center/push spam | ✅ | Push is transactional (approvals, reminders), not spam. |
| 4.5.4 Push notifications | ✅ | Opt-in via system permission prompt (`requestPermissions`); app is fully usable if declined; no marketing push; no sensitive data in payloads (titles/bodies are generic). |
| 4.5.5 Game Center IDs | ⬜ | N/A. |
| 4.5.6 Apple emoji | ✅ | Uses Bootstrap Icons, not Apple emoji assets. |
| 4.7 Mini apps/plug-ins | ⬜ | N/A. |
| 4.8 Login Services | ✅ | Offers **Sign in with Apple** alongside Google (equivalent prominence per notes). Apple path limits data to name/email, supports Apple's hide-my-email, and does not track for ads. Satisfies the 4.8 requirement triggered by using Google login. |
| 4.9 Apple Pay | ⬜ | Not used. |
| 4.10 monetizing built-in capabilities | ✅ | None. |

---

## 5. Legal

| # | Verdict | Notes |
|---|---------|-------|
| 5.1.1(i) privacy policy | ✅ | `privacy.html` (public at `app.hauhelps.org/privacy.html`, also in-app modal) describes data collected, uses, third parties (Google/Apple/Firebase), retention, deletion, and contact. **Confirm the URL is set in ASC.** |
| 5.1.1(ii) permission/consent | ✅ | Purpose strings present: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSFaceIDUsageDescription`. Push is opt-in. |
| 5.1.1(iii) data minimization | ✅ | Phone and profile photo are optional; registration no longer forces phone (fixed for 5.1.1(v)). |
| 5.1.1(iv) no manipulation on decline | ✅ | App works if camera/photos/push/biometrics declined. |
| 5.1.1(v) account sign-in & deletion | ✅ | In-app **Delete My Account** (Home → Account). `deleteAccount_` hard-deletes all email-keyed rows across every sheet (roster, pending, hours, comp + receipt, Boston forms incl. parent details/signature), permanently deletes Drive photos/receipts, scrubs the name from task boards, deletes FCM tokens, and **revokes Sign in with Apple** via the captured refresh token. ⚠️ Deletion completeness is only true in the **deployed** build — see Issue #3 (deploy owed). Login-required is acceptable for an internal org tool. |
| 5.1.1(vi) no surreptitious password capture | ✅ | None. Password Vault stores the *org's own* operational credentials for officers, encrypted at rest — not users' secrets. |
| 5.1.1(vii) SafariViewController | ✅ | Not used to track. |
| 5.1.1(viii) no third-party data compiling | ✅ | None. |
| 5.1.1(ix) regulated fields | ⬜ | Not banking/health/gambling/cannabis. Submitted by the nonprofit entity. |
| 5.1.1(x) contact info optional | ✅ | Phone optional. |
| 5.1.2(i) consent before use/share | ✅ | Data used only to run the program; no ad/tracking; no AI sharing. Privacy label `NSPrivacyTracking=false`. |
| 5.1.2(ii) no repurposing | ✅ | None. |
| 5.1.2(iii) no surreptitious profiles | ✅ | None. |
| 5.1.2(iv) no contact/app-list harvesting | ✅ | None. |
| 5.1.2(v) contacts/photos outreach | ✅ | No Contacts access; photos only user-picked. |
| 5.1.2(vi) HealthKit/HomeKit | ⬜ | N/A. |
| 5.1.2(vii) Apple Pay data | ⬜ | N/A. |
| 5.1.3 Health | ⬜ | No health data. |
| 5.1.4 Kids | ⚠️ | App states **13+**; many volunteers are high-school minors. DoB is collected **only** to decide if a parent must sign trip forms (compliance use — allowed). Parent contact for under-18 trip forms is compliance-driven. **Must NOT** be in the Kids Category and must not use the "For Kids" term. No third-party analytics/ads. COPPA note present (no under-13). Verify the age rating and that the Facebook SDK (even dormant) does not count as third-party tracking for minors. See Issue #6/#7. |
| 5.1.5 Location | ✅ | No location services used. |
| 5.2.1 third-party IP | ✅ | Own content. |
| 5.2.2 third-party content terms | ✅ | Uses Google/Firebase per their terms. |
| 5.2.3 no illegal downloads | ✅ | None. |
| 5.2.4 Apple endorsement | ✅ | No implication of Apple endorsement. |
| 5.2.5 Apple products/emoji | ✅ | No Apple-lookalike UI; no Apple emoji. |
| 5.3 Gaming/gambling/lotteries | ⬜ | None. |
| 5.4 VPN | ⬜ | None. |
| 5.5 MDM/config profiles | ⬜ | None. |
| 5.6 Developer Code of Conduct | ✅ | Legitimate org, accurate identity. |
| 5.6.1 reviews | 🔍 | Use Apple's review-prompt API only if prompting (currently not prompting — fine). |
| 5.6.2 developer identity | 🔍 | Ensure ASC org identity is accurate (nonprofit). |
| 5.6.3 discovery fraud | ✅ | None. |
| 5.6.4 app quality | ✅ | Maintained; prior bugs audited. |

---

## Issue Log

**⚠️ #1 — Developer contact / Support URL (1.5):** Verify a valid Support URL and contact are configured in App Store Connect, not just in the privacy policy. *(Runtime/ASC)*

**⚠️ #2 — Public backend trusts client-supplied email (1.6):** The GAS endpoint is `ANYONE_ANONYMOUS` and identifies users by a client-sent `email`/`actorEmail`. Account-takeover (Apple) and privileged writes are now gated, but **roster reads remain enumerable** by anyone who knows an officer email, and the `deleteAccount` actor check is client-claimed. This is an accepted tradeoff documented by the owner; the real fix is a session token (HMAC minted at sign-in, replayed). Reviewers rarely probe this, but it is a genuine 1.6 weakness. *(Code — by design; revisit)*

**⚠️ #3 — Security/privacy fixes not yet deployed (1.6 / 5.1.1 / 5.1.2):** The 2026-10-21 hardening (role gates, private-image proxy, complete account deletion, Apple token verify) exists in source but owes deploy steps: (1) `clasp push` + `clasp deploy`, then re-set web-app access to "Anyone"; (2) sync root → `www/` before the iOS build; (3) **manually revoke public sharing on already-uploaded Drive photos/receipts** (code only stops new public shares). Until these are done, the live app still has the old, weaker behavior the reviewer previously flagged. *(Owner action)*

**🔍 #4 — Demo account for review (2.1):** Ensure `madhavsindia@gmail.com` is on the roster (A/Z access), not deleted, with a fresh password in Reviewer Notes, and the GAS web app is "Anyone" + within quota at review time. *(Owner action)*

**⚠️ #5 — Screenshots must show signed-in app (2.3.3):** Replace any login-screen screenshots with the actual signed-in experience (dashboard, hours, tasks, Boston form). *(ASC)*

**⚠️ #6 — Age rating & minors (2.3.6 / 5.1.4):** Set an honest age rating, do **not** mark "Made for Kids"/Kids Category, and keep the DoB/parent-signature collection framed strictly as trip-form compliance. *(ASC + already handled in code)*

**⚠️ #7 — Dormant Facebook SDK (2.5.19 / 5.1.2 / 5.1.4):** `@capgo/capacitor-social-login` links the Facebook iOS SDK + Alamofire though only Google is used. Dormant and uninitialized, so not a functional violation, but: keep it out of the privacy label's *tracking* declarations (it does no tracking as configured), and consider whether it can be excluded from the build to remove reviewer ambiguity, especially given minor users. *(Code — optional cleanup)*

**🔍 #8 — UGC moderation (1.2):** Content is private (not a public feed), so filtering/report/block is likely not required — but if a reviewer classifies task text/photos as UGC, be ready to explain the private, officer-moderated nature, or add a lightweight report/block path. *(Low risk)*

**🔍 #9 — Donations-ledger explanation (3.2.2):** The reply to any 3.2.2 flag must restate that no money moves through the app — it records cash collected in person (UDI + amount) to a spreadsheet. Copy already reflects this. *(Review notes)*

---

## Summary

No guideline is clearly **violated** in a way that makes the app ineligible. The audit surfaced **0 hard blockers in shipped code**, but several items gate a clean approval:

- **Must do before/at submission:** deploy the pending backend hardening (#3), confirm demo account + "Anyone" access (#4), signed-in screenshots (#5), honest age rating (#6), Support URL (#1), and the 3.2.2 reviewer reply (#9).
- **Design tradeoff to acknowledge:** the public-backend enumeration (#2).
- **Optional hardening:** drop the dormant Facebook SDK (#7); be ready on UGC (#8).

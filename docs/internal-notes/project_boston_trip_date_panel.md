---
name: project-boston-trip-date-panel
description: "PENDING v2 — upgrade the admin 'Trip Banner' panel from a show/hide toggle into one where officers set the next trip date (which then drives the banner)"
metadata:
  node_type: memory
  type: project
  originSessionId: 9af856ae-1f74-4f64-ba84-eefcfe4576d3
---

# PENDING (v2) — Officer-settable Boston trip date

Requested 2026-07-09 (after v1 was submitted to App Store). For the **next app version (v2)**, not v1.

**Goal:** The admin "Trip Banner" panel currently only toggles whether the Home banner shows. Make it genuinely useful by letting officers **set the date of the next trip**, and have the banner derive from that date instead of hardcoded values.

## Current implementation (as of 2026-07-09)
- Panel: `#settings-section` in index.html (~L3166), titled "Trip Banner", nested inside the Boston Trip parent admin section (see [[project-admin-tab]]). Just one toggle `#bostonBannerToggle` → `adminSetBostonBanner(visible)`.
- `adminSetBostonBanner(visible)` (~L3752) writes **only to `localStorage` (`bostonBannerHidden`)** — so the toggle is **per-device, NOT synced** to other users. Any org-wide setting (like a trip date) must go through the GAS backend, not localStorage.
- `initBostonBanner()` (~L3728) has **hardcoded dates**: `HIDE_AFTER = 2026-07-08`, `tripDate = 2026-06-30`; banner subtext hardcoded in HTML (`#bostonBannerSub` ~L2780: "Jun 30 · Register & pay your balance") and swapped to "Pay your balance · Trip was Jun 30" after the trip date.

## Suggested approach
- **Persist the trip date in the backend** so all users see it. Natural fit: the Boston sheet's **Itinerary key/value store** — existing GAS actions `getItineraryData` / `saveItineraryData` (see [[project-afu-portal]]) — add a key like `nextTripDate` (YYYY-MM-DD). No new sheet needed.
- Add a date `<input type="date">` to the Trip Banner panel; on change, POST `saveItineraryData` with the new date. Keep the existing show/hide toggle.
- Rewrite `initBostonBanner()` to read `nextTripDate` (fetch once, cache) and derive: the banner subtext ("<Mon D> · Register & pay your balance"), the pre/post-trip subtext swap, and the auto-hide (`HIDE_AFTER` = trip date + a buffer, e.g. a week) — instead of the hardcoded constants.
- **Officer gate:** the whole admin tab is already gated `/[AZPC]/`; setting the date should be limited to officers who can edit — reuse `/[AZP]/` (A/Z/P) like other write actions. Note `V` now = general volunteer (see [[project-app-store-bugs]]), so do NOT include V.
- Follow standing rules: `fetch(SCRIPT_URL)` not google.script.run ([[feedback-no-gas-run]]); if Code.gs changes, clasp push+deploy ([[feedback-clasp-push-workflow]]); commit + bump app.js?v + CACHE_NAME ([[feedback-www-sync]]).

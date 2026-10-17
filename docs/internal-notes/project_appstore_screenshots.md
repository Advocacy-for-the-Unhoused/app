---
name: project-appstore-screenshots
description: How to capture App Store screenshots on Windows (no Mac/Simulator) using Chrome DevTools
metadata: 
  node_type: memory
  type: project
  originSessionId: 183e4a23-7e01-4c1f-a057-82a8c5e8d0aa
---

Use Chrome DevTools device emulation — no Mac, no Simulator, no paid tools needed. Apple does NOT require a device frame; plain UI screenshots are accepted.

**Why:** User is on Windows; iOS Simulator requires a Mac. Chrome at DPR 3 outputs exactly the pixel dimensions Apple requires. Free framing tools (previewed.app free tier) only export 720p which is too low and gets rejected.

## Required resolutions
- **6.7"** (covers largest size, makes 6.5" optional): 1290 × 2796 px
- **5.5"** (required): 1242 × 2208 px

## Chrome DevTools workflow
1. Open app in Chrome → F12 → toggle device toolbar
2. The built-in **iPhone 15 Pro Max** preset outputs 1290 × 2796 (6.7") — use this for the main size; no custom device needed for 6.7"
3. For 5.5", add a custom device:
   - Name: "App Store 5.5", width: 414, height: 736, DPR: 3
   - UA string (required): `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`
4. Navigate to each screen to capture
5. `Ctrl+Shift+P` → type `screenshot` → **"Capture screenshot"** (NOT browser screenshot — this respects DPR and outputs full-res PNG)
6. Upload PNGs directly to App Store Connect

**IMPORTANT:** When adding a custom device, always use **logical pixels + DPR 3** (e.g. 414×736 at DPR 3). Setting physical pixels at DPR 1 (e.g. 1242×2208 at DPR 1) makes the layout look zoomed out and broken.

**Google Sign-In doesn't work in device emulation.** Sign in first without device emulation, then enable it — session persists across the toggle.

**Screenshots can be updated anytime** by submitting a new app version — no code change required.

## Screens to capture (suggested)
- Login screen
- Home/dashboard tab
- Task board
- Admin panel (if showing to Apple — use a real A/Z account for reviewer notes)

## How to apply
When the user is ready to submit to App Store, use this workflow. Remind them to use "Capture screenshot" in DevTools menu, not a system screenshot, to get the correct resolution.

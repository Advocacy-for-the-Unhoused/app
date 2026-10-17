---
name: feedback-bugcheck-before-commit
description: Always run a bug/visual check in the preview before committing UI changes
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bf6f5112-b09e-423e-9bee-67604349f97b
---

**Before committing any UI change, run a bug check** — load it in the browser preview and confirm it both *works* and *looks right*, not just that the code compiles. Don't commit on the assumption it renders correctly.

**Why:** The password vault shipped (76ed841) with a layout bug — usernames rendered one character per line and the Reveal button overlapped them — because I verified logic via JS but never looked at the rendered card. The user caught it from a screenshot.

**How to apply:** For observable changes, follow the verification workflow: force past the login gate (set `window.volunteerProfile`, hide `#authScreen`, unhide `#appContent`+`#mainNav`, then show the tab — see [[feedback-preview-force]]), then **take an actual screenshot** at mobile width. getBoundingClientRect often reads 0 in the offscreen preview tab, so rely on screenshots + computed styles, not layout rects. Watch specifically for the admin-scope `width:100%` button trap ([[feedback-flex-button-width]]).

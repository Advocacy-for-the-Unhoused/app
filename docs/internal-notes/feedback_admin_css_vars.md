---
name: feedback-admin-css-vars
description: "#tabAdmin CSS variables are scoped separately from #tabBoston — always add new color vars to both"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 591b9ed8-0195-433e-aa75-f67d383e63ec
---

`#tabAdmin` and `#tabBoston` each define their own CSS custom property scope. Adding a color to one does NOT make it available in the other.

**Why:** `--blue` was defined only on `#tabBoston` (index.html ~line 1129). The admin tab's `.paid-toggle-btn.mark-train-paid` used `var(--blue)` but got nothing, so the button background was transparent and text (white) was invisible — the "blank button" bug.

**How to apply:** Whenever you add or use a CSS variable (`--blue`, `--zelle`, `--paypal`, etc.) in admin tab styles, make sure it's listed in the `#tabAdmin` block (~line 540). Current vars in `#tabAdmin`: `--orange`, `--cream`, `--dark`, `--border`, `--green`, `--blue` (added 2026-06-15). Current vars in `#tabBoston`: all of the above plus `--zelle`, `--paypal`.

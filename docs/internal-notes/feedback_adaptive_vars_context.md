---
name: feedback-adaptive-vars-context
description: "Adaptive CSS vars must match the background their element sits on — page-level vars are cream/dark for page bg, not for white cards"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9d1b3964-4ff0-4e4e-8181-1ae10e98aa66
---

Always check **what background an element actually sits on** before choosing which adaptive var to use (or before creating a new one).

**Why:** The Privacy Policy button used `--privacy-link-col: rgba(249,246,240,0.4)` (cream) in dark mode. That color is designed for text on the **dark page background**. But the button lives inside `.card { background: white }` — cream text on a white card is completely invisible. The fix was to change `--privacy-link-col` to `rgba(26,19,17,0.5)` (dark) in both modes, since the element always sits on white.

**How to apply:**
- Elements on the **dark page background** (page-level, between/outside cards) → use cream-toned adaptive vars: `rgba(249,246,240, X)`
- Elements inside **white `.card` containers** → use dark colors regardless of theme: `rgba(26,19,17, X)` or `var(--camp-dark)`
- When adding a new CSS var to `:root`, ask: "Is this for the page background or for a white card?" If it's always on white, just hardcode a dark value — no theming needed.

See [[project-theme-system]] for which tabs adapt and which are always light.

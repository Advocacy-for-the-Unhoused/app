---
name: feedback-flex-button-width
description: "CSS bug: display:flex buttons inside a flex container fill the container width — fix with width:fit-content"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3569c6cc-04e2-46f6-b12a-139feb0e0c78
---

A `<button>` with `display: flex` is a block-level flex container. When used as a flex item inside a parent flex container, `flex-basis: auto` resolves to the block element's full available width (not the button's text content). This causes the button to fill the strip and push sibling elements to 0px.

**Why:** Browser blockifies flex items — `display: inline-flex` on a flex item is computed as `flex` (per CSS spec), so switching to `inline-flex` doesn't help. The fix must constrain the button's width explicitly.

**Root cause — global CSS:** There is a global `button { width: 100%; margin-top: 20px; }` rule in index.html (line ~113). Every inline-styled button in the app must explicitly override this with `width:auto` (or `width:fit-content` for standalone buttons) and `margin-top:0`. Forgetting either will cause buttons to stretch full-width or add unexpected top margin.

**How to apply:**
- Buttons inside a flex row (e.g. Save/Cancel pairs): add `width:auto; margin-top:0`
- Standalone buttons that shouldn't fill the container: add `width:fit-content; margin-top:0`
- Text sibling in a flex row that should not push the button out: add `min-width:0; overflow:hidden` to the container div, and `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` to the text children

Patterns used in: `.paid-toggle-btn` + `.paid-toggle-strip-label`; Branch Management Remove/Save/Cancel/Add buttons; leadership row name+email truncation.

---
name: feedback-flex-input-collapse
description: "CSS bug: an <input> with flex:1;min-width:0 in a cramped flex row collapses to 0px width on narrow phone cards — inputs can't wrap, so stack to two lines instead"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c64378a9-d740-471c-be61-daebfd1b82db
---

In this app's card UIs, never give an editable `<input>` `flex: 1; min-width: 0` as the flexible middle column of a single-line flex row. On a narrow phone card (~295px content) the row's fixed siblings (cost box, buttons) plus any left indent exceed the width, and because an input **cannot wrap**, `min-width:0` lets it shrink to literally **0px** — the field vanishes and there's no visible place to type. A text `<div>` in the same spot is safe (it wraps); an input is not.

**Why:** This bit the Boston finance food editor (fixed 2026-07-08): both the "Add Item" row (`.new-food-row` / `.new-food-name`) and saved-item rows (`.food-item-row` / `.food-item-name-input`) packed name-input + cost-input + buttons on one line with a 44px indent, collapsing the name input to 0px (measured) and overflowing the black "Add" button off-card. Since the app ships as a Capacitor iOS app, **mobile is the primary target**, so this made the editor unusable for naming. Distinct from [[feedback-flex-button-width]] (that's buttons stretching to fill; this is inputs collapsing to nothing).

**How to apply:**
- Editable rows on narrow cards: give the name input its **own full-width line** and put cost + action buttons on a second line. Pattern now in use: `.food-item-row`/`.new-food-row` are `flex-direction: column`; the input is `width:100%`; a `.food-line2` flex row holds a `$` `.food-cost-prefix`, the fixed-width cost input, and a right-aligned `.food-line2-actions` (`margin-left:auto`) group for Save/Delete or Add/Cancel.
- Audit trick for "does anything else collapse/overflow": render the REAL cards (call the live `loadAdmin()` so the actual builders run), move `#vol-roster`'s innerHTML into a **normal block** container (NOT a flex child — flex `min-width:auto` gives false page-overflow positives), expand all, then scan for `getBoundingClientRect().width < 8` and `scrollWidth > clientWidth`. Verified 2026-07-08 the food rows were the only offender; cost rows use text divs and paid-toggle strips use `grid:1fr auto`, both safe.

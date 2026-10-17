---
name: feedback-iife-window-exposure
description: All task board (and any IIFE-wrapped) onclick functions must be assigned to window.* — missing assignment = silent no-op
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3deadbec-5ef1-4527-a847-80e519d380a6
---

Any function called from an inline `onclick="fnName(...)"` attribute must be on the global `window` object. The task board script is wrapped in an IIFE, so its functions are not global by default.

**Why:** Recurring trap. `tbEditDueDate` (task board) was missing from window assignments 2026-06-17 → due-date chips did nothing. Recurred 2026-06-18 in the **Boston IIFE**: `togglePaid`, `toggleTrainPaid`, `onFixedCostChange`, `onFixedCostBlur`, `saveFixedCost`, `onFoodItemChange`, `saveFoodItemIfChanged` were all defined but unexposed → ReferenceError on click. Note the scope split: `app.js` and the tab-switching `<script>` (the `function switchTab` block) are NOT IIFE-wrapped, so functions there are global automatically — only the IIFE blocks (Boston ~line 4010, Task Board ~5313, Meeting Scheduler ~5944) need explicit `window.*` exposure.

**How to apply:** When adding a function called from an inline `on*=` handler inside an IIFE, immediately add `window.newFn = newFn;` to that IIFE's exposure block. To audit the whole file: extract every `on*="fn(`, then confirm each `fn` is on `window` OR defined in a non-IIFE block (app.js / switchTab block) — anything left is a bug. Check the exposure block first when a handler appears to do nothing.

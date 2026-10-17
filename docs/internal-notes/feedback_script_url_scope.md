---
name: feedback-script-url-scope
description: "SCRIPT_URL is a const in app.js — not on window — so inline index.html scripts must hardcode the URL"
metadata:
  node_type: memory
  type: feedback
  originSessionId: current
---

`SCRIPT_URL` is declared as `const` in `app.js` and is NOT available as `window.SCRIPT_URL` in inline `<script>` blocks in `index.html`.

**Why:** Caused "Failed to load. Check connection." in the Qualified Persons admin feature — both GAS fetches silently posted to an empty string.

**How to apply:** Any inline script in `index.html` that needs to call GAS must hardcode the URL directly:
```
https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec
```
Do not use `window.SCRIPT_URL` as it will always be `undefined` from inline scripts.

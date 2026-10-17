---
name: feedback-no-gas-run
description: "Never use google.script.run in this app — it's a static file, so all GAS calls must go through fetch(SCRIPT_URL)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 067abd0b-cd62-4c51-b597-72fd498ae1db
---

Never use `google.script.run` in `index.html` or `app.js`.

**Why:** The app is served as a static file (not from Google Apps Script), so `google.script.run` is undefined at runtime and silently fails — the task board sync bug was exactly this.

**How to apply:** All backend calls must use `fetch(SCRIPT_URL, { method:'POST', body:'action=...' })`. When adding any new GAS-backed feature to the frontend, also add a matching `action=` route in `Code.gs doPost`. After adding new Code.gs routes, remind the user to re-deploy the GAS web app.

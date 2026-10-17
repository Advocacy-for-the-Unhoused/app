---
name: feedback-www-sync
description: "www/ must always match root index.html and app.js — pre-commit hook is the planned fix"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 05929651-6f8e-4c8c-968b-4b7f157d466d
---

Always copy `index.html` and `app.js` to `www/` before committing. Capacitor's `webDir` is `www/` — if you only edit the root files, the iOS build on Codemagic gets stale assets.

**Why:** Root files are the source of truth; `www/` is the Capacitor build target. They must be identical or the iOS app will run old code even after a git push.

**Fix in place:** `.git/hooks/pre-commit` auto-copies root → www/ on every commit. No manual step needed.

**Workflow:** After any code change, commit and push — don't just edit files and stop. The user expects the full commit + push as part of task completion, not a manual step left for them.

**How to commit and push (PowerShell — use this exact pattern):**
```powershell
cd "C:\Users\madha\Downloads\Boston permission form\APP"
git add index.html www/index.html   # add whichever files changed
git commit -m @'
Your commit message here

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
git push
```
Key points:
- Use `@'...'@` (single-quoted here-string) for commit messages — NOT `$(cat <<'EOF'...)`, that's Bash syntax and breaks in PowerShell
- Use `;` not `&&` to chain commands in PowerShell
- The pre-commit hook auto-stages www/ copies, so no need to manually add www/ files
- Always end with `git push` — user expects changes to be live after the task

**If hook needs to be recreated (fresh clone):**
```sh
#!/bin/sh
cp index.html www/index.html
cp app.js www/app.js
git add www/index.html www/app.js
```
Then `chmod +x .git/hooks/pre-commit`.

**Preview verification gotchas (cost many round-trips 2026-07-08):**
- The `app` launch config's `python -m http.server` serves the **`www/` directory, not root**. So editing root `app.js`/`index.html` and previewing shows STALE code until you sync. The hook only runs on *commit*, so before preview-verifying uncommitted edits, manually `cp index.html www/index.html; cp app.js www/app.js` (and `cp service-worker.js www/service-worker.js` — see next point). Confirm the server serves fresh with `curl -s http://localhost:3459/app.js | grep <marker>` (curl bypasses the browser SW).
- **`service-worker.js` is NOT copied by the pre-commit hook** — only index.html + app.js. When you change the SW, copy it to `www/` manually AND `git add www/service-worker.js` yourself.
- **SW cache-busting (UPDATED 2026-07-12, commit 68df5cc):** the service worker now caches on the **full URL including query string**, so bumping `app.js?v=N` in index.html alone busts the cache for JS changes (the old query-stripping behavior that defeated `?v=` bumps is gone). Bumping `CACHE_NAME` too is still good hygiene on releases (purges old-version entries) but no longer required for correctness. In preview, an already-installed OLD sw may still serve stale until you `getRegistrations()→unregister()`, `caches.keys()→delete()`, and do a fresh navigation. Watch the console for the bumped `App.js vN loaded!` marker to confirm fresh code ran.
- `preview_screenshot` can time out on the welcome modal (its `backdrop-filter: blur` stalls the headless renderer). Verify with `preview_inspect` (computed colors) + `preview_snapshot` (structure) instead — more reliable anyway. Read **inline** `.style.visibility` not `getComputedStyle` when checking values set mid-transition; computed reads can be stale during the opacity/transform animation.

---
name: feedback-clasp-push-workflow
description: "Always auto-deploy Code.gs after every change — clasp push+deploy workflow, file locations, exact commands"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: df03ab9e-4154-4333-be6f-1de2a8d53b2b
---

**Always run clasp push + deploy automatically after every Code.gs change.** Do not wait to be asked.

**Why:** The GAS backend isn't live until deployed — pushing only to git leaves the live app using stale backend code.

**How to apply:** Any time Code.gs is edited (even a small change), run the deploy sequence below immediately after committing, as part of the same task completion.

## Main Code.gs project

`.clasp.json` and `.claspignore` are in `C:\Users\madha\Downloads\Boston permission form\APP\`.
No file copying needed — just push from the APP directory directly.

**Workflow (2 commands):**
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location "C:\Users\madha\Downloads\Boston permission form\APP"
& "C:\Users\madha\AppData\Roaming\npm\clasp.cmd" push --force
& "C:\Users\madha\AppData\Roaming\npm\clasp.cmd" deploy --deploymentId "AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS" --description "describe change"
```

**Key details:**
- Script ID: `1RJJ4Kn_AG0UpQHnNWDVZhS7T07ptBnv5-an2hHZskUl3jV2fdYGGw90H`
- Live deployment ID: `AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS`
- Web app URL (SCRIPT_URL in app.js): `https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec`
- `.claspignore` only allows `Code.gs` and `appsscript.json` — all web files are excluded

**Why:** `clasp push` alone does NOT update the live site — must run `deploy` after every push.
Node is not in PowerShell PATH by default — always prepend `C:\Program Files\nodejs` first.

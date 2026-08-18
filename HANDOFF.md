# AFU Volunteer Portal — Developer Handoff

> Onboarding guide for a new developer taking over the app.
> Start with **[DEVELOPER.md](DEVELOPER.md)** for the full architecture — this file
> is the "what you need to get set up and what will bite you" companion.

---

## 1. What this project is

A single-page **PWA** for Advocacy for the Unhoused (AFU) volunteers, wrapped as an
iOS app via Capacitor. No build step and no framework on the frontend — you edit
`index.html` / `app.js` directly.

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS — `index.html` + `app.js` |
| Backend | Google Apps Script (`Code.gs`), deployed as a web app |
| Database | Google Sheets |
| Auth | Google Identity Services (JWT) |
| Push | Firebase Cloud Messaging (FCM) |
| iOS wrapper | Capacitor → built on Codemagic → TestFlight/App Store |
| Hosting | GitHub Pages, custom domain `app.hauhelps.org` (see `CNAME`) |
| Deploy tool | `clasp` (Apps Script CLI) |

Read [DEVELOPER.md](DEVELOPER.md) end to end before changing anything.

---

## 2. Access you need (none of this is in the repo)

A `git clone` gets you the code but **not** the ability to run or ship it. Ask the
outgoing dev / AFU to grant:

| System | What to request | Used for |
|--------|-----------------|----------|
| **GitHub** | Collaborator on `Advocacy-for-the-Unhoused/app` | Push code; triggers the live site |
| **Google Apps Script** | Editor/owner on the script project (`scriptId` in `.clasp.json`) | Deploy the backend |
| **Google Sheets** | Editor on every backing spreadsheet (IDs live in `Code.gs`) | The app's database |
| **Google account for `clasp`** | An account with access to the script, then run `clasp login` yourself | Push/deploy `Code.gs` |
| **Apple Developer / App Store Connect** | Team member on the AFU team | iOS builds, TestFlight, review |
| **Codemagic** | Account access **+ a fresh API token** (the old one is being rotated) | CI builds the iOS app |
| **Firebase** | Access to the FCM project | Push notifications |
| **DNS for `app.hauhelps.org`** | Registrar/Cloudflare access | Controls the live domain |

> **Note from the outgoing dev:** deeper internal context (App Store review history,
> per-feature notes, sheet layouts, hard-won gotchas) is shared **privately**, not in
> this public repo. Ask for that bundle.

---

## 3. Local setup

```bash
git clone https://github.com/Advocacy-for-the-Unhoused/app.git
cd app
npm install            # only needed for the Capacitor/iOS tooling, not the frontend
```

**Recreate the pre-commit hook** (it lives in `.git/hooks/` and does NOT clone):

```sh
# .git/hooks/pre-commit
#!/bin/sh
cp index.html www/index.html
cp app.js www/app.js
git add www/index.html www/app.js
```

Then `chmod +x .git/hooks/pre-commit`. See §5 for why this matters.

Install `clasp` globally (`npm i -g @google/clasp`) and `clasp login` with a Google
account that has access to the script project.

---

## 4. Deploy workflow

There are **three independent deploy targets**. Changing one does not update the others.

### Frontend (the website)
Push to `main`. GitHub Pages serves it at `app.hauhelps.org`. To force clients to pick
up new JS, bump the `?v=N` query on the `app.js` tag in `index.html` (the service
worker caches on the full URL, so bumping the version busts the cache).

### Backend (`Code.gs`)
Pushing to git does **nothing** to the live backend — you must `clasp push` **and**
`clasp deploy`. `.claspignore` only allows `Code.gs` + `appsscript.json`.

```bash
clasp push --force
clasp deploy --deploymentId <DEPLOYMENT_ID> --description "what changed"
```

The live deployment ID is the same token embedded in `SCRIPT_URL` inside `app.js`
(`https://script.google.com/macros/s/<ID>/exec`). On Windows you may need to prepend
Node to PATH and call `clasp.cmd` by full path — adjust for your machine.

### iOS app
Capacitor's `webDir` is `www/`. Codemagic (`codemagic.yaml`) builds from the repo and
publishes to TestFlight. A git push alone does **not** live-update installed apps — a
new build ships the code. After changing frontend files, make sure `www/` is synced
(the pre-commit hook does this) or the iOS build gets stale assets.

---

## 5. Gotchas that will bite you

These cost real debugging time. Internalize them before your first change.

- **`www/` must mirror the root.** `www/index.html` and `www/app.js` are the Capacitor
  build target; the root files are the source of truth. The pre-commit hook keeps them
  in sync on commit — but the local preview server serves `www/`, so before previewing
  *uncommitted* edits, copy the files over manually.
- **`service-worker.js` is NOT copied by the hook.** If you change it, copy it to `www/`
  and `git add` it yourself.
- **All GAS calls use `fetch(SCRIPT_URL)`** — never `google.script.run` (the app is a
  static file, not served by Apps Script). Prefer the shared `window.gasFetch` helper.
- **`SCRIPT_URL` is a `const` in `app.js`, not on `window`.** Inline `<script>` blocks in
  `index.html` can't see it — hardcode the URL there.
- **Push `Code.gs` AND deploy.** `clasp push` alone leaves the live app on old backend code.
- **Functions inside an IIFE must be assigned to `window.*`** or `onclick=""` handlers
  silently fail.
- **`#tabAdmin` and `#tabBoston` have separate CSS variable scopes.** A new color
  variable must be added to both blocks or one tab renders wrong.
- **Verify UI changes in the browser before committing** — several bugs shipped because a
  change "looked right" in code but rendered wrong.

---

## 6. Repo map

| Path | What |
|------|------|
| `index.html` | The entire SPA UI (large single file) |
| `app.js` | Frontend logic, all GAS calls |
| `Code.gs` | Apps Script backend (all server actions) |
| `service-worker.js` | PWA offline cache |
| `www/` | Capacitor build target — mirror of root `index.html`/`app.js` |
| `ios/` | Capacitor iOS project |
| `codemagic.yaml` | iOS CI/CD config |
| `.clasp.json` | Apps Script project ID + deploy config |
| `Integrated boston trip online form/` | Separate public permission form (its own GAS web app) |
| `DEVELOPER.md` | Full architecture reference — **read this** |
| `BUG_AUDIT.md` | Historical bug audit notes |

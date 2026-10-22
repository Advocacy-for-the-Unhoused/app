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

> **Deeper context lives in [`docs/internal-notes/`](docs/internal-notes/).** That folder
> holds the full set of development notes — App Store review history, per-feature details,
> sheet layouts, and hard-won gotchas. Point your AI assistant at it, or read it directly.

---

## 3. Local setup

> ⚠️ **Clone the repo — do NOT use GitHub's "Download ZIP".** A downloaded ZIP has
> no `.git` history and no link to GitHub, so it can **never push** (it unzips to a
> folder named `app-main`, a dead copy). If `git status` says *"not a git repository"*,
> that's the problem — delete it and clone instead.

```bash
git clone https://github.com/Advocacy-for-the-Unhoused/app.git
cd app
npm install            # only needed for the Capacitor/iOS tooling, not the frontend
```

**Authenticate with GitHub so pushing works** (one-time). Easiest:

```bash
gh auth login          # GitHub CLI — follow the browser login
```

No `gh`? The first `git push` over HTTPS will pop a browser sign-in via Git Credential
Manager — sign in once and it's cached. You also need a **collaborator invite accepted**
(check your email or github.com/Advocacy-for-the-Unhoused/app/invitations) — permission
to push comes from that, not from having the files.

**Set your commit identity** (one-time):

```bash
git config --global user.name  "Your Name"
git config --global user.email "your-github-email@example.com"
```

**Recreate the pre-commit hook** (it lives in `.git/hooks/` and does NOT clone):

```sh
# .git/hooks/pre-commit
#!/bin/sh
cp index.html www/index.html
cp app.js www/app.js
cp privacy.html www/privacy.html
cp -r vendor/. www/vendor/
git add www/index.html www/app.js www/privacy.html www/vendor
```

Then `chmod +x .git/hooks/pre-commit`. See §6 for why this matters.

Install `clasp` globally (`npm i -g @google/clasp`) and `clasp login` with a Google
account that has access to the script project.

---

## 4. Working with git — two developers at once

Two people can work on this repo at the same time. Git will **not** silently overwrite
anyone's work — a normal `git push` is *rejected* if you're behind, forcing you to pull
first. The whole game is to pull before you push.

### The daily routine (do this every session)

```bash
git pull          # 1. start from the latest code
# ...make your changes, then:
git add <files>
git commit -m "what you changed"
git pull          # 2. grab anything the other dev pushed while you worked
git push          # 3. publish
```

**Always `git pull` before you start AND right before you push.** That second pull is
what prevents collisions — it merges in the other person's work before yours goes up.

- If a pull reports a **merge conflict**, you both edited the same lines. Git marks them
  in the file with `<<<<<<<` / `=======` / `>>>>>>>`; pick the correct final version,
  delete the markers, then `git add` + `git commit` + `git push`. Nothing is lost.
- `index.html` is one big file — **coordinate so you're not both editing the same
  section at the same time.** A quick "pushing now" message avoids most conflicts.
- Only `git push --force` overwrites someone else's work. **Never use `--force`** in
  normal collaboration.

### Branches (recommended for anything non-trivial)

`main` is what GitHub Pages serves live, so you don't want half-finished work on it.
A **branch** is a separate line of work you can commit to freely without touching `main`:

```bash
git checkout -b my-feature       # create & switch to a branch off main
# ...edit, commit as usual...
git push -u origin my-feature    # push the branch to GitHub
```

Then open a **Pull Request (PR)** on GitHub to merge `my-feature` into `main`. The PR
shows exactly what changed and flags conflicts before they hit the live site. Small
tweaks can go straight to `main` with pull-first; bigger features should use a branch.

### Getting Claude (or any AI assistant) to push for you

Claude pushes by running the same `git add` / `git commit` / `git push` in its shell,
using **your** credentials already set up on the machine. So the requirement is simply:
the folder must be a **real clone** (not a ZIP), GitHub auth must be configured
(`gh auth login`), and your identity must be set. Once a manual `git push` works from
that folder, Claude's automatic pushes will work too — there's no separate step. If
Claude's push fails, run `git push` yourself once; the error points to which setup step
above is missing.

---

## 5. Deploy workflow

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

## 6. Gotchas that will bite you

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

## 7. Repo map

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
| `docs/internal-notes/` | Full development notes (feature details, gotchas, history) — great context for an AI assistant |

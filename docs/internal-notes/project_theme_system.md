---
name: project-theme-system
description: "Dark/light theme architecture — which parts adapt, which are always light, and the adaptive CSS vars"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9d1b3964-4ff0-4e4e-8181-1ae10e98aa66
---

## Theme Architecture

Dark mode is the **default** (`:root` in the first `<style>` block). Light mode is an override via `@media (prefers-color-scheme: light)`.

### Which tabs adapt to OS dark/light mode
| Tab | Background | Adapts? |
|-----|-----------|---------|
| Home (`#tabHome`) | transparent → dark page bg | ✅ yes |
| Donations (`#tabDonations`) | transparent → dark page bg | ✅ yes |
| Hours (`#tabHours`) | transparent → dark page bg | ✅ yes |
| Admin (`#tabAdmin`) | always `var(--cream)` = `#F9F6F0` | ❌ always light |
| Tasks (`#tabTasks`) | always `var(--cream)` = `#F9F6F0` | ❌ always light |
| Boston (`#tabBoston`) | always `#F9F6F0` | ❌ always light |

Admin/Tasks/Boston use hardcoded scoped CSS vars (`--dark: #1A1311`, `--cream: #F9F6F0`). They intentionally stay light regardless of OS theme.

**Exception (2026-07-05):** the Tasks tab's fixed-overlay modals (`.modal-box` — add team, view team, task details, hours prompt) DO adapt to dark mode via a `@media (prefers-color-scheme: dark)` block at the end of the tasks CSS. See [[project-task-board]].

### Adaptive CSS vars (defined in :root / light override)
- `--page-bg`, `--page-text` — page background and body text
- `--nav-bg`, `--nav-inactive`, `--nav-hover`, `--nav-border` — bottom nav bar
- `--stat-bg`, `--stat-border`, `--stat-label` — home tab stat boxes
- `--section-label` — "Quick Actions" label on home tab
- `--divider-line`, `--divider-text` — Print Slips divider in donations tab
- `--udi-toggle-col`, `--udi-toggle-border` — Print Slips toggle button
- `--delete-section-border`, `--delete-label` — Delete Account section on home tab
- `--privacy-link-col` — Privacy Policy button color
- `--card-border` — adaptive card/tile border (added 2026-06-17)

### Card border strategy (added 2026-06-17)
White cards (`.card`, `.dash-tile`, `.dash-goal`, `.dash-profile-card`, `.dash-activity`, `#scannerContainer`) all use `border: Xpx solid var(--card-border)`.
- Dark mode: `rgba(249,246,240,0.22)` — subtle cream border so cards have a defined edge on dark bg
- Light mode: `#1A1311` — full dark border, preserving the neobrutalist look

**Why:** `var(--camp-dark)` = `#1A1311` (the old border) is the same color as the dark page background, making card edges invisible in dark mode.

**How to apply:** Any new card-like element on the dark page background should use `var(--card-border)` for its border, not `var(--camp-dark)`.

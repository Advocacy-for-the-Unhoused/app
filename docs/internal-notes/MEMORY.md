# Memory Index

## Project — core app
- [AFU Volunteer Portal](project_afu_portal.md) — Full app structure: files, auth flow, all GAS actions, spreadsheet IDs, tab layout, branch config, Boston trip, notification infrastructure
- [Boston Standalone Form](project_boston_standalone_form.md) — Public online permission form (Integrated boston trip online form/); separate GAS web app, manual deploy, shares Boston sheet; DoB + email-keyed submit fixes
- [Admin Tab Structure](project_admin_tab.md) — 5 top-level sections since 2026-07-05: "Boston Trip" parent panel nests finance/reg/qual/banner; nesting-aware toggleAdminSection; admin gate /[AZPC]/
- [Compensation Requests](project_comp_requests.md) — Volunteer expense reimbursement: Hours tab submission, Admin tab approval (A/Z/FO), GAS actions, sheet layout, CSS classes
- [Branch Management Panel](project_meeting_schedule.md) — Meeting schedule, fundraising tracker, leadership roles, editable goals, Add Branch (A/Z + role C since 2026-07-05, C views all branches read-only); all GAS actions + frontend functions
- [Qualified Persons](project_qualified_persons.md) — Branch-grouped list; A/Z edit anyone, P edits own branch; DoB-based minor detection; renderQualList + qualCanEdit helper
- [Password Vault](project_password_vault.md) — Admin-tab credential store; "Passwords" + "Password Access Log" sheets; A/Z edit, A/Z/P/C reveal (server-logged); no secrets in code, seeded via curl; committed 88f813e not pushed
- [Task Board](project_task_board.md) — Data model, GAS functions, roster-enforced assignees, View Team modal (members + Branch Coord oversees dropdowns, A/Z/P/V/W edit), Task Details modal (2-line clamped titles, click → full text + optional creator instructions + edit), stacked overlap-proof card headers, dark-mode modals, due dates, push notifications, HARDCODED_TEAMS reference

## Project — Codemagic CI/CD
- [Codemagic Build](project_codemagic_build.md) — Build history, key format (base64), SPM structure, Apple Sign In plugin, App Store listing timing
- [App Store Submission Status](project_appstore_rejection_v1.md) — 1.0(6) rejected 2026-07-10 (Guideline 4 SIWA + 3.2.2(iv) donations); all fixes verified in final audit 2026-07-18 and **build 7 published to TestFlight**; next: select build 7 in ASC, reviewer reply, demo account, resubmit

## Project — iOS / mobile
- [Capacitor iOS Setup](project_capacitor_ios.md) — Capacitor 8 wrapper; PWA live at app.hauhelps.org; enrollment/App ID/APNs/Apple Sign In DONE; build 4 on TestFlight; only listing assets + device test remain for public release
- [Sign in with Apple](project_apple_signin.md) — FULLY COMPLETE 2026-06-17: plugin, entitlements file, pbxproj wired, capability on developer.apple.com
- [Push Notifications](project_push_notifications.md) — FCM built end-to-end (Code.gs helpers, app.js token reg, meeting scheduler, foreground toast); native iOS Firebase SDK wired & shipped in build 4 (Codemagic 28); pending only a real-device delivery test
- [Biometric Sign-In](project_biometric_auth.md) — Face ID / Touch ID implemented 2026-06-17; stores email in Capacitor Preferences after first Google sign-in; auto-prompts on every subsequent launch
- [Google OAuth Status](project_oauth_status.md) — Verified by Google; no afu.com domain issues; two non-blocking warnings; custom domain impact is minimal if added later

## Project — pending work
- [Boston Trip Date Panel](project_boston_trip_date_panel.md) — PENDING v2: upgrade admin "Trip Banner" panel so officers set the next trip date (store in Itinerary key/value; banner derives from it instead of hardcoded dates; toggle is currently localStorage-only)
- [Task Dashboard Banner](project_task_dashboard_banner.md) — SHIPPED 2026-07-08: Home "Your Tasks" card (window.tbGetMyTasks + renderMyTasksCard); getMemberInfo now returns fullName
- [App Store V2 Backlog](project_app_store_bugs.md) — 2026-06-17 audit bugs mostly cleared: getRosterMembers volunteer-skip (col A=V) + both XSS spots FIXED 2026-07-09; only LOW/no-impact items remain. Shared escHtml() helper now in app.js
- [App Store Screenshots](project_appstore_screenshots.md) — Chrome DevTools DPR 3 workflow (Windows/no Mac); exact resolutions; no device frame needed

- [Icon webp leftovers](project_icon_webp_leftovers.md) — Untracked icons/*.webp from abandoned optimization; broken www/manifest edit reverted 2026-07-05; how to do it properly if wanted
- [Bug Audit 2026-07-09](project_bug_audit_0709.md) — ALL fixed as of 2026-07-12 (68df5cc, GAS @87) incl. DoB-based isMinor, SW query-string cache-busting, duplicate-UDI warning, contrast; open by choice: S5 server auth, L5, L7

## Project — data reference
- [Hours Sheet Structure](project_hours_bugs.md) — Sheet layout (row 2, col B–G incl. G=notes), free-text event combobox (input+datalist, not select), denyHours non-destructive; redeploy reminder

## Project — theme
- [Theme System](project_theme_system.md) — Dark/light architecture: which tabs adapt, adaptive CSS vars list, --card-border pattern (added 2026-06-17)

## Feedback — rules to always follow
- [Always Start with Memory](feedback_start_with_memory.md) — Read MEMORY.md and relevant files at the start of every session before acting
- [Bug-check Before Commit](feedback_bugcheck_before_commit.md) — Always screenshot/verify UI changes in the preview before committing; don't assume it renders right (vault username-collapse bug shipped this way)
- [Always Commit & Push](feedback_commit_and_push.md) — Commit and push after every change; pre-commit hook may auto-sync www/, verify before manual commit
- [No google.script.run](feedback_no_gas_run.md) — All GAS calls must use fetch(SCRIPT_URL); never google.script.run (app is a static file)
- [cap sync on Windows](feedback_cap_sync_windows.md) — cap sync ios writes backslash paths into Package.swift; fix to forward slashes, no UTF-8 BOMs in iOS project files
- [SCRIPT_URL scope](feedback_script_url_scope.md) — SCRIPT_URL is a const in app.js, not window — inline index.html scripts must hardcode the URL
- [www/ Sync Required](feedback_www_sync.md) — Pre-commit hook auto-copies root → www/ on commit; also: preview serves www/ (sync before verifying uncommitted edits), SW not in hook; since 2026-07-12 SW caches full URL so bumping app.js?v=N alone busts (CACHE_NAME bump optional)
- [Clasp Push Workflow](feedback_clasp_push_workflow.md) — Always auto-deploy after every Code.gs change; clasp push+deploy commands, deployment IDs, Node PATH fix
- [GAS Template Escaping](feedback_gas_template_escaping.md) — Use `<?!= ?>` not `<?= ?>` when embedding JSON in GAS HTML script tags
- [Preview: Bypass Login Screen](feedback_preview_force.md) — Force-show any tab in preview with eval snippet — skip straight to it, don't try naive approaches
- [CSS: display:flex Button Width Bug](feedback_flex_button_width.md) — Block-level flex buttons fill container; fix with width:fit-content + flex:1 on sibling label
- [CSS: flex Input Collapse on Narrow Cards](feedback_flex_input_collapse.md) — An <input> with flex:1;min-width:0 shrinks to 0px on phone cards (can't wrap); stack name to its own line. Boston food editor fix + real-card audit trick
- [CSS: Admin vs Boston CSS Variable Scope](feedback_admin_css_vars.md) — #tabAdmin and #tabBoston have separate CSS var scopes; add new color vars to both blocks
- [CSS: Adaptive Vars on White Cards vs Page Bg](feedback_adaptive_vars_context.md) — Dark-mode cream vars are for page-level elements; white-card elements always need dark colors
- [IIFE Window Exposure](feedback_iife_window_exposure.md) — Task board functions inside IIFE must be assigned to window.* or onclick silently fails

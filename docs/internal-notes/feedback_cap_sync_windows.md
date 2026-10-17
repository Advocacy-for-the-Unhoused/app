---
name: feedback-cap-sync-windows
description: npx cap sync ios on Windows writes backslash paths into CapApp-SPM/Package.swift — must fix to forward slashes; also avoid PS5.1 UTF-8 BOMs in iOS project files
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 72d7a0ad-dee7-45ca-ba76-b2dc59287f82
---

Running `npx cap sync ios` on this Windows machine regenerates `ios/App/CapApp-SPM/Package.swift` with **backslash** relative paths (`..\..\..\node_modules\@capgo\...`), which are invalid Swift string escapes and would break the macOS build.

**Why:** Capacitor CLI uses native path separators. Codemagic re-runs `cap sync ios` on macOS so CI self-heals, but the committed file should still be valid.

**How to apply:** After any local `cap sync ios`, replace `\` with `/` in CapApp-SPM/Package.swift before committing. Also: PowerShell 5.1 `Set-Content -Encoding utf8` adds a BOM — strip it from Package.swift / project.pbxproj with `[System.IO.File]::WriteAllText($p, $text, (New-Object System.Text.UTF8Encoding($false)))`.

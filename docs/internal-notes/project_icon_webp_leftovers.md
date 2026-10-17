---
name: project-icon-webp-leftovers
description: Untracked icons/*.webp files at repo root are leftovers from an abandoned icon-optimization attempt — a broken www/manifest.json edit was reverted 2026-07-05
metadata: 
  node_type: memory
  type: project
  originSessionId: 72d7a0ad-dee7-45ca-ba76-b2dc59287f82
---

Seven untracked `.webp` files sit in root `icons/` (48–512px) from an abandoned icon-optimization attempt before 2026-07-05. The accompanying `www/manifest.json` edit was **broken** (paths `../icons/*.webp` escape the web root; MIME type said `image/png` for webp files) and also deleted `www/icons/icon-1024.png`, so I reverted `www/` to HEAD on 2026-07-05.

Current state: live manifests still use the original PNGs (`icons/icon-192.png`, `icon-512.png`, `icon-1024.png`) — everything works. The webp files are unused and untracked.

**If icon optimization is wanted later:** copy the webp files into BOTH root `icons/` (already there) and `www/icons/`, update BOTH root `manifest.json` and `www/manifest.json` with root-relative paths (`icons/icon-192.webp`) and `"type": "image/webp"`, and keep at least one large PNG for iOS (Safari's apple-touch-icon doesn't take webp). Otherwise the webp files can simply be deleted.

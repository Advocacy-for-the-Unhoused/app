---
name: feedback-commit-and-push
description: Always commit and push after making code changes — user expects changes to be live immediately
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 810b3c50-4dbf-4e67-bb94-513d969e3db0
---

After every set of code changes, always commit and push to origin before reporting the task as done.

**Why:** User expects changes to be live immediately. Leaving uncommitted edits means the app is not actually updated.

**How to apply:** At the end of every task that touches code files, run:
```
git add <changed files> && git commit -m "..." && git push
```
Note: a PostToolUse hook appears to auto-commit and push after each Edit tool call, so the changes may already be live by the time you check. Verify with `git log` and `git log origin/main..HEAD` before attempting a manual commit to avoid redundancy.

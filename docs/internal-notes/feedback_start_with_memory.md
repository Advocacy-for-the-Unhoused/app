---
name: feedback-start-with-memory
description: Always read memory at the start of every new session before doing anything else
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d2ea0059-cc52-4af8-8272-f64526fb89e9
---

At the start of every new conversation, read the MEMORY.md index and any relevant memory files before responding or taking action.

**Why:** Memory contains project-specific rules, known bugs, workflow requirements, and user preferences that override default behavior. Acting without loading memory risks repeating past mistakes or working against established patterns.

**How to apply:** On the first turn of a session, check MEMORY.md and load any memories relevant to the task at hand before proceeding.

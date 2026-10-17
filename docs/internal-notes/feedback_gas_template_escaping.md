---
name: feedback-gas-template-escaping
description: Use <?!= ?> not <?= ?> when embedding JSON data in GAS HTML templates inside <script> tags
metadata: 
  node_type: memory
  type: feedback
  originSessionId: df03ab9e-4154-4333-be6f-1de2a8d53b2b
---

In GAS HTML templates, `<?= expression ?>` HTML-escapes the output. This turns `"` into `&quot;`, which breaks JSON embedded in a `<script>` tag — the browser passes script content as raw text, so `&quot;` is never decoded and the JSON is unparseable.

**Rule:** Always use `<?!= JSON.stringify(data) ?>` (unescaped) when injecting server-side data into JavaScript.

```html
<!-- WRONG — breaks JSON in <script> -->
const DATA = <?= JSON.stringify(members) ?>;

<!-- CORRECT -->
const DATA = <?!= JSON.stringify(members) ?>;
```

Also add an `Array.isArray` guard as a safety net:
```javascript
const _d = <?!= JSON.stringify(members) ?>;
const ALL_MEMBERS = Array.isArray(_d) ? _d : [];
```

**Why:** Discovered when photos weren't loading and `ALL_MEMBERS.map is not a function` errors appeared even with a `|| []` fallback — `|| []` doesn't help if the injected value is truthy but not an array (e.g. an HTML-garbled object).

**How to apply:** Any time a GAS `.html` template file embeds server data into `<script>` blocks, use `<?!= ?>` for the data injection tag.

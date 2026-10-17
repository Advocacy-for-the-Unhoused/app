---
name: feedback-preview-force
description: "How to bypass the login screen in the preview to show a specific tab — skip naive attempts, go straight to the force eval"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e5bc53e2-6484-434f-82ec-c5551a6be5ad
---

The app always opens to a Google sign-in screen in preview. Taking a screenshot immediately just shows the login page. Do NOT attempt to hide individual elements one by one — go straight to the force eval below.

**Why:** The sign-in screen is a static `#authCard` div in the body. `#appContent` (which contains all tabs) is `display:none` until auth completes. The Google GSI script also spams FedCM errors in the console — ignore them, they're expected in preview.

**How to apply:** After any `preview_start`, immediately run this eval pattern to show a specific tab:

```js
(function(){
  document.body.style.background = '#F9F6F0';
  [...document.body.children].forEach(el => {
    if (el.id !== 'appContent') el.style.setProperty('display','none','important');
  });
  const ac = document.getElementById('appContent');
  ac.style.setProperty('display','block','important');
  document.querySelectorAll('.tab-view').forEach(v => v.style.setProperty('display','none','important'));
  const tab = document.getElementById('TAB_ID_HERE');  // e.g. tabAdmin, tabBoston, tabHours
  tab.style.setProperty('display','flex','important');
  tab.style.flexDirection = 'column';
  tab.style.background = '#F9F6F0';
  // any extra setup (open a section, switch a sub-tab, etc.)
  return 'ok';
})()
```

Then take the screenshot — it will show the tab correctly.

Note: IIFE-scoped variables (like `hrsRoster`) cannot be seeded from eval. To fake dropdown/list state for a screenshot, directly manipulate the DOM element's innerHTML instead.

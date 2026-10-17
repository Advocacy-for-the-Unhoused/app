---
name: project-qualified-persons
description: "Qualified Persons admin list — branch grouping, edit permission rules, helper functions, DoB-based minor detection, and renderQualList structure"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6a1f2363-43a6-4d05-aafb-51bc3b5b632b
---

The "Qualified Persons" section in the Admin tab shows who is cleared for the Boston trip.
Members are grouped by branch with colored headers. Checkboxes allow marking someone as qualified.

## Edit permission rules

```js
function qualCanEdit(memberBranchCode) {
  var pos = (window.volunteerProfile && window.volunteerProfile.position) || '';
  if (/[AZ]/.test(pos)) return true;          // A/Z can edit anyone
  if (pos.includes('P')) {
    var myBranch = (window.volunteerProfile && window.volunteerProfile.branchCode) || '';
    return myBranch.toUpperCase() === (memberBranchCode || '').toUpperCase();
  }
  return false;  // everyone else: view only
}
```

- **A (super admin) / Z (org coordinator):** can check/uncheck anyone
- **P (branch president):** can only edit their own branch
- **All others:** checkboxes rendered but disabled (opacity 0.35, not-allowed cursor)

## Branch grouping constants (index.html, before renderQualList)

```js
var QUAL_BRANCH_NAMES  = { 'A': 'Hopkinton', 'W': 'Westford', 'H': 'Holliston', 'M': 'Medway' };
var QUAL_BRANCH_COLORS = { 'A': '#378ADD',   'W': '#1D9E75',  'H': '#D4537E',   'M': '#BA7517' };
var QUAL_BRANCH_ORDER  = ['A', 'W', 'H', 'M'];
```

## renderQualList behavior

- Groups members by `branchCode` in `QUAL_BRANCH_ORDER`
- Each group has a colored branch header showing branch name, qualified count, and "· view only" if the current user can't edit that branch
- Non-editable checkboxes get `disabled` attribute + `style="opacity:0.35;cursor:not-allowed"`
- Inline confirm form (before marking qualified) only appears for editable members

## Qualification confirm form — Date of Birth (updated 2026-06-15)

The inline confirm form **no longer has Adult/Minor toggle buttons**. Instead it shows a `<input type="date">` labeled "Date of Birth":

```js
'<input type="date" id="qual-dob-' + encodeURIComponent(m.email) + '" .../>'
```

- Admin must enter DoB before confirming; `qualConfirmAdd` alerts if blank
- `isUnder18Client(dob)` computes minor status client-side for immediate label update
- `qualDobState` (was `qualMinorState`) stores `email → 'YYYY-MM-DD'`
- `qualSetMinor` / `qualMinorState` **removed**
- On confirm, sends `dob=YYYY-MM-DD` to backend (not `isMinor`)
- `qualSheetEmails` cache stores `{ isMinor, dob, phone }`

## GAS side — addQualifiedPerson (updated 2026-06-15)

`action=addQualifiedPerson&name=&email=&phone=&dob=YYYY-MM-DD`

- Stores DoB as a date value in Boston sheet col C (was "Yes"/"No")
- Calls `saveDobToRoster_(email, dob)` → writes DoB to Roster col I (col 9)
- `isMinor` computed by `isUnder18_()` helper (age < 18 as of today)

`action=getQualifiedNames` → returns objects with `{ name, email, isMinor, dob, phone, rowIndex, isRegistered }`:
- If col C is a Date → format as `YYYY-MM-DD`, compute `isMinor`
- If col C is `'yes'`/`'no'` (legacy rows) → use directly, `dob = ''`
- Backwards-compatible with old data

## GAS side

`getRosterMembers` returns `branchCode` (col F) in each member object — this is what `renderQualList` uses to group and gate. No separate GAS action needed.

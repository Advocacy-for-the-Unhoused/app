// ─────────────────────────────────────────────
//  HAU Boston Trip — Integrated Web App
//  Google Apps Script  |  Code.gs
// ─────────────────────────────────────────────

const SHEET_ID       = '1_BGGoyYgYK__XGkE3VqlxN7oqDuPbyq7YAZshFil8v8';
const REG_SHEET_NAME = 'Qualified Persons Form';

// Branch colors
const BRANCH_COLORS = {
  'A': '#378ADD',  // Hopkinton
  'W': '#1D9E75',  // Westford
  'H': '#D4537E',  // Holliston
  'M': '#BA7517',  // Medway
};
const BRANCH_NAMES = {
  'A': 'Hopkinton',
  'W': 'Westford',
  'H': 'Holliston',
  'M': 'Medway',
};
const FALLBACK_COLOR = '#888780';

// Registration sheet columns (1-indexed):
//   A(1) Name  B(2) Email  C(3) Date of Birth (legacy: Minor? Yes/No)  D(4) Phone
//   E(5) Timestamp  F(6) Shirt Size  G(7) Info Confirmed
//   H(8) Parent Name  I(9) Parent Email  J(10) Parent Phone
//   K(11) Fee Acknowledged  L(12) Permission Granted  M(13) Signature
const COL_PHONE     = 4;
const COL_TIMESTAMP = 5;

// Costs sheet columns (0-indexed):
//   A(0) Name  B(1) Branch  C(2) Email  D(3) Train  E(4) Shirt
//   F(5) Bus   G(6) Paid    H(7) TrainPaid

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('HAU Boston Trip')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── REGISTRATION: qualified names + registration status ───────────────────
// Returns [{name, email, isMinor, phone, rowIndex, isRegistered}]
function getQualifiedNames() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(REG_SHEET_NAME);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Read cols A–M (13 cols)
  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

  return data
    .filter(row => (row[0] || '').toString().trim())
    .map((row, i) => {
      const cMinor = resolveMinor_(row[2]);  // col C = DoB (or legacy Yes/No)
      return {
        name:         row[0].toString().trim(),
        email:        row[1].toString().trim(),
        isMinor:      cMinor.isMinor,
        dob:          cMinor.dob,
        phone:        row[3].toString().trim(),
        rowIndex:     i + 2,
        isRegistered: !!(row[12] || '').toString().trim(),  // col M = Signature
      };
    });
}

// Column C holds a date of birth (since 2026-06-15); older rows may still hold
// the literal "Yes"/"No". Resolve both into { isMinor, dob }.
function resolveMinor_(cellValue) {
  if (cellValue instanceof Date && !isNaN(cellValue)) {
    return { isMinor: isUnder18_(cellValue), dob: Utilities.formatDate(cellValue, Session.getScriptTimeZone(), 'yyyy-MM-dd') };
  }
  const s = String(cellValue || '').trim();
  if (!s) return { isMinor: false, dob: '' };
  const lower = s.toLowerCase();
  if (lower === 'yes') return { isMinor: true,  dob: '' };
  if (lower === 'no')  return { isMinor: false, dob: '' };
  // String that parses as a date (e.g. "2010-05-01")
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return { isMinor: isUnder18_(parsed), dob: Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd') };
  }
  return { isMinor: false, dob: '' };
}

function isUnder18_(dob) {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age < 18;
}

// ── REGISTRATION: submit permission form ──────────────────────────────────
function submitForm(data) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(REG_SHEET_NAME);
    if (!sheet) throw new Error('Sheet "' + REG_SHEET_NAME + '" not found.');

    const headerCheck = sheet.getRange(1, COL_TIMESTAMP).getValue();
    if (!headerCheck) {
      const headers = [
        'Name', 'Email', 'Minor?', 'Phone', 'Timestamp', 'Shirt Size',
        'Info Confirmed', 'Parent Name', 'Parent Email', 'Parent Phone',
        'Fee Acknowledged', 'Permission Granted', 'Signature'
      ];
      const hRange = sheet.getRange(1, 1, 1, headers.length);
      hRange.setValues([headers]);
      hRange.setFontWeight('bold').setBackground('#1A1311').setFontColor('#F9F6F0');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }

    // Resolve the target row using the volunteer's ORIGINAL name/email (the
    // values in the sheet when the page loaded) — not the edited Name/Email the
    // user may have just typed in. Match by original email first (stable even if
    // rows were moved or inserted), then the captured rowIndex (name-verified),
    // then a unique name search. (origEmail/origName fall back to the submitted
    // fields for backward compatibility with older clients.)
    const lastRow = sheet.getLastRow();
    const lookup  = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
    const origEmail = String(data.origEmail || data.email || '').toLowerCase().trim();
    const origName  = String(data.origName  || data.fullName || '').toLowerCase().trim();

    let row = 0;

    // 1) Match by original email (col B) — the reliable key.
    if (origEmail) {
      for (let i = 0; i < lookup.length; i++) {
        if (String(lookup[i][1] || '').toLowerCase().trim() === origEmail) { row = i + 2; break; }
      }
    }

    // 2) Fall back to the captured rowIndex, but only if the name still matches.
    if (!row && data.rowIndex) {
      const nameAtRow = sheet.getRange(data.rowIndex, 1).getValue().toString().toLowerCase().trim();
      if (nameAtRow && nameAtRow === origName) row = data.rowIndex;
    }

    // 3) Last resort: find a unique original-name match anywhere in the sheet.
    if (!row && origName) {
      const matches = [];
      for (let i = 0; i < lookup.length; i++) {
        if (String(lookup[i][0] || '').toLowerCase().trim() === origName) matches.push(i + 2);
      }
      if (matches.length === 1) row = matches[0];
    }

    if (!row) {
      return { success: false, error: 'Could not find your record. Please refresh and try again.' };
    }

    // Save the (possibly edited) name + email back to cols A and B. For
    // volunteers we only had a name for, this fills in their email/phone.
    if (data.fullName) sheet.getRange(row, 1).setValue(data.fullName);
    if (data.email)    sheet.getRange(row, 2).setValue(data.email);
    sheet.getRange(row, COL_PHONE).setValue(data.phone || '');
    sheet.getRange(row, COL_TIMESTAMP, 1, 9).setValues([[
      new Date(),
      data.shirtSize,
      data.infoConfirmed ? 'Yes' : 'No',
      data.parentName  || '',
      data.parentEmail || '',
      data.parentPhone || '',
      data.feeAck      ? 'Yes' : 'No',
      data.permission  ? 'Yes' : 'No',
      data.signature
    ]]);
    sheet.getRange(row, 1, 1, 13).setBackground('#d9ead3');

    return { success: true };
  } catch (e) {
    console.error('submitForm error:', e);
    return { success: false, error: e.message };
  }
}

// ── PAYMENT: internal helpers ─────────────────────────────────────────────
function getFoodSheet_() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let   sheet = ss.getSheetByName('Food');
  if (!sheet) {
    sheet = ss.insertSheet('Food');
    sheet.getRange(1, 1, 1, 4).setValues([['ID', 'Email', 'Item', 'Cost']]);
  }
  return sheet;
}

function parseVolunteerRow_(row) {
  const branch       = String(row[1] || '').trim().toUpperCase();
  const paidRaw      = String(row[6] || '').toLowerCase().trim();
  const trainPaidRaw = String(row[7] || '').toLowerCase().trim();
  return {
    name:        String(row[0] || ''),
    branch:      branch,
    branchName:  BRANCH_NAMES[branch] || branch,
    color:       BRANCH_COLORS[branch] || FALLBACK_COLOR,
    email:       String(row[2] || '').toLowerCase().trim(),
    trainTicket: parseFloat(row[3]) || 0,
    shirtCost:   parseFloat(row[4]) || 0,
    busCost:     parseFloat(row[5]) || 0,
    paid:        paidRaw === 'yes',
    trainPaid:   trainPaidRaw === 'yes',
  };
}

function parseFoodRows_(foodData, email) {
  return foodData
    .filter(r => String(r[1]).toLowerCase().trim() === email)
    .map(r  => ({ id: String(r[0]), item: String(r[2]), cost: parseFloat(r[3]) || 0 }));
}

// ── PAYMENT: volunteer bill lookup ────────────────────────────────────────
function getVolunteerBill(email) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const data  = ss.getSheetByName('Costs').getDataRange().getValues();
    const query = email.toLowerCase().trim();

    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][2] || '').toLowerCase().trim();
      if (rowEmail !== query) continue;

      const foodData  = getFoodSheet_().getDataRange().getValues().slice(1);
      const foodItems = parseFoodRows_(foodData, query);
      const vol       = parseVolunteerRow_(data[i]);

      vol.found     = true;
      vol.foodItems = foodItems;
      vol.foodTotal = foodItems.reduce((s, f) => s + f.cost, 0);
      return vol;
    }
    return { found: false };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ── ADMIN: all volunteers ─────────────────────────────────────────────────
function getAllVolunteers() {
  try {
    const ss       = SpreadsheetApp.openById(SHEET_ID);
    const rows     = ss.getSheetByName('Costs').getDataRange().getValues().slice(1)
                       .filter(r => r[0] || r[2]);
    const foodData = getFoodSheet_().getDataRange().getValues().slice(1);

    return rows.map(row => {
      const vol     = parseVolunteerRow_(row);
      vol.foodItems = parseFoodRows_(foodData, vol.email);
      vol.foodTotal = vol.foodItems.reduce((s, f) => s + f.cost, 0);
      vol.total     = vol.trainTicket + vol.shirtCost + vol.busCost + vol.foodTotal;
      return vol;
    });
  } catch (e) {
    return { error: e.message };
  }
}

// ── ADMIN: update fixed cost (col map 0-indexed → 1-indexed col numbers) ─
function updateVolunteerFixed(email, key, value) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('Costs');
    const data  = sheet.getDataRange().getValues();
    const query = email.toLowerCase().trim();
    const val   = parseFloat(value) || 0;
    const colMap = { trainTicket: 4, shirtCost: 5, busCost: 6 };  // 1-indexed col numbers
    if (!(key in colMap)) return { success: false, error: 'Unknown field: ' + key };

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').toLowerCase().trim() === query) {
        sheet.getRange(i + 1, colMap[key]).setValue(val);
        return { success: true };
      }
    }
    return { success: false, error: 'Volunteer not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── ADMIN: mark full payment (col G = 1-indexed 7) ────────────────────────
function updateVolunteerPaid(email, paid) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('Costs');
    const data  = sheet.getDataRange().getValues();
    const query = email.toLowerCase().trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').toLowerCase().trim() === query) {
        sheet.getRange(i + 1, 7).setValue(paid ? 'Yes' : 'No');
        return { success: true };
      }
    }
    return { success: false, error: 'Volunteer not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── ADMIN: mark train-only payment (col H = 1-indexed 8) ─────────────────
function updateVolunteerTrainPaid(email, paid) {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('Costs');
    const data  = sheet.getDataRange().getValues();
    const query = email.toLowerCase().trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').toLowerCase().trim() === query) {
        sheet.getRange(i + 1, 8).setValue(paid ? 'Yes' : 'No');
        return { success: true };
      }
    }
    return { success: false, error: 'Volunteer not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── FOOD ITEMS ────────────────────────────────────────────────────────────
function addFoodItem(email, item, cost) {
  try {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    getFoodSheet_().appendRow([id, email.toLowerCase().trim(), item, parseFloat(cost) || 0]);
    return { success: true, id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updateFoodItem(id, item, cost) {
  try {
    const sheet = getFoodSheet_();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 3, 1, 2).setValues([[item, parseFloat(cost) || 0]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Item not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteFoodItem(id) {
  try {
    const sheet = getFoodSheet_();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Item not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

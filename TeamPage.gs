// ============================================================
// Team Page Web App — embed in Google Sites via iframe
// ============================================================

const TEAM_SPREADSHEET_ID = '1hcKgLSqLw1Fn4S7kOtBXXwt2ZL307WK1JTH-1jsMHaM';
const TEAM_SHEET_GID = 634347005;

const BRANCH_NAMES = { A: 'Hopkinton', W: 'Westford', H: 'Holliston', M: 'Medway' };

const COL = {
  NAME:   1,  // B — full name
  ROLE:   4,  // E — title / position
  BRANCH: 5,  // F — branch code
  PHOTO:  6,  // G — Google Drive photo URL
};

function doGet(e) {
  // ?debug=1 → returns raw JSON so you can see what the script reads
  if (e && e.parameter && e.parameter.debug) {
    let raw = [];
    try { raw = getTeamMembers_(); } catch (err) { raw = [{error: String(err)}]; }
    return ContentService.createTextOutput(JSON.stringify(raw, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  let members = [];
  try {
    members = getTeamMembers_();
  } catch (err) {
    Logger.log('getTeamMembers_ error: ' + err);
  }

  const tmpl = HtmlService.createTemplateFromFile('TeamPage');
  tmpl.members = members;
  return tmpl.evaluate()
    .setTitle('Meet the Team')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getTeamMembers_() {
  const ss    = SpreadsheetApp.openById(TEAM_SPREADSHEET_ID);
  const sheet = getSheetByGid_(ss, TEAM_SHEET_GID);
  if (!sheet) throw new Error('Sheet not found (GID ' + TEAM_SHEET_GID + ')');

  const data = sheet.getDataRange().getValues();

  return data.slice(1)
    .filter(row => row[COL.NAME] && String(row[COL.NAME]).trim())
    .map(row => ({
      name:   String(row[COL.NAME]   || '').trim(),
      role:   String(row[COL.ROLE]   || '').trim(),
      branch: BRANCH_NAMES[String(row[COL.BRANCH] || '').trim()] || null,
      photo:  getThumbUrl_(row[COL.PHOTO]),
    }))
    .filter(m => m.photo && m.branch);
}

function getSheetByGid_(ss, gid) {
  return ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0];
}

function getThumbUrl_(raw) {
  if (!raw) return '';
  const url = String(raw).trim();
  const m   = url.match(/\/d\/([A-Za-z0-9_-]+)/) || url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (!m) return '';
  const fileId = m[1];
  try {
    // Make publicly accessible so the thumbnail URL works in the browser
    DriveApp.getFileById(fileId).setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch (e) {
    Logger.log('setSharing failed for ' + fileId + ': ' + e);
  }
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';
}

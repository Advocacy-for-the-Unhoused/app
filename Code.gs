// code.gs — Standalone web app script
// Handles all HTTP requests from the volunteer portal.
// The menu/approval UI lives in SheetMenu.gs (bound to the spreadsheet).

// ── Spreadsheet IDs ───────────────────────────────────────────────────────────
const DONATIONS_SS_ID   = "1t6CbQ_QkK5ptPPZ9MtlNit2zpz5wY7siu5hc8oCdeZg";
const ROSTER_SS_ID      = "1hcKgLSqLw1Fn4S7kOtBXXwt2ZL307WK1JTH-1jsMHaM";
const UDI_TRACKER_SS_ID = "11QQE2yxYs-wI0r1jyjenXNI19KM5P49ervmcGDlWoyw";
const HOURS_SS_ID       = "1hcKgLSqLw1Fn4S7kOtBXXwt2ZL307WK1JTH-1jsMHaM";
const SHEET_ID          = "1hcKgLSqLw1Fn4S7kOtBXXwt2ZL307WK1JTH-1jsMHaM";

const PENDING_SHEET = "Pending Volunteers";
const NOTIFY_ALL    = "maanya.shettigar@gmail.com";

// New-branch requests: the dropdown sentinel the app sends, the sheet that
// stores them, and the Branch Coordinator who reviews them (Maanya).
const NEW_BRANCH_SENTINEL   = "__new_branch__";
const BRANCH_REQUESTS_SHEET = "Branch Requests";
const BRANCH_COORDINATOR_EMAIL = NOTIFY_ALL;

// Holding branch for members who requested a brand-new branch. They're added to
// the Roster under this code so sign-in lookups resolve; on approval their row
// is moved to the real branch as President. Kept out of the Branches sheet so it
// never appears in the onboarding dropdown.
const TEMP_BRANCH_CODE = "NEW";
const TEMP_BRANCH_NAME = "Pending New Branch";

const BRANCH_CONFIG = {
  "Hopkinton":  { presidentEmail: "dilpreet.whjr@gmail.com",        folderId: "1VT5CX3h0GfCWiNrksW7kXEqMe5KPCbDc" },
  "Westford":   { presidentEmail: "aradhyaak11@gmail.com",           folderId: "1muPAyc8bxzLzuxiBPOcPNP0CZwf5bmWk" },
  "Holliston":  { presidentEmail: "diyasimhadri11@gmail.com",        folderId: "1s_sE1bsaAQWEfIYS5rhg9_Pic1IdsEcc" },
  "Medway":     { presidentEmail: "advaith.shivkumar1021@gmail.com", folderId: "1xGaoA4nhTHYkf6yQtRIEjpBMLWKwrPuc" },
};

const BRANCH_NAMES = { "A": "Hopkinton", "H": "Holliston", "W": "Westford", "S": "Shrewsbury", "M": "Medway" };
const BRANCH_CODES = { "Hopkinton": "A", "Holliston": "H", "Westford": "W", "Shrewsbury": "S", "Medway": "M" };

// ── Account deletion ──────────────────────────────────────────────────────────
// App Review 5.1.1(v): deletion must remove the account and its personal data,
// not just disable sign-in. Clears name, phone, email, photo, DoB AND the
// Apple sub (col J) — otherwise a "deleted" Apple user could still sign back
// in via the sub lookup in appleSignIn_. Anonymized activity rows remain.
function deleteAccount_(email) {
  try {
    if (!email) return { error: 'No email provided' };
    const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    if (!sheet) return { error: 'Roster sheet not found' };
    const data = sheet.getDataRange().getValues();
    const lc   = email.toLowerCase().trim();
    for (let i = 1; i < data.length; i++) {
      if ((data[i][3] || '').toString().toLowerCase().trim() === lc) {
        sheet.getRange(i + 1, 2).setValue('');   // B — full name
        sheet.getRange(i + 1, 3).setValue('');   // C — phone
        sheet.getRange(i + 1, 4).setValue('');   // D — email
        sheet.getRange(i + 1, 7).setValue('');   // G — photo URL
        sheet.getRange(i + 1, 8).setValue('No'); // H — Active?
        sheet.getRange(i + 1, 9).setValue('');   // I — DoB
        sheet.getRange(i + 1, 10).setValue('');  // J — Apple sub
        removeFcmTokens_(email);
        return { success: true };
      }
    }
    return { error: 'Email not found in roster' };
  } catch (err) {
    return { error: err.message };
  }
}

// Remove the user's push tokens so a deleted account stops receiving pushes.
function removeFcmTokens_(email) {
  try {
    const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('FCM Tokens');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const lc   = email.toLowerCase().trim();
    for (let i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().toLowerCase().trim() === lc) {
        sheet.deleteRow(i + 1);
      }
    }
  } catch (e) { /* non-fatal — roster wipe already succeeded */ }
}

// ── Email diagnostic ──────────────────────────────────────────────────────────
// Run this from the editor (pick testMaanyaEmail in the function dropdown, click
// Run). The editor's inline Execution log shows either a success message or the
// exact error (e.g. a Gmail quota message). If it prompts for authorization,
// approve it — re-authorizing can itself fix a stuck mail permission.
function testMaanyaEmail() {
  var to = BRANCH_COORDINATOR_EMAIL;
  try {
    GmailApp.sendEmail(to, 'AFU test email', 'If you received this, GmailApp email is working.');
    Logger.log('SUCCESS — sent test email to ' + to);
    return 'SUCCESS — sent to ' + to;
  } catch (err) {
    Logger.log('FAILED — ' + err.message);
    return 'FAILED — ' + err.message;
  }
}

// ── doGet ─────────────────────────────────────────────────────────────────────
function doGet(e) {
  if (e.parameter.lookupEmail) {
    return handleLookup(e.parameter.lookupEmail);
  }
  return ContentService.createTextOutput(
    JSON.stringify({ error: "Invalid GET request" })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ── doPost ────────────────────────────────────────────────────────────────────
function doPost(e) {
  const p = e.parameter;
  let result = {};

  try {

    // ── Routing ───────────────────────────────────────────────────────────────
    if (p.lookupEmail) {
      return handleLookup(p.lookupEmail);

    } else if (p.action === "appleSignIn") {
      result = appleSignIn_(p.sub, p.email);

    } else if (p.action === "registerVolunteer") {
      result = handleVolunteerRegistration({
        fname: p.fname, lname: p.lname, email: p.email,
        phone: p.phone, branch: p.branch,
        photoBase64: p.photoBase64, photoMime: p.photoMime,
        appleSub: p.appleSub || '',
        newBranchLocation: p.newBranchLocation || '',
        newBranchType: p.newBranchType || ''
      });

    } else if (p.action === "updateProfilePhoto") {
      result = updateProfilePhoto_(p.email, p.photoBase64, p.photoMime);

    } else if (p.action === "generateSlips") {
      return handleGenerateSlips(p.dateString, p.branchCode);

    } else if (p.action === "getEventTypes") {
      const sheet    = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
      if (!sheet) { result = { error: "Sheet 'volunteer hours' not found" }; }
      else {
        const lastRow   = sheet.getLastRow();
        const eventList = lastRow >= 2
          ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(v => v !== "")
          : [];
        result = { eventTypes: eventList };
      }

    } else if (p.action === "getMyHours") {
      const sheet   = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
      if (!sheet) { result = { error: "Sheet 'volunteer hours' not found" }; }
      else {
      const lastRow = sheet.getLastRow();
      const records = [];
      if (lastRow >= 2) {
        const data = sheet.getRange(2, 2, lastRow - 1, 6).getValues();
        data.forEach(row => {
          if (String(row[0]).trim().toLowerCase() === p.email.trim().toLowerCase()) {
            const rawDate = row[2];
            const formattedDate = rawDate instanceof Date
              ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd")
              : String(rawDate);
            records.push({ eventName: String(row[1]).trim(), eventDate: formattedDate, hours: row[3], approved: String(row[4]).trim(), notes: String(row[5] || "").trim() });
          }
        });
      }
      result = { records };
      } // end else (sheet found)

    } else if (p.action === "submitHours") {
      const hours = parseFloat(p.hours);
      if (!p.email || !p.eventName || !p.eventDate || isNaN(hours) || hours <= 0) {
        result = { error: "Missing or invalid fields" };
      } else {
        const sheet = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
        if (!sheet) {
          result = { error: "Sheet 'volunteer hours' not found — contact your branch officer." };
        } else {
          const nextRow = Math.max(sheet.getLastRow() + 1, 2);
          sheet.getRange(nextRow, 2).setValue(p.email);
          sheet.getRange(nextRow, 3).setValue(p.eventName);
          sheet.getRange(nextRow, 4).setValue(new Date(p.eventDate + "T00:00:00"));
          sheet.getRange(nextRow, 5).setValue(hours);
          sheet.getRange(nextRow, 6).setValue("No");
          sheet.getRange(nextRow, 7).setValue(p.notes ? String(p.notes).slice(0, 500) : "");
          result = { success: true };
          // Push branch president
          try {
            const memberInfo = getMemberInfo(p.email);
            const cfg = BRANCH_CONFIG[memberInfo.branchName];
            if (cfg) {
              const token = getFcmToken_(cfg.presidentEmail);
              if (token) sendPush_(token, 'Hours Submission',
                `${memberInfo.firstName} submitted ${hours} hr${hours !== 1 ? 's' : ''} for "${p.eventName}".`);
            }
          } catch(pushErr) { console.warn('Push failed (submitHours):', pushErr.message); }
        }
      }

    } else if (p.action === "getRosterMembers") {
      result = getRosterMembers();

    } else if (p.action === "getAllHours") {
      result = getAllHours();

    } else if (p.action === "approveHours") {
      const rowIdx = parseInt(p.rowIndex, 10);
      if (!rowIdx) { result = { error: "Missing rowIndex" }; }
      else {
        const sheet = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
        const rowVals = sheet.getRange(rowIdx, 2, 1, 4).getValues()[0];
        const volEmail = String(rowVals[0] || '').trim();
        const eventName = String(rowVals[1] || '').trim();
        const hrs = rowVals[3];
        sheet.getRange(rowIdx, 6).setValue("Yes");
        result = { success: true };
        try {
          const token = getFcmToken_(volEmail);
          if (token) sendPush_(token, 'Hours Approved ✓',
            `Your ${hrs} hr${hrs !== 1 ? 's' : ''} for "${eventName}" have been approved!`);
        } catch(pushErr) { console.warn('Push failed (approveHours):', pushErr.message); }
      }

    } else if (p.action === "denyHours") {
      const rowIdx = parseInt(p.rowIndex, 10);
      if (!rowIdx) { result = { error: "Missing rowIndex" }; }
      else {
        const sheet = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
        const rowVals = sheet.getRange(rowIdx, 2, 1, 2).getValues()[0];
        const volEmail = String(rowVals[0] || '').trim();
        const eventName = String(rowVals[1] || '').trim();
        sheet.getRange(rowIdx, 6).setValue("Denied");
        result = { success: true };
        try {
          const token = getFcmToken_(volEmail);
          if (token) sendPush_(token, 'Hours Not Approved',
            `Your hours request for "${eventName}" was not approved. Contact your branch officer for details.`);
        } catch(pushErr) { console.warn('Push failed (denyHours):', pushErr.message); }
      }

    } else if (p.action === "adminAssignHours") {
      const hours = parseFloat(p.hours);
      if (!p.email || !p.eventName || !p.eventDate || isNaN(hours) || hours <= 0) {
        result = { error: "Missing or invalid fields" };
      } else {
        const sheet   = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
        const nextRow = Math.max(sheet.getLastRow() + 1, 2);
        sheet.getRange(nextRow, 2).setValue(p.email.trim().toLowerCase());
        sheet.getRange(nextRow, 3).setValue(p.eventName);
        sheet.getRange(nextRow, 4).setValue(new Date(p.eventDate + "T00:00:00"));
        sheet.getRange(nextRow, 5).setValue(hours);
        sheet.getRange(nextRow, 6).setValue("Yes");
        result = { success: true };
      }

    } else if (p.getDashboard) {
      result = handleGetDashboard(p.getDashboard, p.branch);

    } else if (p.udi) {
      return handleDonation(p);

    // ── Boston Trip actions ────────────────────────────────────────────────────
    } else if (p.action === "getQualifiedNames") {
      result = bostonFilterByScope_(p.actorEmail, getQualifiedNames());

    } else if (p.action === "addQualifiedPerson") {
      result = withBostonQuotaCheck_(p.actorEmail || '', p.email || '', true,
        () => addQualifiedPerson(p.name || '', p.email || '', p.phone || '', p.dob || ''));

    } else if (p.action === "removeQualifiedPerson") {
      result = withBostonQuotaCheck_(p.actorEmail || '', p.email || '', false,
        () => removeQualifiedPerson(p.email || ''));

    } else if (p.action === "getBranchQuotas") {
      result = getBranchQuotas();

    } else if (p.action === "setBranchQuota") {
      result = setBranchQuota(p.actorEmail || '', p.branchCode || '', p.quota || '');

    } else if (p.action === "startNewBostonTrip") {
      result = startNewBostonTrip(p.actorEmail || '');

    } else if (p.action === "bostonSubmitForm") {
      result = submitForm({
        email:         p.email || '',
        isMinor:       p.isMinor === 'true',
        fullName:      p.fullName      || '',
        phone:         p.phone         || '',
        shirtSize:     p.shirtSize     || '',
        infoConfirmed: p.infoConfirmed === 'true',
        parentName:    p.parentName    || '',
        parentEmail:   p.parentEmail   || '',
        parentPhone:   p.parentPhone   || '',
        feeAck:        p.feeAck        === 'true',
        permission:    p.permission    === 'true',
        signature:     p.signature     || '',
      });

    } else if (p.action === "getVolunteerBill") {
      result = getVolunteerBill(p.email || '');

    } else if (p.action === "getAllVolunteers") {
      result = bostonFilterByScope_(p.actorEmail, getAllVolunteers());

    } else if (p.action === "updateVolunteerPaid") {
      result = bostonCheckEdit_(p.actorEmail, p.email) ||
               updateVolunteerPaid(p.email || '', p.paid === 'true');

    } else if (p.action === "updateVolunteerTrainPaid") {
      result = bostonCheckEdit_(p.actorEmail, p.email) ||
               updateVolunteerTrainPaid(p.email || '', p.paid === 'true');

    } else if (p.action === "updateVolunteerFixed") {
      result = bostonCheckEdit_(p.actorEmail, p.email) ||
               updateVolunteerFixed(p.email || '', p.key || '', p.val || '0');

    } else if (p.action === "updateFoodItem") {
      result = bostonCheckEdit_(p.actorEmail, bostonFoodItemEmail_(p.id)) ||
               updateFoodItem(p.id || '', p.item || '', p.cost || '0');

    } else if (p.action === "deleteFoodItem") {
      result = bostonCheckEdit_(p.actorEmail, bostonFoodItemEmail_(p.id)) ||
               deleteFoodItem(p.id || '');

    } else if (p.action === "addFoodItem") {
      result = bostonCheckEdit_(p.actorEmail, p.email) ||
               addFoodItem(p.email || '', p.item || '', p.cost || '0');

    } else if (p.action === "getItineraryData") {
      result = getItineraryData();

    } else if (p.action === "saveItineraryData") {
      result = saveItineraryData(p.data || '{}');

    // ── Task Board ────────────────────────────────────────────────────────────
    } else if (p.action === "tbGetAllChanges") {
      result = tbGetAllChanges();

    } else if (p.action === "tbSaveChange") {
      result = tbSaveChange(p.type || '', p.key || '', p.value || '', p.extra || '');

    } else if (p.action === "tbGetRosterNames") {
      result = tbGetRosterNames();

    // ── FCM Token Storage ──────────────────────────────────────────────────────
    } else if (p.action === "storeFcmToken") {
      storeFcmToken_(p.email || '', p.token || '');
      result = { success: true };

    // ── Meeting Config ─────────────────────────────────────────────────────────
    } else if (p.action === "getMeetingConfig") {
      result = getMeetingConfig_();

    } else if (p.action === "saveMeetingConfig") {
      const bc = (p.branchCode || '').toUpperCase();
      if (bc && p.day  !== undefined) setMeetingConfigKey_('meetingDay_'  + bc, p.day);
      if (bc && p.time !== undefined) setMeetingConfigKey_('meetingTime_' + bc, p.time);
      result = { ok: true };

    } else if (p.action === "cancelMeeting") {
      setMeetingConfigKey_('cancel_' + (p.branchCode || '').toUpperCase(), p.cancelled || 'No');
      result = { success: true };

    // ── Boston Push Actions ────────────────────────────────────────────────────
    } else if (p.action === "sendBostonPaymentReminder") {
      result = bostonCheckEdit_(p.actorEmail, p.email);
      if (!result) {
        const pToken = getFcmToken_(p.email || '');
        if (pToken) sendPush_(pToken, 'Boston Trip Payment',
          'Your Boston trip payment is still outstanding. Please settle up soon!');
        result = { success: true };
      }

    } else if (p.action === "sendBostonDeadlineReminder") {
      const qNames = bostonFilterByScope_(p.actorEmail, getQualifiedNames());
      const dTokens = qNames.map(q => getFcmToken_(q.email)).filter(Boolean);
      sendPushToMany_(dTokens, 'Boston Trip Deadline',
        'Reminder: the permission form deadline is approaching. Open the app to complete your form!');
      result = { success: true, sent: dTokens.length };

    // ── Volunteer Approvals ────────────────────────────────────────────────────
    } else if (p.action === "getPendingVolunteers") {
      result = getPendingVolunteers();

    } else if (p.action === "approveVolunteer") {
      result = approveVolunteer(parseInt(p.rowIndex, 10));

    } else if (p.action === "denyVolunteer") {
      result = denyVolunteer(parseInt(p.rowIndex, 10));

    // ── Branch Management ──────────────────────────────────────────────────────
    } else if (p.action === "getBranchManagement") {
      result = getBranchManagement();

    } else if (p.action === "addBranch") {
      result = addBranch_(p.code || '', p.name || '');

    } else if (p.action === "getBranches") {
      result = { branches: getBranches_() };

    } else if (p.action === "saveBranchGoal") {
      setMeetingConfigKey_('goal_' + (p.branchCode || '').toUpperCase(), p.goal || '0');
      result = { ok: true };

    } else if (p.action === "setBranchLeaderRole") {
      result = setBranchLeaderRole_(p.email || '', p.roleCode || '');

    } else if (p.action === "approveBranchRequest") {
      result = approveBranchRequest_(p.id || '', p.code || '');

    } else if (p.action === "denyBranchRequest") {
      result = denyBranchRequest_(p.id || '');

    // ── Compensation / Reimbursement Requests ──────────────────────────────────
    } else if (p.action === "submitCompRequest") {
      result = submitCompRequest_(p.email || '', p.amount || '0', p.description || '', p.payMethod || 'Cash', p.payHandle || '', p.imageBase64 || '', p.imageMime || '');

    } else if (p.action === "getCompRequests") {
      result = getCompRequests_();

    } else if (p.action === "getMyCompRequests") {
      result = getMyCompRequests_(p.email || '');

    } else if (p.action === "approveCompRequest") {
      result = approveCompRequest_(p.id || '');

    } else if (p.action === "denyCompRequest") {
      result = denyCompRequest_(p.id || '');

    } else if (p.action === "deleteAccount") {
      result = deleteAccount_(p.email || '');

    } else {
      result = { error: "Invalid request" };
    }

  } catch (err) {
    result = { error: err.message };
    console.error("doPost error:", err.message, err.stack);
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Roster lookup ─────────────────────────────────────────────────────────────
function handleLookup(email) {
  return ContentService.createTextOutput(JSON.stringify(getMemberInfo(email)))
    .setMimeType(ContentService.MimeType.JSON);
}

function getMemberInfo(email) {
  const ss    = SpreadsheetApp.openById(ROSTER_SS_ID);
  const sheet = ss.getSheetByName("Roster");
  if (!sheet) return { firstName: "User", branchCode: "X", branchName: "Sheet Not Found", position: "" };

  const data        = sheet.getDataRange().getValues();
  const searchEmail = (email || "").trim().toLowerCase();
  Logger.log("Searching for email: '" + searchEmail + "'");

  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][3] || "").toString().trim().toLowerCase(); // col D
    if (rowEmail === searchEmail) {
      const fullName  = (data[i][1] || "").toString().trim();            // col B
      const firstName = fullName.split(" ")[0] || "User";
      const position  = (data[i][0] || "").toString().trim();            // col A (role code)
      let branchCode  = (data[i][5] || "").toString().trim().toUpperCase(); // col F
      const rawPhoto  = (data[i][6] || "").toString().trim();            // col G
      const photoId   = (rawPhoto.match(/\/d\/([A-Za-z0-9_-]+)/) || rawPhoto.match(/[?&]id=([A-Za-z0-9_-]+)/) || [])[1] || "";
      const photoUrl  = photoId ? "https://drive.google.com/thumbnail?id=" + photoId + "&sz=w200" : "";
      Logger.log("Match at row " + (i + 1) + " | " + fullName + " | " + branchCode);
      return { firstName, fullName, branchCode, branchName: resolveBranchName_(branchCode) || "Unknown", position, photoUrl };
    }
  }

  Logger.log("No match for: '" + searchEmail + "'");
  return { firstName: "User", branchCode: "X", branchName: "Unknown Branch", position: "" };
}

function appleSignIn_(sub, email) {
  if (!sub) return { error: 'No Apple sub provided' };
  try {
    const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    if (!sheet) return { error: 'Roster sheet not found' };
    const data = sheet.getDataRange().getValues();

    // Returning user — find by Apple sub in col J (index 9)
    for (let i = 1; i < data.length; i++) {
      if ((data[i][9] || '').toString().trim() === sub) {
        return buildMemberResult_(data[i]);
      }
    }

    // First Apple login — find by email and write sub to col J
    if (email) {
      const lc = email.toLowerCase().trim();
      for (let i = 1; i < data.length; i++) {
        if ((data[i][3] || '').toString().toLowerCase().trim() === lc) {
          sheet.getRange(i + 1, 10).setValue(sub);
          return buildMemberResult_(data[i]);
        }
      }
    }

    return { error: 'Not found in roster' };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Update an existing member's profile photo (roster col G) ──────────────────
// Used by the home-tab "add photo later" flow for volunteers who skipped the
// photo on onboarding. Uploads to the branch Drive folder, stores the shareable
// URL in col G, and returns a thumbnail URL for immediate display.
function updateProfilePhoto_(email, photoBase64, photoMime) {
  try {
    if (!email) return { error: 'No email provided' };
    if (!photoBase64 || !photoMime) return { error: 'No photo provided' };

    const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    if (!sheet) return { error: 'Roster sheet not found' };

    const data = sheet.getDataRange().getValues();
    const lc   = email.toLowerCase().trim();
    for (let i = 1; i < data.length; i++) {
      if ((data[i][3] || '').toString().toLowerCase().trim() === lc) { // col D = email
        const branchCode = (data[i][5] || '').toString().trim().toUpperCase(); // col F
        const branchName = BRANCH_NAMES[branchCode];
        const config     = branchName ? BRANCH_CONFIG[branchName] : null;
        if (!config || !config.folderId) return { error: 'No Drive folder for this branch' };

        const nameSafe = (data[i][1] || 'volunteer').toString().trim().replace(/\s+/g, '_') || 'volunteer';
        const filename = nameSafe + '_profile';
        const blob     = Utilities.newBlob(Utilities.base64Decode(photoBase64), photoMime, filename);
        const file     = DriveApp.getFolderById(config.folderId).createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        const photoUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
        sheet.getRange(i + 1, 7).setValue(photoUrl); // col G = photo URL

        return { success: true, photoUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w200' };
      }
    }
    return { error: 'Not found in roster' };
  } catch (err) {
    return { error: err.message };
  }
}

function buildMemberResult_(row) {
  const fullName   = (row[1] || '').toString().trim();
  const firstName  = fullName.split(' ')[0] || 'User';
  const position   = (row[0] || '').toString().trim();
  const branchCode = (row[5] || '').toString().trim().toUpperCase();
  const rawPhoto   = (row[6] || '').toString().trim();
  const photoId    = (rawPhoto.match(/\/d\/([A-Za-z0-9_-]+)/) || rawPhoto.match(/[?&]id=([A-Za-z0-9_-]+)/) || [])[1] || '';
  const photoUrl   = photoId ? 'https://drive.google.com/thumbnail?id=' + photoId + '&sz=w200' : '';
  const email      = (row[3] || '').toString().trim();
  return { firstName, fullName, branchCode, branchName: BRANCH_NAMES[branchCode] || branchCode || 'Unknown', position, photoUrl, email };
}

// ── Donation handler ──────────────────────────────────────────────────────────
function handleDonation(data) {
  const ss    = SpreadsheetApp.openById(DONATIONS_SS_ID);
  const sheet = ss.getSheetByName("Sheet1");
  const lastRow = sheet.getLastRow();
  const existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat() : [];

  if (existing.includes(data.udi)) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: "UDI exists" })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([data.udi, data.amount, "", data.volunteerName, data.fundraiser, data.branchLetter, new Date()]);
  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Volunteer Registration Handler ────────────────────────────────────────────
// Pending Volunteers layout: A=Name | B=Phone | C=Email | D=Photo URL | E=Branch Code | F=Status | G=Apple Sub
function handleVolunteerRegistration(formData) {
  // "Starting a new branch" has no branch code yet — it's a request for Maanya
  // (Branch Coordinator) to review, not a pending volunteer under a branch.
  if (formData.branch === NEW_BRANCH_SENTINEL) {
    return handleNewBranchRequest_(formData);
  }

  const ss     = SpreadsheetApp.openById(SHEET_ID);
  const sheet  = ss.getSheetByName(PENDING_SHEET) || ss.insertSheet(PENDING_SHEET);

  // Resolve the branch against the dynamic Branches sheet (falling back to the
  // hardcoded map) so branches added later register without code changes.
  const branchCode = resolveBranchCode_(formData.branch);
  if (!branchCode) return { error: "Invalid branch: " + formData.branch };

  const config   = BRANCH_CONFIG[formData.branch] || null;
  const folderId = getBranchPhotoFolderId_(branchCode, formData.branch);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Name", "Phone", "Email", "Photo URL", "Branch Code", "Status", "Apple Sub"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  let photoUrl = "";
  if (formData.photoBase64 && formData.photoMime && folderId) {
    try {
      const filename = formData.fname + "_" + formData.lname + "_profile";
      const blob     = Utilities.newBlob(Utilities.base64Decode(formData.photoBase64), formData.photoMime, filename);
      const file     = DriveApp.getFolderById(folderId).createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
    } catch (photoErr) {
      console.error("Photo upload failed:", photoErr.message);
    }
  }

  sheet.appendRow([
    formData.fname + " " + formData.lname,
    formData.phone,
    formData.email,
    photoUrl,
    branchCode,
    "Pending",
    formData.appleSub || ''
  ]);

  const sheetLink = "https://docs.google.com/spreadsheets/d/" + SHEET_ID;
  const emailHtml = `
    <p style="font-family:sans-serif;font-size:14px;">A new volunteer has registered for the <strong>${formData.branch}</strong> branch and is awaiting your approval.</p>
    <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;border:1px solid #eee;">
      <tr style="background:#f9f9f9;"><td><b>Name</b></td><td>${formData.fname} ${formData.lname}</td></tr>
      <tr><td><b>Email</b></td><td>${formData.email}</td></tr>
      <tr style="background:#f9f9f9;"><td><b>Phone</b></td><td>${formData.phone}</td></tr>
      <tr><td><b>Branch</b></td><td>${formData.branch}</td></tr>
      <tr style="background:#f9f9f9;"><td><b>Photo</b></td><td>${photoUrl ? `<a href="${photoUrl}">View photo</a>` : "No photo uploaded"}</td></tr>
    </table>
    <br>
    <p style="font-family:sans-serif;font-size:14px;">To approve or deny: open the <b>AFU Volunteer Portal app</b>, go to <b>Admin → Volunteer Approvals</b>.</p>
  `;

  // Notification emails are best-effort: the volunteer is already saved above,
  // so a Gmail permission/quota error must NOT abort registration.
  try {
    if (config && config.presidentEmail) {
      GmailApp.sendEmail(config.presidentEmail, `New volunteer registration — ${formData.branch}`, "", { htmlBody: emailHtml });
    }
    GmailApp.sendEmail(NOTIFY_ALL, `[All branches] New volunteer — ${formData.fname} ${formData.lname} (${formData.branch})`, "", { htmlBody: emailHtml });
  } catch (mailErr) {
    console.warn('Notification email failed (registerVolunteer):', mailErr.message);
  }

  // Push to branch P (role code) + fallback to hardcoded president email + all Z
  try {
    const bc = branchCode;
    const pTokens = getFcmTokensByBranchAndCode_(bc, 'P');
    if (pTokens.length) {
      sendPushToMany_(pTokens, 'New Volunteer Registration',
        `${formData.fname} ${formData.lname} from ${formData.branch} is awaiting your approval.`);
    } else if (config && config.presidentEmail) {
      // Fallback: president by hardcoded email (only for hardcoded branches)
      const presToken = getFcmToken_(config.presidentEmail);
      if (presToken) sendPush_(presToken, 'New Volunteer Registration',
        `${formData.fname} ${formData.lname} from ${formData.branch} is awaiting your approval.`);
    }
    const zTokens = getFcmTokensByPositionCode_('Z');
    sendPushToMany_(zTokens, 'New Volunteer Registration',
      `${formData.fname} ${formData.lname} registered for the ${formData.branch} branch.`);
  } catch(pushErr) { console.warn('Push failed (registerVolunteer):', pushErr.message); }

  return { success: true };
}

// ── New Branch Requests ─────────────────────────────────────────────────────
// Someone picked "Starting a new branch" during onboarding. We record the
// request, surface it in the Branch Management panel, and open a task for the
// Branch Coordinator (Maanya) to review it.
// Layout: A=Id | B=Timestamp | C=Location | D=Type | E=Requester | F=Email | G=Phone | H=Status | I=Apple Sub
function getBranchRequestsSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(BRANCH_REQUESTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BRANCH_REQUESTS_SHEET);
    sheet.appendRow(['Id', 'Timestamp', 'Location', 'Type', 'Requester', 'Email', 'Phone', 'Status', 'Apple Sub']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleNewBranchRequest_(formData) {
  const location = String(formData.newBranchLocation || '').trim();
  const type     = String(formData.newBranchType || '').trim() || 'High School';
  if (!location) return { error: 'Branch location is required.' };

  const requester = (String(formData.fname || '').trim() + ' ' + String(formData.lname || '').trim()).trim();
  const email     = String(formData.email || '').trim();
  const phone     = String(formData.phone || '').trim();
  const id        = 'br_' + Date.now();

  const sheet = getBranchRequestsSheet_();
  sheet.appendRow([id, new Date(), location, type, requester, email, phone, 'Pending', String(formData.appleSub || '')]);

  // Add the requester to the Roster under the holding branch so their sign-in
  // lookup resolves (otherwise every later login bounces them to registration).
  // On approval this same row is moved to the real branch as President.
  if (email) {
    try {
      if (!findRosterRowByEmail_(email)) {
        addRosterMember_(requester, phone, email, TEMP_BRANCH_CODE, 'V', formData.appleSub);
      }
    } catch (rosterErr) { console.warn('Temp roster add failed:', rosterErr.message); }
  }

  // Open a review task for the Branch Coordinator (Maanya).
  const taskText = 'Review new branch request: ' + location + ' (' + type + ') — from ' +
    (requester || email || 'a new member');
  try { createCoordinatorTask_(taskText); }
  catch (taskErr) { console.warn('New branch task failed:', taskErr.message); }

  // Best-effort notification email to the coordinator.
  try {
    const emailHtml =
      '<p style="font-family:sans-serif;font-size:14px;">A member wants to <strong>start a new branch</strong> and is awaiting your review.</p>' +
      '<table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;border:1px solid #eee;">' +
        '<tr style="background:#f9f9f9;"><td><b>Location</b></td><td>' + location + '</td></tr>' +
        '<tr><td><b>Type</b></td><td>' + type + '</td></tr>' +
        '<tr style="background:#f9f9f9;"><td><b>Requester</b></td><td>' + (requester || '—') + '</td></tr>' +
        '<tr><td><b>Email</b></td><td>' + (email || '—') + '</td></tr>' +
        '<tr style="background:#f9f9f9;"><td><b>Phone</b></td><td>' + (phone || '—') + '</td></tr>' +
      '</table>' +
      '<br><p style="font-family:sans-serif;font-size:14px;">Review it in the app under <b>Admin → Branch Management → Pending Branch Requests</b>.</p>';
    GmailApp.sendEmail(BRANCH_COORDINATOR_EMAIL, 'New branch request — ' + location, '', { htmlBody: emailHtml });
  } catch (mailErr) {
    console.warn('New branch email failed:', mailErr.message);
  }

  return { success: true, newBranchRequest: true };
}

// Create a Team Board task assigned to the Branch Coordinator and push them.
function createCoordinatorTask_(text) {
  // Resolve the coordinator's roster name so the task is assigned to them.
  let assigneeName = '';
  try {
    const roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    if (roster) {
      const data = roster.getDataRange().getValues();
      const lc   = BRANCH_COORDINATOR_EMAIL.toLowerCase().trim();
      for (let i = 1; i < data.length; i++) {
        if ((data[i][3] || '').toString().toLowerCase().trim() === lc) {
          assigneeName = (data[i][1] || '').toString().trim();
          break;
        }
      }
    }
  } catch (e) { /* assignee is best-effort */ }

  const taskId = 'task_' + Date.now();
  tbSaveChange('newTask', taskId, text, JSON.stringify({ assignee: assigneeName }));

  try {
    const token = getFcmToken_(BRANCH_COORDINATOR_EMAIL);
    if (token) sendPush_(token, 'New Branch Request', text);
  } catch (pushErr) { console.warn('Coordinator push failed:', pushErr.message); }
}

// Pending (and recently resolved) branch requests for the management panel.
function getBranchRequests_() {
  const sheet = getBranchRequestsSheet_();
  const last  = sheet.getLastRow();
  if (last < 2) return [];
  const data = sheet.getRange(2, 1, last - 1, 9).getValues();
  return data.map(function(row) {
    return {
      id:        String(row[0] || ''),
      location:  String(row[2] || ''),
      type:      String(row[3] || ''),
      requester: String(row[4] || ''),
      email:     String(row[5] || ''),
      phone:     String(row[6] || ''),
      status:    String(row[7] || 'Pending'),
      appleSub:  String(row[8] || '')
    };
  }).filter(function(r) { return r.id; });
}

function setBranchRequestStatus_(id, status) {
  id = String(id || '').trim();
  if (!id) return { error: 'Missing request id' };
  const sheet = getBranchRequestsSheet_();
  const last  = sheet.getLastRow();
  if (last < 2) return { error: 'Request not found' };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === id) {
      sheet.getRange(i + 2, 8).setValue(status);
      return { ok: true };
    }
  }
  return { error: 'Request not found' };
}

// Insert a member into the Roster, grouped after the last row of their branch.
// Roster: A=role code, B=name, C=phone, D=email, E=position, F=branchCode,
// G=photoUrl, H=Active, I=DoB, J=Apple Sub. Returns the new 1-based row.
function addRosterMember_(name, phone, email, branchCode, roleCode, appleSub) {
  const ss     = SpreadsheetApp.openById(ROSTER_SS_ID);
  const roster = ss.getSheetByName('Roster') || ss.insertSheet('Roster');
  const allRows = roster.getDataRange().getValues();
  let insertAfter = allRows.length;
  for (let i = 0; i < allRows.length; i++) {
    if ((allRows[i][5] || '').toString().trim().toUpperCase() === String(branchCode).toUpperCase()) {
      insertAfter = i + 1;
    }
  }
  roster.insertRowAfter(insertAfter);
  roster.getRange(insertAfter + 1, 1, 1, 10)
        .setValues([[roleCode, name, phone, email, '', branchCode, '', 'Yes', '', appleSub || '']]);
  return insertAfter + 1;
}

// Find a Roster row (1-based) by email, or 0 if not present.
function findRosterRowByEmail_(email) {
  const lc = String(email || '').toLowerCase().trim();
  if (!lc) return 0;
  const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || '').toString().toLowerCase().trim() === lc) return i + 1;
  }
  return 0;
}

// Approve a request → create the branch (name = location), promote the requester
// to that branch's President, then mark the request Approved.
function approveBranchRequest_(id, code) {
  const req = getBranchRequests_().find(function(r) { return r.id === id; });
  if (!req) return { error: 'Request not found' };

  code = String(code || '').trim().toUpperCase();
  const added = addBranch_(code, req.location);
  if (added.error) return added;

  // Promote the requester to President of the new branch. They were already
  // added to the Roster (under the holding branch) when they requested, so
  // move that row to the real branch; fall back to inserting if it's missing.
  if (req.email) {
    try {
      const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
      const rowNum = findRosterRowByEmail_(req.email);
      if (rowNum) {
        sheet.getRange(rowNum, 1).setValue('P');  // col A — role code
        sheet.getRange(rowNum, 6).setValue(code); // col F — branch code
      } else {
        addRosterMember_(req.requester, req.phone, req.email, code, 'P', req.appleSub);
      }
    } catch (rosterErr) {
      console.warn('Promoting president failed:', rosterErr.message);
    }
    try {
      const token = getFcmToken_(req.email);
      if (token) sendPush_(token, 'Branch Approved!',
        'Your ' + req.location + ' branch is approved — you\'re set up as its President. Welcome to AFU!');
    } catch (pushErr) { console.warn('President push failed:', pushErr.message); }
  }

  setBranchRequestStatus_(id, 'Approved');
  return { ok: true };
}

function denyBranchRequest_(id) {
  const req = getBranchRequests_().find(function(r) { return r.id === id; });
  // Remove the holding-branch roster row created at request time (only if still
  // under the temp code — never touch someone already placed in a real branch).
  if (req && req.email) {
    try {
      const sheet  = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
      const rowNum = findRosterRowByEmail_(req.email);
      if (rowNum && sheet) {
        const bc = (sheet.getRange(rowNum, 6).getValue() || '').toString().trim().toUpperCase();
        if (bc === TEMP_BRANCH_CODE) sheet.deleteRow(rowNum);
      }
    } catch (rosterErr) { console.warn('Removing temp member failed:', rosterErr.message); }
  }
  return setBranchRequestStatus_(id, 'Denied');
}

// ── Volunteer Approvals ────────────────────────────────────────────────────────
function getPendingVolunteers() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(PENDING_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { volunteers: [] };
  const data  = sheet.getDataRange().getValues();
  const volunteers = [];
  for (let i = 1; i < data.length; i++) {
    const status = (data[i][5] || '').toString().trim().toLowerCase();
    if (status === 'pending') {
      volunteers.push({
        rowIndex:   i + 1,
        name:       (data[i][0] || '').toString().trim(),
        phone:      (data[i][1] || '').toString().trim(),
        email:      (data[i][2] || '').toString().trim(),
        photoUrl:   (data[i][3] || '').toString().trim(),
        branchCode: (data[i][4] || '').toString().trim().toUpperCase()
      });
    }
  }
  return { volunteers };
}

function approveVolunteer(rowIndex) {
  const ss      = SpreadsheetApp.openById(SHEET_ID);
  const pending = ss.getSheetByName(PENDING_SHEET);
  if (!pending) return { error: 'Pending Volunteers sheet not found' };

  const row        = pending.getRange(rowIndex, 1, 1, 7).getValues()[0];
  const name       = (row[0] || '').toString().trim();
  const phone      = (row[1] || '').toString().trim();
  const email      = (row[2] || '').toString().trim();
  const photoUrl   = (row[3] || '').toString().trim();
  const branchCode = (row[4] || '').toString().trim().toUpperCase();
  const appleSub   = (row[6] || '').toString().trim();

  pending.getRange(rowIndex, 6).setValue('Approved');

  // Add to Roster: A=role code, B=name, C=phone, D=email, E=position, F=branchCode, G=photoUrl, H=Active, I=DoB, J=Apple Sub
  // Col A must be 'V' (active general volunteer) — a blank col A reads as INACTIVE and would
  // hide the new member from getRosterMembers (Assign Hours + Qualified Persons).
  // Insert after the last row whose branch code matches, so the roster stays grouped by branch.
  const roster = ss.getSheetByName('Roster') || ss.insertSheet('Roster');
  const allRows   = roster.getDataRange().getValues();
  let insertAfter = allRows.length; // default: after last row
  for (let i = 0; i < allRows.length; i++) {
    if ((allRows[i][5] || '').toString().trim().toUpperCase() === branchCode) {
      insertAfter = i + 1; // 1-based sheet row
    }
  }
  roster.insertRowAfter(insertAfter);
  roster.getRange(insertAfter + 1, 1, 1, 10)
        .setValues([['V', name, phone, email, '', branchCode, photoUrl, 'Yes', '', appleSub]]);

  // Notify the volunteer
  try {
    const token = getFcmToken_(email);
    if (token) sendPush_(token, 'Application Approved!',
      "Welcome to AFU! Your volunteer application has been approved. You're now part of the team.");
  } catch(e) { console.warn('Push failed (approveVolunteer):', e.message); }

  return { success: true };
}

function denyVolunteer(rowIndex) {
  const ss      = SpreadsheetApp.openById(SHEET_ID);
  const pending = ss.getSheetByName(PENDING_SHEET);
  if (!pending) return { error: 'Pending Volunteers sheet not found' };
  const email = (pending.getRange(rowIndex, 3).getValue() || '').toString().trim();
  pending.getRange(rowIndex, 6).setValue('Denied');

  try {
    const token = getFcmToken_(email);
    if (token) sendPush_(token, 'Application Update',
      'Your volunteer application could not be approved at this time. Please contact your branch officer for details.');
  } catch(e) { console.warn('Push failed (denyVolunteer):', e.message); }

  return { success: true };
}

// ── UDI Slip Generation ───────────────────────────────────────────────────────
function handleGenerateSlips(dateString, branchCode) {
  try {
    return ContentService.createTextOutput(JSON.stringify(generateSlips(dateString, branchCode)))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function generateSlips(dateString, branchCode) {
  const ss    = SpreadsheetApp.openById(UDI_TRACKER_SS_ID);
  const sheet = ss.getSheetByName("Sheet1");
  if (!sheet) throw new Error("Sheet 'Sheet1' not found.");

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === branchCode) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error("Branch code not found.");

  let lastNum = sheet.getRange(rowIndex, 2).getValue();
  if (!lastNum || isNaN(lastNum)) lastNum = 0;

  const UDIs = [];
  for (let i = 1; i <= 16; i++) {
    UDIs.push(branchCode + String(lastNum + i).padStart(3, "0"));
  }
  sheet.getRange(rowIndex, 2).setValue(lastNum + 16);

  const firstUDI = UDIs[0];
  const lastUDI  = UDIs[UDIs.length - 1];
  const doc  = DocumentApp.create(`Branch ${branchCode}: ${firstUDI} to ${lastUDI}`);
  const body = doc.getBody();

  body.setPageWidth(792).setPageHeight(612)
    .setMarginTop(0).setMarginBottom(0).setMarginLeft(36).setMarginRight(0);

  const qrBlob = DriveApp.getFileById("1UHDUUjF1EWID0t-C138LKyQKBh3oO-lh").getBlob();

  UDIs.forEach((udi) => {
    const p1 = body.appendParagraph("Your unique donation identifier is " + udi);
    p1.setFontFamily("Times New Roman").setFontSize(50).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const start = p1.getText().indexOf(udi);
    p1.editAsText().setBold(start, start + udi.length - 1, true);

    body.appendParagraph("").setFontFamily("Times New Roman").setFontSize(50).setAlignment(DocumentApp.HorizontalAlignment.LEFT);

    const p2 = body.appendParagraph("Please visit www.hauhelps.org/transparency to view how your donation is used to help homeless people.");
    p2.setFontFamily("Times New Roman").setFontSize(50).setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    const linkStart = p2.getText().indexOf("www.hauhelps.org/transparency");
    p2.editAsText().setUnderline(linkStart, linkStart + "www.hauhelps.org/transparency".length - 1, true);

    const barcodeBlob = UrlFetchApp.fetch("https://barcodeapi.org/api/128/" + encodeURIComponent(udi.slice(-3))).getBlob();
    const barcodeLine = body.appendParagraph("(QR code on back side)                  ");
    barcodeLine.setFontFamily("Times New Roman").setFontSize(40).setItalic(true).setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    barcodeLine.appendInlineImage(barcodeBlob).setWidth(260).setHeight(80);

    body.appendParagraph("").setFontSize(6);
    body.appendPageBreak();
  });

  UDIs.forEach((udi, index) => {
    body.appendParagraph("Track Your Donation")
      .setFontFamily("Times New Roman").setFontSize(58).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const img = body.appendImage(qrBlob);
    img.setWidth(650).setHeight(650);
    img.getParent().asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (index < UDIs.length - 1) img.getParent().asParagraph().appendPageBreak();
  });

  doc.saveAndClose();

  const folder  = DriveApp.getFolderById("17glZEMCfE7L65RVuSglffhaUEGxzTqTe");
  const docFile = DriveApp.getFileById(doc.getId());
  folder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile);

  const pdfFile = folder.createFile(docFile.getAs("application/pdf"))
    .setName(`Branch ${branchCode}: ${firstUDI} to ${lastUDI}.pdf`);

  return { docUrl: doc.getUrl(), pdfUrl: pdfFile.getUrl(), UDIs };
}

// ── Roster members list (for admin name autocomplete) ─────────────────────────
function getRosterMembers() {
  try {
    const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName("Roster");
    if (!sheet) return { error: "Roster sheet not found" };
    const data = sheet.getDataRange().getValues();
    const members = [];
    for (let i = 1; i < data.length; i++) {
      if (!(data[i][0] || "").toString().trim()) continue; // skip inactive (blank role)
      const name       = (data[i][1] || "").toString().trim();
      const phone      = (data[i][2] || "").toString().trim();
      const email      = (data[i][3] || "").toString().trim().toLowerCase();
      const branchCode = (data[i][5] || "").toString().trim().toUpperCase();
      const rawDob     = data[i][8];
      let dob = '';
      if (rawDob instanceof Date && !isNaN(rawDob)) {
        dob = Utilities.formatDate(rawDob, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (rawDob) {
        dob = rawDob.toString().trim();
      }
      if (name && email) members.push({ name, phone, email, branchCode, dob });
    }
    members.sort((a, b) => a.name.localeCompare(b.name));
    return { members };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Hours admin ───────────────────────────────────────────────────────────────
function getAllHours() {
  try {
    const hoursSheet = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
    if (!hoursSheet) return { error: "Sheet 'volunteer hours' not found" };

    const rosterSheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName("Roster");
    const emailToName = {};
    if (rosterSheet) {
      const rData = rosterSheet.getDataRange().getValues();
      for (let i = 1; i < rData.length; i++) {
        const em = (rData[i][3] || "").toString().trim().toLowerCase();
        const nm = (rData[i][1] || "").toString().trim();
        if (em) emailToName[em] = nm;
      }
    }

    const lastRow = hoursSheet.getLastRow();
    const records = [];
    if (lastRow >= 2) {
      const data = hoursSheet.getRange(2, 2, lastRow - 1, 6).getValues();
      data.forEach((row, i) => {
        const email = String(row[0]).trim();
        if (!email) return;
        const rawDate = row[2];
        const dateStr = rawDate instanceof Date
          ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd")
          : String(rawDate);
        records.push({
          rowIndex:  i + 2,
          email,
          name:      emailToName[email.toLowerCase()] || email,
          eventName: String(row[1]).trim(),
          date:      dateStr,
          hours:     (row[3] instanceof Date) ? 0 : (Number(row[3]) || 0),
          approved:  String(row[4]).trim(),
          notes:     String(row[5] || "").trim()
        });
      });
    }
    return { records };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
const BRANCH_GOAL_TARGET = 5000; // fundraising goal per branch

function handleGetDashboard(email, branchCode) {
  try {
    // ── Approved hours for this volunteer ──────────────────────────────────────
    const hoursSheet = SpreadsheetApp.openById(HOURS_SS_ID).getSheetByName("volunteer hours");
    let hoursApproved = 0;
    const recentActivity = [];

    if (hoursSheet) {
      const lastRow = hoursSheet.getLastRow();
      if (lastRow >= 2) {
        const data = hoursSheet.getRange(2, 2, lastRow - 1, 5).getValues();
        data.forEach(row => {
          if (String(row[0]).trim().toLowerCase() === email.trim().toLowerCase()) {
            const hrs      = Number(row[3] || 0);
            const approved = String(row[4]).trim().toLowerCase() === "yes";
            if (approved) hoursApproved += hrs;
            const rawDate = row[2];
            const dateStr = rawDate instanceof Date
              ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "MMM d")
              : String(rawDate);
            recentActivity.push({
              text: (approved ? "✓ " : "⏳ ") + String(row[1]).trim() + " — " + hrs + " hr" + (hrs !== 1 ? "s" : ""),
              time: dateStr
            });
          }
        });
      }
    }

    // Most recent 5 activity items
    recentActivity.reverse();
    const activity = recentActivity.slice(0, 5);

    // ── Branch fundraising goal (from Meeting Config, falls back to constant) ──
    const config    = getMeetingConfig_();
    const goalTarget = parseFloat(config['goal_' + (branchCode || '').toUpperCase()]) || BRANCH_GOAL_TARGET;

    // ── Branch fundraising goal totals ───────────────────────────────────────
    const donSheet = SpreadsheetApp.openById(DONATIONS_SS_ID).getSheetByName("Sheet1");
    let goalRaised = 0;

    if (donSheet) {
      const dlastRow = donSheet.getLastRow();
      if (dlastRow > 1) {
        const ddata = donSheet.getRange(2, 1, dlastRow - 1, 7).getValues();
        ddata.forEach(row => {
          const rowBranch = String(row[5] || "").trim().toUpperCase();
          const amount    = Number(row[1] || 0);
          if (rowBranch === (branchCode || "").trim().toUpperCase()) {
            goalRaised += amount;
          }
        });
      }
    }

    return {
      hoursApproved,
      goalRaised: Math.round(goalRaised * 100) / 100,
      goalTarget,
      recentActivity: activity
    };

  } catch (err) {
    console.error("handleGetDashboard error:", err.message);
    return { error: err.message };
  }
}

// ── Auth helper — run once to authorize all scopes, then delete ───────────────
function authorizeScopes() {
  DocumentApp.create("auth-test-delete-me");
  UrlFetchApp.fetch("https://www.google.com");
  DriveApp.getFolderById("17glZEMCfE7L65RVuSglffhaUEGxzTqTe").getFiles();
  SpreadsheetApp.openById(DONATIONS_SS_ID);
  SpreadsheetApp.openById(HOURS_SS_ID);
  GmailApp.getInboxThreads(0, 1);
}

function testGmailAuth() {
  GmailApp.sendEmail("madhavsaxenaninja@gmail.com", "Auth test", "If you see this, Gmail is authorized.");
}

// ═════════════════════════════════════════════════════════════════════════════
//  BOSTON TRIP — Registration & Payment functions
//  These are called via google.script.run from the Boston Trip tab in the app.
// ═════════════════════════════════════════════════════════════════════════════

const BOSTON_SHEET_ID   = '1_BGGoyYgYK__XGkE3VqlxN7oqDuPbyq7YAZshFil8v8';
const BOSTON_REG_SHEET  = 'Qualified Persons Form';

const BOSTON_BRANCH_COLORS = {
  'A': '#378ADD', 'W': '#1D9E75', 'H': '#D4537E', 'M': '#BA7517',
};
const BOSTON_BRANCH_NAMES = {
  'A': 'Hopkinton', 'W': 'Westford', 'H': 'Holliston', 'M': 'Medway',
};
const BOSTON_FALLBACK_COLOR = '#888780';

// Registration sheet columns (1-indexed):
//   A(1) Name  B(2) Email  C(3) Minor?  D(4) Phone
//   E(5) Timestamp  F(6) Shirt Size  G(7) Info Confirmed
//   H(8) Parent Name  I(9) Parent Email  J(10) Parent Phone
//   K(11) Fee Acknowledged  L(12) Permission Granted  M(13) Signature
const BOSTON_COL_PHONE     = 4;
const BOSTON_COL_TIMESTAMP = 5;

// ── REGISTRATION: qualified names + registration status ───────────────────────
function isUnder18_(dobStr) {
  try {
    const dob   = new Date(dobStr + 'T00:00:00');
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age < 18;
  } catch (e) { return false; }
}

function saveDobToRoster_(email, dob) {
  const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const lc   = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || '').toString().toLowerCase().trim() === lc) {
      const parsed = dob ? new Date(dob.includes('-') ? dob + 'T00:00:00' : dob) : null;
      sheet.getRange(i + 1, 9).setValue(parsed && !isNaN(parsed) ? parsed : (dob || ''));
      return;
    }
  }
}

function getQualifiedNames() {
  const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
  const sheet = ss.getSheetByName(BOSTON_REG_SHEET);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const tz   = Session.getScriptTimeZone();
  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  return data
    .map((row, i) => ({ row, rawIdx: i + 2 }))
    .filter(({ row }) => (row[0] || '').toString().trim())
    .map(({ row, rawIdx }) => {
      // Col C holds a DoB date for online-form rows, or legacy "Yes"/"No".
      // Compute isMinor from DoB when we have one so it stays current as
      // people age (a stored Yes/No snapshot goes stale after birthdays).
      const rawC = row[2];
      let dob = '';
      let isMinor = false;
      if (rawC instanceof Date && !isNaN(rawC)) {
        dob = Utilities.formatDate(rawC, tz, 'yyyy-MM-dd');
        isMinor = isUnder18_(dob);
      } else {
        const s = (rawC || '').toString().trim();
        if (/^yes$/i.test(s)) {
          isMinor = true;
        } else if (s && !/^no$/i.test(s)) {
          const parsed = new Date(s);
          if (!isNaN(parsed)) {
            dob = Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
            isMinor = isUnder18_(dob);
          }
        }
      }
      return {
        name:         row[0].toString().trim(),
        email:        row[1].toString().trim(),
        isMinor:      isMinor,
        dob:          dob,
        phone:        row[3].toString().trim(),
        rowIndex:     rawIdx,
        isRegistered: !!(row[12] || '').toString().trim(),
      };
    });
}

function addQualifiedPerson(name, email, phone, dob) {
  try {
    const sheet = SpreadsheetApp.openById(BOSTON_SHEET_ID).getSheetByName(BOSTON_REG_SHEET);
    if (!sheet) return { error: 'Sheet not found' };

    // Pull authoritative name, phone, DOB, and branch code from the Roster
    let branchCode = '';
    const rosterSheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    if (rosterSheet) {
      const rData = rosterSheet.getDataRange().getValues();
      const lc = email.toLowerCase().trim();
      for (let i = 1; i < rData.length; i++) {
        if ((rData[i][3] || '').toString().toLowerCase().trim() === lc) {
          name       = (rData[i][1] || '').toString().trim() || name;
          phone      = (rData[i][2] || '').toString().trim() || phone;
          branchCode = (rData[i][5] || '').toString().trim();
          // Use roster-stored DOB if caller didn't provide one
          if (!dob) {
            const rd = rData[i][8];
            if (rd instanceof Date && !isNaN(rd)) {
              dob = Utilities.formatDate(rd, Session.getScriptTimeZone(), 'yyyy-MM-dd');
            } else if (rd) {
              dob = rd.toString().trim();
            }
          }
          break;
        }
      }
    }

    // Prevent duplicates
    const existing = sheet.getDataRange().getValues();
    for (let i = 1; i < existing.length; i++) {
      if ((existing[i][1] || '').toString().trim().toLowerCase() === email.toLowerCase()) {
        console.log('addQualifiedPerson: SKIPPED duplicate at row', i + 1, 'email=', email);
        return { success: true, skipped: true, duplicateRow: i + 1 };
      }
    }
    console.log('addQualifiedPerson: appending row for', email, 'name=', name, 'phone=', phone);
    // Store the DoB itself in col C when we have it (getQualifiedNames
    // recomputes minor status from it); fall back to a Yes/No snapshot.
    const isMinor  = dob ? isUnder18_(dob) : false;
    sheet.appendRow([name, email, dob ? dob : (isMinor ? 'Yes' : 'No'), phone, '', '', '', '', '', '', '', '', '']);
    const newRow   = sheet.getLastRow();
    console.log('addQualifiedPerson: appended at row', newRow);
    if (dob) { try { saveDobToRoster_(email, dob); } catch(e) { console.warn('saveDobToRoster_ failed:', e.message); } }

    // Auto-add a Costs row if one doesn't already exist for this email
    try {
      const costsSheet = SpreadsheetApp.openById(BOSTON_SHEET_ID).getSheetByName('Costs');
      if (costsSheet) {
        const costsData = costsSheet.getDataRange().getValues();
        const alreadyInCosts = costsData.slice(1).some(
          r => (r[2] || '').toString().trim().toLowerCase() === email.toLowerCase()
        );
        if (!alreadyInCosts) {
          costsSheet.appendRow([name, branchCode, email, 20, 5, '', 0, 'No', 'No']);
          console.log('addQualifiedPerson: added Costs row for', email);
        }
      }
    } catch(e) { console.warn('addQualifiedPerson: Costs row failed:', e.message); }

    return { success: true, appendedRow: newRow };
  } catch (err) {
    console.error('addQualifiedPerson error:', err.message, err.stack);
    return { error: err.message };
  }
}

// ── BRANCH QUOTAS ─────────────────────────────────────────────────────────────
// HQ (A/Z) sets a per-branch quota for the current trip; each branch President
// (P) picks qualified persons from their own branch until the quota is full.
// Quotas live in the Itinerary key/value store as quota_<BRANCHCODE>.
// NOTE: the caller is identified by the actorEmail the app sends (no token check).

function rosterIndex_() {
  const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  const byEmail = {};
  if (!sheet) return byEmail;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const email = (data[i][3] || '').toString().trim().toLowerCase();
    if (email) byEmail[email] = {
      position:   (data[i][0] || '').toString().trim(),
      branchCode: (data[i][5] || '').toString().trim().toUpperCase()
    };
  }
  return byEmail;
}

function isBostonHq_(position) { return /[AZ]/.test(position || ''); }

// Count current-trip qualified persons per branch code.
function bostonBranchCounts_(roster) {
  const counts = {};
  const sheet = SpreadsheetApp.openById(BOSTON_SHEET_ID).getSheetByName(BOSTON_REG_SHEET);
  if (!sheet) return counts;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const email = (data[i][1] || '').toString().trim().toLowerCase();
    const bc = (roster[email] && roster[email].branchCode) || 'X';
    if (email) counts[bc] = (counts[bc] || 0) + 1;
  }
  return counts;
}

function bostonQuotas_() {
  const vals = getItineraryData();
  const quotas = {};
  Object.keys(vals).forEach(k => {
    if (k.indexOf('quota_') === 0 && vals[k] !== '') quotas[k.slice(6)] = parseInt(vals[k], 10) || 0;
  });
  return quotas;
}

function getBranchQuotas() {
  try {
    const roster = rosterIndex_();
    const counts = bostonBranchCounts_(roster);
    const quotas = bostonQuotas_();
    const result = {};
    Object.keys(counts).concat(Object.keys(quotas)).forEach(bc => {
      result[bc] = { quota: quotas.hasOwnProperty(bc) ? quotas[bc] : null, used: counts[bc] || 0 };
    });
    return { branches: result, tripDate: getItineraryData().nextTripDate || '' };
  } catch (err) {
    return { error: err.message };
  }
}

function setBranchQuota(actorEmail, branchCode, quota) {
  const actor = rosterIndex_()[(actorEmail || '').trim().toLowerCase()];
  if (!actor || !isBostonHq_(actor.position)) return { error: 'Only HQ can set branch quotas.' };
  const bc = (branchCode || '').trim().toUpperCase();
  if (!bc) return { error: 'Missing branch.' };
  const q = String(quota).trim();
  if (q !== '' && !/^\d+$/.test(q)) return { error: 'Quota must be a whole number.' };
  return saveItineraryData(JSON.stringify({ ['quota_' + bc]: q }));
}

// Branch scope for Boston admin data: a President (P without A/Z) is limited to
// their own branch; everyone else is unrestricted (null).
function bostonScope_(roster, actorEmail) {
  const actor = roster[(actorEmail || '').trim().toLowerCase()];
  if (!actor || isBostonHq_(actor.position) || actor.position.indexOf('P') === -1) return null;
  return actor.branchCode;
}

// Trim a list of {email, ...} records to the caller's branch.
function bostonFilterByScope_(actorEmail, list) {
  if (!Array.isArray(list) || !actorEmail) return list;
  const roster = rosterIndex_();
  const scope  = bostonScope_(roster, actorEmail);
  if (!scope) return list;
  return list.filter(r => {
    const m = roster[(r.email || '').toString().trim().toLowerCase()];
    return m && m.branchCode === scope;
  });
}

// Returns an error object if the caller may not edit this member's Boston data,
// or null when the edit is allowed.
function bostonCheckEdit_(actorEmail, memberEmail) {
  const roster = rosterIndex_();
  if (!roster[(actorEmail || '').trim().toLowerCase()]) return { success: false, error: 'Sign in again — we could not confirm your role.' };
  const scope = bostonScope_(roster, actorEmail);
  if (!scope) return null;
  const member = roster[(memberEmail || '').trim().toLowerCase()];
  if (!member || member.branchCode !== scope) return { success: false, error: 'You can only manage members of your own branch.' };
  return null;
}

function bostonFoodItemEmail_(id) {
  const data = bostonGetFoodSheet_().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return String(data[i][1] || '');
  }
  return '';
}

// Gate add/remove of a qualified person: HQ can edit any branch with no quota
// limit; a President only their own branch, and adds stop at the branch quota.
function withBostonQuotaCheck_(actorEmail, memberEmail, isAdd, fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const roster = rosterIndex_();
    const actor  = roster[(actorEmail || '').trim().toLowerCase()];
    const member = roster[(memberEmail || '').trim().toLowerCase()];
    if (!actor) return { error: 'Sign in again — we could not confirm your role.' };
    if (!isBostonHq_(actor.position)) {
      if (actor.position.indexOf('P') === -1) return { error: 'Only branch presidents and HQ can register members.' };
      if (!member || member.branchCode !== actor.branchCode) return { error: 'You can only register members of your own branch.' };
      if (isAdd) {
        const quota = bostonQuotas_()[actor.branchCode];
        if (quota == null) return { error: 'HQ has not set a quota for your branch yet.' };
        const used = bostonBranchCounts_(roster)[actor.branchCode] || 0;
        if (used >= quota) return { error: 'Your branch quota is full (' + used + '/' + quota + ').' };
      }
    }
    return fn();
  } catch (err) {
    return { error: err.message };
  } finally {
    lock.releaseLock();
  }
}

// Archive the current trip: copy the registration and Costs sheets to
// "<name> <tripDate>" snapshots, then clear their data rows (headers kept).
// Quotas are cleared too so HQ sets fresh ones for the next trip.
function startNewBostonTrip(actorEmail) {
  const actor = rosterIndex_()[(actorEmail || '').trim().toLowerCase()];
  if (!actor || !isBostonHq_(actor.position)) return { error: 'Only HQ can start a new trip.' };
  try {
    const ss  = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    const tag = getItineraryData().nextTripDate ||
                Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    [BOSTON_REG_SHEET, 'Costs'].forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;
      let archiveName = name + ' ' + tag, n = 2;
      while (ss.getSheetByName(archiveName)) archiveName = name + ' ' + tag + ' (' + (n++) + ')';
      sheet.copyTo(ss).setName(archiveName);
      if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
    });
    const cleared = {};
    Object.keys(bostonQuotas_()).forEach(bc => { cleared['quota_' + bc] = ''; });
    if (Object.keys(cleared).length) saveItineraryData(JSON.stringify(cleared));
    return { success: true, archivedAs: tag };
  } catch (err) {
    return { error: err.message };
  }
}

function removeQualifiedPerson(email) {
  try {
    const sheet = SpreadsheetApp.openById(BOSTON_SHEET_ID).getSheetByName(BOSTON_REG_SHEET);
    if (!sheet) return { error: 'Sheet not found' };
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if ((data[i][1] || '').toString().trim().toLowerCase() === email.toLowerCase()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: true, skipped: true };
  } catch (err) {
    return { error: err.message };
  }
}

// ── REGISTRATION: submit permission form ──────────────────────────────────────
function submitForm(data) {
  try {
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    const sheet = ss.getSheetByName(BOSTON_REG_SHEET);
    if (!sheet) throw new Error('Sheet "' + BOSTON_REG_SHEET + '" not found.');

    const headerCheck = sheet.getRange(1, BOSTON_COL_TIMESTAMP).getValue();
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

    // Find row by email (reliable) rather than filtered index
    let row = -1;
    const allRows = sheet.getDataRange().getValues();
    const emailLc = (data.email || '').trim().toLowerCase();
    for (let i = 1; i < allRows.length; i++) {
      if ((allRows[i][1] || '').toString().trim().toLowerCase() === emailLc) {
        row = i + 1; // 1-indexed sheet row
        break;
      }
    }
    if (row === -1) {
      return { success: false, error: 'Volunteer not found. Please refresh and try again.' };
    }
    const nameInSheet = sheet.getRange(row, 1).getValue().toString().trim();
    if (nameInSheet.toLowerCase() !== data.fullName.toLowerCase()) {
      return { success: false, error: 'Name mismatch. Please refresh and try again.' };
    }

    sheet.getRange(row, BOSTON_COL_PHONE).setValue(data.phone || '');
    sheet.getRange(row, BOSTON_COL_TIMESTAMP, 1, 9).setValues([[
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

// ── PAYMENT: internal helpers ─────────────────────────────────────────────────
function bostonGetFoodSheet_() {
  const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
  let   sheet = ss.getSheetByName('Food');
  if (!sheet) {
    sheet = ss.insertSheet('Food');
    sheet.getRange(1, 1, 1, 4).setValues([['ID', 'Email', 'Item', 'Cost']]);
  }
  return sheet;
}

function bostonParseVolunteerRow_(row) {
  const branch       = String(row[1] || '').trim().toUpperCase();
  const paidRaw      = String(row[6] || '').toLowerCase().trim();
  const trainPaidRaw = String(row[7] || '').toLowerCase().trim();
  return {
    name:        String(row[0] || ''),
    branch:      branch,
    branchName:  BOSTON_BRANCH_NAMES[branch] || branch,
    color:       BOSTON_BRANCH_COLORS[branch] || BOSTON_FALLBACK_COLOR,
    email:       String(row[2] || '').toLowerCase().trim(),
    trainTicket: parseFloat(row[3]) || 0,
    shirtCost:   parseFloat(row[4]) || 0,
    busCost:     parseFloat(row[5]) || 0,
    paid:        paidRaw === 'yes',
    trainPaid:   trainPaidRaw === 'yes',
  };
}

function bostonParseFoodRows_(foodData, email) {
  return foodData
    .filter(r => String(r[1]).toLowerCase().trim() === email)
    .map(r  => ({ id: String(r[0]), item: String(r[2]), cost: parseFloat(r[3]) || 0 }));
}

// ── PAYMENT: volunteer bill lookup ────────────────────────────────────────────
function getVolunteerBill(email) {
  try {
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    const data  = ss.getSheetByName('Costs').getDataRange().getValues();
    const query = email.toLowerCase().trim();

    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][2] || '').toLowerCase().trim();
      if (rowEmail !== query) continue;

      const foodData  = bostonGetFoodSheet_().getDataRange().getValues().slice(1);
      const foodItems = bostonParseFoodRows_(foodData, query);
      const vol       = bostonParseVolunteerRow_(data[i]);

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

// ── ADMIN: all volunteers ─────────────────────────────────────────────────────
function getAllVolunteers() {
  try {
    const ss       = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    const rows     = ss.getSheetByName('Costs').getDataRange().getValues().slice(1)
                       .filter(r => r[0] || r[2]);
    const foodData = bostonGetFoodSheet_().getDataRange().getValues().slice(1);

    return rows.map(row => {
      const vol     = bostonParseVolunteerRow_(row);
      vol.foodItems = bostonParseFoodRows_(foodData, vol.email);
      vol.foodTotal = vol.foodItems.reduce((s, f) => s + f.cost, 0);
      vol.total     = vol.trainTicket + vol.shirtCost + vol.busCost + vol.foodTotal;
      return vol;
    });
  } catch (e) {
    return { error: e.message };
  }
}

// ── ADMIN: update fixed cost ──────────────────────────────────────────────────
function updateVolunteerFixed(email, key, value) {
  try {
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    const sheet = ss.getSheetByName('Costs');
    const data  = sheet.getDataRange().getValues();
    const query = email.toLowerCase().trim();
    const val   = parseFloat(value) || 0;
    const colMap = { trainTicket: 4, shirtCost: 5, busCost: 6 };
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

// ── ADMIN: mark full payment ──────────────────────────────────────────────────
function updateVolunteerPaid(email, paid) {
  try {
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
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

// ── ADMIN: mark train-only payment ────────────────────────────────────────────
function updateVolunteerTrainPaid(email, paid) {
  try {
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
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

// ── FOOD ITEMS ────────────────────────────────────────────────────────────────
function addFoodItem(email, item, cost) {
  try {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    bostonGetFoodSheet_().appendRow([id, email.toLowerCase().trim(), item, parseFloat(cost) || 0]);
    return { success: true, id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updateFoodItem(id, item, cost) {
  try {
    const sheet = bostonGetFoodSheet_();
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
    const sheet = bostonGetFoodSheet_();
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

// ── ITINERARY: get TBD values ─────────────────────────────────────────────────
function getItineraryData() {
  try {
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    let sheet   = ss.getSheetByName('Itinerary');
    if (!sheet) return {};
    const data  = sheet.getDataRange().getValues();
    const result = {};
    for (let i = 0; i < data.length; i++) {
      if (data[i][0]) result[String(data[i][0])] = String(data[i][1] || '');
    }
    return result;
  } catch (e) {
    return {};
  }
}

// ── ITINERARY: save TBD values (admin only — password enforced client-side) ──
function saveItineraryData(jsonStr) {
  try {
    const vals  = JSON.parse(jsonStr);
    const ss    = SpreadsheetApp.openById(BOSTON_SHEET_ID);
    let sheet   = ss.getSheetByName('Itinerary');
    if (!sheet) {
      sheet = ss.insertSheet('Itinerary');
      sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Build key→row index map from existing data
    const existing = sheet.getDataRange().getValues();
    const rowMap   = {};
    for (let i = 1; i < existing.length; i++) {
      if (existing[i][0]) rowMap[String(existing[i][0])] = i + 1;
    }

    // Write each key-value pair
    Object.keys(vals).forEach(key => {
      if (rowMap[key]) {
        sheet.getRange(rowMap[key], 2).setValue(vals[key]);
      } else {
        sheet.appendRow([key, vals[key]]);
      }
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── TASK BOARD ────────────────────────────────────────────────────────────
// Uses the same ROSTER_SS_ID spreadsheet, separate "Task Changes" sheet.
// Columns: Type | Key | Value | Extra | Timestamp

const TB_SHEET_NAME = 'Task Changes';

function tbGetSheet() {
  const ss = SpreadsheetApp.openById(ROSTER_SS_ID);
  let sheet = ss.getSheetByName(TB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TB_SHEET_NAME);
    sheet.appendRow(['Type', 'Key', 'Value', 'Extra', 'Timestamp']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 300);
    sheet.setColumnWidth(4, 200);
    sheet.setColumnWidth(5, 180);
  }
  return sheet;
}

function tbGetAllChanges() {
  const sheet = tbGetSheet();
  const last  = sheet.getLastRow();
  if (last <= 1) return [];

  return sheet.getRange(2, 1, last - 1, 5).getValues()
    .filter(row => row[0])
    .map(row => {
      const type = String(row[0]);
      let value  = row[2];

      if (value instanceof Date) {
        if (type === 'teamMeetingTime') {
          value = String(value.getUTCHours()).padStart(2, '0') + ':'
                + String(value.getUTCMinutes()).padStart(2, '0');
        } else {
          value = Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
        }
      } else {
        value = String(value);
      }

      return {
        type,
        key:   String(row[1]),
        value,
        extra: String(row[3])
      };
    });
}

function tbSaveChange(type, key, value, extra) {
  if (!type) return { success: false, error: 'Missing type' };

  const sheet  = tbGetSheet();
  const newRow = sheet.getLastRow() + 1;
  const range  = sheet.getRange(newRow, 1, 1, 5);

  range.setNumberFormats([['@', '@', '@', '@', '@']]);
  range.setValues([[
    String(type),
    key   ? String(key)   : '',
    value ? String(value) : '',
    extra ? String(extra) : '',
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'MM/dd/yyyy HH:mm:ss'
    )
  ]]);

  // Push assignee when a task is assigned
  if (type === 'taskAssignee' && value) {
    try {
      const roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
      if (roster) {
        const rData   = roster.getDataRange().getValues();
        const nameLc  = value.toString().toLowerCase().trim();
        for (let i = 1; i < rData.length; i++) {
          if ((rData[i][1] || '').toString().toLowerCase().trim() === nameLc) {
            const assigneeEmail = (rData[i][3] || '').toString().trim();
            const token = getFcmToken_(assigneeEmail);
            const taskLabel = extra ? `"${extra}"` : 'a task';
            if (token) sendPush_(token, 'Task Assigned', `You've been assigned ${taskLabel}.`);
            break;
          }
        }
      }
    } catch(pushErr) { console.warn('Push failed (taskAssignee):', pushErr.message); }
  }

  return { success: true };
}

function tbGetRosterNames() {
  var roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!roster) return [];
  var data = roster.getDataRange().getValues();
  var names = [];
  for (var i = 1; i < data.length; i++) {
    var name = (data[i][1] || '').toString().trim();
    if (name) names.push(name);
  }
  return names;
}

function tbCheckDueDates() {
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = Utilities.formatDate(tomorrow, 'UTC', 'yyyy-MM-dd');

  var changes = tbGetAllChanges();
  var tasks = {};
  changes.forEach(function(c) {
    switch (c.type) {
      case 'newTask': {
        var ex = {}; try { ex = JSON.parse(c.extra || '{}'); } catch(e) {}
        tasks[c.key] = { text: c.value, assignee: ex.assignee || '', dueDate: '', done: false };
        break;
      }
      case 'deleteTask':   delete tasks[c.key]; break;
      case 'taskAssignee': if (tasks[c.key]) tasks[c.key].assignee = c.value; break;
      case 'taskText':     if (tasks[c.key]) tasks[c.key].text     = c.value; break;
      case 'taskDone':     if (tasks[c.key]) tasks[c.key].done     = (c.value === 'true'); break;
      case 'taskDueDate':  if (tasks[c.key]) tasks[c.key].dueDate  = c.value; break;
    }
  });

  var roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!roster) return;
  var rData = roster.getDataRange().getValues();

  Object.keys(tasks).forEach(function(taskId) {
    var task = tasks[taskId];
    if (task.done || task.dueDate !== tomorrowStr || !task.assignee) return;
    var nameLc = task.assignee.toLowerCase().trim();
    for (var i = 1; i < rData.length; i++) {
      if ((rData[i][1] || '').toString().toLowerCase().trim() === nameLc) {
        var email = (rData[i][3] || '').toString().trim();
        var token = getFcmToken_(email);
        if (token) sendPush_(token, 'Task Due Tomorrow', '"' + task.text + '" is due tomorrow.');
        break;
      }
    }
  });
}

function setupTaskDueTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'tbCheckDueDates'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tbCheckDueDates').timeBased().everyDays(1).atHour(9).create();
  Logger.log('Task due-date trigger installed (daily at 9am).');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  FCM TOKEN STORAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function getFcmSheet_() {
  const ss = SpreadsheetApp.openById(ROSTER_SS_ID);
  let sheet = ss.getSheetByName('FCM Tokens');
  if (!sheet) {
    sheet = ss.insertSheet('FCM Tokens');
    sheet.appendRow(['Email', 'Token', 'Updated']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1A1311').setFontColor('#F9F6F0');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 380);
    sheet.setColumnWidth(3, 160);
  }
  return sheet;
}

function storeFcmToken_(email, token) {
  if (!email || !token) return;
  const sheet = getFcmSheet_();
  const data  = sheet.getDataRange().getValues();
  const lc    = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase().trim() === lc) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[token, new Date()]]);
      return;
    }
  }
  sheet.appendRow([lc, token, new Date()]);
}

function getFcmToken_(email) {
  if (!email) return null;
  const sheet = getFcmSheet_();
  const data  = sheet.getDataRange().getValues();
  const lc    = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().toLowerCase().trim() === lc) {
      return (data[i][1] || '').toString().trim() || null;
    }
  }
  return null;
}

function getFcmTokensByBranch_(branchCode) {
  const roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!roster) return [];
  const rData  = roster.getDataRange().getValues();
  const tokens = [];
  for (let i = 1; i < rData.length; i++) {
    const bc     = (rData[i][5] || '').toString().trim().toUpperCase(); // col F
    const active = (rData[i][7] || '').toString().trim().toLowerCase(); // col H
    if (bc === branchCode.toUpperCase() && active === 'yes') {
      const em = (rData[i][3] || '').toString().trim().toLowerCase();   // col D
      if (em) {
        const t = getFcmToken_(em);
        if (t) tokens.push(t);
      }
    }
  }
  return tokens;
}

function getFcmTokensByPositionCode_(code) {
  const roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!roster) return [];
  const rData  = roster.getDataRange().getValues();
  const tokens = [];
  for (let i = 1; i < rData.length; i++) {
    const pos    = (rData[i][0] || '').toString().trim();               // col A (role code)
    const active = (rData[i][7] || '').toString().trim().toLowerCase(); // col H
    if (pos.includes(code) && active === 'yes') {
      const em = (rData[i][3] || '').toString().trim().toLowerCase();   // col D
      if (em) {
        const t = getFcmToken_(em);
        if (t) tokens.push(t);
      }
    }
  }
  return tokens;
}

function getFcmTokensByBranchAndCode_(branchCode, posCode) {
  const roster = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!roster) return [];
  const rData  = roster.getDataRange().getValues();
  const tokens = [];
  for (let i = 1; i < rData.length; i++) {
    const bc     = (rData[i][5] || '').toString().trim().toUpperCase(); // col F
    const pos    = (rData[i][0] || '').toString().trim();               // col A (role code)
    const active = (rData[i][7] || '').toString().trim().toLowerCase(); // col H
    if (bc === branchCode.toUpperCase() && pos.includes(posCode) && active === 'yes') {
      const em = (rData[i][3] || '').toString().trim().toLowerCase();   // col D
      if (em) {
        const t = getFcmToken_(em);
        if (t) tokens.push(t);
      }
    }
  }
  return tokens;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  FCM SEND (HTTP v1 API via service account)
//  Set FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT in Script Properties.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function getFcmAccessToken_() {
  const props  = PropertiesService.getScriptProperties();
  const saJson = props.getProperty('FCM_SERVICE_ACCOUNT');
  if (!saJson) { console.warn('FCM_SERVICE_ACCOUNT not set in Script Properties'); return null; }
  const sa  = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
  const claim  = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  })).replace(/=+$/, '');

  const unsigned  = header + '.' + claim;
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, sa.private_key)
  ).replace(/=+$/, '');

  const tokenRes = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method:             'POST',
    contentType:        'application/x-www-form-urlencoded',
    payload:            'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + signature,
    muteHttpExceptions: true
  });
  return JSON.parse(tokenRes.getContentText()).access_token || null;
}

function sendPush_(token, title, body) {
  if (!token) return;
  const projectId   = PropertiesService.getScriptProperties().getProperty('FCM_PROJECT_ID');
  if (!projectId)   { console.warn('FCM_PROJECT_ID not set'); return; }
  const accessToken = getFcmAccessToken_();
  if (!accessToken) return;
  UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
    method:             'POST',
    contentType:        'application/json',
    headers:            { Authorization: 'Bearer ' + accessToken },
    payload:            JSON.stringify({ message: { token, notification: { title, body } } }),
    muteHttpExceptions: true
  });
}

function sendPushToMany_(tokens, title, body) {
  if (!tokens || !tokens.length) return;
  const projectId   = PropertiesService.getScriptProperties().getProperty('FCM_PROJECT_ID');
  if (!projectId)   return;
  const accessToken = getFcmAccessToken_();
  if (!accessToken) return;
  const url     = 'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send';
  const headers = { Authorization: 'Bearer ' + accessToken };
  tokens.forEach(function(t) {
    try {
      UrlFetchApp.fetch(url, {
        method:             'POST',
        contentType:        'application/json',
        headers:            headers,
        payload:            JSON.stringify({ message: { token: t, notification: { title, body } } }),
        muteHttpExceptions: true
      });
    } catch(e) { console.warn('sendPushToMany_ token failed:', e.message); }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  MEETING CONFIG
//  Sheet "Meeting Config" in ROSTER_SS_ID: Key | Value rows
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function getMeetingConfigSheet_() {
  const ss = SpreadsheetApp.openById(ROSTER_SS_ID);
  let sheet = ss.getSheetByName('Meeting Config');
  if (!sheet) {
    sheet = ss.insertSheet('Meeting Config');
    sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    [['meetingDay','1'],['meetingTime','17:00'],
     ['cancel_A','No'],['cancel_H','No'],['cancel_W','No'],['cancel_S','No'],['cancel_M','No'],
     ['meetingDay_A','1'],['meetingTime_A','17:00'],
     ['meetingDay_H','1'],['meetingTime_H','17:00'],
     ['meetingDay_W','1'],['meetingTime_W','17:00'],
     ['meetingDay_S','1'],['meetingTime_S','17:00'],
     ['meetingDay_M','1'],['meetingTime_M','17:00']]
     .forEach(function(row) { sheet.appendRow(row); });
  }
  return sheet;
}

function getMeetingConfig_() {
  const sheet  = getMeetingConfigSheet_();
  const data   = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) config[String(data[i][0])] = String(data[i][1] || '');
  }
  return config;
}

function setMeetingConfigKey_(key, value) {
  const sheet = getMeetingConfigSheet_();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

// Hourly trigger: fires every hour, sends push 4 hours before meeting time on meeting day.
// Run setupMeetingTrigger() once from the Apps Script editor to install.
function checkMeetingNotifications() {
  const config = getMeetingConfig_();
  const tz     = Session.getScriptTimeZone();
  const now    = new Date();
  const nowDay = now.getDay();
  const nowH   = parseInt(Utilities.formatDate(now, tz, 'H'));
  const nowM   = parseInt(Utilities.formatDate(now, tz, 'm'));
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // Iterate the dynamic Branches sheet so branches added later (e.g. UMass
  // Amherst, Northborough) get meeting reminders without a code change.
  getBranches_().forEach(function(b) {
    const bc = b.code;
    const meetingDay  = parseInt(config['meetingDay_'  + bc] || config.meetingDay  || '1');
    const meetingTime = config['meetingTime_' + bc] || config.meetingTime || '17:00';
    const parts   = meetingTime.split(':');
    const meetH   = parseInt(parts[0]);
    const meetM   = parseInt(parts[1] || '0');
    // Reminder fires 4h before the meeting. For meetings before 4:00 AM the
    // notify slot rolls back to the previous day (a plain meetH-4 goes
    // negative and would never match nowH, silently skipping the reminder).
    let notifyDay = meetingDay;
    let notifyH   = meetH - 4;
    if (notifyH < 0) {
      notifyH  += 24;
      notifyDay = (meetingDay + 6) % 7;
    }

    if (nowDay !== notifyDay) return;
    if (nowH !== notifyH || nowM > 9) return;

    const tokens = getFcmTokensByBranch_(bc);
    if (!tokens.length) return;

    const cancelled = (config['cancel_' + bc] || 'No').toLowerCase() === 'yes';
    if (cancelled) {
      sendPushToMany_(tokens, 'No Meeting This Week',
        'Reminder: we will NOT be meeting this ' + days[meetingDay] + '. See you next week!');
    } else {
      const hour12  = meetH % 12 || 12;
      const ampm    = meetH < 12 ? 'AM' : 'PM';
      const timeStr = hour12 + ':' + String(meetM).padStart(2,'0') + ' ' + ampm;
      sendPushToMany_(tokens, 'Meeting Today!',
        'Branch meeting is today at ' + timeStr + '. See you there!');
    }
    setMeetingConfigKey_('cancel_' + bc, 'No');
  });
}

function setupMeetingTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'checkMeetingNotifications'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkMeetingNotifications').timeBased().everyHours(1).create();
  Logger.log('Meeting notification trigger installed (hourly).');
  setupTaskDueTrigger();
}

function setupAllTriggers() {
  setupMeetingTrigger();
}

// ── Branch Management ─────────────────────────────────────────────────────────

function getBranchesSheet_() {
  const ss = SpreadsheetApp.openById(ROSTER_SS_ID);
  let sheet = ss.getSheetByName('Branches');
  if (!sheet) {
    sheet = ss.insertSheet('Branches');
    sheet.getRange(1, 1, 1, 2).setValues([['Code', 'Name']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    Object.entries(BRANCH_NAMES).forEach(function([code, name]) {
      sheet.appendRow([code, name]);
    });
  }
  return sheet;
}

function getBranches_() {
  const sheet = getBranchesSheet_();
  const data  = sheet.getDataRange().getValues();
  const branches = [];
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][0] || '').trim().toUpperCase();
    const name = String(data[i][1] || '').trim();
    if (code && name) branches.push({ code, name });
  }
  return branches;
}

// Resolve a branch NAME to its code, hardcoded map first then the Branches
// sheet, so branches added later (e.g. UMass Amherst) resolve correctly.
function resolveBranchCode_(name) {
  name = String(name || '').trim();
  if (!name) return '';
  if (BRANCH_CODES[name]) return BRANCH_CODES[name];
  const hit = getBranches_().find(function(b) {
    return b.name.toLowerCase() === name.toLowerCase();
  });
  return hit ? hit.code : '';
}

// Resolve a branch CODE to its display name, hardcoded map first then the sheet.
function resolveBranchName_(code) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return '';
  if (code === TEMP_BRANCH_CODE) return TEMP_BRANCH_NAME;
  if (BRANCH_NAMES[code]) return BRANCH_NAMES[code];
  const hit = getBranches_().find(function(b) { return b.code === code; });
  return hit ? hit.name : code;
}

// Returns a Drive folder ID for a branch's profile photos. Hardcoded branches
// keep their configured folder; any other branch gets a folder created once and
// remembered in Script Properties — no manual setup or extra sheet columns.
function getBranchPhotoFolderId_(code, name) {
  const cfg = BRANCH_CONFIG[name];
  if (cfg && cfg.folderId) return cfg.folderId;

  const propKey = 'photoFolderId_' + code;
  const props   = PropertiesService.getScriptProperties();
  const stored  = props.getProperty(propKey);
  if (stored) {
    try { DriveApp.getFolderById(stored); return stored; } catch (e) { /* stale — recreate */ }
  }

  // Create the new folder alongside an existing branch folder when possible,
  // otherwise at the Drive root.
  let parent = null;
  try {
    const sampleId = (Object.values(BRANCH_CONFIG)[0] || {}).folderId;
    if (sampleId) {
      const parents = DriveApp.getFolderById(sampleId).getParents();
      if (parents.hasNext()) parent = parents.next();
    }
  } catch (e) { /* fall back to root */ }

  const folder = (parent || DriveApp.getRootFolder())
    .createFolder(name + ' — Volunteer Photos');
  props.setProperty(propKey, folder.getId());
  return folder.getId();
}

function isOfficerCode_(code) {
  if (!code) return false;
  return /^[AZP]$/.test(code) || /O$/.test(code);
}

function getBranchManagement() {
  try {
    const branches = getBranches_();
    const config   = getMeetingConfig_();

    // Raised totals by branch from donations sheet
    const donSheet = SpreadsheetApp.openById(DONATIONS_SS_ID).getSheetByName('Sheet1');
    const raisedByBranch = {};
    if (donSheet) {
      const dlast = donSheet.getLastRow();
      if (dlast > 1) {
        const ddata = donSheet.getRange(2, 1, dlast - 1, 7).getValues();
        ddata.forEach(function(row) {
          const bc  = String(row[5] || '').trim().toUpperCase();
          const amt = Number(row[1] || 0);
          if (bc) raisedByBranch[bc] = (raisedByBranch[bc] || 0) + amt;
        });
      }
    }

    // Leadership by branch: only officers (A, Z, P, or any code ending in O e.g. WO, SO, FO, CO)
    const rosterSheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    const leadersByBranch = {};
    if (rosterSheet) {
      const rdata = rosterSheet.getDataRange().getValues();
      for (let i = 1; i < rdata.length; i++) {
        const roleCode = String(rdata[i][0] || '').trim();
        const name     = String(rdata[i][1] || '').trim();
        const email    = String(rdata[i][3] || '').trim().toLowerCase();
        const bc       = String(rdata[i][5] || '').trim().toUpperCase();
        if (isOfficerCode_(roleCode) && name && email && bc) {
          if (!leadersByBranch[bc]) leadersByBranch[bc] = [];
          leadersByBranch[bc].push({ name, email, roleCode });
        }
      }
    }

    const result = branches.map(function(b) {
      const goal = parseFloat(config['goal_' + b.code] || String(BRANCH_GOAL_TARGET)) || BRANCH_GOAL_TARGET;
      return {
        code:       b.code,
        name:       b.name,
        meetingDay: config['meetingDay_'  + b.code] || '1',
        meetingTime:config['meetingTime_' + b.code] || '17:00',
        cancelled:  (config['cancel_' + b.code] || 'No').toLowerCase() === 'yes',
        goal:       goal,
        raised:     Math.round((raisedByBranch[b.code] || 0) * 100) / 100,
        leadership: leadersByBranch[b.code] || []
      };
    });

    // Pending new-branch requests (shown to coordinators in the panel).
    let branchRequests = [];
    try {
      branchRequests = getBranchRequests_().filter(function(r) { return r.status === 'Pending'; });
    } catch (reqErr) { /* non-fatal — panel still renders branches */ }

    return { branches: result, branchRequests: branchRequests };
  } catch (err) {
    return { error: err.message };
  }
}

function addBranch_(code, name) {
  code = String(code || '').trim().toUpperCase();
  name = String(name || '').trim();
  if (!code || !name) return { error: 'Code and name required' };
  if (code.length > 3) return { error: 'Branch code must be 1-3 characters' };

  const existing = getBranches_();
  if (existing.find(function(b) { return b.code === code; })) {
    return { error: 'Branch code already exists' };
  }

  getBranchesSheet_().appendRow([code, name]);
  setMeetingConfigKey_('meetingDay_'  + code, '1');
  setMeetingConfigKey_('meetingTime_' + code, '17:00');
  setMeetingConfigKey_('cancel_'      + code, 'No');
  setMeetingConfigKey_('goal_'        + code, String(BRANCH_GOAL_TARGET));

  return { ok: true };
}

function setBranchLeaderRole_(email, roleCode) {
  email    = String(email    || '').trim().toLowerCase();
  roleCode = String(roleCode || '').trim();
  if (!email) return { error: 'Email required' };

  const sheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
  if (!sheet) return { error: 'Roster sheet not found' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][3] || '').trim().toLowerCase();
    if (rowEmail === email) {
      sheet.getRange(i + 1, 1).setValue(roleCode);
      return { ok: true };
    }
  }
  return { error: 'Member not found in roster' };
}

// ── Compensation / Reimbursement Requests ─────────────────────────────────────
// Sheet "Comp Requests" in ROSTER_SS_ID
// Columns: A=ID | B=Name | C=Email | D=Branch | E=Amount | F=Description
//          G=PayMethod | H=PayHandle | I=ImageUrl | J=Status | K=SubmittedAt

function getCompSheet_() {
  const ss = SpreadsheetApp.openById(ROSTER_SS_ID);
  let sheet = ss.getSheetByName('Comp Requests');
  if (!sheet) {
    sheet = ss.insertSheet('Comp Requests');
    const headers = ['ID','Name','Email','Branch','Amount','Description','PayMethod','PayHandle','ImageUrl','Status','SubmittedAt'];
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers]).setFontWeight('bold')
         .setBackground('#1A1311').setFontColor('#F9F6F0');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(6, 220);
    sheet.setColumnWidth(9, 280);
    sheet.setColumnWidth(11, 160);
  }
  return sheet;
}

function submitCompRequest_(email, amount, description, payMethod, payHandle, imageBase64, imageMime) {
  try {
    const memberInfo = getMemberInfo(email);
    const branchCode = memberInfo.branchCode || '';

    // Resolve full name from roster
    const rosterSheet = SpreadsheetApp.openById(ROSTER_SS_ID).getSheetByName('Roster');
    let fullName = memberInfo.firstName || email;
    if (rosterSheet) {
      const rData = rosterSheet.getDataRange().getValues();
      const lc    = email.toLowerCase().trim();
      for (let i = 1; i < rData.length; i++) {
        if ((rData[i][3] || '').toString().toLowerCase().trim() === lc) {
          fullName = (rData[i][1] || '').toString().trim() || fullName;
          break;
        }
      }
    }

    // Upload bill image to branch Drive folder
    let imageUrl = '';
    if (imageBase64 && imageMime) {
      try {
        const branchName = BRANCH_NAMES[branchCode] || '';
        const config = BRANCH_CONFIG[branchName] || Object.values(BRANCH_CONFIG)[0];
        const folderId = config ? config.folderId : '17glZEMCfE7L65RVuSglffhaUEGxzTqTe';
        const blob = Utilities.newBlob(
          Utilities.base64Decode(imageBase64), imageMime,
          'receipt_' + email + '_' + Date.now()
        );
        const file = DriveApp.getFolderById(folderId).createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
      } catch (imgErr) {
        console.warn('Receipt image upload failed:', imgErr.message);
      }
    }

    const id    = 'cr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const sheet = getCompSheet_();
    sheet.appendRow([
      id, fullName, email.toLowerCase().trim(), branchCode,
      parseFloat(amount) || 0, description || '',
      payMethod || 'Cash', payHandle || '',
      imageUrl, 'Pending', new Date()
    ]);

    // Notify A, Z, and FO officers
    try {
      const aTokens  = getFcmTokensByPositionCode_('A');
      const zTokens  = getFcmTokensByPositionCode_('Z');
      const foTokens = getFcmTokensByPositionCode_('FO');
      const seen = {};
      const allTokens = [...aTokens, ...zTokens, ...foTokens].filter(function(t) {
        if (seen[t]) return false; seen[t] = true; return true;
      });
      if (allTokens.length) {
        sendPushToMany_(allTokens, 'Reimbursement Request',
          fullName + ' submitted a $' + (parseFloat(amount) || 0).toFixed(2) + ' expense request.');
      }
    } catch(pushErr) { console.warn('Push failed (submitCompRequest):', pushErr.message); }

    return { success: true, id };
  } catch (err) {
    return { error: err.message };
  }
}

function getCompRequests_() {
  try {
    const sheet = getCompSheet_();
    const last  = sheet.getLastRow();
    if (last < 2) return { requests: [] };
    const data = sheet.getRange(2, 1, last - 1, 11).getValues();
    const requests = data
      .filter(function(row) { return row[0]; })
      .map(function(row) {
        return {
          id:          String(row[0]),
          name:        String(row[1]),
          email:       String(row[2]),
          branch:      String(row[3]),
          amount:      parseFloat(row[4]) || 0,
          description: String(row[5]),
          payMethod:   String(row[6]),
          payHandle:   String(row[7]),
          imageUrl:    String(row[8]),
          status:      String(row[9]),
          submittedAt: row[10] instanceof Date
            ? Utilities.formatDate(row[10], Session.getScriptTimeZone(), 'MM/dd/yyyy')
            : String(row[10])
        };
      });
    return { requests };
  } catch (err) {
    return { error: err.message };
  }
}

function getMyCompRequests_(email) {
  try {
    const sheet = getCompSheet_();
    const last  = sheet.getLastRow();
    if (last < 2) return { requests: [] };
    const data  = sheet.getRange(2, 1, last - 1, 11).getValues();
    const lc    = email.toLowerCase().trim();
    const requests = data
      .filter(function(row) { return row[0] && String(row[2]).toLowerCase().trim() === lc; })
      .map(function(row) {
        return {
          id:          String(row[0]),
          amount:      parseFloat(row[4]) || 0,
          description: String(row[5]),
          payMethod:   String(row[6]),
          payHandle:   String(row[7]),
          imageUrl:    String(row[8]),
          status:      String(row[9]),
          submittedAt: row[10] instanceof Date
            ? Utilities.formatDate(row[10], Session.getScriptTimeZone(), 'MM/dd/yyyy')
            : String(row[10])
        };
      });
    return { requests };
  } catch (err) {
    return { error: err.message };
  }
}

function approveCompRequest_(id) {
  try {
    const sheet = getCompSheet_();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 10).setValue('Approved');
        const volEmail = String(data[i][2]);
        const amount   = parseFloat(data[i][4]) || 0;
        const method   = String(data[i][6]);
        try {
          const token = getFcmToken_(volEmail);
          if (token) sendPush_(token, 'Reimbursement Approved!',
            'Your $' + amount.toFixed(2) + ' expense request has been approved. Payment via ' + method + '.');
        } catch(e) { console.warn('Push failed (approveComp):', e.message); }
        return { success: true };
      }
    }
    return { error: 'Request not found' };
  } catch (err) {
    return { error: err.message };
  }
}

function denyCompRequest_(id) {
  try {
    const sheet = getCompSheet_();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 10).setValue('Denied');
        const volEmail = String(data[i][2]);
        const amount   = parseFloat(data[i][4]) || 0;
        try {
          const token = getFcmToken_(volEmail);
          if (token) sendPush_(token, 'Reimbursement Update',
            'Your $' + amount.toFixed(2) + ' expense request was not approved. Contact your branch officer for details.');
        } catch(e) { console.warn('Push failed (denyComp):', e.message); }
        return { success: true };
      }
    }
    return { error: 'Request not found' };
  } catch (err) {
    return { error: err.message };
  }
}

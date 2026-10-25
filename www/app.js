// app.js v9
console.log("App.js v9 loaded!");

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec";

let volunteerEmail = null;
let volunteerName  = null;
let branchLetter   = null;
let branchName     = null;

// ===== PRIVATE DRIVE IMAGES =====
// Profile photos and receipts live in a private Drive folder, so they can't be
// loaded by their Drive URL. Pull the bytes from the getImage proxy (the server
// runs as the folder owner) and hand back a data: URL.
function driveImgId(idOrUrl) {
  const s = (idOrUrl || '').toString();
  if (!s) return '';
  const m = s.match(/[-\w]{25,}/); // a bare id, or the id inside a Drive URL
  return m ? m[0] : '';
}

async function fetchDriveImage(idOrUrl) {
  const id = driveImgId(idOrUrl);
  if (!id) return '';
  try {
    const body = 'action=getImage&id=' + encodeURIComponent(id) +
      '&actorEmail=' + encodeURIComponent(volunteerEmail || '');
    const res  = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    return data && data.dataUrl ? data.dataUrl : '';
  } catch (e) { return ''; }
}

// Set an <img>'s src from a private Drive id/URL. Leaves the element untouched
// (so any onerror placeholder can fire) when the image can't be loaded.
async function loadDriveImage(imgEl, idOrUrl) {
  if (!imgEl) return;
  const dataUrl = await fetchDriveImage(idOrUrl);
  if (dataUrl) imgEl.src = dataUrl;
  else imgEl.dispatchEvent(new Event('error'));
}
window.driveImgId     = driveImgId;
window.fetchDriveImage = fetchDriveImage;
window.loadDriveImage = loadDriveImage;

// ===== THEME TOGGLE =====
function toggleTheme() {
  const html = document.documentElement;
  const current = html.dataset.theme;
  // If explicitly dark → go light; if explicitly light or system → go dark
  // We detect "effective" mode by checking the computed bg
  const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const effectivelyLight = current === 'light' || (!current && systemLight);
  if (effectivelyLight) {
    html.dataset.theme = 'dark';
    localStorage.setItem('afu-theme', 'dark');
  } else {
    html.dataset.theme = 'light';
    localStorage.setItem('afu-theme', 'light');
  }
  syncStatusBar();
}

// Keep the iOS status bar (clock, battery) readable: light text on the dark
// theme, dark text on the light theme. Capacitor's 'DARK' style = light text.
function syncStatusBar() {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { StatusBar } = window.Capacitor.Plugins;
  if (!StatusBar) return;
  const t = document.documentElement.dataset.theme;
  const dark = t === 'dark' || (!t && !window.matchMedia('(prefers-color-scheme: light)').matches);
  StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
}
window.syncStatusBar = syncStatusBar;
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncStatusBar);

// ===== HAPTICS =====
function haptic(type = 'medium') {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { Haptics, ImpactStyle, NotificationType } = window.Capacitor.Plugins;
  if (!Haptics) return;
  if (type === 'success' || type === 'error' || type === 'warning') {
    Haptics.notification({ type: type.toUpperCase() });
  } else {
    Haptics.impact({ style: type.toUpperCase() });
  }
}

// ===== JWT PARSE =====
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// ===== HTML ESCAPE (sanitize untrusted strings before innerHTML) =====
// Turns HTML-significant chars into entities so spreadsheet/user-supplied
// values (event names, task titles, push text) render as literal text and
// can never inject markup or scripts.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ===== REGISTRATION IDENTITY PREFILL =====
// App Review Guideline 4: when the sign-in provider (Apple / Google) already
// supplied the user's name and email, the registration form must not ask for
// them again. Fill the inputs, hide the covered fields, and show a read-only
// identity summary instead. Fields the provider did NOT supply stay visible.
function prefillRegistrationIdentity(fname, lname, email) {
  fname = (fname || '').trim();
  lname = (lname || '').trim();
  email = (email || '').trim();

  document.getElementById('regFname').value = fname;
  document.getElementById('regLname').value = lname;
  const emailInput = document.getElementById('regEmail');
  emailInput.value = email;
  emailInput.readOnly = !!email; // editable only if the provider didn't return one

  const haveName  = !!(fname && lname);
  const haveEmail = !!email;

  document.getElementById('regNameRow').classList.toggle('hidden', haveName);
  document.getElementById('regEmailGroup').classList.toggle('hidden', haveEmail);

  const idEl = document.getElementById('regIdentity');
  if (haveName || haveEmail) {
    idEl.innerHTML =
      (haveName ? `<div style="font-weight:800;font-size:0.95rem;">${escHtml(fname + ' ' + lname)}</div>` : '') +
      (haveEmail ? `<div style="font-size:0.82rem;color: #6B6B6B;overflow-wrap:anywhere;">${escHtml(email)}</div>` : '');
    idEl.classList.remove('hidden');
  } else {
    idEl.innerHTML = '';
    idEl.classList.add('hidden');
  }

  document.getElementById('regDesc').textContent = (haveName && haveEmail)
    ? "Your account isn't on the roster yet. Choose your branch to finish — your Branch President will approve your profile."
    : "Your account isn't on the roster yet. Fill in your details — your Branch President will approve your profile.";
}

// ===== SIGN-IN HANDLER =====
// ===== REVIEWER / DEMO SIGN-IN =====
// Reviewer access: the "Reviewer demo access" button was removed. Registration
// now auto-approves into the full app, so App Review signs in with Sign in with
// Apple (which has no Google location block), registers, and can test account
// deletion on their own account — no shared demo login needed.

window.onSignedIn = async function (preloadedPayload = null) {
  console.log("onSignedIn called!");

  const payload = preloadedPayload || parseJwt(window.googleCredential || "");
  if (!payload || !payload.email) {
    showToast("Could not read your Google account. Please try again.", 'error');
    return;
  }

  volunteerEmail = payload.email;

  const body = `lookupEmail=${encodeURIComponent(volunteerEmail)}`;
  console.log("Sending lookup request");

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    console.log("Response status:", res.status);
    const responseText = await res.text();

    const info = JSON.parse(responseText);

    if (info.removed) {
      await clearStoredAuth();
      showError(info.error);
      return;
    }

    // Registered but not approved yet (or waiting on a new-branch request)
    if (info.pending || info.branchCode === "NEW") {
      await enterPendingMode({
        firstName: info.firstName || payload.given_name || '',
        fullName: info.fullName || '',
        branchName: info.pending ? info.branchName : '',
        email: volunteerEmail,
        newBranch: info.branchCode === "NEW"
      }, payload);
      return;
    }

    if (!info.firstName || info.firstName === "User" || !info.branchCode || info.branchCode === "X") {
      console.log("User not found — showing registration form");
      // Pre-fill from the JWT we already have; hides name/email fields
      // the provider already supplied (Guideline 4)
      prefillRegistrationIdentity(payload.given_name, payload.family_name, volunteerEmail);
      document.getElementById("authScreen").classList.add("hidden");
      document.getElementById("registerCard").classList.remove("hidden");
      loadBranchOptions();
      return;
    }

    volunteerName = info.firstName;
    branchLetter  = info.branchCode;
    branchName    = info.branchName;


    // Expose profile so the dashboard stub can read it
    window.volunteerProfile = {
      firstName: volunteerName,
      fullName: info.fullName || volunteerName,
      branchName,
      branchCode: branchLetter,
      email: volunteerEmail,
      photoUrl: info.photoUrl || payload.picture || null,
      hasRosterPhoto: !!info.photoUrl,   // false → prompt to add a photo on Home
      position: info.position || '',
    };
    // Admin tab is only useful to A/Z/P/C — hide the nav button from everyone else.
    document.getElementById('navAdmin').classList.toggle('hidden', !/[AZPC]/.test(info.position || ''));

    await storeAuthForBiometric(payload);
    registerPushNotifications();   // silent; only if already granted

    // Wire loadDashboard to pull real stats + activity once data is ready
    window.loadDashboard = async function() {
      document.getElementById('dashName').textContent = volunteerName;
      document.getElementById('dashBranch').textContent = branchName + ' Branch';
      // Roster photo lives in private Drive → proxy; Google picture is a public URL.
      if (info.photoUrl) loadDriveImage(document.getElementById('dashAvatar'), info.photoUrl);
      else if (payload.picture) document.getElementById('dashAvatar').src = payload.picture;

      // Fetch stats from the Apps Script
      try {
        const statsRes = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `getDashboard=${encodeURIComponent(volunteerEmail)}&branch=${encodeURIComponent(branchLetter)}`
        });
        const stats = JSON.parse(await statsRes.text());

        if (stats.hoursApproved != null)
          document.getElementById('dashHours').textContent = stats.hoursApproved;

        if (stats.goalRaised != null && stats.goalTarget != null) {
          const pct = stats.goalTarget > 0 ? Math.round(stats.goalRaised / stats.goalTarget * 100) : 0;
          document.getElementById('dashGoalRaised').textContent = '$' + stats.goalRaised.toLocaleString();
          document.getElementById('dashGoalOf').textContent = pct + '% of $' + stats.goalTarget.toLocaleString();
          document.getElementById('dashGoalBar').style.width = Math.min(100, pct) + '%';
        }

        if (Array.isArray(stats.recentActivity) && stats.recentActivity.length > 0) {
          const feed = document.getElementById('dashActivity');
          feed.innerHTML = stats.recentActivity.map(item => `
            <div class="activity-row">
              <div class="activity-dot"></div>
              <div class="activity-text">${escHtml(item.text)}</div>
              ${item.time ? `<div class="activity-time">${escHtml(item.time)}</div>` : ''}
            </div>
          `).join('');
        }
      } catch (e) {
        console.warn('Dashboard stats unavailable:', e);
      }
    };

    document.getElementById("authScreen").classList.add("hidden");
    document.getElementById("appContent").classList.remove("hidden");
    document.getElementById("mainNav").classList.remove("hidden");

    loadSlipBranchOptions();

    switchTab('home');
    maybeShowWelcome();

    await syncDonations();
    await loadEventTypes();

  } catch (err) {
    console.error("Error during lookup:", err);
    showError(NETWORK_ERROR_MSG);
  }
};

window.onAppleSignedIn = async function(sub, email, givenName, familyName, authorizationCode, identityToken) {
  if (!sub) { showToast('Apple sign-in did not return a user ID. Please try again.', 'error'); return; }
  // The server verifies the login by exchanging authorizationCode with Apple, so
  // that code is required (identityToken is no longer used).
  if (!authorizationCode) { showToast('Apple sign-in did not return an authorization code. Please try again.', 'error'); return; }

  // Apple only hands out the authorizationCode once per sign-in. Forward it so
  // the server can exchange it for a refresh token and revoke it on account
  // deletion (Guideline 5.1.1(v)). Stash it for the registration path too, in
  // case this is a first login that isn't on the roster yet.
  window._pendingAppleAuthCode = authorizationCode || '';

  try {
    // The server exchanges authorizationCode with Apple and derives sub/email
    // from the returned id_token — raw sub/email are no longer trusted (they let
    // anyone claim another account).
    const body = `action=appleSignIn&authorizationCode=${encodeURIComponent(authorizationCode)}`;
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const info = JSON.parse(await res.text());

    if (info.removed) {
      await clearStoredAuth();
      showError(info.error);
      return;
    }

    if (info.pending || info.branchCode === 'NEW') {
      const pendingEmail = info.email || email || '';
      await enterPendingMode({
        firstName: info.firstName || givenName || '',
        fullName: info.fullName || '',
        branchName: info.pending ? info.branchName : '',
        email: pendingEmail,
        newBranch: info.branchCode === 'NEW'
      }, { email: pendingEmail, given_name: givenName || '', family_name: familyName || '', picture: '' });
      return;
    }

    if (info.error || !info.firstName || info.firstName === 'User' || !info.branchCode || info.branchCode === 'X') {
      volunteerEmail = email || '';
      window._pendingAppleSub = sub;
      // Apple's Authentication Services already provided name/email (cached
      // per-sub for repeat sign-ins) — never ask for them again (Guideline 4)
      prefillRegistrationIdentity(givenName, familyName, email);
      document.getElementById('authScreen').classList.add('hidden');
      document.getElementById('registerCard').classList.remove('hidden');
      loadBranchOptions();
      return;
    }

    volunteerEmail = info.email || email || '';
    volunteerName  = info.firstName;
    branchLetter   = info.branchCode;
    branchName     = info.branchName;

    window.volunteerProfile = {
      firstName: volunteerName,
      fullName: info.fullName || volunteerName,
      branchName,
      branchCode: branchLetter,
      email: volunteerEmail,
      photoUrl: info.photoUrl || null,
      hasRosterPhoto: !!info.photoUrl,   // false → prompt to add a photo on Home
      position: info.position || '',
    };
    // Admin tab is only useful to A/Z/P/C — hide the nav button from everyone else.
    document.getElementById('navAdmin').classList.toggle('hidden', !/[AZPC]/.test(info.position || ''));

    await storeAuthForBiometric({ email: volunteerEmail, given_name: givenName || '', family_name: familyName || '', picture: '' });
    registerPushNotifications();   // silent; only if already granted

    window.loadDashboard = async function() {
      document.getElementById('dashName').textContent = volunteerName;
      document.getElementById('dashBranch').textContent = branchName + ' Branch';
      if (info.photoUrl) loadDriveImage(document.getElementById('dashAvatar'), info.photoUrl);

      try {
        const statsRes = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `getDashboard=${encodeURIComponent(volunteerEmail)}&branch=${encodeURIComponent(branchLetter)}`
        });
        const stats = JSON.parse(await statsRes.text());
        if (stats.hoursApproved != null)
          document.getElementById('dashHours').textContent = stats.hoursApproved;
        if (stats.goalRaised != null && stats.goalTarget != null) {
          const pct = stats.goalTarget > 0 ? Math.round(stats.goalRaised / stats.goalTarget * 100) : 0;
          document.getElementById('dashGoalRaised').textContent = '$' + stats.goalRaised.toLocaleString();
          document.getElementById('dashGoalOf').textContent = pct + '% of $' + stats.goalTarget.toLocaleString();
          document.getElementById('dashGoalBar').style.width = Math.min(100, pct) + '%';
        }
        if (Array.isArray(stats.recentActivity) && stats.recentActivity.length > 0) {
          const feed = document.getElementById('dashActivity');
          feed.innerHTML = stats.recentActivity.map(item => `
            <div class="activity-row">
              <div class="activity-dot"></div>
              <div class="activity-text">${escHtml(item.text)}</div>
              ${item.time ? `<div class="activity-time">${escHtml(item.time)}</div>` : ''}
            </div>
          `).join('');
        }
      } catch (e) { console.warn('Dashboard stats unavailable:', e); }
    };

    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    document.getElementById('mainNav').classList.remove('hidden');
    loadSlipBranchOptions();

    switchTab('home');
    maybeShowWelcome();
    await syncDonations();
    await loadEventTypes();

  } catch (err) {
    console.error('Apple sign-in error:', err);
    showError(NETWORK_ERROR_MSG);
  }
};

// ===== INDEXEDDB =====
let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("AFU_DB", 1);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("donations")) {
        db.createObjectStore("donations", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
  return dbPromise;
}

async function saveDonationOffline(record) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readwrite");
    tx.objectStore("donations").add(record);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function getUnsyncedDonations() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("donations", "readonly");
    const req = tx.objectStore("donations").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function deleteDonation(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readwrite");
    tx.objectStore("donations").delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// ===== SYNC ENGINE =====
// Returns the list of UDIs the server rejected as duplicates so callers can
// tell the volunteer instead of silently showing success (the offline record
// is still dropped either way — the donation already exists on the sheet).
async function syncDonations() {
  const duplicates = [];
  if (!navigator.onLine) return duplicates;
  const pending = await getUnsyncedDonations();

  for (const rec of pending) {
    try {
      const body = Object.entries(rec)
        .filter(([k]) => k !== 'id')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const res  = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const json = await res.json();

      if (json.success || json.error === "UDI exists") {
        if (json.error === "UDI exists") duplicates.push(rec.udi);
        await deleteDonation(rec.id);
      }
    } catch (err) {
      console.error('Donation sync failed, will retry on next connection:', err);
      break;
    }
  }
  return duplicates;
}

window.addEventListener('online', syncDonations);

// ===== DONATION UI =====
function submitDonation() {
  if (!volunteerEmail) { showToast("Please sign in first.", 'error'); return; }
  // UDIs are prefixed with the branch letter — pending volunteers don't have one yet
  if (!branchLetter) { showToast("Recording donations unlocks once your Branch President approves your profile.", 'error'); return; }

  const digits    = parseInt(document.getElementById("udiDigits").value);
  const amount    = document.getElementById("amount").value;

  if (!digits || digits < 1 || digits > 999) {
    showToast("UDI digits must be between 1–999", 'error');
    return;
  }
  if (!amount || amount <= 0) {
    showToast("Enter a valid donation amount.", 'error');
    return;
  }

  const udi = branchLetter + digits.toString().padStart(3, '0');
  console.log("Creating UDI:", udi);

  const record = {
    udi,
    amount: Number(amount),
    branchLetter,
    volunteerEmail,
    volunteerName,
    timestamp: Date.now()
  };

  saveDonationOffline(record)
    .then(() => syncDonations())
    .then((duplicates) => {
      if (Array.isArray(duplicates) && duplicates.includes(udi)) {
        haptic('error');
        showToast("UDI " + udi + " has already been recorded. Double-check the slip number — no new record was created.", 'error');
        return;
      }
      haptic('success');
      document.getElementById("finalUDI").innerText = udi;
      document.getElementById("step2").classList.add("hidden");
      document.getElementById("step3").classList.remove("hidden");
      if (!navigator.onLine) {
        showToast("Saved offline. It will sync when you’re back online.", 'info');
      }
    })
    .catch(err => {
      haptic('error');
      console.error("Error saving donation:", err);
      showError("Couldn’t save the donation. Try again.", err.message);
    });
}

function restart() {
  document.getElementById("udiDigits").value  = "";
  document.getElementById("amount").value     = "";
  document.getElementById("step3").classList.add("hidden");
  document.getElementById("step2").classList.remove("hidden");
}

// =====================================================
// BARCODE SCANNER
// =====================================================
function loadQRScanner() {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) { resolve(); return; }
    const script = document.createElement('script');
    // Bundled with the app (vendor/) — App Review 2.5.2 forbids downloading
    // executable code at runtime, and a CDN copy wouldn't work offline.
    script.src = 'vendor/html5-qrcode.min.js';
    script.onload  = () => { console.log("html5-qrcode library loaded"); resolve(); };
    script.onerror = () => reject(new Error("Failed to load scanner library"));
    document.head.appendChild(script);
  });
}

let html5QrCode = null;
let isScanning  = false;

async function startScan() {
  if (isScanning) return;
  console.log("Starting scanner...");
  const statusEl = document.getElementById('scanStatus');
  statusEl.textContent = "Loading camera...";

  try {
    await loadQRScanner();
    document.getElementById('cameraModal').classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    isScanning  = true;

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    statusEl.textContent = "Position barcode in the frame...";

    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        console.log("Barcode scanned:", decodedText);
        statusEl.textContent = "✓ Scanned: " + decodedText;
        const digits    = decodedText.replace(/\D/g, '');
        const lastThree = digits.slice(-3);
        console.log("Extracted digits:", lastThree);
        if (lastThree && lastThree.length === 3) {
          haptic('light');
          document.getElementById("udiDigits").value = parseInt(lastThree, 10);
          setTimeout(() => { stopScan(); }, 500);
        } else {
          statusEl.textContent = "Invalid barcode format. Try again...";
        }
      },
      () => {}
    );

    console.log("Scanner started successfully");
  } catch (err) {
    console.error("Scanner error:", err);
    statusEl.textContent = "Camera error: " + err.message;
    isScanning = false;
    setTimeout(() => {
      showToast("Could not start the camera. Allow camera access for AFU in Settings, or type the UDI number instead.", 'error');
      stopScan();
    }, 100);
  }
}

function stopScan() {
  console.log("Stopping scanner...");
  const statusEl = document.getElementById('scanStatus');
  if (html5QrCode && isScanning) {
    html5QrCode.stop()
      .then(() => {
        html5QrCode.clear();
        html5QrCode  = null;
        isScanning   = false;
        document.getElementById('cameraModal').classList.add('hidden');
        statusEl.textContent = "Position barcode in the frame...";
      })
      .catch(err => {
        console.error("Error stopping scanner:", err);
        html5QrCode  = null;
        isScanning   = false;
        document.getElementById('cameraModal').classList.add('hidden');
        statusEl.textContent = "Position barcode in the frame...";
      });
  } else {
    isScanning = false;
    document.getElementById('cameraModal').classList.add('hidden');
    statusEl.textContent = "Position barcode in the frame...";
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachScannerListeners);
} else {
  attachScannerListeners();
}

function attachScannerListeners() {
  const scanBtn  = document.getElementById("scanBtn");
  const closeBtn = document.getElementById("closeScan");
  if (scanBtn)  scanBtn.addEventListener("click",  (e) => { e.preventDefault(); startScan(); });
  if (closeBtn) closeBtn.addEventListener("click", (e) => { e.preventDefault(); stopScan(); });
}

// =====================================================
// UDI SLIP GENERATOR
// =====================================================
function toggleUDIPanel() {
  const toggle = document.getElementById("udiToggle");
  const panel  = document.getElementById("udiPanel");
  if (!toggle || !panel) return;
  const isOpen = panel.classList.contains("open");
  panel.classList.toggle("open",  !isOpen);
  toggle.classList.toggle("open", !isOpen);
}

async function runGenerateSlips() {
  const fundraiser = document.getElementById("udiFundraiser").value;

  if (!fundraiser) { showToast("Please choose a fundraiser.", 'error'); return; }
  const slipBranch = document.getElementById("udiBranchSelect").value || branchLetter;
  if (!slipBranch) { showToast("Please choose a branch.", 'error'); return; }

  const loadingEl  = document.getElementById("udiLoading");
  const resultEl   = document.getElementById("udiResult");
  const errorEl    = document.getElementById("udiError");
  const btn        = document.getElementById("udiGenBtn");
  const barFill    = document.getElementById("udiBarFill");
  const loadingTxt = document.getElementById("udiLoadingText");

  resultEl.style.display  = "none";
  errorEl.style.display   = "none";
  loadingEl.style.display = "block";
  btn.disabled = true;

  barFill.style.width = "0%";
  requestAnimationFrame(() => { barFill.style.width = "100%"; });

  const steps = [
    { text: "Finding next available number…", ms: 4000 },
    { text: "Building your document…",        ms: 5000 },
    { text: "Adding QR codes…",               ms: 4000 },
    { text: "Generating barcodes…",           ms: 5000 },
    { text: "Adding finishing touches…",      ms: 4000 },
    { text: "Finalizing and saving…",         ms: 4000 },
  ];
  let elapsed = 0;
  steps.forEach(s => {
    setTimeout(() => { loadingTxt.textContent = s.text; }, elapsed);
    elapsed += s.ms;
  });

  try {
    const body = [
      `action=generateSlips`,
      `fundraiser=${encodeURIComponent(fundraiser)}`,
      `volunteerName=${encodeURIComponent(volunteerName || '')}`,
      `branchCode=${encodeURIComponent(slipBranch)}`
    ].join("&");

    const res  = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await res.json();

    loadingEl.style.display = "none";
    btn.disabled = false;

    if (data.error) throw new Error(data.error);

    document.getElementById("udiLinks").innerHTML = `
      <a href="${data.docUrl}" target="_blank" rel="noopener">Open Google Doc →</a>
      <a href="${data.pdfUrl}" target="_blank" rel="noopener">Download PDF →</a>
    `;
    resultEl.style.display = "block";

  } catch (err) {
    console.error("UDI generation error:", err);
    loadingEl.style.display = "none";
    btn.disabled = false;
    errorEl.style.display = "block";
    errorEl.innerHTML = '<strong>Error:</strong> ';
    errorEl.appendChild(document.createTextNode(err.message || String(err)));
  }
}

// =====================================================
// VOLUNTEER HOURS TRACKER
// =====================================================
function toggleHoursPanel() {
  // no-op — hours is a full bottom-nav tab
}

async function loadEventTypes() {
  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "action=getEventTypes"
    });
    const data = await res.json();
    const list = document.getElementById("hoursEventList");
    if (!list) return;
    const escAttr = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    if (data.eventTypes && data.eventTypes.length) {
      list.innerHTML = data.eventTypes.map(e => `<option value="${escAttr(e)}"></option>`).join("");
    } else {
      list.innerHTML = "";
    }
  } catch (err) {
    // Non-fatal: volunteers can still type a custom event name.
    console.error("Error loading event types:", err);
  }
}

async function loadMyHours() {
  if (!volunteerEmail) return;

  const listEl  = document.getElementById("hoursHistoryList");
  const totalEl = document.getElementById("hoursTotalBadge");

  listEl.innerHTML  = '<p class="hours-loading">Loading…</p>';
  totalEl.innerHTML = '';

  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=getMyHours&email=${encodeURIComponent(volunteerEmail)}`
    });
    const data    = await res.json();

    if (data.error) {
      const errP = document.createElement('p');
      errP.className = 'hours-error';
      errP.textContent = 'Server error: ' + data.error;
      listEl.innerHTML = '';
      listEl.appendChild(errP);
      return;
    }

    const records = data.records || [];

    if (!records.length) {
      listEl.innerHTML = '<p class="hours-empty">No events logged yet.</p>';
      return;
    }

    // Three-state status: approved / denied / pending (default). Backend writes
    // "Yes" (approved), "Denied", or "No" (pending) into the approval column.
    const hoursState = (v) => {
      const s = String(v == null ? '' : v).trim().toLowerCase();
      if (s === 'yes' || s === 'approved') return 'approved';
      if (s === 'denied') return 'denied';
      return 'pending';
    };

    const approvedTotal = records
      .filter(r => hoursState(r.approved) === 'approved')
      .reduce((sum, r) => sum + Number(r.hours || 0), 0);

    const pendingCount = records.filter(
      r => hoursState(r.approved) === 'pending'
    ).length;

    totalEl.innerHTML = `
      <div class="hours-total-badge">
        <div class="hours-total-num">${approvedTotal}</div>
        <div class="hours-total-label">approved hrs</div>
        ${pendingCount > 0
          ? `<div class="hours-pending-note">${pendingCount} pending approval</div>`
          : ''}
      </div>
    `;

    const sorted = [...records].sort((a, b) => {
      const aApproved = hoursState(a.approved) === "approved";
      const bApproved = hoursState(b.approved) === "approved";
      if (aApproved !== bApproved) return bApproved ? 1 : -1;
      return new Date(b.eventDate) - new Date(a.eventDate);
    });

    const escHours = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const STATUS_META = {
      approved: { cls: 'status-approved', label: '✓ Approved' },
      denied:   { cls: 'status-denied',   label: '✕ Denied' },
      pending:  { cls: 'status-pending',  label: '⏳ Pending' }
    };

    listEl.innerHTML = sorted.map(r => {
      const meta          = STATUS_META[hoursState(r.approved)];
      const formattedDate = r.eventDate
        ? new Date(r.eventDate + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
          })
        : '—';
      return `
        <div class="hours-row">
          <div class="hours-row-left">
            <div class="hours-row-event">${escHours(r.eventName)}</div>
            <div class="hours-row-date">${formattedDate}</div>
            ${r.notes ? `<div class="hours-row-note">${escHours(r.notes)}</div>` : ''}
          </div>
          <div class="hours-row-right">
            <div class="hours-row-amt">${r.hours} hr${Number(r.hours) !== 1 ? 's' : ''}</div>
            <div class="hours-row-status ${meta.cls}">
              ${meta.label}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Error loading hours:", err);
    listEl.innerHTML = '<p class="hours-error">Could not load history. Check your connection.</p>';
  }
}

async function submitHoursRequest() {
  if (!volunteerEmail) { showToast("Please sign in first.", 'error'); return; }

  const eventName = document.getElementById("hoursEvent").value.trim();
  const eventDate = document.getElementById("hoursDate").value;
  const hours     = document.getElementById("hoursAmount").value;
  const notes     = document.getElementById("hoursNotes").value.trim();
  const msgEl     = document.getElementById("hoursSubmitMsg");
  const btn       = document.getElementById("hoursSubmitBtn");

  if (!eventName) { showToast("Please choose or type an event.", 'error'); return; }
  if (!eventDate) { showToast("Please enter the event date.", 'error'); return; }
  if (!hours || Number(hours) <= 0) { showToast("Please enter a valid number of hours.", 'error'); return; }

  btn.disabled    = true;
  btn.textContent = "Submitting…";
  msgEl.style.display = "none";

  const body = [
    `action=submitHours`,
    `email=${encodeURIComponent(volunteerEmail)}`,
    `eventName=${encodeURIComponent(eventName)}`,
    `eventDate=${encodeURIComponent(eventDate)}`,
    `hours=${encodeURIComponent(hours)}`,
    `notes=${encodeURIComponent(notes)}`
  ].join("&");

  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await res.json();

    btn.disabled    = false;
    btn.textContent = "Submit for Approval";

    if (data.success) {
      haptic('success');
      msgEl.className   = "hours-msg hours-msg-success";
      msgEl.textContent = "✓ Submitted! Your coordinator will review it shortly.";
      msgEl.style.display = "block";
      document.getElementById("hoursDate").value   = "";
      document.getElementById("hoursAmount").value = "";
      document.getElementById("hoursNotes").value  = "";
      document.getElementById("hoursEvent").value  = "";
      loadMyHours();
      askForNotifications('Get notified when it\'s approved?\n\nAFU can let you know when your hours are approved, when you\'re assigned a task, and about meetings and trip deadlines.');
    } else {
      throw new Error(data.error || "Unknown error");
    }
  } catch (err) {
    haptic('error');
    btn.disabled    = false;
    btn.textContent = "Submit for Approval";
    msgEl.className = "hours-msg hours-msg-error";
    msgEl.textContent = "Error: " + err.message;
    msgEl.style.display = "block";
    console.error("Hours submit error:", err);
  }
}

// =====================================================
// BIOMETRIC AUTH (Face ID / Touch ID via Capacitor)
// =====================================================
const BIOMETRIC_AUTH_KEY = 'afu_stored_auth';

async function storeAuthForBiometric(payload) {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { Preferences } = window.Capacitor.Plugins;
  if (!Preferences) return;
  try {
    await Preferences.set({
      key: BIOMETRIC_AUTH_KEY,
      value: JSON.stringify({
        email:       payload.email        || '',
        given_name:  payload.given_name   || '',
        family_name: payload.family_name  || '',
        picture:     payload.picture      || ''
      })
    });
  } catch (e) { console.warn('Biometric store failed:', e); }
}

async function clearStoredAuth() {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { Preferences } = window.Capacitor.Plugins;
  if (!Preferences) return;
  try { await Preferences.remove({ key: BIOMETRIC_AUTH_KEY }); } catch (e) {}
}

async function getStoredAuth() {
  if (!window.Capacitor?.isNativePlatform()) return null;
  const { Preferences } = window.Capacitor.Plugins;
  if (!Preferences) return null;
  try {
    const { value } = await Preferences.get({ key: BIOMETRIC_AUTH_KEY });
    return value ? JSON.parse(value) : null;
  } catch (e) { return null; }
}

async function initBiometricSignIn() {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { BiometricAuth } = window.Capacitor.Plugins;
  if (!BiometricAuth) return;

  try {
    const stored = await getStoredAuth();
    if (!stored?.email) return;

    const biometry = await BiometricAuth.checkBiometry();
    if (!biometry.isAvailable) return;

    const btn  = document.getElementById('biometricSignInBtn');
    const orEl = document.getElementById('biometricSignInOr');
    const lbl  = btn?.querySelector('.biometric-type-label');

    const isFaceId = biometry.biometryTypes?.includes(2); // BiometryType.faceId = 2
    if (lbl) lbl.textContent = isFaceId ? 'Sign in with Face ID' : 'Sign in with Touch ID';
    if (btn)  btn.classList.remove('hidden');
    if (orEl) orEl.classList.remove('hidden');

    // Auto-prompt after a short delay so the UI is visible first
    setTimeout(() => biometricSignIn(true), 700);
  } catch (e) {
    console.warn('Biometric init failed:', e);
  }
}

async function biometricSignIn(auto = false) {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { BiometricAuth } = window.Capacitor.Plugins;
  if (!BiometricAuth) return;

  const btn = document.getElementById('biometricSignInBtn');
  const lbl = btn?.querySelector('.biometric-type-label');
  const originalLabel = lbl?.textContent;

  try {
    const stored = await getStoredAuth();
    if (!stored?.email) {
      if (btn) btn.classList.add('hidden');
      document.getElementById('biometricSignInOr')?.classList.add('hidden');
      return;
    }

    await BiometricAuth.authenticate({
      reason: 'Verify your identity to sign in to AFU',
      cancelTitle: 'Sign In Another Way',
      allowDeviceCredential: false,
      iosFallbackTitle: ''
    });

    // Biometric passed — sign in with stored credentials
    haptic('success');
    if (btn)  { btn.disabled = true; }
    if (lbl)  lbl.textContent = 'Signing in…';

    if (typeof window.onSignedIn === 'function') {
      await window.onSignedIn(stored);
    }
  } catch (e) {
    // User cancelled or device not enrolled — fall through to Google sign-in silently
    if (!auto) haptic('error');
    if (btn)  btn.disabled = false;
    if (lbl)  lbl.textContent = originalLabel;
    console.log('Biometric auth cancelled or failed:', e?.message || e);
  }
}

window.biometricSignIn    = biometricSignIn;
window.initBiometricSignIn = initBiometricSignIn;
window.clearStoredAuth    = clearStoredAuth;

// =====================================================
// IN-APP PUSH TOAST (foreground notifications)
// =====================================================
function showNativeToast(title, body, tab) {
  haptic('light');
  const toast = document.createElement('div');
  toast.className = 'native-push-toast';
  toast.innerHTML = `<div class="native-toast-title">${escHtml(title || 'AFU')}</div>${body ? `<div class="native-toast-body">${escHtml(body)}</div>` : ''}`;
  if (tab) toast.addEventListener('click', () => { if (typeof switchTab === 'function') switchTab(tab); });
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 350);
  }, 4500);
}

// =====================================================
// IN-APP FEEDBACK (HIG M2: no native alert()/confirm())
// =====================================================
// showToast: non-blocking status line for success and recoverable errors.
// kind: 'success' | 'error' | 'info'.
function showToast(message, kind = 'info') {
  haptic(kind === 'error' ? 'warning' : kind === 'success' ? 'success' : 'light');
  document.querySelectorAll('.app-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'app-toast app-toast-' + kind;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 350);
  }, kind === 'error' ? 5000 : 3200);
}
window.showToast = showToast;

// showError: friendly copy for users; the raw server error goes to the console.
function showError(friendly, raw) {
  if (raw) console.warn(friendly, raw);
  showToast(friendly, 'error');
}
window.showError = showError;
const NETWORK_ERROR_MSG = 'Couldn’t reach AFU. Check your connection and try again.';
window.NETWORK_ERROR_MSG = NETWORK_ERROR_MSG;

// confirmSheet: action sheet whose buttons name the action. Resolves true when
// the action button is tapped. destructive: red action button.
function confirmSheet({ title, message = '', confirmLabel, cancelLabel = 'Cancel', destructive = false }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-sheet-overlay';
    overlay.innerHTML = `
      <div class="confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirmSheetTitle">
        <div class="confirm-sheet-group">
        <div class="confirm-sheet-text">
          <div class="confirm-sheet-title" id="confirmSheetTitle">${escHtml(title)}</div>
          ${message ? `<div class="confirm-sheet-msg">${escHtml(message).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <button type="button" class="confirm-sheet-btn confirm-sheet-action${destructive ? ' destructive' : ''}">${escHtml(confirmLabel)}</button>
        </div>
        <button type="button" class="confirm-sheet-btn confirm-sheet-cancel">${escHtml(cancelLabel)}</button>
      </div>`;
    const close = (result) => {
      overlay.classList.remove('visible');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => overlay.remove(), 250);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('.confirm-sheet-action').addEventListener('click', () => close(true));
    overlay.querySelector('.confirm-sheet-cancel').addEventListener('click', () => close(false));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    if (destructive) haptic('warning');
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      overlay.querySelector('.confirm-sheet-cancel').focus();
    });
  });
}
window.confirmSheet = confirmSheet;

// =====================================================
// PUSH NOTIFICATIONS (Capacitor / FCM)
// =====================================================
// Sign-in calls this silently: it only registers if permission was already
// granted. Asking happens in context via askForNotifications().
const PUSH_DECLINED_KEY = 'afuPushDeclined';
let pushListenersAdded = false;

function getPushPlugin() {
  if (!window.Capacitor?.isNativePlatform()) return null;
  return window.Capacitor.Plugins.FirebaseMessaging || null;
}

// reason: the sentence shown in the pre-prompt. force: true from the Account
// row, which ignores a remembered decline (the user tapped it on purpose).
async function askForNotifications(reason, force = false) {
  const FirebaseMessaging = getPushPlugin();
  if (!FirebaseMessaging) return;
  let declined = false;
  try { declined = localStorage.getItem(PUSH_DECLINED_KEY) === '1'; } catch (e) {}
  if (declined && !force) return;
  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'granted') {
      if (force) showToast('Notifications are on. You can turn them off in the iOS Settings app.', 'info');
      return registerPushNotifications();
    }
    if (perm.receive === 'denied') {
      if (force) showToast('Notifications are off for AFU. To turn them on, open the iOS Settings app → AFU → Notifications.', 'info');
      return;
    }
    if (!(await confirmSheet({ title: 'Turn on notifications?', message: reason, confirmLabel: 'Turn On Notifications', cancelLabel: 'Not Now' }))) {
      try { localStorage.setItem(PUSH_DECLINED_KEY, '1'); } catch (e) {}
      return;
    }
    try { localStorage.removeItem(PUSH_DECLINED_KEY); } catch (e) {}
    const res = await FirebaseMessaging.requestPermissions();
    if (res.receive === 'granted') await registerPushNotifications();
  } catch (e) {
    console.warn('Notification permission request failed:', e);
  }
}

async function registerPushNotifications() {
  const FirebaseMessaging = getPushPlugin();
  if (!FirebaseMessaging) return;

  // Send the FCM registration token to the backend (upserts the FCM Tokens sheet)
  const storeToken = async (tok) => {
    if (!volunteerEmail || !tok) return;
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=storeFcmToken&email=${encodeURIComponent(volunteerEmail)}&token=${encodeURIComponent(tok)}`
      });
    } catch (e) { console.warn('FCM token store failed:', e); }
  };

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== 'granted') return;

    // getToken() registers with APNs (via Firebase) and returns the real FCM token
    const { token } = await FirebaseMessaging.getToken();
    await storeToken(token);

    if (pushListenersAdded) return;
    pushListenersAdded = true;

    // Re-store whenever Firebase rotates the token
    FirebaseMessaging.addListener('tokenReceived', (event) => {
      storeToken(event?.token);
    });

    // Show in-app banner when a push arrives while app is open
    FirebaseMessaging.addListener('notificationReceived', (event) => {
      const n = event?.notification || {};
      showNativeToast(n.title, n.body, n.data?.tab);
    });

    // Route to correct tab when user taps a notification
    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const tab = event?.notification?.data?.tab;
      if (tab && typeof switchTab === 'function') switchTab(tab);
    });
  } catch (e) {
    console.warn('Push notification setup failed:', e);
  }
}

// =====================================================
// VOLUNTEER REGISTRATION
// =====================================================
let regPhotoBase64 = '';
let regPhotoMime   = '';

function handleRegPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  regPhotoMime = file.type;
  const reader = new FileReader();
  reader.onload = function(ev) {
    regPhotoBase64 = ev.target.result.split(',')[1];
    document.getElementById('regPhotoPreview').src = ev.target.result;
    document.getElementById('regPhotoPreview').style.display = 'block';
    document.getElementById('regCamIcon').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// ===== DYNAMIC BRANCH DROPDOWN =====
// The onboarding branch list comes from the backend (Branches sheet) so new
// branches appear automatically without editing the app. The hardcoded <option>
// Print Slips branch picker: any branch can be printed, defaulting to the
// volunteer's own. The hardcoded options stay if getBranches fails.
async function loadSlipBranchOptions() {
  const sel = document.getElementById('udiBranchSelect');
  if (!sel) return;
  const ensureOwn = () => {
    if (branchLetter && ![...sel.options].some(o => o.value === branchLetter)) {
      sel.add(new Option(`${branchLetter} — ${branchName || branchLetter}`, branchLetter));
    }
    if (branchLetter) sel.value = branchLetter;
  };
  ensureOwn();
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=getBranches'
    });
    const data = await res.json();
    const branches = ((data && data.branches) || []).filter(b => b.code);
    if (!branches.length) return;
    const keep = sel.value;
    sel.innerHTML = '';
    branches.forEach(b => sel.add(new Option(`${b.code} — ${b.name || b.code}`, b.code)));
    sel.value = keep;
    ensureOwn();
  } catch (e) { console.warn('Slip branch list unavailable:', e); }
}

// list in index.html stays as a fallback if the request fails.
async function loadBranchOptions() {
  const sel = document.getElementById('regBranch');
  if (!sel) return;
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=getBranches'
    });
    const data = await res.json();
    const branches = (data && data.branches) || [];
    if (!branches.length) return; // keep the hardcoded fallback options
    sel.innerHTML = '<option value="" disabled>Select your branch</option>';
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      sel.appendChild(opt);
    });
    // "Starting a new branch" lets a member register before their branch exists.
    const newOpt = document.createElement('option');
    newOpt.value = '__new_branch__';
    newOpt.textContent = 'Starting a new branch';
    sel.appendChild(newOpt);
    // Default to Hopkinton when it's in the list; otherwise leave the placeholder.
    sel.value = [...sel.options].some(o => o.value === 'Hopkinton') ? 'Hopkinton' : '';
  } catch (err) {
    console.error('Failed to load branches:', err);
    // leave the hardcoded options in place so registration still works
  }
}

// Show/hide the "Starting a new branch" sub-form (location, type, help text)
// based on the branch dropdown selection.
function toggleNewBranchFields() {
  const sel   = document.getElementById('regBranch');
  const block = document.getElementById('regNewBranchBlock');
  if (!sel || !block) return;
  block.classList.toggle('hidden', sel.value !== '__new_branch__');
}
window.toggleNewBranchFields = toggleNewBranchFields;

async function submitRegistration() {
  const fname  = document.getElementById('regFname').value.trim();
  const lname  = document.getElementById('regLname').value.trim();
  const phone  = document.getElementById('regPhone').value.trim();
  const branch = document.getElementById('regBranch').value;
  const msgEl  = document.getElementById('regMsg');
  const btn    = document.getElementById('regSubmitBtn');

  if (!fname || !lname || !branch) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  // The app is for volunteers 13+; we don't collect data from younger children (COPPA)
  if (!document.getElementById('regAgeConfirm').checked) {
    showToast('Please confirm you are 13 or older. Volunteers under 13 can’t create an account.', 'error');
    return;
  }

  // When starting a new branch, collect the location and type instead of an
  // existing branch code. The backend creates the branch from these fields.
  const isNewBranch = branch === '__new_branch__';
  let newBranchLocation = '';
  let newBranchType     = '';
  if (isNewBranch) {
    newBranchLocation = document.getElementById('regNewBranchLocation').value.trim();
    const typeEl = document.querySelector('input[name="regNewBranchType"]:checked');
    newBranchType = typeEl ? typeEl.value : '';
    if (!newBranchLocation) {
      showToast('Please enter the branch location.', 'error');
      return;
    }
  }

  const emailToSubmit = volunteerEmail || document.getElementById('regEmail').value.trim();
  if (!emailToSubmit) {
    showToast('Please enter your email address.', 'error');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Submitting…';
  msgEl.style.display = 'none';

  try {
    const body = [
      `action=registerVolunteer`,
      `fname=${encodeURIComponent(fname)}`,
      `lname=${encodeURIComponent(lname)}`,
      `email=${encodeURIComponent(emailToSubmit)}`,
      `phone=${encodeURIComponent(phone)}`,
      `branch=${encodeURIComponent(branch)}`,
      `newBranchLocation=${encodeURIComponent(newBranchLocation)}`,
      `newBranchType=${encodeURIComponent(newBranchType)}`,
      `photoBase64=${encodeURIComponent(regPhotoBase64)}`,
      `photoMime=${encodeURIComponent(regPhotoMime)}`,
      `appleSub=${encodeURIComponent(window._pendingAppleSub || '')}`,
      `authorizationCode=${encodeURIComponent(window._pendingAppleAuthCode || '')}`
    ].join('&');

    const res  = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();

    if (data.success) {
      window._pendingAppleSub = null;
      window._pendingAppleAuthCode = null;
      // Carried into the pending-state app by proceedAfterRegistration().
      registeredProfile = {
        firstName: fname,
        fullName: fname + ' ' + lname,
        branchName: isNewBranch ? newBranchLocation : branch,
        email: emailToSubmit,
        newBranch: isNewBranch
      };
      // Success card: existing-branch registrants are approved immediately (the
      // default HTML). New-branch founders are in the app as President, but their
      // branch code is assigned on review, so show the "being set up" variant.
      if (isNewBranch) {
        document.getElementById('regSuccessIntro').textContent =
          'Your request to start the ' + (newBranchLocation || 'new') + ' branch is in.';
        const chip = document.getElementById('regSuccessChip');
        chip.textContent = '⏳ Branch being set up';
        chip.style.display = '';
        document.getElementById('regSuccessMsg').textContent =
          "You're set as its President and can use the app now. Recording donations unlocks once an officer assigns your branch code.";
      }
      document.getElementById('registerCard').classList.add('hidden');
      document.getElementById('registerSuccess').classList.remove('hidden');
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Register as a Volunteer';
    msgEl.className = 'hours-msg hours-msg-error';
    msgEl.textContent = 'Error: ' + err.message;
    msgEl.style.display = 'block';
    console.error('Registration error:', err);
  }
}

async function deleteAccount() {
  if (!volunteerEmail) return;
  const confirmed = await confirmSheet({
    title: 'Delete your account?',
    message: 'This permanently erases all of your data — your roster entry, volunteer hours, Boston trip forms, reimbursement requests, photos, and sign-in access — and stops push notifications. Nothing is kept.\n\nThis cannot be undone.',
    confirmLabel: 'Delete Account',
    destructive: true
  });
  if (!confirmed) return;
  try {
    haptic('warning');
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=deleteAccount&email=${encodeURIComponent(volunteerEmail)}&actorEmail=${encodeURIComponent(volunteerEmail)}`
    });
    const data = await res.json();
    if (data.error) { showError('Couldn’t delete your account. Try again, or contact your Branch President.', data.error); return; }
    haptic('success');
    // Clear the stored biometric credential (key BIOMETRIC_AUTH_KEY = 'afu_stored_auth')
    // so Face ID / Touch ID can't sign the deleted account back in.
    await clearStoredAuth();
    volunteerEmail = null;
    volunteerName  = null;
    branchLetter   = null;
    branchName     = null;
    window.volunteerProfile = null;
    document.body.classList.remove('is-pending');
    document.getElementById('appContent').classList.add('hidden');
    document.getElementById('mainNav').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    showToast('Your account has been deleted.', 'success');
  } catch (err) {
    showError('Couldn’t delete your account. Check your connection and try again.', err.message);
  }
}

let registeredProfile = null;

// Signs out on this device: forgets the Face ID / Touch ID login, stops push
// notifications to this device, signs out of Google, then reloads so no
// signed-in state survives. The account itself is untouched.
async function signOut() {
  if (!(await confirmSheet({ title: 'Sign out of AFU on this device?', confirmLabel: 'Sign Out', destructive: true }))) return;
  await clearStoredAuth();
  const plugins = (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins) || {};
  try { if (plugins.FirebaseMessaging) await plugins.FirebaseMessaging.deleteToken(); } catch (e) {}
  try { if (plugins.SocialLogin) await plugins.SocialLogin.logout({ provider: 'google' }); } catch (e) {}
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch (e) {}
  window.location.reload();
}
window.signOut = signOut;

function proceedAfterRegistration() {
  document.getElementById('registerSuccess').classList.add('hidden');
  const p = registeredProfile || { email: volunteerEmail };
  // Open membership (2026-10-24): joining an existing branch now adds the
  // volunteer to the Roster as approved, so re-run the lookup to drop them into
  // the full app instead of the pending screen. Only a brand-new-branch request
  // still waits for an officer to set the branch up.
  if (p.newBranch) {
    enterPendingMode(p, { email: p.email, given_name: p.firstName, family_name: '' });
  } else {
    onSignedIn({ email: p.email, given_name: p.firstName, family_name: '', picture: '' });
  }
}

// Self-service branch-code claim for a new-branch founder sitting in the
// "being set up" state. On success the backend creates the branch and promotes
// them to President under the new code, so we re-run the lookup to drop them into
// the fully-approved app (recording unlocked). A taken code just asks for another.
window.claimBranchCode = async function () {
  const input = document.getElementById('claimCodeInput');
  const btn   = document.getElementById('claimCodeBtn');
  const msg   = document.getElementById('claimCodeMsg');
  const show  = (type, text) => { msg.textContent = text; msg.className = 'hours-msg ' + (type === 'ok' ? 'ok' : 'error'); msg.style.display = ''; };
  const code  = (input.value || '').trim().toUpperCase();
  msg.style.display = 'none';
  if (!/^[A-Z]$/.test(code)) { show('error', 'Use a single letter (A–Z).'); return; }

  btn.disabled = true; btn.textContent = 'Claiming…';
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=claimBranchCode&code=${encodeURIComponent(code)}&actorEmail=${encodeURIComponent(volunteerEmail || '')}`
    });
    const data = await res.json();
    if (data && data.success) {
      try { haptic('success'); } catch (e) {}
      document.body.classList.remove('is-pending');
      // Re-enter as an approved member of the new branch (recording now works).
      onSignedIn({ email: volunteerEmail, given_name: volunteerName || '', family_name: '', picture: '' });
      return;
    }
    btn.disabled = false; btn.textContent = 'Claim';
    show('error', (data && data.taken)
      ? `"${code}" is taken — try another.`
      : ((data && data.error) || 'Could not claim that code. Try again.'));
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Claim';
    show('error', 'Network error — please try again.');
  }
};

// ===== PENDING (NOT YET APPROVED) STATE =====
// A volunteer who registered but isn't on the roster yet. They can use Hours,
// Tasks and their account settings; anything that needs a branch code (recording
// donations, printing slips) shows an "available after approval" note instead.
// Used right after registering AND on every later sign-in while still pending,
// so the app never sends them back to the registration form.
async function enterPendingMode(p, authPayload) {
  volunteerEmail = p.email || volunteerEmail;
  volunteerName  = p.firstName || '';
  branchLetter   = null;
  branchName     = p.branchName || '';

  window.volunteerProfile = {
    firstName: volunteerName,
    fullName: p.fullName || volunteerName,
    branchName,
    branchCode: '',
    email: volunteerEmail,
    photoUrl: null,
    hasRosterPhoto: true,   // photo uploads need a roster row — don't prompt yet
    position: '',
    pending: true,
  };
  document.body.classList.add('is-pending');
  document.getElementById('navAdmin').classList.add('hidden');

  const status = p.newBranch
    ? (branchName ? branchName + ' · Branch being set up' : 'Branch being set up')
    : (branchName ? branchName + ' Branch · Pending approval' : 'Pending approval');
  window.loadDashboard = function() {
    document.getElementById('dashName').textContent = volunteerName || 'Volunteer';
    document.getElementById('dashBranch').textContent = status;
    document.getElementById('dashGoalOf').textContent = 'Available after approval';
  };

  if (authPayload) await storeAuthForBiometric(authPayload);
  registerPushNotifications();   // silent; only if already granted

  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('registerCard').classList.add('hidden');
  document.getElementById('appContent').classList.remove('hidden');
  document.getElementById('mainNav').classList.remove('hidden');
  switchTab('home');
  const tourPending = !localStorage.getItem(WELCOME_SEEN_KEY);
  maybeShowWelcome();
  loadEventTypes();

  // Ask once the pending screen is up (and after the welcome tour, if it shows),
  // so the reason is clear. A remembered decline skips this.
  const askApproval = () => askForNotifications('Get notified when you\'re approved?\n\nAFU will let you know as soon as your registration is approved, and later about hours, tasks, meetings and trip deadlines.');
  if (tourPending) window.addEventListener('afu-welcome-closed', () => setTimeout(askApproval, 400), { once: true });
  else setTimeout(askApproval, 800);
}

// =====================================================
// FIRST-RUN WELCOME TOUR
// A short, generic swipeable intro shown once per device on first
// successful sign-in. Re-openable anytime via showWelcome(true).
// "Seen" state is a localStorage flag — no backend change.
// =====================================================
const WELCOME_SEEN_KEY = 'afu-welcome-seen';

const WELCOME_SLIDES = [
  {
    icon: '👋',
    title: 'Welcome to the AFU Portal',
    body: "Your home base for volunteering with Advocacy for the Unhoused. Here's a quick 15-second tour."
  },
  {
    icon: '🏠',
    title: 'Start at Home',
    body: "Your <b>Home</b> tab shows your approved hours, your branch's fundraising progress, and recent activity — all in one place."
  },
  {
    icon: '⏱️',
    title: 'Log hours & donations',
    body: 'Use <b>Hours</b> to record volunteer time and <b>Record</b> to log donations you collected in person at fundraisers. Your coordinator reviews what you submit.'
  },
  {
    icon: '✅',
    title: "You're all set",
    body: "Check <b>Tasks</b> to see what your team is working on. Special events like the Boston Trip appear on your Home screen when they're active.<br><br>Replay this tour anytime from the bottom of your Home screen."
  }
];

function injectWelcomeStyles() {
  if (document.getElementById('afu-welcome-style')) return;
  const style = document.createElement('style');
  style.id = 'afu-welcome-style';
  style.textContent = `
    .afu-welcome-overlay {
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center; padding: 20px;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      opacity: 0; transition: opacity 0.25s ease;
      font-family: 'Montserrat', sans-serif;
    }
    .afu-welcome-overlay.visible { opacity: 1; }
    .afu-welcome-card {
      position: relative; width: 100%; max-width: 360px;
      background: var(--page-bg, #1A1311); color: var(--page-text, #F9F6F0);
      border: 1px solid var(--card-border, rgba(249,246,240,0.22)); border-radius: 22px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
      padding: 34px 26px calc(24px + env(safe-area-inset-bottom));
      text-align: center; transform: translateY(14px) scale(0.98);
      transition: transform 0.25s ease;
    }
    .afu-welcome-overlay.visible .afu-welcome-card { transform: translateY(0) scale(1); }
    .afu-welcome-skip {
      position: absolute; top: 12px; right: 14px; z-index: 2;
      background: none; border: none; cursor: pointer; font-family: 'Montserrat', sans-serif;
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
      color: var(--page-text, #F9F6F0); opacity: 0.45; padding: 6px 8px;
      min-height: auto; width: auto; box-shadow: none;
    }
    .afu-welcome-skip:hover { opacity: 0.8; }
    .afu-welcome-track-wrap { overflow: hidden; }
    .afu-welcome-track { display: flex; transition: transform 0.3s ease; }
    .afu-welcome-slide {
      flex: 0 0 100%; padding: 8px 4px;
      display: flex; flex-direction: column; align-items: center;
    }
    .afu-welcome-icon { font-size: 3.4rem; line-height: 1; margin: 6px 0 18px; }
    .afu-welcome-title {
      font-size: 1.28rem; font-weight: 800; margin: 0 0 12px; color: var(--page-text, #F9F6F0);
    }
    .afu-welcome-body {
      font-size: 0.92rem; line-height: 1.55; margin: 0; opacity: 0.82; max-width: 280px;
    }
    .afu-welcome-body b { color: var(--camp-orange, #B84A27); font-weight: 800; }
    .afu-welcome-dots { display: flex; gap: 7px; justify-content: center; margin: 22px 0 20px; }
    .afu-welcome-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--page-text, #F9F6F0); opacity: 0.25;
      transition: opacity 0.2s, width 0.2s, background 0.2s;
    }
    .afu-welcome-dot.active {
      opacity: 1; width: 20px; border-radius: 4px; background: var(--camp-orange, #B84A27);
    }
    .afu-welcome-actions { display: flex; gap: 10px; align-items: center; }
    .afu-welcome-back {
      flex: 0 0 auto; background: none; border: none; cursor: pointer;
      font-family: 'Montserrat', sans-serif; font-size: 0.82rem; font-weight: 700;
      color: var(--page-text, #F9F6F0); opacity: 0.55;
      padding: 12px 6px; min-height: 44px; width: auto; box-shadow: none;
    }
    .afu-welcome-back:hover { opacity: 0.9; }
    .afu-welcome-next {
      flex: 1; min-height: 48px; background: var(--camp-orange, #B84A27); color: #fff;
      border: none; border-radius: 14px; cursor: pointer; font-family: 'Montserrat', sans-serif;
      font-size: 0.95rem; font-weight: 800; letter-spacing: 0.3px;
      box-shadow: 0 6px 18px rgba(200,82,45,0.35); transition: transform 0.12s, box-shadow 0.12s;
    }
    .afu-welcome-next:active { transform: translateY(1px); box-shadow: 0 3px 10px rgba(200,82,45,0.3); }
  `;
  document.head.appendChild(style);
}

window.showWelcome = function(force = false) {
  if (!force && localStorage.getItem(WELCOME_SEEN_KEY)) return;
  if (document.querySelector('.afu-welcome-overlay')) return; // already open
  injectWelcomeStyles();

  let idx = 0;
  const overlay = document.createElement('div');
  overlay.className = 'afu-welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome tour');
  overlay.innerHTML = `
    <div class="afu-welcome-card">
      <button class="afu-welcome-skip" type="button">Skip</button>
      <div class="afu-welcome-track-wrap">
        <div class="afu-welcome-track">
          ${WELCOME_SLIDES.map(s => `
            <div class="afu-welcome-slide">
              <div class="afu-welcome-icon">${s.icon}</div>
              <h3 class="afu-welcome-title">${s.title}</h3>
              <p class="afu-welcome-body">${s.body}</p>
            </div>`).join('')}
        </div>
      </div>
      <div class="afu-welcome-dots">
        ${WELCOME_SLIDES.map((_, i) => `<span class="afu-welcome-dot${i === 0 ? ' active' : ''}"></span>`).join('')}
      </div>
      <div class="afu-welcome-actions">
        <button class="afu-welcome-back" type="button" style="visibility:hidden;">Back</button>
        <button class="afu-welcome-next" type="button">Next</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const track   = overlay.querySelector('.afu-welcome-track');
  const dots    = Array.from(overlay.querySelectorAll('.afu-welcome-dot'));
  const backBtn = overlay.querySelector('.afu-welcome-back');
  const nextBtn = overlay.querySelector('.afu-welcome-next');
  const skipBtn = overlay.querySelector('.afu-welcome-skip');

  function render() {
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    backBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    const last = idx === WELCOME_SLIDES.length - 1;
    nextBtn.textContent = last ? 'Get started' : 'Next';
    skipBtn.style.visibility = last ? 'hidden' : 'visible';
  }
  function close() {
    try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch (e) {}
    overlay.classList.remove('visible');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 250);
    window.dispatchEvent(new Event('afu-welcome-closed'));
  }
  function next() {
    if (idx < WELCOME_SLIDES.length - 1) { idx++; haptic('light'); render(); }
    else { haptic('success'); close(); }
  }
  function back() { if (idx > 0) { idx--; haptic('light'); render(); } }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') back();
  }

  document.addEventListener('keydown', onKey);
  nextBtn.addEventListener('click', next);
  backBtn.addEventListener('click', back);
  skipBtn.addEventListener('click', close);

  // Lightweight touch swipe
  let startX = null;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -40) next(); else if (dx > 40) back();
    startX = null;
  }, { passive: true });

  render();
};

// Shown automatically after first successful sign-in (once per device).
window.maybeShowWelcome = function() {
  if (localStorage.getItem(WELCOME_SEEN_KEY)) return;
  // Small delay so the Home tab paints behind the modal first.
  setTimeout(() => window.showWelcome(false), 550);
};

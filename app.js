// app.js v9
console.log("App.js v9 loaded!");

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec";

let volunteerEmail = null;
let volunteerName  = null;
let branchLetter   = null;
let branchName     = null;

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
}

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
      (haveEmail ? `<div style="font-size:0.82rem;color:#777;overflow-wrap:anywhere;">${escHtml(email)}</div>` : '');
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
window.onSignedIn = async function (preloadedPayload = null) {
  console.log("onSignedIn called!");

  const payload = preloadedPayload || parseJwt(window.googleCredential || "");
  if (!payload || !payload.email) {
    alert("Could not read your Google account. Please try again.");
    return;
  }

  volunteerEmail = payload.email;
  console.log("Signed in as:", volunteerEmail);

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
    console.log("Raw response:", responseText);

    const info = JSON.parse(responseText);
    console.log("Parsed info:", info);

    if (!info.firstName || info.firstName === "User" || !info.branchCode || info.branchCode === "X") {
      console.log("User not found — showing registration form");
      // Pre-fill from the JWT we already have; hides name/email fields
      // the provider already supplied (Guideline 4)
      prefillRegistrationIdentity(payload.given_name, payload.family_name, volunteerEmail);
      document.getElementById("authScreen").classList.add("hidden");
      document.getElementById("registerCard").classList.remove("hidden");
      return;
    }

    volunteerName = info.firstName;
    branchLetter  = info.branchCode;
    branchName    = info.branchName;

    console.log("Set variables:", { volunteerName, branchLetter, branchName });

    // Expose profile so the dashboard stub can read it
    window.volunteerProfile = {
      firstName: volunteerName,
      fullName: info.fullName || volunteerName,
      branchName,
      branchCode: branchLetter,
      email: volunteerEmail,
      photoUrl: info.photoUrl || payload.picture || null,
      position: info.position || '',
    };

    await storeAuthForBiometric(payload);
    await registerPushNotifications();

    // Wire loadDashboard to pull real stats + activity once data is ready
    window.loadDashboard = async function() {
      document.getElementById('dashName').textContent = volunteerName;
      document.getElementById('dashBranch').textContent = branchName + ' Branch';
      const avatarSrc = info.photoUrl || payload.picture;
      if (avatarSrc) document.getElementById('dashAvatar').src = avatarSrc;

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
          document.getElementById('dashGoalOf').textContent = 'of $' + stats.goalTarget.toLocaleString() + ' Goal — ' + pct + '%';
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

    document.getElementById("udiBranchDisplay").value =
      `${branchLetter} — ${branchName}`;

    switchTab('home');
    maybeShowWelcome();

    await syncDonations();
    await loadEventTypes();

  } catch (err) {
    console.error("Error during lookup:", err);
    alert("Could not connect to server. Please check your internet connection and try again.\n\nError: " + (err.message || String(err)));
  }
};

window.onAppleSignedIn = async function(sub, email, givenName, familyName) {
  if (!sub) { alert('Apple sign-in did not return a user ID. Please try again.'); return; }

  try {
    const body = `action=appleSignIn&sub=${encodeURIComponent(sub)}&email=${encodeURIComponent(email || '')}`;
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const info = JSON.parse(await res.text());

    if (info.error || !info.firstName || info.firstName === 'User' || !info.branchCode || info.branchCode === 'X') {
      volunteerEmail = email || '';
      window._pendingAppleSub = sub;
      // Apple's Authentication Services already provided name/email (cached
      // per-sub for repeat sign-ins) — never ask for them again (Guideline 4)
      prefillRegistrationIdentity(givenName, familyName, email);
      document.getElementById('authScreen').classList.add('hidden');
      document.getElementById('registerCard').classList.remove('hidden');
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
      position: info.position || '',
    };

    await storeAuthForBiometric({ email: volunteerEmail, given_name: givenName || '', family_name: familyName || '', picture: '' });
    await registerPushNotifications();

    window.loadDashboard = async function() {
      document.getElementById('dashName').textContent = volunteerName;
      document.getElementById('dashBranch').textContent = branchName + ' Branch';
      if (info.photoUrl) document.getElementById('dashAvatar').src = info.photoUrl;

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
          document.getElementById('dashGoalOf').textContent = 'of $' + stats.goalTarget.toLocaleString() + ' Goal — ' + pct + '%';
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
    document.getElementById('udiBranchDisplay').value = `${branchLetter} — ${branchName}`;

    switchTab('home');
    maybeShowWelcome();
    await syncDonations();
    await loadEventTypes();

  } catch (err) {
    console.error('Apple sign-in error:', err);
    alert('Could not connect to server. Please check your internet connection and try again.\n\nError: ' + (err.message || String(err)));
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
  if (!volunteerEmail) { alert("Please sign in first."); return; }

  const digits    = parseInt(document.getElementById("udiDigits").value);
  const amount    = document.getElementById("amount").value;
  const fundraiser = document.getElementById("fundraiser").value;

  if (!digits || digits < 1 || digits > 999) {
    alert("UDI digits must be between 1–999");
    return;
  }
  if (!amount || amount <= 0) {
    alert("Enter a valid donation amount.");
    return;
  }

  const udi = branchLetter + digits.toString().padStart(3, '0');
  console.log("Creating UDI:", udi);

  const record = {
    udi,
    amount: Number(amount),
    branchLetter,
    fundraiser,
    volunteerEmail,
    volunteerName,
    timestamp: Date.now()
  };

  saveDonationOffline(record)
    .then(() => syncDonations())
    .then((duplicates) => {
      if (Array.isArray(duplicates) && duplicates.includes(udi)) {
        haptic('error');
        alert("UDI " + udi + " has already been recorded. Double-check the slip number — no new record was created.");
        return;
      }
      haptic('success');
      document.getElementById("finalUDI").innerText = udi;
      document.getElementById("step2").classList.add("hidden");
      document.getElementById("step3").classList.remove("hidden");
      if (!navigator.onLine) {
        alert("Saved offline. Will sync when connection is restored.");
      }
    })
    .catch(err => {
      haptic('error');
      console.error("Error saving donation:", err);
      alert("Error saving donation: " + err.message);
    });
}

function restart() {
  document.getElementById("udiDigits").value  = "";
  document.getElementById("amount").value     = "";
  document.getElementById("fundraiser").value = "Candle";
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
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
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
      alert("Could not start camera. Please:\n1. Grant camera permission\n2. Make sure you're using HTTPS\n3. Try entering UDI manually");
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
  const dateVal = document.getElementById("udiDate").value;

  if (!dateVal) { alert("Please select a fundraiser date."); return; }
  if (!branchLetter) { alert("Branch not detected. Please sign in first."); return; }

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
      `dateString=${encodeURIComponent(dateVal)}`,
      `branchCode=${encodeURIComponent(branchLetter)}`
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
  if (!volunteerEmail) { alert("Please sign in first."); return; }

  const eventName = document.getElementById("hoursEvent").value.trim();
  const eventDate = document.getElementById("hoursDate").value;
  const hours     = document.getElementById("hoursAmount").value;
  const notes     = document.getElementById("hoursNotes").value.trim();
  const msgEl     = document.getElementById("hoursSubmitMsg");
  const btn       = document.getElementById("hoursSubmitBtn");

  if (!eventName) { alert("Please choose or type an event."); return; }
  if (!eventDate) { alert("Please enter the event date."); return; }
  if (!hours || Number(hours) <= 0) { alert("Please enter a valid number of hours."); return; }

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
      cancelTitle: 'Use Google Sign-In',
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
// PUSH NOTIFICATIONS (Capacitor / FCM)
// =====================================================
async function registerPushNotifications() {
  if (!window.Capacitor?.isNativePlatform()) return;
  const { FirebaseMessaging } = window.Capacitor.Plugins;
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
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // getToken() registers with APNs (via Firebase) and returns the real FCM token
    const { token } = await FirebaseMessaging.getToken();
    await storeToken(token);

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

async function submitRegistration() {
  const fname  = document.getElementById('regFname').value.trim();
  const lname  = document.getElementById('regLname').value.trim();
  const phone  = document.getElementById('regPhone').value.trim();
  const branch = document.getElementById('regBranch').value;
  const msgEl  = document.getElementById('regMsg');
  const btn    = document.getElementById('regSubmitBtn');

  if (!fname || !lname || !branch) {
    alert('Please fill in all required fields.');
    return;
  }

  const emailToSubmit = volunteerEmail || document.getElementById('regEmail').value.trim();
  if (!emailToSubmit) {
    alert('Please enter your email address.');
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
      `photoBase64=${encodeURIComponent(regPhotoBase64)}`,
      `photoMime=${encodeURIComponent(regPhotoMime)}`,
      `appleSub=${encodeURIComponent(window._pendingAppleSub || '')}`
    ].join('&');

    const res  = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();

    if (data.success) {
      window._pendingAppleSub = null;
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
  const confirmed = confirm(
    'Delete your account?\n\nThis removes your name, contact details, photo, date of birth, and sign-in access from the volunteer roster, and stops push notifications. Anonymized activity records are kept for organizational bookkeeping.\n\nThis cannot be undone.'
  );
  if (!confirmed) return;
  try {
    haptic('warning');
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=deleteAccount&email=${encodeURIComponent(volunteerEmail)}`
    });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    haptic('success');
    // Clear the stored biometric credential (key BIOMETRIC_AUTH_KEY = 'afu_stored_auth')
    // so Face ID / Touch ID can't sign the deleted account back in.
    await clearStoredAuth();
    volunteerEmail = null;
    volunteerName  = null;
    branchLetter   = null;
    branchName     = null;
    window.volunteerProfile = null;
    document.getElementById('appContent').classList.add('hidden');
    document.getElementById('mainNav').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    alert('Your account has been deleted.');
  } catch (err) {
    alert('Could not delete account: ' + err.message);
  }
}

function proceedAfterRegistration() {
  // Grant access with a pending-state welcome message.
  // branchLetter/branchName remain null until approved and re-verified next login.
  document.getElementById('registerSuccess').classList.add('hidden');
  document.getElementById('welcomeMessage').innerText = `Welcome! Your profile is pending Branch President approval.`;
  document.getElementById('welcomeMessage').style.display = 'block';
  document.getElementById('appContent').classList.remove('hidden');
  document.getElementById('mainNav').classList.remove('hidden');
  // UDI slip generation requires branchLetter — hide that section for pending users
  const udiSection = document.getElementById('udiSection');
  if (udiSection) udiSection.style.display = 'none';
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
    .afu-welcome-body b { color: var(--camp-orange, #C8522D); font-weight: 800; }
    .afu-welcome-dots { display: flex; gap: 7px; justify-content: center; margin: 22px 0 20px; }
    .afu-welcome-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--page-text, #F9F6F0); opacity: 0.25;
      transition: opacity 0.2s, width 0.2s, background 0.2s;
    }
    .afu-welcome-dot.active {
      opacity: 1; width: 20px; border-radius: 4px; background: var(--camp-orange, #C8522D);
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
      flex: 1; min-height: 48px; background: var(--camp-orange, #C8522D); color: #fff;
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

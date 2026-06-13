// app.js v8
console.log("App.js v8 loaded!");

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec";

let volunteerEmail = null;
let volunteerName  = null;
let branchLetter   = null;
let branchName     = null;

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
      // Pre-fill from the JWT we already have
      document.getElementById("regFname").value = payload.given_name  || "";
      document.getElementById("regLname").value = payload.family_name || "";
      document.getElementById("regEmail").value = volunteerEmail;
      document.getElementById("authCard").classList.add("hidden");
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
      branchName,
      branchCode: branchLetter,
      email: volunteerEmail,
      photoUrl: payload.picture || null,
    };

    // Wire loadDashboard to pull real stats + activity once data is ready
    window.loadDashboard = async function() {
      document.getElementById('dashName').textContent = volunteerName;
      document.getElementById('dashBranch').textContent = branchName + ' Branch';
      if (payload.picture) document.getElementById('dashAvatar').src = payload.picture;

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
        if (stats.donationCount != null)
          document.getElementById('dashDonations').textContent = stats.donationCount;

        if (stats.goalRaised != null && stats.goalTarget != null) {
          const pct = Math.min(100, Math.round(stats.goalRaised / stats.goalTarget * 100));
          document.getElementById('dashGoalRaised').textContent = '$' + stats.goalRaised.toLocaleString();
          document.getElementById('dashGoalOf').textContent = 'of $' + stats.goalTarget.toLocaleString() + ' Goal — ' + pct + '%';
          document.getElementById('dashGoalBar').style.width = pct + '%';
        }

        if (Array.isArray(stats.recentActivity) && stats.recentActivity.length > 0) {
          const feed = document.getElementById('dashActivity');
          feed.innerHTML = stats.recentActivity.map(item => `
            <div class="activity-row">
              <div class="activity-dot"></div>
              <div class="activity-text">${item.text}</div>
              ${item.time ? `<div class="activity-time">${item.time}</div>` : ''}
            </div>
          `).join('');
        }
      } catch (e) {
        console.warn('Dashboard stats unavailable:', e);
      }
    };

    document.getElementById("authCard").classList.add("hidden");
    document.getElementById("appContent").classList.remove("hidden");
    document.getElementById("mainNav").classList.remove("hidden");

    document.getElementById("udiBranchDisplay").value =
      `${branchLetter} — ${branchName}`;

    switchTab('home');

    await syncDonations();
    await loadEventTypes();

  } catch (err) {
    console.error("Error during lookup:", err);
    alert("Could not connect to server. Please check your internet connection and try again.\n\nError: " + err.message);
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
async function syncDonations() {
  if (!navigator.onLine) return;
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
        await deleteDonation(rec.id);
      }
    } catch {
      break;
    }
  }
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
    .then(() => {
      document.getElementById("finalUDI").innerText = udi;
      document.getElementById("step2").classList.add("hidden");
      document.getElementById("step3").classList.remove("hidden");
      if (!navigator.onLine) {
        alert("Saved offline. Will sync when connection is restored.");
      }
    })
    .catch(err => {
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
    errorEl.innerHTML = `<strong>Error:</strong> ${err.message}`;
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
    const data   = await res.json();
    const select = document.getElementById("hoursEvent");
    if (data.eventTypes && data.eventTypes.length) {
      select.innerHTML =
        '<option value="">— Select an event —</option>' +
        data.eventTypes.map(e => `<option value="${e}">${e}</option>`).join("");
    } else {
      select.innerHTML = '<option value="">No events available</option>';
    }
  } catch (err) {
    console.error("Error loading event types:", err);
    document.getElementById("hoursEvent").innerHTML =
      '<option value="">Could not load events</option>';
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
      listEl.innerHTML = `<p class="hours-error">Server error: ${data.error}</p>`;
      return;
    }

    const records = data.records || [];

    if (!records.length) {
      listEl.innerHTML = '<p class="hours-empty">No events logged yet.</p>';
      return;
    }

    const approvedTotal = records
      .filter(r => String(r.approved).trim().toLowerCase() === "yes")
      .reduce((sum, r) => sum + Number(r.hours || 0), 0);

    const pendingCount = records.filter(
      r => String(r.approved).trim().toLowerCase() !== "yes"
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
      const aApproved = String(a.approved).trim().toLowerCase() === "yes";
      const bApproved = String(b.approved).trim().toLowerCase() === "yes";
      if (aApproved !== bApproved) return bApproved ? 1 : -1;
      return new Date(b.eventDate) - new Date(a.eventDate);
    });

    listEl.innerHTML = sorted.map(r => {
      const approved      = String(r.approved).trim().toLowerCase() === "yes";
      const formattedDate = r.eventDate
        ? new Date(r.eventDate + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
          })
        : '—';
      return `
        <div class="hours-row">
          <div class="hours-row-left">
            <div class="hours-row-event">${r.eventName}</div>
            <div class="hours-row-date">${formattedDate}</div>
          </div>
          <div class="hours-row-right">
            <div class="hours-row-amt">${r.hours} hr${Number(r.hours) !== 1 ? 's' : ''}</div>
            <div class="hours-row-status ${approved ? 'status-approved' : 'status-pending'}">
              ${approved ? '✓ Approved' : '⏳ Pending'}
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

  const eventName = document.getElementById("hoursEvent").value;
  const eventDate = document.getElementById("hoursDate").value;
  const hours     = document.getElementById("hoursAmount").value;
  const msgEl     = document.getElementById("hoursSubmitMsg");
  const btn       = document.getElementById("hoursSubmitBtn");

  if (!eventName) { alert("Please select an event."); return; }
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
    `hours=${encodeURIComponent(hours)}`
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
      msgEl.className   = "hours-msg hours-msg-success";
      msgEl.textContent = "✓ Submitted! Your coordinator will review it shortly.";
      msgEl.style.display = "block";
      document.getElementById("hoursDate").value   = "";
      document.getElementById("hoursAmount").value = "";
      document.getElementById("hoursEvent").selectedIndex = 0;
      loadMyHours();
    } else {
      throw new Error(data.error || "Unknown error");
    }
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = "Submit for Approval";
    msgEl.className = "hours-msg hours-msg-error";
    msgEl.textContent = "Error: " + err.message;
    msgEl.style.display = "block";
    console.error("Hours submit error:", err);
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

  if (!fname || !lname || !phone || !branch) {
    alert('Please fill in all required fields.');
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
      `email=${encodeURIComponent(volunteerEmail)}`,
      `phone=${encodeURIComponent(phone)}`,
      `branch=${encodeURIComponent(branch)}`,
      `photoBase64=${encodeURIComponent(regPhotoBase64)}`,
      `photoMime=${encodeURIComponent(regPhotoMime)}`
    ].join('&');

    const res  = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();

    if (data.success) {
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

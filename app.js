// app.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec";

let volunteerEmail = null;
let volunteerName = null;
let branchLetter = null;
let branchName = null;

console.log("App.js loaded successfully!");

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
window.onSignedIn = async function () {
  console.log("onSignedIn called!");

  const payload = parseJwt(window.googleCredential || "");
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
      console.error("User not found in roster!");
      alert(`Sorry, the email ${volunteerEmail} is not registered as a volunteer.\n\nPlease contact your branch coordinator to be added to the roster.`);
      return;
    }

    volunteerName = info.firstName;
    branchLetter = info.branchCode;
    branchName = info.branchName;

    console.log("Set variables:", { volunteerName, branchLetter, branchName });

    document.getElementById("welcomeMessage").innerText =
      `Welcome, ${volunteerName}! (${branchName} Branch)`;
    document.getElementById("welcomeMessage").style.display = "block";

    document.getElementById("authCard").classList.add("hidden");
    document.getElementById("appContent").classList.remove("hidden");

    document.getElementById("udiBranchDisplay").value =
      `${branchLetter} — ${branchName}`;

    await syncDonations();
    attachScannerListeners(); // re-attach now that appContent is visible

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
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function saveDonationOffline(record) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readwrite");
    tx.objectStore("donations").add(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getUnsyncedDonations() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readonly");
    const req = tx.objectStore("donations").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDonation(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readwrite");
    tx.objectStore("donations").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
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

      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });

      const json = await res.json();
      if (json.success) {
        await deleteDonation(rec.id);
      } else if (json.error === "UDI exists") {
        await deleteDonation(rec.id);
      }
    } catch {
      break;
    }
  }
}

window.addEventListener('online', syncDonations);

// ===== DONATION UI =====
window.submitDonation = async function () {
  if (!volunteerEmail) {
    alert("Please sign in first.");
    return;
  }

  const digits = parseInt(document.getElementById("udiDigits").value);
  const amount = document.getElementById("amount").value;
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

  try {
    await saveDonationOffline(record);
    await syncDonations();

    document.getElementById("finalUDI").innerText = udi;
    document.getElementById("step2").classList.add("hidden");
    document.getElementById("step3").classList.remove("hidden");

    if (!navigator.onLine) {
      alert("Saved offline. Will sync when connection is restored.");
    }
  } catch (err) {
    console.error("Error saving donation:", err);
    alert("Error saving donation: " + err.message);
  }
};

window.restart = function () {
  document.getElementById("udiDigits").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("fundraiser").value = "Candle";
  document.getElementById("step3").classList.add("hidden");
  document.getElementById("step2").classList.remove("hidden");
};

// =====================================================
// BARCODE SCANNER
// =====================================================
function loadQRScanner() {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.onload = () => { console.log("html5-qrcode library loaded"); resolve(); };
    script.onerror = () => reject(new Error("Failed to load scanner library"));
    document.head.appendChild(script);
  });
}

let html5QrCode = null;
let isScanning = false;

async function startScan() {
  if (isScanning) return;
  console.log("Starting scanner...");
  const statusEl = document.getElementById('scanStatus');
  statusEl.textContent = "Loading camera...";

  try {
    await loadQRScanner();
    document.getElementById('cameraModal').classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    isScanning = true;

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    statusEl.textContent = "Position barcode in the frame...";

    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        console.log("Barcode scanned:", decodedText);
        statusEl.textContent = "✓ Scanned: " + decodedText;
        const digits = decodedText.replace(/\D/g, '');
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
        html5QrCode = null;
        isScanning = false;
        document.getElementById('cameraModal').classList.add('hidden');
        statusEl.textContent = "Position barcode in the frame...";
      })
      .catch(err => {
        console.error("Error stopping scanner:", err);
        html5QrCode = null;
        isScanning = false;
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
  const scanBtn   = document.getElementById("scanBtn");
  const closeBtn  = document.getElementById("closeScan");
  const udiToggle = document.getElementById("udiToggle");
  const udiGenBtn = document.getElementById("udiGenBtn");

  console.log("attachScannerListeners called");
  console.log("udiToggle found:", !!udiToggle);
  console.log("udiGenBtn found:", !!udiGenBtn);

  if (scanBtn)   scanBtn.addEventListener("click",   (e) => { e.preventDefault(); startScan(); });
  if (closeBtn)  closeBtn.addEventListener("click",  (e) => { e.preventDefault(); stopScan(); });
  if (udiToggle) udiToggle.addEventListener("click", (e) => { e.preventDefault(); console.log("udiToggle clicked!"); window.toggleUDIPanel(); });
  if (udiGenBtn) udiGenBtn.addEventListener("click", (e) => { e.preventDefault(); console.log("udiGenBtn clicked!"); window.runGenerateSlips(); });
}

// =====================================================
// UDI SLIP GENERATOR
// =====================================================

window.toggleUDIPanel = function () {
  console.log("toggleUDIPanel called!");
  const toggle = document.getElementById("udiToggle");
  const panel  = document.getElementById("udiPanel");
  console.log("panel:", panel);
  console.log("toggle:", toggle);
  const isOpen = panel.classList.contains("open");
  console.log("isOpen:", isOpen);

  if (isOpen) {
    panel.classList.remove("open");
    toggle.classList.remove("open");
  } else {
    panel.classList.add("open");
    toggle.classList.add("open");
  }
};

window.runGenerateSlips = async function () {
  const dateVal = document.getElementById("udiDate").value;

  if (!dateVal) {
    alert("Please select a fundraiser date.");
    return;
  }

  if (!branchLetter) {
    alert("Branch not detected. Please sign in first.");
    return;
  }

  const loadingEl  = document.getElementById("udiLoading");
  const resultEl   = document.getElementById("udiResult");
  const errorEl    = document.getElementById("udiError");
  const btn        = document.getElementById("udiGenBtn");
  const barFill    = document.getElementById("udiBarFill");
  const loadingTxt = document.getElementById("udiLoadingText");

  resultEl.style.display = "none";
  errorEl.style.display  = "none";
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

    const res = await fetch(SCRIPT_URL, {
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
};

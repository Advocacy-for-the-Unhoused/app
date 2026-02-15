// app.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxYhHHWXyVuuBDRxpgtsUxJStzeJh_mI_P_nCBzj6yOT9D5OlEk7ViGMe8KjAq7oQw/exec";

let volunteerEmail = null;
let volunteerName = null;
let branchLetter = null;
let branchName = null;

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
  const payload = parseJwt(window.googleCredential || "");
  if (!payload || !payload.email) {
    alert("Could not read your Google account. Please try again.");
    return;
  }

  volunteerEmail = payload.email;

  // POST WITHOUT JSON HEADERS (NO PREFLIGHT)
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ lookupEmail: volunteerEmail })
  });

  const info = await res.json();
  volunteerName = info.firstName;
  branchLetter = info.branchCode;
  branchName = info.branchName;

  document.getElementById("welcomeMessage").innerText =
    `Welcome, ${volunteerName}! (${branchName} Branch)`;

  document.getElementById("authCard").classList.add("hidden");
  document.getElementById("appContent").classList.remove("hidden");
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
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(rec)
      });
      const json = await res.json();
      if (json.success) await deleteDonation(rec.id);
    } catch {
      break;
    }
  }
}

window.addEventListener('online', syncDonations);

// ===== DONATION UI =====
function pad2(n) { return n.toString().padStart(2, '0'); }

window.submitDonation = async function () {
  if (!volunteerEmail) {
    alert("Please sign in first.");
    return;
  }

  const digits = parseInt(document.getElementById("udiDigits").value);
  const amount = document.getElementById("amount").value;
  const fundraiser = document.getElementById("fundraiser").value;

  if (!digits || digits < 1 || digits > 48) {
    alert("UDI digits must be between 01–48");
    return;
  }
  if (!amount || amount <= 0) {
    alert("Enter a valid donation amount.");
    return;
  }

  const today = new Date();
  const mm = pad2(today.getMonth() + 1);
  const dd = pad2(today.getDate());
  const yy = pad2(today.getFullYear() % 100);

  const udi = branchLetter + mm + dd + yy + "-" + pad2(digits);

  const record = {
    udi,
    amount: Number(amount),
    branchLetter,
    fundraiser,
    volunteerEmail,
    timestamp: Date.now()
  };

  await saveDonationOffline(record);
  await syncDonations();

  document.getElementById("step2").classList.add("hidden");
  document.getElementById("step3").classList.remove("hidden");
  document.getElementById("finalUDI").innerText = udi;
};

window.restart = function () {
  document.getElementById("step3").classList.add("hidden");
  document.getElementById("step2").classList.remove("hidden");
};

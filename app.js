// app.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwM8DrClchV9B5bfKYMaDURSRzTqlHA3mIVfKLe5HNO85zQYys2rL55WXSDEz89_PxS/exec";

let volunteerEmail = null;
let volunteerName = null;
let branchLetter = null;
let branchName = null;

console.log("App.js v2 loaded!");

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
function submitDonation() {
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

  saveDonationOffline(record).then(() => syncDonations()).then(() => {
    document.getElementById("finalUDI").innerText = udi;
    document.getElementById("step2").classList.add("hidden");
    document.getElementById("step3").classList.remove("hidden");

    if (!navigator.onLine) {
      alert("Saved offline. Will sync when connection is restored.");
    }
  }).catch(err => {
    console.error("Error saving donation:", err);
    alert("Error saving donation: " + err.message);
  });
}

function restart() {
  document.getElementById("udiDigits").value = "";
  document.getElementById("amount").value = "";
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
    script.src

// app.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxsqG2skviumSElKeolgMWhBKmZ3I8_wTz8YOWb1UkaR8V4FkHCbPJXeBN0fXSeUK1L/exec";  // UPDATE THIS!

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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    console.log("Response status:", res.status);
    const responseText = await res.text();
    console.log("Raw response:", responseText);
    
    const info = JSON.parse(responseText);
    console.log("Parsed info:", info);

    volunteerName = info.firstName;
    branchLetter = info.branchCode;
    branchName = info.branchName;

    console.log("Set variables:", { volunteerName, branchLetter, branchName });

    document.getElementById("welcomeMessage").innerText =
      `Welcome, ${volunteerName}! (${branchName} Branch)`;

    document.getElementById("authCard").classList.add("hidden");
    document.getElementById("appContent").classList.remove("hidden");
    
    await syncDonations();
  } catch (err) {
    console.error("Error during lookup:", err);
    alert("Could not connect to server. Error: " + err.message);
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
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
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
// BARCODE SCANNER (ADDED — NO OTHER CODE MODIFIED)
// =====================================================
async function startScan() {
  if (!("BarcodeDetector" in window)) {
    alert("Barcode scanning is not supported on this device.");
    return;
  }

  const detector = new BarcodeDetector({
    formats: ["code_128", "ean_13", "qr_code"]
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    const scanFrame = async () => {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue;

          // Extract last 3 digits for your UDI format
          const digits = value.replace(/\D/g, "").slice(-3);

          document.getElementById("udiDigits").value = digits;

          stream.getTracks().forEach(t => t.stop());
          return;
        }
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame(scanFrame);
    };

    scanFrame();
  } catch (err) {
    alert("Camera access denied or unavailable.");
  }
}

document.getElementById("scanBtn").addEventListener("click", startScan);

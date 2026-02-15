// app.js

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyuYlDNvZ9rvw-k3PtCaz7P0TgTBZNt0NAiNlKVvdNSSXdjYMCXqr6mRcXG_Liny_ei/exec";

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
  console.log("Signed in as:", volunteerEmail);

  // FORM-ENCODED POST (NO PREFLIGHT)
  const body = `lookupEmail=${encodeURIComponent(volunteerEmail)}`;
  console.log("Sending lookup request with body:", body);

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
    
    // Try to sync any pending donations
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
        .filter(([k]) => k !== 'id') // Don't send IndexedDB's auto-generated id
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
        // UDI already in sheet, remove from queue
        await deleteDonation(rec.id);
      }
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

  try {
    await saveDonationOffline(record);
    const synced = await syncDonations();
    
    // Show confirmation
    document.getElementById("finalUDI").innerText = udi;
    document.getElementById("step2").classList.add("hidden");
    document.getElementById("step3").classList.remove("hidden");
    
    if (!navigator.onLine) {
      alert("Saved offline. Will sync when connection is restored.");
    }
  } catch (err) {
    alert("Error saving donation: " + err.message);
  }
};

window.restart = function () {
  // Clear form
  document.getElementById("udiDigits").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("fundraiser").value = "Candle";
  
  // Show form, hide confirmation
  document.getElementById("step3").classList.add("hidden");
  document.getElementById("step2").classList.remove("hidden");
};
```

**Now test it and check your browser console:**

1. Right-click on the page → "Inspect" → "Console" tab
2. Sign in with Google
3. Look at the console logs

You should see output like:
```
Signed in as: youremail@gmail.com
Sending lookup request with body: lookupEmail=youremail%40gmail.com
Response status: 200
Raw response: {"firstName":"John","branchCode":"A","branchName":"Hopkinton"}

// app.js

const SCRIPT_URL = "SCRIPT_URL_HERE"; // Apps Script web app URL
let lastBranch = null;
let lastTeam = null;
let volunteerEmail = null;

// --- Simple JWT email extraction (not security-grade; backend should verify token) ---
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

window.onSignedIn = function() {
  const payload = parseJwt(window.googleCredential || "");
  if (!payload || !payload.email) {
    alert("Could not read your Google account. Please try again.");
    return;
  }
  volunteerEmail = payload.email;

  document.getElementById("authCard").classList.add("hidden");
  document.getElementById("appContent").classList.remove("hidden");
};

// --- IndexedDB for offline donations ---
let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("AFU_DB", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
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
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getUnsyncedDonations() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readonly");
    const store = tx.objectStore("donations");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDonation(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("donations", "readwrite");
    tx.objectStore("donations").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Sync engine ---
async function syncDonations() {
  if (!navigator.onLine) return;
  const pending = await getUnsyncedDonations();
  for (const rec of pending) {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rec)
      });
      const json = await res.json();
      if (json.success) {
        await deleteDonation(rec.id);
      }
    } catch (e) {
      // stop on first failure to avoid hammering
      break;
    }
  }
}

window.addEventListener('online', syncDonations);

// --- UI logic (adapted from your original) ---
function pad2(n){ return n.toString().padStart(2,'0'); }

window.gotoStep2 = function() {
  let branch = document.getElementById("branch").value;
  let team = document.getElementById("team").value;

  if (lastBranch && lastTeam && !branch && !team) {
    branch = lastBranch;
    team = lastTeam;
  }

  if (!branch) { alert("Please select a branch."); return; }
  if (!team) { alert("Please select a team."); return; }

  lastBranch = branch;
  lastTeam = team;

  document.getElementById("step1").classList.add("hidden");
  document.getElementById("step2").classList.remove("hidden");

  document.getElementById("selectedBranch").innerText = branch;
  document.getElementById("selectedTeam").innerText = team;

  const today = new Date();
  const mm = pad2(today.getMonth()+1);
  const dd = pad2(today.getDate());
  const yy = pad2(today.getFullYear()%100);
  document.getElementById("todayDate").innerText = mm+dd+yy;

  const teamRanges = {1:[1,16],2:[17,32],3:[33,48]};
  document.getElementById("udiDigits").dataset.min = teamRanges[team][0];
  document.getElementById("udiDigits").dataset.max = teamRanges[team][1];
  document.getElementById("udiDigits").placeholder = teamRanges[team][0]+"–"+teamRanges[team][1];

  document.getElementById("udiDigits").value = "";
  document.getElementById("amount").value = "";
};

window.submitDonation = async function() {
  if (!volunteerEmail) {
    alert("Please sign in first.");
    return;
  }

  const branch = lastBranch;
  const team = lastTeam;
  const digits = parseInt(document.getElementById("udiDigits").value);
  const amount = document.getElementById("amount").value;
  const fundraiser = document.getElementById("fundraiser").value;
  const min = parseInt(document.getElementById("udiDigits").dataset.min);
  const max = parseInt(document.getElementById("udiDigits").dataset.max);

  if (!digits || digits<min || digits>max){
    alert("UDI digits must be between "+min+"–"+max);
    return;
  }
  if (!amount || amount<=0){ alert("Enter a valid donation amount."); return; }
  if (!fundraiser){ alert("Please select a fundraiser."); return; }

  const today = new Date();
  const mm = pad2(today.getMonth()+1);
  const dd = pad2(today.getDate());
  const yy = pad2(today.getFullYear()%100);
  const udi = branch + mm + dd + yy + "-" + pad2(digits);

  const statusEl = document.getElementById("status");
  statusEl.innerText = "Saving donation...";

  const record = {
    udi,
    amount: Number(amount),
    branchLetter: branch,
    team,
    fundraiser,
    volunteerEmail,
    timestamp: Date.now()
  };

  // Save offline first
  await saveDonationOffline(record);

  // Try to sync immediately if online
  await syncDonations();

  document.getElementById("step2").classList.add("hidden");
  document.getElementById("step3").classList.remove("hidden");
  document.getElementById("finalUDI").innerText = udi;
  statusEl.innerText = "";
};

window.restart = function() {
  document.getElementById("step3").classList.add("hidden");

  if (lastBranch && lastTeam) {
    document.getElementById("step2").classList.remove("hidden");

    document.getElementById("selectedBranch").innerText = lastBranch;
    document.getElementById("selectedTeam").innerText = lastTeam;

    const today = new Date();
    const mm = pad2(today.getMonth()+1);
    const dd = pad2(today.getDate());
    const yy = pad2(today.getFullYear()%100);
    document.getElementById("todayDate").innerText = mm+dd+yy;

    const teamRanges = {1:[1,16],2:[17,32],3:[33,48]};
    document.getElementById("udiDigits").dataset.min = teamRanges[lastTeam][0];
    document.getElementById("udiDigits").dataset.max = teamRanges[lastTeam][1];
    document.getElementById("udiDigits").placeholder = teamRanges[lastTeam][0]+"–"+teamRanges[lastTeam][1];

    document.getElementById("udiDigits").value = "";
    document.getElementById("amount").value = "";
  } else {
    document.getElementById("step1").classList.remove("hidden");
    document.getElementById("step2").classList.add("hidden");

    document.getElementById("branch").value = "";
    document.getElementById("team").value = "";
    document.getElementById("udiDigits").value = "";
    document.getElementById("amount").value = "";
  }
};


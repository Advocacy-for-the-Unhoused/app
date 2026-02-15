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

  volunteerEmail = payload.e

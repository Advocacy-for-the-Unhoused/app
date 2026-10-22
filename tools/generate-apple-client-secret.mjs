// Generates the ES256 "client secret" JWT that Apple requires for the
// token (/auth/token) and revoke (/auth/revoke) endpoints used by account
// deletion (Guideline 5.1.1(v)). Google Apps Script can't sign ES256, so we
// generate the JWT here and paste it into Script Properties as
// APPLE_CLIENT_SECRET. Apple caps the lifetime at ~6 months — rerun this
// before it expires.
//
// Usage (PowerShell or any shell):
//   node tools/generate-apple-client-secret.mjs <TEAM_ID> <KEY_ID> <path-to-AuthKey.p8>
//
// Example:
//   node tools/generate-apple-client-secret.mjs A1B2C3D4E5 9ZZ8YY7XX6 "C:\Users\madha\Downloads\AuthKey_9ZZ8YY7XX6.p8"
//
// Do NOT commit your .p8 file or the printed secret.

import crypto from 'node:crypto';
import fs from 'node:fs';

const CLIENT_ID = 'com.afu.volunteerportal'; // the app's bundle id
const EXP_DAYS  = 150;                        // under Apple's ~6-month (180d) cap

const [teamId, keyId, keyPath] = process.argv.slice(2);
if (!teamId || !keyId || !keyPath) {
  console.error('Usage: node tools/generate-apple-client-secret.mjs <TEAM_ID> <KEY_ID> <path-to-.p8>');
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
const now = Math.floor(Date.now() / 1000);

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

const header  = b64url({ alg: 'ES256', kid: keyId });
const payload = b64url({
  iss: teamId,
  iat: now,
  exp: now + EXP_DAYS * 24 * 60 * 60,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
});

const signingInput = `${header}.${payload}`;
// JWT needs the raw (IEEE P1363) r||s signature, not DER — Node supports this
// via dsaEncoding.
const signature = crypto
  .sign('sha256', Buffer.from(signingInput), {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  })
  .toString('base64url');

const jwt = `${signingInput}.${signature}`;

const expDate = new Date((now + EXP_DAYS * 24 * 60 * 60) * 1000).toISOString();
console.log('\nAPPLE_CLIENT_ID     =', CLIENT_ID);
console.log('APPLE_CLIENT_SECRET =\n' + jwt);
console.log('\nExpires:', expDate, `(regenerate before then)\n`);

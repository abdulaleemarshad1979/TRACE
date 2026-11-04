// Run locally with a Firebase CLI login that can manage Authentication users.
// Never publish the generated plan: it contains the new password in plain text.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/staging.json'), 'utf8'));
const projectId = config.projectId;
const instance = new URL(config.databaseURL).hostname.split('.')[0];
const defaultPlan = path.join(root, '.local-data/route-password-reset-plan.json');
const firebaseBin = path.join(root, 'node_modules/.bin/firebase');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function fail(message) { throw new Error(message); }
function dbGet(where) {
  const result = spawnSync(firebaseBin, ['database:get', where, '--project', projectId, '--instance', instance], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) fail(`Could not read ${where} from ${projectId}: ${(result.stderr || '').trim().slice(-400)}`);
  try { return JSON.parse(result.stdout); }
  catch (_) { fail(`Could not parse ${where} from ${projectId}.`); }
}
function roster() {
  const assignments = dbGet('/assignments') || {};
  const roles = dbGet('/roles') || {};
  const seenEmails = new Set();
  const people = Object.entries(assignments).map(([uid, assignment]) => {
    if (roles[uid] !== 'route') fail(`An assignment is not a route account (${uid}).`);
    const ps = String(assignment?.ps || '').trim();
    const digits = String(assignment?.mobile || '').replace(/\D/g, '');
    if (!ps || !/^(?:91)?\d{10}$/.test(digits)) fail(`An assignment has no PS or valid mobile (${uid}).`);
    const email = `phone91${digits.slice(-10)}@members.track.invalid`;
    if (seenEmails.has(email)) fail(`Two route assignments share a mobile login (${uid}).`);
    seenEmails.add(email);
    return { uid, ps, email };
  }).sort((a, b) => a.uid.localeCompare(b.uid));
  if (!people.length) fail('No route assignments found; refusing to create an empty reset plan.');
  return people;
}
function digest(people) {
  return crypto.createHash('sha256').update(JSON.stringify(people)).digest('hex');
}
function newPassword() {
  const random = crypto.randomBytes(20);
  return Array.from(random, byte => alphabet[byte % alphabet.length]).join('');
}
function plannedPassword() {
  if (!process.argv.includes('--password-stdin')) return newPassword();
  const password = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (!/^[\x20-\x7e]{8,128}$/.test(password)) fail('The supplied password must be 8-128 printable characters.');
  return password;
}
function stationCounts(people) {
  const counts = new Map();
  people.forEach(person => counts.set(person.ps, (counts.get(person.ps) || 0) + 1));
  return [...counts].map(([ps, count]) => ({ ps, count }))
    .sort((a, b) => a.ps.localeCompare(b.ps, 'en', { numeric: true }));
}
async function accessToken() {
  // firebase-tools uses the same logged-in operator as `firebase database:get`.
  const auth = require('firebase-tools/lib/auth');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) fail('Run `npx firebase login` with a project administrator account first.');
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  return token.access_token;
}
async function authRequest(action, payload, token) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${action}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) fail(`Firebase Authentication ${action} failed (${response.status}): ${result.error?.message || 'unknown error'}`);
  return result;
}
async function verifyAccounts(people, token) {
  for (let start = 0; start < people.length; start += 100) {
    const batch = people.slice(start, start + 100);
    const result = await authRequest('lookup', { localId: batch.map(person => person.uid) }, token);
    const byUid = new Map((result.users || []).map(user => [user.localId, user]));
    for (const person of batch) {
      const user = byUid.get(person.uid);
      if (!user || user.email?.toLowerCase() !== person.email) fail(`An assigned officer's Authentication login is missing or differs (${person.uid}). No passwords were changed.`);
    }
  }
}
function writePrivate(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(contents, null, 2) + '\n'); }
  finally { fs.closeSync(fd); }
}
function readPrivate(file) {
  const stat = fs.statSync(file);
  if (stat.mode & 0o077) fail(`Restrict ${file} to owner access (chmod 600) before continuing.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] || fail(`Missing value after ${name}.`);
}

async function main() {
  const command = process.argv[2];
  const planPath = path.resolve(option('--plan', defaultPlan));
  if (!['plan', 'apply'].includes(command)) fail('Use `node tools/reset-route-passwords.mjs plan` or `apply --confirm-project officer-8eb52 --confirm-count NUMBER`.');
  const people = roster();
  const token = await accessToken();
  await verifyAccounts(people, token);
  const stations = stationCounts(people);
  if (command === 'plan') {
    const plan = {
      schema: 1, projectId, createdAt: new Date().toISOString(), officerCount: people.length,
      stationCount: stations.length, stations, rosterDigest: digest(people), password: plannedPassword()
    };
    writePrivate(planPath, plan);
    console.log(`Verified ${people.length} route officer logins across ${stations.length} PS. No passwords changed.`);
    console.log(`Private plan: ${planPath} (owner-only access; contains one new password for all officers).`);
    return;
  }
  const plan = readPrivate(planPath);
  if (plan.schema !== 1 || plan.projectId !== projectId || plan.rosterDigest !== digest(people) || plan.officerCount !== people.length) fail('The plan does not match the current live route assignments. Create a new plan.');
  if (process.argv.includes('--confirm-project') && option('--confirm-project') !== projectId) fail('Project confirmation does not match.');
  if (!process.argv.includes('--confirm-project') || Number(option('--confirm-count', -1)) !== people.length) fail(`Apply requires --confirm-project ${projectId} --confirm-count ${people.length}.`);
  if (!/^[\x20-\x7e]{8,128}$/.test(plan.password)) fail('The plan password is invalid.');
  const resultPath = planPath.replace(/\.json$/, '') + '-result.json';
  let result = fs.existsSync(resultPath) ? readPrivate(resultPath) : { projectId, rosterDigest: plan.rosterDigest, changed: [], failed: [] };
  if (result.projectId !== projectId || result.rosterDigest !== plan.rosterDigest) fail('Existing result file belongs to a different reset plan.');
  const changed = new Set(result.changed);
  for (const person of people) {
    if (changed.has(person.uid)) continue;
    try {
      await authRequest('update', { localId: person.uid, password: plan.password }, token);
      changed.add(person.uid);
      result.changed = [...changed];
      result.failed = result.failed.filter(entry => entry.uid !== person.uid);
    } catch (error) {
      result.failed = [...result.failed.filter(entry => entry.uid !== person.uid), { uid: person.uid, message: error.message }];
      if (/\(401\)|\(403\)/.test(error.message)) {
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
        throw error;
      }
    }
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    if (changed.size % 10 === 0) console.log(`${changed.size} of ${people.length} route passwords changed.`);
  }
  console.log(`${changed.size} changed; ${result.failed.length} failed. Result: ${resultPath}`);
  if (result.failed.length) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });

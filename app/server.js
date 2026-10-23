// General Handyman Solutions — app server (no dependencies, Node >= 18)
// Roles: customer, worker, admin (Gabriel)
// Data: local JSON file (DATA_FILE env or ./data.json). Good for v1; move to a real DB later.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SETUP_CODE = process.env.SETUP_CODE || ''; // reserved; first-admin bootstrap is one-time while no admin exists
const MAX_BODY_BYTES = 24 * 1024 * 1024; // hard cap on any request body (photos travel as data URLs; the client resizes them first)
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // server-side session lifetime — matches the cookie Max-Age
const GHS_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://unpkg.com; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://unpkg.com; style-src-attr 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://api.stripe.com https://m.stripe.network https://m.stripe.com https://nominatim.openstreetmap.org; frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'";

let db = { users: [], requests: [], jobs: [], notifications: [], invoices: [], yardVisits: [] };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
if (!Array.isArray(db.yardVisits)) db.yardVisits = [];
if (!Array.isArray(db.auditLog)) db.auditLog = [];
// Permanent storage: when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (Render),
// the whole app state lives in Supabase table ghs_state (key 'app'), so accounts,
// requests and jobs survive redeploys and restarts. Local file is the fallback.
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
let sbQueue = Promise.resolve();
function save() {
  if (SB_URL && SB_KEY) {
    const payload = JSON.stringify(db);
    sbQueue = sbQueue.then(() => fetch(SB_URL + '/rest/v1/ghs_state', {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify([{ key: 'app', value: JSON.parse(payload), updated_at: new Date().toISOString() }])
    }).catch(e => console.error('supabase save failed', e.message)));
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
async function loadFromSupabase() {
  if (!SB_URL || !SB_KEY) return;
  try {
    const r = await fetch(SB_URL + '/rest/v1/ghs_state?key=eq.app&select=value', { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } });
    const rows = await r.json();
    if (Array.isArray(rows) && rows[0] && rows[0].value && Array.isArray(rows[0].value.users)) db = rows[0].value;
    if (!Array.isArray(db.notifications)) db.notifications = [];
    if (!Array.isArray(db.invoices)) db.invoices = [];
    if (!Array.isArray(db.yardVisits)) db.yardVisits = [];
if (!Array.isArray(db.auditLog)) db.auditLog = [];
    if (!db.settings || typeof db.settings !== 'object') db.settings = {};
    console.log('Loaded state from Supabase (' + db.users.length + ' users, ' + db.requests.length + ' requests, ' + db.jobs.length + ' jobs)');
  } catch (e) { console.error('supabase load failed', e.message); }
}
const sessions = new Map(); // token -> { uid, exp } — sessions expire server-side too, not just in the browser

function id(p) { return p + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function hashPw(pw) { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); }
function checkPw(pw, stored) { const [s, h] = stored.split(':'); const t = crypto.scryptSync(pw, s, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(t)); }
function pubUser(u) { const membershipPlan = membershipPlanOf(u); const captainArea = (u.role === 'worker' && Array.isArray(db.areas)) ? db.areas.find(a => a.captainId && a.captainId === u.id) : null; return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || '', serviceAddress: u.serviceAddress || '', zipCode: u.zipCode || '', homeType: u.homeType || '', yardSize: u.yardSize || '', homeNotes: u.homeNotes || '', startPreference: normalizeStartPreference(u.startPreference), status: u.status || 'active', skills: u.skills || [], vehicle: u.vehicle || '', profile: u.profile || {}, homeCareStatus: u.homeCareStatus || 'none', homeCareSince: u.homeCareSince || null, homeCareCancelAt: u.homeCareCancelAt || null, membershipPlan, membershipType: membershipPlan.type, membershipVisitsPerMonth: membershipPlan.visitsPerMonth, freeEstimateUsed: !!u.freeEstimateUsed, payoutsSetup: u.stripeAccountId ? (!!u.stripePayoutsReady ? 'ready' : 'pending') : 'none', payoutsReady: !!u.stripePayoutsReady, captainAreaId: captainArea ? captainArea.id : null, captainAreaName: captainArea ? captainArea.name : null, createdAt: u.createdAt }; }
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json' }, headers || {}));
  res.end(body);
}
function readBody(req) { return new Promise(r => { let b = ''; let over = false; req.on('data', c => { if (!over) { b += c; if (b.length > MAX_BODY_BYTES) { over = true; b = ''; } } }); req.on('end', () => { if (over) return r({ __tooLarge: true }); try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }
function sessionUserId(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.exp) { sessions.delete(token); return null; }
  return s.uid;
}
function auth(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer) { const uid = sessionUserId(bearer); if (uid) return db.users.find(u => u.id === uid) || null; }
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ghs_session='));
  if (!cookie) return null;
  const uid = sessionUserId(cookie.slice('ghs_session='.length));
  return db.users.find(u => u.id === uid) || null;
}
function newSession(u) { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { uid: u.id, exp: Date.now() + SESSION_TTL_MS }); return token; }
function invalidateSessionsFor(userId) { for (const [token, s] of sessions) { if (s && s.uid === userId) sessions.delete(token); } }
function isHttpsReq(req) { return String((req.headers && req.headers['x-forwarded-proto']) || '').split(',')[0].trim() === 'https'; }
function sessionCookie(token, req) { return 'ghs_session=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000' + (isHttpsReq(req) ? '; Secure' : ''); }
function clientIp(req) { const xff = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim(); return xff || (req.socket && req.socket.remoteAddress) || 'unknown'; }
// ---------- Password reset (added 2026-10-21, v20) ----------
// "Forgot my password": the raw token only ever travels in the emailed
// link; the user record keeps ONLY its sha256 hash + a 60-minute expiry
// (u.pwReset = { hash, expiresAt }). A new request replaces the old token,
// a successful reset consumes it, and every existing session for the
// account is invalidated at reset. The endpoint answers identically
// whether or not the email has an account — no account enumeration.
function sha256hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
const pwResetAttempts = new Map(); // email -> [ms timestamps], in-memory rate limit
function pwResetRateOk(email) {
  const now = Date.now();
  const recent = (pwResetAttempts.get(email) || []).filter(ts => now - ts < 3600000);
  if (recent.length >= 5) { pwResetAttempts.set(email, recent); return false; }
  recent.push(now); pwResetAttempts.set(email, recent); return true;
}
const PW_RESET_GENERIC = 'If that email has an account, we\'ve sent a reset link';
// ---------- Login throttle (v33 security) ----------
// Failed sign-ins are counted per IP + email over a 15-minute window; past
// the cap the endpoint answers 429 until the window slides. A successful
// sign-in clears the record. In-memory like the reset limiter — a restart
// forgives the counters, which is acceptable for v1.
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000, LOGIN_MAX_FAILS = 10;
function loginKey(req, email) { return clientIp(req) + '|' + String(email || '').toLowerCase(); }
function loginBlockedSecs(req, email) {
  const k = loginKey(req, email);
  const rec = loginAttempts.get(k);
  if (!rec) return 0;
  const now = Date.now();
  rec.fails = rec.fails.filter(ts => now - ts < LOGIN_WINDOW_MS);
  if (!rec.fails.length) { loginAttempts.delete(k); return 0; }
  return rec.fails.length >= LOGIN_MAX_FAILS ? Math.max(1, Math.ceil((rec.fails[0] + LOGIN_WINDOW_MS - now) / 1000)) : 0;
}
function noteLoginFailure(req, email) { const k = loginKey(req, email); const rec = loginAttempts.get(k) || { fails: [] }; rec.fails.push(Date.now()); loginAttempts.set(k, rec); }
async function sendPasswordResetEmail(u, token) {
  const link = appBase() + '/#reset=' + token;
  const html = mailShell('Reset your password',
    '<p style="margin:6px 0">Hi ' + escMail(u.name || 'there') + ', we got a request to reset the password for your General Handyman Solutions account.</p>'
    + '<p style="margin:6px 0"><a href="' + link + '" style="background:#d92323;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold;display:inline-block">Set a new password</a></p>'
    + '<p style="margin:6px 0">Or open this link: ' + escMail(link) + '</p>'
    + '<p style="margin:6px 0">This link expires in 1 hour. If you did not request a password reset, you can ignore this email — your password will not change.</p>');
  const text = ['General Handyman Solutions — reset your password', '', 'Hi ' + (u.name || 'there') + ', we got a request to reset the password for your account.', 'Open this link to set a new password: ' + link, 'This link expires in 1 hour. If you did not request a password reset, you can ignore this email — your password will not change.'].join('\n');
  return sendMail({ to: [u.email], replyTo: OWNER_EMAIL, subject: 'Reset your password — General Handyman Solutions', html, text });
}
function requireRole(user, roles, res) { if (!user) { send(res, 401, { error: 'login required' }); return false; } if (!roles.includes(user.role)) { send(res, 403, { error: 'not allowed' }); return false; } return true; }
// ---------- notifications ----------
function notify(userId, type, text) {
  if (!userId || !text) return;
  if (!Array.isArray(db.notifications)) db.notifications = [];
  db.notifications.push({ id: id('NTF'), userId, type: type || 'info', text, read: false, at: new Date().toISOString() });
  if (db.notifications.length > 2000) db.notifications = db.notifications.slice(-2000);
}
function notifyAdmins(type, text) { db.users.filter(u => u.role === 'admin').forEach(a => notify(a.id, type, text)); }
// ---------- Admin audit log (v33 security) ----------
// Every admin action and money movement lands here (who, what, which
// record, when) so Gabriel can review the trail in his panel. Capped at
// the newest 500 entries; served only by GET /api/admin/audit.
function audit(actor, action, target, detail) {
  if (!Array.isArray(db.auditLog)) db.auditLog = [];
  db.auditLog.push({ id: id('AUD'), at: new Date().toISOString(), actorId: actor ? actor.id : null, actorEmail: actor ? (actor.email || '') : '', action: String(action || ''), target: String(target || ''), detail: String(detail || '').slice(0, 300) });
  if (db.auditLog.length > 500) db.auditLog = db.auditLog.slice(-500);
}
function workerAreas(w) {
  const prof = w.profile || {};
  const raw = prof.areas || prof.serviceAreas || prof.wAreas || '';
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,;]/);
  return list.map(s => String(s).toLowerCase().trim()).filter(Boolean);
}
// ---------- Area captains (v40 — MODELO-CAPITANES.md, owner-confirmed) ----------
// Gabriel is Nivel 1 "El General" — the title is his alone, never assigned
// or delegated. Captains command ONE area under him; Fairfield is his own
// base (seeded fixed: captain shows as "El General", NOT assignable, and
// accrues nothing). A captain's override is 5% FIXED of the job's charged
// labor total, paid from the HOUSE side — never deducted from the
// technician's pay — and accrues only when the job reaches
// 'Done — photos sent' with the payment actually captured. Exclusions
// mirror the client menu's member-discount exclusion set (the catalog's
// member:null entries): flat $75 services, junk removal and
// hauling / green waste. Captains never touch money, never set prices,
// never see other areas and never contact customers directly. Payouts are
// manual (the owner marks them paid); no Connect auto-transfers, no
// sign-up bounties (not signed yet), no customer-facing captain display.
const CAPTAIN_OVERRIDE_RATE = 0.05;
const CAPTAIN_EXCLUDED_SERVICE_IDS = ['oil-change', 'junk-minimum', 'junk-medium', 'junk-large', 'junk-full', 'green-waste'];
const CAPTAIN_AREA_SEED = [
  { name: 'Fairfield', cities: ['Fairfield', 'Suisun City', 'Dixon', 'Rio Vista', 'Benicia'], fixed: true },
  { name: 'Vacaville', cities: ['Vacaville'] },
  { name: 'Vallejo', cities: ['Vallejo'] },
  { name: 'Napa', cities: ['Napa', 'Yountville', 'St Helena', 'American Canyon'] },
  { name: 'Antioch / Concord', cities: ['Antioch', 'Concord'] },
  { name: 'Santa Rosa / Marin', cities: ['Santa Rosa', 'Petaluma', 'San Rafael', 'Novato'] },
  { name: 'San Jose', cities: ['San Jose', 'Sunnyvale'] }
];
function ensureCaptainState() {
  if (!Array.isArray(db.captainLedger)) db.captainLedger = [];
  if (!Array.isArray(db.captainPayouts)) db.captainPayouts = [];
  if (!Array.isArray(db.areas) || !db.areas.length) {
    db.areas = CAPTAIN_AREA_SEED.map((s, i) => ({ id: 'AREA-' + (i + 1), name: s.name, cities: s.cities.slice(), fixed: !!s.fixed, captainId: s.fixed ? 'general' : null, createdAt: new Date().toISOString() }));
  }
}
function normAreaCity(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function areaForCity(city) {
  ensureCaptainState();
  const c = normAreaCity(city);
  if (!c) return null;
  return db.areas.find(a => (a.cities || []).some(x => normAreaCity(x) === c)) || null;
}
function areaById(areaId) { ensureCaptainState(); return db.areas.find(a => a.id === areaId) || null; }
function captainAreaOf(workerId) { ensureCaptainState(); return db.areas.find(a => a.captainId && a.captainId === workerId) || null; }
function captainOutstanding(captainId) {
  ensureCaptainState();
  return money(db.captainLedger.filter(e => e.captainId === captainId).reduce((s, e) => s + (Number(e.amount) || 0) - (Number(e.paidAmount) || 0), 0));
}
function captainPaidOut(captainId) {
  ensureCaptainState();
  return money(db.captainPayouts.filter(x => x.captainId === captainId).reduce((s, x) => s + (Number(x.amount) || 0), 0));
}
// The job's charged labor total, from money that ACTUALLY landed: captured
// request holds first (the Stripe trail), else a PAID invoice linked to the
// job/request (the manual cash/Zelle trail). 0 = not captured yet.
function captainChargedAmount(j) {
  const r = j.requestId ? db.requests.find(x => x.id === j.requestId) : null;
  if (r && Array.isArray(r.holds)) {
    const capCents = r.holds.filter(h => h && h.status === 'captured').reduce((s, h) => s + (Number(h.capturedCents) || 0), 0);
    if (capCents > 0) return money(capCents / 100);
  }
  const inv = (db.invoices || []).find(x => x.status === 'paid' && ((x.jobId && x.jobId === j.id) || (j.requestId && x.requestId && x.requestId === j.requestId)));
  if (inv) return money(inv.paidAmount || inv.total || 0);
  return 0;
}
function captainJobExclusion(j, r, charged) {
  const sid = r && r.menuOrder && r.menuOrder.serviceId;
  if (sid && CAPTAIN_EXCLUDED_SERVICE_IDS.includes(sid)) return 'excluded service';
  const svc = String(j.service || (r && r.service) || '').toLowerCase();
  if (/junk|green[\s-]?waste|hauling|haul[\s-]?away/.test(svc)) return 'excluded service';
  if (money(charged) === 75) return 'flat $75 service';
  return '';
}
// Idempotent: j.captainOverride stamps the final decision (accrued entry, or
// a permanent skip: no matching area / El General's own area / excluded
// service). "No captain yet" and "not captured yet" are NOT stamped — the
// payout-style sweep retries them, so a late capture or a later assignment
// still accrues, exactly once.
function accrueCaptainOverride(j) {
  try {
    if (!j || j.captainOverride || j.status !== 'Done — photos sent') return false;
    ensureCaptainState();
    const r = j.requestId ? db.requests.find(x => x.id === j.requestId) : null;
    const area = areaForCity(j.city || (r && r.city) || '');
    if (!area) { j.captainOverride = { skipped: 'no matching area', at: new Date().toISOString() }; return false; }
    if (area.fixed) { j.captainOverride = { skipped: 'El General commands this area', at: new Date().toISOString() }; return false; }
    if (!area.captainId) return false;
    const charged = captainChargedAmount(j);
    if (!(charged > 0)) return false;
    const ex = captainJobExclusion(j, r, charged);
    if (ex) { j.captainOverride = { skipped: ex, charged, at: new Date().toISOString() }; return false; }
    const amount = money(charged * CAPTAIN_OVERRIDE_RATE);
    const entry = { id: id('CAP'), captainId: area.captainId, areaId: area.id, areaName: area.name, jobId: j.id, requestId: j.requestId || null, charged, amount, paidAmount: 0, status: 'accrued', at: new Date().toISOString() };
    db.captainLedger.push(entry);
    j.captainOverride = { entryId: entry.id, captainId: entry.captainId, areaId: area.id, amount, charged, at: entry.at };
    notify(entry.captainId, 'captain', 'Captain override accrued: ' + usd(amount) + ' — 5% of the ' + usd(charged) + ' charged on job ' + j.id + ' (' + area.name + '). The Team pays overrides out by hand.');
    notifyAdmins('captain', 'Captain override accrued in ' + area.name + ': ' + usd(amount) + ' on job ' + j.id + ' (5% of ' + usd(charged) + ').');
    save();
    return true;
  } catch (e) { return false; }
}
let lastCaptainSweep = 0;
function sweepCaptainOverrides() {
  const nowMs = Date.now();
  if (nowMs - lastCaptainSweep < 15000) return;
  lastCaptainSweep = nowMs;
  ensureCaptainState();
  for (const j of db.jobs) { if (j.status === 'Done — photos sent' && !j.captainOverride) accrueCaptainOverride(j); }
}
function captainsAdminPayload() {
  ensureCaptainState(); sweepCaptainOverrides();
  const workers = db.users.filter(u => u.role === 'worker' && u.status === 'active').map(u => ({ id: u.id, name: u.name }));
  const areas = db.areas.map(a => {
    const cap = (!a.fixed && a.captainId) ? db.users.find(u => u.id === a.captainId) : null;
    return { id: a.id, name: a.name, cities: a.cities || [], fixed: !!a.fixed, captainId: a.fixed ? 'general' : (cap ? cap.id : null), captainName: a.fixed ? 'El General' : (cap ? cap.name : null), accrued: cap ? captainOutstanding(cap.id) : 0, paidOut: cap ? captainPaidOut(cap.id) : 0 };
  });
  const ledger = db.captainLedger.slice(-100).reverse().map(e => ({ id: e.id, captainId: e.captainId, captainName: (db.users.find(u => u.id === e.captainId) || {}).name || '', areaName: e.areaName || '', jobId: e.jobId, charged: e.charged, amount: e.amount, paidAmount: e.paidAmount || 0, status: e.status, at: e.at }));
  const payouts = db.captainPayouts.slice(-50).reverse();
  return { areas, workers, ledger, payouts };
}
function workerOverlapsArea(u, area) {
  const cities = new Set((area.cities || []).map(normAreaCity));
  if (workerAreas(u).some(t => cities.has(normAreaCity(t)))) return true;
  const pc = normAreaCity((u.profile || {}).city || '');
  return !!pc && cities.has(pc);
}

function notifyWorkersForJob(j) {
  matchedWorkersForJob(j).forEach(w => {
    notify(w.id, 'job', 'New open job: ' + (j.service || 'Job') + ' in ' + (j.city || 'your area') + ' — pay $' + (j.payOffer || 0) + '. Open the app to claim it.');
  });
}
function publicJob(j, viewer) {
  const assigned = viewer && (viewer.role === 'admin' || j.assignedWorkerId === viewer.id);
  const base = { id: j.id, status: j.status, service: j.service, city: j.city, description: j.description, when: j.when, payOffer: j.payOffer, createdAt: j.createdAt };
  if (viewer && viewer.role === 'admin') return Object.assign({}, j);
  if (assigned) {
    // Gabriel is the only middleman (rule 2026-10-09): the worker NEVER sees
    // the customer's name or phone. Address unlocks only when the Team confirms
    // it (infoReleased). Contact runs through the Team in the job chat.
    const view = Object.assign(base, { mine: true, infoReleased: !!j.infoReleased, notes: j.notes || '', messages: j.messages || [], payoutStatus: j.payoutStatus || null, payoutAt: j.payoutAt || null });
    if (j.infoReleased) view.address = j.address || '';
    // v22 live tracking: the assigned worker sees their OWN live point (it is
    // their phone sharing it). Destination coords ride along with the address
    // gate — coords of the customer's home never leak before infoReleased.
    if (j.liveLoc) view.liveLoc = j.liveLoc;
    if (j.infoReleased && j.destLat != null && j.destLng != null) { view.destLat = j.destLat; view.destLng = j.destLng; }
    return view;
  }
  return base; // workers who have not claimed see NO customer details
}

// ---------- Live technician tracking (added 2026-10-21, v22) ----------
// DoorDash-style: while a job is in 'On my way' status, the assigned
// worker's phone posts its position to POST /api/jobs/:id/location. Only
// the LATEST point is kept (j.liveLoc = { lat, lng, updatedAt }) — never a
// trail. Any status other than 'On my way' deletes the point entirely, so
// arriving / completing / cancelling wipes the coordinates, not archives
// them. The destination is geocoded ONCE per job from the service address
// via OpenStreetMap Nominatim and cached on the job (j.destLat/j.destLng);
// every geocode failure is swallowed — the flow never blocks on it.
const NOMINATIM_BASE = process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org';
const geoInFlight = new Set();
function applyJobStatus(j, status) {
  j.status = status;
  if (status !== 'On my way') delete j.liveLoc;
}
async function geocodeJobDestination(j) {
  if (!j || j.destLat != null || j.destLng != null || !j.address || geoInFlight.has(j.id)) return;
  geoInFlight.add(j.id);
  try {
    const url = NOMINATIM_BASE + '/search?format=json&limit=1&q=' + encodeURIComponent(j.address);
    const r = await fetch(url, { headers: { 'User-Agent': 'GeneralHandymanSolutions/1.0 (generalhandymans@gmail.com)' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return;
    const arr = await r.json().catch(() => null);
    if (Array.isArray(arr) && arr.length && isFinite(Number(arr[0].lat)) && isFinite(Number(arr[0].lon))) {
      j.destLat = Number(arr[0].lat); j.destLng = Number(arr[0].lon); save();
    }
  } catch (e) { /* geocoding is best-effort — it must never block the job flow */ }
  finally { geoInFlight.delete(j.id); }
}
function jobCustomer(j) {
  return db.users.find(x => x.role === 'customer' && j.customerPhone && x.phone && x.phone.replace(/\D/g, '') === String(j.customerPhone).replace(/\D/g, '')) || null;
}

// ---------- Live event stream (SSE, added 2026-10-21, v23) ----------
// GET /api/events pushes state changes to the open app the moment they
// happen — the live map and the notification chime no longer wait for a
// poll. Every mutation path emits EXACTLY ONE event through the helpers
// below (one emit per mutation, no storms). Delivery is scoped per
// connection by role, mirroring what each role can already see over REST:
//   admin    -> everything
//   customer -> only their own jobs (phone match or linked request)
//   worker   -> the Open board + their own claimed jobs (active workers)
// Heartbeats are SSE comment lines so proxies (Render) don't reap idle
// streams; SSE_HEARTBEAT_MS tunes the interval (tests shorten it).
const SSE_HEARTBEAT_MS = Math.max(250, Number(process.env.SSE_HEARTBEAT_MS) || 25000);
const sseClients = new Set(); // { res, user }
function sseCustomerOwnsJob(j, user) {
  const c = jobCustomer(j);
  if (c && c.id === user.id) return true;
  if (j.requestId) { const r = db.requests.find(x => x.id === j.requestId); if (r && r.customerId === user.id) return true; }
  if (j.customerId && j.customerId === user.id) return true;
  return false;
}
function sseWrite(client, type, payload) {
  try { client.res.write('event: ' + type + '\ndata: ' + JSON.stringify(payload) + '\n\n'); } catch (e) {}
}
function emitJobLocation(j) {
  if (!j.liveLoc) return;
  const payload = { jobId: j.id, lat: j.liveLoc.lat, lng: j.liveLoc.lng, updatedAt: j.liveLoc.updatedAt };
  for (const c of sseClients) {
    const u = c.user;
    if (u.role === 'admin') sseWrite(c, 'job.location', payload);
    else if (u.role === 'worker' && j.assignedWorkerId === u.id) sseWrite(c, 'job.location', payload);
    else if (u.role === 'customer' && sseCustomerOwnsJob(j, u)) sseWrite(c, 'job.location', payload);
  }
}
function emitJobLocationStopped(j) {
  const payload = { jobId: j.id, stopped: true };
  for (const c of sseClients) {
    const u = c.user;
    if (u.role === 'admin') sseWrite(c, 'job.location', payload);
    else if (u.role === 'worker' && j.assignedWorkerId === u.id) sseWrite(c, 'job.location', payload);
    else if (u.role === 'customer' && sseCustomerOwnsJob(j, u)) sseWrite(c, 'job.location', payload);
  }
}
function emitJobStatus(j, prevStatus, statusOverride) {
  const payload = { jobId: j.id, status: statusOverride || j.status, prevStatus: prevStatus || '' };
  for (const c of sseClients) {
    const u = c.user;
    if (u.role === 'admin') sseWrite(c, 'job.status', payload);
    else if (u.role === 'worker') {
      if (u.status === 'active' && (j.assignedWorkerId === u.id || j.status === 'Open' || prevStatus === 'Open')) sseWrite(c, 'job.status', payload);
    }
    else if (u.role === 'customer' && sseCustomerOwnsJob(j, u)) sseWrite(c, 'job.status', payload);
  }
}
function emitJobNew(j, onlyWorkerId) {
  const payload = { jobId: j.id, status: j.status, service: j.service || '', city: j.city || '' };
  for (const c of sseClients) {
    const u = c.user;
    if (u.role === 'admin') sseWrite(c, 'job.new', payload);
    else if (u.role === 'worker' && u.status === 'active' && (!onlyWorkerId || u.id === onlyWorkerId)) sseWrite(c, 'job.new', payload);
  }
}
function emitRequestNew(r) {
  const payload = { requestId: r.id, service: r.service || '', city: r.city || '' };
  for (const c of sseClients) if (c.user.role === 'admin') sseWrite(c, 'request.new', payload);
}
// v25 (B1): a yard visit assignment reaches ONLY the admin and the one
// assigned worker — yard visits are not jobs and never touch the Open
// board broadcast. Payload carries no member PII (no name/address).
function emitYardAssigned(v) {
  const payload = { visitId: v.id, date: v.date };
  for (const c of sseClients) {
    const u = c.user;
    if (u.role === 'admin') sseWrite(c, 'yard.assigned', payload);
    else if (u.role === 'worker' && v.assignedWorkerId === u.id) sseWrite(c, 'yard.assigned', payload);
  }
}

// ---------- Gmail/Google automation ----------
// The app does not hold Gabriel's Gmail password. It sends structured events to
// a Google Apps Script web app that runs under his Google account. That script
// sends from generalhandymans@gmail.com, logs estimates in Sheets and files PDFs
// in Drive. GOOGLE_AUTOMATION_SECRET must match the script property.
const GOOGLE_AUTOMATION_URL = process.env.GOOGLE_AUTOMATION_WEBHOOK_URL || '';
const GOOGLE_AUTOMATION_SECRET = process.env.GOOGLE_AUTOMATION_SECRET || '';
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'generalhandymans@gmail.com';
const APP_URL = process.env.APP_URL || 'https://app.generalhandymans.app/';

// ---------- Resend email (free sending route Gabriel chose 2026-10-09) ----------
// Sends from estimates@generalhandymans.app (RESEND_FROM). Gabriel receives
// everything at his normal Gmail: estimates BCC him, and app events email his
// inbox. RESEND_API_KEY lives only in Render env. Google Apps Script remains a
// fallback if its env is set. Swap to Google Workspace later without rebuild.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API_BASE = process.env.RESEND_API_BASE || 'https://api.resend.com';
const RESEND_FROM = process.env.RESEND_FROM || 'General Handyman Solutions <estimates@generalhandymans.app>';
const OWNER_EMAIL = process.env.OWNER_NOTIFY_EMAIL || BUSINESS_EMAIL;
function mailReady() { return !!RESEND_API_KEY; }
function googleReady() { return !!(GOOGLE_AUTOMATION_URL && GOOGLE_AUTOMATION_SECRET); }
function senderEmail() { const m = RESEND_FROM.match(/<([^>]+)>/); return m ? m[1] : RESEND_FROM; }
function escMail(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function usd(n) { return '$' + money(n).toFixed(2); }
async function sendMail(o) {
  if (!mailReady()) return { attempted: false, sent: false, reason: 'email is not connected yet (Resend API key missing)' };
  try {
    const body = { from: RESEND_FROM, to: o.to, subject: o.subject, html: o.html || '', text: o.text || '' };
    if (o.replyTo) body.reply_to = o.replyTo;
    if (o.bcc) body.bcc = o.bcc;
    if (o.attachments && o.attachments.length) body.attachments = o.attachments;
    const r = await fetch(RESEND_API_BASE + '/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { attempted: true, sent: false, reason: (data && data.message) || ('email returned ' + r.status) };
    return { attempted: true, sent: true, via: 'resend', id: data.id || '' };
  } catch (e) { console.error('resend failed', e.message); return { attempted: true, sent: false, reason: e.message }; }
}
function mailShell(title, inner, footer) {
  return '<div style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;border:1px solid #ddd">'
    + '<div style="background:#0b0b0b;color:#fff;padding:18px 22px"><div style="font-size:20px;font-weight:bold">General Handyman Solutions</div><div style="color:#ff4444;margin-top:2px">Fairfield \u2022 Vacaville \u2022 Vallejo \u2022 Solano County</div></div>'
    + '<div style="padding:20px 22px"><h2 style="margin-top:0">' + escMail(title) + '</h2>' + inner
    + '<p style="margin-top:18px"><a href="' + APP_URL + '" style="background:#d92323;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold;display:inline-block">Open the app</a></p>'
    + '<p style="color:#666;font-size:13px">' + (footer || 'Questions? Text or call (707) 862-3773. Labor only \u2014 you buy materials/parts unless we agree otherwise.') + '</p></div></div>';
}
const WORKER_FOOTER = 'Questions? Text or call the Team: (707) 862-3773.';
  const OWNER_FOOTER = 'General Handyman Solutions Team - internal notification.';
function eventEmail(title, lines, footer) { return mailShell(title, lines.map(l => '<p style="margin:6px 0">' + escMail(l) + '</p>').join(''), footer); }
function estimateEmailHtml(rq) {
  const e = rq.estimate || {};
  let rows = '';
  (e.items || []).forEach(it => { rows += '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + escMail(it.description) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">' + escMail(it.qty) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.unitPrice) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.lineTotal) + '</td></tr>'; });
  let adj = '';
  if (e.asapAmount > 0) adj += '<p>ASAP / Emergency (+25%): <b>' + usd(e.asapAmount) + '</b></p>';
  if (e.discountAmount > 0) adj += '<p>' + (e.memberDiscount ? 'HomeCare member discount' : 'Discount') + ' (' + escMail(e.discountPct) + '%): <b>-' + usd(e.discountAmount) + '</b></p>';
  if (e.credit > 0) adj += '<p>Appointment credit: <b>-' + usd(e.credit) + '</b></p>';
  const inner = '<p>Hi ' + escMail(rq.customerName || 'there') + ', here is your estimate for <b>' + escMail(rq.service || 'your job') + '</b>' + (rq.city ? ' in <b>' + escMail(rq.city) + '</b>' : '') + '.</p>'
    + '<table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left;padding:6px 8px">Work</th><th style="padding:6px 8px">Qty</th><th style="padding:6px 8px;text-align:right">Each</th><th style="padding:6px 8px;text-align:right">Line</th></tr>' + rows + '</table>'
    + '<p>Subtotal: <b>' + usd(e.subtotal) + '</b></p>' + adj
    + '<p style="font-size:18px">Total: <b>' + usd(e.total) + '</b></p>'
    + '<p>Due to book: <b>' + usd(e.bookingDue) + '</b> \u2022 Balance at completion: <b>' + usd(e.balanceDue) + '</b></p>'
    + (rq.quoteNote ? '<p>' + escMail(rq.quoteNote) + '</p>' : '')
    + '<p><a href="' + estimatePageLink(rq) + '" style="background:#1a7f37;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold;display:inline-block">Review & approve online</a></p>'
    + '<p style="color:#666;font-size:13px">Or open this link — no account needed:<br>' + escMail(estimatePageLink(rq)) + '</p>'
    + '<p>The same estimate is attached as a PDF.</p>';
  return mailShell('Your estimate from General Handyman Solutions', inner);
}
function estimateEmailText(rq) {
  const e = rq.estimate || {};
  const lines = ['General Handyman Solutions — your estimate (' + rq.id + ')', 'Service: ' + (rq.service || '') + (rq.city ? ' in ' + rq.city : ''), ''];
  (e.items || []).forEach(it => { lines.push('- ' + it.description + ' x' + it.qty + ' @ ' + usd(it.unitPrice) + ' = ' + usd(it.lineTotal)); });
  lines.push('', 'Subtotal: ' + usd(e.subtotal));
  if (e.asapAmount > 0) lines.push('ASAP / Emergency (+25%): ' + usd(e.asapAmount));
  if (e.discountAmount > 0) lines.push((e.memberDiscount ? 'HomeCare member discount' : 'Discount') + ' (' + e.discountPct + '%): -' + usd(e.discountAmount));
  if (e.credit > 0) lines.push('Appointment credit: -' + usd(e.credit));
  lines.push('TOTAL: ' + usd(e.total), 'Due to book: ' + usd(e.bookingDue) + ' | Balance at completion: ' + usd(e.balanceDue), '', 'Review & approve online (no account needed): ' + estimatePageLink(rq), 'Labor only — you buy materials/parts unless agreed otherwise. Text/call (707) 862-3773.');
  return lines.join('\n');
}
function pdfEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function buildEstimatePdf(rq) {
  const e = rq.estimate || {};
  const lines = ['GENERAL HANDYMAN SOLUTIONS', 'Fairfield - Vacaville - Vallejo - Solano County', 'Text/call (707) 862-3773', '', 'Estimate ' + rq.id + '   ' + new Date().toLocaleDateString('en-US')];
  if (rq.customerName) lines.push('Customer: ' + rq.customerName);
  lines.push('Service: ' + (rq.service || '') + (rq.city ? ' - ' + rq.city : ''), '');
  (e.items || []).forEach(it => { lines.push(it.description + '  x' + it.qty + '  @ ' + usd(it.unitPrice) + '  = ' + usd(it.lineTotal)); });
  lines.push('', 'Subtotal: ' + usd(e.subtotal));
  if (e.asapAmount > 0) lines.push('ASAP / Emergency (+25%): ' + usd(e.asapAmount));
  if (e.discountAmount > 0) lines.push((e.memberDiscount ? 'HomeCare member discount' : 'Discount') + ' (' + e.discountPct + '%): -' + usd(e.discountAmount));
  if (e.credit > 0) lines.push('Appointment credit: -' + usd(e.credit));
  lines.push('TOTAL: ' + usd(e.total), 'Due to book: ' + usd(e.bookingDue) + '    Balance at completion: ' + usd(e.balanceDue), '', 'Labor only - you buy materials/parts unless agreed otherwise.', 'Approve in the app: ' + APP_URL);
  let content = 'BT /F1 13 Tf 50 750 Td ';
  lines.forEach((l, i) => { content += (i === 0 ? '' : '0 -17 Td ') + '(' + pdfEsc(l) + ') Tj '; });
  content += 'ET';
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  objs[4] = '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream';
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 1; i <= 5; i++) { offsets[i] = Buffer.byteLength(pdf); pdf += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) { pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'; }
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf, 'utf8');
}
async function resendAutomation(type, payload) {
  if (!mailReady()) return { attempted: false, sent: false, reason: 'email is not connected yet (Resend API key missing)' };
  const p = payload || {};
  const owner = Array.from(new Set([].concat(p.adminEmails || [], [OWNER_EMAIL]).filter(Boolean)));
  if (type === 'estimate_sent') {
    const rq = p.request || {};
    if (!rq.customerEmail) return { attempted: true, sent: false, reason: 'customer has no email on file' };
    const atts = rq.estimate ? [{ filename: 'estimate-' + rq.id + '.pdf', content: buildEstimatePdf(rq).toString('base64') }] : [];
    return sendMail({ to: [rq.customerEmail], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Your estimate from General Handyman Solutions (' + rq.id + ')', html: estimateEmailHtml(rq), text: estimateEmailText(rq), attachments: atts });
  }
  if (type === 'new_request') { const rq = p.request || {}; return sendMail({ to: owner, subject: 'New customer request: ' + (rq.service || 'job') + (rq.city ? ' - ' + rq.city : ''), html: eventEmail('New customer request', ['Request ' + rq.id, 'Customer: ' + (rq.customerName || '') + ' ' + (rq.customerPhone || ''), 'Service: ' + (rq.service || ''), 'City: ' + (rq.city || ''), 'When: ' + (rq.when || ''), 'Details: ' + (rq.description || '')], OWNER_FOOTER), text: 'New request ' + rq.id }); }
  if (type === 'new_worker') { const w = p.worker || {}; return sendMail({ to: owner, subject: 'New worker application: ' + (w.name || ''), html: eventEmail('New worker application', ['Name: ' + (w.name || ''), 'Email: ' + (w.email || ''), 'Phone: ' + (w.phone || ''), 'Status: ' + (w.status || 'review')], OWNER_FOOTER), text: 'New worker: ' + (w.name || '') }); }
  if (type === 'worker_activated') { const w = p.worker || {}; if (!w.email) return { attempted: true, sent: false, reason: 'worker has no email' }; return sendMail({ to: [w.email], subject: 'Your General Handyman Solutions worker account is ACTIVE', html: eventEmail('You are active - welcome to the team', ['Hi ' + (w.name || 'there') + ',', 'Your worker account is now ACTIVE. You can log into the app and see the open jobs in your area.', 'Every job shows exactly what it pays before you claim it, so you only take the ones that work for you. First active worker to claim gets the job.', 'The Team coordinates everything with the customer and confirms the address and time with you in the app. Questions during a job? Message us right in the job chat.'], WORKER_FOOTER), text: 'Your worker account is ACTIVE. Open the app to see open jobs - every job shows its pay before you claim it.' }); }
  if (type === 'worker_removed') { const w = p.worker || {}; if (!w.email) return { attempted: true, sent: false, reason: 'worker has no email' }; const first = String(w.name || '').trim().split(/\s+/)[0] || ''; const en = "Hi " + (first || 'there') + " — this is the General Handyman Solutions Team. Your technician account has been removed. Thank you for applying and for your time. If you'd like to apply again in the future, you're welcome to — you can re-apply anytime at app.generalhandymans.app."; const es = "Hola" + (first ? ' ' + first : '') + " — somos el equipo de General Handyman Solutions. Tu cuenta de técnico ha sido eliminada. Gracias por aplicar y por tu tiempo. Si en el futuro deseas aplicar de nuevo, eres bienvenido — puedes hacerlo cuando quieras en app.generalhandymans.app."; return sendMail({ to: [w.email], subject: 'Your General Handyman Solutions technician account', html: eventEmail('Your technician account has been removed', [en, es, '— The Team'], WORKER_FOOTER), text: en + '\n\n' + es + '\n\n— The Team · (707) 862-3773' }); }
  if (type === 'job_posted') { const j = p.job || {}; const ws = (p.workers || []).filter(w => w.email); if (!ws.length) return { attempted: true, sent: false, reason: 'no matching worker emails' }; let sentCount = 0; for (const w of ws) { const r = await sendMail({ to: [w.email], subject: 'New job posted: ' + (j.service || 'Job') + (j.city ? ' - ' + j.city : '') + ' - Pays ' + usd(j.payOffer), html: eventEmail('New job in your area', ['Service: ' + (j.service || ''), 'City: ' + (j.city || ''), 'When: ' + (j.when || 'TBD'), 'This job pays you: ' + usd(j.payOffer), (j.description || ''), 'Open the app to claim it - first active worker to claim gets it.'], WORKER_FOOTER), text: 'New job pays ' + usd(j.payOffer) }); if (r.sent) sentCount++; } return { attempted: true, sent: sentCount > 0, via: 'resend', emailed: sentCount }; }
  if (type === 'job_claimed') { const j = p.job || {}; const to = owner.slice(); if (p.customer && p.customer.email) to.push(p.customer.email); return sendMail({ to: to, subject: 'Job claimed: ' + (j.service || '') + (j.city ? ' - ' + j.city : ''), html: eventEmail('A worker claimed the job', ['Job: ' + (j.service || '') + ' in ' + (j.city || ''), 'Worker: ' + ((p.worker || {}).name || ''), 'Status: ' + (j.status || 'Claimed'), 'Open the app for the job chat with the Team and your worker.']), text: 'Job claimed.' }); }
  if (type === 'quote_decision') { const rq = p.request || {}; return sendMail({ to: owner, subject: 'Customer ' + (p.decision || 'answered') + ' the quote on ' + rq.id, html: eventEmail('Quote ' + (p.decision || ''), ['Request ' + rq.id, 'Customer: ' + (rq.customerName || ''), 'Service: ' + (rq.service || '') + ' ' + (rq.city || ''), 'Quote: ' + usd(rq.quote || (rq.estimate && rq.estimate.total) || 0)], OWNER_FOOTER), text: 'Quote ' + (p.decision || '') }); }
  if (type === 'payment_received') { const rq = p.request || {}; const cust = (p.request && p.request.customerEmail) || ''; const out = []; if (cust) out.push(await sendMail({ to: [cust], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Payment received — your appointment is secured (' + rq.id + ')', html: eventEmail('Payment received', ['We received your payment of ' + usd(p.paidAmount || 0) + ' for request ' + rq.id + '.', 'Your appointment is secured. The Team will confirm your time with you here in the app.', 'Labor only — you buy materials/parts unless we agree otherwise.']), text: 'Payment received: ' + usd(p.paidAmount || 0) + ' on request ' + rq.id + '. Your appointment is secured. Labor only — you buy materials/parts.' })); out.push(await sendMail({ to: owner, subject: 'Payment received: ' + usd(p.paidAmount || 0) + ' on ' + rq.id, html: eventEmail('Payment received', ['Request ' + rq.id, 'Customer: ' + (rq.customerName || ''), 'Amount: ' + usd(p.paidAmount || 0)], OWNER_FOOTER), text: 'Payment ' + usd(p.paidAmount || 0) + ' on ' + rq.id })); return { attempted: true, sent: out.some(x => x.sent), via: 'resend' }; }
  if (type === 'homecare_welcome') { const usr = p.user || {}; if (!usr.email) return { attempted: true, sent: false, reason: 'customer has no email' }; return sendMail({ to: [usr.email], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Welcome to HomeCare — your first estimate is free', html: eventEmail('Welcome to HomeCare', ['Hi ' + (usr.name || 'there') + ', your HomeCare membership ($29/month) is now active.', 'Your first in-person estimate is FREE — request it from your dashboard whenever you are ready.', 'After that: member estimates are $50 (instead of $75), 20% off labor on jobs under $1,000, and priority scheduling.', 'You can cancel anytime from your dashboard — no penalties, no fine print.', 'Labor only — you buy materials/parts unless we agree otherwise.']), text: 'Welcome to HomeCare ($29/month). Your first in-person estimate is FREE. Cancel anytime. Labor only — you buy materials/parts.' }); }
  if (type === 'homecare_cancelled') { const usr = p.user || {}; if (!usr.email) return { attempted: true, sent: false, reason: 'customer has no email' }; return sendMail({ to: [usr.email], replyTo: OWNER_EMAIL, subject: 'HomeCare membership cancelled', html: eventEmail('HomeCare cancelled', ['Hi ' + (usr.name || 'there') + ', your HomeCare membership has been cancelled.', 'You can rejoin anytime from your dashboard — we would love to have you back.', 'Labor only — you buy materials/parts unless we agree otherwise.']), text: 'Your HomeCare membership has been cancelled. Rejoin anytime from your dashboard.' }); }
  if (type === 'invoice_sent') {
    const inv = p.invoice || {};
    if (!inv.customerEmail) return { attempted: true, sent: false, reason: 'invoice has no customer email' };
    return sendMail({ to: [inv.customerEmail], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Your invoice from General Handyman Solutions (' + inv.id + ') — ' + usd(inv.total || 0) + ' due', html: invoiceEmailHtml(inv), text: invoiceEmailText(inv) });
  }
  if (type === 'invoice_paid') {
    const inv = p.invoice || {};
    const out = [];
    if (inv.customerEmail) out.push(await sendMail({ to: [inv.customerEmail], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Payment received — invoice ' + inv.id + ' paid in full', html: eventEmail('Invoice paid — thank you', ['Invoice ' + inv.id + ' (' + usd(inv.total || 0) + ') is now PAID IN FULL.', 'Payment method: ' + (inv.paidMethod || 'card') + '.', 'Thank you for your business! If you need anything else, just reply to this email or text (707) 862-3773.']), text: 'Invoice ' + inv.id + ' paid in full (' + usd(inv.total || 0) + '). Thank you!' }));
    out.push(await sendMail({ to: [OWNER_EMAIL], subject: 'Invoice PAID: ' + inv.id + ' — ' + usd(inv.total || 0), html: eventEmail('Invoice paid', ['Invoice ' + inv.id, 'Customer: ' + (inv.customerName || '') + ' ' + (inv.customerEmail || ''), 'Amount: ' + usd(inv.total || 0), 'Method: ' + (inv.paidMethod || 'card')], OWNER_FOOTER), text: 'Invoice ' + inv.id + ' paid: ' + usd(inv.total || 0) }));
    return { attempted: true, sent: out.some(x => x.sent), via: 'resend' };
  }
  if (type === 'invoice_reminder') {
    const inv = p.invoice || {};
    if (!inv.customerEmail) return { attempted: true, sent: false, reason: 'invoice has no customer email' };
    return sendMail({ to: [inv.customerEmail], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Payment reminder: invoice ' + inv.id + ' (' + usd(inv.total || 0) + ') is still unpaid', html: invoiceReminderEmailHtml(inv), text: invoiceReminderEmailText(inv) });
  }
  return { attempted: false, sent: false, reason: 'no email template for ' + type };
}
async function sendAutomation(type, payload) {
  if (mailReady()) { const m = await resendAutomation(type, payload); if (m.sent || !googleReady()) return m; }
  if (googleReady()) return googleAutomation(type, payload);
  return { attempted: false, sent: false, reason: 'email automation is not connected yet' };
}
function fireAutomation(type, payload) { sendAutomation(type, payload).catch(() => {}); }

// ---------- Stripe payments (added 2026-10-10) ----------
// Env: STRIPE_SECRET_KEY (required for payments), STRIPE_WEBHOOK_SECRET (verifies
// /api/stripe/webhook signatures), STRIPE_PRICE_HOMECARE (optional; when absent and
// the secret key is set, a $29/mo HomeCare price is auto-created once via the API
// and its id is saved in db.settings so it is reused instead of duplicated).
// Estimate payments use dynamic price_data (exact "due to book" amount), so no
// per-amount price ids are needed. Everything degrades gracefully when keys are
// absent: /api/stripe/config reports configured:false and checkout endpoints
// return 400 "payments not connected" instead of crashing.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// STRIPE_API_BASE exists so local tests can point the Stripe client at a
// mock; production leaves it unset and always talks to api.stripe.com.
const STRIPE_API = process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1';
const HOMECARE_MONTHLY_CENTS = 2900;
// Membership plans (added 2026-10-21): one active plan is stored on the user
// as u.membershipPlan = { planKey, type, visitsPerMonth, priceId, productId,
// status, subscriptionId, since, cancelAt }. HomeCare remains the legacy
// benefit flag: HomeCare and HomeCare Plus set homeCareStatus='active' (so
// every existing isMember path — 20% labor discount, $50 estimates, the free
// first estimate — applies to Plus exactly as it does to HomeCare), while
// Yard Care records ONLY the yard plan and grants no HomeCare benefits.
const MEMBERSHIP_PLANS = {
  homecare: { key: 'homecare', type: 'homecare', kind: 'homecare', name: 'HomeCare', monthlyCents: 2900, visitsPerMonth: 0, priceId: '', productId: '' },
  yard1: { key: 'yard1', type: 'yard', kind: 'yardcare', name: 'Yard Care', monthlyCents: 7500, visitsPerMonth: 1, priceId: 'price_1UTmMwLu9cCIcixBELdMhHh3', productId: 'prod_VU0voRBxqFjPoE' },
  yard2: { key: 'yard2', type: 'yard', kind: 'yardcare', name: 'Yard Care', monthlyCents: 15000, visitsPerMonth: 2, priceId: 'price_1UTmQtLu9cCIcixBkCpLd2k2', productId: 'prod_VU0voRBxqFjPoE' },
  plus1: { key: 'plus1', type: 'plus', kind: 'homecare-plus', name: 'HomeCare Plus', monthlyCents: 10000, visitsPerMonth: 1, priceId: 'price_1UTmS6Lu9cCIcixB312eNpYF', productId: 'prod_VU0t2nkCsauZe1' },
  plus2: { key: 'plus2', type: 'plus', kind: 'homecare-plus', name: 'HomeCare Plus', monthlyCents: 17500, visitsPerMonth: 2, priceId: 'price_1UTmSKLu9cCIcixBmcSF51Cm', productId: 'prod_VU0t2nkCsauZe1' }
};
function membershipPlanPriceId(plan, source) {
  if (!plan) return '';
  if (plan.key !== 'homecare') return plan.priceId || '';
  return (source && source.priceId) || process.env.STRIPE_PRICE_HOMECARE || (db.settings && db.settings.stripeHomeCarePrice) || '';
}
function membershipPlanOf(u) {
  const empty = { planKey: null, type: null, name: '', monthly: 0, visitsPerMonth: 0, status: 'none', priceId: '', productId: '', subscriptionId: '', since: null, cancelAt: null, checkoutKind: null };
  if (!u) return empty;
  const stored = (u.membershipPlan && typeof u.membershipPlan === 'object') ? u.membershipPlan : null;
  if (stored && MEMBERSHIP_PLANS[stored.planKey]) {
    const plan = MEMBERSHIP_PLANS[stored.planKey];
    return { planKey: plan.key, type: plan.type, name: plan.name, monthly: plan.monthlyCents / 100, visitsPerMonth: plan.visitsPerMonth, status: stored.status || 'none', priceId: stored.priceId || membershipPlanPriceId(plan, stored), productId: stored.productId || plan.productId || '', subscriptionId: stored.subscriptionId || '', since: stored.since || null, cancelAt: stored.cancelAt || null, checkoutKind: plan.kind };
  }
  // Legacy users (HomeCare sold before plan records existed): derive the
  // plan from the HomeCare fields so nothing about their status changes.
  const legacyStatus = u.homeCareStatus || 'none';
  if (legacyStatus !== 'none' || u.stripeSubscriptionId) {
    const plan = MEMBERSHIP_PLANS.homecare;
    return { planKey: plan.key, type: plan.type, name: plan.name, monthly: plan.monthlyCents / 100, visitsPerMonth: 0, status: legacyStatus, priceId: membershipPlanPriceId(plan, u), productId: '', subscriptionId: u.stripeSubscriptionId || '', since: u.homeCareSince || null, cancelAt: u.homeCareCancelAt || null, checkoutKind: plan.kind };
  }
  return Object.assign({}, empty, { subscriptionId: u.stripeSubscriptionId || '' });
}
function setMembershipPlan(u, planKey, patch) {
  const plan = MEMBERSHIP_PLANS[planKey];
  if (!u || !plan) return null;
  patch = patch || {};
  const prev = (u.membershipPlan && typeof u.membershipPlan === 'object' && MEMBERSHIP_PLANS[u.membershipPlan.planKey]) ? u.membershipPlan : {};
  const next = {
    planKey: plan.key,
    type: plan.type,
    visitsPerMonth: plan.visitsPerMonth,
    priceId: patch.priceId || prev.priceId || membershipPlanPriceId(plan, prev),
    productId: patch.productId || prev.productId || plan.productId || '',
    status: patch.status || prev.status || 'none',
    subscriptionId: patch.subscriptionId || prev.subscriptionId || '',
    since: patch.since !== undefined ? patch.since : (prev.since || null),
    cancelAt: patch.cancelAt !== undefined ? patch.cancelAt : (prev.cancelAt || null)
  };
  u.membershipPlan = next;
  if (next.subscriptionId) u.stripeSubscriptionId = next.subscriptionId;
  return membershipPlanOf(u);
}
// ---------- Campaign source (v24, A5) ----------
// Join links may carry ?src=CODE (e.g. #join-plus1?src=INSTA1). The client
// forwards it as `source` on the membership subscribe/checkout calls; it is
// sanitized and stashed as u.pendingSource, then promoted to u.source AT
// ACTIVATION TIME by the two activators below (and the checkout-webhook
// HomeCare branch) — so every activation path records it exactly once, and
// the FIRST source an account ever activates with wins (never overwritten).
function sanitizeSource(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9_-]{1,24}$/.test(s) ? s : null;
}
function stashPendingSource(u, raw) {
  const s = sanitizeSource(raw);
  if (u && s) u.pendingSource = s;
}
function applySourceAtActivation(u) {
  if (!u) return;
  if (!u.source) { const s = sanitizeSource(u.pendingSource); if (s) u.source = s; }
  if (u.pendingSource) delete u.pendingSource;
}
function activateMembershipPlan(u, planKey, opts) {
  opts = opts || {};
  const plan = MEMBERSHIP_PLANS[planKey];
  if (!u || !plan) return null;
  applySourceAtActivation(u);
  const before = membershipPlanOf(u);
  const now = new Date().toISOString();
  const sameActive = before.planKey === planKey && before.status === 'active' && (!opts.subscriptionId || !before.subscriptionId || before.subscriptionId === opts.subscriptionId);
  const first = !!opts.first || !before.since;
  const mp = setMembershipPlan(u, planKey, { status: 'active', subscriptionId: opts.subscriptionId || before.subscriptionId || '', since: before.since || now, cancelAt: null });
  if (plan.type === 'homecare' || plan.type === 'plus') {
    // Plus IS HomeCare for benefit purposes: reuse the exact legacy flag
    // every member check in this file already reads.
    u.homeCareStatus = 'active';
    if (!u.homeCareSince) u.homeCareSince = mp.since || now;
    u.homeCareCancelAt = null;
    if (first && !before.since) u.freeEstimateUsed = false; // one free estimate per ACCOUNT: 'since' survives plan switches and rejoins, so they never re-grant it (only a genuinely first membership resets the flag)
  }
  if (!sameActive) {
    if (plan.type === 'yard') {
      notify(u.id, 'membership', 'Welcome to Yard Care! Your plan is active — ' + plan.visitsPerMonth + ' yard visit' + (plan.visitsPerMonth === 1 ? '' : 's') + ' per month included. The Team will schedule your visits with you.');
      notifyAdmins('membership', u.name + ' (' + u.email + ') joined Yard Care ($' + (plan.monthlyCents / 100) + '/mo, ' + plan.visitsPerMonth + ' visit' + (plan.visitsPerMonth === 1 ? '' : 's') + '/mo).');
    } else if (plan.type === 'plus') {
      notify(u.id, 'membership', 'Welcome to HomeCare Plus! Your membership is active: all HomeCare benefits (first in-person estimate FREE, then $50 member estimates, 20% off labor on jobs under $1,000, priority scheduling) PLUS ' + plan.visitsPerMonth + ' yard visit' + (plan.visitsPerMonth === 1 ? '' : 's') + ' per month.');
      notifyAdmins('membership', u.name + ' (' + u.email + ') joined HomeCare Plus ($' + (plan.monthlyCents / 100) + '/mo, ' + plan.visitsPerMonth + ' yard visit' + (plan.visitsPerMonth === 1 ? '' : 's') + '/mo).');
    }
  }
  if (plan.visitsPerMonth > 0) ensureYardVisitProposals(u); // v25 (B2)
  save();
  return mp;
}
// ---------- Yard visit proposals (v25, B2) ----------
// When a membership with a yard entitlement (Yard Care / HomeCare Plus)
// activates — first join, webhook restore, portal sync, or a plan CHANGE
// into a yard plan — the current period's visits appear in the Yard
// Calendar as status 'proposed': no worker, no confirmed date yet. Gabriel
// confirms/adjusts the date himself (existing Yard Calendar flow). Dedupe
// key: member + period month + plan — an auto proposal is generated at
// most once per key, so re-activations and webhook replays never double
// up. Proposals are NEVER silently deleted: if the plan changes
// mid-period, the old plan's still-proposed auto visits are marked
// 'cancelled' (visible to admin, with a note); a cancelled membership
// simply stops new generation — its existing proposals stay on the
// calendar, flagged with the membership state via the visit's plan view.
function yardPeriodKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function ensureYardVisitProposals(u) {
  if (!u || u.role !== 'customer') return [];
  const plan = membershipPlanOf(u);
  if (plan.status !== 'active' || !(plan.visitsPerMonth > 0)) return [];
  if (!Array.isArray(db.yardVisits)) db.yardVisits = [];
if (!Array.isArray(db.auditLog)) db.auditLog = [];
  const period = yardPeriodKey(new Date());
  db.yardVisits.forEach(v => {
    if (v.userId === u.id && v.period === period && v.source === 'auto' && v.planKey !== plan.planKey && v.status === 'proposed') {
      v.status = 'cancelled';
      v.notes = ((v.notes || '') + ' Superseded by plan change.').trim();
    }
  });
  const existing = db.yardVisits.filter(v => v.userId === u.id && v.period === period && v.planKey === plan.planKey && v.source === 'auto');
  if (existing.length >= plan.visitsPerMonth) return existing;
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let baseDay = now.getDate();
  const sp = normalizeStartPreference(u.startPreference);
  if (sp && sp.type === 'date' && sp.date && sp.date.slice(0, 7) === period) baseDay = Number(sp.date.slice(8, 10)) || baseDay;
  for (let i = existing.length; i < plan.visitsPerMonth; i++) {
    const day = Math.min(baseDay + i * 14, lastDay);
    const v = { id: id('YV'), userId: u.id, date: period + '-' + String(day).padStart(2, '0'), status: 'proposed', notes: '', createdAt: new Date().toISOString(),
      source: 'auto', period, planKey: plan.planKey, assignedWorkerId: null, beforePhoto: null, afterPhoto: null, completedAt: null, workerPay: null };
    db.yardVisits.push(v); existing.push(v);
  }
  return existing;
}
function cancelMembershipPlan(u, planKey, opts) {
  opts = opts || {};
  const plan = MEMBERSHIP_PLANS[planKey];
  if (!u || !plan) return null;
  const before = membershipPlanOf(u);
  if (before.subscriptionId && opts.subscriptionId && before.subscriptionId !== opts.subscriptionId) return before;
  const now = new Date().toISOString();
  const mp = setMembershipPlan(u, planKey, { status: 'cancelled', subscriptionId: opts.subscriptionId || before.subscriptionId || '', since: before.since || null, cancelAt: now });
  if (plan.type === 'homecare' || plan.type === 'plus') {
    u.homeCareStatus = 'cancelled';
    u.homeCareCancelAt = now;
  }
  return mp;
}
function planFromSubscription(obj, fallback) {
  const md = (obj && obj.metadata) || {};
  const items = (obj && obj.items && Array.isArray(obj.items.data)) ? obj.items.data : [];
  const firstItem = items[0] || {};
  const priceId = typeof firstItem.price === 'string' ? firstItem.price : (firstItem.price && firstItem.price.id) || '';
  // Match the configured price id OR the resolver's cached id (v40) — a
  // subscription created through membershipPriceIdFor carries the resolved
  // price, which must still name its plan here.
  const planPriceIds = (pl) => [pl.priceId, db.settings && db.settings['stripePrice_' + pl.key], pl.key === 'homecare' ? ((db.settings && db.settings.stripeHomeCarePrice) || process.env.STRIPE_PRICE_HOMECARE || '') : ''].filter(Boolean);
  const byPrice = priceId ? Object.keys(MEMBERSHIP_PLANS).map(k => MEMBERSHIP_PLANS[k]).find(pl => planPriceIds(pl).includes(priceId)) : null;
  // The charged price is the truth (v20): subscription metadata can lag a
  // plan change, so if the price names a DIFFERENT plan than the metadata,
  // believe the price — a late/out-of-order subscription.updated webhook
  // must never stomp a member's new plan back to the old one.
  if (byPrice && md.plan && MEMBERSHIP_PLANS[md.plan] && MEMBERSHIP_PLANS[md.plan].key !== byPrice.key) return byPrice;
  if (md.plan && MEMBERSHIP_PLANS[md.plan]) return MEMBERSHIP_PLANS[md.plan];
  if (byPrice) return byPrice;
  if (md.kind === 'homecare') return MEMBERSHIP_PLANS.homecare;
  if (fallback && fallback.planKey && fallback.subscriptionId && obj && fallback.subscriptionId === obj.id) return MEMBERSHIP_PLANS[fallback.planKey];
  return null;
}
function userForSubscription(obj) {
  if (!obj) return null;
  const md = obj.metadata || {};
  if (md.userId) { const byMeta = db.users.find(x => x.id === md.userId); if (byMeta) return byMeta; }
  return db.users.find(x => x.stripeSubscriptionId && x.stripeSubscriptionId === obj.id)
    || (obj.customer ? db.users.find(x => x.stripeCustomerId && x.stripeCustomerId === obj.customer) : null)
    || null;
}
function syncMembershipPlanFromSubscription(u, obj) {
  if (!u || !obj) return membershipPlanOf(u);
  const before = membershipPlanOf(u);
  const plan = planFromSubscription(obj, before);
  if (!plan) return before;
  if (before.status === 'active' && before.subscriptionId && obj.id && before.subscriptionId !== obj.id) return before; // never let a second subscription clobber the active plan
  const status = (obj.status === 'active' || obj.status === 'trialing') ? 'active' : (obj.status || before.status || 'none');
  const mp = setMembershipPlan(u, plan.key, {
    status,
    subscriptionId: obj.id || before.subscriptionId || '',
    since: before.since || (obj.created ? new Date(Number(obj.created) * 1000).toISOString() : null),
    cancelAt: obj.cancel_at ? new Date(Number(obj.cancel_at) * 1000).toISOString() : before.cancelAt
  });
  if (status === 'active') {
    if (plan.type === 'homecare' || plan.type === 'plus') {
      u.homeCareStatus = 'active';
      if (!u.homeCareSince) u.homeCareSince = mp.since || new Date().toISOString();
      u.homeCareCancelAt = obj.cancel_at ? mp.cancelAt : null;
    } else if (before.subscriptionId && before.subscriptionId === obj.id && (before.type === 'homecare' || before.type === 'plus')) {
      // Same subscription changed INTO a yard-only plan (e.g. via the
      // billing portal): the HomeCare benefits go with the old plan.
      u.homeCareStatus = 'none';
      u.homeCareCancelAt = null;
    }
  } else if (status === 'canceled') {
    if (plan.type === 'homecare' || plan.type === 'plus') { u.homeCareStatus = 'cancelled'; u.homeCareCancelAt = new Date().toISOString(); }
  }
  // v25 (B2): a subscription sync that lands the member ACTIVE on a yard
  // plan (portal upgrade, renewal rollover, reactivation) tops up the
  // current period's visit proposals — dedupe makes repeats harmless.
  if (status === 'active' && plan.visitsPerMonth > 0) ensureYardVisitProposals(u);
  return mp;
}
function publicMembershipPlan(plan) {
  return { key: plan.key, type: plan.type, name: plan.name, monthly: plan.monthlyCents / 100, visitsPerMonth: plan.visitsPerMonth, priceId: membershipPlanPriceId(plan, null), productId: plan.productId || '', checkoutKind: plan.kind };
}
function membershipPlansPublic() {
  const out = {};
  Object.keys(MEMBERSHIP_PLANS).forEach(k => { out[k] = publicMembershipPlan(MEMBERSHIP_PLANS[k]); });
  return out;
}

// ---------- Stripe Connect worker payouts (v29, 2026-10-22) ----------
// Gabriel's rule (2026-10-22): a technician's pay is AUTOMATED. Each worker
// connects a Stripe Express account ONCE (ID + bank, Stripe-hosted, about
// 2 minutes — prompted from their first login). When a job reaches
// 'Done — photos sent' AND the customer's payment on its request has been
// captured, the app transfers the job's payOffer to the worker's account;
// Stripe then pays it out to their bank. Gabriel never sends payouts by
// hand — but he CAN force/retry one with POST /api/admin/jobs/:id/pay-worker
// (the semi-manual override). The worker NEVER needs the customer's total
// for this; only their own payOffer moves.
async function refreshWorkerConnect(u, force) {
  if (!u || !u.stripeAccountId || !stripeReady()) return !!(u && u.stripePayoutsReady);
  const fresh = u.stripeCheckedAt && (Date.now() - new Date(u.stripeCheckedAt).getTime() < 5 * 60 * 1000);
  if (fresh && !force) return !!u.stripePayoutsReady;
  try {
    const acct = await stripeGet('/accounts/' + u.stripeAccountId);
    u.stripePayoutsReady = !!acct.payouts_enabled;
    u.stripeDetailsSubmitted = !!acct.details_submitted;
    u.stripeCheckedAt = new Date().toISOString();
    save();
  } catch (e) { console.error('connect: status refresh failed for ' + u.id + ':', e.message); }
  return !!u.stripePayoutsReady;
}
async function maybePayWorkerForJob(j, opts) {
  opts = opts || {};
  try {
    if (!j || !j.assignedWorkerId || !(Number(j.payOffer) > 0)) return;
    if (j.payoutTransferId) { if (j.payoutStatus !== 'paid') { j.payoutStatus = 'paid'; save(); } return; }
    if (j.payoutInFlight && (Date.now() - j.payoutInFlight < 120000)) return; // a transfer attempt is already running — never double-pay
    j.payoutTriedAt = new Date().toISOString();
    if (j.status !== 'Done — photos sent' && !opts.force) return;
    const w = db.users.find(x => x.id === j.assignedWorkerId);
    if (!w) return;
    if (!stripeReady()) { j.payoutStatus = 'stripe_off'; save(); return; }
    if (w.stripeAccountId && !w.stripePayoutsReady) await refreshWorkerConnect(w);
    if (!w.stripeAccountId || !w.stripePayoutsReady) {
      j.payoutStatus = 'awaiting_worker_setup'; save();
      if (!j.payoutSetupNagAt) { j.payoutSetupNagAt = new Date().toISOString(); notifyAdmins('payment', 'Job ' + j.id + ' is done but ' + w.name + ' has not finished setting up payouts — their ' + usd(j.payOffer) + ' is waiting.'); save(); }
      return;
    }
    const r = j.requestId ? db.requests.find(x => x.id === j.requestId) : null;
    if (r && !(r.holds || []).some(h => h.status === 'captured')) { j.payoutStatus = 'awaiting_capture'; save(); return; }
    const amount = Math.round(Number(j.payOffer) * 100);
    j.payoutInFlight = Date.now(); save();
    let tr;
    try { tr = await stripeApi('/transfers', { amount, currency: 'usd', destination: w.stripeAccountId, transfer_group: j.id, description: 'GHS payout - job ' + j.id + ' (' + (j.service || 'job') + ')', 'metadata[jobId]': j.id, 'metadata[workerId]': w.id }); }
    finally { delete j.payoutInFlight; }
    j.payoutTransferId = tr.id; j.payoutStatus = 'paid'; j.payoutAt = new Date().toISOString(); j.workerPaid = true; delete j.payoutError;
    save();
    notify(w.id, 'payment', 'Your payout of ' + usd(j.payOffer) + ' for job ' + j.id + ' (' + (j.service || '') + ') was sent via Stripe — it pays out to your bank automatically.');
    notifyAdmins('payment', 'Worker payout sent: ' + usd(j.payOffer) + ' to ' + w.name + ' for job ' + j.id + ' (transfer ' + tr.id + ').');
  } catch (e) {
    const msg = String((e && e.message) || e);
    j.payoutStatus = /insufficient/i.test(msg) ? 'pending_funds' : 'error';
    j.payoutError = msg.slice(0, 200);
    save();
    notifyAdmins('payment', 'Worker payout for job ' + j.id + ' did not go out (' + j.payoutStatus + '): ' + j.payoutError);
  }
}
// Retry payouts that were waiting (funds pending, capture not in yet, or
// the worker had not finished setup). Runs inside normal request handling
// only — throttled — never as background work.
let lastPayoutSweep = 0;
function sweepPendingPayouts() {
  const now = Date.now();
  if (now - lastPayoutSweep < 60 * 1000) return;
  lastPayoutSweep = now;
  db.jobs.filter(j => !j.payoutTransferId
    && ['pending_funds', 'awaiting_capture', 'awaiting_worker_setup'].includes(j.payoutStatus)
    && j.status === 'Done — photos sent'
    && !(j.payoutTriedAt && (now - new Date(j.payoutTriedAt).getTime() < 2 * 60 * 1000)))
    .slice(0, 10)
    .forEach(j => { maybePayWorkerForJob(j); accrueCaptainOverride(j); });
}
function stripeReady() { return !!STRIPE_SECRET_KEY; }
async function stripeApi(path, params) {
  const body = new URLSearchParams();
  Object.keys(params || {}).forEach(k => { if (params[k] !== undefined && params[k] !== null) body.append(k, String(params[k])); });
  const r = await fetch(STRIPE_API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(20000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe: ' + ((data && data.error && data.error.message) || ('HTTP ' + r.status)));
  return data;
}
async function stripeGet(path) {
  const r = await fetch(STRIPE_API + path, { method: 'GET', headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY }, signal: AbortSignal.timeout(20000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe: ' + ((data && data.error && data.error.message) || ('HTTP ' + r.status)));
  return data;
}
async function homeCarePriceId() {
  if (process.env.STRIPE_PRICE_HOMECARE) return process.env.STRIPE_PRICE_HOMECARE;
  db.settings = db.settings || {};
  const isGood = (p) => p && Number(p.unit_amount) === HOMECARE_MONTHLY_CENTS && p.recurring && p.recurring.interval === 'month' && p.active !== false;
  const cached = db.settings.stripeHomeCarePrice;
  if (cached) {
    // Self-healing (added 2026-10-19, refined same day): Stripe prices are
    // immutable — if the cached price doesn't match the monthly amount the business
    // charges (e.g. a $40 test price cached earlier), first check the
    // product's DEFAULT price (the dashboard is the source of truth now) and
    // only create a new price if no correct one exists. Never blocks checkout.
    try {
      const p = await stripeGet('/prices/' + cached);
      if (isGood(p)) return cached;
      const productId = typeof p.product === 'string' ? p.product : (p.product && p.product.id);
      console.log('stripe: cached HomeCare price ' + cached + ' is $' + ((Number(p.unit_amount) || 0) / 100).toFixed(2) + ' — checking product default first');
      if (productId) {
        try {
          const prod = await stripeGet('/products/' + productId);
          const defId = typeof prod.default_price === 'string' ? prod.default_price : (prod.default_price && prod.default_price.id);
          if (defId && defId !== cached) {
            const dp = await stripeGet('/prices/' + defId);
            if (isGood(dp)) {
              db.settings.stripeHomeCarePrice = defId;
              save();
              console.log('stripe: HomeCare price repointed to product default ' + defId);
              return defId;
            }
          }
        } catch (e) { console.error('stripe: product default lookup failed:', e.message); }
      }
      console.log('stripe: creating correct $' + (HOMECARE_MONTHLY_CENTS / 100).toFixed(2) + '/mo price on the same product');
      const np = await stripeApi('/prices', { product: productId || p.product, unit_amount: HOMECARE_MONTHLY_CENTS, currency: 'usd', 'recurring[interval]': 'month' });
      db.settings.stripeHomeCarePrice = np.id;
      save();
      console.log('stripe: HomeCare price corrected: ' + np.id + ' — set it as STRIPE_PRICE_HOMECARE in Render env to skip this check');
      return np.id;
    } catch (e) { console.error('stripe: HomeCare price check failed, keeping cached price:', e.message); return cached; }
  }
  console.log('stripe: creating HomeCare $' + (HOMECARE_MONTHLY_CENTS / 100) + '/mo product + price (set STRIPE_PRICE_HOMECARE to skip this)');
  const product = await stripeApi('/products', { name: 'HomeCare Membership — General Handyman Solutions', description: 'Monthly HomeCare membership: one free estimate in month one, $50 member estimates after, 20% off labor under $1,000, priority scheduling.' });
  const price = await stripeApi('/prices', { product: product.id, unit_amount: HOMECARE_MONTHLY_CENTS, currency: 'usd', 'recurring[interval]': 'month' });
  db.settings.stripeHomeCarePrice = price.id;
  console.log('stripe: HomeCare price created: ' + price.id + ' — save it as STRIPE_PRICE_HOMECARE in Render env');
  save();
  return price.id;
}
// Yard/Plus price resolution (v40): MEMBERSHIP_PLANS.monthlyCents is the
// price TRUTH; plan.priceId is only a hint. A configured price is used for a
// charge ONLY after Stripe confirms its amount matches the plan — otherwise
// the resolver finds the product's matching price, or creates it on the
// plan's existing product (the same self-healing pattern as homeCarePriceId
// above), and caches the winner in db.settings. Any Stripe failure falls
// back to the configured id, so a join is never blocked by the check. This
// keeps every charge at the current plan price even while plan.priceId
// still points at a superseded price (e.g. yard1's old $95 id).
async function membershipPriceIdFor(plan) {
  if (!plan) return '';
  if (plan.key === 'homecare') return homeCarePriceId();
  if (!stripeReady()) return plan.priceId || '';
  db.settings = db.settings || {};
  const cacheKey = 'stripePrice_' + plan.key;
  const isGood = (p) => p && Number(p.unit_amount) === plan.monthlyCents && p.recurring && p.recurring.interval === 'month' && p.active !== false;
  const candidates = [];
  if (db.settings[cacheKey]) candidates.push(db.settings[cacheKey]);
  if (plan.priceId && !candidates.includes(plan.priceId)) candidates.push(plan.priceId);
  for (const cand of candidates) {
    try { const p = await stripeGet('/prices/' + cand); if (isGood(p)) { if (db.settings[cacheKey] !== cand) { db.settings[cacheKey] = cand; save(); } return cand; } } catch (e) {}
  }
  try {
    const list = await stripeGet('/prices?product=' + plan.productId + '&active=true&limit=100');
    const found = ((list && list.data) || []).find(isGood);
    if (found) { db.settings[cacheKey] = found.id; save(); console.log('stripe: ' + plan.key + ' price resolved to existing ' + found.id + ' ($' + (plan.monthlyCents / 100) + '/mo)'); return found.id; }
    const np = await stripeApi('/prices', { product: plan.productId, unit_amount: plan.monthlyCents, currency: 'usd', 'recurring[interval]': 'month' });
    db.settings[cacheKey] = np.id; save();
    console.log('stripe: created ' + plan.key + ' price ' + np.id + ' ($' + (plan.monthlyCents / 100) + '/mo)');
    return np.id;
  } catch (e) { console.error('stripe: ' + plan.key + ' price resolution failed, using configured price:', e.message); return plan.priceId || ''; }
}
function appBase() { return APP_URL.replace(/\/$/, ''); }
async function createCheckoutSession(kind, user, opts) {
  opts = opts || {};
  // Optional tip (added 2026-10-19): applies to every one-time charge on the
  // page EXCEPT the HomeCare membership. Added as a second line item.
  const tipCents = (kind === 'homecare' || kind === 'yardcare' || kind === 'homecare-plus' || kind === 'estimate-hold') ? 0 : Math.max(0, Math.round(Number(opts.tipCents) || 0));
  const params = {
    success_url: appBase() + '/payment/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: appBase() + '/payment/cancelled',
    'metadata[userId]': user.id,
    'metadata[kind]': kind
  };
  // Only send customer_email when we actually have one — Stripe rejects an
  // empty string (e.g. text-message invoices created without an email).
  if (user.email) params.customer_email = user.email;
  if (kind === 'homecare') {
    params.mode = 'subscription';
    params['line_items[0][price]'] = await homeCarePriceId();
    params['line_items[0][quantity]'] = '1';
    params['subscription_data[metadata][userId]'] = user.id;
    params['subscription_data[metadata][kind]'] = 'homecare';
  } else if (kind === 'yardcare' || kind === 'homecare-plus') {
    // Membership plans (added 2026-10-21): the price ALWAYS comes from the
    // fixed server-side plan map keyed by opts.plan (yard1/yard2/plus1/
    // plus2) — a price id sent by the client is never trusted or read.
    const plan = MEMBERSHIP_PLANS[opts.plan];
    if (!plan || plan.kind !== kind) throw new Error('unknown membership plan');
    params.mode = 'subscription';
    params['line_items[0][price]'] = await membershipPriceIdFor(plan);
    params['line_items[0][quantity]'] = '1';
    params['metadata[plan]'] = plan.key;
    params['subscription_data[metadata][userId]'] = user.id;
    params['subscription_data[metadata][kind]'] = kind;
    params['subscription_data[metadata][plan]'] = plan.key;
  } else if (kind === 'estimate' || kind === 'member-estimate') {
    // 'member-estimate' is a fixed $50 one-time payment for active members;
    // the session is a normal one-time payment, the kind is kept in metadata.
    params.mode = 'payment';
    params['line_items[0][price_data][currency]'] = 'usd';
    params['line_items[0][price_data][unit_amount]'] = String(opts.amountCents);
    params['line_items[0][price_data][product_data][name]'] = opts.label || 'In-person estimate — General Handyman Solutions';
    params['line_items[0][quantity]'] = '1';
    params['metadata[requestId]'] = opts.requestId || '';
  } else if (kind === 'estimate-hold') {
    // Authorization HOLD for the in-person estimate fee (added 2026-10-20,
    // HOLD-PAYMENT-MODEL): capture_method=manual means Stripe AUTHORIZES
    // the card but does NOT charge it. Gabriel captures the final amount by
    // hand when the work is done — nothing captures automatically. The
    // incremental-authorization request rides along as if_available: until
    // Stripe enables it on the account, webhook enrichment reports
    // 'unavailable' and the app falls back to a second balance
    // authorization. No tip on holds: tips are settled at the end as today.
    params.mode = 'payment';
    params['line_items[0][price_data][currency]'] = 'usd';
    params['line_items[0][price_data][unit_amount]'] = String(opts.amountCents);
    params['line_items[0][price_data][product_data][name]'] = opts.label || 'In-person estimate — authorization hold — General Handyman Solutions';
    params['line_items[0][quantity]'] = '1';
    params['metadata[requestId]'] = opts.requestId || '';
    params['metadata[holdKey]'] = opts.holdKey || 'visit';
    params['payment_intent_data[capture_method]'] = 'manual';
    params['payment_intent_data[metadata][kind]'] = 'estimate-hold';
    params['payment_intent_data[metadata][requestId]'] = opts.requestId || '';
    params['payment_intent_data[metadata][holdKey]'] = opts.holdKey || 'visit';
    params['payment_method_options[card][request_incremental_authorization]'] = 'if_available';
    params['custom_text[submit][message]'] = 'This places an authorization HOLD for an estimated amount — it is NOT a final charge. The hold may increase if you approve a larger written quote, and you are only charged the final amount when the work is done.';
    params['custom_text[after_submit][message]'] = 'Your card was authorized (hold only, not charged). You can follow your payment live from your estimate page.';
  } else if (kind === 'invoice') {
    // One-time invoice payment: the payer may not have an app account (the
    // invoice carries customerEmail directly), so user fields are optional.
    params.mode = 'payment';
    params['line_items[0][price_data][currency]'] = 'usd';
    params['line_items[0][price_data][unit_amount]'] = String(opts.amountCents);
    params['line_items[0][price_data][product_data][name]'] = opts.label || 'Invoice payment — General Handyman Solutions';
    params['line_items[0][quantity]'] = '1';
    params['metadata[invoiceId]'] = opts.invoiceId || '';
    params['metadata[customerEmail]'] = (user && user.email) || opts.email || '';
  } else {
    throw new Error('unknown checkout kind');
  }
  if (tipCents > 0) {
    params['line_items[1][price_data][currency]'] = 'usd';
    params['line_items[1][price_data][unit_amount]'] = String(tipCents);
    params['line_items[1][price_data][product_data][name]'] = 'Tip — thank you!';
    params['line_items[1][quantity]'] = '1';
  }
  params['metadata[tipCents]'] = String(tipCents);
  return stripeApi('/checkout/sessions', params);
}
function readRawBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); }); }
// ---------- Inline one-submit membership subscriptions ----------
// Shared core of the inline card flow (HomeCare since 2026-10-19, extended
// to Yard Care / HomeCare Plus 2026-10-21): the member's card is collected
// in the app's own form via Stripe Elements, so step 1 creates a
// default_incomplete subscription at the SERVER-side plan price and
// returns its PaymentIntent client secret; the browser confirms the card
// with Stripe.js; step 2 verifies the payment with Stripe and activates
// the membership synchronously through the SAME helpers the webhooks use
// (activateHomeCare / activateMembershipPlan). The webhook lifecycle stays
// as the backup activator and reconciles idempotently: subscription
// metadata carries userId + kind + plan, and activation is a no-op when
// the plan is already active on the same subscription.
async function createInlineSubscription(user, plan) {
  let customerId = user.stripeCustomerId || '';
  if (customerId) { try { await stripeGet('/customers/' + customerId); } catch (e) { customerId = ''; } }
  if (!customerId) {
    const c = await stripeApi('/customers', { email: user.email, name: user.name || undefined, phone: user.phone || undefined, 'metadata[userId]': user.id });
    customerId = c.id;
    user.stripeCustomerId = customerId;
  }
  // Drop a stale incomplete subscription so card retries don't stack up.
  if (user.stripeSubscriptionId) {
    try {
      const s = await stripeGet('/subscriptions/' + user.stripeSubscriptionId);
      if (s && (s.status === 'incomplete' || s.status === 'incomplete_expired')) {
        await stripeApi('/subscriptions/' + user.stripeSubscriptionId + '/cancel', {});
      }
    } catch (e) {}
    user.stripeSubscriptionId = '';
  }
  const priceId = await membershipPriceIdFor(plan);
  const sub = await stripeApi('/subscriptions', {
    customer: customerId,
    'items[0][price]': priceId,
    'items[0][quantity]': '1',
    payment_behavior: 'default_incomplete',
    'payment_settings[save_default_payment_method]': 'on_subscription',
    'metadata[userId]': user.id,
    'metadata[kind]': plan.kind,
    'metadata[plan]': plan.key,
    'expand[]': 'latest_invoice.payment_intent'
  });
  user.stripeSubscriptionId = sub.id;
  if (plan.key !== 'homecare') setMembershipPlan(user, plan.key, { status: sub.status || 'incomplete', subscriptionId: sub.id });
  save();
  const pi = sub.latest_invoice && sub.latest_invoice.payment_intent;
  if (!pi || !pi.client_secret) throw new Error('stripe did not return a payment intent');
  return { clientSecret: pi.client_secret, subscriptionId: sub.id };
}
async function inlineSubscriptionPaid(user) {
  const sub = await stripeGet('/subscriptions/' + user.stripeSubscriptionId);
  let paid = sub.status === 'active';
  if (!paid) {
    const invId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : (sub.latest_invoice && sub.latest_invoice.id);
    if (invId) {
      const inv = await stripeGet('/invoices/' + invId);
      const piId = typeof inv.payment_intent === 'string' ? inv.payment_intent : (inv.payment_intent && inv.payment_intent.id);
      if (piId) { const pi = await stripeGet('/payment_intents/' + piId); paid = pi.status === 'succeeded'; }
      else paid = inv.status === 'paid';
    }
  }
  return { paid, sub, plan: planFromSubscription(sub, membershipPlanOf(user)) };
}
function verifyStripeSig(payload, header) {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const m = /t=(\d+).*v1=([a-f0-9]+)/.exec(header || '');
  if (!m) return false;
  if (Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false; // stale signature
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(m[1] + '.' + payload, 'utf8').digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(m[2], 'hex')); } catch (e) { return false; }
}
// Single place that turns a user into an active HomeCare member (added
// 2026-10-19 for the inline "New HomeCare member" signup). Used by the
// homecare-confirm endpoint (synchronous, right after the card is charged)
// and by the invoice.payment_succeeded webhook (backup). Idempotent.
function activateHomeCare(u, isFirst) {
  applySourceAtActivation(u);
  const first = isFirst || !u.homeCareSince;
  // One free estimate per ACCOUNT (shared across all plans, 2026-10-21): if
  // this account ever held a membership before, (re)joining HomeCare does
  // NOT resurrect a consumed free estimate. The Team can still re-grant it
  // by hand from the admin customer panel.
  const hadMembership = !!(u.homeCareSince || (u.membershipPlan && u.membershipPlan.since));
  u.homeCareStatus = 'active';
  if (!u.homeCareSince) u.homeCareSince = new Date().toISOString();
  u.homeCareCancelAt = null;
  setMembershipPlan(u, 'homecare', { status: 'active', subscriptionId: u.stripeSubscriptionId || '', since: u.homeCareSince, cancelAt: null });
  if (first) {
    if (!hadMembership) u.freeEstimateUsed = false; // fresh membership gets its free first estimate
    notify(u.id, 'membership', 'Welcome to HomeCare! Your membership is active. Your first in-person estimate is FREE — request it from your dashboard.');
    notifyAdmins('membership', u.name + ' (' + u.email + ') joined HomeCare ($29/mo).');
    fireAutomation('homecare_welcome', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
  } else {
    notify(u.id, 'membership', 'Your HomeCare payment went through — your membership is active again with all member benefits.');
    notifyAdmins('membership', u.name + ' (' + u.email + ') HomeCare payment succeeded — membership active.');
  }
  save();
}
// ---------- Estimate authorization holds (added 2026-10-20, HOLD-PAYMENT-MODEL) ----------
// Gabriel's payment model: the in-person estimate fee ($75 regular / $50
// member) is AUTHORIZED (a hold) when the customer books — never charged up
// front and NEVER captured automatically anywhere in this app. After the
// customer approves the estimate, the authorization is raised to the
// approved total (incremental authorization when the card supports it,
// otherwise a second "balance" authorization). Gabriel captures the final
// amount BY HAND from the admin panel when he decides, at the amount he
// decides. Approvals and job completions never trigger a capture.
function requestHolds(r) { return Array.isArray(r && r.holds) ? r.holds : []; }
function holdsPool(r) { return requestHolds(r).filter(h => h.status === 'authorized').reduce((s, h) => s + (Number(h.authorizedCents) || 0), 0); }
function findHold(r, pi) { return requestHolds(r).find(h => h.pi === pi) || null; }
function findHoldByPi(pi) {
  if (!pi) return null;
  for (const r of db.requests) { const h = findHold(r, pi); if (h) return { request: r, hold: h }; }
  return null;
}
// The amount the customer owes in total for the approved estimate, in
// cents: estimate.total already had the appointment credit SUBTRACTED, so
// the authorization target adds it back (total + credit).
function holdTargetCents(r) { return r && r.estimate ? Math.round(((Number(r.estimate.total) || 0) + (Number(r.estimate.credit) || 0)) * 100) : 0; }
function upsertHold(r, key, pi, patch) {
  if (!Array.isArray(r.holds)) r.holds = [];
  let h = r.holds.find(x => x.key === key) || (pi ? r.holds.find(x => x.pi === pi) : null);
  const now = new Date().toISOString();
  if (!h) { h = { key: key || 'visit', pi: pi || '', sessionId: '', status: 'authorized', authorizedCents: 0, capturedCents: 0, captureBefore: null, incremental: null, createdAt: now, updatedAt: now }; r.holds.push(h); }
  Object.assign(h, patch || {});
  if (pi) h.pi = pi;
  h.updatedAt = now;
  return h;
}
// Webhook side of a completed estimate-hold checkout: file the hold on the
// request, then TRY to enrich it with the authorization expiry and the
// incremental-authorization availability. Enrichment failure must never
// fail the webhook (a fake/rotated key still leaves a usable hold record).
async function holdFromCheckoutSession(obj) {
  const md = obj.metadata || {};
  const r = db.requests.find(x => x.id === md.requestId);
  if (!r) { console.error('stripe webhook: estimate-hold session ' + obj.id + ' has no matching request'); return; }
  const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : ((obj.payment_intent && obj.payment_intent.id) || '');
  const key = md.holdKey === 'balance' ? 'balance' : 'visit';
  const authorizedCents = Math.round(Number(obj.amount_total) || 0);
  const existing = requestHolds(r).find(h => h.sessionId === obj.id) || (pi ? findHold(r, pi) : null);
  const firstTime = !existing;
  const h = upsertHold(r, key, pi, { sessionId: obj.id, status: 'authorized', authorizedCents: authorizedCents || (existing ? existing.authorizedCents : 0) });
  if (pi) {
    try {
      const full = await stripeGet('/payment_intents/' + pi + '?expand[]=latest_charge');
      const card = full && full.latest_charge && full.latest_charge.payment_method_details && full.latest_charge.payment_method_details.card;
      if (card) {
        if (card.capture_before) h.captureBefore = new Date(Number(card.capture_before) * 1000).toISOString();
        if (card.incremental_authorization && card.incremental_authorization.status) h.incremental = card.incremental_authorization.status;
        h.updatedAt = new Date().toISOString();
      }
    } catch (e) { console.error('hold enrichment failed (continuing without it):', e.message); }
  }
  if (firstTime) {
    r.messages = r.messages || [];
    r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: key === 'balance'
      ? 'Balance authorization received: ' + usd(h.authorizedCents / 100) + ' is on hold (authorized only — NOT charged yet). The Team will confirm the final charge with you when the work is done.'
      : 'Appointment secured: we placed a ' + usd(h.authorizedCents / 100) + ' authorization HOLD on your card (authorized only — NOT charged yet). You are only charged the final amount when the work is done.', at: new Date().toISOString() });
    if (r.customerId) notify(r.customerId, 'payment', 'Authorization hold placed (' + usd(h.authorizedCents / 100) + ') on request ' + r.id + ' — not charged yet. Your appointment is secured.');
    notifyAdmins('payment', 'Authorization HOLD ' + usd(h.authorizedCents / 100) + ' placed on request ' + r.id + ' (' + (r.customerName || r.customerEmail || 'customer') + ') — ' + key + ' hold, PI ' + (pi || 'n/a') + '.');
  }
}
// After an estimate approval, TRY to raise the visit hold to the approved
// total. This only ever raises an AUTHORIZATION — never a capture. Any
// failure lands on r.holdSync so the admin panel and the public estimate
// page can offer the balance-authorization fallback. Never throws.
async function tryHoldIncrementAfterApproval(r) {
  try {
    const visit = requestHolds(r).find(h => h.key === 'visit' && h.status === 'authorized');
    if (!visit || !r.estimate) return;
    const target = holdTargetCents(r);
    if (!(target > 0)) return;
    if (holdsPool(r) >= target) { r.holdSync = { targetCents: target, state: 'covered', at: new Date().toISOString() }; return; }
    if (visit.incremental === 'unavailable') {
      r.holdSync = { targetCents: target, state: 'needs_balance', at: new Date().toISOString() };
      notifyAdmins('payment', 'Request ' + r.id + ' approved (' + usd(target / 100) + ') — this card cannot be incremented. Send the balance authorization from the hold panel.');
      return;
    }
    const out = await stripeApi('/payment_intents/' + visit.pi + '/increment_authorization', { amount: target });
    visit.authorizedCents = Math.round(Number(out.amount) || target);
    visit.updatedAt = new Date().toISOString();
    r.holdSync = { targetCents: target, state: 'incremented', at: new Date().toISOString() };
    r.messages = r.messages || [];
    r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Your card authorization was updated to ' + usd(target / 100) + ' (hold only — still NOT charged). You are only charged the final amount when the work is done.', at: new Date().toISOString() });
    if (r.customerId) notify(r.customerId, 'payment', 'Authorization on request ' + r.id + ' updated to ' + usd(target / 100) + ' (hold only, not charged).');
    notifyAdmins('payment', 'Authorization on request ' + r.id + ' incremented to ' + usd(target / 100) + '.');
  } catch (e) {
    console.error('hold increment after approval failed', r.id, e.message);
    r.holdSync = { targetCents: holdTargetCents(r), state: 'increment_failed', at: new Date().toISOString(), error: e.message };
    notifyAdmins('payment', 'Increment FAILED on request ' + r.id + ': ' + e.message + ' — use the balance authorization fallback in the hold panel.');
  }
}
// Shared by the admin button and the public estimate page: create a
// balance-authorization checkout for whatever of the approved total is not
// yet authorized. Throws plain Errors with customer-safe messages.
async function startBalanceAuthorization(r) {
  const target = holdTargetCents(r);
  if (!r.estimate || !(target > 0)) throw new Error('build the estimate first — the balance is the approved total minus what is already authorized');
  const missing = target - holdsPool(r);
  if (missing <= 0) throw new Error('the authorized pool already covers the approved total');
  if (requestHolds(r).some(h => h.key === 'balance' && h.status === 'authorized')) throw new Error('a balance authorization is already active on this request');
  const s = await createCheckoutSession('estimate-hold', { id: r.customerId || '', email: r.customerEmail || '' }, { amountCents: missing, requestId: r.id, holdKey: 'balance', label: 'Balance authorization (request ' + r.id + ') — General Handyman Solutions' });
  return { url: s.url, amount: missing / 100 };
}
async function handleStripeEvent(event) {
  const type = event && event.type;
  const obj = event && event.data && event.data.object;
  if (!obj) return;
  if (type === 'checkout.session.completed') {
    const kind = obj.metadata && obj.metadata.kind;
    // Estimate holds are filed BEFORE the user lookup: a guest checkout has
    // no app user, and the request (via session metadata) is the identity.
    if (kind === 'estimate-hold') { await holdFromCheckoutSession(obj); return; }
    const u = db.users.find(x => x.id === (obj.metadata && obj.metadata.userId));
    if (!u) { console.error('stripe webhook: no user for session ' + obj.id); return; }
    if (kind === 'homecare') {
      const hadMembership = !!(u.homeCareSince || (u.membershipPlan && u.membershipPlan.since));
      u.homeCareStatus = 'active';
      u.homeCareSince = new Date().toISOString();
      u.homeCareCancelAt = null;
      if (!hadMembership) u.freeEstimateUsed = false; // one free estimate per account — switches/rejoins never re-grant it
      u.stripeCustomerId = obj.customer || u.stripeCustomerId || '';
      u.stripeSubscriptionId = obj.subscription || u.stripeSubscriptionId || '';
      setMembershipPlan(u, 'homecare', { status: 'active', subscriptionId: u.stripeSubscriptionId || '', since: u.homeCareSince, cancelAt: null });
      applySourceAtActivation(u);
      notify(u.id, 'membership', 'Welcome to HomeCare! Your membership is active. Your first in-person estimate is FREE — request it from your dashboard.');
      notifyAdmins('membership', u.name + ' (' + u.email + ') joined HomeCare ($29/mo).');
      fireAutomation('homecare_welcome', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
    } else if (kind === 'yardcare' || kind === 'homecare-plus') {
      // Plan key comes from the checkout session metadata WE set server-side
      // (never from the client). activateMembershipPlan records the plan,
      // and for Plus also flips the legacy HomeCare flag so all member
      // benefits apply. Idempotent against subscription.created ordering.
      const planKey = obj.metadata && obj.metadata.plan;
      const plan = planKey && MEMBERSHIP_PLANS[planKey];
      if (!plan || plan.kind !== kind) { console.error('stripe webhook: membership session ' + obj.id + ' has unknown plan ' + planKey); return; }
      if (obj.customer) u.stripeCustomerId = obj.customer;
      activateMembershipPlan(u, plan.key, { subscriptionId: obj.subscription || '', first: true });
    } else if (kind === 'estimate' || kind === 'member-estimate') {
      const r = db.requests.find(x => x.id === (obj.metadata && obj.metadata.requestId));
      const amount = Math.round(Number(obj.amount_total) || 0) / 100;
      const tipCents = Math.max(0, Math.round(Number(obj.metadata && obj.metadata.tipCents) || 0));
      if (r) {
        r.estimatePaid = { sessionId: obj.id, amount: amount, tip: tipCents / 100, at: new Date().toISOString() };
        r.messages = r.messages || [];
        r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Payment received: $' + amount.toFixed(2) + ' towards your estimate. Your appointment is secured — the Team will confirm your time here.', at: new Date().toISOString() });
        notify(r.customerId, 'payment', 'Payment received ($' + amount.toFixed(2) + ') on request ' + r.id + '. Your appointment is secured.');
        fireAutomation('payment_received', Object.assign(requestAutomationPayload(r), { paidAmount: amount }));
      }
      notifyAdmins('payment', 'Payment received: $' + amount.toFixed(2) + ' from ' + u.name + ' (' + u.email + ')' + (r ? ' on request ' + r.id : '') + '.');
    } else if (kind === 'invoice') {
      const inv = (db.invoices || []).find(x => x.id === (obj.metadata && obj.metadata.invoiceId));
      const amount = Math.round(Number(obj.amount_total) || 0) / 100;
      const tipCents = Math.max(0, Math.round(Number(obj.metadata && obj.metadata.tipCents) || 0));
      if (inv && inv.status !== 'paid') {
        inv.status = 'paid';
        inv.paidAt = new Date().toISOString();
        inv.paidAmount = amount;
        inv.paidMethod = 'stripe';
        inv.stripeSessionId = obj.id;
        inv.tip = tipCents / 100;
        notifyAdmins('payment', 'Invoice ' + inv.id + ' PAID online: $' + amount.toFixed(2) + (tipCents > 0 ? ' (incl. $' + (tipCents / 100).toFixed(2) + ' tip)' : '') + ' from ' + (inv.customerName || inv.customerEmail || '') + '.');
        const cust = inv.customerId && db.users.find(x => x.id === inv.customerId);
        if (cust) notify(cust.id, 'payment', 'Your invoice ' + inv.id + ' ($' + amount.toFixed(2) + ') was paid. Thank you!');
        fireAutomation('invoice_paid', { invoice: publicInvoice(inv) });
      }
    }
  } else if (type === 'customer.subscription.created') {
    // Record WHICH plan each subscription is (from its price/metadata) as
    // soon as Stripe creates it. Only an already-paid (active/trialing)
    // subscription activates benefits here; checkout.session.completed is
    // the normal activator and activateMembershipPlan is idempotent.
    const u = userForSubscription(obj);
    if (u) {
      if (obj.customer) u.stripeCustomerId = obj.customer;
      const plan = planFromSubscription(obj, membershipPlanOf(u));
      if (plan && (obj.status === 'active' || obj.status === 'trialing')) {
        activateMembershipPlan(u, plan.key, { subscriptionId: obj.id });
      } else {
        syncMembershipPlanFromSubscription(u, obj);
      }
    }
  } else if (type === 'customer.subscription.deleted') {
    const u = userForSubscription(obj);
    if (u) {
      const current = membershipPlanOf(u);
      const plan = planFromSubscription(obj, current) || (current.planKey ? MEMBERSHIP_PLANS[current.planKey] : MEMBERSHIP_PLANS.homecare);
      cancelMembershipPlan(u, plan.key, { subscriptionId: obj.id });
      if (plan.type === 'yard') {
        notify(u.id, 'membership', 'Your Yard Care membership has been cancelled. You can rejoin anytime from your dashboard.');
        notifyAdmins('membership', u.name + ' (' + u.email + ') cancelled Yard Care.');
      } else if (plan.type === 'plus') {
        notify(u.id, 'membership', 'Your HomeCare Plus membership has been cancelled. You can rejoin anytime from your dashboard.');
        notifyAdmins('membership', u.name + ' (' + u.email + ') cancelled HomeCare Plus.');
      } else {
        notify(u.id, 'membership', 'Your HomeCare membership has been cancelled. You can rejoin anytime from your dashboard.');
        notifyAdmins('membership', u.name + ' (' + u.email + ') cancelled HomeCare.');
        fireAutomation('homecare_cancelled', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
      }
    }
  } else if (type === 'customer.subscription.updated') {
    const u = userForSubscription(obj);
    if (u) {
      // Keeps the recorded plan current if the subscription changes (e.g.
      // 1 yard visit upgraded to 2 in the billing portal).
      const mp = syncMembershipPlanFromSubscription(u, obj);
      if (obj.cancel_at_period_end) {
        const until = new Date(Number(obj.cancel_at) * 1000);
        const planName = mp && mp.name ? mp.name : 'HomeCare';
        notify(u.id, 'membership', planName + ' cancellation noted — your membership stays active until ' + until.toLocaleDateString('en-US') + '.');
      }
    }
  } else if (type === 'invoice.payment_failed') {
    // Stripe is the single source of truth: a failed subscription payment means
    // the customer loses member status until payment succeeds again.
    const u = db.users.find(x => x.stripeCustomerId === obj.customer);
    if (u) {
      const current = membershipPlanOf(u);
      if (current.planKey && current.status === 'active' && current.type !== 'homecare') {
        cancelMembershipPlan(u, current.planKey, { subscriptionId: current.subscriptionId || '' });
        notify(u.id, 'payment', 'Your ' + current.name + ' payment failed, so your membership was paused. Update your card and rejoin from your dashboard to get your benefits back.');
        notifyAdmins('payment', current.name + ' payment FAILED for ' + u.name + ' (' + u.email + ') — membership paused.');
      } else if (u.homeCareStatus === 'active') {
        u.homeCareStatus = 'cancelled';
        u.homeCareCancelAt = new Date().toISOString();
        setMembershipPlan(u, 'homecare', { status: 'cancelled', subscriptionId: u.stripeSubscriptionId || '', since: u.homeCareSince || null, cancelAt: u.homeCareCancelAt });
        notify(u.id, 'payment', 'Your HomeCare payment failed, so your membership was paused. Update your card and rejoin from your dashboard to get your member benefits back.');
        notifyAdmins('payment', 'HomeCare payment FAILED for ' + u.name + ' (' + u.email + ') — membership paused.');
        fireAutomation('homecare_cancelled', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
      }
    }
  } else if (type === 'invoice.payment_succeeded') {
    // Payment recovered (e.g. after a retry or a rejoin): restore member status.
    // Also the backup activator for the inline "New HomeCare member" card flow.
    const subId = obj.subscription;
    const u = db.users.find(x => x.stripeSubscriptionId === subId || x.stripeCustomerId === obj.customer);
    if (u) {
      const current = membershipPlanOf(u);
      const subMeta = (obj.subscription_details && obj.subscription_details.metadata) || {};
      const planKey = (subMeta.plan && MEMBERSHIP_PLANS[subMeta.plan]) ? subMeta.plan : (current.planKey || null);
      if (planKey && MEMBERSHIP_PLANS[planKey].type !== 'homecare') {
        // Yard / Plus subscriptions restore THEIR plan — never plain HomeCare.
        if (current.status !== 'active') activateMembershipPlan(u, planKey, { subscriptionId: subId || current.subscriptionId || '' });
      } else if (u.homeCareStatus !== 'active') {
        if (subId) u.stripeSubscriptionId = subId;
        activateHomeCare(u, false);
      }
    }
  } else if (type === 'payment_intent.amount_capturable_updated' || type === 'payment_intent.succeeded' || type === 'payment_intent.canceled' || type === 'payment_intent.payment_failed') {
    // Estimate-hold lifecycle. PIs we do not track (inline HomeCare card
    // flow, older charges) are ignored silently. Idempotent: Stripe may
    // deliver any of these more than once.
    const found = findHoldByPi(obj.id);
    if (!found) return;
    const r = found.request, h = found.hold;
    if (type === 'payment_intent.amount_capturable_updated') {
      // Fires after an incremental authorization: obj.amount is the new
      // total authorized amount on the PaymentIntent.
      if (h.status === 'authorized' && Number(obj.amount) > 0) { h.authorizedCents = Math.round(Number(obj.amount)); h.updatedAt = new Date().toISOString(); }
    } else if (type === 'payment_intent.succeeded') {
      // A capture Gabriel triggered by hand just settled. Holds NEVER set
      // estimatePaid — they are their own money trail on r.holds.
      if (h.status !== 'captured') {
        h.status = 'captured';
        h.capturedCents = Math.round(Number(obj.amount_received) || 0);
        h.updatedAt = new Date().toISOString();
        r.messages = r.messages || [];
        r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Payment captured: ' + usd(h.capturedCents / 100) + ' was charged to your card for request ' + r.id + '. Thank you!', at: new Date().toISOString() });
        if (r.customerId) notify(r.customerId, 'payment', 'Payment captured (' + usd(h.capturedCents / 100) + ') on request ' + r.id + '. Thank you!');
        notifyAdmins('payment', 'Hold CAPTURED on request ' + r.id + ': ' + usd(h.capturedCents / 100) + ' (PI ' + h.pi + ').');
        db.jobs.filter(x => x.requestId === r.id && x.status === 'Done — photos sent').forEach(jj => { maybePayWorkerForJob(jj); }); sweepPendingPayouts();
      }
    } else if (type === 'payment_intent.canceled') {
      if (h.status === 'authorized') {
        const expired = h.captureBefore && new Date(h.captureBefore).getTime() <= Date.now();
        h.status = expired ? 'expired' : 'released';
        h.updatedAt = new Date().toISOString();
        notifyAdmins('payment', 'Hold ' + (expired ? 'EXPIRED' : 'RELEASED') + ' on request ' + r.id + ' (' + usd(h.authorizedCents / 100) + ', PI ' + h.pi + ') — nothing was charged for it.');
      }
    } else if (type === 'payment_intent.payment_failed') {
      notifyAdmins('payment', 'Payment FAILED on hold PI ' + h.pi + ' (request ' + r.id + ') — a charge or increment may have been declined. Check the hold panel.');
    }
  }
}
function money(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function clampMoney(v) { return Math.max(0, money(v)); }
function cleanText(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 500); }
function cleanDate(v) { const s = String(v == null ? '' : v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
// Home details (added 2026-10-21): optional customer-supplied facts about the
// home the Team will service. ZIP is NEVER required (Gabriel's call) — it
// only helps the Team plan routes. Workers never receive any of this: job
// payloads are whitelisted in publicJob and user payloads for workers go
// through pubUser of the WORKER's own record only.
const HOME_TYPES = ['house', 'townhouse', 'apartment', 'other'];
const YARD_SIZES = ['small', 'medium', 'large'];
function cleanZip(v) { return String(v == null ? '' : v).replace(/[^0-9-]/g, '').slice(0, 10); }
function cleanEnum(v, list) { const s = String(v == null ? '' : v).trim().toLowerCase(); return list.includes(s) ? s : ''; }
function homeFieldsFrom(b) {
  b = (b && typeof b === 'object') ? b : {};
  return {
    zipCode: cleanZip(b.zipCode),
    homeType: cleanEnum(b.homeType, HOME_TYPES),
    yardSize: cleanEnum(b.yardSize, YARD_SIZES),
    homeNotes: cleanText(b.homeNotes, 300)
  };
}
// Start-date preference (added 2026-10-21): a PREFERENCE only — it never
// books a visit, posts a job, or charges anything. Gabriel confirms the
// exact day with the member himself. Shape: { type:'asap'|'date', date }.
function todayInLA() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function normalizeStartPreference(v) {
  const asap = { type: 'asap', date: null };
  if (!v || typeof v !== 'object' || v.type !== 'date') return asap;
  const s = cleanDate(v.date);
  if (!s) return asap;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return asap;
  return { type: 'date', date: s };
}
function cleanStartPreference(v) {
  const n = normalizeStartPreference(v);
  if (n.type === 'date' && n.date < todayInLA()) return { type: 'asap', date: null };
  return n;
}
function normalizeEstimate(input, request) {
  const raw = input && typeof input === 'object' ? input : {};
  const items = (Array.isArray(raw.items) ? raw.items : []).map(it => {
    const qty = Math.max(0, Math.min(999, Number(it && it.qty) || 0));
    const unitPrice = clampMoney(it && it.unitPrice);
    const description = cleanText(it && (it.description || it.desc || it.name), 180);
    return { description, qty, unitPrice, lineTotal: money(qty * unitPrice) };
  }).filter(it => it.description && it.qty > 0);
  if (!items.length && typeof raw.total === 'number') {
    const total = clampMoney(raw.total);
    items.push({ description: 'Labor', qty: 1, unitPrice: total, lineTotal: total });
  }
  const subtotal = money(items.reduce((sum, it) => sum + it.lineTotal, 0));
  const asap = !!raw.asap;
  const asapRate = asap ? 0.25 : 0;
  const asapAmount = money(subtotal * asapRate);
  const discountPct = Math.max(0, Math.min(90, Number(raw.discountPct) || 0));
  const discountAmount = money(subtotal * discountPct / 100);
  const defaultCredit = request && request.estimateType === 'inperson' ? (Number(request.estimateDue) || 0) : 0;
  const credit = Math.min(clampMoney(raw.credit == null ? defaultCredit : raw.credit), money(subtotal + asapAmount - discountAmount));
  const total = Math.max(0, money(subtotal + asapAmount - discountAmount - credit));
  let bookingDue = raw.bookingDue == null || raw.bookingDue === '' ? (credit > 0 ? Math.min(credit || 75, total) : money(total / 2)) : clampMoney(raw.bookingDue);
  bookingDue = Math.min(bookingDue, total);
  return { items, subtotal, asap, asapRate, asapAmount, discountPct, discountAmount, credit, total, bookingDue, balanceDue: money(total - bookingDue), bookingAuto: raw.bookingDue == null || raw.bookingDue === '', currency: 'USD', updatedAt: new Date().toISOString() };
}
// HomeCare benefit (2026-10-10 refinement): ONLY active members get the 20% labor
// discount on jobs under $1,000. Non-members always see normal pricing. Applied
// automatically when the admin builds the estimate unless the admin set their own
// discount — the admin's manual choice always wins.
function applyMemberDiscount(est, request, customer) {
  const subtotal = est.subtotal || 0;
  const isMember = customer && customer.homeCareStatus === 'active';
  if (!isMember || subtotal <= 0 || subtotal >= 1000) return est;
  if (est.discountPct > 0) return est; // admin set their own discount — respect it
  const d = Math.round(subtotal * 0.20 * 100) / 100;
  est.discountPct = 20;
  est.discountAmount = d;
  est.memberDiscount = true;
  const credit = est.credit || 0;
  est.total = Math.max(0, Math.round((subtotal + (est.asapAmount || 0) - d - credit) * 100) / 100);
  if (est.bookingAuto) est.bookingDue = est.credit > 0 ? Math.min(est.credit, est.total) : money(est.total / 2);
  else est.bookingDue = Math.min(est.bookingDue, est.total);
  est.balanceDue = Math.round((est.total - est.bookingDue) * 100) / 100;
  return est;
}
// ---------- Invoices (added 2026-10-12) ----------
// Standalone invoices for completed jobs: the admin creates a draft with line
// items, sends it by email with a Stripe payment link, and the customer pays
// online or the admin marks it paid by hand (cash/Zelle). Invoices are normal
// business invoices (labor + any parts the Team agreed to include) — the
// worker-facing copy rules do not apply to customer invoices.
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
function normalizeInvoice(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const items = (Array.isArray(raw.items) ? raw.items : []).map(it => {
    const qty = Math.max(0, Math.min(9999, Number(it && it.qty) || 0));
    const unitPrice = clampMoney(it && it.unitPrice);
    const description = cleanText(it && (it.description || it.desc || it.name), 180);
    return { description, qty, unitPrice, lineTotal: money(qty * unitPrice) };
  }).filter(it => it.description && it.qty > 0 && it.unitPrice >= 0);
  const subtotal = money(items.reduce((s, it) => s + it.lineTotal, 0));
  const discount = Math.min(clampMoney(raw.discount), subtotal);
  const total = money(subtotal - discount);
  return { items, subtotal, discount, total };
}
function invoicePayLink(inv) { return appBase() + '/invoice/' + inv.id; }
function publicInvoice(inv) {
  return { id: inv.id, customerName: inv.customerName || '', customerEmail: inv.customerEmail || '', customerPhone: inv.customerPhone || '', jobId: inv.jobId || '', requestId: inv.requestId || '', items: inv.items || [], subtotal: inv.subtotal || 0, discount: inv.discount || 0, total: inv.total || 0, status: inv.status || 'draft', notes: inv.notes || '', dueDate: inv.dueDate || '', payLink: invoicePayLink(inv), createdAt: inv.createdAt || '', updatedAt: inv.updatedAt || null, sentAt: inv.sentAt || null, paidAt: inv.paidAt || null, paidMethod: inv.paidMethod || '', paidAmount: inv.paidAmount || 0, tip: inv.tip || 0, remindedAt: inv.remindedAt || null, reminderCount: inv.reminderCount || 0, preferredDate: inv.preferredDate || '', preferredTime: inv.preferredTime || '', scheduleNotes: inv.scheduleNotes || '', scheduleRequestedAt: inv.scheduleRequestedAt || null, confirmedDate: inv.confirmedDate || '', confirmedTime: inv.confirmedTime || '' };
}
function invoiceEmailHtml(inv) {
  let rows = '';
  (inv.items || []).forEach(it => { rows += '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + escMail(it.description) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">' + escMail(it.qty) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.unitPrice) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.lineTotal) + '</td></tr>'; });
  const inner = '<p>Hi ' + escMail(inv.customerName || 'there') + ', here is your invoice <b>' + escMail(inv.id) + '</b> from General Handyman Solutions.</p>'
    + '<table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left;padding:6px 8px">Description</th><th style="padding:6px 8px">Qty</th><th style="padding:6px 8px;text-align:right">Each</th><th style="padding:6px 8px;text-align:right">Line</th></tr>' + rows + '</table>'
    + '<p>Subtotal: <b>' + usd(inv.subtotal) + '</b></p>'
    + (inv.discount > 0 ? '<p>Discount: <b>-' + usd(inv.discount) + '</b></p>' : '')
    + '<p style="font-size:18px">Total due: <b>' + usd(inv.total) + '</b></p>'
    + (inv.dueDate ? '<p>Due date: <b>' + escMail(inv.dueDate) + '</b></p>' : '')
    + (inv.notes ? '<p>' + escMail(inv.notes) + '</p>' : '')
    + '<p><a href="' + invoicePayLink(inv) + '" style="background:#d92323;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold;display:inline-block">Pay ' + usd(inv.total) + ' now</a></p>'
    + '<p style="color:#666;font-size:13px">Or open this link to pay securely online:<br>' + escMail(invoicePayLink(inv)) + '</p>';
  return mailShell('Your invoice from General Handyman Solutions', inner, 'Questions about this invoice? Text or call (707) 862-3773. Thank you for your business!');
}
function invoiceEmailText(inv) {
  const lines = ['General Handyman Solutions — invoice ' + inv.id, 'Customer: ' + (inv.customerName || ''), ''];
  (inv.items || []).forEach(it => { lines.push('- ' + it.description + ' x' + it.qty + ' @ ' + usd(it.unitPrice) + ' = ' + usd(it.lineTotal)); });
  lines.push('', 'Subtotal: ' + usd(inv.subtotal));
  if (inv.discount > 0) lines.push('Discount: -' + usd(inv.discount));
  lines.push('TOTAL DUE: ' + usd(inv.total));
  if (inv.dueDate) lines.push('Due date: ' + inv.dueDate);
  if (inv.notes) lines.push('', inv.notes);
  lines.push('', 'Pay securely online: ' + invoicePayLink(inv), 'Questions? Text/call (707) 862-3773.');
  return lines.join('\n');
}
// Manual payment reminder email (added 2026-10-12): polite but firm. Only sent
// when the admin presses "Remind" — there is no automatic reminder schedule.
function invoiceReminderEmailHtml(inv) {
  let rows = '';
  (inv.items || []).forEach(it => { rows += '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + escMail(it.description) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">' + escMail(it.qty) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.unitPrice) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.lineTotal) + '</td></tr>'; });
  const inner = '<p>Hi ' + escMail(inv.customerName || 'there') + ',</p>'
    + '<p>This is a friendly reminder that invoice <b>' + escMail(inv.id) + '</b> for <b>' + usd(inv.total) + '</b> is still unpaid' + (inv.dueDate ? ' (due <b>' + escMail(inv.dueDate) + '</b>)' : '') + '.</p>'
    + '<p>If you already paid, please disregard this message — and thank you!</p>'
    + '<table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left;padding:6px 8px">Description</th><th style="padding:6px 8px">Qty</th><th style="padding:6px 8px;text-align:right">Each</th><th style="padding:6px 8px;text-align:right">Line</th></tr>' + rows + '</table>'
    + '<p>Subtotal: <b>' + usd(inv.subtotal) + '</b></p>'
    + (inv.discount > 0 ? '<p>Discount: <b>-' + usd(inv.discount) + '</b></p>' : '')
    + '<p style="font-size:18px">Total due: <b>' + usd(inv.total) + '</b></p>'
    + '<p><a href="' + invoicePayLink(inv) + '" style="background:#d92323;color:#fff;padding:12px 18px;text-decoration:none;font-weight:bold;display:inline-block">Pay ' + usd(inv.total) + ' now</a></p>'
    + '<p style="color:#666;font-size:13px">Or open this link to pay securely online:<br>' + escMail(invoicePayLink(inv)) + '</p>'
    + '<p>Please settle this at your earliest convenience so we can close out your job. If something looks wrong on the invoice, just reply to this email and we will make it right.</p>';
  return mailShell('Payment reminder — invoice ' + inv.id + ' (' + usd(inv.total) + ') still unpaid', inner, 'Questions about this invoice? Text or call (707) 862-3773. Thank you for your business!');
}
function invoiceReminderEmailText(inv) {
  const lines = ['General Handyman Solutions — PAYMENT REMINDER', 'Invoice ' + inv.id + ' for ' + usd(inv.total) + ' is still unpaid.', ''];
  (inv.items || []).forEach(it => { lines.push('- ' + it.description + ' x' + it.qty + ' @ ' + usd(it.unitPrice) + ' = ' + usd(it.lineTotal)); });
  lines.push('', 'TOTAL DUE: ' + usd(inv.total));
  if (inv.dueDate) lines.push('Due date: ' + inv.dueDate);
  lines.push('', 'Pay securely online: ' + invoicePayLink(inv), 'Already paid? Please disregard this message. Questions? Text/call (707) 862-3773.');
  return lines.join('\n');
}
function invoicePageHtml(inv) {
  const pub = publicInvoice(inv);
  const rows = (pub.items || []).map(it => '<tr><td style="padding:8px;border-bottom:1px solid #eee">' + escMail(it.description) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + escMail(it.qty) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.unitPrice) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.lineTotal) + '</td></tr>').join('');
  // Customer-facing status (added 2026-10-19): the client never sees internal
  // workflow states — draft/sent both read as "Unpaid" on the public link.
  const displayStatus = (pub.status === 'draft' || pub.status === 'sent') ? 'unpaid' : pub.status;
  const badge = { unpaid: ['#fde2e2', '#c81e1e'], paid: ['#d3f0dd', '#1a7f37'], overdue: ['#fde2e2', '#c81e1e'], cancelled: ['#ececec', '#6b6762'] }[displayStatus] || ['#ececec', '#6b6762'];
  const payable = ['draft', 'sent', 'overdue'].includes(pub.status);
  const tipTotalCents = Math.round(pub.total * 100);
  const tipBtnStyle = 'padding:10px 16px;border:1px solid #ccc;border-radius:999px;background:#fff;font-weight:700;cursor:pointer;font-size:14px';
  const payBlock = payable
    ? '<div style="margin:14px 0;padding:14px;border:1px solid #e5e5e5;border-radius:12px;background:#fafafa">'
    + '<p style="margin:0 0 10px;font-weight:700">Add a tip? <span style="font-weight:400;color:#666;font-size:13px">optional — thank you!</span></p>'
    + '<div id="tipBtns" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + '<button type="button" data-tip="0" class="tipBtn" style="' + tipBtnStyle + '">No tip</button>'
    + '<button type="button" data-tip="10" class="tipBtn" style="' + tipBtnStyle + '">10%</button>'
    + '<button type="button" data-tip="15" class="tipBtn" style="' + tipBtnStyle + '">15%</button>'
    + '<button type="button" data-tip="20" class="tipBtn" style="' + tipBtnStyle + '">20%</button>'
    + '<button type="button" data-tip="custom" class="tipBtn" style="' + tipBtnStyle + '">Custom</button>'
    + '</div>'
    + '<div id="tipCustomWrap" style="display:none;margin-bottom:6px"><label style="font-size:14px;color:#555">$ <input id="tipCustom" type="number" min="0" step="0.01" placeholder="0.00" style="padding:10px;border:1px solid #ccc;border-radius:8px;width:130px;font-size:15px"></label></div>'
    + '<p id="tipLine" style="margin:0;color:#666;font-size:14px"></p>'
    + '</div>'
    + '<button id="payBtn" style="background:#e42535;color:#fff;border:0;border-radius:999px;padding:14px 28px;font-weight:700;font-size:16px;cursor:pointer;width:100%">Pay ' + usd(pub.total) + ' now</button><p id="payMsg" style="color:#666"></p>'
    + '<script>var invCents=' + tipTotalCents + ';var tipCents=0;'
    + 'function fmtC(c){return \"$\"+(c/100).toFixed(2);}'
    + 'function refreshPay(){var t=document.getElementById(\"tipLine\");t.textContent=tipCents>0?(\"Tip: \"+fmtC(tipCents)):\"\";document.getElementById(\"payBtn\").textContent=\"Pay \"+fmtC(invCents+tipCents)+\" now\";}'
    + 'document.querySelectorAll(\".tipBtn\").forEach(function(b){b.onclick=function(){'
    + 'document.querySelectorAll(\".tipBtn\").forEach(function(x){x.style.background=\"#fff\";x.style.color=\"#111\";});'
    + 'b.style.background=\"#0b0b0b\";b.style.color=\"#fff\";'
    + 'var v=b.getAttribute(\"data-tip\");'
    + 'document.getElementById(\"tipCustomWrap\").style.display=(v===\"custom\")?\"block\":\"none\";'
    + 'if(v===\"custom\"){tipCents=Math.max(0,Math.round(parseFloat(document.getElementById(\"tipCustom\").value||\"0\")*100)||0);}'
    + 'else{tipCents=Math.round(invCents*parseFloat(v)/100);}'
    + 'refreshPay();};});'
    + 'document.getElementById(\"tipCustom\").oninput=function(){tipCents=Math.max(0,Math.round(parseFloat(this.value||\"0\")*100)||0);if(tipCents>invCents)tipCents=invCents;refreshPay();};'
    + 'document.querySelector(\".tipBtn\").click();'
    + 'document.getElementById(\"payBtn\").onclick=async()=>{var m=document.getElementById(\"payMsg\");m.textContent=\"Opening secure checkout…\";try{var r=await fetch(\"/api/invoices/' + pub.id + '/pay\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({tipCents:tipCents})});var d=await r.json();if(!r.ok)throw new Error(d.error||\"failed\");location.href=d.url;}catch(e){m.textContent=e.message;}};</scr' + 'ipt>'
    : (pub.status === 'paid' ? '<p style="background:#eef7ee;border:1px solid #bfe3bf;border-radius:10px;padding:12px">✅ This invoice was paid in full. Thank you!</p>' : '<p style="color:#666">This invoice is ' + escMail(pub.status) + '.</p>');
  // Scheduling request (added 2026-10-12): shown on the paid confirmation.
  // This is a REQUEST, not a booking — Gabriel confirms the final schedule
  // himself from the admin panel.
  let schedBlock = '';
  if (pub.status === 'paid') {
    if (pub.scheduleRequestedAt) {
      schedBlock = '<div style="background:#f7f7f7;border:1px solid #ddd;border-radius:10px;padding:14px;margin-top:14px"><h3 style="margin-top:0">📅 Scheduling request received</h3>'
        + '<p>Preferred: <b>' + escMail(pub.preferredDate || '—') + '</b> • <b>' + escMail(pub.preferredTime || '—') + '</b></p>'
        + (pub.scheduleNotes ? '<p style="color:#555">' + escMail(pub.scheduleNotes) + '</p>' : '')
        + (pub.confirmedDate
          ? '<p style="background:#eef7ee;border:1px solid #bfe3bf;border-radius:8px;padding:10px">✅ <b>Confirmed by the Team: ' + escMail(pub.confirmedDate) + (pub.confirmedTime ? ' • ' + escMail(pub.confirmedTime) : '') + '</b></p>'
          : '<p style="color:#666;font-size:13px">The Team will confirm your final date and time shortly — this is a request, not a booking yet.</p>')
        + '</div>';
    } else {
      schedBlock = '<div style="background:#f7f7f7;border:1px solid #ddd;border-radius:10px;padding:14px;margin-top:14px"><h3 style="margin-top:0">📅 Schedule your job</h3>'
        + '<p style="color:#666;font-size:13px">Pick what works for you — the Team confirms the final date and time.</p>'
        + '<label style="display:block;margin:8px 0">Preferred date<br><input type="date" id="schedDate" style="padding:10px;border:1px solid #ccc;border-radius:8px;width:100%;box-sizing:border-box"></label>'
        + '<label style="display:block;margin:8px 0">Time window<br><select id="schedTime" style="padding:10px;border:1px solid #ccc;border-radius:8px;width:100%"><option value="morning">Morning (8am–12pm)</option><option value="afternoon">Afternoon (12pm–5pm)</option><option value="evening">Evening (5pm–8pm)</option></select></label>'
        + '<label style="display:block;margin:8px 0">Notes<br><textarea id="schedNotes" placeholder="Gate code, parking, anything we should know…" style="padding:10px;border:1px solid #ccc;border-radius:8px;width:100%;box-sizing:border-box" rows="3"></textarea></label>'
        + '<button id="schedBtn" style="background:#0b0b0b;color:#fff;border:0;border-radius:999px;padding:14px 26px;font-weight:700;font-size:16px;cursor:pointer;width:100%">Request this time</button><p id="schedMsg" style="color:#666"></p></div>'
        + '<script>document.getElementById("schedBtn").onclick=async()=>{var m=document.getElementById("schedMsg");var d=document.getElementById("schedDate").value;if(!d){m.textContent="Pick a preferred date first.";return;}m.textContent="Sending…";try{var r=await fetch("/api/invoices/' + pub.id + '/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({preferredDate:d,preferredTime:document.getElementById("schedTime").value,scheduleNotes:document.getElementById("schedNotes").value})});var j=await r.json();if(!r.ok)throw new Error(j.error||"failed");location.reload();}catch(e){m.textContent=e.message;}};</scr' + 'ipt>';
    }
  }
  return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ' + escMail(pub.id) + ' — General Handyman Solutions</title>'
    + '<body style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111">'
    + '<div style="background:#0b0b0b;color:#fff;padding:16px 20px;border-radius:14px 14px 0 0"><div style="font-size:19px;font-weight:bold">General Handyman Solutions</div><div style="color:#ff4444;font-size:13px">Fairfield \u2022 Vacaville \u2022 Vallejo \u2022 Solano County</div></div>'
    + '<div style="border:1px solid #ddd;border-top:0;border-radius:0 0 14px 14px;padding:18px 20px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Invoice ' + escMail(pub.id) + '</h2><span style="background:' + badge[0] + ';color:' + badge[1] + ';border-radius:999px;padding:6px 14px;font-weight:700;font-size:13px;text-transform:uppercase">' + escMail(displayStatus) + '</span></div>'
    + '<p style="color:#666">Billed to <b>' + escMail(pub.customerName) + '</b>' + (pub.dueDate ? ' \u2022 Due <b>' + escMail(pub.dueDate) + '</b>' : '') + '</p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:8px">Description</th><th style="padding:8px">Qty</th><th style="text-align:right;padding:8px">Each</th><th style="text-align:right;padding:8px">Line</th></tr>' + rows + '</table>'
    + '<p>Subtotal: <b>' + usd(pub.subtotal) + '</b></p>'
    + (pub.discount > 0 ? '<p>Discount: <b>-' + usd(pub.discount) + '</b></p>' : '')
    + '<p style="font-size:22px">Total due: <b>' + usd(pub.total) + '</b></p>'
    + (pub.notes ? '<p style="color:#555">' + escMail(pub.notes) + '</p>' : '')
    + payBlock
    + schedBlock
    + '<p style="color:#666;font-size:13px">Questions? Text or call (707) 862-3773.</p>'
    + '</div></body>';
}
// ---------- Public estimate approval (added 2026-10-12) ----------
// Customers review, approve, or decline an estimate from a public link — no
// account needed. The estimate id (GHS-XXXXXX) in the emailed link is the
// credential, same as invoice links.
// "Your payment" panel for the public estimate page (added 2026-10-20):
// the customer watches their authorization live — hold placed, approved
// total authorized, final charge — in plain language, no account needed.
function estimatePayPanelHtml(r) {
  const holds = requestHolds(r);
  if (!holds.length && !r.holdSync) return '';
  const visit = holds.find(h => h.key === 'visit');
  const bal = holds.find(h => h.key === 'balance');
  const pool = holdsPool(r);
  const captured = holds.reduce((s, h) => s + (Number(h.capturedCents) || 0), 0);
  const target = holdTargetCents(r);
  const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('en-US') : '';
  const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('en-US') : '';
  const holdState = (h) => h.status === 'captured' ? '<b>Charged</b>' : h.status === 'authorized' ? '<b>On hold — not charged yet</b>' : '<b>' + escMail(h.status) + '</b>';
  let lines = '';
  if (visit) lines += '<p style="margin:6px 0">Estimate visit — ' + usd(visit.authorizedCents / 100) + ': ' + holdState(visit) + (visit.status === 'authorized' && visit.captureBefore ? ' <span style="color:#666">(hold valid until ' + fmtD(visit.captureBefore) + ')</span>' : '') + '</p>';
  if (bal && bal.status !== 'released' && bal.status !== 'expired') lines += '<p style="margin:6px 0">Balance authorization — ' + usd(bal.authorizedCents / 100) + ': ' + holdState(bal) + '</p>';
  if (target > 0) lines += '<p style="margin:6px 0">Approved total: <b>' + usd(target / 100) + '</b> — authorized so far: <b>' + usd(Math.max(pool, captured) / 100) + '</b></p>';
  if (captured > 0) {
    const lastCap = holds.filter(h => h.status === 'captured').slice(-1)[0];
    lines += '<p style="margin:6px 0">Final charge: <b>' + usd(captured / 100) + ' charged</b>' + (lastCap ? ' on ' + fmtDT(lastCap.updatedAt) : '') + (target > captured ? ' — the ' + usd((target - captured) / 100) + ' that was not used was released from the authorization.' : '') + '</p>';
  } else if (pool > 0) {
    lines += '<p style="margin:6px 0">Final charge: <b>Pending</b> — you are charged only when the work is done, and only the final amount.</p>';
  }
  let balanceBtn = '';
  if (r.status === 'Approved' && r.holdSync && (r.holdSync.state === 'needs_balance' || r.holdSync.state === 'increment_failed')) {
    const missing = Math.max(0, target - pool - captured);
    if (missing > 0) balanceBtn = '<p style="margin:10px 0 2px"><button id="balBtn" style="background:#0b0b0b;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:700;cursor:pointer">Authorize ' + usd(missing / 100) + ' balance</button> <span id="balMsg" style="color:#666"></span></p>'
      + '<script>document.getElementById("balBtn").onclick=function(){var m=document.getElementById("balMsg");m.textContent="Opening secure authorization…";fetch("/api/requests/' + r.id + '/hold/customer-balance",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(function(res){return res.json();}).then(function(d){if(d.url){location.href=d.url;}else{m.textContent=d.error||"failed";}}).catch(function(e){m.textContent=e.message;});};</scr' + 'ipt>';
  }
  // Live refresh while the customer watches — skipped while the estimate
  // is still awaiting their decision so a typed reply is never wiped.
  const refresh = r.status !== 'Quoted' ? '<script>setTimeout(function(){location.reload();},30000);</scr' + 'ipt>' : '';
  return '<div style="background:#fff8e6;border:1px solid #ecd28f;border-radius:10px;padding:14px;margin-top:14px"><h3 style="margin-top:0">Your payment</h3>' + lines
    + '<p style="color:#666;font-size:13px;margin:8px 0 0">A hold reserves the money but does not charge it. You are only charged the final amount when the work is done.</p>' + balanceBtn + '</div>' + refresh;
}
function estimatePageLink(r) { return appBase() + '/estimate/' + r.id; }
function estimatePageHtml(r) {
  const e = r.estimate || {};
  const rows = (e.items || []).map(it => '<tr><td style="padding:8px;border-bottom:1px solid #eee">' + escMail(it.description) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + escMail(it.qty) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.unitPrice) + '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + usd(it.lineTotal) + '</td></tr>').join('');
  let adj = '';
  if (e.asapAmount > 0) adj += '<p>ASAP / Emergency (+25%): <b>' + usd(e.asapAmount) + '</b></p>';
  if (e.discountAmount > 0) adj += '<p>' + (e.memberDiscount ? 'HomeCare member discount' : 'Discount') + ' (' + escMail(e.discountPct) + '%): <b>-' + usd(e.discountAmount) + '</b></p>';
  if (e.credit > 0) adj += '<p>Appointment credit: <b>-' + usd(e.credit) + '</b></p>';
  const badge = { Quoted: '#b26a00', Approved: '#1a7f37', Declined: '#6b6762' }[r.status] || '#6b6762';
  const badgeLabel = r.status === 'Quoted' ? 'awaiting approval' : String(r.status || '').toLowerCase();
  const inv = (db.invoices || []).find(x => x.requestId === r.id);
  let actionBlock = '';
  if (r.status === 'Quoted') {
    actionBlock = '<div style="background:#f7f7f7;border:1px solid #ddd;border-radius:10px;padding:14px;margin-top:14px">'
      + '<h3 style="margin-top:0">Approve this estimate?</h3>'
      + '<p style="color:#666;font-size:13px">Approving creates your invoice right away — then you pay online with a card. No account needed.</p>'
      + '<input id="decReason" placeholder="Optional: reason or change request…" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin-bottom:10px;box-sizing:border-box">'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button id="apBtn" style="background:#1a7f37;color:#fff;border:0;border-radius:999px;padding:14px 26px;font-weight:700;font-size:16px;cursor:pointer;flex:1">Approve estimate</button>'
      + '<button id="decBtn" style="background:#fff;color:#333;border:1px solid #ccc;border-radius:999px;padding:14px 26px;font-weight:700;font-size:16px;cursor:pointer;flex:1">Decline / request changes</button></div>'
      + '<p id="decMsg" style="color:#666"></p></div>'
      + '<script>function decide(action){var m=document.getElementById("decMsg");m.textContent="Sending…";var reason=document.getElementById("decReason").value;fetch("/estimate/' + r.id + '/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason})}).then(function(res){return res.json().then(function(d){return{ok:res.ok,d:d};});}).then(function(o){if(!o.ok)throw new Error(o.d.error||"failed");if(action==="approve"&&o.d.payUrl){m.innerHTML="Approved! Opening your secure payment page…";setTimeout(function(){location.href=o.d.payUrl;},1200);}else{location.reload();}}).catch(function(e){m.textContent=e.message;});}document.getElementById("apBtn").onclick=function(){decide("approve");};document.getElementById("decBtn").onclick=function(){if(confirm("Decline this estimate?"))decide("decline");};</scr' + 'ipt>';
  } else if (r.status === 'Approved') {
    actionBlock = '<div style="background:#eef7ee;border:1px solid #bfe3bf;border-radius:10px;padding:14px;margin-top:14px"><h3 style="margin-top:0;color:#1a7f37">Estimate approved</h3>'
      + (inv
        ? '<p>Your invoice <b>' + escMail(inv.id) + '</b> (' + usd(inv.total) + ') is ready.' + (inv.status === 'paid' ? ' It is paid in full — thank you!' : '') + '</p><p><a href="/invoice/' + escMail(inv.id) + '" style="background:#e42535;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">' + (inv.status === 'paid' ? 'View invoice' : 'Pay ' + usd(inv.total) + ' now') + '</a></p>'
        : '<p>Your invoice is being prepared — the Team will send your payment link shortly.</p>')
      + '</div>';
  } else if (r.status === 'Declined') {
    actionBlock = '<div style="background:#f7f7f7;border:1px solid #ddd;border-radius:10px;padding:14px;margin-top:14px"><h3 style="margin-top:0">Estimate declined</h3><p style="color:#666">No problem — if anything changes, just text or call (707) 862-3773 and we will rework it.</p></div>';
  }
  return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estimate ' + escMail(r.id) + ' — General Handyman Solutions</title>'
    + '<body style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111">'
    + '<div style="background:#0b0b0b;color:#fff;padding:16px 20px;border-radius:14px 14px 0 0"><div style="font-size:19px;font-weight:bold">General Handyman Solutions</div><div style="color:#ff4444;font-size:13px">Fairfield \u2022 Vacaville \u2022 Vallejo \u2022 Solano County</div></div>'
    + '<div style="border:1px solid #ddd;border-top:0;border-radius:0 0 14px 14px;padding:18px 20px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Estimate ' + escMail(r.id) + '</h2><span style="background:' + badge + ';color:#fff;border-radius:999px;padding:6px 14px;font-weight:700;font-size:13px;text-transform:uppercase">' + escMail(badgeLabel) + '</span></div>'
    + '<p style="color:#666"><b>' + escMail(r.service || '') + '</b>' + (r.city ? ' in <b>' + escMail(r.city) + '</b>' : '') + ' • for <b>' + escMail(r.customerName || 'Customer') + '</b></p>'
    + (r.description ? '<p style="color:#555">' + escMail(r.description) + '</p>' : '')
    + '<table style="width:100%;border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:8px">Work</th><th style="padding:8px">Qty</th><th style="text-align:right;padding:8px">Each</th><th style="text-align:right;padding:8px">Line</th></tr>' + rows + '</table>'
    + '<p>Subtotal: <b>' + usd(e.subtotal) + '</b></p>' + adj
    + '<p style="font-size:22px">Total: <b>' + usd(e.total) + '</b></p>'
    + '<p><b>Due to book:</b> ' + usd(e.bookingDue) + ' • <b>Balance at completion:</b> ' + usd(e.balanceDue) + '</p>'
    + (r.quoteNote ? '<p style="color:#555"><b>Team note:</b> ' + escMail(r.quoteNote) + '</p>' : '')
    + '<p style="color:#666;font-size:13px">Labor only — you buy materials/parts unless the Team says otherwise in writing. Estimate valid for 7 days.</p>'
    + estimatePayPanelHtml(r)
    + actionBlock
    + '<p style="color:#666;font-size:13px">Questions? Text or call (707) 862-3773.</p>'
    + '</div></body>';
}
// Build a matching invoice from an approved estimate (public approval flow).
// Estimate line items carry over; the ASAP surcharge becomes its own line and
// the discount + appointment credit fold into the invoice discount, so the
// invoice total matches the estimate total exactly.
function invoiceFromEstimate(r) {
  const e = r.estimate || {};
  const items = (e.items || []).map(it => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice }));
  if (e.asapAmount > 0) items.push({ description: 'ASAP / Emergency (+25%)', qty: 1, unitPrice: e.asapAmount });
  const norm = normalizeInvoice({ items, discount: money((e.discountAmount || 0) + (e.credit || 0)) });
  const bookingDue = money(e.bookingDue || 0);
  // Deposit-first: the auto-invoice charges bookingDue now; the balance is
  // invoiced at completion. Falls back to the full total when bookingDue is
  // zero or covers everything.
  const depositMode = bookingDue > 0 && bookingDue < norm.total;
  const invItems = depositMode
    ? [{ description: 'Deposit to book — ' + (r.service || 'job') + ' (' + r.id + ')', qty: 1, unitPrice: bookingDue }]
    : norm.items;
  const invNorm = depositMode ? normalizeInvoice({ items: invItems }) : norm;
  const cust = db.users.find(u => u.id === r.customerId);
  const email = (r.customerEmail || (cust && cust.email) || '').toLowerCase();
  const inv = {
    id: id('INV'), customerName: r.customerName || (cust ? cust.name : ''), customerEmail: email,
    customerPhone: r.customerPhone || (cust && cust.phone) || '', customerId: r.customerId || '',
    jobId: '', requestId: r.id, items: invNorm.items, subtotal: invNorm.subtotal,
    discount: invNorm.discount, total: invNorm.total, status: 'sent',
    notes: depositMode
      ? 'Deposit for approved estimate ' + r.id + ' (job total ' + usd(norm.total) + '). Balance at completion: ' + usd(e.balanceDue) + '.'
      : 'Auto-created from your approved estimate (' + r.id + '). Due to book: ' + usd(e.bookingDue) + ' • Balance at completion: ' + usd(e.balanceDue) + '.',
    dueDate: '', createdAt: new Date().toISOString(), sentAt: new Date().toISOString(),
    paidAt: null, paidMethod: '', paidAmount: 0, stripeSessionId: ''
  };
  if (!inv.customerId && email) { const c = db.users.find(u => u.role === 'customer' && u.email === email); if (c) inv.customerId = c.id; }
  if (!Array.isArray(db.invoices)) db.invoices = [];
  db.invoices.push(inv);
  return inv;
}
function automationReady() { return mailReady() || googleReady(); }
async function googleAutomation(type, payload) {
  if (!automationReady()) return { attempted: false, sent: false, reason: 'Google Gmail automation is not connected yet' };
  try {
    const r = await fetch(GOOGLE_AUTOMATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: GOOGLE_AUTOMATION_SECRET, type, payload: payload || {}, sentAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) return { attempted: true, sent: false, reason: data.error || ('Google automation returned ' + r.status) };
    return { attempted: true, sent: true, result: data };
  } catch (e) {
    console.error('google automation failed', type, e.message);
    return { attempted: true, sent: false, reason: e.message };
  }
}
function adminEmails() { return db.users.filter(u => u.role === 'admin' && u.email).map(u => u.email); }
function matchedWorkersForJob(j) {
  const city = (j.city || '').toLowerCase();
  return db.users.filter(u => u.role === 'worker' && u.status === 'active').filter(w => {
    const areas = workerAreas(w);
    return !city || areas.some(a => a === 'any' || a.includes(city) || city.includes(a) || (a.includes('solano') && ['fairfield', 'vacaville', 'vallejo', 'suisun city', 'napa', 'dixon', 'benicia'].includes(city)));
  });
}
function requestAutomationPayload(r) {
  const cust = db.users.find(u => u.id === r.customerId);
  return {
    appUrl: APP_URL,
    businessEmail: BUSINESS_EMAIL,
    request: { id: r.id, customerName: r.customerName || (cust ? cust.name : ''), customerEmail: r.customerEmail || (cust ? cust.email : ''), customerPhone: r.customerPhone || (cust ? (cust.phone || '') : ''), service: r.service || '', description: r.description || '', city: r.city || '', address: r.address || '', when: r.when || '', estimateType: r.estimateType || '', membership: r.membership || '', status: r.status || '', quote: r.quote, quoteNote: r.quoteNote || '', estimate: r.estimate || null, createdAt: r.createdAt || '' },
    adminEmails: adminEmails()
  };
}
function jobWorkerAutomationPayload(j) {
  return {
    appUrl: APP_URL,
    businessEmail: BUSINESS_EMAIL,
    job: { id: j.id, status: j.status, service: j.service || '', city: j.city || '', description: j.description || '', when: j.when || '', payOffer: j.payOffer || 0, createdAt: j.createdAt || '' },
    workers: matchedWorkersForJob(j).map(w => ({ name: w.name, email: w.email })),
    adminEmails: adminEmails()
  };
}

const ALLOWED_ORIGINS = ['https://generalhandymans.app', 'https://www.generalhandymans.app', 'https://generalhandymans.github.io', 'http://localhost:3123', 'http://localhost:3125', 'http://localhost:3126'];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  // Security headers on EVERY response (v33). The CSP names exactly what
  // the app loads — Stripe.js/Elements, Leaflet (unpkg), OSM tiles — and
  // keeps everything else same-origin; frame-ancestors/X-Frame-Options
  // stop clickjacking of the panel.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  res.setHeader('Content-Security-Policy', GHS_CSP);
  if (isHttpsReq(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) return send(res, 413, { error: 'request too large' });
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const user = auth(req);
  ensureCaptainState();

  // ---------- static ----------
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
  }
  if (req.method === 'GET' && p === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Access-Control-Allow-Origin': '*' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'manifest.json'), 'utf8'));
  }
  if (req.method === 'GET' && p === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'sw.js'), 'utf8'));
  }
  if (req.method === 'GET' && p.startsWith('/icons/') && p.endsWith('.png')) {
    const file = path.join(__dirname, 'public', 'icons', path.basename(p));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    return res.end(fs.readFileSync(file));
  }
  // Membership plan card images (added 2026-10-21) + app logo banner (v40) — exact filenames only.
  if (req.method === 'GET' && ['/stripe-homecare.png', '/stripe-yard-care.png', '/stripe-homecare-plus.png', '/logo-header.png'].includes(p)) {
    const file = path.join(__dirname, 'public', path.basename(p));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    return res.end(fs.readFileSync(file));
  }
  if (p === '/api/health') return send(res, 200, { ok: true, app: 'ghs-app', sseClients: sseClients.size });

  // ---------- Live event stream (v23): server-sent events ----------
  // Auth rides the normal session (cookie or bearer) — EventSource sends
  // the session cookie automatically. Unauthenticated streams are refused.
  if (p === '/api/events' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'login required' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const client = { res, user };
    sseClients.add(client);
    try { res.write(': connected\n\n'); } catch (e) {}
    const hb = setInterval(() => { try { res.write(': hb ' + Date.now() + '\n\n'); } catch (e) {} }, SSE_HEARTBEAT_MS);
    if (hb.unref) hb.unref();
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; clearInterval(hb); sseClients.delete(client); };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    return; // the stream stays open — no res.end()
  }

  // ---------- auth ----------
  if (p === '/setup' && req.method === 'GET') {
    if (db.users.some(u => u.role === 'admin')) return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px"><h2>Admin already set up</h2><p>The Team admin account already exists. <a href="/">Go to the app login</a>.</p></body>');
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up Team admin</title><body style="font-family:system-ui;padding:24px;max-width:520px;margin:0 auto"><h2>Set up the Team admin (one time)</h2><p>Create the General Handyman Solutions Team admin login. Use an email you control and a strong password only you know.</p><label>Display name</label><input id="n" style="width:100%;padding:10px;margin:4px 0 10px" value="General Handyman Solutions Team"><label>Email</label><input id="e" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="generalhandymans@gmail.com"><label>Phone number</label><input id="ph" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="(707) 555-0123"><label>Password</label><input id="pw" type="password" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="Choose a strong password"><button id="b" style="background:#e42535;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:700">Create admin</button><p id="m"></p><script>document.getElementById("b").onclick=async()=>{const r=await fetch("/api/setup-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("n").value,email:document.getElementById("e").value,phone:document.getElementById("ph").value,password:document.getElementById("pw").value})});const d=await r.json();document.getElementById("m").textContent=r.ok?"Admin created. Go to the app and log in.":"Error: "+(d.error||"failed");if(r.ok)setTimeout(()=>location.href="/",1200);};</scr'+'ipt></body>');
  }
  if (p === '/api/setup-admin' && req.method === 'POST') {
    const b = await readBody(req);
    // One-time bootstrap: only works while no admin exists yet. After the first admin is created this endpoint closes (409).
    if (db.users.some(u => u.role === 'admin')) return send(res, 409, { error: 'admin already exists' });
    const u = { id: id('USR'), name: b.name || 'Gabriel', email: (b.email || '').toLowerCase(), phone: b.phone || '', role: 'admin', status: 'active', pw: hashPw(b.password || ''), createdAt: new Date().toISOString() };
    if (!u.email || !b.password) return send(res, 400, { error: 'email and password required' });
    if (String(b.password).length < 8) return send(res, 400, { error: 'password must be at least 8 characters' });
    db.users.push(u); save(); return send(res, 201, { user: pubUser(u) });
  }
  if (p === '/api/signup' && req.method === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').toLowerCase();
    if (!email || !b.password || !b.name) return send(res, 400, { error: 'name, email and password required' });
    if (String(b.password).length < 8) return send(res, 400, { error: 'password must be at least 8 characters' });
    if (db.users.some(u => u.email === email)) return send(res, 409, { error: 'email already registered' });
    // Worker accounts are created instantly at signup, but start on review: no job claiming until Gabriel activates (2026-10-07).
    const role = b.role === 'worker' ? 'worker' : 'customer';
    const prof = (b.profile && typeof b.profile === 'object') ? b.profile : {};
    // Worker self-ratings 1-10 per skill: the worker's own self-assessment at signup. Visible to the worker and the Team (unlike the Team's private 1-5 ranks).
    if (prof.selfRatings && typeof prof.selfRatings === 'object' && !Array.isArray(prof.selfRatings)) {
      const cleanSR = {};
      for (const k of Object.keys(prof.selfRatings).slice(0, 40)) {
        const n = parseInt(prof.selfRatings[k], 10);
        if (k && n >= 1 && n <= 10) cleanSR[String(k).slice(0, 60)] = n;
      }
      prof.selfRatings = cleanSR;
    } else { delete prof.selfRatings; }
    const serviceAddress = role === 'customer' ? cleanText(b.serviceAddress, 300) : '';
    // Optional home details + start preference (customers only, never
    // required — ZIP included: Gabriel's "no obligatorio" rule).
    const homeFields = role === 'customer' ? homeFieldsFrom(b) : { zipCode: '', homeType: '', yardSize: '', homeNotes: '' };
    const startPreference = role === 'customer' ? cleanStartPreference(b.startPreference) : { type: 'asap', date: null };
    const u = { id: id('USR'), name: b.name, email, phone: b.phone || '', serviceAddress, zipCode: homeFields.zipCode, homeType: homeFields.homeType, yardSize: homeFields.yardSize, homeNotes: homeFields.homeNotes, startPreference, role, status: role === 'worker' ? 'review' : 'active', skills: Array.isArray(prof.skills) ? prof.skills : (b.skills || []), vehicle: prof.vehicleStyle || b.vehicle || '', profile: prof, pw: hashPw(b.password), createdAt: new Date().toISOString() };
    db.users.push(u); if (role === 'worker') { notifyAdmins('worker', 'New worker application: ' + u.name + (prof.city ? ' (' + prof.city + ')' : '') + ' — review in Workers.'); fireAutomation('new_worker', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), worker: { name: u.name, email: u.email, phone: u.phone || '', status: u.status, profile: u.profile || {} } }); } save(); return send(res, 201, { user: pubUser(u), token: newSession(u) });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').toLowerCase();
    const blocked = loginBlockedSecs(req, email);
    if (blocked > 0) return send(res, 429, { error: 'too many failed login attempts — try again in ' + Math.ceil(blocked / 60) + ' minute(s)' }, { 'Retry-After': String(blocked) });
    const u = db.users.find(x => x.email === email);
    if (!u || !checkPw(b.password || '', u.pw)) { noteLoginFailure(req, email); audit(null, 'auth.login_failed', email, 'from ' + clientIp(req)); return send(res, 401, { error: 'wrong email or password' }); }
    loginAttempts.delete(loginKey(req, email));
    if (u.role === 'admin') audit(u, 'auth.login', '', 'admin sign-in from ' + clientIp(req));
    const token = newSession(u);
    return send(res, 200, { user: pubUser(u), token }, { 'Set-Cookie': sessionCookie(token, req) });
  }
  if (p === '/api/auth/forgot' && req.method === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').toLowerCase().trim();
    // ALWAYS the same generic answer — whether the email has an account or
    // not — so this endpoint can never be used to enumerate accounts.
    if (email && pwResetRateOk(email)) {
      const u = db.users.find(x => x.email === email);
      if (u) {
        const token = crypto.randomBytes(32).toString('hex');
        u.pwReset = { hash: sha256hex(token), expiresAt: Date.now() + 3600000 }; // hash only, 60 minutes; replaces any previous token
        save();
        await sendPasswordResetEmail(u, token);
      }
    }
    return send(res, 200, { ok: true, message: PW_RESET_GENERIC });
  }
  if (p === '/api/auth/reset' && req.method === 'POST') {
    const b = await readBody(req);
    const token = String(b.token || '');
    const password = String(b.password || '');
    if (!token) return send(res, 400, { error: 'This reset link is invalid or has already been used.' });
    if (password.length < 8) return send(res, 400, { error: 'Your new password must be at least 8 characters.' });
    const hash = sha256hex(token);
    const u = db.users.find(x => x.pwReset && typeof x.pwReset.hash === 'string' && x.pwReset.hash.length === hash.length && crypto.timingSafeEqual(Buffer.from(x.pwReset.hash), Buffer.from(hash)));
    if (!u) return send(res, 400, { error: 'This reset link is invalid or has already been used.' });
    if (!u.pwReset.expiresAt || Number(u.pwReset.expiresAt) < Date.now()) {
      delete u.pwReset; save();
      return send(res, 400, { error: 'This reset link has expired — request a new one from the login form.' });
    }
    u.pw = hashPw(password);
    delete u.pwReset; // single use: consumed
    audit(u, 'auth.password_reset', '', 'password changed; all sessions invalidated');
    invalidateSessionsFor(u.id); // every prior session (any device) is signed out
    save();
    return send(res, 200, { ok: true, message: 'Your password has been updated — log in with your new password.' });
  }
  if (p === '/api/logout' && req.method === 'POST') { return send(res, 200, { ok: true }, { 'Set-Cookie': 'ghs_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' + (isHttpsReq(req) ? '; Secure' : '') }); }
  if (p === '/api/me' && req.method === 'GET') { if (!user) return send(res, 401, { error: 'login required' }); return send(res, 200, { user: pubUser(user) }); }
  if (p === '/api/me/service-address' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const b = await readBody(req);
    const serviceAddress = cleanText(b.serviceAddress, 300);
    if (!serviceAddress) return send(res, 400, { error: 'service address required', code: 'ADDRESS_REQUIRED' });
    user.serviceAddress = serviceAddress;
    save();
    return send(res, 200, { ok: true, serviceAddress, user: pubUser(user) });
  }
  // Home details + start preference: the member maintains these from their
  // account area. Partial update — only fields present in the body change.
  // Nothing here books, schedules, or charges anything: the start date is a
  // preference the Team confirms with the member.
  if (p === '/api/me/home-details' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const b = await readBody(req);
    if (b.zipCode !== undefined) user.zipCode = cleanZip(b.zipCode);
    if (b.homeType !== undefined) user.homeType = cleanEnum(b.homeType, HOME_TYPES);
    if (b.yardSize !== undefined) user.yardSize = cleanEnum(b.yardSize, YARD_SIZES);
    if (b.homeNotes !== undefined) user.homeNotes = cleanText(b.homeNotes, 300);
    if (b.startPreference !== undefined) user.startPreference = cleanStartPreference(b.startPreference);
    save();
    return send(res, 200, { ok: true, user: pubUser(user) });
  }

  // ---------- Membership self-service (added 2026-10-21, v20) ----------
  // Logged-in members manage their own plan from the dashboard: change to
  // another plan (Stripe prorates), cancel (Gabriel's rule: takes effect
  // at the END of the already-paid month), and undo a pending cancellation.
  // The /api/stripe/portal endpoint above stays as-is for card updates.
  if (p === '/api/me/membership' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'login required' });
    const plan = membershipPlanOf(user);
    let currentPeriodEnd = null;
    if (plan.subscriptionId && stripeReady()) {
      try {
        const sub = await stripeGet('/subscriptions/' + plan.subscriptionId);
        if (sub && sub.current_period_end) currentPeriodEnd = new Date(Number(sub.current_period_end) * 1000).toISOString();
      } catch (e) { /* the confirm screens fall back to generic wording */ }
    }
    return send(res, 200, { ok: true, plan, currentPeriodEnd });
  }
  if (p === '/api/me/membership/change' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const b = await readBody(req);
    const current = membershipPlanOf(user);
    if (current.status !== 'active' || !current.subscriptionId) return send(res, 403, { error: 'you do not have an active membership to change' });
    const plan = MEMBERSHIP_PLANS[b.plan];
    if (!plan) return send(res, 400, { error: 'unknown membership plan' });
    if (plan.key === current.planKey) return send(res, 400, { error: 'you are already on that plan' });
    if ((plan.type === 'yard' || plan.type === 'plus') && !cleanText(user.serviceAddress, 300)) return send(res, 400, { error: 'Add your service address in "My home" first — plans with yard visits need the address where we will do the work.', code: 'ADDRESS_REQUIRED' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — text or call the Team at (707) 862-3773' });
    try {
      const sub = await stripeGet('/subscriptions/' + current.subscriptionId);
      const item = sub && sub.items && Array.isArray(sub.items.data) ? sub.items.data[0] : null;
      if (!item || !item.id) return send(res, 502, { error: 'could not read your subscription — try again in a minute' });
      const priceId = await membershipPriceIdFor(plan);
      if (!priceId) return send(res, 400, { error: 'that plan is not available right now — text or call the Team at (707) 862-3773' });
      await stripeApi('/subscriptions/' + current.subscriptionId, {
        'items[0][id]': item.id, 'items[0][price]': priceId,
        proration_behavior: 'create_prorations',
        cancel_at_period_end: 'false', // a plan change also clears a pending cancellation
        'metadata[userId]': user.id, 'metadata[kind]': plan.kind, 'metadata[plan]': plan.key
      });
      // Local record follows immediately (the subscription.updated webhook
      // reconciles to the same plan afterwards — price wins over metadata).
      setMembershipPlan(user, plan.key, { status: 'active', priceId, productId: plan.productId || '', subscriptionId: current.subscriptionId, since: current.since || null, cancelAt: null });
      if (plan.type === 'homecare' || plan.type === 'plus') {
        user.homeCareStatus = 'active';
        if (!user.homeCareSince) user.homeCareSince = current.since || new Date().toISOString();
        user.homeCareCancelAt = null;
      } else if (current.type === 'homecare' || current.type === 'plus') {
        user.homeCareStatus = 'none'; // yard-only plan: the HomeCare benefits go with the old plan
        user.homeCareCancelAt = null;
      }
      // freeEstimateUsed is deliberately untouched: one free estimate per
      // account, and switching plans never re-grants or removes it.
      // v25 (B2): changing INTO a yard plan generates this period's visit
      // proposals right away (the subscription.updated webhook sync that
      // follows reconciles to the same deduped set).
      if (plan.visitsPerMonth > 0) ensureYardVisitProposals(user);
      save();
      notify(user.id, 'membership', 'Your membership is now ' + plan.name + ' ($' + (plan.monthlyCents / 100) + '/mo). Your new plan starts today.');
      notifyAdmins('membership', user.name + ' (' + user.email + ') changed their plan from ' + current.name + ' ($' + current.monthly + '/mo) to ' + plan.name + ' ($' + (plan.monthlyCents / 100) + '/mo).');
      return send(res, 200, { ok: true, user: pubUser(user), plan: membershipPlanOf(user) });
    } catch (e) { console.error('membership change failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  if (p === '/api/me/membership/cancel' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const current = membershipPlanOf(user);
    if (current.status !== 'active' || !current.subscriptionId) return send(res, 403, { error: 'you do not have an active membership to cancel' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — text or call the Team at (707) 862-3773' });
    try {
      // Gabriel's decision: cancellation takes effect at the END of the
      // already-paid month — the member keeps every benefit until then.
      const updated = await stripeApi('/subscriptions/' + current.subscriptionId, { cancel_at_period_end: 'true' });
      const endSec = Number(updated && (updated.cancel_at || updated.current_period_end)) || 0;
      const cancelAt = endSec ? new Date(endSec * 1000).toISOString() : (current.cancelAt || null);
      setMembershipPlan(user, current.planKey, { status: 'active', subscriptionId: current.subscriptionId, since: current.since || null, priceId: current.priceId || undefined, cancelAt });
      if (current.type === 'homecare' || current.type === 'plus') user.homeCareCancelAt = cancelAt;
      save();
      notify(user.id, 'membership', 'Your ' + current.name + ' membership will stay active until ' + (cancelAt ? new Date(cancelAt).toLocaleDateString('en-US') : 'the end of your paid period') + ', then it ends and you will not be charged again.');
      notifyAdmins('membership', user.name + ' (' + user.email + ') cancelled ' + current.name + ' — active until ' + (cancelAt ? new Date(cancelAt).toLocaleDateString('en-US') : 'period end') + '.');
      return send(res, 200, { ok: true, cancelAt, user: pubUser(user), plan: membershipPlanOf(user) });
    } catch (e) { console.error('membership cancel failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  if (p === '/api/me/membership/reactivate' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const current = membershipPlanOf(user);
    if (current.status !== 'active' || !current.subscriptionId) return send(res, 403, { error: 'you do not have an active membership' });
    if (!current.cancelAt) return send(res, 400, { error: 'your membership is not set to cancel' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — text or call the Team at (707) 862-3773' });
    try {
      await stripeApi('/subscriptions/' + current.subscriptionId, { cancel_at_period_end: 'false' });
      setMembershipPlan(user, current.planKey, { status: 'active', subscriptionId: current.subscriptionId, since: current.since || null, priceId: current.priceId || undefined, cancelAt: null });
      if (current.type === 'homecare' || current.type === 'plus') user.homeCareCancelAt = null;
      save();
      notify(user.id, 'membership', 'Good news — your ' + current.name + ' membership will keep renewing as usual. The cancellation was undone.');
      notifyAdmins('membership', user.name + ' (' + user.email + ') undid their ' + current.name + ' cancellation.');
      return send(res, 200, { ok: true, user: pubUser(user), plan: membershipPlanOf(user) });
    } catch (e) { console.error('membership reactivate failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }

  // ---------- Delete my account (added 2026-10-21, v26) ----------
  // Self-service account deletion — the Google Play data-deletion path.
  // Any role. The user confirms by typing their own account email exactly.
  // In-flight work BLOCKS deletion (the work must be finished, or the Team
  // reassigns/closes it first); history is then kept ANONYMIZED — amounts,
  // services and dates survive for tax/legal, every personal field goes.
  if (p === '/api/me/delete-account' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    const confirmEmail = cleanText(b.confirmEmail, 160).toLowerCase();
    if (!confirmEmail || confirmEmail !== (user.email || '').toLowerCase()) return send(res, 400, { error: 'type your account email address exactly to confirm deletion' });
    const uid = user.id;
    const JOB_DONE = 'Done — photos sent';
    const REQ_TERMINAL = ['Closed', 'Declined'];
    if (user.role === 'worker') {
      const activeJob = db.jobs.find(j => j.assignedWorkerId === uid && j.status !== JOB_DONE);
      if (activeJob) return send(res, 409, { error: 'You still have an assigned job that is not finished (' + activeJob.id + '). Finish it, or ask the Team to reassign it, before deleting your account.' });
      const activeVisit = db.yardVisits.find(v => v.assignedWorkerId === uid && !['done', 'cancelled'].includes(v.status));
      if (activeVisit) return send(res, 409, { error: 'You still have a yard visit that is not finished (' + activeVisit.id + '). Finish it, or ask the Team to reassign it, before deleting your account.' });
    }
    if (user.role === 'customer') {
      const openReq = db.requests.find(r => r.customerId === uid && !REQ_TERMINAL.includes(r.status));
      if (openReq) return send(res, 409, { error: 'You have a request still in progress (' + openReq.id + '). Let the Team finish or close it — or contact the Team — before deleting your account.' });
      const openJob = db.jobs.find(j => sseCustomerOwnsJob(j, user) && j.status !== JOB_DONE);
      if (openJob) return send(res, 409, { error: 'You have a job still in progress (' + openJob.id + '). Let the Team finish it — or contact the Team — before deleting your account.' });
    }
    // Cancel any active membership subscription NOW (deletion cancels
    // immediately — unlike the voluntary end-of-period cancel — and prepaid
    // membership payments are not refunded, per the Terms). Best-effort:
    // a Stripe failure is logged and never holds the deletion hostage.
    const plan = membershipPlanOf(user);
    const subId = (plan && plan.subscriptionId) || user.stripeSubscriptionId || '';
    if (subId && stripeReady()) {
      try { await stripeApi('/subscriptions/' + subId + '/cancel', {}); }
      catch (e) { console.error('delete-account: stripe cancel failed for', subId, '-', e.message); }
    }
    // Anonymize the history. Ownership through requests is resolved BEFORE
    // any record is touched, because anonymizing a request severs the link
    // its jobs are found through.
    const myReqIds = new Set(db.requests.filter(r => r.customerId === uid).map(r => r.id));
    db.requests.forEach(r => {
      if (!myReqIds.has(r.id)) return;
      r.customerId = null; r.anonymized = true;
      r.customerName = 'Deleted user'; r.customerEmail = ''; r.customerPhone = ''; r.address = '';
      (r.messages || []).forEach(m => { if (m && m.from === 'customer') m.name = ''; });
    });
    db.jobs.forEach(j => {
      if (j.customerId === uid || (j.requestId && myReqIds.has(j.requestId))) {
        if ('customerId' in j) j.customerId = null;
        j.customerName = 'Deleted user'; j.customerPhone = ''; j.address = '';
        j.anonymized = true;
        (j.messages || []).forEach(m => { if (m && m.from === 'customer') m.name = ''; });
      }
    });
    (db.invoices || []).forEach(inv => {
      if (inv.customerId === uid) {
        inv.customerId = null; inv.anonymized = true;
        inv.customerName = 'Deleted user'; inv.customerEmail = ''; inv.customerPhone = '';
      }
    });
    // Yard visits keep their operational record (date, photos, worker pay)
    // with the personal linkage removed. A deleted worker's visits keep the
    // record too and lose the assignee the same way.
    db.yardVisits.forEach(v => {
      if (v.userId === uid) { v.userId = null; v.anonymized = true; }
      if (v.assignedWorkerId === uid) v.assignedWorkerId = null;
    });
    // The user's own notifications and password-reset token die with the
    // account; every session is invalidated; then the record itself goes.
    db.notifications = (db.notifications || []).filter(n => n.userId !== uid);
    const idx = db.users.findIndex(u => u.id === uid);
    if (idx !== -1) db.users.splice(idx, 1);
    audit(user, 'account.delete', uid, user.role + ' · ' + (user.email || ''));
    invalidateSessionsFor(uid);
    save();
    return send(res, 200, { ok: true });
  }

  // ---------- customer requests ----------
  // Public: no account required. Anonymous requests store name/email/phone on
  // the request itself; logged-in customers keep member pricing + dashboard.
  if (p === '/api/requests' && req.method === 'POST') {
    const b = await readBody(req);
    const photos = Array.isArray(b.photos) ? b.photos.filter(x => typeof x === 'string' && x.startsWith('data:image/') && x.length <= 5000000).slice(0, 6) : [];
    const formName = cleanText(b.customerName, 80);
    const formEmail = cleanText(b.customerEmail, 160).toLowerCase();
    const formPhone = cleanText(b.customerPhone, 40);
    const name = user ? user.name : formName;
    const email = user ? (user.email || '').toLowerCase() : formEmail;
    if (!name) return send(res, 400, { error: 'name required' });
    if (!/.+@.+\..+/.test(email)) return send(res, 400, { error: 'valid email required' });
    let customerId = user ? user.id : null;
    // Link to an existing customer account by email when one exists.
    if (!customerId && email) { const c = db.users.find(u => u.role === 'customer' && (u.email || '').toLowerCase() === email); if (c) customerId = c.id; }
    // Estimate pricing is authoritative from Stripe-verified membership, NOT from
    // what the customer picked in the form: active members of ANY plan
    // (HomeCare, HomeCare Plus, Yard Care) get $50 (or $0 for their one free
    // estimate, applied below), everyone else pays $75. (Policy 2026-10-21:
    // the free first on-site estimate is a once-per-account member benefit —
    // the same u.freeEstimateUsed flag HomeCare always used, now shared by
    // every plan; after it, Yard members pay the $50 member price like every
    // member. Canceled/lapsed members fall back to the regular $75 rules.)
    const hcActive = !!user && user.role === 'customer' && user.homeCareStatus === 'active';
    const userPlan = (user && user.role === 'customer') ? membershipPlanOf(user) : null;
    const memberActive = hcActive || !!(userPlan && userPlan.planKey && userPlan.status === 'active');
    let menuOrder = null;
    if (b.estimateType === 'menu' && b.menuOrder && typeof b.menuOrder === 'object') {
      const mo = b.menuOrder;
      const num = (v, max) => { const n = Number(v); return isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0; };
      menuOrder = {
        serviceId: cleanText(mo.serviceId, 60),
        extras: Array.isArray(mo.extras) ? mo.extras.slice(0, 8).map(x => ({ name: cleanText(x && x.name, 80), price: num(x && x.price, 10000) })).filter(x => x.name) : [],
        asap: !!mo.asap,
        joinedMembership: !!mo.joinedMembership,
        totals: { list: num(mo.totals && mo.totals.list, 100000), member: num(mo.totals && mo.totals.member, 100000), due: num(mo.totals && mo.totals.due, 100000) }
      };
    }
    const r = { id: id('GHS'), customerId, customerName: name, customerEmail: email, customerPhone: user ? (user.phone || formPhone) : formPhone, service: b.service || '', description: b.description || '', city: b.city || '', address: b.address || '', when: b.when || '', estimateType: b.estimateType || 'inperson', membership: memberActive ? 'member' : 'none', estimateDue: b.estimateType === 'photo' ? 0 : (b.estimateType === 'menu' ? 75 : (memberActive ? 50 : 75)), status: 'New', quote: null, quoteNote: '', estimate: null, menuOrder, photos, messages: [{ from: 'customer', name, text: (b.description || 'Request sent.') + (photos.length ? ' [' + photos.length + ' photo(s) attached]' : ''), at: new Date().toISOString() }], createdAt: new Date().toISOString() };
    // Member free estimate (ONE per customer account, shared across plans):
    // first in-person request from an active member of any kind with the
    // freebie unused consumes it automatically. Stored exactly like the
    // HomeCare free estimate always was (estimateDue 0 + freeEstimateClaim,
    // no holds array), so no $75 hold is ever created for it and the admin
    // lists and the "Your payment" panel render it the same way.
    if (user && user.role === 'customer' && memberActive && !user.freeEstimateUsed && r.estimateType === 'inperson') {
      user.freeEstimateUsed = true;
      r.membership = 'member';
      r.estimateDue = 0;
      r.freeEstimateClaim = true;
      const yardFree = !hcActive && !!userPlan && userPlan.type === 'yard';
      r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: yardFree
        ? 'Your FREE Yard Care member estimate was applied to this request. No estimate charge — just approve the work when the quote arrives.'
        : 'Your FREE HomeCare estimate was applied to this request. No estimate charge — just approve the work when the quote arrives.', at: new Date().toISOString() });
      notify(user.id, 'membership', yardFree
        ? 'Your free Yard Care estimate was applied to request ' + r.id + '.'
        : 'Your free HomeCare estimate was applied to request ' + r.id + '.');
    }
    db.requests.push(r); notifyAdmins('request', 'New request ' + r.id + ': ' + (r.service || 'Service') + ' in ' + (r.city || '') + ' from ' + r.customerName + '.'); save(); emitRequestNew(r); fireAutomation('new_request', requestAutomationPayload(r)); return send(res, 201, { request: r });
  }
  if (p === '/api/requests' && req.method === 'GET') {
    if (!requireRole(user, ['customer', 'worker', 'admin'], res)) return;
    let list = user.role === 'admin' ? db.requests : db.requests.filter(r => r.customerId === user.id);
    if (user.role === 'admin') list = list.map(r => { const c = db.users.find(u => u.id === r.customerId); const ei = (db.invoices || []).find(x => x.requestId === r.id); return Object.assign({}, r, { customerPhone: r.customerPhone || (c ? (c.phone || '') : ''), customerEmail: r.customerEmail || (c ? c.email : ''), customerHomeCare: c ? (c.homeCareStatus || 'none') : 'none', estimateInvoice: ei ? { id: ei.id, status: ei.status } : null }); });
    return send(res, 200, { requests: list });
  }
  const reqMatch = p.match(/^\/api\/requests\/([\w-]+)$/);
  if (reqMatch && req.method === 'PATCH') {
    const r = db.requests.find(x => x.id === reqMatch[1]);
    if (!r) return send(res, 404, { error: 'request not found' });
    const b = await readBody(req);
    let automation = { attempted: false, sent: false };
    if (user && user.role === 'admin') {
      if (b.estimate || typeof b.quote === 'number') {
        const est = applyMemberDiscount(normalizeEstimate(b.estimate || { total: b.quote, credit: 0, bookingDue: null }, r), r, db.users.find(u => u.id === r.customerId));
        r.estimate = est; r.quote = est.total; r.status = 'Quoted'; r.quoteNote = b.note || '';
        r.messages = r.messages || [];
        const totalText = '$' + est.total.toFixed(2);
        let quoteText = 'Professional estimate sent: ' + totalText + ' total after the adjustments shown in your estimate (labor only — you buy materials/parts).';
        if (est.credit > 0) quoteText += ' Appointment credit applied: -$' + est.credit.toFixed(2) + '.';
        if (est.bookingDue > 0) quoteText += ' Due to book: $' + est.bookingDue.toFixed(2) + '; balance at completion: $' + est.balanceDue.toFixed(2) + '.';
        r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: quoteText + (b.note ? ' ' + b.note : ''), at: new Date().toISOString() });
        notify(r.customerId, 'quote', 'You received a professional estimate for request ' + r.id + ': ' + totalText + '. Open your request to review it and approve.');
        if (b.sendEmail) {
          save();
          automation = await sendAutomation('estimate_sent', requestAutomationPayload(r));
          if (automation.sent) {
            r.estimateEmailSentAt = new Date().toISOString();
            r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'We also emailed this estimate to you from ' + (automation.via === 'resend' ? senderEmail() : BUSINESS_EMAIL) + '.', at: new Date().toISOString() });
          }
        }
      }
      if (b.status) r.status = b.status;
    } else if (user && user.role === 'customer' && r.customerId === user.id) {
      r.messages = r.messages || [];
      if (b.action === 'approve') { r.status = 'Approved'; r.messages.push({ from: 'customer', name: user.name, text: 'Approved the quote. Ready to schedule.', at: new Date().toISOString() }); notifyAdmins('quote', user.name + ' APPROVED the quote on ' + r.id + ' ($' + (r.quote || 0) + ').'); fireAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'approved' })); }
      if (b.action === 'approve') await tryHoldIncrementAfterApproval(r); // increment only — never a capture; failures land on r.holdSync
      if (b.action === 'decline') { r.status = 'Declined'; r.messages.push({ from: 'customer', name: user.name, text: 'Declined the quote for now.', at: new Date().toISOString() }); notifyAdmins('quote', user.name + ' declined the quote on ' + r.id + '.'); fireAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'declined' })); }
    } else return send(res, 403, { error: 'not allowed' });
    if (user && user.role === 'admin') { const parts = []; if (b.estimate || typeof b.quote === 'number') parts.push('quote $' + (r.quote || 0)); if (b.status) parts.push('status ' + b.status); audit(user, 'request.update', r.id, parts.join(' · ')); }
    save(); return send(res, 200, { request: r, automation });
  }
  if (reqMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const idx = db.requests.findIndex(x => x.id === reqMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'request not found' });
    const removed = db.requests.splice(idx, 1)[0];
    audit(user, 'request.delete', removed.id, removed.service || '');
    save(); return send(res, 200, { ok: true, deleted: removed.id });
  }

  // ---------- Estimate holds (admin) — Gabriel controls the money BY HAND ----------
  // Every money movement here is an explicit admin action. Nothing in this
  // block (or anywhere) captures automatically: not on approval, not on
  // job completion, not on a date.
  const holdMatch = p.match(/^\/api\/requests\/([\w-]+)\/hold\/(increment|authorize-balance|capture|release|close)$/);
  if (holdMatch && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const r = db.requests.find(x => x.id === holdMatch[1]);
    if (!r) return send(res, 404, { error: 'request not found' });
    const action = holdMatch[2];
    const b = await readBody(req);
    const holds = requestHolds(r);
    if (action === 'close') {
      // Manual billing close: a STATUS change only. Never captures, never
      // releases. Warns when money is still authorized and uncharged so
      // Gabriel closes with his eyes open.
      const pool = holdsPool(r);
      r.status = 'Closed';
      audit(user, 'hold.close', r.id, pool > 0 ? 'closed with ' + usd(pool / 100) + ' still authorized' : 'closed');
      save();
      return send(res, 200, { ok: true, status: r.status, warning: pool > 0 ? 'authorized_uncaptured' : null, poolCents: pool });
    }
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet' });
    if (action === 'release') {
      const active = holds.filter(h => h.status === 'authorized');
      if (!active.length) return send(res, 400, { error: 'no active authorization holds on this request' });
      const released = [];
      for (const h of active) {
        try { await stripeApi('/payment_intents/' + h.pi + '/cancel', {}); released.push(h.pi); }
        catch (e) { return send(res, 502, { error: 'Stripe release failed on ' + h.pi + ': ' + e.message, released }); }
      }
      audit(user, 'hold.release', r.id, released.length + ' hold(s) released');
      // The payment_intent.canceled webhook flips each hold to 'released'.
      return send(res, 200, { ok: true, released });
    }
    if (action === 'increment') {
      const visit = holds.find(h => h.key === 'visit' && h.status === 'authorized');
      if (!visit) return send(res, 400, { error: 'no active visit hold to increment on this request' });
      if (visit.incremental === 'unavailable') return send(res, 400, { error: 'this card does not support incremental authorizations — authorize the balance instead' });
      const totalCents = Math.round(Number(b.totalCents) || 0);
      if (!(totalCents > visit.authorizedCents)) return send(res, 400, { error: 'new total must be more than the current authorization (' + usd(visit.authorizedCents / 100) + ')' });
      try {
        const out = await stripeApi('/payment_intents/' + visit.pi + '/increment_authorization', { amount: totalCents });
        visit.authorizedCents = Math.round(Number(out.amount) || totalCents);
        visit.updatedAt = new Date().toISOString();
        r.holdSync = { targetCents: totalCents, state: 'incremented', at: new Date().toISOString() };
        audit(user, 'hold.increment', r.id, 'authorized ' + usd(visit.authorizedCents / 100));
        save();
        return send(res, 200, { ok: true, hold: visit, poolCents: holdsPool(r) });
      } catch (e) { return send(res, 502, { error: 'Stripe increment failed: ' + e.message }); }
    }
    if (action === 'authorize-balance') {
      try {
        const out = await startBalanceAuthorization(r);
        audit(user, 'hold.authorize_balance', r.id, '');
        return send(res, 200, out);
      } catch (e) {
        if (String(e.message).indexOf('stripe:') === 0) return send(res, 502, { error: 'payment service error — try again in a minute' });
        return send(res, 400, { error: e.message });
      }
    }
    if (action === 'capture') {
      const active = holds.filter(h => h.status === 'authorized')
        .sort((x, y) => (x.key === 'visit' ? 0 : 1) - (y.key === 'visit' ? 0 : 1));
      if (!active.length) return send(res, 400, { error: 'no active authorization holds to capture on this request' });
      const pool = holdsPool(r);
      const target = holdTargetCents(r);
      // Editable final amount, Gabriel's call. Default: the approved
      // target, capped at what is actually authorized.
      let finalCents = Math.round(Number(b.finalCents) || 0);
      if (!(finalCents > 0)) finalCents = target > 0 ? Math.min(pool, target) : pool;
      // NEVER charge more than the customer authorized. More money needs
      // an increment or a balance authorization first — said out loud.
      if (finalCents > pool) return send(res, 400, { error: 'final amount ' + usd(finalCents / 100) + ' is more than the authorized pool ' + usd(pool / 100) + ' — increment the authorization or send a balance authorization first' });
      const results = [];
      let remaining = finalCents;
      for (const h of active) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, h.authorizedCents);
        try {
          const out = await stripeApi('/payment_intents/' + h.pi + '/capture', { amount_to_capture: take });
          results.push({ pi: h.pi, key: h.key, capturedCents: Math.round(Number(out.amount_received) || take) });
          remaining -= take;
        } catch (e) { return send(res, 502, { error: 'capture failed on ' + h.pi + ' (' + h.key + ' hold): ' + e.message, captured: results }); }
      }
      // Holds stay 'authorized' locally until the payment_intent.succeeded
      // webhook confirms each capture — the webhook is the source of truth.
      // v24 (A3): exactly one receipt email per capture. The claim flag is
      // set BEFORE sending, so a retried capture can never double-send; the
      // send itself is fire-and-forget — sendMail logs its own failures and
      // a mail problem can never fail or delay this capture response.
      const capturedTotalCents = results.reduce((s, x) => s + (Number(x.capturedCents) || 0), 0);
      if (capturedTotalCents > 0 && r.customerEmail && !r.captureReceiptSentAt) {
        r.captureReceiptSentAt = new Date().toISOString();
        const receiptLines = [
          'Thank you — your payment for request ' + r.id + ' is complete.',
          'Service: ' + (r.service || 'Handyman service'),
          'Amount charged: ' + usd(capturedTotalCents / 100),
          'Date: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        ];
        sendMail({ to: [r.customerEmail], replyTo: OWNER_EMAIL, subject: 'Your receipt — General Handyman Solutions', html: eventEmail('Your receipt', receiptLines), text: receiptLines.join('\n') })
          .then(m => { if (!m.sent) console.error('receipt email not sent for request ' + r.id + ': ' + (m.reason || 'unknown')); })
          .catch(e => console.error('receipt email failed for request ' + r.id + ':', e.message));
      }
      notifyAdmins('payment', 'Manual capture started on request ' + r.id + ': ' + usd(finalCents / 100) + ' across ' + results.length + ' hold(s). The webhook confirms the final amounts.');
      audit(user, 'hold.capture', r.id, 'captured ' + usd(finalCents / 100) + ' across ' + results.length + ' hold(s)');
      save();
      return send(res, 200, { ok: true, captured: results, finalCents });
    }
  }
  const custBalMatch = p.match(/^\/api\/requests\/([\w-]+)\/hold\/customer-balance$/);
  if (custBalMatch && req.method === 'POST') {
    // Public (the estimate link is the credential, same trust model as the
    // invoice pay links): after approving their estimate, the customer
    // authorizes whatever balance the first hold could not be raised to.
    const r = db.requests.find(x => x.id === custBalMatch[1]);
    if (!r) return send(res, 404, { error: 'request not found' });
    if (r.status !== 'Approved') return send(res, 400, { error: 'approve the estimate first' });
    if (!stripeReady()) return send(res, 400, { error: 'online payments are not connected yet — text/call (707) 862-3773' });
    try {
      const out = await startBalanceAuthorization(r);
      return send(res, 200, out);
    } catch (e) {
      if (String(e.message).indexOf('stripe:') === 0) return send(res, 502, { error: 'payment service error — try again in a minute' });
      return send(res, 400, { error: e.message });
    }
  }

  const createJobMatch = p.match(/^\/api\/requests\/([\w-]+)\/create-job$/);
  if (createJobMatch && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const r = db.requests.find(x => x.id === createJobMatch[1]);
    if (!r) return send(res, 404, { error: 'request not found' });
    const b = await readBody(req);
    const cust = db.users.find(u => u.id === r.customerId);
    const payOffer = Number(b.payOffer);
    if (!payOffer || payOffer <= 0) return send(res, 400, { error: 'worker pay (payOffer) is required' });
    const j = { id: id('JOB'), status: 'Open', requestId: r.id, service: b.service || r.service || '', city: b.city || r.city || '', description: b.description || r.description || '', when: b.when || r.when || '', payOffer, customerPrice: Number(b.customerPrice) || r.quote || null, customerName: r.customerName || (cust ? cust.name : ''), customerPhone: cust ? (cust.phone || '') : '', address: r.address || '', notes: b.notes || '', assignedWorkerId: null, infoReleased: false, messages: [], createdAt: new Date().toISOString() };
    db.jobs.push(j);
    emitJobNew(j);
    r.status = 'Job posted'; r.jobId = j.id;
    r.messages = r.messages || [];
    r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'We posted your job to our team (job ' + j.id + '). A worker can now claim it — we will coordinate the details with you here.', at: new Date().toISOString() });
    notify(r.customerId, 'job', 'Your job was posted to our team (job ' + j.id + '). We\'ll update you here when a worker claims it.');
    notifyWorkersForJob(j);
    fireAutomation('job_posted', jobWorkerAutomationPayload(j));
    audit(user, 'job.create_from_request', j.id, 'from ' + r.id + ' · pay $' + j.payOffer);
    save(); return send(res, 201, { job: publicJob(j, user), request: r });
  }

  const msgMatch = p.match(/^\/api\/requests\/([\w-]+)\/messages$/);
  if (msgMatch && req.method === 'POST') {
    const r = db.requests.find(x => x.id === msgMatch[1]);
    if (!r) return send(res, 404, { error: 'request not found' });
    const isOwner = user && user.role === 'customer' && r.customerId === user.id;
    const isTeam = user && user.role === 'admin';
    if (!isOwner && !isTeam) return send(res, 403, { error: 'not allowed' });
    const b = await readBody(req);
    const text = (b.text || '').toString().slice(0, 2000).trim();
    if (!text) return send(res, 400, { error: 'message required' });
    r.messages = r.messages || [];
    r.messages.push({ from: isTeam ? 'team' : 'customer', name: isTeam ? 'General Handyman Solutions Team' : user.name, text, at: new Date().toISOString() });
    if (isTeam) notify(r.customerId, 'message', 'New message from the General Handyman Solutions Team on request ' + r.id + '.');
    else notifyAdmins('message', 'New message from ' + user.name + ' on request ' + r.id + '.');
    save(); return send(res, 201, { request: r });
  }

  // ---------- workers (admin) ----------
  if (p === '/api/workers' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    // teamRanks is Team-private: attached here on the admin-only endpoint, never in pubUser.
    return send(res, 200, { workers: db.users.filter(u => u.role === 'worker').map(u => Object.assign(pubUser(u), { teamRanks: (u.internal && u.internal.skillRanks) || {} })) });
  }
  const workerMatch = p.match(/^\/api\/workers\/([\w-]+)$/);
  if (workerMatch && req.method === 'PATCH') {
    if (!requireRole(user, ['admin'], res)) return;
    const w = db.users.find(u => u.id === workerMatch[1] && u.role === 'worker');
    if (!w) return send(res, 404, { error: 'worker not found' });
    const b = await readBody(req);
    if (['active', 'review', 'notfit'].includes(b.status)) { const was = w.status; w.status = b.status; if (w.status === 'active' && was !== 'active') { notify(w.id, 'account', 'Your worker account is now ACTIVE. You can see and claim open jobs in the app. Welcome to the team!'); fireAutomation('worker_activated', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), worker: { name: w.name, email: w.email, phone: w.phone || '', status: w.status } }); } }
    // Private Team-only skill ranks (1-5 per skill). Stored outside profile so workers never see them.
    if (b.skillRanks && typeof b.skillRanks === 'object' && !Array.isArray(b.skillRanks)) {
      w.internal = w.internal || {};
      const clean = {};
      for (const k of Object.keys(b.skillRanks).slice(0, 40)) {
        const n = Math.max(0, Math.min(5, parseInt(b.skillRanks[k], 10) || 0));
        if (n > 0 && String(k).length <= 60) clean[String(k).slice(0, 60)] = n;
      }
      w.internal.skillRanks = clean;
    }
    // Admin editing of worker profile data (name, phone, email, profile fields).
    if (typeof b.name === 'string' && cleanText(b.name, 80)) w.name = cleanText(b.name, 80);
    if (typeof b.phone === 'string') w.phone = cleanText(b.phone, 40);
    if (typeof b.email === 'string' && /.+@.+\..+/.test(b.email.trim())) {
      const em = b.email.trim().toLowerCase();
      if (!db.users.some(u => u.id !== w.id && (u.email || '').toLowerCase() === em)) w.email = em;
    }
    if (b.profile && typeof b.profile === 'object' && !Array.isArray(b.profile)) {
      w.profile = w.profile || {};
      const pf = b.profile;
      if (typeof pf.city === 'string') w.profile.city = cleanText(pf.city, 80);
      if (typeof pf.experience === 'string') w.profile.experience = cleanText(pf.experience, 200);
      if (typeof pf.vehicleStyle === 'string') w.profile.vehicleStyle = cleanText(pf.vehicleStyle, 120);
      if (typeof pf.notes === 'string') w.profile.notes = cleanText(pf.notes, 500);
      if (Array.isArray(pf.skills)) w.profile.skills = pf.skills.map(s => cleanText(String(s), 60)).filter(Boolean).slice(0, 30);
    }
    { const parts = []; if (b.status) parts.push('status ' + b.status); if (b.skillRanks) parts.push('skill ranks'); if (b.email || b.name || b.profile) parts.push('profile edit'); audit(user, 'worker.update', w.id, parts.join(' · ') || 'update'); }
    save(); return send(res, 200, { worker: pubUser(w) });
  }
  if (workerMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const idx = db.users.findIndex(u => u.id === workerMatch[1] && u.role === 'worker');
    if (idx === -1) return send(res, 404, { error: 'worker not found' });
    const removed = db.users.splice(idx, 1)[0];
    // Free any jobs this worker had claimed so they go back to the open board.
    db.jobs.forEach(j => { if (j.assignedWorkerId === removed.id) { const prev = j.status; j.assignedWorkerId = null; j.status = 'Open'; delete j.claimedAt; delete j.liveLoc; if (prev !== 'Open') emitJobStatus(j, prev); } });
    // A deleted worker cannot remain a captain — free his area.
    ensureCaptainState();
    db.areas.forEach(a => { if (a.captainId === removed.id) a.captainId = null; });
    // v36: ONE bilingual removal notice to the worker (name + email captured
    // above, before the record went away). A send failure NEVER blocks or
    // fails the deletion — the outcome is recorded in the audit entry.
    let emailed = false;
    if (removed.email) {
      try { const r = await sendAutomation('worker_removed', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), worker: { name: removed.name, email: removed.email } }); emailed = !!(r && r.sent); } catch (e) { emailed = false; }
    }
    audit(user, 'worker.delete', removed.id, (removed.email || 'no email on file') + ' · emailed: ' + emailed);
    invalidateSessionsFor(removed.id);
    save(); return send(res, 200, { ok: true, deleted: removed.id });
  }

  // ---------- invoices (admin) ----------
  if (p === '/api/admin/invoices' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const norm = normalizeInvoice(b);
    if (!cleanText(b.customerName, 120)) return send(res, 400, { error: 'customer name required' });
    if (!norm.items.length) return send(res, 400, { error: 'add at least one priced line item' });
    if (!(norm.total > 0)) return send(res, 400, { error: 'invoice total must be more than $0' });
    const email = cleanText(b.customerEmail, 160).toLowerCase();
    const inv = {
      id: id('INV'), customerName: cleanText(b.customerName, 120), customerEmail: email,
      customerPhone: cleanText(b.customerPhone, 40), customerId: cleanText(b.customerId, 40),
      jobId: cleanText(b.jobId, 40), requestId: cleanText(b.requestId, 40), items: norm.items, subtotal: norm.subtotal,
      discount: norm.discount, total: norm.total, status: 'draft',
      notes: cleanText(b.notes, 1000), dueDate: cleanText(b.dueDate, 20),
      createdAt: new Date().toISOString(), sentAt: null, paidAt: null, paidMethod: '', paidAmount: 0, stripeSessionId: ''
    };
    // Link to an app customer account by email when one exists, so the invoice
    // also shows up in their dashboard.
    if (!inv.customerId && email) { const c = db.users.find(u => u.role === 'customer' && u.email === email); if (c) inv.customerId = c.id; }
    if (!Array.isArray(db.invoices)) db.invoices = [];
    db.invoices.push(inv);
    notifyAdmins('invoice', 'Draft invoice ' + inv.id + ' created for ' + inv.customerName + ' (' + usd(inv.total) + ').');
    audit(user, 'invoice.create', inv.id, usd(inv.total) + ' · ' + inv.customerName);
    save(); return send(res, 201, { invoice: publicInvoice(inv) });
  }
  if (p === '/api/admin/invoices' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    return send(res, 200, { invoices: (db.invoices || []).slice().reverse().map(publicInvoice) });
  }
  const invAdminMatch = p.match(/^\/api\/admin\/invoices\/([\w-]+)\/(send|cancel|mark-paid|remind)$/);
  if (invAdminMatch && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const inv = (db.invoices || []).find(x => x.id === invAdminMatch[1]);
    if (!inv) return send(res, 404, { error: 'invoice not found' });
    const action = invAdminMatch[2];
    const b = await readBody(req);
    if (action === 'send') {
      if (inv.status !== 'draft') return send(res, 400, { error: 'only draft invoices can be sent' });
      if (!inv.customerEmail) return send(res, 400, { error: 'invoice has no customer email — add one first' });
      inv.status = 'sent'; inv.sentAt = new Date().toISOString();
      audit(user, 'invoice.send', inv.id, usd(inv.total) + ' → ' + inv.customerEmail);
      notifyAdmins('invoice', 'Invoice ' + inv.id + ' sent to ' + inv.customerEmail + ' (' + usd(inv.total) + ').');
      save();
      const automation = await sendAutomation('invoice_sent', { invoice: publicInvoice(inv) });
      return send(res, 200, { invoice: publicInvoice(inv), automation });
    }
    if (action === 'cancel') {
      if (!['draft', 'sent'].includes(inv.status)) return send(res, 400, { error: 'only draft or sent invoices can be cancelled' });
      inv.status = 'cancelled';
      notifyAdmins('invoice', 'Invoice ' + inv.id + ' cancelled.');
      audit(user, 'invoice.cancel', inv.id, '');
      save(); return send(res, 200, { invoice: publicInvoice(inv) });
    }
    if (action === 'mark-paid') {
      if (!['draft', 'sent'].includes(inv.status)) return send(res, 400, { error: 'only draft or sent invoices can be marked paid' });
      inv.status = 'paid'; inv.paidAt = new Date().toISOString();
      inv.paidMethod = cleanText(b.method, 20) || 'manual';
      inv.paidAmount = inv.total;
      notifyAdmins('payment', 'Invoice ' + inv.id + ' marked PAID (' + usd(inv.total) + ', ' + inv.paidMethod + ').');
      const cust = inv.customerId && db.users.find(x => x.id === inv.customerId);
      if (cust) notify(cust.id, 'payment', 'Your invoice ' + inv.id + ' ($' + inv.total.toFixed(2) + ') was marked paid. Thank you!');
      audit(user, 'invoice.mark_paid', inv.id, usd(inv.total) + ' · ' + inv.paidMethod);
      // A hand-marked paid invoice is captured money for captain-override
      // purposes — accrue now if its job is already Done (the sweep covers
      // every other ordering).
      const paidJob = (inv.jobId && db.jobs.find(x => x.id === inv.jobId)) || (inv.requestId && db.jobs.find(x => x.requestId === inv.requestId));
      if (paidJob) accrueCaptainOverride(paidJob);
      save();
      fireAutomation('invoice_paid', { invoice: publicInvoice(inv) });
      return send(res, 200, { invoice: publicInvoice(inv) });
    }
    if (action === 'remind') {
      // Manual payment reminder (admin-triggered only — no automatic schedule).
      // Fires an in-app notification for the customer and a reminder email with
      // the payment link, then stamps remindedAt and bumps reminderCount.
      if (!['sent', 'overdue'].includes(inv.status)) return send(res, 400, { error: 'only sent or overdue invoices can be reminded' });
      const cust = (inv.customerId && db.users.find(u => u.id === inv.customerId)) || (inv.customerEmail && db.users.find(u => u.role === 'customer' && u.email === inv.customerEmail));
      inv.reminderCount = (inv.reminderCount || 0) + 1;
      inv.remindedAt = new Date().toISOString();
      if (cust) notify(cust.id, 'invoice_reminder', 'Reminder: invoice ' + inv.id + ' (' + usd(inv.total) + ') is still unpaid — pay here: ' + invoicePayLink(inv));
      notifyAdmins('invoice', 'Payment reminder #' + inv.reminderCount + ' sent for invoice ' + inv.id + ' (' + inv.customerName + ', ' + usd(inv.total) + ').');
      audit(user, 'invoice.remind', inv.id, 'reminder #' + inv.reminderCount);
      save();
      const automation = await sendAutomation('invoice_reminder', { invoice: publicInvoice(inv) });
      return send(res, 200, { invoice: publicInvoice(inv), automation });
    }
    return send(res, 400, { error: 'unknown action' });
  }
  const invPutMatch = p.match(/^\/api\/admin\/invoices\/([\w-]+)$/);
  if (invPutMatch && req.method === 'PUT') {
    // Edit an invoice while it is still draft or sent (e.g. price negotiation
    // before payment). Totals are recalculated from the new line items. The
    // payment page always charges the current total, so a sent invoice keeps
    // working after an edit — no re-send is required for the link to charge
    // the new amount.
    // Scheduling confirmation (confirmedDate/confirmedTime, added 2026-10-12)
    // is allowed on any non-cancelled invoice — Gabriel confirms the final
    // schedule himself after the customer requests a time.
    if (!requireRole(user, ['admin'], res)) return;
    const inv = (db.invoices || []).find(x => x.id === invPutMatch[1]);
    if (!inv) return send(res, 404, { error: 'invoice not found' });
    const b = await readBody(req);
    const onlyConfirm = b && Object.keys(b).length > 0 && Object.keys(b).every(k => k === 'confirmedDate' || k === 'confirmedTime');
    if (!onlyConfirm && !['draft', 'sent'].includes(inv.status)) return send(res, 400, { error: 'only draft or sent invoices can be edited' });
    if (inv.status === 'cancelled') return send(res, 400, { error: 'invoice is cancelled' });
    if (!onlyConfirm) {
      const norm = normalizeInvoice(b);
      if (!norm.items.length) return send(res, 400, { error: 'add at least one priced line item' });
      if (!(norm.total > 0)) return send(res, 400, { error: 'invoice total must be more than $0' });
      inv.items = norm.items; inv.subtotal = norm.subtotal; inv.discount = norm.discount; inv.total = norm.total;
      if (b.customerName !== undefined) { const n = cleanText(b.customerName, 120); if (n) inv.customerName = n; }
      if (b.customerEmail !== undefined) {
        inv.customerEmail = cleanText(b.customerEmail, 160).toLowerCase();
        // Re-link to an app customer account when the email changed.
        inv.customerId = '';
        if (inv.customerEmail) { const c = db.users.find(u => u.role === 'customer' && u.email === inv.customerEmail); if (c) inv.customerId = c.id; }
      }
      if (b.customerPhone !== undefined) inv.customerPhone = cleanText(b.customerPhone, 40);
      if (b.jobId !== undefined) inv.jobId = cleanText(b.jobId, 40);
      if (b.requestId !== undefined) inv.requestId = cleanText(b.requestId, 40);
      if (b.notes !== undefined) inv.notes = cleanText(b.notes, 1000);
      if (b.dueDate !== undefined) inv.dueDate = cleanText(b.dueDate, 20);
    }
    audit(user, 'invoice.update', inv.id, onlyConfirm ? 'schedule confirmed' : 'total ' + usd(inv.total));
    if (b.confirmedDate !== undefined) inv.confirmedDate = cleanText(b.confirmedDate, 40);
    if (b.confirmedTime !== undefined) inv.confirmedTime = cleanText(b.confirmedTime, 40);
    inv.updatedAt = new Date().toISOString();
    notifyAdmins('invoice', onlyConfirm ? ('Schedule confirmed on invoice ' + inv.id + ': ' + (inv.confirmedDate || '') + (inv.confirmedTime ? ' • ' + inv.confirmedTime : '') + '.') : ('Invoice ' + inv.id + ' updated — new total ' + usd(inv.total) + '.'));
    save(); return send(res, 200, { invoice: publicInvoice(inv) });
  }
  if (invPutMatch && req.method === 'DELETE') {
    // Delete an invoice. Rule: any invoice that was NEVER paid can be deleted
    // outright (draft, sent, overdue, cancelled) — no point keeping clutter for
    // money that never arrived. Paid invoices cannot be deleted; cancel them
    // instead so the payment record is preserved.
    if (!requireRole(user, ['admin'], res)) return;
    const inv = (db.invoices || []).find(x => x.id === invPutMatch[1]);
    if (!inv) return send(res, 404, { error: 'invoice not found' });
    if (inv.status === 'paid' || inv.paidAt) return send(res, 400, { error: 'paid invoices cannot be deleted — cancel instead to keep the payment record' });
    const idx = db.invoices.indexOf(inv);
    db.invoices.splice(idx, 1);
    notifyAdmins('invoice', 'Invoice ' + inv.id + ' (' + inv.customerName + ', ' + usd(inv.total) + ') was deleted.');
    audit(user, 'invoice.delete', inv.id, inv.customerName || '');
    save(); return send(res, 200, { ok: true, deleted: inv.id });
  }

  // ---------- jobs / marketplace ----------
  const jobDelMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
  if (jobDelMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const idx = db.jobs.findIndex(j => j.id === jobDelMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'job not found' });
    const removed = db.jobs.splice(idx, 1)[0];
    // If the job came from a customer request, roll the request back so it is not stuck on "Job posted".
    if (removed.requestId) {
      const r = db.requests.find(x => x.id === removed.requestId);
      if (r && r.jobId === removed.id) { r.status = 'Approved'; delete r.jobId; r.messages = r.messages || []; r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Job ' + removed.id + ' was cancelled by the Team.', at: new Date().toISOString() }); }
    }
    audit(user, 'job.delete', removed.id, removed.service || '');
    save(); emitJobStatus(removed, removed.status, 'Deleted'); return send(res, 200, { ok: true, deleted: removed.id });
  }
  if (p === '/api/jobs' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    // v24 (E2): a job may be created PRE-ASSIGNED to one active worker.
    // With silent:true the broadcast fan-out is skipped entirely — no
    // notification records for the other workers, no job_posted email
    // automation, and the job.new stream event reaches only the assigned
    // worker (+ admin). The assigned worker is told directly and sees the
    // job as his own (status Claimed, exactly as if he had claimed it).
    // Without silent — or without an assignee — behavior is unchanged.
    let assignedWorkerId = null;
    if (b.assignedWorkerId) {
      const w = db.users.find(u => u.id === b.assignedWorkerId && u.role === 'worker' && u.status === 'active');
      if (w) assignedWorkerId = w.id;
    }
    const silent = !!(b.silent && assignedWorkerId);
    const j = { id: id('JOB'), status: assignedWorkerId ? 'Claimed' : 'Open', service: b.service || '', city: b.city || '', description: b.description || '', when: b.when || '', schedDate: cleanDate(b.schedDate), schedTime: cleanText(b.schedTime, 50), payOffer: Number(b.payOffer) || 0, customerPrice: Number(b.customerPrice) || null, customerName: b.customerName || '', customerPhone: b.customerPhone || '', address: b.address || '', notes: b.notes || '', assignedWorkerId, messages: [], createdAt: new Date().toISOString() };
    if (assignedWorkerId) j.claimedAt = j.createdAt;
    db.jobs.push(j);
    if (silent) {
      notify(assignedWorkerId, 'job', 'The Team assigned you a job: ' + (j.service || 'Job') + (j.city ? ' in ' + j.city : '') + ' — pay $' + (j.payOffer || 0) + '. It is in your jobs list.');
      emitJobNew(j, assignedWorkerId);
    } else {
      notifyWorkersForJob(j); emitJobNew(j); fireAutomation('job_posted', jobWorkerAutomationPayload(j));
    }
    audit(user, 'job.create', j.id, (j.service || '') + ' · pay $' + (j.payOffer || 0));
    save(); return send(res, 201, { job: publicJob(j, user) });
  }
  if (p === '/api/jobs' && req.method === 'GET') { sweepPendingPayouts(); sweepCaptainOverrides();
    if (!requireRole(user, ['admin', 'worker', 'customer'], res)) return;
    if (user.role === 'customer') {
      const mine = db.jobs.filter(j => j.assignedWorkerId && j.customerPhone && user.phone && j.customerPhone.replace(/\D/g, '') === user.phone.replace(/\D/g, ''));
      return send(res, 200, { jobs: mine.map(j => {
        const view = { id: j.id, status: j.status, service: j.service, city: j.city, description: j.description, when: j.when, createdAt: j.createdAt, messages: j.messages || [] };
        // v25 (C1): the OWNING customer sees their own rating on the job.
        if (j.rating) { view.rating = j.rating; view.reviewText = j.reviewText || ''; view.ratedAt = j.ratedAt || null; }
        // v22: the customer sees the live technician point ONLY while the
        // worker is sharing it (j.liveLoc exists). It is their own job and
        // their own address, so the destination coords ride along.
        if (j.liveLoc) {
          view.liveLoc = j.liveLoc;
          view.address = j.address || '';
          if (j.destLat != null && j.destLng != null) { view.destLat = j.destLat; view.destLng = j.destLng; }
        }
        return view;
      }) });
    }
    if (user.role === 'worker' && user.status !== 'active') return send(res, 403, { error: 'worker not active yet — the Team reviews and activates workers first' });
    if (user.role === 'worker') {
      // v25 (C1): a worker sees his own rating AGGREGATE (average + count)
      // — never individual customer comments.
      const ratedMine = db.jobs.filter(x => x.assignedWorkerId === user.id && x.rating);
      const workerRating = ratedMine.length ? { average: Math.round((ratedMine.reduce((s, x) => s + Number(x.rating), 0) / ratedMine.length) * 10) / 10, count: ratedMine.length } : { average: 0, count: 0 };
      return send(res, 200, { jobs: db.jobs.filter(j => j.status === 'Open' || j.assignedWorkerId === user.id).map(j => publicJob(j, user)), workerRating });
    }
    return send(res, 200, { jobs: db.jobs.map(j => publicJob(j, user)) });
  }
  // ---------- Master calendar (admin): jobs + invoice schedules for one month ----------
  if (p === '/api/admin/calendar' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    const month = String(url.searchParams.get('month') || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return send(res, 400, { error: 'month required as YYYY-MM' });
    const workerName = (wid) => { const w = db.users.find(u => u.id === wid); return w ? (w.name || '') : ''; };
    const events = [];
    for (const j of db.jobs) {
      if (j.schedDate && j.schedDate.slice(0, 7) === month) {
        events.push({ kind: 'job', id: j.id, date: j.schedDate, time: j.schedTime || '', title: j.service || 'Job', location: j.address || j.city || '', status: j.status || '', customerName: j.customerName || '', workerName: workerName(j.assignedWorkerId) });
      }
    }
    for (const inv of (db.invoices || [])) {
      const d = inv.confirmedDate || inv.preferredDate || '';
      if (d && d.slice(0, 7) === month) {
        let loc = '';
        if (inv.jobId) { const jj = db.jobs.find(x => x.id === inv.jobId); if (jj) loc = jj.address || jj.city || ''; }
        events.push({ kind: inv.confirmedDate ? 'scheduled' : 'requested', id: inv.id, date: d, time: inv.confirmedTime || inv.preferredTime || '', title: 'Invoice ' + inv.id, location: loc, status: inv.status || '', customerName: inv.customerName || '', workerName: '' });
      }
    }
    // Sort by date, then by time-of-day (best-effort 12h AM/PM parse; unparsed
    // times sort alphabetically after parsed ones).
    const timeKey = (t) => {
      const m = /(\d{1,2}):(\d{2})\s*([AP])\.?M\.?/i.exec(String(t || ''));
      if (!m) return '99:' + String(t || '');
      let h = Number(m[1]) % 12; if (/P/i.test(m[3])) h += 12;
      return String(h).padStart(2, '0') + ':' + m[2];
    };
    events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (timeKey(a.time) < timeKey(b.time) ? -1 : timeKey(a.time) > timeKey(b.time) ? 1 : 0));
    return send(res, 200, { events });
  }
  const claimMatch = p.match(/^\/api\/jobs\/([\w-]+)\/claim$/);
  if (claimMatch && req.method === 'POST') {
    if (!requireRole(user, ['worker'], res)) return;
    if (user.status !== 'active') return send(res, 403, { error: 'worker not active yet' });
    const j = db.jobs.find(x => x.id === claimMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    if (j.status !== 'Open') return send(res, 409, { error: 'job already claimed' });
    j.status = 'Claimed'; j.assignedWorkerId = user.id; j.claimedAt = new Date().toISOString();
    notifyAdmins('job', user.name + ' claimed job ' + j.id + ' (' + (j.service || '') + ' in ' + (j.city || '') + ').');
    const cust = db.users.find(x => x.role === 'customer' && j.customerPhone && x.phone && x.phone.replace(/\D/g, '') === String(j.customerPhone).replace(/\D/g, ''));
    if (cust) notify(cust.id, 'job', 'A worker was assigned to your job (' + (j.service || 'service') + ' in ' + (j.city || '') + '). The Team will coordinate the details with you.');
    fireAutomation('job_claimed', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), customer: cust ? { name: cust.name, email: cust.email } : null, worker: { name: user.name, email: user.email }, job: { id: j.id, status: j.status, service: j.service || '', city: j.city || '', when: j.when || '', payOffer: j.payOffer || 0 } });
    save(); emitJobStatus(j, 'Open'); return send(res, 200, { job: publicJob(j, user) });
  }
  const jobMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
  if (jobMatch && req.method === 'PATCH') {
    const j = db.jobs.find(x => x.id === jobMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    const b = await readBody(req);
    const prevJobStatus = j.status; // v23: one job.status event per PATCH, emitted at the end if it changed
    if (user && user.role === 'admin') {
      if (b.status) { applyJobStatus(j, b.status); if (b.status === 'On my way') geocodeJobDestination(j); if (b.workerPaid !== undefined) j.workerPaid = !!b.workerPaid; if (j.assignedWorkerId) notify(j.assignedWorkerId, 'job', 'Update on your job ' + j.id + ' (' + (j.service || '') + '): status is now "' + j.status + '".'); }
      if (b.address !== undefined) j.address = cleanText(b.address, 300);
      if (b.when !== undefined) j.when = cleanText(b.when, 200);
      if (b.schedDate !== undefined) j.schedDate = cleanDate(b.schedDate);
      if (b.schedTime !== undefined) j.schedTime = cleanText(b.schedTime, 50);
      if (b.notes !== undefined) j.notes = cleanText(b.notes, 1000);
      if (b.reviewPublished !== undefined) j.reviewPublished = !!b.reviewPublished; // v25 (C1): admin-only review publish flag
      if (b.infoReleased !== undefined) { const was = !!j.infoReleased; j.infoReleased = !!b.infoReleased; if (j.infoReleased && !was && j.assignedWorkerId) notify(j.assignedWorkerId, 'job', 'The Team confirmed job ' + j.id + ' - your address and time are now unlocked in the app. Check your jobs.'); }
    }
    else if (user && user.role === 'worker' && j.assignedWorkerId === user.id && (b.photosDone || b.status)) {
      // Worker status flow (v22): Claimed -> On my way -> Arrived, then the
      // existing photos-done completion. Only the assigned worker can move
      // their own job, and only along this chain — anything else is a 409.
      let handled = false;
      if (b.status) {
        const next = { 'Claimed': ['On my way', 'Arrived'], 'On my way': ['Arrived'], 'Arrived': [] }[j.status] || [];
        if (!next.includes(b.status)) return send(res, 409, { error: 'cannot move a job from "' + j.status + '" to "' + b.status + '"' });
        applyJobStatus(j, b.status);
        if (b.status === 'On my way') geocodeJobDestination(j);
        notifyAdmins('job', user.name + ' set job ' + j.id + ' (' + (j.service || '') + ') to "' + b.status + '".');
        const cust = jobCustomer(j);
        if (cust && b.status === 'On my way') notify(cust.id, 'job', 'Your technician is on the way for your ' + (j.service || 'job') + ' in ' + (j.city || '') + ' — watch the live map in the app.');
        if (cust && b.status === 'Arrived') notify(cust.id, 'job', 'Your technician has arrived for your ' + (j.service || 'job') + ' in ' + (j.city || '') + '.');
        handled = true;
      }
      if (b.photosDone) { j.photosReceived = true; applyJobStatus(j, 'Done — photos sent'); notifyAdmins('job', user.name + ' finished job ' + j.id + ' and marked photos sent.'); handled = true; }
      if (!handled) return send(res, 403, { error: 'not allowed' });
    }
    else return send(res, 403, { error: 'not allowed' });
    if (user && user.role === 'admin') { const parts = []; if (b.status) parts.push('status ' + b.status); if (b.infoReleased !== undefined) parts.push('infoReleased ' + !!b.infoReleased); if (b.reviewPublished !== undefined) parts.push('reviewPublished ' + !!b.reviewPublished); if (parts.length) audit(user, 'job.update', j.id, parts.join(' · ')); }
    save(); if (j.status !== prevJobStatus) emitJobStatus(j, prevJobStatus); if (j.status === 'Done — photos sent') { maybePayWorkerForJob(j); accrueCaptainOverride(j); } return send(res, 200, { job: publicJob(j, user) });
  }


  // ---------- Stripe Connect onboarding + payout override (v29) ----------
  if (p === '/api/worker/connect/start' && req.method === 'POST') {
    if (!requireRole(user, ['worker'], res)) return;
    if (!stripeReady()) return send(res, 503, { error: 'payments are not configured yet' });
    try {
      if (!user.stripeAccountId) {
        const acct = await stripeApi('/accounts', { type: 'express', country: 'US', email: user.email, 'capabilities[transfers][requested]': 'true', business_type: 'individual', 'metadata[userId]': user.id });
        user.stripeAccountId = acct.id; user.stripeCheckedAt = null; save();
      }
      const link = await stripeApi('/account_links', { account: user.stripeAccountId, type: 'account_onboarding', refresh_url: APP_URL + '#worker', return_url: APP_URL + '#worker' });
      return send(res, 200, { url: link.url });
    } catch (e) { return send(res, 502, { error: 'Stripe Connect error: ' + e.message }); }
  }
  if (p === '/api/worker/connect/status' && req.method === 'GET') {
    if (!requireRole(user, ['worker'], res)) return;
    await refreshWorkerConnect(user, true);
    if (user.stripePayoutsReady) db.jobs.filter(x => x.assignedWorkerId === user.id && x.payoutStatus === 'awaiting_worker_setup').forEach(jj => { maybePayWorkerForJob(jj); });
    return send(res, 200, { connected: !!user.stripeAccountId, ready: !!user.stripePayoutsReady, detailsSubmitted: !!user.stripeDetailsSubmitted });
  }
  const payWorkerMatch = p.match(/^\/api\/admin\/jobs\/([\w-]+)\/pay-worker$/);
  if (payWorkerMatch && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const j = db.jobs.find(x => x.id === payWorkerMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    await maybePayWorkerForJob(j, { force: true });
    audit(user, 'job.pay_worker', j.id, 'payoutStatus ' + (j.payoutStatus || '—'));
    return send(res, 200, { ok: true, payoutStatus: j.payoutStatus || null, payoutTransferId: j.payoutTransferId || null, payoutError: j.payoutError || null });
  }

  // ---------- Ratings (v25, C1) ----------
  // A job is COMPLETE when it reaches the same terminal state the worker
  // flow (and the job-side billing) keys on: the worker marked the photos
  // sent. Only the job's OWNING customer can rate it, exactly once, and
  // only after completion — all enforced here, never just in the UI.
  const JOB_COMPLETED_STATUS = 'Done — photos sent';
  const rateMatch = p.match(/^\/api\/jobs\/([\w-]+)\/rating$/);
  if (rateMatch && req.method === 'POST') {
    if (!requireRole(user, ['customer'], res)) return;
    const j = db.jobs.find(x => x.id === rateMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    if (!sseCustomerOwnsJob(j, user)) return send(res, 403, { error: 'not your job' });
    if (j.status !== JOB_COMPLETED_STATUS) return send(res, 400, { error: 'you can rate this job once it is completed' });
    if (j.rating) return send(res, 409, { error: 'this job was already rated' });
    const b = await readBody(req);
    const stars = Number(b.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return send(res, 400, { error: 'stars must be a whole number from 1 to 5' });
    j.rating = stars;
    j.reviewText = cleanText(b.text, 1000);
    j.ratedAt = new Date().toISOString();
    if (j.reviewPublished === undefined) j.reviewPublished = false; // never public by default — Gabriel publishes by hand
    save();
    notifyAdmins('rating', 'New ' + stars + '-star rating on job ' + j.id + ' (' + (j.service || '') + ').');
    return send(res, 200, { ok: true, rating: j.rating, reviewText: j.reviewText, ratedAt: j.ratedAt });
  }
  if (p === '/api/admin/audit' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    return send(res, 200, { entries: (db.auditLog || []).slice(-200).reverse() });
  }

  // ---------- Area captains (v40) ----------
  if (p === '/api/admin/captains' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    return send(res, 200, captainsAdminPayload());
  }
  if (p === '/api/admin/captains/areas' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const name = cleanText(b.name, 60);
    const cities = (Array.isArray(b.cities) ? b.cities : String(b.cities || '').split(',')).map(c => cleanText(c, 60)).filter(Boolean);
    if (!name) return send(res, 400, { error: 'area name required' });
    if (!cities.length) return send(res, 400, { error: 'list at least one city the area covers' });
    ensureCaptainState();
    if (db.areas.some(a => a.name.toLowerCase() === name.toLowerCase())) return send(res, 400, { error: 'an area with that name already exists' });
    const area = { id: id('AREA'), name, cities, fixed: false, captainId: null, createdAt: new Date().toISOString() };
    db.areas.push(area);
    audit(user, 'captain.area_create', area.id, name + ' — ' + cities.join(', '));
    save(); return send(res, 201, { ok: true, area, captains: captainsAdminPayload() });
  }
  const capAreaMatch = p.match(/^\/api\/admin\/captains\/areas\/([\w-]+)$/);
  if (capAreaMatch && req.method === 'PATCH') {
    if (!requireRole(user, ['admin'], res)) return;
    const area = areaById(capAreaMatch[1]);
    if (!area) return send(res, 404, { error: 'area not found' });
    const b = await readBody(req);
    const parts = [];
    if (b.name !== undefined) { const n = cleanText(b.name, 60); if (!n) return send(res, 400, { error: 'area name cannot be empty' }); area.name = n; parts.push('name → ' + n); }
    if (b.cities !== undefined) {
      const cities = (Array.isArray(b.cities) ? b.cities : String(b.cities || '').split(',')).map(c => cleanText(c, 60)).filter(Boolean);
      if (!cities.length) return send(res, 400, { error: 'an area must cover at least one city' });
      area.cities = cities; parts.push('cities → ' + cities.join(', '));
    }
    if (!parts.length) return send(res, 400, { error: 'nothing to update' });
    audit(user, 'captain.area_update', area.id, parts.join(' · '));
    save(); return send(res, 200, { ok: true, area, captains: captainsAdminPayload() });
  }
  if (capAreaMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const area = areaById(capAreaMatch[1]);
    if (!area) return send(res, 404, { error: 'area not found' });
    if (area.fixed) return send(res, 400, { error: 'Fairfield is El General\'s own base — it cannot be deleted' });
    const idx = db.areas.indexOf(area);
    db.areas.splice(idx, 1);
    audit(user, 'captain.area_delete', area.id, area.name);
    save(); return send(res, 200, { ok: true, deleted: area.id, captains: captainsAdminPayload() });
  }
  if (p === '/api/admin/captains/assign' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const area = areaById(cleanText(b.areaId, 60));
    if (!area) return send(res, 404, { error: 'area not found' });
    if (area.fixed) return send(res, 400, { error: 'Fairfield is commanded by El General himself — it is not assignable' });
    const w = db.users.find(u => u.id === cleanText(b.workerId, 60));
    if (!w || w.role !== 'worker') return send(res, 400, { error: 'captain must be a worker account' });
    if (w.status !== 'active') return send(res, 400, { error: 'only ACTIVE workers can be captains (this account is ' + (w.status || 'review') + ')' });
    // One captain per area; one area per worker — reassigning MOVES him.
    const prevArea = captainAreaOf(w.id);
    if (prevArea && prevArea.id !== area.id) prevArea.captainId = null;
    const prevCaptain = area.captainId && area.captainId !== w.id ? db.users.find(u => u.id === area.captainId) : null;
    area.captainId = w.id;
    audit(user, 'captain.assign', area.id, w.name + ' → Capitán de ' + area.name + (prevArea && prevArea.id !== area.id ? ' (moved from ' + prevArea.name + ')' : '') + (prevCaptain ? ' (replaces ' + prevCaptain.name + ')' : ''));
    notify(w.id, 'captain', 'You are now Capitán / Captain of ' + area.name + '. Open "Mi área / My area" in your worker panel to see your area, your team and your 5% override balance.');
    if (prevCaptain) notify(prevCaptain.id, 'captain', 'The Team reassigned the captaincy of ' + area.name + ' to ' + w.name + '. Any override you already accrued stays yours.');
    save(); return send(res, 200, { ok: true, captains: captainsAdminPayload() });
  }
  if (p === '/api/admin/captains/unassign' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const area = areaById(cleanText(b.areaId, 60));
    if (!area) return send(res, 404, { error: 'area not found' });
    if (area.fixed) return send(res, 400, { error: 'Fairfield is commanded by El General himself — nothing to unassign' });
    if (!area.captainId) return send(res, 400, { error: 'this area has no captain' });
    const prev = db.users.find(u => u.id === area.captainId);
    area.captainId = null;
    audit(user, 'captain.unassign', area.id, (prev ? prev.name : 'captain') + ' removed from ' + area.name);
    if (prev) notify(prev.id, 'captain', 'The Team removed you as Capitán of ' + area.name + '. Any override you already accrued stays yours.');
    save(); return send(res, 200, { ok: true, captains: captainsAdminPayload() });
  }
  if (p === '/api/admin/captains/payout' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const captainId = cleanText(b.captainId, 60);
    const cap = db.users.find(u => u.id === captainId && u.role === 'worker');
    if (!cap) return send(res, 404, { error: 'captain not found' });
    const amount = money(b.amount);
    if (!(amount > 0)) return send(res, 400, { error: 'enter the amount you paid out' });
    const outstanding = captainOutstanding(captainId);
    if (amount > outstanding) return send(res, 400, { error: 'amount exceeds the accrued override balance (' + usd(outstanding) + ')' });
    // Manual payout by the owner — applied FIFO across the captain's
    // accrued entries; who/when/amount is recorded in state + audit.
    let left = amount;
    const nowIso = new Date().toISOString();
    for (const e of db.captainLedger.filter(x => x.captainId === captainId && (Number(x.amount) || 0) > (Number(x.paidAmount) || 0))) {
      if (left <= 0) break;
      const due = money((Number(e.amount) || 0) - (Number(e.paidAmount) || 0));
      const pay = Math.min(due, left);
      e.paidAmount = money((Number(e.paidAmount) || 0) + pay);
      if (e.paidAmount >= Number(e.amount)) { e.status = 'paid'; e.paidAt = nowIso; }
      left = money(left - pay);
    }
    const payout = { id: id('CPO'), captainId, captainName: cap.name, amount, at: nowIso, byId: user.id, byName: user.name, byEmail: user.email || '' };
    db.captainPayouts.push(payout);
    audit(user, 'captain.payout', captainId, usd(amount) + ' → ' + cap.name + ' (manual) · balance now ' + usd(captainOutstanding(captainId)));
    notify(captainId, 'captain', 'The Team marked ' + usd(amount) + ' of your captain override as PAID. Remaining accrued balance: ' + usd(captainOutstanding(captainId)) + '.');
    save(); return send(res, 200, { ok: true, payout, totals: { accrued: captainOutstanding(captainId), paidOut: captainPaidOut(captainId) }, captains: captainsAdminPayload() });
  }
  // The captain's own view: his area ONLY — area jobs (id, service, city,
  // status, assigned technician), the technicians whose coverage overlaps
  // his area, and his override balance. No customer phone numbers, no
  // customer totals, no other areas, no money handling.
  if (p === '/api/me/captain' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'sign in required' });
    ensureCaptainState(); sweepCaptainOverrides();
    const area = db.areas.find(a => a.captainId && a.captainId === user.id);
    if (!area) return send(res, 200, { captain: false });
    const techName = (wid) => { const w = wid && db.users.find(u => u.id === wid); return w ? w.name : null; };
    const jobs = db.jobs.filter(j => { const a2 = areaForCity(j.city || ''); return a2 && a2.id === area.id; })
      .slice().sort((x, y) => (x.createdAt || '') < (y.createdAt || '') ? 1 : -1).slice(0, 100)
      .map(j => ({ id: j.id, service: j.service || '', city: j.city || '', status: j.status, when: j.when || '', createdAt: j.createdAt || null, technician: techName(j.assignedWorkerId), mine: j.assignedWorkerId === user.id }));
    const team = db.users.filter(u => u.role === 'worker' && u.status === 'active' && u.id !== user.id && workerOverlapsArea(u, area))
      .map(u => ({ name: u.name, city: (u.profile || {}).city || '', skills: (u.profile || {}).skills || [] }));
    const entries = db.captainLedger.filter(e => e.captainId === user.id).slice(-50).reverse()
      .map(e => ({ id: e.id, jobId: e.jobId, areaName: e.areaName || area.name, charged: e.charged, amount: e.amount, paidAmount: e.paidAmount || 0, status: e.status, at: e.at }));
    const payouts = db.captainPayouts.filter(x => x.captainId === user.id).slice(-20).reverse();
    return send(res, 200, { captain: true, area: { id: area.id, name: area.name, cities: area.cities || [] }, jobs, team, override: { rate: CAPTAIN_OVERRIDE_RATE, accrued: captainOutstanding(user.id), paidOut: captainPaidOut(user.id), entries, payouts } });
  }
  if (p === '/api/admin/ratings' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    const rated = db.jobs.filter(j => j.rating);
    const count = rated.length;
    const average = count ? Math.round((rated.reduce((s, j) => s + Number(j.rating), 0) / count) * 10) / 10 : 0;
    const reviews = rated.slice()
      .sort((a, b) => (a.ratedAt || '') < (b.ratedAt || '') ? 1 : -1)
      .map(j => ({ jobId: j.id, service: j.service || '', city: j.city || '', stars: j.rating, text: j.reviewText || '', ratedAt: j.ratedAt || null, published: !!j.reviewPublished, workerId: j.assignedWorkerId || null }));
    return send(res, 200, { average, count, reviews });
  }

  // ---------- v22 live tracking: worker position posts ----------
  const locMatch = p.match(/^\/api\/jobs\/([\w-]+)\/location$/);
  if (locMatch && req.method === 'POST') {
    if (!user || user.role !== 'worker') return send(res, 403, { error: 'workers only' });
    const j = db.jobs.find(x => x.id === locMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    if (j.assignedWorkerId !== user.id) return send(res, 403, { error: 'not your job' });
    if (j.status !== 'On my way') return send(res, 409, { error: 'job is not en route — location sharing is off' });
    const b = await readBody(req);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return send(res, 400, { error: 'invalid coordinates' });
    j.liveLoc = { lat, lng, updatedAt: new Date().toISOString() }; // latest point only — never a trail
    geocodeJobDestination(j); // no-op once cached; also covers a missed transition trigger
    save(); emitJobLocation(j); return send(res, 200, { ok: true });
  }
  const locStopMatch = p.match(/^\/api\/jobs\/([\w-]+)\/location\/stop$/);
  if (locStopMatch && req.method === 'POST') {
    if (!user || user.role !== 'worker') return send(res, 403, { error: 'workers only' });
    const j = db.jobs.find(x => x.id === locStopMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    if (j.assignedWorkerId !== user.id) return send(res, 403, { error: 'not your job' });
    delete j.liveLoc; // coordinates are deleted, never archived
    save(); emitJobLocationStopped(j); return send(res, 200, { ok: true });
  }

  const jobMsgMatch = p.match(/^\/api\/jobs\/([\w-]+)\/messages$/);
  if (jobMsgMatch && req.method === 'POST') {
    const j = db.jobs.find(x => x.id === jobMsgMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    const cust = db.users.find(x => x.role === 'customer' && j.customerPhone && x.phone && x.phone.replace(/\D/g, '') === String(j.customerPhone).replace(/\D/g, ''));
    const isTeam = user && user.role === 'admin';
    const isWorker = user && user.role === 'worker' && j.assignedWorkerId === user.id && user.status === 'active';
    const isCust = user && cust && cust.id === user.id && !!j.assignedWorkerId;
    if (!isTeam && !isWorker && !isCust) return send(res, 403, { error: 'not allowed' });
    const b = await readBody(req);
    const text = (b.text || '').toString().slice(0, 2000).trim();
    if (!text) return send(res, 400, { error: 'message required' });
    j.messages = j.messages || [];
    const from = isTeam ? 'team' : (isWorker ? 'worker' : 'customer');
    j.messages.push({ from, name: isTeam ? 'General Handyman Solutions Team' : user.name, text, at: new Date().toISOString() });
    if (!isTeam) notifyAdmins('message', 'Job ' + j.id + ': new message from ' + user.name + '.');
    if (!isWorker && j.assignedWorkerId) notify(j.assignedWorkerId, 'message', 'Job ' + j.id + ': new message from ' + (isTeam ? 'the Team' : user.name) + '.');
    if (!isCust && cust) notify(cust.id, 'message', 'Job ' + j.id + ': new message from ' + (isTeam ? 'the General Handyman Solutions Team' : user.name) + '.');
    save(); return send(res, 201, { job: publicJob(j, user) });
  }

  // ---------- Stripe payments ----------
  if (p === '/api/stripe/config' && req.method === 'GET') {
    return send(res, 200, {
      configured: stripeReady(),
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      homeCareMonthly: HOMECARE_MONTHLY_CENTS / 100,
      // Membership plans (added 2026-10-21, additive — existing fields are
      // unchanged): fixed server-side prices/ids for every plan.
      membershipPlans: membershipPlansPublic(),
      yardCareMonthly: { oneVisit: MEMBERSHIP_PLANS.yard1.monthlyCents / 100, twoVisits: MEMBERSHIP_PLANS.yard2.monthlyCents / 100 },
      homeCarePlusMonthly: { oneVisit: MEMBERSHIP_PLANS.plus1.monthlyCents / 100, twoVisits: MEMBERSHIP_PLANS.plus2.monthlyCents / 100 },
      yardCareProductId: MEMBERSHIP_PLANS.yard1.productId,
      homeCarePlusProductId: MEMBERSHIP_PLANS.plus1.productId
    });
  }
  if (p === '/api/admin/stripe/health' && req.method === 'GET') {
    // Admin-only live check: actually calls Stripe so a bad/rotated key shows
    // up here BEFORE a customer hits "pay". Not just "key exists".
    if (!requireRole(user, ['admin'], res)) return;
    if (!stripeReady()) return send(res, 200, { ok: false, reason: 'no key set — add STRIPE_SECRET_KEY in Render env' });
    try {
      const r = await fetch(STRIPE_API + '/account', { headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY }, signal: AbortSignal.timeout(10000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return send(res, 200, { ok: false, reason: 'Stripe rejected the key (' + ((data && data.error && data.error.message) || ('HTTP ' + r.status)) + ') — update STRIPE_SECRET_KEY in Render and redeploy' });
      return send(res, 200, { ok: true, live: !(data.livemode === false), account: data.id || 'ok' });
    } catch (e) {
      return send(res, 200, { ok: false, reason: 'could not reach Stripe: ' + e.message });
    }
  }
  if (p === '/api/stripe/checkout' && req.method === 'POST') {
    const b = await readBody(req);
    if (user && b) stashPendingSource(user, b.source); // v24 A5: campaign code rides the join call, lands at activation
    // Membership plans (added 2026-10-21): the plan key is validated
    // server-side FIRST, so an unknown plan is always a clean 400 and the
    // price only ever comes from the fixed MEMBERSHIP_PLANS map — a
    // client-sent price id is never read. Membership requires an account.
    if (b.kind === 'yardcare' || b.kind === 'homecare-plus') {
      if (!user) return send(res, 401, { error: 'login required' });
      if (!['customer', 'admin'].includes(user.role)) return send(res, 403, { error: 'not allowed' });
      const plan = MEMBERSHIP_PLANS[b.plan];
      if (!plan || plan.kind !== b.kind) return send(res, 400, { error: 'unknown membership plan' });
      if (!cleanText(user.serviceAddress, 300)) return send(res, 400, { error: 'service address required', code: 'ADDRESS_REQUIRED' });
      if (membershipPlanOf(user).status === 'active') return send(res, 400, { error: 'you already have an active membership plan' });
      if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — the Team will confirm your booking for now' });
      try {
        const s = await createCheckoutSession(b.kind, user, { plan: plan.key });
        return send(res, 200, { url: s.url, plan: plan.key });
      } catch (e) { console.error('stripe checkout failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
    }
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — the Team will confirm your booking for now' });
    // 'estimate-hold' is public like invoice payments: the request id in
    // the body identifies the request, no login needed. Every other kind
    // still requires a logged-in user.
    if (b.kind !== 'estimate-hold' && !user) return send(res, 401, { error: 'login required' });
    try {
      if (b.kind === 'homecare') {
        if (!['customer', 'admin'].includes(user.role)) return send(res, 403, { error: 'not allowed' });
        if (user.homeCareStatus === 'active') return send(res, 400, { error: 'you already have an active HomeCare membership' });
        const s = await createCheckoutSession('homecare', user);
        return send(res, 200, { url: s.url });
      }
      if (b.kind === 'estimate' || b.kind === 'member-estimate') {
        const r = db.requests.find(x => x.id === b.requestId);
        if (!r) return send(res, 404, { error: 'request not found' });
        const owns = user.role === 'admin' || (user.role === 'customer' && r.customerId === user.id);
        if (!owns) return send(res, 403, { error: 'not allowed' });
        if (!r.estimate || !(r.estimate.bookingDue > 0)) return send(res, 400, { error: 'this request has nothing due to book' });
        if (r.estimatePaid) return send(res, 400, { error: 'already paid' });
        // $50 member estimate: only for ACTIVE members of any plan (HomeCare,
        // HomeCare Plus, Yard Care), and only when the amount due really is
        // the $50 member rate — otherwise use the normal pay button.
        let amountCents, kind = 'estimate', label = 'In-person estimate payment — request ' + r.id + ' — General Handyman Solutions';
        if (b.kind === 'member-estimate') {
          const payPlan = membershipPlanOf(user);
          if (!(user.homeCareStatus === 'active' || (payPlan.planKey && payPlan.status === 'active'))) return send(res, 403, { error: 'the $50 member estimate is only for active members' });
          if (Math.abs(r.estimate.bookingDue - 50) > 0.01) return send(res, 400, { error: 'use the normal pay button for this amount' });
          amountCents = 5000; kind = 'member-estimate'; label = 'Member estimate — $50 — request ' + r.id;
        } else {
          amountCents = Math.round(r.estimate.bookingDue * 100);
        }
        // Optional tip (added 2026-10-19): integer cents, never negative,
        // capped at 100% of the amount due.
        let tipCents = Math.round(Number(b.tipCents) || 0);
        if (tipCents < 0) tipCents = 0;
        if (tipCents > amountCents) tipCents = amountCents;
        const s = await createCheckoutSession(kind, user, { amountCents, tipCents: tipCents, requestId: r.id, label });
        return send(res, 200, { url: s.url, amount: (amountCents + tipCents) / 100, tip: tipCents / 100 });
      }
      if (b.kind === 'estimate-hold') {
        // Authorization hold for the in-person estimate fee. The amount
        // ALWAYS comes from the request server-side (estimateDue: $75
        // regular / $50 member) — the client can never name a price.
        const r = db.requests.find(x => x.id === b.requestId);
        if (!r) return send(res, 404, { error: 'request not found' });
        if (user && user.role === 'customer' && r.customerId && r.customerId !== user.id) return send(res, 403, { error: 'not allowed' });
        if (r.estimateType !== 'inperson') return send(res, 400, { error: 'holds only apply to in-person estimates (photo estimates are free)' });
        const amountCents = Math.round((Number(r.estimateDue) || 0) * 100);
        if (!(amountCents > 0)) return send(res, 400, { error: 'this request has no estimate fee to authorize (free estimate or already covered)' });
        if (requestHolds(r).some(h => h.key === 'visit' && h.status === 'authorized')) return send(res, 400, { error: 'an authorization hold is already active on this request' });
        const s = await createCheckoutSession('estimate-hold', { id: r.customerId || '', email: r.customerEmail || '' }, { amountCents, requestId: r.id, holdKey: 'visit', label: 'In-person estimate — authorization hold (request ' + r.id + ') — General Handyman Solutions' });
        return send(res, 200, { url: s.url, amount: amountCents / 100, hold: true });
      }
      return send(res, 400, { error: 'unknown checkout kind' });
    } catch (e) { console.error('stripe checkout failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  // ---------- Inline "New HomeCare member" card flow (added 2026-10-19) ----------
  // The member types their card right in the signup form (Stripe Elements keeps
  // the number off our servers). Step 1 creates an incomplete $29/mo
  // subscription and returns the PaymentIntent client secret; the app confirms
  // the card with Stripe.js; step 2 verifies the charge and activates the
  // membership synchronously. The invoice.payment_succeeded webhook stays as
  // backup (activateHomeCare is idempotent).
  if (p === '/api/stripe/homecare-subscribe' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    stashPendingSource(user, b && b.source); // v24 A5
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — the Team will confirm your booking for now' });
    if (!['customer', 'admin'].includes(user.role)) return send(res, 403, { error: 'not allowed' });
    if (user.homeCareStatus === 'active') return send(res, 400, { error: 'you already have an active HomeCare membership' });
    try {
      const r = await createInlineSubscription(user, MEMBERSHIP_PLANS.homecare);
      return send(res, 200, r);
    } catch (e) { console.error('homecare subscribe failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  if (p === '/api/stripe/homecare-confirm' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    if (user.homeCareStatus === 'active') return send(res, 200, { active: true });
    if (!stripeReady() || !user.stripeSubscriptionId) return send(res, 400, { error: 'no pending membership found' });
    try {
      const chk = await inlineSubscriptionPaid(user);
      if (!chk.paid) return send(res, 200, { active: false });
      activateHomeCare(user, true);
      return send(res, 200, { active: true });
    } catch (e) { console.error('homecare confirm failed', e.message); return send(res, 502, { error: 'could not verify the payment — if you were charged, the Team will activate your membership shortly' }); }
  }
  // ---------- Inline one-submit join: Yard Care / HomeCare Plus ----------
  // Same machinery as the HomeCare inline flow above, generalized by plan:
  // the plan key is validated against the server-side MEMBERSHIP_PLANS map
  // (the price only ever comes from the map), the service-address rule for
  // yard/plus plans is enforced BEFORE any Stripe call, and one active
  // membership per customer is refused. Activation at confirm goes through
  // activateMembershipPlan — the same helper the webhook lifecycle uses —
  // so the synchronous activation and the backup webhook agree exactly.
  if (p === '/api/stripe/membership-subscribe' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    stashPendingSource(user, b.source); // v24 A5
    const plan = MEMBERSHIP_PLANS[b.plan];
    if (!plan || plan.key === 'homecare') return send(res, 400, { error: 'unknown membership plan' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — the Team will confirm your booking for now' });
    if (!['customer', 'admin'].includes(user.role)) return send(res, 403, { error: 'not allowed' });
    if (membershipPlanOf(user).status === 'active') return send(res, 400, { error: 'you already have an active membership plan' });
    if (!cleanText(user.serviceAddress, 300)) return send(res, 400, { error: 'service address required', code: 'ADDRESS_REQUIRED' });
    try {
      const r = await createInlineSubscription(user, plan);
      return send(res, 200, { clientSecret: r.clientSecret, subscriptionId: r.subscriptionId, plan: plan.key });
    } catch (e) { console.error('membership subscribe failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  if (p === '/api/stripe/membership-confirm' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    const current = membershipPlanOf(user);
    if (current.status === 'active' && current.planKey && current.planKey !== 'homecare' && (!b.plan || current.planKey === b.plan)) return send(res, 200, { active: true, plan: current.planKey });
    if (!stripeReady() || !user.stripeSubscriptionId) return send(res, 400, { error: 'no pending membership found' });
    try {
      const chk = await inlineSubscriptionPaid(user);
      if (!chk.plan || chk.plan.key === 'homecare') return send(res, 400, { error: 'unknown membership plan' });
      if (b.plan && b.plan !== chk.plan.key) return send(res, 400, { error: 'plan mismatch' });
      if (!chk.paid) return send(res, 200, { active: false });
      activateMembershipPlan(user, chk.plan.key, { subscriptionId: chk.sub.id, first: true });
      return send(res, 200, { active: true, plan: chk.plan.key });
    } catch (e) { console.error('membership confirm failed', e.message); return send(res, 502, { error: 'could not verify the payment — if you were charged, the Team will activate your membership shortly' }); }
  }
  // ---------- Menu-order authorization hold (inline, 2026-10-22) ----------
  // The real checkout's payment step: the customer enters their card ONCE
  // in the app (Stripe Elements). If they added HomeCare, the membership is
  // its own Stripe subscription, created and confirmed first through the
  // existing inline membership endpoints (a separate Stripe process, as
  // Gabriel requires) — then this hold is confirmed with the same card.
  // The hold is the $75 visit authorization (manual capture, Gabriel
  // captures the final menu total by hand when the job is done).
  if (p === '/api/orders/hold' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    const r = db.requests.find(x => x.id === b.requestId);
    if (!r) return send(res, 404, { error: 'request not found' });
    if (!(user.role === 'admin' || (user.role === 'customer' && r.customerId === user.id))) return send(res, 403, { error: 'not allowed' });
    if (r.estimateType !== 'menu') return send(res, 400, { error: 'not a menu order' });
    if (requestHolds(r).some(x => x.key === 'visit' && x.status === 'authorized')) return send(res, 400, { error: 'hold already placed on this order' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — the Team will confirm your booking for now' });
    try {
      const params = {
        amount: String(Math.round((Number(r.estimateDue) || 75) * 100)),
        currency: 'usd',
        capture_method: 'manual',
        'payment_method_options[card][request_incremental_authorization]': 'if_available',
        description: 'Visit authorization hold — menu order ' + r.id + ' — General Handyman Solutions',
        'metadata[requestId]': r.id, 'metadata[holdKey]': 'visit', 'metadata[kind]': 'menu-hold'
      };
      if (user.stripeCustomerId) params.customer = user.stripeCustomerId;
      const pi = await stripeApi('/payment_intents', params);
      return send(res, 200, { clientSecret: pi.client_secret, paymentIntentId: pi.id });
    } catch (e) { console.error('menu hold failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  if (p === '/api/orders/hold-confirm' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    const r = db.requests.find(x => x.id === b.requestId);
    if (!r) return send(res, 404, { error: 'request not found' });
    if (!(user.role === 'admin' || (user.role === 'customer' && r.customerId === user.id))) return send(res, 403, { error: 'not allowed' });
    const piId = cleanText(b.paymentIntentId, 160);
    if (!piId) return send(res, 400, { error: 'paymentIntentId required' });
    if (findHold(r, piId)) return send(res, 200, { ok: true, already: true });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet' });
    try {
      const pi = await stripeGet('/payment_intents/' + piId + '?expand[]=latest_charge');
      if (!pi || pi.status !== 'requires_capture') return send(res, 400, { error: 'the authorization is not in place yet' });
      if (!pi.metadata || pi.metadata.requestId !== r.id) return send(res, 400, { error: 'payment does not match this order' });
      const cents = Number(pi.amount) || 0;
      const h = upsertHold(r, 'visit', piId, { status: 'authorized', authorizedCents: cents });
      const card = pi.latest_charge && pi.latest_charge.payment_method_details && pi.latest_charge.payment_method_details.card;
      if (card) {
        if (card.capture_before) h.captureBefore = new Date(Number(card.capture_before) * 1000).toISOString();
        if (card.incremental_authorization && card.incremental_authorization.status) h.incremental = card.incremental_authorization.status;
        h.updatedAt = new Date().toISOString();
      }
      r.messages = r.messages || [];
      r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Order secured: we placed a ' + usd(cents / 100) + ' authorization HOLD on your card (authorized only — NOT charged yet). You are only charged the final amount when the work is done.', at: new Date().toISOString() });
      if (r.customerId) notify(r.customerId, 'payment', 'Authorization hold placed (' + usd(cents / 100) + ') on order ' + r.id + ' — not charged yet. Your order is secured.');
      notifyAdmins('payment', 'Authorization HOLD ' + usd(cents / 100) + ' placed on menu order ' + r.id + ' (' + (r.customerName || r.customerEmail || 'customer') + ') — PI ' + piId + '.');
      save();
      return send(res, 200, { ok: true });
    } catch (e) { console.error('menu hold confirm failed', e.message); return send(res, 502, { error: 'could not verify the authorization — if your card shows a hold, the Team will link it to your order shortly' }); }
  }
  // ---------- invoices (customer payment) ----------
  if (p === '/api/invoices/mine' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'login required' });
    const email = (user.email || '').toLowerCase();
    const mine = (db.invoices || []).filter(inv => inv.customerId === user.id || (email && (inv.customerEmail || '').toLowerCase() === email));
    return send(res, 200, { invoices: mine.slice().reverse().map(publicInvoice) });
  }
  const invPayMatch = p.match(/^\/api\/invoices\/([\w-]+)\/pay$/);
  if (invPayMatch && req.method === 'POST') {
    // Public: anyone with the invoice link can pay it. No login required — the
    // invoice id in the emailed link is the credential, same as estimate links.
    const inv = (db.invoices || []).find(x => x.id === invPayMatch[1]);
    if (!inv) return send(res, 404, { error: 'invoice not found' });
    if (inv.status === 'paid') return send(res, 400, { error: 'this invoice is already paid' });
    if (inv.status === 'cancelled') return send(res, 400, { error: 'this invoice was cancelled — contact the Team' });
    if (!stripeReady()) return send(res, 400, { error: 'online payments are not connected yet — text/call (707) 862-3773 to pay another way' });
    try {
      const body = await readBody(req);
      // Optional tip from the invoice page (added 2026-10-19): integer cents,
      // never negative, capped at 100% of the invoice total.
      let tipCents = Math.round(Number(body.tipCents) || 0);
      if (tipCents < 0) tipCents = 0;
      const maxTip = Math.round(inv.total * 100);
      if (tipCents > maxTip) tipCents = maxTip;
      const s = await createCheckoutSession('invoice', { email: inv.customerEmail || '', id: inv.customerId || '' }, { amountCents: Math.round(inv.total * 100), tipCents: tipCents, invoiceId: inv.id, label: 'Invoice ' + inv.id + ' — General Handyman Solutions', email: inv.customerEmail || '' });
      return send(res, 200, { url: s.url, amount: inv.total + tipCents / 100, tip: tipCents / 100 });
    } catch (e) { console.error('invoice checkout failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
  }
  if (p === '/api/stripe/portal' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet' });
    if (!user.stripeCustomerId) return send(res, 400, { error: 'no Stripe billing yet — join HomeCare first' });
    try {
      const s = await stripeApi('/billing_portal/sessions', { customer: user.stripeCustomerId, return_url: appBase() + '/' });
      return send(res, 200, { url: s.url });
    } catch (e) { console.error('stripe portal failed', e.message); return send(res, 502, { error: 'billing portal unavailable — try again in a minute' }); }
  }
  if (p === '/api/stripe/webhook' && req.method === 'POST') {
    const raw = await readRawBody(req);
    if (!verifyStripeSig(raw, req.headers['stripe-signature'] || '')) return send(res, 400, { error: 'bad signature' });
    try {
      const event = JSON.parse(raw);
      await handleStripeEvent(event);
      save();
      return send(res, 200, { received: true });
    } catch (e) { console.error('stripe webhook failed', e.message); return send(res, 500, { error: 'webhook handler failed' }); }
  }
  if (p === '/payment/success' && req.method === 'GET') {
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment received</title><body style="font-family:system-ui;max-width:560px;margin:0 auto;padding:32px 20px;text-align:center"><h1 style="color:#0b0b0b">Payment <span style="color:#e42535">received</span> ✅</h1><p>Thank you — your payment went through. If you joined <b>HomeCare</b>, your first in-person estimate is <b>FREE</b>: log in and request it from your dashboard. If you paid an estimate, your appointment is <b>secured</b> — the Team will confirm your time with you.</p><p><a href="/" style="background:#e42535;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Open my dashboard</a></p><p style="color:#666;font-size:13px">Questions? Text or call (707) 862-3773.</p></body>');
  }
  if (p === '/payment/cancelled' && req.method === 'GET') {
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment cancelled</title><body style="font-family:system-ui;max-width:560px;margin:0 auto;padding:32px 20px;text-align:center"><h1>Payment <span style="color:#e42535">cancelled</span></h1><p>No charge was made. You can come back and try again anytime — your request is still saved in the app.</p><p><a href="/" style="background:#0b0b0b;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Back to the app</a></p><p style="color:#666;font-size:13px">Questions? Text or call (707) 862-3773.</p></body>');
  }

  const invPageMatch = p.match(/^\/invoice\/([\w-]+)$/);
  if (invPageMatch && req.method === 'GET') {
    const inv = (db.invoices || []).find(x => x.id === invPageMatch[1]);
    if (!inv) return send(res, 404, '<!doctype html><body style="font-family:system-ui;padding:32px"><h2>Invoice not found</h2><p>Check the link from your email, or text/call (707) 862-3773.</p></body>');
    return send(res, 200, invoicePageHtml(inv));
  }

  // ---------- public estimate approval (added 2026-10-12) ----------
  const estPageMatch = p.match(/^\/estimate\/([\w-]+)$/);
  if (estPageMatch && req.method === 'GET') {
    const r = db.requests.find(x => x.id === estPageMatch[1]);
    if (!r || !r.estimate) return send(res, 404, '<!doctype html><body style="font-family:system-ui;padding:32px"><h2>Estimate not found</h2><p>Check the link from your email, or text/call (707) 862-3773.</p></body>');
    return send(res, 200, estimatePageHtml(r));
  }
  const estActMatch = p.match(/^\/estimate\/([\w-]+)\/(approve|decline)$/);
  if (estActMatch && req.method === 'POST') {
    // Public: anyone with the estimate link can approve or decline it. No
    // login required — the estimate id in the emailed link is the credential,
    // same as invoice links.
    const r = db.requests.find(x => x.id === estActMatch[1]);
    if (!r || !r.estimate) return send(res, 404, { error: 'estimate not found' });
    if (r.status !== 'Quoted') return send(res, 400, { error: 'this estimate is no longer awaiting approval (status: ' + r.status + ')' });
    const b = await readBody(req);
    const action = estActMatch[2];
    r.messages = r.messages || [];
    if (action === 'approve') {
      r.status = 'Approved';
      r.messages.push({ from: 'customer', name: r.customerName || 'Customer', text: 'Approved the estimate from the public link.', at: new Date().toISOString() });
      notifyAdmins('quote', (r.customerName || 'Customer') + ' APPROVED the estimate on ' + r.id + ' (' + usd(r.estimate.total) + ') via the public link.');
      if (r.customerId) notify(r.customerId, 'quote', 'You approved the estimate on request ' + r.id + '. Your invoice is ready — pay online with the link below.');
      const inv = invoiceFromEstimate(r);
      notifyAdmins('invoice', 'Invoice ' + inv.id + ' auto-created from approved estimate on ' + r.id + ' (' + usd(inv.total) + ') — sent to ' + (inv.customerEmail || 'customer') + '.');
      save();
      fireAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'approved' }));
      // Raise the authorization to the approved total if a visit hold is
      // active (increment only — NEVER a capture). Failure is recorded on
      // r.holdSync and never fails the approval itself.
      await tryHoldIncrementAfterApproval(r);
      save();
      return send(res, 200, { ok: true, invoiceId: inv.id, payUrl: invoicePayLink(inv) });
    }
    const reason = cleanText(b.reason, 500);
    r.status = 'Declined';
    r.messages.push({ from: 'customer', name: r.customerName || 'Customer', text: 'Declined the estimate from the public link.' + (reason ? ' Reason: ' + reason : ''), at: new Date().toISOString() });
    notifyAdmins('quote', (r.customerName || 'Customer') + ' declined the estimate on ' + r.id + '.' + (reason ? ' Reason: ' + reason : ''));
    save();
    fireAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'declined' }));
    return send(res, 200, { ok: true });
  }
  // ---------- public scheduling request (added 2026-10-12) ----------
  const schedMatch = p.match(/^\/api\/invoices\/([\w-]+)\/schedule$/);
  if (schedMatch && req.method === 'POST') {
    // Public: no login needed. This is a REQUEST, not a confirmation —
    // Gabriel confirms the final schedule himself from the admin panel.
    const inv = (db.invoices || []).find(x => x.id === schedMatch[1]);
    if (!inv) return send(res, 404, { error: 'invoice not found' });
    if (inv.status === 'cancelled') return send(res, 400, { error: 'this invoice was cancelled — contact the Team' });
    const b = await readBody(req);
    const windows = ['morning', 'afternoon', 'evening'];
    const win = cleanText(b.preferredTime, 40).toLowerCase();
    inv.preferredDate = cleanText(b.preferredDate, 40);
    inv.preferredTime = windows.includes(win) ? win : cleanText(b.preferredTime, 40);
    inv.scheduleNotes = cleanText(b.scheduleNotes, 1000);
    inv.scheduleRequestedAt = new Date().toISOString();
    notifyAdmins('schedule', 'Scheduling request on invoice ' + inv.id + ' (' + (inv.customerName || inv.customerEmail || '') + '): preferred ' + (inv.preferredDate || 'no date') + ' • ' + (inv.preferredTime || 'no window') + (inv.scheduleNotes ? ' • Notes: ' + inv.scheduleNotes : '') + ' — confirm the final schedule yourself.');
    save();
    return send(res, 200, { ok: true, invoice: publicInvoice(inv) });
  }

  // ---------- memberships (admin) ----------
  if (p === '/api/customers' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    const customers = db.users.filter(u => u.role === 'customer').map(u => {
      const reqs = db.requests.filter(r => r.customerId === u.id).length;
      return { id: u.id, name: u.name, email: u.email, phone: u.phone || '', serviceAddress: u.serviceAddress || '', zipCode: u.zipCode || '', homeType: u.homeType || '', yardSize: u.yardSize || '', homeNotes: u.homeNotes || '', startPreference: normalizeStartPreference(u.startPreference), homeCareStatus: u.homeCareStatus || 'none', homeCareSince: u.homeCareSince || null, homeCareCancelAt: u.homeCareCancelAt || null, membershipPlan: membershipPlanOf(u), freeEstimateUsed: !!u.freeEstimateUsed, source: u.source || null, requests: reqs, createdAt: u.createdAt };
    });
    return send(res, 200, { customers });
  }
  const custMatch = p.match(/^\/api\/customers\/([\w-]+)$/);
  if (custMatch && req.method === 'PATCH') {
    if (!requireRole(user, ['admin'], res)) return;
    const c = db.users.find(u => u.id === custMatch[1] && u.role === 'customer');
    if (!c) return send(res, 404, { error: 'customer not found' });
    const b = await readBody(req);
    // Membership status is Stripe-only (2026-10-10): the webhook is the single
    // source of truth — paid subscription = active member, cancelled/failed =
    // not a member. The admin CANNOT flip membership by hand; they can only
    // reset the one-free-estimate flag (e.g. goodwill re-grant).
    if (b.freeEstimateUsed !== undefined) {
      c.freeEstimateUsed = !!b.freeEstimateUsed;
      if (!c.freeEstimateUsed) notify(c.id, 'membership', 'The Team re-granted your free HomeCare estimate — request it from your dashboard.');
    }
    save(); return send(res, 200, { customer: { id: c.id, name: c.name, email: c.email, homeCareStatus: c.homeCareStatus || 'none', homeCareSince: c.homeCareSince || null, homeCareCancelAt: c.homeCareCancelAt || null, freeEstimateUsed: !!c.freeEstimateUsed } });
  }

  // ---------- Yard visits / Yard Calendar (admin, added 2026-10-21) ----------
  // A SEPARATE calendar from the master jobs calendar: yard visits are the
  // included monthly visits of Yard Care / HomeCare Plus members. A visit is
  // NOT a job — creating or changing one never touches db.jobs, never
  // notifies workers and never appears on /api/admin/calendar. Gabriel runs
  // the yard route himself; this is purely scheduling bookkeeping.
  if (!Array.isArray(db.yardVisits)) db.yardVisits = [];
if (!Array.isArray(db.auditLog)) db.auditLog = [];
  const yardDateOk = (v) => { const s = cleanDate(v); if (!s) return ''; const d = new Date(s + 'T00:00:00Z'); return (!isNaN(d) && d.toISOString().slice(0, 10) === s) ? s : ''; };
  const publicYardVisit = (v) => {
    const u = db.users.find(x => x.id === v.userId);
    const plan = u ? membershipPlanOf(u) : null;
    const w = v.assignedWorkerId ? db.users.find(x => x.id === v.assignedWorkerId) : null;
    // ADMIN view (Gabriel only): everything, including the internal $50
    // worker pay — this serializer is only used on admin endpoints.
    return { id: v.id, userId: v.userId, date: v.date, status: v.status, notes: v.notes || '', createdAt: v.createdAt,
      source: v.source || 'manual', period: v.period || (v.date ? v.date.slice(0, 7) : ''), planKey: v.planKey || (plan ? plan.planKey : null),
      assignedWorkerId: v.assignedWorkerId || null, assignedWorkerName: w ? (w.name || '') : '',
      beforePhoto: v.beforePhoto || null, afterPhoto: v.afterPhoto || null, completedAt: v.completedAt || null, workerPay: (v.workerPay == null ? null : v.workerPay),
      memberName: u ? (u.name || '') : '', memberEmail: u ? (u.email || '') : '', serviceAddress: u ? (u.serviceAddress || '') : '',
      zipCode: u ? (u.zipCode || '') : '', homeType: u ? (u.homeType || '') : '', yardSize: u ? (u.yardSize || '') : '', homeNotes: u ? (u.homeNotes || '') : '', startPreference: u ? normalizeStartPreference(u.startPreference) : { type: 'asap', date: null },
      plan: plan ? { planKey: plan.planKey, type: plan.type, name: plan.name, visitsPerMonth: plan.visitsPerMonth, status: plan.status } : null };
  };
  // WORKER view (v25, B1): only what the assigned worker needs to do the
  // visit — date, the service address (released BY the assignment itself),
  // plan type and status. NEVER the member's name, email or phone (the
  // Team is the only middleman, same rule as jobs) and NEVER the internal
  // worker pay.
  const workerYardVisit = (v) => {
    const u = db.users.find(x => x.id === v.userId);
    const plan = u ? membershipPlanOf(u) : null;
    return { id: v.id, date: v.date, status: v.status, notes: v.notes || '',
      address: u ? (u.serviceAddress || '') : '', yardSize: u ? (u.yardSize || '') : '', homeNotes: u ? (u.homeNotes || '') : '',
      planName: plan ? plan.name : '', visitsPerMonth: plan ? plan.visitsPerMonth : 0,
      beforePhoto: v.beforePhoto || null, afterPhoto: v.afterPhoto || null, completedAt: v.completedAt || null };
  };
  const YARD_WORKER_FLOW = { assigned: ['on_the_way'], on_the_way: ['arrived'], arrived: ['done'] };
  const YARD_WORKER_PAY = 50; // flat per standard visit — INTERNAL ONLY, never serialized to customers
  const isActiveYardMember = (u) => {
    if (!u || u.role !== 'customer') return false;
    const plan = membershipPlanOf(u);
    return plan.status === 'active' && (plan.type === 'yard' || plan.type === 'plus');
  };
  if (p === '/api/admin/yard-visits' && req.method === 'GET') {
    if (!requireRole(user, ['admin'], res)) return;
    const from = cleanDate(url.searchParams.get('from') || '');
    const to = cleanDate(url.searchParams.get('to') || '');
    let list = db.yardVisits.slice();
    if (from) list = list.filter(v => v.date >= from);
    if (to) list = list.filter(v => v.date <= to);
    list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1));
    return send(res, 200, { visits: list.map(publicYardVisit) });
  }
  if (p === '/api/admin/yard-visits' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const target = db.users.find(u => u.id === cleanText(b.userId, 60));
    if (!target) return send(res, 404, { error: 'customer not found' });
    if (!isActiveYardMember(target)) return send(res, 400, { error: 'customer does not have an active Yard Care or HomeCare Plus membership' });
    const date = yardDateOk(b.date);
    if (!date) return send(res, 400, { error: 'valid date required as YYYY-MM-DD' });
    const tPlan = membershipPlanOf(target);
    const v = { id: id('YV'), userId: target.id, date, status: 'scheduled', notes: cleanText(b.notes, 500), createdAt: new Date().toISOString(),
      source: 'manual', period: date.slice(0, 7), planKey: tPlan.planKey || null, assignedWorkerId: null, beforePhoto: null, afterPhoto: null, completedAt: null, workerPay: null };
    let assignTo = null;
    if (b.assignedWorkerId) {
      assignTo = db.users.find(x => x.id === cleanText(b.assignedWorkerId, 60) && x.role === 'worker' && x.status === 'active') || null;
      if (!assignTo) return send(res, 400, { error: 'worker not found or not active' });
      v.assignedWorkerId = assignTo.id; v.status = 'assigned';
    }
    db.yardVisits.push(v); save();
    if (assignTo) { notify(assignTo.id, 'yard', 'You were assigned a yard visit on ' + v.date + '. Open the app — "My yard visits" — for the address.'); emitYardAssigned(v); }
    return send(res, 201, { visit: publicYardVisit(v) });
  }
  const yvMatch = p.match(/^\/api\/admin\/yard-visits\/([\w-]+)$/);
  if (yvMatch && req.method === 'PATCH') {
    if (!requireRole(user, ['admin'], res)) return;
    const v = db.yardVisits.find(x => x.id === yvMatch[1]);
    if (!v) return send(res, 404, { error: 'yard visit not found' });
    const b = await readBody(req);
    if (b.date !== undefined) {
      const date = yardDateOk(b.date);
      if (!date) return send(res, 400, { error: 'valid date required as YYYY-MM-DD' });
      v.date = date;
    }
    if (b.status !== undefined) {
      if (!['proposed', 'scheduled', 'assigned', 'on_the_way', 'arrived', 'done', 'cancelled'].includes(b.status)) return send(res, 400, { error: 'invalid yard visit status' });
      v.status = b.status;
      if (b.status === 'done' && !v.completedAt) { v.completedAt = new Date().toISOString(); if (v.assignedWorkerId && v.workerPay == null) v.workerPay = YARD_WORKER_PAY; }
    }
    if (b.notes !== undefined) v.notes = cleanText(b.notes, 500);
    // v25 (B1): assignment. Assigning IS the address release for yard
    // visits (Gabriel's rule: address/time are released the moment a
    // worker is on the job) — the worker's own view carries the address;
    // no other worker ever sees the visit. Only ACTIVE workers qualify.
    let assignedNow = null;
    if (b.assignedWorkerId !== undefined) {
      if (b.assignedWorkerId === null || b.assignedWorkerId === '') {
        if (v.status === 'assigned') v.status = 'scheduled';
        v.assignedWorkerId = null;
      } else {
        const w = db.users.find(x => x.id === cleanText(b.assignedWorkerId, 60) && x.role === 'worker' && x.status === 'active');
        if (!w) return send(res, 400, { error: 'worker not found or not active' });
        if (v.status === 'done' || v.status === 'cancelled') return send(res, 400, { error: 'cannot assign a ' + v.status + ' visit' });
        const changed = v.assignedWorkerId !== w.id;
        v.assignedWorkerId = w.id;
        if (v.status === 'proposed' || v.status === 'scheduled') v.status = 'assigned';
        if (changed) assignedNow = w;
      }
    }
    save();
    if (assignedNow) { notify(assignedNow.id, 'yard', 'You were assigned a yard visit on ' + v.date + '. Open the app — "My yard visits" — for the address.'); emitYardAssigned(v); }
    return send(res, 200, { visit: publicYardVisit(v) });
  }
  if (yvMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const idx = db.yardVisits.findIndex(x => x.id === yvMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'yard visit not found' });
    const removed = db.yardVisits.splice(idx, 1)[0];
    save(); return send(res, 200, { ok: true, deleted: removed.id });
  }
  if (p === '/api/me/yard-visits' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'login required' });
    // Customer view: dates + statuses only, plus the LAST completed visit
    // with its AFTER photo as proof of service. The internal worker pay
    // and the before photo are never part of this payload.
    const mine = db.yardVisits.filter(v => v.userId === user.id)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1))
      .map(v => ({ id: v.id, date: v.date, status: v.status, notes: v.notes || '' }));
    const doneList = db.yardVisits.filter(v => v.userId === user.id && v.status === 'done')
      .sort((a, b) => ((a.completedAt || a.date) < (b.completedAt || b.date) ? 1 : -1));
    const last = doneList[0] || null;
    return send(res, 200, { visits: mine, lastCompleted: last ? { id: last.id, date: last.date, completedAt: last.completedAt || null, afterPhoto: last.afterPhoto || null } : null });
  }

  // ---------- Yard visits: worker flow (v25, B1) ----------
  // The assigned worker runs his visit from his own panel: Assigned ->
  // On my way -> Arrived -> Done, strictly in that order, and Done is
  // refused until a BEFORE and an AFTER photo are on the visit (same
  // data-URL photo pattern the request flow uses). Completing stamps
  // completedAt + the internal flat workerPay ($50) on the record — the
  // pay is only ever exposed by the ADMIN serializer above.
  if (p === '/api/worker/yard-visits' && req.method === 'GET') {
    if (!requireRole(user, ['worker'], res)) return;
    const mine = db.yardVisits.filter(v => v.assignedWorkerId === user.id)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1))
      .map(workerYardVisit);
    return send(res, 200, { visits: mine });
  }
  const wYvMatch = p.match(/^\/api\/worker\/yard-visits\/([\w-]+)$/);
  if (wYvMatch && req.method === 'PATCH') {
    if (!requireRole(user, ['worker'], res)) return;
    const v = db.yardVisits.find(x => x.id === wYvMatch[1]);
    if (!v) return send(res, 404, { error: 'yard visit not found' });
    if (v.assignedWorkerId !== user.id) return send(res, 403, { error: 'not your yard visit' });
    const b = await readBody(req);
    const photoOk = (x) => typeof x === 'string' && x.startsWith('data:image/') && x.length <= 5000000;
    for (const key of ['beforePhoto', 'afterPhoto']) {
      if (b[key] !== undefined) {
        if (v.status === 'done') return send(res, 409, { error: 'this visit is already done' });
        if (!photoOk(b[key])) return send(res, 400, { error: key + ' must be an image' });
        v[key] = b[key];
      }
    }
    if (b.status !== undefined) {
      const next = YARD_WORKER_FLOW[v.status] || [];
      if (!next.includes(b.status)) return send(res, 409, { error: 'cannot move a yard visit from "' + v.status + '" to "' + b.status + '"' });
      if (b.status === 'done') {
        if (!v.beforePhoto || !v.afterPhoto) return send(res, 400, { error: 'a BEFORE photo and an AFTER photo are required to finish a yard visit' });
        v.completedAt = new Date().toISOString();
        v.workerPay = YARD_WORKER_PAY;
        notifyAdmins('yard', user.name + ' completed yard visit ' + v.id + ' (' + v.date + ') — photos are in the Yard Calendar.');
        const member = db.users.find(x => x.id === v.userId);
        if (member) notify(member.id, 'yard', 'Your yard visit on ' + v.date + ' is done — the after photo is in your membership card.');
      }
      v.status = b.status;
    }
    save();
    return send(res, 200, { visit: workerYardVisit(v) });
  }

  // ---------- notifications ----------
  if (p === '/api/notifications' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'login required' });
    const mine = (db.notifications || []).filter(n => n.userId === user.id).slice(-100).reverse();
    return send(res, 200, { notifications: mine, unread: mine.filter(n => !n.read).length });
  }
  if (p === '/api/notifications/read' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'login required' });
    const b = await readBody(req);
    (db.notifications || []).forEach(n => { if (n.userId === user.id && (!Array.isArray(b.ids) || b.ids.includes(n.id))) n.read = true; });
    save(); return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not found' });
});

loadFromSupabase().then(() => server.listen(PORT, () => console.log('GHS app running on port ' + PORT)));

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

let db = { users: [], requests: [], jobs: [], notifications: [] };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
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
    console.log('Loaded state from Supabase (' + db.users.length + ' users, ' + db.requests.length + ' requests, ' + db.jobs.length + ' jobs)');
  } catch (e) { console.error('supabase load failed', e.message); }
}
const sessions = new Map(); // token -> userId

function id(p) { return p + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function hashPw(pw) { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); }
function checkPw(pw, stored) { const [s, h] = stored.split(':'); const t = crypto.scryptSync(pw, s, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(t)); }
function pubUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || '', status: u.status || 'active', skills: u.skills || [], vehicle: u.vehicle || '', profile: u.profile || {}, createdAt: u.createdAt }; }
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json' }, headers || {}));
  res.end(body);
}
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }
function auth(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer) { const uid = sessions.get(bearer); if (uid) return db.users.find(u => u.id === uid) || null; }
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ghs_session='));
  if (!cookie) return null;
  const uid = sessions.get(cookie.slice('ghs_session='.length));
  return db.users.find(u => u.id === uid) || null;
}
function newSession(u) { const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, u.id); return token; }
function requireRole(user, roles, res) { if (!user) { send(res, 401, { error: 'login required' }); return false; } if (!roles.includes(user.role)) { send(res, 403, { error: 'not allowed' }); return false; } return true; }
// ---------- notifications ----------
function notify(userId, type, text) {
  if (!userId || !text) return;
  if (!Array.isArray(db.notifications)) db.notifications = [];
  db.notifications.push({ id: id('NTF'), userId, type: type || 'info', text, read: false, at: new Date().toISOString() });
  if (db.notifications.length > 2000) db.notifications = db.notifications.slice(-2000);
}
function notifyAdmins(type, text) { db.users.filter(u => u.role === 'admin').forEach(a => notify(a.id, type, text)); }
function workerAreas(w) {
  const prof = w.profile || {};
  const raw = prof.areas || prof.serviceAreas || prof.wAreas || '';
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,;]/);
  return list.map(s => String(s).toLowerCase().trim()).filter(Boolean);
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
  if (assigned) return Object.assign(base, { customerName: j.customerName, customerPhone: j.customerPhone, address: j.address, notes: j.notes || '', messages: j.messages || [] });
  return base; // workers who have not claimed see NO customer details
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
function money(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function clampMoney(v) { return Math.max(0, money(v)); }
function cleanText(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 500); }
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
  let bookingDue = raw.bookingDue == null || raw.bookingDue === '' ? (credit > 0 ? Math.min(75, total) : money(total / 2)) : clampMoney(raw.bookingDue);
  bookingDue = Math.min(bookingDue, total);
  return { items, subtotal, asap, asapRate, asapAmount, discountPct, discountAmount, credit, total, bookingDue, balanceDue: money(total - bookingDue), currency: 'USD', updatedAt: new Date().toISOString() };
}
function automationReady() { return !!(GOOGLE_AUTOMATION_URL && GOOGLE_AUTOMATION_SECRET); }
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
function fireGoogleAutomation(type, payload) { googleAutomation(type, payload).catch(() => {}); }
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
    request: { id: r.id, customerName: r.customerName || (cust ? cust.name : ''), customerEmail: cust ? cust.email : '', customerPhone: cust ? (cust.phone || '') : '', service: r.service || '', description: r.description || '', city: r.city || '', address: r.address || '', when: r.when || '', estimateType: r.estimateType || '', membership: r.membership || '', status: r.status || '', quote: r.quote, quoteNote: r.quoteNote || '', estimate: r.estimate || null, createdAt: r.createdAt || '' },
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
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const user = auth(req);

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
  if (p === '/api/health') return send(res, 200, { ok: true, app: 'ghs-app' });

  // ---------- auth ----------
  if (p === '/setup' && req.method === 'GET') {
    if (db.users.some(u => u.role === 'admin')) return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px"><h2>Admin already set up</h2><p>The Team admin account already exists. <a href="/">Go to the app login</a>.</p></body>');
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up Team admin</title><body style="font-family:system-ui;padding:24px;max-width:520px;margin:0 auto"><h2>Set up the Team admin (one time)</h2><p>Create the General Handyman Solutions Team admin login. Use an email you control and a strong password only you know.</p><label>Display name</label><input id="n" style="width:100%;padding:10px;margin:4px 0 10px" value="General Handyman Solutions Team"><label>Email</label><input id="e" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="generalhandymans@gmail.com"><label>Phone number</label><input id="ph" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="(707) 555-0123"><label>Password</label><input id="pw" type="password" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="Choose a strong password"><button id="b" style="background:#e10600;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:700">Create admin</button><p id="m"></p><script>document.getElementById("b").onclick=async()=>{const r=await fetch("/api/setup-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("n").value,email:document.getElementById("e").value,phone:document.getElementById("ph").value,password:document.getElementById("pw").value})});const d=await r.json();document.getElementById("m").textContent=r.ok?"Admin created. Go to the app and log in.":"Error: "+(d.error||"failed");if(r.ok)setTimeout(()=>location.href="/",1200);};</scr'+'ipt></body>');
  }
  if (p === '/api/setup-admin' && req.method === 'POST') {
    const b = await readBody(req);
    // One-time bootstrap: only works while no admin exists yet. After the first admin is created this endpoint closes (409).
    if (db.users.some(u => u.role === 'admin')) return send(res, 409, { error: 'admin already exists' });
    const u = { id: id('USR'), name: b.name || 'Gabriel', email: (b.email || '').toLowerCase(), phone: b.phone || '', role: 'admin', status: 'active', pw: hashPw(b.password || ''), createdAt: new Date().toISOString() };
    if (!u.email || !b.password) return send(res, 400, { error: 'email and password required' });
    db.users.push(u); save(); return send(res, 201, { user: pubUser(u) });
  }
  if (p === '/api/signup' && req.method === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').toLowerCase();
    if (!email || !b.password || !b.name) return send(res, 400, { error: 'name, email and password required' });
    if (db.users.some(u => u.email === email)) return send(res, 409, { error: 'email already registered' });
    // Worker accounts are created instantly at signup, but start on review: no job claiming until Gabriel activates (2026-10-07).
    const role = b.role === 'worker' ? 'worker' : 'customer';
    const prof = (b.profile && typeof b.profile === 'object') ? b.profile : {};
    const u = { id: id('USR'), name: b.name, email, phone: b.phone || '', role, status: role === 'worker' ? 'review' : 'active', skills: Array.isArray(prof.skills) ? prof.skills : (b.skills || []), vehicle: prof.vehicleStyle || b.vehicle || '', profile: prof, pw: hashPw(b.password), createdAt: new Date().toISOString() };
    db.users.push(u); if (role === 'worker') { notifyAdmins('worker', 'New worker application: ' + u.name + (prof.city ? ' (' + prof.city + ')' : '') + ' — review in Workers.'); fireGoogleAutomation('new_worker', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), worker: { name: u.name, email: u.email, phone: u.phone || '', status: u.status, profile: u.profile || {} } }); } save(); return send(res, 201, { user: pubUser(u), token: newSession(u) });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const u = db.users.find(x => x.email === (b.email || '').toLowerCase());
    if (!u || !checkPw(b.password || '', u.pw)) return send(res, 401, { error: 'wrong email or password' });
    const token = newSession(u);
    return send(res, 200, { user: pubUser(u), token }, { 'Set-Cookie': 'ghs_session=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000' });
  }
  if (p === '/api/logout' && req.method === 'POST') { return send(res, 200, { ok: true }, { 'Set-Cookie': 'ghs_session=; HttpOnly; Path=/; Max-Age=0' }); }
  if (p === '/api/me' && req.method === 'GET') { if (!user) return send(res, 401, { error: 'login required' }); return send(res, 200, { user: pubUser(user) }); }

  // ---------- customer requests ----------
  if (p === '/api/requests' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const b = await readBody(req);
    const photos = Array.isArray(b.photos) ? b.photos.filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 6) : [];
    const r = { id: id('GHS'), customerId: user.id, customerName: user.name, service: b.service || '', description: b.description || '', city: b.city || '', address: b.address || '', when: b.when || '', estimateType: b.estimateType || 'inperson', membership: b.membership || 'none', estimateDue: b.estimateType === 'photo' ? 0 : (b.membership === 'new' ? 0 : (b.membership === 'member' ? 60 : 75)), status: 'New', quote: null, quoteNote: '', estimate: null, photos, messages: [{ from: 'customer', name: user.name, text: (b.description || 'Request sent.') + (photos.length ? ' [' + photos.length + ' photo(s) attached]' : ''), at: new Date().toISOString() }], createdAt: new Date().toISOString() };
    db.requests.push(r); notifyAdmins('request', 'New request ' + r.id + ': ' + (r.service || 'Service') + ' in ' + (r.city || '') + ' from ' + r.customerName + '.'); save(); fireGoogleAutomation('new_request', requestAutomationPayload(r)); return send(res, 201, { request: r });
  }
  if (p === '/api/requests' && req.method === 'GET') {
    if (!requireRole(user, ['customer', 'worker', 'admin'], res)) return;
    let list = user.role === 'admin' ? db.requests : db.requests.filter(r => r.customerId === user.id);
    if (user.role === 'admin') list = list.map(r => { const c = db.users.find(u => u.id === r.customerId); return Object.assign({}, r, { customerPhone: c ? (c.phone || '') : '', customerEmail: c ? c.email : '' }); });
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
        const est = normalizeEstimate(b.estimate || { total: b.quote, credit: 0, bookingDue: null }, r);
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
          automation = await googleAutomation('estimate_sent', requestAutomationPayload(r));
          if (automation.sent) {
            r.estimateEmailSentAt = new Date().toISOString();
            r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'We also emailed this estimate to you from ' + BUSINESS_EMAIL + '.', at: new Date().toISOString() });
          }
        }
      }
      if (b.status) r.status = b.status;
    } else if (user && user.role === 'customer' && r.customerId === user.id) {
      r.messages = r.messages || [];
      if (b.action === 'approve') { r.status = 'Approved'; r.messages.push({ from: 'customer', name: user.name, text: 'Approved the quote. Ready to schedule.', at: new Date().toISOString() }); notifyAdmins('quote', user.name + ' APPROVED the quote on ' + r.id + ' ($' + (r.quote || 0) + ').'); fireGoogleAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'approved' })); }
      if (b.action === 'decline') { r.status = 'Declined'; r.messages.push({ from: 'customer', name: user.name, text: 'Declined the quote for now.', at: new Date().toISOString() }); notifyAdmins('quote', user.name + ' declined the quote on ' + r.id + '.'); fireGoogleAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'declined' })); }
    } else return send(res, 403, { error: 'not allowed' });
    save(); return send(res, 200, { request: r, automation });
  }
  if (reqMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const idx = db.requests.findIndex(x => x.id === reqMatch[1]);
    if (idx === -1) return send(res, 404, { error: 'request not found' });
    const removed = db.requests.splice(idx, 1)[0];
    save(); return send(res, 200, { ok: true, deleted: removed.id });
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
    const j = { id: id('JOB'), status: 'Open', requestId: r.id, service: b.service || r.service || '', city: b.city || r.city || '', description: b.description || r.description || '', when: b.when || r.when || '', payOffer, customerPrice: Number(b.customerPrice) || r.quote || null, customerName: r.customerName || (cust ? cust.name : ''), customerPhone: cust ? (cust.phone || '') : '', address: r.address || '', notes: b.notes || '', assignedWorkerId: null, messages: [], createdAt: new Date().toISOString() };
    db.jobs.push(j);
    r.status = 'Job posted'; r.jobId = j.id;
    r.messages = r.messages || [];
    r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'We posted your job to our team (job ' + j.id + '). A worker can now claim it — we will coordinate the details with you here.', at: new Date().toISOString() });
    notify(r.customerId, 'job', 'Your job was posted to our team (job ' + j.id + '). We\'ll update you here when a worker claims it.');
    notifyWorkersForJob(j);
    fireGoogleAutomation('job_posted', jobWorkerAutomationPayload(j));
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
    return send(res, 200, { workers: db.users.filter(u => u.role === 'worker').map(pubUser) });
  }
  const workerMatch = p.match(/^\/api\/workers\/([\w-]+)$/);
  if (workerMatch && req.method === 'PATCH') {
    if (!requireRole(user, ['admin'], res)) return;
    const w = db.users.find(u => u.id === workerMatch[1] && u.role === 'worker');
    if (!w) return send(res, 404, { error: 'worker not found' });
    const b = await readBody(req);
    if (['active', 'review', 'notfit'].includes(b.status)) { const was = w.status; w.status = b.status; if (w.status === 'active' && was !== 'active') { notify(w.id, 'account', 'Your worker account is now ACTIVE. You can see and claim open jobs in the app. Welcome to the team!'); fireGoogleAutomation('worker_activated', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), worker: { name: w.name, email: w.email, phone: w.phone || '', status: w.status } }); } }
    save(); return send(res, 200, { worker: pubUser(w) });
  }
  if (workerMatch && req.method === 'DELETE') {
    if (!requireRole(user, ['admin'], res)) return;
    const idx = db.users.findIndex(u => u.id === workerMatch[1] && u.role === 'worker');
    if (idx === -1) return send(res, 404, { error: 'worker not found' });
    const removed = db.users.splice(idx, 1)[0];
    // Free any jobs this worker had claimed so they go back to the open board.
    db.jobs.forEach(j => { if (j.assignedWorkerId === removed.id) { j.assignedWorkerId = null; j.status = 'Open'; delete j.claimedAt; } });
    for (const [token, uid] of sessions) { if (uid === removed.id) sessions.delete(token); }
    save(); return send(res, 200, { ok: true, deleted: removed.id });
  }

  // ---------- jobs / marketplace ----------
  if (p === '/api/jobs' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const j = { id: id('JOB'), status: 'Open', service: b.service || '', city: b.city || '', description: b.description || '', when: b.when || '', payOffer: Number(b.payOffer) || 0, customerPrice: Number(b.customerPrice) || null, customerName: b.customerName || '', customerPhone: b.customerPhone || '', address: b.address || '', notes: b.notes || '', assignedWorkerId: null, messages: [], createdAt: new Date().toISOString() };
    db.jobs.push(j); notifyWorkersForJob(j); fireGoogleAutomation('job_posted', jobWorkerAutomationPayload(j)); save(); return send(res, 201, { job: publicJob(j, user) });
  }
  if (p === '/api/jobs' && req.method === 'GET') {
    if (!requireRole(user, ['admin', 'worker', 'customer'], res)) return;
    if (user.role === 'customer') {
      const mine = db.jobs.filter(j => j.assignedWorkerId && j.customerPhone && user.phone && j.customerPhone.replace(/\D/g, '') === user.phone.replace(/\D/g, ''));
      return send(res, 200, { jobs: mine.map(j => ({ id: j.id, status: j.status, service: j.service, city: j.city, description: j.description, when: j.when, createdAt: j.createdAt, messages: j.messages || [] })) });
    }
    if (user.role === 'worker' && user.status !== 'active') return send(res, 403, { error: 'worker not active yet — the Team reviews and activates workers first' });
    if (user.role === 'worker') return send(res, 200, { jobs: db.jobs.filter(j => j.status === 'Open' || j.assignedWorkerId === user.id).map(j => publicJob(j, user)) });
    return send(res, 200, { jobs: db.jobs.map(j => publicJob(j, user)) });
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
    fireGoogleAutomation('job_claimed', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), customer: cust ? { name: cust.name, email: cust.email } : null, worker: { name: user.name, email: user.email }, job: { id: j.id, status: j.status, service: j.service || '', city: j.city || '', when: j.when || '', payOffer: j.payOffer || 0 } });
    save(); return send(res, 200, { job: publicJob(j, user) });
  }
  const jobMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
  if (jobMatch && req.method === 'PATCH') {
    const j = db.jobs.find(x => x.id === jobMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    const b = await readBody(req);
    if (user && user.role === 'admin' && b.status) { j.status = b.status; if (b.workerPaid !== undefined) j.workerPaid = !!b.workerPaid; if (j.assignedWorkerId) notify(j.assignedWorkerId, 'job', 'Update on your job ' + j.id + ' (' + (j.service || '') + '): status is now "' + j.status + '".'); }
    else if (user && user.role === 'worker' && j.assignedWorkerId === user.id && b.photosDone) { j.photosReceived = true; j.status = 'Done — photos sent'; notifyAdmins('job', user.name + ' finished job ' + j.id + ' and marked photos sent.'); }
    else return send(res, 403, { error: 'not allowed' });
    save(); return send(res, 200, { job: publicJob(j, user) });
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

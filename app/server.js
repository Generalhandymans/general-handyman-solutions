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

let db = { users: [], requests: [], jobs: [] };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
const sessions = new Map(); // token -> userId

function id(p) { return p + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function hashPw(pw) { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); }
function checkPw(pw, stored) { const [s, h] = stored.split(':'); const t = crypto.scryptSync(pw, s, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(t)); }
function pubUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || '', status: u.status || 'active', skills: u.skills || [], vehicle: u.vehicle || '', createdAt: u.createdAt }; }
function send(res, code, obj, headers) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json' }, headers || {}));
  res.end(body);
}
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }
function auth(req) {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ghs_session='));
  if (!cookie) return null;
  const uid = sessions.get(cookie.slice('ghs_session='.length));
  return db.users.find(u => u.id === uid) || null;
}
function requireRole(user, roles, res) { if (!user) { send(res, 401, { error: 'login required' }); return false; } if (!roles.includes(user.role)) { send(res, 403, { error: 'not allowed' }); return false; } return true; }
function publicJob(j, viewer) {
  const assigned = viewer && (viewer.role === 'admin' || j.assignedWorkerId === viewer.id);
  const base = { id: j.id, status: j.status, service: j.service, city: j.city, description: j.description, when: j.when, payOffer: j.payOffer, createdAt: j.createdAt };
  if (viewer && viewer.role === 'admin') return Object.assign({}, j);
  if (assigned) return Object.assign(base, { customerName: j.customerName, customerPhone: j.customerPhone, address: j.address, notes: j.notes || '' });
  return base; // workers who have not claimed see NO customer details
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const user = auth(req);

  // ---------- static ----------
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
  }
  if (p === '/api/health') return send(res, 200, { ok: true, app: 'ghs-app' });

  // ---------- auth ----------
  if (p === '/setup' && req.method === 'GET') {
    if (db.users.some(u => u.role === 'admin')) return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px"><h2>Admin already set up</h2><p>The Team admin account already exists. <a href="/">Go to the app login</a>.</p></body>');
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up Team admin</title><body style="font-family:system-ui;padding:24px;max-width:520px;margin:0 auto"><h2>Set up the Team admin (one time)</h2><p>Create the General Handyman Solutions Team admin login. Use an email you control and a strong password only you know.</p><label>Display name</label><input id="n" style="width:100%;padding:10px;margin:4px 0 10px" value="General Handyman Solutions Team"><label>Email</label><input id="e" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="generalhandymans@gmail.com"><label>Password</label><input id="pw" type="password" style="width:100%;padding:10px;margin:4px 0 10px" placeholder="Choose a strong password"><button id="b" style="background:#e10600;color:#fff;border:0;border-radius:999px;padding:12px 20px;font-weight:700">Create admin</button><p id="m"></p><script>document.getElementById("b").onclick=async()=>{const r=await fetch("/api/setup-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("n").value,email:document.getElementById("e").value,password:document.getElementById("pw").value})});const d=await r.json();document.getElementById("m").textContent=r.ok?"Admin created. Go to the app and log in.":"Error: "+(d.error||"failed");if(r.ok)setTimeout(()=>location.href="/",1200);};</scr'+'ipt></body>');
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
    const role = b.role === 'worker' ? 'worker' : 'customer';
    const u = { id: id('USR'), name: b.name, email, phone: b.phone || '', role, status: role === 'worker' ? 'review' : 'active', skills: b.skills || [], vehicle: b.vehicle || '', pw: hashPw(b.password), createdAt: new Date().toISOString() };
    db.users.push(u); save(); return send(res, 201, { user: pubUser(u) });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const u = db.users.find(x => x.email === (b.email || '').toLowerCase());
    if (!u || !checkPw(b.password || '', u.pw)) return send(res, 401, { error: 'wrong email or password' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, u.id);
    return send(res, 200, { user: pubUser(u) }, { 'Set-Cookie': 'ghs_session=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000' });
  }
  if (p === '/api/logout' && req.method === 'POST') { return send(res, 200, { ok: true }, { 'Set-Cookie': 'ghs_session=; HttpOnly; Path=/; Max-Age=0' }); }
  if (p === '/api/me' && req.method === 'GET') { if (!user) return send(res, 401, { error: 'login required' }); return send(res, 200, { user: pubUser(user) }); }

  // ---------- customer requests ----------
  if (p === '/api/requests' && req.method === 'POST') {
    if (!requireRole(user, ['customer', 'admin'], res)) return;
    const b = await readBody(req);
    const photos = Array.isArray(b.photos) ? b.photos.filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 6) : [];
    const r = { id: id('GHS'), customerId: user.id, customerName: user.name, service: b.service || '', description: b.description || '', city: b.city || '', address: b.address || '', when: b.when || '', estimateType: b.estimateType || 'inperson', estimateDue: b.estimateType === 'photo' ? 0 : 75, status: 'New', quote: null, quoteNote: '', photos, messages: [{ from: 'customer', name: user.name, text: (b.description || 'Request sent.') + (photos.length ? ' [' + photos.length + ' photo(s) attached]' : ''), at: new Date().toISOString() }], createdAt: new Date().toISOString() };
    db.requests.push(r); save(); return send(res, 201, { request: r });
  }
  if (p === '/api/requests' && req.method === 'GET') {
    if (!requireRole(user, ['customer', 'worker', 'admin'], res)) return;
    const list = user.role === 'admin' ? db.requests : db.requests.filter(r => r.customerId === user.id);
    return send(res, 200, { requests: list });
  }
  const reqMatch = p.match(/^\/api\/requests\/([\w-]+)$/);
  if (reqMatch && req.method === 'PATCH') {
    const r = db.requests.find(x => x.id === reqMatch[1]);
    if (!r) return send(res, 404, { error: 'request not found' });
    const b = await readBody(req);
    if (user && user.role === 'admin') {
      if (typeof b.quote === 'number') {
        r.quote = b.quote; r.status = 'Quoted'; r.quoteNote = b.note || '';
        r.messages = r.messages || [];
        r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Quote: $' + b.quote + ' labor (you buy materials/parts).' + (b.note ? ' ' + b.note : ''), at: new Date().toISOString() });
      }
      if (b.status) r.status = b.status;
    } else if (user && user.role === 'customer' && r.customerId === user.id) {
      r.messages = r.messages || [];
      if (b.action === 'approve') { r.status = 'Approved'; r.messages.push({ from: 'customer', name: user.name, text: 'Approved the quote. Ready to schedule.', at: new Date().toISOString() }); }
      if (b.action === 'decline') { r.status = 'Declined'; r.messages.push({ from: 'customer', name: user.name, text: 'Declined the quote for now.', at: new Date().toISOString() }); }
    } else return send(res, 403, { error: 'not allowed' });
    save(); return send(res, 200, { request: r });
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
    if (['active', 'review', 'notfit'].includes(b.status)) w.status = b.status;
    save(); return send(res, 200, { worker: pubUser(w) });
  }

  // ---------- jobs / marketplace ----------
  if (p === '/api/jobs' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const j = { id: id('JOB'), status: 'Open', service: b.service || '', city: b.city || '', description: b.description || '', when: b.when || '', payOffer: Number(b.payOffer) || 0, customerPrice: Number(b.customerPrice) || null, customerName: b.customerName || '', customerPhone: b.customerPhone || '', address: b.address || '', notes: b.notes || '', assignedWorkerId: null, createdAt: new Date().toISOString() };
    db.jobs.push(j); save(); return send(res, 201, { job: publicJob(j, user) });
  }
  if (p === '/api/jobs' && req.method === 'GET') {
    if (!requireRole(user, ['admin', 'worker'], res)) return;
    if (user.role === 'worker' && user.status !== 'active') return send(res, 403, { error: 'worker not active yet — Gabriel must approve your account first' });
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
    save(); return send(res, 200, { job: publicJob(j, user) });
  }
  const jobMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
  if (jobMatch && req.method === 'PATCH') {
    const j = db.jobs.find(x => x.id === jobMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    const b = await readBody(req);
    if (user && user.role === 'admin' && b.status) { j.status = b.status; if (b.workerPaid !== undefined) j.workerPaid = !!b.workerPaid; }
    else if (user && user.role === 'worker' && j.assignedWorkerId === user.id && b.photosDone) { j.photosReceived = true; j.status = 'Done — photos sent'; }
    else return send(res, 403, { error: 'not allowed' });
    save(); return send(res, 200, { job: publicJob(j, user) });
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log('GHS app running on port ' + PORT));

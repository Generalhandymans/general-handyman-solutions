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

let db = { users: [], requests: [], jobs: [], notifications: [], invoices: [] };
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
    if (!Array.isArray(db.invoices)) db.invoices = [];
    if (!db.settings || typeof db.settings !== 'object') db.settings = {};
    console.log('Loaded state from Supabase (' + db.users.length + ' users, ' + db.requests.length + ' requests, ' + db.jobs.length + ' jobs)');
  } catch (e) { console.error('supabase load failed', e.message); }
}
const sessions = new Map(); // token -> userId

function id(p) { return p + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function hashPw(pw) { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); }
function checkPw(pw, stored) { const [s, h] = stored.split(':'); const t = crypto.scryptSync(pw, s, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(t)); }
function pubUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || '', status: u.status || 'active', skills: u.skills || [], vehicle: u.vehicle || '', profile: u.profile || {}, homeCareStatus: u.homeCareStatus || 'none', homeCareSince: u.homeCareSince || null, homeCareCancelAt: u.homeCareCancelAt || null, freeEstimateUsed: !!u.freeEstimateUsed, createdAt: u.createdAt }; }
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
  if (assigned) {
    // Gabriel is the only middleman (rule 2026-10-09): the worker NEVER sees
    // the customer's name or phone. Address unlocks only when the Team confirms
    // it (infoReleased). Contact runs through the Team in the job chat.
    const view = Object.assign(base, { mine: true, infoReleased: !!j.infoReleased, notes: j.notes || '', messages: j.messages || [] });
    if (j.infoReleased) view.address = j.address || '';
    return view;
  }
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
  if (type === 'job_posted') { const j = p.job || {}; const ws = (p.workers || []).filter(w => w.email); if (!ws.length) return { attempted: true, sent: false, reason: 'no matching worker emails' }; let sentCount = 0; for (const w of ws) { const r = await sendMail({ to: [w.email], subject: 'New job posted: ' + (j.service || 'Job') + (j.city ? ' - ' + j.city : '') + ' - Pays ' + usd(j.payOffer), html: eventEmail('New job in your area', ['Service: ' + (j.service || ''), 'City: ' + (j.city || ''), 'When: ' + (j.when || 'TBD'), 'This job pays you: ' + usd(j.payOffer), (j.description || ''), 'Open the app to claim it - first active worker to claim gets it.'], WORKER_FOOTER), text: 'New job pays ' + usd(j.payOffer) }); if (r.sent) sentCount++; } return { attempted: true, sent: sentCount > 0, via: 'resend', emailed: sentCount }; }
  if (type === 'job_claimed') { const j = p.job || {}; const to = owner.slice(); if (p.customer && p.customer.email) to.push(p.customer.email); return sendMail({ to: to, subject: 'Job claimed: ' + (j.service || '') + (j.city ? ' - ' + j.city : ''), html: eventEmail('A worker claimed the job', ['Job: ' + (j.service || '') + ' in ' + (j.city || ''), 'Worker: ' + ((p.worker || {}).name || ''), 'Status: ' + (j.status || 'Claimed'), 'Open the app for the job chat with the Team and your worker.']), text: 'Job claimed.' }); }
  if (type === 'quote_decision') { const rq = p.request || {}; return sendMail({ to: owner, subject: 'Customer ' + (p.decision || 'answered') + ' the quote on ' + rq.id, html: eventEmail('Quote ' + (p.decision || ''), ['Request ' + rq.id, 'Customer: ' + (rq.customerName || ''), 'Service: ' + (rq.service || '') + ' ' + (rq.city || ''), 'Quote: ' + usd(rq.quote || (rq.estimate && rq.estimate.total) || 0)], OWNER_FOOTER), text: 'Quote ' + (p.decision || '') }); }
  if (type === 'payment_received') { const rq = p.request || {}; const cust = (p.request && p.request.customerEmail) || ''; const out = []; if (cust) out.push(await sendMail({ to: [cust], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Payment received — your appointment is secured (' + rq.id + ')', html: eventEmail('Payment received', ['We received your payment of ' + usd(p.paidAmount || 0) + ' for request ' + rq.id + '.', 'Your appointment is secured. The Team will confirm your time with you here in the app.', 'Labor only — you buy materials/parts unless we agree otherwise.']), text: 'Payment received: ' + usd(p.paidAmount || 0) + ' on request ' + rq.id + '. Your appointment is secured. Labor only — you buy materials/parts.' })); out.push(await sendMail({ to: owner, subject: 'Payment received: ' + usd(p.paidAmount || 0) + ' on ' + rq.id, html: eventEmail('Payment received', ['Request ' + rq.id, 'Customer: ' + (rq.customerName || ''), 'Amount: ' + usd(p.paidAmount || 0)], OWNER_FOOTER), text: 'Payment ' + usd(p.paidAmount || 0) + ' on ' + rq.id })); return { attempted: true, sent: out.some(x => x.sent), via: 'resend' }; }
  if (type === 'homecare_welcome') { const usr = p.user || {}; if (!usr.email) return { attempted: true, sent: false, reason: 'customer has no email' }; return sendMail({ to: [usr.email], bcc: [OWNER_EMAIL], replyTo: OWNER_EMAIL, subject: 'Welcome to HomeCare — your first estimate is free', html: eventEmail('Welcome to HomeCare', ['Hi ' + (usr.name || 'there') + ', your HomeCare membership ($49/month) is now active.', 'Your first in-person estimate is FREE — request it from your dashboard whenever you are ready.', 'After that: member estimates are $60 (instead of $75), 20% off labor on jobs under $1,000, and priority scheduling.', 'You can cancel anytime from your dashboard — no penalties, no fine print.', 'Labor only — you buy materials/parts unless we agree otherwise.']), text: 'Welcome to HomeCare ($49/month). Your first in-person estimate is FREE. Cancel anytime. Labor only — you buy materials/parts.' }); }
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
// the secret key is set, a $49/mo HomeCare price is auto-created once via the API
// and its id is saved in db.settings so it is reused instead of duplicated).
// Estimate payments use dynamic price_data (exact "due to book" amount), so no
// per-amount price ids are needed. Everything degrades gracefully when keys are
// absent: /api/stripe/config reports configured:false and checkout endpoints
// return 400 "payments not connected" instead of crashing.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_API = 'https://api.stripe.com/v1';
const HOMECARE_MONTHLY_CENTS = 4900;
function stripeReady() { return !!STRIPE_SECRET_KEY; }
async function stripeApi(path, params) {
  const body = new URLSearchParams();
  Object.keys(params || {}).forEach(k => { if (params[k] !== undefined && params[k] !== null) body.append(k, String(params[k])); });
  const r = await fetch(STRIPE_API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(20000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe: ' + ((data && data.error && data.error.message) || ('HTTP ' + r.status)));
  return data;
}
async function homeCarePriceId() {
  if (process.env.STRIPE_PRICE_HOMECARE) return process.env.STRIPE_PRICE_HOMECARE;
  db.settings = db.settings || {};
  if (db.settings.stripeHomeCarePrice) return db.settings.stripeHomeCarePrice;
  console.log('stripe: creating HomeCare $49/mo product + price (set STRIPE_PRICE_HOMECARE to skip this)');
  const product = await stripeApi('/products', { name: 'HomeCare Membership — General Handyman Solutions', description: 'Monthly HomeCare membership: one free estimate in month one, $60 member estimates after, 20% off labor under $1,000, priority scheduling.' });
  const price = await stripeApi('/prices', { product: product.id, unit_amount: HOMECARE_MONTHLY_CENTS, currency: 'usd', 'recurring[interval]': 'month' });
  db.settings.stripeHomeCarePrice = price.id;
  console.log('stripe: HomeCare price created: ' + price.id + ' — save it as STRIPE_PRICE_HOMECARE in Render env');
  save();
  return price.id;
}
function appBase() { return APP_URL.replace(/\/$/, ''); }
async function createCheckoutSession(kind, user, opts) {
  opts = opts || {};
  // Optional tip (added 2026-10-19): applies to every one-time charge on the
  // page EXCEPT the HomeCare membership. Added as a second line item.
  const tipCents = kind === 'homecare' ? 0 : Math.max(0, Math.round(Number(opts.tipCents) || 0));
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
  } else if (kind === 'estimate' || kind === 'member-estimate') {
    // 'member-estimate' is a fixed $60 one-time payment for active members;
    // the session is a normal one-time payment, the kind is kept in metadata.
    params.mode = 'payment';
    params['line_items[0][price_data][currency]'] = 'usd';
    params['line_items[0][price_data][unit_amount]'] = String(opts.amountCents);
    params['line_items[0][price_data][product_data][name]'] = opts.label || 'In-person estimate — General Handyman Solutions';
    params['line_items[0][quantity]'] = '1';
    params['metadata[requestId]'] = opts.requestId || '';
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
function verifyStripeSig(payload, header) {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const m = /t=(\d+).*v1=([a-f0-9]+)/.exec(header || '');
  if (!m) return false;
  if (Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false; // stale signature
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(m[1] + '.' + payload, 'utf8').digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(m[2], 'hex')); } catch (e) { return false; }
}
async function handleStripeEvent(event) {
  const type = event && event.type;
  const obj = event && event.data && event.data.object;
  if (!obj) return;
  if (type === 'checkout.session.completed') {
    const kind = obj.metadata && obj.metadata.kind;
    const u = db.users.find(x => x.id === (obj.metadata && obj.metadata.userId));
    if (!u) { console.error('stripe webhook: no user for session ' + obj.id); return; }
    if (kind === 'homecare') {
      u.homeCareStatus = 'active';
      u.homeCareSince = new Date().toISOString();
      u.homeCareCancelAt = null;
      u.freeEstimateUsed = false; // fresh membership gets its free first estimate
      u.stripeCustomerId = obj.customer || u.stripeCustomerId || '';
      u.stripeSubscriptionId = obj.subscription || u.stripeSubscriptionId || '';
      notify(u.id, 'membership', 'Welcome to HomeCare! Your membership is active. Your first in-person estimate is FREE — request it from your dashboard.');
      notifyAdmins('membership', u.name + ' (' + u.email + ') joined HomeCare ($49/mo).');
      fireAutomation('homecare_welcome', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
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
  } else if (type === 'customer.subscription.deleted') {
    const u = db.users.find(x => x.stripeSubscriptionId === obj.id);
    if (u) {
      u.homeCareStatus = 'cancelled';
      u.homeCareCancelAt = new Date().toISOString();
      notify(u.id, 'membership', 'Your HomeCare membership has been cancelled. You can rejoin anytime from your dashboard.');
      notifyAdmins('membership', u.name + ' (' + u.email + ') cancelled HomeCare.');
      fireAutomation('homecare_cancelled', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
    }
  } else if (type === 'customer.subscription.updated') {
    const u = db.users.find(x => x.stripeSubscriptionId === obj.id);
    if (u && obj.cancel_at_period_end) {
      u.homeCareCancelAt = new Date(Number(obj.cancel_at) * 1000).toISOString();
      notify(u.id, 'membership', 'HomeCare cancellation noted — your membership stays active until ' + new Date(Number(obj.cancel_at) * 1000).toLocaleDateString('en-US') + '.');
    }
  } else if (type === 'invoice.payment_failed') {
    // Stripe is the single source of truth: a failed subscription payment means
    // the customer loses member status until payment succeeds again.
    const u = db.users.find(x => x.stripeCustomerId === obj.customer);
    if (u && u.homeCareStatus === 'active') {
      u.homeCareStatus = 'cancelled';
      u.homeCareCancelAt = new Date().toISOString();
      notify(u.id, 'payment', 'Your HomeCare payment failed, so your membership was paused. Update your card and rejoin from your dashboard to get your member benefits back.');
      notifyAdmins('payment', 'HomeCare payment FAILED for ' + u.name + ' (' + u.email + ') — membership paused.');
      fireAutomation('homecare_cancelled', { user: { name: u.name, email: u.email }, appUrl: APP_URL });
    }
  } else if (type === 'invoice.payment_succeeded') {
    // Payment recovered (e.g. after a retry or a rejoin): restore member status.
    const subId = obj.subscription;
    const u = db.users.find(x => x.stripeSubscriptionId === subId || x.stripeCustomerId === obj.customer);
    if (u && u.homeCareStatus !== 'active') {
      u.homeCareStatus = 'active';
      if (!u.homeCareSince) u.homeCareSince = new Date().toISOString();
      u.homeCareCancelAt = null;
      if (subId) u.stripeSubscriptionId = subId;
      notify(u.id, 'membership', 'Your HomeCare payment went through — your membership is active again with all member benefits.');
      notifyAdmins('membership', u.name + ' (' + u.email + ') HomeCare payment succeeded — membership active.');
    }
  }
}
function money(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function clampMoney(v) { return Math.max(0, money(v)); }
function cleanText(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 500); }
function cleanDate(v) { const s = String(v == null ? '' : v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
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
    + '<button id="payBtn" style="background:#e10600;color:#fff;border:0;border-radius:999px;padding:14px 28px;font-weight:700;font-size:16px;cursor:pointer;width:100%">Pay ' + usd(pub.total) + ' now</button><p id="payMsg" style="color:#666"></p>'
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
        ? '<p>Your invoice <b>' + escMail(inv.id) + '</b> (' + usd(inv.total) + ') is ready.' + (inv.status === 'paid' ? ' It is paid in full — thank you!' : '') + '</p><p><a href="/invoice/' + escMail(inv.id) + '" style="background:#e10600;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">' + (inv.status === 'paid' ? 'View invoice' : 'Pay ' + usd(inv.total) + ' now') + '</a></p>'
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
    // Worker self-ratings 1-10 per skill: the worker's own self-assessment at signup. Visible to the worker and the Team (unlike the Team's private 1-5 ranks).
    if (prof.selfRatings && typeof prof.selfRatings === 'object' && !Array.isArray(prof.selfRatings)) {
      const cleanSR = {};
      for (const k of Object.keys(prof.selfRatings).slice(0, 40)) {
        const n = parseInt(prof.selfRatings[k], 10);
        if (k && n >= 1 && n <= 10) cleanSR[String(k).slice(0, 60)] = n;
      }
      prof.selfRatings = cleanSR;
    } else { delete prof.selfRatings; }
    const u = { id: id('USR'), name: b.name, email, phone: b.phone || '', role, status: role === 'worker' ? 'review' : 'active', skills: Array.isArray(prof.skills) ? prof.skills : (b.skills || []), vehicle: prof.vehicleStyle || b.vehicle || '', profile: prof, pw: hashPw(b.password), createdAt: new Date().toISOString() };
    db.users.push(u); if (role === 'worker') { notifyAdmins('worker', 'New worker application: ' + u.name + (prof.city ? ' (' + prof.city + ')' : '') + ' — review in Workers.'); fireAutomation('new_worker', { appUrl: APP_URL, businessEmail: BUSINESS_EMAIL, adminEmails: adminEmails(), worker: { name: u.name, email: u.email, phone: u.phone || '', status: u.status, profile: u.profile || {} } }); } save(); return send(res, 201, { user: pubUser(u), token: newSession(u) });
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
  // Public: no account required. Anonymous requests store name/email/phone on
  // the request itself; logged-in customers keep member pricing + dashboard.
  if (p === '/api/requests' && req.method === 'POST') {
    const b = await readBody(req);
    const photos = Array.isArray(b.photos) ? b.photos.filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 6) : [];
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
    // what the customer picked in the form: active members get $60 (or $0 for
    // their one free estimate, applied below), everyone else pays $75.
    const hcActive = !!user && user.role === 'customer' && user.homeCareStatus === 'active';
    const r = { id: id('GHS'), customerId, customerName: name, customerEmail: email, customerPhone: user ? (user.phone || formPhone) : formPhone, service: b.service || '', description: b.description || '', city: b.city || '', address: b.address || '', when: b.when || '', estimateType: b.estimateType || 'inperson', membership: hcActive ? 'member' : 'none', estimateDue: b.estimateType === 'photo' ? 0 : (hcActive ? 60 : 75), status: 'New', quote: null, quoteNote: '', estimate: null, photos, messages: [{ from: 'customer', name, text: (b.description || 'Request sent.') + (photos.length ? ' [' + photos.length + ' photo(s) attached]' : ''), at: new Date().toISOString() }], createdAt: new Date().toISOString() };
    // HomeCare free estimate (one per membership): first in-person request from an
    // active member with the freebie unused consumes it automatically.
    if (user && user.role === 'customer' && user.homeCareStatus === 'active' && !user.freeEstimateUsed && r.estimateType === 'inperson') {
      user.freeEstimateUsed = true;
      r.membership = 'member';
      r.estimateDue = 0;
      r.freeEstimateClaim = true;
      r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'Your FREE HomeCare estimate was applied to this request. No estimate charge — just approve the work when the quote arrives.', at: new Date().toISOString() });
      notify(user.id, 'membership', 'Your free HomeCare estimate was applied to request ' + r.id + '.');
    }
    db.requests.push(r); notifyAdmins('request', 'New request ' + r.id + ': ' + (r.service || 'Service') + ' in ' + (r.city || '') + ' from ' + r.customerName + '.'); save(); fireAutomation('new_request', requestAutomationPayload(r)); return send(res, 201, { request: r });
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
      if (b.action === 'decline') { r.status = 'Declined'; r.messages.push({ from: 'customer', name: user.name, text: 'Declined the quote for now.', at: new Date().toISOString() }); notifyAdmins('quote', user.name + ' declined the quote on ' + r.id + '.'); fireAutomation('quote_decision', Object.assign(requestAutomationPayload(r), { decision: 'declined' })); }
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
    const j = { id: id('JOB'), status: 'Open', requestId: r.id, service: b.service || r.service || '', city: b.city || r.city || '', description: b.description || r.description || '', when: b.when || r.when || '', payOffer, customerPrice: Number(b.customerPrice) || r.quote || null, customerName: r.customerName || (cust ? cust.name : ''), customerPhone: cust ? (cust.phone || '') : '', address: r.address || '', notes: b.notes || '', assignedWorkerId: null, infoReleased: false, messages: [], createdAt: new Date().toISOString() };
    db.jobs.push(j);
    r.status = 'Job posted'; r.jobId = j.id;
    r.messages = r.messages || [];
    r.messages.push({ from: 'team', name: 'General Handyman Solutions Team', text: 'We posted your job to our team (job ' + j.id + '). A worker can now claim it — we will coordinate the details with you here.', at: new Date().toISOString() });
    notify(r.customerId, 'job', 'Your job was posted to our team (job ' + j.id + '). We\'ll update you here when a worker claims it.');
    notifyWorkersForJob(j);
    fireAutomation('job_posted', jobWorkerAutomationPayload(j));
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
      notifyAdmins('invoice', 'Invoice ' + inv.id + ' sent to ' + inv.customerEmail + ' (' + usd(inv.total) + ').');
      save();
      const automation = await sendAutomation('invoice_sent', { invoice: publicInvoice(inv) });
      return send(res, 200, { invoice: publicInvoice(inv), automation });
    }
    if (action === 'cancel') {
      if (!['draft', 'sent'].includes(inv.status)) return send(res, 400, { error: 'only draft or sent invoices can be cancelled' });
      inv.status = 'cancelled';
      notifyAdmins('invoice', 'Invoice ' + inv.id + ' cancelled.');
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
    save(); return send(res, 200, { ok: true, deleted: removed.id });
  }
  if (p === '/api/jobs' && req.method === 'POST') {
    if (!requireRole(user, ['admin'], res)) return;
    const b = await readBody(req);
    const j = { id: id('JOB'), status: 'Open', service: b.service || '', city: b.city || '', description: b.description || '', when: b.when || '', schedDate: cleanDate(b.schedDate), schedTime: cleanText(b.schedTime, 50), payOffer: Number(b.payOffer) || 0, customerPrice: Number(b.customerPrice) || null, customerName: b.customerName || '', customerPhone: b.customerPhone || '', address: b.address || '', notes: b.notes || '', assignedWorkerId: null, messages: [], createdAt: new Date().toISOString() };
    db.jobs.push(j); notifyWorkersForJob(j); fireAutomation('job_posted', jobWorkerAutomationPayload(j)); save(); return send(res, 201, { job: publicJob(j, user) });
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
    events.sort((a, b) => String(a.date + ' ' + a.time).localeCompare(String(b.date + ' ' + b.time)));
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
    save(); return send(res, 200, { job: publicJob(j, user) });
  }
  const jobMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
  if (jobMatch && req.method === 'PATCH') {
    const j = db.jobs.find(x => x.id === jobMatch[1]);
    if (!j) return send(res, 404, { error: 'job not found' });
    const b = await readBody(req);
    if (user && user.role === 'admin') {
      if (b.status) { j.status = b.status; if (b.workerPaid !== undefined) j.workerPaid = !!b.workerPaid; if (j.assignedWorkerId) notify(j.assignedWorkerId, 'job', 'Update on your job ' + j.id + ' (' + (j.service || '') + '): status is now "' + j.status + '".'); }
      if (b.address !== undefined) j.address = cleanText(b.address, 300);
      if (b.when !== undefined) j.when = cleanText(b.when, 200);
      if (b.schedDate !== undefined) j.schedDate = cleanDate(b.schedDate);
      if (b.schedTime !== undefined) j.schedTime = cleanText(b.schedTime, 50);
      if (b.notes !== undefined) j.notes = cleanText(b.notes, 1000);
      if (b.infoReleased !== undefined) { const was = !!j.infoReleased; j.infoReleased = !!b.infoReleased; if (j.infoReleased && !was && j.assignedWorkerId) notify(j.assignedWorkerId, 'job', 'The Team confirmed job ' + j.id + ' - your address and time are now unlocked in the app. Check your jobs.'); }
    }
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

  // ---------- Stripe payments ----------
  if (p === '/api/stripe/config' && req.method === 'GET') {
    return send(res, 200, { configured: stripeReady(), homeCareMonthly: HOMECARE_MONTHLY_CENTS / 100 });
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
    if (!user) return send(res, 401, { error: 'login required' });
    if (!stripeReady()) return send(res, 400, { error: 'payments are not connected yet — the Team will confirm your booking for now' });
    const b = await readBody(req);
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
        // $60 member estimate: only for ACTIVE HomeCare members, and only when the
        // amount due really is the $60 member rate — otherwise use the normal pay button.
        let amountCents, kind = 'estimate', label = 'In-person estimate payment — request ' + r.id + ' — General Handyman Solutions';
        if (b.kind === 'member-estimate') {
          if (user.homeCareStatus !== 'active') return send(res, 403, { error: 'the $60 member estimate is only for active HomeCare members' });
          if (Math.abs(r.estimate.bookingDue - 60) > 0.01) return send(res, 400, { error: 'use the normal pay button for this amount' });
          amountCents = 6000; kind = 'member-estimate'; label = 'HomeCare member estimate — $60 — request ' + r.id;
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
      return send(res, 400, { error: 'unknown checkout kind' });
    } catch (e) { console.error('stripe checkout failed', e.message); return send(res, 502, { error: 'payment service error — try again in a minute' }); }
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
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment received</title><body style="font-family:system-ui;max-width:560px;margin:0 auto;padding:32px 20px;text-align:center"><h1 style="color:#0b0b0b">Payment <span style="color:#e10600">received</span> ✅</h1><p>Thank you — your payment went through. If you joined <b>HomeCare</b>, your first in-person estimate is <b>FREE</b>: log in and request it from your dashboard. If you paid an estimate, your appointment is <b>secured</b> — the Team will confirm your time with you.</p><p><a href="/" style="background:#e10600;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Open my dashboard</a></p><p style="color:#666;font-size:13px">Questions? Text or call (707) 862-3773.</p></body>');
  }
  if (p === '/payment/cancelled' && req.method === 'GET') {
    return send(res, 200, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment cancelled</title><body style="font-family:system-ui;max-width:560px;margin:0 auto;padding:32px 20px;text-align:center"><h1>Payment <span style="color:#e10600">cancelled</span></h1><p>No charge was made. You can come back and try again anytime — your request is still saved in the app.</p><p><a href="/" style="background:#0b0b0b;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700">Back to the app</a></p><p style="color:#666;font-size:13px">Questions? Text or call (707) 862-3773.</p></body>');
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
      return { id: u.id, name: u.name, email: u.email, phone: u.phone || '', homeCareStatus: u.homeCareStatus || 'none', homeCareSince: u.homeCareSince || null, homeCareCancelAt: u.homeCareCancelAt || null, freeEstimateUsed: !!u.freeEstimateUsed, requests: reqs, createdAt: u.createdAt };
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

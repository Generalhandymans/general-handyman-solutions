// GHS app test harness — REBUILT 2026-10-21 for v23, extended for v24–v27 (durable copy: ~/workspace/ghs-app/tests/run.mjs).
// NOTE: the original 743-test harness lived in /tmp and was lost when the
// VM restarted (tmpfs wipe) before the v23 session began. This rebuild
// covers (a) every v23 behavior (SSE push, wake lock, throttle, resume),
// and (b) a regression pass over every code path v23 touches (auth,
// requests, jobs, claim/status flow, live location, payload privacy).
// Run: node /tmp/ghs-v17-test/run.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

const APP_DIR = '/home/hatch/workspace/ghs-app/app';
const APP_PORT = 8977;
const GEO_PORT = 8978;
const BASE = 'http://127.0.0.1:' + APP_PORT;
const DATA_FILE = '/tmp/ghs-v17-test/data-v23.json';

let pass = 0, fail = 0; const failures = [];
function t(name, cond) { if (cond) pass++; else { fail++; failures.push(name); console.log('FAIL: ' + name); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
process.on('unhandledRejection', (e) => { console.log('unhandledRejection (ignored):', e && e.message); });

// ---------------- static checks ----------------
const serverSrc = fs.readFileSync(path.join(APP_DIR, 'server.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(APP_DIR, 'public', 'index.html'), 'utf8');
const swSrc = fs.readFileSync(path.join(APP_DIR, 'public', 'sw.js'), 'utf8');
try { new vm.Script(serverSrc); t('static: server.js parses', true); } catch (e) { t('static: server.js parses (' + e.message + ')', false); }
const scriptBlocks = [...htmlSrc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let allParse = true;
for (const b of scriptBlocks) { try { new vm.Script(b); } catch (e) { allParse = false; console.log('script parse error:', e.message); } }
t('static: all index.html script blocks parse', allParse && scriptBlocks.length >= 2);
t('static: SW cache is ghs-app-v80-7', swSrc.includes("const CACHE = 'ghs-app-v80-7'"));
t('static v68: NO service remains at $185 in either catalog — the whole tier is $175 / member $140 (Gabriel 2026-10-25)',
  !htmlSrc.includes('price: 185') && !serverSrc.includes('{p:185') &&
  htmlSrc.includes("'deck-board-replacement': { name: 'Deck Board Replacement (Up to 5)', meta: '~2 h · Flat', price: 175, member: 140") &&
  htmlSrc.includes("'tv-mounting-large'") && htmlSrc.includes('price: 175, member: 140, addons: [{ id: \'raceway\'') &&
  serverSrc.includes('"tv-mounting-large":{p:175,m:140') && serverSrc.includes('"mailbox-install":{p:175,m:140') && serverSrc.includes('"exhaust-fan-swap":{p:175,m:140'));
t('static v67: drain unclog + alternator are $175 / member $140 in BOTH catalogs (Gabriel 2026-10-25)',
  htmlSrc.includes("'drain-unclog': { name: 'Drain Unclog — Basic', meta: 'One drain · Machine clean', price: 175, member: 140") &&
  htmlSrc.includes("'alternator-replacement': { name: 'Alternator Replacement', meta: '~2 h · Standard access', price: 175, member: 140") &&
  serverSrc.includes('"drain-unclog":{p:175,m:140') && serverSrc.includes('"alternator-replacement":{p:175,m:140'));
t('static v32: app has the green WhatsApp photo-estimate FAB on customer views', htmlSrc.includes('id="photoFab"') && htmlSrc.includes('wa.me/17078623773') && htmlSrc.includes('📸 Free estimate'));
t('static v32: checkout 20% gate is HomeCare/Plus only (homeCareStatus), never any-plan', htmlSrc.includes('function cartIsMember()') && htmlSrc.includes("me.homeCareStatus === 'active'") && !htmlSrc.includes("(d.plan && d.plan.status === 'active') || me.homeCareStatus"));
t('static v33: server sets CSP + anti-clickjacking headers tuned for Stripe/Leaflet', serverSrc.includes('Content-Security-Policy') && serverSrc.includes("'X-Frame-Options', 'DENY'") && serverSrc.includes('js.stripe.com'));
t('static v33: login throttle + expiring sessions + admin audit log present', serverSrc.includes('loginBlockedSecs') && serverSrc.includes('SESSION_TTL_MS') && serverSrc.includes("p === '/api/admin/audit'") && serverSrc.includes('function audit('));
t('static v33: admin UI has the security & activity log', htmlSrc.includes('id="adminAudit"') && htmlSrc.includes('loadAdminAudit'));
t('static v33: request bodies are size-capped', serverSrc.includes('MAX_BODY_BYTES') && serverSrc.includes('413'));
t('static: server has GET /api/events SSE endpoint', serverSrc.includes("p === '/api/events'") && serverSrc.includes('text/event-stream'));
t('static: server emit helpers exist', ['emitJobLocation(', 'emitJobStatus(', 'emitJobNew(', 'emitRequestNew('].every(s => serverSrc.includes(s)));
t('static: client uses EventSource on /api/events', htmlSrc.includes("new EventSource('/api/events')"));
t('static: client has wake lock guarded code', htmlSrc.includes('navigator.wakeLock') && htmlSrc.includes('acquireTrackWakeLock'));
t('static: client has trackShouldPost throttle', htmlSrc.includes('function trackShouldPost('));
t('static: client has visibilitychange resume', htmlSrc.includes('visibilitychange') && htmlSrc.includes('function resumeSharing('));
t('static: banner copy says sharing runs while app is open + screen awake', htmlSrc.includes('sharing runs while the app is open; we keep your screen awake during the trip'));
t('static: poll gated on stream disconnected', htmlSrc.includes('!esConnected && !livePollTimer'));
// ---- v24 statics ----
t('static v24: server sanitizes + stashes campaign source', serverSrc.includes('function sanitizeSource(') && serverSrc.includes('function stashPendingSource('));
t('static v24: source promoted at activation in both activators + checkout webhook branch', (serverSrc.match(/applySourceAtActivation\(u\)/g) || []).length >= 3);
t('static v24: admin customers API exposes source', serverSrc.includes('source: u.source || null'));
t('static v24: subscribe endpoints stash the source', serverSrc.includes('stashPendingSource(user, b.source)') && serverSrc.includes('stashPendingSource(user, b && b.source)'));
t('static v24: receipt email wired at capture with claim flag', serverSrc.includes('captureReceiptSentAt') && serverSrc.includes("subject: 'Your receipt — General Handyman Solutions'"));
t('static v24: silent jobs gate the broadcast fan-out', serverSrc.includes('const silent = !!(b.silent && assignedWorkerId)') && serverSrc.includes('emitJobNew(j, assignedWorkerId)'));
t('static v24: contact pill markup with Team tel/sms hrefs', htmlSrc.includes('id="teamContactPill"') && htmlSrc.includes('href="tel:+17078623773"') && htmlSrc.includes('href="sms:+17078623773"'));
t('static v24: render paints the contact pill', htmlSrc.includes('function render(){\n  updateContactPill();'));
t('static v24: src captured into sessionStorage ghsSrc', htmlSrc.includes("sessionStorage.setItem('ghsSrc'") && htmlSrc.includes('function captureCampaignSource('));
t('static v24: join calls carry the campaign source', (htmlSrc.match(/source: campaignSource\(\)/g) || []).length >= 3);
t('static v24: per-variant plan image map + img ids', htmlSrc.includes('PLAN_CARD_IMGS') && htmlSrc.includes('id="yardPlanImg"') && htmlSrc.includes('id="plusPlanImg"') && htmlSrc.includes('$150 per month · 2 visits') && htmlSrc.includes('$175 per month · 2 yard visits'));
t('static v24: yard view = 4 designed cards, one per plan', htmlSrc.includes('id="yardCardsGrid"') && ['yard1','yard2','plus1','plus2'].every(k => htmlSrc.includes('data-plan="' + k + '"')));
t('static v24: no bare signup-link list remains in the yard view', !htmlSrc.includes('Direct signup links — copy the plan you want to send') && !htmlSrc.includes('share-links-grid'));
t('static v24: each yard card CTA arms its own plan', ["startMembershipCheckout('yardcare','yard1')", "startMembershipCheckout('yardcare','yard2')", "startMembershipCheckout('homecare-plus','plus1')", "startMembershipCheckout('homecare-plus','plus2')"].every(x => htmlSrc.includes(x)));
t('static v24: each yard card has image + price + benefits markup', ['ycImg-yard1','ycImg-yard2','ycImg-plus1','ycImg-plus2'].every(x => htmlSrc.includes('id="' + x + '"')) && htmlSrc.includes('Free first in-person estimate'));
t('static v80.6 (S-1, replaces the v24 form pins): the calendar add-job form + its 4 helpers are REMOVED (dup ids cService/cCity broke its submit; Create a job is canonical)', !htmlSrc.includes('id="cWorker"') && !htmlSrc.includes('id="cSilent"') && !htmlSrc.includes('function calAddJob(') && !htmlSrc.includes('function calWorkerOptions(') && !htmlSrc.includes('function calEnsureWorkers(') && !htmlSrc.includes('function calWorkerChanged(') && !htmlSrc.includes('onclick="calAddJob()"'));
t('static v80.6 (S-2): the dead sendQuote wrapper (zero callers) is REMOVED', !htmlSrc.includes('sendQuote'));
t('static v24: admin member info shows the source (vía / orgánico)', htmlSrc.includes("'vía '") && htmlSrc.includes('orgánico'));

// ---- v42 statics: Solicitud Profesional wizard + in-app menu ----
t('static v42: wizard markup present (card, 4 steps, progress bar, done panel)', htmlSrc.includes('id="wizardCard"') && htmlSrc.includes('id="wzStep1"') && htmlSrc.includes('id="wzStep2"') && htmlSrc.includes('id="wzStep3"') && htmlSrc.includes('id="wzStep4"') && htmlSrc.includes('id="wzBarFill"') && htmlSrc.includes('id="wzDone"') && htmlSrc.includes('Paso 1 de 4'));
t('static v42: in-app menu section + persistent Menú nav entry present', htmlSrc.includes('id="menuBox"') && htmlSrc.includes('id="menuGroups"') && htmlSrc.includes('id="menuNavLink"') && htmlSrc.includes('onclick="goMenu();return false;"'));
const custBlock42 = htmlSrc.slice(htmlSrc.indexOf('id="customerBox"'), htmlSrc.indexOf('id="workerBox"'));
t('static v42: wizard reuses the legacy request fields (exactly one of each in the customer section)', ['cService', 'rDesc', 'rPhotos', 'cEst', 'cCity', 'rAddr', 'cWhen', 'rDate', 'anonContact', 'rName', 'rEmail', 'rPhone', 'cMember', 'cAck', 'cSendBtn'].every(id => (custBlock42.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1));
t('static v42: access notes ride inside the description + confirmation shows the request id', htmlSrc.includes('Access notes: ') && htmlSrc.includes('wzShowDone(rd.request)') && htmlSrc.includes('What happens next'));
t('static v42: wizard step 3 has the Nominatim address autocomplete (CSP already allows it)', htmlSrc.includes('nominatim.openstreetmap.org/search') && htmlSrc.includes('id="wzAddrSugg"'));
t('static v42: category cards carry the 5 trades + Otro with created images', ['data-cat="carpentry"', 'data-cat="electrical"', 'data-cat="plumbing"', 'data-cat="gardening"', 'data-cat="mechanic"', 'data-cat="otro"'].every(x => htmlSrc.includes(x)) && htmlSrc.includes('const CAT_IMGS = {') && htmlSrc.includes('data:image/jpeg;base64,'));
const catBlock = htmlSrc.slice(htmlSrc.indexOf('const MENU_CATALOG = {'), htmlSrc.indexOf('/* ================= v79: LEGACY'));
const catalogIds42 = [...catBlock.matchAll(/'([a-z0-9-]+)': \{ name:/g)].map(m => m[1]);
const grpBlock = htmlSrc.slice(htmlSrc.indexOf('const MENU_GROUPS = ['), htmlSrc.indexOf('const wzState'));
const groupIds42 = [...grpBlock.matchAll(/services: \[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1]));
t('static v42: MENU_GROUPS covers the whole catalog exactly once (98 services, no dupes, no extras)', catalogIds42.length === 98 && groupIds42.length === 98 && new Set(groupIds42).size === 98 && catalogIds42.every(id => groupIds42.includes(id)));
const wzBlock = htmlSrc.slice(htmlSrc.indexOf('id="wizardCard"'), htmlSrc.indexOf('id="menuBox"'));
t('static v42: wizard customer copy says technician, never worker', !/worker/i.test(wzBlock) && htmlSrc.includes('we schedule your technician'));
t('static v42: stale "50% deposit" copy is gone from the request flow', !htmlSrc.includes('50% deposit locks approved work'));

// ---- v44 statics: pay in full + admin cart ----
t('static v44: pay endpoints + cart endpoints exist; the menu hold endpoints are gone', serverSrc.includes("p === '/api/orders/pay'") && serverSrc.includes("p === '/api/orders/pay-confirm'") && serverSrc.includes("p === '/api/admin/carts'") && serverSrc.includes("/pay-confirm'") && !serverSrc.includes("p === '/api/orders/hold'") && !serverSrc.includes("p === '/api/orders/hold-confirm'"));
t('static v62→v79: bookingDue AUTO defaults to the DEPOSIT LAW via the ONE shared depositSplit helper ($50 flat <= $300, 40% above)', serverSrc.includes("bookingAuto: raw.bookingDue == null || raw.bookingDue === ''") && serverSrc.includes('est.bookingAuto ? money(depositSplit(Math.round(est.total * 100)).depositCents / 100)') && serverSrc.includes('const DEPOSIT_RATE = 0.4') && serverSrc.includes('const DEPOSIT_FLAT_CENTS = 5000'));
t('static v44: payout gate speaks paid — awaiting_payment stamped, legacy awaiting_capture still swept', serverSrc.includes("j.payoutStatus = 'awaiting_payment'") && serverSrc.includes("'awaiting_capture', 'awaiting_payment'") && serverSrc.includes('function requestIsPaid('));
t('static v44: refund rule is server-side — $75 kept only when dispatched', serverSrc.includes('keptCents = dispatched ? Math.min(7500, paidCents) : 0') && serverSrc.includes("/refund$/"));
t('static v44: cart page + conversion helpers exist server-side', serverSrc.includes('function cartPageHtml(') && serverSrc.includes('function convertCartToRequest(') && serverSrc.includes("p.match(/^\\/cart\\/"));
t('static v49: install page + routes exist', serverSrc.includes('function installPageHtml(') && serverSrc.includes("p === '/instalar'") && serverSrc.includes('beforeinstallprompt'));
t('static v44 i18n: cart page is one-language-at-a-time (EN|ES toggle, both dictionaries, persisted choice)', serverSrc.includes('data-lang-btn') && serverSrc.includes('ghsCartLang') && serverSrc.includes("titleCart: 'Tu carrito'") && serverSrc.includes("titleCart: 'Your cart'"));
t('static v44→v79: app checkout copy is the DEPOSIT law (the $75 hold pitch is gone)', htmlSrc.includes('Deposit due today') && htmlSrc.includes('Balance at completion') && !htmlSrc.includes('$75 authorization hold') && !htmlSrc.includes('Total — pay when the job is done') && !htmlSrc.includes('/api/orders/hold'));
t('static v44: admin cart builder lives in the panel', htmlSrc.includes('id="adminCarts"') && htmlSrc.includes('id="cartPicker"') && htmlSrc.includes('function createCartLink()') && htmlSrc.includes('function refundRequest('));
t('static v52: cart custom lines — strict server validation, builder custom/materials/labor-$75 actions, promo totals block', serverSrc.includes('it.custom === true') && serverSrc.includes("kind === 'labor' ? money(unitPrice * 0.8) : unitPrice") && htmlSrc.includes('id="cartCustomName"') && htmlSrc.includes('function cartAddCustomLine(') && htmlSrc.includes('function cartAddLabor75(') && serverSrc.includes('memberSavingsLabel') && serverSrc.includes('ctSaveRow'));
t('static v54: public cart + estimate pages carry NO Stripe.js / Elements / card element (hosted Checkout only)', (() => { const cartFn = serverSrc.slice(serverSrc.indexOf('function cartPageHtml('), serverSrc.indexOf('function invoiceFromEstimate(')); const estFn = serverSrc.slice(serverSrc.indexOf('function estimatePageHtml('), serverSrc.indexOf('function installPageHtml(')); const bad = s => s.includes('js.stripe.com') || s.includes('cardEl') || s.includes('confirmCardPayment') || s.includes('mountCard'); return cartFn.length > 1000 && estFn.length > 1000 && !bad(cartFn) && !bad(estFn); })());
t('static v54: the dead errLoading copy is gone from the server dictionaries', !serverSrc.includes('errLoading'));
t('static v54: checkout-session rails exist — cart checkout endpoint, estimate join-checkout, cart-order kind, return verification, webhook branch', serverSrc.includes('cartCheckoutMatch') && serverSrc.includes('estJoinCheckoutMatch') && serverSrc.includes("kind === 'cart-order'") && serverSrc.includes('function checkoutSessionSubscriptionPaid(') && serverSrc.includes('function activateHomeCareFromCheckout(') && serverSrc.includes('function applyEstimateMemberDiscount(') && serverSrc.includes("url.searchParams.get('joined')") && serverSrc.includes("url.searchParams.get('paid')"));
t('static v55: cart edit rails — PUT endpoint, session-expiry helper, builder edit mode (banner, Edit button, save/cancel)', serverSrc.includes('cartEditMatch') && serverSrc.includes("req.method === 'PUT'") && serverSrc.includes('function expireCartSessions(') && serverSrc.includes("/expire'") && htmlSrc.includes('id="cartEditBanner"') && htmlSrc.includes('function editCart(') && htmlSrc.includes('function saveCartEdit(') && htmlSrc.includes('function cancelCartEdit(') && htmlSrc.includes('function submitCart()'));
t('static v44: HOLD-PAYMENT-MODEL carries the superseded banner pointing at the new design', fs.readFileSync(path.join(APP_DIR, '..', 'HOLD-PAYMENT-MODEL.md'), 'utf8').includes('SUPERSEDED') && fs.readFileSync(path.join(APP_DIR, '..', 'HOLD-PAYMENT-MODEL.md'), 'utf8').includes('DISENO-PAGO-COMPLETO.md'));
t('static v44 web: no customer surface sells the menu-order hold anymore', (() => { const R = path.join(APP_DIR, '..'); const rd = (f) => fs.readFileSync(path.join(R, f), 'utf8'); return !rd('index.html').includes('$75 hold') && !rd('service.html').includes('$75 hold') && !rd('checkout.html').includes('$75 hold') && !rd('tracking.html').includes('$75 hold') && ['handyman-fairfield', 'handyman-vacaville', 'handyman-vallejo', 'tv-mounting-vacaville', 'mobile-mechanic-vallejo', 'plumber-fairfield'].every(d => !rd(d + '/index.html').includes('authorization hold secures')) && rd('checkout.html').includes('http-equiv="refresh"'); })());

// ---------------- mock Nominatim ----------------
const geoServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/search') {
    const q = u.searchParams.get('q') || '';
    if (q.includes('FAILGEO')) { res.writeHead(500); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify([{ lat: '38.2499', lon: '-122.0369' }]));
  }
  res.writeHead(404); res.end();
});
await new Promise(r => geoServer.listen(GEO_PORT, r));

// ---------------- boot the real app server ----------------
try { fs.unlinkSync(DATA_FILE); } catch (e) {}
const child = spawn('node', ['server.js'], {
  cwd: APP_DIR,
  env: Object.assign({}, process.env, {
    PORT: String(APP_PORT), DATA_FILE, NOMINATIM_BASE: 'http://127.0.0.1:' + GEO_PORT,
    SSE_HEARTBEAT_MS: '300', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', RESEND_API_KEY: '',
    STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: ''
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stderr.on('data', d => process.stderr.write('[server] ' + d));
async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(250);
  }
  throw new Error('server did not come up');
}
const health0 = await waitHealth();
t('boot: /api/health ok', !!health0.ok);
t('boot: /api/health reports sseClients count', typeof health0.sseClients === 'number');

// ---------------- REST helpers ----------------
async function req(method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  if (opts.cookie) headers.Cookie = opts.cookie;
  const r = await fetch(BASE + p, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  const setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  return { status: r.status, j, cookie: setCookies.length ? setCookies[0].split(';')[0] : null };
}

// ---------------- accounts ----------------
const adm = await req('POST', '/api/setup-admin', { body: { name: 'Team Admin', email: 'admin@t.local', phone: '(707) 555-0000', password: 'adminpass1' } });
t('setup-admin: 201', adm.status === 201);
const admLogin = await req('POST', '/api/login', { body: { email: 'admin@t.local', password: 'adminpass1' } });
t('admin login: 200 + token', admLogin.status === 200 && !!admLogin.j.token);
const A = admLogin.j.token, ACOOKIE = admLogin.cookie;

const c1 = await req('POST', '/api/signup', { body: { name: 'Cust One', email: 'c1@t.local', phone: '(707) 555-0101', password: 'custpass1', role: 'customer' } });
const c2 = await req('POST', '/api/signup', { body: { name: 'Cust Two', email: 'c2@t.local', phone: '(707) 555-0102', password: 'custpass2', role: 'customer' } });
t('customer signups: 201', c1.status === 201 && c2.status === 201);
t('v77 server: a plain customer signup carries NO membership (free account only)', c1.j.user.homeCareStatus === 'none' && !(c1.j.user.membershipPlan && c1.j.user.membershipPlan.status === 'active'));
const c1Login = await req('POST', '/api/login', { body: { email: 'c1@t.local', password: 'custpass1' } });
const c2Login = await req('POST', '/api/login', { body: { email: 'c2@t.local', password: 'custpass2' } });
const C1 = c1Login.j.token, C1COOKIE = c1Login.cookie, C2COOKIE = c2Login.cookie;

const w1 = await req('POST', '/api/signup', { body: { name: 'Worker One', email: 'w1@t.local', phone: '(707) 555-0201', password: 'workpass1', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
const w2 = await req('POST', '/api/signup', { body: { name: 'Worker Two', email: 'w2@t.local', phone: '(707) 555-0202', password: 'workpass2', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: [] } } });
t('worker signups start on review', w1.status === 201 && w1.j.user.status === 'review' && w2.status === 201);
const w1Id = w1.j.user.id, w2Id = w2.j.user.id;
const act1 = await req('PATCH', '/api/workers/' + w1Id, { token: A, body: { status: 'active' } });
const act2 = await req('PATCH', '/api/workers/' + w2Id, { token: A, body: { status: 'active' } });
t('admin activates workers', act1.status === 200 && act2.status === 200);
const w1Login = await req('POST', '/api/login', { body: { email: 'w1@t.local', password: 'workpass1' } });
const w2Login = await req('POST', '/api/login', { body: { email: 'w2@t.local', password: 'workpass2' } });
const W1 = w1Login.j.token, W1COOKIE = w1Login.cookie, W2 = w2Login.j.token;

const badLogin = await req('POST', '/api/login', { body: { email: 'c1@t.local', password: 'wrong' } });
t('login wrong password: 401', badLogin.status === 401);
const me401 = await req('GET', '/api/me');
t('/api/me unauthenticated: 401', me401.status === 401);

// ---------------- requests (regression) ----------------
const rqPhoto = await req('POST', '/api/requests', { token: C1, body: { service: 'Faucet repair', description: 'drips', city: 'Fairfield', estimateType: 'photo' } });
t('photo estimate request: 201, due 0', rqPhoto.status === 201 && rqPhoto.j.request.estimateDue === 0);
const rqIn = await req('POST', '/api/requests', { token: C1, body: { service: 'Deck repair', description: 'boards', city: 'Fairfield', estimateType: 'inperson' } });
t('in-person request non-member: due 75', rqIn.status === 201 && rqIn.j.request.estimateDue === 75);

// ---------------- v42: the wizard submits through the same path ----------------
// Anonymous (no account) payload in exactly the shape the wizard sends:
// photo estimate with the access notes appended to the description.
const wzPhoto = await req('POST', '/api/requests', { body: { customerName: 'Wiz Ana', customerEmail: 'wiz@t.local', customerPhone: '(707) 555-0999', service: 'Plumbing', description: 'Kitchen faucet drips\nAccess notes: Gate 42', city: 'Fairfield', address: '1 Main St', when: 'Tomorrow', estimateType: 'photo', photos: ['data:image/jpeg;base64,PH'] } });
t('v42 wizard payload: anonymous photo estimate 201, due $0, GHS id issued', wzPhoto.status === 201 && wzPhoto.j.request.estimateDue === 0 && /^GHS-/.test(wzPhoto.j.request.id));
t('v42 wizard payload: fields land identical (service/city/address/when/contact + access notes in description)', wzPhoto.j.request.service === 'Plumbing' && wzPhoto.j.request.city === 'Fairfield' && wzPhoto.j.request.address === '1 Main St' && wzPhoto.j.request.when === 'Tomorrow' && wzPhoto.j.request.customerEmail === 'wiz@t.local' && wzPhoto.j.request.description.includes('Access notes: Gate 42') && wzPhoto.j.request.photos.length === 1);
const wzIn = await req('POST', '/api/requests', { body: { customerName: 'Wiz Bob', customerEmail: 'wizb@t.local', customerPhone: '', service: 'Carpentry', description: 'door sticks', city: 'Vacaville', address: '2 Oak Ave', when: 'This week', estimateType: 'inperson' } });
t('v42 wizard payload: anonymous in-person estimate 201, due $75', wzIn.status === 201 && wzIn.j.request.estimateDue === 75);
const admReqList42 = await req('GET', '/api/requests', { token: A });
t('v42 wizard payload: the admin receives the wizard requests with the same fields', admReqList42.status === 200 && admReqList42.j.requests.some(r => r.id === wzPhoto.j.request.id && r.service === 'Plumbing' && r.estimateType === 'photo') && admReqList42.j.requests.some(r => r.id === wzIn.j.request.id && r.estimateDue === 75));

// ---------------- jobs + v22 flow (regression) ----------------
async function mkJob(phone, address) {
  const r = await req('POST', '/api/jobs', { token: A, body: { service: 'Fence fix', city: 'Fairfield', description: 'gate', when: 'Tomorrow 9am', payOffer: 120, customerPrice: 200, customerName: 'Cust', customerPhone: phone, address: address || '742 Evergreen Terrace, Fairfield, CA' } });
  return r;
}
const job1 = await mkJob('(707) 555-0101');
t('admin posts job: 201 Open', job1.status === 201 && job1.j.job.status === 'Open');
const J1 = job1.j.job.id;
const wList1 = await req('GET', '/api/jobs', { token: W1 });
const wJob1 = (wList1.j.jobs || []).find(x => x.id === J1);
t('worker sees open job', !!wJob1);
t('privacy: open job payload has NO customer phone for worker', !!wJob1 && JSON.stringify(wJob1).indexOf('555-0101') === -1 && !('customerPhone' in wJob1));
const locEarly = await req('POST', '/api/jobs/' + J1 + '/location', { token: W1, body: { lat: 38.25, lng: -122.03 } });
t('location post before claim: 403 (not your job)', locEarly.status === 403);
const claim1 = await req('POST', '/api/jobs/' + J1 + '/claim', { token: W1 });
t('worker claims job: 200 Claimed', claim1.status === 200 && claim1.j.job.status === 'Claimed');
const locClaimed = await req('POST', '/api/jobs/' + J1 + '/location', { token: W1, body: { lat: 38.25, lng: -122.03 } });
t('location post while Claimed (not en route): 409', locClaimed.status === 409);
const badJump = await req('PATCH', '/api/jobs/' + J1, { token: W1, body: { status: 'Done — photos sent' } });
t('worker cannot jump Claimed -> Done via status: 409', badJump.status === 409);
const omw1 = await req('PATCH', '/api/jobs/' + J1, { token: W1, body: { status: 'On my way' } });
t('worker sets On my way: 200', omw1.status === 200 && omw1.j.job.status === 'On my way');
const locByOther = await req('POST', '/api/jobs/' + J1 + '/location', { token: W2, body: { lat: 38.25, lng: -122.03 } });
t('location post by non-assigned worker: 403', locByOther.status === 403);
const locBad = await req('POST', '/api/jobs/' + J1 + '/location', { token: W1, body: { lat: 999, lng: 0 } });
t('location post invalid coords: 400', locBad.status === 400);
const loc1 = await req('POST', '/api/jobs/' + J1 + '/location', { token: W1, body: { lat: 38.25, lng: -122.03 } });
t('location post en route: 200', loc1.status === 200);
const custJobs1 = await req('GET', '/api/jobs', { token: C1 });
const custJob1 = (custJobs1.j.jobs || []).find(x => x.id === J1);
t('customer sees own job with liveLoc while sharing', !!custJob1 && !!custJob1.liveLoc && custJob1.liveLoc.lat === 38.25);
const cust2Jobs = await req('GET', '/api/jobs', { token: c2Login.j.token });
t('other customer does NOT see the job at all', !(cust2Jobs.j.jobs || []).some(x => x.id === J1));
// destination geocode (async, fire-and-forget) — poll admin view
let destOk = false;
for (let i = 0; i < 14 && !destOk; i++) {
  const aj = await req('GET', '/api/jobs', { token: A });
  const ajob = (aj.j.jobs || []).find(x => x.id === J1);
  if (ajob && ajob.destLat === 38.2499 && ajob.destLng === -122.0369) destOk = true; else await sleep(250);
}
t('destination geocoded once and cached on the job', destOk);
// one lookup per job: second position post must not re-geocode (cached) — observable via timing only; assert coords unchanged after another post
await req('POST', '/api/jobs/' + J1 + '/location', { token: W1, body: { lat: 38.26, lng: -122.04 } });
const custJobs1b = await req('GET', '/api/jobs', { token: C1 });
const custJob1b = (custJobs1b.j.jobs || []).find(x => x.id === J1);
t('latest point only: liveLoc overwritten by newer post', !!custJob1b && custJob1b.liveLoc.lat === 38.26);
const stop1 = await req('POST', '/api/jobs/' + J1 + '/location/stop', { token: W1, body: {} });
t('location stop: 200', stop1.status === 200);
const custJobs1c = await req('GET', '/api/jobs', { token: C1 });
const custJob1c = (custJobs1c.j.jobs || []).find(x => x.id === J1);
t('after stop, customer payload has no liveLoc', !!custJob1c && !custJob1c.liveLoc);
await req('POST', '/api/jobs/' + J1 + '/location', { token: W1, body: { lat: 38.27, lng: -122.05 } });
const arr1 = await req('PATCH', '/api/jobs/' + J1, { token: W1, body: { status: 'Arrived' } });
t('worker sets Arrived: 200', arr1.status === 200 && arr1.j.job.status === 'Arrived');
const custJobs1d = await req('GET', '/api/jobs', { token: C1 });
const custJob1d = (custJobs1d.j.jobs || []).find(x => x.id === J1);
t('Arrived wipes liveLoc from customer payload (deleted, not archived)', !!custJob1d && !('liveLoc' in custJob1d));
const backJump = await req('PATCH', '/api/jobs/' + J1, { token: W1, body: { status: 'On my way' } });
t('worker cannot go Arrived -> On my way: 409', backJump.status === 409);
const done1 = await req('PATCH', '/api/jobs/' + J1, { token: W1, body: { photosDone: true } });
t('photosDone completes the job', done1.status === 200 && done1.j.job.status === 'Done — photos sent');

// geocode failure path: flow proceeds, no dest coords
const jobF = await mkJob('(707) 555-0101', '1 FAILGEO Lane, Fairfield, CA');
const JF = jobF.j.job.id;
await req('POST', '/api/jobs/' + JF + '/claim', { token: W1 });
await req('PATCH', '/api/jobs/' + JF, { token: W1, body: { status: 'On my way' } });
const locF = await req('POST', '/api/jobs/' + JF + '/location', { token: W1, body: { lat: 38.2, lng: -122.0 } });
t('geocode failure: location post still 200', locF.status === 200);
await sleep(600);
const ajF = await req('GET', '/api/jobs', { token: A });
const ajobF = (ajF.j.jobs || []).find(x => x.id === JF);
t('geocode failure: no dest coords stored, liveLoc present', !!ajobF && ajobF.destLat == null && !!ajobF.liveLoc);
await req('PATCH', '/api/jobs/' + JF, { token: W1, body: { status: 'Arrived' } });


// ---------------- v24 E2: silent pre-assigned jobs ----------------
async function notifTexts(token) {
  const n = await req('GET', '/api/notifications', { token });
  return (n.j.notifications || []).map(x => x.text || '');
}
const jobOpen = await req('POST', '/api/jobs', { token: A, body: { service: 'Baseline fanout job', city: 'Fairfield', payOffer: 90, customerName: 'Cust', customerPhone: '(707) 555-0101', address: '1 A St, Fairfield, CA' } });
t('v24 E2: unassigned job posts Open as before', jobOpen.status === 201 && jobOpen.j.job.status === 'Open' && !jobOpen.j.job.assignedWorkerId);
t('v24 E2: default fan-out notifies worker 1', (await notifTexts(W1)).some(x => x.includes('Baseline fanout job')));
t('v24 E2: default fan-out notifies worker 2', (await notifTexts(W2)).some(x => x.includes('Baseline fanout job')));
const jobSilent = await req('POST', '/api/jobs', { token: A, body: { service: 'Silent assigned job', city: 'Fairfield', payOffer: 110, customerName: 'Cust', customerPhone: '(707) 555-0101', address: '2 B St, Fairfield, CA', assignedWorkerId: w1Id, silent: true } });
t('v24 E2: silent job created Claimed + assigned', jobSilent.status === 201 && jobSilent.j.job.status === 'Claimed' && jobSilent.j.job.assignedWorkerId === w1Id);
const JSIL = jobSilent.j.job.id;
t('v24 E2: silent job -> ZERO notifications to the non-assigned worker', !(await notifTexts(W2)).some(x => x.includes('Silent assigned job')));
t('v24 E2: silent job -> assigned worker got the direct assignment notice', (await notifTexts(W1)).some(x => x.includes('assigned you a job') && x.includes('Silent assigned job')));
t('v24 E2: silent job -> assigned worker did NOT get the open-job broadcast', !(await notifTexts(W1)).some(x => x.includes('New open job: Silent assigned job')));
const w1JobsS = await req('GET', '/api/jobs', { token: W1 });
t('v24 E2: assigned worker sees the silent job as his own', (w1JobsS.j.jobs || []).some(x => x.id === JSIL && x.mine === true));
const w2JobsS = await req('GET', '/api/jobs', { token: W2 });
t('v24 E2: non-assigned worker does NOT see the silent job', !(w2JobsS.j.jobs || []).some(x => x.id === JSIL));
const jobLoud = await req('POST', '/api/jobs', { token: A, body: { service: 'Loud assigned job', city: 'Fairfield', payOffer: 100, assignedWorkerId: w1Id } });
t('v24 E2: assigned non-silent job is Claimed + assigned', jobLoud.status === 201 && jobLoud.j.job.status === 'Claimed' && jobLoud.j.job.assignedWorkerId === w1Id);
t('v24 E2: non-silent assigned job still broadcasts to the other workers', (await notifTexts(W2)).some(x => x.includes('Loud assigned job')));
const jobFake = await req('POST', '/api/jobs', { token: A, body: { service: 'Silent no assignee job', city: 'Fairfield', payOffer: 80, silent: true, assignedWorkerId: 'USR-NOPE' } });
t('v24 E2: silent with an unknown worker falls back to Open + broadcast', jobFake.status === 201 && jobFake.j.job.status === 'Open' && (await notifTexts(W2)).some(x => x.includes('Silent no assignee job')));

// ---------------- SSE (v23) ----------------
function sseConnect(cookie) {
  return new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port: APP_PORT, path: '/api/events', headers: { Cookie: cookie } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('sse status ' + res.statusCode)); }
      const c = { req: r, res, buf: '', raw: '', events: [], waiters: [] };
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        c.raw += chunk; c.buf += chunk;
        let idx;
        while ((idx = c.buf.indexOf('\n\n')) >= 0) {
          const block = c.buf.slice(0, idx); c.buf = c.buf.slice(idx + 2);
          let type = null, data = null;
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (type) {
            const ev = { type, data: data ? JSON.parse(data) : null };
            c.events.push(ev);
            c.waiters = c.waiters.filter(w => !w(ev));
          }
        }
      });
      resolve(c);
    });
    r.on('error', reject);
  });
}
function sseWait(c, type, pred, timeoutMs = 4000) {
  const found = c.events.find(e => e.type === type && (!pred || pred(e.data)));
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout waiting for SSE ' + type)), timeoutMs);
    c.waiters.push((ev) => { if (ev.type === type && (!pred || pred(ev.data))) { clearTimeout(to); resolve(ev); return true; } return false; });
  });
}
function sseCount(c, type, pred) { return c.events.filter(e => e.type === type && (!pred || pred(e.data))).length; }
async function sseClientsCount() { const h = await (await fetch(BASE + '/api/health')).json(); return h.sseClients; }

const unauthSse = await fetch(BASE + '/api/events');
t('SSE unauthenticated: 401', unauthSse.status === 401);
unauthSse.body && unauthSse.body.cancel && unauthSse.body.cancel();

const sseAdmin = await sseConnect(ACOOKIE);
const sseC1 = await sseConnect(C1COOKIE);
const sseC2 = await sseConnect(C2COOKIE);
const sseW1 = await sseConnect(W1COOKIE);
t('SSE: all roles connect', !!sseAdmin && !!sseC1 && !!sseC2 && !!sseW1);
await sleep(150);
t('SSE: 4 clients registered server-side', (await sseClientsCount()) === 4);
// heartbeat: SSE_HEARTBEAT_MS=300 in this test env — a ': hb' comment must arrive
let hbOk = sseAdmin.raw.includes(': hb');
for (let i = 0; i < 10 && !hbOk; i++) { await sleep(200); hbOk = sseAdmin.raw.includes(': hb'); }
t('SSE: heartbeat comment lines arrive (: hb)', hbOk);
t('SSE: connected comment received', sseAdmin.raw.includes(': connected'));

// request.new -> admin only
const rqSse = await req('POST', '/api/requests', { token: C1, body: { service: 'SSE test request', description: 'x', city: 'Fairfield', estimateType: 'photo' } });
const rqSseId = rqSse.j.request.id;
const evReq = await sseWait(sseAdmin, 'request.new', d => d && d.requestId === rqSseId);
t('SSE: admin receives request.new for a new request', !!evReq);
await sleep(500);
t('SSE: customer does NOT receive request.new', sseCount(sseC1, 'request.new', d => d && d.requestId === rqSseId) === 0);

// job.new -> active workers (+ admin), not customers
const jobS = await mkJob('(707) 555-0101');
const JS = jobS.j.job.id;
const evJobNew = await sseWait(sseW1, 'job.new', d => d && d.jobId === JS);
t('SSE: worker receives job.new when admin posts a job', !!evJobNew);
await sleep(400);
t('SSE: customer does NOT receive job.new', sseCount(sseC1, 'job.new', d => d && d.jobId === JS) === 0);
t('SSE: admin also receives job.new', sseCount(sseAdmin, 'job.new', d => d && d.jobId === JS) === 1);

// claim -> job.status to the owning customer + worker
const claimS = await req('POST', '/api/jobs/' + JS + '/claim', { token: W1 });
t('SSE setup: worker claims the SSE job', claimS.status === 200);
const evClaim = await sseWait(sseC1, 'job.status', d => d && d.jobId === JS && d.status === 'Claimed');
t('SSE: owning customer receives job.status Claimed', !!evClaim && evClaim.data.prevStatus === 'Open');
await sleep(400);
t('SSE: other customer does NOT receive that job.status', sseCount(sseC2, 'job.status', d => d && d.jobId === JS) === 0);
t('SSE: claim emitted exactly once (admin count)', sseCount(sseAdmin, 'job.status', d => d && d.jobId === JS && d.status === 'Claimed') === 1);

// en route + location push
await req('PATCH', '/api/jobs/' + JS, { token: W1, body: { status: 'On my way' } });
const evOmw = await sseWait(sseC1, 'job.status', d => d && d.jobId === JS && d.status === 'On my way');
t('SSE: customer receives job.status On my way', !!evOmw);
const beforeLocCount = sseCount(sseC1, 'job.location', d => d && d.jobId === JS);
await req('POST', '/api/jobs/' + JS + '/location', { token: W1, body: { lat: 38.31, lng: -122.06 } });
const evLoc = await sseWait(sseC1, 'job.location', d => d && d.jobId === JS && !d.stopped);
t('SSE: owning customer receives job.location with the posted point', !!evLoc && evLoc.data.lat === 38.31 && evLoc.data.lng === -122.06);
await sleep(700);
t('SSE: one location post = exactly one job.location event (no storm)', sseCount(sseC1, 'job.location', d => d && d.jobId === JS && !d.stopped) === beforeLocCount + 1);
t('SSE: other customer receives NO job.location for that job', sseCount(sseC2, 'job.location', d => d && d.jobId === JS) === 0);
t('SSE: assigned worker receives their own job.location', sseCount(sseW1, 'job.location', d => d && d.jobId === JS) >= 1);
t('SSE: admin receives job.location', sseCount(sseAdmin, 'job.location', d => d && d.jobId === JS) >= 1);

// location stop -> stopped event to the customer
await req('POST', '/api/jobs/' + JS + '/location/stop', { token: W1, body: {} });
const evStop = await sseWait(sseC1, 'job.location', d => d && d.jobId === JS && d.stopped === true);
t('SSE: customer receives job.location stopped:true on stop', !!evStop);

// admin status change also emits once
const jobA = await mkJob('(707) 555-0101');
const JA = jobA.j.job.id;
await sseWait(sseAdmin, 'job.new', d => d && d.jobId === JA);
await req('PATCH', '/api/jobs/' + JA, { token: A, body: { status: 'Cancelled' } });
const evAdm = await sseWait(sseAdmin, 'job.status', d => d && d.jobId === JA && d.status === 'Cancelled');
t('SSE: admin PATCH status emits job.status', !!evAdm);
await sleep(400);
t('SSE: admin PATCH emitted exactly once', sseCount(sseAdmin, 'job.status', d => d && d.jobId === JA && d.status === 'Cancelled') === 1);

// disconnect cleanup: listener/client count returns to baseline, no growth across cycles
for (const c of [sseAdmin, sseC1, sseC2, sseW1]) { try { c.req.destroy(); } catch (e) {} }
let backToZero = false;
for (let i = 0; i < 16 && !backToZero; i++) { await sleep(250); backToZero = (await sseClientsCount()) === 0; }
t('SSE cleanup: client count returns to 0 after disconnects', backToZero);
for (let cycle = 0; cycle < 2; cycle++) {
  const x1 = await sseConnect(ACOOKIE); const x2 = await sseConnect(C1COOKIE);
  await sleep(120);
  const during = await sseClientsCount();
  t('SSE cleanup cycle ' + cycle + ': 2 clients while connected', during === 2);
  x1.req.destroy(); x2.req.destroy();
  let zero = false;
  for (let i = 0; i < 16 && !zero; i++) { await sleep(250); zero = (await sseClientsCount()) === 0; }
  t('SSE cleanup cycle ' + cycle + ': back to 0 (no leaked listeners)', zero);
}

// ---------------- client (VM with fake DOM) ----------------
const mainScript = scriptBlocks.reduce((a, b) => (a.length > b.length ? a : b));
function makeEl() {
  return {
    style: {}, dataset: {}, children: [], value: '', textContent: '', innerHTML: '', files: [],
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, appendChild() {}, remove() {}, focus() {}, click() {},
    previousElementSibling: null, nextElementSibling: null
  };
}
const elById = new Map();
const docListeners = {};
const documentStub = {
  visibilityState: 'visible',
  getElementById(idv) { if (!elById.has(idv)) elById.set(idv, makeEl()); return elById.get(idv); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  body: makeEl()
};
let watchCb = null, watchCalls = 0, clearWatchCalls = 0, currentPosCb = null, getPosCalls = 0;
const fakeGeo = {
  watchPosition(cb) { watchCalls++; watchCb = cb; return 7; },
  clearWatch() { clearWatchCalls++; },
  getCurrentPosition(cb) { getPosCalls++; currentPosCb = cb; }
};
let wakeRequests = 0, wakeReleases = 0, lastWakeLock = null;
const fakeWakeLock = {
  request() {
    wakeRequests++;
    const wl = { released: false, _rel: [], release() { wakeReleases++; this.released = true; return Promise.resolve(); }, addEventListener(ev, fn) { if (ev === 'release') this._rel.push(fn); } };
    lastWakeLock = wl;
    return Promise.resolve(wl);
  }
};
const navStub = { geolocation: fakeGeo, wakeLock: fakeWakeLock };
let fetchJobsResponse = { jobs: [] };
const fetchLog = [];
// v35 controls: stripeCfgMode drives /api/stripe/config ('empty' = the
// long-standing ok({}) behavior, 'down' = fetch-level failure, 'ok' = a
// real publishable key); stubAuthUser, when set, is what login/signup
// return so doAuth can run end-to-end in the VM.
let stripeCfgMode = 'empty';
let stubAuthUser = null;
async function fetchStub(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  fetchLog.push({ method, url, body: opts.body || null });
  const ok = (obj) => ({ ok: true, status: 200, json: async () => obj });
  if (url === '/api/me') return { ok: false, status: 401, json: async () => ({ error: 'login required' }) };
  if (url === '/api/stripe/config') {
    if (stripeCfgMode === 'down') return { ok: false, status: 500, json: async () => ({ error: 'config down' }) };
    if (stripeCfgMode === 'ok') return ok({ publishableKey: 'pk_test_123' });
    return ok({ publishableKey: '' });
  }
  if ((url === '/api/login' || url === '/api/signup') && stubAuthUser) return ok({ user: stubAuthUser });
  if (url === '/api/jobs' && method === 'GET') return ok({ jobs: fetchJobsResponse.jobs });
  if (url === '/api/requests' && method === 'GET') return ok({ requests: [] });
  if (url === '/api/notifications') return ok({ notifications: [], unread: 0 });
  return ok({});
}
class FakeES {
  constructor(url) { this.url = url; this.listeners = {}; this.closed = false; FakeES.instances.push(this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  close() { this.closed = true; }
  emit(type, data) { (this.listeners[type] || []).forEach(f => f({ data: JSON.stringify(data) })); }
}
FakeES.instances = [];
let oscStarts = 0;
class FakeAC {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() { oscStarts++; }, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
const lsStub = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const ssStub = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const winListeners = {};
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  document: documentStub, navigator: navStub, localStorage: lsStub,
  location: { hash: '', href: 'http://localhost/' },
  fetch: fetchStub, EventSource: FakeES, AudioContext: FakeAC, sessionStorage: ssStub,
  alert() {}, confirm() { return true; }, prompt() { return null; },
  Image: class {}, URL,
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const run = (code) => vm.runInContext(code, sandbox, { filename: 'snippet.js' });
let vmLoaded = true;
try { vm.runInContext(mainScript, sandbox, { filename: 'index-main.js' }); } catch (e) { vmLoaded = false; console.log('VM load error:', e && e.stack || e); }
t('client VM: app script loads under fake DOM', vmLoaded);
await sleep(80); // let loadMe() settle (401 -> logged-out render)
t('client VM: no event stream while logged out', run('esStream') === null);

// --- v34 → v79: website handoff params land in the CART + the checkout prefill ---
run("location.hash = '#order/tv-mounting?x=raceway&n=Gate%2042&nm=Ana%20Test&ph=7075550199&ad=5%20Oak%20St&cy=Vallejo&wt=Tomorrow%20after%203pm';");
run('render();');
t('v79 handoff: the legacy #order link converts to #cart', run("location.hash") === '#cart');
t('v79 handoff: the service lands in the cart with its validated raceway add-on', run("cartLoad().length === 1 && cartLoad()[0].id === 'tv-mounting' && (cartLoad()[0].x || []).includes('raceway')") === true);
t('v79 handoff: the contact params are stashed for the checkout prefill', run("(JSON.parse(sessionStorage.getItem('ghsCcPrefill') || '{}').nm || '')") === 'Ana Test');
run('cartShowCheckout();');
t('v79 prefill: name / phone land in the checkout fields', elById.get('ccName').value === 'Ana Test' && elById.get('ccPhone').value === '7075550199');
t('v79 prefill: address / city / notes land in the checkout fields', elById.get('ccAddr').value === '5 Oak St' && elById.get('ccCity').value === 'Vallejo' && elById.get('ccNotes').value === 'Gate 42');
run("cartSave([]); location.hash = '';");

// --- throttle math (pure) ---
const dist1 = run('trackDistM(38, -122, 38.001, -122)');
t('trackDistM: 0.001 deg latitude ~= 111 m', dist1 > 109 && dist1 < 113);
t('trackShouldPost: first fix always posts', run('trackShouldPost({ postAt: 0, postLat: null, postLng: null }, 38, -122, 1000)') === true);
t('trackShouldPost: <5s since post blocks even a big move', run('trackShouldPost({ postAt: 10000, postLat: 38, postLng: -122 }, 38.001, -122, 14999)') === false);
t('trackShouldPost: >=5s but <15m and <30s blocks', run('trackShouldPost({ postAt: 10000, postLat: 38, postLng: -122 }, 38.0001, -122, 16000)') === false);
t('trackShouldPost: >=5s and >=15m posts', run('trackShouldPost({ postAt: 10000, postLat: 38, postLng: -122 }, 38.0002, -122, 16000)') === true);
t('trackShouldPost: >=30s elapsed posts even without moving', run('trackShouldPost({ postAt: 10000, postLat: 38, postLng: -122 }, 38, -122, 41000)') === true);
t('trackShouldPost: 29.9s without moving still blocks', run('trackShouldPost({ postAt: 10000, postLat: 38, postLng: -122 }, 38, -122, 39900)') === false);

// --- sharing flow: scripted fixes through the real watch callback ---
run('var FAKE_NOW = 100000; Date.now = function(){ return FAKE_NOW; };');
run("me = { id: 'USR-W1', role: 'worker', status: 'active', name: 'Worker One' };");
const locPosts = () => fetchLog.filter(f => f.method === 'POST' && /\/api\/jobs\/JOB-T1\/location/.test(f.url)).length;
run("startSharing('JOB-T1');");
await sleep(30);
t('sharing: watchPosition started', watchCalls === 1);
t('sharing: wake lock requested on share start', wakeRequests === 1);
t('sharing: banner carries the honest app-open/screen-awake copy', elById.get('trackBanner').innerHTML.includes('screen awake during the trip'));
watchCb({ coords: { latitude: 38, longitude: -122 } });
t('sharing: first fix posts immediately', locPosts() === 1);
run('FAKE_NOW = 102000;'); watchCb({ coords: { latitude: 38.00005, longitude: -122 } });
t('sharing: fix at +2s / ~5m is throttled (no post)', locPosts() === 1);
run('FAKE_NOW = 106000;'); watchCb({ coords: { latitude: 38.0003, longitude: -122 } });
t('sharing: fix at +6s / ~33m posts', locPosts() === 2);
run('FAKE_NOW = 108000;'); watchCb({ coords: { latitude: 38.00035, longitude: -122 } });
t('sharing: fix at +2s after a post is throttled', locPosts() === 2);
run('FAKE_NOW = 137500;'); watchCb({ coords: { latitude: 38.00035, longitude: -122 } });
t('sharing: still fix after 30s+ posts (heartbeat point)', locPosts() === 3);
run('stopWatchOnly();');
t('sharing: stop releases the wake lock', wakeReleases === 1);
t('sharing: stop clears the watch state', run('trackWatch') === null && clearWatchCalls >= 1);

// --- wake lock absent: sharing must not break ---
navStub.wakeLock = undefined;
let absentOk = true;
try { run("startSharing('JOB-T2');"); } catch (e) { absentOk = false; }
await sleep(20);
t('sharing: no wakeLock API -> startSharing does not throw, watch still starts', absentOk && watchCalls === 2);
run('stopWatchOnly();');
navStub.wakeLock = fakeWakeLock;

// --- foreground resume: stale share auto-resumes + fresh fix + wake lock re-acquired ---
run("startSharing('JOB-T3');");
await sleep(20);
const wakeBefore = wakeRequests;
run('FAKE_NOW = 200000;'); watchCb({ coords: { latitude: 38.1, longitude: -122.1 } });
const t3Posts = () => fetchLog.filter(f => f.method === 'POST' && /\/api\/jobs\/JOB-T3\/location/.test(f.url)).length;
t('resume setup: T3 first fix posted', t3Posts() === 1);
// simulate the OS auto-releasing the wake lock while backgrounded
run('if (trackWakeLock) { trackWakeLock = null; }');
run('FAKE_NOW = 246000;'); // 46s later -> stale
documentStub.visibilityState = 'visible';
(docListeners['visibilitychange'] || []).forEach(f => f());
await sleep(20);
t('resume: returning to visible re-acquires the wake lock', wakeRequests === wakeBefore + 1);
t('resume: stale share fetches a fresh fix without a tap', getPosCalls === 1);
currentPosCb({ coords: { latitude: 38.11, longitude: -122.11 } });
t('resume: fresh fix is posted immediately', t3Posts() === 2);
run('stopWatchOnly();');

// --- SSE client: marker moves on stream events; poll is fallback-only ---
run("me = { id: 'USR-C1', role: 'customer', name: 'Cust One' };");
run('esStart();');
let esCur = run('esStream');
t('stream: EventSource created on /api/events once logged in', !!esCur && esCur.url === '/api/events');
esCur.onopen();
t('stream: onopen marks connected', run('esConnected') === true);
run("trackMaps['JOB-M1'] = { map: {}, tech: { setLatLng: function(ll){ globalThis.__moved = ll; } } };");
run("trackJobsCache = [{ id: 'JOB-M1', liveLoc: { lat: 1, lng: 2, updatedAt: new Date().toISOString() } }];");
esCur.emit('job.location', { jobId: 'JOB-M1', lat: 38.5, lng: -122.5, updatedAt: new Date().toISOString() });
const moved = run('globalThis.__moved');
t('stream: job.location moves the marker immediately (no poll tick)', Array.isArray(moved) && moved[0] === 38.5 && moved[1] === -122.5);
t('stream: job.location refreshes the updated label', elById.get('trkupd-JOB-M1').textContent.startsWith('updated'));
t('stream: cached point updated so re-renders do not rewind', run('trackJobsCache[0].liveLoc.lat') === 38.5);
run("initTrackMaps([{ id: 'JOB-M1', liveLoc: { lat: 38.5, lng: -122.5, updatedAt: new Date().toISOString() }, address: '1 Main St' }]);");
t('stream: fallback panel renders when Leaflet is missing', elById.get('trkmap-JOB-M1').innerHTML.includes('on the way'));
t('poll: NOT running while stream is connected', run('livePollTimer') === null);
esCur.onerror();
t('poll: fallback poll engages when the stream errors', run('livePollTimer') !== null && run('esConnected') === false);
run('if (esRetryTimer) { clearTimeout(esRetryTimer); esRetryTimer = null; } esStart();');
esCur = run('esStream');
esCur.onopen();
t('poll: fallback poll disengages when the stream reconnects', run('livePollTimer') === null && run('esConnected') === true);

// --- chimes consume stream events, exactly once per transition ---
run("me = { id: 'USR-W1', role: 'worker', status: 'active', name: 'Worker One' };");
fetchJobsResponse = { jobs: [{ id: 'JOB-A', status: 'Open', service: 'X', city: 'Fairfield', description: '', when: '', payOffer: 50 }] };
run('loadJobs();');
await sleep(60);
t('chime: baseline load makes no sound', oscStarts === 0);
run('armSound();');
fetchJobsResponse = { jobs: [{ id: 'JOB-A', status: 'Open', service: 'X', city: 'Fairfield', description: '', when: '', payOffer: 50 }, { id: 'JOB-B', status: 'Open', service: 'Y', city: 'Fairfield', description: '', when: '', payOffer: 60 }] };
esCur.emit('job.new', { jobId: 'JOB-B' });
await sleep(60);
t('chime: job.new via stream chimes exactly once (2 notes), refresh does not re-chime', oscStarts === 2);
esCur.emit('job.new', { jobId: 'JOB-B' });
await sleep(40);
t('chime: duplicate job.new for the same job does not chime again', oscStarts === 2);
fetchJobsResponse = { jobs: [{ id: 'JOB-A', status: 'Open' }, { id: 'JOB-B', status: 'Open' }, { id: 'JOB-C', status: 'Open', service: 'Z', city: 'Fairfield', description: '', when: '', payOffer: 70 }] };
esCur.emit('job.new', { jobId: 'JOB-C' });
await sleep(60);
t('chime: a second new job chimes once more', oscStarts === 4);
// customer status chime via stream
run("me = { id: 'USR-C1', role: 'customer', name: 'Cust One' };");
run("sndCustomerJobs([{ id: 'JOB-K', status: 'Claimed' }]);");
fetchJobsResponse = { jobs: [{ id: 'JOB-K', status: 'On my way', service: 'S', city: 'F', when: '', messages: [] }] };
esCur.emit('job.status', { jobId: 'JOB-K', status: 'On my way', prevStatus: 'Claimed' });
await sleep(60);
t('chime: customer job.status change via stream chimes exactly once', oscStarts === 6);
esCur.emit('job.status', { jobId: 'JOB-K', status: 'On my way', prevStatus: 'Claimed' });
await sleep(40);
t('chime: repeated same-status event does not chime again', oscStarts === 6);
// admin request chime via stream (chime is synchronous in the handler)
run("me = { id: 'USR-ADM', role: 'admin', name: 'Team' }; sndSeen.adminReqs = {};");
esCur.emit('request.new', { requestId: 'GHS-REQ1' });
t('chime: admin request.new via stream chimes once', oscStarts === 8);
esCur.emit('request.new', { requestId: 'GHS-REQ1' });
t('chime: duplicate request.new does not chime again', oscStarts === 8);
await sleep(80); // let loadAdmin settle against stubs
// logged out: stream does not start
const esCountBefore = FakeES.instances.length;
run('me = null; esClose(); esStart();');
t('stream: does not start while logged out', FakeES.instances.length === esCountBefore);


// ---------------- v24 client: campaign source capture ----------------
run("location.hash = '#join-plus1?src=INSTA1'; captureCampaignSource();");
t('v24 client: src captured from the hash query into sessionStorage', run("sessionStorage.getItem('ghsSrc')") === 'INSTA1');
t('v24 client: campaignSource() returns the stored code', run('campaignSource()') === 'INSTA1');
t('v24 client: hash query stripped so the deep link still matches the bare hash', run('location.hash') === '#join-plus1');
run("location.search = '?src=WEB9'; location.hash = ''; captureCampaignSource();");
t('v24 client: src captured from the URL search too', run('campaignSource()') === 'WEB9');
run("location.search = ''; sessionStorage.removeItem('ghsSrc');");

// ---------------- v24 client: per-variant plan images ----------------
const yardImgEl = documentStub.getElementById('yardPlanImg');
const plusImgEl = documentStub.getElementById('plusPlanImg');
yardImgEl.src = 'data:image/jpeg;base64,ORIGINAL_YARD';
plusImgEl.src = 'data:image/jpeg;base64,ORIGINAL_PLUS';
run("selectMembershipVisits('yard', 2);");
t('v24 img: yard 2-visit swaps the plan image to the $150 variant', yardImgEl.src === run('PLAN_CARD_IMGS.yard[2].src'));
t('v24 img: yard 2-visit alt names $150', (yardImgEl.alt || '').includes('$150'));
t('v24 img: yard 2-visit price text + join button agree ($150)', elById.get('yardPrice').textContent === '$150' && (elById.get('yardJoinBtn').textContent || '').includes('$150'));
run("selectMembershipVisits('yard', 1);");
t('v24 img: yard back to 1 visit restores the original image', yardImgEl.src === 'data:image/jpeg;base64,ORIGINAL_YARD');
t('v24 img: yard 1-visit alt names $75 and price text follows', (yardImgEl.alt || '').includes('$75') && elById.get('yardPrice').textContent === '$75');
run("selectMembershipVisits('plus', 2);");
t('v24 img: plus 2-visit swaps the plan image to the $175 variant', plusImgEl.src === run('PLAN_CARD_IMGS.plus[2].src'));
t('v24 img: plus 2-visit alt + price + button agree ($175)', (plusImgEl.alt || '').includes('$175') && elById.get('plusPrice').textContent === '$175' && (elById.get('plusJoinBtn').textContent || '').includes('$175'));
run("selectMembershipVisits('plus', 1);");
t('v24 img: plus back to 1 visit restores the original image + $100 alt', plusImgEl.src === 'data:image/jpeg;base64,ORIGINAL_PLUS' && (plusImgEl.alt || '').includes('$100'));
// the designed yard cards resolve the same per-variant images
run('syncYardCardImgs();');
t('v24 yard view: yard1 card image is the 1-visit image', documentStub.getElementById('ycImg-yard1').src === 'data:image/jpeg;base64,ORIGINAL_YARD');
t('v24 yard view: yard2 card image is the $150 variant', documentStub.getElementById('ycImg-yard2').src === run('PLAN_CARD_IMGS.yard[2].src'));
t('v24 yard view: plus1 card image is the 1-visit image', documentStub.getElementById('ycImg-plus1').src === 'data:image/jpeg;base64,ORIGINAL_PLUS');
t('v24 yard view: plus2 card image is the $175 variant with matching alt', documentStub.getElementById('ycImg-plus2').src === run('PLAN_CARD_IMGS.plus[2].src') && (documentStub.getElementById('ycImg-plus2').alt || '').includes('$175'));

// ---------------- v24 client: one-touch contact pill ----------------
const pillEl = documentStub.getElementById('teamContactPill');
run("me = null; location.hash = ''; updateContactPill();");
t('v24 pill: visible to guests on the storefront', pillEl.style.display === 'flex');
run("me = { id: 'USR-C1', role: 'customer', name: 'Cust One' }; updateContactPill();");
t('v24 pill: visible to a logged-in customer', pillEl.style.display === 'flex');
run("me = { id: 'USR-W1', role: 'worker', status: 'active', name: 'Worker One' }; updateContactPill();");
t('v24 pill: hidden on the worker panel', pillEl.style.display === 'none');
run("me = { id: 'USR-ADM', role: 'admin', name: 'Team' }; updateContactPill();");
t('v24 pill: hidden on admin views', pillEl.style.display === 'none');
run("me = null; location.hash = '#terms'; updateContactPill();");
t('v24 pill: hidden on the standalone info pages', pillEl.style.display === 'none');
run("location.hash = '#memberships'; updateContactPill();");
t('v24 pill: visible on the memberships page', pillEl.style.display === 'flex');
run("location.hash = ''; me = null;");

// ---------------- v27 client: share-link copy handler ----------------
let copiedUrl = null;
navStub.clipboard = { writeText(u) { copiedUrl = u; return Promise.resolve(); } };
run("window.__cb = { textContent: 'Copy link' };");
await run("copyShareLink('https://app.generalhandymans.app/#join-yard2', window.__cb)");
t('v27 client: copyShareLink copies the exact plan URL to the clipboard', copiedUrl === 'https://app.generalhandymans.app/#join-yard2');
t('v27 client: copy handler flashes Copied! on the button', run('window.__cb.textContent') === 'Copied!');
await sleep(1700);
t('v27 client: copy button label restores after the flash', run('window.__cb.textContent') === 'Copy link');
await run("copyShareLink('https://app.generalhandymans.app/#join-homecare', null)");
t('v27 client: copy handler works without a button (clipboard only)', copiedUrl === 'https://app.generalhandymans.app/#join-homecare');
delete navStub.clipboard;

// ---------------- v35 client: ensureStripe never latches + member fallback sells the armed plan ----------------
// Gabriel's phone report (2026-10-22): member tab -> plain signup form, a
// red "Memberships need an account" error as the greeting, no plan, no
// price, no card. Root causes proven below: (1) ensureStripe latched its
// first failure forever; (2) the account-first fallback hid the plan UI.
let fakeCardMounts = 0;
function makeFakeCardEl() {
  return {
    _host: null,
    mount(h) { fakeCardMounts++; this._host = h; if (h && typeof h === 'object') h.__fakeCard = this; },
    unmount() { this._host = null; },
    on() {}, clear() {}
  };
}
const el = (id) => documentStub.getElementById(id);
sandbox.Stripe = function fakeStripeFactory(pk) {
  return {
    elements() { return { create() { return makeFakeCardEl(); } }; },
    confirmCardPayment: async () => ({})
  };
};
const resetStripeState = () => run('stripeObj = null; cardEl = null; cardHostEl = null; stripeInitPromise = null; pendingJoin = null; pendingMembershipPlan = null; me = null;');

// (1) failure does not latch: config down -> false; still down -> false
// again (a REAL retry, not a latched instant-false is proven by the
// recovery step); config recovers -> success.
resetStripeState();
stripeCfgMode = 'down';
const esTry1 = await run('ensureStripe()');
t('v35 stripe: ensureStripe fails while the config fetch is down', esTry1 === false);
const esTry2 = await run('ensureStripe()');
t('v35 stripe: a second call while still down fails again (no throw, no false success)', esTry2 === false);
stripeCfgMode = 'ok';
const esTry3 = await run('ensureStripe()');
t('v35 stripe: after recovery the SAME session succeeds (failure did not latch)', esTry3 === true && fakeCardMounts === 1);
const esTry4 = await run('ensureStripe()');
t('v35 stripe: healthy fast path does not remount', esTry4 === true && fakeCardMounts === 1);
// a render() rebuild swaps in a fresh #cardElement node: the card must be
// re-mounted into the CURRENT node, not left in the detached one.
elById.set('cardElement', makeEl());
const esTry5 = await run('ensureStripe()');
t('v35 stripe: rebuilt #cardElement gets a fresh mount', esTry5 === true && fakeCardMounts === 2 && el('cardElement').__fakeCard != null);

// (2) Stripe down, yard1 armed via the join flow: the fallback still shows
// the plan, its price and a priced button — and signup resumes yard1.
resetStripeState();
stripeCfgMode = 'down';
run("location.hash = '';");
await run("beginInlineJoin('yardcare', 'yard1')");
t('v35 fallback: Stripe down arms the fallback for the picked plan', run('pendingMembershipPlan && pendingMembershipPlan.plan') === 'yard1' && run('pendingJoin') === null && run('curMode') === 'customer');
t('v35 fallback: plan selector stays VISIBLE in the fallback', el('planSelRow').style.display === 'block');
t('v35 fallback: selector shows the armed plan (yard1)', el('aPlanSel').value === 'yard1');
const fbNote1 = el('joinChargeNote').innerHTML || '';
t('v35 fallback: plan note is visible and names Yard Care at $75/mo', el('joinChargeNote').style.display === 'block' && fbNote1.includes('Yard Care') && fbNote1.includes('$75'));
t('v35 fallback: plan note never shows the $29 HomeCare default', !fbNote1.includes('$29'));
t('v35 fallback: button carries the armed price (Create account & continue — $75/mo)', (el('authBtn').textContent || '').includes('Create account & continue') && el('authBtn').textContent.includes('$75'));
t('v35 fallback: no "Memberships need an account" error greeting', !el('authErr').classList.contains('show') && !(el('authErr').textContent || '').includes('Memberships need an account'));
t('v35 fallback: the competing $29 HomeCare promo is hidden under the armed plan', el('hcPromo').style.display === 'none');
// the selector re-arms the fallback too
el('aPlanSel').value = 'yard2';
run('joinPlanChanged()');
t('v35 fallback: switching the selector re-arms the fallback plan', run('pendingMembershipPlan && pendingMembershipPlan.plan') === 'yard2');
t('v35 fallback: note + button follow the switch ($150)', (el('joinChargeNote').innerHTML || '').includes('$150') && (el('authBtn').textContent || '').includes('$150'));
el('aPlanSel').value = 'yard1';
run('joinPlanChanged()');
// signup on the fallback form resumes the ARMED plan's checkout
el('aName').value = 'Ana Test';
el('aEmail').value = 'ana@t.local';
el('aPhone').value = '7075550199';
el('aPass').value = 'password123';
el('aServiceAddress').value = '5 Oak St';
stubAuthUser = { id: 'USR-V35', role: 'customer', name: 'Ana Test', email: 'ana@t.local', serviceAddress: '5 Oak St' };
const fbMark = fetchLog.length;
await run('doAuth()');
const fbCalls = fetchLog.slice(fbMark);
const fbCheckout = fbCalls.find(f => f.url === '/api/stripe/checkout');
t('v35 fallback: signup resumes checkout for the ARMED plan (yardcare/yard1)', !!fbCheckout && (fbCheckout.body || '').includes('"kind":"yardcare"') && (fbCheckout.body || '').includes('"plan":"yard1"'));
t('v35 fallback: resume never touches the HomeCare $29 rails', !fbCalls.some(f => f.url.includes('homecare-subscribe') || f.url.includes('homecare-confirm')));
t('v35 fallback: the armed plan is consumed by the resume', run('pendingMembershipPlan') === null);
stubAuthUser = null;
run('me = null;');

// (3) cold member tab, Stripe OK: the inline form charges in the same
// place it creates the account; switching to plus2 reprices EVERYTHING
// and submit creates the plus2 subscription (server resolves priceId).
resetStripeState();
stripeCfgMode = 'ok';
await run('openMemberJoin()');
t('v35 join: cold member tab lands on the inline join form (HomeCare preselected)', run('curMode') === 'join' && run('pendingJoin && pendingJoin.plan') === 'homecare');
el('aPlanSel').value = 'plus2';
run('joinPlanChanged()');
t('v35 join: selector switch re-points the pending join to plus2', run('pendingJoin && pendingJoin.plan') === 'plus2');
t('v35 join: note / button / card label / bottom red box all read $175', (el('joinChargeNote').innerHTML || '').includes('$175') && (el('authBtn').textContent || '').includes('$175') && (el('cardChargeLabel').textContent || '').includes('$175') && (el('hcChargeNote').innerHTML || '').includes('$175'));
el('aName').value = 'Ana Test';
el('aEmail').value = 'ana2@t.local';
el('aPhone').value = '7075550199';
el('aPass').value = 'password123';
el('aServiceAddress').value = '5 Oak St';
stubAuthUser = { id: 'USR-V35B', role: 'customer', name: 'Ana Test', email: 'ana2@t.local', serviceAddress: '5 Oak St' };
const joinMark = fetchLog.length;
await run('doAuth()');
const joinCalls = fetchLog.slice(joinMark);
const subCall = joinCalls.find(f => f.url === '/api/stripe/membership-subscribe');
t('v35 join: submit creates the membership subscription for plus2 (plan key only, server resolves the priceId)', !!subCall && (subCall.body || '').includes('"plan":"plus2"'));
t('v35 join: plus2 never routes through the HomeCare $29 endpoints', !joinCalls.some(f => f.url.includes('homecare-subscribe')));
stubAuthUser = null;
run('me = null;');

// (4) deep link #join-yard2 with Stripe OK: yard2 / $175 everywhere.
resetStripeState();
run("membershipDeepLinkKey = '';");
stripeCfgMode = 'ok';
run("location.hash = '#join-yard2';");
run('queueMembershipDeepLink()');
await sleep(80);
t('v35 deep link: #join-yard2 lands on the inline join form with yard2 armed', run('curMode') === 'join' && run('pendingJoin && pendingJoin.plan') === 'yard2');
t('v35 deep link: selector + note + button all show yard2 / $150', el('aPlanSel').value === 'yard2' && (el('joinChargeNote').innerHTML || '').includes('$150') && (el('authBtn').textContent || '').includes('$150') && (el('cardChargeLabel').textContent || '').includes('$150'));
run("location.hash = ''; me = null; pendingJoin = null; pendingMembershipPlan = null;");
stripeCfgMode = 'empty';

// ---------------- v77 client: plain signup is a FREE account; membership is OPTIONAL ----------------
// Gabriel's screenshots (2026-10-25): the New customer tab wore the plan
// picker, the "Joining HomeCare" banner and a priced button — no way to
// register without a plan — plus the membership fields on a plain form,
// and a giant technician pill under the customer login.
resetStripeState();
stripeCfgMode = 'empty';
run("location.hash = '';"); run('applyWorkerEntry();');
// (a) plain tab: account fields + the optional offer ONLY
run('plainSignupTab()');
t('v77 plain: New customer shows NO plan selector, NO join banner, NO card row', el('planSelRow').style.display === 'none' && el('joinChargeNote').style.display === 'none' && el('cardRow').style.display === 'none');
t('v77 plain: membership fields hidden on a plain signup (address / home / start)', el('serviceAddressRow').style.display === 'none' && el('homeGroup').style.display === 'none' && el('startGroup').style.display === 'none');
t('v77 plain: the OPTIONAL membership picker is visible, defaulted to no membership', el('optPlanRow').style.display === 'block' && el('aOptPlan').value === '' && el('optPlanNote').style.display === 'none');
t('v77 plain: button is a bare Create account (no price anywhere)', (el('authBtn').textContent || '').trim() === 'Create account');
t('v77 plain: the HomeCare promo box no longer pressures the signup form', el('hcPromo').style.display === 'none');
t('v77 tech door: discreet link present on the customer face, giant pill absent from the DOM', !!elById.get('techLinkRow') && el('techLinkRow').style.display !== 'none' && !elById.get('techSignInBtn'));
// (b) an armed fallback plan does NOT survive an explicit New customer tap
resetStripeState();
stripeCfgMode = 'down';
await run("beginInlineJoin('yardcare', 'yard1')");
t('v77 escape: fallback armed (sanity — plan UI visible before the tap)', run('pendingMembershipPlan && pendingMembershipPlan.plan') === 'yard1' && el('planSelRow').style.display === 'block');
run('plainSignupTab()');
t('v77 escape: tapping New customer DROPS the armed plan — plain form, unpriced button', run('pendingMembershipPlan') === null && run('curMode') === 'customer' && el('planSelRow').style.display === 'none' && el('joinChargeNote').style.display === 'none' && (el('authBtn').textContent || '').trim() === 'Create account');
// (c) OPTIONAL plan picked: fields appear, submit continues to that plan's checkout
el('aOptPlan').value = 'yard1'; run('optPlanChanged()');
t('v77 opt-in: picking a plan reveals the membership fields + a priced note', el('serviceAddressRow').style.display === 'block' && el('homeGroup').style.display === 'block' && el('startGroup').style.display === 'block' && el('optPlanNote').style.display === 'block' && (el('optPlanNote').innerHTML || '').includes('$75'));
t('v77 opt-in: the button STILL carries no price (the note explains the checkout step)', (el('authBtn').textContent || '').trim() === 'Create account');
el('aName').value = 'Opt In'; el('aEmail').value = 'optin@t.local'; el('aPhone').value = '7075550111'; el('aPass').value = 'password123'; el('aServiceAddress').value = '7 Oak St';
stubAuthUser = { id: 'USR-V77A', role: 'customer', name: 'Opt In', email: 'optin@t.local', serviceAddress: '7 Oak St' };
const optMark = fetchLog.length;
await run('doAuth()');
const optCalls = fetchLog.slice(optMark);
const optCheckout = optCalls.find(f => f.url === '/api/stripe/checkout');
t('v77 opt-in: submit continues to the PICKED plan checkout (yardcare/yard1)', !!optCheckout && (optCheckout.body || '').includes('"kind":"yardcare"') && (optCheckout.body || '').includes('"plan":"yard1"'));
t('v77 opt-in: resume never touches the inline membership/HomeCare rails', !optCalls.some(f => f.url.includes('membership-subscribe') || f.url.includes('homecare-subscribe')));
stubAuthUser = null;
run('me = null;');
// (d) NO plan picked: account only — zero payment surface in the whole submit
run('plainSignupTab()');
el('aName').value = 'Plain Pam'; el('aEmail').value = 'pam@t.local'; el('aPhone').value = '7075550112'; el('aPass').value = 'password123'; el('aServiceAddress').value = '';
stubAuthUser = { id: 'USR-V77B', role: 'customer', name: 'Plain Pam', email: 'pam@t.local' };
const plainMark = fetchLog.length;
await run('doAuth()');
const plainCalls = fetchLog.slice(plainMark);
t('v77 plain submit: signup + login happened and the customer is inside (no checkout, no charge call)', plainCalls.some(f => f.url === '/api/signup') && !plainCalls.some(f => f.url.includes('/api/stripe/')) && run('me && me.id') === 'USR-V77B');
stubAuthUser = null;
run('me = null;');
// (e) member-join exercise, ALL five plans: selector switch reprices note / button / card label
resetStripeState();
stripeCfgMode = 'ok';
await run('openMemberJoin()');
const planExpect = { homecare: '29', yard1: '75', yard2: '150', plus1: '100', plus2: '175' };
for (const pk of Object.keys(planExpect)) {
  el('aPlanSel').value = pk; run('joinPlanChanged()');
  const px = '$' + planExpect[pk];
  t('v77 join exercise: ' + pk + ' shows ' + px + ' on note + button + card label', (el('joinChargeNote').innerHTML || '').includes(px) && (el('authBtn').textContent || '').includes(px) && (el('cardChargeLabel').textContent || '').includes(px) && run('pendingJoin && pendingJoin.plan') === pk);
}
t('v77 join exercise: HomeCare note sells the v74 FREE first month', (el('aPlanSel').value = 'homecare', run('joinPlanChanged()'), (el('joinChargeNote').innerHTML || '').includes('FREE') && (el('joinChargeNote').innerHTML || '').includes('$0')));
run('me = null; pendingJoin = null; pendingMembershipPlan = null;');
stripeCfgMode = 'empty';
// (f) password rescue intact: forgot row on login + #reset= opens the reset box
run("location.hash = '';"); run('applyWorkerEntry();'); run("mode('login');");
t('v77 rescue: forgot-password row shows on the customer login', el('forgotRow').style.display === 'block');
run("location.hash = '#reset=" + 'a'.repeat(64) + "';"); run('checkResetHash()');
t('v77 rescue: an emailed #reset= link opens the reset box', elById.get('resetBox').style.display === 'block');
run("location.hash = '';"); run('checkResetHash()');

// --- v78 client: guest cart (localStorage) + embedded checkout ---
// Gabriel's Amazon model: the cart exists for GUESTS, persists on the
// phone, and the account is created at the END of the checkout. The
// card is typed on our own page (Payment Element) and — P0-4 — the
// order is created ONLY after server-verified payment: a decline
// keeps the cart, shows an in-theme error and NO success state.
// A superset Stripe fake (Payment Element create('payment') +
// confirmPayment, switchable to a decline); confirmCardPayment kept so
// nothing downstream can miss it.
let v78ConfirmMode = 'ok';
let v78PeCreates = 0;
sandbox.Stripe = function v78StripeFactory(pk) {
  return {
    elements() { return { create(kind) { if (kind === 'payment') v78PeCreates++; return makeFakeCardEl(); } }; },
    confirmCardPayment: async () => ({}),
    confirmPayment: async () => v78ConfirmMode === 'ok' ? ({ paymentIntent: { id: 'pi_v78_vm', status: 'succeeded' } }) : ({ error: { message: 'Your card was declined.' } })
  };
};
// Scripted backend for the v78 endpoints (everything else delegates).
const v78Calls = [];
let v78JoinArmed = false;
// v78 refine: the stub prices from the posted items (tv/fan are $125 /
// member $100 — the same figures the canned 375/300 totals came from),
// so at-checkout edits move the stubbed totals exactly like the server.
const v78VmPrices = { 'tv-mounting': [125, 100], 'ceiling-fan': [125, 100] };
function v78VmTotals(items){ let list = 0, member = 0; (items || []).forEach(function(it){ const p = v78VmPrices[it.serviceId] || [0, 0]; const q = Math.max(1, Math.round(Number(it.qty) || 1)); list += p[0] * q; member += p[1] * q; }); return { list, member }; }
const v78Fetch = async (url, opts = {}) => {
  let body = null; try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  if (url === '/api/me' && v78JoinArmed) return { ok: true, status: 200, json: async () => ({ user: { id: 'USR-V78', role: 'customer', name: 'Cart Ana', email: 'cartana@t.local', homeCareStatus: 'active' } }) };
  if (url === '/api/cart/quote') {
    const tt = v78VmTotals(body && body.items);
    v78Calls.push({ step: 'quote', due: tt.list });
    return { ok: true, status: 200, json: async () => ({ member: false, totals: { list: tt.list, member: tt.member, due: tt.list } }) };
  }
  if (url === '/api/cart/checkout') {
    v78Calls.push({ step: body && body.step, joinedMembership: !!(body && body.joinedMembership) });
    const tt = v78VmTotals(body && body.items);
    const user = { id: 'USR-V78', role: 'customer', name: 'Cart Ana', email: 'cartana@t.local', homeCareStatus: (v78JoinArmed && body.step === 'pay') ? 'active' : 'none' };
    if (body && body.step === 'join') return { ok: true, status: 200, json: async () => ({ step: 'join', clientSecret: 'sub_secret_v78', subscriptionId: 'sub_v78', user, totals: { list: tt.list, member: tt.member, due: tt.member } }) };
    return { ok: true, status: 200, json: async () => ({ step: 'pay', checkoutId: 'CCK-V78', clientSecret: 'pi_secret_v78', paymentIntentId: 'pi_v78_vm', user, totals: { list: tt.list, member: tt.member, due: v78JoinArmed ? tt.member : tt.list } }) };
  }
  if (url === '/api/stripe/homecare-confirm') { v78Calls.push({ step: 'homecare-confirm' }); return { ok: true, status: 200, json: async () => ({ active: true }) }; }
  if (url === '/api/cart/checkout-confirm') { v78Calls.push({ step: 'checkout-confirm' }); return { ok: true, status: 200, json: async () => ({ ok: true, requestId: 'GHS-V78OK' }) }; }
  return fetchStub(url, opts);
};
const v78OrigFetch = sandbox.fetch;
sandbox.fetch = v78Fetch;
resetStripeState();
stripeCfgMode = 'ok';
run("me = null; location.hash = ''; localStorage.removeItem('ghsCart');");
// add + merge + persist across a "reload" (state lives in localStorage)
run("cartAdd('tv-mounting'); cartAdd('tv-mounting'); cartAdd('ceiling-fan');");
t('v78 cart: adds merge quantity (2x tv + 1x fan = 3 items)', run('cartCount()') === 3);
t('v78 cart: the cart persists in localStorage ghsCart', (run("localStorage.getItem('ghsCart')") || '').includes('tv-mounting') && (run("localStorage.getItem('ghsCart')") || '').includes('ceiling-fan'));
t('v78 cart: the header badge shows the count', el('cartBadge').textContent === '3' && el('cartBadge').style.display === 'block');
const calc78 = JSON.parse(run('JSON.stringify(cartCalc())'));
t('v78 cart math: guest list 375 / member 300 (2x $125 tv + $125 fan, member = x0.8)', calc78.list === 375 && calc78.member === 300 && calc78.savings === 75);
// guest view: BOTH totals + the member total as the savings hook
run("location.hash = '#cart';"); run('render();');
const cartHtmlGuest = el('cartLines').innerHTML + el('cartTotals').innerHTML;
t('v78 cart view: guest sees list total AND member total as the savings hook', cartHtmlGuest.includes('$375') && cartHtmlGuest.includes('$300') && cartHtmlGuest.includes('save $75'));
// verified member: the member price is applied live
run("me = { id:'USR-V78M', role:'customer', name:'Mem Ber', email:'mem@t.local', homeCareStatus:'active' };"); run('renderCart();');
const cartHtmlMem = el('cartLines').innerHTML + el('cartTotals').innerHTML;
t('v78 cart view: a verified member sees the member price applied live', cartHtmlMem.includes('member price is applied') && cartHtmlMem.includes('$300'));
run('me = null;');
// checkout WITHOUT membership: account fields filled at the END, prepare
// creates the intent + mounts the Payment Element, pay confirms in-app.
el('ccName').value = 'Cart Ana'; el('ccEmail').value = 'cartana@t.local'; el('ccPhone').value = '7075550100'; el('ccPass').value = 'cartpass12';
el('ccAddress').value = '5 Oak St'; el('ccCity').value = 'Fairfield'; el('ccWhenText').value = ''; el('ccNotes').value = '';
await run('cartPrepare()');
t('v78 checkout: prepare hits step pay + mounts the Payment Element in-page', v78Calls.length === 1 && v78Calls[0].step === 'pay' && v78PeCreates >= 1 && run('!!cartPayCtx') === true && (el('cartPayBtn').textContent || '').includes('Pay $375'));
await run('cartPayNow()');
t('v78 checkout: success clears the cart + shows the themed in-app confirmation (no external page)', run("localStorage.getItem('ghsCart')") === '[]' && el('cartDone').style.display === 'block' && (el('cartDone').innerHTML || '').includes('GHS-V78OK') && (el('cartDone').innerHTML || '').includes('Paid in full'));
t('v78 checkout: rail order is checkout(pay) then checkout-confirm', v78Calls.map(c => c.step).join(',') === 'pay,checkout-confirm');
// P0-4: a DECLINED card creates NO order and NO success — cart intact,
// in-theme error, button re-enabled for another try.
run("document.getElementById('cartDone').style.display = 'none';");
run("cartAdd('tv-mounting');");
el('ccAddress').value = '5 Oak St';
await run('cartPrepare()');
v78ConfirmMode = 'decline';
await run('cartPayNow()');
t('v78 P0-4: declined card keeps the cart + shows the in-theme error + NO success state + button re-enabled', run('cartCount()') === 1 && (el('cartPayErr').textContent || '').includes('declined') && el('cartPayErr').style.display === 'block' && el('cartDone').style.display === 'none' && el('cartPayBtn').disabled === false && !v78Calls.slice(2).some(c => c.step === 'checkout-confirm'));
v78ConfirmMode = 'ok';
// checkout WITH the optional membership: join first (its own rails),
// activation verified, THEN the order at the member total.
run('cartClearAll();');
run("cartAdd('tv-mounting'); cartAdd('tv-mounting'); cartAdd('ceiling-fan');");
run("me = { id:'USR-V78', role:'customer', name:'Cart Ana', email:'cartana@t.local', homeCareStatus:'none' };");
el('ccJoin').checked = true;
v78JoinArmed = true;
v78Calls.length = 0;
el('ccAddress').value = '5 Oak St';
await run('cartPrepare()');
t('v78 join: with HomeCare checked, prepare takes the JOIN step first', v78Calls.length === 1 && v78Calls[0].step === 'join' && (el('cartPayBtn').textContent || '').includes('Join HomeCare'));
await run('cartPayNow()');
t('v78 join: rail order is join -> homecare-confirm -> pay, with joinedMembership flagged on the pay step', v78Calls.map(c => c.step).join(',') === 'join,homecare-confirm,pay' && v78Calls[2].joinedMembership === true);
await run('cartPayNow()');
t('v78 join: the order confirms at the member flow + the cart clears', v78Calls.map(c => c.step).join(',') === 'join,homecare-confirm,pay,checkout-confirm' && run("localStorage.getItem('ghsCart')") === '[]');
el('ccJoin').checked = false;
v78JoinArmed = false;
// ROLE PIN (behavioral): the cart button exists ONLY on the customer side.
run("me = { id:'USR-W78', role:'worker', name:'Tech', homeCareStatus:'none' }; location.hash = '';"); run('paintCartBtn();');
t('v78 role: a technician session never sees the cart button', el('cartBtn').style.display === 'none');
run("me = { id:'USR-A78', role:'admin', name:'Admin', homeCareStatus:'none' };"); run('paintCartBtn();');
t('v78 role: an admin session never sees the cart button', el('cartBtn').style.display === 'none');
run("me = null; location.hash = '#worker';"); run('paintCartBtn();');
t('v78 role: the technician entry hides the cart button even for a guest', el('cartBtn').style.display === 'none');
run("location.hash = '';"); run('paintCartBtn();');
t('v78 role: a guest on the customer side sees the cart button', el('cartBtn').style.display !== 'none');
// --- v78 refine (Gabriel 21:57): the cart is FULLY editable at the
// checkout itself — per-line qty/remove, add-more without losing the
// typed data, a server re-quote on every edit, and the stale intent
// dropped + recreated at the new total.
run("localStorage.removeItem('ghsCart'); me = null; cartJoinedOnce = false;");
run("location.hash = '#cart';"); run('render();');
run("cartAdd('tv-mounting'); cartAdd('ceiling-fan');");
el('ccName').value = 'Edit Eve'; el('ccEmail').value = 'eve@t.local'; el('ccPhone').value = '7075550111'; el('ccPass').value = 'evepass123';
el('ccAddress').value = '12 Vine St'; el('ccCity').value = 'Fairfield'; el('ccWhenText').value = 'after 3 PM'; el('ccNotes').value = 'gate 42';
el('ccJoin').checked = false;
run('cartShowCheckout();');
await new Promise(r => setTimeout(r, 20));
if (!run('!!cartPayCtx')) await run('cartPrepare()');
t('v78 refine: the checkout summary is EDITABLE — per-line qty + remove controls inside the checkout card', (el('ccLines').innerHTML || '').includes('ccQty(') && (el('ccLines').innerHTML || '').includes('ccRemove(') && (el('ccLines').innerHTML || '').includes('TV Mounting') && (el('cartPayBtn').textContent || '').includes('Pay $250'));
v78Calls.length = 0;
await run('ccQty(0, 1)');
t('v78 refine: a qty edit AT CHECKOUT re-quotes with the server + recreates the intent at the NEW total (Pay $375)', v78Calls.some(c => c.step === 'quote') && v78Calls.filter(c => c.step === 'pay').length === 1 && (el('cartPayBtn').textContent || '').includes('Pay $375') && run('cartPayCtx.due') === 375);
v78Calls.length = 0;
await run('ccRemove(1)');
t('v78 refine: removing a line AT CHECKOUT drops it, re-quotes, and the pay button names the new total (Pay $250)', run('cartCount()') === 2 && v78Calls.some(c => c.step === 'quote') && (el('cartPayBtn').textContent || '').includes('Pay $250') && !(el('ccLines').innerHTML || '').includes('Ceiling Fan'));
run('cartToggleAddMore();');
t('v78 refine: add-more at checkout opens the catalog picker with Add buttons', el('ccAddList').style.display === 'block' && (el('ccAddList').innerHTML || '').includes('ccAddMore('));
await run("ccAddMore('ceiling-fan')");
t('v78 refine: add-more adds the service WITHOUT losing the typed checkout data (account, address, when, notes preserved)', el('ccName').value === 'Edit Eve' && el('ccEmail').value === 'eve@t.local' && el('ccAddress').value === '12 Vine St' && el('ccWhenText').value === 'after 3 PM' && el('ccNotes').value === 'gate 42' && run('cartCount()') === 3 && (el('cartPayBtn').textContent || '').includes('Pay $375'));
await run('ccRemove(0)');
await run('ccRemove(0)');
t('v78 refine: removing the LAST item at checkout exits gracefully — checkout card hidden, empty state up, no payment surface, no stale intent', el('cartCheckoutCard').style.display === 'none' && el('cartEmpty').style.display === 'block' && run('cartPayCtx === null') === true && (el('cartPayElement').innerHTML || '') === '' && run('cartCount()') === 0);
sandbox.fetch = v78OrigFetch;
stripeCfgMode = 'empty';
run("me = null; location.hash = ''; localStorage.removeItem('ghsCart'); cartPayCtx = null;");

// --- v41: worker entry (#worker) hides the customer request section ---
// Owner screenshot 2026-10-23: at #worker the CUSTOMER "Request a
// handyman" form dominated the screen and squeezed the worker login.
run("location.hash = '';"); run('applyWorkerEntry();'); run('render();');
t('v41 worker entry: default view shows the customer request section', elById.get('customerBox').style.display === 'block');
run("location.hash = '#worker';"); run('applyWorkerEntry();'); run('render();');
t('v41 worker entry: #worker HIDES the customer request section', elById.get('customerBox').style.display === 'none');
t('v41 worker entry: #worker still shows the worker login (auth) box', elById.get('authBox').style.display === 'block');
run("location.hash = '';"); run('applyWorkerEntry();'); run('render();');
t('v41 worker entry: leaving #worker restores the request section', elById.get('customerBox').style.display === 'block');

// --- v71: worker-zone EN|ES toggle (Gabriel: the technician screens
// speak ONE language at a time, like the Menu) ---
run("location.hash = '#worker';"); run('applyWorkerEntry();');
t('v71 worker i18n: the technician door defaults to Spanish (steps hint in ES, no English tail)', (elById.get('authHint').innerHTML || '').includes('jales abiertos') && !(elById.get('authHint').innerHTML || '').includes('open jobs'));
run("setWorkerLang('en');");
t('v71 worker i18n: switching to EN re-renders the hint in English + persists ghsWorkerLang', (elById.get('authHint').innerHTML || '').includes('open jobs') && run("localStorage.getItem('ghsWorkerLang')") === 'en' && run("WT('tradesTitle')") === 'My trades');
run("setWorkerLang('es');");
t('v71 worker i18n: switching back restores Spanish everywhere (hint, dict, toggle)', (elById.get('authHint').innerHTML || '').includes('jales abiertos') && run("localStorage.getItem('ghsWorkerLang')") === 'es' && run("WT('tradesTitle')") === 'Mis oficios' && run("WT('moneyTitle')") === 'Mi dinero');
run("location.hash = '';"); run('applyWorkerEntry();'); run('render();');

// ---------------- v42 client: Solicitud Profesional wizard + in-app menu ----------------
run("location.hash = ''; me = null;"); run('applyWorkerEntry();'); run('render();');
t('v42 home: a guest lands on the wizard (Solicitud first, not a login wall)', elById.get('customerBox').style.display === 'block' && elById.get('wzStep1').style.display === 'block');
run('renderMenu();');
const menuHtml42 = elById.get('menuGroups').innerHTML;
t('v42 menu: renders all 98 catalog services as cards (full master list since v43)', (menuHtml42.match(/class="menu-card"/g) || []).length === 98);
t('v42 menu: cards order into the CART (v79: orderNow → #cart; the #order page is retired)', ['tv-mounting', 'tv-mounting-large', 'faucet-replacement', 'junk-full', 'green-waste', 'oil-change', 'starter-replacement'].every(id => menuHtml42.includes("orderNow('" + id + "')")));
t('v42 menu: prices are the catalog\u2019s own (TV $125 / member $100 since the v43 cut, water heater $700 / $560)', menuHtml42.includes('$125') && menuHtml42.includes('Members $100') && menuHtml42.includes('$700') && menuHtml42.includes('Members $560'));
t('v42 menu: EVERY card shows a member price — the discount is universal (98 of 98)', (menuHtml42.match(/Members \$/g) || []).length === 98);
// wizard navigation + progress
run('wzGo(2);');
t('v42 wizard: step 2 shows, step 1 hides, bar at 50%, label Paso 2 de 4', elById.get('wzStep2').style.display === 'block' && elById.get('wzStep1').style.display === 'none' && elById.get('wzBarFill').style.width === '50%' && elById.get('wzStepLabel').textContent.includes('Paso 2 de 4'));
run('wzGo(1);');
// category pick: fixed-price panel + guided hints
run("wzPickCat('plumbing');");
const panelHtml42 = elById.get('wzMenuPanel').innerHTML;
t('v42 wizard: picking a trade lists its fixed-price services with cart order buttons + member prices', panelHtml42.includes('Faucet Replacement') && panelHtml42.includes("orderNow('faucet-replacement')") && panelHtml42.includes('Members $100'));
t('v42 wizard: the category drives the guided description hint + photo guide', elById.get('wzDescHint').textContent.includes('leaks') && elById.get('wzPhotoGuide').innerHTML.includes('What to photograph'));
run("wzPickCat('otro');");
t('v42 wizard: Otro has no fixed-price panel — it routes to the custom estimate', elById.get('wzMenuPanel').innerHTML.includes('Team will price it'));
run("wzPickCat('plumbing');");
// step validation
run('wzGo(1); wzNextFn();');
t('v42 wizard: step 1 advances once a category is picked', run('wzState.step') === 2);
run("document.getElementById('rDesc').value = ''; wzNextFn();");
t('v42 wizard: step 2 blocks without a description', run('wzState.step') === 2 && elById.get('wzMsg').style.display === 'block');
run("document.getElementById('rDesc').value = 'Kitchen faucet drips'; wzState.est = 'photo'; wzNextFn();");
t('v42 wizard: photo estimate blocks at step 2 without photos', run('wzState.step') === 2);
run("document.getElementById('rPhotos').files = [{ name: 'a.jpg' }]; wzNextFn();");
t('v42 wizard: photo estimate advances once a photo is attached', run('wzState.step') === 3);
run('wzNextFn();');
t('v42 wizard: step 3 blocks without city/address/when', run('wzState.step') === 3 && elById.get('wzMsg').style.display === 'block');
run("wzState.city = 'Fairfield'; document.getElementById('rAddr').value = '1 Main St'; wzState.when = 'Tomorrow'; wzNextFn();");
t('v42 wizard: step 3 advances with city + address + when', run('wzState.step') === 4);
// step 4 summary + estimate pricing rules (display mirrors server rules)
const sumHtml42 = elById.get('wzSummary').innerHTML;
t('v42 wizard: summary shows service, details, where and when', sumHtml42.includes('Plumbing') && sumHtml42.includes('Kitchen faucet drips') && sumHtml42.includes('Fairfield') && sumHtml42.includes('1 Main St') && sumHtml42.includes('Tomorrow'));
t('v42 wizard: summary prices the photo estimate as FREE', sumHtml42.includes('FREE photo estimate'));
run("wzState.est = 'inperson'; wzBuildSummary();");
t('v42 wizard: a visitor\u2019s in-person estimate shows $75 flat', elById.get('wzSummary').innerHTML.includes('$75 flat'));
run("me = { id: 'USR-C9', role: 'customer', name: 'Member Mary', email: 'm@t.local', homeCareStatus: 'active', freeEstimateUsed: false, membershipPlan: { status: 'active', planKey: 'homecare' } }; wzBuildSummary();");
t('v42 wizard: a member with the free estimate unused sees FREE', elById.get('wzSummary').innerHTML.includes('FREE — first estimate'));
run('me.freeEstimateUsed = true; wzBuildSummary();');
t('v42 wizard: a member after the free one sees the $50 member estimate', elById.get('wzSummary').innerHTML.includes('$50 member estimate'));
run('me = null;');
// Gabriel's rule: logged in ≠ locked out of the menu/checkout
run("me = { id: 'USR-C1', role: 'customer', name: 'Cust One' }; location.hash = '';"); run('render();');
t('v42 rule: a logged-in customer still gets the wizard + menu home', elById.get('customerBox').style.display === 'block');
t('v42 nav: Menú entry visible to a logged-in customer', elById.get('menuNavLink').style.display !== 'none');
run("location.hash = '#order/faucet-replacement';"); run('render();');
t('v42 rule (v79): a logged-in customer hitting a legacy #order link lands on #cart with the service in the cart', run("location.hash") === '#cart' && run("cartLoad().some(function(i){ return i.id === 'faucet-replacement'; })") === true);
run("me = null; location.hash = '#order/faucet-replacement';"); run('render();');
t('v42 rule (v79): a visitor gets the same conversion', run("location.hash") === '#cart' && run("cartLoad().some(function(i){ return i.id === 'faucet-replacement'; })") === true);
run("cartSave([]);");
run("location.hash = '';"); run('render();');
t('v42 nav: Menú entry visible to guests', elById.get('menuNavLink').style.display !== 'none');
run("me = { id: 'USR-W1', role: 'worker', status: 'active', name: 'Worker One' };"); run('render();');
t('v42 nav: Menú entry hidden on worker views (isolation stands)', elById.get('menuNavLink').style.display === 'none');
run('me = null;');
// worker entry still hides the whole customer section, wizard + menu included
run("location.hash = '#worker';"); run('applyWorkerEntry();'); run('render();');
t('v42 worker entry: #worker still hides the customer section (wizard + menu)', elById.get('customerBox').style.display === 'none');
run("location.hash = '';"); run('applyWorkerEntry();'); run('render();');
// confirmation screen
run("wzShowDone({ id: 'GHS-TEST42' });");
const doneHtml42 = elById.get('wzDone').innerHTML;
t('v42 confirmation: request number + what-happens-next (3 steps) + track CTA + WhatsApp photo button', doneHtml42.includes('GHS-TEST42') && doneHtml42.includes('What happens next') && doneHtml42.includes('confirm your time') && doneHtml42.includes('Create an account to track it') && doneHtml42.includes('wa.me/17078623773'));
t('v42 confirmation: steps + nav hide behind the confirmation, bar complete', elById.get('wzStep1').style.display === 'none' && elById.get('wzNav').style.display === 'none' && elById.get('wzBarFill').style.width === '100%');
run('wzReset();');
t('v42 confirmation: making another request resets to step 1', run('wzState.step') === 1 && elById.get('wzStep1').style.display === 'block');

// ---------------- v40 area captains ----------------
t('static v40: server has the captain system (seed areas, 5% override, ledger, endpoints)', serverSrc.includes('CAPTAIN_OVERRIDE_RATE = 0.05') && serverSrc.includes("p === '/api/admin/captains'") && serverSrc.includes("p === '/api/me/captain'") && serverSrc.includes('function accrueCaptainOverride(') && serverSrc.includes('db.captainLedger'));
t('static v40: client has the Capitanes admin section + Mi área worker section', htmlSrc.includes('id="adminCaptains"') && htmlSrc.includes('id="workerCaptain"') && htmlSrc.includes('loadAdminCaptains') && htmlSrc.includes('loadCaptainArea') && htmlSrc.includes("areaTitle: 'Mi área'") && htmlSrc.includes("areaTitle: 'My area'"));
const capW = await req('POST', '/api/signup', { body: { name: 'Cap Walter', email: 'capw@t.local', phone: '(707) 555-0301', password: 'cappass1', role: 'worker', profile: { city: 'Vacaville', areas: 'Vacaville', skills: ['Plumbing'] } } });
const techW = await req('POST', '/api/signup', { body: { name: 'Tech Tony', email: 'techt@t.local', phone: '(707) 555-0302', password: 'techpass1', role: 'worker', profile: { city: 'Vacaville', areas: 'Vacaville', skills: ['Electrical'] } } });
const revW = await req('POST', '/api/signup', { body: { name: 'Review Rita', email: 'revr@t.local', phone: '(707) 555-0303', password: 'revpass1', role: 'worker', profile: { city: 'Napa', areas: 'Napa', skills: [] } } });
t('v40 captains: worker signups 201', capW.status === 201 && techW.status === 201 && revW.status === 201);
const capWid = capW.j.user.id, techWid = techW.j.user.id, revWid = revW.j.user.id;
await req('PATCH', '/api/workers/' + capWid, { token: A, body: { status: 'active' } });
await req('PATCH', '/api/workers/' + techWid, { token: A, body: { status: 'active' } });
const CAP = (await req('POST', '/api/login', { body: { email: 'capw@t.local', password: 'cappass1' } })).j.token;
const TECH = (await req('POST', '/api/login', { body: { email: 'techt@t.local', password: 'techpass1' } })).j.token;
const caps0 = await req('GET', '/api/admin/captains', { token: A });
const vacArea = caps0.j.areas.find(a => a.name === 'Vacaville');
const ffArea = caps0.j.areas.find(a => a.name === 'Fairfield');
const napaArea = caps0.j.areas.find(a => a.name === 'Napa');
t('v40 captains: admin list seeds 7 areas; Fairfield is fixed with captain "El General"', caps0.status === 200 && caps0.j.areas.length === 7 && ffArea.fixed === true && ffArea.captainName === 'El General' && ffArea.captainId === 'general');
const capsCust = await req('GET', '/api/admin/captains', { token: C1 });
t('v40 captains: admin list is admin-only', capsCust.status === 403);
const assignFF = await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: ffArea.id, workerId: capWid } });
t('v40 captains: Fairfield is NOT assignable', assignFF.status === 400);
const assignRev = await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: vacArea.id, workerId: revWid } });
t('v40 captains: an on-review worker cannot be captain', assignRev.status === 400);
const assignCust = await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: vacArea.id, workerId: c1.j.user.id } });
t('v40 captains: a customer account cannot be captain', assignCust.status === 400);
const assign1 = await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: vacArea.id, workerId: capWid } });
t('v40 captains: assign an ACTIVE worker as captain of Vacaville', assign1.status === 200 && assign1.j.captains.areas.find(a => a.id === vacArea.id).captainId === capWid);
const meCapNone = await req('GET', '/api/me/captain', { token: TECH });
t('v40 captains: a non-captain worker gets captain:false', meCapNone.status === 200 && meCapNone.j.captain === false);
// Full money flow on app1 (no Stripe): request → job → claim → Done →
// invoice marked PAID by hand (= captured money) → 5% accrues to captain.
async function doneJobWithPaidInvoice(city, service, menuOrder, payOffer, price) {
  const body = { service, city, address: '1 Test Way', when: 'Tomorrow 9am', description: service + ' in ' + city, estimateType: menuOrder ? 'menu' : 'inperson' };
  if (menuOrder) body.menuOrder = menuOrder;
  const cr = await req('POST', '/api/requests', { token: C1, body });
  const rid = cr.j.request.id;
  const cj = await req('POST', '/api/requests/' + rid + '/create-job', { token: A, body: { payOffer, customerPrice: price } });
  const jid = cj.j.job.id;
  await req('POST', '/api/jobs/' + jid + '/claim', { token: TECH });
  const dn = await req('PATCH', '/api/jobs/' + jid, { token: TECH, body: { photosDone: true } });
  const inv = await req('POST', '/api/admin/invoices', { token: A, body: { customerName: 'Cust One', customerEmail: 'c1@t.local', jobId: jid, items: [{ description: service + ' — labor', qty: 1, unitPrice: price }] } });
  await req('POST', '/api/admin/invoices/' + inv.j.invoice.id + '/mark-paid', { token: A, body: { method: 'cash' } });
  return { rid, jid, doneStatus: dn.j.job && dn.j.job.status };
}
const flow1 = await doneJobWithPaidInvoice('Vacaville', 'Water heater install', null, 200, 300);
t('v40 captains: job flow reaches Done — photos sent', flow1.doneStatus === 'Done — photos sent');
const capsAfter1 = await req('GET', '/api/admin/captains', { token: A });
t('v40 captains: 5% of the $300 charged accrues to the Vacaville captain', capsAfter1.j.areas.find(a => a.id === vacArea.id).accrued === 15);
const capsAfter1b = await req('GET', '/api/admin/captains', { token: A });
t('v40 captains: accrual is idempotent (second read still $15, one ledger entry)', capsAfter1b.j.areas.find(a => a.id === vacArea.id).accrued === 15 && capsAfter1b.j.ledger.filter(e => e.jobId === flow1.jid).length === 1);
const flowJunk = await doneJobWithPaidInvoice('Vacaville', 'Junk removal — medium load', { serviceId: 'junk-medium', extras: [], asap: false, totals: { list: 325, member: 325, due: 325 } }, 150, 325);
const capsAfterJunk = await req('GET', '/api/admin/captains', { token: A });
t('v40 captains: junk removal accrues NOTHING', flowJunk.doneStatus === 'Done — photos sent' && capsAfterJunk.j.areas.find(a => a.id === vacArea.id).accrued === 15);
const flow75 = await doneJobWithPaidInvoice('Vacaville', 'Faucet repair', null, 50, 75);
const capsAfter75 = await req('GET', '/api/admin/captains', { token: A });
t('v40 captains: a flat $75 job accrues NOTHING', flow75.doneStatus === 'Done — photos sent' && capsAfter75.j.areas.find(a => a.id === vacArea.id).accrued === 15);
const flowFF = await doneJobWithPaidInvoice('Fairfield', 'Water heater install', null, 200, 400);
const capsAfterFF = await req('GET', '/api/admin/captains', { token: A });
t('v40 captains: Fairfield (El General) accrues NOTHING', flowFF.doneStatus === 'Done — photos sent' && capsAfterFF.j.ledger.filter(e => e.jobId === flowFF.jid).length === 0 && capsAfterFF.j.areas.every(a => a.id === vacArea.id || a.accrued === 0));
const meCap = await req('GET', '/api/me/captain', { token: CAP });
t('v40 captains: captain view shows area, $15 balance, area jobs and overlapping team', meCap.status === 200 && meCap.j.captain === true && meCap.j.area.name === 'Vacaville' && meCap.j.override.accrued === 15 && meCap.j.jobs.some(j => j.id === flow1.jid) && meCap.j.jobs.every(j => j.city === 'Vacaville') && meCap.j.team.some(w => w.name === 'Tech Tony'));
t('v40 captains: captain view carries NO customer phone and NO customer totals', !JSON.stringify(meCap.j).includes('555-0101') && meCap.j.jobs.every(j => j.customerPrice === undefined && j.payOffer === undefined));
const payOver = await req('POST', '/api/admin/captains/payout', { token: A, body: { captainId: capWid, amount: 20 } });
t('v40 captains: a payout above the accrued balance is rejected', payOver.status === 400);
const pay1 = await req('POST', '/api/admin/captains/payout', { token: A, body: { captainId: capWid, amount: 15 } });
t('v40 captains: mark-paid records who/when/amount and zeroes the balance', pay1.status === 200 && pay1.j.payout.amount === 15 && !!pay1.j.payout.at && pay1.j.payout.byEmail === 'admin@t.local' && pay1.j.totals.accrued === 0 && pay1.j.totals.paidOut === 15);
const audCap = await req('GET', '/api/admin/audit', { token: A });
t('v40 captains: assign + payout are audit-logged', audCap.j.entries.some(e => e.action === 'captain.assign' && e.target === vacArea.id) && audCap.j.entries.some(e => e.action === 'captain.payout' && e.target === capWid));
const newArea = await req('POST', '/api/admin/captains/areas', { token: A, body: { name: 'Richmond', cities: ['Richmond', 'El Cerrito'] } });
t('v40 captains: admin can add an area to the registry', newArea.status === 201 && newArea.j.area.cities.length === 2 && newArea.j.area.captainId === null);
const move1 = await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: napaArea.id, workerId: capWid } });
t('v40 captains: reassigning MOVES the captain (one area per worker)', move1.status === 200 && move1.j.captains.areas.find(a => a.id === vacArea.id).captainId === null && move1.j.captains.areas.find(a => a.id === napaArea.id).captainId === capWid);
const un1 = await req('POST', '/api/admin/captains/unassign', { token: A, body: { areaId: napaArea.id } });
t('v40 captains: unassign clears the area', un1.status === 200 && un1.j.captains.areas.find(a => a.id === napaArea.id).captainId === null);
const meCapGone = await req('GET', '/api/me/captain', { token: CAP });
t('v40 captains: an ex-captain loses the area view', meCapGone.j.captain === false);

// ---------------- v40 WS2: stale-price sweep + price resolution ----------------
t('static v40 WS2: no stale $49/$60 membership strings remain in server.js', !serverSrc.includes('$49') && !serverSrc.includes('$60'));
t('static v40 WS2: welcome email + admin notices quote the $29 HomeCare price', serverSrc.includes('($29/month)') && serverSrc.includes('joined HomeCare ($29/mo)'));
t('static v40 WS2: all three membership charge paths resolve prices via membershipPriceIdFor (monthlyCents is the truth)', (serverSrc.match(/await membershipPriceIdFor\(plan\)/g) || []).length >= 3 && serverSrc.includes("cacheKey = 'stripePrice_' + plan.key"));
t('static v40 WS2: plan map carries the final prices in cents', serverSrc.includes('monthlyCents: 2900') && serverSrc.includes('monthlyCents: 7500') && serverSrc.includes('monthlyCents: 15000') && serverSrc.includes('monthlyCents: 10000') && serverSrc.includes('monthlyCents: 17500'));
t('static v40 WS2: webhook plan resolution also matches resolver-cached price ids', serverSrc.includes('planPriceIds'));

// ---------------- v41 worker-area package ----------------
const TRADE_KEYS_TEST = ['handyman', 'carpentry', 'electrical', 'plumbing', 'gardening', 'hvac', 'mechanic'];
t('static v41: server has trade skills + worker self-service + candidates + money endpoints', serverSrc.includes('const TRADE_SKILLS') && serverSrc.includes("p === '/api/me/trades'") && serverSrc.includes("p === '/api/me/availability'") && serverSrc.includes("p === '/api/me/worker-profile'") && serverSrc.includes("p === '/api/admin/worker-candidates'") && serverSrc.includes("p === '/api/worker/money'") && serverSrc.includes('function mergeTradeSkills(') && serverSrc.includes('function tradeForService('));
t('static v41: direct offers email the one worker via the job_direct_offer template', serverSrc.includes("type === 'job_direct_offer'") && serverSrc.includes("fireAutomation('job_direct_offer'"));
t('static v41: client has Mis oficios, Mi dinero, the skill banner and the dispatch picker', htmlSrc.includes("tradesTitle: 'Mis oficios'") && htmlSrc.includes("moneyTitle: 'Mi dinero'") && htmlSrc.includes('id="workerSkillBanner"') && htmlSrc.includes("skillBannerTitle: '⚠️ Califica tus oficios'") && htmlSrc.includes('id="jWorker"') && htmlSrc.includes('refreshJobCandidates') && htmlSrc.includes('workerTradesHtml'));
// Signup WITH the 7 boxes filled (new-model account).
const w41 = await req('POST', '/api/signup', { body: { name: 'Trades Tara', email: 'w41@t.local', phone: '(707) 555-0411', password: 'workpass41', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'], tradeSkills: { plumbing: { level: 4, tools: true }, handyman: { level: 3, tools: false } } } } });
t('v41 trades: signup stores the trade boxes (level + tools, effective = self)', w41.status === 201 && w41.j.user.tradeSkills.plumbing.level === 4 && w41.j.user.tradeSkills.plumbing.tools === true && w41.j.user.tradeSkills.plumbing.effective === 4 && w41.j.user.tradeSkills.carpentry === null && w41.j.user.skillsRated === 2);
const w41Id = w41.j.user.id;
await req('PATCH', '/api/workers/' + w41Id, { token: A, body: { status: 'active' } });
const W41 = (await req('POST', '/api/login', { body: { email: 'w41@t.local', password: 'workpass41' } })).j.token;
// OLD-model account (w1, created at suite start with NO trade boxes):
// nothing rated — and every new field is editable post-login anyway.
const meW1a = await req('GET', '/api/me', { token: W1 });
t('v41 trades: a pre-existing (old-model) worker starts unrated, all 7 boxes null', meW1a.j.user.skillsRated === 0 && TRADE_KEYS_TEST.every(k => meW1a.j.user.tradeSkills[k] === null));
const tr1 = await req('POST', '/api/me/trades', { token: W1, body: { tradeSkills: { plumbing: { level: 5, tools: true }, hvac: { level: 2, tools: false } } } });
t('v41 trades: existing worker rates boxes from his panel (no account-age gate)', tr1.status === 200 && tr1.j.tradeSkills.plumbing.effective === 5 && tr1.j.tradeSkills.hvac.level === 2 && tr1.j.skillsRated === 2);
const trBad = await req('POST', '/api/me/trades', { token: W1, body: { tradeSkills: { carpentry: { level: 9, tools: true } } } });
t('v41 trades: an out-of-range level (9) is never stored', trBad.status === 200 && trBad.j.tradeSkills.carpentry === null);
const trCust = await req('POST', '/api/me/trades', { token: C1, body: { tradeSkills: { plumbing: { level: 3, tools: true } } } });
const avCust = await req('POST', '/api/me/availability', { token: C1, body: { preset: 'anytime' } });
const wpCust = await req('POST', '/api/me/worker-profile', { token: C1, body: { name: 'Nope' } });
t('v41: worker self-service endpoints are worker-only', trCust.status === 403 && avCust.status === 403 && wpCust.status === 403);
// Team VERIFIED level: effective = verified ?? self; worker edits never erase it.
const ver1 = await req('PATCH', '/api/workers/' + w1Id, { token: A, body: { tradeVerified: { plumbing: 3 } } });
const wlist41 = await req('GET', '/api/workers', { token: A });
const w1Admin = (wlist41.j.workers || []).find(w => w.id === w1Id);
t('v41 verified: admin stamps verified 3 over self 5 — card shows dice 5 · verificado 3 (effective 3)', ver1.status === 200 && w1Admin.tradeSkills.plumbing.level === 5 && w1Admin.tradeSkills.plumbing.verified === 3 && w1Admin.tradeSkills.plumbing.effective === 3);
const tr2 = await req('POST', '/api/me/trades', { token: W1, body: { tradeSkills: { plumbing: { level: 4, tools: false } } } });
t('v41 verified: worker re-rating keeps the Team verification', tr2.j.tradeSkills.plumbing.level === 4 && tr2.j.tradeSkills.plumbing.verified === 3 && tr2.j.tradeSkills.plumbing.effective === 3);
const tr3 = await req('POST', '/api/me/trades', { token: W1, body: { tradeSkills: { plumbing: null } } });
t('v41 verified: clearing the self rating keeps the verified level', tr3.j.tradeSkills.plumbing.level === null && tr3.j.tradeSkills.plumbing.verified === 3 && tr3.j.tradeSkills.plumbing.effective === 3);
// Availability: preset + custom days (deduped/sorted) + pause.
const av1 = await req('POST', '/api/me/availability', { token: W1, body: { preset: 'custom', days: [5, 1, 3, 3], paused: false } });
t('v41 availability: custom days are deduped + sorted', av1.status === 200 && JSON.stringify(av1.j.availability.days) === '[1,3,5]' && av1.j.availability.preset === 'custom');
const avBad = await req('POST', '/api/me/availability', { token: W1, body: { preset: 'whenever' } });
t('v41 availability: an unknown preset is rejected', avBad.status === 400);
// Full profile editing for the pre-existing account, prefilled fields.
const wp1 = await req('POST', '/api/me/worker-profile', { token: W1, body: { name: 'Worker Uno', phone: '(707) 555-0999', city: 'Vacaville', areas: 'Vacaville, Fairfield', skills: 'Plumbing, Carpentry' } });
const meW1b = await req('GET', '/api/me', { token: W1 });
t('v41 profile: existing worker edits name/phone/city/areas/skills post-login', wp1.status === 200 && meW1b.j.user.name === 'Worker Uno' && meW1b.j.user.phone === '(707) 555-0999' && meW1b.j.user.profile.city === 'Vacaville' && meW1b.j.user.profile.areas === 'Vacaville, Fairfield' && meW1b.j.user.profile.skills.includes('Carpentry') && meW1b.j.user.skills.includes('Carpentry'));
// Dispatch candidates: ranked by effective level + tools for the job's trade.
const cand = await req('GET', '/api/admin/worker-candidates?service=' + encodeURIComponent('Faucet replacement'), { token: A });
const candW41 = (cand.j.candidates || []).find(c => c.id === w41Id);
const candW1 = (cand.j.candidates || []).find(c => c.id === w1Id);
t('v41 candidates: a faucet job maps to the plumbing trade', cand.status === 200 && cand.j.trade === 'plumbing');
t('v41 candidates: best match first — self 4 + tools beats verified 3', cand.j.candidates[0].id === w41Id && candW41.level === 4 && candW41.tools === true && candW1.level === 3);
const candGen = await req('GET', '/api/admin/worker-candidates?service=' + encodeURIComponent('Whatever odd job'), { token: A });
t('v41 candidates: an unknown service falls back to the handyman box', candGen.j.trade === 'handyman');
const candCust = await req('GET', '/api/admin/worker-candidates?service=Faucet', { token: C1 });
t('v41 candidates: the picker data is admin-only', candCust.status === 403);
// Pause: flagged in the picker, excluded from board alerts, direct offers still land.
await req('POST', '/api/me/availability', { token: W41, body: { paused: true } });
const cand2 = await req('GET', '/api/admin/worker-candidates?service=' + encodeURIComponent('Faucet replacement'), { token: A });
t('v41 pause: the picker flags the paused worker (warning, not a block)', (cand2.j.candidates.find(c => c.id === w41Id) || {}).paused === true);
const boardJob = await req('POST', '/api/jobs', { token: A, body: { service: 'Board alert check job', city: 'Fairfield', payOffer: 70 } });
t('v41 alerts: board post created', boardJob.status === 201);
t('v41 alerts: an unpaused matching worker gets the board alert', (await notifTexts(W1)).some(x => x.includes('Board alert check job')));
t('v41 alerts: a PAUSED worker gets NO board alert', !(await notifTexts(W41)).some(x => x.includes('Board alert check job')));
const dirJob = await req('POST', '/api/jobs', { token: A, body: { service: 'Direct offer check job', city: 'Fairfield', payOffer: 88, assignedWorkerId: w41Id, silent: true } });
t('v41 alerts: a direct offer still reaches the paused worker in-app (Team override)', dirJob.status === 201 && (await notifTexts(W41)).some(x => x.includes('assigned you a job') && x.includes('Direct offer check job')));
t('v41 alerts: the direct offer does NOT leak to other workers', !(await notifTexts(W2)).some(x => x.includes('Direct offer check job')));
// Money view: w2 finishes his silent job from the E2 section (pay $110 was
// w1's; use a fresh one) — totals come from the existing payout stamps.
const mj = await req('POST', '/api/jobs', { token: A, body: { service: 'Money view job', city: 'Fairfield', payOffer: 120, assignedWorkerId: w2Id, silent: true } });
await req('PATCH', '/api/jobs/' + mj.j.job.id, { token: W2, body: { photosDone: true } });
const money = await req('GET', '/api/worker/money', { token: W2 });
const moneyEntry = (money.j.entries || []).find(e => e.jobId === mj.j.job.id);
t('v41 money: per-job entry + pending total come from the payout stamps', money.status === 200 && !!moneyEntry && moneyEntry.amount === 120 && moneyEntry.status === 'stripe_off' && money.j.totals.pending >= 120 && money.j.connect.connected === false);
const moneyCust = await req('GET', '/api/worker/money', { token: C1 });
t('v41 money: the money view is worker-only', moneyCust.status === 403);
// Captain view: the team list now carries trades + availability.
await req('POST', '/api/me/trades', { token: TECH, body: { tradeSkills: { plumbing: { level: 4, tools: true } } } });
await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: vacArea.id, workerId: capWid } });
const capView41 = await req('GET', '/api/me/captain', { token: CAP });
const tony = (capView41.j.team || []).find(w => w.name === 'Tech Tony');
t('v41 captains: team entries carry the 7-box trades + availability for route planning', !!tony && !!tony.trades && tony.trades.plumbing.effective === 4 && tony.trades.plumbing.tools === true && !!tony.availability && tony.availability.preset === 'anytime');
await req('POST', '/api/admin/captains/unassign', { token: A, body: { areaId: vacArea.id } });

// ---------------- v41 addendum: profile photo + brand pins + duty location ----------------
t('static v41 photo: server validates + stores the worker profile photo and the duty location feed', serverSrc.includes('function isPhotoDataUrl(') && serverSrc.includes('function workerPhotoOf(') && serverSrc.includes("error: 'photo must be an image'") && serverSrc.includes("p === '/api/me/location'") && serverSrc.includes("p === '/api/admin/worker-locations'") && serverSrc.includes('WORKER_LOC_FRESH_MS = 10 * 60 * 1000'));
t('static v41 photo: pubUser exposes the photo to workers only + signup cannot smuggle one in', serverSrc.includes("photo: u.role === 'worker' ? workerPhotoOf(u) : undefined") && serverSrc.includes('delete prof.photo'));
t('static v41 photo: client avatar (initials fallback), photo editor, tech card and admin removal exist', htmlSrc.includes('function avatarHtml(') && htmlSrc.includes('function initialsOf(') && htmlSrc.includes('id="wp-photo"') && htmlSrc.includes('function wpPhotoChange(') && htmlSrc.includes('function wpPhotoRemove(') && htmlSrc.includes('function techCardHtml(') && htmlSrc.includes('function removeWorkerPhoto('));
t('static v41 pins: map pins are the photo avatar + hammer badge with a hammer fallback — never the car', htmlSrc.includes('function photoIcon(') && htmlSrc.includes('function hammerPinIcon(') && htmlSrc.includes('function techPinIcon(') && htmlSrc.includes('icon: techPinIcon(j)') && !htmlSrc.includes("pinIcon('🚗')"));
t('static v41 loc: trip gate + duty feed + worker status line + master map present', htmlSrc.includes('function requireTripLocation(') && htmlSrc.includes("tripLocRequired: 'Debes compartir tu ubicación para marcar En camino'") && htmlSrc.includes('function initDutySharing(') && htmlSrc.includes('id="workerLocLine"') && htmlSrc.includes("locLineOn: '📍 Compartiendo ubicación'") && htmlSrc.includes('id="adminMapBox"') && htmlSrc.includes('function loadAdminMap('));
t('vm v41 photo: initials fallback renders initials and no img without a photo', run("initialsOf('Trades Tara')") === 'TT' && run("avatarHtml(null, 'Trades Tara', 40)").includes('TT') && !run("avatarHtml(null, 'Trades Tara', 40)").includes('<img'));
t('vm v41 photo: avatar renders the photo img when one exists', run("avatarHtml('data:image/jpeg;base64,AAAA', 'Trades Tara', 40)").includes('<img') && run("avatarHtml('data:image/jpeg;base64,AAAA', 'Trades Tara', 40)").includes('data:image/jpeg'));
const PHOTO1 = 'data:image/jpeg;base64,' + 'QUJD'.repeat(30);
const PHOTO2 = 'data:image/png;base64,' + 'REVG'.repeat(30);
const setPh1 = await req('POST', '/api/me/worker-profile', { token: W41, body: { photo: PHOTO1 } });
t('v41 photo: worker sets his profile photo from the editor endpoint', setPh1.status === 200 && setPh1.j.user.photo === PHOTO1 && setPh1.j.user.profile.photo === PHOTO1);
const meW41ph = await req('GET', '/api/me', { token: W41 });
t('v41 photo: /api/me reads the photo back', meW41ph.j.user.photo === PHOTO1);
const phCust = await req('POST', '/api/me/worker-profile', { token: C1, body: { photo: PHOTO1 } });
const meC1ph = await req('GET', '/api/me', { token: C1 });
t('v41 photo: customers cannot set a photo (worker-only endpoint) and gain none', phCust.status === 403 && !meC1ph.j.user.photo);
const phBad1 = await req('POST', '/api/me/worker-profile', { token: W41, body: { photo: 'not-an-image' } });
const phBad2 = await req('POST', '/api/me/worker-profile', { token: W41, body: { photo: 'data:text/html;base64,QUJD' } });
const phBad3 = await req('POST', '/api/me/worker-profile', { token: W41, body: { photo: 'data:image/png;base64,' + 'A'.repeat(5000001) } });
const meW41ph2 = await req('GET', '/api/me', { token: W41 });
t('v41 photo: non-image, wrong-type and oversize payloads are 400 and the photo is untouched', phBad1.status === 400 && phBad2.status === 400 && phBad3.status === 400 && meW41ph2.j.user.photo === PHOTO1);
const meW2ph = await req('GET', '/api/me', { token: W2 });
t('v41 photo: setting a photo is self-only — another worker is unaffected', !meW2ph.j.user.photo);
const wlistPh = await req('GET', '/api/workers', { token: A });
t('v41 photo: the admin worker list carries the photo (admin card avatar)', ((wlistPh.j.workers || []).find(w => w.id === w41Id) || {}).photo === PHOTO1);
// Customer + admin tracking payloads: the photo rides along for the pin.
const jobPh = await req('POST', '/api/jobs', { token: A, body: { service: 'Photo tracking job', city: 'Fairfield', payOffer: 80, customerName: 'Cust One', customerPhone: '(707) 555-0101', address: '9 Photo St, Fairfield, CA', assignedWorkerId: w41Id, silent: true } });
const JPH = jobPh.j.job.id;
await req('PATCH', '/api/jobs/' + JPH, { token: W41, body: { status: 'On my way' } });
await req('POST', '/api/jobs/' + JPH + '/location', { token: W41, body: { lat: 38.25, lng: -122.03 } });
const custPh = await req('GET', '/api/jobs', { token: C1 });
const custJobPh = (custPh.j.jobs || []).find(x => x.id === JPH);
t('v41 photo: customer tracking payload has liveLoc + technician name + photo (and no pay)', !!custJobPh && !!custJobPh.liveLoc && custJobPh.technician === 'Trades Tara' && custJobPh.technicianPhoto === PHOTO1 && !('payOffer' in custJobPh));
const admPh = await req('GET', '/api/jobs', { token: A });
const admJobPh = (admPh.j.jobs || []).find(x => x.id === JPH);
t('v41 photo: admin tracking payload carries the technician photo for the map pin', !!admJobPh && admJobPh.technicianPhoto === PHOTO1);
await req('PATCH', '/api/jobs/' + JPH, { token: W41, body: { status: 'Arrived' } });
// No-photo worker: payload keeps liveLoc + name, photo absent (hammer pin).
const jobNp = await req('POST', '/api/jobs', { token: A, body: { service: 'No-photo tracking job', city: 'Fairfield', payOffer: 70, customerName: 'Cust One', customerPhone: '(707) 555-0101', address: '8 Plain St, Fairfield, CA', assignedWorkerId: w2Id, silent: true } });
const JNP = jobNp.j.job.id;
await req('PATCH', '/api/jobs/' + JNP, { token: W2, body: { status: 'On my way' } });
await req('POST', '/api/jobs/' + JNP + '/location', { token: W2, body: { lat: 38.24, lng: -122.02 } });
const custNp = await req('GET', '/api/jobs', { token: C1 });
const custJobNp = (custNp.j.jobs || []).find(x => x.id === JNP);
t('v41 photo: a worker WITHOUT a photo — payload has liveLoc + name and NO photo (hammer pin fallback)', !!custJobNp && !!custJobNp.liveLoc && custJobNp.technician === 'Worker Two' && !custJobNp.technicianPhoto);
await req('PATCH', '/api/jobs/' + JNP, { token: W2, body: { status: 'Arrived' } });
// Captain team entries carry the photo for the team-card avatar.
await req('POST', '/api/me/worker-profile', { token: TECH, body: { photo: PHOTO2 } });
await req('POST', '/api/admin/captains/assign', { token: A, body: { areaId: vacArea.id, workerId: capWid } });
const capViewPh = await req('GET', '/api/me/captain', { token: CAP });
const tonyPh = (capViewPh.j.team || []).find(w => w.name === 'Tech Tony');
t('v41 photo: captain team entries carry the tech photo (avatar)', !!tonyPh && tonyPh.photo === PHOTO2);
await req('POST', '/api/admin/captains/unassign', { token: A, body: { areaId: vacArea.id } });
// Admin removal (audit-logged) + worker self-removal.
const rmPh = await req('PATCH', '/api/workers/' + w41Id, { token: A, body: { photo: null } });
const meW41rm = await req('GET', '/api/me', { token: W41 });
const audPh = await req('GET', '/api/admin/audit', { token: A });
t('v41 photo: admin removes the photo (record cleared) and the removal is audit-logged', rmPh.status === 200 && !rmPh.j.worker.photo && !meW41rm.j.user.photo && (audPh.j.entries || []).some(e => e.action === 'worker.update' && (e.detail || '').includes('photo removed')));
await req('POST', '/api/me/worker-profile', { token: W41, body: { photo: PHOTO1 } });
const selfRm = await req('POST', '/api/me/worker-profile', { token: W41, body: { photo: null } });
const meW41self = await req('GET', '/api/me', { token: W41 });
t('v41 photo: the worker can remove his own photo', selfRm.status === 200 && !selfRm.j.user.photo && !meW41self.j.user.photo);
// ---------- Duty location feed + admin master map ----------
const locPost1 = await req('POST', '/api/me/location', { token: W2, body: { lat: 38.26, lng: -122.04 } });
t('v41 loc: a worker posts his logged-in location', locPost1.status === 200 && locPost1.j.sharing === true);
const locCust = await req('POST', '/api/me/location', { token: C1, body: { lat: 38.26, lng: -122.04 } });
t('v41 loc: the feed endpoint is worker-only (customer 403)', locCust.status === 403);
const locBadCoords = await req('POST', '/api/me/location', { token: W2, body: { lat: 999, lng: 0 } });
t('v41 loc: invalid coordinates are rejected', locBadCoords.status === 400);
const admLoc1 = await req('GET', '/api/admin/worker-locations', { token: A });
const admW2 = (admLoc1.j.workers || []).find(w => w.id === w2Id);
t('v41 loc: the admin master-map feed shows the fresh worker (coords + updatedAt; photo null when none)', admLoc1.status === 200 && !!admW2 && admW2.lat === 38.26 && admW2.lng === -122.04 && admW2.photo === null && !!admW2.updatedAt);
const admLocCust = await req('GET', '/api/admin/worker-locations', { token: C1 });
t('v41 loc: the master-map feed is admin-only (customer 403 — customers never see it)', admLocCust.status === 403);
await req('POST', '/api/me/location', { token: W1, body: { lat: 38.3, lng: -122.1 } });
const admLoc2 = await req('GET', '/api/admin/worker-locations', { token: A });
const admW2b = (admLoc2.j.workers || []).find(w => w.id === w2Id);
const admW1b = (admLoc2.j.workers || []).find(w => w.id === w1Id);
t('v41 loc: posts are self-scoped — each worker carries his own point', !!admW1b && admW1b.lat === 38.3 && !!admW2b && admW2b.lat === 38.26);
await req('POST', '/api/me/availability', { token: W2, body: { paused: true } });
const locPaused = await req('POST', '/api/me/location', { token: W2, body: { lat: 38.5, lng: -122.2 } });
const admLoc3 = await req('GET', '/api/admin/worker-locations', { token: A });
t('v41 loc: a PAUSED worker shares nothing (a post clears instead of storing; the map excludes him)', locPaused.status === 200 && locPaused.j.sharing === false && !(admLoc3.j.workers || []).some(w => w.id === w2Id));
await req('POST', '/api/me/availability', { token: W2, body: { paused: false } });
await req('POST', '/api/me/location', { token: W1, body: { lat: 38.31, lng: -122.11 } });
await req('POST', '/api/logout', { token: W1 });
const admLoc4 = await req('GET', '/api/admin/worker-locations', { token: A });
t('v41 loc: logout clears the worker point from the master map', !(admLoc4.j.workers || []).some(w => w.id === w1Id));


// ---------- v45 statics: estimate builder + member estimate page + reminder ----------
t('static v45: estimate lines carry a labor|material type (legacy defaults labor)', serverSrc.includes("it.type === 'material') ? 'material' : 'labor'") && serverSrc.includes('laborSubtotal') && serverSrc.includes('materialSubtotal'));
t('static v45: estimate discount + ASAP are computed on the LABOR subtotal', serverSrc.includes('money(labor * Math.max(0, Math.min(90') && serverSrc.includes('money(labor * 0.25)'));
t('static v45: materials flip the estimate copy to "Materials included"', serverSrc.includes('Materials are included in this estimate.') && serverSrc.includes('estimateHasMaterials('));
t('static v45: estimate carries validUntil + sentAt + remindedAt + photos + two options', serverSrc.includes('validUntil') && serverSrc.includes('remindedAt: null') && serverSrc.includes('isPhotoDataUrl') && serverSrc.includes('selectedOption'));
t('static v45: expired estimates cannot be approved', serverSrc.includes('estimateIsExpired(r.estimate)') && serverSrc.includes('this estimate has expired'));
t('static v45: estimate page has the membership block + member variant (labor-only discount)', serverSrc.includes('function memberVariantOfEstimate(') && serverSrc.includes('/member-apply') && serverSrc.includes('/member-check') && serverSrc.includes("'/api/stripe/homecare-subscribe'"));
t('static v45: estimate page follows the one-language EN|ES rule', serverSrc.includes('ghsEstLang') && serverSrc.includes('data-lang-btn'));
t('static v45: estimate endpoints — option pick, duplicate, nuevo estimado, preview', serverSrc.includes('/option$') && serverSrc.includes('duplicate-estimate') && serverSrc.includes('/api/admin/estimates/new') && serverSrc.includes('/api/admin/estimates/preview'));
t('static v45: 48h reminder sweep lives in the server, one-shot + audited', serverSrc.includes('function sweepEstimateReminders(') && serverSrc.includes('EST_REMIND_THROTTLE_MS') && serverSrc.includes("sendAutomation('estimate_reminder'") && serverSrc.includes("'estimate.reminder'"));
t('static v45: builder UI — menu picker, line types, options, photos, preview, duplicate, nuevo estimado', htmlSrc.includes('function renderEstMenuPicker(') && htmlSrc.includes('function estMenuAdd(') && htmlSrc.includes('data-est-type') && htmlSrc.includes('estOpt2-') && htmlSrc.includes('function estPhotosAdd(') && htmlSrc.includes('function previewEstimate(') && htmlSrc.includes('function duplicateEstimate(') && htmlSrc.includes('function newEstimate()') && htmlSrc.includes('id="neName"'));

// ---------------- v24 server instance 2: mock Stripe + mock Resend ----------------
// A5 (campaign source end-to-end) and A3 (receipt email) need Stripe and
// Resend; both APIs are mocked over HTTP via the app's own env base
// overrides (STRIPE_API_BASE / RESEND_API_BASE), against a second app
// instance with its own data file.
const BASE2 = 'http://127.0.0.1:8979';
const DATA_FILE2 = '/tmp/ghs-v17-test/data-v24.json';
const stripeState = { subs: {}, n: 0, connectTransfers: [], poorTransfers: true, pis: {}, refunds: [], sessions: {}, setis: {}, failPiCreates: 0 };
const stripeMock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  let raw = ''; for await (const c of req) raw += c;
  let form = {}; try { form = JSON.parse(raw || '{}'); } catch (e) { form = Object.fromEntries(new URLSearchParams(raw)); }
  if (u.pathname === '/__activate') { const sub = stripeState.subs[form.id]; if (sub) { sub.status = 'active'; const pi = sub.latest_invoice && sub.latest_invoice.payment_intent; if (pi && stripeState.pis[pi.id]) stripeState.pis[pi.id].status = 'succeeded'; const si = sub.pending_setup_intent; if (si && stripeState.setis[si]) stripeState.setis[si].status = 'succeeded'; } return send(200, { ok: true }); }
  if (u.pathname === '/__pi') { const pi = stripeState.pis[form.id]; if (pi && form.status) pi.status = form.status; return send(200, { ok: true }); }
  // v80.2: force the next N POST /payment_intents to fail (the
  // deposit step dying AFTER a membership activated — the exact
  // half-applied state the hotfix must make recoverable).
  if (u.pathname === '/__failpi') { stripeState.failPiCreates = Number(form.times || 1); return send(200, { ok: true }); }
  // v54: mark a stored Checkout session as paid — flips its subscription
  // active (subscription mode) or its PaymentIntent succeeded (payment).
  if (u.pathname === '/__session') { const s = stripeState.sessions[form.id]; if (s && form.paid) { s.payment_status = 'paid'; s.status = 'complete'; if (s.subscription && stripeState.subs[s.subscription]) { const sub = stripeState.subs[s.subscription]; sub.status = 'active'; const pi = sub.latest_invoice && sub.latest_invoice.payment_intent; if (pi && stripeState.pis[pi.id]) stripeState.pis[pi.id].status = 'succeeded'; } if (s.payment_intent && stripeState.pis[s.payment_intent]) { stripeState.pis[s.payment_intent].status = 'succeeded'; stripeState.pis[s.payment_intent].amount_received = stripeState.pis[s.payment_intent].amount; } } return send(200, { ok: true }); }
  // v80.7: force POST /refunds to fail for ONE payment_intent (the
  // refund dying midway — the partial-recording pin needs a leg to die).
  if (u.pathname === '/__failrefund') { stripeState.failRefundPi = form.pi || ''; return send(200, { ok: true }); }
  if (req.method === 'POST' && u.pathname.replace(/^\/v1/, '') === '/refunds') { if (stripeState.failRefundPi && form.payment_intent === stripeState.failRefundPi) return send(402, { error: { message: 'mock: forced refund failure' } }); const rf = { id: 're_mock_' + (++stripeState.n), payment_intent: form.payment_intent || '', amount: Number(form.amount || 0), status: 'succeeded' }; stripeState.refunds.push(rf); return send(200, rf); }
  const path = u.pathname.replace(/^\/v1/, '');
  if (req.method === 'POST' && path === '/customers') return send(200, { id: 'cus_mock_' + (++stripeState.n) });
  if (req.method === 'GET' && path.startsWith('/customers/')) return send(200, { id: path.split('/')[2] });
  if (req.method === 'POST' && path === '/subscriptions') {
    const n = ++stripeState.n;
    const sub = { id: 'sub_mock_' + n, status: 'incomplete', customer: form.customer || '', trial_period_days: form.trial_period_days || '', metadata: { userId: form['metadata[userId]'] || '', kind: form['metadata[kind]'] || '', plan: form['metadata[plan]'] || '' }, items: { data: [{ id: 'si_mock_' + n, price: { id: form['items[0][price]'] || '' } }] }, latest_invoice: { id: 'in_mock_' + n, payment_intent: { id: 'pi_mock_' + n, client_secret: 'pi_mock_' + n + '_secret_x', status: 'requires_confirmation' } } };
    // v80.2: model REAL Stripe trial behavior — a subscription
    // created WITH trial_period_days starts 'trialing', its $0 first
    // invoice carries NO PaymentIntent, and the card is collected via
    // a pending SetupIntent. (The pre-v80.2 mock always returned a
    // PaymentIntent, which is why the suite never saw the production
    // join failure.)
    if (form.trial_period_days) {
      sub.status = 'trialing';
      sub.latest_invoice.payment_intent = null;
      sub.pending_setup_intent = 'seti_mock_' + n;
      stripeState.setis['seti_mock_' + n] = { id: 'seti_mock_' + n, client_secret: 'seti_mock_' + n + '_secret_x', status: 'requires_payment_method' };
    }
    stripeState.subs[sub.id] = sub;
    stripeState.pis['pi_mock_' + n] = { id: 'pi_mock_' + n, status: 'requires_confirmation', amount: 0, metadata: {} };
    return send(200, sub);
  }
  if (req.method === 'GET' && path.startsWith('/setup_intents/')) { const si = stripeState.setis[path.split('/')[2]]; return si ? send(200, si) : send(404, { error: { message: 'no such setup_intent' } }); }
  if (req.method === 'GET' && path.startsWith('/subscriptions/')) { const sub = stripeState.subs[path.split('/')[2]]; return sub ? send(200, sub) : send(404, { error: { message: 'no such subscription' } }); }
  const updM = path.match(/^\/subscriptions\/([^/]+)$/);
  if (req.method === 'POST' && updM) {
    const sub = stripeState.subs[updM[1]];
    if (!sub) return send(404, { error: { message: 'no such subscription' } });
    if (form['items[0][price]']) sub.items.data[0].price.id = form['items[0][price]'];
    if (form['metadata[plan]']) sub.metadata.plan = form['metadata[plan]'];
    if (form['metadata[kind]']) sub.metadata.kind = form['metadata[kind]'];
    if (form['cancel_at_period_end'] === 'true') { sub.cancel_at_period_end = true; sub.cancel_at = Math.floor(Date.now() / 1000) + 30 * 86400; sub.current_period_end = sub.cancel_at; }
    if (form['cancel_at_period_end'] === 'false') { sub.cancel_at_period_end = false; sub.cancel_at = null; }
    return send(200, sub);
  }
  if (req.method === 'POST' && /^\/subscriptions\/[^/]+\/cancel$/.test(path)) { const sub = stripeState.subs[path.split('/')[2]]; if (sub) sub.status = 'canceled'; return send(200, sub || {}); }
  // v54: checkout sessions are STATEFUL — stored, retrievable, and only
  // "paid" once a test marks them via /__session. Subscription sessions
  // create a real (incomplete) subscription, like Stripe does.
  if (req.method === 'POST' && path === '/checkout/sessions') {
    const n = ++stripeState.n;
    const md = {}; for (const k of Object.keys(form)) { const m = /^metadata\[(.+)\]$/.exec(k); if (m) md[m[1]] = form[k]; }
    const sess = { id: 'cs_mock_' + n, url: 'https://checkout.mock/pay/cs_mock_' + n, mode: form.mode || 'payment', status: 'open', payment_status: 'unpaid', metadata: md, customer_email: form.customer_email || '', customer: form.customer || '', subscription: '', payment_intent: '', amount_total: null,
      // v80 piece 4: capture what the server told Stripe about language
      // + consent copy so tests can pin locale + custom_text.
      locale: form.locale || '', customText: { submit: form['custom_text[submit][message]'] || '', afterSubmit: form['custom_text[after_submit][message]'] || '' } };
    if (sess.mode === 'subscription') {
      const sn = ++stripeState.n;
      const cus = sess.customer || ('cus_mock_' + (++stripeState.n));
      sess.customer = cus;
      const subMd = {}; for (const k of Object.keys(form)) { const m = /^subscription_data\[metadata\]\[(.+)\]$/.exec(k); if (m) subMd[m[1]] = form[k]; }
      const sub = { id: 'sub_mock_' + sn, status: 'incomplete', customer: cus, metadata: { userId: subMd.userId || md.userId || '', kind: subMd.kind || md.kind || '', plan: subMd.plan || md.plan || '' }, items: { data: [{ id: 'si_mock_' + sn, price: { id: form['line_items[0][price]'] || '' } }] }, latest_invoice: { id: 'in_mock_' + sn, payment_intent: { id: 'pi_mock_' + sn, client_secret: 'pi_mock_' + sn + '_secret_x', status: 'requires_confirmation' } } };
      stripeState.subs[sub.id] = sub;
      stripeState.pis['pi_mock_' + sn] = { id: 'pi_mock_' + sn, status: 'requires_confirmation', amount: 0, metadata: {} };
      sess.subscription = sub.id;
      sess.payment_intent = 'pi_mock_' + sn;
      // Stripe reports amount_total as what is due TODAY: the plan's
      // first period (0 under a trial) plus any one-time line items
      // (v70: the cart deposit riding the combined session).
      const PRICE_AMTS = { price_hc_mock: 2900, price_1UTmMwLu9cCIcixBELdMhHh3: 7500, price_1UTmQtLu9cCIcixBkCpLd2k2: 15000, price_1UTmS6Lu9cCIcixB312eNpYF: 10000, price_1UTmSKLu9cCIcixBmcSF51Cm: 17500 };
      let amt70 = form['subscription_data[trial_period_days]'] ? 0 : (PRICE_AMTS[form['line_items[0][price]'] || ''] || 0);
      for (let i = 0; i < 4; i++) { const pd = form['line_items[' + i + '][price_data][unit_amount]']; if (pd) amt70 += Number(pd) || 0; }
      sess.amount_total = amt70;
    } else {
      const amt = Number(form['line_items[0][price_data][unit_amount]'] || 0) + Number(form['line_items[1][price_data][unit_amount]'] || 0);
      const pn = ++stripeState.n;
      const pim = {}; for (const k of Object.keys(form)) { const m = /^payment_intent_data\[metadata\]\[(.+)\]$/.exec(k); if (m) pim[m[1]] = form[k]; }
      if (!pim.kind && md.kind) pim.kind = md.kind;
      if (md.requestId && !pim.requestId) pim.requestId = md.requestId;
      if (md.cartId && !pim.cartId) pim.cartId = md.cartId;
      if (md.holdKey && !pim.holdKey) pim.holdKey = md.holdKey;
      const pi = { id: 'pi_mock_' + pn, client_secret: 'pi_mock_secret_' + pn, amount: amt, amount_received: 0, status: form['payment_intent_data[capture_method]'] === 'manual' ? 'requires_capture' : 'requires_payment_method', capture_method: form['payment_intent_data[capture_method]'] || 'automatic', metadata: pim, latest_charge: null };
      stripeState.pis[pi.id] = pi;
      sess.payment_intent = pi.id;
      sess.amount_total = amt;
    }
    stripeState.sessions[sess.id] = sess;
    return send(200, sess);
  }
  if (req.method === 'GET' && path.startsWith('/checkout/sessions/')) { const s = stripeState.sessions[path.split('/')[3]]; return s ? send(200, s) : send(404, { error: { message: 'no such checkout session' } }); }
  // v55: session expiry — an open session flips to 'expired'; GET then
  // reports it, exactly like Stripe. Unknown id -> 404.
  if (req.method === 'POST' && /^\/checkout\/sessions\/[^/]+\/expire$/.test(path)) { const s = stripeState.sessions[path.split('/')[3]]; if (!s) return send(404, { error: { message: 'no such checkout session' } }); if (s.status === 'open') s.status = 'expired'; return send(200, s); }
  const capM = path.match(/^\/payment_intents\/([^/]+)\/capture$/);
  if (req.method === 'POST' && capM) {
    if (capM[1].includes('fail')) return send(402, { error: { message: 'Your card was declined.' } });
    return send(200, { id: capM[1], amount_received: Number(form.amount_to_capture || 0) });
  }
  const pcCancelM = path.match(/^\/payment_intents\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && pcCancelM) { const pi = stripeState.pis[pcCancelM[1]]; if (!pi) return send(404, { error: { message: 'no such payment_intent' } }); if (pi.status === 'succeeded') return send(402, { error: { message: 'You cannot cancel a PaymentIntent with a status of succeeded.' } }); pi.status = 'canceled'; return send(200, pi); }
  if (req.method === 'POST' && path === '/payment_intents') { if (stripeState.failPiCreates > 0) { stripeState.failPiCreates--; return send(402, { error: { message: 'mock: forced payment_intent failure' } }); } const pi = { id: 'pi_mock_' + (++stripeState.n), client_secret: 'pi_mock_secret_' + stripeState.n, amount: Number(form.amount || 0), status: 'requires_capture', capture_method: form.capture_method || 'automatic', metadata: { requestId: form['metadata[requestId]'] || '', holdKey: form['metadata[holdKey]'] || '', kind: form['metadata[kind]'] || '', cartId: form['metadata[cartId]'] || '', checkoutId: form['metadata[checkoutId]'] || '' }, latest_charge: null }; stripeState.pis[pi.id] = pi; return send(200, pi); }
  if (req.method === 'GET' && path.startsWith('/payment_intents/')) { const pid = path.split('/')[2]; if (stripeState.pis[pid]) return send(200, stripeState.pis[pid]); return send(200, { id: pid, status: 'succeeded' }); }
  if (req.method === 'GET' && path.startsWith('/invoices/')) { const invId = path.split('/')[2]; const owner = Object.values(stripeState.subs).find(s => s.latest_invoice && s.latest_invoice.id === invId); if (owner) { const pi = owner.latest_invoice.payment_intent; return send(200, { id: invId, status: owner.status === 'active' ? 'paid' : 'open', payment_intent: typeof pi === 'string' ? pi : ((pi && pi.id) || '') }); } return send(200, { id: invId, status: 'paid', payment_intent: 'pi_mock_paid' }); }
  if (req.method === 'GET' && path.startsWith('/prices/')) return send(200, { id: path.split('/')[2], unit_amount: 2900, recurring: { interval: 'month' }, active: true });
  if (req.method === 'GET' && path.startsWith('/products/')) return send(200, { id: path.split('/')[2] });
  if (req.method === 'GET' && path === '/account') { stripeState.accountHits = (stripeState.accountHits || 0) + 1; return send(200, { id: 'acct_mock_health', livemode: false }); }
  if (req.method === 'POST' && path === '/accounts') { const poor = String(form.email || '').includes('poor'); return send(200, { id: poor ? 'acct_mock_poor' : 'acct_mock_' + (++stripeState.n) }); }
  if (req.method === 'GET' && path.startsWith('/accounts/')) return send(200, { id: path.split('/')[2], payouts_enabled: true, details_submitted: true });
  if (req.method === 'POST' && path === '/account_links') return send(200, { url: 'https://connect.mock/onboarding' });
  if (req.method === 'POST' && path === '/transfers') { if (form.destination === 'acct_mock_poor' && stripeState.poorTransfers) return send(402, { error: { message: 'insufficient available funds in Stripe account' } }); const tr = { id: 'tr_mock_' + (++stripeState.n), amount: Number(form.amount || 0), destination: form.destination || '' }; stripeState.connectTransfers.push(tr); return send(200, tr); }
  return send(404, { error: { message: 'mock stripe: unhandled ' + req.method + ' ' + path } });
});
await new Promise(r => stripeMock.listen(8980, r));
const resendState = { emails: [], fail: false };
const resendMock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let raw = ''; for await (const c of req) raw += c;
  if (u.pathname === '/__emails') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(resendState.emails)); }
  if (u.pathname === '/__fail') { resendState.fail = raw.includes('true'); res.writeHead(200); return res.end('{}'); }
  if (u.pathname === '/emails' && req.method === 'POST') {
    if (resendState.fail) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'mock resend failure' })); }
    let body = {}; try { body = JSON.parse(raw || '{}'); } catch (e) {}
    resendState.emails.push(body);
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 'em_' + resendState.emails.length }));
  }
  res.writeHead(404); res.end();
});
await new Promise(r => resendMock.listen(8981, r));
function spawnApp2() {
  return spawn('node', ['server.js'], {
    cwd: APP_DIR,
    env: Object.assign({}, process.env, {
      PORT: '8979', DATA_FILE: DATA_FILE2, NOMINATIM_BASE: 'http://127.0.0.1:' + GEO_PORT,
      SSE_HEARTBEAT_MS: '300', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '',
      STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_API_BASE: 'http://127.0.0.1:8980/v1',
      STRIPE_PRICE_HOMECARE: 'price_hc_mock', STRIPE_WEBHOOK_SECRET: 'whsec_mock_test',
      RESEND_API_KEY: 're_mock', RESEND_API_BASE: 'http://127.0.0.1:8981'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
}
async function waitHealth2() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE2 + '/api/health'); if (r.ok) return; } catch (e) {} await sleep(250); }
  throw new Error('app2 did not come up');
}
async function req2(method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const r = await fetch(BASE2 + p, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
async function mockActivate(subId) { await fetch('http://127.0.0.1:8980/__activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: subId }) }); }
async function mockFailPiOnce() { await fetch('http://127.0.0.1:8980/__failpi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ times: 1 }) }); }
async function mockPiStatus(id, status) { await fetch('http://127.0.0.1:8980/__pi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); }
async function mockSessionPaid(id) { await fetch('http://127.0.0.1:8980/__session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, paid: true }) }); }
const sessionForCart = (cartId, mode) => Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.cartId === cartId && (!mode || s.mode === mode)).slice(-1)[0];
const sessionForEstimate = (estId, mode) => Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.estimateId === estId && (!mode || s.mode === mode)).slice(-1)[0];
try { fs.unlinkSync(DATA_FILE2); } catch (e) {}
let child2 = spawnApp2();
child2.stderr.on('data', d => process.stderr.write('[app2] ' + d));
await waitHealth2();
const adm2 = await req2('POST', '/api/setup-admin', { body: { name: 'Team Admin', email: 'admin2@t.local', phone: '(707) 555-0000', password: 'adminpass1' } });
const adm2Login = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
const A2 = adm2Login.j.token;
t('v24 app2: mock-backed instance boots + admin login', adm2.status === 201 && !!A2);
async function mkMember(email, phone) {
  const su = await req2('POST', '/api/signup', { body: { name: 'Member ' + email, email, phone, password: 'memberpass1', role: 'customer', serviceAddress: '1 Main St, Fairfield, CA' } });
  const li = await req2('POST', '/api/login', { body: { email, password: 'memberpass1' } });
  return { id: su.j.user.id, token: li.j.token };
}
async function customersByEmail() {
  const c = await req2('GET', '/api/customers', { token: A2 });
  const out = {};
  (c.j.customers || []).forEach(u => { out[u.email] = u; });
  return out;
}
// A5: direct join (subscribe -> confirm) stores the sanitized source
const m1 = await mkMember('m1@t.local', '(707) 555-0301');
const sub1 = await req2('POST', '/api/stripe/membership-subscribe', { token: m1.token, body: { plan: 'yard1', source: 'INSTA1' } });
t('v24 A5: membership-subscribe accepts the join (mock Stripe)', sub1.status === 200 && !!sub1.j.subscriptionId);
await mockActivate(sub1.j.subscriptionId);
const conf1 = await req2('POST', '/api/stripe/membership-confirm', { token: m1.token, body: { plan: 'yard1' } });
t('v24 A5: membership-confirm activates the plan', conf1.status === 200 && conf1.j.active === true);
let cust = await customersByEmail();
t('v24 A5: source stored at activation + visible to admin (vía INSTA1)', !!cust['m1@t.local'] && cust['m1@t.local'].source === 'INSTA1');
// A5: an invalid code is sanitized away (orgánico)
const m2 = await mkMember('m2@t.local', '(707) 555-0302');
const sub2 = await req2('POST', '/api/stripe/membership-subscribe', { token: m2.token, body: { plan: 'plus1', source: 'bad code!!' } });
await mockActivate(sub2.j.subscriptionId);
await req2('POST', '/api/stripe/membership-confirm', { token: m2.token, body: { plan: 'plus1' } });
cust = await customersByEmail();
t('v24 A5: invalid source is sanitized to null (orgánico)', !!cust['m2@t.local'] && cust['m2@t.local'].source === null && cust['m2@t.local'].membershipPlan.status === 'active');
// A5: webhook activation path records it too
const m3 = await mkMember('m3@t.local', '(707) 555-0303');
const sub3 = await req2('POST', '/api/stripe/membership-subscribe', { token: m3.token, body: { plan: 'yard2', source: 'TIKTOK9' } });
await mockActivate(sub3.j.subscriptionId);
const nodeCrypto = await import('node:crypto');
const whPayload = JSON.stringify({ id: 'evt_wh_1', type: 'checkout.session.completed', data: { object: { id: 'cs_wh_1', metadata: { userId: m3.id, kind: 'yardcare', plan: 'yard2' }, customer: 'cus_mock_x', subscription: sub3.j.subscriptionId, amount_total: 15000 } } });
const whTs = Math.floor(Date.now() / 1000);
const whSig = nodeCrypto.createHmac('sha256', 'whsec_mock_test').update(whTs + '.' + whPayload, 'utf8').digest('hex');
const whRes = await fetch(BASE2 + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=' + whTs + ',v1=' + whSig }, body: whPayload });
t('v24 A5: signed checkout webhook accepted', whRes.status === 200);
cust = await customersByEmail();
t('v24 A5: webhook activation stored the source + activated yard2', !!cust['m3@t.local'] && cust['m3@t.local'].source === 'TIKTOK9' && cust['m3@t.local'].membershipPlan.planKey === 'yard2');
// A5: the first source wins — a later join with another code never overwrites
const subH = await req2('POST', '/api/stripe/homecare-subscribe', { token: m1.token, body: { source: 'FACEBOOK1' } });
t('v24 A5: homecare-subscribe accepts a join body with source', subH.status === 200 && !!subH.j.subscriptionId);
await mockActivate(subH.j.subscriptionId);
const confH = await req2('POST', '/api/stripe/homecare-confirm', { token: m1.token, body: {} });
t('v24 A5 (v80.7 #9 supersedes): homecare-confirm REFUSES — m1\'s only live subscription is the YARD one, so no HomeCare activates off it', confH.status === 400);
cust = await customersByEmail();
t('v24 A5: existing source is NEVER overwritten (INSTA1 survives)', !!cust['m1@t.local'] && cust['m1@t.local'].source === 'INSTA1');

// ---------------- v25: B2 proposals, B1 worker yard flow, C1 ratings ----------------
t('static v25: proposal generator + hooks at activation / sync / plan change', serverSrc.includes('function ensureYardVisitProposals(') && serverSrc.includes('ensureYardVisitProposals(u)') && serverSrc.includes('ensureYardVisitProposals(user)'));
t('static v25: worker yard endpoints + serializer exist', serverSrc.includes("p === '/api/worker/yard-visits'") && serverSrc.includes('workerYardVisit'));
t('static v25: yard.assigned SSE emitter + client listener', serverSrc.includes('function emitYardAssigned(') && htmlSrc.includes("addEventListener('yard.assigned'"));
t('static v25: internal yard pay is a named $50 constant', serverSrc.includes('YARD_WORKER_PAY = 50'));
t('static v25: ratings endpoints exist', serverSrc.includes('JOB_COMPLETED_STATUS') && serverSrc.includes("p === '/api/admin/ratings'"));
t('static v25: client worker yard panel + rating UI + calendar worker picker', htmlSrc.includes('id="workerYardVisits"') && htmlSrc.includes('function loadWorkerYardVisits(') && htmlSrc.includes('function ratingHtml(') && htmlSrc.includes('ycAssignVisit'));
// ---- v26 statics ----
t('static v26: privacy view follows the v21 info pattern (box + route + render)', htmlSrc.includes('id="privacyBox"') && htmlSrc.includes('function isPrivacyRoute(') && htmlSrc.includes("location.hash === '#privacy'") && htmlSrc.includes("document.getElementById('privacyBox')"));
t('static v26: privacy is footer-linked + cross-linked with Terms', htmlSrc.includes('<a href="#privacy">Privacy Policy</a>') && htmlSrc.includes('our <a href="#privacy">Privacy Policy</a>') && htmlSrc.includes('Privacy Policy') && htmlSrc.includes('Last updated: October 2026'));
t('static v26: privacy states the processor list + never-sell + latest-point location rule', htmlSrc.includes('OpenStreetMap / Nominatim') && htmlSrc.includes('never sell your personal data') && htmlSrc.includes('single latest point') && htmlSrc.includes('we never see or store your full card number'));
t('static v26: privacy carries the account-deletion section + email alternative', htmlSrc.includes('Delete your account') && htmlSrc.includes('generalhandymans@gmail.com'));
t('static v26: delete-account endpoint with typed-email confirm + anonymize + session kill', serverSrc.includes("p === '/api/me/delete-account'") && serverSrc.includes('confirmEmail') && serverSrc.includes("'Deleted user'") && serverSrc.includes('invalidateSessionsFor(uid)'));
t('static v26: delete-account UI painted for all roles (3 slots)', htmlSrc.includes('id="delAcctSlotC"') && htmlSrc.includes('id="delAcctSlotW"') && htmlSrc.includes('id="delAcctSlotA"') && htmlSrc.includes('function paintDeleteAccount(') && htmlSrc.includes('function doDeleteAccount(') && htmlSrc.includes('Your account has been deleted'));
// ---- v27 statics ----
t('static v27: SW navigations/documents are network-first with cache fallback', swSrc.includes("e.request.mode === 'navigate'") && swSrc.includes("e.request.destination === 'document'") && swSrc.includes('NETWORK-FIRST') && swSrc.includes('caches.match(e.request)'));
t('static v27: SW still never caches /api/ and keeps stale-while-revalidate for static assets', swSrc.includes("url.pathname.startsWith('/api/')") && swSrc.includes('return hit || fresh'));
t('static v27: registration reloads once per session on controllerchange', htmlSrc.includes("addEventListener('controllerchange'") && htmlSrc.includes("sessionStorage.getItem('ghsSwReloaded')") && htmlSrc.includes("sessionStorage.setItem('ghsSwReloaded', '1')") && htmlSrc.includes('location.reload()'));
t('static v27: registration checks for SW updates when the tab becomes visible', htmlSrc.includes('__ghsSwReg') && htmlSrc.includes('__ghsSwReg.update()') && htmlSrc.includes("document.visibilityState === 'visible'"));
t('static v27: share links live in one dark panel of compact rows', htmlSrc.includes('id="shareLinksPanel"') && htmlSrc.includes('class="share-panel"') && htmlSrc.includes('.share-panel{background:#141414') && htmlSrc.includes('class="share-row"') && htmlSrc.includes('.share-url{display:block;color:#8f8a81') && htmlSrc.includes('.share-copy{flex:none;width:auto;background:#e42535'));
// ---- v28 statics (acabados / design unification) ----
t('static v28: brand red unified to #e42535 (no legacy #e10600 left in the page)', !htmlSrc.includes('#e10600') && htmlSrc.includes('--red:#e42535'));
t('static v28: acabados layer carries the design tokens', htmlSrc.includes('v28 ACABADOS') && htmlSrc.includes('--panel:#141414') && htmlSrc.includes('--green:#2fbf71') && htmlSrc.includes('--field-line:#d8d2c8'));
t('static v28: plan toggle cards conformed to the dark standard', htmlSrc.includes('.plan-card{background:var(--panel);border:2px solid var(--red)') && htmlSrc.includes('.plan-card .plan-price{font-size:37px;color:var(--red)') && htmlSrc.includes('.plan-card>button{width:100%;border-radius:10px'));
t('static v28: dark panel utilities + payment panel + designed empty states exist', htmlSrc.includes('.panel-dark{background:var(--panel)') && htmlSrc.includes('.pay-panel{') && htmlSrc.includes('.empty{border:1.5px dashed var(--field-line)'));
t('static v28: membership status cards use the dark panels', htmlSrc.includes('class="card panel-dark panel-green"') && htmlSrc.includes('class=\"card panel-dark\"'));
t('static v28: empty states wrapped in .empty blocks, same words', ['No invoices yet.','No requests yet.','No notifications yet.','No workers yet.','No jobs yet.'].every(w => htmlSrc.includes('<div class="empty"><p class="mut">' + w + '</p></div>')) && htmlSrc.includes("'<div class=\"empty\"><p class=\"mut\">'+WT('yardNone')+'</p></div>'"));
t('static v27: share panel has one red Copy control for each of the 5 join links', ['homecare', 'yard1', 'yard2', 'plus1', 'plus2'].every(k => htmlSrc.includes("copyShareLink('https://app.generalhandymans.app/#join-" + k + "', this)")) && (htmlSrc.match(/class="share-copy"/g) || []).length === 5);
t('static v27: no raw signup URL sprawled as visible text, no old ghost copy buttons remain', !htmlSrc.includes('>https://app.generalhandymans.app/#join-') && !htmlSrc.includes('class="copy-link"') && !htmlSrc.includes('Copy signup link'));
t('static v27: share panel rows name the plan + price', htmlSrc.includes('HomeCare — $29/mo') && htmlSrc.includes('Yard Care — 1 visit · $75/mo') && htmlSrc.includes('Yard Care — 2 visits · $150/mo') && htmlSrc.includes('HomeCare Plus — 1 yard visit · $100/mo') && htmlSrc.includes('HomeCare Plus — 2 yard visits · $175/mo'));

async function wh2(type, object) {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2, 9), type, data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = nodeCrypto.createHmac('sha256', 'whsec_mock_test').update(ts + '.' + payload, 'utf8').digest('hex');
  return fetch(BASE2 + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=' + ts + ',v1=' + sig }, body: payload });
}
async function loginCookie2(email, password) {
  const r = await fetch(BASE2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  return sc.length ? sc[0].split(';')[0] : null;
}
function sseConnect2(cookie) {
  return new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port: 8979, path: '/api/events', headers: { Cookie: cookie } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('sse2 status ' + res.statusCode)); }
      const c = { req: r, res, buf: '', raw: '', events: [], waiters: [] };
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        c.raw += chunk; c.buf += chunk;
        let idx;
        while ((idx = c.buf.indexOf('\n\n')) >= 0) {
          const block = c.buf.slice(0, idx); c.buf = c.buf.slice(idx + 2);
          let type = null, data = null;
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (type) { const ev = { type, data: data ? JSON.parse(data) : null }; c.events.push(ev); c.waiters = c.waiters.filter(w => !w(ev)); }
        }
      });
      resolve(c);
    });
    r.on('error', reject);
  });
}

// ---- B2: proposals generated by memberships (app2) ----
const periodStr = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
async function adminYardVisits2() { const r = await req2('GET', '/api/admin/yard-visits?from=2000-01-01&to=2999-12-31', { token: A2 }); return r.j.visits || []; }
const autoProps = (list, uid, planKey) => list.filter(v => v.userId === uid && v.source === 'auto' && (!planKey || v.planKey === planKey));
let yvAll = await adminYardVisits2();
t('v25 B2: yard1 activation (m1) generated exactly 1 proposal', autoProps(yvAll, m1.id).length === 1 && autoProps(yvAll, m1.id)[0].status === 'proposed' && autoProps(yvAll, m1.id)[0].period === periodStr && autoProps(yvAll, m1.id)[0].planKey === 'yard1');
t('v25 B2: plus1 activation (m2) generated exactly 1 proposal', autoProps(yvAll, m2.id).length === 1);
t('v25 B2: yard2 activation (m3) generated exactly 2 proposals', autoProps(yvAll, m3.id).length === 2 && autoProps(yvAll, m3.id).every(v => v.status === 'proposed' && !v.assignedWorkerId));
const m4 = await mkMember('m4@t.local', '(707) 555-0304');
const sub4 = await req2('POST', '/api/stripe/membership-subscribe', { token: m4.token, body: { plan: 'yard1' } });
await mockActivate(sub4.j.subscriptionId);
const conf4 = await req2('POST', '/api/stripe/membership-confirm', { token: m4.token, body: { plan: 'yard1' } });
t('v25 B2: fresh yard1 member activates', conf4.status === 200 && conf4.j.active === true);
yvAll = await adminYardVisits2();
t('v25 B2: fresh yard1 member has exactly 1 auto proposal', autoProps(yvAll, m4.id).length === 1);
const updRes = await wh2('customer.subscription.updated', { id: sub4.j.subscriptionId, status: 'active', created: Math.floor(Date.now() / 1000), cancel_at: null, cancel_at_period_end: false, metadata: { userId: m4.id, kind: 'yardcare', plan: 'yard1' }, items: { data: [{ id: 'si_mock_x', price: { id: 'price_1UT2thLu9cCIcixBDpOWl0YO' } }] } });
t('v25 B2: subscription.updated webhook accepted', updRes.status === 200);
yvAll = await adminYardVisits2();
t('v25 B2: dedupe — still exactly 1 proposal after the sync replay', autoProps(yvAll, m4.id).length === 1);
const m5 = await mkMember('m5@t.local', '(707) 555-0305');
const sub5h = await req2('POST', '/api/stripe/homecare-subscribe', { token: m5.token, body: {} });
await mockActivate(sub5h.j.subscriptionId);
const conf5h = await req2('POST', '/api/stripe/homecare-confirm', { token: m5.token, body: {} });
t('v25 B2: homecare member activates', conf5h.status === 200 && conf5h.j.active === true);
yvAll = await adminYardVisits2();
t('v25 B2: HomeCare-only membership generates NO yard proposals', autoProps(yvAll, m5.id).length === 0 && !yvAll.some(v => v.userId === m5.id));
const chg5 = await req2('POST', '/api/me/membership/change', { token: m5.token, body: { plan: 'plus2' } });
t('v25 B2: plan change homecare -> plus2 succeeds', chg5.status === 200 && !!chg5.j.plan && chg5.j.plan.planKey === 'plus2');
yvAll = await adminYardVisits2();
t('v25 B2: changing INTO a yard plan generates its 2 proposals', autoProps(yvAll, m5.id, 'plus2').length === 2 && autoProps(yvAll, m5.id).every(v => v.status === 'proposed'));
const chg4 = await req2('POST', '/api/me/membership/change', { token: m4.token, body: { plan: 'yard2' } });
t('v25 B2: plan change yard1 -> yard2 succeeds', chg4.status === 200 && !!chg4.j.plan && chg4.j.plan.planKey === 'yard2');
yvAll = await adminYardVisits2();
const m4Y1 = autoProps(yvAll, m4.id, 'yard1');
const m4Y2 = autoProps(yvAll, m4.id, 'yard2');
t('v25 B2: yard2 gets 2 fresh proposals; the yard1 proposal is superseded (cancelled, not deleted)', m4Y2.length === 2 && m4Y2.every(v => v.status === 'proposed') && m4Y1.length === 1 && m4Y1[0].status === 'cancelled');
const can4 = await req2('POST', '/api/me/membership/cancel', { token: m4.token, body: {} });
t('v25 B2: member cancel accepted (ends at period end)', can4.status === 200 && !!can4.j.cancelAt);
const delRes = await wh2('customer.subscription.deleted', { id: sub4.j.subscriptionId, status: 'canceled', metadata: { userId: m4.id, kind: 'yardcare', plan: 'yard2' }, items: { data: [{ id: 'si_mock_x', price: { id: 'price_1UT2thLu9cCIcixBnC849V1o' } }] } });
t('v25 B2: subscription.deleted webhook accepted', delRes.status === 200);
yvAll = await adminYardVisits2();
const m4After = yvAll.filter(v => v.userId === m4.id);
t('v25 B2: cancelled membership — proposals stay visible, flagged with the membership state', m4After.length === 3 && m4After.every(v => v.plan && v.plan.status === 'cancelled'));

// ---- B1: worker yard flow (app2) ----
async function mkWorker2(email, phone, password) {
  const su = await req2('POST', '/api/signup', { body: { name: 'Worker ' + email, email, phone, password, role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Landscaping / yard'] } } });
  return su.j.user.id;
}
const wAId = await mkWorker2('wa@t.local', '(707) 555-0401', 'workpassA');
const wBId = await mkWorker2('wb@t.local', '(707) 555-0402', 'workpassB');
const wCId = await mkWorker2('wc@t.local', '(707) 555-0403', 'workpassC');
await req2('PATCH', '/api/workers/' + wAId, { token: A2, body: { status: 'active' } });
await req2('PATCH', '/api/workers/' + wBId, { token: A2, body: { status: 'active' } });
const wALogin = await req2('POST', '/api/login', { body: { email: 'wa@t.local', password: 'workpassA' } });
const wBLogin = await req2('POST', '/api/login', { body: { email: 'wb@t.local', password: 'workpassB' } });
const WA = wALogin.j.token, WB = wBLogin.j.token;
// v75 fixture note: WA claims board jobs in the flows below — under the
// new Connect unlock gate he needs his payouts set up first (the mock
// Stripe says payouts_enabled, like W3 in the Connect block).
await req2('POST', '/api/worker/connect/start', { token: WA, body: {} });
await req2('GET', '/api/worker/connect/status', { token: WA });
const wACookie = await loginCookie2('wa@t.local', 'workpassA');
const wBCookie = await loginCookie2('wb@t.local', 'workpassB');
const adm2Cookie = await loginCookie2('admin2@t.local', 'adminpass1');
yvAll = await adminYardVisits2();
const p1 = autoProps(yvAll, m5.id, 'plus2')[0];
t('v25 B1: setup — m5 has a proposed visit to work with', !!p1 && p1.status === 'proposed');
const confVisit = await req2('PATCH', '/api/admin/yard-visits/' + p1.id, { token: A2, body: { status: 'scheduled' } });
t('v25 B1: admin confirms a proposal -> scheduled', confVisit.status === 200 && confVisit.j.visit.status === 'scheduled');
const sseAdm2 = await sseConnect2(adm2Cookie);
const sseWA = await sseConnect2(wACookie);
const sseWB = await sseConnect2(wBCookie);
await sleep(150);
const asg = await req2('PATCH', '/api/admin/yard-visits/' + p1.id, { token: A2, body: { assignedWorkerId: wAId } });
t('v25 B1: admin assigns the visit -> status assigned + worker named', asg.status === 200 && asg.j.visit.status === 'assigned' && asg.j.visit.assignedWorkerId === wAId && !!asg.j.visit.assignedWorkerName);
const evAsg = await sseWait(sseWA, 'yard.assigned', d => d && d.visitId === p1.id).catch(() => null);
t('v25 B1: SSE yard.assigned reaches the assigned worker', !!evAsg);
t('v25 B1: SSE yard.assigned payload carries NO member PII', !!evAsg && !('address' in evAsg.data) && !('memberName' in evAsg.data) && !('email' in evAsg.data));
const evAsgAdm = await sseWait(sseAdm2, 'yard.assigned', d => d && d.visitId === p1.id).catch(() => null);
t('v25 B1: SSE yard.assigned reaches admin', !!evAsgAdm);
await sleep(500);
t('v25 B1: SSE yard.assigned does NOT reach the other worker', sseCount(sseWB, 'yard.assigned', d => d && d.visitId === p1.id) === 0);
try { sseAdm2.req.destroy(); sseWA.req.destroy(); sseWB.req.destroy(); } catch (e) {}
const wAVisits = await req2('GET', '/api/worker/yard-visits', { token: WA });
const wAVisit = (wAVisits.j.visits || []).find(v => v.id === p1.id);
t('v25 B1: assigned worker sees the visit with the released address + plan', !!wAVisit && wAVisit.address === '1 Main St, Fairfield, CA' && wAVisit.planName === 'HomeCare Plus' && wAVisit.status === 'assigned');
t('v25 B1: worker yard payload has NO member name/email/phone and NO workerPay', !!wAVisit && JSON.stringify(wAVisit).indexOf('m5@t.local') === -1 && JSON.stringify(wAVisit).indexOf('555-0305') === -1 && !('workerPay' in wAVisit) && !('memberName' in wAVisit));
const wBVisits = await req2('GET', '/api/worker/yard-visits', { token: WB });
t('v25 B1: the other worker sees NO yard visits', (wBVisits.j.visits || []).length === 0);
const custPatch = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: m5.token, body: { status: 'on_the_way' } });
t('v25 B1: a customer cannot drive the worker flow (403)', custPatch.status === 403);
const wBPatch = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WB, body: { status: 'on_the_way' } });
t('v25 B1: a non-assigned worker cannot advance the visit (403)', wBPatch.status === 403);
const jumpDone = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { status: 'done' } });
t('v25 B1: status order enforced — Assigned -> Done refused (409)', jumpDone.status === 409);
const jumpArr = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { status: 'arrived' } });
t('v25 B1: status order enforced — Assigned -> Arrived refused (409)', jumpArr.status === 409);
const omwV = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { status: 'on_the_way' } });
t('v25 B1: worker sets On my way', omwV.status === 200 && omwV.j.visit.status === 'on_the_way');
const badPhoto = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { beforePhoto: 'not-an-image' } });
t('v25 B1: a non-image photo upload is refused (400)', badPhoto.status === 400);
const upBefore = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { beforePhoto: 'data:image/jpeg;base64,BEFOREPHOTO' } });
t('v25 B1: BEFORE photo uploads', upBefore.status === 200 && upBefore.j.visit.beforePhoto === 'data:image/jpeg;base64,BEFOREPHOTO');
const arrV = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { status: 'arrived' } });
t('v25 B1: worker sets Arrived', arrV.status === 200 && arrV.j.visit.status === 'arrived');
const doneNoAfter = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { status: 'done' } });
t('v25 B1: Done refused without the AFTER photo (400)', doneNoAfter.status === 400);
const upAfter = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { afterPhoto: 'data:image/jpeg;base64,AFTERPHOTO' } });
t('v25 B1: AFTER photo uploads', upAfter.status === 200 && upAfter.j.visit.afterPhoto === 'data:image/jpeg;base64,AFTERPHOTO');
const doneV = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { status: 'done' } });
t('v25 B1: Done succeeds with both photos', doneV.status === 200 && doneV.j.visit.status === 'done' && !!doneV.j.visit.completedAt);
t('v25 B1: worker-facing Done payload still hides workerPay', !('workerPay' in (doneV.j.visit || {})));
const photoLate = await req2('PATCH', '/api/worker/yard-visits/' + p1.id, { token: WA, body: { beforePhoto: 'data:image/jpeg;base64,LATE' } });
t('v25 B1: photos are locked once done (409)', photoLate.status === 409);
yvAll = await adminYardVisits2();
const p1Admin = yvAll.find(v => v.id === p1.id);
t('v25 B1: admin sees completedAt + the internal $50 workerPay + both photos', !!p1Admin && p1Admin.workerPay === 50 && !!p1Admin.completedAt && p1Admin.beforePhoto === 'data:image/jpeg;base64,BEFOREPHOTO' && p1Admin.afterPhoto === 'data:image/jpeg;base64,AFTERPHOTO');
const meYard = await req2('GET', '/api/me/yard-visits', { token: m5.token });
t('v25 B1: member dashboard shows the last completed visit + AFTER photo as proof', !!meYard.j.lastCompleted && meYard.j.lastCompleted.id === p1.id && meYard.j.lastCompleted.afterPhoto === 'data:image/jpeg;base64,AFTERPHOTO');
t('v25 B1: $50 worker pay NEVER appears in the customer payload (and neither does the BEFORE photo)', JSON.stringify(meYard.j).indexOf('workerPay') === -1 && JSON.stringify(meYard.j).indexOf('BEFOREPHOTO') === -1);
yvAll = await adminYardVisits2();
const p2 = autoProps(yvAll, m5.id, 'plus2').find(v => v.id !== p1.id);
const asgBad = await req2('PATCH', '/api/admin/yard-visits/' + p2.id, { token: A2, body: { assignedWorkerId: wCId } });
t('v25 B1: assigning to a non-active (on-review) worker is refused (400)', asgBad.status === 400);
const postAssigned = await req2('POST', '/api/admin/yard-visits', { token: A2, body: { userId: m5.id, date: p2.date, notes: 'gate 42', assignedWorkerId: wBId } });
t('v25 B1: admin can create a visit already assigned', postAssigned.status === 201 && postAssigned.j.visit.status === 'assigned' && postAssigned.j.visit.assignedWorkerId === wBId);

// ---- C1: ratings (instance 1 — J1 was completed by W1 for C1 earlier) ----
const openJobR = await mkJob('(707) 555-0101');
const JR = openJobR.j.job.id;
const rateEarly = await req('POST', '/api/jobs/' + JR + '/rating', { token: C1, body: { stars: 5 } });
t('v25 C1: cannot rate an unfinished job (400)', rateEarly.status === 400);
const rateOther = await req('POST', '/api/jobs/' + J1 + '/rating', { token: c2Login.j.token, body: { stars: 1 } });
t('v25 C1: another customer cannot rate the job (403)', rateOther.status === 403);
const rateWorker = await req('POST', '/api/jobs/' + J1 + '/rating', { token: W1, body: { stars: 5 } });
t('v25 C1: a worker cannot rate (403)', rateWorker.status === 403);
const rateAnon = await req('POST', '/api/jobs/' + J1 + '/rating', { body: { stars: 5 } });
t('v25 C1: anonymous rating refused (401)', rateAnon.status === 401);
const rate1 = await req('POST', '/api/jobs/' + J1 + '/rating', { token: C1, body: { stars: 5, text: 'Great fence work' } });
t('v25 C1: owner rates the completed job', rate1.status === 200 && rate1.j.rating === 5);
const rateDup = await req('POST', '/api/jobs/' + J1 + '/rating', { token: C1, body: { stars: 4 } });
t('v25 C1: a second rating is refused (409)', rateDup.status === 409);
const jobR2 = await mkJob('(707) 555-0101');
const JR2 = jobR2.j.job.id;
await req('POST', '/api/jobs/' + JR2 + '/claim', { token: W1 });
await req('PATCH', '/api/jobs/' + JR2, { token: W1, body: { photosDone: true } });
const rateBad = await req('POST', '/api/jobs/' + JR2 + '/rating', { token: C1, body: { stars: 7 } });
t('v25 C1: stars outside 1-5 refused (400)', rateBad.status === 400);
const rate2 = await req('POST', '/api/jobs/' + JR2 + '/rating', { token: C1, body: { stars: 3, text: 'Decent' } });
t('v25 C1: second job rated 3', rate2.status === 200 && rate2.j.rating === 3);
const admRatings = await req('GET', '/api/admin/ratings', { token: A });
t('v25 C1: admin summary average/count math (5+3 -> 4, count 2)', admRatings.status === 200 && admRatings.j.count === 2 && admRatings.j.average === 4);
const revJ1 = (admRatings.j.reviews || []).find(r => r.jobId === J1);
t('v25 C1: admin list carries the review, unpublished by default', !!revJ1 && revJ1.stars === 5 && revJ1.text === 'Great fence work' && revJ1.published === false);
const custRatings403 = await req('GET', '/api/admin/ratings', { token: C1 });
t('v25 C1: ratings summary is admin-only (403 for customers)', custRatings403.status === 403);
const custJobsR = await req('GET', '/api/jobs', { token: C1 });
const custJ1 = (custJobsR.j.jobs || []).find(x => x.id === J1);
t('v25 C1: owning customer sees their rating on the job', !!custJ1 && custJ1.rating === 5 && custJ1.reviewText === 'Great fence work');
const wJobsR = await req('GET', '/api/jobs', { token: W1 });
t('v25 C1: worker sees his aggregate (avg 4, count 2)', !!wJobsR.j.workerRating && wJobsR.j.workerRating.average === 4 && wJobsR.j.workerRating.count === 2);
t('v25 C1: worker payloads NEVER include customer review text', JSON.stringify(wJobsR.j).indexOf('Great fence work') === -1 && JSON.stringify(wJobsR.j).indexOf('Decent') === -1);
const pubT = await req('PATCH', '/api/jobs/' + J1, { token: A, body: { reviewPublished: true } });
t('v25 C1: admin toggles the publish flag', pubT.status === 200 && pubT.j.job.reviewPublished === true);
const admRatings2 = await req('GET', '/api/admin/ratings', { token: A });
t('v25 C1: admin list reflects the published flag', (admRatings2.j.reviews || []).some(r => r.jobId === J1 && r.published === true));
const pubW = await req('PATCH', '/api/jobs/' + JR2, { token: W1, body: { reviewPublished: true } });
t('v25 C1: a worker cannot toggle the publish flag (403)', pubW.status === 403);

// ---------------- v26: Privacy Policy view + self-service account deletion ----------------
// Privacy view is public: the served page carries it with no login at all.
const pubPage = await (await fetch(BASE2 + '/')).text();
t('v26 privacy: the public page includes the Privacy Policy view', pubPage.includes('id="privacyBox"') && pubPage.includes('General Handyman Solutions — Privacy Policy'));
t('v26 privacy: key sections present', ['What we collect', 'How we use it', 'Who processes data for us', 'What we never do', 'Delete your account', 'How long we keep data', 'Contact'].every(s => pubPage.includes(s)));
t('v26 privacy: processors + never-sell + latest-point location + no card storage', pubPage.includes('Stripe') && pubPage.includes('Resend') && pubPage.includes('OpenStreetMap') && pubPage.includes('never sell your personal data') && pubPage.includes('single latest point') && pubPage.includes('never see or store your full card number'));
t('v26 privacy: deletion section gives the in-app steps + the email alternative', pubPage.includes('generalhandymans@gmail.com') && pubPage.includes('anonymized'));
t('v26 privacy: footer link to #privacy is on the served page', pubPage.includes('href="#privacy"'));

// Deletion: anonymous is refused outright.
const delAnon = await req2('POST', '/api/me/delete-account', { body: { confirmEmail: 'x@t.local' } });
t('v26 delete: anonymous deletion refused (401)', delAnon.status === 401);

// (a) Plain customer, nothing in flight: wrong email -> 400 + nothing lost;
//     right email (any case) -> deleted, login dead, session token dead.
const mDel = await mkMember('mdel@t.local', '(707) 555-0601');
const wrongEmail = await req2('POST', '/api/me/delete-account', { token: mDel.token, body: { confirmEmail: 'someone-else@t.local' } });
t('v26 delete: a wrong confirm email is refused (400)', wrongEmail.status === 400);
const stillThere = await req2('POST', '/api/login', { body: { email: 'mdel@t.local', password: 'memberpass1' } });
t('v26 delete: the failed confirmation deleted nothing', stillThere.status === 200 && !!stillThere.j.token);
const delOk = await req2('POST', '/api/me/delete-account', { token: mDel.token, body: { confirmEmail: 'MDEL@T.LOCAL' } });
t('v26 delete: the typed email (case-insensitive) deletes the account', delOk.status === 200 && delOk.j.ok === true);
const loginGone = await req2('POST', '/api/login', { body: { email: 'mdel@t.local', password: 'memberpass1' } });
t('v26 delete: login fails after deletion (401)', loginGone.status === 401);
const sessDead = await req2('GET', '/api/me/membership', { token: mDel.token });
t('v26 delete: every old session is invalidated', sessDead.status === 401);
cust = await customersByEmail();
t('v26 delete: the user is gone from the admin customer list', !cust['mdel@t.local']);

// (b) Active member: deletion cancels the Stripe subscription immediately
//     (mock records it) and the yard visits survive, anonymized.
const mSub = await mkMember('msub@t.local', '(707) 555-0602');
const subD = await req2('POST', '/api/stripe/membership-subscribe', { token: mSub.token, body: { plan: 'yard1' } });
await mockActivate(subD.j.subscriptionId);
const confD = await req2('POST', '/api/stripe/membership-confirm', { token: mSub.token, body: { plan: 'yard1' } });
t('v26 delete setup: the member activates yard1', confD.status === 200 && confD.j.active === true);
yvAll = await adminYardVisits2();
const mSubVisitsBefore = yvAll.filter(v => v.userId === mSub.id);
t('v26 delete setup: the member has a generated yard visit', mSubVisitsBefore.length >= 1);
const delSub = await req2('POST', '/api/me/delete-account', { token: mSub.token, body: { confirmEmail: 'msub@t.local' } });
t('v26 delete: a member with an active subscription can delete', delSub.status === 200 && delSub.j.ok === true);
t('v26 delete: the Stripe subscription was cancelled immediately (mock)', stripeState.subs[subD.j.subscriptionId].status === 'canceled');
yvAll = await adminYardVisits2();
t('v26 delete: yard visits keep the operational record with the personal link removed', mSubVisitsBefore.every(bv => { const now = yvAll.find(v => v.id === bv.id); return !!now && now.userId === null; }));
cust = await customersByEmail();
t('v26 delete: the member (and membership) are gone with the user', !cust['msub@t.local']);

// (c) History is anonymized, never erased: a closed request + an invoice
//     keep service and amounts, lose every personal field.
const mHis = await mkMember('mhis@t.local', '(707) 555-0603');
const hisReq = await req2('POST', '/api/requests', { token: mHis.token, body: { service: 'Fence repair', description: 'gate hinge', city: 'Fairfield', address: '9 Oak St, Fairfield, CA', when: 'Tomorrow', estimateType: 'photo', photos: ['data:image/jpeg;base64,PH'] } });
t('v26 delete setup: the customer opens a request', hisReq.status === 201 && !!hisReq.j.request.id);
const hisInv = await req2('POST', '/api/admin/invoices', { token: A2, body: { customerName: 'Member mhis@t.local', customerEmail: 'mhis@t.local', customerPhone: '(707) 555-0603', customerId: mHis.id, items: [{ description: 'Labor', qty: 1, unitPrice: 150 }] } });
t('v26 delete setup: an invoice exists for the customer', hisInv.status === 201 && hisInv.j.invoice.total === 150);
await req2('POST', '/api/requests/' + hisReq.j.request.id + '/hold/close', { token: A2, body: {} });
const delHis = await req2('POST', '/api/me/delete-account', { token: mHis.token, body: { confirmEmail: 'mhis@t.local' } });
t('v26 delete: with only finished history, deletion succeeds', delHis.status === 200 && delHis.j.ok === true);
const admReqs = await req2('GET', '/api/requests', { token: A2 });
const anonReq = (admReqs.j.requests || []).find(r => r.id === hisReq.j.request.id);
t('v26 delete: the request is anonymized (no name/email/phone/address) but keeps service + status', !!anonReq && anonReq.customerName === 'Deleted user' && anonReq.customerEmail === '' && anonReq.customerPhone === '' && anonReq.address === '' && anonReq.service === 'Fence repair' && anonReq.status === 'Closed');
const admInvs = await req2('GET', '/api/admin/invoices', { token: A2 });
const anonInv = (admInvs.j.invoices || []).find(i => i.id === hisInv.j.invoice.id);
t('v26 delete: the invoice is anonymized but keeps its $150 total', !!anonInv && anonInv.customerName === 'Deleted user' && anonInv.customerEmail === '' && anonInv.customerPhone === '' && anonInv.total === 150);

// (d) An in-flight REQUEST blocks the customer; once the Team closes it,
//     deletion succeeds.
const mBlk = await mkMember('mblk@t.local', '(707) 555-0604');
const blkReq = await req2('POST', '/api/requests', { token: mBlk.token, body: { service: 'TV Mounting & Installs', description: 'mount it', city: 'Fairfield', address: '3 Pine St, Fairfield, CA', when: 'Today', estimateType: 'photo', photos: ['data:image/jpeg;base64,PH'] } });
const delBlk = await req2('POST', '/api/me/delete-account', { token: mBlk.token, body: { confirmEmail: 'mblk@t.local' } });
t('v26 delete: an in-flight request blocks deletion (409, points at the Team)', delBlk.status === 409 && /in progress/.test(delBlk.j.error || '') && /Team/.test(delBlk.j.error || ''));
await req2('POST', '/api/requests/' + blkReq.j.request.id + '/hold/close', { token: A2, body: {} });
const delBlk2 = await req2('POST', '/api/me/delete-account', { token: mBlk.token, body: { confirmEmail: 'mblk@t.local' } });
t('v26 delete: once the Team closes the request, deletion succeeds', delBlk2.status === 200 && delBlk2.j.ok === true);

// (e) An in-flight JOB blocks the customer even with the request closed;
//     when the worker finishes it, deletion succeeds.
const mJob = await mkMember('mjob@t.local', '(707) 555-0605');
const jobReq = await req2('POST', '/api/requests', { token: mJob.token, body: { service: 'Drywall patch', description: 'hole in wall', city: 'Fairfield', address: '5 Birch St, Fairfield, CA', when: 'Today', estimateType: 'photo', photos: ['data:image/jpeg;base64,PH'] } });
const cj = await req2('POST', '/api/requests/' + jobReq.j.request.id + '/create-job', { token: A2, body: { payOffer: 100 } });
t('v26 delete setup: the request becomes a job', cj.status === 201 && !!cj.j.job.id);
const jobIdE = cj.j.job.id;
await req2('POST', '/api/requests/' + jobReq.j.request.id + '/hold/close', { token: A2, body: {} });
const delJob1 = await req2('POST', '/api/me/delete-account', { token: mJob.token, body: { confirmEmail: 'mjob@t.local' } });
t('v26 delete: an unfinished job blocks the customer (409)', delJob1.status === 409);
await req2('POST', '/api/jobs/' + jobIdE + '/claim', { token: WA });
const finE = await req2('PATCH', '/api/jobs/' + jobIdE, { token: WA, body: { photosDone: true } });
t('v26 delete setup: the worker finishes the job', finE.status === 200 && finE.j.job.status === 'Done — photos sent');
const delJob2 = await req2('POST', '/api/me/delete-account', { token: mJob.token, body: { confirmEmail: 'mjob@t.local' } });
t('v26 delete: after the job completes, deletion succeeds', delJob2.status === 200 && delJob2.j.ok === true);
const admJobs = await req2('GET', '/api/jobs', { token: A2 });
const anonJob = (admJobs.j.jobs || []).find(j => j.id === jobIdE);
t('v26 delete: the finished job record is anonymized too', !!anonJob && anonJob.customerName === 'Deleted user' && anonJob.customerPhone === '' && anonJob.address === '');

// (f) A worker with an unfinished assigned job is blocked; finishing it
//     unblocks him.
const wDId = await mkWorker2('wd@t.local', '(707) 555-0404', 'workpassD');
await req2('PATCH', '/api/workers/' + wDId, { token: A2, body: { status: 'active' } });
const wDLogin = await req2('POST', '/api/login', { body: { email: 'wd@t.local', password: 'workpassD' } });
const WD = wDLogin.j.token;
const asgJob = await req2('POST', '/api/jobs', { token: A2, body: { service: 'Gate fix', city: 'Fairfield', when: 'Today', payOffer: 100, customerPrice: 150, customerName: 'Some Customer', customerPhone: '(707) 555-0999', address: '7 Elm St, Fairfield, CA', assignedWorkerId: wDId, silent: true } });
t('v26 delete setup: the worker has an assigned job', asgJob.status === 201 && asgJob.j.job.assignedWorkerId === wDId);
const delW1 = await req2('POST', '/api/me/delete-account', { token: WD, body: { confirmEmail: 'wd@t.local' } });
t('v26 delete: a worker with an unfinished assigned job is blocked (409)', delW1.status === 409 && /reassign/.test(delW1.j.error || ''));
const finW = await req2('PATCH', '/api/jobs/' + asgJob.j.job.id, { token: WD, body: { photosDone: true } });
t('v26 delete setup: the worker finishes his job', finW.status === 200 && finW.j.job.status === 'Done — photos sent');
const delW2 = await req2('POST', '/api/me/delete-account', { token: WD, body: { confirmEmail: 'wd@t.local' } });
t('v26 delete: after finishing, the worker can delete his account', delW2.status === 200 && delW2.j.ok === true);
const wLoginGone = await req2('POST', '/api/login', { body: { email: 'wd@t.local', password: 'workpassD' } });
t('v26 delete: the worker login is gone too', wLoginGone.status === 401);

// (g) Nobody else's data moved.
cust = await customersByEmail();
t('v26 delete: other members are untouched (m1 keeps plan + INSTA1 source)', !!cust['m1@t.local'] && cust['m1@t.local'].source === 'INSTA1' && cust['m1@t.local'].membershipPlan.status === 'active');
yvAll = await adminYardVisits2();
t('v26 delete: other members yard visits keep their owner link', yvAll.some(v => v.userId === m5.id));
const m1Login = await req2('POST', '/api/login', { body: { email: 'm1@t.local', password: 'memberpass1' } });
t('v26 delete: other users can still log in', m1Login.status === 200 && !!m1Login.j.token);

// ---------------- v29/v30: Stripe Connect worker payouts (app2, mock Stripe) ----------------
async function mkConnectWorker2(email, phone, pw) {
  const su = await req2('POST', '/api/signup', { body: { name: 'Worker ' + email, email, phone, password: pw, role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
  const li = await req2('POST', '/api/login', { body: { email, password: pw } });
  await req2('PATCH', '/api/workers/' + su.j.user.id, { token: A2, body: { status: 'active' } });
  return { id: su.j.user.id, token: li.j.token };
}
async function assignedJob2(wid) {
  const r = await req2('POST', '/api/jobs', { token: A2, body: { service: 'Fence fix', city: 'Fairfield', when: 'Tomorrow 9am', payOffer: 120, customerPrice: 200, customerName: 'Cust', customerPhone: '(707) 555-0101', address: '742 Evergreen Terrace, Fairfield, CA', assignedWorkerId: wid, silent: true } });
  return r.j.job.id;
}
async function adminJob2(jid) { const aj = await req2('GET', '/api/jobs', { token: A2 }); return (aj.j.jobs || []).find(x => x.id === jid); }
const W3 = await mkConnectWorker2('w3@t.local', '(707) 555-0203', 'workpass3');
const cs0 = await req2('GET', '/api/worker/connect/status', { token: W3.token });
t('connect: new worker starts unconnected', cs0.status === 200 && cs0.j.connected === false && cs0.j.ready === false);
const cstart = await req2('POST', '/api/worker/connect/start', { token: W3.token, body: {} });
t('connect: onboarding link issued', cstart.status === 200 && /connect\.mock/.test(cstart.j.url || ''));
const cs1 = await req2('GET', '/api/worker/connect/status', { token: W3.token });
t('connect: ready once Stripe says payouts_enabled', cs1.status === 200 && cs1.j.ready === true);
const trBefore = stripeState.connectTransfers.length;
const J3 = await assignedJob2(W3.id);
await req2('PATCH', '/api/jobs/' + J3, { token: W3.token, body: { photosDone: true } });
let j3 = null; for (let i = 0; i < 14; i++) { j3 = await adminJob2(J3); if (j3 && j3.payoutStatus === 'paid') break; await sleep(200); }
t('connect: payout auto-sent when job is Done', !!j3 && j3.payoutStatus === 'paid' && /^tr_mock/.test(j3.payoutTransferId || '') && stripeState.connectTransfers.length === trBefore + 1);
const again3 = await req2('POST', '/api/admin/jobs/' + J3 + '/pay-worker', { token: A2, body: {} });
t('connect: pay-worker override never double-pays', again3.status === 200 && stripeState.connectTransfers.length === trBefore + 1);
const W4 = await mkConnectWorker2('w4@t.local', '(707) 555-0204', 'workpass4');
const J4 = await assignedJob2(W4.id);
await req2('PATCH', '/api/jobs/' + J4, { token: W4.token, body: { photosDone: true } });
const j4a = await adminJob2(J4);
t('connect: payout waits while worker has no Stripe setup', !!j4a && j4a.payoutStatus === 'awaiting_worker_setup');
await req2('POST', '/api/worker/connect/start', { token: W4.token, body: {} });
await req2('GET', '/api/worker/connect/status', { token: W4.token });
let j4 = null; for (let i = 0; i < 14; i++) { j4 = await adminJob2(J4); if (j4 && j4.payoutStatus === 'paid') break; await sleep(200); }
t('connect: waiting payout releases when setup completes', !!j4 && j4.payoutStatus === 'paid');
const W5 = await mkConnectWorker2('poor@t.local', '(707) 555-0205', 'workpass5');
await req2('POST', '/api/worker/connect/start', { token: W5.token, body: {} });
const cs5 = await req2('GET', '/api/worker/connect/status', { token: W5.token });
t('connect: poor-funds worker is set up fine', cs5.status === 200 && cs5.j.ready === true);
const J5 = await assignedJob2(W5.id);
await req2('PATCH', '/api/jobs/' + J5, { token: W5.token, body: { photosDone: true } });
let j5 = null; for (let i = 0; i < 14; i++) { j5 = await adminJob2(J5); if (j5 && j5.payoutStatus === 'pending_funds') break; await sleep(200); }
t('connect: insufficient platform funds -> pending_funds (nothing lost)', !!j5 && j5.payoutStatus === 'pending_funds');
stripeState.poorTransfers = false;
const retry5 = await req2('POST', '/api/admin/jobs/' + J5 + '/pay-worker', { token: A2, body: {} });
t('connect: manual retry pays once funds are available', retry5.status === 200 && retry5.j.payoutStatus === 'paid');

// ---------------- v75: Connect unlock gate + activation phone guard + availability checkboxes ----------------
t('static v75: claim gate is server-side with the structured bilingual refusal', serverSrc.includes("code: 'CONNECT_REQUIRED'") && serverSrc.includes('Para desbloquear jales on-demand tienes que conectarte a Stripe Connect') && serverSrc.includes('To unlock on-demand jobs you need to connect Stripe Connect') && serverSrc.includes('j.connectOverrideFor !== user.id'));
t('static v75: admin connect-override endpoint + audit entry', serverSrc.includes('/connect-override') && serverSrc.includes("audit(user, 'job.connect_override'"));
t('static v75: phone guard on activation (effective phone, transition-only)', serverSrc.includes("code: 'PHONE_REQUIRED'") && serverSrc.includes('effectivePhone'));
t('static v75: structured availability — shifts + onDemand in the cleaner and at signup', serverSrc.includes('AVAIL_SHIFTS') && serverSrc.includes('signupAvailability'));
t('static v75: worker home carries the persistent unlock card + the claim dialog path', htmlSrc.includes('id="connectGateCard"') && htmlSrc.includes('function paintConnectGateCard(') && htmlSrc.includes("e.code === 'CONNECT_REQUIRED'"));
t('static v75: the application availability is checkboxes now (days / shifts / on-demand)', htmlSrc.includes('class="wDay"') && htmlSrc.includes('class="wShift"') && htmlSrc.includes('id="wOnDemand"') && htmlSrc.includes('function workerAvailFromForm(') && !htmlSrc.includes('id="wAvail"'));
t('static v75: W_I18N parity — the gate + availability keys exist in EN and ES', (htmlSrc.match(/connectGateMsg:/g) || []).length === 2 && (htmlSrc.match(/availOnDemand:/g) || []).length === 2 && (htmlSrc.match(/shiftMorning:/g) || []).length === 2 && (htmlSrc.match(/connectGateTitle:/g) || []).length === 2);
t('static v75: admin cards flag phoneless workers + show the structured availability line', htmlSrc.includes('Incomplete — no phone') && htmlSrc.includes('availLine'));
t('static v75: admin job cards carry the Connect override action', htmlSrc.includes('function connectOverrideHtml(') && htmlSrc.includes('async function connectOverride('));
const mapFn75 = htmlSrc.slice(htmlSrc.indexOf('async function loadAdminMap('), htmlSrc.indexOf('// ---------- Admin captains (v40) ----------'));
t('static v75 map: a ResizeObserver keeps re-measuring the master map (the zero-size cure)', mapFn75.includes('ResizeObserver') && mapFn75.includes('adminMapRO'));
t('static v75 map: tile failures swap in the bilingual fallback — never a silent grey box', mapFn75.includes('tileerror') && mapFn75.includes('adminMapFallbackHtml()') && htmlSrc.includes('The map could not load'));
t('static v75 map: the loadAdmin watchdog refills an empty map box', htmlSrc.includes('!b.innerHTML.trim()') && htmlSrc.includes("getElementById('adminMapBox')"));
// (a) The gate: an ACTIVE worker with NO Stripe Connect cannot claim a
//     paid job — 403 with Gabriel's exact bilingual message.
const W6 = await mkConnectWorker2('w6@t.local', '(707) 555-0206', 'workpass6');
const gateJob = await req2('POST', '/api/jobs', { token: A2, body: { service: 'Gate job', city: 'Fairfield', when: 'Today', payOffer: 100, customerPrice: 150, customerName: 'Cust', customerPhone: '(707) 555-0101', address: '1 Gate St, Fairfield, CA' } });
t('v75 gate setup: an open paid job is posted', gateJob.status === 201 && gateJob.j.job.status === 'Open');
const gateClaim = await req2('POST', '/api/jobs/' + gateJob.j.job.id + '/claim', { token: W6.token, body: {} });
t('v75 gate: a claim without Connect is refused 403 CONNECT_REQUIRED', gateClaim.status === 403 && gateClaim.j.code === 'CONNECT_REQUIRED' && gateClaim.j.connect && gateClaim.j.connect.ready === false);
t('v75 gate: the refusal carries the exact bilingual message', !!gateClaim.j.message && gateClaim.j.message.es === 'Para desbloquear jales on-demand tienes que conectarte a Stripe Connect' && gateClaim.j.message.en === 'To unlock on-demand jobs you need to connect Stripe Connect');
const gateJobAfter = await adminJob2(gateJob.j.job.id);
t('v75 gate: the job stays Open and unassigned after a refused claim', !!gateJobAfter && gateJobAfter.status === 'Open' && !gateJobAfter.assignedWorkerId);
const gateOvrCust = await req2('POST', '/api/admin/jobs/' + gateJob.j.job.id + '/connect-override', { token: W6.token, body: { workerId: W6.id } });
t('v75 gate: the override endpoint is admin-only', gateOvrCust.status === 403);
// (b) Gabriel's override releases THIS job to THIS worker — audited.
const gateOvr = await req2('POST', '/api/admin/jobs/' + gateJob.j.job.id + '/connect-override', { token: A2, body: { workerId: W6.id } });
t('v75 override: the admin release lands on the job', gateOvr.status === 200 && gateOvr.j.job.connectOverrideFor === W6.id);
const audit75 = await req2('GET', '/api/admin/audit', { token: A2 });
t('v75 override: the release is audit-logged', (audit75.j.entries || []).some(e => e.action === 'job.connect_override' && e.target === gateJob.j.job.id));
const gateClaim2 = await req2('POST', '/api/jobs/' + gateJob.j.job.id + '/claim', { token: W6.token, body: {} });
t('v75 override: the released worker can claim despite no Connect', gateClaim2.status === 200 && gateClaim2.j.job.status === 'Claimed');
// (c) The override does not leak: another gateless worker is still
//     refused on another job — until HIS Connect is ready.
const W7 = await mkConnectWorker2('w7@t.local', '(707) 555-0207', 'workpass7');
const gateJob2 = await req2('POST', '/api/jobs', { token: A2, body: { service: 'Gate job 2', city: 'Fairfield', when: 'Today', payOffer: 80, customerPrice: 120, customerName: 'Cust', customerPhone: '(707) 555-0101', address: '2 Gate St, Fairfield, CA' } });
const gateClaimW7 = await req2('POST', '/api/jobs/' + gateJob2.j.job.id + '/claim', { token: W7.token, body: {} });
t('v75 gate: no leak — the next worker without Connect is refused too', gateClaimW7.status === 403 && gateClaimW7.j.code === 'CONNECT_REQUIRED');
await req2('POST', '/api/worker/connect/start', { token: W7.token, body: {} });
await req2('GET', '/api/worker/connect/status', { token: W7.token });
const gateClaimW7b = await req2('POST', '/api/jobs/' + gateJob2.j.job.id + '/claim', { token: W7.token, body: {} });
t('v75 gate: with Connect payouts enabled the same worker claims freely', gateClaimW7b.status === 200 && gateClaimW7b.j.job.status === 'Claimed');
// (d) Phone guard: applying without a phone is fine (review), but
//     ACTIVATION is refused until a number is on file.
const noPhone = await req2('POST', '/api/signup', { body: { name: 'No Phone Worker', email: 'nophone@t.local', phone: '', password: 'workpass8', role: 'worker', profile: { city: 'Fairfield' } } });
t('v75 phone setup: a phoneless worker can still apply (lands on review)', noPhone.status === 201 && noPhone.j.user.status === 'review');
const noPhoneAct = await req2('PATCH', '/api/workers/' + noPhone.j.user.id, { token: A2, body: { status: 'active' } });
t('v75 phone: activation without a phone is refused PHONE_REQUIRED', noPhoneAct.status === 400 && noPhoneAct.j.code === 'PHONE_REQUIRED');
const wkList75 = await req2('GET', '/api/workers', { token: A2 });
const npRec = (wkList75.j.workers || []).find(w => w.id === noPhone.j.user.id);
t('v75 phone: the refused worker stays on review, still phoneless (admin sees the gap)', !!npRec && npRec.status === 'review' && !npRec.phone);
const phoneFix = await req2('PATCH', '/api/workers/' + noPhone.j.user.id, { token: A2, body: { phone: '(707) 555-0208', status: 'active' } });
t('v75 phone: phone + activation in ONE patch succeeds', phoneFix.status === 200 && phoneFix.j.worker.status === 'active' && phoneFix.j.worker.phone === '(707) 555-0208');
// (e) Availability checkboxes round-trip: the structured payload lands
//     cleaned on the record; the free-text history stays untouched; an
//     old payload without the object defaults cleanly.
const avSign = await req2('POST', '/api/signup', { body: { name: 'Avail Worker', email: 'avail@t.local', phone: '(707) 555-0209', password: 'workpass9', role: 'worker', profile: { city: 'Fairfield', availability: 'Mon Wed Fri · morning · on-demand OK' }, availability: { preset: 'custom', days: [5, 1, 3], shifts: ['morning', 'bogus'], onDemand: true } } });
t('v75 availability: checkbox payload lands structured (days sorted, bogus shift dropped)', avSign.status === 201 && !!avSign.j.user.availability && JSON.stringify(avSign.j.user.availability.days) === '[1,3,5]' && JSON.stringify(avSign.j.user.availability.shifts) === '["morning"]' && avSign.j.user.availability.onDemand === true && avSign.j.user.availability.preset === 'custom');
t('v75 availability: the free-text profile history is untouched', !!avSign.j.user.profile && avSign.j.user.profile.availability === 'Mon Wed Fri · morning · on-demand OK');
const avOld = await req2('POST', '/api/signup', { body: { name: 'Legacy Worker', email: 'legacy@t.local', phone: '(707) 555-0210', password: 'workpass0', role: 'worker', profile: { city: 'Fairfield', availability: 'Weekends' } } });
t('v75 availability: an old payload (no availability object) defaults cleanly', avOld.status === 201 && !!avOld.j.user.availability && avOld.j.user.availability.preset === 'anytime' && avOld.j.user.availability.onDemand === false && JSON.stringify(avOld.j.user.availability.shifts) === '[]');

// ---------------- v24 A3: receipt email on capture ----------------
// Seed requests with authorized holds straight into app2's data file,
// then reboot the instance on the same file (the db loads it verbatim).
// ---------- v32→v44: menu checkout (requests tipo menu + pay in full inline) ----------
{
  const su = await req2('POST', '/api/signup', { body: { name: 'Menu Orderer', email: 'menuorderer@test.com', password: 'password123', phone: '7075550100', serviceAddress: '10 Menu St, Fairfield, CA', role: 'customer' } });
  t('v32 signup for menu checkout works', su.status === 201 && !!su.j.token);
  const TK = su.j.token;
  const mk = await req2('POST', '/api/requests', { token: TK, body: { service: 'TV Mounting (up to 65")', description: 'TV Mounting — ordered from the menu.', address: '10 Menu St', city: 'Fairfield', when: 'Today', estimateType: 'menu', menuOrder: { serviceId: 'tv-mounting', extras: [{ name: 'Hide the cables (surface raceway)', price: 50 }], asap: false, joinedMembership: false, totals: { list: 175, member: 140, due: 175 } } } });
  t('v32 menu request created (not estimate-priced)', mk.status === 201 && mk.j.request.estimateType === 'menu');
  t('v32 menu request keeps the structured menuOrder', !!(mk.j.request.menuOrder && mk.j.request.menuOrder.totals.due === 175 && mk.j.request.menuOrder.extras.length === 1));
  const rid = mk.j.request.id;
  const gone = await req2('POST', '/api/orders/hold', { token: TK, body: { requestId: rid } });
  t('v44 the old $75 hold endpoint is gone (404)', gone.status === 404);
  const pay = await req2('POST', '/api/orders/pay', { token: TK, body: { requestId: rid } });
  const piRec = stripeState.pis[pay.j.paymentIntentId];
  t('v44 menu pay PI charges the FULL total with automatic capture (no hold, no manual capture)', pay.status === 200 && !!pay.j.clientSecret && pay.j.amount === 175 && !!piRec && piRec.amount === 17500 && piRec.capture_method === 'automatic' && piRec.metadata.kind === 'menu-order');
  const earlyConf = await req2('POST', '/api/orders/pay-confirm', { token: TK, body: { requestId: rid, paymentIntentId: pay.j.paymentIntentId } });
  t('v44 pay-confirm refuses before the charge completes', earlyConf.status === 400);
  await mockPiStatus(pay.j.paymentIntentId, 'succeeded'); // real Stripe lands here after confirmCardPayment
  const conf = await req2('POST', '/api/orders/pay-confirm', { token: TK, body: { requestId: rid, paymentIntentId: pay.j.paymentIntentId } });
  t('v44 menu pay-confirm records the payment', conf.status === 200 && conf.j.ok === true);
  const mine = await req2('GET', '/api/requests', { token: TK });
  const myReq = (mine.j.requests || []).find(x => x.id === rid);
  t('v44 payment is on the request (paid in full, 17500, zero holds)', !!(myReq && myReq.payment && myReq.payment.status === 'paid' && myReq.payment.amountCents === 17500 && !(myReq.holds || []).length));
  const pay2 = await req2('POST', '/api/orders/pay', { token: TK, body: { requestId: rid } });
  t('v44 a second payment on a paid order is refused', pay2.status === 400);
  const su2 = await req2('POST', '/api/signup', { body: { name: 'Other Person', email: 'otherperson@test.com', password: 'password123', role: 'customer' } });
  const stolen = await req2('POST', '/api/orders/pay', { token: su2.j.token, body: { requestId: rid } });
  t('v44 another customer cannot pay someone else order', stolen.status === 403);
}


// ---------------- v43: full catalog + $135->$125 cut + universal member discount ----------------
{
  const ROOT43 = path.join(APP_DIR, '..');
  const masterSrc43 = fs.readFileSync(path.join(ROOT43, 'MASTER-SERVICE-LIST.md'), 'utf8');
  const catBlock43 = htmlSrc.slice(htmlSrc.indexOf('const MENU_CATALOG = {'), htmlSrc.indexOf('/* ================= v79: LEGACY'));
  const cat43 = {};
  for (const m of catBlock43.matchAll(/'([a-z0-9-]+)': \{ name: '([^']*)', meta: '([^']*)', price: (\d+), member: (\d+|null)/g)) {
    cat43[m[1]] = { name: m[2], price: +m[4], member: m[5] === 'null' ? null : +m[5] };
  }
  // Master display name -> catalog id (the 98 orderable services).
  const NAME_TO_ID43 = {
    'Closet doors (pair)': 'closet-doors', 'Interior door slab swap': 'door-slab-swap', 'Door knob / lever install': 'door-knob-install', 'Deadbolt install — single': 'deadbolt-install', 'Deadbolt + knob combo install': 'deadbolt-knob-combo', 'Smart lock install & setup': 'smart-lock-install', "Door adjustment (sticks / won't latch)": 'door-adjustment', 'Weatherstripping': 'weatherstripping', 'Screen door install': 'screen-door-install', 'Sliding door roller / track service': 'sliding-door-service', 'Window screen rescreen / repair': 'window-screen-repair', 'Pet door install (in door)': 'pet-door-install', 'Furniture assembly, standard (1 piece)': 'furniture-assembly', 'Furniture assembly, large/complex (wardrobe, bunk bed)': 'furniture-assembly-large', 'Closet organizer system install': 'closet-organizer', 'Floating shelves (set of 2)': 'floating-shelves', 'Cabinet hardware install (up to 10 pulls)': 'cabinet-hardware-install', 'Baby gate install': 'baby-gate-install', 'Picture & mirror hanging (up to 3 pieces)': 'picture-mirror-hanging', 'Mirror / medicine cabinet install': 'mirror-cabinet-install', 'Curtain rod install': 'curtain-rod-install', 'Blinds install (1–3 windows)': 'blinds-install', 'Blinds install — deal (4+ windows)': 'blinds-install-deal', 'Baseboard install (1 room, up to ~40 linear ft)': 'baseboard-install', 'Baseboard repair / section replace': 'baseboard-repair', 'Laminate / LVP plank repair (a few planks)': 'laminate-floor-repair', 'Carpet repair (general)': 'carpet-repair', 'Transition strip / threshold install': 'transition-strip-install', 'Drywall patch, small (up to ~1 ft)': 'drywall-patch-small', 'Drywall patch, medium (up to 2×2 ft, texture match)': 'drywall-patch-medium', 'Small-holes patch set (up to 3: doorknob, anchors)': 'drywall-holes-set', 'Paint one room — standard (walls only, labor)': 'paint-room', 'Paint large room (walls only, labor)': 'paint-room-large', 'Paint large room with ceiling (labor)': 'paint-room-large-ceiling', 'Accent wall painting': 'accent-wall-painting', 'Interior door painting': 'interior-door-painting', 'Fence picket repair (up to 5 pickets)': 'fence-picket-repair', 'Fence post replacement (add-on to a fence repair visit)': 'fence-post-replacement', 'Deck board replacement (up to 5 boards)': 'deck-board-replacement', 'Gate repair / adjustment': 'gate-repair',
    'TV mounting (up to 65")': 'tv-mounting', 'TV mounting, large (over 65")': 'tv-mounting-large', 'Soundbar mounting': 'soundbar-mounting', 'Ceiling fan install or swap': 'ceiling-fan', 'Chandelier / light fixture swap': 'chandelier-swap', 'Light fixture swap, simple (flush-mount, porch, vanity)': 'light-fixture-swap', 'Bathroom exhaust fan swap': 'exhaust-fan-swap', 'Dimmer / switch swap': 'dimmer-switch-swap', 'Smoke / CO detector install (up to 3, battery)': 'smoke-co-detector-install', 'Ring / video doorbell install': 'ring-doorbell', 'Smart thermostat install': 'smart-thermostat-install', 'Security camera install (wireless)': 'security-camera-install', 'Garage door opener swap': 'garage-opener', 'Holiday lights install (single story)': 'holiday-lights', 'Holiday lights install (two-story)': 'holiday-lights-two-story', 'Holiday light take-down & storage (single story)': 'holiday-lights-takedown', 'Holiday light take-down & storage (two-story) — SOLO GABRIEL, no se despacha': 'holiday-lights-takedown-two-story', 'Window AC unit install': 'window-ac-install',
    'Faucet swap': 'faucet-replacement', 'Toilet replacement (full swap)': 'toilet-replacement', 'Toilet repair (fill valve / flapper)': 'toilet-repair', 'Garbage disposal swap': 'garbage-disposal-swap', 'Showerhead swap': 'showerhead-swap', 'Tub / shower re-caulk': 'tub-shower-recaulk', 'Grab bar install': 'grab-bar-install', 'P-trap / drain assembly swap': 'p-trap-swap', 'Bidet seat install': 'bidet-seat-install', 'Dryer vent cleaning': 'dryer-vent-cleaning', 'Washer & dryer hookup / install (existing connections)': 'washer-dryer-hookup', 'Drain unclog — basic (sink / shower, 1 drain)': 'drain-unclog', 'Dishwasher swap (existing hookups)': 'dishwasher-swap', 'Vanity swap': 'vanity-swap', 'Bathroom accessories set install (towel bars, paper holder, hooks — up to 4 pieces)': 'bathroom-accessories-install', 'Hose bibb / outdoor faucet swap': 'hose-bibb-swap', 'Water heater installation': 'water-heater',
    'Gutter cleaning (single story)': 'gutter-cleaning', 'Gutter cleaning (two-story house)': 'gutter-cleaning-two-story', 'Pressure washing — standard area (2-car driveway OR patio)': 'pressure-washing', 'Pressure washing — large area (long driveway, large patio or deck)': 'pressure-washing-large', 'Yard cleanup (general)': 'yard-cleanup', 'Sprinkler & drip irrigation basics (heads, timers, small leaks)': 'sprinkler-irrigation', 'Green waste hauling': 'green-waste', 'Junk removal — minimum load': 'junk-minimum', 'Junk removal — medium load': 'junk-medium', 'Junk removal — large load': 'junk-large', 'Junk removal — full load (truck + trailer)': 'junk-full', 'Mailbox install': 'mailbox-install',
    'Fuel pump replacement': 'fuel-pump-replacement', 'Battery replacement': 'battery-replacement', 'Check-engine diagnostics / scan': 'check-engine-diagnostics', 'Oil change & fluid service': 'oil-change', 'Brake pads': 'brake-pads', 'Alternator replacement': 'alternator-replacement', 'Starter replacement': 'starter-replacement', 'Belt / hose replacement (basics)': 'belt-hose-replacement', 'Spark plug replacement (4-cylinder)': 'spark-plug-replacement', 'Headlight / bulb replacement': 'headlight-replacement',
    'Heavy furniture move (2 workers)': 'heavy-furniture-move'
  };
  const SKIP43 = ['In-person estimate', 'Labor help', 'Old toilet removal'];
  const sections43 = ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## Ayuda general'];
  let cur43 = null; const rows43 = [];
  for (const line of masterSrc43.split('\n')) {
    if (line.startsWith('## ')) cur43 = sections43.some(px => line.startsWith(px)) ? line : null;
    if (!cur43 || !line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 4) continue;
    const nm = cells[1].replace(/\*\*/g, '').trim();
    const pm = cells[2].match(/\$(\d+)/);
    if (!pm || nm === 'Servicio' || SKIP43.some(k => nm.startsWith(k)) || /HomeCare|Mantenimiento mensual/.test(nm)) continue;
    rows43.push({ name: nm, price: +pm[1] });
  }
  const unmapped43 = rows43.filter(r => !(r.name in NAME_TO_ID43));
  t('v43 master: every orderable master row maps to a catalog id (plan rows live outside the service sections; estimate + hourly labor excluded by design)', unmapped43.length === 0);
  if (unmapped43.length) console.log('  unmapped master rows:', unmapped43.map(r => r.name).join(' | '));
  const priceBad43 = rows43.filter(r => { const c = cat43[NAME_TO_ID43[r.name]]; return !c || c.price !== r.price; });
  t('v43 master<->catalog: all 98 service prices identical to the master list, post-cut', rows43.length === 98 && priceBad43.length === 0);
  const memBad43 = Object.entries(cat43).filter(([id, c]) => c.member !== Math.round(c.price * 0.8));
  t('v43 catalog: member == round(price x 0.8) for ALL 98 entries — oil/junk/green included, zero member:null left', Object.keys(cat43).length === 98 && memBad43.length === 0);
  t('v43 master: the $135 tier is gone from the service tables', !/^\| [^|]*\| \$135 \|/m.test(masterSrc43));
  const ADDONS43 = { 'door-slab-swap': [['knob', 75], ['deadbolt', 75], ['haul-door', 50]], 'window-screen-repair': [['extra-screen', 25]], 'drywall-patch-small': [['paint-touchup', 75]], 'drywall-patch-medium': [['paint-touchup', 75]], 'drywall-holes-set': [['paint-touchup', 75]], 'tv-mounting': [['raceway', 50], ['soundbar', 75]], 'tv-mounting-large': [['raceway', 50], ['soundbar', 75]], 'dimmer-switch-swap': [['extra-dimmer', 75]], 'security-camera-install': [['extra-camera', 75]], 'toilet-replacement': [['haul-toilet', 50]], 'garbage-disposal-swap': [['haul-disposal', 50]], 'grab-bar-install': [['extra-grab-bar', 75]], 'drain-unclog': [['extra-drain', 75]], 'vanity-swap': [['haul-vanity', 50]], 'pressure-washing': [['trash-bin-cleaning', 50]], 'pressure-washing-large': [['trash-bin-cleaning', 50]], 'oil-change': [['filter-swap', 50]], 'brake-pads': [['rotors', 85]] };
  const addonBad43 = [];
  for (const [sid, pairs] of Object.entries(ADDONS43)) {
    const i43 = catBlock43.indexOf("'" + sid + "':");
    const seg43 = i43 >= 0 ? catBlock43.slice(i43, i43 + 1200) : '';
    const am43 = seg43.match(/addons: \[([^\]]*)\]/);
    const found43 = am43 ? [...am43[1].matchAll(/id: '([a-z-]+)', name: '[^']*', price: (\d+)/g)].map(x => x[1] + ':' + x[2]) : [];
    for (const [aid, pr] of pairs) if (!found43.includes(aid + ':' + pr)) addonBad43.push(sid + '/' + aid);
  }
  t('v43 catalog: confirmed checkbox add-ons mapped at master prices (incl. new haul-door / haul-disposal)', addonBad43.length === 0);
  t('v43 terms: app clause 5 states the universal discount scope', htmlSrc.includes('on every menu service, including junk removal'));
  const termsSrc43 = fs.readFileSync(path.join(ROOT43, 'TERMINOS-Y-PROCESOS-BORRADOR.md'), 'utf8');
  t('v43 terms: TERMINOS draft matches — the exclusion sentence is gone', termsSrc43.includes('applies to every menu service') && !termsSrc43.includes('does not apply to junk removal'));
  t('v43 master: ASAP line now states +25% on the member-discounted price (doc matches the app)', masterSrc43.includes('sobre el precio ya con el descuento de'));
  const webIndex43 = fs.readFileSync(path.join(ROOT43, 'index.html'), 'utf8');
  const webService43 = fs.readFileSync(path.join(ROOT43, 'service.html'), 'utf8');
  const webCheckout43 = fs.readFileSync(path.join(ROOT43, 'checkout.html'), 'utf8');
  t('v43 web: homepage cards repriced — no $135/$108 left, seven $125/$100 cards incl. Save $25', !webIndex43.includes('$135') && !webIndex43.includes('$108') && (webIndex43.match(/Members: \$100/g) || []).length === 7 && webIndex43.includes('Members: $100 · Save $25'));
  t('v43 web: oil / junk / green cards show their new member prices ($60 / $180 / $260 / $340 / $520)', ['Members: $60', 'Members: $180', 'Members: $260', 'Members: $340', 'Members: $520'].every(x => webIndex43.includes(x)));
  t('v43 web (superseded by v72 W-1): the homepage demo sample-order bar is REMOVED — no Sample order / View · $250 / cartbar anywhere', !webIndex43.includes('Sample order') && !webIndex43.includes('View · $250') && !webIndex43.includes('cartbar'));
  t('v79 web: service.html is RETIRED (P0-5) — a themed redirect to the app; the fake demo page is gone', webService43.includes('http-equiv="refresh"') && webService43.includes('https://app.generalhandymans.app/') && !webService43.includes('bigPrice') && !webService43.includes('let base = 125'));
  t('v79 web: service.html carries no prices or demo checkout at all (redirect stub)', !webService43.includes('$135') && !webService43.includes('data-price='));
  t('v43 zero-$135 proof: no $135 service price survives on any customer surface (app, server, homepage, checkout, tracking)', !htmlSrc.includes('$135') && !serverSrc.includes('$135') && !webIndex43.includes('$135') && !webCheckout43.includes('$135') && !fs.readFileSync(path.join(ROOT43, 'tracking.html'), 'utf8').includes('$135'));
  t('v43 zero-$135 proof: the 6 city pages carry no $135 either', ['handyman-fairfield', 'handyman-vacaville', 'handyman-vallejo', 'tv-mounting-vacaville', 'mobile-mechanic-vallejo', 'plumber-fairfield'].every(d => !fs.readFileSync(path.join(ROOT43, d, 'index.html'), 'utf8').includes('$135')));
  t('v79 web: checkout.html is RETIRED (P0-5) — a themed redirect to the app; the fake demo checkout is gone', webCheckout43.includes('http-equiv="refresh"') && webCheckout43.includes('https://app.generalhandymans.app/') && !webCheckout43.includes('Continue to secure checkout'));
  // Client totals in the VM (v79: through the CART — the #order page and
  // orderTotalsCalc are retired; cartCalc carries the same catalog math).
  run("location.hash = ''; me = null;"); run('render();');
  run("cartSave([]); cartAdd('oil-change');");
  t('v43 totals (v79 cart): oil change — list $75 / member $60 (the $75 flats are discounted)', run('cartCalc().list') === 75 && run('cartCalc().member') === 60);
  run("cartSave([]); cartAdd('junk-minimum');");
  t('v43 totals (v79 cart): junk minimum load — member pays $180 (was excluded)', run('cartCalc().list') === 225 && run('cartCalc().member') === 180);
  run("cartSave([]); cartAdd('junk-full');");
  t('v43 totals (v79 cart): junk full load — member pays $520', run('cartCalc().member') === 520);
  run("cartSave([]); cartAdd('green-waste');");
  t('v43 totals (v79 cart): green waste — member pays $180 (was excluded)', run('cartCalc().member') === 180);
  run("cartSave([]); cartAddWithAddons('tv-mounting', ['raceway']);");
  t('v43 totals (v79 cart): TV + raceway — list $175, member $100 + $40 (raceway discounted) = $140', run('cartCalc().list') === 175 && run('cartCalc().member') === 140);
  run("cartSave([]); cartAddWithAddons('toilet-replacement', ['haul-toilet']);");
  t('v43 totals (v79 cart): haul-toilet ADD-ON keeps its nodisc — member pays $140 + $50 = $190', run('cartCalc().member') === 190);
  run("cartSave([]); location.hash = ''; me = null;"); run('render();');
}

// ---------------- v44: bookingDue + refunds + payout gate + admin cart ----------------
{
  // --- bookingDue default = total; Gabriel's manual override still wins ---
  const bk = await req2('POST', '/api/signup', { body: { name: 'Book Due', email: 'bookdue@test.com', password: 'password123', phone: '7075550140', role: 'customer' } });
  const bkReq = await req2('POST', '/api/requests', { token: bk.j.token, body: { service: 'Faucet Replacement', description: 'drips', address: '5 Book St', city: 'Fairfield', when: 'Tomorrow', estimateType: 'inperson' } });
  const bkId = bkReq.j.request.id;
  const bkEst = await req2('PATCH', '/api/requests/' + bkId, { token: A2, body: { estimate: { items: [{ description: 'Faucet swap — labor', qty: 1, unitPrice: 125 }] } } });
  // The in-person request carries the $75 estimate-fee credit (standing rule:
  // credited toward the repair), so total = 125 - 75 = 50 — and bookingDue
  // must default to that FULL total, not half of it like the old model.
  t('v62→v79 estimates: bookingDue AUTO defaults to the DEPOSIT LAW (total $50 → $50 flat due to book, $0 balance)', bkEst.status === 200 && bkEst.j.request.estimate.credit === 75 && bkEst.j.request.estimate.total === 50 && bkEst.j.request.estimate.bookingDue === 50 && bkEst.j.request.estimate.balanceDue === 0);
  const bkEst2 = await req2('PATCH', '/api/requests/' + bkId, { token: A2, body: { estimate: { items: [{ description: 'Faucet swap — labor', qty: 1, unitPrice: 125 }], bookingDue: 40 } } });
  t('v44 estimates: Gabriel can still override the amount due to book by hand', bkEst2.status === 200 && bkEst2.j.request.estimate.bookingDue === 40 && bkEst2.j.request.estimate.balanceDue === 10);

  // --- refund branches ---
  async function paidMenuOrder(email, due) {
    const su = await req2('POST', '/api/signup', { body: { name: 'Refund Case', email, password: 'password123', phone: '7075550150', role: 'customer' } });
    const tk = su.j.token;
    // v46: the order must be a REAL catalog combination — the server now
    // recomputes totals from SERVER_MENU, so the old fixture's declared
    // $250 for a $125 service is corrected to $125 (that WAS the hole).
    // Vanity Swap is a genuine $250 catalog service.
    const rq = await req2('POST', '/api/requests', { token: tk, body: { service: 'Vanity Swap', description: 'menu order', address: '7 Refund Ave', city: 'Fairfield', when: 'Today', estimateType: 'menu', menuOrder: { serviceId: 'vanity-swap', extras: [], asap: false, joinedMembership: false, totals: { list: due, member: Math.round(due * 0.8), due } } } });
    const id = rq.j.request.id;
    const py = await req2('POST', '/api/orders/pay', { token: tk, body: { requestId: id } });
    await mockPiStatus(py.j.paymentIntentId, 'succeeded');
    await req2('POST', '/api/orders/pay-confirm', { token: tk, body: { requestId: id, paymentIntentId: py.j.paymentIntentId } });
    return { id, tk };
  }
  const rfBefore = stripeState.refunds.length;
  const o1 = await paidMenuOrder('refund1@test.com', 250);
  const rf1 = await req2('POST', '/api/requests/' + o1.id + '/refund', { token: A2, body: {} });
  t('v44 refund: not dispatched -> FULL refund, nothing kept', rf1.status === 200 && rf1.j.refunded === 250 && rf1.j.keptFee === 0 && rf1.j.dispatched === false);
  t('v44 refund: Stripe refund hit the mock for the full amount', stripeState.refunds.length === rfBefore + 1 && stripeState.refunds[rfBefore].amount === 25000);
  const o1After = await req2('GET', '/api/requests', { token: A2 });
  const o1r = (o1After.j.requests || []).find(x => x.id === o1.id);
  t('v44 refund: order cancelled + refund recorded on the request', !!o1r && o1r.status === 'Cancelled' && !!o1r.refund && o1r.refund.refundedCents === 25000 && o1r.payment.status === 'refunded');
  const rf1b = await req2('POST', '/api/requests/' + o1.id + '/refund', { token: A2, body: {} });
  t('v44 refund: a second refund is refused', rf1b.status === 400);
  const rfCust = await req2('POST', '/api/requests/' + o1.id + '/refund', { token: o1.tk, body: {} });
  t('v44 refund: customers cannot refund (admin only)', rfCust.status === 403);
  const o2 = await paidMenuOrder('refund2@test.com', 250);
  const cj = await req2('POST', '/api/requests/' + o2.id + '/create-job', { token: A2, body: { payOffer: 100 } });
  const claim = await req2('POST', '/api/jobs/' + cj.j.job.id + '/claim', { token: W3.token, body: {} });
  t('v44 refund setup: a worker claimed the job (now dispatched)', claim.status === 200 && claim.j.job.status === 'Claimed');
  const rf2 = await req2('POST', '/api/requests/' + o2.id + '/refund', { token: A2, body: {} });
  t('v44 refund: dispatched -> total minus the $75 booking fee', rf2.status === 200 && rf2.j.refunded === 175 && rf2.j.keptFee === 75 && rf2.j.dispatched === true);
  const o2After = await req2('GET', '/api/requests', { token: A2 });
  const o2r = (o2After.j.requests || []).find(x => x.id === o2.id);
  t('v44 refund: dispatched order records the kept $75 (partially_refunded)', !!o2r && o2r.payment.status === 'partially_refunded' && !!o2r.refund && o2r.refund.keptFeeCents === 7500);
  const o2Jobs = await req2('GET', '/api/jobs', { token: A2 });
  const o2j = (o2Jobs.j.jobs || []).find(x => x.id === cj.j.job.id);
  t('v44 refund: the unfinished linked job is cancelled too', !!o2j && o2j.status === 'Cancelled');

  // --- payout gate on the new rails: unpaid Done job waits, payment releases it ---
  const o3su = await req2('POST', '/api/signup', { body: { name: 'Gate Case', email: 'gate@test.com', password: 'password123', phone: '7075550160', role: 'customer' } });
  const o3rq = await req2('POST', '/api/requests', { token: o3su.j.token, body: { service: 'Door Slab Swap', description: 'menu order', address: '9 Gate St', city: 'Fairfield', when: 'Today', estimateType: 'menu', menuOrder: { serviceId: 'door-slab-swap', extras: [], asap: false, joinedMembership: false, totals: { list: 125, member: 100, due: 125 } } } });
  const o3id = o3rq.j.request.id;
  const cj3 = await req2('POST', '/api/requests/' + o3id + '/create-job', { token: A2, body: { payOffer: 60 } });
  await req2('POST', '/api/jobs/' + cj3.j.job.id + '/claim', { token: W3.token, body: {} });
  await req2('PATCH', '/api/jobs/' + cj3.j.job.id, { token: W3.token, body: { photosDone: true } });
  let jg = await adminJob2(cj3.j.job.id);
  t('v44 payout gate: Done job on an UNPAID order waits as awaiting_payment', !!jg && jg.payoutStatus === 'awaiting_payment');
  const o3py = await req2('POST', '/api/orders/pay', { token: o3su.j.token, body: { requestId: o3id } });
  await mockPiStatus(o3py.j.paymentIntentId, 'succeeded');
  await req2('POST', '/api/orders/pay-confirm', { token: o3su.j.token, body: { requestId: o3id, paymentIntentId: o3py.j.paymentIntentId } });
  for (let i = 0; i < 14; i++) { jg = await adminJob2(cj3.j.job.id); if (jg && jg.payoutStatus === 'paid') break; await sleep(200); }
  t('v44 payout gate: paying in full releases the worker payout (still only at Done)', !!jg && jg.payoutStatus === 'paid' && /^tr_mock/.test(jg.payoutTransferId || ''));

  // --- admin cart lifecycle ---
  const cartForbidden = await req2('POST', '/api/admin/carts', { token: o3su.j.token, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }] } });
  t('v44 cart: only the admin can create carts', cartForbidden.status === 403);
  const cart1 = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }, { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }], customerName: 'Cart Customer', note: 'quoted by phone' } });
  t('v44 cart: admin creates a cart (list $250 / member $200, one link)', cart1.status === 201 && cart1.j.cart.listTotal === 250 && cart1.j.cart.memberTotal === 200 && /^CRT-/.test(cart1.j.cart.id) && cart1.j.cart.link.includes('/cart/' + cart1.j.cart.id));
  const cartId = cart1.j.cart.id;
  const page1 = await fetch(BASE2 + '/cart/' + cartId);
  const instEn = await (await fetch(BASE2 + '/instalar')).text();
  t('v49 install page: EN renders with the install button + prompt hook', instEn.includes('id="ghsInstallPage"') && instEn.includes('Install the app') && instEn.includes('beforeinstallprompt'));
  const instEs = await (await fetch(BASE2 + '/instalar?lang=es')).text();
  t('v49 install page: ES renders in Spanish only', instEs.includes('Instala la app') && instEs.includes('En iPhone'));
  const instAlias = await fetch(BASE2 + '/install');
  t('v49 install page: /install alias serves too', instAlias.status === 200);
  const page1Html = await page1.text();
  t('v44 cart: public page renders the items, both totals and the membership decision', page1.status === 200 && page1Html.includes('Garbage Disposal Swap') && page1Html.includes('Door Slab Swap') && page1Html.includes('$250.00') && page1Html.includes('$200.00') && page1Html.includes('Become a HomeCare member'));
  const det = { name: 'Cart Customer', phone: '7075550170', email: 'cartguest@test.com', address: '11 Cart Way', city: 'Fairfield', when: 'Tomorrow · Morning (8am-12pm)' };
  // v54: payment rides a Stripe-hosted Checkout session. The endpoint
  // answers with the redirect URL + the server-computed amount; the
  // session (retrievable from Stripe) is the charge record, and its
  // amount_total must equal the total the page displayed.
  const cp1 = await req2('POST', '/api/carts/' + cartId + '/checkout', { body: det });
  const sess1 = sessionForCart(cartId, 'payment');
  const sess1Pi = sess1 && stripeState.pis[sess1.payment_intent];
  t('v62→v79 cart: a guest is sent to hosted Checkout at the DEPOSIT of the list total ($250 → $50 flat tier)', cp1.status === 200 && cp1.j.next === 'pay' && !!cp1.j.url && cp1.j.amount === 50 && cp1.j.deposit === 50 && cp1.j.balance === 200 && cp1.j.total === 250 && cp1.j.memberApplied === false && !!sess1 && sess1.amount_total === 5000 && !!sess1Pi && sess1Pi.metadata.kind === 'cart-order' && sess1Pi.metadata.cartId === cartId && sess1Pi.metadata.payStep === 'deposit');
  const reqsBefore1 = await req2('GET', '/api/requests', { token: A2 });
  const reqCountBefore = (reqsBefore1.j.requests || []).length;
  // Tampered + unpaid returns change NOTHING — the flag is never trusted.
  await fetch(BASE2 + '/cart/' + cartId + '?paid=1&session_id=cs_forged');
  await fetch(BASE2 + '/cart/' + cartId + '?paid=1');
  await fetch(BASE2 + '/cart/' + cartId + '?paid=1&session_id=' + sess1.id); // the REAL session, still UNPAID at Stripe
  await fetch(BASE2 + '/cart/' + cartId + '?cancelled=1'); // cancel return: cart untouched
  const reqsTamp = await req2('GET', '/api/requests', { token: A2 });
  t('v54 cart: forged / unpaid / cancelled returns create no order', (reqsTamp.j.requests || []).length === reqCountBefore && !(reqsTamp.j.requests || []).some(x => x.menuOrder && x.menuOrder.cartId === cartId));
  await mockSessionPaid(sess1.id);
  const ret1 = await fetch(BASE2 + '/cart/' + cartId + '?paid=1&session_id=' + sess1.id);
  const ret1Html = await ret1.text();
  const admReqs = await req2('GET', '/api/requests', { token: A2 });
  const conv = (admReqs.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartId);
  t('v54 cart: the Stripe-verified paid return converts the cart into an order', ret1.status === 200 && !!conv && ret1Html.includes('Paid in full') && ret1Html.includes(conv.id));
  t('v62→v79 cart: the deposit converts the order as BOOKED (status deposit, $50 of $250, balance $200 — not paid in full)', !!conv && conv.customerEmail === 'cartguest@test.com' && conv.address === '11 Cart Way' && conv.city === 'Fairfield' && !!conv.payment && conv.payment.status === 'deposit' && conv.payment.amountCents === 5000 && conv.payment.totalCents === 25000 && conv.payment.balanceCents === 20000 && !!conv.menuOrder && conv.menuOrder.cartId === cartId);
  // Return-path + webhook idempotency: replaying either is a no-op.
  await fetch(BASE2 + '/cart/' + cartId + '?paid=1&session_id=' + sess1.id);
  const whRet = await wh2('checkout.session.completed', { id: sess1.id, mode: 'payment', payment_status: 'paid', payment_intent: sess1.payment_intent, amount_total: 25000, metadata: { userId: '', kind: 'cart-order', cartId: cartId } });
  const piWh = await wh2('payment_intent.succeeded', { id: sess1.payment_intent, status: 'succeeded', amount: 25000, amount_received: 25000, metadata: { kind: 'cart-order', cartId: cartId } });
  const admReqs2 = await req2('GET', '/api/requests', { token: A2 });
  t('v54 cart: return + webhook replays never duplicate the order', whRet.status === 200 && piWh.status === 200 && (admReqs2.j.requests || []).length === reqCountBefore + 1 && (admReqs2.j.requests || []).filter(x => x.menuOrder && x.menuOrder.cartId === cartId).length === 1);
  const cp1b = await req2('POST', '/api/carts/' + cartId + '/checkout', { body: det });
  t('v54 cart: a paid cart cannot be checked out again (double-pay blocked)', cp1b.status === 400);
  const pagePaid = await fetch(BASE2 + '/cart/' + cartId);
  const pagePaidHtml = await pagePaid.text();
  t('v44 cart: the paid page shows the confirmation + the order number', pagePaid.status === 200 && pagePaidHtml.includes('Paid in full') && pagePaidHtml.includes(conv.id));

  // --- member repricing (session + email match), join decision state ---
  const hm = await mkMember('cartmember@test.com', '(707) 555-0180');
  const hmSub = await req2('POST', '/api/stripe/homecare-subscribe', { token: hm.token, body: {} });
  await mockActivate(hmSub.j.subscriptionId);
  const hmConf = await req2('POST', '/api/stripe/homecare-confirm', { token: hm.token, body: {} });
  t('v44 cart setup: HomeCare member activated through the existing join rails', hmConf.status === 200 && hmConf.j.active === true);
  const cart2 = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }, { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  const page2 = await fetch(BASE2 + '/cart/' + cart2.j.cart.id, { headers: { Authorization: 'Bearer ' + hm.token } });
  const page2Html = await page2.text();
  t('v44 cart: a logged-in member sees member prices from the start (join block skipped)', page2.status === 200 && page2Html.includes('HomeCare member price applied') && !page2Html.includes('id="cJoin"'));
  const cp2 = await req2('POST', '/api/carts/' + cart2.j.cart.id + '/checkout', { token: hm.token, body: { name: 'Member C', phone: '7075550180', email: 'cartmember@test.com', address: '12 Member Ln', city: 'Fairfield', when: 'Today' } });
  const sess2 = sessionForCart(cart2.j.cart.id, 'payment');
  t('v62→v79 cart: member session is charged the deposit of the MEMBER total ($200 → $50 flat tier)', cp2.status === 200 && cp2.j.amount === 50 && cp2.j.memberApplied === true && !!sess2 && sess2.amount_total === 5000);
  await mockSessionPaid(sess2.id);
  const ret2 = await fetch(BASE2 + '/cart/' + cart2.j.cart.id + '?paid=1&session_id=' + sess2.id, { headers: { Authorization: 'Bearer ' + hm.token } });
  const admReqsM = await req2('GET', '/api/requests', { token: A2 });
  const conv2 = (admReqsM.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cart2.j.cart.id);
  t('v62→v79 cart: the member cart converts at the member total — deposit $50 recorded, $200 total on the order', ret2.status === 200 && !!conv2 && conv2.payment.status === 'deposit' && conv2.payment.amountCents === 5000 && conv2.payment.totalCents === 20000 && conv2.membership === 'member');
  const cart3 = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ serviceId: 'oil-change', name: 'Oil Change & Fluid Service', qty: 1, unitPrice: 75 }] } });
  const cp3 = await req2('POST', '/api/carts/' + cart3.j.cart.id + '/checkout', { body: { name: 'Member By Email', phone: '7075550180', email: 'cartmember@test.com', address: '12 Member Ln', city: 'Fairfield', when: 'Today' } });
  const sess3 = sessionForCart(cart3.j.cart.id, 'payment');
  t('v62→v79 cart: a guest with a member email gets member prices too ($75 -> $60 total, $50 deposit — flat tier, never above the total)', cp3.status === 200 && cp3.j.amount === 50 && cp3.j.total === 60 && cp3.j.memberApplied === true && !!sess3 && sess3.amount_total === 5000);
  const chk = await req2('POST', '/api/carts/' + cart3.j.cart.id + '/member-check', { body: { email: 'cartmember@test.com' } });
  const chkNo = await req2('POST', '/api/carts/' + cart3.j.cart.id + '/member-check', { body: { email: 'cartguest@test.com' } });
  t('v44 cart: member-check answers by email (member yes / guest no)', chk.status === 200 && chk.j.member === true && chkNo.j.member === false);

  // --- cancelled cart ---
  const cart4 = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ serviceId: 'faucet-replacement', name: 'Faucet Swap', qty: 1, unitPrice: 125 }] } });
  const cx = await req2('POST', '/api/admin/carts/' + cart4.j.cart.id + '/cancel', { token: A2, body: {} });
  const cpX = await req2('POST', '/api/carts/' + cart4.j.cart.id + '/checkout', { body: det });
  const pageX = await fetch(BASE2 + '/cart/' + cart4.j.cart.id);
  const pageXHtml = await pageX.text();
  t('v44 cart: an admin-cancelled cart cannot be paid and the page says so', cx.status === 200 && cx.j.cart.status === 'cancelled' && cpX.status === 400 && pageXHtml.includes('was cancelled'));
  const cartList = await req2('GET', '/api/admin/carts', { token: A2 });
  t('v44 cart: the admin list shows carts with their statuses', cartList.status === 200 && (cartList.j.carts || []).some(x => x.id === cartId && x.status === 'paid') && (cartList.j.carts || []).some(x => x.id === cart4.j.cart.id && x.status === 'cancelled'));

  // --- v52: custom lines (labor / materials) end to end + displayed == charged ---
  // Mixed cart, deliberately built in scrambled order (materials, labor,
  // catalog): list = 80 + 225 + 125 = 430 · member = 80 + 180 + 100 = 360.
  const mixItems = [
    { custom: true, kind: 'other', name: 'Materials — conduit and wire', price: 40, qty: 2 },
    { custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 3 },
    { serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }
  ];
  // Path A — guest. The client even LIES about totals/line math; the
  // server recomputes everything from (name, price, qty, kind) alone.
  const cartA = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems.map(x => ({ ...x, lineTotal: 0.01, memberUnit: 0.01 })), listTotal: 1, memberTotal: 1, customerName: 'Path A' } });
  t('v52 cart: custom lines accepted and totals RECOMPUTED server-side (client-sent totals ignored — list $430 / member $360)', cartA.status === 201 && cartA.j.cart.listTotal === 430 && cartA.j.cart.memberTotal === 360);
  const aItems = cartA.j.cart.items || [];
  const aLabor = aItems.find(x => x.custom && x.kind === 'labor');
  const aMat = aItems.find(x => x.custom && x.kind === 'other');
  t('v52 cart: stored custom lines keep their shape — labor memberUnit $60 (−20%), materials NEVER discount', !!aLabor && aLabor.unitPrice === 75 && aLabor.memberUnit === 60 && aLabor.lineTotal === 225 && !!aMat && aMat.memberUnit === 40 && aMat.lineTotal === 80);
  const pageA = await fetch(BASE2 + '/cart/' + cartA.j.cart.id);
  const pageAH = await pageA.text();
  t('v52 cart: guest page renders services → labor → materials, green member price beside every discountable line, Subtotal/Total block', pageA.status === 200 && pageAH.indexOf('Garbage Disposal Swap') >= 0 && pageAH.indexOf('Garbage Disposal Swap') < pageAH.indexOf('Labor') && pageAH.indexOf('Labor') < pageAH.indexOf('Materials — conduit and wire') && pageAH.includes('Members $180.00') && pageAH.includes('Members $100.00') && pageAH.includes('Subtotal') && pageAH.includes('id="cartBigTotal"') && pageAH.includes('$430.00') && pageAH.includes('drops from $430.00 to $360.00'));
  t('v52 cart: guest savings row stays hidden until member pricing applies', pageAH.includes('id="ctSaveRow" style="display:none'));
  const detA = { name: 'Path A Guest', phone: '7075550201', email: 'patha@test.com', address: '31 Path A St', city: 'Fairfield', when: 'Today' };
  const cpA = await req2('POST', '/api/carts/' + cartA.j.cart.id + '/checkout', { body: detA });
  const sessA = sessionForCart(cartA.j.cart.id, 'payment');
  t('v62 path A (guest): the session carries the 40% deposit of the displayed $430.00 ($172)', cpA.status === 200 && cpA.j.amount === 172 && cpA.j.total === 430 && cpA.j.memberApplied === false && !!sessA && sessA.amount_total === 17200);
  await mockSessionPaid(sessA.id);
  const retA = await fetch(BASE2 + '/cart/' + cartA.j.cart.id + '?paid=1&session_id=' + sessA.id);
  const admReqsA = await req2('GET', '/api/requests', { token: A2 });
  const convA = (admReqsA.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartA.j.cart.id);
  const moA = (convA && convA.menuOrder && convA.menuOrder.items) || [];
  t('v52 cart: conversion preserves the custom lines + server totals (nothing re-priced from the catalog)', retA.status === 200 && !!convA && moA.length === 3 && !!moA.find(x => x.custom && x.kind === 'labor' && x.price === 75 && x.qty === 3) && !!moA.find(x => x.custom && x.kind === 'other' && x.price === 40) && convA.menuOrder.totals.list === 430 && convA.menuOrder.totals.member === 360 && convA.menuOrder.totals.due === 430 && convA.payment.status === 'deposit' && convA.payment.amountCents === 17200 && convA.payment.totalCents === 43000);
  // Invalid custom lines → 400 (never silently dropped or clamped)
  const badName = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ custom: true, kind: 'labor', name: '   ', price: 75, qty: 1 }] } });
  const badPrice = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ custom: true, kind: 'other', name: 'Materials', price: -5, qty: 1 }] } });
  const badBig = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ custom: true, kind: 'labor', name: 'Labor', price: 100001, qty: 1 }] } });
  const badQty = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 0 }] } });
  const badQtyFrac = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 2.5 }] } });
  t('v52 cart: invalid custom lines rejected 400 (empty name / negative price / price > $100k / qty 0 / fractional qty)', badName.status === 400 && badPrice.status === 400 && badBig.status === 400 && badQty.status === 400 && badQtyFrac.status === 400);
  // Path B — member from the start (session)
  const mb = await mkMember('pathb@test.com', '(707) 555-0202');
  const mbSub = await req2('POST', '/api/stripe/homecare-subscribe', { token: mb.token, body: {} });
  await mockActivate(mbSub.j.subscriptionId);
  const mbConf = await req2('POST', '/api/stripe/homecare-confirm', { token: mb.token, body: {} });
  t('v52 path B setup: member active through the join rails', mbConf.status === 200 && mbConf.j.active === true);
  const cartB = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const pageB = await fetch(BASE2 + '/cart/' + cartB.j.cart.id, { headers: { Authorization: 'Bearer ' + mb.token } });
  const pageBH = await pageB.text();
  t('v52 path B (member from start): no join promo — member pricing applied, labor at $60/h, materials full, savings row visible', pageB.status === 200 && pageBH.includes('HomeCare member price applied') && !pageBH.includes('id="cJoin"') && pageBH.includes('$60.00') && pageBH.includes('$180.00') && pageBH.includes('$40.00') && pageBH.includes('Member savings') && pageBH.includes('id="ctSaveRow" style="display:flex') && pageBH.includes('$360.00'));
  // --- v56: checking the join box reprices the DISPLAY instantly ---
  // The guest page embeds BOTH figures for every amount (data-l/data-m)
  // and the checkbox flips a display-only joinPreview flag that
  // renderAmounts binds to the subtotal, the savings row, the total,
  // every line and the Pay label. The server still charges exactly the
  // v52/v54 amounts (paths A/B/C above and below prove it).
  t('v56 cart: totals block carries BOTH figures — ctSubtotal + cartBigTotal embed data-l $430.00 / data-m $360.00, guest figure rendered first', pageAH.includes('id="ctSubtotal" data-l="$430.00" data-m="$360.00">$430.00<') && pageAH.includes('id="cartBigTotal" data-l="$430.00" data-m="$360.00"'));
  t('v56 cart: mixed-cart line pairs — labor drops ($75.00→$60.00 each, $225.00→$180.00 line), catalog drops ($125.00→$100.00), MATERIALS NEVER drop ($40.00/$40.00 each, $80.00/$80.00 line)', pageAH.includes('data-l="$75.00" data-m="$60.00"') && pageAH.includes('data-l="$225.00" data-m="$180.00"') && pageAH.includes('data-l="$125.00" data-m="$100.00"') && pageAH.includes('data-l="$40.00" data-m="$40.00"') && pageAH.includes('data-l="$80.00" data-m="$80.00"'));
  t('v56 cart: toggle wiring embedded — renderAmounts binds member figures to lines/total/Pay label and shows the savings row, subtotal follows the preview, unchecking restores guest figures (v57: the preview itself is set BY PLAN via syncJoinPreview)', pageAH.includes('function syncJoinPreview(){ joinPreview=joinOn() && !!PLANS[selPlan()].disc; }') && pageAH.includes('var asM=memberApplied||joinPreview') && pageAH.includes('n.textContent=asM?n.getAttribute("data-m"):n.getAttribute("data-l")') && pageAH.includes('sr.style.display=asM?"flex":"none"') && pageAH.includes('joinPreview?st.getAttribute("data-m"):st.getAttribute("data-l")') && pageAH.includes('−$70.00'));
  t('v70 cart: join-order note embedded hidden under the Pay button — ONE-checkout copy naming the picked plan + price + the real deposit/due math (EN + ES templates)', pageAH.includes('id="joinOrderNote"') && pageAH.includes('display:none;color:#555') && pageAH.includes('One single checkout: your booking deposit ({dep}) plus your first {planName} month ({price}/mo)') && pageAH.includes('No second step, no paying twice.') && pageAH.includes('this order stays at the regular price.') && pageAH.includes('Un solo cobro: tu anticipo ({dep}) más tu primer mes de {planName} ({price}/mes)') && pageAH.includes('jn.style.display=on?"block":"none"') && pageAH.includes('jn.textContent=fillPlan(raw, pl).replace("{dep}",fmt(depC)).replace("{due}",fmt(dueJ))'));
  t('v56 cart: member page UNCHANGED — no join checkbox, savings row flex from the server render, subtotal still opens on the regular figure with the savings bridge', pageBH.includes('id="ctSaveRow" style="display:flex') && !pageBH.includes('id="cJoin"') && pageBH.includes('id="ctSubtotal" data-l="$430.00" data-m="$360.00">$430.00<'));
  const estFnSrc56 = serverSrc.slice(serverSrc.indexOf('function estimatePageHtml'), serverSrc.indexOf('function installPageHtml'));
  t('v56 estimate: join stays the server-verified BUTTON pattern (estJoinBtn + join-checkout, full reload reprice) — NO cart-style checkbox/totals toggle on the estimate page', estFnSrc56.includes('estJoinBtn') && estFnSrc56.includes('/join-checkout') && !estFnSrc56.includes('id="cJoin"') && !estFnSrc56.includes('joinPreview'));
  const cpB = await req2('POST', '/api/carts/' + cartB.j.cart.id + '/checkout', { token: mb.token, body: { name: 'Path B', phone: '7075550202', email: 'pathb@test.com', address: '32 Path B St', city: 'Fairfield', when: 'Today' } });
  const sessB = sessionForCart(cartB.j.cart.id, 'payment');
  t('v62 path B: the session carries the 40% deposit of the member $360.00 ($144)', cpB.status === 200 && cpB.j.amount === 144 && cpB.j.total === 360 && cpB.j.memberApplied === true && !!sessB && sessB.amount_total === 14400);
  await mockSessionPaid(sessB.id);
  const retB = await fetch(BASE2 + '/cart/' + cartB.j.cart.id + '?paid=1&session_id=' + sessB.id, { headers: { Authorization: 'Bearer ' + mb.token } });
  const admReqsB = await req2('GET', '/api/requests', { token: A2 });
  const convB = (admReqsB.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartB.j.cart.id);
  t('v62 path B: member cart converts at the member total (deposit $144 recorded of $360)', retB.status === 200 && !!convB && convB.payment.status === 'deposit' && convB.payment.amountCents === 14400 && convB.payment.totalCents === 36000);
  // Path C — joins ON THE PAGE (v70: ONE single checkout — the plan
  // and the 40% deposit ride the same subscription-mode session; the
  // membership + the booking settle together on the verified return).
  const suC = await req2('POST', '/api/signup', { body: { name: 'Path C', email: 'pathc@test.com', password: 'password123', phone: '7075550203', role: 'customer' } });
  const cartC2 = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const pageC2 = await fetch(BASE2 + '/cart/' + cartC2.j.cart.id);
  const pageC2H = await pageC2.text();
  t('v52 path C (pre-join): the guest sees the promo — drops from $430.00 to $360.00', pageC2.status === 200 && pageC2H.includes('id="cJoin"') && pageC2H.includes('drops from $430.00 to $360.00') && pageC2H.includes('$430.00'));
  const detC = { name: 'Path C', phone: '7075550203', email: 'pathc@test.com', address: '33 Path C St', city: 'Fairfield', when: 'Today' };
  const coC = await req2('POST', '/api/carts/' + cartC2.j.cart.id + '/checkout', { token: suC.j.token, body: Object.assign({}, detC, { join: true }) });
  const joinSessC = sessionForCart(cartC2.j.cart.id, 'subscription');
  const joinSubC = joinSessC && stripeState.subs[joinSessC.subscription];
  t('v74 path C: ONE session carries BOTH — the HomeCare plan TRIALS free (universal free month, no invite on this cart) so the ONLY charge today is the $144 member deposit as a one-time line (amount $144 = $0 plan + $144 deposit)', coC.status === 200 && coC.j.next === 'pay' && coC.j.plan === 'homecare' && coC.j.amount === 144 && coC.j.deposit === 144 && coC.j.planFirst === 0 && coC.j.total === 360 && coC.j.memberApplied === true && !!joinSessC && joinSessC.metadata.kind === 'cart-join' && joinSessC.metadata.freeMonth === '1' && joinSessC.amount_total === 14400 && !!joinSubC && joinSubC.items.data[0].price.id === 'price_hc_mock' && joinSubC.status === 'incomplete');
  // The ?paid=1 flag WITHOUT Stripe proof activates and books NOTHING.
  const preRetC = await fetch(BASE2 + '/cart/' + cartC2.j.cart.id + '?paid=1&session_id=' + joinSessC.id, { headers: { Authorization: 'Bearer ' + suC.j.token } });
  const preRetCH = await preRetC.text();
  const chkPreC = await req2('POST', '/api/carts/' + cartC2.j.cart.id + '/member-check', { body: { email: 'pathc@test.com' } });
  const reqsPreC = await req2('GET', '/api/requests', { token: A2 });
  t('v70 path C: an UNPAID combined session activates nothing and books nothing (no member, no order, join still offered)', chkPreC.status === 200 && chkPreC.j.member === false && preRetCH.includes('id="cJoin"') && !(reqsPreC.j.requests || []).some(x => x.menuOrder && x.menuOrder.cartId === cartC2.j.cart.id));
  await mockSessionPaid(joinSessC.id);
  const retC = await fetch(BASE2 + '/cart/' + cartC2.j.cart.id + '?paid=1&session_id=' + joinSessC.id, { headers: { Authorization: 'Bearer ' + suC.j.token } });
  const retCH = await retC.text();
  const chkPostC = await req2('POST', '/api/carts/' + cartC2.j.cart.id + '/member-check', { body: { email: 'pathc@test.com' } });
  const admReqsC = await req2('GET', '/api/requests', { token: A2 });
  const convC = (admReqsC.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartC2.j.cart.id);
  t('v70 path C: the ONE verified return does BOTH — membership active AND the job BOOKED at the member total (deposit $144 of $360, balance $216 on the same link)', retC.status === 200 && chkPostC.j.member === true && retCH.includes('Deposit received') && retCH.includes('Pay balance $216.00') && !!convC && convC.payment.status === 'deposit' && convC.payment.amountCents === 14400 && convC.payment.totalCents === 36000 && convC.membership === 'member');
  const cpC2 = await req2('POST', '/api/carts/' + cartC2.j.cart.id + '/checkout', { token: suC.j.token, body: detC });
  t('v70 path C: there is NO second payment step — a fresh checkout attempt on the booked cart is refused (400)', cpC2.status === 400);
  // Join reprice isolation: labor+materials only — the drop is EXACTLY the labor savings ($45)
  const cartLM = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 3 }, { custom: true, kind: 'other', name: 'Materials', price: 40, qty: 2 }] } });
  t('v52 cart: labor+materials cart totals — member drop is EXACTLY the labor savings ($305 → $260)', cartLM.status === 201 && cartLM.j.cart.listTotal === 305 && cartLM.j.cart.memberTotal === 260 && (cartLM.j.cart.listTotal - cartLM.j.cart.memberTotal) === 45);
  const cpLM = await req2('POST', '/api/carts/' + cartLM.j.cart.id + '/checkout', { body: { name: 'Path C', phone: '7075550203', email: 'pathc@test.com', address: '33 Path C St', city: 'Fairfield', when: 'Today' } });
  const sessLM = sessionForCart(cartLM.j.cart.id, 'payment');
  t('v62→v79 cart: the joined member books the labor+materials cart with the deposit ($50 flat tier of the $260 member total — materials untouched in the total)', cpLM.status === 200 && cpLM.j.amount === 50 && cpLM.j.total === 260 && cpLM.j.memberApplied === true && !!sessLM && sessLM.amount_total === 5000);
  // Path D — member re-entry (addendum 3): joins first, later reopens the
  // SAME link in a fresh session and identifies by email — or by session.
  const md = await mkMember('pathd@test.com', '(707) 555-0204');
  const mdSub = await req2('POST', '/api/stripe/homecare-subscribe', { token: md.token, body: {} });
  await mockActivate(mdSub.j.subscriptionId);
  const mdConf = await req2('POST', '/api/stripe/homecare-confirm', { token: md.token, body: {} });
  t('v52 path D setup: buyer joined before ever opening the cart link', mdConf.status === 200 && mdConf.j.active === true);
  const cartD = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const pageD = await fetch(BASE2 + '/cart/' + cartD.j.cart.id);
  const pageDH = await pageD.text();
  t('v52 re-entry: fresh-session (logged-out) view still shows regular prices + the member figures', pageD.status === 200 && pageDH.includes('$430.00') && pageDH.includes('Members $180.00'));
  const chkD = await req2('POST', '/api/carts/' + cartD.j.cart.id + '/member-check', { body: { email: 'pathd@test.com' } });
  t('v52 re-entry: member-check by email recognizes the buyer — no help from Gabriel needed', chkD.status === 200 && chkD.j.member === true);
  const pageD2 = await fetch(BASE2 + '/cart/' + cartD.j.cart.id, { headers: { Authorization: 'Bearer ' + md.token } });
  const pageD2H = await pageD2.text();
  t('v52 re-entry: reopening the link signed in shows member prices on catalog + custom labor, materials full', pageD2.status === 200 && pageD2H.includes('HomeCare member price applied') && pageD2H.includes('$180.00') && pageD2H.includes('$100.00') && pageD2H.includes('$40.00'));
  const cpD = await req2('POST', '/api/carts/' + cartD.j.cart.id + '/checkout', { body: { name: 'Path D', phone: '7075550204', email: 'pathd@test.com', address: '34 Path D St', city: 'Fairfield', when: 'Today' } });
  const sessD = sessionForCart(cartD.j.cart.id, 'payment');
  t('v62 path D (re-entry by email, fresh session): the session carries the 40% deposit ($144 of $360)', cpD.status === 200 && cpD.j.amount === 144 && cpD.j.total === 360 && cpD.j.memberApplied === true && !!sessD && sessD.amount_total === 14400);
  await mockSessionPaid(sessD.id);
  const retD = await fetch(BASE2 + '/cart/' + cartD.j.cart.id + '?paid=1&session_id=' + sessD.id);
  const admReqsD = await req2('GET', '/api/requests', { token: A2 });
  const convD = (admReqsD.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartD.j.cart.id);
  t('v62 re-entry: converted order carries the member total + membership flag (deposit $144 of $360)', retD.status === 200 && !!convD && convD.menuOrder.totals.due === 360 && convD.payment.status === 'deposit' && convD.payment.amountCents === 14400 && convD.payment.totalCents === 36000 && convD.membership === 'member');

  // --- v55: edit an OPEN cart in place (same link, new lines + totals) ---
  // Lines are replaced wholesale and totals ALWAYS recomputed server-side
  // (client-sent totals ignored): catalog + custom labor −20% for members,
  // materials always full price.
  const cartE = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [
    { serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 },
    { custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 2 },
    { custom: true, kind: 'other', name: 'Materials — pipe and fittings', price: 40, qty: 1 }
  ], customerName: 'Edit Case' } });
  t('v55 cart setup: mixed cart created (list $315 / member $260)', cartE.status === 201 && cartE.j.cart.listTotal === 315 && cartE.j.cart.memberTotal === 260);
  const cartEId = cartE.j.cart.id;
  const editForbidden = await req2('PUT', '/api/admin/carts/' + cartEId, { token: o3su.j.token, body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  const editAnon = await req2('PUT', '/api/admin/carts/' + cartEId, { body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  t('v55 cart edit: admin-only, same as create (customer 403 / anonymous 401)', editForbidden.status === 403 && editAnon.status === 401);
  const editBad = await req2('PUT', '/api/admin/carts/' + cartEId, { token: A2, body: { items: [{ custom: true, kind: 'labor', name: 'Labor', price: -1, qty: 1 }] } });
  t('v55 cart edit: invalid lines rejected 400 by the shared validator', editBad.status === 400);
  const edit1 = await req2('PUT', '/api/admin/carts/' + cartEId, { token: A2, body: { items: [
    { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 2, unitPrice: 125 },
    { custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 1 },
    { custom: true, kind: 'other', name: 'Materials — hinges and screws', price: 50, qty: 2 }
  ], listTotal: 1, memberTotal: 1 } });
  const eItems = (edit1.j.cart && edit1.j.cart.items) || [];
  const eLabor = eItems.find(x => x.custom && x.kind === 'labor');
  const eMat = eItems.find(x => x.custom && x.kind === 'other');
  t('v55 cart edit: open cart lines + totals replaced server-side (list $425 / member $360; labor memberUnit $60, materials full $50)', edit1.status === 200 && edit1.j.cart.id === cartEId && edit1.j.cart.link.includes('/cart/' + cartEId) && edit1.j.cart.listTotal === 425 && edit1.j.cart.memberTotal === 360 && eItems.length === 3 && !!eLabor && eLabor.memberUnit === 60 && eLabor.lineTotal === 75 && !!eMat && eMat.memberUnit === 50 && eMat.lineTotal === 100);
  const pageE = await fetch(BASE2 + '/cart/' + cartEId);
  const pageEH = await pageE.text();
  t('v55 cart edit: the SAME public link renders the NEW lines + totals (no stale $315)', pageE.status === 200 && pageEH.includes('Door Slab Swap') && pageEH.includes('Materials — hinges and screws') && pageEH.includes('$425.00') && pageEH.includes('drops from $425.00 to $360.00') && !pageEH.includes('$315.00'));
  const editPaid = await req2('PUT', '/api/admin/carts/' + cartId, { token: A2, body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  const editCanc = await req2('PUT', '/api/admin/carts/' + cart4.j.cart.id, { token: A2, body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  const edit404 = await req2('PUT', '/api/admin/carts/CRT-NOPE99', { token: A2, body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  t('v55 cart edit: paid + cancelled carts refuse edits (400); unknown cart 404', editPaid.status === 400 && editCanc.status === 400 && edit404.status === 404);

  // --- v55 session safety: an edit kills outstanding Checkout sessions ---
  const cartF = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ serviceId: 'faucet-replacement', name: 'Faucet Swap', qty: 1, unitPrice: 125 }] } });
  const cartFId = cartF.j.cart.id;
  const cpF = await req2('POST', '/api/carts/' + cartFId + '/checkout', { body: det });
  const sessF = sessionForCart(cartFId, 'payment');
  t('v62 v55 setup: guest checkout opened a DEPOSIT pay session for the $125 cart ($50)', cpF.status === 200 && !!sessF && sessF.amount_total === 5000 && sessF.status === 'open');
  const editF = await req2('PUT', '/api/admin/carts/' + cartFId, { token: A2, body: { items: [
    { serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 },
    { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }
  ] } });
  t('v55 session safety: the edit EXPIRES the outstanding pay session at Stripe and lands the new totals', editF.status === 200 && editF.j.cart.listTotal === 250 && stripeState.sessions[sessF.id].status === 'expired');
  // Worst case: the customer was mid-payment and Stripe completes the OLD
  // session anyway — the stale return must convert NOTHING, because the
  // cart no longer records that session id.
  await mockSessionPaid(sessF.id);
  const reqsB4F = await req2('GET', '/api/requests', { token: A2 });
  const cntB4F = (reqsB4F.j.requests || []).length;
  await fetch(BASE2 + '/cart/' + cartFId + '?paid=1&session_id=' + sessF.id);
  const reqsAfF = await req2('GET', '/api/requests', { token: A2 });
  t('v55 session safety: a stale ?paid=1 return with the OLD session id converts nothing', (reqsAfF.j.requests || []).length === cntB4F && !(reqsAfF.j.requests || []).some(x => x.menuOrder && x.menuOrder.cartId === cartFId));
  // A fresh checkout on the edited cart charges the NEW total and converts.
  const cpF2 = await req2('POST', '/api/carts/' + cartFId + '/checkout', { body: det });
  const sessF2 = sessionForCart(cartFId, 'payment');
  t('v62→v79 v55 session safety: fresh checkout after the edit is a NEW session at the NEW deposit ($50 of the new $250 total)', cpF2.status === 200 && cpF2.j.amount === 50 && cpF2.j.total === 250 && !!sessF2 && sessF2.id !== sessF.id && sessF2.amount_total === 5000);
  await mockSessionPaid(sessF2.id);
  const retF2 = await fetch(BASE2 + '/cart/' + cartFId + '?paid=1&session_id=' + sessF2.id);
  const admReqsF = await req2('GET', '/api/requests', { token: A2 });
  const convF = (admReqsF.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartFId);
  t('v62→v79 v55 session safety: the fresh session converts the edited cart (deposit $50 recorded, $250 total)', retF2.status === 200 && !!convF && convF.payment.status === 'deposit' && convF.payment.amountCents === 5000 && convF.payment.totalCents === 25000 && convF.menuOrder.totals.list === 250);
  // Same protection for a pending combined JOIN session on the cart (v70).
  const suG = await req2('POST', '/api/signup', { body: { name: 'Edit Join', email: 'editjoin@test.com', password: 'password123', phone: '7075550210', role: 'customer' } });
  const cartG = await req2('POST', '/api/admin/carts', { token: A2, body: { items: [{ serviceId: 'faucet-replacement', name: 'Faucet Swap', qty: 1, unitPrice: 125 }] } });
  const cartGId = cartG.j.cart.id;
  const coG = await req2('POST', '/api/carts/' + cartGId + '/checkout', { token: suG.j.token, body: { name: 'Edit Join', phone: '7075550210', email: 'editjoin@test.com', address: '40 Join St', city: 'Fairfield', when: 'Today', join: true } });
  const joinSessG = sessionForCart(cartGId, 'subscription');
  t('v55 setup: combined join session opened from the cart page', coG.status === 200 && coG.j.next === 'pay' && !!joinSessG && joinSessG.status === 'open');
  const editG = await req2('PUT', '/api/admin/carts/' + cartGId, { token: A2, body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  t('v55 session safety: the edit EXPIRES the pending join session too', editG.status === 200 && stripeState.sessions[joinSessG.id].status === 'expired');
  await mockSessionPaid(joinSessG.id); // the race: Stripe completed it anyway
  await fetch(BASE2 + '/cart/' + cartGId + '?paid=1&session_id=' + joinSessG.id, { headers: { Authorization: 'Bearer ' + suG.j.token } });
  const chkG = await req2('POST', '/api/carts/' + cartGId + '/member-check', { body: { email: 'editjoin@test.com' } });
  t('v55 session safety: the stale join return activates NO membership', chkG.status === 200 && chkG.j.member === false);

  // --- v57: plan picker at cart join (Gabriel, live test: "how can
  // they change the membership style they want? I don't see that
  // option") ---
  // The cart join used to be HomeCare-only. The picker now offers all
  // five paid plans; the join SESSION is created for the picked plan at
  // the server-side MEMBERSHIP_PLANS price, and activation records THAT
  // plan through the shared membership model (activateMembershipPlan /
  // membershipPlanOf). The 20% order discount still belongs to HomeCare
  // / HomeCare Plus ONLY: a Plus join pays the member total, a Yard
  // join pays the GUEST total, records a Yard membership, and the page
  // never claims a discount was applied for it.
  const cartV = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const pageV = await fetch(BASE2 + '/cart/' + cartV.j.cart.id);
  const pageVH = await pageV.text();
  t('v57 cart: the join box carries a plan picker — 5 plan radios (HomeCare pre-picked) + plan copy, and the Yard honesty note waits hidden in the picker', pageV.status === 200 && pageVH.includes('id="planPicker" style="display:none') && pageVH.includes('name="cPlan" value="homecare" checked') && pageVH.includes('name="cPlan" value="plus1"') && pageVH.includes('name="cPlan" value="plus2"') && pageVH.includes('name="cPlan" value="yard1"') && pageVH.includes('name="cPlan" value="yard2"') && pageVH.includes('HomeCare Plus — $100/mo') && pageVH.includes('HomeCare Plus — $175/mo') && pageVH.includes('Yard Care — $75/mo') && pageVH.includes('Yard Care — $150/mo') && pageVH.includes('id="yardNote" style="display:none') && pageVH.includes('the 20% discount on orders comes with HomeCare / HomeCare Plus'));
  t('v57 cart: preview is BY PLAN — PLANS map embedded with disc flags (Yard disc:0), and the checkout POST sends the picked plan key', pageVH.includes('"homecare":{"name":"HomeCare","price":"$29","cents":2900,"disc":1}') && pageVH.includes('"plus1":{"name":"HomeCare Plus","price":"$100","cents":10000,"disc":1}') && pageVH.includes('"yard1":{"name":"Yard Care","price":"$75","cents":7500,"disc":0}') && pageVH.includes('"yard2":{"name":"Yard Care","price":"$150","cents":15000,"disc":0}') && pageVH.includes('yn.style.display=(joinOn() && !PLANS[selPlan()].disc)?"block":"none"') && pageVH.includes('plan:wantJoin?selPlan():""'));
  const suT = await req2('POST', '/api/signup', { body: { name: 'Tamper', email: 'tamper@test.com', password: 'password123', phone: '7075550211', role: 'customer' } });
  const detT = { name: 'Tamper', phone: '7075550211', email: 'tamper@test.com', address: '41 Tamper St', city: 'Fairfield', when: 'Today' };
  const badPlan = await req2('POST', '/api/carts/' + cartV.j.cart.id + '/checkout', { token: suT.j.token, body: Object.assign({}, detT, { join: true, plan: 'gold' }) });
  const badPlan2 = await req2('POST', '/api/carts/' + cartV.j.cart.id + '/checkout', { token: suT.j.token, body: Object.assign({}, detT, { join: true, plan: 'price_1UTmMwLu9cCIcixBELdMhHh3' }) });
  t('v57 cart: a tampered/unknown plan key is a hard 400 (a smuggled Stripe price id is not a plan key)', badPlan.status === 400 && badPlan2.status === 400);
  // Path P — picks HomeCare Plus on the cart page (v70: single checkout).
  const suP = await req2('POST', '/api/signup', { body: { name: 'Path P', email: 'pathp@test.com', password: 'password123', phone: '7075550212', role: 'customer' } });
  const cartP = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const detP = { name: 'Path P', phone: '7075550212', email: 'pathp@test.com', address: '42 Plus St', city: 'Fairfield', when: 'Today' };
  const coP = await req2('POST', '/api/carts/' + cartP.j.cart.id + '/checkout', { token: suP.j.token, body: Object.assign({}, detP, { join: true, plan: 'plus1' }) });
  const joinSessP = sessionForCart(cartP.j.cart.id, 'subscription');
  const joinSubP = joinSessP && stripeState.subs[joinSessP.subscription];
  t('v70 path P: ONE session at the PLUS price + the member deposit (amount $244 = $100 plan + $144 deposit); the subscription metadata names plus1', coP.status === 200 && coP.j.next === 'pay' && coP.j.plan === 'plus1' && coP.j.amount === 244 && coP.j.deposit === 144 && coP.j.planFirst === 100 && !!joinSubP && joinSubP.items.data[0].price.id === 'price_1UTmS6Lu9cCIcixB312eNpYF' && joinSubP.metadata.plan === 'plus1');
  await mockSessionPaid(joinSessP.id);
  const retP = await fetch(BASE2 + '/cart/' + cartP.j.cart.id + '?paid=1&session_id=' + joinSessP.id, { headers: { Authorization: 'Bearer ' + suP.j.token } });
  const retPH = await retP.text();
  cust = await customersByEmail();
  t('v70 path P: the ONE verified return records HomeCare Plus ACTIVE (+ the HomeCare benefit flag every discount check reads) AND books the job', retP.status === 200 && !!cust['pathp@test.com'] && cust['pathp@test.com'].membershipPlan.planKey === 'plus1' && cust['pathp@test.com'].membershipPlan.status === 'active' && cust['pathp@test.com'].homeCareStatus === 'active' && retPH.includes('Deposit received'));
  const chkP = await req2('POST', '/api/carts/' + cartP.j.cart.id + '/member-check', { body: { email: 'pathp@test.com' } });
  const admReqsP = await req2('GET', '/api/requests', { token: A2 });
  const convP = (admReqsP.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartP.j.cart.id);
  t('v70 path P: a Plus member IS a discount member — and the order already converted at the member total in the same step (deposit $144 of $360)', chkP.status === 200 && chkP.j.member === true && !!convP && convP.payment.status === 'deposit' && convP.payment.amountCents === 14400 && convP.payment.totalCents === 36000 && convP.membership === 'member');
  // Path Y — picks Yard Care on the cart page (v70: single checkout).
  const suY = await req2('POST', '/api/signup', { body: { name: 'Path Y', email: 'pathy@test.com', password: 'password123', phone: '7075550213', role: 'customer' } });
  const cartY = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const detY = { name: 'Path Y', phone: '7075550213', email: 'pathy@test.com', address: '43 Yard St', city: 'Fairfield', when: 'Today' };
  const coY = await req2('POST', '/api/carts/' + cartY.j.cart.id + '/checkout', { token: suY.j.token, body: Object.assign({}, detY, { join: true, plan: 'yard1' }) });
  const joinSessY = sessionForCart(cartY.j.cart.id, 'subscription');
  const joinSubY = joinSessY && stripeState.subs[joinSessY.subscription];
  t('v70 path Y: ONE session at the YARD price + the GUEST-total deposit (amount $247 = $75 plan + $172 deposit); the subscription metadata names yard1', coY.status === 200 && coY.j.next === 'pay' && coY.j.plan === 'yard1' && coY.j.amount === 247 && coY.j.deposit === 172 && coY.j.planFirst === 75 && coY.j.memberApplied === false && !!joinSubY && joinSubY.items.data[0].price.id === 'price_1UTmMwLu9cCIcixBELdMhHh3' && joinSubY.metadata.plan === 'yard1');
  await mockSessionPaid(joinSessY.id);
  const retY = await fetch(BASE2 + '/cart/' + cartY.j.cart.id + '?paid=1&session_id=' + joinSessY.id, { headers: { Authorization: 'Bearer ' + suY.j.token } });
  const retYH = await retY.text();
  cust = await customersByEmail();
  t('v70 path Y: the ONE verified return records a YARD membership (yard1 active), NO HomeCare benefit flag, and the job BOOKED at the guest total', retY.status === 200 && !!cust['pathy@test.com'] && cust['pathy@test.com'].membershipPlan.planKey === 'yard1' && cust['pathy@test.com'].membershipPlan.status === 'active' && cust['pathy@test.com'].homeCareStatus !== 'active' && retYH.includes('Deposit received') && retYH.includes('Pay balance $258.00') && !retYH.includes('data-i18n="memberAppliedH"'));
  const chkY = await req2('POST', '/api/carts/' + cartY.j.cart.id + '/member-check', { body: { email: 'pathy@test.com' } });
  t('v57 path Y: member-check (the DISCOUNT check) stays FALSE for a Yard member', chkY.status === 200 && chkY.j.member === false);
  const admReqsY = await req2('GET', '/api/requests', { token: A2 });
  const convY = (admReqsY.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartY.j.cart.id);
  t('v70 path Y: the Yard order converted in the same step at the guest total with membership=none (deposit $172 of $430)', !!convY && convY.payment.status === 'deposit' && convY.payment.amountCents === 17200 && convY.payment.totalCents === 43000 && convY.membership === 'none');
  // The OTHER member question: Yard members ARE members for the app's
  // estimate-fee rules (POST /api/requests) — the shared once-per-account
  // free first in-person estimate, then the $50 member price; a guest
  // pays $75. Two different "member" checks, two different answers.
  const yReq1 = await req2('POST', '/api/requests', { token: suY.j.token, body: { service: 'Yard cleanup', description: 'overgrown', city: 'Fairfield', estimateType: 'inperson' } });
  const yReq2 = await req2('POST', '/api/requests', { token: suY.j.token, body: { service: 'Fence repair', description: 'leaning', city: 'Fairfield', estimateType: 'inperson' } });
  t('v57 yard member: member-ESTIMATE rules recognize the Yard plan (first in-person estimate free, then $50 — never the $75 guest price)', yReq1.status === 201 && yReq1.j.request.estimateDue === 0 && yReq2.status === 201 && yReq2.j.request.estimateDue === 50);
  // Path W — the checkout.session.completed webhook (not the return)
  // finishes a combined cart join: yard2 activates on the account AND
  // the cart converts, both from the cart-join branch.
  const suW = await req2('POST', '/api/signup', { body: { name: 'Path W', email: 'pathw@test.com', password: 'password123', phone: '7075550214', role: 'customer' } });
  const cartW = await req2('POST', '/api/admin/carts', { token: A2, body: { items: mixItems } });
  const detW = { name: 'Path W', phone: '7075550214', email: 'pathw@test.com', address: '44 Webhook Way', city: 'Fairfield', when: 'Today' };
  const coW = await req2('POST', '/api/carts/' + cartW.j.cart.id + '/checkout', { token: suW.j.token, body: Object.assign({}, detW, { join: true, plan: 'yard2' }) });
  const joinSessW = sessionForCart(cartW.j.cart.id, 'subscription');
  const joinSubW = joinSessW && stripeState.subs[joinSessW.subscription];
  t('v70 path W setup: yard2 combined session opened (yard2 price + guest deposit)', coW.status === 200 && coW.j.plan === 'yard2' && coW.j.amount === 322 && !!joinSubW && joinSubW.items.data[0].price.id === 'price_1UTmQtLu9cCIcixBkCpLd2k2');
  await mockSessionPaid(joinSessW.id);
  const whW = await wh2('checkout.session.completed', { id: joinSessW.id, mode: 'subscription', payment_status: 'paid', amount_total: 32200, payment_intent: joinSessW.payment_intent, customer: joinSessW.customer, subscription: joinSessW.subscription, metadata: joinSessW.metadata });
  cust = await customersByEmail();
  const admReqsW = await req2('GET', '/api/requests', { token: A2 });
  const convW = (admReqsW.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartW.j.cart.id);
  t('v70 webhook: a cart-join checkout.session.completed activates yard2 AND converts the cart (deposit $172 of $430, membership=none)', whW.status === 200 && !!cust['pathw@test.com'] && cust['pathw@test.com'].membershipPlan.planKey === 'yard2' && cust['pathw@test.com'].membershipPlan.status === 'active' && cust['pathw@test.com'].homeCareStatus !== 'active' && !!convW && convW.payment.status === 'deposit' && convW.payment.amountCents === 17200 && convW.payment.totalCents === 43000);
  const retW = await fetch(BASE2 + '/cart/' + cartW.j.cart.id + '?paid=1&session_id=' + joinSessW.id, { headers: { Authorization: 'Bearer ' + suW.j.token } });
  const retWH = await retW.text();
  t('v70 webhook: the later ?paid=1 return is a clean idempotent no-op (booked page, still yard2, no error, no duplicate order)', retW.status === 200 && retWH.includes('Deposit received') && (admReqsW.j.requests || []).filter(x => x.menuOrder && x.menuOrder.cartId === cartW.j.cart.id).length === 1);
  // Estimate page: the join stays HomeCare-only (verdict pinned — its
  // block is a savings pitch gated on the member discount improving
  // THIS estimate; there is no picker/totals slot to extend).
  const estFnSrc57 = serverSrc.slice(serverSrc.indexOf('function estimatePageHtml'), serverSrc.indexOf('function installPageHtml'));
  t('v57 estimate: join block unchanged — no plan picker on the estimate page, its join-checkout still creates HomeCare sessions only', !estFnSrc57.includes('name="cPlan"') && !estFnSrc57.includes('planPicker') && serverSrc.includes("createCheckoutSession('homecare', user, {\n        successUrl: estimatePageLink(r)"));

  // --- cart page language rule: ONE language at a time (EN | ES toggle) ---
  // Scripts are stripped before asserting: the translation dictionary rides
  // in a script tag (data), while the RENDERED page must be single-language.
  const stripScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '');
  const EN_UI = ['Your cart', 'Your info', 'Become a HomeCare member', 'You pay a booking deposit today', 'Questions? Text or call'];
  const ES_UI = ['Tu carrito', 'Tus datos', 'Hazte miembro de HomeCare', 'Hoy pagas un anticipo para agendar tu trabajo', '¿Preguntas?'];
  const pgEn = stripScripts(page1Html);
  t('v44 i18n: the default cart page renders ENGLISH only (zero ES UI strings)', EN_UI.every(s => pgEn.includes(s)) && !ES_UI.some(s => pgEn.includes(s)));
  t('v44 i18n: EN|ES toggle ships on the page and the choice persists (localStorage, pay button speaks T())', page1Html.includes('data-lang-btn="en"') && page1Html.includes('data-lang-btn="es"') && page1Html.includes('ghsCartLang') && page1Html.includes('localStorage') && page1Html.includes('T("payBtn")'));
  const cartEs = await req2('POST', '/api/admin/carts', { token: A2, body: { lang: 'es', items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }] } });
  t('v44 i18n: the admin sets the cart language at creation (lang round-trips)', cartEs.status === 201 && cartEs.j.cart.lang === 'es');
  const pgEsRes = await fetch(BASE2 + '/cart/' + cartEs.j.cart.id);
  const pgEs = stripScripts(await pgEsRes.text());
  t('v62 i18n: a Spanish cart renders SPANISH only (zero EN UI strings, ES deposit pay button)', ES_UI.every(s => pgEs.includes(s)) && !EN_UI.some(s => pgEs.includes(s)) && pgEs.includes('Pagar anticipo $50.00'));
  const pgQRes = await fetch(BASE2 + '/cart/' + cart3.j.cart.id + '?lang=es');
  const pgQ = stripScripts(await pgQRes.text());
  t('v44 i18n: ?lang=es overrides an English cart (preview / support)', pgQ.includes('Tu carrito') && pgQ.includes('Tus datos') && !pgQ.includes('Your info'));

  // --- website copy sweep (files) ---
  const ROOT44 = path.join(APP_DIR, '..');
  const rd44 = (f) => fs.readFileSync(path.join(ROOT44, f), 'utf8');
  t('v44 web: homepage/service/checkout/tracking carry no $75-hold pitch', !rd44('index.html').includes('$75 hold') && !rd44('service.html').includes('$75 hold') && !rd44('checkout.html').includes('$75 hold') && !rd44('tracking.html').includes('$75 hold'));
  t('v44 web: the 6 city pages replaced the hold sentence with pay-in-full wording', ['handyman-fairfield', 'handyman-vacaville', 'handyman-vallejo', 'tv-mounting-vacaville', 'mobile-mechanic-vallejo', 'plumber-fairfield'].every(d => { const s = rd44(d + '/index.html'); return !s.includes('authorization hold secures') && s.includes('paid in full when you book'); }));
}

// ---------------- v46: charge audit matrix + server-side totals + menu PRO (images + EN|ES) + admin map ----------------
{
  // --- parse the client catalog and the server mirror from source (data-driven) ---
  const catEntries = {};
  {
    const starts = [...catBlock.matchAll(/'([a-z0-9-]+)': \{ name:/g)];
    for (let i = 0; i < starts.length; i++) {
      const seg = catBlock.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : catBlock.length);
      const price = +(/price: (\d+)/.exec(seg) || [])[1];
      const member = +(/member: (\d+)/.exec(seg) || [])[1];
      const addons = {};
      const am = /addons: \[([\s\S]*?)\]/.exec(seg);
      if (am) for (const a of am[1].matchAll(/\{ id: '([a-z0-9-]+)', name: '([^']*)', price: (\d+)(, nodisc: true)? \}/g)) addons[a[1]] = { price: +a[3], nodisc: !!a[4], name: a[2] };
      catEntries[starts[i][1]] = { price, member, addons };
    }
  }
  const srvEntries = {};
  {
    const smBlock = serverSrc.slice(serverSrc.indexOf('const SERVER_MENU = {'), serverSrc.indexOf('function serverMenuTotals'));
    for (const m of smBlock.matchAll(/"([a-z0-9-]+)":\{p:(\d+),m:(\d+)(?:,a:\{([\s\S]*?)\})?\}/g)) {
      const addons = {};
      if (m[4]) for (const a of m[4].matchAll(/"([a-z0-9-]+)":\[(\d+),([01]),"((?:[^"\\]|\\.)*)"\]/g)) addons[a[1]] = { price: +a[2], nodisc: a[3] === '1', name: a[4] };
      srvEntries[m[1]] = { price: +m[2], member: +m[3], addons };
    }
  }
  const catIds = Object.keys(catEntries);
  t('v46 audit: catalog parsed — 98 services on both sides', catIds.length === 98 && Object.keys(srvEntries).length === 98);
  let drift = [];
  for (const id of catIds) {
    const c = catEntries[id], s = srvEntries[id];
    if (!s) { drift.push(id + ':missing-server'); continue; }
    if (c.price !== s.price || c.member !== s.member) drift.push(id + ':price');
    const ca = Object.keys(c.addons), sa = Object.keys(s.addons);
    if (ca.length !== sa.length || !ca.every(k => s.addons[k] && s.addons[k].price === c.addons[k].price && s.addons[k].nodisc === c.addons[k].nodisc)) drift.push(id + ':addons');
  }
  t('v46 audit: SERVER_MENU is an exact mirror of MENU_CATALOG (price/member/add-ons/nodisc)', drift.length === 0);
  if (drift.length) console.log('  drift:', drift.join(' '));
  t('v46 audit: every member price is exactly round(price x 0.8)', catIds.every(id => catEntries[id].member === Math.round(catEntries[id].price * 0.8)));

  // --- client totals matrix in the VM: all 98 x guest/member x ASAP x all add-ons ---
  const expect = (id, member, asap, withExtras) => {
    const c = catEntries[id];
    const adds = withExtras ? Object.values(c.addons) : [];
    const list = c.price + adds.reduce((s, a) => s + a.price, 0);
    const mem = c.member + Math.round(adds.filter(a => !a.nodisc).reduce((s, a) => s + a.price, 0) * 0.8) + adds.filter(a => a.nodisc).reduce((s, a) => s + a.price, 0);
    let due = member ? mem : list;
    const fee = asap ? Math.round(due * 0.25) : 0;
    return { list, member: mem, due: due + fee, asapFee: fee };
  };
  let matrixBad = [];
  run('cartSave([]);');
  for (const id of catIds) {
    const addonIds = Object.keys(catEntries[id].addons);
    const combos = [[false, false], [true, false], [false, true], [true, true]];
    for (const [mem, extras] of combos) {
      run('cartSave([' + JSON.stringify({ id: id, q: 1, x: extras ? addonIds : [] }) + ']);');
      const got = JSON.parse(run('JSON.stringify(cartCalc())'));
      const exp = expect(id, mem, false, extras);
      if (got.list !== exp.list || got.member !== exp.member) matrixBad.push(id + '/' + mem + '/' + extras + ' got ' + got.list + '/' + got.member + ' want ' + exp.list + '/' + exp.member);
    }
  }
  run('cartSave([]);');
  t('v46 matrix (v79): client cartCalc matches the catalog formula for all 98 services x member x add-ons (ASAP combos retired with the #order page — the cart has no ASAP)', matrixBad.length === 0);
  if (matrixBad.length) console.log('  matrix mismatches:', matrixBad.slice(0, 6).join(' | '));

  // --- server recompute: tampered totals can no longer set the price ---
  const mkCust46 = async (email) => { const su = await req2('POST', '/api/signup', { body: { name: 'Audit ' + email, email, password: 'password123', phone: '7075550160', role: 'customer' } }); return su.j.token; };
  const menuPost = (tk, menuOrder) => req2('POST', '/api/requests', { token: tk, body: { service: 'Menu order', description: 'audit', address: '9 Audit Way', city: 'Fairfield', when: 'Today', estimateType: 'menu', menuOrder } });
  const tkG = await mkCust46('audit-guest@t.local');
  const tamp = await menuPost(tkG, { serviceId: 'garbage-disposal-swap', extras: [], asap: false, joinedMembership: false, totals: { list: 1, member: 1, due: 1 } });
  t('v46 audit: a $1 tampered total is recomputed to the catalog $125 + flagged', tamp.status === 201 && tamp.j.request.menuOrder.totals.due === 125 && tamp.j.request.menuOrder.totalsCorrected === true && tamp.j.request.menuOrder.clientDue === 1);
  const tampPay = await req2('POST', '/api/orders/pay', { token: tkG, body: { requestId: tamp.j.request.id } });
  t('v46 audit: payment charges the RECOMPUTED $125.00, not the tampered $1', tampPay.status === 200 && stripeState.pis[tampPay.j.paymentIntentId] && stripeState.pis[tampPay.j.paymentIntentId].amount === 12500);
  const honest = await menuPost(tkG, { serviceId: 'garbage-disposal-swap', extras: [], asap: false, joinedMembership: false, totals: { list: 125, member: 100, due: 125 } });
  t('v46 audit: honest totals pass through uncorrected', honest.status === 201 && honest.j.request.menuOrder.totals.due === 125 && !honest.j.request.menuOrder.totalsCorrected);
  const badSvc = await menuPost(tkG, { serviceId: 'not-a-service', extras: [], asap: false, joinedMembership: false, totals: { list: 1, member: 1, due: 1 } });
  t('v46 audit: unknown service id is rejected (400)', badSvc.status === 400);
  const badAdd = await menuPost(tkG, { serviceId: 'toilet-replacement', extras: [{ id: 'free-stuff', name: 'Free stuff', price: 0 }], asap: false, joinedMembership: false, totals: { list: 250, member: 200, due: 250 } });
  t('v46 audit: unknown add-on id is rejected (400) — no invented extras', badAdd.status === 400);
  const staleAdd = await menuPost(tkG, { serviceId: 'toilet-replacement', extras: [{ name: 'Remove & haul away the old toilet', price: 9999 }], asap: false, joinedMembership: false, totals: { list: 1, member: 1, due: 1 } });
  t('v46 audit: stale client add-on resolves BY NAME at the catalog $50 (nodisc) — due $225 ($175 + $50), not $9,999', staleAdd.status === 201 && staleAdd.j.request.menuOrder.totals.due === 225 && staleAdd.j.request.menuOrder.extras[0].price === 50);
  const asapOrd = await menuPost(tkG, { serviceId: 'water-heater', extras: [], asap: true, joinedMembership: false, totals: { list: 700, member: 560, due: 700 } });
  t('v46 audit: ASAP on a guest charges list + 25% ($700 -> $875)', asapOrd.status === 201 && asapOrd.j.request.menuOrder.totals.due === 875 && asapOrd.j.request.menuOrder.totals.asapFee === 175);
  // member status comes from the SERVER, and a bare joinedMembership flag grants nothing
  const m46 = await mkMember('audit-member@t.local', '(707) 555-0460');
  const sub46 = await req2('POST', '/api/stripe/homecare-subscribe', { token: m46.token, body: {} });
  await mockActivate(sub46.j.subscriptionId);
  const conf46 = await req2('POST', '/api/stripe/homecare-confirm', { token: m46.token, body: {} });
  t('v46 audit setup: HomeCare member active on the server', conf46.status === 200 && conf46.j.active === true);
  const memOrd = await menuPost(m46.token, { serviceId: 'water-heater', extras: [], asap: true, joinedMembership: false, totals: { list: 700, member: 560, due: 700 } });
  t('v46 audit: server-side member gets $560 + ASAP 25% on the DISCOUNTED price = $700', memOrd.status === 201 && memOrd.j.request.menuOrder.totals.due === 700 && memOrd.j.request.menuOrder.totals.asapFee === 140);
  const fakeJoin = await menuPost(tkG, { serviceId: 'water-heater', extras: [], asap: false, joinedMembership: true, totals: { list: 700, member: 560, due: 560 } });
  t('v46 audit: joinedMembership flag ALONE (no subscription) does NOT grant member pricing', fakeJoin.status === 201 && fakeJoin.j.request.menuOrder.totals.due === 700);

  // --- menu PRO: images wired + present for all 98 ---
  t('v46 menu: every service has a real photo file on disk', catIds.every(id => fs.existsSync(path.join(APP_DIR, 'public', 'menu-img', id + '.jpg'))));
  t('v46 menu: cards + wizard rows load /menu-img/<id>.jpg with the category photo as fallback', htmlSrc.includes('function svcImgHtml(') && htmlSrc.includes('src="/menu-img/') && htmlSrc.includes('this.src=CAT_IMGS[') && serverSrc.includes("p.startsWith('/menu-img/')"));
  run("location.hash = ''; render(); setMenuLang('en');");
  const menuEn = elById.get('menuGroups').innerHTML;
  t('v46 menu EN: per-service photos on the cards (98 imgs)', (menuEn.match(/\/menu-img\/[a-z0-9-]+\.jpg/g) || []).length === 98 && menuEn.includes('Faucet Replacement') && menuEn.includes('Members $100'));
  // --- menu EN|ES: one language at a time, persisted ---
  t('v46 i18n: MENU_ES covers all 98 services', run('Object.keys(MENU_ES).length') === 98 && run('Object.keys(MENU_CATALOG).every(function(k){ return !!MENU_ES[k]; })') === true);
  run("setMenuLang('es');");
  const menuEs = elById.get('menuGroups').innerHTML;
  t('v46 menu ES: names + group titles + buttons switch fully to Spanish', menuEs.includes('Cambio de mezcladora / llave') && menuEs.includes('Plomería') && !menuEs.includes('Plomería · Plumbing') && menuEs.includes('Miembros $100') && menuEs.includes('>Ordenar<') && !menuEs.includes('Faucet Replacement'));
  t('v46 menu ES: the choice persists (localStorage ghsMenuLang)', run("localStorage.getItem('ghsMenuLang')") === 'es' && elById.get('menuTitle').textContent.includes('Menú'));
  run("wzPickCat('plumbing');");
  const panelEs = elById.get('wzMenuPanel').innerHTML;
  t('v46 wizard ES: fixed-price list speaks Spanish + shows per-service thumbs', panelEs.includes('Cambio de mezcladora') && panelEs.includes('wz-mi-img') && panelEs.includes('/menu-img/faucet-replacement.jpg') && !panelEs.includes('Faucet Replacement'));
  run("setMenuLang('en'); wzPickCat('plumbing');");
  const panelEn = elById.get('wzMenuPanel').innerHTML;
  t('v46 wizard EN: switching back restores English everywhere', panelEn.includes('Faucet Replacement') && !panelEn.includes('Cambio de mezcladora') && run("localStorage.getItem('ghsMenuLang')") === 'en');
  run("location.hash = ''; render();");

  // --- admin map + optimization statics ---
  const mapFn = htmlSrc.slice(htmlSrc.indexOf('async function loadAdminMap('), htmlSrc.indexOf('// ---------- Admin captains (v40) ----------'));
  t('v46 map: default Solano County view is set BEFORE any marker + invalidateSize after layout', mapFn.includes('setView([38.25, -122.04], 10)') && mapFn.indexOf('setView([38.25, -122.04], 10)') < mapFn.indexOf('L.marker(') && mapFn.includes('invalidateSize()'));
  t('v46 map: empty state explains itself + the worker list renders first (primary)', mapFn.includes('Showing Solano County') && mapFn.indexOf("'<div>' + listHtml") > -1 && mapFn.indexOf("'<div>' + listHtml") < mapFn.indexOf('id="adminMap"'));
  t('v46 map: bad coordinates can no longer kill the whole map (per-marker guards)', mapFn.includes('isFinite(Number(w.lat))') && mapFn.includes('isFinite(Number(j.destLat))') && (mapFn.match(/try \{/g) || []).length >= 3);
  t('v46 admin: loadAdmin coalesces stacked reloads + reuses its jobs fetch for the map', htmlSrc.includes('_adminReloadQueued') && htmlSrc.includes('loadAdminMap(jobs)') && htmlSrc.includes('async function loadAdminJobs()'));
  t('v46 csp: tile.openstreetmap.org images are allowed by the v33 CSP (img-src https:)', serverSrc.includes("img-src 'self' data: blob: https:"));
}



try { child2.kill('SIGTERM'); } catch (e) {}
await sleep(400);
const seedDb = JSON.parse(fs.readFileSync(DATA_FILE2, 'utf8'));
const isoNow = new Date().toISOString();
function seedReq(id, email, pi) {
  return { id, customerId: m1.id, customerName: 'Member One', customerEmail: email, customerPhone: '(707) 555-0301', service: 'Faucet repair', description: 'drips', city: 'Fairfield', address: '1 Main St, Fairfield, CA', when: 'Tomorrow', estimateType: 'inperson', estimateDue: 75, status: 'Approved', estimate: { total: 75, credit: 0, subtotal: 75, items: [] }, holds: [{ key: 'visit', pi, sessionId: '', status: 'authorized', authorizedCents: 7500, capturedCents: 0, captureBefore: null, incremental: null, createdAt: isoNow, updatedAt: isoNow }], messages: [], createdAt: isoNow };
}
seedDb.requests.push(seedReq('GHS-RCPT1', 'm1@t.local', 'pi_hold_ok1'));
seedDb.requests.push(seedReq('GHS-RCPT2', 'm1@t.local', 'pi_fail_hold'));
seedDb.requests.push(seedReq('GHS-RCPT3', '', 'pi_hold_ok3'));
seedDb.requests.push(seedReq('GHS-RCPT4', 'm1@t.local', 'pi_hold_ok4'));
fs.writeFileSync(DATA_FILE2, JSON.stringify(seedDb));
child2 = spawnApp2();
child2.stderr.on('data', d => process.stderr.write('[app2] ' + d));
await waitHealth2();
const adm2b = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
const A2B = adm2b.j.token;
t('v24 A3: app2 reboots on the seeded data file', !!A2B);
async function mockEmails() { const r = await fetch('http://127.0.0.1:8981/__emails'); return r.json(); }
function receiptsFor(emails, idPart) { return emails.filter(e => (e.subject || '') === 'Your receipt — General Handyman Solutions' && JSON.stringify(e).includes(idPart)); }
async function waitReceipts(idPart, tries) {
  let hits = [];
  for (let i = 0; i < (tries || 24); i++) { hits = receiptsFor(await mockEmails(), idPart); if (hits.length) return hits; await sleep(200); }
  return hits;
}
const cap1 = await req2('POST', '/api/requests/GHS-RCPT1/hold/capture', { token: A2B, body: { finalCents: 7500 } });
t('v24 A3: capture succeeds (mock Stripe)', cap1.status === 200 && cap1.j.finalCents === 7500);
const rc1 = await waitReceipts('GHS-RCPT1');
t('v24 A3: exactly one receipt email after capture', rc1.length === 1);
t('v24 A3: receipt goes to the customer with amount + service + request id', rc1.length === 1 && JSON.stringify(rc1[0].to) === JSON.stringify(['m1@t.local']) && JSON.stringify(rc1[0]).includes('$75.00') && JSON.stringify(rc1[0]).includes('Faucet repair') && JSON.stringify(rc1[0]).includes('GHS-RCPT1'));
const cap1b = await req2('POST', '/api/requests/GHS-RCPT1/hold/capture', { token: A2B, body: { finalCents: 7500 } });
await sleep(700);
t('v24 A3: a retried capture sends NO second receipt', cap1b.status === 200 && receiptsFor(await mockEmails(), 'GHS-RCPT1').length === 1);
const cap2 = await req2('POST', '/api/requests/GHS-RCPT2/hold/capture', { token: A2B, body: { finalCents: 7500 } });
await sleep(500);
t('v24 A3: failed capture -> 502 and NO receipt', cap2.status === 502 && receiptsFor(await mockEmails(), 'GHS-RCPT2').length === 0);
const cap3 = await req2('POST', '/api/requests/GHS-RCPT3/hold/capture', { token: A2B, body: { finalCents: 7500 } });
await sleep(500);
t('v24 A3: capture with no customer email succeeds, sends nothing', cap3.status === 200 && receiptsFor(await mockEmails(), 'GHS-RCPT3').length === 0);
await fetch('http://127.0.0.1:8981/__fail', { method: 'POST', body: 'true' });
const cap4 = await req2('POST', '/api/requests/GHS-RCPT4/hold/capture', { token: A2B, body: { finalCents: 7500 } });
await sleep(600);
t('v24 A3: Resend failure does NOT break the capture (still 200)', cap4.status === 200 && cap4.j.finalCents === 7500);
// ---------------- v33: security hardening + first-order E2E ----------------
{
  const hdrs = await fetch(BASE2 + '/');
  t('v33 headers: nosniff + DENY frame + CSP naming Stripe', hdrs.headers.get('x-content-type-options') === 'nosniff' && hdrs.headers.get('x-frame-options') === 'DENY' && (hdrs.headers.get('content-security-policy') || '').includes('js.stripe.com'));
  const shortPw = await req2('POST', '/api/signup', { body: { name: 'Short Pw', email: 'shortpw@test.com', password: 'short', role: 'customer' } });
  t('v33 signup rejects passwords under 8 characters', shortPw.status === 400);
  let lastLogin = null;
  for (let i = 0; i < 11; i++) lastLogin = await req2('POST', '/api/login', { body: { email: 'throttle@test.com', password: 'wrong-password' } });
  t('v33 login throttle: 429 after repeated failures', lastLogin.status === 429);
  // The exact path Gabriel cares about: a brand-new customer signs up, places
  // their FIRST menu order, the order lands in the admin list, Gabriel acts
  // on it, the customer sees the change, and the order is paid in full at
  // checkout (v44 rails) — with the audit log recording his actions.
  const fo = await req2('POST', '/api/signup', { body: { name: 'First Order', email: 'firstorder@test.com', password: 'password123', phone: '7075550111', serviceAddress: '22 First St, Fairfield, CA', role: 'customer' } });
  t('v33 E2E: new customer signup', fo.status === 201 && !!fo.j.token);
  const FT = fo.j.token;
  const foReq = await req2('POST', '/api/requests', { token: FT, body: { service: 'Faucet Replacement', description: 'Faucet Replacement — ordered from the menu.', address: '22 First St', city: 'Fairfield', when: 'Tomorrow', estimateType: 'menu', menuOrder: { serviceId: 'faucet-replacement', extras: [], asap: false, joinedMembership: false, totals: { list: 125, member: 100, due: 125 } } } });
  t('v33 E2E: first menu order created', foReq.status === 201 && foReq.j.request.estimateType === 'menu');
  const frid = foReq.j.request.id;
  const admList = await req2('GET', '/api/requests', { token: A2B });
  const admCopy = (admList.j.requests || []).find(x => x.id === frid);
  t('v33 E2E: admin receives the order with the customer identity', !!admCopy && admCopy.customerEmail === 'firstorder@test.com' && admCopy.status === 'New');
  const admPatch = await req2('PATCH', '/api/requests/' + frid, { token: A2B, body: { status: 'Scheduled' } });
  t('v33 E2E: admin can act on the order (status change)', admPatch.status === 200 && admPatch.j.request.status === 'Scheduled');
  const custList = await req2('GET', '/api/requests', { token: FT });
  t('v33 E2E: customer sees the admin change', (custList.j.requests || []).some(x => x.id === frid && x.status === 'Scheduled'));
  const foPay = await req2('POST', '/api/orders/pay', { token: FT, body: { requestId: frid } });
  await mockPiStatus(foPay.j.paymentIntentId, 'succeeded');
  const foConf = await req2('POST', '/api/orders/pay-confirm', { token: FT, body: { requestId: frid, paymentIntentId: foPay.j.paymentIntentId } });
  t('v33 E2E: first order paid in full at checkout (v44 rails)', foPay.status === 200 && foPay.j.amount === 125 && foConf.status === 200 && foConf.j.ok === true);
  const foMine = await req2('GET', '/api/requests', { token: FT });
  const foPaid = (foMine.j.requests || []).find(x => x.id === frid);
  t('v33 E2E: the paid-in-full payment shows on the customer order', !!foPaid && !!foPaid.payment && foPaid.payment.status === 'paid' && foPaid.payment.amountCents === 12500);
  const auditList = await req2('GET', '/api/admin/audit', { token: A2B });
  const acts = (auditList.j.entries || []).map(e => e.action + '|' + e.target);
  t('v33 audit: admin actions are in the security log', acts.includes('request.update|' + frid));
  const audit403 = await req2('GET', '/api/admin/audit', { token: FT });
  t('v33 audit: customers cannot read the security log (403)', audit403.status === 403);
}

await fetch('http://127.0.0.1:8981/__fail', { method: 'POST', body: 'false' });


// ---------------- v36: worker-deletion removal email ----------------
{
  const REM_SUBJ = 'Your General Handyman Solutions technician account';
  const removalsFor = (emails, addr) => emails.filter(e => (e.subject || '') === REM_SUBJ && JSON.stringify(e.to || []) === JSON.stringify([addr]));
  async function waitForMail(pred, tries) {
    let hits = [];
    for (let i = 0; i < (tries || 14); i++) { hits = (await mockEmails()).filter(pred); if (hits.length) return hits; await sleep(200); }
    return hits;
  }
  async function auditEntryFor(token, action, target) {
    const al = await req2('GET', '/api/admin/audit', { token });
    return (al.j.entries || []).find(e => e.action === action && e.target === target);
  }
  async function mkWorker36(name, email) {
    const su = await req2('POST', '/api/signup', { body: { name, email, phone: '(707) 555-0400', password: 'workpass36', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
    return su.j.user.id;
  }
  // (d) the existing activation email is unaffected by the new removal hook
  const dw1 = await mkWorker36('Del Uno', 'del1@t.local');
  await req2('PATCH', '/api/workers/' + dw1, { token: A2B, body: { status: 'active' } });
  const actHits = await waitForMail(e => (e.subject || '') === 'Your General Handyman Solutions worker account is ACTIVE' && JSON.stringify(e.to || []) === JSON.stringify(['del1@t.local']));
  t('v36: activation email unaffected (still sent on activation)', actHits.length === 1);
  // (a) deleting a worker sends exactly ONE removal email with the approved
  // bilingual copy (first name interpolated), the worker is gone, and the
  // audit entry records emailed: true
  const del1 = await req2('DELETE', '/api/workers/' + dw1, { token: A2B });
  const rem1 = removalsFor(await mockEmails(), 'del1@t.local');
  const EN1 = "Hi Del — this is the General Handyman Solutions Team. Your technician account has been removed. Thank you for applying and for your time. If you'd like to apply again in the future, you're welcome to — you can re-apply anytime at app.generalhandymans.app.";
  const ES1 = 'Hola Del — somos el equipo de General Handyman Solutions. Tu cuenta de técnico ha sido eliminada. Gracias por aplicar y por tu tiempo. Si en el futuro deseas aplicar de nuevo, eres bienvenido — puedes hacerlo cuando quieras en app.generalhandymans.app.';
  t('v36: worker DELETE succeeds', del1.status === 200 && del1.j.ok === true && del1.j.deleted === dw1);
  t('v36: exactly one removal email to the deleted worker', rem1.length === 1);
  t('v36: removal email carries the approved EN + ES lines and the app URL', rem1.length === 1 && (rem1[0].text || '').includes(EN1) && (rem1[0].text || '').includes(ES1) && (rem1[0].html || '').includes(EN1) && (rem1[0].html || '').includes(ES1));
  const wlist1 = await req2('GET', '/api/workers', { token: A2B });
  t('v36: deleted worker is gone from the roster', !(wlist1.j.workers || []).some(w => w.id === dw1));
  const aud1 = await auditEntryFor(A2B, 'worker.delete', dw1);
  t('v36: audit records the removal email as sent', !!aud1 && (aud1.detail || '').includes('emailed: true'));
  // (b) Resend forced to fail: the DELETE still succeeds, the worker is
  // still gone, and the audit entry records the email failure
  const dw2 = await mkWorker36('Del Dos', 'del2@t.local');
  await fetch('http://127.0.0.1:8981/__fail', { method: 'POST', body: 'true' });
  const del2 = await req2('DELETE', '/api/workers/' + dw2, { token: A2B });
  const del2again = await req2('DELETE', '/api/workers/' + dw2, { token: A2B });
  await fetch('http://127.0.0.1:8981/__fail', { method: 'POST', body: 'false' });
  const aud2 = await auditEntryFor(A2B, 'worker.delete', dw2);
  t('v36: Resend failure does NOT block the deletion (200, worker gone)', del2.status === 200 && del2.j.ok === true && del2again.status === 404);
  t('v36: audit records the removal email failure', !!aud2 && (aud2.detail || '').includes('emailed: false'));
  t('v36: failed send leaves no removal email in the inbox', removalsFor(await mockEmails(), 'del2@t.local').length === 0);
  // (c) a worker with NO email on file: no send is attempted, deletion
  // still succeeds. Seed one straight into the data file (signup requires
  // an email) by cloning an existing worker record, then reboot app2 on it.
  const remCountBefore = (await mockEmails()).filter(e => (e.subject || '') === REM_SUBJ).length;
  try { child2.kill('SIGTERM'); } catch (e) {}
  await sleep(400);
  const seed36 = JSON.parse(fs.readFileSync(DATA_FILE2, 'utf8'));
  const srcW = seed36.users.find(u => u.role === 'worker');
  const cloneW = JSON.parse(JSON.stringify(srcW));
  cloneW.id = 'USR-NOEMAIL36'; cloneW.name = 'No Email Worker'; cloneW.email = ''; cloneW.status = 'review';
  seed36.users.push(cloneW);
  fs.writeFileSync(DATA_FILE2, JSON.stringify(seed36));
  child2 = spawnApp2();
  child2.stderr.on('data', d => process.stderr.write('[app2] ' + d));
  await waitHealth2();
  const adm2c = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A2C = adm2c.j.token;
  t('v36: app2 reboots with the no-email worker seeded', !!A2C && !!srcW);
  const del3 = await req2('DELETE', '/api/workers/USR-NOEMAIL36', { token: A2C });
  const aud3 = await auditEntryFor(A2C, 'worker.delete', 'USR-NOEMAIL36');
  const remCountAfter = (await mockEmails()).filter(e => (e.subject || '') === REM_SUBJ).length;
  t('v36: deleting a no-email worker succeeds and attempts NO send', del3.status === 200 && del3.j.ok === true && remCountAfter === remCountBefore);
  t('v36: audit notes the missing email', !!aud3 && (aud3.detail || '').includes('no email on file') && (aud3.detail || '').includes('emailed: false'));
}

// ---------- v41: direct-offer email (app2, mock Resend) ----------
{
  const adm41 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A41 = adm41.j.token;
  const dan = await req2('POST', '/api/signup', { body: { name: 'Direct Dan', email: 'direct@t.local', phone: '(707) 555-0141', password: 'workpass42', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
  const danId = dan.j.user.id;
  await req2('PATCH', '/api/workers/' + danId, { token: A41, body: { status: 'active' } });
  const directMailFor = async (frag) => (await mockEmails()).filter(e => String(e.subject || '').includes('Direct job offer') && String(e.subject || '').includes(frag));
  const waitDirectMail = async (frag) => { for (let i = 0; i < 20; i++) { const hits = await directMailFor(frag); if (hits.length) return hits; await sleep(200); } return directMailFor(frag); };
  const dj = await req2('POST', '/api/jobs', { token: A41, body: { service: 'Direct mail job', city: 'Fairfield', payOffer: 95, assignedWorkerId: danId, silent: true } });
  t('v41 mail: direct offer job created', dj.status === 201 && dj.j.job.status === 'Claimed');
  const dhits = await waitDirectMail('Direct mail job');
  t('v41 mail: exactly ONE direct-offer email, to the assignee only', dhits.length === 1 && JSON.stringify(dhits[0].to) === JSON.stringify(['direct@t.local']));
  const bj = await req2('POST', '/api/jobs', { token: A41, body: { service: 'Board no direct mail job', city: 'Fairfield', payOffer: 60 } });
  t('v41 mail: board job created', bj.status === 201);
  await sleep(700);
  t('v41 mail: a board post sends NO direct-offer email', (await directMailFor('Board no direct mail job')).length === 0);
  await fetch('http://127.0.0.1:8981/__fail', { method: 'POST', body: 'true' });
  const dj2 = await req2('POST', '/api/jobs', { token: A41, body: { service: 'Direct mail fail job', city: 'Fairfield', payOffer: 95, assignedWorkerId: danId, silent: true } });
  t('v41 mail: email provider down — the direct offer STILL succeeds (failure never blocks)', dj2.status === 201);
  await fetch('http://127.0.0.1:8981/__fail', { method: 'POST', body: 'false' });
}

// ---------------- v45: estimate builder — typed lines, materials, options, member page, expiry, duplicate, nuevo, reminder ----------------
{
  const adm45 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A45 = adm45.j.token;
  const estPage = async (id, qs) => { const r = await fetch(BASE2 + '/estimate/' + id + (qs || '')); return { status: r.status, html: await r.text() }; };
  const mkReq45 = async (email, svc) => { const cr = await req2('POST', '/api/requests', { body: { customerName: 'V45 Tester', customerEmail: email, customerPhone: '(707) 555-0145', service: svc || 'Water heater install', description: 'v45 flow', city: 'Fairfield', address: '7 V45 St', when: 'Tomorrow', estimateType: 'photo', photos: [] } }); return cr.j.request.id; };
  const patchEst45 = (id, estimate, extra) => req2('PATCH', '/api/requests/' + id, { token: A45, body: Object.assign({ estimate }, extra || {}) });
  const adminGet45 = async (id) => { const l = await req2('GET', '/api/requests', { token: A45 }); return (l.j.requests || []).find(x => x.id === id); };

  // (1) typed lines: labor + material + a legacy untyped line (defaults labor)
  const r1 = await mkReq45('v45-lines@t.local');
  const up1 = await patchEst45(r1, { items: [
    { description: 'Water Heater Install — labor only', qty: 1, unitPrice: 700, type: 'labor' },
    { description: 'Water heater unit (approved model)', qty: 1, unitPrice: 550, type: 'material' },
    { description: 'Legacy extra labor', qty: 2, unitPrice: 50 }
  ], asap: false, discountPct: 0, credit: 0, bookingDue: null, validUntil: '', photos: ['data:image/png;base64,iVBORw0KGgo=', 'https://evil.example/x.png'] });
  const e1 = up1.j.request.estimate;
  t('v45 lines: labor/material subtotals split; legacy line defaults to labor', up1.status === 200 && e1.laborSubtotal === 800 && e1.materialSubtotal === 550 && e1.subtotal === 1350 && e1.total === 1350 && e1.items[2].type === 'labor' && e1.items[0].lineTotal === 700);
  t('v45 lines: photos keep data URLs only (external URL dropped)', Array.isArray(e1.photos) && e1.photos.length === 1);
  t('v45 lines: sending stamps sentAt + a default valid-until 7 days out', !!e1.sentAt && /^\d{4}-\d{2}-\d{2}$/.test(e1.validUntil || '') && e1.remindedAt === null);
  const pg1 = await estPage(r1);
  t('v45 page: materials show their own subtotal + the copy switches to "Materials included"', pg1.html.includes('$550.00') && pg1.html.includes('data-i18n="materialsNote"') && !pg1.html.includes('data-i18n="laborNote"'));
  t('v45 page: labor subtotal + attached photo + valid-until render', pg1.html.includes('Labor subtotal') && pg1.html.includes('$800.00') && pg1.html.includes('data:image/png;base64,iVBORw0KGgo=') && pg1.html.includes('Valid until'));
  t('v45 page: one language at a time — EN|ES toggle present like the cart page', pg1.html.includes('data-lang-btn') && pg1.html.includes('ghsEstLang'));

  // (2) labor-only estimate keeps the classic labor-only line
  const r2 = await mkReq45('v45-laboronly@t.local', 'Faucet repair');
  await patchEst45(r2, { items: [{ description: 'Faucet swap — labor only', qty: 1, unitPrice: 125, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null });
  const pg2 = await estPage(r2);
  t('v45 page: a labor-only estimate keeps the "Labor only — you buy materials" line', pg2.html.includes('data-i18n="laborNote"') && !pg2.html.includes('data-i18n="materialsNote"') && !pg2.html.includes('data-i18n="materials"'));

  // (3) the sent email carries the same materials switch (mock Resend inbox)
  const r3 = await mkReq45('v45-mail@t.local');
  await patchEst45(r3, { items: [
    { description: 'Disposal swap — labor only', qty: 1, unitPrice: 125, type: 'labor' },
    { description: 'Disposal unit', qty: 1, unitPrice: 180, type: 'material' }
  ], asap: false, discountPct: 0, credit: 0, bookingDue: null }, { sendEmail: true });
  await sleep(400);
  const mail3 = (await mockEmails()).filter(e => JSON.stringify(e.to || '').includes('v45-mail@t.local') && (e.subject || '').includes('estimate'));
  t('v45 email: the estimate email shows materials + "Materials included" (no labor-only line)', mail3.length >= 1 && (mail3[0].text || '').includes('Materials included: $180') && (mail3[0].text || '').includes('Materials are included in this estimate.') && !(mail3[0].text || '').includes('you buy materials/parts'));

  // (4) member discount applies to LABOR only — materials stay full price
  const mem45 = await mkMember('v45-member@t.local', '(707) 555-0146');
  const sub45m = await req2('POST', '/api/stripe/homecare-subscribe', { token: mem45.token, body: {} });
  await mockActivate(sub45m.j.subscriptionId);
  await req2('POST', '/api/stripe/homecare-confirm', { token: mem45.token, body: {} });
  const r4 = await mkReq45('v45-member@t.local', 'Kitchen work');
  await patchEst45(r4, { items: [
    { description: 'Cabinet labor', qty: 1, unitPrice: 200, type: 'labor' },
    { description: 'Cabinet hardware', qty: 1, unitPrice: 50, type: 'material' }
  ], asap: false, discountPct: 0, credit: 0, bookingDue: null });
  const chk4 = await req2('POST', '/estimate/' + r4 + '/member-check', { body: { email: 'v45-member@t.local' } });
  t('v45 member: member-check finds the active HomeCare member by email', chk4.status === 200 && chk4.j.member === true);
  const g4pre = await adminGet45(r4);
  t('v62 member: sending an estimate to a known member auto-applies the discount — 20% of LABOR only ($40 of $200; the $50 material is untouched) → total $210, booking = the deposit law ($50 flat tier)', g4pre.estimate.discountAmount === 40 && g4pre.estimate.total === 210 && g4pre.estimate.bookingDue === 50 && g4pre.estimate.balanceDue === 160 && g4pre.estimate.memberDiscount === true);
  const app4 = await req2('POST', '/estimate/' + r4 + '/member-apply', { body: { email: 'v45-member@t.local' } });
  const g4 = await adminGet45(r4);
  t('v45 member: member-apply confirms the member total (idempotent — never discounts twice)', app4.status === 200 && app4.j.member === true && app4.j.total === 210 && g4.estimate.discountAmount === 40 && g4.estimate.total === 210);
  const pg4 = await estPage(r4);
  t('v45 member: a member sees member pricing applied and NO join block', pg4.html.includes('HomeCare member price applied') && !pg4.html.includes('id="joinBox"'));

  // (5) join on the estimate page reprices the estimate
  const r5 = await mkReq45('v45-join@t.local', 'Door work');
  await patchEst45(r5, { items: [{ description: 'Door slab swap — labor only', qty: 1, unitPrice: 500, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null });
  const pg5 = await estPage(r5);
  t('v45 join: a non-member sees BOTH totals and the join block', pg5.html.includes('id="joinBox"') && pg5.html.includes('HomeCare member price') && pg5.html.includes('$500.00') && pg5.html.includes('$400.00'));
  const joiner = await req2('POST', '/api/signup', { body: { name: 'V45 Joiner', email: 'v45-join@t.local', password: 'joinpass45' } });
  // v54: the page's join rides hosted Checkout — join-checkout builds the
  // subscription session; nothing applies until Stripe proves the
  // subscription paid and the ?joined=1 return verifies + reprices.
  const jc5 = await req2('POST', '/estimate/' + r5 + '/join-checkout', { token: joiner.j.token, body: {} });
  const jSess5 = sessionForEstimate(r5, 'subscription');
  const jSub5 = jSess5 && stripeState.subs[jSess5.subscription];
  t('v54 est join: join-checkout opens a hosted subscription session at the HomeCare price', jc5.status === 200 && jc5.j.next === 'join' && !!jc5.j.url && !!jSess5 && !!jSub5 && jSub5.items.data[0].price.id === 'price_hc_mock');
  const preRet5 = await fetch(BASE2 + '/estimate/' + r5 + '?joined=1&session_id=' + jSess5.id, { headers: { Authorization: 'Bearer ' + joiner.j.token } });
  const g5pre = await adminGet45(r5);
  t('v54 est join: an UNPAID join session leaves the estimate at the regular total (flag never trusted)', preRet5.status === 200 && g5pre.estimate.total === 500 && !g5pre.estimate.memberDiscount);
  await mockSessionPaid(jSess5.id);
  const ret5 = await fetch(BASE2 + '/estimate/' + r5 + '?joined=1&session_id=' + jSess5.id, { headers: { Authorization: 'Bearer ' + joiner.j.token } });
  const ret5Html = await ret5.text();
  const g5 = await adminGet45(r5);
  t('v54 est join: the Stripe-verified return activates + reprices to the member total and links the customer', ret5.status === 200 && ret5Html.includes('data-i18n="joinedNote"') && g5.estimate.total === 400 && g5.estimate.discountPct === 20 && g5.estimate.memberDiscount === true && g5.customerId === joiner.j.user.id);
  const app5 = await req2('POST', '/estimate/' + r5 + '/member-apply', { token: joiner.j.token, body: {} });
  t('v45 join: member-apply after the Checkout join is idempotent (never discounts twice)', app5.status === 200 && app5.j.total === 400 && g5.estimate.discountAmount === 100);

  // (6) expiry: an expired estimate shows as expired and cannot be approved
  const r6 = await mkReq45('v45-expired@t.local', 'Old job');
  await patchEst45(r6, { items: [{ description: 'Old labor', qty: 1, unitPrice: 100, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null, validUntil: '2000-01-01' });
  const pg6 = await estPage(r6);
  t('v45 expiry: the page shows the estimate as expired', pg6.html.includes('This estimate has expired'));
  const ap6 = await fetch(BASE2 + '/estimate/' + r6 + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const ap6j = await ap6.json().catch(() => ({}));
  t('v45 expiry: approving an expired estimate is refused (400)', ap6.status === 400 && /expired/.test(ap6j.error || ''));

  // (7) duplicate estimate
  const dup7 = await req2('POST', '/api/requests/' + r1 + '/duplicate-estimate', { token: A45, body: {} });
  const g7 = dup7.j && dup7.j.request ? await adminGet45(dup7.j.request.id) : null;
  t('v45 duplicate: clones the estimate into a fresh New draft (sentAt cleared, same lines)', dup7.status === 201 && !!g7 && g7.id !== r1 && g7.status === 'New' && g7.estimate.items.length === 3 && g7.estimate.sentAt === null && g7.estimate.total === 1350);
  const dup7c = await req2('POST', '/api/requests/' + r1 + '/duplicate-estimate', { token: mem45.token, body: {} });
  t('v45 duplicate: customers cannot duplicate (403)', dup7c.status === 403);

  // (8) nuevo estimado entry + preview
  const ne8 = await req2('POST', '/api/admin/estimates/new', { token: A45, body: { customerName: 'Walk In Wendy', customerEmail: 'v45-walkin@t.local', customerPhone: '(707) 555-0111', service: 'Fence repair', city: 'Vallejo' } });
  t('v45 nuevo: admin creates a request with no prior ask, ready for the builder', ne8.status === 201 && ne8.j.request.status === 'New' && ne8.j.request.estimate === null && ne8.j.request.customerEmail === 'v45-walkin@t.local');
  const ne8c = await req2('POST', '/api/admin/estimates/new', { token: mem45.token, body: { customerName: 'X', customerEmail: 'x@t.local' } });
  t('v45 nuevo: customers cannot create estimates (403)', ne8c.status === 403);
  const ne8b = await req2('POST', '/api/admin/estimates/new', { token: A45, body: {} });
  t('v45 nuevo: name or email is required (400)', ne8b.status === 400);
  const pv8 = await req2('POST', '/api/admin/estimates/preview', { token: A45, body: { requestId: r2, estimate: { items: [{ description: 'Preview labor', qty: 1, unitPrice: 300, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null } } });
  t('v45 preview: renders the exact public estimate page for unsaved lines', pv8.status === 200 && (pv8.j.html || '').includes('Preview labor') && (pv8.j.html || '').includes('data-lang-btn'));

  // (9) two options: the customer picks; totals follow the choice
  const r9 = await mkReq45('v45-options@t.local', 'Bathroom work');
  const up9 = await patchEst45(r9, { items: [{ description: 'Bath labor', qty: 1, unitPrice: 300, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null, options: [
    { label: 'Básico', items: [{ description: 'Bath labor', qty: 1, unitPrice: 300, type: 'labor' }] },
    { label: 'Completo', items: [{ description: 'Bath labor', qty: 1, unitPrice: 300, type: 'labor' }, { description: 'Tile + fixtures', qty: 1, unitPrice: 120, type: 'material' }] }
  ] });
  t('v45 options: the estimate stores both bundles with per-option totals (member math inside)', up9.status === 200 && up9.j.request.estimate.options.length === 2 && up9.j.request.estimate.options[0].listTotal === 300 && up9.j.request.estimate.options[1].listTotal === 420 && up9.j.request.estimate.options[1].memberTotal === 360);
  const pg9 = await estPage(r9);
  t('v45 options: the page shows both options with list + member totals', pg9.html.includes('Básico') && pg9.html.includes('Completo') && pg9.html.includes('$420.00') && pg9.html.includes('$360.00'));
  const pick9 = await req2('POST', '/estimate/' + r9 + '/option', { body: { index: 1 } });
  const g9 = await adminGet45(r9);
  t('v45 options: picking Completo switches the payable total to $420', pick9.status === 200 && pick9.j.total === 420 && g9.estimate.selectedOption === 1 && g9.estimate.items.length === 2 && g9.estimate.total === 420);
  const pick9b = await req2('POST', '/estimate/' + r9 + '/option', { body: { index: 9 } });
  t('v45 options: an out-of-range pick is refused (400)', pick9b.status === 400);
  const ap9 = await fetch(BASE2 + '/estimate/' + r9 + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const g9b = await adminGet45(r9);
  t('v45 options: the chosen option approves at its total (invoice follows)', ap9.status === 200 && g9b.status === 'Approved' && g9b.estimate.total === 420);

  // (10) 48-hour reminder: respawn app2 with a fast throttle, seed backdated
  // estimates in the data file, and drive the sweep via admin activity.
  const mkSeed = async (email) => { const id = await mkReq45(email, 'Reminder job'); await patchEst45(id, { items: [{ description: 'Reminder labor', qty: 1, unitPrice: 100, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null, validUntil: '2999-01-01' }); return id; };
  const sDue = await mkSeed('v45-rem-due@t.local');
  const sFresh = await mkSeed('v45-rem-fresh@t.local');
  const sExp = await mkSeed('v45-rem-exp@t.local');
  const sAppr = await mkSeed('v45-rem-appr@t.local');
  const sNoMail = await mkSeed('v45-rem-nomail@t.local'); // email blanked in the seed edit below
  try { child2.kill('SIGTERM'); } catch (e) {}
  await sleep(500);
  const seedR = JSON.parse(fs.readFileSync(DATA_FILE2, 'utf8'));
  const ago = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const yday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  for (const rr of seedR.requests) {
    if (rr.id === sDue || rr.id === sExp || rr.id === sAppr || rr.id === sNoMail) { rr.estimate.sentAt = ago(49); rr.estimateEmailSentAt = ago(49); }
    if (rr.id === sFresh) { rr.estimate.sentAt = ago(47); rr.estimateEmailSentAt = ago(47); }
    if (rr.id === sExp) rr.estimate.validUntil = yday;
    if (rr.id === sAppr) rr.status = 'Approved';
    if (rr.id === sNoMail) rr.customerEmail = '';
  }
  fs.writeFileSync(DATA_FILE2, JSON.stringify(seedR));
  const { spawn: spawn45 } = await import('node:child_process');
  child2 = spawn45('node', ['server.js'], { cwd: APP_DIR, env: Object.assign({}, process.env, { PORT: '8979', DATA_FILE: DATA_FILE2, NOMINATIM_BASE: 'http://127.0.0.1:' + GEO_PORT, SSE_HEARTBEAT_MS: '300', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_API_BASE: 'http://127.0.0.1:8980/v1', STRIPE_PRICE_HOMECARE: 'price_hc_mock', STRIPE_WEBHOOK_SECRET: 'whsec_mock_test', RESEND_API_KEY: 're_mock', RESEND_API_BASE: 'http://127.0.0.1:8981', EST_REMIND_THROTTLE_MS: '400' }), stdio: ['ignore', 'pipe', 'pipe'] });
  child2.stderr.on('data', d => process.stderr.write('[app2] ' + d));
  await waitHealth2();
  const adm45b = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A45B = adm45b.j.token;
  const remFor = async (id) => (await mockEmails()).filter(e => (e.subject || '') === 'Reminder: your estimate (' + id + ') is still waiting — General Handyman Solutions');
  await req2('GET', '/api/requests', { token: A45B }); // admin activity triggers the sweep
  let dueMail = [];
  for (let i = 0; i < 25 && !dueMail.length; i++) { dueMail = await remFor(sDue); if (!dueMail.length) await sleep(200); }
  t('v45 reminder: the 49h-old unanswered estimate gets exactly ONE reminder, to the customer, with the link', dueMail.length === 1 && JSON.stringify(dueMail[0].to) === JSON.stringify(['v45-rem-due@t.local']) && (dueMail[0].text || '').includes('/estimate/' + sDue));
  await sleep(300);
  t('v45 reminder: 47h is too fresh, expired is skipped, approved is skipped, no-email is skipped', (await remFor(sFresh)).length === 0 && (await remFor(sExp)).length === 0 && (await remFor(sAppr)).length === 0 && (await remFor(sNoMail)).length === 0);
  const afterR = JSON.parse(fs.readFileSync(DATA_FILE2, 'utf8'));
  const dueRec = afterR.requests.find(x => x.id === sDue);
  t('v45 reminder: remindedAt is stamped on the estimate', !!dueRec && !!dueRec.estimate.remindedAt);
  await req2('GET', '/api/requests', { token: A45B });
  await sleep(900);
  t('v45 reminder: a second sweep sends NOTHING again (never twice)', (await remFor(sDue)).length === 1);
  const aud45 = await req2('GET', '/api/admin/audit', { token: A45B });
  t('v45 reminder: the send is in the audit log', (aud45.j.entries || []).some(en => en.action === 'estimate.reminder' && en.target === sDue));
}


// ---------------- v58: estimate ASAP rides on the member-DISCOUNTED labor ----------------
// Gabriel's decided rule (the menu already conforms): a member's ASAP +25%
// is computed on the labor AFTER the 20% member discount — $200 labor + $50
// materials, member ASAP: ASAP = 25% of $160 = $40, total $250 (was $260).
{
  const adm58 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A58 = adm58.j.token;
  const estPage58 = async (id) => { const r = await fetch(BASE2 + '/estimate/' + id); return { status: r.status, html: await r.text() }; };
  const mkReq58 = async (email, svc) => { const cr = await req2('POST', '/api/requests', { body: { customerName: 'V58 Tester', customerEmail: email, customerPhone: '(707) 555-0158', service: svc || 'ASAP job', description: 'v58 flow', city: 'Fairfield', address: '8 V58 St', when: 'Today', estimateType: 'photo', photos: [] } }); return cr.j.request.id; };
  const patch58 = (id, estimate, extra) => req2('PATCH', '/api/requests/' + id, { token: A58, body: Object.assign({ estimate }, extra || {}) });
  const adminGet58 = async (id) => { const l = await req2('GET', '/api/requests', { token: A58 }); return (l.j.requests || []).find(x => x.id === id); };
  const mixed58 = [
    { description: 'Install labor', qty: 1, unitPrice: 200, type: 'labor' },
    { description: 'Parts', qty: 1, unitPrice: 50, type: 'material' }
  ];
  const mem58 = await mkMember('v58-member@t.local', '(707) 555-0159');
  const sub58 = await req2('POST', '/api/stripe/homecare-subscribe', { token: mem58.token, body: {} });
  await mockActivate(sub58.j.subscriptionId);
  await req2('POST', '/api/stripe/homecare-confirm', { token: mem58.token, body: {} });

  // (1) member estimate (discount auto-applies at save), ASAP, mixed lines
  const rM = await mkReq58('v58-member@t.local', 'Member ASAP job');
  const upM = await patch58(rM, { items: mixed58, asap: true, discountPct: 0, credit: 0, bookingDue: null });
  const eM = upM.j.request.estimate;
  t('v58 member ASAP: the member estimate carries ASAP on the DISCOUNTED labor ($40, not $50)', upM.status === 200 && eM.memberDiscount === true && eM.discountAmount === 40 && eM.asapAmount === 40);
  t('v62→v79 member ASAP: total == discounted labor x1.25 + materials ($250); booking = deposit law ($50 flat), balance $200', eM.total === 250 && eM.bookingDue === 50 && eM.balanceDue === 200);
  const pgM = await estPage58(rM);
  t('v58 member ASAP: the public page renders the conformed ASAP line ($40.00)', pgM.html.includes('ASAP / Emergency (+25%)</span>: <b>$40.00</b>'));

  // (2) guest estimate, same lines + ASAP: full-labor ASAP, unchanged; the
  // join block quotes the member variant — now the conformed $250/$50 save.
  const rG = await mkReq58('v58-guest@t.local', 'Guest ASAP job');
  const upG = await patch58(rG, { items: mixed58, asap: true, discountPct: 0, credit: 0, bookingDue: null });
  const eG = upG.j.request.estimate;
  t('v58 guest ASAP: unchanged — 25% of FULL labor ($50), total $300', upG.status === 200 && eG.asapAmount === 50 && eG.discountAmount === 0 && eG.total === 300);
  const pgG = await estPage58(rG);
  t('v58 guest page: join-and-save quotes the CONFORMED member total ($300 -> $250, save $50)', pgG.html.includes('drops from $300.00 to $250.00') && pgG.html.includes('you save $50.00'));

  // (3) member-apply on a manually-discounted member estimate reprices ASAP
  const rA = await mkReq58('v58-member@t.local', 'Member manual-discount ASAP job');
  const upA = await patch58(rA, { items: mixed58, asap: true, discountPct: 5, credit: 0, bookingDue: null });
  const eA0 = upA.j.request.estimate;
  t('v58 member-apply setup: a manual 5% discount blocks auto-apply (guest ASAP $50, total $290)', upA.status === 200 && eA0.memberDiscount !== true && eA0.asapAmount === 50 && eA0.total === 290);
  const appA = await req2('POST', '/estimate/' + rA + '/member-apply', { body: { email: 'v58-member@t.local' } });
  const gA = await adminGet58(rA);
  t('v58 member-apply: applying member pricing conforms the ASAP too ($40) — total $250', appA.status === 200 && appA.j.total === 250 && gA.estimate.asapAmount === 40 && gA.estimate.total === 250);

  // (4) two options with ASAP: EACH variant rides on its own labor base
  const rO = await mkReq58('v58-guest@t.local', 'Options ASAP job');
  const upO = await patch58(rO, { items: [{ description: 'Base labor', qty: 1, unitPrice: 200, type: 'labor' }], asap: true, discountPct: 0, credit: 0, bookingDue: null, options: [
    { label: 'Básico', items: [{ description: 'Base labor', qty: 1, unitPrice: 200, type: 'labor' }] },
    { label: 'Completo', items: mixed58 }
  ] });
  const oO = upO.j.request.estimate.options;
  t('v58 options: list totals keep full-labor ASAP (Basico $250 / Completo $300)', upO.status === 200 && oO[0].listTotal === 250 && oO[1].listTotal === 300 && oO[1].asapAmount === 50);
  t('v58 options: member totals ride on discounted labor (Basico $200 / Completo $250)', oO[0].memberTotal === 200 && oO[1].memberTotal === 250 && oO[1].asapAmountMember === 40);
  const pgO = await estPage58(rO);
  t('v58 options: the page cards show the conformed member totals', pgO.html.includes('HomeCare member: <b>$200.00</b>') && pgO.html.includes('HomeCare member: <b>$250.00</b>'));

  // (5) approving the member ASAP estimate invoices the conformed ASAP line
  const apM = await fetch(BASE2 + '/estimate/' + rM + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const apMj = await apM.json().catch(() => ({}));
  const dataM = JSON.parse(fs.readFileSync(DATA_FILE2, 'utf8'));
  const invM = (dataM.invoices || []).find(x => x.id === (apMj.invoiceId || ''));
  const asapLine = invM && (invM.items || []).find(it => (it.description || '').includes('ASAP'));
  t('v58 invoice: approval creates the invoice from the member ASAP estimate', apM.status === 200 && !!invM);
  t('v62→v79 invoice: approval invoices the DEPOSIT first (invoiceFromEstimate deposit mode) — total $50, deposit line, balance $200 noted for completion', !!invM && invM.total === 50 && (invM.items || []).some(it => /Deposit to book/.test(it.description || '') && it.unitPrice === 50) && /Balance at completion: \$200/.test(invM.notes || ''));

  // (6) statics: builder preview + server variant plumbing
  t('static v58: builder bundle math takes the member flag and the seeded flag is plumbed', htmlSrc.includes('function estBundleMath(items, asap, discountPct, credit, memberDiscount)') && htmlSrc.includes('estMemberDisc-'));
  t('static v58: the server computes both ASAP variants and picks by member pricing', serverSrc.includes('asapAmountMember') && serverSrc.includes('flags.memberDiscount ? asapAmountMember : asapAmountList'));
}


// ---------------- v59: technician sign-in pill + cart materials note ----------------
// (1) The technician door on the auth screen used to be ONLY the small
// muted #workerLinkRow text link at the bottom of the card — Gabriel
// could not see the worker login. v59 added a dedicated high-contrast
// pill under the Log in button, routed to the same existing #worker
// entry view. v72 (L-4, approved cleanup) then REMOVED the redundant
// small link row: the pill is now THE technician door on the card
// (customer-first — one clear door, not two).
// (2) The cart page printed "Labor only — you buy materials/parts" on
// EVERY cart, even carts carrying Materials lines. It now switches to
// the inclusion note when a materials line is present — the same
// switch the estimate page already made via estimateHasMaterials
// (the v45 page pins below already cover the estimate side).
t('static v77 (was v59): the technician door on the customer auth card is a small discreet link (routes to the existing #worker entry)', htmlSrc.includes('id="techLinkRow"') && htmlSrc.includes('Are you a technician? Sign in') && htmlSrc.includes("location.hash='#worker';applyWorkerEntry();return false;"));
t('static v77: applyWorkerEntry hides the discreet technician link inside the worker entry itself', htmlSrc.includes("getElementById('techLinkRow')") && htmlSrc.includes("tlr.style.display = w ? 'none' : 'block'"));
t('static v77 (was v59/v72): the giant technician pill is GONE from the customer card — the quiet link is the only technician door there', !htmlSrc.includes('id="techSignInBtn"') && !htmlSrc.includes('id="workerLinkRow"') && htmlSrc.includes('id="techLinkRow"'));
t('static v77: plain signup carries the OPTIONAL membership picker (free account is the default option)', htmlSrc.includes('id="aOptPlan"') && htmlSrc.includes('Just my free account — no membership') && htmlSrc.includes('function plainSignupTab()') && htmlSrc.includes('function optPlanChanged()'));
t('static v77: premium design system tokens + auth components are in the stylesheet', htmlSrc.includes('--sh-card:') && htmlSrc.includes('--red-hi:#ff4655') && htmlSrc.includes('.auth-hero') && htmlSrc.includes('.auth-offer') && htmlSrc.includes('#authBox .tabs'));
t('static v59: cart dictionary carries the materials-included note in EN + ES', serverSrc.includes("materialsNote: 'Materials listed above are included in your total.'") && serverSrc.includes("materialsNote: 'Los materiales listados arriba están incluidos en tu total.'"));
t('static v59: cart page switches its note on cartHasMaterials; estimate page keeps its estimateHasMaterials switch', serverSrc.includes('const cartHasMaterials = (c.items || []).some(it => it.custom && it.kind !==') && serverSrc.includes('cartHasMaterials ? ') && serverSrc.includes('estimateHasMaterials(disp) ? '));
{
  const adm59 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A59 = adm59.j.token;
  // Cart WITH a materials line: inclusion note, and the rendered note
  // element is the materials one (the raw labor text still exists in
  // the page's embedded I18N JSON, so the pin is on data-i18n).
  const cartMat = await req2('POST', '/api/admin/carts', { token: A59, body: { items: [
    { serviceId: 'faucet-replacement', name: 'Faucet Swap', qty: 1, unitPrice: 125 },
    { custom: true, kind: 'other', name: 'Materials — new faucet', price: 80, qty: 1 }
  ] } });
  const pgMat = await (await fetch(BASE2 + '/cart/' + cartMat.j.cart.id)).text();
  t('v59 cart: a cart WITH materials lines shows the inclusion note, NOT the labor-only note', cartMat.status === 201 && pgMat.includes('data-i18n="materialsNote"') && pgMat.includes('Materials listed above are included in your total.') && !pgMat.includes('data-i18n="laborNote"'));
  // The same cart shape in Spanish renders the ES inclusion note.
  const cartMatEs = await req2('POST', '/api/admin/carts', { token: A59, body: { lang: 'es', items: [
    { custom: true, kind: 'other', name: 'Materiales — grifo nuevo', price: 80, qty: 1 }
  ] } });
  const pgMatEs = await (await fetch(BASE2 + '/cart/' + cartMatEs.j.cart.id)).text();
  t('v59 cart: an ES cart with materials shows the Spanish inclusion note', cartMatEs.status === 201 && pgMatEs.includes('data-i18n="materialsNote"') && pgMatEs.includes('Los materiales listados arriba están incluidos en tu total.'));
  // Cart WITHOUT materials (catalog + custom labor only): the original
  // labor-only note renders, unchanged.
  const cartLab = await req2('POST', '/api/admin/carts', { token: A59, body: { items: [
    { serviceId: 'faucet-replacement', name: 'Faucet Swap', qty: 1, unitPrice: 125 },
    { custom: true, kind: 'labor', name: 'Labor', price: 75, qty: 1 }
  ] } });
  const pgLab = await (await fetch(BASE2 + '/cart/' + cartLab.j.cart.id)).text();
  t('v59 cart: a cart WITHOUT materials keeps the labor-only note exactly', cartLab.status === 201 && pgLab.includes('data-i18n="laborNote"') && pgLab.includes('Labor only — you buy materials/parts unless the Team says otherwise in writing.') && !pgLab.includes('data-i18n="materialsNote"'));
}

// ---------------- v60: membership invites — first month FREE (Gabriel 2026-10-24) ----------------
// Gabriel adds members by PERSONAL INVITATION from his admin: a
// single-use /join/INV-… link whose holder joins HomeCare with the
// FIRST MONTH FREE (30-day Stripe trial on the normal $29 plan), then
// $29/mo. Activation rides the verified rails: the ?joined=1 return
// verifies the session with Stripe (trial-aware: a trialing
// subscription passes the shared paid rule; payment_status is
// 'no_payment_required' on a free-trial session, so the invite
// verifier keys on session completeness + the subscription rule), and
// the checkout.session.completed webhook activates + marks the invite.
t('static v60: invite rails exist — store, admin endpoints, join page + checkout, trial-aware verification', serverSrc.includes('function invitesOf(') && serverSrc.includes("p === '/api/admin/invites'") && serverSrc.includes('function invitePageHtml(') && serverSrc.includes('function inviteSessionVerified(') && serverSrc.includes('joinCheckoutMatch') && serverSrc.includes('joinPageMatch'));
t('static v60: the invite checkout carries the trial — trial_period_days rides subscription_data and the success returns to the invite link', serverSrc.includes("params['subscription_data[trial_period_days]']") && serverSrc.includes("successUrl: inviteLink(inv) + '?joined=1&session_id={CHECKOUT_SESSION_ID}'") && serverSrc.includes('trialDays: INVITE_TRIAL_DAYS'));
t('static v60: webhook marks invites accepted inside the homecare branch', serverSrc.includes('obj.metadata.inviteId') && serverSrc.includes('markInviteAccepted(inv, u, obj)'));
t('static v74: the free month is HomeCare-$29 ONLY (Gabriel) — the trial has exactly TWO write sites in the server (the shared Checkout site + the inline subscription create), BOTH gated on the one-per-account eligibility helper, so Yard/Plus never trial and no path can grant a second free month', (serverSrc.match(/trial_period_days/g) || []).length === 2 && serverSrc.includes('function homeCareTrialEligible(') && serverSrc.includes('u.inviteFreeMonthUsed = true') && serverSrc.includes("session.metadata.freeMonth === '1'"));
t('static v60: admin carries the Invite a member card + list wiring', htmlSrc.includes('id="invName"') && htmlSrc.includes('Invite a member — first month FREE') && htmlSrc.includes('async function loadAdminInvites()') && htmlSrc.includes('loadAdminInvites();'));
{
  const adm60 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A60 = adm60.j.token;
  const cust60 = await mkMember('notadmin60@t.local', '(707) 555-0160');
  const inv1 = await req2('POST', '/api/admin/invites', { token: A60, body: { name: 'Vic Torres', email: 'vic60@t.local', phone: '7075550161' } });
  t('v60 invite: admin creates an invite (pending, personal link)', inv1.status === 201 && /^INV-/.test(inv1.j.invite.id) && inv1.j.invite.status === 'pending' && inv1.j.invite.link.includes('/join/' + inv1.j.invite.id));
  const invNoName = await req2('POST', '/api/admin/invites', { token: A60, body: { email: 'x@t.local' } });
  const invByCust = await req2('POST', '/api/admin/invites', { token: cust60.token, body: { name: 'Nope' } });
  const invAnon = await req2('GET', '/api/admin/invites', {});
  t('v60 invite: create guards — name required (400), customers forbidden (403), anonymous forbidden (403)', invNoName.status === 400 && invByCust.status === 403 && invAnon.status === 403);
  const invId = inv1.j.invite.id;
  const pgInv = await (await fetch(BASE2 + '/join/' + invId)).text();
  t('v60 invite page: the offer renders (free first month, then $29, claim button, invitee greeting)', pgInv.includes('first month of HomeCare is FREE') && pgInv.includes('then $29/month') && pgInv.includes('Claim my free month') && pgInv.includes('Hi Vic'));
  const pg404 = await fetch(BASE2 + '/join/INV-NOPE');
  t('v60 invite page: unknown code 404s', pg404.status === 404);
  const coAnon = await req2('POST', '/join/' + invId + '/checkout', { body: {} });
  t('v60 invite checkout: login required (401)', coAnon.status === 401);
  const vic = await mkMember('vic60@t.local', '(707) 555-0161');
  const coVic = await req2('POST', '/join/' + invId + '/checkout', { token: vic.token, body: {} });
  const sessInv = Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.inviteId === invId && s.mode === 'subscription').slice(-1)[0];
  t('v60 invite checkout: a hosted SUBSCRIPTION session opens for the invited account', coVic.status === 200 && coVic.j.next === 'join' && !!coVic.j.url && !!sessInv && !!sessInv.subscription);
  const preRetI = await (await fetch(BASE2 + '/join/' + invId + '?joined=1&session_id=' + sessInv.id, { headers: { Authorization: 'Bearer ' + vic.token } })).text();
  const mePre = await req2('GET', '/api/me', { token: vic.token });
  const listPre = await req2('GET', '/api/admin/invites', { token: A60 });
  const invPre = (listPre.j.invites || []).find(x => x.id === invId);
  t('v60 invite: the ?joined=1 flag WITHOUT Stripe proof activates nothing (not a member, invite still pending)', preRetI.includes('Claim my free month') && mePre.j.user.homeCareStatus !== 'active' && !!invPre && invPre.status === 'pending');
  await mockSessionPaid(sessInv.id);
  const retI = await (await fetch(BASE2 + '/join/' + invId + '?joined=1&session_id=' + sessInv.id, { headers: { Authorization: 'Bearer ' + vic.token } })).text();
  const mePost = await req2('GET', '/api/me', { token: vic.token });
  const listPost = await req2('GET', '/api/admin/invites', { token: A60 });
  const invPost = (listPost.j.invites || []).find(x => x.id === invId);
  t('v60 invite: the Stripe-verified return activates HomeCare + marks the invite accepted', retI.includes('data-i18n="joinedH"') && mePost.j.user.homeCareStatus === 'active' && !!invPost && invPost.status === 'accepted');
  const coAgain = await req2('POST', '/join/' + invId + '/checkout', { token: vic.token, body: {} });
  t('v60 invite: an accepted invite cannot be claimed twice (member short-circuit or 400)', (coAgain.status === 200 && coAgain.j.member === true) || coAgain.status === 400);
  const inv2 = await req2('POST', '/api/admin/invites', { token: A60, body: { name: 'Locked Lisa', email: 'lisa60@t.local' } });
  const other = await mkMember('other60@t.local', '(707) 555-0162');
  const coLock = await req2('POST', '/join/' + inv2.j.invite.id + '/checkout', { token: other.token, body: {} });
  t('v60 invite: an email-locked invite rejects a different account (400)', coLock.status === 400);
  const inv3 = await req2('POST', '/api/admin/invites', { token: A60, body: { name: 'Webhook Wanda', email: 'wanda60@t.local' } });
  const wanda = await mkMember('wanda60@t.local', '(707) 555-0163');
  const coW = await req2('POST', '/join/' + inv3.j.invite.id + '/checkout', { token: wanda.token, body: {} });
  const sessW = Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.inviteId === inv3.j.invite.id && s.mode === 'subscription').slice(-1)[0];
  await mockSessionPaid(sessW.id);
  const whRes = await wh2('checkout.session.completed', { id: sessW.id, mode: 'subscription', payment_status: 'no_payment_required', subscription: sessW.subscription, customer: 'cus_mock', metadata: { kind: 'homecare', userId: wanda.id, inviteId: inv3.j.invite.id } });
  const meW = await req2('GET', '/api/me', { token: wanda.token });
  const listW = await req2('GET', '/api/admin/invites', { token: A60 });
  const invW = (listW.j.invites || []).find(x => x.id === inv3.j.invite.id);
  t('v60 invite webhook: checkout.session.completed activates the member + accepts the invite (trial sessions carry no_payment_required)', whRes.status === 200 && meW.j.user.homeCareStatus === 'active' && !!invW && invW.status === 'accepted');
  const inv4 = await req2('POST', '/api/admin/invites', { token: A60, body: { name: 'Revoke Rex' } });
  const rv = await req2('POST', '/api/admin/invites/' + inv4.j.invite.id + '/revoke', { token: A60, body: {} });
  const pgRev = await (await fetch(BASE2 + '/join/' + inv4.j.invite.id)).text();
  const rex = await mkMember('rex60@t.local', '(707) 555-0164');
  const coRev = await req2('POST', '/join/' + inv4.j.invite.id + '/checkout', { token: rex.token, body: {} });
  t('v60 invite: revoke kills the link (page says unavailable, checkout 400)', rv.status === 200 && rv.j.invite.status === 'revoked' && pgRev.includes('data-i18n="goneH"') && coRev.status === 400);
  // Gabriel's rule: the free month is ONCE per account. Wanda claimed
  // hers (webhook path above); after her membership is cancelled, even
  // a FRESH invitation cannot give her account a second free month.
  const whDel = await wh2('customer.subscription.deleted', { id: sessW.subscription, status: 'canceled', metadata: { userId: wanda.id, kind: 'homecare', plan: 'homecare' } });
  const meDel = await req2('GET', '/api/me', { token: wanda.token });
  const inv5 = await req2('POST', '/api/admin/invites', { token: A60, body: { name: 'Webhook Wanda', email: 'wanda60@t.local' } });
  const coSecond = await req2('POST', '/join/' + inv5.j.invite.id + '/checkout', { token: wanda.token, body: {} });
  t('v60 invite: the free month is ONCE per account — a cancelled ex-invitee cannot claim a second one (400)', whDel.status === 200 && meDel.j.user.homeCareStatus !== 'active' && coSecond.status === 400 && /one per account/.test(coSecond.j.error || ''));
}
// ---------- v61: the free month lives INSIDE the customer's own cart link (Gabriel) ----------
t('static v61: the cart page renders the free-month offer from the cart flag (banner + badge + FREE_MONTH switch)', serverSrc.includes('const freeMonth = !!') && serverSrc.includes('FREE_MONTH=') && serverSrc.includes('joinOrderNoteFree') && serverSrc.includes('freeMonthTag'));
t('static v61/v74: the cart join honors the free month — HomeCare ONLY, once per account via the eligibility helper (the invite no longer gates the trial, it just rides the session metadata)', serverSrc.includes("joinPlan.key === 'homecare' && c.freeMonthInviteId && !user.inviteFreeMonthUsed") && serverSrc.includes("src: fmInvite ? 'cart-invite' : 'cart'") && serverSrc.includes('trialDays: hcTrial ? INVITE_TRIAL_DAYS : 0') && serverSrc.includes("joinPlan.key === 'homecare' && homeCareTrialEligible(user)"));
t('static v61: admin attach endpoint + SPA controls exist', serverSrc.includes('invAttachMatch') && htmlSrc.includes('id="invCartId"') && htmlSrc.includes('async function attachInvite('));
{
  const adm61 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A61 = adm61.j.token;
  const cartF = await req2('POST', '/api/admin/carts', { token: A61, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }], customerName: 'In Cart Fran' } });
  const invF = await req2('POST', '/api/admin/invites', { token: A61, body: { name: 'In Cart Fran', cartId: cartF.j.cart.id } });
  t('v61: admin can create an invite already attached to a cart', invF.status === 201 && invF.j.invite.cartId === cartF.j.cart.id);
  const pgF = await (await fetch(BASE2 + '/cart/' + cartF.j.cart.id)).text();
  t('v61: HIS OWN cart page shows the free month — banner + FIRST MONTH FREE badge on the HomeCare row', pgF.includes('Personal invitation: your first month of HomeCare is FREE') && pgF.includes('FIRST MONTH FREE') && pgF.includes('FREE_MONTH=true'));
  const fran = await mkMember('fran61@t.local', '(707) 555-0171');
  const detF = { name: 'In Cart Fran', phone: '7075550171', email: 'fran61@t.local', address: '9 Fran St', city: 'Fairfield', when: 'Today' };
  const coF = await req2('POST', '/api/carts/' + cartF.j.cart.id + '/checkout', { token: fran.token, body: Object.assign({}, detF, { join: true }) });
  const sessF = sessionForCart(cartF.j.cart.id, 'subscription');
  t('v70 v61: the invited cart join is ONE session carrying the invitation — and the ONLY charge today is the $50 deposit (the free month makes the plan $0, never a $0 total)', coF.status === 200 && coF.j.next === 'pay' && coF.j.amount === 50 && coF.j.deposit === 50 && coF.j.planFirst === 0 && coF.j.total === 100 && !!sessF && !!sessF.metadata && sessF.metadata.kind === 'cart-join' && sessF.metadata.inviteId === invF.j.invite.id && sessF.metadata.src === 'cart-invite');
  await mockSessionPaid(sessF.id);
  const retF = await fetch(BASE2 + '/cart/' + cartF.j.cart.id + '?paid=1&session_id=' + sessF.id, { headers: { Authorization: 'Bearer ' + fran.token } });
  const invListF = await req2('GET', '/api/admin/invites', { token: A61 });
  const invFNow = (invListF.j.invites || []).find(x => x.id === invF.j.invite.id);
  const meF = await req2('GET', '/api/me', { token: fran.token });
  const reqsF = await req2('GET', '/api/requests', { token: A61 });
  const convF = (reqsF.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartF.j.cart.id);
  t('v70 v61 (v79 law): the ONE verified return activates HomeCare, marks the invitation claimed AND books the job (deposit $50 of the $100 member total)', retF.status === 200 && meF.j.user.homeCareStatus === 'active' && !!invFNow && invFNow.status === 'accepted' && !!convF && convF.payment.status === 'deposit' && convF.payment.amountCents === 5000 && convF.payment.totalCents === 10000 && convF.membership === 'member');
  const pgF2 = await (await fetch(BASE2 + '/cart/' + cartF.j.cart.id)).text();
  t('v61: once claimed, the free-month offer no longer renders on the cart', !pgF2.includes('FREE_MONTH=true'));
  const balF = await req2('POST', '/api/carts/' + cartF.j.cart.id + '/checkout', { body: { balance: true } });
  t('v70 v61 (v79 law): the booked cart collects its $50 balance from the same link', balF.status === 200 && balF.j.amount === 50 && balF.j.balance === true);
  const cartG = await req2('POST', '/api/admin/carts', { token: A61, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }] } });
  const invG = await req2('POST', '/api/admin/invites', { token: A61, body: { name: 'Plus Pete', cartId: cartG.j.cart.id } });
  const pete = await mkMember('pete61@t.local', '(707) 555-0172');
  const detG = { name: 'Plus Pete', phone: '7075550172', email: 'pete61@t.local', address: '9 Pete St', city: 'Fairfield', when: 'Today' };
  const coG = await req2('POST', '/api/carts/' + cartG.j.cart.id + '/checkout', { token: pete.token, body: Object.assign({}, detG, { join: true, plan: 'plus1' }) });
  const sessG = sessionForCart(cartG.j.cart.id, 'subscription');
  t('v61: a Plus join on an invited cart carries NO invitation (full price, as Gabriel ordered)', coG.status === 200 && coG.j.amount === 150 && !!sessG && !(sessG.metadata && sessG.metadata.inviteId));
  await mockSessionPaid(sessG.id);
  await fetch(BASE2 + '/cart/' + cartG.j.cart.id + '?paid=1&session_id=' + sessG.id, { headers: { Authorization: 'Bearer ' + pete.token } });
  const invListG = await req2('GET', '/api/admin/invites', { token: A61 });
  const invGNow = (invListG.j.invites || []).find(x => x.id === invG.j.invite.id);
  t('v61: the Plus join leaves the invitation pending (not consumed)', !!invGNow && invGNow.status === 'pending');
  const cartH = await req2('POST', '/api/admin/carts', { token: A61, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }] } });
  const invH = await req2('POST', '/api/admin/invites', { token: A61, body: { name: 'Attach Ana' } });
  const atH = await req2('POST', '/api/admin/invites/' + invH.j.invite.id + '/attach', { token: A61, body: { cartId: cartH.j.cart.id } });
  const pgH = await (await fetch(BASE2 + '/cart/' + cartH.j.cart.id)).text();
  t('v61: the attach endpoint puts the free month into an existing cart', atH.status === 200 && atH.j.cartId === cartH.j.cart.id && pgH.includes('FREE_MONTH=true'));
}
// ---------- v74: the free month is UNIVERSAL (Gabriel, 2026-10-25) ----------
// Every HomeCare join starts with the 30-day free trial — no invite
// needed — on every join rail (hosted checkout, inline card flow,
// cart-join). The guard is Gabriel's one-per-account-EVER rule: a
// used free month OR any past HomeCare subscription closes the door.
// Plus and Yard NEVER trial.
t('static v74: every hosted HomeCare join passes the eligibility-gated trial (SPA checkout, estimate join-checkout, cart-join, invite checkout) and the offer shows on the customer surfaces — SPA HomeCare card, join-form perks, website HomeCare box',
  (serverSrc.match(/homeCareTrialEligible\(user\)/g) || []).length >= 4 && serverSrc.includes('trialDays: homeCareTrialEligible(user) ? INVITE_TRIAL_DAYS : 0') &&
  htmlSrc.includes('First month FREE</b> — for everyone (one per account)') && htmlSrc.includes("perks: 'First month FREE • 20% off any job") &&
  fs.readFileSync('/home/hatch/workspace/ghs-app/index.html', 'utf8').includes('First month FREE — for everyone (one per account)'));
{
  const adm74 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A74 = adm74.j.token;
  // 1) Plain SPA join, no invite anywhere: the session TRIALS — the
  // plan is $0 today and the freeMonth stamp rides the metadata.
  const uma = await mkMember('uma74@t.local', '(707) 555-0174');
  const coU = await req2('POST', '/api/stripe/checkout', { token: uma.token, body: { kind: 'homecare' } });
  const sessU = Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.userId === uma.id && s.metadata.kind === 'homecare' && s.mode === 'subscription').slice(-1)[0];
  t('v74: a plain HomeCare join (no invite) opens a TRIAL session — $0 due today, freeMonth stamped, trial reported to the client', coU.status === 200 && coU.j.trial === true && !!sessU && sessU.metadata.freeMonth === '1' && sessU.amount_total === 0);
  // Settle via the webhook (a trial session completes with
  // no_payment_required): membership activates, free month is spent.
  const whU = await wh2('checkout.session.completed', { id: sessU.id, mode: 'subscription', payment_status: 'no_payment_required', subscription: sessU.subscription, customer: 'cus_mock', metadata: { kind: 'homecare', userId: uma.id, freeMonth: '1' } });
  const meU = await req2('GET', '/api/me', { token: uma.token });
  t('v74: the trial join activates through the webhook and the account shows NO free month left', whU.status === 200 && meU.j.user.homeCareStatus === 'active' && meU.j.user.freeMonthAvailable === false);
  // 2) After cancelling, the SAME account rejoins — no second trial:
  // the plan charges the full $29 today.
  const whDelU = await wh2('customer.subscription.deleted', { id: sessU.subscription, status: 'canceled', metadata: { userId: uma.id, kind: 'homecare', plan: 'homecare' } });
  const coU2 = await req2('POST', '/api/stripe/checkout', { token: uma.token, body: { kind: 'homecare' } });
  const sessU2 = Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.userId === uma.id && s.metadata.kind === 'homecare' && s.mode === 'subscription').slice(-1)[0];
  t('v74: the free month is ONCE per account — a cancelled ex-member rejoins at the full $29 (no freeMonth stamp, $29 due today)', whDelU.status === 200 && coU2.status === 200 && coU2.j.trial === false && !!sessU2 && sessU2.id !== sessU.id && !sessU2.metadata.freeMonth && sessU2.amount_total === 2900);
  // 3) The inline card flow: an eligible account's subscription is
  // CREATED with the 30-day trial; once that membership has lived and
  // been cancelled, the subscription HISTORY alone (no flag needed)
  // closes the door on any later free month.
  const ivy = await mkMember('ivy74@t.local', '(707) 555-0175');
  const subI = await req2('POST', '/api/stripe/homecare-subscribe', { token: ivy.token, body: {} });
  const subIvy = stripeState.subs[subI.j.subscriptionId];
  t('v74: the inline card flow creates the HomeCare subscription WITH the 30-day trial for an eligible account', subI.status === 200 && !!subIvy && subIvy.trial_period_days === '30');
  await mockActivate(subI.j.subscriptionId);
  const confI = await req2('POST', '/api/stripe/homecare-confirm', { token: ivy.token, body: {} });
  const whDelI = await wh2('customer.subscription.deleted', { id: subI.j.subscriptionId, status: 'canceled', metadata: { userId: ivy.id, kind: 'homecare', plan: 'homecare' } });
  const coI2 = await req2('POST', '/api/stripe/checkout', { token: ivy.token, body: { kind: 'homecare' } });
  const sessI2 = Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.userId === ivy.id && s.metadata.kind === 'homecare' && s.mode === 'subscription').slice(-1)[0];
  t('v74: a PAST HomeCare subscription alone (cancelled, free month never flagged) earns NO second free month', confI.status === 200 && confI.j.active === true && whDelI.status === 200 && coI2.status === 200 && coI2.j.trial === false && !!sessI2 && !sessI2.metadata.freeMonth && sessI2.amount_total === 2900);
  // 4) Plus NEVER trials: a fresh account joining HomeCare Plus pays
  // from day one — full price due today, no freeMonth stamp.
  const pam = await mkMember('pam74@t.local', '(707) 555-0176');
  const coP74 = await req2('POST', '/api/stripe/checkout', { token: pam.token, body: { kind: 'homecare-plus', plan: 'plus1' } });
  const sessP74 = Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.userId === pam.id && s.metadata.plan === 'plus1' && s.mode === 'subscription').slice(-1)[0];
  t('v74: a HomeCare Plus join carries NO trial — $100 due today, no freeMonth stamp', coP74.status === 200 && !!sessP74 && !sessP74.metadata.freeMonth && sessP74.amount_total === 10000);
  // 5) Cart-join with NO invite attached: the plan trials ($0) and
  // ONLY the 40% deposit charges today; the verified return activates
  // the membership AND books the job, and the free month is spent.
  const cal = await mkMember('cal74@t.local', '(707) 555-0177');
  const cart74 = await req2('POST', '/api/admin/carts', { token: A74, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }], customerName: 'Cal Cart' } });
  const det74 = { name: 'Cal Cart', phone: '7075550177', email: 'cal74@t.local', address: '9 Cal St', city: 'Fairfield', when: 'Today', join: true };
  const coCal = await req2('POST', '/api/carts/' + cart74.j.cart.id + '/checkout', { token: cal.token, body: det74 });
  const sessCal = sessionForCart(cart74.j.cart.id, 'subscription');
  t('v74: a cart-join WITHOUT an invite trials the plan and charges ONLY the deposit today ($50 of the $100 member total)', coCal.status === 200 && coCal.j.next === 'pay' && coCal.j.plan === 'homecare' && coCal.j.planFirst === 0 && coCal.j.deposit === 50 && coCal.j.amount === 50 && coCal.j.total === 100 && !!sessCal && sessCal.metadata.kind === 'cart-join' && sessCal.metadata.freeMonth === '1' && sessCal.amount_total === 5000);
  await mockSessionPaid(sessCal.id);
  const retCal = await fetch(BASE2 + '/cart/' + cart74.j.cart.id + '?paid=1&session_id=' + sessCal.id, { headers: { Authorization: 'Bearer ' + cal.token } });
  const chkCal = await req2('POST', '/api/carts/' + cart74.j.cart.id + '/member-check', { body: { email: 'cal74@t.local' } });
  const meCal = await req2('GET', '/api/me', { token: cal.token });
  t('v74: the cart-join return activates the member, books the job, and spends the free month', retCal.status === 200 && chkCal.j.member === true && meCal.j.user.homeCareStatus === 'active' && meCal.j.user.freeMonthAvailable === false);
}

// ---------- v62: the 40/60 policy end-to-end (Gabriel, 2026-10-24) ----------
t('static v62: the policy rails exist — DEPOSIT_RATE, deposit recorder, ONE settle path, balance branch, deposit/balance page rows', serverSrc.includes('const DEPOSIT_RATE = 0.4') && serverSrc.includes('function recordRequestDeposit(') && serverSrc.includes('function settleCartPayment(') && serverSrc.includes('function completeCartBalance(') && serverSrc.includes("b.balance === true") && serverSrc.includes('id="ctDeposit"') && serverSrc.includes('id="balBtn"'));
{
  const adm62 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A62 = adm62.j.token;
  const cartZ = await req2('POST', '/api/admin/carts', { token: A62, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }, { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }], customerName: 'Dep Dan' } });
  const dan = await mkMember('dan62@t.local', '(707) 555-0180');
  const detZ = { name: 'Dep Dan', phone: '7075550180', email: 'dan62@t.local', address: '5 Dan St', city: 'Fairfield', when: 'Today' };
  const coZ = await req2('POST', '/api/carts/' + cartZ.j.cart.id + '/checkout', { token: dan.token, body: detZ });
  const sessZ = sessionForCart(cartZ.j.cart.id, 'payment');
  t('v62→v79: checkout opens the DEPOSIT session — $250 → $50 flat tier, payStep deposit, split in the response', coZ.status === 200 && coZ.j.amount === 50 && coZ.j.deposit === 50 && coZ.j.balance === 200 && coZ.j.total === 250 && !!sessZ && sessZ.amount_total === 5000 && sessZ.metadata.payStep === 'deposit');
  const pgZ = await (await fetch(BASE2 + '/cart/' + cartZ.j.cart.id)).text();
  t('v62→v79: the open page shows the split — due today $50.00, balance $200.00, deposit pay button', pgZ.includes('id="ctDeposit"') && pgZ.includes('$50.00') && pgZ.includes('id="ctBalance"') && pgZ.includes('$200.00') && pgZ.includes('Pay deposit'));
  await mockSessionPaid(sessZ.id);
  const retZ = await fetch(BASE2 + '/cart/' + cartZ.j.cart.id + '?paid=1&session_id=' + sessZ.id, { headers: { Authorization: 'Bearer ' + dan.token } });
  const retZh = await retZ.text();
  const reqsZ = await req2('GET', '/api/requests', { token: A62 });
  const convZ = (reqsZ.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartZ.j.cart.id);
  t('v62→v79: the paid deposit BOOKS the job — order exists in DEPOSIT state ($50 of $250, balance $200), NOT paid in full', retZ.status === 200 && !!convZ && convZ.payment.status === 'deposit' && convZ.payment.amountCents === 5000 && convZ.payment.totalCents === 25000 && convZ.payment.balanceCents === 20000);
  t('v62: the cart page now shows the booked state — deposit received, balance $150.00 due, Pay balance button on the same link', retZh.includes('Deposit received') && retZh.includes('Pay balance $200.00') && retZh.includes('id="balBtn"'));
  const balZ = await req2('POST', '/api/carts/' + cartZ.j.cart.id + '/checkout', { token: dan.token, body: { balance: true } });
  const sessZB = sessionForCart(cartZ.j.cart.id, 'payment');
  t('v62→v79: the balance step opens a session for exactly the outstanding $200 (payStep balance)', balZ.status === 200 && balZ.j.amount === 200 && balZ.j.balance === true && !!sessZB && sessZB.id !== sessZ.id && sessZB.amount_total === 20000 && sessZB.metadata.payStep === 'balance');
  await mockSessionPaid(sessZB.id);
  const retZB = await fetch(BASE2 + '/cart/' + cartZ.j.cart.id + '?paid=1&session_id=' + sessZB.id, { headers: { Authorization: 'Bearer ' + dan.token } });
  const reqsZB = await req2('GET', '/api/requests', { token: A62 });
  const convZB = (reqsZB.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cartZ.j.cart.id);
  t('v62: the paid balance flips the order to PAID IN FULL ($250)', retZB.status === 200 && !!convZB && convZB.payment.status === 'paid' && convZB.payment.amountCents === 25000);
  const balAgain = await req2('POST', '/api/carts/' + cartZ.j.cart.id + '/checkout', { token: dan.token, body: { balance: true } });
  t('v62: no double balance — a second balance attempt is refused (400)', balAgain.status === 400);
  const pgZB = await (await fetch(BASE2 + '/cart/' + cartZ.j.cart.id)).text();
  t('v62: after the balance, the cart renders the classic paid-in-full view (no balance button)', pgZB.includes('data-i18n="paidH"') && !pgZB.includes('id="balBtn"'));
}


// ---------- v69: admin balance adjustment on deposit-state orders (Gabriel, 2026-10-25) ----------
t('static v69: balance adjustment rails exist — admin endpoint, append-only adjustments, audit key, EN+ES page label, admin dialog',
  serverSrc.includes("/adjust-balance") && serverSrc.includes('cart.adjust-balance') && serverSrc.includes('c.payment.adjustments') && serverSrc.includes("adjLine: 'Materials adjustment'") && serverSrc.includes("adjLine: 'Ajuste de materiales'") &&
  htmlSrc.includes('async function adjustCartBalance(') && htmlSrc.includes('Adjust balance'));
{
  const adm69 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A69 = adm69.j.token;
  const cust69 = await mkMember('amy69m@t.local', '(707) 555-0191');
  const cart69 = await req2('POST', '/api/admin/carts', { token: A69, body: { items: [{ custom: true, kind: 'labor', name: 'Outdoor outlet run', qty: 1, unitPrice: 200 }, { custom: true, kind: 'other', name: 'Materials', qty: 1, unitPrice: 100 }], customerName: 'Adj Amy' } });
  const cid69 = cart69.j.cart.id;
  t('v69 setup: cart totals $300 list / $260 member (materials never discount)', cart69.status === 201 && cart69.j.cart.listTotal === 300 && cart69.j.cart.memberTotal === 260);
  const det69 = { name: 'Adj Amy', phone: '7075550199', email: 'amy69@test.com', address: '7 Pine St', city: 'Fairfield', when: 'Today' };
  const co69 = await req2('POST', '/api/carts/' + cid69 + '/checkout', { body: det69 });
  const sess69 = sessionForCart(cid69, 'payment');
  await mockSessionPaid(sess69.id);
  await fetch(BASE2 + '/cart/' + cid69 + '?paid=1&session_id=' + sess69.id);
  const reqs69a = await req2('GET', '/api/requests', { token: A69 });
  const conv69a = (reqs69a.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cid69);
  t('v69 setup (v79 law): the guest deposit books the order ($50 of $300 — the $300 tier is FLAT, balance $250)', co69.status === 200 && !!conv69a && conv69a.payment.status === 'deposit' && conv69a.payment.amountCents === 5000 && conv69a.payment.totalCents === 30000 && conv69a.payment.balanceCents === 25000);
  const adjForbidden = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: cust69.token, body: { delta: 35, note: 'hack' } });
  t('v69: only the admin can adjust a balance', adjForbidden.status === 403);
  const adjZero = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: A69, body: { delta: 0, note: 'zero' } });
  t('v69: a $0 adjustment is refused', adjZero.status === 400);
  const adjBig = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: A69, body: { delta: 5000, note: 'typo' } });
  t('v69: an adjustment over $2,000 is refused (typo guard)', adjBig.status === 400);
  const adj1 = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: A69, body: { delta: 35, note: 'Updated materials: cable roll + valves, at cost' } });
  t('v69: +$35 materials adjustment lands — total $335, balance $285, deposit untouched, adjustment recorded', adj1.status === 200 && adj1.j.cart.payState.total === 335 && adj1.j.cart.payState.balance === 285 && adj1.j.cart.payState.deposit === 50 && adj1.j.cart.payState.adjustments.length === 1 && adj1.j.cart.payState.adjustments[0].delta === 35);
  const pg69 = await (await fetch(BASE2 + '/cart/' + cid69)).text();
  t('v69: the customer page shows the adjustment line, its note and the NEW balance on the same link', pg69.includes('Materials adjustment') && pg69.includes('+$35.00') && pg69.includes('Updated materials: cable roll + valves, at cost') && pg69.includes('Pay balance $285.00'));
  const reqs69 = await req2('GET', '/api/requests', { token: A69 });
  const conv69 = (reqs69.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cid69);
  t('v69: the order record syncs — total $335, balance $285, still deposit state, due updated', !!conv69 && conv69.payment.status === 'deposit' && conv69.payment.totalCents === 33500 && conv69.payment.balanceCents === 28500 && conv69.menuOrder.totals.due === 335);
  const bal69 = await req2('POST', '/api/carts/' + cid69 + '/checkout', { body: { balance: true } });
  const sess69B = sessionForCart(cid69, 'payment');
  t('v69: the balance checkout charges the ADJUSTED $285', bal69.status === 200 && bal69.j.amount === 285 && !!sess69B && sess69B.id !== sess69.id && sess69B.amount_total === 28500 && sess69B.metadata.payStep === 'balance');
  const adjFloor = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: A69, body: { delta: -500, note: 'too far' } });
  t('v69: the balance cannot be adjusted below $0', adjFloor.status === 400);
  const adjZeroBal = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: A69, body: { delta: -285, note: 'Materials credit — deposit covers the rest' } });
  const reqs69b = await req2('GET', '/api/requests', { token: A69 });
  const conv69b = (reqs69b.j.requests || []).find(x => x.menuOrder && x.menuOrder.cartId === cid69);
  t('v69: adjusting the balance to $0 settles the order PAID IN FULL at the adjusted total ($50 — the deposit that landed)', adjZeroBal.status === 200 && adjZeroBal.j.cart.payState.balance === 0 && adjZeroBal.j.cart.payState.balancePaid === true && !!conv69b && conv69b.payment.status === 'paid' && conv69b.payment.amountCents === 5000);
  const pg69b = await (await fetch(BASE2 + '/cart/' + cid69)).text();
  t('v69: the settled page renders paid-in-full ($50.00) with BOTH adjustment lines on the record', pg69b.includes('data-i18n="paidH"') && !pg69b.includes('id="balBtn"') && pg69b.includes('Materials adjustment') && pg69b.includes('-$285.00') && pg69b.includes('Total paid:') && pg69b.includes('$50.00'));
  const adjClosed = await req2('POST', '/api/admin/carts/' + cid69 + '/adjust-balance', { token: A69, body: { delta: 10, note: 'too late' } });
  t('v69: a settled order refuses further adjustments', adjClosed.status === 400);
  const cartOpen69 = await req2('POST', '/api/admin/carts', { token: A69, body: { items: [{ serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }] } });
  const adjOpen = await req2('POST', '/api/admin/carts/' + cartOpen69.j.cart.id + '/adjust-balance', { token: A69, body: { delta: 10, note: 'not booked' } });
  t('v69: an OPEN cart (no deposit yet) cannot be balance-adjusted — its lines are edited instead', adjOpen.status === 400);
}


// ---------- v70: ONE single checkout — plan + 40% deposit together (Gabriel, 2026-10-25) ----------
t('static v70: combined-session rails exist — cart-join kind, pendingJoin settle branch, webhook + return combined branches, materials-variation clause on cart + estimate pages',
  serverSrc.includes("kind === 'cart-join'") && serverSrc.includes('c.pendingJoin') && serverSrc.includes("metadata[plan]") && serverSrc.includes('One single checkout') && serverSrc.includes('Un solo cobro') &&
  serverSrc.includes("matVarNote: 'Materials are estimated at today\\'s prices.") && serverSrc.includes('matVarNote: \'Los materiales se estiman a precios de hoy.'));


// ---------------- v66: Web Push — VAPID + RFC 8291 encryption, proven by decrypting ----------------
t('static v66: server has VAPID + aes128gcm encryption + subscribe routes + the notify() hook; SW handles push/click; SPA subscribes after the grant',
  serverSrc.includes('function vapidKeys(') && serverSrc.includes('function encryptPushPayload(') && serverSrc.includes("p === '/api/push/subscribe'") && serverSrc.includes('sendPushToUser(userId') &&
  swSrc.includes("addEventListener('push'") && swSrc.includes("addEventListener('notificationclick'") &&
  htmlSrc.includes('async function subscribePush(') && htmlSrc.includes('maybeSubscribePush()'));
{
  // A fake push service + a real UA keypair: the server must deliver a
  // payload this test can decrypt with the UA private key, and a VAPID JWT
  // that verifies against the server's published key (aud = this origin).
  const captures = [];
  const pushMock = http.createServer((rq, rs) => { const chunks = []; rq.on('data', c => chunks.push(c)); rq.on('end', () => { captures.push({ headers: rq.headers, body: Buffer.concat(chunks) }); rs.writeHead(201); rs.end('{}'); }); });
  await new Promise(r => pushMock.listen(8982, r));
  const ua = nodeCrypto.createECDH('prime256v1'); ua.generateKeys();
  const uaPub = ua.getPublicKey(); const authSecret = nodeCrypto.randomBytes(16);
  const sub = { endpoint: 'http://127.0.0.1:8982/push/abc', keys: { p256dh: uaPub.toString('base64url'), auth: authSecret.toString('base64url') } };
  const su = await req2('POST', '/api/signup', { body: { name: 'Push Pat', email: 'pushpat@test.com', password: 'pushpass123', role: 'customer' } });
  const pTok = su.j.token;
  const key1 = await req2('GET', '/api/push/key', { token: pTok });
  const subRes = await req2('POST', '/api/push/subscribe', { token: pTok, body: { subscription: sub } });
  let cap = null;
  for (let i = 0; i < 20 && !cap; i++) { if (captures.length) cap = captures[0]; else await sleep(150); }
  let plain = '', jwtOk = false, audOk = false;
  if (cap) {
    const salt = cap.body.subarray(0, 16), idLen = cap.body[20], asPub = cap.body.subarray(21, 21 + idLen), ct = cap.body.subarray(21 + idLen);
    const secret = ua.computeSecret(asPub);
    const prkKey = nodeCrypto.createHmac('sha256', authSecret).update(secret).digest();
    const ikm = nodeCrypto.createHmac('sha256', prkKey).update(Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])])).digest().subarray(0, 32);
    const prk = nodeCrypto.createHmac('sha256', salt).update(ikm).digest();
    const exp = (info, len) => nodeCrypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
    const cek = exp(Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = exp(Buffer.from('Content-Encoding: nonce\0'), 12);
    const decipher = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString('utf8');
    const authz = cap.headers['authorization'] || '';
    const jwt = (authz.match(/t=([^,]+)/) || [])[1] || '';
    const parts = jwt.split('.');
    if (parts.length === 3 && key1.j.publicKey) {
      const raw = Buffer.from(key1.j.publicKey, 'base64url');
      const pubObj = nodeCrypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') }, format: 'jwk' });
      jwtOk = nodeCrypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key: pubObj, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
      audOk = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).aud === 'http://127.0.0.1:8982';
    }
  }
  t('v66: subscribe stores the sub and the WELCOME push arrives encrypted — and decrypts to the welcome text', subRes.status === 200 && subRes.j.isNew === true && !!cap && plain.includes('Push notifications are ON'));
  t('v66: the VAPID JWT verifies against /api/push/key and its aud is the push origin', jwtOk && audOk);
  const before = captures.length;
  const dupe = await req2('POST', '/api/push/subscribe', { token: pTok, body: { subscription: sub } });
  await sleep(400);
  t('v66: re-subscribing the same endpoint dedupes (no second welcome)', dupe.status === 200 && dupe.j.isNew === false && captures.length === before);
  const unsub = await req2('POST', '/api/push/unsubscribe', { token: pTok, body: { endpoint: sub.endpoint } });
  const again = await req2('POST', '/api/push/subscribe', { token: pTok, body: { subscription: sub } });
  t('v66: after unsubscribe, subscribing again counts as new', unsub.status === 200 && again.status === 200 && again.j.isNew === true);
  const bad = await req2('POST', '/api/push/subscribe', { token: pTok, body: { subscription: { endpoint: 'https://x.example/p', keys: { p256dh: 'AAAA', auth: 'AAAA' } } } });
  t('v66: a malformed subscription is refused (400)', bad.status === 400);
  try { pushMock.close(); } catch (e) {}
}

// ---------------- v71: worker-zone EN|ES toggle ----------------
t('static v71: worker i18n rails exist — W_I18N dict + WT/workerLang/setWorkerLang persisted on ghsWorkerLang, toggles on BOTH the auth card and the dashboard, data-w pass, and the worker renderers speak WT',
  htmlSrc.includes('const W_I18N = {') && htmlSrc.includes('function workerLang(){') && htmlSrc.includes('function setWorkerLang(l){') && htmlSrc.includes("localStorage.setItem('ghsWorkerLang'") && htmlSrc.includes("localStorage.getItem('ghsWorkerLang')") &&
  htmlSrc.includes('id="workerLangRowA"') && htmlSrc.includes('id="workerLangEnA"') && htmlSrc.includes('id="workerLangEsA"') && htmlSrc.includes('id="workerLangEnW"') && htmlSrc.includes('id="workerLangEsW"') &&
  htmlSrc.includes('data-w="tabWorker"') && htmlSrc.includes('data-w="rescueBtn"') && htmlSrc.includes('data-w="permTitle"') && htmlSrc.includes('data-w="openJobs"') && htmlSrc.includes('function applyWorkerLang(){') &&
  htmlSrc.includes("WT('statusActive')") && htmlSrc.includes("WT('moneyTitle')") && htmlSrc.includes("WT('tradesTitle')") && htmlSrc.includes("WT('areaTitle')") && htmlSrc.includes("WT('yardNone')") &&
  !htmlSrc.includes('Mis oficios / My trades') && !htmlSrc.includes('Mi dinero / My money') && !htmlSrc.includes('Payout sent to your bank ✓</span>'));

// ---------------- v65: in-app dialogs, no boot permission burn, map self-heal ----------------
t('static v65: in-app dialog system present, the admin flows use it (no native confirm in async admin fns), the boot-time bare permission request is gone, the master map self-heals Leaflet',
  htmlSrc.includes('id="appDlg"') && htmlSrc.includes('function appConfirm(') && htmlSrc.includes('function appPrompt(') &&
  htmlSrc.includes('await appConfirm(') && htmlSrc.includes('await appPrompt(') &&
  !htmlSrc.includes("if (window.Notification && Notification.permission === 'default') { Notification.requestPermission()") &&
  htmlSrc.includes('function ensureLeaflet(') && htmlSrc.includes('await ensureLeaflet()') && htmlSrc.includes('Reintentar · Retry'));

// ---------------- v64: permissions setup card + the HAMMER sound ----------------
t('static v64: the SPA has the permissions card (notificaciones + ubicación, both roles), the activate handlers, and the synthesized hammer strike as the primary alert sound',
  htmlSrc.includes('id="permCard"') && htmlSrc.includes('function refreshPermCard(') && htmlSrc.includes('async function activarNotifs(') && htmlSrc.includes('function activarUbicacion(') &&
  htmlSrc.includes('function playHammer(') && htmlSrc.includes('if (playHammer()) return;') && htmlSrc.includes('exponentialRampToValueAtTime(62, t0 + 0.14)') && htmlSrc.includes('[3412, 0.14, 0.13]') && htmlSrc.includes("localStorage.setItem('ghsLoc', 'on')"));

// ---------------- v63: technician door — direct link + sticky entry + rescue ----------------
t('static v63: /tecnico + /tech redirect to the worker entry; the activation email carries the link + steps; the SPA has the sticky flag, the rescue button and the ENTRAR face',
  serverSrc.includes("p === '/tecnico'") && serverSrc.includes("Location: '/#worker'") && serverSrc.includes('/tecnico — it takes you straight to the technician door') &&
  htmlSrc.includes('id="workerRescueRow"') && htmlSrc.includes("localStorage.setItem('ghs_entry','worker')") && htmlSrc.includes("localStorage.getItem('ghs_entry')==='worker'") && htmlSrc.includes("localStorage.removeItem('ghs_entry')") && htmlSrc.includes('¿Primera vez o no recuerdas tu contraseña?') && htmlSrc.includes("workerEnter: '🔨 ENTRAR'"));
{
  const r1 = await fetch(BASE2 + '/tecnico', { redirect: 'manual' });
  const r2 = await fetch(BASE2 + '/tech', { redirect: 'manual' });
  t('v63: GET /tecnico and /tech 302 to /#worker', r1.status === 302 && (r1.headers.get('location') || '').includes('#worker') && r2.status === 302);
}

// ---------------- v72: approved cleanup (29 proposals + ideas) ----------------
t('static v72 L-1/L-2/L-3: the application form no longer asks skills 3x — self-rate, tools-level and transport fields are gone (stored data + admin skill display untouched)',
  !htmlSrc.includes('id="wSelfRate"') && !htmlSrc.includes('renderSelfRate(') && !htmlSrc.includes('id="wTools"') && !htmlSrc.includes('id="wTransport"') && htmlSrc.includes('skillRankHtml(w)'));
t('static v72 L-5/L-6/L-9: join mode shows ONE charge note, the forgot row never shows in the worker entry, and the customer-face login notes hide there',
  htmlSrc.includes("m==='homecare' ? 'block':'none'") && htmlSrc.includes("(m==='login' && !isWorkerEntry()) ? 'block':'none'") && htmlSrc.includes("getElementById('loginOnlyNote')"));
t('static v72 L-7: the technician job list renders ABOVE the profile (trackBanner + jobList before workerProfile)',
  htmlSrc.indexOf('id="trackBanner"') > -1 && htmlSrc.indexOf('id="trackBanner"') < htmlSrc.indexOf('id="workerProfile"') && htmlSrc.indexOf('id="jobList"') < htmlSrc.indexOf('id="workerProfile"'));
t('static v72 L-8/L-13: the static auth hint matches the JS customer face, and the rescue row carries the Team fallback line in both languages',
  htmlSrc.includes('No account needed to request a quote — just send it and we reply by email. Create an account to track jobs, pay invoices online, or join HomeCare.') && htmlSrc.includes("rescueNoEmail: 'No access to that email anymore? Call or text the Team: (707) 862-3773'") && htmlSrc.includes('¿Ya no tienes acceso a ese correo?'));
t('static v72 C-2/C-3/C-4: sound toggle speaks speaker emoji, the header carries no duplicate text brand, and the header Member Login hides while the auth card is on screen',
  htmlSrc.includes("soundOn ? '🔊' : '🔇'") && !htmlSrc.includes('<b>General <em>Handyman</em> Solutions</b>') && htmlSrc.includes('function paintMemberLoginBtn()') && htmlSrc.includes('new IntersectionObserver'));
t('static v72 A-1/A-2/A-3: compact admin worker cards with a Ver detalle toggle, the admNav anchor bar + admGo, and the short create-job candidate hint',
  htmlSrc.includes('id="admNav"') && htmlSrc.includes('function admGo(') && htmlSrc.includes('function toggleWorkerDetail(') && htmlSrc.includes('Ver detalle ▾') && htmlSrc.includes('aquí salen los mejores para ese oficio'));
t('static v72 P-1/P-2: branded bilingual payment-result pages + UA-ordered install platform cards',
  serverSrc.includes('function payResultPageHtml(') && serverSrc.includes('function platformCards(') && serverSrc.includes("installPageHtml(url.searchParams.get('lang'), req.headers['user-agent'])"));
{
  const web72 = fs.readFileSync(path.join(APP_DIR, '..', 'index.html'), 'utf8');
  t('static v72 W: website demo bar, mock-page footer links, sample-review note, duplicate members strip, empty cats row and see-all self-links are gone; step 3 states the real payment policy; reviews hidden until real ones exist (I-2)',
    !web72.includes('cartbar') && !web72.includes('Sample order') && !web72.includes('href="checkout.html"') && !web72.includes('href="tracking.html"') && !web72.includes('Sample reviews are placeholders') && !web72.includes('class="members"') && !web72.includes('class="cats"') && !web72.includes('class="seeall"') &&
    web72.includes('Pay in full when you order</b>Menu orders are paid up front.') && web72.includes('data-v72="hidden-until-real-reviews"') && web72.includes("Neighbors' favorites"));
}
{
  const ps = await (await fetch(BASE2 + '/payment/success')).text();
  const psEs = await (await fetch(BASE2 + '/payment/success?lang=es')).text();
  const pc = await (await fetch(BASE2 + '/payment/cancelled')).text();
  t('v72 P-1: payment result pages are branded + bilingual (EN default, ES via ?lang=, cancelled covered too)',
    ps.includes('Payment received') && ps.includes('icon-512.png') && psEs.includes('Pago recibido') && pc.includes('Payment cancelled'));
  const instIos = await (await fetch(BASE2 + '/instalar', { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' } })).text();
  const instAnd = await (await fetch(BASE2 + '/instalar')).text();
  t('v72 P-2: /instalar orders the platform cards by visitor UA (iPhone UA → iOS card first, default → Android first)',
    instIos.indexOf('On iPhone / iPad (Safari)') > -1 && instIos.indexOf('On iPhone / iPad (Safari)') < instIos.indexOf('On Android (Chrome)') && instAnd.indexOf('On Android (Chrome)') > -1 && instAnd.indexOf('On Android (Chrome)') < instAnd.indexOf('On iPhone / iPad (Safari)'));
}

// ---------------- v78 server: guest cart quote + embedded checkout ----------------
// The live app2 at this point is the v75-respawned instance (mock
// Stripe on 8980, whsec_mock_test); admin re-logs in for a token.
{
  const adm78 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  const A78 = adm78.j.token;
  const items78 = [
    { serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, addons: [] },
    { serviceId: 'ceiling-fan', name: 'Ceiling Fan Install', qty: 1, addons: [] }
  ];
  const adminReqs78 = async () => (await req2('GET', '/api/requests', { token: A78 })).j.requests || [];
  // quote: display pricing from the server catalog — guest vs member
  const qGuest = await req2('POST', '/api/cart/quote', { body: { items: items78 } });
  t('v78 quote: guest gets list 250 / member 200 / due 250 from SERVER_MENU', qGuest.status === 200 && qGuest.j.member === false && qGuest.j.totals.list === 250 && qGuest.j.totals.member === 200 && qGuest.j.totals.due === 250);
  const qBad = await req2('POST', '/api/cart/quote', { body: { items: [{ serviceId: 'not-a-service', qty: 1, addons: [] }] } });
  t('v78 quote: an unknown service id is refused (400), never priced by guess', qBad.status === 400);
  // guest checkout, NO membership: account created at the END, a
  // tampered client total is ignored, and P0-4 — NO order exists
  // until the payment verifies.
  const coGuest = await req2('POST', '/api/cart/checkout', { body: { name: 'Cart Guest', email: 'cartguest@t.local', phone: '7075550178', password: 'guestpass1', address: '9 Pine St', city: 'Fairfield', when: 'Today', notes: '', items: items78, totals: { due: 1 } } });
  t('v78 checkout: guest step pay returns an intent + the SERVER total 250 (tampered $1 ignored) + the new account', coGuest.status === 200 && coGuest.j.step === 'pay' && !!coGuest.j.clientSecret && !!coGuest.j.checkoutId && coGuest.j.totals.due === 250 && coGuest.j.user.email === 'cartguest@t.local');
  t('v78 P0-4: the intent exists but NO order was created before verified payment', (await adminReqs78()).filter(r => r.menuOrder && r.menuOrder.checkoutId === coGuest.j.checkoutId).length === 0);
  const cgTok = (await req2('POST', '/api/login', { body: { email: 'cartguest@t.local', password: 'guestpass1' } })).j.token;
  const confEarly = await req2('POST', '/api/cart/checkout-confirm', { token: cgTok, body: { checkoutId: coGuest.j.checkoutId, paymentIntentId: coGuest.j.paymentIntentId } });
  t('v78 P0-4: confirm before the payment completes is refused (400) and still creates nothing', confEarly.status === 400 && (await adminReqs78()).filter(r => r.menuOrder && r.menuOrder.checkoutId === coGuest.j.checkoutId).length === 0);
  await mockPiStatus(coGuest.j.paymentIntentId, 'succeeded');
  const confOk = await req2('POST', '/api/cart/checkout-confirm', { token: cgTok, body: { checkoutId: coGuest.j.checkoutId, paymentIntentId: coGuest.j.paymentIntentId } });
  const orderGuest = (await adminReqs78()).find(r => r.id === (confOk.j && confOk.j.requestId));
  t('v78 checkout (v79 deposit law): the verified DEPOSIT creates the order — DEPOSIT state ($50 of $250 in, $200 balance), cart lines attached', confOk.status === 200 && !!orderGuest && orderGuest.payment && orderGuest.payment.status === 'deposit' && orderGuest.payment.amountCents === 5000 && orderGuest.payment.balanceCents === 20000 && orderGuest.menuOrder.cart === true && orderGuest.menuOrder.totals.due === 250 && orderGuest.menuOrder.items.length === 2);
  const confAgain = await req2('POST', '/api/cart/checkout-confirm', { token: cgTok, body: { checkoutId: coGuest.j.checkoutId, paymentIntentId: coGuest.j.paymentIntentId } });
  t('v78 checkout: re-confirm is idempotent (same order id, no duplicate)', confAgain.status === 200 && confAgain.j.requestId === confOk.j.requestId && (await adminReqs78()).filter(r => r.menuOrder && r.menuOrder.checkoutId === coGuest.j.checkoutId).length === 1);
  // existing email: wrong password refused (inline login), right one continues
  const coWrong = await req2('POST', '/api/cart/checkout', { body: { name: 'X', email: 'cartguest@t.local', password: 'wrongpass9', address: '9 Pine St', items: items78 } });
  t('v78 checkout: an existing email with the WRONG password is refused (409 ACCOUNT_EXISTS)', coWrong.status === 409 && coWrong.j.code === 'ACCOUNT_EXISTS');
  const coRight = await req2('POST', '/api/cart/checkout', { body: { name: 'X', email: 'cartguest@t.local', password: 'guestpass1', address: '9 Pine St', items: items78 } });
  t('v78 checkout: the RIGHT password logs the account in inline and the checkout continues', coRight.status === 200 && coRight.j.step === 'pay' && coRight.j.user.email === 'cartguest@t.local');
  // verified member: quote + checkout at the member total
  const mm78 = await mkMember('cartmember@t.local', '(707) 555-0179');
  const subM78 = await req2('POST', '/api/stripe/homecare-subscribe', { token: mm78.token, body: {} });
  await mockActivate(subM78.j.subscriptionId);
  const confM78 = await req2('POST', '/api/stripe/homecare-confirm', { token: mm78.token, body: {} });
  const qMem = await req2('POST', '/api/cart/quote', { token: mm78.token, body: { items: items78 } });
  t('v78 quote: a verified member gets member=true and due = 200', confM78.j.active === true && qMem.status === 200 && qMem.j.member === true && qMem.j.totals.due === 200);
  const coMem = await req2('POST', '/api/cart/checkout', { token: mm78.token, body: { address: '3 Elm St', city: 'Fairfield', items: items78 } });
  t('v78 checkout: member pays the MEMBER total (200), no account step needed', coMem.status === 200 && coMem.j.step === 'pay' && coMem.j.totals.due === 200);
  // optional membership branch: join first (subscription rails), the
  // activation lands, THEN the order charges at the member total.
  const coJoin = await req2('POST', '/api/cart/checkout', { body: { step: 'join', name: 'Join Jenna', email: 'joiner@t.local', phone: '7075550180', password: 'joinpass12', address: '4 Birch St', city: 'Vacaville', items: items78 } });
  t('v78 join: step join returns a subscription secret + member-priced preview (200), still NO order', coJoin.status === 200 && coJoin.j.step === 'join' && !!coJoin.j.clientSecret && coJoin.j.totals.due === 200);
  const jTok = (await req2('POST', '/api/login', { body: { email: 'joiner@t.local', password: 'joinpass12' } })).j.token;
  await mockActivate(coJoin.j.subscriptionId);
  const jConf = await req2('POST', '/api/stripe/homecare-confirm', { token: jTok, body: {} });
  const coJoinPay = await req2('POST', '/api/cart/checkout', { token: jTok, body: { step: 'pay', joinedMembership: true, address: '4 Birch St', items: items78 } });
  await mockPiStatus(coJoinPay.j.paymentIntentId, 'succeeded');
  const jDone = await req2('POST', '/api/cart/checkout-confirm', { token: jTok, body: { checkoutId: coJoinPay.j.checkoutId, paymentIntentId: coJoinPay.j.paymentIntentId } });
  const jOrder = (await adminReqs78()).find(r => r.id === (jDone.j && jDone.j.requestId));
  t('v78 join: after activation the order charges the MEMBER total and records joinedMembership', jConf.j.active === true && coJoinPay.status === 200 && coJoinPay.j.totals.due === 200 && jDone.status === 200 && !!jOrder && jOrder.menuOrder.joinedMembership === true && jOrder.payment.status === 'deposit');
  // webhook parity: the tab dies after paying — the order is born from
  // payment_intent.succeeded with kind 'cart-checkout', exactly once.
  const coHook = await req2('POST', '/api/cart/checkout', { body: { name: 'Hook Hank', email: 'hook@t.local', phone: '7075550181', password: 'hookpass12', address: '8 Cedar St', city: 'Napa', items: items78 } });
  await mockPiStatus(coHook.j.paymentIntentId, 'succeeded');
  const whPayload78 = JSON.stringify({ id: 'evt_wh_cart78', type: 'payment_intent.succeeded', data: { object: { id: coHook.j.paymentIntentId, amount: 5000, amount_received: 5000, status: 'succeeded', metadata: { kind: 'cart-checkout', checkoutId: coHook.j.checkoutId, userId: coHook.j.user.id } } } });
  const whTs78 = Math.floor(Date.now() / 1000);
  const whSig78 = nodeCrypto.createHmac('sha256', 'whsec_mock_test').update(whTs78 + '.' + whPayload78, 'utf8').digest('hex');
  const whRes78 = await fetch(BASE2 + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=' + whTs78 + ',v1=' + whSig78 }, body: whPayload78 });
  const hookOrder = (await adminReqs78()).find(r => r.menuOrder && r.menuOrder.checkoutId === coHook.j.checkoutId);
  t('v78 webhook parity (v79): payment_intent.succeeded creates the DEPOSIT-booked order when the in-app confirm never lands', whRes78.status === 200 && !!hookOrder && hookOrder.payment.status === 'deposit');
  // --- v78 refine (Gabriel 21:57): editing the cart AT checkout
  // supersedes the stale intent — it can never settle — and an empty
  // cart is refused BEFORE any account is created.
  const edItems1 = [{ serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, addons: [] }];
  const edItems2 = edItems1.concat([{ serviceId: 'ceiling-fan', name: 'Ceiling Fan Install', qty: 1, addons: [] }]);
  const coEd1 = await req2('POST', '/api/cart/checkout', { body: { name: 'Edit Ed', email: 'edited@t.local', phone: '7075550182', password: 'editpass12', address: '2 Ash St', city: 'Fairfield', items: edItems1 } });
  t('v78 refine: the first checkout prices the cart as built (125)', coEd1.status === 200 && coEd1.j.totals.due === 125 && !!coEd1.j.paymentIntentId);
  const edTok = (await req2('POST', '/api/login', { body: { email: 'edited@t.local', password: 'editpass12' } })).j.token;
  const coEd2 = await req2('POST', '/api/cart/checkout', { token: edTok, body: { address: '2 Ash St', city: 'Fairfield', items: edItems2 } });
  t('v78 refine: re-checkout after the at-checkout edit prices the EDITED cart (250) under a NEW checkout id', coEd2.status === 200 && coEd2.j.checkoutId !== coEd1.j.checkoutId && coEd2.j.totals.due === 250);
  await mockPiStatus(coEd1.j.paymentIntentId, 'succeeded');
  const confStale = await req2('POST', '/api/cart/checkout-confirm', { token: edTok, body: { checkoutId: coEd1.j.checkoutId, paymentIntentId: coEd1.j.paymentIntentId } });
  t('v78 refine: the STALE checkout can never settle — confirm refused (superseded), no order at the old total', confStale.status === 400 && /replaced by a newer one/.test(confStale.j.error || '') && (await adminReqs78()).filter(r => r.menuOrder && r.menuOrder.checkoutId === coEd1.j.checkoutId).length === 0);
  const whPayloadStale = JSON.stringify({ id: 'evt_wh_stale78', type: 'payment_intent.succeeded', data: { object: { id: coEd1.j.paymentIntentId, amount: 12500, amount_received: 12500, status: 'succeeded', metadata: { kind: 'cart-checkout', checkoutId: coEd1.j.checkoutId, userId: coEd1.j.user.id } } } });
  const whTsStale = Math.floor(Date.now() / 1000);
  const whSigStale = nodeCrypto.createHmac('sha256', 'whsec_mock_test').update(whTsStale + '.' + whPayloadStale, 'utf8').digest('hex');
  await fetch(BASE2 + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=' + whTsStale + ',v1=' + whSigStale }, body: whPayloadStale });
  t('v78 refine: the webhook also refuses the superseded checkout (no order from the stale intent)', (await adminReqs78()).filter(r => r.menuOrder && r.menuOrder.checkoutId === coEd1.j.checkoutId).length === 0);
  await mockPiStatus(coEd2.j.paymentIntentId, 'succeeded');
  const confEd = await req2('POST', '/api/cart/checkout-confirm', { token: edTok, body: { checkoutId: coEd2.j.checkoutId, paymentIntentId: coEd2.j.paymentIntentId } });
  const edOrder = (await adminReqs78()).find(r => r.id === (confEd.j && confEd.j.requestId));
  t('v78 refine (v79): the EDITED checkout settles at the EDITED total — order booked on its deposit, both lines, $250', confEd.status === 200 && !!edOrder && edOrder.payment.status === 'deposit' && edOrder.menuOrder.totals.due === 250 && edOrder.menuOrder.items.length === 2);
  const cbBeforeE = await customersByEmail();
  const coEmpty = await req2('POST', '/api/cart/checkout', { body: { name: 'Empty Eve', email: 'empty@t.local', password: 'emptypass1', address: '1 Void St', items: [] } });
  const cbAfterE = await customersByEmail();
  t('v78 refine: an EMPTY cart is refused (400) BEFORE any account is created — no orphan account', coEmpty.status === 400 && !cbAfterE['empty@t.local'] && Object.keys(cbAfterE).length === Object.keys(cbBeforeE).length);
  // graceful degradation: app1 runs WITHOUT a Stripe key
  const coNoStripe = await req('POST', '/api/cart/checkout', { body: { name: 'No Stripe', email: 'nostripe@t.local', password: 'nostripe12', address: '1 Nowhere St', items: items78 } });
  t('v78 degrade: without Stripe the checkout stops cleanly with the house message (no account, no order)', coNoStripe.status === 400 && /payments are not connected yet/.test(coNoStripe.j.error || ''));
  // static pins
  t('static v78: server prices carts from the catalog + exposes quote/checkout/checkout-confirm', serverSrc.includes('function serverCartTotals(') && serverSrc.includes("p === '/api/cart/quote'") && serverSrc.includes("p === '/api/cart/checkout'") && serverSrc.includes("p === '/api/cart/checkout-confirm'"));
  t('static v78: the order settles ONLY from a verified payment (settleCartCheckout + webhook kind cart-checkout)', serverSrc.includes('function settleCartCheckout(') && serverSrc.includes("obj.metadata.kind === 'cart-checkout'"));
  t('static v78: client keeps the cart in localStorage ghsCart + mounts a Payment Element + calls the cart endpoints', htmlSrc.includes("CART_LS_KEY = 'ghsCart'") && htmlSrc.includes("create('payment')") && htmlSrc.includes('confirmPayment') && htmlSrc.includes("api('/api/cart/checkout'"));
  t('static v78 refine: at-checkout editing — editable lines + add-more + server re-quote (client), supersede + PI cancel (server)', htmlSrc.includes('id="ccLines"') && htmlSrc.includes('ccQty(') && htmlSrc.includes('ccRemove(') && htmlSrc.includes('ccAddMore(') && htmlSrc.includes("api('/api/cart/quote'") && serverSrc.includes('pc.superseded') && serverSrc.includes("'/cancel'"));
  const wSlice78 = htmlSrc.slice(htmlSrc.indexOf('id="workerBox"'), htmlSrc.indexOf('id="adminBox"'));
  const aStart78 = htmlSrc.indexOf('id="adminBox"');
  const aSlice78 = htmlSrc.slice(aStart78, htmlSrc.indexOf('<script>', aStart78));
  t('static v78 ROLE PIN: worker + admin markup carry NO guest-cart UI (technicians never see the cart or customer totals)', !/ghsCart|cartBtn|id="cartBox"|cartAdd\('/.test(wSlice78) && !/ghsCart|cartBtn|id="cartBox"|cartAdd\('/.test(aSlice78));
}

// ---------------- v79 BLINDAJE: P0-1, P0-2, P0-5, P0-6, P0-7, propuestas, #order, LEY DE APARTADO ----------------
{
  const A79 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
  const admReqs79 = async () => (await req2('GET', '/api/requests', { token: A79 })).j.requests || [];

  // --- PIEZA 8: the deposit law, pinned at Gabriel's totals (admin-cart rails) ---
  const depProbe = async (total, email) => {
    const c = await req2('POST', '/api/admin/carts', { token: A79, body: { items: [{ custom: true, kind: 'labor', name: 'Law probe', qty: 1, unitPrice: total }] } });
    const co = await req2('POST', '/api/carts/' + c.j.cart.id + '/checkout', { body: { name: 'Law Probe', phone: '7075550100', email, address: '1 Law St', city: 'Fairfield', when: 'Today' } });
    return co.j;
  };
  const d75 = await depProbe(75, 'law75@t.local');
  t('v79 deposit law: $75 total -> $50 deposit / $25 balance', d75.amount === 50 && d75.deposit === 50 && d75.balance === 25 && d75.total === 75);
  const d125 = await depProbe(125, 'law125@t.local');
  t('v79 deposit law: $125 total -> $50 deposit / $75 balance', d125.amount === 50 && d125.balance === 75);
  const d250 = await depProbe(250, 'law250@t.local');
  t('v79 deposit law: $250 total -> $50 deposit / $200 balance', d250.amount === 50 && d250.balance === 200);
  const d300 = await depProbe(300, 'law300@t.local');
  t('v79 deposit law: $300 total -> $50 deposit / $250 balance (the tier is FLAT at $300)', d300.amount === 50 && d300.balance === 250);
  const d540 = await depProbe(540, 'law540@t.local');
  t('v79 deposit law: $540 total -> $216 deposit (40%) / $324 balance', d540.amount === 216 && d540.balance === 324);
  // Gabriel's worked example (2026-10-25 22:15): the tier is judged on the
  // FINAL total AFTER the member discount — 3 x $125 member = $300 -> $50.
  const m300 = await mkMember('member300@t.local', '(707) 555-0130');
  const sub300 = await req2('POST', '/api/stripe/homecare-subscribe', { token: m300.token, body: {} });
  await mockActivate(sub300.j.subscriptionId);
  await req2('POST', '/api/stripe/homecare-confirm', { token: m300.token, body: {} });
  const cart300 = await req2('POST', '/api/admin/carts', { token: A79, body: { items: [{ serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 3, unitPrice: 125 }] } });
  const co300 = await req2('POST', '/api/carts/' + cart300.j.cart.id + '/checkout', { body: { name: 'Member 300', phone: '7075550130', email: 'member300@t.local', address: '3 Tier St', city: 'Fairfield', when: 'Today' } });
  t("v79 deposit law: Gabriel's example — 3 x $125 as MEMBER = $300 final total -> $50 flat deposit (not 40% of $375)", co300.status === 200 && co300.j.memberApplied === true && co300.j.total === 300 && co300.j.amount === 50 && co300.j.balance === 250);
  // estimate rails use the same helper: a $250 estimate books at $50
  const bk79 = await req2('POST', '/api/signup', { body: { name: 'Est Law', email: 'estlaw@t.local', password: 'password123', phone: '7075550131', role: 'customer' } });
  const rq79 = await req2('POST', '/api/requests', { token: bk79.j.token, body: { service: 'Faucet Replacement', description: 'drips', address: '5 Law St', city: 'Fairfield', when: 'Tomorrow', estimateType: 'inperson' } });
  const pe79 = await req2('PATCH', '/api/requests/' + rq79.j.request.id, { token: A79, body: { estimate: { items: [{ description: 'Big labor', qty: 1, unitPrice: 250, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null } } });
  t('v79 deposit law: a $250 estimate books at $50 (same shared helper)', pe79.status === 200 && pe79.j.request.estimate.bookingDue === 50 && pe79.j.request.estimate.balanceDue === 200);

  // --- PIEZA 8: the self-serve cart books at the deposit + collects its balance ---
  const tvOnly = [{ serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, addons: [] }];
  const coB = await req2('POST', '/api/cart/checkout', { body: { name: 'Balance Bea', email: 'balance@t.local', phone: '7075550132', password: 'balance12', address: '9 Bal St', city: 'Fairfield', when: 'Today', items: tvOnly } });
  t('v79 cart checkout: the pay step prices the DEPOSIT ($125 -> $50 today, $75 balance)', coB.status === 200 && coB.j.totals.due === 125 && coB.j.totals.deposit === 50 && coB.j.totals.balance === 75);
  const balTok = (await req2('POST', '/api/login', { body: { email: 'balance@t.local', password: 'balance12' } })).j.token;
  await mockPiStatus(coB.j.paymentIntentId, 'succeeded');
  const confB = await req2('POST', '/api/cart/checkout-confirm', { token: balTok, body: { checkoutId: coB.j.checkoutId, paymentIntentId: coB.j.paymentIntentId } });
  const ordB = (await admReqs79()).find(r => r.id === (confB.j && confB.j.requestId));
  t('v79 cart checkout: the order is born in DEPOSIT state ($50 of $125, balance $75) — NOT paid in full', confB.status === 200 && !!ordB && ordB.payment.status === 'deposit' && ordB.payment.amountCents === 5000 && ordB.payment.balanceCents === 7500 && ordB.payment.totalCents === 12500);
  const payB = await req2('POST', '/api/orders/pay', { token: balTok, body: { requestId: ordB.id } });
  t('v79 balance path: /api/orders/pay on a DEPOSIT order charges ONLY the balance ($75)', payB.status === 200 && payB.j.amount === 75 && !!payB.j.clientSecret);
  await mockPiStatus(payB.j.paymentIntentId, 'succeeded');
  const confBal = await req2('POST', '/api/orders/pay-confirm', { token: balTok, body: { requestId: ordB.id, paymentIntentId: payB.j.paymentIntentId } });
  const ordB2 = (await admReqs79()).find(r => r.id === ordB.id);
  t('v79 balance path: pay-confirm flips DEPOSIT -> PAID IN FULL keeping both legs ($50 deposit + $75 balance = $125)', confBal.status === 200 && !!ordB2 && ordB2.payment.status === 'paid' && ordB2.payment.amountCents === 12500 && ordB2.payment.depositCents === 5000 && ordB2.payment.balancePi === payB.j.paymentIntentId);

  // --- P0-1: the captain never sees the customer's charged total ---
  const capSlice = serverSrc.slice(serverSrc.indexOf("p === '/api/me/captain'"), serverSrc.indexOf("p === '/api/me/captain'") + 1600);
  t('v79 P0-1 static: captain notification names only the override; /api/me/captain entries carry NO charged total', serverSrc.includes('Captain override accrued:') && !serverSrc.includes('of the job total charged') && !capSlice.includes('charged:'));
  // --- P0-2: role enforcement, server side ---
  const w79 = await req2('POST', '/api/signup', { body: { name: 'Worker 79', email: 'w79@t.local', phone: '(707) 555-0133', password: 'workpass79', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
  const wTok79 = w79.j.token;
  const openCart79 = await req2('POST', '/api/admin/carts', { token: A79, body: { items: [{ serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, unitPrice: 125 }] } });
  const cid79 = openCart79.j.cart.id;
  const wCartPage = await fetch(BASE2 + '/cart/' + cid79, { headers: { Authorization: 'Bearer ' + wTok79 } });
  const wCartHtml = await wCartPage.text();
  t('v79 P0-2: a WORKER session opening a cart link gets the themed refusal (403), never the customer prices', wCartPage.status === 403 && wCartHtml.includes('technician door'));
  const wPay = await req2('POST', '/api/carts/' + cid79 + '/checkout', { token: wTok79, body: { name: 'W', phone: '1', email: 'w79@t.local', address: 'x', city: 'Fairfield', when: 'Today' } });
  t('v79 P0-2: a WORKER session cannot run a cart payment endpoint (403 WORKER_BLOCKED)', wPay.status === 403 && wPay.j.code === 'WORKER_BLOCKED');
  const gCartPage = await fetch(BASE2 + '/cart/' + cid79);
  t('v79 P0-2: a GUEST with the link still walks through the customer door (200)', gCartPage.status === 200);
  const wEstPage = await fetch(BASE2 + '/estimate/' + rq79.j.request.id, { headers: { Authorization: 'Bearer ' + wTok79 } });
  t('v79 P0-2: a WORKER session opening an estimate link is refused too (403)', wEstPage.status === 403);
  const gEstPage = await fetch(BASE2 + '/estimate/' + rq79.j.request.id);
  t('v79 P0-2: a GUEST with the estimate link still passes (200)', gEstPage.status === 200);
  t('v79 P0-2 static: the SPA route guard exists (worker on #order/#memberships/#cart -> #worker + note)', htmlSrc.includes("me.role === 'worker' && (isOrderRoute() || isMembershipRoute() || isCartRoute())") && htmlSrc.includes('id="roleNote"'));

  // --- P0-5 / P0-6 statics ---
  const rd79 = (f) => fs.readFileSync(path.join(APP_DIR, '..', f), 'utf8');
  t('v79 P0-5: service/checkout/tracking are themed redirects to the app (no demo checkout, no pay-when-done)', ['service.html', 'checkout.html', 'tracking.html'].every(f => { const c = rd79(f); return c.includes('http-equiv="refresh"') && c.includes('https://app.generalhandymans.app/') && !c.includes('Pay when') && !c.includes('bigPrice'); }));
  t('v79 P0-6: the in-app Terms state the deposit law; the old paid-in-full-to-book model is gone; clause 10 untouched', htmlSrc.includes('$50 flat on jobs up to $300') && htmlSrc.includes('40% of the total on jobs over $300') && !htmlSrc.includes('paid in full to book') && !htmlSrc.includes('Pay in full when you book') && htmlSrc.includes('We never share your phone number with a technician'));

  // --- P0-7: acquisition source persists (signup -> first order -> summary) ---
  const su79 = await req2('POST', '/api/signup', { body: { name: 'Source Sue', email: 'source@t.local', password: 'password123', phone: '7075550134', role: 'customer', source: 'meta_ads_oct' } });
  const rqS = await req2('POST', '/api/requests', { token: su79.j.token, body: { service: 'Carpentry', description: 'door', address: '1 Src St', city: 'Fairfield', when: 'Today', estimateType: 'inperson', source: 'should_not_win' } });
  const sum79 = await req2('GET', '/api/admin/source-summary', { token: A79 });
  const row79 = (sum79.j.rows || []).find(r => r.source === 'meta_ads_oct');
  t('v79 P0-7: source stamps at signup, the FIRST touch wins over a later request source, and the order counts under it', su79.status === 201 && rqS.status === 201 && sum79.status === 200 && !!row79 && row79.customers >= 1 && row79.orders >= 1);
  const suUtm = await req2('POST', '/api/signup', { body: { name: 'Utm Uli', email: 'utm@t.local', password: 'password123', phone: '7075550135', role: 'customer', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'fall' } });
  const sum79b = await req2('GET', '/api/admin/source-summary', { token: A79 });
  t('v79 P0-7: utm params fold into the source (google_cpc_fall)', suUtm.status === 201 && (sum79b.j.rows || []).some(r => r.source === 'google_cpc_fall'));
  const sumCust = await req2('GET', '/api/admin/source-summary', { token: su79.j.token });
  t('v79 P0-7: the source summary is admin-only', sumCust.status === 403);

  // --- PROPUESTAS EN LA CUENTA ---
  const propSu = await req2('POST', '/api/signup', { body: { name: 'Prop Paula', email: 'prop@t.local', password: 'password123', phone: '7075550136', role: 'customer' } });
  const propTok = propSu.j.token;
  const propCart = await req2('POST', '/api/admin/carts', { token: A79, body: { items: [{ serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, unitPrice: 125 }], customerName: 'Prop Paula', customerEmail: 'prop@t.local' } });
  const propCid = propCart.j.cart.id;
  const props1 = await req2('GET', '/api/me/proposals', { token: propTok });
  const pc1 = (props1.j.proposals || []).find(x => x.id === propCid);
  t('v79 proposals: a Gabriel cart addressed to the account email appears INSIDE the account (same object, deposit $50 / balance $75)', props1.status === 200 && !!pc1 && pc1.kind === 'cart' && pc1.state === 'open' && pc1.total === 125 && pc1.depositDue === 50 && pc1.balanceDue === 75 && pc1.url === '/cart/' + propCid);
  const sv1 = await req2('POST', '/api/me/proposals/cart/' + propCid + '/save-later', { token: propTok, body: { saved: true } });
  const props2 = await req2('GET', '/api/me/proposals', { token: propTok });
  const pc2 = (props2.j.proposals || []).find(x => x.id === propCid);
  t('v79 proposals: Save for later parks the proposal in the account (still visible, saved state)', sv1.status === 200 && !!pc2 && pc2.saved === true && pc2.state === 'open');
  const otherSu = await req2('POST', '/api/signup', { body: { name: 'Other Otto', email: 'other@t.local', password: 'password123', phone: '7075550137', role: 'customer' } });
  const propsOther = await req2('GET', '/api/me/proposals', { token: otherSu.j.token });
  const svOther = await req2('POST', '/api/me/proposals/cart/' + propCid + '/save-later', { token: otherSu.j.token, body: { saved: true } });
  t("v79 proposals: another customer's account sees NONE of Paula's proposals and cannot park them (404)", (propsOther.j.proposals || []).length === 0 && svOther.status === 404);
  const coP = await req2('POST', '/api/carts/' + propCid + '/checkout', { body: { name: 'Prop Paula', phone: '7075550136', email: 'prop@t.local', address: '7 Prop St', city: 'Fairfield', when: 'Today' } });
  const sessP = sessionForCart(propCid, 'payment');
  await mockSessionPaid(sessP.id);
  await fetch(BASE2 + '/cart/' + propCid + '?paid=1&session_id=' + sessP.id);
  const props3 = await req2('GET', '/api/me/proposals', { token: propTok });
  const pc3 = (props3.j.proposals || []).find(x => x.id === propCid);
  t('v79 proposals: paying through the LINK flips the in-account proposal to BOOKED with the same balance (one object, two views)', !!pc3 && pc3.state === 'booked' && pc3.balanceDue === 75);
  const rqP = await req2('POST', '/api/requests', { token: propTok, body: { service: 'Plumbing', description: 'leak', address: '7 Prop St', city: 'Fairfield', when: 'Today', estimateType: 'inperson' } });
  await req2('PATCH', '/api/requests/' + rqP.j.request.id, { token: A79, body: { estimate: { items: [{ description: 'Pipe labor', qty: 1, unitPrice: 200, type: 'labor' }], asap: false, discountPct: 0, credit: 0, bookingDue: null }, sendEmail: true } });
  const props4 = await req2('GET', '/api/me/proposals', { token: propTok });
  const pe4 = (props4.j.proposals || []).find(x => x.kind === 'estimate' && x.id === rqP.j.request.id);
  t('v79 proposals: a sent estimate appears in the account too (deposit = its bookingDue, $50 under the law)', !!pe4 && pe4.depositDue === 50 && pe4.balanceDue === 150 && pe4.url === '/estimate/' + rqP.j.request.id);

  // --- Legacy #order retirement statics ---
  t('v79 #order: the legacy page is GONE (no orderBox, no submitOrder, no orderState) and the route converts to the cart', !htmlSrc.includes('id="orderBox"') && !htmlSrc.includes('function submitOrder') && !htmlSrc.includes('orderState') && htmlSrc.includes('function retireOrderRoute()') && htmlSrc.includes('function orderNow(id)') && htmlSrc.includes('function orderNow(id)'));
  t('v79 #order: the server payment rails for in-app balances survive (/api/orders/pay + pay-confirm)', serverSrc.includes("p === '/api/orders/pay'") && serverSrc.includes("p === '/api/orders/pay-confirm'") && serverSrc.includes('function settleRequestBalance('));
}

// ---------------- v80 CONVERSIÓN: targets, claim, honest states, locale, ASAP fee, recovery plumbing, Stripe loader ----------------
t('static v80-7A: the stale full-pay sentence is GONE from the SPA cart checkout card + the server — the card now states the deposit law', !htmlSrc.includes('You pay the full total today') && !serverSrc.includes('You pay the full total today') && htmlSrc.includes('You pay only the <b>booking deposit</b> today') && htmlSrc.includes('$50 flat</b> on totals up to $300'));
t('static v80-1: notifications carry structured targets end to end (server stores + returns target, push payload url = target, SPA rows tappable with the role guard)', serverSrc.includes('function notify(userId, type, text, target)') && serverSrc.includes("target: typeof target === 'string' ? target.slice(0, 200) : ''") && serverSrc.includes("url: (typeof target === 'string' && target) ? target : '/'") && htmlSrc.includes('function notifGo(') && htmlSrc.includes('function routeNotifHash()') && htmlSrc.includes('function notifTargetFor(') && htmlSrc.includes("me.role === 'worker'") && htmlSrc.includes('id="reqcard-') && htmlSrc.includes('id="wjobcard-'));
t('static v80-2: the orphan claim is email-exact, audited and hooked at signup + login + cart-checkout account birth', serverSrc.includes('function claimOrphanRecords(u)') && serverSrc.includes("audit(u, 'account.claim_orphans'") && serverSrc.includes('claimOrphanRecords(u);') && serverSrc.includes('guest history under this email becomes theirs at signup') && serverSrc.includes('also at login — covers accounts created before the claim existed') && serverSrc.includes('an account born at checkout claims the guest history'));
t('static v80-3: honest async states — the shared loading/error pattern serves requests, jobs, invoices, proposals and the worker job list', htmlSrc.includes('function listLoadingHtml(') && htmlSrc.includes('function listErrorHtml(') && htmlSrc.includes("listErrorHtml('loadRequests()'") && htmlSrc.includes("listErrorHtml('loadMyJobs()'") && htmlSrc.includes("listErrorHtml('loadMyInvoices()'") && htmlSrc.includes("listErrorHtml('loadProposals()'") && htmlSrc.includes("listErrorHtml('loadJobs()'") && (() => { const s = htmlSrc.indexOf('async function loadRequests()'); const seg = htmlSrc.slice(s, s + 1200); return seg.includes('listLoadingHtml(') && !seg.includes('.catch('); })());
t('static v80-4: hosted checkout always carries an explicit locale + localized custom_text (never auto)', serverSrc.includes('function checkoutLang(opts)') && serverSrc.includes('params.locale = coLang') && serverSrc.includes("custom_text[submit][message]") && serverSrc.includes('Tu primer mes es GRATIS') && serverSrc.includes('retención de autorización'));
t('static v80-5: wzFee has NO ASAP uplift left (no when-read, no 1.25) — the fee is flat 75/50/0', (() => { const s0 = htmlSrc.indexOf('function wzFee()'); const s = htmlSrc.slice(s0, htmlSrc.indexOf('\n}', s0)); return !s.includes('1.25') && !s.includes('cWhen') && s.includes('due: base'); })());
t('static v80-6: recovery plumbing exists and the whole recovery section NEVER sends mail or fires automations (STOP TOTAL)', serverSrc.includes("p === '/api/cart/save-recovery'") && serverSrc.includes("p === '/api/me/recoverable-cart'") && serverSrc.includes('function upsertRecoverableCart(') && (() => { const segA = serverSrc.slice(serverSrc.indexOf('// ---------- v80 A-7: recoverable-cart store'), serverSrc.indexOf('// Recorder for a landed DEPOSIT')); const segB = serverSrc.slice(serverSrc.indexOf('// ---------- v80 A-7 PLUMBING ONLY'), serverSrc.indexOf('// ---------- v78: guest cart + EMBEDDED checkout')); const seg = segA + segB; return segA.length > 500 && segB.length > 500 && !seg.includes('sendMail(') && !seg.includes('fireAutomation(') && !seg.includes('setInterval('); })());
t('static v80-7B: the cart loads Stripe.js through the resilient injector and reserves the house message for a genuinely unconfigured server', htmlSrc.includes('function loadStripeJsOnce(') && htmlSrc.includes('https://js.stripe.com/v3/') && htmlSrc.includes("cartStripeState = 'unconfigured'") && htmlSrc.includes('function cartRetryStripe()') && htmlSrc.includes('Loading secure payment… · Cargando pago seguro…'));
{
  const A80 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;

  // --- PIECE 2: orphan history claimed by exact email ---
  const invOrph = await req2('POST', '/api/admin/invoices', { token: A80, body: { customerName: 'Claim Carla', customerEmail: 'claim1@t.local', items: [{ description: 'Labor', qty: 1, unitPrice: 150 }] } });
  const anonReq = await req2('POST', '/api/requests', { body: { customerName: 'Claim Carla', customerEmail: 'claim1@t.local', customerPhone: '(707) 555-0111', service: 'Plumbing', description: 'leak under sink', city: 'Fairfield', address: '9 Pine St', when: 'Tomorrow', estimateType: 'photo' } });
  const anonOther = await req2('POST', '/api/requests', { body: { customerName: 'Other Otto', customerEmail: 'claim3@t.local', customerPhone: '(707) 555-0133', service: 'Carpentry', description: 'deck', city: 'Fairfield', address: '3 Elm St', when: 'Friday', estimateType: 'photo' } });
  const cartOrph = await req2('POST', '/api/admin/carts', { token: A80, body: { customerName: 'Claim Carla', customerEmail: 'claim1@t.local', items: [{ serviceId: 'faucet-repair', name: 'Faucet Repair', qty: 1, unitPrice: 125 }] } });
  const suClaim = await req2('POST', '/api/signup', { body: { name: 'Claim Carla', email: 'claim1@t.local', password: 'claimpass1', role: 'customer' } });
  const claimedReqs = await req2('GET', '/api/requests', { token: suClaim.j.token });
  t('v80 claim: signup claims the anonymous request whose email EXACTLY matches (and not another email\'s)', claimedReqs.j.requests.some(r => r.id === anonReq.j.request.id) && !claimedReqs.j.requests.some(r => r.id === anonOther.j.request.id));
  const claimedInvs = await req2('GET', '/api/invoices/mine', { token: suClaim.j.token });
  t('v80 claim: the orphan invoice under the same email lands in the new account', claimedInvs.j.invoices.some(i => i.id === invOrph.j.invoice.id));
  const claimedProps = await req2('GET', '/api/me/proposals', { token: suClaim.j.token });
  t('v80 claim: Gabriel\'s cart for that email is claimed into the account proposals', claimedProps.j.proposals.some(p => p.id === cartOrph.j.cart.id));
  const audClaim = await req2('GET', '/api/admin/audit', { token: A80 });
  t('v80 claim: the claim is written to the activity log', (audClaim.j.entries || []).some(e => e.action === 'account.claim_orphans' && e.actorId === suClaim.j.user.id));
  // LOGIN path: a Gabriel cart issued to an EXISTING account's email is
  // only email-matched at read time — the login hook is what claims it
  // into the account, and the audit entry (written ONLY when something
  // was actually claimed; this cart is Leo's only orphan) proves it.
  const suClaim2 = await req2('POST', '/api/signup', { body: { name: 'Claim Leo', email: 'claim2@t.local', password: 'claimpass2', role: 'customer' } });
  const cartOrph2 = await req2('POST', '/api/admin/carts', { token: A80, body: { customerName: 'Claim Leo', customerEmail: 'claim2@t.local', items: [{ serviceId: 'faucet-repair', name: 'Faucet Repair', qty: 1, unitPrice: 125 }] } });
  const login2 = await req2('POST', '/api/login', { body: { email: 'claim2@t.local', password: 'claimpass2' } });
  const audLogin80 = await req2('GET', '/api/admin/audit', { token: A80 });
  const propsLeo = await req2('GET', '/api/me/proposals', { token: login2.j.token });
  t('v80 claim: LOGIN claims the matching Gabriel cart into the account (audit entry + proposal visible)', login2.status === 200 && cartOrph2.j.cart && (audLogin80.j.entries || []).some(e => e.action === 'account.claim_orphans' && e.actorId === suClaim2.j.user.id) && propsLeo.j.proposals.some(p => p.id === cartOrph2.j.cart.id));

  // --- PIECE 1: notification targets, in-app + worker side ---
  const suNotif = await req2('POST', '/api/signup', { body: { name: 'Notif Nadia', email: 'notif@t.local', password: 'notifpass1', role: 'customer' } });
  const rqNotif = await req2('POST', '/api/requests', { token: suNotif.j.token, body: { service: 'Faucet repair', description: 'drips', city: 'Fairfield', estimateType: 'photo' } });
  await req2('PATCH', '/api/requests/' + rqNotif.j.request.id, { token: A80, body: { estimate: { items: [{ description: 'Faucet swap — labor', qty: 1, unitPrice: 125, type: 'labor' }] } } });
  const notifsC = await req2('GET', '/api/notifications', { token: suNotif.j.token });
  t('v80 targets: the estimate notification carries the exact target /estimate/<id>', notifsC.j.notifications.some(n => n.target === '/estimate/' + rqNotif.j.request.id));
  const suWork = await req2('POST', '/api/signup', { body: { name: 'Worker Wally', email: 'wally@t.local', phone: '(707) 555-0144', password: 'wallypass1', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
  await req2('PATCH', '/api/workers/' + suWork.j.user.id, { token: A80, body: { status: 'active' } });
  const jobW = await req2('POST', '/api/jobs', { token: A80, body: { service: 'Gate fix', city: 'Fairfield', when: 'Today', payOffer: 100, customerPrice: 150, customerName: 'Some Customer', customerPhone: '(707) 555-0999', address: '7 Elm St, Fairfield, CA', assignedWorkerId: suWork.j.user.id, silent: true } });
  const notifsW = await req2('GET', '/api/notifications', { token: suWork.j.token });
  t('v80 targets: the assigned worker\'s notification targets his own job card (#wjob=<id>)', jobW.status === 201 && notifsW.j.notifications.some(n => n.target === '#wjob=' + jobW.j.job.id));

  // --- PIECE 5 (server side): ASAP never inflates the estimate fee ---
  const asapRq = await req2('POST', '/api/requests', { token: suNotif.j.token, body: { service: 'Plumbing', description: 'burst pipe', city: 'Fairfield', when: 'ASAP / Emergency', estimateType: 'inperson' } });
  t('v80 P1-7: an ASAP in-person request still carries the FLAT $75 estimate fee server-side', asapRq.j.request.estimateDue === 75);

  // --- PIECE 4: locale + custom_text on hosted sessions ---
  const cartLang = await req2('POST', '/api/admin/carts', { token: A80, body: { customerName: 'Lang Luisa', customerEmail: 'lang@t.local', items: [{ serviceId: 'faucet-repair', name: 'Faucet Repair', qty: 1, unitPrice: 125 }] } });
  const coLang = await req2('POST', '/api/carts/' + cartLang.j.cart.id + '/checkout', { body: { name: 'Lang Luisa', phone: '7075550123', email: 'lang@t.local', address: '1 Main St', city: 'Fairfield', when: 'Today', lang: 'es' } });
  const sessLang = sessionForCart(cartLang.j.cart.id, 'payment');
  t('v80 locale: the ES cart checkout session carries locale es + the ES pay submit text (amount untouched: $50 deposit on $125)', coLang.status === 200 && sessLang && sessLang.locale === 'es' && sessLang.customText.submit.includes('Esto cobra tu tarjeta por el monto mostrado') && sessLang.amount_total === 5000);
  const cartLangEn = await req2('POST', '/api/admin/carts', { token: A80, body: { customerName: 'Lang Larry', customerEmail: 'langen@t.local', items: [{ serviceId: 'faucet-repair', name: 'Faucet Repair', qty: 1, unitPrice: 125 }] } });
  await req2('POST', '/api/carts/' + cartLangEn.j.cart.id + '/checkout', { body: { name: 'Lang Larry', phone: '7075550124', email: 'langen@t.local', address: '2 Main St', city: 'Fairfield', when: 'Today' } });
  const sessLangEn = sessionForCart(cartLangEn.j.cart.id, 'payment');
  t('v80 locale: no page language -> explicit locale en (never auto) + EN submit text', sessLangEn && sessLangEn.locale === 'en' && sessLangEn.customText.submit.includes('This charges your card for the amount shown'));
  const suJoin = await req2('POST', '/api/signup', { body: { name: 'Join Juan', email: 'joinjuan@t.local', password: 'juanpass12', role: 'customer' } });
  const joinEs = await req2('POST', '/api/stripe/checkout', { token: suJoin.j.token, body: { kind: 'homecare', lang: 'es' } });
  const sessJoin = Object.values(stripeState.sessions).slice(-1)[0];
  t('v80 locale: the ES HomeCare join session is a TRIAL session with the ES free-month submit text', joinEs.status === 200 && sessJoin && sessJoin.mode === 'subscription' && sessJoin.locale === 'es' && sessJoin.customText.submit.includes('Tu primer mes es GRATIS') && sessJoin.amount_total === 0);
  const suHold = await req2('POST', '/api/signup', { body: { name: 'Hold Hugo', email: 'holdhugo@t.local', password: 'hugopass12', role: 'customer' } });
  const rqHold = await req2('POST', '/api/requests', { token: suHold.j.token, body: { service: 'Deck repair', description: 'boards', city: 'Fairfield', estimateType: 'inperson' } });
  const holdEs = await req2('POST', '/api/stripe/checkout', { token: suHold.j.token, body: { kind: 'estimate-hold', requestId: rqHold.j.request.id, lang: 'es' } });
  const sessHold = Object.values(stripeState.sessions).slice(-1)[0];
  t('v80 locale: the ES estimate-hold session localizes the authorization text (existing deposit hold copy, now in ES)', holdEs.status === 200 && sessHold && sessHold.metadata.kind === 'estimate-hold' && sessHold.locale === 'es' && sessHold.customText.submit.includes('Esto coloca una retención de autorización'));
  const invLoc = await req2('POST', '/api/admin/invoices', { token: A80, body: { customerName: 'Lang Luisa', customerEmail: 'lang@t.local', items: [{ description: 'Labor', qty: 1, unitPrice: 200 }] } });
  await req2('POST', '/api/invoices/' + invLoc.j.invoice.id + '/pay', { body: { lang: 'es' } });
  const sessInv = Object.values(stripeState.sessions).slice(-1)[0];
  t('v80 locale: the invoice pay session carries locale es + the ES pay text', sessInv && sessInv.locale === 'es' && sessInv.customText.submit.includes('Esto cobra tu tarjeta por el monto mostrado'));

  // --- PIECE 6: recoverable-cart plumbing (NOTHING is sent) ---
  const emailsBefore80 = (await mockEmails()).length;
  const sv1 = await req2('POST', '/api/cart/save-recovery', { body: { email: 'rec@t.local', items: [{ serviceId: 'faucet-replacement', qty: 2 }, { serviceId: 'closet-doors', qty: 1 }] } });
  t('v80 recovery: a guest snapshot is stored and returns a token + the /#cart-recover= restore path', sv1.status === 200 && !!sv1.j.token && sv1.j.restorePath === '/#cart-recover=' + sv1.j.token);
  t('v80 recovery: the expiry is ~30 days out', Math.abs(new Date(sv1.j.expiresAt).getTime() - Date.now() - 30 * 864e5) < 3600e3);
  const got1 = await req2('GET', '/api/cart/recovery/' + sv1.j.token);
  t('v80 recovery: the token restores the EXACT cart snapshot (ids, quantities, addons)', got1.status === 200 && JSON.stringify(got1.j.items) === JSON.stringify([{ id: 'faucet-replacement', q: 2, x: [] }, { id: 'closet-doors', q: 1, x: [] }]));
  const sv2 = await req2('POST', '/api/cart/save-recovery', { body: { email: 'rec@t.local', items: [{ serviceId: 'faucet-replacement', qty: 1 }] } });
  const gotOld = await req2('GET', '/api/cart/recovery/' + sv1.j.token);
  const gotNew = await req2('GET', '/api/cart/recovery/' + sv2.j.token);
  t('v80 recovery: a fresher save REPLACES the snapshot and rotates the token (old link dies)', sv2.j.token !== sv1.j.token && gotOld.status === 404 && gotNew.status === 200 && gotNew.j.items.length === 1);
  const suRec = await req2('POST', '/api/signup', { body: { name: 'Rec Rita', email: 'rec@t.local', password: 'recpass123', role: 'customer' } });
  const mineRec = await req2('GET', '/api/me/recoverable-cart', { token: suRec.j.token });
  t('v80 recovery: the account surface finds the snapshot by session email — and never leaks the token', mineRec.j.cart && mineRec.j.cart.items.length === 1 && !JSON.stringify(mineRec.j).includes(sv2.j.token));
  const badRec = await req2('POST', '/api/cart/save-recovery', { body: { email: 'rec@t.local', items: [{ serviceId: 'not-a-service', qty: 1 }] } });
  const emailsAfter80 = (await mockEmails()).length;
  t('v80 recovery: an invalid snapshot is refused, and the WHOLE flow sent ZERO emails (STOP TOTAL)', badRec.status === 400 && emailsAfter80 === emailsBefore80);
}

{
  // PIECE 1, push half: the encrypted Web Push payload itself must carry
  // the target (v66 mock pattern, port 8982).
  const cap80 = [];
  const pushMock80 = http.createServer((rq, rs) => { const chunks = []; rq.on('data', c => chunks.push(c)); rq.on('end', () => { cap80.push({ headers: rq.headers, body: Buffer.concat(chunks) }); rs.writeHead(201); rs.end('{}'); }); });
  await new Promise(r => pushMock80.listen(8982, r));
  const ua80 = nodeCrypto.createECDH('prime256v1'); ua80.generateKeys();
  const uaPub80 = ua80.getPublicKey(); const auth80 = nodeCrypto.randomBytes(16);
  const sub80 = { endpoint: 'http://127.0.0.1:8982/push/v80', keys: { p256dh: uaPub80.toString('base64url'), auth: auth80.toString('base64url') } };
  const decrypt80 = (cap) => {
    const salt = cap.body.subarray(0, 16), idLen = cap.body[20], asPub = cap.body.subarray(21, 21 + idLen), ct = cap.body.subarray(21 + idLen);
    const secret = ua80.computeSecret(asPub);
    const prkKey = nodeCrypto.createHmac('sha256', auth80).update(secret).digest();
    const ikm = nodeCrypto.createHmac('sha256', prkKey).update(Buffer.concat([Buffer.from('WebPush: info\0'), uaPub80, asPub, Buffer.from([1])])).digest().subarray(0, 32);
    const prk = nodeCrypto.createHmac('sha256', salt).update(ikm).digest();
    const exp = (info, len) => nodeCrypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
    const decipher = nodeCrypto.createDecipheriv('aes-128-gcm', exp(Buffer.from('Content-Encoding: aes128gcm\0'), 16), exp(Buffer.from('Content-Encoding: nonce\0'), 12));
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString('utf8');
  };
  const suPush80 = await req2('POST', '/api/signup', { body: { name: 'Push Pia', email: 'push80@t.local', password: 'pushpass80', role: 'customer' } });
  await req2('POST', '/api/push/subscribe', { token: suPush80.j.token, body: { subscription: sub80 } });
  const rqPush80 = await req2('POST', '/api/requests', { token: suPush80.j.token, body: { service: 'Faucet repair', description: 'drips', city: 'Fairfield', estimateType: 'photo' } });
  const A80b = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
  await req2('PATCH', '/api/requests/' + rqPush80.j.request.id, { token: A80b, body: { estimate: { items: [{ description: 'Labor', qty: 1, unitPrice: 125, type: 'labor' }] } } });
  let plain80 = '';
  for (let i = 0; i < 30; i++) { if (cap80.length >= 2) { plain80 = decrypt80(cap80[cap80.length - 1]); if (plain80.includes('/estimate/')) break; } await sleep(150); }
  t('v80 targets: the Web Push payload for the estimate lands on /estimate/<id>, not the app root', plain80.includes('"url":"/estimate/' + rqPush80.j.request.id + '"'));
  try { pushMock80.close(); } catch (e) {}
}
{
  // VM: notification target guard + wzFee + the honest error card.
  t('v80 VM targets: a worker session is NEVER routed to a customer surface; legacy invoice text still resolves', run("me={role:'worker'}; notifTargetFor({target:'#req=GHS-1'})") === '#worker' && run("me={role:'customer'}; notifTargetFor({target:'#req=GHS-1'})") === '#req=GHS-1' && run("notifTargetFor({text:'Invoice ready: /invoice/INV-9 pay'})") === '/invoice/INV-9' && run("me=null; typeof routeNotifHash") === 'function');
  run("me=null; wzState.est='inperson'; wzState.when='ASAP / Emergency';");
  const feeGuest80 = JSON.parse(run('JSON.stringify(wzFee())'));
  run("me={role:'customer', homeCareStatus:'active', freeEstimateUsed:true};");
  const feeMember80 = JSON.parse(run('JSON.stringify(wzFee())'));
  run('me=null;');
  t('v80 VM P1-7: wzFee under ASAP — guest $75, member $50, and NO ASAP text in the fee label', feeGuest80.due === 75 && feeMember80.due === 50 && !feeGuest80.label.includes('ASAP') && !feeMember80.label.includes('ASAP'));
  t('v80 VM P1-2: the shared error card carries its Retry button wired to the loader', run("listErrorHtml('loadRequests()')").includes('loadRequests()') && run("listErrorHtml('loadRequests()')").includes('Retry'));
}
{
  // VM PIECE 7B: Gabriel's phone scenario, replayed — Stripe.js blocked
  // on first load, fine on retry; then the genuinely-unconfigured case;
  // then a hard failure with recovery through the Try again button.
  const stripeFactoryRef = sandbox.Stripe;
  resetStripeState(); stripeCfgMode = 'ok'; sandbox.fetch = v78Fetch; v78JoinArmed = false;
  run("stripeObj=null; cartStripeState='idle'; cartBusy=false; me=null; location.hash=''; localStorage.setItem('ghsCart','[]'); cartAdd('tv-mounting');");
  el('ccName').value = 'Retry Ana'; el('ccEmail').value = 'retry@t.local'; el('ccPhone').value = '7075550100'; el('ccPass').value = 'retrypass1';
  el('ccAddress').value = '5 Oak St'; el('ccCity').value = 'Fairfield'; el('ccWhenText').value = ''; el('ccNotes').value = '';
  let scriptTries = 0;
  const origCreate80 = sandbox.document.createElement;
  sandbox.document.createElement = function (tag) { const e = origCreate80(tag); if (tag === 'script') { scriptTries++; const n = scriptTries; setTimeout(function () { if (n === 1) { if (e.onerror) e.onerror(); } else { sandbox.Stripe = stripeFactoryRef; if (e.onload) e.onload(); } }, 5); } return e; };
  sandbox.Stripe = undefined;
  const peBefore80 = v78PeCreates;
  await run('cartPrepare()');
  t('v80 7B: Stripe.js fails once, the loader retries, and the Payment Element still mounts (no false "not connected")', scriptTries >= 2 && run('cartStripeState') === 'ready' && v78PeCreates > peBefore80 && (el('cartPayBtn').textContent || '').includes('Pay $'));
  sandbox.document.createElement = origCreate80;
  stripeCfgMode = 'empty'; resetStripeState();
  run('cartResetCheckout(); stripeObj=null;');
  await run('cartPrepare()');
  t('v80 7B: an empty server key is the ONLY path to the "still being connected" house message', run('cartStripeState') === 'unconfigured' && (el('cartPayErr').textContent || '').includes('still being connected'));
  stripeCfgMode = 'ok'; resetStripeState();
  sandbox.Stripe = undefined;
  sandbox.document.createElement = function (tag) { const e = origCreate80(tag); if (tag === 'script') setTimeout(function () { if (e.onerror) e.onerror(); }, 5); return e; };
  run('cartResetCheckout(); stripeObj=null;');
  await run('cartPrepare()');
  const failedPainted80 = (el('cartPayElement').innerHTML || '').includes('Try again');
  sandbox.document.createElement = origCreate80;
  sandbox.Stripe = stripeFactoryRef;
  run('cartRetryStripe()');
  for (let i = 0; i < 40 && run('cartStripeState') !== 'ready'; i++) await sleep(100);
  t('v80 7B: a hard Stripe.js failure paints the honest error + Try again (never the house message), and Try again recovers', failedPainted80 && run('cartStripeState') === 'ready');
  run('cartResetCheckout();');
}

// ---------------- v80.1 HOTFIX: SW cross-origin hardening, hosted escape hatch, stage codes ----------------
{
  const A801 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
  const admReqs801 = async () => (await req2('GET', '/api/requests', { token: A801 })).j.requests || [];
  const items801 = [
    { serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, addons: [] },
    { serviceId: 'ceiling-fan', name: 'Ceiling Fan Install', qty: 1, addons: [] }
  ]; // list $250 / member $200 — deposit law: $50 flat at either total
  const whPost801 = async (evt) => {
    const raw = JSON.stringify(evt);
    const ts = Math.floor(Date.now() / 1000);
    const sig = nodeCrypto.createHmac('sha256', 'whsec_mock_test').update(ts + '.' + raw, 'utf8').digest('hex');
    return fetch(BASE2 + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=' + ts + ',v1=' + sig }, body: raw });
  };
  // --- statics ---
  t('static v80.1 SW: cross-origin requests are NEVER intercepted (early return) + cache bumped (v80.7: ghs-app-v80-7)', swSrc.includes('url.origin !== location.origin') && swSrc.includes("const CACHE = 'ghs-app-v80-7'"));
  t('static v80.1 server: hosted endpoints + both session kinds + the shared hosted settle exist', serverSrc.includes("p === '/api/cart/checkout-hosted'") && serverSrc.includes("p === '/api/cart/checkout-hosted-confirm'") && serverSrc.includes("kind === 'cart-checkout-hosted'") && serverSrc.includes("kind === 'cart-checkout-join'") && serverSrc.includes('function settleHostedCartSession('));
  t('static v80.1 SPA: the failure box carries the hosted door + the stage ref (CFG/JS/INIT) and the config fetch has a hard timeout', htmlSrc.includes("api('/api/cart/checkout-hosted'") && htmlSrc.includes('Pagar en la página segura de Stripe') && htmlSrc.includes('cartStripeFailStage') && htmlSrc.includes('ref: ') && htmlSrc.includes('function cartConfigFetch(') && htmlSrc.includes('config timeout'));
  // --- hosted PAY: session for the deposit, NO order before verify, settle via hosted-confirm, exactly once ---
  const hGuest = await req2('POST', '/api/cart/checkout-hosted', { body: { name: 'Hosted Hanna', email: 'hosted@t.local', phone: '7075550140', password: 'hostpass12', address: '7 Host St', city: 'Fairfield', when: 'Today', items: items801 } });
  t('v80.1 hosted pay: a guest gets the hosted session URL + pending checkout (deposit $50 of $250)', hGuest.status === 200 && hGuest.j.hosted === true && !!hGuest.j.url && !!hGuest.j.checkoutId && hGuest.j.totals.deposit === 50 && hGuest.j.totals.due === 250);
  const hSess = Object.values(stripeState.sessions).find(s => s.metadata && s.metadata.checkoutId === hGuest.j.checkoutId);
  t('v80.1 hosted pay: the session is payment-mode for the DEPOSIT amount with kind + checkoutId metadata', !!hSess && hSess.mode === 'payment' && hSess.amount_total === 5000 && hSess.metadata.kind === 'cart-checkout-hosted');
  t('v80.1 P0-4: NO order exists before the hosted payment verifies', (await admReqs801()).filter(r => r.menuOrder && r.menuOrder.checkoutId === hGuest.j.checkoutId).length === 0);
  const hTok = (await req2('POST', '/api/login', { body: { email: 'hosted@t.local', password: 'hostpass12' } })).j.token;
  const hEarly = await req2('POST', '/api/cart/checkout-hosted-confirm', { token: hTok, body: { sessionId: hSess.id } });
  t('v80.1 hosted pay: confirm before Stripe reports paid is refused (400) and still no order', hEarly.status === 400 && (await admReqs801()).filter(r => r.menuOrder && r.menuOrder.checkoutId === hGuest.j.checkoutId).length === 0);
  await mockSessionPaid(hSess.id);
  const hConf = await req2('POST', '/api/cart/checkout-hosted-confirm', { token: hTok, body: { sessionId: hSess.id } });
  const hOrder = (await admReqs801()).find(r => r.id === (hConf.j && hConf.j.requestId));
  t('v80.1 hosted pay: the verified settle births the DEPOSIT order ($50 of $250, $200 balance) — identical to an embedded payment', hConf.status === 200 && !!hOrder && hOrder.payment.status === 'deposit' && hOrder.payment.amountCents === 5000 && hOrder.payment.balanceCents === 20000 && hOrder.menuOrder.totals.due === 250);
  const hConf2 = await req2('POST', '/api/cart/checkout-hosted-confirm', { token: hTok, body: { sessionId: hSess.id } });
  t('v80.1 hosted pay: re-confirm is idempotent (same order, no duplicate)', hConf2.status === 200 && hConf2.j.requestId === hConf.j.requestId && (await admReqs801()).filter(r => r.menuOrder && r.menuOrder.checkoutId === hGuest.j.checkoutId).length === 1);
  await whPost801({ id: 'evt_wh_hosted801', type: 'payment_intent.succeeded', data: { object: { id: hSess.payment_intent, amount: 5000, amount_received: 5000, status: 'succeeded', metadata: { kind: 'cart-checkout-hosted', checkoutId: hGuest.j.checkoutId, userId: hGuest.j.user.id } } } });
  t('v80.1 hosted pay: the payment_intent webhook after settle creates NO duplicate order', (await admReqs801()).filter(r => r.menuOrder && r.menuOrder.checkoutId === hGuest.j.checkoutId).length === 1);
  // --- hosted settle via the SESSION webhook (the return never lands) ---
  const h2 = await req2('POST', '/api/cart/checkout-hosted', { token: hTok, body: { address: '7 Host St', city: 'Fairfield', items: items801 } });
  const h2Sess = Object.values(stripeState.sessions).find(s => s.metadata && s.metadata.checkoutId === h2.j.checkoutId);
  await mockSessionPaid(h2Sess.id);
  const whSRes = await whPost801({ id: 'evt_wh_hsess801', type: 'checkout.session.completed', data: { object: { id: h2Sess.id, mode: 'payment', payment_status: 'paid', amount_total: 5000, payment_intent: h2Sess.payment_intent, customer: 'cus_mock_x', metadata: { kind: 'cart-checkout-hosted', checkoutId: h2.j.checkoutId, userId: hGuest.j.user.id } } } });
  const h2Order = (await admReqs801()).find(r => r.menuOrder && r.menuOrder.checkoutId === h2.j.checkoutId);
  t('v80.1 hosted webhook: checkout.session.completed settles the DEPOSIT order when the hosted return never lands', whSRes.status === 200 && !!h2Order && h2Order.payment.status === 'deposit' && h2Order.payment.amountCents === 5000);
  // --- worker refusal (v79 P0-2 guard family) ---
  const w801 = await req2('POST', '/api/signup', { body: { name: 'Worker 801', email: 'w801@t.local', phone: '(707) 555-0141', password: 'workpass801', role: 'worker', profile: { city: 'Fairfield', areas: 'Fairfield', skills: ['Plumbing'] } } });
  const wHosted = await req2('POST', '/api/cart/checkout-hosted', { token: w801.j.token, body: { address: '1 W St', items: items801 } });
  t('v80.1 hosted: a WORKER session is refused (403 WORKER_BLOCKED)', wHosted.status === 403 && wHosted.j.code === 'WORKER_BLOCKED');
  // --- JOIN, FIRST-CLASS (Gabriel 23:12): ONE session = trial subscription + deposit; settle = membership active + DEPOSIT order at MEMBER totals ---
  const jGuest = await req2('POST', '/api/cart/checkout-hosted', { body: { step: 'join', name: 'Join Joana', email: 'hjoin@t.local', phone: '7075550142', password: 'joinpass801', address: '11 Join St', city: 'Vacaville', items: items801 } });
  t('v80.1 hosted join: step join returns ONE hosted session URL priced at MEMBER totals ($200, deposit $50)', jGuest.status === 200 && jGuest.j.step === 'join' && !!jGuest.j.url && jGuest.j.totals.due === 200 && jGuest.j.totals.deposit === 50);
  const jSess = Object.values(stripeState.sessions).find(s => s.metadata && s.metadata.checkoutId === jGuest.j.checkoutId);
  t('v80.1 hosted join: the session is subscription-mode (plan + deposit in one), trial-aware — freeMonth flagged and amount = deposit only under the v74 trial', !!jSess && jSess.mode === 'subscription' && jSess.metadata.kind === 'cart-checkout-join' && jSess.metadata.plan === 'homecare' && jSess.metadata.freeMonth === '1' && jSess.amount_total === 5000);
  const jTok = (await req2('POST', '/api/login', { body: { email: 'hjoin@t.local', password: 'joinpass801' } })).j.token;
  const jMeBefore = await req2('GET', '/api/me', { token: jTok });
  t('v80.1 hosted join (v74 invariant): BEFORE settle the membership is NOT active and the free month is NOT spent', jMeBefore.j.user.homeCareStatus !== 'active' && jMeBefore.j.user.freeMonthAvailable === true);
  await mockSessionPaid(jSess.id);
  const jConf = await req2('POST', '/api/cart/checkout-hosted-confirm', { token: jTok, body: { sessionId: jSess.id } });
  const jOrder = (await admReqs801()).find(r => r.id === (jConf.j && jConf.j.requestId));
  const jMeAfter = await req2('GET', '/api/me', { token: jTok });
  t('v80.1 hosted join: settle activates HomeCare (free month spent AT activation) AND births the DEPOSIT order at MEMBER totals ($200 — $50 in, $150 balance, joinedMembership)', jConf.status === 200 && jMeAfter.j.user.homeCareStatus === 'active' && jMeAfter.j.user.freeMonthAvailable === false && !!jOrder && jOrder.payment.status === 'deposit' && jOrder.payment.amountCents === 5000 && jOrder.payment.balanceCents === 15000 && jOrder.menuOrder.totals.due === 200 && jOrder.menuOrder.joinedMembership === true);
  // --- supersede across rails: hosted first, then an embedded checkout replaces it ---
  const sGuest = await req2('POST', '/api/cart/checkout-hosted', { body: { name: 'Sup Sue', email: 'sup@t.local', phone: '7075550143', password: 'suppass801', address: '3 Sup St', city: 'Fairfield', items: items801 } });
  const sSess = Object.values(stripeState.sessions).find(s => s.metadata && s.metadata.checkoutId === sGuest.j.checkoutId);
  const sTok = (await req2('POST', '/api/login', { body: { email: 'sup@t.local', password: 'suppass801' } })).j.token;
  const sEmb = await req2('POST', '/api/cart/checkout', { token: sTok, body: { address: '3 Sup St', city: 'Fairfield', items: items801 } });
  t('v80.1 supersede: a newer EMBEDDED checkout expires the earlier hosted session', sEmb.status === 200 && stripeState.sessions[sSess.id].status === 'expired');
  await mockSessionPaid(sSess.id);
  const sConf = await req2('POST', '/api/cart/checkout-hosted-confirm', { token: sTok, body: { sessionId: sSess.id } });
  t('v80.1 supersede: the replaced hosted checkout can never settle (400, no order born)', sConf.status === 400 && (await admReqs801()).filter(r => r.menuOrder && r.menuOrder.checkoutId === sGuest.j.checkoutId).length === 0);
}
{
  // VM: the v80.1 failure instrumentation — every dead stage names
  // itself in the error box (CFG config fetch / JS script load / INIT
  // constructor), and the failure box always carries the hosted door.
  const stripeFactoryRef801 = sandbox.Stripe;
  stripeCfgMode = 'ok';
  run("me=null; location.hash=''; localStorage.setItem('ghsCart','[]'); cartAdd('tv-mounting');");
  el('ccName').value = 'Stage Sara'; el('ccEmail').value = 'stage@t.local'; el('ccPhone').value = '7075550144'; el('ccPass').value = 'stagepass1';
  el('ccAddress').value = '9 Stage St'; el('ccCity').value = 'Fairfield'; el('ccWhenText').value = ''; el('ccNotes').value = '';
  // JS stage: config answers, Stripe.js never loads.
  resetStripeState(); sandbox.Stripe = undefined;
  const origCreate801 = sandbox.document.createElement;
  sandbox.document.createElement = function (tag) { const e = origCreate801(tag); if (tag === 'script') setTimeout(function () { if (e.onerror) e.onerror(); }, 5); return e; };
  await run('cartPrepare()');
  const jsBox = el('cartPayElement').innerHTML || '';
  t('v80.1 VM stages: a dead Stripe.js load paints ref: JS + the hosted door + Try again', run('cartStripeState') === 'failed' && run('cartStripeFailStage') === 'JS' && jsBox.includes('ref: JS') && jsBox.includes("Stripe's secure page") && jsBox.includes('Try again'));
  sandbox.document.createElement = origCreate801;
  // CFG stage: the config endpoint never answers — the hard timeout
  // turns the hang into a CFG failure (this run takes ~20 s of
  // retries; the bisect hang would have been forever).
  resetStripeState(); sandbox.Stripe = stripeFactoryRef801;
  const realFetch801 = sandbox.fetch;
  sandbox.fetch = function (url, opts) { if (url === '/api/stripe/config') return new Promise(function () {}); return realFetch801(url, opts); };
  await run('cartPrepare()');
  const cfgBox = el('cartPayElement').innerHTML || '';
  t('v80.1 VM stages: a STALLED config fetch fails as ref: CFG (timeout, never a hang) with the hosted door', run('cartStripeState') === 'failed' && run('cartStripeFailStage') === 'CFG' && cfgBox.includes('ref: CFG') && cfgBox.includes("Stripe's secure page"));
  sandbox.fetch = realFetch801;
  // INIT stage: script loads, the constructor throws.
  resetStripeState(); sandbox.Stripe = function () { throw new Error('bad key'); };
  await run('cartPrepare()');
  const initBox = el('cartPayElement').innerHTML || '';
  t('v80.1 VM stages: a throwing Stripe() constructor paints ref: INIT', run('cartStripeState') === 'failed' && run('cartStripeFailStage') === 'INIT' && initBox.includes('ref: INIT'));
  sandbox.Stripe = stripeFactoryRef801;
  run('cartResetCheckout();');
}

// ---------------- v80.2 HOTFIX: join->pay recoverable (trial SetupIntent root cause), hosted door on ANY server failure, prepare polish ----------------
{
  const A802 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
  const admReqs802 = async () => (await req2('GET', '/api/requests', { token: A802 })).j.requests || [];
  const items802 = [{ serviceId: 'tv-mounting', name: 'TV Mounting (up to 65")', qty: 1, addons: [] }]; // list $125 / member $100 — deposit $50, balance $50 (Gabriel's acceptance case)
  const subsOf802 = (uid) => Object.values(stripeState.subs).filter(s => s.metadata && s.metadata.userId === uid);
  // --- statics ---
  const cartSlice802 = serverSrc.slice(serverSrc.indexOf("p === '/api/cart/checkout'"), serverSrc.indexOf("p === '/api/cart/checkout-confirm'"));
  const hostedSlice802 = serverSrc.slice(serverSrc.indexOf("p === '/api/cart/checkout-hosted'"), serverSrc.indexOf("p === '/api/cart/checkout-hosted-confirm'"));
  t('static v80.2 server: the inline subscription secret is discriminated (pending_setup_intent -> mode setup) + the membership-state sync exists', serverSrc.includes('function inlineSubscriptionSecret(') && serverSrc.includes("mode: 'setup'") && serverSrc.includes('pending_setup_intent') && serverSrc.includes('function syncInlineMembershipState('));
  t('static v80.2 server: NEITHER cart rail carries the terminal already-have-a-membership error anymore', cartSlice802.length > 100 && hostedSlice802.length > 100 && !cartSlice802.includes('you already have an active HomeCare membership') && !hostedSlice802.includes('you already have an active HomeCare membership'));
  t('static v80.2 SPA: setup confirms + hosted door on server errors + self-clearing validation notes', htmlSrc.includes('confirmSetup') && htmlSrc.includes('function cartShowErrWithHosted(') && htmlSrc.includes('function cartShowValidationErr(') && htmlSrc.includes("addEventListener('input'") && htmlSrc.split('Pay on Stripe').length - 1 >= 2);
  // --- A: the Gabriel case — guest + $125 service + join. The trial
  // subscription's $0 invoice has NO PaymentIntent in real Stripe;
  // the join must answer a SETUP secret, and the flow completes.
  const gA = { name: 'Join Gwen', email: 'gwen802@t.local', phone: '7075550201', password: 'gwenpass802', address: '21 Gwen St', city: 'Fairfield', when: 'Today', items: items802 };
  const jA = await req2('POST', '/api/cart/checkout', { body: Object.assign({}, gA, { step: 'join' }) });
  const subA = stripeState.subs[jA.j.subscriptionId];
  t('v80.2 join trial: the join step answers mode SETUP with the SetupIntent secret (mock models real Stripe: trialing sub, $0 invoice, payment_intent null)', jA.status === 200 && jA.j.step === 'join' && jA.j.mode === 'setup' && (jA.j.clientSecret || '').startsWith('seti_') && !!subA && subA.status === 'trialing' && subA.latest_invoice.payment_intent === null);
  const tokA = (await req2('POST', '/api/login', { body: { email: 'gwen802@t.local', password: 'gwenpass802' } })).j.token;
  const confA = await req2('POST', '/api/stripe/homecare-confirm', { token: tokA, body: {} });
  t('v80.2 join trial: homecare-confirm activates the membership and reports the trial (free month spent AT activation)', confA.status === 200 && confA.j.active === true && confA.j.trial === true);
  const payA = await req2('POST', '/api/cart/checkout', { token: tokA, body: { step: 'pay', address: '21 Gwen St', city: 'Fairfield', when: 'Today', joinedMembership: true, items: items802 } });
  await mockPiStatus(payA.j.paymentIntentId, 'succeeded');
  const ccA = await req2('POST', '/api/cart/checkout-confirm', { token: tokA, body: { checkoutId: payA.j.checkoutId, paymentIntentId: payA.j.paymentIntentId } });
  const ordA = (await admReqs802()).find(r => r.id === (ccA.j && ccA.j.requestId));
  t('v80.2 join trial: the deposit settles a DEPOSIT order at MEMBER totals ($50 of $100) with joinedMembership — exactly ONE subscription exists', payA.status === 200 && payA.j.totals.due === 100 && payA.j.totals.deposit === 50 && ccA.status === 200 && !!ordA && ordA.payment.status === 'deposit' && ordA.payment.amountCents === 5000 && ordA.payment.balanceCents === 5000 && ordA.menuOrder.joinedMembership === true && subsOf802(jA.j.user.id).length === 1);
  // --- B: forced deposit-step failure AFTER activation (the pin):
  // the retry must complete the deposit AS A MEMBER, never error.
  const gB = { name: 'Retry Rob', email: 'rob802@t.local', phone: '7075550202', password: 'robpass802', address: '22 Rob St', city: 'Fairfield', when: 'Today', items: items802 };
  const jB = await req2('POST', '/api/cart/checkout', { body: Object.assign({}, gB, { step: 'join' }) });
  const tokB = (await req2('POST', '/api/login', { body: { email: 'rob802@t.local', password: 'robpass802' } })).j.token;
  const confB = await req2('POST', '/api/stripe/homecare-confirm', { token: tokB, body: {} });
  await mockFailPiOnce();
  const payB1 = await req2('POST', '/api/cart/checkout', { token: tokB, body: { step: 'pay', address: '22 Rob St', city: 'Fairfield', when: 'Today', joinedMembership: true, items: items802 } });
  t('v80.2 forced failure: membership active + the deposit PI creation dies once -> 502 (the half-applied state, reproduced)', jB.status === 200 && confB.j.active === true && payB1.status === 502);
  const payB2 = await req2('POST', '/api/cart/checkout', { token: tokB, body: { step: 'join', address: '22 Rob St', city: 'Fairfield', when: 'Today', items: items802 } });
  t('v80.2 retry: step join on the already-member account is NOT terminal — it answers the PAY step at member totals ($100 due, $50 deposit)', payB2.status === 200 && payB2.j.step === 'pay' && payB2.j.totals.due === 100 && payB2.j.totals.deposit === 50);
  await mockPiStatus(payB2.j.paymentIntentId, 'succeeded');
  const ccB = await req2('POST', '/api/cart/checkout-confirm', { token: tokB, body: { checkoutId: payB2.j.checkoutId, paymentIntentId: payB2.j.paymentIntentId } });
  const ordB = (await admReqs802()).find(r => r.id === (ccB.j && ccB.j.requestId));
  t('v80.2 retry: the deposit completes as a member — DEPOSIT order $50/$100, joinedMembership, exactly ONE membership', ccB.status === 200 && !!ordB && ordB.payment.status === 'deposit' && ordB.payment.amountCents === 5000 && ordB.payment.balanceCents === 5000 && ordB.menuOrder.joinedMembership === true && subsOf802(jB.j.user.id).length === 1);
  // --- D: the production ghost — join created the trialing sub but
  // the local activation never landed (webhook did it in production).
  // The retry must MIRROR the live subscription and proceed as member.
  const gD = { name: 'Ghost Gia', email: 'gia802@t.local', phone: '7075550204', password: 'giapass802', address: '24 Gia St', city: 'Fairfield', when: 'Today', items: items802 };
  const jD = await req2('POST', '/api/cart/checkout', { body: Object.assign({}, gD, { step: 'join' }) });
  const tokD = (await req2('POST', '/api/login', { body: { email: 'gia802@t.local', password: 'giapass802' } })).j.token;
  const meD0 = await req2('GET', '/api/me', { token: tokD });
  const jD2 = await req2('POST', '/api/cart/checkout', { token: tokD, body: { step: 'join', address: '24 Gia St', city: 'Fairfield', when: 'Today', items: items802 } });
  const meD1 = await req2('GET', '/api/me', { token: tokD });
  t('v80.2 half-applied: a live trialing sub with NO local activation is mirrored on retry — member pay step, free month spent at THIS activation, one subscription', jD.status === 200 && meD0.j.user.homeCareStatus !== 'active' && jD2.status === 200 && jD2.j.step === 'pay' && jD2.j.totals.due === 100 && meD1.j.user.homeCareStatus === 'active' && meD1.j.user.freeMonthAvailable === false && subsOf802(jD.j.user.id).length === 1);
  // --- C: pre-existing active membership + join checked, both rails.
  const mC = await mkMember('pre802@t.local', '(707) 555-0203');
  const subC = await req2('POST', '/api/stripe/homecare-subscribe', { token: mC.token, body: {} });
  await mockActivate(subC.j.subscriptionId);
  const confC = await req2('POST', '/api/stripe/homecare-confirm', { token: mC.token, body: {} });
  const jC = await req2('POST', '/api/cart/checkout', { token: mC.token, body: { step: 'join', address: '1 Main St', city: 'Fairfield', items: items802 } });
  t('v80.2 pre-existing member: step join proceeds as a MEMBER checkout (step pay, member totals) — never the old terminal 400', confC.j.active === true && jC.status === 200 && jC.j.step === 'pay' && jC.j.totals.due === 100 && jC.j.totals.deposit === 50);
  const hC = await req2('POST', '/api/cart/checkout-hosted', { token: mC.token, body: { step: 'join', address: '1 Main St', city: 'Fairfield', items: items802 } });
  const hCSess = Object.values(stripeState.sessions).find(s => s.metadata && s.metadata.checkoutId === (hC.j && hC.j.checkoutId));
  t('v80.2 pre-existing member (hosted): step join opens the PLAIN deposit session at member totals — no second subscription', hC.status === 200 && !!hCSess && hCSess.mode === 'payment' && hCSess.metadata.kind === 'cart-checkout-hosted' && hCSess.amount_total === 5000 && subsOf802(mC.id).length === 1);
  // --- E: the sibling rail reuses the live trialing subscription —
  // a retried inline join returns the SAME sub + setup secret.
  const mE = await mkMember('reuse802@t.local', '(707) 555-0205');
  const subE1 = await req2('POST', '/api/stripe/homecare-subscribe', { token: mE.token, body: {} });
  const subE2 = await req2('POST', '/api/stripe/homecare-subscribe', { token: mE.token, body: {} });
  t('v80.2 reuse: a retried inline join reuses the LIVE trialing subscription (same id, mode setup, exactly one sub — no stacking)', subE1.status === 200 && subE1.j.mode === 'setup' && subE2.status === 200 && subE2.j.subscriptionId === subE1.j.subscriptionId && (subE2.j.clientSecret || '').startsWith('seti_') && subsOf802(mE.id).length === 1);
}
{
  // VM: the hosted door on a SERVER error (carrying the current
  // intent), the setup-mode join confirming via confirmSetup end to
  // end, and the prepare polish (fail-fast validation, no fake
  // loading state).
  const fetchOrig802 = sandbox.fetch;
  const stripeOrig802 = sandbox.Stripe;
  let setupUsed802 = false, paymentUsed802 = false, meActive802 = false, checkoutMode802 = 'fail';
  const calls802 = [];
  sandbox.Stripe = function (pk) {
    return {
      elements() { return { create() { return makeFakeCardEl(); } }; },
      confirmCardPayment: async () => ({}),
      confirmCardSetup: async () => ({}),
      confirmSetup: async () => { setupUsed802 = true; return { setupIntent: { id: 'seti_vm802', status: 'succeeded' } }; },
      confirmPayment: async () => { paymentUsed802 = true; return { paymentIntent: { id: 'pi_vm802', status: 'succeeded' } }; }
    };
  };
  const fetch802 = async (url, opts = {}) => {
    let body = null; try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
    if (url === '/api/me') return { ok: true, status: 200, json: async () => ({ user: { id: 'USR-802', role: 'customer', name: 'Vm Vic', email: 'vic802@t.local', homeCareStatus: meActive802 ? 'active' : 'none' } }) };
    if (url === '/api/cart/checkout') {
      calls802.push(body && body.step);
      if (checkoutMode802 === 'fail') return { ok: false, status: 502, json: async () => ({ error: 'payment service error — try again in a minute' }) };
      if (body && body.step === 'join') return { ok: true, status: 200, json: async () => ({ step: 'join', mode: 'setup', clientSecret: 'seti_secret_802', subscriptionId: 'sub_802', user: { id: 'USR-802', role: 'customer', name: 'Vm Vic', email: 'vic802@t.local', homeCareStatus: 'none' }, totals: { list: 125, member: 100, due: 100, deposit: 50, balance: 50 } }) };
      return { ok: true, status: 200, json: async () => ({ step: 'pay', checkoutId: 'CCK-802', clientSecret: 'pi_secret_802', paymentIntentId: 'pi_vm802', user: { id: 'USR-802', role: 'customer', name: 'Vm Vic', email: 'vic802@t.local', homeCareStatus: 'active' }, totals: { list: 125, member: 100, due: 100, deposit: 50, balance: 50 } }) };
    }
    if (url === '/api/stripe/homecare-confirm') { calls802.push('homecare-confirm'); meActive802 = true; return { ok: true, status: 200, json: async () => ({ active: true }) }; }
    if (url === '/api/cart/checkout-confirm') { calls802.push('checkout-confirm'); return { ok: true, status: 200, json: async () => ({ ok: true, requestId: 'GHS-802OK' }) }; }
    if (url === '/api/cart/checkout-hosted') { calls802.push('hosted:' + (body && body.step)); return { ok: true, status: 200, json: async () => ({ hosted: true, url: 'https://checkout.mock/pay/cs_802' }) }; }
    return fetchStub(url, opts);
  };
  sandbox.fetch = fetch802;
  resetStripeState();
  stripeCfgMode = 'ok';
  el('cartDone').style.display = 'none';
  run("me = null; location.hash = ''; localStorage.removeItem('ghsCart'); cartJoinedOnce = false; cartAdd('tv-mounting');");
  el('ccName').value = 'Vm Vic'; el('ccEmail').value = 'vic802@t.local'; el('ccPhone').value = '7075550209'; el('ccPass').value = 'vicpass802';
  el('ccCity').value = 'Fairfield'; el('ccWhenText').value = ''; el('ccNotes').value = '';
  el('ccJoin').checked = true;
  // fail-fast validation: no address -> the note paints immediately,
  // the pay box never enters the loading state, nothing is sent.
  el('ccAddress').value = '';
  await run('cartPrepare()');
  t('v80.2 VM polish: an invalid form fails FAST — validation note up, pay box NOT stuck loading, no checkout call made', (el('cartPayErr').textContent || '').includes('Enter the service address') && run('cartStripeState') === 'idle' && !(el('cartPayElement').innerHTML || '').includes('Loading secure payment') && calls802.length === 0);
  el('ccAddress').value = '5 Vic St';
  // server error -> the error WITH the hosted door, intent = join.
  checkoutMode802 = 'fail';
  await run('cartPrepare()');
  t('v80.2 VM: a SERVER error in prepare paints the error WITH the hosted door (no dead end)', el('cartPayErr').style.display === 'block' && (el('cartPayErr').innerHTML || '').includes('payment service error') && (el('cartPayErr').innerHTML || '').includes("Stripe's secure page"));
  await run('cartPayHosted()');
  t('v80.2 VM: the hosted door from the error state carries the CURRENT intent (join checked -> hosted step join)', calls802.includes('hosted:join'));
  // setup-mode join, end to end.
  checkoutMode802 = 'ok';
  await run('cartPrepare()');
  t('v80.2 VM: the trial join prepare records mode setup on the pay context', run('cartPayCtx && cartPayCtx.mode') === 'setup' && run('cartPayCtx.phase') === 'join');
  await run('cartPayNow()');
  await run('cartPayNow()');
  t('v80.2 VM: the setup secret confirms via confirmSetup, the membership confirms, then the deposit pays and the order completes', setupUsed802 === true && paymentUsed802 === true && calls802.join(',') === 'join,hosted:join,join,homecare-confirm,pay,checkout-confirm' && el('cartDone').style.display === 'block');
  sandbox.fetch = fetchOrig802;
  sandbox.Stripe = stripeOrig802;
  el('ccJoin').checked = false;
  run('cartResetCheckout();');
  run("me = null; localStorage.removeItem('ghsCart'); cartJoinedOnce = false;");
}

// ---------------- v80.3 PRESENTATION: the member price teases in GREEN in the cart view (Gabriel 2026-10-25) ----------------
{
  t('static v80.3 SPA: the green member-tease classes exist (WhatsApp family green darkened for the light card: #16a34a)', htmlSrc.includes('.cart-members-pay{color:#16a34a') && htmlSrc.includes('.cart-members-total{color:#16a34a'));
  t('static v80.3 SPA: the hook box headline is the join invitation only — the old price-carrying headline is gone', htmlSrc.includes('⭐ HomeCare — first month FREE') && !htmlSrc.includes('⭐ HomeCare members pay $'));
  // guest — Gabriel's screenshot case: TV Mounting (over 65") $175 + Furniture Assembly $125 = $300 -> members $240, save $60
  run("me = null; location.hash = '#cart';");
  run("cartSave([{ id: 'tv-mounting-large', q: 1 }, { id: 'furniture-assembly', q: 1 }]);");
  run('renderCart();');
  const lines803 = el('cartLines').innerHTML, totals803 = el('cartTotals').innerHTML;
  t('v80.3 guest cart: each discountable line teases its member price in green under the regular price ($175->$140, $125->$100)', lines803.includes('Members pay $140') && lines803.includes('Members pay $100') && (lines803.match(/cart-members-pay/g) || []).length === 2);
  t('v80.3 guest cart: BELOW the regular Total the green bold line reads Members pay $240 — save $60; the hook box invites the join without repeating prices', totals803.indexOf('<b>Total</b>') >= 0 && totals803.indexOf('Members pay $240 — save $60') > totals803.indexOf('<b>Total</b>') && totals803.includes('cart-members-total') && totals803.includes('⭐ HomeCare — first month FREE') && !totals803.includes('HomeCare members pay'));
  // quantity > 1: the green per-line price is the member LINE total
  run("cartSave([{ id: 'tv-mounting', q: 2 }]);"); run('renderCart();');
  const linesQty803 = el('cartLines').innerHTML;
  t('v80.3 guest cart: quantity > 1 teases the member LINE total (2 x $125 service -> Members pay $200, not the $100 unit)', linesQty803.includes('Members pay $200') && !linesQty803.includes('Members pay $100'));
  // a line with NO member discount (materials-style: member == list) teases NOTHING
  run("MENU_CATALOG['zz-materials-803'] = { name: 'Materials (test)', meta: '', price: 100, member: 100 };");
  run("cartSave([{ id: 'zz-materials-803', q: 1 }, { id: 'tv-mounting', q: 1 }]);"); run('renderCart();');
  const linesMat803 = el('cartLines').innerHTML, totalsMat803 = el('cartTotals').innerHTML;
  t('v80.3 guest cart: a no-discount (materials/nodisc) line renders NO green line — only the discountable line teases; the totals save counts only the real discount ($225 -> $200, save $25)', (linesMat803.match(/cart-members-pay/g) || []).length === 1 && linesMat803.includes('Members pay $100') && totalsMat803.includes('Members pay $200 — save $25'));
  run("delete MENU_CATALOG['zz-materials-803']; cartSave([]);");
  // verified member: NO teasers anywhere — they already pay the member price
  run("me = { id:'USR-V803M', role:'customer', name:'Mem Ber', email:'mem803@t.local', homeCareStatus:'active' };");
  run("cartSave([{ id: 'tv-mounting-large', q: 1 }, { id: 'furniture-assembly', q: 1 }]);"); run('renderCart();');
  const memHtml803 = el('cartLines').innerHTML + el('cartTotals').innerHTML;
  t('v80.4 amendment (Gabriel 23:54): member cart headlines the FULL list price ($175/$125, each at list) — the member figure is never dressed as THE price, and there is NO tease', memHtml803.includes('<b>$175</b>') && memHtml803.includes('<b>$125</b>') && memHtml803.includes('$175 each') && !memHtml803.includes('Members pay'));
  t('v80.4 amendment: the member saving rides as its own small green badge per discountable line (Members −$35 / −$25); the totals keep the savings row + the member total ($240 + the applied note)', memHtml803.includes('cart-member-save') && memHtml803.includes('Members −$35') && memHtml803.includes('Members −$25') && memHtml803.includes('member price is applied') && memHtml803.includes('$240'));
  // --- extension (Gabriel 23:49, "igual aquí"): the CHECKOUT services list ---
  run("me = null;");
  run("cartSave([{ id: 'tv-mounting-large', q: 1 }, { id: 'furniture-assembly', q: 1 }]);");
  el('ccJoin').checked = false; run('renderCcLines();');
  const ccOff803 = el('ccLines').innerHTML;
  t('v80.3 checkout (join OFF): each discountable line teases Members pay $X in green under the regular price — figures themselves stay plain', ccOff803.includes('Members pay $140') && ccOff803.includes('Members pay $100') && (ccOff803.match(/cart-members-pay/g) || []).length === 2 && ccOff803.includes('<b>$175</b>') && ccOff803.includes('<b>$125</b>'));
  el('ccJoin').checked = true; run('renderCcLines();');
  const ccOn803 = el('ccLines').innerHTML;
  t('v80.4 amendment (Gabriel 23:54): checkout with join ON headlines the FULL list price too — figures AND each captions at list ($175/$125), NO green member figures, NO tease (supersedes the v80.3 green-figures pin)', ccOn803.includes('<b>$175</b>') && ccOn803.includes('<b>$125</b>') && ccOn803.includes('$175 each') && !ccOn803.includes('cart-members-pay') && !ccOn803.includes('Members pay') && !ccOn803.includes('$140'));
  t('v80.4 amendment: join ON carries the green saving badge per discountable line (Members −$35 / −$25)', ccOn803.includes('cart-member-save') && ccOn803.includes('Members −$35') && ccOn803.includes('Members −$25'));
  // verified member AT CHECKOUT (no join involved): the rule is uniform
  run("me = { id:'USR-V804M', role:'customer', name:'Mem Ber', email:'mem804@t.local', homeCareStatus:'active' };");
  el('ccJoin').checked = false; run('renderCcLines();');
  const ccMem804 = el('ccLines').innerHTML;
  t('v80.4 amendment: a VERIFIED MEMBER at checkout gets the same treatment — list headlines + green saving badges, no tease', ccMem804.includes('<b>$175</b>') && ccMem804.includes('Members −$35') && ccMem804.includes('cart-member-save') && !ccMem804.includes('Members pay'));
  el('ccJoin').checked = false;
  run("me = null; cartSave([]); location.hash = '';");
}

// ---------------- v80.4: the payment form loads WITH the page (eager deferred mount) + the Pay gate ----------------
{
  t('static v80.4 SPA: eager deferred mount + the gate exist; the classic secret-born mount is retired', htmlSrc.includes('function cartEagerMount(') && htmlSrc.includes('function cartGatePaint(') && htmlSrc.includes('function cartMountDeferred(') && htmlSrc.includes("mode: 'payment'") && htmlSrc.includes("mode: 'setup'") && htmlSrc.includes('cartElements.submit') && htmlSrc.includes('clientSecret: cartPayCtx.clientSecret') && !htmlSrc.includes('function cartMountPayment('));
  t('static v80.4 SPA: the member-applied badge class rides the same member green (#16a34a)', htmlSrc.includes('.cart-member-save{color:#16a34a'));
  // VM: a recording Stripe factory (deferred options + submit) over
  // the v78 scripted backend.
  const stripeOrig804 = sandbox.Stripe;
  const fetchOrig804 = sandbox.fetch;
  const elsOpts804 = [], confirmArgs804 = [];
  let submitCalls804 = 0;
  sandbox.Stripe = function (pk) {
    return {
      elements(opts) { elsOpts804.push(opts || {}); return { submit: async () => { submitCalls804++; return {}; }, create() { return makeFakeCardEl(); } }; },
      confirmCardPayment: async () => ({}),
      confirmSetup: async (args) => { confirmArgs804.push(['setup', args]); return { setupIntent: { id: 'seti_804', status: 'succeeded' } }; },
      confirmPayment: async (args) => { confirmArgs804.push(['payment', args]); return { paymentIntent: { id: 'pi_v78_vm', status: 'succeeded' } }; }
    };
  };
  sandbox.fetch = v78Fetch;
  resetStripeState();
  stripeCfgMode = 'ok';
  v78ConfirmMode = 'ok'; v78JoinArmed = false; v78Calls.length = 0;
  run("me = null; location.hash = ''; localStorage.removeItem('ghsCart'); cartJoinedOnce = false; cartPayCtx = null; cartQuote = null;");
  run("cartAdd('tv-mounting');");
  el('ccName').value = ''; el('ccEmail').value = ''; el('ccPhone').value = ''; el('ccPass').value = '';
  el('ccAddress').value = ''; el('ccCity').value = ''; el('ccWhenText').value = ''; el('ccNotes').value = '';
  el('ccJoin').checked = false;
  el('cartDone').style.display = 'none';
  // (a) ENTRY: the mount fires WITH the page — a deferred payment
  // element at the deposit amount — BEFORE any field is filled, and
  // with NO server arm (no account, no pending checkout, no intent).
  await run('cartShowCheckout()');
  t('v80.4 VM (a): entering checkout mounts the Payment Element AT ENTRY (deferred payment mode, deposit amount $50 for the $125 service) before any field is filled', elsOpts804.length >= 1 && elsOpts804[0].mode === 'payment' && elsOpts804[0].amount === 5000 && run('!!cartElements') === true);
  t('v80.4 VM (a): the eager mount arms NOTHING server-side and the Pay button is born gated OFF with empty fields', !v78Calls.some(c => c.step === 'pay' || c.step === 'join') && run('cartPayCtx === null') === true && el('cartPayBtn').disabled === true);
  el('ccName').value = 'Eager Eve'; el('ccEmail').value = 'eager@t.local'; el('ccPhone').value = '7075550199'; el('ccPass').value = 'eagerpass1';
  el('ccAddress').value = '7 Eager St'; el('ccCity').value = 'Fairfield';
  run('cartGatePaint();'); // exactly what every keystroke runs (the input listener)
  t('v80.4 VM (a): the moment the last required field validates, the button enables with the deposit label', el('cartPayBtn').disabled === false && (el('cartPayBtn').textContent || '') === 'Pay $50 deposit');
  // (b) the join toggle is the mode switch — typed data survives.
  el('ccJoin').checked = true;
  await run('cartJoinToggled()');
  t('v80.4 VM (b): toggling HomeCare remounts the element in SETUP mode (the trial join) with no armed context', elsOpts804[elsOpts804.length - 1].mode === 'setup' && run('cartPayCtx === null') === true);
  t('v80.4 VM (b): the typed checkout data SURVIVES the mode swap and the button names the one-process join', el('ccName').value === 'Eager Eve' && el('ccEmail').value === 'eager@t.local' && el('ccAddress').value === '7 Eager St' && (el('cartPayBtn').textContent || '').includes('Join HomeCare — then pay $50 deposit'));
  el('ccJoin').checked = false;
  await run('cartJoinToggled()');
  t('v80.4 VM (b): toggling back remounts the PAYMENT element at the deposit amount', elsOpts804[elsOpts804.length - 1].mode === 'payment' && elsOpts804[elsOpts804.length - 1].amount === 5000);
  // (c) qty edits with NO armed context: re-quote + remount at the
  // new amount — the server arm still waits for the submit tap.
  v78Calls.length = 0;
  await run('ccQty(0, 1)'); await run('ccQty(0, 1)'); // 3 x $125 = $375 -> deposit 40% = $150
  t('v80.4 VM (c): qty edits re-quote with the server and REMOUNT at the NEW deposit amount ($375 -> $150) — no checkout arm, typed data intact, button names the new deposit', v78Calls.some(c => c.step === 'quote') && !v78Calls.some(c => c.step === 'pay') && elsOpts804[elsOpts804.length - 1].amount === 15000 && el('ccAddress').value === '7 Eager St' && (el('cartPayBtn').textContent || '') === 'Pay $150 deposit');
  // submit: elements.submit() validates first, THEN the server arms,
  // then the confirm rides the mounted element with the fresh secret.
  await run('cartPayNow()');
  t('v80.4 VM: submit validates the element BEFORE arming, then confirms the mounted element WITH the armed secret — order completes, cart clears', submitCalls804 >= 1 && v78Calls.map(c => c.step).filter(s => s === 'pay' || s === 'checkout-confirm').join(',') === 'pay,checkout-confirm' && confirmArgs804.length >= 1 && confirmArgs804[0][0] === 'payment' && confirmArgs804[0][1].clientSecret === 'pi_secret_v78' && el('cartDone').style.display === 'block' && run("localStorage.getItem('ghsCart')") === '[]');
  // (d) a Stripe load failure surfaces AT ENTRY — hosted door + ref,
  // before the customer has filled anything in.
  run("localStorage.removeItem('ghsCart'); cartAdd('tv-mounting');");
  run('cartResetCheckout();');
  resetStripeState();
  sandbox.Stripe = undefined;
  const origCreate804 = sandbox.document.createElement;
  sandbox.document.createElement = function (tag) { const e = origCreate804(tag); if (tag === 'script') setTimeout(function () { if (e.onerror) e.onerror(); }, 5); return e; };
  await run('cartShowCheckout()');
  const box804 = el('cartPayElement').innerHTML || '';
  t('v80.4 VM (d): a dead Stripe.js load fails AT ENTRY — ref: JS + the hosted door in the box, Pay gated off, no field ever touched', run('cartStripeState') === 'failed' && run('cartStripeFailStage') === 'JS' && box804.includes('ref: JS') && box804.includes("Stripe's secure page") && el('cartPayBtn').disabled === true);
  sandbox.document.createElement = origCreate804;
  sandbox.Stripe = stripeOrig804;
  sandbox.fetch = fetchOrig804;
  run('cartResetCheckout();');
  run("me = null; localStorage.removeItem('ghsCart'); cartJoinedOnce = false;");
}

// ---------------- v80.5 BALANCE SEAL: one balance, one door, never on a dead order (AUDITORIA-SALDOS GAP-1/2/3, Gabriel 2026-10-26) ----------------
t('static v80.5 server: the seal helpers + dead-order predicate + duplicate alert exist; the legacy cart pay handlers answer 410', serverSrc.includes('function orderBalanceDead(') && serverSrc.includes('function sealCartBalance(') && serverSrc.includes('function disarmCartBalance(') && serverSrc.includes('function alertDuplicateBalance(') && serverSrc.includes("'balance.duplicate'") && serverSrc.includes('send(res, 410'));
{
  const A805 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
  const reqs805 = async () => (await req2('GET', '/api/requests', { token: A805 })).j.requests || [];
  const ordOf805 = async (cartId) => (await reqs805()).find(x => x.menuOrder && x.menuOrder.cartId === cartId);
  const sessCount805 = (cartId) => Object.values(stripeState.sessions).filter(s => s.metadata && s.metadata.cartId === cartId).length;
  const bookCart805 = async (email, phone, name) => {
    const cust = await mkMember(email, phone);
    const cart = await req2('POST', '/api/admin/carts', { token: A805, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }, { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }], customerName: name } });
    const cid = cart.j.cart.id;
    const det = { name, phone: phone.replace(/\D/g, ''), email, address: '5 Seal St', city: 'Fairfield', when: 'Today' };
    const co = await req2('POST', '/api/carts/' + cid + '/checkout', { token: cust.token, body: det });
    const sess = sessionForCart(cid, 'payment');
    await mockSessionPaid(sess.id);
    await fetch(BASE2 + '/cart/' + cid + '?paid=1&session_id=' + sess.id, { headers: { Authorization: 'Bearer ' + cust.token } });
    const ord = await ordOf805(cid);
    return { cust, cid, ord, sess };
  };

  // --- A (GAP-1): refund a DEPOSIT order -> BOTH rails refuse, no new
  // Stripe charge, the page renders the cancelled state, the order is
  // never resurrected. ---
  const aA = await bookCart805('seal-a@t.local', '(707) 555-0211', 'Seal Ann');
  t('v80.5 A setup: the cart books a DEPOSIT order ($50 of $250, balance $200)', !!aA.ord && aA.ord.payment.status === 'deposit' && aA.ord.payment.balanceCents === 20000);
  const rfA = await req2('POST', '/api/requests/' + aA.ord.id + '/refund', { token: A805, body: {} });
  t('v80.5 A: the deposit refunds in full (not dispatched)', rfA.status === 200 && rfA.j.refunded === 50);
  const pgA = await (await fetch(BASE2 + '/cart/' + aA.cid)).text();
  t('v80.5 A (GAP-1c): the refunded order\'s cart page renders the CANCELLED state — no balance button, no paid-in-full', pgA.includes('data-i18n="orderCancelledH"') && pgA.includes('This order was cancelled') && !pgA.includes('id="balBtn"') && !pgA.includes('data-i18n="paidH"'));
  const sessBeforeA = sessCount805(aA.cid), pisBeforeA = Object.keys(stripeState.pis).length;
  const balA = await req2('POST', '/api/carts/' + aA.cid + '/checkout', { body: { balance: true } });
  t('v80.5 A (GAP-1): the cart LINK refuses the balance on the refunded order (400, cancelled message) and creates NO Stripe session', balA.status === 400 && /cancelled/i.test(balA.j.error || '') && sessCount805(aA.cid) === sessBeforeA);
  const payA = await req2('POST', '/api/orders/pay', { token: aA.cust.token, body: { requestId: aA.ord.id } });
  t('v80.5 A (GAP-1): the APP rail refuses too (400, cancelled message) and creates NO PaymentIntent', payA.status === 400 && /cancelled/i.test(payA.j.error || '') && Object.keys(stripeState.pis).length === pisBeforeA);
  const ordA2 = (await reqs805()).find(x => x.id === aA.ord.id);
  t('v80.5 A: the dead order was NOT resurrected — still Cancelled + refunded, refund record intact', !!ordA2 && ordA2.status === 'Cancelled' && ordA2.payment.status === 'refunded' && !!ordA2.refund && ordA2.refund.refundedCents === 5000);
  const cartsAdmA = await req2('GET', '/api/admin/carts', { token: A805 });
  const cartAdmA = (cartsAdmA.j.carts || []).find(x => x.id === aA.cid);
  t('v80.5 A: the refund DISARMED the cart in the same operation (balanceVoid stamped, door closed)', !!cartAdmA && !!cartAdmA.payState && cartAdmA.payState.balanceVoid === true);
  const adjA = await req2('POST', '/api/admin/carts/' + aA.cid + '/adjust-balance', { token: A805, body: { delta: 10, note: 'too late' } });
  t('v80.5 A: a disarmed cart refuses balance adjustments (400)', adjA.status === 400);

  // --- B (GAP-2): balance paid IN THE APP seals the cart link. ---
  const aB = await bookCart805('seal-b@t.local', '(707) 555-0212', 'Seal Bob');
  const payB = await req2('POST', '/api/orders/pay', { token: aB.cust.token, body: { requestId: aB.ord.id } });
  t('v80.5 B setup: the app rail opens the balance PI for exactly $200', payB.status === 200 && payB.j.amount === 200);
  await mockPiStatus(payB.j.paymentIntentId, 'succeeded');
  const confB = await req2('POST', '/api/orders/pay-confirm', { token: aB.cust.token, body: { requestId: aB.ord.id, paymentIntentId: payB.j.paymentIntentId } });
  const ordB = (await reqs805()).find(x => x.id === aB.ord.id);
  t('v80.5 B: the in-app balance settles the order PAID IN FULL with both legs kept', confB.status === 200 && confB.j.balance === true && !!ordB && ordB.payment.status === 'paid' && ordB.payment.depositCents === 5000 && ordB.payment.balancePi === payB.j.paymentIntentId);
  const sessBeforeB = sessCount805(aB.cid);
  const balB = await req2('POST', '/api/carts/' + aB.cid + '/checkout', { body: { balance: true } });
  const pgB = await (await fetch(BASE2 + '/cart/' + aB.cid)).text();
  t('v80.5 B (GAP-2): the cart LINK is sealed by the app payment — balance refused (400), NO new session, page shows paid-in-full with no balance button', balB.status === 400 && sessCount805(aB.cid) === sessBeforeB && pgB.includes('data-i18n="paidH"') && !pgB.includes('id="balBtn"'));
  const cartsAdmB = await req2('GET', '/api/admin/carts', { token: A805 });
  const cartAdmB = (cartsAdmB.j.carts || []).find(x => x.id === aB.cid);
  t('v80.5 B: the cart record carries the seal (balancePaid, balanceVia app)', !!cartAdmB && cartAdmB.payState.balancePaid === true && cartAdmB.payState.balanceVia === 'app');

  // --- C: the reverse direction — balance paid via the LINK closes
  // the app rail (already paid in full). ---
  const aC = await bookCart805('seal-c@t.local', '(707) 555-0213', 'Seal Cid');
  const balC = await req2('POST', '/api/carts/' + aC.cid + '/checkout', { body: { balance: true } });
  const sessCB = sessionForCart(aC.cid, 'payment');
  await mockSessionPaid(sessCB.id);
  await fetch(BASE2 + '/cart/' + aC.cid + '?paid=1&session_id=' + sessCB.id);
  const payC = await req2('POST', '/api/orders/pay', { token: aC.cust.token, body: { requestId: aC.ord.id } });
  t('v80.5 C: after the link collects the balance, the app rail refuses (already paid in full)', balC.status === 200 && payC.status === 400 && /already paid/i.test(payC.j.error || ''));

  // --- D: a FORCED second success is an admin ALERT, never silence;
  // the legitimate confirm/webhook TWIN of the same PI stays silent. ---
  const dupWh1 = await wh2('payment_intent.succeeded', { id: 'pi_dup_805a', status: 'succeeded', amount: 20000, amount_received: 20000, metadata: { kind: 'cart-order', cartId: aB.cid } });
  const audD1 = await req2('GET', '/api/admin/audit', { token: A805 });
  const dupsD1 = (audD1.j.entries || []).filter(e => e.action === 'balance.duplicate' && e.target === aB.ord.id);
  t('v80.5 D (GAP-2): a second balance-sized success via the cart PI webhook raises the balance.duplicate ADMIN ALERT (audit), order untouched', dupWh1.status === 200 && dupsD1.length === 1);
  const dupWh2 = await wh2('payment_intent.succeeded', { id: 'pi_dup_805b', status: 'succeeded', amount: 20000, amount_received: 20000, metadata: { kind: 'menu-order', requestId: aB.ord.id } });
  const audD2 = await req2('GET', '/api/admin/audit', { token: A805 });
  const dupsD2 = (audD2.j.entries || []).filter(e => e.action === 'balance.duplicate' && e.target === aB.ord.id);
  t('v80.5 D: a foreign PI on the app webhook ALSO alerts (recordRequestPayment guard) — two alerts total, books unchanged', dupWh2.status === 200 && dupsD2.length === 2);
  await wh2('payment_intent.succeeded', { id: payB.j.paymentIntentId, status: 'succeeded', amount: 20000, amount_received: 20000, metadata: { kind: 'menu-order', requestId: aB.ord.id } });
  const audD3 = await req2('GET', '/api/admin/audit', { token: A805 });
  const dupsD3 = (audD3.j.entries || []).filter(e => e.action === 'balance.duplicate' && e.target === aB.ord.id);
  const ordD = (await reqs805()).find(x => x.id === aB.ord.id);
  t('v80.5 D: the TWIN webhook of the SAME balance PI stays a silent no-op (no third alert) and the recorded balance PI never moved', dupsD3.length === 2 && !!ordD && ordD.payment.balancePi === payB.j.paymentIntentId && ordD.payment.status === 'paid');

  // --- F: deposit == balance ($100 total) — the deposit PI's own
  // late webhook must NOT settle a balance nobody paid. ---
  const custF = await mkMember('seal-f@t.local', '(707) 555-0214');
  const cartF = await req2('POST', '/api/admin/carts', { token: A805, body: { items: [{ custom: true, kind: 'labor', name: 'Small Fix', qty: 1, unitPrice: 100 }], customerName: 'Seal Fay' } });
  const cidF = cartF.j.cart.id;
  const coF = await req2('POST', '/api/carts/' + cidF + '/checkout', { token: custF.token, body: { name: 'Seal Fay', phone: '7075550214', email: 'seal-f@t.local', address: '5 Seal St', city: 'Fairfield', when: 'Today' } });
  const sessF = sessionForCart(cidF, 'payment');
  await mockSessionPaid(sessF.id);
  await fetch(BASE2 + '/cart/' + cidF + '?paid=1&session_id=' + sessF.id, { headers: { Authorization: 'Bearer ' + custF.token } });
  const ordF0 = await ordOf805(cidF);
  t('v80.5 F setup: a $100 cart books DEPOSIT $50 / balance $50 (the equal-legs case)', coF.status === 200 && !!ordF0 && ordF0.payment.status === 'deposit' && ordF0.payment.balanceCents === 5000);
  await wh2('payment_intent.succeeded', { id: sessF.payment_intent, status: 'succeeded', amount: 5000, amount_received: 5000, metadata: { kind: 'cart-order', cartId: cidF } });
  const ordF1 = await ordOf805(cidF);
  t('v80.5 F: the DEPOSIT PI\'s late webhook does NOT settle the balance — the order stays DEPOSIT', !!ordF1 && ordF1.payment.status === 'deposit');
  const balF = await req2('POST', '/api/carts/' + cidF + '/checkout', { body: { balance: true } });
  const sessFB = sessionForCart(cidF, 'payment');
  await mockSessionPaid(sessFB.id);
  await fetch(BASE2 + '/cart/' + cidF + '?paid=1&session_id=' + sessFB.id);
  const ordF2 = await ordOf805(cidF);
  t('v80.5 F: the REAL balance still collects normally afterwards (order paid in full)', balF.status === 200 && !!ordF2 && ordF2.payment.status === 'paid');

  // --- E (GAP-3): the legacy full-charge endpoints are GONE (410);
  // the live balance rail /api/orders/pay is untouched (proven in B). ---
  const leg1 = await req2('POST', '/api/carts/' + aB.cid + '/pay', { body: { name: 'X', email: 'x@t.local', address: '1 St' } });
  const leg2 = await req2('POST', '/api/carts/' + aB.cid + '/pay-confirm', { body: { paymentIntentId: 'pi_whatever' } });
  t('v80.5 E (GAP-3): legacy /api/carts/:id/pay and /pay-confirm answer 410 Gone — the 100%-up-front bypass is retired', leg1.status === 410 && leg2.status === 410);
}

// ---------------- v80.6 ADMIN PACKAGE: tiles, no-churn map, removals, scoped reloads, stripe-health cache (Gabriel 2026-10-26) ----------------
t('static v80.6 tiles: BOTH Leaflet surfaces draw from ONE helper on the keyless OSM-DE source (the osm.org host + the CARTO key-placeholder are gone)', htmlSrc.includes('function ghsTileLayer(') && htmlSrc.includes('https://tile.openstreetmap.de/{z}/{x}/{y}.png') && !htmlSrc.includes('tile.openstreetmap.org') && !htmlSrc.includes('cartocdn'));
const mapFn806 = htmlSrc.slice(htmlSrc.indexOf('async function loadAdminMap('), htmlSrc.indexOf('// ---------- Admin captains (v40) ----------'));
t('static v80.6 map: signature guard + force flag + ONE error retry + 30 s hard deadline (the 7 s slow-connection fallback is gone)', mapFn806.includes('adminMapSignature(') && mapFn806.includes('preloadedJobs, force') && mapFn806.includes('tileRetried') && mapFn806.includes('}, 30000)') && !mapFn806.includes('}, 7000)') && mapFn806.includes('map-loading-note'));
t('static v80.6 cartLines: exactly ONE id="cartLines" (the customer cart) + the builder owns #cartBuilderLines + its renderer looks it up', (htmlSrc.match(/id="cartLines"/g) || []).length === 1 && (htmlSrc.match(/id="cartBuilderLines"/g) || []).length === 1 && htmlSrc.includes("getElementById('cartBuilderLines')"));
t('static v80.6 membership: the two action templates no longer share an error id (membershipActionErr vs membershipCancelErr)', (htmlSrc.match(/id="membershipActionErr"/g) || []).length === 1 && (htmlSrc.match(/id="membershipCancelErr"/g) || []).length === 1 && htmlSrc.includes("membershipActionErr(e.message, 'membershipCancelErr')"));
t('static v80.6 perf: loadAdmin composes the scoped section loaders', htmlSrc.includes('async function loadAdminRequests()') && htmlSrc.includes('async function loadAdminWorkers()') && htmlSrc.includes('async function loadAdminJobs()') && htmlSrc.includes('await loadAdminRequests();') && htmlSrc.includes('await loadAdminWorkers();') && htmlSrc.includes('const jobs = await loadAdminJobs();'));
t('static v80.6 server: the stripe-health cache exists (TTL + cache state)', serverSrc.includes('STRIPE_HEALTH_TTL_MS') && serverSrc.includes('stripeHealthCache'));
// the signature guard as a pure function: freshness alone never rebuilds, real movement does
const sigA806 = run("adminMapSignature([{ id: 'W1', name: 'Ana', photo: '', lat: 38.25, lng: -122.04, updatedAt: '2026-10-26T00:00:00Z' }], [{ id: 'J1', destLat: 38.3, destLng: -122.1, status: 'Open' }])");
const sigB806 = run("adminMapSignature([{ id: 'W1', name: 'Ana', photo: '', lat: 38.25, lng: -122.04, updatedAt: '2026-10-26T00:05:00Z' }], [{ id: 'J1', destLat: 38.3, destLng: -122.1, status: 'Open' }])");
const sigC806 = run("adminMapSignature([{ id: 'W1', name: 'Ana', photo: '', lat: 38.26, lng: -122.04, updatedAt: '2026-10-26T00:00:00Z' }], [{ id: 'J1', destLat: 38.3, destLng: -122.1, status: 'Open' }])");
t('v80.6 map signature: a fresher timestamp at the same spot keeps the signature (no rebuild, no tile re-download)', sigA806 === sigB806);
t('v80.6 map signature: real movement changes the signature (the map rebuilds)', sigA806 !== sigC806);
// the two cart containers render independently
run("cartDraft = [{ custom: true, kind: 'labor', serviceId: '', name: 'ZZ Builder Line', qty: 1, unitPrice: 10 }];");
const custLinesBefore806 = el('cartLines').innerHTML;
run('renderCartLines();');
t('v80.6 cartLines: the admin builder paints its draft into #cartBuilderLines', el('cartBuilderLines').innerHTML.includes('ZZ Builder Line'));
t('v80.6 cartLines: the customer #cartLines is byte-identical afterwards (no cross-paint)', el('cartLines').innerHTML === custLinesBefore806 && !el('cartLines').innerHTML.includes('ZZ Builder Line'));
run('cartDraft = []; renderCartLines();');
// stripe health: first call live, second call cached with NO new upstream fetch
const A806 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
const hh1 = await req2('GET', '/api/admin/stripe/health', { token: A806 });
const hitsAfterFirst806 = stripeState.accountHits || 0;
const hh2 = await req2('GET', '/api/admin/stripe/health', { token: A806 });
t('v80.6 server: the first stripe-health call is LIVE (ok, cached:false, exactly one upstream /account hit)', hh1.status === 200 && hh1.j.ok === true && hh1.j.cached === false && hitsAfterFirst806 === 1);
t('v80.6 server: the second call inside the TTL answers from cache (cached:true + numeric ageSec) and Stripe is NOT fetched again', hh2.j.cached === true && typeof hh2.j.ageSec === 'number' && (stripeState.accountHits || 0) === 1);


// ---------------- v80.7 SECURITY & MONEY PATCH: crash / refund dedupe + partial record / $0-refund resurrection / yard→HomeCare / ASAP labor-only / comma amounts (AUDITORIA-BUGS #1 #4 #8 #9 #31 #21, Gabriel 2026-10-26) ----------------
{
  const A807 = (await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } })).j.token;
  const reqs807 = async () => (await req2('GET', '/api/requests', { token: A807 })).j.requests || [];
  const ordOf807 = async (cartId) => (await reqs807()).find(x => x.menuOrder && x.menuOrder.cartId === cartId);

  // --- #1: malformed passwords are a clean auth answer, never a crash ---
  const badLoginNum = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 12345678 } });
  const badLoginNull = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: null } });
  const badSignupNum = await req2('POST', '/api/signup', { body: { name: 'Bad Pw', email: 'badpw807@t.local', password: 12345678, role: 'customer' } });
  const badSignupNull = await req2('POST', '/api/signup', { body: { name: 'Bad Pw', email: 'badpw807@t.local', password: null, role: 'customer' } });
  const badResetNum = await req2('POST', '/api/auth/reset', { body: { token: 'deadbeef', password: 12345678 } });
  t('v80.7 #1: login with a NUMERIC password gets the normal invalid-credentials answer (401), no throw', badLoginNum.status === 401);
  t('v80.7 #1: login with a NULL password gets the normal invalid-credentials answer (401), no throw', badLoginNull.status === 401);
  t('v80.7 #1: signup with a NUMERIC password is a clean 400', badSignupNum.status === 400);
  t('v80.7 #1: signup with a NULL password is a clean 400', badSignupNull.status === 400);
  t('v80.7 #1: reset with a NUMERIC password is a clean 400 (invalid link), no throw', badResetNum.status === 400);
  const health807 = await fetch(BASE2 + '/api/health');
  const goodLogin807 = await req2('POST', '/api/login', { body: { email: 'admin2@t.local', password: 'adminpass1' } });
  t('v80.7 #1: the server is STILL ALIVE afterwards and a valid login still works (hash semantics unchanged)', health807.ok && goodLogin807.status === 200 && !!goodLogin807.j.token);
  t('static v80.7 #1: the last-resort nets exist (unhandledRejection kept alive + handler-level catch)', serverSrc.includes("process.on('unhandledRejection'") && serverSrc.includes('handleRequest(req, res).catch('));

  // --- shared fixture: $250 cart — deposit via the LINK, balance via the APP ---
  const bookSplit807 = async (email, phone, name) => {
    const cust = await mkMember(email, phone);
    const cart = await req2('POST', '/api/admin/carts', { token: A807, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }, { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }], customerName: name } });
    const cid = cart.j.cart.id;
    await req2('POST', '/api/carts/' + cid + '/checkout', { token: cust.token, body: { name, phone, email, address: '5 Split St', city: 'Fairfield', when: 'Today' } });
    const sess = sessionForCart(cid, 'payment');
    await mockSessionPaid(sess.id);
    await fetch(BASE2 + '/cart/' + cid + '?paid=1&session_id=' + sess.id, { headers: { Authorization: 'Bearer ' + cust.token } });
    const ord = await ordOf807(cid);
    const pay = await req2('POST', '/api/orders/pay', { token: cust.token, body: { requestId: ord.id } });
    await mockPiStatus(pay.j.paymentIntentId, 'succeeded');
    const conf = await req2('POST', '/api/orders/pay-confirm', { token: cust.token, body: { requestId: ord.id, paymentIntentId: pay.j.paymentIntentId } });
    const ord2 = (await reqs807()).find(x => x.id === ord.id);
    return { cust, cid, ord: ord2, depPi: ord.payment.pi, balPi: pay.j.paymentIntentId, confStatus: conf.status };
  };

  // --- #4: refund dedupe — each PI refunded ONCE, recorded, cart disarmed ---
  const sR = await bookSplit807('split-r@t.local', '(707) 555-0281', 'Split Rae');
  t('v80.7 #4 setup: deposit via link + balance via app = PAID IN FULL, both legs stamped', sR.confStatus === 200 && !!sR.ord && sR.ord.payment.status === 'paid' && sR.ord.payment.balancePi === sR.balPi && !!sR.depPi);
  const rfBefore807 = stripeState.refunds.length;
  const rfR = await req2('POST', '/api/requests/' + sR.ord.id + '/refund', { token: A807, body: {} });
  const rfLegsR = stripeState.refunds.slice(rfBefore807);
  t('v80.7 #4: the refund completes (200) for exactly the $250 paid — not $500 of double-counted legs', rfR.status === 200 && rfR.j.refunded === 250);
  t('v80.7 #4: Stripe saw exactly TWO refunds — the deposit PI once, the balance PI once', rfLegsR.length === 2 && rfLegsR.filter(x => x.payment_intent === sR.depPi).length === 1 && rfLegsR.filter(x => x.payment_intent === sR.balPi).length === 1 && rfLegsR.reduce((s, x) => s + x.amount, 0) === 25000);
  const ordR2 = (await reqs807()).find(x => x.id === sR.ord.id);
  const cartsAdmR = await req2('GET', '/api/admin/carts', { token: A807 });
  const cartAdmR = (cartsAdmR.j.carts || []).find(x => x.id === sR.cid);
  const balAfterR = await req2('POST', '/api/carts/' + sR.cid + '/checkout', { body: { balance: true } });
  t('v80.7 #4: the refund is RECORDED (refundedCents + per-leg record), the order is Cancelled, the cart stays sealed and its link refuses any further balance charge (400)', !!ordR2 && ordR2.status === 'Cancelled' && !!ordR2.refund && ordR2.refund.refundedCents === 25000 && Array.isArray(ordR2.refund.legs) && ordR2.refund.legs.length === 2 && !!cartAdmR && cartAdmR.payState.balancePaid === true && balAfterR.status === 400);

  // --- #4b: a midway Stripe failure is RECORDED as partial; a retry finishes only the outstanding leg ---
  const sP = await bookSplit807('split-p@t.local', '(707) 555-0282', 'Split Pam');
  await fetch('http://127.0.0.1:8980/__failrefund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pi: sP.balPi }) });
  const rfBeforeP = stripeState.refunds.length;
  const rfP1 = await req2('POST', '/api/requests/' + sP.ord.id + '/refund', { token: A807, body: {} });
  const ordP1 = (await reqs807()).find(x => x.id === sP.ord.id);
  t('v80.7 #4b: a midway refund failure answers 502 and is RECORDED as partial ($50 leg only) — the order is NOT cancelled', rfP1.status === 502 && rfP1.j.partial === true && !!ordP1 && ordP1.status !== 'Cancelled' && !!ordP1.refund && ordP1.refund.partial === true && ordP1.refund.refundedCents === 5000);
  t('v80.7 #4b: only the deposit PI was refunded before the failure', stripeState.refunds.slice(rfBeforeP).filter(x => x.payment_intent === sP.depPi).length === 1 && stripeState.refunds.slice(rfBeforeP).filter(x => x.payment_intent === sP.balPi).length === 0);
  await fetch('http://127.0.0.1:8980/__failrefund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pi: '' }) });
  const rfP2 = await req2('POST', '/api/requests/' + sP.ord.id + '/refund', { token: A807, body: {} });
  const ordP2 = (await reqs807()).find(x => x.id === sP.ord.id);
  const cartsAdmP = await req2('GET', '/api/admin/carts', { token: A807 });
  const cartAdmP = (cartsAdmP.j.carts || []).find(x => x.id === sP.cid);
  const balAfterP = await req2('POST', '/api/carts/' + sP.cid + '/checkout', { body: { balance: true } });
  t('v80.7 #4b: the retry finishes ONLY the outstanding balance leg — $250 total, deposit PI never re-refunded, order Cancelled, cart sealed + link refused (400)', rfP2.status === 200 && rfP2.j.refunded === 250 && !!ordP2 && ordP2.status === 'Cancelled' && ordP2.refund.refundedCents === 25000 && !ordP2.refund.partial && stripeState.refunds.filter(x => x.payment_intent === sP.depPi).length === 1 && stripeState.refunds.filter(x => x.payment_intent === sP.balPi).length === 1 && !!cartAdmP && cartAdmP.payState.balancePaid === true && balAfterP.status === 400);

  // --- #8: a $0-refund cancellation cannot be resurrected by a late balance PI ---
  const custZ = await mkMember('zero-z@t.local', '(707) 555-0283');
  const cartZ = await req2('POST', '/api/admin/carts', { token: A807, body: { items: [{ serviceId: 'garbage-disposal-swap', name: 'Garbage Disposal Swap', qty: 1, unitPrice: 125 }, { serviceId: 'door-slab-swap', name: 'Door Slab Swap', qty: 1, unitPrice: 125 }], customerName: 'Zero Zed' } });
  const cidZ = cartZ.j.cart.id;
  await req2('POST', '/api/carts/' + cidZ + '/checkout', { token: custZ.token, body: { name: 'Zero Zed', phone: '7075550283', email: 'zero-z@t.local', address: '5 Zero St', city: 'Fairfield', when: 'Today' } });
  const sessZ = sessionForCart(cidZ, 'payment');
  await mockSessionPaid(sessZ.id);
  await fetch(BASE2 + '/cart/' + cidZ + '?paid=1&session_id=' + sessZ.id, { headers: { Authorization: 'Bearer ' + custZ.token } });
  const ordZ = await ordOf807(cidZ);
  const jobZ = await req2('POST', '/api/requests/' + ordZ.id + '/create-job', { token: A807, body: { payOffer: 75 } });
  const wZId = await mkWorker2('wz807@t.local', '(707) 555-0284', 'workpassZ807');
  await req2('PATCH', '/api/workers/' + wZId, { token: A807, body: { status: 'active' } });
  const WZ = (await req2('POST', '/api/login', { body: { email: 'wz807@t.local', password: 'workpassZ807' } })).j.token;
  await req2('POST', '/api/worker/connect/start', { token: WZ, body: {} });
  await req2('GET', '/api/worker/connect/status', { token: WZ });
  const claimZ = await req2('POST', '/api/jobs/' + jobZ.j.job.id + '/claim', { token: WZ, body: {} });
  const payZ = await req2('POST', '/api/orders/pay', { token: custZ.token, body: { requestId: ordZ.id } });
  const rfZ = await req2('POST', '/api/requests/' + ordZ.id + '/refund', { token: A807, body: {} });
  t('v80.7 #8 setup: a dispatched $50-deposit order cancels with a $0 refund (the kept fee covers the whole $50)', claimZ.status === 200 && payZ.status === 200 && rfZ.status === 200 && rfZ.j.refunded === 0);
  const ordZ1 = (await reqs807()).find(x => x.id === ordZ.id);
  t('v80.7 #8 setup: after the $0 refund the order is Cancelled but its payment still reads DEPOSIT (the resurrection window)', !!ordZ1 && ordZ1.status === 'Cancelled' && ordZ1.payment.status === 'deposit');
  await wh2('payment_intent.succeeded', { id: payZ.j.paymentIntentId, status: 'succeeded', amount: 20000, amount_received: 20000, metadata: { kind: 'menu-order', requestId: ordZ.id } });
  const ordZ2 = (await reqs807()).find(x => x.id === ordZ.id);
  const audZ = await req2('GET', '/api/admin/audit', { token: A807 });
  const dupsZ = (audZ.j.entries || []).filter(e => e.action === 'balance.duplicate' && e.target === ordZ.id);
  t('v80.7 #8: the late balance PI does NOT resurrect the cancelled order — stays Cancelled + DEPOSIT, and the duplicate alert fires', !!ordZ2 && ordZ2.status === 'Cancelled' && ordZ2.payment.status === 'deposit' && dupsZ.length === 1);

  // --- #9: a Yard-only member cannot confirm HomeCare off the Yard subscription ---
  const y807 = await mkMember('yard-only807@t.local', '(707) 555-0285');
  const ySub = await req2('POST', '/api/stripe/membership-subscribe', { token: y807.token, body: { plan: 'yard1' } });
  await mockActivate(ySub.j.subscriptionId);
  const yConf = await req2('POST', '/api/stripe/membership-confirm', { token: y807.token, body: { plan: 'yard1' } });
  const hcTry = await req2('POST', '/api/stripe/homecare-confirm', { token: y807.token, body: {} });
  const yMe = await req2('GET', '/api/me', { token: y807.token });
  t('v80.7 #9: homecare-confirm REJECTS a Yard-only subscription (400) — no free HomeCare off a Yard plan', yConf.status === 200 && yConf.j.active === true && hcTry.status === 400);
  t('v80.7 #9: the account stays Yard — homeCareStatus none, plan type yard', !!yMe.j.user && yMe.j.user.homeCareStatus === 'none' && yMe.j.user.membershipType === 'yard');

  // --- #31: ASAP rides on labor only (the nodisc haul add-on is excluded) ---
  const menuPost807 = (tk, menuOrder) => req2('POST', '/api/requests', { token: tk, body: { service: 'Menu order', description: 'v80.7 asap pin', address: '9 Audit Way', city: 'Fairfield', when: 'Today', estimateType: 'menu', menuOrder } });
  const guest807 = (await req2('POST', '/api/signup', { body: { name: 'Guest 807', email: 'guest807@t.local', password: 'password123', phone: '7075550286', role: 'customer' } })).j.token;
  const haulExtras807 = [{ id: 'haul-toilet', name: 'Remove & haul away the old toilet', price: 50 }];
  const asapG = await menuPost807(guest807, { serviceId: 'toilet-replacement', extras: haulExtras807, asap: true, joinedMembership: false, totals: { list: 225, member: 190, due: 225 } });
  t('v80.7 #31: guest ASAP fee is 25% of LABOR $175 = $44 (the $50 haul add-on is NOT multiplied) — due $269, not $281', asapG.status === 201 && asapG.j.request.menuOrder.totals.asapFee === 44 && asapG.j.request.menuOrder.totals.due === 269);
  const m807 = await mkMember('member807@t.local', '(707) 555-0287');
  const sub807 = await req2('POST', '/api/stripe/homecare-subscribe', { token: m807.token, body: {} });
  await mockActivate(sub807.j.subscriptionId);
  const conf807 = await req2('POST', '/api/stripe/homecare-confirm', { token: m807.token, body: {} });
  const asapM = await menuPost807(m807.token, { serviceId: 'toilet-replacement', extras: haulExtras807, asap: true, joinedMembership: false, totals: { list: 225, member: 190, due: 190 } });
  t('v80.7 #31: member ASAP fee is 25% of the DISCOUNTED labor $140 = $35 — due $225, not $238', conf807.status === 200 && conf807.j.active === true && asapM.status === 201 && asapM.j.request.menuOrder.totals.asapFee === 35 && asapM.j.request.menuOrder.totals.due === 225);

  // --- #21 (client): typed money parses with comma stripping ---
  t('static v80.7 #21: parseMoneyInput exists and BOTH hold actions use it (the raw parseFloat form is gone)', htmlSrc.includes('function parseMoneyInput(') && htmlSrc.includes('const cents=parseMoneyInput(v);') && !htmlSrc.includes('Math.round(parseFloat(v)*100)'));
  t('v80.7 #21: "1,000" parses to $1,000.00 (100000 cents) — not $1.00', run('parseMoneyInput("1,000")') === 100000);
  t('v80.7 #21: "$1,000.50" parses to 100050 and a plain "250" still parses to 25000', run('parseMoneyInput("$1,000.50")') === 100050 && run('parseMoneyInput("250")') === 25000);

  // --- v80.7 (form fix): POST /api/jobs refuses a missing/empty pay offer (the Create-a-job placeholder trap) ---
  const jobsBefore807 = (await req2('GET', '/api/jobs', { token: A807 })).j.jobs || [];
  const noPay807 = await req2('POST', '/api/jobs', { token: A807, body: { service: 'Form fix pin', city: 'Fairfield' } });
  const emptyPay807 = await req2('POST', '/api/jobs', { token: A807, body: { service: 'Form fix pin', city: 'Fairfield', payOffer: '' } });
  const jobsAfterBad807 = (await req2('GET', '/api/jobs', { token: A807 })).j.jobs || [];
  t('v80.7 form: POST /api/jobs with payOffer missing or empty -> 400 and NO job is created', noPay807.status === 400 && emptyPay807.status === 400 && jobsAfterBad807.length === jobsBefore807.length);
  const goodPay807 = await req2('POST', '/api/jobs', { token: A807, body: { service: 'Form fix pin OK', city: 'Fairfield', payOffer: 75 } });
  t('v80.7 form: POST /api/jobs with payOffer 75 succeeds and the created job shows payOffer 75', goodPay807.status === 201 && !!goodPay807.j.job && goodPay807.j.job.payOffer === 75);
  if (goodPay807.j && goodPay807.j.job) await req2('DELETE', '/api/jobs/' + goodPay807.j.job.id, { token: A807 });
  t('static v80.7 form: Create-a-job money placeholders are marked as examples (Ej:) and the client pay guard exists', htmlSrc.includes('id="jPay" placeholder="Ej: 75"') && htmlSrc.includes('id="jCustPrice" placeholder="Ej: 150"') && htmlSrc.includes('the example is not a value'));
}

try { child2.kill('SIGTERM'); } catch (e) {}
try { stripeMock.close(); } catch (e) {}
try { resendMock.close(); } catch (e) {}

// ---------------- summary ----------------
console.log('');
console.log('==== GHS suite (v28): PASS ' + pass + ' / FAIL ' + fail + ' ====');
if (failures.length) { console.log('failed tests:'); failures.forEach(f => console.log('  - ' + f)); }
try { child.kill('SIGTERM'); } catch (e) {}
try { geoServer.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

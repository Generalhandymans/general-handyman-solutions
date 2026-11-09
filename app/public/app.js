
let me=null, curMode='login';
// Public storefront (added 2026-10-21): a logged-out visitor lands on the
// plan comparison grid, NOT on the login form. The auth box stays hidden
// until the visitor asks for it (header "Member log in", the technician
// entry, or a join flow that needs the form).
let authRevealed = false;
function showLogin(){
  authRevealed = true;
  if (isMembershipRoute() || isYardCalendarRoute() || isInfoRoute()) location.hash = '';
  render();
  mode('login');
  document.getElementById('authBox').scrollIntoView({ behavior: 'smooth' });
}
// Every price the member form shows derives from JOIN_PLAN_INFO — the plan
// the visitor actually selected — never from the static HomeCare
// defaults baked into the HTML. (Gabriel caught the card label staying at
// the old price during Yard/Plus joins, 2026-10-21.) v17: there is ONE member form
// with an in-form plan selector, and the member tab opens that same form —
// so BOTH red-box notes are re-rendered from the SELECTED plan's template:
// #joinChargeNote (the summary at the top of the form) and #hcChargeNote
// ("el mensajito de abajo en rojo"). v18: Gabriel liked that little red
// box, so it is BACK at the bottom of the form — below the card fields,
// just above the submit button — VISIBLE in both member modes (join and
// the legacy homecare render), naming the selected plan, its total
// monthly price and its included perks (the yard visit is named for the
// Yard/Plus plans; Yard perks include the free FIRST in-person estimate —
// members of every plan get their first on-site estimate free). Its text
// always follows the selection — it can never show a stale default next to another
// plan's form. Also: the HomeCare promo box at the bottom of the form is
// hidden while the member form is up, so the only price on screen is the
// selected plan's.
// The plan the member form is currently selling: the armed pending join if
// there is one, else whatever the in-form selector shows, else HomeCare.
function memberFormPlan(){
  if (pendingJoin && JOIN_PLAN_INFO[pendingJoin.plan]) return pendingJoin.plan;
  const sel = document.getElementById('aPlanSel');
  if (sel && sel.value && JOIN_PLAN_INFO[sel.value]) return sel.value;
  return 'homecare';
}
// v88 (Gabriel, caught live on his phone, 2026-11-07): the member
// picker's FREE option — the join form's no-plan state. FREE is NOT a
// JOIN_PLAN_INFO plan: no price, no trial and no charge rail keys off
// it. It is selected exactly when the picker shows 'free' and no paid
// join is armed; while selected, the member form presents AND submits
// as a plain free customer registration (the v77 New customer rails):
// no card row, no service-address gate, no checkout — the account
// alone, identical in the data model to a New customer signup.
function joinFreeSelected(){
  if (pendingJoin) return false;
  const sel = document.getElementById('aPlanSel');
  return !!(sel && sel.value === 'free');
}
// v80.10.1: the join/auth/checkout price notes are built as ONE text node
// on purpose — inline tags at word boundaries extract as fused words
// ("JoiningHomeCare Plus… charged$100") in text audits. Keep them tag-free.
function syncAuthPriceTexts(m){
  const info = (m === 'join' || m === 'homecare') ? JOIN_PLAN_INFO[memberFormPlan()] : null;
  const hc = document.getElementById('hcChargeNote');
  const perks = (menuLang() === 'es' && info && info.perksEs) ? info.perksEs : (info ? info.perks : '');
  const fill = function(t){ return t.replace(/\{name\}/g, info.name).replace(/\{amt\}/g, info.monthly).replace(/\{perks\}/g, perks); };
  if (hc && info) hc.innerHTML = fill(CU(info.kind === 'homecare' ? 'hcNoteFreeTpl' : 'hcNotePaidTpl'));
  const lbl = document.getElementById('cardChargeLabel');
  if (lbl && info) lbl.textContent = fill(CU(info.kind === 'homecare' ? 'cardLblFreeTpl' : 'cardLblPaidTpl'));
  const promo = document.getElementById('hcPromo');
  if (promo) promo.style.display = (m === 'join' || m === 'customer' || isWorkerEntry()) ? 'none' : 'block';
}
// ---------- v77: plain signup + OPTIONAL membership (Gabriel, 2026-10-25) ----------
// "Estábamos presionando mucho pa' que paguen": the New customer tab is a
// FREE account form — name / email / phone / password and nothing else.
// An explicit tap on the tab is a fresh start: any plan armed by an
// earlier CTA or by the Stripe.js fallback is DROPPED (that state was
// the screenshot bug — the plan picker, banner and priced button stuck
// to the plain form with no way out). Inside the form, an optional
// membership picker (default: no membership) offers the plans without
// pressure; picking one reveals the membership fields and arms the same
// post-signup checkout resume the member-join path uses.
function plainSignupTab(){
  pendingMembershipPlan = null;
  const s = document.getElementById('aOptPlan');
  if (s) s.value = '';
  mode('customer');
}
function optPlanPicked(){
  const s = document.getElementById('aOptPlan');
  return !!(s && s.value && JOIN_PLAN_INFO[s.value]);
}
function optPlanChanged(){ if (curMode === 'customer') mode('customer'); }
function paintOptPlanNote(){
  const note = document.getElementById('optPlanNote');
  if (!note) return;
  const s = document.getElementById('aOptPlan');
  const info = (s && JOIN_PLAN_INFO[s.value]) ? JOIN_PLAN_INFO[s.value] : null;
  if (!info) { note.style.display = 'none'; note.innerHTML = ''; return; }
  note.style.display = 'block';
  note.innerHTML = CU(info.kind === 'homecare' ? 'optNoteFreeTpl' : 'optNotePaidTpl').replace(/\{name\}/g, info.name).replace(/\{amt\}/g, info.monthly);
}
function mode(m){ curMode=m;
  // The member tab IS the join form now (v17): landing on it — via the tab
  // ('join') or the legacy 'homecare' render — must never wipe the plan the
  // visitor already picked. (Gabriel: picked Yard, tapped the member tab,
  // and the form tried to sell him HomeCare at the old price.) Only the
  // login/customer/worker tabs clear a pending join, as before.
  if (m !== 'join' && m !== 'homecare') pendingJoin = null;
  document.getElementById('tabLogin').classList.toggle('on', m==='login');
  document.getElementById('tabCustomer').classList.toggle('on', m==='customer');
  document.getElementById('tabHomecare').classList.toggle('on', m==='homecare' || m==='join');
  document.getElementById('tabWorker').classList.toggle('on', m==='worker');
  document.getElementById('nameRow').style.display = m==='login' ? 'none':'block';
  document.getElementById('phoneRow').style.display = m==='login' ? 'none':'block';
  // Account-first fallback (v35): when Stripe.js could not load, the join
  // stays ARMED in pendingMembershipPlan on the plain signup form — the
  // plan selector, the plan note and the priced button must stay visible
  // there too, so the visitor always sees WHICH plan and WHAT price.
  const fbInfo = (m==='customer' && pendingMembershipPlan && JOIN_PLAN_INFO[pendingMembershipPlan.plan]) ? JOIN_PLAN_INFO[pendingMembershipPlan.plan] : null;
  // v77: on the plain customer form the membership fields (service
  // address, home details, preferred start) render ONLY when a plan is
  // actually in play — the armed fallback plan (fbInfo) or a plan the
  // visitor picked in the optional-membership picker. A plain signup
  // shows account fields + the optional offer, nothing more.
  const custPlan = !!fbInfo || (m==='customer' && optPlanPicked());
  // v88: the member form in its FREE state (picker on 'free', no paid
  // join armed) shows exactly the plain signup's fields — the paid
  // membership surfaces below all stay down.
  const joinFree = (m === 'join' && joinFreeSelected());
  const optRow = document.getElementById('optPlanRow');
  if (optRow) optRow.style.display = (m==='customer' && !fbInfo) ? 'block':'none';
  document.getElementById('serviceAddressRow').style.display = ((m==='join' && !joinFree) || (m==='customer' && custPlan)) ? 'block':'none';
  const planSelRow = document.getElementById('planSelRow');
  if (planSelRow) planSelRow.style.display = (m==='join' || m==='homecare' || fbInfo) ? 'block':'none';
  const forgotRow = document.getElementById('forgotRow');
  if (forgotRow) forgotRow.style.display = (m==='login' && !isWorkerEntry()) ? 'block':'none';
  const joinAgreeRow = document.getElementById('joinAgreeRow');
  if (joinAgreeRow) joinAgreeRow.style.display = ((m==='join' && !joinFree) || m==='homecare' || fbInfo) ? 'block':'none';
  const workerAgreeRow = document.getElementById('workerAgreeRow');
  if (workerAgreeRow) workerAgreeRow.style.display = m==='worker' ? 'block':'none';
  const serviceAddressHint = document.getElementById('serviceAddressHint');
  if (serviceAddressHint) serviceAddressHint.textContent = (pendingMembershipPlan || (pendingJoin && pendingJoin.kind !== 'homecare'))
    ? CU('saHintPlan')
    : CU('saHintPlain');
  document.getElementById('workerExtra').style.display = m==='worker' ? 'block':'none';
  // v84: the class cards (step 1) + the "tus datos" step label belong to
  // the worker application only; entering worker mode consumes a pending
  // door preselect (/tecnico · /ayudante) and repaints the pick.
  const wcr84 = document.getElementById('workerClassRow');
  if (wcr84) wcr84.style.display = m==='worker' ? 'block':'none';
  const wdr84 = document.getElementById('workerDatosRow');
  if (wdr84) wdr84.style.display = m==='worker' ? 'block':'none';
  if (m === 'worker') { consumeDoorClass(false); paintWorkerClass(); }
  const homeGroupEl = document.getElementById('homeGroup');
  if (homeGroupEl) homeGroupEl.style.display = ((m==='join' && !joinFree) || m==='homecare' || (m==='customer' && custPlan)) ? 'block':'none';
  const startGroupEl = document.getElementById('startGroup');
  if (startGroupEl) startGroupEl.style.display = ((m==='join' && !joinFree) || m==='homecare' || (m==='customer' && custPlan)) ? 'block':'none';
  document.getElementById('hcChargeNote').style.display = m==='homecare' ? 'block':'none';
  document.getElementById('joinChargeNote').style.display = (m==='join' || fbInfo) ? 'block':'none';
  document.getElementById('cardRow').style.display = (m==='homecare' || (m==='join' && !joinFree)) ? 'block':'none';
  syncAuthPriceTexts(m);
  if (fbInfo) { const promoEl = document.getElementById('hcPromo'); if (promoEl) promoEl.style.display = 'none'; } // the armed plan is the only price on this form — never a competing HomeCare promo under a Yard/Plus fallback
  document.getElementById('authBtn').textContent = (m==='homecare' || (m==='join' && !joinFree)) ? CU('btnJoinTpl').replace('{amt}', JOIN_PLAN_INFO[memberFormPlan()].monthly) : (fbInfo ? CU('btnContinueTpl').replace('{amt}', fbInfo.monthly) : (m==='login' ? CU('btnLogin') : CU('btnCreate')));
  if (m==='homecare') ensureStripe();
  paintOptPlanNote();
  const tlrM = document.getElementById('techLinkRow');
  if (tlrM) tlrM.style.display = isWorkerEntry() ? 'none' : 'block';
  applyWorkerLang();
}
// ---------- Worker-zone language (v71, Gabriel 2026-10-25) ----------
// The technician zone speaks ONE language at a time, exactly like the
// in-app Menu: an EN | ES toggle (top of the technician login card AND
// top of the worker dashboard), persisted in localStorage
// ('ghsWorkerLang'). Default: Spanish when arriving through the
// technician door (/tecnico sets the sticky ghs_entry flag), English
// otherwise — until the worker picks; a stored pick always wins.
// Customer areas keep their own language handling and are untouched.
const W_I18N = {
  en: {
    workerTitle: 'Technician login', tabWorker: 'New technician application', techSignIn: '🔨 Technician sign in', workerEnter: '🔨 Log in', createAccount: 'Create account',
    authHintWorker: '<b>1.</b> Type your email &nbsp;<b>2.</b> Your password &nbsp;<b>3.</b> Tap <b>LOG IN</b> — and see the open jobs.<br><span class="mut">Use the email + password from your application. New here? Tap <b>New technician application</b> to apply — the Team reviews every application before jobs unlock.</span>',
    rescueBtn: 'First time or forgot your password? Tap here', rescueNote: 'First time or forgot your password? Tap the button — we email you a link to set it. Type your email above first.', rescueNoEmail: 'No access to that email anymore? Call or text the Team: (707) 862-3773',
    agreeApplyPre: 'By applying you agree to the', termsLink: 'Terms & Conditions', custLinkQ: 'Are you a customer?', loginHere: 'Log in here →', forgotPw: 'Forgot my password',
    forgotNeedEmail: 'Type your email above first, then tap "Forgot my password".',
    classStep: '1 · Pick your class', datosStep: '2 · Your info', classTecnico: 'Technician', classTecnicoSub: 'I have a trade and experience', classTecnicoLines: 'Handyman · Plumbing · Electrical · Carpentry · Painting · Mechanic',
    classAyudante: 'Helper', classAyudanteSub: 'I want to work and learn', classAyudanteLines: 'General help · Cleanup · Yard work · Job support · No experience needed — learn here',
    classRequired: 'First pick your class in step 1: Technician or Helper.', techOnlyStep: 'Technicians only', primaryTradeLabel: 'Main trade', primaryTradePh: 'Select your trade', primaryTradePainting: 'Painting',
    ownToolsLabel: 'Your own tools?', ownTransportLabel: 'Your own transportation?', classYes: 'Yes', classNo: 'No',
    applyingAs: 'Applying as', roleSkilled: 'Skilled subcontractor', roleHelper: 'Helper', cityLive: 'City you live in', areasWork: 'Areas you can work',
    skillsTap: 'Skills — tap all that apply', skGeneral: 'General handyman', skCarpentry: 'Carpentry', skPaint: 'Paint & drywall', skElectrical: 'Electrical swaps', skPlumbing: 'Plumbing help', skMechanic: 'Mobile mechanic', skInstalls: 'Installs & assembly', skYard: 'Landscaping / yard',
    tradesAppLabel: 'Your trades — your level in each (1 = knows nothing · 3 = good, works solo · 5 = master) — and check if you have the tools',
    lvl1: '1 — Nothing', lvl2: '2 — Helper', lvl3: '3 — Good', lvl4: '4 — Advanced', lvl5: '5 — Master', toolsFlag: '🔧 Tools',
    trade_handyman: 'Handyman (general)', trade_carpentry: 'Carpentry', trade_electrical: 'Electrical', trade_plumbing: 'Plumbing', trade_gardening: 'Gardening', trade_hvac: 'HVAC', trade_mechanic: 'Mechanic',
    gearLabel: 'What do you have? — tap all that apply', gearBasic: 'Basic hand tools', gearPower: 'Power tools', gearDrill: 'Drill/driver', gearSaws: 'Saws', gearLadder: 'Ladder', gearTruckbed: 'Truck bed/toolbox', gearTrailer: 'Trailer', gearPpe: 'PPE/safety gear', gearNone: 'No tools yet',
    expLabel: 'Experience', expLt1: 'Less than 1 year', exp12: '1–2 years', exp35: '3–5 years', exp5p: '5+ years',
    vehicleLabel: 'Vehicle style', vehPickup: 'Pickup truck', vehVan: 'Work van', vehSuv: 'SUV', vehSedan: 'Sedan/hatchback', vehEbike: 'E-bike', vehNone: 'No vehicle / need a ride', vehOther: 'Other',
    haulLabel: 'Can your vehicle haul materials?', haulYes: 'Yes — truck/van/trailer loads', haulSmall: 'Small materials only', haulNo: 'No hauling', haulNa: 'Not applicable',
    licenseLabel: 'License / ID', licDriver: 'Driver license', licId: 'State ID only', licWorking: 'Working on it',
    insuranceLabel: 'Insurance', insHas: 'Has general liability', insNo: 'No insurance yet', insUnsure: 'Not sure',
    availLabel: 'Availability', availPh: 'Weekdays / weekends / anytime', notesLabel: 'Anything the Team should know?', notesPh: 'Your experience, specialties, anything important',
    connectGateTitle: '💵 Work now — your pay waits in the app', connectGateMsg: 'You can take jobs now, even without Stripe Connect', connectGateBody: 'Your pay for each finished job is held in the app until you connect Stripe Connect — then it pays out to your own bank. Setup takes about 2 minutes: your ID and your bank.', connectGateBtn: 'Connect Stripe Connect',
    connectHeldLine: '💰 {amt} of your pay is ready and waiting — it pays out to your bank as soon as your Stripe Connect setup is finished.', viewDetails: '🔎 View details', closeDetails: 'Close details', detailTitle: 'Job details', detailUnavailable: 'This job could not be opened.',
    availDaysLabel: 'Days you can work', availShiftsLabel: 'Shifts', shiftMorning: 'Mornings', shiftAfternoon: 'Afternoons', shiftEvening: 'Evenings', availOnDemand: '⚡ Available for on-demand / urgent jobs',
    permTitle: '⚙️ Finish setting up your app', permNotif: '🔔 Notifications', permNotifSub: 'Alerts with the hammer sound 🔨', permLoc: '📍 Your location', permLocSub: 'Jobs and live route', activate: 'ACTIVATE',
    permHelpT: 'Blocked it? Turn them on in your browser settings: tap the 🔒 lock next to the address → Permissions.',
    permWhyWorker: 'So we can alert you when a job drops in your area and share your route, turn on these two permissions.', permWhyCustomer: 'So we can tell you when your technician is on the way, turn on these two permissions.',
    stateOnF: '✅ On', stateOn: '✅ On', stateBlockedF: '❌ Blocked', stateBlocked: '❌ Blocked',
    noNotifSupport: 'This browser does not support notifications.', notifDone: '🔔 Done! That hammer sound is how your alerts will sound.', noLocSupport: 'This browser does not support location.', locDone: '📍 Done! Location is on.', locFail: 'Could not turn it on — check your browser permissions.',
    openJobs: 'Open job offers', yardVisitsTitle: 'My yard visits', yardIntro: 'Yard visits the Team assigns to you — the address appears here once you are assigned. To finish a visit you need a BEFORE photo and an AFTER photo.',
    statusActive: 'You are ACTIVE — these are the open job offers from the Team. Pick the ones you want: first pick wins, and the Team confirms the address and time with you here.', statusInactive: 'Your account is "{status}" — the Team must activate you before you can claim jobs.',
    ratingLine: ' Your customer rating: ★ {avg} ({n} {jobs}).', ratedJob1: 'rated job', ratedJobN: 'rated jobs',
    payOffer: 'Pay offer:', detailsConfirmed: 'Your job details (Team-confirmed):', addressTime: 'Address & exact time:', addressTimeNote: 'the Team confirms them with you here before the job — you never need the customer\'s phone, the Team coordinates everything.', teamNotes: 'Team notes:', noJobs: 'No open job offers right now — check back when the Team posts one.',
    payoutSent: '💳 Payout sent to your bank ✓', payoutLabel: '💳 Payout: ',
    pickJob: 'Pick this job', onMyWay: '🚗 On my way', arrived: '📍 Arrived', sharingLoc: '📍 Sharing location', stopSharing: 'Stop sharing', resumeSharing: 'Resume location sharing', markDone: 'Mark done — photos sent',
    trackBanner: '📍 Sharing your location for job {id} — sharing runs while the app is open; we keep your screen awake during the trip, and it stops when you tap Arrived.',
    trackNoLoc: 'Location is not available on this device, so the live map cannot follow you — your status still updates for the Team.', trackLocOff: 'Location permission is off — turn it on so your customer can follow your arrival.', tripLocRequired: 'You must share your location to tap On My Way',
    locLineOn: '📍 Sharing location', locLinePaused: '⏸ Paused — your location is not shared', locLineMustTitle: 'You must share your location while logged in to work jobs', locLineMustBody: 'The Team needs it to dispatch you jobs — turn on the browser/app location permission and reload the app.',
    moneyTitle: 'My money', payoutsOn: '💳 Payouts are ON', payoutsOnBody: 'When you finish a job, your pay is sent automatically to your bank via Stripe. Nothing else to do.',
    setupTitle: '💳 Set up your payouts', finishSetupTitle: '💳 Finish your payout setup', setupBody: 'Get paid automatically the moment you finish a job — Stripe sends your pay straight to your bank. One-time setup, about 2 minutes: your ID and your bank.',
    setupBtn: 'Set up payouts with Stripe', continueSetupBtn: 'Continue setup with Stripe', paidOutLabel: 'Paid out to you:', pendingLabel: 'Pending:', noPayouts: 'No payouts yet — when you finish a job, its pay shows up here.', connectFail: 'Could not start Stripe setup — try again.',
    st_paid: 'Paid', st_awaiting_payment: 'Awaiting payment', st_awaiting_capture: 'Awaiting payment', st_awaiting_worker_setup: 'Awaiting your setup', st_pending_funds: 'Pending funds', st_pending: 'Pending', st_error: 'Error — talk to the Team', st_stripe_off: 'Stripe off',
    skillBannerTitle: '⚠️ Rate your trades', skillBannerBody: '{n} of 7 trades still unrated. The Team matches jobs to your level in each trade — rate them in <b>My trades</b> below.', skillBannerBtn: 'Go to My trades',
    profileTitle: 'My profile', photoTitle: 'Profile photo', photoNote: 'Customers see your photo on their technician card and on the live map.', removePhoto: 'Remove photo', photoSaved: 'Photo saved ✓', photoRemoved: 'Photo removed',
    nameLabel: 'Name', phoneLabel: 'Phone', cityLabel: 'City you live in', areasLabel: 'Areas you can work', skillsWordsLabel: 'Skills (words)', skillsPh: 'Plumbing, Carpentry, Paint & drywall...',
    availTitle: 'Availability', availAnytime: 'Anytime', availWeekdays: 'Weekdays', availWeekends: 'Weekends', availCustom: 'Specific days',
    day_0: 'Sun', day_1: 'Mon', day_2: 'Tue', day_3: 'Wed', day_4: 'Thu', day_5: 'Fri', day_6: 'Sat',
    pausedLabel: '⏸ <b>Paused</b> — don\'t send me new jobs', saveProfile: 'Save profile', saved: 'Saved ✓',
    tradesTitle: 'My trades', tradesIntro: 'Your level in each trade: <b>1</b> knows nothing · <b>2</b> helper · <b>3</b> good, works solo · <b>4</b> advanced · <b>5</b> master. Mark 🔧 if you have the tools for that trade. The Team may verify your level over time.', verified: 'Verified', clearTitle: 'Clear', saveTrades: 'Save trades',
    areaTitle: 'My area', captainOf: 'Captain of', cities: 'Cities:', overridePre: 'Override (5% from the house): accrued', overridePaid: 'paid', overrideNote: 'It accrues when a job in your area finishes (Done — photos sent) with the payment captured. Flat services, junk and hauling don\'t accrue. The Team pays it by hand.',
    jobsInArea: 'Jobs in my area', technician: 'Technician:', unassigned: 'unassigned', teamInArea: 'Team in my area', noJobsArea: 'No jobs in your area yet.', noTeamArea: 'No other technicians cover this area yet.', pausedTag: '⏸ Paused · ', availabilityWord: 'Availability:',
    salesTitle: '💰 Sell & earn', salesIntro: 'Send your customer our booking link for a service — they pay right in the app (a deposit books it, the balance at completion), the job lands on YOU, and you keep 68% of what the customer pays when you complete it. You never touch the customer\'s card.',
    listPrice: 'Customer pays', youEarn: 'You earn', sendLinkBtn: 'Get booking link', linkReady: 'Your booking link — send it to your customer:', copyBtn: 'Copy', copiedOk: 'Copied ✓',
    commissionLine: 'Sales commission', distAway: 'mi away', unmeasuredTag: 'distance not measured yet',
    wEstTitle: '🧾 Create an estimate', wEstIntro: 'Custom work that is not on the menu: describe it, estimate the hours — the app suggests the price at $75/hr and sends it straight to the customer (no Team approval needed). You keep 68% of what the customer pays when you complete the job. If a price would break the company margin, the app raises it to the minimum that works and tells you.',
    wCustName: 'Customer name', wCustEmail: 'Customer email', wCustPhone: 'Customer phone', wServiceName: 'Service / job title', wScopePh: 'Describe the work exactly — the customer approves this text', wHours: 'Estimated hours', wPriceOpt: 'Price (optional — blank = $75/hr)', wCityName: 'City', wSendEst: 'Send estimate to the customer', wEstSent: 'Estimate sent ✓ — it is in the customer\'s account and the job lands on you when they pay.', wMyEstimates: 'My estimates', wNoEstimates: 'No estimates yet — create your first one above.', wEstRaised: 'Price adjusted by the system to protect the margin: ', wEstLink: 'Estimate link:',
    refTitle: '🎁 My referral link', refIntro: 'Share your link: when someone joins a membership through it and pays their FIRST real charge, you earn a $10 bounty — paid through your Stripe, like your job pay. (A free trial month does not count — the bounty lands when the first charge does.)',
    refYourLink: 'Your link:', refSignups: 'People who joined with your link', refNoSignups: 'Nobody yet — share your link and this list grows.', refEarned: 'Bounties paid:', refPending: 'Bounties pending:', refBountyWord: 'bounty',

    availAdmin: 'Availability:', inPause: '⏸ PAUSED', tradesAdminLabel: 'Trades (1–5):', notRatedYet: 'Not rated yet', notRatedNote: '— the worker has not rated himself in the app yet', diceWord: 'says', verifiedWord: 'verified', tradesNoteAdmin: 'Trades (★ = effective level, 🔧 = has tools; the Team verifies):', verifOpt: 'verify: —',
    addressLabel: 'Address:', yardLabel: 'Yard:', homeNotesLabel: 'Home notes:', teamNotesLabel: 'Team notes:', beforePhoto: 'Before photo', afterPhoto: 'After photo', markDoneYard: '✅ Mark done', needsPhotos: 'needs the BEFORE and AFTER photos first', doneWord: 'Done', yardNone: 'No yard visits assigned to you right now.', photoFailed: 'Photo failed',
    chatOpen: 'Job chat is open — say hello.', chatPh: 'Message about this job...', chatSend: 'Send',
    delTitle: 'Delete my account', delIntro: 'You can delete your account and personal information yourself, right here. This is permanent.', delWhatTitle: 'What happens when you delete your account:',
    delLi1: 'Your profile and login are deleted, and you are signed out everywhere.', delLi2: 'Any active membership is cancelled effective immediately. Membership payments are prepaid and are <b>not refunded</b>.', delLi3: 'Past invoices and payment records are kept in anonymized form (no name, email, phone, or address) for tax and legal purposes.', delLi4: 'Work still in progress must be finished — or reassigned by the Team — before your account can be deleted.',
    delTypeLabel: 'Type your account email address to confirm', delYes: 'Yes, delete my account permanently', delKeep: 'Keep my account', delNeedEmail: 'Type your account email address to confirm.', delDoneTitle: 'Your account has been deleted', delDoneBody: 'Your profile, login, and membership are gone. Thank you for being with General Handyman Solutions — the Team is at (707) 862-3773 if you ever need us again.',
    loadingGeneric: 'Loading…', errGeneric: 'Could not load this — check your connection.', retryBtn: '↻ Retry'
  },
  es: {
    workerTitle: 'Inicio de técnico', tabWorker: 'Solicitud de técnico nuevo', techSignIn: '🔨 Entrar como técnico', workerEnter: '🔨 ENTRAR', createAccount: 'Crear cuenta',
    authHintWorker: '<b>1.</b> Escribe tu correo &nbsp;<b>2.</b> Tu contraseña &nbsp;<b>3.</b> Toca <b>ENTRAR</b> — y ves los jales abiertos.<br><span class="mut">Usa el correo y la contraseña de tu aplicación. ¿Nuevo aquí? Toca <b>Solicitud de técnico nuevo</b> para aplicar — el Team revisa cada aplicación antes de desbloquear los trabajos.</span>',
    rescueBtn: '¿Primera vez o no recuerdas tu contraseña? Toca aquí', rescueNote: '¿Primera vez o no recuerdas tu contraseña? Toca el botón — te mandamos un correo con un link para crearla. Escribe tu correo arriba primero.', rescueNoEmail: '¿Ya no tienes acceso a ese correo? Llama o textea al Team: (707) 862-3773',
    agreeApplyPre: 'Al aplicar aceptas los', termsLink: 'Términos y Condiciones', custLinkQ: '¿Eres cliente?', loginHere: 'Entra aquí →', forgotPw: 'Olvidé mi contraseña',
    forgotNeedEmail: 'Escribe tu correo arriba primero, luego toca "Olvidé mi contraseña".',
    classStep: '1 · Elige tu clase', datosStep: '2 · Tus datos', classTecnico: 'Técnico', classTecnicoSub: 'Tengo oficio y experiencia', classTecnicoLines: 'Handyman · Plomería · Electricidad · Carpintería · Pintura · Mecánica',
    classAyudante: 'Ayudante', classAyudanteSub: 'Quiero trabajar y aprender', classAyudanteLines: 'Ayuda general · Limpieza · Yarda · Apoyo en trabajos · Sin experiencia — aprende aquí',
    classRequired: 'Primero elige tu clase en el paso 1: Técnico o Ayudante.', techOnlyStep: 'Solo técnicos', primaryTradeLabel: 'Oficio principal', primaryTradePh: 'Selecciona tu oficio', primaryTradePainting: 'Pintura',
    ownToolsLabel: '¿Herramientas propias?', ownTransportLabel: '¿Transporte propio?', classYes: 'Sí', classNo: 'No',
    applyingAs: 'Aplicando como', roleSkilled: 'Subcontratista calificado', roleHelper: 'Ayudante', cityLive: 'Ciudad donde vives', areasWork: 'Áreas donde puedes trabajar',
    skillsTap: 'Habilidades — toca todas las que apliquen', skGeneral: 'Handyman general', skCarpentry: 'Carpintería', skPaint: 'Pintura y drywall', skElectrical: 'Cambios eléctricos', skPlumbing: 'Ayuda de plomería', skMechanic: 'Mecánico móvil', skInstalls: 'Instalaciones y armado', skYard: 'Jardinería / yarda',
    tradesAppLabel: 'Tus oficios — tu nivel en cada uno (1 = no sabe nada · 3 = bueno, trabaja solo · 5 = master) — y marca si tienes la herramienta',
    lvl1: '1 — Nada', lvl2: '2 — Ayudante', lvl3: '3 — Bueno', lvl4: '4 — Avanzado', lvl5: '5 — Master', toolsFlag: '🔧 Herramienta',
    trade_handyman: 'Handyman (general)', trade_carpentry: 'Carpintería', trade_electrical: 'Electricidad', trade_plumbing: 'Plomería', trade_gardening: 'Jardinería', trade_hvac: 'HVAC', trade_mechanic: 'Mecánica',
    gearLabel: '¿Qué tienes? — toca todo lo que aplique', gearBasic: 'Herramienta básica de mano', gearPower: 'Herramienta eléctrica', gearDrill: 'Taladro/atornillador', gearSaws: 'Sierras', gearLadder: 'Escalera', gearTruckbed: 'Caja de troca/caja de herramientas', gearTrailer: 'Tráiler', gearPpe: 'Equipo de seguridad (PPE)', gearNone: 'Sin herramienta todavía',
    expLabel: 'Experiencia', expLt1: 'Menos de 1 año', exp12: '1–2 años', exp35: '3–5 años', exp5p: '5+ años',
    vehicleLabel: 'Tipo de vehículo', vehPickup: 'Troca pickup', vehVan: 'Van de trabajo', vehSuv: 'SUV', vehSedan: 'Sedán/hatchback', vehEbike: 'Bici eléctrica', vehNone: 'Sin vehículo / necesito ride', vehOther: 'Otro',
    haulLabel: '¿Tu vehículo puede cargar materiales?', haulYes: 'Sí — cargas de troca/van/tráiler', haulSmall: 'Solo materiales pequeños', haulNo: 'No cargo', haulNa: 'No aplica',
    licenseLabel: 'Licencia / ID', licDriver: 'Licencia de manejar', licId: 'Solo ID estatal', licWorking: 'En trámite',
    insuranceLabel: 'Seguro', insHas: 'Tiene seguro general', insNo: 'Sin seguro todavía', insUnsure: 'No estoy seguro',
    availLabel: 'Disponibilidad', availPh: 'Entre semana / fines de semana / cuando sea', notesLabel: '¿Algo que el Team debe saber?', notesPh: 'Tu experiencia, especialidades, lo importante',
    connectGateTitle: '💵 Trabaja ya — tu paga espera en la app', connectGateMsg: 'Ya puedes agarrar jales, aunque todavía no tengas Stripe Connect', connectGateBody: 'Tu paga de cada jale terminado se guarda en la app hasta que conectes Stripe Connect — y de ahí se paga a tu propio banco. La configuración toma unos 2 minutos: tu ID y tu banco.', connectGateBtn: 'Conectar Stripe Connect',
    connectHeldLine: '💰 {amt} de tu paga está lista y esperando — se paga a tu banco en cuanto termines tu configuración de Stripe Connect.', viewDetails: '🔎 Ver detalles', closeDetails: 'Cerrar detalles', detailTitle: 'Detalles del trabajo', detailUnavailable: 'Este trabajo no se pudo abrir.',
    availDaysLabel: 'Días que puedes trabajar', availShiftsLabel: 'Turnos', shiftMorning: 'Mañanas', shiftAfternoon: 'Tardes', shiftEvening: 'Noches', availOnDemand: '⚡ Disponible para jales on-demand / urgentes',
    permTitle: '⚙️ Termina de activar tu app', permNotif: '🔔 Notificaciones', permNotifSub: 'Avisos con el sonido del martillo 🔨', permLoc: '📍 Tu ubicación', permLocSub: 'Trabajos y ruta en vivo', activate: 'ACTIVAR',
    permHelpT: '¿Tocaste "Bloquear"? Actívalos desde los ajustes de tu navegador: toca el candado 🔒 junto a la dirección → Permisos.',
    permWhyWorker: 'Para avisarte cuando caiga un jale en tu área y compartir tu ruta necesitas estos dos permisos.', permWhyCustomer: 'Para avisarte cuando tu técnico vaya en camino necesitas estos dos permisos.',
    stateOnF: '✅ Activadas', stateOn: '✅ Activada', stateBlockedF: '❌ Bloqueadas', stateBlocked: '❌ Bloqueada',
    noNotifSupport: 'Este navegador no soporta notificaciones.', notifDone: '🔔 ¡Listo! Así suena el martillo cuando te cae un aviso.', noLocSupport: 'Este navegador no soporta ubicación.', locDone: '📍 ¡Listo! Ubicación activada.', locFail: 'No se pudo activar — revisa los permisos de tu navegador.',
    openJobs: 'Trabajos abiertos', yardVisitsTitle: 'Mis visitas de yarda', yardIntro: 'Las visitas de yarda que el Team te asigna — la dirección aparece aquí cuando te asignan. Para terminar una visita necesitas una foto de ANTES y una de DESPUÉS.',
    statusActive: 'Estás ACTIVO — estos son los trabajos abiertos del Team. Agarra los que quieras: el primero que lo toma se lo queda, y el Team te confirma la dirección y la hora aquí mismo.', statusInactive: 'Tu cuenta está "{status}" — el Team debe activarte antes de que puedas tomar trabajos.',
    ratingLine: ' Tu calificación de clientes: ★ {avg} ({n} {jobs}).', ratedJob1: 'trabajo calificado', ratedJobN: 'trabajos calificados',
    payOffer: 'Pago ofrecido:', detailsConfirmed: 'Detalles de tu trabajo (confirmados por el Team):', addressTime: 'Dirección y hora exacta:', addressTimeNote: 'el Team te los confirma aquí antes del trabajo — nunca necesitas el teléfono del cliente, el Team coordina todo.', teamNotes: 'Notas del Team:', noJobs: 'No hay trabajos abiertos ahorita — vuelve cuando el Team publique uno.',
    payoutSent: '💳 Pago enviado a tu banco ✓', payoutLabel: '💳 Pago: ',
    pickJob: 'Tomar este trabajo', onMyWay: '🚗 En camino', arrived: '📍 Ya llegué', sharingLoc: '📍 Compartiendo ubicación', stopSharing: 'Dejar de compartir', resumeSharing: 'Seguir compartiendo ubicación', markDone: 'Marcar terminado — fotos enviadas',
    trackBanner: '📍 Compartiendo tu ubicación para el trabajo {id} — se comparte mientras la app está abierta; mantenemos tu pantalla encendida durante el viaje, y se detiene cuando tocas Ya llegué.',
    trackNoLoc: 'La ubicación no está disponible en este teléfono, así que el mapa en vivo no puede seguirte — tu estatus sí se actualiza para el Team.', trackLocOff: 'El permiso de ubicación está apagado — actívalo para que tu cliente pueda seguir tu llegada.', tripLocRequired: 'Debes compartir tu ubicación para marcar En camino',
    locLineOn: '📍 Compartiendo ubicación', locLinePaused: '⏸ En pausa — tu ubicación no se comparte', locLineMustTitle: 'Debes compartir tu ubicación mientras estás conectado para trabajar', locLineMustBody: 'El Team lo necesita para despacharte trabajos. Activa el permiso de ubicación del navegador/app y recarga la app.',
    moneyTitle: 'Mi dinero', payoutsOn: '💳 Tus pagos están ACTIVOS', payoutsOnBody: 'Cuando terminas un trabajo, tu pago se manda automáticamente a tu banco vía Stripe. Nada más que hacer.',
    setupTitle: '💳 Configura tus pagos', finishSetupTitle: '💳 Termina de configurar tus pagos', setupBody: 'Recibe tu pago automáticamente en cuanto terminas un trabajo — Stripe manda tu pago directo a tu banco. Se configura una sola vez, unos 2 minutos: tu ID y tu banco.',
    setupBtn: 'Configurar pagos con Stripe', continueSetupBtn: 'Continuar la configuración con Stripe', paidOutLabel: 'Pagado a tu banco:', pendingLabel: 'Pendiente:', noPayouts: 'Todavía no hay pagos registrados — cuando terminas un trabajo, su pago aparece aquí.', connectFail: 'No se pudo iniciar la configuración de Stripe — intenta de nuevo.',
    st_paid: 'Pagado', st_awaiting_payment: 'Esperando el pago del cliente', st_awaiting_capture: 'Esperando el pago del cliente', st_awaiting_worker_setup: 'Falta tu configuración de Stripe', st_pending_funds: 'Fondos en camino', st_pending: 'Pendiente', st_error: 'Error — habla con el Team', st_stripe_off: 'Stripe no conectado',
    skillBannerTitle: '⚠️ Califica tus oficios', skillBannerBody: 'Te faltan {n} de 7 oficios por calificar. El Team te manda trabajos según tu nivel en cada oficio — califícalos en <b>Mis oficios</b> aquí abajo.', skillBannerBtn: 'Ir a Mis oficios',
    profileTitle: 'Mi perfil', photoTitle: 'Foto de perfil', photoNote: 'El cliente ve tu foto en su tarjeta del técnico y en el mapa en vivo.', removePhoto: 'Quitar foto', photoSaved: 'Foto guardada ✓', photoRemoved: 'Foto eliminada',
    nameLabel: 'Nombre', phoneLabel: 'Teléfono', cityLabel: 'Ciudad donde vives', areasLabel: 'Áreas que cubres', skillsWordsLabel: 'Habilidades (texto)', skillsPh: 'Plomería, Carpintería, Pintura y drywall...',
    availTitle: 'Disponibilidad', availAnytime: 'Cuando sea', availWeekdays: 'Entre semana', availWeekends: 'Fines de semana', availCustom: 'Días específicos',
    day_0: 'Dom', day_1: 'Lun', day_2: 'Mar', day_3: 'Mié', day_4: 'Jue', day_5: 'Vie', day_6: 'Sáb',
    pausedLabel: '⏸ <b>No disponible por ahora</b> — no me manden trabajos nuevos', saveProfile: 'Guardar perfil', saved: 'Guardado ✓',
    tradesTitle: 'Mis oficios', tradesIntro: 'Tu nivel en cada oficio: <b>1</b> no sabe nada · <b>2</b> ayudante · <b>3</b> bueno, trabaja solo · <b>4</b> avanzado · <b>5</b> master. Marca 🔧 si tienes la herramienta de ese oficio. El Team puede verificar tu nivel con el tiempo.', verified: 'Verificado', clearTitle: 'Borrar', saveTrades: 'Guardar oficios',
    areaTitle: 'Mi área', captainOf: 'Capitán de', cities: 'Ciudades:', overridePre: 'Override (5% de la casa): acumulado', overridePaid: 'pagado', overrideNote: 'Se acumula cuando un trabajo de tu área termina (Done — photos sent) con el pago capturado. Servicios flat, junk y hauling no acumulan. El Team lo paga a mano.',
    jobsInArea: 'Trabajos en mi área', technician: 'Técnico:', unassigned: 'sin asignar', teamInArea: 'Equipo en mi área', noJobsArea: 'Todavía no hay trabajos en tu área.', noTeamArea: 'Todavía ningún otro técnico cubre esta área.', pausedTag: '⏸ En pausa · ', availabilityWord: 'Disponibilidad:',
    salesTitle: '💰 Vende y gana', salesIntro: 'Mándale a tu cliente nuestro link de reserva de un servicio — paga directo en la app (un anticipo lo agenda, el resto al terminar), el trabajo te cae a TI, y te quedas el 68% de lo que paga el cliente cuando lo completas. Tú nunca tocas la tarjeta del cliente.',
    listPrice: 'El cliente paga', youEarn: 'Tú ganas', sendLinkBtn: 'Crear link de reserva', linkReady: 'Tu link de reserva — mándaselo a tu cliente:', copyBtn: 'Copiar', copiedOk: 'Copiado ✓',
    commissionLine: 'Comisión de venta', distAway: 'mi de distancia', unmeasuredTag: 'distancia aún sin medir',
    wEstTitle: '🧾 Crear un estimado', wEstIntro: 'Trabajo a la medida que no está en el menú: descríbelo, estima las horas — la app sugiere el precio a $75/hr y se lo manda directo al cliente (sin necesitar aprobación del Team). Te quedas el 68% de lo que paga el cliente cuando completas el trabajo. Si un precio rompe el margen de la compañía, la app lo sube al mínimo que funciona y te avisa.',
    wCustName: 'Nombre del cliente', wCustEmail: 'Email del cliente', wCustPhone: 'Teléfono del cliente', wServiceName: 'Servicio / título del trabajo', wScopePh: 'Describe el trabajo exacto — el cliente aprueba este texto', wHours: 'Horas estimadas', wPriceOpt: 'Precio (opcional — vacío = $75/hr)', wCityName: 'Ciudad', wSendEst: 'Enviar el estimado al cliente', wEstSent: 'Estimado enviado ✓ — está en la cuenta del cliente y el trabajo te cae a ti cuando pague.', wMyEstimates: 'Mis estimados', wNoEstimates: 'Todavía no tienes estimados — crea el primero arriba.', wEstRaised: 'Precio ajustado por el sistema para proteger el margen: ', wEstLink: 'Link del estimado:',
    refTitle: '🎁 Mi link de referido', refIntro: 'Comparte tu link: cuando alguien se hace miembro por tu link y paga su PRIMER cargo real, ganas $10 de bono — pagado por tu Stripe, como tu pago de trabajos. (El mes gratis de prueba no cuenta — el bono cae cuando cae el primer cargo.)',
    refYourLink: 'Tu link:', refSignups: 'Gente que se unió con tu link', refNoSignups: 'Nadie todavía — comparte tu link y esta lista crece.', refEarned: 'Bonos pagados:', refPending: 'Bonos pendientes:', refBountyWord: 'bono',

    availAdmin: 'Disponibilidad:', inPause: '⏸ EN PAUSA', tradesAdminLabel: 'Oficios (1–5):', notRatedYet: 'Sin calificar', notRatedNote: '— el trabajador todavía no se califica en la app', diceWord: 'dice', verifiedWord: 'verificado', tradesNoteAdmin: 'Oficios (★ = nivel efectivo, 🔧 = tiene herramienta; el Team verifica):', verifOpt: 'verif: —',
    addressLabel: 'Dirección:', yardLabel: 'Yarda:', homeNotesLabel: 'Notas de la casa:', teamNotesLabel: 'Notas del Team:', beforePhoto: 'Foto de antes', afterPhoto: 'Foto de después', markDoneYard: '✅ Marcar terminada', needsPhotos: 'necesita primero las fotos de ANTES y DESPUÉS', doneWord: 'Terminada', yardNone: 'No tienes visitas de yarda asignadas ahorita.', photoFailed: 'La foto falló',
    chatOpen: 'El chat del trabajo está abierto — saluda.', chatPh: 'Mensaje sobre este trabajo...', chatSend: 'Enviar',
    delTitle: 'Borrar mi cuenta', delIntro: 'Puedes borrar tu cuenta y tu información personal tú mismo, aquí mismo. Es permanente.', delWhatTitle: 'Qué pasa cuando borras tu cuenta:',
    delLi1: 'Tu perfil y tu acceso se borran, y se cierra tu sesión en todos lados.', delLi2: 'Cualquier membresía activa se cancela con efecto inmediato. Los pagos de membresía son por adelantado y <b>no se reembolsan</b>.', delLi3: 'Las facturas y registros de pago pasados se guardan de forma anonimizada (sin nombre, correo, teléfono ni dirección) por requisitos fiscales y legales.', delLi4: 'El trabajo en curso debe terminarse — o ser reasignado por el Team — antes de que puedas borrar tu cuenta.',
    delTypeLabel: 'Escribe el correo de tu cuenta para confirmar', delYes: 'Sí, borrar mi cuenta para siempre', delKeep: 'Quedarme con mi cuenta', delNeedEmail: 'Escribe el correo de tu cuenta para confirmar.', delDoneTitle: 'Tu cuenta ha sido borrada', delDoneBody: 'Tu perfil, tu acceso y tu membresía ya no existen. Gracias por estar con General Handyman Solutions — el Team está al (707) 862-3773 si nos necesitas otra vez.',
    loadingGeneric: 'Cargando…', errGeneric: 'No se pudo cargar — revisa tu conexión.', retryBtn: '↻ Reintentar'
  }
};
let _workerLangChoice = null; // explicit/stored pick only — the derived default is re-read until a pick exists
function workerLang(){
  if (_workerLangChoice) return _workerLangChoice;
  let stored = null;
  try { stored = localStorage.getItem('ghsWorkerLang'); } catch(e) {}
  if (stored === 'es' || stored === 'en') { _workerLangChoice = stored; return _workerLangChoice; }
  let entry = '';
  try { entry = localStorage.getItem('ghs_entry') || ''; } catch(e) {}
  return (entry === 'worker' || location.hash === '#worker') ? 'es' : 'en';
}
function WT(k){ const d = W_I18N[workerLang()]; return (d && d[k] != null) ? d[k] : (W_I18N.en[k] != null ? W_I18N.en[k] : k); }
// v80.19: the ONE active language for any non-worker surface — admin
// chrome too (Gabriel works in both; the toggle rules everywhere).
function langOf(u){ return u && u.role === 'worker' ? workerLang() : menuLang(); }
function wTradeName(k){ return WT('trade_' + k); }
function setWorkerLang(l){
  _workerLangChoice = (l === 'es') ? 'es' : 'en';
  try { localStorage.setItem('ghsWorkerLang', _workerLangChoice); } catch(e) {}
  applyWorkerEntry();
  applyWorkerLang();
  if (me && me.role === 'worker') {
    workerProfileFor = null; myTradeEdits = null; // rebuild the profile form in the new language
    loadJobs(); loadWorkerProfile(); loadPayouts(); loadWorkerSales(); loadWorkerEstimates(); loadWorkerReferrals(); loadCaptainArea(); loadWorkerYardVisits();
    paintWorkerLocLine();
    const dw = document.getElementById('delWarn-W');
    if (!dw || dw.style.display === 'none') { delAcctPaintedFor = ''; paintDeleteAccount(); }
  }
  refreshPermCard();
  // v80.19: same switch as the customer toggle — keep both in step.
  _menuLang = _workerLangChoice;
  try { localStorage.setItem('ghsMenuLang', _menuLang); } catch (e) {}
  persistLangPref(_workerLangChoice);
  if (typeof applyMenuLang === 'function') applyMenuLang();
  if (typeof renderMenu === 'function') renderMenu();
}
function applyWorkerLang(){
  const L = workerLang();
  ['workerLangEnA', 'workerLangEnW'].forEach(function(idv){ const b = document.getElementById(idv); if (b) b.classList.toggle('on', L === 'en'); });
  ['workerLangEsA', 'workerLangEsW'].forEach(function(idv){ const b = document.getElementById(idv); if (b) b.classList.toggle('on', L === 'es'); });
  const rowA = document.getElementById('workerLangRowA');
  if (rowA) rowA.style.display = (isWorkerEntry() || curMode === 'worker') ? '' : 'none';
  document.querySelectorAll('[data-w]').forEach(function(el){ el.textContent = WT(el.getAttribute('data-w')); });
  document.querySelectorAll('[data-wp]').forEach(function(el){ el.setAttribute('placeholder', WT(el.getAttribute('data-wp'))); });
  document.querySelectorAll('[data-wt]').forEach(function(el){ el.textContent = wTradeName(el.getAttribute('data-wt')); });
  // The auth button speaks the worker language in the worker faces
  // (the priced join labels of the member modes are never touched).
  const ab = document.getElementById('authBtn');
  if (ab && isWorkerEntry() && curMode === 'login') ab.textContent = WT('workerEnter');
  else if (ab && curMode === 'worker') ab.textContent = WT('createAccount');
}
// ---------- Separate worker entry (added 2026-10-19) ----------
// Workers get their own login screen via #worker (like the pros do —
// worker and customer logins are never mixed). Landing page "Worker login"
// buttons point here.
function isWorkerEntry(){ return location.hash === '#worker'; }
function applyWorkerEntry(){
  const w = isWorkerEntry();
  // Customer funnel (default): login + new-customer tabs, HomeCare front and
  // center, worker login demoted to a small link. Worker entry (#worker):
  // login + new-worker tabs only.
  const tabC = document.getElementById('tabCustomer');
  if (tabC) tabC.style.display = w ? 'none' : '';
  const tabW = document.getElementById('tabWorker');
  if (tabW) tabW.style.display = w ? '' : 'none';
  const tabH = document.getElementById('tabHomecare');
  if (tabH) tabH.style.display = w ? 'none' : '';
  const h = document.querySelector('#authBox h3');
  if (h) h.textContent = w ? WT('workerTitle') : CU('authTitleLogin');
  const hint = document.getElementById('authHint');
  if (hint) { if (w) hint.innerHTML = WT('authHintWorker'); else hint.textContent = CU('authHintLogin'); }
  if (!w && typeof paintAuthFace === 'function') paintAuthFace();
  const hc = document.getElementById('hcPromo');
  if (hc) hc.style.display = (w || curMode === 'join') ? 'none' : 'block';
  const tlr = document.getElementById('techLinkRow');
  if (tlr) tlr.style.display = w ? 'none' : 'block';
  const cl = document.getElementById('custLinkRow');
  if (cl) cl.style.display = w ? 'block' : 'none';
  if (w && (curMode === 'customer' || curMode === 'homecare')) mode('login');
  // v63: sticky technician door + the simple worker login face. A phone
  // that came in as a technician reopens as a technician next time (the
  // boot snippet below reads this flag); only the explicit "Are you a
  // customer?" link clears it. In worker mode the login button says
  // ENTRAR and the password-rescue button shows.
  // v80.10.1: merely VISITING #worker no longer arms that flag — it is
  // armed by an actual worker login (syncEntryFlag in doAuth/loadMe) and
  // cleared at logout, so a logged-out visitor is never bounced to the
  // technician door by a stale flag.
  const rr = document.getElementById('workerRescueRow');
  if (rr) rr.style.display = w ? 'block' : 'none';
  // v72 (L-6 + L-9): in the technician face there is ONE password path —
  // the big v63 rescue button — so the small "Forgot my password" row
  // hides here (it stays on the customer face), and the "login is email
  // + password only" note hides too (the steps above already say it).
  const fr2 = document.getElementById('forgotRow');
  if (fr2 && w) fr2.style.display = 'none';
  const lon = document.getElementById('loginOnlyNote');
  if (lon) lon.style.display = w ? 'none' : 'block';
  if (!w && curMode === 'worker') mode('login');
  // v84: a logged-out visitor who arrived through /tecnico or /ayudante
  // lands straight on the application with his class preselected.
  if (w && !me) consumeDoorClass(true);
  applyWorkerLang();
}
window.addEventListener('hashchange', applyWorkerEntry);
// ---------- Direct HomeCare join (added 2026-10-19) ----------
// "Join now" charges the membership right away: logged-in customers
// go straight to Stripe checkout; logged-out visitors create their account
// first, then land on the checkout automatically.
async function startHomeCareCheckout(){
  try{
    const d = await api('/api/stripe/checkout',{method:'POST', body:JSON.stringify({kind:'homecare', lang:menuLang()})});
    location.href = d.url;
  }catch(e){ showErr(e.message); }
}
function joinHomeCare(){
  if (me) { startHomeCareCheckout(); return; }
  // Guests land on the ONE member form with HomeCare preselected — the
  // plan selector inside the form lets them switch before paying.
  beginInlineJoin('homecare', 'homecare');
}
// ---------- Memberships page: Yard Care + HomeCare Plus (added 2026-10-21) ----------
// Same rule as HomeCare: membership requires an account. Logged-out
// visitors are routed to create-account/login first; the chosen plan is
// kept in pendingMembershipPlan and checkout resumes right after auth.
// Prices are fixed server-side — the page only sends a plan key.
let pendingMembershipPlan = null;
let pendingAddressCheckout = null;
// One-submit join (added 2026-10-21): a visitor tapping a plan CTA (front-page
// grid, memberships page, or a #join-* deep link) gets ONE inline form —
// account + service address + card together — instead of signup-then-
// checkout. pendingJoin = { kind, plan } while that form is up. Labels and
// prices here are display-only; the server plan map stays authoritative.
let pendingJoin = null;
const JOIN_PLAN_INFO = {
  homecare: { name: 'HomeCare', monthly: 29, kind: 'homecare', perks: 'First month FREE • 20% off any job • Free first in-person estimate • Cancel anytime.', perksEs: 'Primer mes GRATIS • 20% menos en cualquier trabajo • Primer estimado en persona gratis • Cancela cuando quieras.' },
  yard1: { name: 'Yard Care', monthly: 75, kind: 'yardcare', perks: 'Monthly yard care • Free first in-person estimate • One total charge • Cancel anytime.', perksEs: 'Cuidado de yarda mensual • Primer estimado en persona gratis • Un solo cobro total • Cancela cuando quieras.' },
  yard2: { name: 'Yard Care', monthly: 150, kind: 'yardcare', perks: 'Monthly yard care • Free first in-person estimate • One total charge • Cancel anytime.', perksEs: 'Cuidado de yarda mensual • Primer estimado en persona gratis • Un solo cobro total • Cancela cuando quieras.' },
  plus1: { name: 'HomeCare Plus', monthly: 100, kind: 'homecare-plus', perks: '20% off any job • Free first in-person estimate • 1 yard visit / month included • Cancel anytime.', perksEs: '20% menos en cualquier trabajo • Primer estimado en persona gratis • 1 visita de yarda / mes incluida • Cancela cuando quieras.' },
  plus2: { name: 'HomeCare Plus', monthly: 175, kind: 'homecare-plus', perks: '20% off any job • Free first in-person estimate • 2 yard visits / month included • Cancel anytime.', perksEs: '20% menos en cualquier trabajo • Primer estimado en persona gratis • 2 visitas de yarda / mes incluidas • Cancela cuando quieras.' }
};
// Re-render every price-bearing string of the member form from the plan
// currently selected; the in-form selector and pendingJoin are kept in
// lockstep so what the visitor sees is exactly what submit will charge.
function renderJoinTexts(){
  // v88: the FREE state has no plan info to price from — its note is
  // the $0 promise and its button is the plain Create account.
  if (curMode === 'join' && joinFreeSelected()) {
    const noteF = document.getElementById('joinChargeNote');
    if (noteF) noteF.innerHTML = CU('joinNoteFree0Tpl');
    const btnF = document.getElementById('authBtn');
    if (btnF) btnF.textContent = CU('btnCreate');
    if (typeof isJoinPromoActive === 'function' && isJoinPromoActive()) renderJoinPromo();
    return;
  }
  syncAuthPriceTexts('join');
  const plan = memberFormPlan();
  const info = JOIN_PLAN_INFO[plan];
  const sel = document.getElementById('aPlanSel');
  if (sel && sel.value !== plan) sel.value = plan;
  const note = document.getElementById('joinChargeNote');
  if (note && info) note.innerHTML = CU(info.kind === 'homecare' ? 'joinNoteFreeTpl' : 'joinNotePaidTpl').replace(/\{name\}/g, info.name).replace(/\{amt\}/g, info.monthly);
  const btn = document.getElementById('authBtn');
  if (btn && info) btn.textContent = CU('btnJoinTpl').replace('{amt}', info.monthly);
  // v80.17 PUERTA PLUS: while the promo door is up, its hero follows the
  // form's plan too (in-form selector switches repaint both).
  if (typeof isJoinPromoActive === 'function' && isJoinPromoActive()) renderJoinPromo();
}
function enterJoinMode(){
  mode('join');
  renderJoinTexts();
  // NOTE: no ensureStripe() here — beginInlineJoin/finishInlineJoin await
  // it (concurrent callers share the one in-flight attempt since v35).
}
// The in-form plan selector is the source of truth while the member form
// is up: switching it re-points pendingJoin (the address gate and the
// submit rails key off it) and instantly re-renders every price string.
function joinPlanChanged(){
  const sel = document.getElementById('aPlanSel');
  // v88: FREE picked — the visitor wants the account, not a plan.
  if (sel && sel.value === 'free') {
    if (pendingMembershipPlan && !pendingJoin) {
      // Stripe.js-fallback state: the picker rides the plain form, so
      // picking FREE drops the armed plan and lands on the plain
      // signup (the v77 escape rails — account only, offer unpicked).
      plainSignupTab();
      return;
    }
    // Inline join state: disarm every charge rail and re-present the
    // member form in its FREE state (mode + renderJoinTexts paint it:
    // no card row, no address gate, the $0 note, unpriced button).
    // Submit then runs the plain registration path — pendingJoin and
    // pendingMembershipPlan both null, so doAuth creates the account
    // and nothing else.
    pendingJoin = null;
    pendingMembershipPlan = null;
    mode('join');
    renderJoinTexts();
    return;
  }
  const plan = (sel && JOIN_PLAN_INFO[sel.value]) ? sel.value : 'homecare';
  if (pendingMembershipPlan && !pendingJoin) {
    // Account-first fallback (v35): the selector re-arms the FALLBACK plan —
    // the note, the button and the post-signup resume all follow it.
    pendingMembershipPlan = { kind: JOIN_PLAN_INFO[plan].kind, plan };
    mode('customer');
    renderMemberFallback();
    return;
  }
  pendingJoin = { kind: JOIN_PLAN_INFO[plan].kind, plan };
  mode('join');
  renderJoinTexts();
}
// The member tab ("New member — join a plan"): ONE signup for every plan.
// Arriving with a plan already picked — grid CTA, deep link, memberships
// page, or an armed Stripe.js-fallback selection — keeps THAT plan
// selected in the form; entering cold defaults the selector to HomeCare.
async function openMemberJoin(){
  if (pendingJoin && JOIN_PLAN_INFO[pendingJoin.plan]) { await beginInlineJoin(pendingJoin.kind, pendingJoin.plan); return; }
  if (pendingMembershipPlan && JOIN_PLAN_INFO[pendingMembershipPlan.plan]) { await beginInlineJoin(pendingMembershipPlan.kind, pendingMembershipPlan.plan); return; }
  await beginInlineJoin('homecare', 'homecare');
}
// The account-first fallback keeps the plan front and center (v35,
// Gabriel: "no muestra el tipo de membresía que estamos seleccionando"):
// the selector shows the armed plan and can switch it, the red note names
// the plan + its monthly price and promises the straight-to-checkout
// resume, and the button carries the price (mode() sets it). No error
// greeting — needing an account is the flow, not a failure.
function renderMemberFallback(){
  const pending = pendingMembershipPlan;
  const info = pending ? JOIN_PLAN_INFO[pending.plan] : null;
  if (!info) return;
  const sel = document.getElementById('aPlanSel');
  if (sel) sel.value = pending.plan;
  const note = document.getElementById('joinChargeNote');
  if (note) note.innerHTML = CU('fbNoteTpl').replace(/\{name\}/g, info.name).replace(/\{amt\}/g, info.monthly) + (info.kind === 'homecare' ? CU('fbNoteFreeSuffix').replace(/\{amt\}/g, info.monthly) : CU('fbNoteAddrSuffix'));
  hideErr();
}
async function beginInlineJoin(kind, plan){
  pendingJoin = { kind, plan };
  authRevealed = true;
  // v80.10.1: arming the form clears the join hash itself — raise the
  // nav flag so the hashchange listener does not read its own transition
  // as "visitor navigated back home" and dismiss the form it just opened.
  if (location.hash) { ghsJoinArmNav = true; location.hash = ''; } else render();
  enterJoinMode();
  scrollToJoinDoor();
  const okS = await ensureStripe();
  if (!okS || !cardEl) {
    // The inline form cannot run (Stripe.js or the publishable key is
    // unavailable): fall back to the classic flow — create the account
    // first, then the redirect checkout resumes automatically after signup.
    // v35: the fallback is NOT a bare error greeting — the form keeps
    // selling the armed plan (selector + plan note + priced button stay
    // visible, see renderMemberFallback), and re-tapping the member tab
    // retries the inline form now that ensureStripe no longer latches a
    // failure.
    pendingJoin = null;
    pendingMembershipPlan = { kind, plan };
    mode('customer');
    renderMemberFallback();
    scrollToJoinDoor();
  } else if (pendingMembershipPlan) {
    // The inline form owns this join now (pendingJoin) — a stale armed
    // fallback must not ALSO fire the post-signup redirect resume later.
    pendingMembershipPlan = null;
  }
}
async function finishInlineJoin(email){
  const btn = document.getElementById('authBtn');
  const pj = pendingJoin;
  const info = pj ? JOIN_PLAN_INFO[pj.plan] : null;
  if (pj && pj.plan === 'homecare') { await chargeHomeCare(email); return; } // selector rails: HomeCare never goes through membership-subscribe (the API 400s it) — the homecare inline endpoints charge it
  try {
    const okS = await ensureStripe();
    if (!okS || !cardEl) {
      // Inline payment cannot run after all — the account now exists, so
      // finish through the redirect checkout (address gate included).
      pendingJoin = null;
      await startMembershipCheckout(pj.kind, pj.plan);
      return;
    }
    btn.disabled = true; btn.textContent = CU('procPay');
    const s = await api('/api/stripe/membership-subscribe', { method: 'POST', body: JSON.stringify({ plan: pj.plan, source: campaignSource() }) });
    const conf = await stripeObj.confirmCardPayment(s.clientSecret, {
      payment_method: { card: cardEl, billing_details: {
        name: document.getElementById('aName').value.trim(),
        email,
        phone: document.getElementById('aPhone').value.trim()
      } }
    });
    if (conf.error) throw new Error(conf.error.message);
    const chk = await api('/api/stripe/membership-confirm', { method: 'POST', body: JSON.stringify({ plan: pj.plan }) });
    try { cardEl.clear(); } catch (e) {}
    btn.disabled = false;
    pendingJoin = null;
    if (chk.active) {
      document.getElementById('authBox').innerHTML = '<h3>' + CU('welcomeTpl').replace('{name}', info ? info.name : CU('welcomeYourPlan')) + '</h3><p>' + CU('memActiveTpl').replace('{amt}', info ? info.monthly : '') + (pj.kind === 'yardcare'
        ? CU('welcomeYardNote')
        : CU('welcomeEstNote')) + '</p>';
    }
    render();
  } catch (e) {
    btn.disabled = false;
    enterJoinMode();
    showErr(e.message);
  }
}
// Front-page grid FREE box: jump to the request form with the free photo
// estimate preselected (the existing flow — no account needed).
function goFreeEstimate(){
  if (location.hash) location.hash = ''; else render();
  const g = document.getElementById('cEst');
  if (g) g.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === 'photo'));
  wzState.est = 'photo';
  if (typeof custSummary === 'function') custSummary();
  wzGo(2);
}
// Dashboard CTA (2026-10-21): a member who still has their one free
// estimate opens the request form with the IN-PERSON estimate preselected;
// syncMemberPicker shows the FREE state from their account before they send.
function requestFreeEstimate(){
  if (location.hash) location.hash = ''; else render();
  const g = document.getElementById('cEst');
  if (g) g.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === 'inperson'));
  wzState.est = 'inperson';
  if (typeof syncMemberPicker === 'function') syncMemberPicker();
  if (typeof custSummary === 'function') custSummary();
  wzGo(2);
}
let membershipDeepLinkKey = '';
const MEMBERSHIP_JOIN_HASHES = {
  '#join-yard1': { kind: 'yardcare', plan: 'yard1', which: 'yard', visits: 1 },
  '#join-yard2': { kind: 'yardcare', plan: 'yard2', which: 'yard', visits: 2 },
  '#join-plus1': { kind: 'homecare-plus', plan: 'plus1', which: 'plus', visits: 1 },
  '#join-plus2': { kind: 'homecare-plus', plan: 'plus2', which: 'plus', visits: 2 },
  '#join-homecare': { kind: 'homecare', plan: 'homecare', which: 'homecare', visits: 0 }
};
function membershipJoinHashConfig(){ return MEMBERSHIP_JOIN_HASHES[location.hash] || null; }
function isTermsRoute(){ return location.hash === '#terms'; }
function isHowRoute(){ return location.hash === '#how-it-works'; }
function isPrivacyRoute(){ return location.hash === '#privacy'; }
function isInfoRoute(){ return isTermsRoute() || isHowRoute() || isPrivacyRoute(); }
function exitInfoView(){ if (location.hash) location.hash = ''; render(); }
function showHowSide(side){
  const tech = side === 'tech';
  const c = document.getElementById('howCust'); if (c) c.style.display = tech ? 'none' : 'block';
  const t2 = document.getElementById('howTech'); if (t2) t2.style.display = tech ? 'block' : 'none';
  const bc = document.getElementById('howTabCust'); if (bc) bc.classList.toggle('on', !tech);
  const bt = document.getElementById('howTabTech'); if (bt) bt.classList.toggle('on', tech);
}
function isMembershipRoute(){ return location.hash === '#memberships' || location.hash === '#yard-care' || !!membershipJoinHashConfig(); }
async function copyShareLink(url, button){
  try {
    await navigator.clipboard.writeText(url);
    if (button) { const old = button.textContent; button.textContent = 'Copied!'; setTimeout(() => { button.textContent = old; }, 1600); }
  } catch (e) { window.prompt('Copy this link:', url); }
}
function renderMembershipRouteMode(){
  const yardRoute = location.hash === '#yard-care';
  const heading = document.getElementById('membershipsHeading');
  if (heading) heading.textContent = yardRoute ? 'Yard Care Memberships' : 'Memberships';
  const intro = document.getElementById('membershipsIntro');
  if (intro) intro.textContent = yardRoute
    ? 'Yard work on one total monthly charge — never a per-visit charge. Cancel anytime. Joining needs a customer account and your service address: if you are not logged in, we take you to create one first, then straight to secure checkout.'
    : 'One total monthly charge per plan — never a per-visit charge. Cancel anytime. Joining a membership needs a customer account: if you are not logged in, we take you to create one first, then straight to secure checkout.';
  const hero = document.getElementById('yardCareHero');
  if (hero) hero.style.display = yardRoute ? 'block' : 'none';
  const share = document.getElementById('yardShareLinks');
  if (share) share.style.display = yardRoute ? 'block' : 'none';
  const pageLink = document.getElementById('yardCarePageLink');
  if (pageLink) pageLink.style.display = yardRoute ? 'none' : 'block';
  const homeCareCard = document.getElementById('homeCarePlanCard');
  if (homeCareCard) homeCareCard.style.display = yardRoute ? 'none' : '';
  const grid = document.getElementById('membershipGrid');
  if (grid) grid.style.display = yardRoute ? 'none' : '';
  const cg = document.getElementById('compareGridBox');
  if (cg) cg.style.display = yardRoute ? 'none' : 'block';
  if (yardRoute) syncYardCardImgs();
}
function queueMembershipDeepLink(){
  const cfg = membershipJoinHashConfig();
  if (!cfg) return;
  const key = location.hash + '|' + (me ? me.id : 'guest');
  if (membershipDeepLinkKey === key) return;
  membershipDeepLinkKey = key;
  // v80.17 PUERTA PLUS: a GUEST arriving on this deep link gets the promo
  // view for the plan (renderJoinPromo) — a logged-in user keeps the
  // plain membership flow exactly as before.
  if (!me) joinPromo = { plan: cfg.plan, kind: cfg.kind };
  if (cfg.which === 'yard' || cfg.which === 'plus') selectMembershipVisits(cfg.which, cfg.visits);
  setTimeout(() => { startMembershipCheckout(cfg.kind, cfg.plan); }, 0);
}
function exitMemberships(){
  if (location.hash) location.hash = '';
  render();
}
// ---------- v80.17 PUERTA PLUS: the promo landing for cold join deep links ----------
// The door itself already worked mechanically (/plus 302 → #join-plus1 →
// the deep link arms the plan in the one-submit join form) — but a cold
// guest landed on the GENERIC storefront: the form sat inside a card
// headed "Log in / Sign up" with the hero, popular services, every plan
// and the full menu competing around it, and no promotion anywhere.
// Gabriel, 2026-11-01: "el link no abre una promoción directamente; que
// puedan registrarse." So while a guest join is armed FROM A DEEP LINK,
// the app is one focused promo view (the render() branch below): the
// plan's hero — its EXISTING plan image, name, price and the settled
// benefit lines from the membership surfaces — with that same join form
// directly under it. Generic over the join-hash config: all five doors
// (#join-plus1/plus2/yard1/yard2/homecare) behave the same, each with
// its own plan's data. Logged-in users never enter promo mode. The
// guest is never trapped: the hero links to all plans / the storefront,
// and any other route (header nav included) leaves promo mode.
let joinPromo = null; // { plan, kind } — the deep link that armed promo mode
const JOIN_PROMO_UI = {
  en: { best: '⭐ BEST — our most complete plan', per: '/mo', formNote: 'Join right below — one form: account, service address and payment together.', compare: 'Compare all plans →', browse: 'Not now — browse all services & prices →' },
  es: { best: '⭐ EL MEJOR — nuestro plan más completo', per: '/mes', formNote: 'Únete aquí abajo — un solo formulario: cuenta, dirección de servicio y pago juntos.', compare: 'Comparar todos los planes →', browse: 'Ahora no — ver todos los servicios y precios →' }
};
// The benefit lines are the SETTLED membership copy, copied line-for-line
// from the plan cards / compare grid (EN) with their ES twins — no new
// offers, no new prices; name + price come from JOIN_PLAN_INFO.
const JOIN_PROMO_BENEFITS = {
  homecare: {
    en: ['First month FREE — for everyone (one per account)', '20% off labor (jobs under $1,000)', 'First in-person estimate FREE, then $50', 'Priority scheduling', 'Cancel anytime'],
    es: ['Primer mes GRATIS — para todos (uno por cuenta)', '20% menos en mano de obra (trabajos bajo $1,000)', 'Primer estimado en persona GRATIS, luego $50', 'Agenda prioritaria', 'Cancela cuando quieras']
  },
  yard1: {
    en: ['1 yard visit every month', 'Mowing · edging · blowing at every visit', 'Light weeding included', 'Free first in-person estimate', 'One total monthly charge — never a per-visit fee', 'Cancel anytime'],
    es: ['1 visita de yarda cada mes', 'Corte · orilla · soplado en cada visita', 'Deshierbe ligero incluido', 'Primer estimado en persona gratis', 'Un solo cargo mensual — nunca un cargo por visita', 'Cancela cuando quieras']
  },
  yard2: {
    en: ['2 yard visits every month', 'Mowing · edging · blowing at every visit', 'Light weeding included', 'Free first in-person estimate', 'One total monthly charge — never a per-visit fee', 'Cancel anytime'],
    es: ['2 visitas de yarda cada mes', 'Corte · orilla · soplado en cada visita', 'Deshierbe ligero incluido', 'Primer estimado en persona gratis', 'Un solo cargo mensual — nunca un cargo por visita', 'Cancela cuando quieras']
  },
  plus1: {
    en: ['1 yard visit every month', 'Everything in HomeCare — 20% off labor (jobs under $1,000)', 'First in-person estimate FREE, then $50 member estimates', 'Mowing · edging · blowing at every visit', 'One total monthly charge — never a per-visit fee', 'Priority scheduling · Cancel anytime'],
    es: ['1 visita de yarda cada mes', 'Todo HomeCare — 20% menos en mano de obra (trabajos bajo $1,000)', 'Primer estimado en persona GRATIS, luego $50 para miembros', 'Corte · orilla · soplado en cada visita', 'Un solo cargo mensual — nunca un cargo por visita', 'Agenda prioritaria · Cancela cuando quieras']
  },
  plus2: {
    en: ['2 yard visits every month', 'Everything in HomeCare — 20% off labor (jobs under $1,000)', 'First in-person estimate FREE, then $50 member estimates', 'Mowing · edging · blowing at every visit', 'One total monthly charge — never a per-visit fee', 'Priority scheduling · Cancel anytime'],
    es: ['2 visitas de yarda cada mes', 'Todo HomeCare — 20% menos en mano de obra (trabajos bajo $1,000)', 'Primer estimado en persona GRATIS, luego $50 para miembros', 'Corte · orilla · soplado en cada visita', 'Un solo cargo mensual — nunca un cargo por visita', 'Agenda prioritaria · Cancela cuando quieras']
  }
};
// The hero always sells the plan the FORM is armed with (what you see is
// what submit charges): the live pending join wins, then the armed
// account-first fallback, then the plan the deep link arrived with.

let _menuLang = null; // declared early (v80.19): CU()/menuLang() are reachable from the boot-time mode('login') paint, long before the menu section below
// v80.19 IDIOMA: the customer-side twin of W_I18N — every customer
// surface string that used to be hardcoded (or bilingual-combined)
// lives here, keyed once per language, rendered through CU() in the
// ACTIVE menuLang. The technician zone keeps WT(); admin keeps its
// own dictionaries. One language at a time, everywhere.
const CUST_UI = {
en: {
  authTitleMember: 'Member login', authTitleLogin: 'Log in / Sign up',
  authHintLogin: 'No account needed to request a quote — just send it and we reply by email. Create an account to track jobs, pay invoices online, or join HomeCare.',
  authHintJoin: 'Create your account — your plan starts the moment you tap Join. You can cancel anytime from your account.',
  authHintPlain: '',
  lblFullName: 'Full name', lblPhone: 'Phone', lblEmail: 'Email', lblPassword: 'Password',
  lblServiceAddress: 'Service address (for membership visits)',
  lblEmailAddress: 'Email address',
  saHintPlan: 'Required to join this membership — the Team uses this address to schedule your included visits.',
  saHintPlain: 'Optional for a regular account. Required when joining Yard Care or HomeCare Plus.',
  btnLogin: 'Log in', btnCreate: 'Create account',
  btnJoinTpl: 'Create account & join — ${amt}/mo', btnContinueTpl: 'Create account & continue — ${amt}/mo',
  planPer: '/mo', planYardVisits: 'Monthly yard plan — {n} visit(s) / month', planPlusVisits: 'Monthly plan — PLUS {n} yard visit(s) / month included',
  hcNoteFreeTpl: '{name} — ${amt}/mo total. Your first month is FREE — $0 charged today, then ${amt}/mo (one free month per account). {perks}', hcNotePaidTpl: '{name} — ${amt}/mo total. Your card will be charged ${amt} today, then ${amt}/mo. {perks}',
  cardLblFreeTpl: 'Card — $0 charged today, then ${amt}/mo', cardLblPaidTpl: 'Card — charged ${amt} today, then ${amt}/mo',
  optNoteFreeTpl: '{name} — your first month is FREE. $0 at checkout today, then ${amt}/mo (one free month per account). Tap Create account and we take you straight to secure checkout to start it. Cancel anytime.', optNotePaidTpl: '{name} — ${amt}/mo. Tap Create account and we take you straight to secure checkout to start it — ${amt} charged today, then ${amt}/mo. Cancel anytime.', joinNoteFreeTpl: 'Joining {name} — your first month is FREE: $0 charged today, then ${amt}/mo starting in 30 days (one free month per account). One form, one submit: account and payment together. Cancel anytime.', joinNotePaidTpl: 'Joining {name} — your card will be charged ${amt} today, then ${amt}/mo. One form, one submit: account, service address and payment together. Cancel anytime.', planFreeOpt: 'FREE Member — $0/mo · No plan — just my free account', joinNoteFree0Tpl: 'Joining FREE Member — $0 today and $0/mo. No card and no checkout: tap Create account and you are in, and you can add a plan anytime from inside your account.', fbNoteTpl: 'Joining {name} — ${amt}/mo. Create your account and we will take you straight to secure checkout for this plan.', fbNoteFreeSuffix: ' Your first month is FREE — $0 at checkout today, then ${amt}/mo (one free month per account).', fbNoteAddrSuffix: ' Your service address is required for Yard Care and HomeCare Plus.', welcomeTpl: 'Welcome to {name}! 🎉', welcomeYourPlan: 'your membership', memActiveTpl: 'Your membership is <b>active</b> — ${amt}/mo. ', welcomeYardNote: 'The Team will schedule your yard visits with you — watch for a message from us.', welcomeEstNote: 'Your first in-person estimate is <b>FREE</b>: request it from your dashboard, and book jobs straight through the app.', welcomeHcTitle: 'Welcome to HomeCare! 🎉', memActiveTrial: 'Your membership is <b>active</b> — your first month is <b>FREE</b>, then $29/mo. ', memActivePaid: 'Your membership is <b>active</b> — $29/mo. ', procPay: 'Processing payment…', procGen: 'Processing…', errAddressReq: 'Service address is required to join this membership — enter the address where we will do the work.',
  resetTitle: 'Set a new password', resetSub: 'Choose a new password for your account (at least 8 characters). This signs you out everywhere else.', resetLbl1: 'New password', resetLbl2: 'Confirm new password', resetPh1: 'New password', resetPh2: 'Type it again',
  resetBtn: 'Set new password',
  resetNoToken: 'This reset link is missing its code. Open the link from your email again.',
  resetEnterEmail: 'Type your email above first, then tap "Forgot my password".', resetPassMin: 'Your new password must be at least 8 characters.', resetPassMatch: 'The two passwords do not match — type the same password twice.',
  resetChanged: 'Your password has been updated — log in with your new password.',
  forgotLink: 'Forgot my password', pillCall: '📞 Call the Team', pillText: '💬 Text the Team', pillPhoto: '📸 Free estimate', cartTitle: 'Your cart',
  saLabel: 'Service address — where we\'ll do the work', zipLblHtml: 'ZIP code <span class="mut">(optional — helps the Team plan your route)</span>', homeTypeLbl: 'Home type', yardSizeLbl: 'Yard size', homeNotesHtml: 'Home notes <span class="mut">(optional — gate, dogs, access)</span>', startLbl: 'Preferred start — we\'ll confirm your exact day', startNote: 'Just a preference — the Team confirms your exact start day with you. Picking a date books nothing and charges nothing.', startAsap: 'As soon as possible', startDateOpt: 'A specific date', optHouse: 'House', optTownhouse: 'Townhouse', optApartment: 'Apartment', optOther: 'Other', optSmall: 'Small', optMedium: 'Medium', optLarge: 'Large', namePh: 'First & last name', addrPh: 'Street address, city, ZIP', homeNotesPh: 'Gate code, pets, parking…',
  wzCat_carpentry: 'Carpentry', wzCat_electrical: 'Electrical', wzCat_plumbing: 'Plumbing', wzCat_gardening: 'Gardening', wzCat_mechanic: 'Mechanic', wzCat_otro: 'Other / not sure', memAddrTitle: 'Service address needed', memAddrNote: 'Before payment, add the address where our technician will do the work. The Team uses it to schedule your included visits.', memAddrSave: 'Save & continue to payment', homeNotesLbl2: 'Home notes — gate, dogs, access…', startNote2: 'Just a preference — picking a date books nothing; the Team confirms your start day with you.', saveHomeDetailsBtn: 'Save home details',
  navHome: 'Home', navMenu: 'Menu', navMemberships: 'Memberships', navYard: 'Yard Care',
  contactPill: 'Text / call · (707) 862-3773', memberLoginBtn: 'Member log in',
  notifTitle: 'Notifications', notifPayNow: 'Pay now', notifEmpty: 'No notifications yet.',
  loading: 'Loading…', loadErr: 'We could not load this — check your connection.', retry: '↻ Retry',
  estStatus: { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', paid: 'Paid' },
  ratingPrompt: 'How did we do?', ratingPlaceholder: 'Tell us about the work (optional)', ratingSend: 'Send rating',
  trkHeadingTo: ' — heading to ', trkUpdated: 'updated ', agoNow: 'just now', agoMin1: '1 min ago', agoMinTpl: '{n} min ago',
  trkYourTech: 'Your technician is on the way', trkTechAdmin: 'Technician is on the way',
  trkFallback: 'Your technician is on the job — live map unavailable on this device, message the Team here for updates.',
  yourTech: 'Your technician:',
  wizTimeImpl: 'Tell us when you want the visit — your first time is free for all active members (one per account); the in-person estimate is $75 and is credited the same day toward your repair if you approve it.', wizTimeUsed: 'Members: your one free estimate (first time, one per account) is already used — the visit is $50. Regular in-person estimate $75 (credited toward your approved repair the same day).',
  wizWhen: 'When?', wizAddress: 'Service address', wizDetails: 'Job details', wizPickPhoto: 'Pick a service or send a photo',
  wizNeedName: 'Please enter your name.', wizNeedContact: 'Add your phone or email so the Team can reach you.', wizNeedSvc: 'Pick a service or choose “Another job / not listed.”', wizNeedDetails: 'Tell us a little about the job first.',
  yardNoteDone: 'Done — photos sent', yardNoteDonePending: 'Done — the Team confirms',
  feeFreePhoto: 'FREE photo estimate', feeFreeMember: 'FREE — first estimate with your membership', feeFreeMonth: 'FREE — first estimate this month',
  feeMember50: '$50 member estimate', feeFlat75: '$75 flat', feeAsapTpl: ' + 25% ASAP/Emergency = $',
  memberAppliedTpl: 'Your membership — $50 member estimate applied', memberFreeApplied: 'Your membership — first in-person estimate FREE',
  holdTitle: '💳 Your payment:', holdOnHold: 'ON HOLD — not charged yet', holdCharged: 'CHARGED ', holdValidUntil: ' • hold valid until ', holdWord: ' hold: ',
  holdExplainer: 'A hold reserves the money but does not charge it. You are only charged the final amount when the work is done.',
  estBadgeAwaiting: 'awaiting approval', estBadgePaid: 'paid', estBadgeApproved: 'approved — awaiting payment', estBadgeDeclined: 'declined', estBadgeWord: 'estimate: ',
  trkHeadingTo2: 'Heading to ', trkLocUpdated: 'Location updated ',
  wzDone: 'Done', wzStepOfTpl: 'Step {n} of 4',
  wzReqTitle: 'Request a handyman', wzReqIntro: 'Step by step, no account needed — pick what you need, add pictures, choose when. Free photo estimate, or an in-person estimate for $75 flat (members of any plan: first estimate free, then $50). Labor-only — you buy materials/parts.', wzNeedTitle: 'What do you need?', wzDetailsTitle: 'Details & photos', wzDescLabel: 'Describe the job', wzDescPh: 'What do you need done?',
  wzPhotosLabel: 'Photos of the job (up to 6) — the Team quotes faster with pictures', wzEstTypeLabel: 'Estimate type',
  wzEstPhotoBtn: 'Free photo estimate — pictures required', wzEstInPersonBtn: 'In-person estimate — $75',
  wzEstNote: 'Photo estimate is always FREE. In-person: $75 flat — members of any plan get their first one FREE, then $50. The fee is credited toward your repair when you approve the work the same day.',
  wzWhereTitle: 'Where & when', wzCityLabel: 'Where is the job?', wzAddrLabel: 'Full home address (required)', wzAddrPh: 'Street address',
  wzWhenLabel: 'When do you need it?', wzWhenNote: 'You propose the day and time — the Team confirms it with you before anything is final.',
  wzAccessLabel: 'Access notes — gate code, dogs, parking… (optional)', wzAccessPh: 'Gate code, pets, parking…',
  wzInfoTitle: 'Your info & send', wzNameLabel: 'Your name', wzNamePh: 'Full name', wzEmailLabel: 'Email (we send your quote here)', wzPhoneLabel: 'Phone',
  wzMemberLabel: 'HomeCare membership — $29/mo', wzMemberNone: 'Not a member — $75', wzMemberNew: 'New member — first estimate FREE', wzMemberMember: 'Member — $50 estimate',
  wzFeeTitleInPerson: 'In-person estimate — $75 flat',
  wzFeeDesc: 'Due to book the visit — and it goes credited toward your repair when you approve the work the same day. Final labor is quoted after the Team sees the job (or from clear photos). Labor-only — you buy materials/parts. ASAP / Emergency adds 25%.',
  wzAck: '☐ I understand the estimate charge + labor-only (I buy materials/parts)', wzSend: 'Send request', wzBack: '← Back', wzNext: 'Continue →',
  sumService: 'Service', sumDetails: 'Details', sumPhotos: 'Photos', sumWhere: 'Where', sumWhen: 'When', sumAccess: 'Access', sumContact: 'Contact',
  sumAttached: ' attached', sumNone: 'none', wizWhenOn: 'On ',
  memTitle: 'My membership', memSvcAddr: 'Service address: ', memNotOnFile: 'Not on file',
  memEst50: 'In-person estimates: <b>$50</b> — your member price.', memReqFreeBtn: 'Request your FREE on-site estimate', memFreeIncl: 'One FREE in-person estimate is included with your membership.',
  memCancelsOn: 'Cancels on ', memStaysActive: ' — your membership stays active until then.', memKeepBtn: 'Keep my membership', memChangeBtn: 'Change plan', memCancelBtn: 'Cancel membership',
  memRenewLine: 'Your plan renews monthly. Questions? Call the Team at (707) 862-3773.',
  memEmpty: 'No active membership yet — members save 20% on labor, get $50 estimates, and can add monthly yard care.', memViewBtn: 'View memberships',
  memPlanVisit1: ' • 1 yard visit/month included', memPlanVisitsN: ' • {n} yard visits/month included', memPlanPlusTag: ' • all HomeCare benefits included', memPlanHcTag: ' • member benefits active', memPlanYardTag: ' • yard visits only',
  planVisits1: '1 yard visit/month', planVisits2: '2 yard visits/month', planVisits0: 'no yard visits',
  chgTitle: 'Change your plan', chgCurrent: 'Your current plan: ', chgCurrentTag: ' (current)', backBtn: 'Back',
  chgConfirmTitle: 'Confirm your plan change', chgConfirmTpl: 'Switch from {cur} (${curAmt}/mo) to {next} (${nextAmt}/mo)? Stripe prorates the difference — you might see a prorated charge or credit today. Your new plan starts today and renews at ${nextAmt}/mo.', chgYes: 'Yes, change my plan', neverMind: 'Never mind',
  cancelTitle: 'Cancel your membership?', cancelUntilTpl: 'Your {name} stays active until {until}. After that it ends and you won\'t be charged again.', cancelUntilDefault: 'the end of your current paid period', cancelYes: 'Yes, cancel',
  yardNone2: 'No yard visits scheduled yet — the Team schedules your included visits here.', yardNextPre: 'Next yard visit: ', yardAlso: 'Also coming up: ', yardLastDone: 'Last visit done: ', yardPhotoAlt: 'Your yard after the visit', yardLoadErr: 'We could not load your yard visits.',
  yardStProposed: 'Proposed', yardStScheduled: 'Scheduled', yardStAssigned: 'Technician assigned', yardStOnWay: 'On the way', yardStArrived: 'Arrived', yardStDone: 'Done', yardStCancelled: 'Cancelled',
  yardTechPre: 'Your technician: ', yardTechNone: 'The Team will assign your technician soon.', yardPrepPre: 'Prep notes: ',
  yardHelpBtn: 'Reschedule or get help', yardAskDateLbl: 'Move this visit to', yardAskNoteLbl: 'Note for the Team (optional)', yardAskNotePh: 'Gate open, dogs inside…',
  yardAskNote: 'The Team confirms every change — nothing moves until they confirm it.', yardAskSend: 'Ask the Team', yardAskSent: 'Sent — the Team has your request.', yardAskErr: 'Pick a valid date.',
  yardAskPendingPre: 'You asked to move this visit to ', yardAskPendingTail: ' — waiting for the Team to confirm.', yardAskCancel: 'Cancel request',
  invDue: 'Due ', invViewPay: 'View & pay invoice', invView: 'View invoice', invNone: 'No invoices yet.', invLoadErr2: 'We could not load your invoices.',
  invSt_draft: 'draft', invSt_sent: 'sent', invSt_paid: 'paid', invSt_overdue: 'overdue', invSt_cancelled: 'cancelled',
  propTitle: '📩 Proposals from the Team', propCartWord: 'Cart ', propEstimateWord: 'Estimate', propTotalWord: ' · Total ', propBookedTag: 'Booked — deposit paid', propSavedTag: ' · 💾 Saved for later',
  propBalanceLine: 'Balance due at completion: ', propBookToday: 'To book today: ', propBalanceAt: ' · Balance at completion: ',
  propPayBalance: 'Pay balance', propAccept: '✅ Accept — go to checkout', propKeep: '🛒 Keep shopping', propMoveBack: '↩ Move back to active', propSave: '💾 Save for later', propLoadErr: 'We could not load your proposals.', propNone: 'No proposals yet.',
  notifOpenTitle: 'Open',
  jobsNoneCust: 'No assigned jobs yet. When a worker picks your job, the job chat opens here.', jobsLoadErr: 'We could not load your jobs.',
  estMatPill: 'material', estAsapRow: 'ASAP / Emergency (+25%)', estDiscountRow: 'Discount (', estCreditRow: 'Appointment credit (approved same day)',
  estWord: 'Estimate ', estCustomer: 'Customer:', estCustomerFallback: 'Customer', estThConcept: 'Concept', estThQty: 'Qty', estThPrice: 'Price', estThTotal: 'Total',
  estSubtotal: 'Subtotal', estTotalWord: 'TOTAL', estDueBook: 'Due to book:', estBalanceWord: 'Balance at completion:',
  estMatIncl: 'Materials included in this estimate.', estLaborOnly: 'Labor only — customer buys materials/parts unless the Team says otherwise in writing.',
  estValidUntil: ' Valid until ', estValid7: ' Estimate valid for 7 days.', estTeamNote: 'Team note:', estApprove: 'Approve estimate',
  reqQuotePre: 'Your quote: ', reqLaborNote: ' labor (you buy materials) ', reqApprove: 'Approve quote', reqDecline: 'Decline', reqWaiting: 'Waiting for the Team to send your quote.',
  reqSecureTpl: 'Secure my appointment — authorize {amt} hold (not a charge yet)',
  payPaidFull: 'Paid in full: ', payPartialRefPre: 'Paid ', payPartialRefSuf: ' — partially refunded', payRefunded: 'Payment refunded', refundIssued: 'Refund issued: ', refundKeptFee: ' booking fee kept (already dispatched)',
  payDepositTpl: 'Deposit paid: {dep} of {total} — your job is booked. Balance due when the work is done: {bal}', payBalanceBtnTpl: 'Pay balance {amt}', payNotConnected: 'Online payment is still being connected — text or call (707) 862-3773 and the Team will take your payment.',
  ordPlacedH: '✅ Order placed — ', ordDepositTpl: '💳 <b>Deposit paid: {dep}</b> — your job is booked. The balance of <b>{bal}</b> is due when the work is done — pay it right here in the app. The Team confirms your time within minutes.', ordPaidFullBody: '💳 <b>Paid in full.</b> The Team confirms your time within minutes.', ordFollow: ' Follow your order live — and message the Team — right here in the app.', ordWelcome: '🎉 Welcome to HomeCare! Your membership is active and its member price was applied to this order.', ordGoOrders: 'Go to my orders',
  reqNone: 'No requests yet.', reqLoadErr2: 'We could not load your requests.',
  msgCustomerWord: 'Customer', jobPhotoAlt: 'Job photo', threadNone: 'No messages yet.', threadPhCust: 'Message the customer...', threadPhTeam: 'Message the Team...', sendBtn: 'Send',
  ratingYours: 'Your rating:', ratingTapFirst: 'Tap the stars first.',
  ratingWaitPay: 'You can leave a review once the payment for this job is confirmed.',
  tlTitle: 'Job timeline', tl_created: 'Booked', tl_assigned: 'Technician assigned', tl_enroute: 'Technician on the way', tl_arrived: 'Technician arrived', tl_done: 'Work done', tl_paid: 'Paid in full', tl_status: 'Status update',
  pubRevAvgTpl: '{avg} ★ average from {n} verified review', pubRevAvgTplPl: '{avg} ★ average from {n} verified reviews', pubRevVerified: 'Verified job',
  sumEstimate: 'Estimate', sumPickOne: 'pick one', feeTitlePhoto: 'Free photo estimate', feeTitleInPersonPre: 'In-person estimate — ', feeTitleInPersonPre2: 'In-person — ',
  sendBtnPhoto: 'Request free photo estimate', sendBtnPre: 'Send request — ', sendSecuresTpl: '${amt} secures your appointment — and it goes credited towards your repair when approved the same day.',
  srPickService: 'Pick a service first.', srAddAddress: 'Add the home address.', srChooseWhen: 'Choose when you need it.', srDescribe: 'Describe the job in a sentence or two.',
  srAck: 'Tap the confirm box (estimate + labor-only) before sending.', srAddName: 'Add your name.', srAddEmail: 'Add a valid email — we send your quote there.', srNeedPhoto: 'Free photo estimates need at least one picture.',
  srSentPre: 'Request sent', srWithPhotosTpl: ' with {n} photo(s)', srSentMeSuffix: '. The Team will review and send your quote right here — check back in this thread.',
  srSentAnonTpl: 'Request sent! The Team will review it and send your quote to {email}. No account needed — you can approve and pay right from the email link.',
  estTypeFree: 'In-person estimate — FREE with your membership', estTypeMember: 'In-person estimate — $50 member price',
  wzAckText: ' I understand the estimate charge + labor-only (I buy materials/parts)',
  cartEach: ' each', cartMembersSavePre: 'Members −$', cartMembersPayPre: 'Members pay $', cartRemoveBtn: 'Remove',
  cartSubtotal: 'Subtotal', cartSavingsRow: 'HomeCare member savings (−20%)', cartTotalWord: 'Total',
  cartMemberApplied: '✓ Your HomeCare member price is applied.', cartMembersPayTpl: 'Members pay ${member} — save ${savings}',
  cartOfferTitle: '⭐ HomeCare — first month FREE', cartOfferBody: 'Join at checkout (first month FREE) and the member price applies to this order right away.',
  ccLinesTitle: 'Your services — tap to fix anything', ccMembersWord: ' · members $', ccInCart: 'In cart ×', ccAdd: '＋ Add',
  cartMemberPriceRow: 'HomeCare member price (−20%)', cartJoinRow: 'HomeCare membership — first month', cartFreeWord: 'FREE',
  cartDepositDue: 'Deposit due today', cartBalanceRow: 'Balance at completion',
  cartPayJoinTpl: 'Join HomeCare — then pay ${amt} deposit for your order', cartPayDepositTpl: 'Pay ${amt} deposit',
  cartValAddress: 'Enter the service address — where the technician will do the work.', cartValNameEmail: 'Add your name and a valid email — your account is created with this step.', cartValPassword: 'Create a password of 8+ characters (or enter your account password).',
  cartPayLoading: '⏳ Loading secure payment…', cartPayFailBody: '⚠️ The secure payment form could not load — check your connection.', cartPayHostedBtn: 'Pay on Stripe\'s secure page', cartPayRetryBtn: '↻ Try again',
  cartEmptyTxt: 'Your cart is empty — add services from the menu and they will wait for you right here.', cartBrowseBtn: 'Browse the menu', cartCheckoutBtnTxt: 'Checkout →', cartClearBtnTxt: 'Clear cart',
  ccTitle: 'Checkout', ccAcctTitle: 'Your account — last step', ccNameLbl: 'Your name', ccPassPh: 'Create one (8+ characters) — or your account password',
  ccStepOrder: '1 · Your order', ccStepDetails: '2 · Your details', ccStepPayment: '3 · Payment',
  ccAcctNote: 'New here? This creates your account as part of checkout. Already a customer? Use your account email + password and we log you in.',
  ccWhereWhen: 'Where & when', ccAddrLbl: 'Service address', ccCityLbl: 'City', ccToday: 'Today', ccTomorrow: 'Tomorrow',
  ccWhenLbl: 'Preferred time / details', ccWhenPh: 'e.g. after 3 PM — you propose, we confirm', ccNotesLbl: 'Notes for the technician',
  ccOfferTitle: '⭐ Add HomeCare — first month FREE', ccOfferBody: 'Members save 20% on labor — the member price applies to THIS order right away. Then $29/mo, cancel anytime. Totally optional: your order works without it.',
  ccAddMore: '＋ Add more services', ccPayTitle: 'Payment',
  ccPayNote: 'You pay only the booking deposit today — $50 flat on totals up to $300, 40% on totals over $300 — and the balance when the work is done. Cancel before a technician is dispatched and you get a full refund; after dispatch, $75 is non-refundable.',
  ccFootNote: 'One card, one tap · Secured by Stripe · Deposit today, balance at completion', mapTitle: 'Master map', mapLoading: 'Loading map…',
  crefTitle: '🎁 Refer & earn', crefIntro: 'Share your personal link. When a friend joins a membership and pays their first real charge, you earn a $10 credit for your next job or membership payment — one credit per friend, tracked automatically right here.',
  crefYourLink: 'Your referral link', crefCopy: 'Copy', crefBalance: 'Your credit balance', crefSignups: 'Friends you referred', crefNoSignups: 'No referrals yet — share your link to get started.',
  crefCreditWord: 'credit', crefCredited: 'credit earned', crefMember: 'member',
  seasTitle: '🍂 Due again this season', seasIntro: 'These services from your history run on a seasonal cycle — and yours is due again. One tap sets up the order at today\'s price; the usual booking deposit applies and the balance is due when the work is done.',
  seasLastDone: 'Last done', seasBook: 'Book it again', seasDismiss: 'Not now', seasFilterNote: 'Includes the air / cabin filter swap', seasDueNow: 'Due this season'
},
es: {
  authTitleMember: 'Acceso de miembros', authTitleLogin: 'Entrar / Crear cuenta',
  authHintLogin: 'No necesitas cuenta para pedir una cotización — solo mándala y te respondemos por correo. Crea una cuenta para seguir tus trabajos, pagar facturas en línea o unirte a HomeCare.',
  authHintJoin: 'Crea tu cuenta — tu plan empieza en el momento que tocas Unirse. Puedes cancelar cuando quieras desde tu cuenta.',
  authHintPlain: '',
  lblFullName: 'Nombre completo', lblPhone: 'Teléfono', lblEmail: 'Correo', lblPassword: 'Contraseña',
  lblServiceAddress: 'Dirección del servicio (para las visitas de la membresía)',
  lblEmailAddress: 'Correo electrónico',
  saHintPlan: 'Obligatoria para unirte a esta membresía — el Team usa esta dirección para agendar tus visitas incluidas.',
  saHintPlain: 'Opcional para una cuenta normal. Obligatoria al unirte a Yard Care o HomeCare Plus.',
  btnLogin: 'Entrar', btnCreate: 'Crear cuenta',
  btnJoinTpl: 'Crear cuenta y unirse — ${amt}/mes', btnContinueTpl: 'Crear cuenta y continuar — ${amt}/mes',
  planPer: '/mes', planYardVisits: 'Plan de yarda mensual — {n} visita(s) / mes', planPlusVisits: 'Plan mensual — PLUS {n} visita(s) de yarda / mes incluidas',
  hcNoteFreeTpl: '{name} — ${amt}/mes en total. Tu primer mes es GRATIS — $0 cobrados hoy, luego ${amt}/mes (un mes gratis por cuenta). {perks}', hcNotePaidTpl: '{name} — ${amt}/mes en total. Hoy se cargan ${amt} a tu tarjeta, luego ${amt}/mes. {perks}',
  cardLblFreeTpl: 'Tarjeta — $0 cobrados hoy, luego ${amt}/mes', cardLblPaidTpl: 'Tarjeta — se cargan ${amt} hoy, luego ${amt}/mes',
  optNoteFreeTpl: '{name} — tu primer mes es GRATIS. $0 en el checkout hoy, luego ${amt}/mes (un mes gratis por cuenta). Toca Crear cuenta y te llevamos directo al checkout seguro para empezarlo. Cancela cuando quieras.', optNotePaidTpl: '{name} — ${amt}/mes. Toca Crear cuenta y te llevamos directo al checkout seguro para empezarlo — ${amt} cobrados hoy, luego ${amt}/mes. Cancela cuando quieras.', joinNoteFreeTpl: 'Te unes a {name} — tu primer mes es GRATIS: $0 cobrados hoy, luego ${amt}/mes empezando en 30 días (un mes gratis por cuenta). Un solo formulario, un solo envío: cuenta y pago juntos. Cancela cuando quieras.', joinNotePaidTpl: 'Te unes a {name} — hoy se cargan ${amt} a tu tarjeta, luego ${amt}/mes. Un solo formulario, un solo envío: cuenta, dirección del servicio y pago juntos. Cancela cuando quieras.', planFreeOpt: 'Miembro FREE — $0/mes · Sin plan — solo mi cuenta gratis', joinNoteFree0Tpl: 'Te unes como Miembro FREE — $0 hoy y $0/mes. Sin tarjeta y sin checkout: toca Crear cuenta y entras, y puedes agregar un plan cuando quieras desde tu cuenta.', fbNoteTpl: 'Te unes a {name} — ${amt}/mes. Crea tu cuenta y te llevamos directo al checkout seguro para este plan.', fbNoteFreeSuffix: ' Tu primer mes es GRATIS — $0 en el checkout hoy, luego ${amt}/mes (un mes gratis por cuenta).', fbNoteAddrSuffix: ' Tu dirección del servicio es obligatoria para Yard Care y HomeCare Plus.', welcomeTpl: '¡Bienvenido a {name}! 🎉', welcomeYourPlan: 'tu membresía', memActiveTpl: 'Tu membresía está <b>activa</b> — ${amt}/mes. ', welcomeYardNote: 'El Team agendará tus visitas de yarda contigo — pendiente de nuestro mensaje.', welcomeEstNote: 'Tu primer estimado en persona es <b>GRATIS</b>: pídelo desde tu panel y reserva trabajos directo en la app.', welcomeHcTitle: '¡Bienvenido a HomeCare! 🎉', memActiveTrial: 'Tu membresía está <b>activa</b> — tu primer mes es <b>GRATIS</b>, luego $29/mes. ', memActivePaid: 'Tu membresía está <b>activa</b> — $29/mes. ', procPay: 'Procesando pago…', procGen: 'Procesando…', errAddressReq: 'La dirección del servicio es obligatoria para unirte a esta membresía — escribe la dirección donde haremos el trabajo.',
  resetTitle: 'Crea una contraseña nueva', resetSub: 'Elige una contraseña nueva para tu cuenta (al menos 8 caracteres). Esto cierra tu sesión en todos los demás lugares.', resetLbl1: 'Contraseña nueva', resetLbl2: 'Confirma la contraseña nueva', resetPh1: 'Contraseña nueva', resetPh2: 'Escríbela de nuevo',
  resetBtn: 'Guardar contraseña nueva',
  resetNoToken: 'A este link de restablecimiento le falta su código. Abre de nuevo el link de tu correo.',
  resetEnterEmail: 'Escribe tu correo arriba primero, luego toca "Olvidé mi contraseña".', resetPassMin: 'Tu contraseña nueva debe tener al menos 8 caracteres.', resetPassMatch: 'Las dos contraseñas no coinciden — escribe la misma contraseña dos veces.',
  resetChanged: 'Tu contraseña ha sido actualizada — entra con tu contraseña nueva.',
  forgotLink: 'Olvidé mi contraseña', pillCall: '📞 Llama al Team', pillText: '💬 Texto al Team', pillPhoto: '📸 Estimado gratis', cartTitle: 'Tu carrito',
  saLabel: 'Dirección del servicio — donde haremos el trabajo', zipLblHtml: 'Código ZIP <span class="mut">(opcional — ayuda al Team a planear tu ruta)</span>', homeTypeLbl: 'Tipo de casa', yardSizeLbl: 'Tamaño de la yarda', homeNotesHtml: 'Notas de la casa <span class="mut">(opcional — puerta, perros, acceso)</span>', startLbl: 'Inicio preferido — te confirmamos el día exacto', startNote: 'Solo es una preferencia — el Team te confirma el día exacto de inicio. Elegir una fecha no aparta nada ni cobra nada.', startAsap: 'Lo antes posible', startDateOpt: 'Una fecha específica', optHouse: 'Casa', optTownhouse: 'Townhouse', optApartment: 'Apartamento', optOther: 'Otro', optSmall: 'Pequeña', optMedium: 'Mediana', optLarge: 'Grande', namePh: 'Nombre y apellido', addrPh: 'Dirección, ciudad, ZIP', homeNotesPh: 'Código de puerta, mascotas, estacionamiento…',
  wzCat_carpentry: 'Carpintería', wzCat_electrical: 'Electricidad', wzCat_plumbing: 'Plomería', wzCat_gardening: 'Jardinería', wzCat_mechanic: 'Mecánica', wzCat_otro: 'Otro / no estoy seguro', memAddrTitle: 'Dirección del servicio necesaria', memAddrNote: 'Antes del pago, agrega la dirección donde nuestro técnico hará el trabajo. El Team la usa para agendar tus visitas incluidas.', memAddrSave: 'Guardar y continuar al pago', homeNotesLbl2: 'Notas de la casa — puerta, perros, acceso…', startNote2: 'Solo es una preferencia — elegir una fecha no aparta nada; el Team te confirma el día de inicio.', saveHomeDetailsBtn: 'Guardar detalles de la casa',
  navHome: 'Inicio', navMenu: 'Menú', navMemberships: 'Membresías', navYard: 'Cuidado de yarda',
  contactPill: 'Texto / llamada · (707) 862-3773', memberLoginBtn: 'Entrar (miembros)',
  notifTitle: 'Notificaciones', notifPayNow: 'Pagar ahora', notifEmpty: 'Todavía no tienes notificaciones.',
  loading: 'Cargando…', loadErr: 'No pudimos cargar esto — revisa tu conexión.', retry: '↻ Reintentar',
  estStatus: { draft: 'Borrador', sent: 'Enviado', accepted: 'Aceptado', declined: 'Rechazado', paid: 'Pagado' },
  ratingPrompt: '¿Cómo nos fue?', ratingPlaceholder: 'Cuéntanos sobre el trabajo (opcional)', ratingSend: 'Enviar calificación',
  trkHeadingTo: ' — en camino a ', trkUpdated: 'actualizado ', agoNow: 'ahora mismo', agoMin1: 'hace 1 min', agoMinTpl: 'hace {n} min',
  trkYourTech: 'Tu técnico va en camino', trkTechAdmin: 'El técnico va en camino',
  trkFallback: 'Tu técnico está en el trabajo — el mapa en vivo no está disponible en este dispositivo, escríbele al Team aquí para novedades.',
  yourTech: 'Tu técnico:',
  wizTimeImpl: 'Dinos cuándo quieres la visita — tu primera vez es gratis para todos los miembros activos (una por cuenta); el estimado en persona cuesta $75 y se te descuenta el mismo día de tu reparación si la apruebas.', wizTimeUsed: 'Miembros: tu único estimado gratis (primera vez, uno por cuenta) ya fue usado — la visita cuesta $50. Estimado en persona normal $75 (se descuenta de tu reparación aprobada el mismo día).',
  wizWhen: '¿Cuándo?', wizAddress: 'Dirección del servicio', wizDetails: 'Detalles del trabajo', wizPickPhoto: 'Elige un servicio o manda una foto',
  wizNeedName: 'Escribe tu nombre.', wizNeedContact: 'Agrega tu teléfono o correo para que el Team te contacte.', wizNeedSvc: 'Elige un servicio o selecciona “Otro trabajo / no listado.”', wizNeedDetails: 'Cuéntanos un poco del trabajo primero.',
  yardNoteDone: 'Terminado — fotos enviadas', yardNoteDonePending: 'Terminado — el Team confirma',
  feeFreePhoto: 'Estimado por foto GRATIS', feeFreeMember: 'GRATIS — primer estimado con tu membresía', feeFreeMonth: 'GRATIS — primer estimado este mes',
  feeMember50: 'Estimado de miembro $50', feeFlat75: '$75 fijo', feeAsapTpl: ' + 25% ASAP/Emergencia = $',
  memberAppliedTpl: 'Tu membresía — estimado de miembro de $50 aplicado', memberFreeApplied: 'Tu membresía — primer estimado en persona GRATIS',
  holdTitle: '💳 Tu pago:', holdOnHold: 'EN RETENCIÓN — sin cobro todavía', holdCharged: 'COBRADO ', holdValidUntil: ' • retención válida hasta ', holdWord: ' retención: ',
  holdExplainer: 'Una retención reserva el dinero pero no lo cobra. Solo se te cobra el monto final cuando el trabajo termina.',
  estBadgeAwaiting: 'esperando aprobación', estBadgePaid: 'pagado', estBadgeApproved: 'aprobado — esperando pago', estBadgeDeclined: 'rechazado', estBadgeWord: 'estimado: ',
  trkHeadingTo2: 'En camino a ', trkLocUpdated: 'Ubicación actualizada ',
  wzDone: '¡Listo!', wzStepOfTpl: 'Paso {n} de 4',
  wzReqTitle: 'Pide tu servicio', wzReqIntro: 'Paso a paso, sin necesidad de cuenta — escoge lo que necesitas, agrega fotos, elige cuándo. Estimado por foto gratis, o un estimado en persona por $75 fijo (miembros de cualquier plan: primer estimado gratis, luego $50). Solo labor — tú compras los materiales/partes.', wzNeedTitle: '¿Qué necesitas?', wzDetailsTitle: 'Detalles y fotos', wzDescLabel: 'Describe el trabajo', wzDescPh: '¿Qué necesitas hacer?',
  wzPhotosLabel: 'Fotos del trabajo (hasta 6) — el Team cotiza más rápido con fotos', wzEstTypeLabel: 'Tipo de estimado',
  wzEstPhotoBtn: 'Estimado por foto gratis — fotos requeridas', wzEstInPersonBtn: 'Estimado en persona — $75',
  wzEstNote: 'El estimado por foto siempre es GRATIS. En persona: $75 fijo — los miembros de cualquier plan tienen el primero GRATIS, después $50. El cobro se descuenta de tu reparación si apruebas el trabajo el mismo día.',
  wzWhereTitle: 'Dónde y cuándo', wzCityLabel: '¿Dónde es el trabajo?', wzAddrLabel: 'Dirección completa de la casa (obligatoria)', wzAddrPh: 'Dirección',
  wzWhenLabel: '¿Cuándo lo necesitas?', wzWhenNote: 'Tú propones el día y la hora — el Team te lo confirma antes de que sea final.',
  wzAccessLabel: 'Notas de acceso — código de puerta, perros, estacionamiento… (opcional)', wzAccessPh: 'Código de puerta, mascotas, estacionamiento…',
  wzInfoTitle: 'Tus datos y enviar', wzNameLabel: 'Tu nombre', wzNamePh: 'Nombre completo', wzEmailLabel: 'Correo (te mandamos tu cotización aquí)', wzPhoneLabel: 'Teléfono',
  wzMemberLabel: 'Membresía HomeCare — $29/mes', wzMemberNone: 'No soy miembro — $75', wzMemberNew: 'Miembro nuevo — primer estimado GRATIS', wzMemberMember: 'Miembro — estimado $50',
  wzFeeTitleInPerson: 'Estimado en persona — $75 fijo',
  wzFeeDesc: 'Se paga para apartar la visita — y se descuenta de tu reparación si apruebas el trabajo el mismo día. La mano de obra final se cotiza después de que el Team vea el trabajo (o con fotos claras). Solo mano de obra — tú compras los materiales/partes. ASAP / Emergencia agrega 25%.',
  wzAck: '☐ Entiendo el cobro del estimado + solo mano de obra (yo compro los materiales/partes)', wzSend: 'Enviar solicitud', wzBack: '← Atrás', wzNext: 'Continuar →',
  sumService: 'Servicio', sumDetails: 'Detalles', sumPhotos: 'Fotos', sumWhere: 'Dónde', sumWhen: 'Cuándo', sumAccess: 'Acceso', sumContact: 'Contacto',
  sumAttached: ' adjunta(s)', sumNone: 'ninguna', wizWhenOn: 'El ',
  memTitle: 'Mi membresía', memSvcAddr: 'Dirección del servicio: ', memNotOnFile: 'No registrada',
  memEst50: 'Estimados en persona: <b>$50</b> — tu precio de miembro.', memReqFreeBtn: 'Pide tu estimado en sitio GRATIS', memFreeIncl: 'Un estimado en persona GRATIS está incluido con tu membresía.',
  memCancelsOn: 'Se cancela el ', memStaysActive: ' — tu membresía sigue activa hasta entonces.', memKeepBtn: 'Quedarme con mi membresía', memChangeBtn: 'Cambiar plan', memCancelBtn: 'Cancelar membresía',
  memRenewLine: 'Tu plan se renueva cada mes. ¿Preguntas? Llama al Team al (707) 862-3773.',
  memEmpty: 'Todavía no tienes membresía activa — los miembros ahorran 20% en mano de obra, pagan estimados de $50 y pueden agregar cuidado de yarda mensual.', memViewBtn: 'Ver membresías',
  memPlanVisit1: ' • 1 visita de yarda/mes incluida', memPlanVisitsN: ' • {n} visitas de yarda/mes incluidas', memPlanPlusTag: ' • todos los beneficios de HomeCare incluidos', memPlanHcTag: ' • beneficios de miembro activos', memPlanYardTag: ' • solo visitas de yarda',
  planVisits1: '1 visita de yarda/mes', planVisits2: '2 visitas de yarda/mes', planVisits0: 'sin visitas de yarda',
  chgTitle: 'Cambia tu plan', chgCurrent: 'Tu plan actual: ', chgCurrentTag: ' (actual)', backBtn: 'Atrás',
  chgConfirmTitle: 'Confirma tu cambio de plan', chgConfirmTpl: '¿Cambiar de {cur} (${curAmt}/mes) a {next} (${nextAmt}/mes)? Stripe prorratea la diferencia — hoy podrías ver un cargo o crédito prorrateado. Tu plan nuevo empieza hoy y se renueva a ${nextAmt}/mes.', chgYes: 'Sí, cambiar mi plan', neverMind: 'Mejor no',
  cancelTitle: '¿Cancelar tu membresía?', cancelUntilTpl: 'Tu {name} sigue activa hasta el {until}. Después termina y no se te cobra más.', cancelUntilDefault: 'el fin de tu periodo pagado actual', cancelYes: 'Sí, cancelar',
  yardNone2: 'Todavía no hay visitas de yarda agendadas — el Team agenda tus visitas incluidas aquí.', yardNextPre: 'Próxima visita de yarda: ', yardAlso: 'También vienen: ', yardLastDone: 'Última visita hecha: ', yardPhotoAlt: 'Tu yarda después de la visita', yardLoadErr: 'No pudimos cargar tus visitas de yarda.',
  yardStProposed: 'Propuesta', yardStScheduled: 'Agendada', yardStAssigned: 'Técnico asignado', yardStOnWay: 'En camino', yardStArrived: 'Llegó', yardStDone: 'Hecha', yardStCancelled: 'Cancelada',
  yardTechPre: 'Tu técnico: ', yardTechNone: 'El Team asignará a tu técnico pronto.', yardPrepPre: 'Notas de preparación: ',
  yardHelpBtn: 'Reagendar o pedir ayuda', yardAskDateLbl: 'Mover esta visita al', yardAskNoteLbl: 'Nota para el Team (opcional)', yardAskNotePh: 'Puerta abierta, perros adentro…',
  yardAskNote: 'El Team confirma cada cambio — nada se mueve hasta que lo confirmen.', yardAskSend: 'Pedir al Team', yardAskSent: 'Enviado — el Team ya tiene tu petición.', yardAskErr: 'Elige una fecha válida.',
  yardAskPendingPre: 'Pediste mover esta visita al ', yardAskPendingTail: ' — esperando la confirmación del Team.', yardAskCancel: 'Cancelar petición',
  invDue: 'Vence ', invViewPay: 'Ver y pagar factura', invView: 'Ver factura', invNone: 'Todavía no tienes facturas.', invLoadErr2: 'No pudimos cargar tus facturas.',
  invSt_draft: 'borrador', invSt_sent: 'enviada', invSt_paid: 'pagada', invSt_overdue: 'vencida', invSt_cancelled: 'cancelada',
  propTitle: '📩 Propuestas del Team', propCartWord: 'Carrito ', propEstimateWord: 'Estimado', propTotalWord: ' · Total ', propBookedTag: 'Apartado — depósito pagado', propSavedTag: ' · 💾 Guardada para después',
  propBalanceLine: 'Saldo al terminar: ', propBookToday: 'Para apartar hoy: ', propBalanceAt: ' · Saldo al terminar: ',
  propPayBalance: 'Pagar saldo', propAccept: '✅ Aceptar — ir a pagar', propKeep: '🛒 Seguir comprando', propMoveBack: '↩ Volver a activas', propSave: '💾 Guardar para después', propLoadErr: 'No pudimos cargar tus propuestas.', propNone: 'Todavía no tienes propuestas.',
  notifOpenTitle: 'Abrir',
  jobsNoneCust: 'Todavía no hay trabajos asignados. Cuando un trabajador tome tu trabajo, el chat se abre aquí.', jobsLoadErr: 'No pudimos cargar tus trabajos.',
  estMatPill: 'material', estAsapRow: 'ASAP / Emergencia (+25%)', estDiscountRow: 'Descuento (', estCreditRow: 'Crédito de cita (aprobado el mismo día)',
  estWord: 'Estimado ', estCustomer: 'Cliente:', estCustomerFallback: 'Cliente', estThConcept: 'Concepto', estThQty: 'Cant.', estThPrice: 'Precio', estThTotal: 'Total',
  estSubtotal: 'Subtotal', estTotalWord: 'TOTAL', estDueBook: 'Para apartar:', estBalanceWord: 'Saldo al terminar:',
  estMatIncl: 'Materiales incluidos en este estimado.', estLaborOnly: 'Solo mano de obra — el cliente compra los materiales/partes salvo que el Team diga lo contrario por escrito.',
  estValidUntil: ' Válido hasta ', estValid7: ' Estimado válido por 7 días.', estTeamNote: 'Nota del Team:', estApprove: 'Aprobar estimado',
  reqQuotePre: 'Tu cotización: ', reqLaborNote: ' de mano de obra (tú compras los materiales) ', reqApprove: 'Aprobar cotización', reqDecline: 'Rechazar', reqWaiting: 'Esperando que el Team te mande tu cotización.',
  reqSecureTpl: 'Aparta mi cita — autoriza una retención de {amt} (sin cobro todavía)',
  payPaidFull: 'Pagado por completo: ', payPartialRefPre: 'Pagado ', payPartialRefSuf: ' — reembolso parcial', payRefunded: 'Pago reembolsado', refundIssued: 'Reembolso emitido: ', refundKeptFee: ' de cargo de apartado retenido (ya despachado)',
  payDepositTpl: 'Anticipo pagado: {dep} de {total} — tu trabajo está agendado. Saldo al terminar el trabajo: {bal}', payBalanceBtnTpl: 'Pagar saldo {amt}', payNotConnected: 'El pago en línea todavía se está conectando — manda un texto o llama al (707) 862-3773 y el Team toma tu pago.',
  ordPlacedH: '✅ Orden recibida — ', ordDepositTpl: '💳 <b>Anticipo pagado: {dep}</b> — tu trabajo está agendado. El saldo de <b>{bal}</b> se paga cuando el trabajo esté terminado — págalo aquí mismo en la app. El Team confirma tu hora en minutos.', ordPaidFullBody: '💳 <b>Pagado por completo.</b> El Team confirma tu hora en minutos.', ordFollow: ' Sigue tu orden en vivo — y escríbele al Team — aquí mismo en la app.', ordWelcome: '🎉 ¡Bienvenido a HomeCare! Tu membresía está activa y su precio de miembro se aplicó a esta orden.', ordGoOrders: 'Ir a mis órdenes',
  reqNone: 'Todavía no tienes solicitudes.', reqLoadErr2: 'No pudimos cargar tus solicitudes.',
  msgCustomerWord: 'Cliente', jobPhotoAlt: 'Foto del trabajo', threadNone: 'Todavía no hay mensajes.', threadPhCust: 'Mensaje al cliente...', threadPhTeam: 'Mensaje al Team...', sendBtn: 'Enviar',
  ratingYours: 'Tu calificación:', ratingTapFirst: 'Toca las estrellas primero.',
  ratingWaitPay: 'Puedes dejar una reseña cuando el pago de este trabajo esté confirmado.',
  tlTitle: 'Línea de tiempo', tl_created: 'Agendado', tl_assigned: 'Técnico asignado', tl_enroute: 'Técnico en camino', tl_arrived: 'El técnico llegó', tl_done: 'Trabajo terminado', tl_paid: 'Pagado por completo', tl_status: 'Actualización de estado',
  pubRevAvgTpl: '{avg} ★ promedio de {n} reseña verificada', pubRevAvgTplPl: '{avg} ★ promedio de {n} reseñas verificadas', pubRevVerified: 'Trabajo verificado',
  sumEstimate: 'Estimado', sumPickOne: 'elige uno', feeTitlePhoto: 'Estimado por foto gratis', feeTitleInPersonPre: 'Estimado en persona — ', feeTitleInPersonPre2: 'En persona — ',
  sendBtnPhoto: 'Pedir estimado por foto gratis', sendBtnPre: 'Enviar solicitud — ', sendSecuresTpl: '${amt} apartan tu cita — y se descuentan de tu reparación si la apruebas el mismo día.',
  srPickService: 'Elige un servicio primero.', srAddAddress: 'Agrega la dirección de la casa.', srChooseWhen: 'Elige cuándo lo necesitas.', srDescribe: 'Describe el trabajo en una frase o dos.',
  srAck: 'Toca la casilla de confirmación (estimado + solo mano de obra) antes de enviar.', srAddName: 'Agrega tu nombre.', srAddEmail: 'Agrega un correo válido — ahí te mandamos tu cotización.', srNeedPhoto: 'Los estimados por foto gratis necesitan al menos una foto.',
  srSentPre: 'Solicitud enviada', srWithPhotosTpl: ' con {n} foto(s)', srSentMeSuffix: '. El Team lo revisa y te manda tu cotización aquí mismo — revisa este hilo.',
  srSentAnonTpl: '¡Solicitud enviada! El Team la revisa y te manda tu cotización a {email}. No necesitas cuenta — puedes aprobar y pagar directo desde el link del correo.',
  estTypeFree: 'Estimado en persona — GRATIS con tu membresía', estTypeMember: 'Estimado en persona — precio de miembro $50',
  wzAckText: ' Entiendo el cobro del estimado + solo mano de obra (yo compro los materiales/partes)',
  cartEach: ' cada uno', cartMembersSavePre: 'Miembros −$', cartMembersPayPre: 'Miembros pagan $', cartRemoveBtn: 'Quitar',
  cartSubtotal: 'Subtotal', cartSavingsRow: 'Ahorro de miembro HomeCare (−20%)', cartTotalWord: 'Total',
  cartMemberApplied: '✓ Tu precio de miembro HomeCare está aplicado.', cartMembersPayTpl: 'Miembros pagan ${member} — ahorras ${savings}',
  cartOfferTitle: '⭐ HomeCare — primer mes GRATIS', cartOfferBody: 'Únete en el checkout (primer mes GRATIS) y el precio de miembro aplica a esta orden de inmediato.',
  ccLinesTitle: 'Tus servicios — toca para corregir lo que sea', ccMembersWord: ' · miembros $', ccInCart: 'En el carrito ×', ccAdd: '＋ Agregar',
  cartMemberPriceRow: 'Precio de miembro HomeCare (−20%)', cartJoinRow: 'Membresía HomeCare — primer mes', cartFreeWord: 'GRATIS',
  cartDepositDue: 'Depósito a pagar hoy', cartBalanceRow: 'Saldo al terminar',
  cartPayJoinTpl: 'Únete a HomeCare — luego paga ${amt} de depósito por tu orden', cartPayDepositTpl: 'Paga ${amt} de depósito',
  cartValAddress: 'Escribe la dirección del servicio — donde el técnico hará el trabajo.', cartValNameEmail: 'Agrega tu nombre y un correo válido — tu cuenta se crea con este paso.', cartValPassword: 'Crea una contraseña de 8+ caracteres (o escribe la de tu cuenta).',
  cartPayLoading: '⏳ Cargando pago seguro…', cartPayFailBody: '⚠️ El formulario de pago seguro no cargó — revisa tu conexión.', cartPayHostedBtn: 'Pagar en la página segura de Stripe', cartPayRetryBtn: '↻ Reintentar',
  cartEmptyTxt: 'Tu carrito está vacío — agrega servicios del menú y te esperan aquí mismo.', cartBrowseBtn: 'Ver el menú', cartCheckoutBtnTxt: 'Ir a pagar →', cartClearBtnTxt: 'Vaciar carrito',
  ccTitle: 'Pago', ccAcctTitle: 'Tu cuenta — último paso', ccNameLbl: 'Tu nombre', ccPassPh: 'Crea una (8+ caracteres) — o la contraseña de tu cuenta',
  ccStepOrder: '1 · Tu orden', ccStepDetails: '2 · Tus datos', ccStepPayment: '3 · Pago',
  ccAcctNote: '¿Nuevo aquí? Esto crea tu cuenta como parte del checkout. ¿Ya eres cliente? Usa el correo + contraseña de tu cuenta y entras directo.',
  ccWhereWhen: 'Dónde y cuándo', ccAddrLbl: 'Dirección del servicio', ccCityLbl: 'Ciudad', ccToday: 'Hoy', ccTomorrow: 'Mañana',
  ccWhenLbl: 'Hora preferida / detalles', ccWhenPh: 'ej. después de las 3 PM — tú propones, nosotros confirmamos', ccNotesLbl: 'Notas para el técnico',
  ccOfferTitle: '⭐ Agregar HomeCare — primer mes GRATIS', ccOfferBody: 'Los miembros ahorran 20% en mano de obra — el precio de miembro aplica a ESTA orden de inmediato. Luego $29/mes, cancela cuando quieras. Totalmente opcional: tu orden funciona sin esto.',
  ccAddMore: '＋ Agregar más servicios', ccPayTitle: 'Pago',
  ccPayNote: 'Hoy pagas solo el depósito de apartado — $50 fijo en totales hasta $300, 40% en totales sobre $300 — y el saldo cuando el trabajo esté hecho. Cancela antes de que un técnico sea despachado y recibes reembolso completo; después del despacho, $75 no son reembolsables.',
  ccFootNote: 'Una tarjeta, un toque · Protegido por Stripe · Depósito hoy, saldo al terminar', mapTitle: 'Mapa maestro', mapLoading: 'Cargando mapa…',
  crefTitle: '🎁 Recomienda y gana', crefIntro: 'Comparte tu link personal. Cuando un amigo se une a una membresía y paga su primer cargo real, ganas un crédito de $10 para tu próximo trabajo o pago de membresía — un crédito por amigo, rastreado automáticamente aquí mismo.',
  crefYourLink: 'Tu link de referido', crefCopy: 'Copiar', crefBalance: 'Tu saldo de crédito', crefSignups: 'Amigos que referiste', crefNoSignups: 'Todavía no tienes referidos — comparte tu link para empezar.',
  crefCreditWord: 'crédito', crefCredited: 'crédito ganado', crefMember: 'miembro',
  seasTitle: '🍂 Ya toca esta temporada', seasIntro: 'Estos servicios de tu historial van por ciclo de temporada — y el tuyo ya toca otra vez. Un toque arma la orden al precio de hoy; aplica el depósito de reserva de siempre y el saldo se paga cuando el trabajo está hecho.',
  seasLastDone: 'Última vez', seasBook: 'Reservarlo de nuevo', seasDismiss: 'Ahora no', seasFilterNote: 'Incluye el cambio de filtro de aire / cabina', seasDueNow: 'Toca esta temporada'
}
};
function CU(k){ const d = CUST_UI[menuLang()] || CUST_UI.en; const v = d[k]; return v !== undefined ? v : (CUST_UI.en[k] !== undefined ? CUST_UI.en[k] : k); }

function joinPromoPlanKey(){
  if (!joinPromo) return '';
  if (pendingJoin && JOIN_PLAN_INFO[pendingJoin.plan]) return pendingJoin.plan;
  if (pendingMembershipPlan && JOIN_PLAN_INFO[pendingMembershipPlan.plan]) return pendingMembershipPlan.plan;
  return joinPromo.plan;
}
function isJoinPromoActive(){
  if (!joinPromo || me) return false; // guests only — a session ends promo mode
  if (isWorkerEntry()) return false; // the technician door keeps its isolation
  return true;
}
function joinPromoImgFor(plan){
  if (plan === 'homecare') {
    const card = document.querySelector('#homeCarePlanCard img');
    return (card && card.src) ? { src: card.src, alt: 'HomeCare membership — $29 per month' } : null;
  }
  const which = plan.indexOf('plus') === 0 ? 'plus' : 'yard';
  return planVariantImg(which, plan.slice(-1) === '2' ? 2 : 1);
}
function renderJoinPromo(){
  const box = document.getElementById('joinPromoBox');
  if (!box) return;
  const plan = joinPromoPlanKey();
  const info = JOIN_PLAN_INFO[plan];
  if (!info) { box.style.display = 'none'; return; }
  const lang = menuLang() === 'es' ? 'es' : 'en';
  const ui = JOIN_PROMO_UI[lang];
  const bens = (JOIN_PROMO_BENEFITS[plan] || JOIN_PROMO_BENEFITS.homecare)[lang];
  const img = joinPromoImgFor(plan);
  const visits = plan === 'homecare' ? 0 : (plan.slice(-1) === '2' ? 2 : 1);
  const sub = visits
    ? (lang === 'es' ? (visits + (visits > 1 ? ' visitas' : ' visita') + ' de yarda / mes') : (visits + ' yard visit' + (visits > 1 ? 's' : '') + ' / month'))
    : '';
  box.innerHTML =
    (img && img.src ? '<img src="' + img.src + '" alt="' + img.alt + '" style="width:100%;border-radius:10px;display:block;margin-bottom:12px">' : '')
    + ((plan === 'plus1' || plan === 'plus2') ? '<div style="display:inline-block;background:#e42535;color:#fff;font-weight:700;font-size:12.5px;border-radius:999px;padding:4px 12px;margin-bottom:8px">' + ui.best + '</div>' : '')
    + '<h2 style="margin:0 0 2px">' + info.name + '</h2>'
    + '<div style="font-size:30px;font-weight:800">$' + info.monthly + '<span style="font-size:15px;font-weight:600">' + ui.per + '</span></div>'
    + (sub ? '<div style="color:#f2f0ec;font-weight:600;margin-top:2px">' + sub + '</div>' : '')
    + '<ul style="margin:10px 0;padding-left:18px;color:#f2f0ec">' + bens.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>'
    + '<p style="margin:0;color:#f2f0ec">' + ui.formNote + '</p>'
    + '<p style="margin:10px 0 0"><a href="#memberships" style="color:#fff">' + ui.compare + '</a> · <a href="#" onclick="exitJoinPromo();return false;" style="color:#fff">' + ui.browse + '</a></p>';
  box.style.display = 'block';
}
// Leaving the promo door on purpose (the hero's browse link, the Menú
// nav): same disarm as the v80.10.1 navigate-home dismissal, plus the
// promo state itself — the plain storefront comes back.
function exitJoinPromo(){
  joinPromo = null;
  pendingJoin = null; pendingMembershipPlan = null; authRevealed = false; membershipDeepLinkKey = '';
  if (curMode === 'join' || curMode === 'homecare') mode('login');
  if (location.hash) location.hash = ''; else render();
}
// Where a join scroll lands: in promo mode the HERO is the top of the
// door — scrolling past it to the form would hide the promotion again.
// Everywhere else the form itself, exactly as before.
function scrollToJoinDoor(){
  const t = isJoinPromoActive() ? document.getElementById('joinPromoBox') : document.getElementById('authBox');
  if (t) t.scrollIntoView({ behavior: 'smooth' });
}
// ---------- Campaign source (v24, A5) ----------
// Join links may carry ?src=CODE in the URL query OR inside the hash
// (e.g. #join-plus1?src=INSTA1). Captured once at load into
// sessionStorage 'ghsSrc', forwarded as `source` on the join calls, and
// recorded server-side at activation. The hash query is stripped right
// away so the deep-link router keeps matching the bare hash exactly.
// ---------- Worker class doors + selection (v84) ----------
// The /tecnico and /ayudante server doors land on #worker?class=<cls> —
// the SAME existing worker entry and registration, with the applicant's
// class preselected. The class is captured ONCE at load, BEFORE the
// campaign-source capture below strips the hash query (same contract as
// src), and consumed by applyWorkerEntry()/mode(): a logged-out visitor
// lands straight on the application with his card already picked. The
// pick is still the applicant's — he can tap the other card any time
// before submitting.
let workerDoorClass = '';
function captureWorkerDoorClass(){
  try {
    const h = location.hash || '';
    const qi = h.indexOf('?');
    if (qi < 0 || h.slice(0, qi) !== '#worker') return;
    const parts = h.slice(qi + 1).split('&');
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq > 0 && part.slice(0, eq) === 'class') {
        const v = part.slice(eq + 1);
        if (v === 'tecnico' || v === 'ayudante') workerDoorClass = v;
      }
    }
    if (workerDoorClass) { try { sessionStorage.setItem('ghsWorkerClass', workerDoorClass); } catch (e) {} }
  } catch (e) {}
}
captureWorkerDoorClass();
// Step 1 of the application: the two class cards. The state lives in
// workerClassSel ('' until the applicant picks — doAuth refuses to
// submit without it, mirroring the server's WORKER_CLASS_REQUIRED).
let workerClassSel = '';
let _doorClassApplied = false;
function paintWorkerClass(){
  const t = document.getElementById('wClassTecnico'), a = document.getElementById('wClassAyudante');
  if (t) t.classList.toggle('sel', workerClassSel === 'tecnico');
  if (a) a.classList.toggle('sel', workerClassSel === 'ayudante');
  const tech = document.getElementById('wTechOnly');
  if (tech) tech.style.display = workerClassSel === 'ayudante' ? 'none' : '';
}
function selectWorkerClass(cls){
  workerClassSel = (cls === 'ayudante') ? 'ayudante' : 'tecnico';
  // The class IS the application type now: keep the legacy "applying as"
  // pick in sync so the stored profile keeps its historical shape.
  setPickSelection('wRole', workerClassSel === 'tecnico' ? 'Skilled subcontractor' : 'Helper');
  paintWorkerClass();
}
function consumeDoorClass(openForm){
  if (_doorClassApplied) return;
  let dc = workerDoorClass;
  if (!dc) { try { dc = sessionStorage.getItem('ghsWorkerClass') || ''; } catch (e) { dc = ''; } }
  if (dc !== 'tecnico' && dc !== 'ayudante') return;
  _doorClassApplied = true;
  workerDoorClass = '';
  try { sessionStorage.removeItem('ghsWorkerClass'); } catch (e) {}
  if (openForm && curMode !== 'worker') mode('worker');
  selectWorkerClass(dc);
}
function parseSrcParam(str){
  if (!str) return '';
  const parts = String(str).split('&');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === 'src') {
      try { return decodeURIComponent(part.slice(eq + 1)); } catch (e) { return part.slice(eq + 1); }
    }
  }
  return '';
}
function captureCampaignSource(){
  try {
    let src = parseSrcParam((location.search || '').replace(/^\?/, ''));
    const h = location.hash || '';
    const qi = h.indexOf('?');
    if (qi >= 0) {
      const fromHash = parseSrcParam(h.slice(qi + 1));
      if (fromHash) src = fromHash;
      const bare = h.slice(0, qi);
      try { history.replaceState(null, '', location.pathname + (location.search || '') + bare); }
      catch (e) { try { location.hash = bare; } catch (e2) {} }
    }
    if (!src) {
      try {
        const qs = new URLSearchParams((location.search || '').replace(/^\?/, ''));
        const parts = [qs.get('utm_source'), qs.get('utm_medium'), qs.get('utm_campaign')].filter(Boolean).join('_');
        if (parts) src = parts;
      } catch (e) {}
    }
    if (src) { try { sessionStorage.setItem('ghsSrc', String(src).slice(0, 64)); } catch (e) {} }
  } catch (e) {}
}
function campaignSource(){
  try { return sessionStorage.getItem('ghsSrc') || ''; } catch (e) { return ''; }
}
captureCampaignSource();

// ---------- v80.12: view beacon (Tráfico) ----------
// One fire-and-forget count per major storefront view — the server
// keeps ONLY aggregate daily counters (by day + source); nothing
// per-visitor is stored on either end. Worker/admin sessions never
// count (the server agrees). The same view re-counts only after 20 s,
// so SPA re-renders don't inflate the funnel's top.
let _trackedView812 = '', _trackedAt812 = 0;
function trackView812(view, force){
  try {
    if (me && me.role !== 'customer') return;
    const now = Date.now();
    if (!force && _trackedView812 === view && (now - _trackedAt812) < 20000) return;
    _trackedView812 = view; _trackedAt812 = now;
    fetch('/api/track/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view: view, src: campaignSource() || '' }), keepalive: true }).catch(function () {});
  } catch (e) {}
}
function trackRouteView812(){
  try {
    const h = location.hash || '';
    if (isWorkerEntry() || h.indexOf('#worker') === 0 || h.indexOf('#login-worker') === 0) return;
    if (isInfoRoute() || isTermsRoute()) return;
    if (isCartRoute()) { trackView812('cart'); return; }
    if (membershipJoinHashConfig() || isMembershipRoute()) { trackView812('join'); return; }
    // 'menu' is a sticky destination (goMenu fires it directly): don't
    // let the very next render overwrite it as 'home' within the window.
    if (_trackedView812 === 'menu' && (Date.now() - _trackedAt812) < 20000) return;
    trackView812('home');
  } catch (e) {}
}

// ---------- Per-variant plan images (v24 bug fix) ----------
// Each paid plan variant maps to its OWN product image whose baked-in
// price matches the variant. The 1-visit images live in the plan-card
// <img> tags in the HTML (their srcs are captured once, before any swap);
// the 2-visit images are the constants below. A priced image is never
// left showing a different price than the selected plan.
const PLAN_CARD_IMGS = {
  yard: {
    1: { alt: 'Yard Care membership — $75 per month · 1 visit' },
    2: { src: '/plan-img/yard2.webp', alt: 'Yard Care membership — $150 per month · 2 visits' }
  },
  plus: {
    1: { alt: 'HomeCare Plus membership — $100 per month · 1 yard visit' },
    2: { src: '/plan-img/plus2.webp', alt: 'HomeCare Plus membership — $175 per month · 2 yard visits' }
  }
};
const planImgOriginals = { yard: '', plus: '' };
function capturePlanImgOriginals(){
  for (const which of ['yard', 'plus']) {
    if (planImgOriginals[which]) continue;
    const img = document.getElementById(which === 'yard' ? 'yardPlanImg' : 'plusPlanImg');
    if (img && img.src && img.src !== PLAN_CARD_IMGS[which][2].src) planImgOriginals[which] = img.src;
  }
}
function planVariantImg(which, visits){
  capturePlanImgOriginals();
  const meta = PLAN_CARD_IMGS[which][visits];
  if (!meta) return null;
  return { src: visits === 1 ? planImgOriginals[which] : meta.src, alt: meta.alt };
}
function syncPlanCardImg(which, visits){
  const img = document.getElementById(which === 'yard' ? 'yardPlanImg' : 'plusPlanImg');
  if (!img) return;
  const v = planVariantImg(which, visits);
  if (!v) return;
  if (v.src) img.src = v.src;
  img.alt = v.alt;
}
// The designed yard cards (#yard-care view) get the same per-variant
// images as the plan cards — one resolver for every surface.
function syncYardCardImgs(){
  capturePlanImgOriginals();
  const map = { 'ycImg-yard1': ['yard', 1], 'ycImg-yard2': ['yard', 2], 'ycImg-plus1': ['plus', 1], 'ycImg-plus2': ['plus', 2] };
  for (const idv of Object.keys(map)) {
    const img = document.getElementById(idv);
    if (!img) continue;
    const v = planVariantImg(map[idv][0], map[idv][1]);
    if (!v) continue;
    if (v.src) img.src = v.src;
    img.alt = v.alt;
  }
}

// ---------- One-touch contact (v24, C5) ----------
// Fixed pill on customer-facing views only (public storefront, the
// memberships pages, the logged-in customer dashboard). Never on the
// technician panel, the admin views, or the standalone info pages.
function updateContactPill(){
  const pill = document.getElementById('teamContactPill');
  if (!pill) return;
  let show = false;
  if (isInfoRoute()) show = false;
  else if (isYardCalendarRoute()) show = false;
  else if (isMembershipRoute()) show = true;
  else show = (!me || me.role === 'customer');
  pill.style.display = show ? 'flex' : 'none';
  const fab = document.getElementById('photoFab');
  if (fab) fab.style.display = show ? 'block' : 'none';
}

function selectMembershipVisits(which, visits){
  const group = document.getElementById(which === 'yard' ? 'yardVisits' : 'plusVisits');
  const selectedPlan = (which === 'yard' ? 'yard' : 'plus') + visits;
  if (group) group.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === selectedPlan));
  syncPlanCardImg(which, visits);
  if (which === 'yard') {
    document.getElementById('yardPrice').textContent = visits === 2 ? '$150' : '$75';
    document.getElementById('yardJoinBtn').textContent = visits === 2 ? 'Join Yard Care — $150/mo' : 'Join Yard Care — $75/mo';
  } else {
    document.getElementById('plusPrice').textContent = visits === 2 ? '$175' : '$100';
    document.getElementById('plusJoinBtn').textContent = visits === 2 ? 'Join HomeCare Plus — $175/mo' : 'Join HomeCare Plus — $100/mo';
  }
}
function showMembershipAddressForm(kind, plan){
  pendingAddressCheckout = { kind, plan };
  if (!isMembershipRoute()) location.hash = '#memberships';
  render();
  const box = document.getElementById('membershipAddressBox');
  const input = document.getElementById('membershipServiceAddress');
  const err = document.getElementById('membershipAddressErr');
  if (input) input.value = (me && me.serviceAddress) || '';
  if (err) { err.textContent = ''; err.classList.remove('show'); }
  if (box) { box.style.display = 'block'; box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  if (input) input.focus();
}
async function saveMembershipServiceAddress(){
  const input = document.getElementById('membershipServiceAddress');
  const err = document.getElementById('membershipAddressErr');
  const serviceAddress = input ? input.value.trim() : '';
  function showAddressErr(message){ if (err) { err.textContent = message; err.classList.add('show'); } else alert(message); }
  if (!serviceAddress) { showAddressErr('Service address is required — enter the address where we will do the work.'); return; }
  try {
    const d = await api('/api/me/service-address', { method: 'POST', body: JSON.stringify({ serviceAddress }) });
    if (d.user) me = d.user; else if (me) me.serviceAddress = d.serviceAddress || serviceAddress;
    const box = document.getElementById('membershipAddressBox');
    if (box) box.style.display = 'none';
    const pending = pendingAddressCheckout; pendingAddressCheckout = null;
    if (pending) await startMembershipCheckout(pending.kind, pending.plan);
  } catch (e) { showAddressErr(e.message); }
}
async function startMembershipCheckout(kind, planOverride){
  const plan = planOverride || (kind === 'yardcare' ? pickOne('yardVisits') : pickOne('plusVisits'));
  if (!plan) { alert('Choose 1 or 2 visits per month first.'); return; }
  if (!me) {
    // Visitors get the one-submit join form (account + address + card in
    // one motion); beginInlineJoin falls back to the account-then-redirect
    // flow by itself if the inline form cannot run.
    await beginInlineJoin(kind, plan);
    return;
  }
  if (me.role !== 'customer' && me.role !== 'admin') { alert('Membership checkout is for customer accounts — log in with a customer account to join.'); return; }
  if (!(me.serviceAddress || '').trim()) { showMembershipAddressForm(kind, plan); return; }
  try {
    const d = await api('/api/stripe/checkout', { method: 'POST', body: JSON.stringify({ kind, plan, source: campaignSource(), lang: menuLang() }) });
    location.href = d.url;
  } catch (e) {
    if (e.code === 'ADDRESS_REQUIRED') { showMembershipAddressForm(kind, plan); return; }
    alert(e.message);
  }
}
function membershipPlanLine(p){
  if (!p || p.status !== 'active') return '';
  return '<b>' + escHtml(p.name) + '</b> — $' + escHtml(p.monthly) + CU('planPer') + (p.visitsPerMonth ? (p.visitsPerMonth === 1 ? CU('memPlanVisit1') : CU('memPlanVisitsN').replace('{n}', p.visitsPerMonth)) : '') + (p.type === 'plus' ? CU('memPlanPlusTag') : (p.type === 'homecare' ? CU('memPlanHcTag') : CU('memPlanYardTag')));
}
function renderMembershipPageState(){
  const el = document.getElementById('membershipPageState');
  if (!el) return;
  if (me && me.membershipPlan && me.membershipPlan.status === 'active') {
    el.innerHTML = '<div class="card panel-dark panel-green"><b>Your active plan:</b> ' + membershipPlanLine(me.membershipPlan) + '<br><span class="mut">See it anytime on your dashboard.</span></div>';
  } else {
    el.innerHTML = '';
  }
}
function renderMyMembership(){
  const el = document.getElementById('membershipSummary');
  if (!el) return;
  if (!me || me.role !== 'customer') { el.innerHTML = ''; return; }
  const p = me.membershipPlan;
  if (p && p.status === 'active') {
    el.innerHTML = '<div class="card panel-dark panel-green"><h3 style="margin-top:0">' + CU('memTitle') + '</h3>' + membershipPlanLine(p) + ((p.type === 'yard' || p.type === 'plus') ? '<div class="mut" style="margin-top:4px">' + CU('memSvcAddr') + escHtml(me.serviceAddress || CU('memNotOnFile')) + '</div><div id="myYardVisits" style="margin-top:6px"></div>' : '') + (me.freeEstimateUsed
      ? '<div style="margin-top:6px">' + CU('memEst50') + '</div>'
      : '<div style="margin-top:8px"><button onclick="requestFreeEstimate()">' + CU('memReqFreeBtn') + '</button><div class="mut" style="margin-top:4px">' + CU('memFreeIncl') + '</div></div>') + (p.cancelAt && new Date(p.cancelAt).getTime() > Date.now()
      ? '<div style="margin-top:8px"><b>' + CU('memCancelsOn') + fmtDateLong(p.cancelAt) + '</b>' + CU('memStaysActive') + '<br><button style="margin-top:6px" onclick="doReactivateMembership()">' + CU('memKeepBtn') + '</button> <button class="ghost" onclick="showChangePlan()">' + CU('memChangeBtn') + '</button></div>'
      : '<div style="margin-top:8px"><button onclick="showChangePlan()">' + CU('memChangeBtn') + '</button> <button class="ghost" onclick="showCancelMembership()">' + CU('memCancelBtn') + '</button></div>') + '<div id="membershipAction"></div>' + '<div class="mut" style="margin-top:6px">' + CU('memRenewLine') + '</div></div>';
    if (p.type === 'yard' || p.type === 'plus') loadMyYardVisits();
  } else {
    el.innerHTML = '<div class="card"><h3 style="margin-top:0">' + CU('memTitle') + '</h3><span class="mut">' + CU('memEmpty') + '</span><br><button style="margin-top:8px" onclick="location.hash=\'#memberships\'">' + CU('memViewBtn') + '</button></div>';
  }
}
// ---------- Delete my account (added 2026-10-21, v26) ----------
// One shared self-service section, painted into the current role's slot.
// The server is the authority: it re-checks the typed email and blocks
// deletion while work is in flight; this UI explains and confirms.
let delAcctPaintedFor = '';
function deleteAccountHtml(sfx){
  return '<div class="card panel-dark" style="margin-top:12px">'
    + '<h3 style="margin-top:0">' + WT('delTitle') + '</h3>'
    + '<div id="delIntro-' + sfx + '"><p class="mut" style="margin-top:0">' + WT('delIntro') + '</p>'
    + '<button class="ghost" onclick="showDeleteAccount(\'' + sfx + '\')">' + WT('delTitle') + '</button></div>'
    + '<div id="delWarn-' + sfx + '" style="display:none">'
    + '<b>' + WT('delWhatTitle') + '</b>'
    + '<ul style="margin:8px 0;padding-left:18px">'
    + '<li>' + WT('delLi1') + '</li>'
    + '<li>' + WT('delLi2') + '</li>'
    + '<li>' + WT('delLi3') + '</li>'
    + '<li>' + WT('delLi4') + '</li>'
    + '</ul>'
    + '<label>' + WT('delTypeLabel') + '</label>'
    + '<input id="delEmail-' + sfx + '" type="email" autocomplete="email" placeholder="you@email.com">'
    + '<div class="err" id="delErr-' + sfx + '"></div>'
    + '<div style="margin-top:8px"><button style="background:#b00020;border-color:#b00020" onclick="doDeleteAccount(\'' + sfx + '\')">' + WT('delYes') + '</button> '
    + '<button class="ghost" onclick="hideDeleteAccount(\'' + sfx + '\')">' + WT('delKeep') + '</button></div>'
    + '</div></div>';
}
function paintDeleteAccount(){
  const slots = { customer: 'delAcctSlotC', worker: 'delAcctSlotW', admin: 'delAcctSlotA' };
  const sfxs = { customer: 'C', worker: 'W', admin: 'A' };
  for (const role in slots) { const el = document.getElementById(slots[role]); if (el && (!me || me.role !== role)) el.innerHTML = ''; }
  if (!me) { delAcctPaintedFor = ''; return; }
  if (me.role === 'admin') { const aEl = document.getElementById(slots.admin); if (aEl) aEl.innerHTML = ''; delAcctPaintedFor = ''; return; } // v80.8: customer-facing panel — never in admin view
  const el = document.getElementById(slots[me.role]);
  if (!el) return;
  if (delAcctPaintedFor === me.id && el.innerHTML) return; // never wipe a half-typed confirmation on re-render
  el.innerHTML = deleteAccountHtml(sfxs[me.role]);
  delAcctPaintedFor = me.id;
}
function showDeleteAccount(sfx){ const w = document.getElementById('delWarn-' + sfx); const i = document.getElementById('delIntro-' + sfx); if (w) w.style.display = 'block'; if (i) i.style.display = 'none'; }
function hideDeleteAccount(sfx){ const w = document.getElementById('delWarn-' + sfx); const i = document.getElementById('delIntro-' + sfx); if (w) w.style.display = 'none'; if (i) i.style.display = 'block'; const e = document.getElementById('delErr-' + sfx); if (e) e.textContent = ''; const inp = document.getElementById('delEmail-' + sfx); if (inp) inp.value = ''; }
async function doDeleteAccount(sfx){
  const inp = document.getElementById('delEmail-' + sfx);
  const err = document.getElementById('delErr-' + sfx);
  const email = inp ? inp.value.trim() : '';
  if (err) err.textContent = '';
  if (!email) { if (err) err.textContent = WT('delNeedEmail'); return; }
  try {
    await api('/api/me/delete-account', { method: 'POST', body: JSON.stringify({ confirmEmail: email }) });
  } catch (e) { if (err) err.textContent = e.message; return; }
  const slot = document.getElementById(sfx === 'C' ? 'delAcctSlotC' : (sfx === 'W' ? 'delAcctSlotW' : 'delAcctSlotA'));
  if (slot) slot.innerHTML = '<div class="card" style="border-color:#1d5c38;background:#0b2013;margin-top:12px"><h3 style="margin-top:0">' + WT('delDoneTitle') + '</h3><p class="mut" style="margin:0">' + WT('delDoneBody') + '</p></div>';
  delAcctPaintedFor = '';
  setTimeout(function(){ location.reload(); }, 2600);
}
// ---------- My membership: change plan / cancel / undo (added 2026-10-21, v20) ----------
// Self-service from the dashboard card. A change needs the member's
// explicit agreement on the confirm screen (Gabriel: "which they agree to
// change"); Stripe prorates the difference. Cancellation takes effect at
// the END of the already-paid month (Gabriel's decision) and can be
// undone while the paid period is still running.
const MEMBERSHIP_PLAN_ORDER = ['homecare','yard1','yard2','plus1','plus2'];
function fmtDateLong(iso){ if (!iso) return ''; try { return new Date(iso).toLocaleDateString(menuLang() === 'es' ? 'es-US' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
function planVisitsText(k){ return (k === 'yard1' || k === 'plus1') ? CU('planVisits1') : ((k === 'yard2' || k === 'plus2') ? CU('planVisits2') : CU('planVisits0')); }
function membershipActionBox(){ return document.getElementById('membershipAction'); }
function cancelMembershipAction(){ const b = membershipActionBox(); if (b) b.innerHTML = ''; }
function membershipActionErr(t, id){ const e = document.getElementById(id || 'membershipActionErr'); if (e) { e.textContent = t; e.classList.add('show'); } else alert(t); }
function showChangePlan(){
  const box = membershipActionBox(); if (!box || !me || !me.membershipPlan) return;
  const cur = me.membershipPlan;
  let h = '<div style="margin-top:10px;border-top:1px dashed #cde8cd;padding-top:10px"><b>' + CU('chgTitle') + '</b><div class="mut" style="margin:4px 0">' + CU('chgCurrent') + '<b>' + escHtml(cur.name) + '</b> — $' + escHtml(cur.monthly) + CU('planPer') + CU('chgCurrentTag') + '</div>';
  for (const k of MEMBERSHIP_PLAN_ORDER){
    if (k === cur.planKey) continue;
    const i = JOIN_PLAN_INFO[k];
    h += '<button class="ghost" style="display:block;width:100%;text-align:left;margin-top:6px" onclick="showChangeConfirm(\'' + k + '\')"><b>' + i.name + '</b> — $' + i.monthly + CU('planPer') + ' • ' + planVisitsText(k) + '</button>';
  }
  h += '<div style="margin-top:8px"><button class="ghost" onclick="cancelMembershipAction()">' + CU('backBtn') + '</button></div></div>';
  box.innerHTML = h;
}
function showChangeConfirm(planKey){
  const box = membershipActionBox(); if (!box || !me || !me.membershipPlan) return;
  const cur = me.membershipPlan, info = JOIN_PLAN_INFO[planKey];
  box.innerHTML = '<div style="margin-top:10px;border-top:1px dashed #cde8cd;padding-top:10px"><b>' + CU('chgConfirmTitle') + '</b>'
    + '<p style="margin:6px 0">' + CU('chgConfirmTpl').replace('{cur}', escHtml(cur.name)).replace('{curAmt}', escHtml(cur.monthly)).replace('{next}', escHtml(info.name)).replace(/\{nextAmt\}/g, info.monthly) + '</p>'
    + '<button onclick="doChangePlan(\'' + planKey + '\')">' + CU('chgYes') + '</button> <button class="ghost" onclick="cancelMembershipAction()">' + CU('neverMind') + '</button>'
    + '<div class="err" id="membershipActionErr"></div></div>';
}
async function doChangePlan(planKey){
  try {
    const d = await api('/api/me/membership/change', { method: 'POST', body: JSON.stringify({ plan: planKey }) });
    if (d.user) me = d.user;
    cancelMembershipAction();
    renderMyMembership();
    alert('Your plan is now ' + JOIN_PLAN_INFO[planKey].name + ' — $' + JOIN_PLAN_INFO[planKey].monthly + '/mo.');
  } catch (e) { membershipActionErr(e.message); }
}
async function showCancelMembership(){
  const box = membershipActionBox(); if (!box || !me || !me.membershipPlan) return;
  const cur = me.membershipPlan;
  let until = CU('cancelUntilDefault');
  try { const d = await api('/api/me/membership'); if (d.currentPeriodEnd) until = fmtDateLong(d.currentPeriodEnd); } catch (e) {}
  box.innerHTML = '<div style="margin-top:10px;border-top:1px dashed #cde8cd;padding-top:10px"><b>' + CU('cancelTitle') + '</b>'
    + '<p style="margin:6px 0">' + CU('cancelUntilTpl').replace('{name}', escHtml(cur.name)).replace('{until}', escHtml(until)) + '</p>'
    + '<button onclick="doCancelMembership()">' + CU('cancelYes') + '</button> <button class="ghost" onclick="cancelMembershipAction()">' + CU('memKeepBtn') + '</button>'
    + '<div class="err" id="membershipCancelErr"></div></div>';
}
async function doCancelMembership(){
  try {
    const d = await api('/api/me/membership/cancel', { method: 'POST' });
    if (d.user) me = d.user;
    cancelMembershipAction();
    renderMyMembership();
  } catch (e) { membershipActionErr(e.message, 'membershipCancelErr'); }
}
async function doReactivateMembership(){
  try {
    const d = await api('/api/me/membership/reactivate', { method: 'POST' });
    if (d.user) me = d.user;
    renderMyMembership();
  } catch (e) { alert(e.message); }
}
// ---------- Inline card charge for "New HomeCare member" (added 2026-10-19) ----------
// One submit = account created + the plan charged right in the form (Stripe Elements
// keeps the card number off our servers — PCI SAQ-A).
let stripeObj = null, cardEl = null, cardHostEl = null, stripeInitPromise = null;
// Mount (or re-mount) the auth card element into the CURRENT #cardElement
// node. A render() can rebuild the auth DOM after the first mount, leaving
// the old element pointing at a detached node — so every mount is a FRESH
// element instance into whatever node is live right now.
function mountAuthCard(){
  const host = document.getElementById('cardElement');
  if (!host || !stripeObj) return false;
  if (cardEl) { try { cardEl.unmount(); } catch (e) {} cardEl = null; cardHostEl = null; }
  host.innerHTML = '';
  cardEl = stripeObj.elements().create('card', { style: { base: { fontSize: '16px', color: '#f2f0ec', iconColor: '#9a968f', '::placeholder': { color: '#8f8a81' } } } });
  cardEl.mount(host);
  cardHostEl = host;
  cardEl.on('change', e => { if (e.error) showErr(e.error.message); else hideErr(); });
  return true;
}
// v35 (Gabriel, 2026-10-22): the old boolean latch (stripeReadyFlag) made
// ONE transient failure — slow/blocked js.stripe.com on mobile data, a
// config hiccup, a mount into a rebuilt DOM node — permanent for the whole
// visit: every later call returned false instantly and the member form
// silently degraded to the account-first fallback with no way back. Now
// concurrent callers share ONE in-flight attempt, and a failure RESETS the
// state so the next call retries for real.
async function ensureStripe(){
  if (stripeObj) {
    // Success fast path — unless the auth DOM was rebuilt since the mount
    // and the card now lives in a detached node; then re-mount (fresh
    // element) into the CURRENT node.
    const host = document.getElementById('cardElement');
    if (cardEl && host && host === cardHostEl) return true;
    if (!host) return !!cardEl;
    try { return mountAuthCard(); } catch (e) { cardEl = null; cardHostEl = null; return false; }
  }
  if (stripeInitPromise) return stripeInitPromise;
  stripeInitPromise = (async () => {
    try {
      const cfg = await api('/api/stripe/config');
      const pk = cfg.publishableKey || '';
      if (!pk || typeof Stripe === 'undefined') {
        const host = document.getElementById('cardElement');
        if (host) host.innerHTML = '<p class="mut">Online signup is still being connected — create your account and text (707) 862-3773 and the Team will finish your membership.</p>';
        return false;
      }
      stripeObj = Stripe(pk);
      return mountAuthCard();
    } catch (e) {
      // Failure does NOT latch: clear everything so the next call retries.
      stripeObj = null; cardEl = null; cardHostEl = null;
      return false;
    } finally {
      stripeInitPromise = null;
    }
  })();
  return stripeInitPromise;
}
async function chargeHomeCare(email){
  const btn = document.getElementById('authBtn');
  try{
    const okS = await ensureStripe();
    if (!okS || !cardEl) {
      showErr('Online HomeCare signup is still being connected — your account was created. Text (707) 862-3773 and the Team will finish your membership.');
      render(); return;
    }
    btn.disabled = true; btn.textContent = CU('procGen');
    const s = await api('/api/stripe/homecare-subscribe', { method: 'POST', body: JSON.stringify({ source: campaignSource() }) });
    const pmArgs = { payment_method: { card: cardEl, billing_details: {
        name: document.getElementById('aName').value.trim(),
        email: email,
        phone: document.getElementById('aPhone').value.trim()
      } } };
    // v80.2: a trial join's secret is a SetupIntent (the $0 trial
    // invoice has no PaymentIntent to confirm) — confirm it as a
    // setup; the card is saved for the day-30 charge either way.
    const conf = s.mode === 'setup' ? await stripeObj.confirmCardSetup(s.clientSecret, pmArgs) : await stripeObj.confirmCardPayment(s.clientSecret, pmArgs);
    if (conf.error) throw new Error(conf.error.message);
    const chk = await api('/api/stripe/homecare-confirm', { method: 'POST' });
    try { cardEl.clear(); } catch(e){}
    btn.disabled = false; mode('homecare');
    if (chk.active) {
      document.getElementById('authBox').innerHTML = '<h3>' + CU('welcomeHcTitle') + '</h3><p>' + (chk.trial ? CU('memActiveTrial') : CU('memActivePaid')) + CU('welcomeEstNote') + '</p>';
    }
    render();
  }catch(e){
    btn.disabled = false; mode('homecare');
    showErr(e.message);
  }
}
mode('login');
async function api(path, opts){ const r = await fetch(path, Object.assign({headers:{'Content-Type':'application/json'}}, opts||{})); const d = await r.json().catch(()=>({})); if(!r.ok) { const err = new Error(d.error||'Something failed'); err.code = d.code || ''; err.status = r.status; throw err; } return d; }
function showErr(t){ const e=document.getElementById('authErr'); e.style.color=''; e.style.background=''; e.style.borderColor=''; e.textContent=t; e.classList.add('show'); }
function hideErr(){ const e=document.getElementById('authErr'); e.style.color=''; e.style.background=''; e.style.borderColor=''; e.textContent=''; e.classList.remove('show'); }
function showInfo(t){ const e=document.getElementById('authErr'); e.style.color='#14532d'; e.style.background='#f0fdf4'; e.style.borderColor='#86efac'; e.textContent=t; e.classList.add('show'); }
// ---------- Forgot / reset password (added 2026-10-21, v20) ----------
// The server answers /api/auth/forgot identically whether or not the
// email has an account, so this form can never reveal who is registered.
async function forgotPassword(){
  const email = (document.getElementById('aEmail').value || '').trim();
  if (!email) { showErr(isWorkerEntry() ? WT('forgotNeedEmail') : CU('resetEnterEmail')); return; }
  try {
    const d = await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email, lang: isWorkerEntry() ? workerLang() : menuLang() }) });
    showInfo(d.message || 'If that email has an account, we\'ve sent a reset link');
  } catch (e) { showErr(e.message); }
}
let pendingResetToken = '';
function checkResetHash(){
  const m = /^#reset=([0-9a-f]{32,})$/.exec(location.hash || '');
  const box = document.getElementById('resetBox');
  if (!m) { if (box) box.style.display = 'none'; pendingResetToken = ''; return; }
  pendingResetToken = m[1];
  if (box) { box.style.display = 'block'; box.scrollIntoView({ behavior: 'smooth' }); }
}
function resetErrMsg(t){ const e = document.getElementById('resetErr'); if (e) { e.textContent = t; e.classList.add('show'); } }
async function submitReset(){
  const p1 = document.getElementById('rPass1').value || '';
  const p2 = document.getElementById('rPass2').value || '';
  if (p1.length < 8) { resetErrMsg(CU('resetPassMin')); return; }
  if (p1 !== p2) { resetErrMsg(CU('resetPassMatch')); return; }
  const btn = document.getElementById('resetBtn');
  try {
    btn.disabled = true;
    const d = await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token: pendingResetToken, password: p1 }) });
    pendingResetToken = '';
    document.getElementById('resetBox').style.display = 'none';
    if (location.hash) location.hash = '';
    showLogin();
    showInfo(d.message || CU('resetChanged'));
  } catch (e) { resetErrMsg(e.message); }
  finally { btn.disabled = false; }
}
document.querySelectorAll('.pick').forEach(function(g){
  g.addEventListener('click', function(e){ const b=e.target.closest('button'); if(!b) return;
    if(g.classList.contains('multi')) b.classList.toggle('sel');
    else { g.querySelectorAll('button').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); }
  });
});
function pickVals(idv){ return [...document.querySelectorAll('#'+idv+' button.sel')].map(b=>b.dataset.v); }
function pickOne(idv){ const b=document.querySelector('#'+idv+' button.sel'); return b?b.dataset.v:''; }
// v75: read the application's availability CHECKBOXES into the structured
// shape the server stores (days as JS getDay numbers, shift keys, the
// on-demand flag) plus a compact English summary that stays on
// profile.availability as application history (the admin detail row).
function workerAvailFromForm(){
  const days = [...document.querySelectorAll('.wDay')].filter(c => c.checked).map(c => parseInt(c.value, 10)).filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort();
  const shifts = [...document.querySelectorAll('.wShift')].filter(c => c.checked).map(c => c.value).filter(v => ['morning', 'afternoon', 'evening'].includes(v));
  const onDemand = !!((document.getElementById('wOnDemand') || {}).checked);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const parts = [];
  if (days.length) parts.push(days.map(d => dayNames[d]).join(' '));
  if (shifts.length) parts.push(shifts.join(', '));
  if (onDemand) parts.push('on-demand OK');
  return { value: { preset: days.length ? 'custom' : 'anytime', days: days, shifts: shifts, onDemand: onDemand }, summary: parts.join(' · ') };
}
// v72 (L-1): the 1–10 self-rating block was removed from the application
// form — skills are captured ONCE, in the trades boxes (1–5 + tools).
// Old profiles keep their stored selfRatings; the admin card still shows
// them ("self X/10" in skillRankHtml). Nothing reads them from the form.
// v41: the 7 trade boxes (level 1-5 + has-tools) from the application form.
const TRADE_KEYS_CLIENT = ['handyman','carpentry','electrical','plumbing','gardening','hvac','mechanic'];
const TRADE_NAMES_CLIENT = { handyman:'Handyman (general)', carpentry:'Carpintería / Carpentry', electrical:'Electricidad / Electrical', plumbing:'Plomería / Plumbing', gardening:'Jardinería / Gardening', hvac:'HVAC', mechanic:'Mecánica / Mechanic' };
function pickTradeSkills(){
  const r={};
  TRADE_KEYS_CLIENT.forEach(function(k){
    const sel=document.getElementById('ts-level-'+k);
    const chk=document.getElementById('ts-tools-'+k);
    const v=sel?parseInt(sel.value,10):NaN;
    if(v>=1 && v<=5) r[k]={level:v, tools:!!(chk&&chk.checked)};
  });
  return r;
}
// ---------- Home details + start preference (added 2026-10-21) ----------
// Optional facts about the home (ZIP is never required) and a start-date
// PREFERENCE — the Team confirms the exact day; picking a date books
// nothing and charges nothing.
function readStartPick(pickId, dateId){
  const t = pickOne(pickId);
  if (t === 'date') { const d = document.getElementById(dateId); const v = d ? d.value : ''; if (v) return { type: 'date', date: v }; }
  return { type: 'asap', date: null };
}
function readHomeForm(){
  return {
    zipCode: document.getElementById('aZip').value.trim(),
    homeType: document.getElementById('aHomeType').value,
    yardSize: document.getElementById('aYardSize').value,
    homeNotes: document.getElementById('aHomeNotes').value.trim(),
    startPreference: readStartPick('aStartPick', 'aStartDate')
  };
}
function syncPickDate(pickId, dateId){
  const d = document.getElementById(dateId); if (!d) return;
  d.style.display = pickOne(pickId) === 'date' ? 'block' : 'none';
}
function setPickSelection(pickId, v){
  const g = document.getElementById(pickId); if (!g) return;
  g.querySelectorAll('button').forEach(function(b){ b.classList.toggle('sel', b.dataset.v === v); });
}
[['aStartPick','aStartDate'],['hStartPick','hStartDate']].forEach(function(pair){
  const p = document.getElementById(pair[0]);
  if (p) p.addEventListener('click', function(){ setTimeout(function(){ syncPickDate(pair[0], pair[1]); }, 0); });
});
(function setStartDateMins(){
  const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  ['aStartDate', 'hStartDate'].forEach(function(idv){ const d = document.getElementById(idv); if (d) d.min = iso; });
})();
let homeFormSig = '';
function syncHomeDetailsForm(){
  if (!me || me.role !== 'customer') return;
  const sp = me.startPreference || { type: 'asap', date: null };
  const sig = JSON.stringify([me.zipCode || '', me.homeType || '', me.yardSize || '', me.homeNotes || '', sp.type || 'asap', sp.date || '']);
  if (sig === homeFormSig) return;
  homeFormSig = sig;
  const z = document.getElementById('hZip'); if (z) z.value = me.zipCode || '';
  const ht = document.getElementById('hHomeType'); if (ht) ht.value = me.homeType || '';
  const ys = document.getElementById('hYardSize'); if (ys) ys.value = me.yardSize || '';
  const hn = document.getElementById('hHomeNotes'); if (hn) hn.value = me.homeNotes || '';
  setPickSelection('hStartPick', sp.type === 'date' ? 'date' : 'asap');
  const d = document.getElementById('hStartDate');
  if (d) d.value = (sp.type === 'date' && sp.date) ? sp.date : '';
  syncPickDate('hStartPick', 'hStartDate');
}
async function saveHomeDetails(){
  const msg = document.getElementById('homeDetailsMsg');
  const body = {
    zipCode: document.getElementById('hZip').value.trim(),
    homeType: document.getElementById('hHomeType').value,
    yardSize: document.getElementById('hYardSize').value,
    homeNotes: document.getElementById('hHomeNotes').value.trim(),
    startPreference: readStartPick('hStartPick', 'hStartDate')
  };
  if (msg) msg.textContent = 'Saving…';
  try {
    const d = await api('/api/me/home-details', { method: 'POST', body: JSON.stringify(body) });
    if (d.user) me = d.user;
    homeFormSig = '';
    syncHomeDetailsForm();
    if (msg) msg.textContent = 'Saved ✓';
  } catch (e) { if (msg) msg.textContent = e.message; }
}
let authBusy = false;
async function doAuth(){
  // v77: one submit at a time — a double-tap on the join button used to
  // fire a second signup (409 "email already registered") or a duplicate
  // charge attempt while the first was still in flight.
  if (authBusy) return; authBusy = true;
  const email=document.getElementById('aEmail').value.trim(), password=document.getElementById('aPass').value;
  try{
    if(curMode==='login'){ const d=await api('/api/login',{method:'POST', body:JSON.stringify({email,password})}); me=d.user; syncEntryFlag(); healWorkerLocFlag(); healLangFromAccount(); }
    else { if (curMode==='worker' && !workerClassSel) { showErr(WT('classRequired')); return; } const availCbs = workerAvailFromForm(); const profile = curMode==='worker' ? { applyingAs:pickOne('wRole'), city:document.getElementById('wCity').value.trim(), areas:document.getElementById('wAreas').value.trim(), skills:pickVals('wSkills'), gear:pickVals('wGear'), experience:document.getElementById('wExp').value, vehicleStyle:document.getElementById('wVehicle').value, haul:document.getElementById('wHaul').value, license:document.getElementById('wLicense').value, insurance:document.getElementById('wInsurance').value, availability:availCbs.summary, notes:document.getElementById('wNotes').value.trim(), tradeSkills:pickTradeSkills(), primaryTrade:(document.getElementById('wPrimaryTrade')||{}).value || '', ownTools: pickOne('wOwnTools') ? pickOne('wOwnTools')==='yes' : undefined, ownTransport: pickOne('wOwnTransport') ? pickOne('wOwnTransport')==='yes' : undefined } : {};
      const serviceAddress = (curMode==='customer' || curMode==='join') ? document.getElementById('aServiceAddress').value.trim() : '';
      // v77: a plan picked in the plain form's OPTIONAL membership picker
      // arms the standard resume — after the account exists, submit
      // continues to that plan's secure checkout (v74 trial included for
      // HomeCare), exactly like the member-join fallback. No pick = the
      // account alone, no charge surface at all.
      if (curMode==='customer' && !pendingMembershipPlan && optPlanPicked()) { const op = document.getElementById('aOptPlan').value; pendingMembershipPlan = { kind: JOIN_PLAN_INFO[op].kind, plan: op }; }
      if (curMode==='customer' && pendingMembershipPlan && !serviceAddress) { showErr(CU('errAddressReq')); return; }
      if (curMode==='join' && pendingJoin && pendingJoin.kind !== 'homecare' && !serviceAddress) { showErr(CU('errAddressReq')); return; }
      const role = (curMode==='homecare' || curMode==='join') ? 'customer' : curMode;
      const homePayload = (curMode==='customer' || curMode==='join' || curMode==='homecare') ? readHomeForm() : {};
      const d=await api('/api/signup',{method:'POST', body:JSON.stringify(Object.assign({source: campaignSource(), lang: curMode === 'worker' ? workerLang() : menuLang(), name:document.getElementById('aName').value.trim(), email, password, phone:document.getElementById('aPhone').value.trim(), serviceAddress: (curMode==='customer' || curMode==='join') ? serviceAddress : undefined, role:role, workerClass: curMode==='worker' ? workerClassSel : undefined, profile, availability: curMode==='worker' ? availCbs.value : undefined}, homePayload))});
      const l=await api('/api/login',{method:'POST', body:JSON.stringify({email,password})}); me=l.user; syncEntryFlag();
      if(curMode==='homecare' && !(pendingMembershipPlan && pendingMembershipPlan.kind !== 'homecare')){ await chargeHomeCare(email); return; } // legacy homecare-mode submit: inline charge, then welcome — but a pending yard/plus join (Stripe.js fallback) outranks it: never let it become a default-price HomeCare charge; the resume below takes the user to the selected plan's checkout instead
      if(curMode==='join' && pendingJoin){
        // One member form — the SELECTOR decides the rails: HomeCare charges
        // via the homecare inline endpoints; Yard/Plus via membership-subscribe.
        if (pendingJoin.plan === 'homecare'){
          if (!(pendingMembershipPlan && pendingMembershipPlan.kind !== 'homecare')) { await chargeHomeCare(email); return; }
          // else: a pending yard/plus join (Stripe.js fallback) outranks the
          // selector — fall through to the membership resume below, never the stale default.
        } else { await finishInlineJoin(email); return; } // one-submit join: card charge + activation, then welcome
      }
    }
    // Memberships page join: account first, then straight to checkout.
    if (pendingMembershipPlan && me && me.role === 'customer') {
      const pending = pendingMembershipPlan; pendingMembershipPlan = null;
      render();
      await startMembershipCheckout(pending.kind, pending.plan);
      return;
    }
    if (pendingMembershipPlan && me && me.role !== 'customer') pendingMembershipPlan = null;
    render();
  }catch(e){ showErr(e.message); }
  finally { authBusy = false; }
}
// v80.10.1: the sticky technician-door flag follows the SESSION, not the
// visit — a worker login arms it, any other login disarms it, logout and
// the loadMe heal below clear it. A logged-out visitor always lands on
// the customer home.
function syncEntryFlag(){ try { if (me && me.role === 'worker') localStorage.setItem('ghs_entry','worker'); else if (me) localStorage.removeItem('ghs_entry'); } catch (e) {} }
async function logout(){ try { localStorage.removeItem('ghs_entry'); } catch (e) {} await api('/api/logout',{method:'POST'}).catch(()=>{}); location.reload(); }
async function loadMe(){ try{ const d=await api('/api/me'); me=d.user; }catch(e){}
  syncEntryFlag(); healWorkerLocFlag(); healLangFromAccount();
  // Heal a stale flag: the boot snippet bounced this page to #worker but
  // there is NO session — the visitor is logged out, so the flag was a
  // leftover (a mere #worker visit under v63–v80.10, or a logout that
  // predates the clearing above). Drop it and return to the storefront.
  if (!me && window.__ghsBootBounce) { window.__ghsBootBounce = false; try { localStorage.removeItem('ghs_entry'); } catch (e) {} if (location.hash === '#worker') location.hash = ''; }
  render(); }
let notifs=[]; let lastUnread=-1;
async function loadNotifs(){ if(!me) return; refreshPermCard(); maybeSubscribePush(); try{ const d=await api('/api/notifications'); notifs=d.notifications||[]; const b=document.getElementById('bellBadge'); b.textContent=d.unread||''; b.style.display=d.unread?'inline-block':'none'; if(lastUnread>=0 && d.unread>lastUnread && window.Notification && Notification.permission==='granted' && notifs[0]){ try{ var fn26 = new Notification('General Handyman Solutions', { body: notifs[0].text, icon: '/icons/icon-192.png', tag: notifs[0].type || undefined }); fn26.onclick = function(){ try{ window.focus(); }catch(e){} var tg26 = notifTargetFor(notifs[0]); if (tg26) notifGo(tg26); }; }catch(e){} } lastUnread=d.unread||0; if(document.getElementById('notifPanel').style.display==='block') renderNotifs(); }catch(e){} }
function renderNotifs(){ const p=document.getElementById('notifPanel'); p.innerHTML='<h3 style="margin-top:0">' + CU('notifTitle') + '</h3>'+(notifs.length?notifs.map(function(n){
  var urgent=n.type==='invoice_reminder';
  var payBtn='';
  if(urgent){ var m=String(n.text).match(/\/invoice\/([\w-]+)/); if(m) payBtn='<div style="margin-top:6px"><a href="/invoice/'+m[1]+'"><button style="background:#e42535;color:#fff;border:0;border-radius:999px;padding:8px 18px;font-weight:700;cursor:pointer">' + CU('notifPayNow') + '</button></a></div>'; }
  // v80 P1-4: a row with a structured target is TAPPABLE — it lands on
  // the exact request / job / proposal / page the notice is about.
  var tgt = notifTargetFor(n);
  var click = tgt ? ' onclick="notifGo(\''+tgt.replace(/'/g,"\\'")+'\')" style="cursor:pointer" title="' + CU('notifOpenTitle') + '"' : '';
  var arrow = tgt ? ' <span style="color:#e42535;font-weight:700">→</span>' : '';
  return '<div'+click+' style="padding:9px 4px;border-bottom:1px solid #26262a;'+(n.read?'opacity:.55':'')+(urgent?';background:#2a0d10;border-left:4px solid #e42535;padding-left:10px;border-radius:6px':'')+'"><div>'+escHtml(n.text)+arrow+'</div>'+payBtn+'<div class="mut">'+new Date(n.at).toLocaleString()+'</div></div>';
}).join(''):'<div class="empty"><p class="mut">' + CU('notifEmpty') + '</p></div>'); }
// v80 P1-4: resolve a notification's target for THIS session. Worker
// sessions are NEVER routed to a customer surface (v79 frontier): a
// customer-side target in a worker's bell falls back to #worker.
// v80.26: the destination is STRUCTURED (targetType + targetId, stored
// server-side from the one route map). Resolution prefers the structured
// fields, falls back to the stored route string, then to the legacy
// invoice-link-in-text. An unknown type, a malformed id or a destination
// for another role resolves to '' — the row renders PLAIN, never a dead
// tap. The same resolver feeds the bell, the foreground browser
// Notification and (mirrored in sw.js) the Web Push click.
var NOTIF_ROUTES = {
  request: function(id){ return '#req=' + id; }, job: function(id){ return '#job=' + id; },
  workerJob: function(id){ return '#wjob=' + id; }, yardVisit: function(id){ return '#yard=' + id; },
  workerYardVisit: function(id){ return '#wyard=' + id; }, invoice: function(id){ return '/invoice/' + id; },
  estimate: function(id){ return '/estimate/' + id; }, cart: function(id){ return '/cart/' + id; },
  membership: function(){ return '#memberships'; }, worker: function(){ return '#worker'; },
  adminYard: function(){ return '#yard-calendar'; }
};
var NOTIF_ID_TYPES = { request: 1, job: 1, workerJob: 1, yardVisit: 1, workerYardVisit: 1, invoice: 1, estimate: 1, cart: 1 };
var NOTIF_CUSTOMER_TYPES = { request: 1, job: 1, invoice: 1, estimate: 1, cart: 1, yardVisit: 1, membership: 1 };
var NOTIF_WORKER_TYPES = { workerJob: 1, workerYardVisit: 1, worker: 1 };
function notifTypeOfRoute(t){
  var m = String(t || '').match(/^#(req|job|wjob|yard|wyard)=/);
  if (m) return { req: 'request', job: 'job', wjob: 'workerJob', yard: 'yardVisit', wyard: 'workerYardVisit' }[m[1]];
  if (String(t || '').indexOf('/invoice/') === 0) return 'invoice';
  if (String(t || '').indexOf('/estimate/') === 0) return 'estimate';
  if (String(t || '').indexOf('/cart/') === 0) return 'cart';
  if (t === '#memberships') return 'membership';
  if (t === '#worker') return 'worker';
  if (t === '#yard-calendar') return 'adminYard';
  return '';
}
function notifTargetFor(n){
  var route = '', type = '';
  if (n && n.targetType && NOTIF_ROUTES[n.targetType] && (!NOTIF_ID_TYPES[n.targetType] || /^[\w-]+$/.test(String(n.targetId || '')))) {
    route = NOTIF_ROUTES[n.targetType](String(n.targetId || '')); type = n.targetType;
  }
  if (!route) {
    var t = (n && n.target) || '';
    if (t) { route = t; type = notifTypeOfRoute(t); }
    else { var m = String((n && n.text) || '').match(/\/invoice\/([\w-]+)/); if (m) { route = '/invoice/' + m[1]; type = 'invoice'; } }
  }
  if (!route) return '';
  if (me && me.role === 'worker' && NOTIF_CUSTOMER_TYPES[type]) return '#worker';
  if (me && me.role === 'customer' && NOTIF_WORKER_TYPES[type]) return '';
  if (type === 'adminYard' && !(me && me.role === 'admin')) return '';
  return route;
}
function notifGo(t){
  if (!t) return;
  var p = document.getElementById('notifPanel'); if (p) p.style.display = 'none';
  if (t.charAt(0) === '/') { location.href = t; return; }
  if (location.hash === t) { routeNotifHash(); return; }
  location.hash = t; // hashchange -> routeNotifHash (deep hashes) or render (plain routes)
  if (t === '#worker' || t === '#memberships' || t === '#yard-calendar') render();
}
// Deep notification hashes (#req= / #job= / #wjob= / #yard= / #wyard=)
// are not routes of their own: they land on the owner view and FOCUS
// the exact card. A card that never renders (the object is gone) just
// leaves the owner on their view — the focus gives up quietly.
function routeNotifHash(){
  var h = location.hash || '';
  var m = h.match(/^#(req|job|wjob|yard|wyard)=([\w-]+)$/);
  if (!m) return false;
  var conf = { req: ['reqcard-', ''], job: ['jobcard-', ''], wjob: ['wjobcard-', '#worker'], yard: ['yardcard-', '#memberships'], wyard: ['wyardcard-', '#worker'] }[m[1]];
  var elId = conf[0] + m[2];
  try { history.replaceState(null, '', location.pathname + location.search + conf[1]); } catch (e) { if (conf[1]) location.hash = conf[1]; }
  render();
  focusCardWhenReady(elId, m[1] === 'yard' ? 'myYardVisits' : (m[1] === 'wyard' ? 'workerYardVisits' : ''));
  // v80.16: a worker's job notification opens the job DETAIL, not just
  // the board — seeing the card flash was the "cannot open the job"
  // complaint (Ri Chen). The fetch enforces the same access rules.
  if (m[1] === 'wjob' && me && me.role === 'worker') { try { openJobDetail(m[2]); } catch (e) {} }
  return true;
}
function focusCardWhenReady(elId, fallbackId){
  var tries = 0;
  var iv = setInterval(function(){
    var el = document.getElementById(elId);
    if (el) { clearInterval(iv); try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} el.classList.add('flash'); setTimeout(function(){ el.classList.remove('flash'); }, 2600); }
    else if (++tries > 24) { clearInterval(iv); if (fallbackId) focusCardWhenReady(fallbackId, ''); }
  }, 250);
}
async function toggleNotifs(){ const p=document.getElementById('notifPanel'); const open=p.style.display==='block'; p.style.display=open?'none':'block'; if(!open){ renderNotifs(); try{ await api('/api/notifications/read',{method:'POST',body:JSON.stringify({})}); setTimeout(loadNotifs,600); }catch(e){} } }
setInterval(()=>{ if(me) loadNotifs(); }, 20000);
function render(){
  trackRouteView812(); // v80.12: aggregate view beacon (no-op off the storefront)
  updateContactPill();
  paintDeleteAccount();
  document.getElementById('who').textContent = me ? (me.name+' • '+me.role+(me.role==='worker'?' • '+me.status:'')) : '';
  document.getElementById('bellBtn').style.display = me ? 'inline-block':'none'; if(me) loadNotifs();
  const glo = document.getElementById('globalLogoutRow'); if (glo) glo.style.display = me ? '' : 'none'; // v80.10: no Log out button while logged out (audit)
  paintSoundBtn();
  if (me) esStart(); else esClose(); // v23: live event stream follows the session
  paintMemberLoginBtn();
  paintCartBtn();
  // v79 P0-2: ROLE FRONTIER — a technician session never renders the
  // customer money routes (#order/* legacy, #memberships, #cart): their
  // zone shows only their jobs, their pay and their payouts. They land
  // back on #worker with a bilingual note explaining why.
  if (me && me.role === 'worker' && (isOrderRoute() || isMembershipRoute() || isCartRoute())) {
    try { sessionStorage.setItem('ghsRoleNote', '1'); } catch (e) {}
    location.hash = '#worker';
    return;
  }
  const cbx78 = document.getElementById('cartBox');
  if (cbx78 && !isCartRoute()) cbx78.style.display = 'none';
  // v42: the in-app Menu is one tap away on every CUSTOMER view (guest,
  // logged-in panel, memberships/yard browsing). Worker/admin views are
  // exempt — their isolation stands.
  const mnl = document.getElementById('menuNavLink');
  if (mnl) mnl.style.display = (me && me.role !== 'customer') ? 'none' : '';
  // v80.9: the global menu search + the footer belong to the customer
  // storefront only — worker/admin zones keep their isolation.
  const hsw = document.getElementById('homeSearchWrap');
  if (hsw) hsw.style.display = (me && me.role !== 'customer') ? 'none' : '';
  const ftEl = document.getElementById('appFooter');
  if (ftEl) ftEl.style.display = (me && me.role !== 'customer') ? 'none' : '';
  // Public info pages (#terms, #how-it-works) are standalone public views:
  // while one is the route, it replaces every other box — no login needed.
  const tb = document.getElementById('termsBox');
  if (tb) tb.style.display = isTermsRoute() ? 'block' : 'none';
  const hb = document.getElementById('howBox');
  if (hb) hb.style.display = isHowRoute() ? 'block' : 'none';
  const pb = document.getElementById('privacyBox');
  if (pb) pb.style.display = isPrivacyRoute() ? 'block' : 'none';
  if (isInfoRoute()) {
    const cgI = document.getElementById('compareGridBox'); if (cgI) cgI.style.display = 'none';
    const mbI = document.getElementById('membershipsBox'); if (mbI) mbI.style.display = 'none';
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('customerBox').style.display = 'none';
    document.getElementById('workerBox').style.display = 'none';
    document.getElementById('adminBox').style.display = 'none';
    const ybI = document.getElementById('yardCalendarBox'); if (ybI) ybI.style.display = 'none';
    const infoBox = isTermsRoute() ? tb : (isPrivacyRoute() ? pb : hb);
    if (infoBox) infoBox.scrollIntoView();
    return;
  }
  // Memberships is a public page of its own (#memberships): while it is the
  // route, it replaces the auth/customer/technician/admin boxes.
  // v79: the legacy #order/<serviceId> page is RETIRED — the route now
  // converts into the v78 cart (service + validated add-ons + handoff
  // prefill) and lands on #cart. No order is ever created before the
  // payment verifies (P0-4).
  if (isOrderRoute()) { retireOrderRoute(); return; }
  // v78: the cart + embedded checkout is a public page of its own (#cart):
  // while it is the route, it replaces every other box — guests included.
  if (isCartRoute()) {
    const cb78 = document.getElementById('cartBox');
    if (cb78) cb78.style.display = 'block';
    const cgC = document.getElementById('compareGridBox'); if (cgC) cgC.style.display = 'none';
    const mbC = document.getElementById('membershipsBox'); if (mbC) mbC.style.display = 'none';
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('customerBox').style.display = 'none';
    document.getElementById('workerBox').style.display = 'none';
    document.getElementById('adminBox').style.display = 'none';
    const ybC = document.getElementById('yardCalendarBox'); if (ybC) ybC.style.display = 'none';
    renderCart();
    return;
  }
  const onMemberships = isMembershipRoute();
  const mb = document.getElementById('membershipsBox');
  if (mb) mb.style.display = onMemberships ? 'block' : 'none';
  // The plan comparison grid (the six boxes) lives in the membership area
  // (#memberships); other routes replace it with their own content.
  const cgBox = document.getElementById('compareGridBox');
  if (cgBox) cgBox.style.display = onMemberships ? 'block' : 'none';
  if (onMemberships) {
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('customerBox').style.display = 'none';
    document.getElementById('workerBox').style.display = 'none';
    document.getElementById('adminBox').style.display = 'none';
    renderMembershipRouteMode();
    renderMembershipPageState();
    queueMembershipDeepLink();
    return;
  }
  // Yard Calendar is an admin-only page of its own (#yard-calendar): while it
  // is the route (and the user is the admin), it replaces every other box.
  const onYardCal = isYardCalendarRoute() && !!me && me.role==='admin';
  const yb = document.getElementById('yardCalendarBox');
  if (yb) yb.style.display = onYardCal ? 'block' : 'none';
  if (onYardCal) {
    if (cgBox) cgBox.style.display = 'none';
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('customerBox').style.display = 'none';
    document.getElementById('workerBox').style.display = 'none';
    document.getElementById('adminBox').style.display = 'none';
    loadYardCalendar();
    return;
  }
  // v80.17 PUERTA PLUS: while a cold guest join deep link is armed, the
  // app is ONE focused promo view — the plan hero (joinPromoBox) with
  // the existing join form (authBox) directly under it. The storefront,
  // the memberships page and every other box stay hidden until the
  // guest leaves the door or signs in (isJoinPromoActive turns off).
  if (me && joinPromo) joinPromo = null; // a session buries a stale arm
  const promoOn = isJoinPromoActive();
  const jpBox = document.getElementById('joinPromoBox');
  if (jpBox) jpBox.style.display = promoOn ? 'block' : 'none';
  if (promoOn) {
    renderJoinPromo();
    if (cgBox) cgBox.style.display = 'none';
    const mbP = document.getElementById('membershipsBox'); if (mbP) mbP.style.display = 'none';
    document.getElementById('authBox').style.display = 'block';
    document.getElementById('customerBox').style.display = 'none';
    document.getElementById('workerBox').style.display = 'none';
    document.getElementById('adminBox').style.display = 'none';
    const ybP = document.getElementById('yardCalendarBox'); if (ybP) ybP.style.display = 'none';
    return;
  }
  // Logged-out visitors get the public storefront: the auth (login) box is
  // NOT part of the landing — it appears only when asked for (Member log
  // in, technician entry) or when a join flow needs the form.
  const showAuth = !me && (authRevealed || !!pendingJoin || !!pendingMembershipPlan || curMode === 'join' || curMode === 'homecare' || isWorkerEntry());
  document.getElementById('authBox').style.display = showAuth ? 'block' : 'none';
  if (cgBox) cgBox.style.display = isWorkerEntry() ? 'none' : 'block';
  // Quote form is public — no account needed. "My ..." sections need a customer login.
  // v41: worker entry (#worker) shows ONLY the worker login/application —
  // the customer request form and storefront sections never squeeze it
  // (owner screenshot 2026-10-23: "no veo el login bien"). Once a worker is
  // logged in, only the worker panel shows, as before.
  const showCust = (!me || me.role==='customer') && !isWorkerEntry();
  document.getElementById('customerBox').style.display = showCust ? 'block':'none';
  document.getElementById('anonContact').style.display = !me ? 'block':'none';
  document.querySelectorAll('#customerBox .custAccountOnly').forEach(function(el){ el.style.display = (me && me.role==='customer') ? '' : 'none'; });
  const memberRow = document.getElementById('cMember');
  if(memberRow){ const showM = !!me; memberRow.style.display = showM ? '' : 'none'; const lbl = memberRow.previousElementSibling; if(lbl && lbl.tagName==='LABEL') lbl.style.display = showM ? '' : 'none'; }
  if (me && me.role === 'customer') syncMemberPicker();
  if (me && me.role === 'customer') syncHomeDetailsForm();
  document.getElementById('workerBox').style.display = me && me.role==='worker' ? 'block':'none';
  document.getElementById('adminBox').style.display = me && me.role==='admin' ? 'block':'none';
  const rn = document.getElementById('roleNote');
  if (rn) {
    let showNote = false;
    try { showNote = sessionStorage.getItem('ghsRoleNote') === '1'; } catch (e) {}
    if (me && me.role === 'worker' && showNote) {
      rn.style.display = 'block';
      rn.innerHTML = '<div class="card" style="border:1px solid #e42535;border-radius:14px;padding:12px 14px;margin:10px 0"><b>🔨 Technician zone</b><p style="margin:6px 0 0">That page is for customers — your zone shows only your jobs, your pay and your payouts.<br>Esa página es para clientes — tu zona muestra solo tus trabajos, tu paga y tus pagos.</p></div>';
      try { sessionStorage.removeItem('ghsRoleNote'); } catch (e) {}
    } else rn.style.display = 'none';
  }
  if(me && me.role==='customer'){ renderMyMembership(); loadRequests(); loadProposals(); loadMyJobs(); loadRecoveredCart(); custSummary(); loadMyReferrals(); loadSeasonal(); syncMenuLists(); }
  if(!(me && me.role==='worker' && me.status==='active')) stopDutySharing();
  if(me && me.role==='worker'){ loadJobs(); loadWorkerYardVisits(); loadPayouts(); loadWorkerSales(); loadWorkerEstimates(); loadWorkerReferrals(); loadCaptainArea(); loadWorkerProfile(); initDutySharing(); }
  if(me && me.role==='admin'){ loadAdmin(); }
  // Direct HomeCare join: after login/signup with a pending join, go straight
  // to the plan's Stripe checkout.
}
function fileToDataUrl(file){ return new Promise((resolve,reject)=>{ const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{ const max=1200; let w=img.width,h=img.height; const sc=Math.min(1, max/Math.max(w,h)); w=Math.round(w*sc); h=Math.round(h*sc);
    const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg',0.78)); };
  img.onerror=reject; img.src=url; }); }
let custAck=false;
document.getElementById('cAck').addEventListener('click', function(){ custAck=!custAck; this.textContent=(custAck?'☑':'☐')+CU('wzAckText'); this.style.borderColor=custAck?'#e42535':''; });
['cService','cEst','cCity','cWhen','cMember'].forEach(function(gid){ const g=document.getElementById(gid); if(g) g.addEventListener('click', custSummary); });
document.getElementById('rDate').addEventListener('change', custSummary);
['jService', 'jCity'].forEach(function(gid){ const g = document.getElementById(gid); if (g) { g.addEventListener('input', queueJobCandidates); g.addEventListener('change', queueJobCandidates); } });
// Member pricing presentation (added 2026-10-21; policy updated same day):
// a logged-in customer's membership picker is set FROM THE ACCOUNT, never
// left on the $75 default — members of EVERY plan (HomeCare, HomeCare Plus,
// Yard Care) see FREE while their one free estimate is unused, then the $50
// member estimate, BEFORE submitting. The estimate-type button shows the
// same price state. (The server applies the same rule authoritatively; this
// keeps the display honest.)
function syncMemberPicker(){
  const g = document.getElementById('cMember');
  if (!g) return;
  const lbl = (g.previousElementSibling && g.previousElementSibling.tagName === 'LABEL') ? g.previousElementSibling : null;
  if (!me || me.role !== 'customer') { if (lbl) lbl.textContent = CU('wzMemberLabel'); setEstTypePrice(false, false); return; }
  const hcActive = me.homeCareStatus === 'active';
  const p = me.membershipPlan || {};
  const anyMember = hcActive || (p.status === 'active' && !!p.planKey);
  const want = anyMember ? (me.freeEstimateUsed ? 'member' : 'new') : 'none';
  g.querySelectorAll('button').forEach(function(b){ b.classList.toggle('sel', b.dataset.v === want); b.disabled = true; });
  if (lbl) lbl.textContent = anyMember
    ? (me.freeEstimateUsed ? CU('memberAppliedTpl') : CU('memberFreeApplied'))
    : CU('wzMemberLabel');
  setEstTypePrice(anyMember, !me.freeEstimateUsed);
}
// The in-person choice in the estimate-type selector carries the visitor's
// own price state: $75 regular, $50 member, FREE while the member's one
// free estimate is unused.
function setEstTypePrice(anyMember, freeUnused){
  const g = document.getElementById('cEst');
  if (!g) return;
  g.querySelectorAll('button').forEach(function(b){
    if (b.dataset.v === 'inperson') b.textContent = anyMember ? (freeUnused ? CU('estTypeFree') : CU('estTypeMember')) : CU('wzEstInPersonBtn');
  });
}
function custState(){
  const est=pickOne('cEst')||'inperson', member=pickOne('cMember')||'none', when=(pickOne('cWhen')==='Pick a date' && document.getElementById('rDate').value) ? CU('wizWhenOn')+document.getElementById('rDate').value : (pickOne('cWhen')||'');
  document.getElementById('rDate').style.display = pickOne('cWhen')==='Pick a date' ? 'block':'none';
  return { service:pickOne('cService'), est, member, city:pickOne('cCity'), when };
}
function custFee(){
  const st=custState();
  if(st.est==='photo') return {label:CU('feeFreePhoto'), due:0};
  let base = st.member==='new'?0:(st.member==='member'?50:75);
  let urgent = st.when==='ASAP / Emergency';
  let due = urgent && base>0 ? Math.round(base*1.25*100)/100 : base;
  return {label:(st.member==='new'?CU('feeFreeMonth'):(st.member==='member'?CU('feeMember50'):CU('feeFlat75')))+(urgent&&base>0?CU('feeAsapTpl')+due:''), due};
}
function custSummary(){
  const st=custState(); const f=custFee();
  document.getElementById('cFeeTitle').textContent = st.est==='photo' ? CU('feeTitlePhoto') : (CU('feeTitleInPersonPre')+f.label);
  document.getElementById('cSummary').innerHTML = CU('sumService')+': <b>'+(st.service||CU('sumPickOne'))+'</b> • '+CU('sumWhere')+': <b>'+(st.city||'—')+'</b> • '+CU('sumWhen')+': <b>'+(st.when||'—')+'</b> • '+CU('sumEstimate')+': <b>'+f.label+'</b>';
  document.getElementById('cSendBtn').textContent = st.est==='photo' ? CU('sendBtnPhoto') : CU('sendBtnPre')+f.label;
  if(st.est!=='photo' && f.due>0) document.getElementById('cSummary').innerHTML += '<br><b>' + CU('sendSecuresTpl').replace('{amt}', f.due) + '</b>';
}
async function sendRequest(){
  const st=custState(); const f=custFee();
  const msg=document.getElementById('rMsg');
  if(!st.service){ msg.textContent=CU('srPickService'); return; }
  if(!document.getElementById('rAddr').value.trim()){ msg.textContent=CU('srAddAddress'); return; }
  if(!st.when){ msg.textContent=CU('srChooseWhen'); return; }
  if(!document.getElementById('rDesc').value.trim()){ msg.textContent=CU('srDescribe'); return; }
  if(!custAck){ msg.textContent=CU('srAck'); return; }
  let cName='', cEmail='', cPhone='';
  if(!me){
    cName=document.getElementById('rName').value.trim();
    cEmail=document.getElementById('rEmail').value.trim();
    cPhone=document.getElementById('rPhone').value.trim();
    if(!cName){ msg.textContent=CU('srAddName'); return; }
    if(!/.+@.+\..+/.test(cEmail)){ msg.textContent=CU('srAddEmail'); return; }
  }
  try{ const files=[...document.getElementById('rPhotos').files].slice(0,6); const photos=[];
    for(const fl of files){ photos.push(await fileToDataUrl(fl)); }
    if(st.est==='photo' && !photos.length){ msg.textContent=CU('srNeedPhoto'); return; }
    // v42: the wizard's access notes ride inside the description — the
    // request model (and what the admin sees) stays exactly the same.
    const accessEl=document.getElementById('rAccess'); const access=accessEl?accessEl.value.trim():'';
    const descFull=document.getElementById('rDesc').value+(access?'\nAccess notes: '+access:'');
    const rd=await api('/api/requests',{method:'POST', body:JSON.stringify({source: campaignSource(), lang: menuLang(), service:st.service, description:descFull, city:st.city, address:document.getElementById('rAddr').value, when:st.when, estimateType:st.est, membership:me?st.member:'none', photos, customerName:cName, customerEmail:cEmail, customerPhone:cPhone})});
    msg.textContent= me ? CU('srSentPre')+(photos.length?CU('srWithPhotosTpl').replace('{n}', photos.length):'')+CU('srSentMeSuffix')
      : CU('srSentAnonTpl').replace('{email}', cEmail);
    document.getElementById('rPhotos').value=''; if(me) loadRequests();
    if(rd && rd.request && typeof wzShowDone==='function') wzShowDone(rd.request);
  }catch(e){ msg.textContent=e.message; }
}
function escHtml(v){ return (''+(v==null?'':v)).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function moneyFmt(v){ const n=Number(v)||0; return '$'+n.toFixed(2); }
function estimateHtml(r, isCustomer){
  const e=r && r.estimate;
  if(!e || !Array.isArray(e.items) || !e.items.length) return '';
  const X=function(k){ return isCustomer ? CU(k) : (CUST_UI.en[k] !== undefined ? CUST_UI.en[k] : k); };
  const rows=e.items.map(function(it){ return '<tr><td>'+escHtml(it.description)+(it.type==='material'?' <span class="pill" style="background:#6b6762">'+X('estMatPill')+'</span>':'')+'</td><td class="num">'+escHtml(it.qty)+'</td><td class="num">'+moneyFmt(it.unitPrice)+'</td><td class="num">'+moneyFmt(it.lineTotal)+'</td></tr>'; }).join('');
  let adj='';
  if(e.asapAmount) adj+='<tr><td colspan="3">'+X('estAsapRow')+'</td><td class="num">'+moneyFmt(e.asapAmount)+'</td></tr>';
  if(e.discountAmount) adj+='<tr><td colspan="3">'+X('estDiscountRow')+escHtml(e.discountPct)+'%)</td><td class="num">−'+moneyFmt(e.discountAmount)+'</td></tr>';
  if(e.credit) adj+='<tr><td colspan="3">'+X('estCreditRow')+'</td><td class="num">−'+moneyFmt(e.credit)+'</td></tr>';
  return '<div class="estimate"><div class="estimate-head"><b>General Handyman <span>Solutions</span></b><div class="estimate-meta">'+X('estWord')+escHtml(r.id)+' • '+escHtml(r.service||'')+' • '+escHtml(r.city||'')+'<br>(707) 862-3773 • generalhandymans.app</div></div><div class="estimate-body"><b>'+X('estCustomer')+'</b> '+escHtml(r.customerName||X('estCustomerFallback'))+'<br><span class="mut">'+escHtml(r.description||'')+' • '+escHtml(r.when||'')+'</span><table><tr><th>'+X('estThConcept')+'</th><th class="num">'+X('estThQty')+'</th><th class="num">'+X('estThPrice')+'</th><th class="num">'+X('estThTotal')+'</th></tr>'+rows+'<tr><td colspan="3"><b>'+X('estSubtotal')+'</b></td><td class="num"><b>'+moneyFmt(e.subtotal)+'</b></td></tr>'+adj+'<tr class="estimate-total"><td colspan="3">'+X('estTotalWord')+'</td><td class="num">'+moneyFmt(e.total)+'</td></tr></table><div class="est-summary"><b>'+X('estDueBook')+'</b> '+moneyFmt(e.bookingDue)+' &nbsp; • &nbsp; <b>'+X('estBalanceWord')+'</b> '+moneyFmt(e.balanceDue)+'<br><span class="mut">'+((e.materialSubtotal||0)>0?X('estMatIncl'):X('estLaborOnly'))+(e.validUntil?X('estValidUntil')+escHtml(e.validUntil)+'.':X('estValid7'))+'</span>'+(r.quoteNote?'<br><b>'+X('estTeamNote')+'</b> '+escHtml(r.quoteNote):'')+'</div>'+(isCustomer && r.status==='Quoted'?'<div class="est-actions"><button class="black" onclick="actReq(\''+r.id+'\',\'approve\')">'+X('estApprove')+'</button><button class="ghost" onclick="actReq(\''+r.id+'\',\'decline\')">'+X('reqDecline')+'</button></div>':'')+'</div></div>';
}
function estimateStatusBadgeHtml(r){
  if(!r.estimate) return '';
  var label=CU('estBadgeAwaiting'), color='#b26a00';
  if(r.status==='Approved'){
    var paid=r.estimateInvoice && r.estimateInvoice.status==='paid';
    label=paid?CU('estBadgePaid'):CU('estBadgeApproved'); color='#1a7f37';
  } else if(r.status==='Declined'){ label=CU('estBadgeDeclined'); color='#6b6762'; }
  return ' <span class="pill" style="background:'+color+'">'+CU('estBadgeWord')+label+'</span>';
}
function copyEstimateLink(idv){
  var url=location.origin+'/estimate/'+idv;
  function done(){ alert('Public estimate link copied:\n'+url+'\n\nNo account needed — the customer can approve and pay from this link.'); }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(function(){ prompt('Copy the estimate link:',url); }); }
  else prompt('Copy the estimate link:',url);
}
function estimateBuilderHtml(r){
  const e=r.estimate || null;
  const items=(e && e.items && e.items.length) ? e.items : [{description:(r.service||'Labor')+' — labor only', qty:1, unitPrice:'', type:'labor'}];
  const credit=e && e.credit!=null ? e.credit : (r.estimateType==='inperson' ? (r.estimateDue||0) : 0);
  const booking=e && e.bookingDue!=null ? e.bookingDue : '';
  const opts=(e && Array.isArray(e.options) && e.options.length>=2) ? e.options : null;
  const itemsB=opts ? opts[1].items : [{description:'', qty:1, unitPrice:'', type:'labor'}];
  const validDefault=new Date(Date.now()+7*24*3600*1000).toISOString().slice(0,10);
  return '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px"><h3 style="margin-top:0">Professional estimate builder</h3><p class="mut" style="margin-top:0">Customer email: <b>'+escHtml(r.customerEmail||'not on file')+'</b> • Customer total never goes to workers.</p>'
  + '<div style="margin:8px 0"><input id="estMenuSearch-'+r.id+'" placeholder="🔎 Add from your menu — search a service (goes in as a labor line)…" oninput="renderEstMenuPicker(\''+r.id+'\')"><div id="estMenuPicker-'+r.id+'"></div></div>'
  + '<label style="display:block;margin:6px 0"><input type="checkbox" id="estOpt2-'+r.id+'" '+(opts?'checked':'')+' onchange="estOpt2Toggle(\''+r.id+'\')"> <b>Two options</b> <span class="mut">(e.g. Básico = labor only / Completo = with materials — the customer picks on the estimate page)</span></label>'
  + '<div class="est-opt2" id="estOptNames-'+r.id+'" style="display:'+(opts?'block':'none')+'"><label>Option 1 label<input id="estOptLabelA-'+r.id+'" value="'+escHtml(opts?opts[0].label:'Básico')+'" placeholder="Básico"></label><label>Option 2 label<input id="estOptLabelB-'+r.id+'" value="'+escHtml(opts?opts[1].label:'Completo')+'" placeholder="Completo"></label></div>'
  + '<div id="estRows-'+r.id+'">'+items.map(function(it){ return estimateItemRowHtml(r.id,it); }).join('')+'</div><button type="button" class="ghost" onclick="addEstimateItem(\''+r.id+'\')">+ Add line</button>'
  + '<div class="est-opt2" id="estOpt2Box-'+r.id+'" style="display:'+(opts?'block':'none')+';margin-top:10px;border-top:1px dashed var(--line);padding-top:8px"><b>Option 2 lines</b> <button type="button" class="ghost" onclick="estCopyAtoB(\''+r.id+'\')">Copy option 1 lines here</button><div id="estRowsB-'+r.id+'">'+itemsB.map(function(it){ return estimateItemRowHtml(r.id,it); }).join('')+'</div><button type="button" class="ghost" onclick="addEstimateItem(\''+r.id+'\',\'B\')">+ Add line to option 2</button></div>'
  + '<input type="hidden" id="estMemberDisc-'+r.id+'" value="'+((e&&e.memberDiscount)?'1':'0')+'">'
  + '<div class="est-grid" style="margin-top:10px"><label><input type="checkbox" id="estAsap-'+r.id+'" '+(e&&e.asap?'checked':'')+' onchange="updateEstimateSummary(\''+r.id+'\')"> ASAP / Emergency (+25% on labor)</label><label>Discount % <span class="mut">(on labor)</span><input type="number" min="0" max="90" step="0.5" id="estDiscount-'+r.id+'" value="'+(e?e.discountPct||0:0)+'" oninput="updateEstimateSummary(\''+r.id+'\')"></label><label>Appointment credit $<input type="number" min="0" step="0.01" id="estCredit-'+r.id+'" value="'+credit+'" oninput="updateEstimateSummary(\''+r.id+'\')"></label><label>Due to book $ <span class="mut">(editable)</span><input type="number" min="0" step="0.01" id="estBooking-'+r.id+'" value="'+booking+'" placeholder="Auto" oninput="updateEstimateSummary(\''+r.id+'\')"></label><label>Valid until<input type="date" id="estValid-'+r.id+'" value="'+escHtml((e&&e.validUntil)||validDefault)+'"></label></div>'
  + '<label style="margin-top:8px">Photos on the estimate <span class="mut">(the problem, or a similar finished job — the customer sees them on the page)</span></label><input type="file" id="estPhotoInput-'+r.id+'" accept="image/*" multiple onchange="estPhotosAdd(\''+r.id+'\',this)"><div id="estPhotoThumbs-'+r.id+'" style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0"></div>'
  + '<label style="margin-top:8px">Note on estimate</label><input id="qn-'+r.id+'" placeholder="Scheduling, deposit, scope notes..." value="'+escHtml(r.quoteNote||'')+'"><div class="est-summary" id="estSummary-'+r.id+'">Add the lines to see the total.</div><div class="est-actions"><button type="button" onclick="sendEstimate(\''+r.id+'\',false)">Save estimate in app</button><button type="button" class="black" onclick="sendEstimate(\''+r.id+'\',true)">Send estimate by email</button><button type="button" class="ghost" onclick="previewEstimate(\''+r.id+'\')">Preview — as the customer sees it</button>'+(e?'<button type="button" class="ghost" onclick="duplicateEstimate(\''+r.id+'\')">Duplicate estimate</button>':'')+'</div><p class="mut">“Send estimate by email” saves it in the app and emails it from generalhandymans@gmail.com, with a copy to your normal Gmail. You confirm the total before anything is sent.</p></div>';
}
function estimateItemRowHtml(reqId,it){
  it=it||{description:'',qty:1,unitPrice:'',type:'labor'};
  const mat=it.type==='material';
  return '<div class="est-row trow" data-est-row="'+reqId+'"><input data-est-desc placeholder="Labor / service line" value="'+escHtml(it.description||'')+'" oninput="updateEstimateSummary(\''+reqId+'\')"><select data-est-type onchange="updateEstimateSummary(\''+reqId+'\')" title="Line type — labor or material"><option value="labor"'+(mat?'':' selected')+'>Labor</option><option value="material"'+(mat?' selected':'')+'>Material</option></select><input data-est-qty type="number" min="0" step="0.25" value="'+escHtml(it.qty||1)+'" oninput="updateEstimateSummary(\''+reqId+'\')"><input data-est-price type="number" min="0" step="0.01" placeholder="$" value="'+escHtml(it.unitPrice||'')+'" oninput="updateEstimateSummary(\''+reqId+'\')"><button type="button" class="est-x" onclick="removeEstimateItem(this,\''+reqId+'\')" title="Remove line">×</button></div>';
}
function addEstimateItem(idv, which){ const box=document.getElementById(which==='B' ? 'estRowsB-'+idv : 'estRows-'+idv); if(box) box.insertAdjacentHTML('beforeend', estimateItemRowHtml(idv)); updateEstimateSummary(idv); }
function removeEstimateItem(btn,idv){ const row=btn.closest('.est-row'); const box=row?row.parentElement:null; if(row) row.remove(); if(box && !box.querySelectorAll('.est-row').length) box.insertAdjacentHTML('beforeend', estimateItemRowHtml(idv)); updateEstimateSummary(idv); }
function estOpt2Toggle(idv){ const on=document.getElementById('estOpt2-'+idv).checked; document.getElementById('estOpt2Box-'+idv).style.display=on?'block':'none'; document.getElementById('estOptNames-'+idv).style.display=on?'block':'none'; updateEstimateSummary(idv); }
function estCopyAtoB(idv){ const a=document.getElementById('estRows-'+idv), b=document.getElementById('estRowsB-'+idv); if(!a||!b) return; b.innerHTML=a.innerHTML; updateEstimateSummary(idv); }
function renderEstMenuPicker(idv){
  const box=document.getElementById('estMenuPicker-'+idv); if(!box || typeof MENU_CATALOG==='undefined') return;
  const q=((document.getElementById('estMenuSearch-'+idv)||{}).value||'').toLowerCase();
  if(!q){ box.innerHTML=''; return; }
  const ids=Object.keys(MENU_CATALOG).filter(function(id){ return MENU_CATALOG[id].name.toLowerCase().indexOf(q)>=0; });
  box.innerHTML=ids.slice(0,12).map(function(id){ const s=MENU_CATALOG[id]; return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed #eee"><span><b>'+escHtml(s.name)+'</b> <span class="mut">'+escHtml(s.meta||'')+'</span></span><span style="white-space:nowrap">$'+s.price+' <button type="button" class="ghost" onclick="estMenuAdd(\''+idv+'\',\''+id+'\')">+ Add</button></span></div>'; }).join('') || '<span class="mut">No services match.</span>';
}
function estMenuAdd(idv, svcId){
  const s=MENU_CATALOG[svcId]; if(!s) return;
  const box=document.getElementById('estRows-'+idv); if(!box) return;
  box.insertAdjacentHTML('beforeend', estimateItemRowHtml(idv, { description:s.name, qty:1, unitPrice:s.price, type:'labor' }));
  document.getElementById('estMenuSearch-'+idv).value=''; document.getElementById('estMenuPicker-'+idv).innerHTML='';
  updateEstimateSummary(idv);
}
// Photos on the estimate: drafts live per request id; seeded once from the
// saved estimate when the admin panel renders (seedEstimateBuilder).
function estPhotosOf(idv){ if(!window._estPhotos) window._estPhotos={}; if(!window._estPhotos[idv]) window._estPhotos[idv]=[]; return window._estPhotos[idv]; }
function estPhotosSeed(idv, photos){ if(window._estPhotos && window._estPhotos[idv]) return; estPhotosOf(idv).push.apply(estPhotosOf(idv), (photos||[]).slice(0,6)); renderEstPhotoThumbs(idv); }
async function estPhotosAdd(idv, input){ const files=[...input.files].slice(0,6); for(const f of files){ if(estPhotosOf(idv).length>=6) break; estPhotosOf(idv).push(await fileToDataUrl(f)); } input.value=''; renderEstPhotoThumbs(idv); }
function estPhotoRemove(idv, i){ estPhotosOf(idv).splice(i,1); renderEstPhotoThumbs(idv); }
function renderEstPhotoThumbs(idv){ const box=document.getElementById('estPhotoThumbs-'+idv); if(!box) return; box.innerHTML=estPhotosOf(idv).map(function(p,i){ return '<span style="position:relative;display:inline-block"><img src="'+p+'" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"><button type="button" class="est-x" style="position:absolute;top:-6px;right:-6px;padding:2px 7px" onclick="estPhotoRemove(\''+idv+'\','+i+')" title="Remove photo">×</button></span>'; }).join(''); }
function readEstRows(sel){
  return [...document.querySelectorAll(sel)].map(function(row){ const ty=row.querySelector('[data-est-type]'); return { description:row.querySelector('[data-est-desc]').value.trim(), type:(ty && ty.value==='material')?'material':'labor', qty:Number(row.querySelector('[data-est-qty]').value)||0, unitPrice:Number(row.querySelector('[data-est-price]').value)||0 }; }).filter(function(it){ return it.description && it.qty>0; });
}
function estBundleMath(items, asap, discountPct, credit, memberDiscount){
  const labor=items.filter(function(it){ return it.type!=='material'; }).reduce(function(s,it){ return s+it.qty*it.unitPrice; },0);
  const material=items.filter(function(it){ return it.type==='material'; }).reduce(function(s,it){ return s+it.qty*it.unitPrice; },0);
  const subtotal=labor+material;
  const discountAmount=labor*Math.max(0,Math.min(90,discountPct))/100;
  // v58: mirror the server — a member-priced estimate (its 20% member
  // discount in the form) carries the ASAP +25% on the DISCOUNTED labor
  // (labor − the rounded 20%), never on the full labor.
  const asapAmount=asap?(memberDiscount ? (labor-Math.round(labor*20)/100)*0.25 : labor*0.25):0;
  const total=Math.max(0, Math.round((subtotal+asapAmount-discountAmount-credit)*100)/100);
  return { labor:Math.round(labor*100)/100, material:Math.round(material*100)/100, subtotal:Math.round(subtotal*100)/100, asapAmount:Math.round(asapAmount*100)/100, discountAmount:Math.round(discountAmount*100)/100, total };
}
function readEstimate(idv){
  const items=readEstRows('#estRows-'+idv+' .est-row');
  const twoEl=document.getElementById('estOpt2-'+idv);
  const two=!!(twoEl && twoEl.checked);
  const asap=document.getElementById('estAsap-'+idv).checked;
  const discountPct=Number(document.getElementById('estDiscount-'+idv).value)||0;
  const credit=Number(document.getElementById('estCredit-'+idv).value)||0;
  const bookingRaw=document.getElementById('estBooking-'+idv).value;
  // v58: the estimate being edited is member-priced when the saved estimate
  // carries the member flag AND the form still holds the 20% member
  // discount; the flag rides back in the payload so a re-save keeps the
  // member pricing (and its discounted-labor ASAP) instead of dropping it.
  const memberDisc=((document.getElementById('estMemberDisc-'+idv)||{}).value==='1') && discountPct===20;
  const m=estBundleMath(items, asap, discountPct, credit, memberDisc);
  const bookingDue=bookingRaw===''? m.total : Math.min(Number(bookingRaw)||0, m.total); // v44: default = pay in full
  const out={ items, asap, discountPct, credit, bookingDue, validUntil:(document.getElementById('estValid-'+idv)||{}).value||'', photos:estPhotosOf(idv).slice(0,6), subtotal:m.subtotal, laborSubtotal:m.labor, materialSubtotal:m.material, asapAmount:m.asapAmount, discountAmount:m.discountAmount, total:m.total, balanceDue:Math.round((m.total-bookingDue)*100)/100 };
  if(memberDisc) out.memberDiscount=true;
  if(two){
    const itemsB=readEstRows('#estRowsB-'+idv+' .est-row');
    const labelA=(document.getElementById('estOptLabelA-'+idv).value||'Option 1').trim()||'Option 1';
    const labelB=(document.getElementById('estOptLabelB-'+idv).value||'Option 2').trim()||'Option 2';
    out.options=[{ label:labelA, items }, { label:labelB, items:itemsB }];
    out.optionTotals=[estBundleMath(items, asap, discountPct, 0, memberDisc), estBundleMath(itemsB, asap, discountPct, 0, memberDisc)];
  }
  return out;
}
function updateEstimateSummary(idv){ const el=document.getElementById('estSummary-'+idv); if(!el) return; const e=readEstimate(idv); let h='<b>Subtotal:</b> '+moneyFmt(e.subtotal)+(e.materialSubtotal?' <span class="mut">(labor '+moneyFmt(e.laborSubtotal)+' + materials '+moneyFmt(e.materialSubtotal)+')</span>':'')+(e.asapAmount?' • <b>ASAP:</b> '+moneyFmt(e.asapAmount):'')+(e.discountAmount?' • <b>Discount (labor):</b> −'+moneyFmt(e.discountAmount):'')+(e.credit?' • <b>Credit:</b> −'+moneyFmt(e.credit):'')+'<br><b>Total for customer:</b> <span class="st">'+moneyFmt(e.total)+'</span> • Due to book: '+moneyFmt(e.bookingDue)+' • Balance: '+moneyFmt(e.balanceDue); if(e.options && e.optionTotals) h+='<br><span class="mut">Option 1: '+moneyFmt(e.optionTotals[0].total)+' • Option 2: '+moneyFmt(e.optionTotals[1].total)+' — the customer picks one on the estimate page.</span>'; el.innerHTML=h; }
async function previewEstimate(idv){
  const est=readEstimate(idv); const note=(document.getElementById('qn-'+idv)||{}).value||'';
  const rc=(window._adminReqCache||{})[idv]||{};
  try{ const d=await api('/api/admin/estimates/preview',{method:'POST', body:JSON.stringify({ requestId:idv, customerName:rc.customerName||'', customerEmail:rc.customerEmail||'', service:rc.service||'', city:rc.city||'', description:rc.description||'', note, estimate:est })});
    const w=window.open('','_blank'); if(!w){ alert('Allow pop-ups to preview the estimate.'); return; } w.document.write(d.html); w.document.close();
  }catch(e){ alert(e.message); }
}
async function duplicateEstimate(idv){
  if(!await appConfirm('Duplicate this estimate? A fresh draft for the same customer is created at the top of the list — review it, set the valid-until date, and send.')) return;
  try{ const d=await api('/api/requests/'+idv+'/duplicate-estimate',{method:'POST', body:JSON.stringify({})});
    alert('Duplicated as '+d.request.id+'.'); loadAdminRequests(); loadCalendar();
  }catch(e){ alert(e.message); }
}
async function newEstimate(){
  const g=function(x){ return document.getElementById(x).value.trim(); };
  const msg=document.getElementById('neMsg');
  const body={ customerName:g('neName'), customerEmail:g('neEmail'), customerPhone:g('nePhone'), service:g('neService'), city:g('neCity') };
  if(!body.customerName && !body.customerEmail){ msg.textContent='Add at least the customer name or email.'; return; }
  try{ const d=await api('/api/admin/estimates/new',{method:'POST', body:JSON.stringify(body)});
    ['neName','neEmail','nePhone','neService','neCity'].forEach(function(x){ document.getElementById(x).value=''; });
    await loadAdminRequests(); loadCalendar();
    msg.textContent='Created '+d.request.id+' — its estimate builder is at the top of Customer requests below.';
    const card=document.getElementById('reqcard-'+d.request.id); if(card) card.scrollIntoView({behavior:'smooth', block:'start'});
  }catch(e){ msg.textContent=e.message; }
}
function seedEstimateBuilder(r){ updateEstimateSummary(r.id); if(r.estimate) estPhotosSeed(r.id, r.estimate.photos||[]); }

async function sendEstimate(idv, sendEmail){
  const est=readEstimate(idv); const note=document.getElementById('qn-'+idv).value;
  if(!est.items.length || est.total<=0){ alert('Add at least one priced line first.'); return; }
  const action=sendEmail?'Save this estimate and email it from generalhandymans@gmail.com?':'Save this estimate in the app only?';
  if(!await appConfirm(action+'\n\nCustomer total: '+moneyFmt(est.total)+'\nDue to book: '+moneyFmt(est.bookingDue)+'\nBalance: '+moneyFmt(est.balanceDue))) return;
  try{ const d=await api('/api/requests/'+idv,{method:'PATCH', body:JSON.stringify({estimate:est, note, sendEmail:!!sendEmail})});
    if(sendEmail && d.automation && !d.automation.sent) alert('Estimate saved in the app. Email is not connected yet, so no email was sent. Reason: '+(d.automation.reason||'not configured'));
    loadAdminRequests();
  }catch(e){ alert(e.message); }
}
// ---------- Invoices (frontend) ----------
async function checkStripeHealth(){
  const el=document.getElementById('stripeHealth'); if(!el) return;
  try{
    const h=await api('/api/admin/stripe/health');
    el.innerHTML = h.ok
      ? '<span class="pill" style="border-color:#2fbf71;color:#2fbf71">💳 Stripe: payments live'+(h.live?'':' (test mode)')+'</span>' + (h.cached ? ' <span class="mut">(checked ' + (h.ageSec || 0) + 's ago)</span>' : '')
      : '<span class="pill" style="border-color:#e42535;color:#e42535">💳 Stripe: NOT WORKING</span><br><span class="mut">'+escHtml(h.reason||'unknown')+'</span>';
  }catch(e){ el.innerHTML='<span class="mut">💳 Stripe status unknown.</span>'; }
}
function invItemRowHtml(it){
  it=it||{description:'',qty:1,unitPrice:''};
  return '<div class="est-row" data-inv-row><input data-inv-desc placeholder="Work / part description" value="'+escHtml(it.description||'')+'" oninput="updateInvoiceSummary()"><input data-inv-qty type="number" min="0" step="0.25" value="'+escHtml(it.qty||1)+'" oninput="updateInvoiceSummary()"><input data-inv-price type="number" min="0" step="0.01" placeholder="$" value="'+escHtml(it.unitPrice||'')+'" oninput="updateInvoiceSummary()"><button type="button" class="est-x" onclick="removeInvoiceItem(this)" title="Remove line">×</button></div>';
}
function addInvoiceItem(){ const box=document.getElementById('invRows'); if(box) box.insertAdjacentHTML('beforeend', invItemRowHtml()); updateInvoiceSummary(); }
function removeInvoiceItem(btn){ const row=btn.closest('[data-inv-row]'); if(row) row.remove(); if(!document.querySelectorAll('#invRows [data-inv-row]').length) addInvoiceItem(); updateInvoiceSummary(); }
function readInvoiceForm(){
  const items=[...document.querySelectorAll('#invRows [data-inv-row]')].map(function(row){ return { description:row.querySelector('[data-inv-desc]').value.trim(), qty:Number(row.querySelector('[data-inv-qty]').value)||0, unitPrice:Number(row.querySelector('[data-inv-price]').value)||0 }; }).filter(function(it){ return it.description && it.qty>0; });
  const subtotal=items.reduce((s,it)=>s+it.qty*it.unitPrice,0);
  const discount=Math.min(Math.max(0, Number(document.getElementById('iDiscount').value)||0), subtotal);
  const total=Math.max(0, Math.round((subtotal-discount)*100)/100);
  return { items, discount:Math.round(discount*100)/100, subtotal:Math.round(subtotal*100)/100, total };
}
function updateInvoiceSummary(){ const el=document.getElementById('invSummary'); if(!el) return; const f=readInvoiceForm(); el.innerHTML='<b>Subtotal:</b> '+moneyFmt(f.subtotal)+(f.discount?' • <b>Discount:</b> −'+moneyFmt(f.discount):'')+'<br><b>Invoice total:</b> <span class="st">'+moneyFmt(f.total)+'</span>'; }
async function createInvoice(){
  const f=readInvoiceForm();
  const name=document.getElementById('iName').value.trim(), email=document.getElementById('iEmail').value.trim();
  const msg=document.getElementById('iMsg');
  if(!name){ msg.textContent='Customer name is required.'; return; }
  if(!f.items.length || f.total<=0){ msg.textContent='Add at least one priced line first.'; return; }
  if(!await appConfirm('Create draft invoice?\n\nCustomer: '+name+'\nTotal: '+moneyFmt(f.total)+'\n\nYou can review it and send it by email next.')) return;
  try{ await api('/api/admin/invoices',{method:'POST', body:JSON.stringify({customerName:name, customerEmail:email, customerPhone:document.getElementById('iPhone').value.trim(), jobId:document.getElementById('iJob').value.trim(), dueDate:document.getElementById('iDue').value, notes:document.getElementById('iNotes').value.trim(), items:f.items, discount:f.discount})});
    msg.textContent='Draft invoice created.'; document.getElementById('invRows').innerHTML=''; addInvoiceItem(); document.getElementById('iDiscount').value='0'; document.getElementById('iNotes').value=''; updateInvoiceSummary(); loadInvoices();
  }catch(e){ msg.textContent=e.message; }
}
function invStatusBadge(s){ const c={draft:'#6b6762',sent:'#b26a00',paid:'#1a7f37',overdue:'#e42535',cancelled:'#6b6762'}[s]||'#6b6762'; const lbl=(typeof me !== 'undefined' && me && me.role === 'customer') ? (CUST_UI[menuLang()]['invSt_' + s] || s) : s; return '<span class="pill" style="border-color:'+c+';color:'+c+'">'+escHtml(lbl)+'</span>'; }
let adminInvoicesCache=[];
async function loadInvoices(){
  checkStripeHealth();
  const d=await api('/api/admin/invoices').catch(()=>({invoices:[]}));
  adminInvoicesCache=d.invoices||[];
  const el=document.getElementById('adminInvoices'); if(!el) return;
  el.innerHTML = d.invoices.map(function(inv){
    const items=(inv.items||[]).map(function(it){ return '<div class="mut">'+escHtml(it.description)+' × '+escHtml(it.qty)+' @ '+moneyFmt(it.unitPrice)+' = <b>'+moneyFmt(it.lineTotal)+'</b></div>'; }).join('');
    const editable=inv.status==='draft'||inv.status==='sent';
    const btns=[];
    if(inv.status==='draft') btns.push('<button class="black" onclick="invoiceAct(\''+inv.id+'\',\'send\')">Send by email</button>');
    if(editable){ btns.push('<button class="ghost" onclick="editInvoice(\''+inv.id+'\')">Edit</button>'); btns.push('<button onclick="invoiceAct(\''+inv.id+'\',\'mark-paid\')">Mark paid</button>'); btns.push('<button class="ghost" onclick="invoiceAct(\''+inv.id+'\',\'cancel\')">Cancel</button>'); }
    if(inv.status!=='paid') btns.push('<button class="ghost" onclick="delInvoice(\''+inv.id+'\',\''+inv.status+'\')">Delete</button>');
    if(inv.status==='sent'||inv.status==='overdue') btns.push('<button class="black" onclick="invoiceAct(\''+inv.id+'\',\'remind\')">Remind</button>');
    btns.push('<button class="ghost" onclick="copyInvoiceLink(\''+inv.id+'\')">Copy payment link</button>');
    const remindLine=(inv.reminderCount?'<div class="mut">⏰ Reminded '+inv.reminderCount+'x'+(inv.remindedAt?' • last '+new Date(inv.remindedAt).toLocaleString():'')+'</div>':'');
    const schedLine=inv.scheduleRequestedAt
      ? '<div style="margin-top:8px;border-top:1px dashed #33333b;padding-top:8px"><b>📅 Scheduling request:</b> '+escHtml(inv.preferredDate||'—')+' • '+escHtml(inv.preferredTime||'—')+(inv.scheduleNotes?'<br><span class="mut">'+escHtml(inv.scheduleNotes)+'</span>':'')+(inv.confirmedDate?'<br><span style="color:#2fbf71"><b>✅ Confirmed: '+escHtml(inv.confirmedDate)+(inv.confirmedTime?' • '+escHtml(inv.confirmedTime):'')+'</b></span>':'<div class="row" style="margin-top:6px"><input type="date" id="cfd-'+inv.id+'" value="'+escHtml(inv.confirmedDate||'')+'" style="width:150px"><select id="cft-'+inv.id+'" style="width:150px"><option value="">Time…</option><option value="morning"'+(inv.confirmedTime==='morning'?' selected':'')+'>Morning</option><option value="afternoon"'+(inv.confirmedTime==='afternoon'?' selected':'')+'>Afternoon</option><option value="evening"'+(inv.confirmedTime==='evening'?' selected':'')+'>Evening</option></select><button class="black" onclick="confirmSchedule(\''+inv.id+'\')">Confirm schedule</button></div>')
      : '';
    return '<div class="card"><b>'+inv.id+'</b> '+invStatusBadge(inv.status)+'<br><span class="mut">'+escHtml(inv.customerName)+(inv.customerEmail?' • '+escHtml(inv.customerEmail):'')+(inv.jobId?' • Job '+escHtml(inv.jobId):'')+(inv.dueDate?' • Due '+escHtml(inv.dueDate):'')+'</span>'+remindLine+'<div style="margin:8px 0">'+items+'</div>'+(inv.discount?'<div class="mut">Discount: −'+moneyFmt(inv.discount)+'</div>':'')+'<div><b>Total: <span class="st">'+moneyFmt(inv.total)+'</span></b>'+(inv.paidMethod?' <span class="mut">• paid via '+escHtml(inv.paidMethod)+'</span>':'')+'</div>'+(inv.notes?'<div class="mut">Note: '+escHtml(inv.notes)+'</div>':'')+schedLine+'<div class="row" style="margin-top:10px">'+btns.join('')+'</div><div id="invEdit-'+inv.id+'"></div></div>';
  }).join('') || '<div class="empty"><p class="mut">No invoices yet.</p></div>';
}
async function invoiceAct(idv, action){
  let body={};
  if(action==='mark-paid'){ const m=await appPrompt('Payment method (cash, zelle, check, other):','cash'); if(m===null) return; body={method:m||'cash'}; if(!await appConfirm('Mark invoice '+idv+' as PAID?')) return; }
  else if(action==='cancel'){ if(!await appConfirm('Cancel invoice '+idv+'?')) return; }
  else if(action==='send'){ if(!await appConfirm('Send invoice '+idv+' by email now?')) return; }
  else if(action==='remind'){ if(!await appConfirm('Send a payment reminder for invoice '+idv+'?\n\nThe customer gets an in-app notification and a reminder email with the payment link.')) return; }
  try{ const d=await api('/api/admin/invoices/'+idv+'/'+action,{method:'POST', body:JSON.stringify(body)});
    if(action==='send' && d.automation && !d.automation.sent) alert('Invoice marked as sent, but the email did not go through. Reason: '+(d.automation.reason||'not configured')+'\n\nUse "Copy payment link" to send it manually.');
    if(action==='remind' && d.automation && !d.automation.sent) alert('Reminder logged, but the reminder email did not go through. Reason: '+(d.automation.reason||'not configured')+'\n\nUse "Copy payment link" to send it manually.');
    loadInvoices();
  }catch(e){ alert(e.message); }
}
async function confirmSchedule(idv){
  var d=document.getElementById('cfd-'+idv), t=document.getElementById('cft-'+idv);
  if(!d||!d.value){ alert('Pick a confirmed date first.'); return; }
  if(!await appConfirm('Confirm schedule for '+idv+': '+d.value+(t&&t.value?' • '+t.value:'')+'?')) return;
  try{ await api('/api/admin/invoices/'+idv,{method:'PUT', body:JSON.stringify({confirmedDate:d.value, confirmedTime:t?t.value:''})}); loadInvoices(); }
  catch(e){ alert(e.message); }
}
// ---------- Invoice editing (admin) ----------
function invEditRowHtml(it){
  it=it||{description:'',qty:1,unitPrice:''};
  return '<div class="est-row" data-iedit-row><input data-iedit-desc placeholder="Work / part description" value="'+escHtml(it.description||'')+'" oninput="invEditChanged(this)"><input data-iedit-qty type="number" min="0" step="0.25" value="'+escHtml(it.qty||1)+'" oninput="invEditChanged(this)"><input data-iedit-price type="number" min="0" step="0.01" placeholder="$" value="'+escHtml(it.unitPrice||'')+'" oninput="invEditChanged(this)"><button type="button" class="est-x" onclick="removeInvoiceEditItem(this)" title="Remove line">×</button></div>';
}
function invEditChanged(inp){ const box=inp.closest('[id^="invEditRows-"]'); if(!box) return; updateInvoiceEditSummary(box.id.replace('invEditRows-','')); }
function addInvoiceEditItem(idv){ const box=document.getElementById('invEditRows-'+idv); if(box) box.insertAdjacentHTML('beforeend', invEditRowHtml()); updateInvoiceEditSummary(idv); }
function removeInvoiceEditItem(btn){ const box=btn.closest('[id^="invEditRows-"]'); const row=btn.closest('[data-iedit-row]'); if(row) row.remove(); if(!box) return; const idv=box.id.replace('invEditRows-',''); if(!box.querySelectorAll('[data-iedit-row]').length) addInvoiceEditItem(idv); updateInvoiceEditSummary(idv); }
function readInvoiceEdit(idv){
  const box=document.getElementById('invEditRows-'+idv); if(!box) return {items:[],discount:0,subtotal:0,total:0};
  const items=[...box.querySelectorAll('[data-iedit-row]')].map(function(row){ return { description:row.querySelector('[data-iedit-desc]').value.trim(), qty:Number(row.querySelector('[data-iedit-qty]').value)||0, unitPrice:Number(row.querySelector('[data-iedit-price]').value)||0 }; }).filter(function(it){ return it.description && it.qty>0; });
  const subtotal=items.reduce((s,it)=>s+it.qty*it.unitPrice,0);
  const discount=Math.min(Math.max(0, Number(document.getElementById('ieDiscount-'+idv).value)||0), subtotal);
  const total=Math.max(0, Math.round((subtotal-discount)*100)/100);
  return { items, discount:Math.round(discount*100)/100, subtotal:Math.round(subtotal*100)/100, total };
}
function updateInvoiceEditSummary(idv){ const el=document.getElementById('invEditSummary-'+idv); if(!el) return; const f=readInvoiceEdit(idv); el.innerHTML='<b>Subtotal:</b> '+moneyFmt(f.subtotal)+(f.discount?' • <b>Discount:</b> −'+moneyFmt(f.discount):'')+'<br><b>New total:</b> <span class="st">'+moneyFmt(f.total)+'</span>'; }
function editInvoice(idv){
  const inv=adminInvoicesCache.find(function(x){return x.id===idv;}); if(!inv) return;
  const box=document.getElementById('invEdit-'+idv); if(!box) return;
  const rows=(inv.items||[]).map(function(it){ return invEditRowHtml(it); }).join('');
  box.innerHTML='<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"><b>Edit invoice '+escHtml(inv.id)+'</b> <span class="mut">— the payment page always charges the current total, so the customer pays the new amount even on an already-sent link.</span>'
    +'<div class="row" style="margin-top:8px"><div><label>Customer name</label><input id="ieName-'+idv+'" value="'+escHtml(inv.customerName||'')+'"></div><div><label>Customer email</label><input id="ieEmail-'+idv+'" value="'+escHtml(inv.customerEmail||'')+'"></div></div>'
    +'<div class="row"><div><label>Customer phone</label><input id="iePhone-'+idv+'" value="'+escHtml(inv.customerPhone||'')+'"></div><div><label>Job ID</label><input id="ieJob-'+idv+'" value="'+escHtml(inv.jobId||'')+'"></div><div><label>Due date</label><input id="ieDue-'+idv+'" type="date" value="'+escHtml(inv.dueDate||'')+'"></div></div>'
    +'<div id="invEditRows-'+idv+'">'+rows+'</div>'
    +'<button type="button" class="ghost" onclick="addInvoiceEditItem(\''+idv+'\')">+ Add line</button>'
    +'<div class="est-grid" style="margin-top:10px"><label>Discount $<input type="number" min="0" step="0.01" id="ieDiscount-'+idv+'" value="'+(inv.discount||0)+'" oninput="updateInvoiceEditSummary(\''+idv+'\')"></label><label>Notes<input id="ieNotes-'+idv+'" value="'+escHtml(inv.notes||'')+'"></label></div>'
    +'<div class="est-summary" id="invEditSummary-'+idv+'"></div>'
    +'<div class="row"><button class="black" onclick="saveInvoiceEdit(\''+idv+'\')">Save changes</button><button class="ghost" onclick="cancelInvoiceEdit(\''+idv+'\')">Cancel</button></div></div>';
  updateInvoiceEditSummary(idv);
}
async function saveInvoiceEdit(idv){
  const f=readInvoiceEdit(idv);
  if(!f.items.length || f.total<=0){ alert('Add at least one priced line first.'); return; }
  const name=document.getElementById('ieName-'+idv).value.trim();
  if(!name){ alert('Customer name is required.'); return; }
  if(!await appConfirm('Save changes to invoice '+idv+'?\n\nNew total: '+moneyFmt(f.total))) return;
  try{ await api('/api/admin/invoices/'+idv,{method:'PUT', body:JSON.stringify({customerName:name, customerEmail:document.getElementById('ieEmail-'+idv).value.trim(), customerPhone:document.getElementById('iePhone-'+idv).value.trim(), jobId:document.getElementById('ieJob-'+idv).value.trim(), dueDate:document.getElementById('ieDue-'+idv).value, notes:document.getElementById('ieNotes-'+idv).value.trim(), items:f.items, discount:f.discount})});
    loadInvoices();
  }catch(e){ alert(e.message); }
}
function cancelInvoiceEdit(idv){ const box=document.getElementById('invEdit-'+idv); if(box) box.innerHTML=''; }
async function delInvoice(idv, st){
  if(!await appConfirm('Delete invoice '+idv+' ('+(st||'')+')? This removes it for good. Only use for invoices that were never paid — paid invoices cannot be deleted.')) return;
  try{ await api('/api/admin/invoices/'+idv,{method:'DELETE'}); loadInvoices(); }
  catch(e){ alert(e.message); }
}
function copyInvoiceLink(idv){
  const link=location.origin+'/invoice/'+idv;
  const done=function(){ alert('Payment link copied:\n'+link); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(function(){ prompt('Copy the payment link:', link); });
  else prompt('Copy the payment link:', link);
}
async function loadMyInvoices(){
  const el=document.getElementById('myInvoices'); if(!el) return;
  if(!el.innerHTML) el.innerHTML=listLoadingHtml();
  let d=null;
  try{ d=await api('/api/invoices/mine'); }catch(e){ el.innerHTML=listErrorHtml('loadMyInvoices()', CU('invLoadErr2')); return; }
  el.innerHTML = d.invoices.map(function(inv){
    const unpaid=['draft','sent','overdue'].indexOf(inv.status)>=0;
    return '<div class="card"><b>'+inv.id+'</b> '+invStatusBadge(inv.status)+'<br>'+(inv.dueDate?'<span class="mut">'+CU('invDue')+escHtml(inv.dueDate)+' • </span>':'')+'<b>Total: <span class="st">'+moneyFmt(inv.total)+'</span></b><br>'+(unpaid?'<a href="/invoice/'+inv.id+'"><button style="margin-top:8px">'+CU('invViewPay')+'</button></a>':'<a href="/invoice/'+inv.id+'" class="mut">'+CU('invView')+'</a>')+'</div>';
  }).join('') || '<div class="empty"><p class="mut">' + CU('invNone') + '</p></div>';
}
function threadHtml(r){
  const msgs=(r.messages||[]).map(function(m){ const who=m.from==='team'?'General Handyman Solutions Team':(m.name||CU('msgCustomerWord')); return '<div class="msg"><b>'+escHtml(who)+':</b> '+escHtml(m.text||'')+'</div>'; }).join('');
  const photos=(r.photos||[]).map(function(p){ return '<img class="thumb" src="'+p+'" alt="'+CU('jobPhotoAlt')+'">'; }).join('');
  const canPost = !!me && (me.role==='admin' || r.customerId===me.id);
  return (photos?'<div class="photos">'+photos+'</div>':'')+'<div class="thread">'+(msgs||'<div class="empty"><span class="mut">'+CU('threadNone')+'</span></div>')+'</div>'+(canPost?'<div class="reply"><input id="m-'+r.id+'" placeholder="'+(me.role==='admin'?CU('threadPhCust'):CU('threadPhTeam'))+'"><button onclick="sendMsg(\''+r.id+'\')">'+CU('sendBtn')+'</button></div>':'');
}
async function sendMsg(idv){
  const inp=document.getElementById('m-'+idv); if(!inp) return;
  const text=inp.value.trim(); if(!text) return;
  try{ await api('/api/requests/'+idv+'/messages',{method:'POST', body:JSON.stringify({text})}); if(me && me.role==='admin') loadAdminRequests(); else loadRequests(); }
  catch(e){ alert(e.message); }
}
// ---------- v79: PROPUESTAS EN LA CUENTA (Gabriel, 2026-10-25) ----------
// Every cart / estimate the Team sent this customer (matched server-side
// by the account email) ALSO lives here — the SAME object as the emailed
// link, never a copy. Three actions: Accept -> that proposal's own
// checkout; Keep shopping -> it waits, untouched; Save for later ->
// parked in the account, still visible, no nagging.
async function loadProposals(){
  const host = document.getElementById('myProposals'); if (!host) return;
  if (!host.innerHTML) host.innerHTML = listLoadingHtml();
  let d = null;
  try { d = await api('/api/me/proposals'); } catch (e) { host.innerHTML = listErrorHtml('loadProposals()', CU('propLoadErr')); return; }
  const ps = (d && d.proposals) || [];
  // Genuinely empty (a SUCCESSFUL response with none): the honest
  // empty state (v80.25 P1-2) — a quiet "none yet" line, still no
  // nagging. An ERROR never lands here (it paints the Retry card).
  if (!ps.length) { host.innerHTML = '<div class="empty"><p class="mut">' + CU('propNone') + '</p></div>'; return; }
  const money = function (n) { return '$' + (Math.round(Number(n) * 100) / 100); };
  let h = '<h2>' + CU('propTitle') + '</h2>';
  ps.forEach(function (pr) {
    h += '<div class="card" style="margin:8px 0"><b>' + escHtml(pr.title) + '</b>'
      + '<div class="mut">' + (pr.kind === 'cart' ? CU('propCartWord') + escHtml(pr.id) : CU('propEstimateWord')) + CU('propTotalWord') + money(pr.total) + (pr.state === 'booked' ? ' · <b style="color:#2fbf71">' + CU('propBookedTag') + '</b>' : '') + (pr.saved ? CU('propSavedTag') : '') + '</div>'
      + (pr.state === 'booked' ? '<div style="margin-top:4px">' + CU('propBalanceLine') + '<b>' + money(pr.balanceDue) + '</b></div>' : '<div style="margin-top:4px">' + CU('propBookToday') + '<b>' + money(pr.depositDue) + '</b>' + CU('propBalanceAt') + '<b>' + money(pr.balanceDue) + '</b></div>')
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
      + '<button onclick="location.href=\'' + pr.url + '\'">' + (pr.state === 'booked' ? CU('propPayBalance') : CU('propAccept')) + '</button>'
      + '<button type="button" class="ghost" onclick="propKeepShopping(this)">' + CU('propKeep') + '</button>'
      + '<button type="button" class="ghost" onclick="propSaveLater(\'' + pr.kind + '\',\'' + pr.id + '\',' + (pr.saved ? 'false' : 'true') + ')">' + (pr.saved ? CU('propMoveBack') : CU('propSave')) + '</button>'
      + '</div></div>';
  });
  host.innerHTML = h;
}
function propKeepShopping(btn){
  const card = btn && btn.closest ? btn.closest('.card') : null;
  if (card) card.style.display = 'none';
  const mb = document.getElementById('menuBox'); if (mb && mb.scrollIntoView) mb.scrollIntoView({ behavior: 'smooth' });
}
async function propSaveLater(kind, idv, saved){
  try { await api('/api/me/proposals/' + kind + '/' + idv + '/save-later', { method: 'POST', body: JSON.stringify({ saved: !!saved }) }); } catch (e) {}
  loadProposals();
}
// ---------- v80 P1-2: honest async states ----------
// ONE pattern for every remotely-loaded list: LOADING (skeleton line,
// only painted when the host is empty so refreshes never flicker),
// genuinely EMPTY (only after a SUCCESSFUL response), and ERROR with a
// Retry button that re-runs the loader. A network failure must never
// again paint a false "nothing here yet".
function listLoadingHtml(label, aud){ const w = aud === 'worker' || (!aud && me && me.role === 'worker'); return '<div class="empty" aria-busy="true"><p class="mut">⏳ ' + (label || (w ? WT('loadingGeneric') : CU('loading'))) + '</p></div>'; }
function listErrorHtml(retryFn, msg, aud){ const w = aud === 'worker' || (!aud && me && me.role === 'worker'); return '<div class="empty" style="border-color:#e42535"><p class="mut">⚠️ ' + escHtml(msg || (w ? WT('errGeneric') : CU('loadErr'))) + '</p><button type="button" class="ghost" onclick="' + retryFn + '">' + (w ? WT('retryBtn') : CU('retry')) + '</button></div>'; }
async function loadRequests(){
  const host=document.getElementById('myRequests'); if(!host) return;
  if(!host.innerHTML) host.innerHTML=listLoadingHtml();
  let d=null;
  try{ d=await api('/api/requests'); }catch(e){ host.innerHTML=listErrorHtml('loadRequests()', CU('reqLoadErr2')); return; }
  host.innerHTML = d.requests.map(function(r){
    const est=estimateHtml(r,true);
    const quoteLine=est ? '' : (r.quote!=null?'<br>'+CU('reqQuotePre')+'<span class="st">$'+r.quote+'</span>'+CU('reqLaborNote')+(r.status==='Quoted'?'<button class="black" onclick="actReq(\''+r.id+'\',\'approve\')">'+CU('reqApprove')+'</button> <button class="ghost" onclick="actReq(\''+r.id+'\',\'decline\')">'+CU('reqDecline')+'</button>':''):'<br><span class="mut">'+CU('reqWaiting')+'</span>');
    const hasLiveHold=holdsOf(r).some(function(h){ return h.status==='authorized'||h.status==='captured'; });
    const holdBlock=holdStatusHtml(r)+((r.estimateType==='inperson' && (Number(r.estimateDue)||0)>0 && !hasLiveHold && !r.estimatePaid && r.status!=='Closed')?'<div style="margin-top:8px"><button class="black" onclick="secureHold(\''+r.id+'\')">'+CU('reqSecureTpl').replace('{amt}', moneyFmt(r.estimateDue))+'</button></div>':'');
    const payBlock=reqPayPanelHtml(r);
    return '<div class="card" id="reqcard-'+r.id+'"><b>'+r.id+'</b> — '+escHtml(r.service)+' <span class="pill">'+escHtml(r.status)+'</span><br><span class="mut">'+escHtml(r.city)+' • '+escHtml(r.when)+'</span>'+est+quoteLine+payBlock+holdBlock+threadHtml(r)+'</div>';
  }).join('') || '<div class="empty"><p class="mut">' + CU('reqNone') + '</p></div>';
}
async function actReq(idv, action){ await api('/api/requests/'+idv,{method:'PATCH', body:JSON.stringify({action})}); loadRequests(); }
function jobChatHtml(j){
  const msgs=(j.messages||[]).map(function(m){ const who=m.from==='team'?'General Handyman Solutions Team':(m.name||''); return '<div class="msg"><b>'+escHtml(who)+':</b> '+escHtml(m.text||'')+'</div>'; }).join('');
  return '<div class="thread">'+(msgs||'<span class="mut">'+WT('chatOpen')+'</span>')+'</div><div class="reply"><input id="jm-'+j.id+'" placeholder="'+WT('chatPh')+'"><button onclick="sendJobMsg(\''+j.id+'\')">'+WT('chatSend')+'</button></div>';
}
async function sendJobMsg(idv){
  const inp=document.getElementById('jm-'+idv); if(!inp) return;
  const text=inp.value.trim(); if(!text) return;
  try{ await api('/api/jobs/'+idv+'/messages',{method:'POST', body:JSON.stringify({text})}); if(me.role==='admin') loadAdminJobs(); else if(me.role==='worker') loadJobs(); else loadMyJobs(); }
  catch(e){ alert(e.message); }
}
// ---------- v81: the permanent job timeline (customer card) ----------
// Renders the append-only history the server keeps on the job
// (created -> assigned -> en route -> arrived -> done, + paid when the
// money lands). It renders ALWAYS — unlike the live map above it, it
// does not depend on the technician sharing a location (audit P1-3).
// Steps with no event yet stay dimmed; every reached step carries its
// timestamp. Generic 'status' events (cancellations, corrections)
// render as their own rows so the history never has a silent gap.
const TL_STEPS81 = ['created', 'assigned', 'enroute', 'arrived', 'done'];
function jobTimelineHtml(j){
  const tl = (j && Array.isArray(j.timeline)) ? j.timeline : [];
  if (!tl.length) return '';
  const atOf = {};
  tl.forEach(function (e) { if (e && e.type && !(e.type in atOf)) atOf[e.type] = e.at; });
  let h = '<div class="job-timeline" style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px"><b>' + CU('tlTitle') + '</b><div style="margin-top:4px">';
  TL_STEPS81.forEach(function (s) {
    const at = atOf[s];
    h += '<div style="display:flex;gap:8px;align-items:baseline;' + (at ? '' : 'opacity:.45') + '"><span>' + (at ? '✅' : '▢') + '</span><span>' + CU('tl_' + s) + '</span>' + (at ? '<span class="mut" style="margin-left:auto">' + escHtml(fmtDateLong(at)) + '</span>' : '') + '</div>';
  });
  if (atOf.paid) h += '<div style="display:flex;gap:8px;align-items:baseline"><span>💳</span><span>' + CU('tl_paid') + '</span><span class="mut" style="margin-left:auto">' + escHtml(fmtDateLong(atOf.paid)) + '</span></div>';
  tl.filter(function (e) { return e && e.type === 'status'; }).forEach(function (e) {
    h += '<div style="display:flex;gap:8px;align-items:baseline"><span>•</span><span>' + CU('tl_status') + (e.status ? ': ' + escHtml(e.status) : '') + '</span><span class="mut" style="margin-left:auto">' + escHtml(fmtDateLong(e.at)) + '</span></div>';
  });
  return h + '</div></div>';
}
// ---------- Ratings (v25, C1): the customer rates a completed job once ----------
const ratePicks = {};
function ratingHtml(j){
  if (j.status !== 'Done — photos sent') return '';
  if (j.rating) return '<div style="margin-top:8px"><b>' + CU('ratingYours') + '</b> <span style="color:#b26a00;font-size:18px">' + '★'.repeat(j.rating) + '☆'.repeat(5 - j.rating) + '</span>' + (j.reviewText ? '<br><span class="mut">&ldquo;' + escHtml(j.reviewText) + '&rdquo;</span>' : '') + '</div>';
  // v81: the server only accepts a review once the job's payment is
  // confirmed — until then the card says so instead of offering a
  // picker that would be refused.
  if (j.reviewable === false) return '<div style="margin-top:8px"><span class="mut">⭐ ' + CU('ratingWaitPay') + '</span></div>';
  let stars = '';
  for (let s = 1; s <= 5; s++) stars += '<button type="button" class="ghost" id="star-' + j.id + '-' + s + '" style="font-size:20px;padding:2px 8px" onclick="pickStars(\'' + j.id + '\',' + s + ')">☆</button>';
  return '<div style="margin-top:8px"><b>' + CU('ratingPrompt') + '</b><br>' + stars + '<br><input id="rateText-' + j.id + '" placeholder="' + CU('ratingPlaceholder') + '" style="width:100%"><button class="black" onclick="submitRating(\'' + j.id + '\')">' + CU('ratingSend') + '</button> <span class="mut" id="rateMsg-' + j.id + '"></span></div>';
}
function pickStars(idv, s){
  ratePicks[idv] = s;
  for (let i = 1; i <= 5; i++) { const b = document.getElementById('star-' + idv + '-' + i); if (b) b.textContent = i <= s ? '★' : '☆'; }
}
async function submitRating(idv){
  const msg = document.getElementById('rateMsg-' + idv);
  const s = ratePicks[idv] || 0;
  if (!s) { if (msg) msg.textContent = CU('ratingTapFirst'); return; }
  try {
    await api('/api/jobs/' + idv + '/rating', { method: 'POST', body: JSON.stringify({ stars: s, text: (document.getElementById('rateText-' + idv) || {}).value || '' }) });
    loadMyJobs();
  } catch (e) { if (msg) msg.textContent = e.message; }
}
// ---------- v81: public reviews on the storefront ----------
// The section above (#pubReviewsSec) stays HIDDEN until the server
// reports at least one PUBLISHED review — the sample quotes are gone
// and no average is ever painted from anything but real, verified,
// published reviews (GET /api/reviews, no login). Rendered in the
// visitor's current language; applyMenuLang re-renders from the cache
// on every EN|ES toggle.
let pubReviewsCache = null;
async function loadPublicReviews(){
  try { pubReviewsCache = await api('/api/reviews'); } catch (e) { if (!pubReviewsCache) pubReviewsCache = { count: 0, average: 0, reviews: [] }; }
  renderPublicReviews();
}
function renderPublicReviews(){
  const sec = document.getElementById('pubReviewsSec'); if (!sec) return;
  const d = pubReviewsCache;
  if (!d || !d.count) { sec.style.display = 'none'; return; }
  const sum = document.getElementById('pubReviewSummary');
  if (sum) sum.textContent = CU(d.count === 1 ? 'pubRevAvgTpl' : 'pubRevAvgTplPl').replace('{avg}', d.average).replace('{n}', d.count);
  const list = document.getElementById('pubReviewList');
  if (list) list.innerHTML = (d.reviews || []).map(function (r) {
    return '<div class="quote"><span class="st">' + '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) + '</span><br>' + (r.text ? '&ldquo;' + escHtml(r.text) + '&rdquo;' : '') + '<div class="who">— ' + escHtml(r.name || '') + (r.city ? ' · ' + escHtml(r.city) : '') + (r.service ? ' · ' + escHtml(r.service) : '') + '<br><span style="color:#2fbf71">✓ ' + CU('pubRevVerified') + '</span></div></div>';
  }).join('');
  sec.style.display = '';
}
async function loadMyJobs(){
  const el=document.getElementById('myJobs'); if(!el) return;
  if(!el.innerHTML) el.innerHTML=listLoadingHtml();
  let d=null;
  try{ d=await api('/api/jobs'); }catch(e){ el.innerHTML=listErrorHtml('loadMyJobs()', CU('jobsLoadErr')); return; }
  el.innerHTML = d.jobs.map(j=>'<div class="card" id="jobcard-'+j.id+'"><b>'+j.id+'</b> — '+escHtml(j.service)+' <span class="pill">'+escHtml(j.status)+'</span><br><span class="mut">'+escHtml(j.city)+' • '+escHtml(j.when)+'</span>'+techCardHtml(j)+trackBlockHtml(j,'customer')+jobTimelineHtml(j)+ratingHtml(j)+jobChatHtml(j)+'</div>').join('') || '<div class="empty"><p class="mut">' + CU('jobsNoneCust') + '</p></div>';
  sndCustomerJobs(d.jobs);
  initTrackMaps(d.jobs);
}
async function loadJobs(){
  paintConnectGateCard();
  document.getElementById('workerStatus').textContent = me.status==='active' ? WT('statusActive') : WT('statusInactive').replace('{status}', me.status);
  const d=await api('/api/jobs').catch(e=>({jobs:[], err:e.message}));
  if (d.workerRating && d.workerRating.count) document.getElementById('workerStatus').textContent += WT('ratingLine').replace('{avg}', d.workerRating.average).replace('{n}', d.workerRating.count).replace('{jobs}', WT(d.workerRating.count === 1 ? 'ratedJob1' : 'ratedJobN'));
  document.getElementById('jobList').innerHTML = d.err ? listErrorHtml('loadJobs()', d.err) : (d.jobs.map(j=>'<div class="card" id="wjobcard-'+j.id+'"><b>'+j.id+'</b> — <span class="wjob-title">'+escHtml(j.service)+'</span> <span class="pill" data-wst="'+escHtml(j.status)+'">'+escHtml(j.status)+'</span><br>'+escHtml(j.description)+'<br><span class="mut">'+escHtml(j.city)+' • '+escHtml(j.when)+'</span>'+workerDistLine(j)+'<br>'+WT('payOffer')+' <span class="st wjob-pay">$'+escHtml(j.payOffer)+'</span>'+workerPayoutLine(j)+workerCommLine(j)+(j.mine?'<br>'+(j.infoReleased?'<b>'+WT('detailsConfirmed')+'</b> '+escHtml(j.address||''):'<b>'+WT('addressTime')+'</b> <span class="mut">'+WT('addressTimeNote')+'</span>')+(j.notes?'<br><b>'+WT('teamNotes')+'</b> '+escHtml(j.notes):''):'')+'<br><button class="ghost wact" onclick="openJobDetail(\''+j.id+'\')">'+WT('viewDetails')+'</button> '+workerJobBtns(j)+(j.mine?jobChatHtml(j):'')+'</div>').join('') || '<p class="mut">'+WT('noJobs')+'</p>');
  sndWorkerJobs(d.jobs || []);
  if (jobDetailId) openJobDetail(jobDetailId, true); // keep an open detail view in sync with the board
}
// ---------- v80.16: technician job DETAIL view ----------
// The board card is a summary; tapping "View details" (or a job
// notification, #wjob=) opens the full detail here. The data comes
// from GET /api/jobs/:id, whose payload is the SAME publicJob view
// the board uses — the detail can never show more than the board
// rules allow (no customer name/phone/total; address + time only as
// the Team released them). Actions reuse workerJobBtns / jobChatHtml.
let jobDetailId = null;
async function openJobDetail(idv, keepScroll){
  jobDetailId = idv;
  const box = document.getElementById('jobDetail'); if (!box) return;
  let d = null;
  try { d = await api('/api/jobs/' + idv); } catch (e) {
    box.innerHTML = '<div class="card" style="border:1.5px solid #e42535"><b>' + WT('detailUnavailable') + '</b>' + (e && e.message ? '<br><span class="mut">' + escHtml(e.message) + '</span>' : '') + '<br><button class="ghost" onclick="closeJobDetail()">' + WT('closeDetails') + '</button></div>';
    return;
  }
  const j = (d && d.job) || {};
  box.innerHTML = '<div class="card" style="border:1.5px solid #e42535"><b>' + WT('detailTitle') + ' — ' + escHtml(j.id || '') + '</b> <button class="ghost" style="float:right" onclick="closeJobDetail()">' + WT('closeDetails') + '</button>'
    + '<br><span class="wjob-title">' + escHtml(j.service || '') + '</span> <span class="pill" data-wst="' + escHtml(j.status || '') + '">' + escHtml(j.status || '') + '</span>'
    + '<br>' + escHtml(j.description || '')
    + '<br><span class="mut">' + escHtml(j.city || '') + ' • ' + escHtml(j.when || '') + '</span>' + workerDistLine(j)
    + '<br>' + WT('payOffer') + ' <span class="st wjob-pay">$' + escHtml(j.payOffer) + '</span>' + workerPayoutLine(j) + workerCommLine(j)
    + (j.mine ? '<br>' + (j.infoReleased ? '<b>' + WT('detailsConfirmed') + '</b> ' + escHtml(j.address || '') : '<b>' + WT('addressTime') + '</b> <span class="mut">' + WT('addressTimeNote') + '</span>') + (j.notes ? '<br><b>' + WT('teamNotes') + '</b> ' + escHtml(j.notes) : '') : '')
    + '<br><button class="ghost wact" onclick="closeJobDetail()">' + WT('closeDetails') + '</button> ' + workerJobBtns(j) + (j.mine ? jobChatHtml(j) : '')
    + '</div>';
  if (!keepScroll) { try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
}
function closeJobDetail(){ jobDetailId = null; const box = document.getElementById('jobDetail'); if (box) box.innerHTML = ''; }
function workerPayoutLine(j){ if(!j.mine||!j.payoutStatus) return ''; if(j.payoutStatus==='paid') return '<br><span class="st">'+WT('payoutSent')+'</span>'; return '<br><span class="mut">'+WT('payoutLabel')+String(j.payoutStatus).replace(/_/g,' ')+'</span>'; }
// v80.11: his own sales commission, as its own line of his pay breakdown.
function workerCommLine(j){ if(!j.mine||!(Number(j.salesCommission)>0)) return ''; return '<br><span class="st">+ $'+Number(j.salesCommission).toFixed(2)+' '+WT('commissionLine')+'</span>'; }
// v80.11: board distance from HIS base city (server-measured) or the unmeasured flag.
function workerDistLine(j){ if(j.mine) return ''; if(j.distanceMiles!=null) return '<br><span class="mut">📍 '+Number(j.distanceMiles)+' '+WT('distAway')+'</span>'; if(j.rangeUnmeasured||j.rangeBaseUnmeasured) return '<br><span class="mut">📍 '+WT('unmeasuredTag')+'</span>'; return ''; }
// ---------- My money (v41) ----------
// One consolidated money view over the existing payout records: Connect
// state (with the setup button up front when payouts are not live), the
// paid-out and pending totals, and the per-job list. Data: /api/worker/money.
async function loadPayouts(){ const box=document.getElementById('workerPayouts'); if(!box||!me||me.role!=='worker'||me.status!=='active'){ if(box) box.innerHTML=''; return; }
  let d=null; try{ d=await api('/api/worker/money'); }catch(e){}
  if(!d){ // fall back to the Connect-status banner if the money read fails
    let st=null; try{ st=await api('/api/worker/connect/status'); }catch(e){}
    if(st&&st.ready){ box.innerHTML='<div class="card" style="border:1.5px solid #1d5c38;background:#0b2013"><b>'+WT('payoutsOn')+'</b><p class="mut">'+WT('payoutsOnBody')+'</p></div>'; return; }
    box.innerHTML='<div class="card" style="border:1.5px solid #6b5518;background:#221a05"><b>'+WT('setupTitle')+'</b><p class="mut">'+WT('setupBody')+'</p><button onclick="startConnect()">'+WT('setupBtn')+'</button></div>';
    return;
  }
  const conn=d.connect||{};
  const setupCard = conn.ready
    ? '<div class="card" style="border:1.5px solid #1d5c38;background:#0b2013"><b>'+WT('payoutsOn')+'</b><p class="mut">'+WT('payoutsOnBody')+'</p></div>'
    : '<div class="card" style="border:1.5px solid #6b5518;background:#221a05"><b>'+WT(conn.connected?'finishSetupTitle':'setupTitle')+'</b><p class="mut">'+WT('setupBody')+'</p><button onclick="startConnect()">'+WT(conn.connected?'continueSetupBtn':'setupBtn')+'</button></div>';
  const tot=d.totals||{paidOut:0,pending:0};
  const stLabel=function(s){ return WT('st_' + s) !== 'st_' + s ? WT('st_' + s) : String(s||'').replace(/_/g,' '); };
  const rows=(d.entries||[]).map(function(e){ return '<div style="padding:6px 0;border-bottom:1px dashed #333"><b>'+escHtml(e.jobId)+'</b> — '+escHtml(e.service||'Job')+(e.city?' <span class="mut">'+escHtml(e.city)+'</span>':'')+'<br><span class="st">$'+Number(e.amount||0).toFixed(2)+'</span>'+(Number(e.salesCommission)>0?' <span class="mut">(pay $'+Number(e.payOffer||0).toFixed(2)+' + $'+Number(e.salesCommission).toFixed(2)+' '+WT('commissionLine')+')</span>':'')+' <span class="pill">'+escHtml(stLabel(e.status))+'</span>'+(e.date?' <span class="mut">'+escHtml(String(e.date).slice(0,10))+'</span>':'')+'</div>'; }).join('');
  box.innerHTML='<h2>'+WT('moneyTitle')+'</h2>'+setupCard
    + '<div class="card"><div class="wstat-cards"><div class="wstat-card"><span class="wstat-lbl">'+WT('paidOutLabel')+'</span><span class="wstat-num paid">$'+Number(tot.paidOut||0).toFixed(2)+'</span></div><div class="wstat-card"><span class="wstat-lbl">'+WT('pendingLabel')+'</span><span class="wstat-num pend">$'+Number(tot.pending||0).toFixed(2)+'</span></div></div>'
    + (rows ? '<div style="margin-top:8px">'+rows+'</div>' : '<p class="mut">'+WT('noPayouts')+'</p>') + '</div>';
}
async function startConnect(){ try{ const r=await api('/api/worker/connect/start',{method:'POST'}); if(r&&r.url){ location.href=r.url; } else alert(WT('connectFail')); }catch(e){ alert(e.message); } }
// ---------- v80.11 ALCANCE: Menú de venta (tech zone only) ----------
async function loadWorkerSales(){ const box=document.getElementById('workerSales'); if(!box||!me||me.role!=='worker'||me.status!=='active'||me.workerClass==='ayudante'){ if(box) box.innerHTML=''; return; } // v84: ayudantes never see the sales menu (the server refuses it too)
  let d=null; try{ d=await api('/api/worker/sales-menu'); }catch(e){}
  if(!d||!d.items){ box.innerHTML=''; return; }
  const langEs = workerLang()==='es';
  const rows=d.items.map(function(it){ const nm=(langEs&&MENU_ES[it.serviceId])?MENU_ES[it.serviceId][0]:(MENU_CATALOG[it.serviceId]?MENU_CATALOG[it.serviceId].name:it.serviceId); return '<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px dashed #333;flex-wrap:wrap"><div style="flex:1;min-width:170px"><b>'+escHtml(nm)+'</b><br><span class="mut">'+WT('listPrice')+': $'+Number(it.price).toFixed(0)+'</span> · <span class="st">'+WT('youEarn')+' $'+Number(it.take).toFixed(0)+'</span></div><button type="button" class="ghost" onclick="makeSalesCart(\''+it.serviceId+'\',this)">'+WT('sendLinkBtn')+'</button></div>'; }).join('');
  box.innerHTML='<h2>'+WT('salesTitle')+'</h2><div class="card"><p class="mut">'+WT('salesIntro')+'</p><div id="salesLinkOut"></div>'+rows+'</div>';
}
async function makeSalesCart(serviceId, btn){ const out=document.getElementById('salesLinkOut'); try{ if(btn) btn.disabled=true; const r=await api('/api/worker/carts',{method:'POST', body:JSON.stringify({ items:[{serviceId:serviceId, qty:1}], lang: workerLang() })}); if(out) out.innerHTML='<div style="margin:8px 0"><b>'+WT('linkReady')+'</b><br><span style="word-break:break-all">'+escHtml(r.link)+'</span> <button type="button" class="ghost" onclick="copyShareLink(\''+r.link+'\', this)">'+WT('copyBtn')+'</button></div>'; }catch(e){ alert(e.message); } finally{ if(btn) btn.disabled=false; } }
// ---------- v80.11 ALCANCE: Creador de estimados (tech zone) ----------
async function loadWorkerEstimates(){ const box=document.getElementById('workerEstimates'); if(!box||!me||me.role!=='worker'||me.status!=='active'){ if(box) box.innerHTML=''; return; }
  if(!box.dataset.built){
    box.dataset.built='1';
    box.innerHTML='<h2>'+WT('wEstTitle')+'</h2><div class="card"><p class="mut">'+WT('wEstIntro')+'</p>'
      + '<input id="weName" placeholder="'+WT('wCustName')+'" style="width:100%;margin:3px 0"><input id="weEmail" placeholder="'+WT('wCustEmail')+'" style="width:100%;margin:3px 0"><input id="wePhone" placeholder="'+WT('wCustPhone')+'" style="width:100%;margin:3px 0">'
      + '<input id="weService" placeholder="'+WT('wServiceName')+'" style="width:100%;margin:3px 0"><textarea id="weScope" placeholder="'+WT('wScopePh')+'" style="width:100%;margin:3px 0" rows="3"></textarea>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap"><input id="weHours" type="number" step="0.25" min="0.25" placeholder="'+WT('wHours')+'" style="flex:1;min-width:110px"><input id="wePrice" type="number" step="1" placeholder="'+WT('wPriceOpt')+'" style="flex:1;min-width:150px"><input id="weCity" placeholder="'+WT('wCityName')+'" style="flex:1;min-width:110px"></div>'
      + '<button type="button" class="black" onclick="submitWorkerEstimate(this)">'+WT('wSendEst')+'</button><p class="mut" id="weMsg"></p>'
      + '<h3>'+WT('wMyEstimates')+'</h3><div id="workerEstList"></div></div>';
  }
  paintWorkerEstList();
}
async function paintWorkerEstList(){ const el=document.getElementById('workerEstList'); if(!el) return; let d=null; try{ d=await api('/api/worker/estimates'); }catch(e){}
  const list=(d&&d.estimates)||[];
  el.innerHTML = list.length ? list.map(function(e){ return '<div style="padding:6px 0;border-bottom:1px dashed #333"><b>'+escHtml(e.id)+'</b> — '+escHtml(e.service||'Estimate')+' <span class="pill">'+escHtml(e.status)+'</span><br><span class="mut">'+escHtml(e.customerName||'')+'</span> <span class="st">$'+Number(e.total||0).toFixed(2)+'</span> <button type="button" class="ghost" onclick="copyShareLink(\''+e.link+'\', this)">'+WT('copyBtn')+'</button></div>'; }).join('') : '<p class="mut">'+WT('wNoEstimates')+'</p>';
}
async function submitWorkerEstimate(btn){ const msg=document.getElementById('weMsg'); const body={ customerName:document.getElementById('weName').value, customerEmail:document.getElementById('weEmail').value, customerPhone:document.getElementById('wePhone').value, service:document.getElementById('weService').value, description:document.getElementById('weScope').value, hours:Number(document.getElementById('weHours').value||0), city:document.getElementById('weCity').value }; const pv=document.getElementById('wePrice').value; if(pv) body.price=Number(pv);
  try{ if(btn) btn.disabled=true; const r=await api('/api/worker/estimates',{method:'POST', body:JSON.stringify(body)}); if(msg) msg.innerHTML=WT('wEstSent')+(r.adjusted?'<br><b>'+WT('wEstRaised')+'$'+Number(r.total).toFixed(2)+'</b>':'')+'<br>'+WT('wEstLink')+' <span style="word-break:break-all">'+escHtml(r.link)+'</span>'; paintWorkerEstList(); }catch(e){ if(msg) msg.textContent=e.message; } finally{ if(btn) btn.disabled=false; } }
// ---------- v80.11 ALCANCE: Referidos (tech zone) ----------
async function loadWorkerReferrals(){ const box=document.getElementById('workerReferrals'); if(!box||!me||me.role!=='worker'){ if(box) box.innerHTML=''; return; }
  let d=null; try{ d=await api('/api/worker/referrals'); }catch(e){}
  if(!d||!d.code){ box.innerHTML=''; return; }
  const stL=function(s){ return WT('st_' + s) !== 'st_' + s ? WT('st_' + s) : String(s||'').replace(/_/g,' '); };
  const srows=(d.signups||[]).map(function(s){ return '<div style="padding:5px 0;border-bottom:1px dashed #333">'+escHtml(s.name||'')+(s.plan?' · <b>'+escHtml(s.plan)+'</b>':'')+(s.memberActive?' <span class="pill">✓</span>':'')+'</div>'; }).join('');
  const brows=(d.bounties||[]).map(function(x){ return '<div style="padding:5px 0;border-bottom:1px dashed #333"><span class="st">$'+Number(x.amount||0).toFixed(2)+'</span> '+WT('refBountyWord')+' — '+escHtml(x.customerName||'')+' <span class="pill">'+escHtml(stL(x.status))+'</span></div>'; }).join('');
  box.innerHTML='<h2>'+WT('refTitle')+'</h2><div class="card"><p class="mut">'+WT('refIntro')+'</p><b>'+WT('refYourLink')+'</b><br><span style="word-break:break-all">'+escHtml(d.link)+'</span> <button type="button" class="ghost" onclick="copyShareLink(\''+d.link+'\', this)">'+WT('copyBtn')+'</button>'
    + '<div style="margin-top:8px"><b>'+WT('refEarned')+' <span class="st">$'+Number((d.totals||{}).earned||0).toFixed(2)+'</span></b> · <b>'+WT('refPending')+' $'+Number((d.totals||{}).pending||0).toFixed(2)+'</b></div>'
    + '<h3>'+WT('refSignups')+'</h3>'+(srows||'<p class="mut">'+WT('refNoSignups')+'</p>')+(brows?'<div style="margin-top:6px">'+brows+'</div>':'')+'</div>';
}
// ---------- v80.23: customer referrals card (audit A-3) ----------
// The customer's mirror of the tech referral card: their personal link
// (the ?src= stamp does the attribution), the friends who arrived
// through it, and the tracked credit balance — all copy through CUST_UI.
function custReferralCardHtml(d){
  if(!d || !d.code) return '';
  const srows=(d.signups||[]).map(function(s){ return '<div style="padding:5px 0;border-bottom:1px dashed #333">'+escHtml(s.name||'')+(s.memberActive?' · <b>'+CU('crefMember')+'</b> ✓':'')+(s.credited?' <span class="pill">'+CU('crefCredited')+'</span>':'')+'</div>'; }).join('');
  const crows=(d.credits||[]).map(function(x){ return '<div style="padding:5px 0;border-bottom:1px dashed #333"><span class="st">$'+Number(x.amount||0).toFixed(2)+'</span> '+CU('crefCreditWord')+' — '+escHtml(x.customerName||'')+'</div>'; }).join('');
  return '<h2>'+CU('crefTitle')+'</h2><div class="card"><p class="mut">'+CU('crefIntro')+'</p><b>'+CU('crefYourLink')+'</b><br><span style="word-break:break-all">'+escHtml(d.link)+'</span> <button type="button" class="ghost" onclick="copyShareLink(\''+d.link+'\', this)">'+CU('crefCopy')+'</button>'
    + '<div style="margin-top:8px"><b>'+CU('crefBalance')+': <span class="st">$'+Number((d.totals||{}).balance||0).toFixed(2)+'</span></b></div>'
    + '<h3>'+CU('crefSignups')+'</h3>'+(srows||'<p class="mut">'+CU('crefNoSignups')+'</p>')+(crows?'<div style="margin-top:6px">'+crows+'</div>':'')+'</div>';
}
async function loadMyReferrals(){ const box=document.getElementById('myReferrals'); if(!box||!me||me.role!=='customer'){ if(box) box.innerHTML=''; return; }
  let d=null; try{ d=await api('/api/me/referrals'); }catch(e){}
  if(!d||!d.code){ box.innerHTML=''; return; }
  box.innerHTML=custReferralCardHtml(d);
}
// ---------- v80.27: seasonal rebooking card (audit A-4) ----------
// The proposal lives ONLY here, in the account — nothing is ever sent
// anywhere (STOP TOTAL). Headline = the full LIST price; the member
// price rides as its own line (Gabriel's price-presentation law). One
// tap on Book builds the standard customer cart and lands on its page,
// where the normal checkout and the deposit law run unchanged.
function seasonalCardHtml(d){
  const props=(d&&d.proposals)||[];
  if(!props.length) return '';
  const rows=props.map(function(pr){
    return '<div style="padding:8px 0;border-bottom:1px dashed #333">'
      + '<b>'+escHtml(svcName(pr.serviceId))+'</b> <span class="pill">'+CU('seasDueNow')+'</span><br>'
      + '<span class="mut">'+CU('seasLastDone')+': '+escHtml(String(pr.lastDoneAt||'').slice(0,10))+'</span>'
      + (pr.addonId ? '<br><span class="mut">'+CU('seasFilterNote')+'</span>' : '')
      + '<div style="margin-top:4px"><span style="font-size:20px"><b>$'+Number(pr.list||0).toFixed(0)+'</b></span> · <span class="st">'+CU('cartMembersPayPre')+Number(pr.member||0).toFixed(0)+'</span></div>'
      + '<div style="margin-top:6px"><button type="button" onclick="seasonalBook(\''+pr.serviceId+'\',this)">'+CU('seasBook')+'</button> <button type="button" class="ghost" onclick="seasonalDismiss(\''+pr.serviceId+'\')">'+CU('seasDismiss')+'</button></div></div>';
  }).join('');
  return '<h2>'+CU('seasTitle')+'</h2><div class="card"><p class="mut">'+CU('seasIntro')+'</p>'+rows+'</div>';
}
async function loadSeasonal(){ const box=document.getElementById('mySeasonal'); if(!box||!me||me.role!=='customer'){ if(box) box.innerHTML=''; return; }
  let d=null; try{ d=await api('/api/me/seasonal'); }catch(e){}
  box.innerHTML=seasonalCardHtml(d||{});
}
async function seasonalBook(serviceId, btn){ if(btn) btn.disabled=true;
  try{ const d=await api('/api/me/seasonal/confirm',{method:'POST', body:JSON.stringify({serviceId})}); if(d&&d.link){ location.href=d.link; return; } }catch(e){}
  if(btn) btn.disabled=false; loadSeasonal();
}
async function seasonalDismiss(serviceId){ try{ await api('/api/me/seasonal/dismiss',{method:'POST', body:JSON.stringify({serviceId})}); }catch(e){} await loadSeasonal(); }
// ---------- Worker avatars (v41) ----------
// One avatar treatment everywhere (worker profile, customer technician
// card, admin cards, captain team, map pins): the worker's photo in a
// circle with the brand-red ring — or, when he has no photo, an initials
// circle in brand colors. Never a broken-image icon.
function initialsOf(name){
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
}
function avatarHtml(photo, name, size){
  size = size || 40;
  if (photo) return '<img src="' + escAttr(photo) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;border:2px solid #e42535;vertical-align:middle;background:#1b1b1f">';
  return '<span style="display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#e42535;color:#fff;font-weight:800;font-size:' + Math.max(11, Math.round(size * 0.4)) + 'px;vertical-align:middle">' + escHtml(initialsOf(name)) + '</span>';
}
// The customer's technician line on their job card: avatar + name. The
// payload carries ONLY name + photo for the worker — never phone or pay.
function techCardHtml(j){
  if (!j || !j.technician) return '';
  return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">' + avatarHtml(j.technicianPhoto, j.technician, 36) + '<span>' + CU('yourTech') + ' <b>' + escHtml(j.technician) + '</b></span></div>';
}
// ---------- Mi perfil + Mis oficios + Disponibilidad (v41) ----------
// EVERY worker edits his full profile here — including accounts created
// under the old model: the form is prefilled from his stored profile
// (name, phone, city, areas, skills text) and nothing is gated on when
// the account was created. The section is built once per session so
// re-renders never wipe what he is typing; saving rebuilds it fresh.
let workerProfileFor = null;
let myTradeEdits = null; // { key: { level: 0..5 (0 = unrated), tools: bool, was: bool } }
function tradeEditsFromMe(){
  const out = {};
  TRADE_KEYS_CLIENT.forEach(function(k){
    const e = (me.tradeSkills || {})[k];
    out[k] = { level: e && e.level ? e.level : 0, tools: !!(e && e.tools), was: !!e };
  });
  return out;
}
function loadWorkerProfile(){
  const banner = document.getElementById('workerSkillBanner');
  const box = document.getElementById('workerProfile');
  if (!box || !me || me.role !== 'worker') { if (banner) banner.innerHTML = ''; if (box) box.innerHTML = ''; workerProfileFor = null; return; }
  const rated = me.skillsRated != null ? me.skillsRated : TRADE_KEYS_CLIENT.filter(function(k){ const e=(me.tradeSkills||{})[k]; return e && e.level; }).length;
  if (banner) banner.innerHTML = rated < 7
    ? '<div class="card" style="border:1.5px solid #e42535;background:#2a0d10"><b>' + WT('skillBannerTitle') + '</b><p class="mut">' + WT('skillBannerBody').replace('{n}', (7 - rated)) + '</p><button class="ghost" onclick="document.getElementById(\'workerTradesCard\').scrollIntoView({behavior:\'smooth\'})">' + WT('skillBannerBtn') + '</button></div>'
    : '';
  if (workerProfileFor === me.id && myTradeEdits) return; // already built — never clobber typing
  workerProfileFor = me.id;
  myTradeEdits = tradeEditsFromMe();
  const pf = me.profile || {};
  const av = me.availability || { preset: 'anytime', days: [], paused: false };
  const dayNames = [ WT('day_0'), WT('day_1'), WT('day_2'), WT('day_3'), WT('day_4'), WT('day_5'), WT('day_6') ];
  const daysHtml = [0, 1, 2, 3, 4, 5, 6].map(function(d){ return '<label style="display:inline-block;margin:2px 8px 2px 0;font-size:13px"><input type="checkbox" id="wp-day-' + d + '"' + ((av.days || []).includes(d) ? ' checked' : '') + '> ' + dayNames[d] + '</label>'; }).join('');
  box.innerHTML = '<h2>' + WT('profileTitle') + '</h2>'
    + '<div class="card">'
    + '<div id="wpPhotoBox"></div>'
    + '<label>' + WT('nameLabel') + '</label><input id="wp-name" value="' + escAttr(me.name || '') + '">'
    + '<label>' + WT('phoneLabel') + '</label><input id="wp-phone" value="' + escAttr(me.phone || '') + '">'
    + '<div class="row"><div><label>' + WT('cityLabel') + '</label><input id="wp-city" value="' + escAttr(pf.city || '') + '"></div>'
    + '<div><label>' + WT('areasLabel') + '</label><input id="wp-areas" value="' + escAttr(pf.areas || '') + '" placeholder="Fairfield, Vacaville, Vallejo..."></div></div>'
    + '<label>' + WT('skillsWordsLabel') + '</label><input id="wp-skills" value="' + escAttr(((pf.skills || me.skills || []).join(', '))) + '" placeholder="' + escAttr(WT('skillsPh')) + '">'
    + '<h3 style="margin-bottom:4px">' + WT('availTitle') + '</h3>'
    + '<select id="wp-avail-preset" onchange="wpAvailPresetChange()"><option value="anytime"' + (av.preset === 'anytime' ? ' selected' : '') + '>' + WT('availAnytime') + '</option><option value="weekdays"' + (av.preset === 'weekdays' ? ' selected' : '') + '>' + WT('availWeekdays') + '</option><option value="weekends"' + (av.preset === 'weekends' ? ' selected' : '') + '>' + WT('availWeekends') + '</option><option value="custom"' + (av.preset === 'custom' ? ' selected' : '') + '>' + WT('availCustom') + '</option></select>'
    + '<div id="wp-avail-days" style="margin-top:6px;' + (av.preset === 'custom' ? '' : 'display:none') + '">' + daysHtml + '</div>'
    + '<label style="display:block;margin-top:10px"><input type="checkbox" id="wp-paused"' + (av.paused ? ' checked' : '') + '> ' + WT('pausedLabel') + '</label>'
    + '<div style="margin-top:10px"><button onclick="saveWorkerProfile()">' + WT('saveProfile') + '</button> <span id="wpMsg" class="mut"></span></div>'
    + '</div>'
    + '<div class="card" id="workerTradesCard"><h3 style="margin-top:0">' + WT('tradesTitle') + '</h3>'
    + '<p class="mut" style="margin-top:0">' + WT('tradesIntro') + '</p>'
    + '<div id="wpTradesRows"></div>'
    + '<div style="margin-top:10px"><button onclick="saveWorkerTrades()">' + WT('saveTrades') + '</button> <span id="wtMsg" class="mut"></span></div>'
    + '</div>';
  paintWorkerPhotoBox();
  repaintWorkerTrades();
}
// The profile-photo editor (top of Mi perfil): round avatar preview, a
// file input, and a remove button. Uploads save IMMEDIATELY (same
// pattern as the yard-visit photos) through the worker-profile endpoint
// — the worker can only ever change his OWN photo.
function paintWorkerPhotoBox(){
  const box = document.getElementById('wpPhotoBox'); if (!box || !me) return;
  box.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
    + avatarHtml(me.photo, me.name, 64)
    + '<div><b>' + WT('photoTitle') + '</b><br><span class="mut">' + WT('photoNote') + '</span><br>'
    + '<input type="file" id="wp-photo" accept="image/*" onchange="wpPhotoChange(this)" style="margin-top:6px">'
    + (me.photo ? ' <button type="button" class="ghost" onclick="wpPhotoRemove()">' + WT('removePhoto') + '</button>' : '')
    + ' <span id="wpPhotoMsg" class="mut"></span></div></div>';
}
async function wpPhotoChange(input){
  const f = input && input.files && input.files[0]; if (!f) return;
  try {
    const data = await fileToDataUrl(f);
    const r = await api('/api/me/worker-profile', { method: 'POST', body: JSON.stringify({ photo: data }) });
    if (r && r.user) { me.photo = r.user.photo || null; if (!me.profile) me.profile = {}; if (me.photo) me.profile.photo = me.photo; else delete me.profile.photo; }
    paintWorkerPhotoBox();
    const m = document.getElementById('wpPhotoMsg'); if (m) m.textContent = WT('photoSaved');
  } catch(e) { const m = document.getElementById('wpPhotoMsg'); if (m) m.textContent = e.message; else alert(e.message); }
}
async function wpPhotoRemove(){
  try {
    const r = await api('/api/me/worker-profile', { method: 'POST', body: JSON.stringify({ photo: null }) });
    if (r && r.user) { me.photo = r.user.photo || null; if (me.profile) delete me.profile.photo; }
    paintWorkerPhotoBox();
    const m = document.getElementById('wpPhotoMsg'); if (m) m.textContent = WT('photoRemoved');
  } catch(e) { alert(e.message); }
}
function wpAvailPresetChange(){ const s = document.getElementById('wp-avail-preset'); const d = document.getElementById('wp-avail-days'); if (s && d) d.style.display = s.value === 'custom' ? '' : 'none'; }
function repaintWorkerTrades(){
  const rows = document.getElementById('wpTradesRows'); if (!rows || !myTradeEdits) return;
  rows.innerHTML = TRADE_KEYS_CLIENT.map(function(k){
    const ed = myTradeEdits[k];
    const src = (me.tradeSkills || {})[k];
    let btns = '';
    for (let i = 1; i <= 5; i++) btns += '<button type="button" class="' + (ed.level === i ? 'sel' : '') + '" onclick="wpSetLevel(\'' + k + '\',' + i + ')">' + i + '</button>';
    const ver = src && src.verified ? ' <span class="pill">' + WT('verified') + ': ' + src.verified + '</span>' : '';
    return '<div class="trade-row"><span class="trade-name">' + wTradeName(k) + ver + '</span><span class="trade-lvl">' + btns + '</span>'
      + '<button type="button" class="ghost" style="padding:3px 8px;min-width:0" title="' + WT('clearTitle') + '" onclick="wpSetLevel(\'' + k + '\',0)">✕</button>'
      + '<label class="trade-tools"><input type="checkbox" ' + (ed.tools ? 'checked' : '') + ' onchange="wpSetTools(\'' + k + '\',this.checked)"> ' + WT('toolsFlag') + '</label></div>';
  }).join('');
}
function wpSetLevel(k, lv){ if (!myTradeEdits) return; myTradeEdits[k].level = lv; repaintWorkerTrades(); }
function wpSetTools(k, on){ if (!myTradeEdits) return; myTradeEdits[k].tools = !!on; }
async function saveWorkerProfile(){
  const msg = document.getElementById('wpMsg');
  const v = function(i){ const el = document.getElementById(i); return el ? el.value : ''; };
  try {
    await api('/api/me/worker-profile', { method: 'POST', body: JSON.stringify({ name: v('wp-name'), phone: v('wp-phone'), city: v('wp-city'), areas: v('wp-areas'), skills: v('wp-skills') }) });
    const days = [0, 1, 2, 3, 4, 5, 6].filter(function(d){ const c = document.getElementById('wp-day-' + d); return c && c.checked; });
    const pausedEl = document.getElementById('wp-paused');
    await api('/api/me/availability', { method: 'POST', body: JSON.stringify({ preset: v('wp-avail-preset') || 'anytime', days: days, paused: !!(pausedEl && pausedEl.checked) }) });
    if (msg) msg.textContent = WT('saved');
    workerProfileFor = null; myTradeEdits = null;
    loadMe();
  } catch (e) { if (msg) msg.textContent = e.message; }
}
async function saveWorkerTrades(){
  const msg = document.getElementById('wtMsg');
  if (!myTradeEdits) return;
  const payload = {};
  TRADE_KEYS_CLIENT.forEach(function(k){
    const ed = myTradeEdits[k];
    if (ed.level > 0) payload[k] = { level: ed.level, tools: !!ed.tools };
    else if (ed.was) payload[k] = null; // he cleared a rating he had — server keeps any Team verification
  });
  try {
    await api('/api/me/trades', { method: 'POST', body: JSON.stringify({ tradeSkills: payload }) });
    if (msg) msg.textContent = WT('saved');
    workerProfileFor = null; myTradeEdits = null;
    loadMe();
  } catch (e) { if (msg) msg.textContent = e.message; }
}
function payoutHtml(j){ if(!j.assignedWorkerId) return ''; const map={ paid:'Payout SENT to the technician \u2713', awaiting_worker_setup:'Payout waiting — technician has not finished Stripe setup', awaiting_payment:'Payout waiting — customer payment not in yet', awaiting_capture:'Payout waiting — customer payment not in yet', pending_funds:'Payout pending — waiting for funds to be available in Stripe', error:'Payout ERROR — '+(j.payoutError||'see server log'), stripe_off:'Payout off — Stripe not configured' }; if(j.status!=='Done \u2014 photos sent'&&!j.payoutStatus) return ''; const label=j.payoutStatus?(map[j.payoutStatus]||('Payout: '+j.payoutStatus)):'Payout not sent yet'; return '<div style="margin-top:8px"><span class="pill">\u{1F4B3} '+label+'</span> <button class="ghost" onclick="payWorkerNow(\''+j.id+'\')">Pay worker now</button></div>'; }
async function payWorkerNow(idv){ try{ const r=await api('/api/admin/jobs/'+idv+'/pay-worker',{method:'POST'}); alert('Payout status: '+(r.payoutStatus||'\u2014')+(r.payoutError?(' \u2014 '+r.payoutError):'')); loadAdminJobs(); }catch(e){ alert(e.message); } }
// v75 → v80.8: Gabriel's per-job claim release, right on the job
// card. While the Connect claim gate lived this released THIS job to
// one worker despite it; since v80.8 every active worker can claim
// anyway, so the action is a harmless legacy flag — it records the
// release (server audits it) and tells the worker the Team picked
// him. The pill shows when a release is already in place.
function connectOverrideHtml(j){
  const opts = (adminWorkersCache || []).filter(function(w){ return w.status === 'active'; }).map(function(w){ return '<option value="' + w.id + '"' + (j.connectOverrideFor === w.id ? ' selected' : '') + '>' + escHtml(w.name) + '</option>'; }).join('');
  return '<div style="margin-top:8px"><span class="mut">Claim release (optional):</span> <select id="cov-' + j.id + '">' + opts + '</select> <button class="ghost" onclick="connectOverride(\'' + j.id + '\')">Release claim to this worker</button>' + (j.connectOverrideFor ? ' <span class="pill">Released to one worker</span>' : '') + '</div>';
}
async function connectOverride(idv){ const sel=document.getElementById('cov-'+idv); if(!sel||!sel.value){ alert('Pick a worker first'); return; } try{ await api('/api/admin/jobs/'+idv+'/connect-override',{method:'POST', body:JSON.stringify({workerId: sel.value})}); }catch(e){ alert(e.message); } loadAdminJobs(); }
// v80.8: claims are open to every active worker — the server no longer
// refuses for missing Stripe Connect (the pay is held in-app until he
// connects; see the payout-setup card below), so a failed claim here is
// a plain error alert, nothing Connect-specific.
async function claimJob(idv){ try{ await api('/api/jobs/'+idv+'/claim',{method:'POST'}); loadJobs(); }catch(e){ alert(e.message); } }
// v75 → v80.8: the persistent card at the top of the worker home. It
// used to explain a CLAIM LOCK; since v80.8 there is no lock — any
// active worker can take jobs. The card is now a payout-setup
// reminder: while his Stripe Connect payouts are not enabled, his pay
// for finished jobs is held in the app, and this card says so, in his
// language, with the setup button right there. It disappears the
// moment he is ready.
let connectGateStateCache = null, connectGateFetchedAt = 0;
async function paintConnectGateCard(){
  const box = document.getElementById('connectGateCard'); if (!box || !me || me.role !== 'worker') return;
  if (me.status !== 'active') { box.innerHTML = ''; return; }
  // v80.16: the banner ALSO fires when pay is being HELD for him
  // (payoutStatus 'awaiting_worker_setup' — the status endpoint sums
  // it as heldPay), not only when Connect is missing entirely; the
  // held amount rides the banner. There is still NO dismiss control:
  // the only way out is connecting, which releases the pay. The read
  // is cached for a minute so board refreshes don't hammer it.
  if (!connectGateStateCache || Date.now() - connectGateFetchedAt > 60000) { try { connectGateStateCache = await api('/api/worker/connect/status'); connectGateFetchedAt = Date.now(); } catch(e) { if (!connectGateStateCache) connectGateStateCache = { connected: false, ready: !!me.payoutsReady, heldPay: 0 }; } }
  const c = connectGateStateCache || {};
  const held816 = Number(c.heldPay || 0);
  if (c.ready && !(held816 > 0)) { box.innerHTML = ''; return; }
  const heldLine816 = held816 > 0 ? '<br><span><b>' + WT('connectHeldLine').replace('{amt}', '$' + held816.toFixed(2)) + '</b></span>' : '';
  box.innerHTML = '<div class="card" style="border:1.5px solid #6b5518;background:#221a05"><b>' + WT('connectGateTitle') + '</b><br><span>' + WT('connectGateMsg') + '</span><br><span class="mut">' + WT('connectGateBody') + '</span>' + heldLine816 + '<br><button onclick="startConnect()" style="margin-top:8px">' + WT('connectGateBtn') + '</button></div>';
}
async function doneJob(idv){ await api('/api/jobs/'+idv,{method:'PATCH', body:JSON.stringify({photosDone:true})}); if (trackWatch && trackWatch.jobId === idv) stopWatchOnly(); loadJobs(); }
// ---------- Notification sound (added 2026-10-21, v22) ----------
// A short synthesized WebAudio chime — no audio files. Browsers refuse
// audio before a user gesture, so the AudioContext arms on the first
// tap/click anywhere and nothing can sound before that. Chimes fire ONLY
// for transitions observed while the app is open: the first load after
// sign-in sets the baseline, never a chime for pre-existing state. The
// mute toggle persists in localStorage ('ghsSound'), default ON.
let audioCtx = null;
let soundOn = true;
try { soundOn = localStorage.getItem('ghsSound') !== 'off'; } catch(e) {}
function armSound(){
  if (audioCtx) { if (audioCtx.state === 'suspended' && audioCtx.resume) { try { audioCtx.resume(); } catch(e) {} } return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { audioCtx = new AC(); } catch(e) {}
}
if (document && document.addEventListener) { document.addEventListener('pointerdown', armSound); document.addEventListener('click', armSound); }
// v64: THE HAMMER (Gabriel: "un sonido... como un hammer o pum... que suene
// buenísimo"). A synthesized strike — pitch-dropping thump (the "PUM") +
// inharmonic metal partials (the ring) + a noise click (the impact) —
// replaces the soft two-tone chime as the primary alert sound. Pure
// WebAudio on purpose: no audio file to ship (the repo push path is
// text-only) and it plays the moment the context is armed. The old chime
// remains as the fallback. Mute rules everything via 'ghsSound'.
function playHammer(){
  if (!soundOn || !audioCtx) return false;
  if (audioCtx.state === 'suspended' && audioCtx.resume) { try { audioCtx.resume(); } catch(e) {} }
  if (audioCtx.state !== 'running') return false;
  try {
    const t0 = audioCtx.currentTime;
    const master = audioCtx.createGain(); master.gain.value = 0.95;
    if (audioCtx.createDynamicsCompressor) { const cp = audioCtx.createDynamicsCompressor(); cp.threshold.value = -18; cp.ratio.value = 8; master.connect(cp); cp.connect(audioCtx.destination); }
    else master.connect(audioCtx.destination);
    const o = audioCtx.createOscillator(), og = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(250, t0);
    o.frequency.exponentialRampToValueAtTime(62, t0 + 0.14);
    og.gain.setValueAtTime(0.95, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    o.connect(og); og.connect(master); o.start(t0); o.stop(t0 + 0.24);
    [[622, 0.38, 0.34], [1244, 0.44, 0.28], [2093, 0.26, 0.2], [3412, 0.14, 0.13]].forEach(function(pt){
      const p = audioCtx.createOscillator(), pg = audioCtx.createGain();
      p.type = 'triangle'; p.frequency.setValueAtTime(pt[0], t0);
      pg.gain.setValueAtTime(pt[1], t0);
      pg.gain.exponentialRampToValueAtTime(0.001, t0 + pt[2]);
      p.connect(pg); pg.connect(master); p.start(t0); p.stop(t0 + pt[2] + 0.02);
    });
    const nb = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.04), audioCtx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
    const ns = audioCtx.createBufferSource(); ns.buffer = nb;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1600;
    const ng = audioCtx.createGain(); ng.gain.value = 0.7;
    ns.connect(hp); hp.connect(ng); ng.connect(master); ns.start(t0);
    return true;
  } catch(e) { return false; }
}
function playChime(){
  if (!soundOn) return;
  if (playHammer()) return;
  if (!audioCtx || audioCtx.state !== 'running') return;
  try {
    const t0 = audioCtx.currentTime;
    [[880, 0], [1318.5, 0.13]].forEach(function(n){
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(n[0], t0 + n[1]);
      g.gain.setValueAtTime(0.0001, t0 + n[1]);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.24);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + n[1]); o.stop(t0 + n[1] + 0.26);
    });
  } catch(e) {}
}
function toggleSoundMute(){
  soundOn = !soundOn;
  try { localStorage.setItem('ghsSound', soundOn ? 'on' : 'off'); } catch(e) {}
  if (soundOn) armSound();
  paintSoundBtn();
}
function paintSoundBtn(){ const b = document.getElementById('soundBtn'); if (b) b.textContent = soundOn ? '🔊' : '🔇'; }
// v72 (C-4): the header "Member log in" button duplicates the login card
// when the card itself is already on screen — it only earns its place
// after the visitor scrolls past the card. Hide it while #authBox is
// visible (and always while signed in).
let authBoxInView = false;
function paintMemberLoginBtn(){
  const mlb = document.getElementById('memberLoginBtn');
  if (!mlb) return;
  mlb.style.display = (me || authBoxInView) ? 'none' : 'inline-block';
}
try {
  const abObs = document.getElementById('authBox');
  if (abObs && 'IntersectionObserver' in window) new IntersectionObserver(function(es){ es.forEach(function(e){ authBoxInView = e.isIntersecting; }); paintMemberLoginBtn(); }, { threshold: 0.12 }).observe(abObs);
} catch(e) {}
// ---------- In-app dialog (v65) ----------
let appDlgResolve = null;
function appDlgShow(msg, opts){
  opts = opts || {};
  return new Promise(function(res){
    appDlgResolve = res;
    document.getElementById('appDlgMsg').textContent = msg;
    const inp = document.getElementById('appDlgInput');
    inp.style.display = opts.input ? 'block' : 'none';
    inp.value = opts.def || '';
    inp.placeholder = opts.placeholder || '';
    document.getElementById('appDlgOk').textContent = opts.okText || 'OK';
    document.getElementById('appDlg').style.display = 'flex';
    if (opts.input) setTimeout(function(){ try { inp.focus(); inp.select(); } catch(e) {} }, 60);
  });
}
function appDlgDone(val){
  document.getElementById('appDlg').style.display = 'none';
  if (appDlgResolve) { const r = appDlgResolve; appDlgResolve = null; r(val); }
}
function appDlgOkClicked(){ const inp = document.getElementById('appDlgInput'); appDlgDone(inp && inp.style.display !== 'none' ? inp.value : true); }
function appDlgCancelClicked(){ const inp = document.getElementById('appDlgInput'); appDlgDone(inp && inp.style.display !== 'none' ? null : false); }
function appConfirm(msg){ return appDlgShow(msg, { okText: 'Sí, continuar' }); }
function appPrompt(msg, def, placeholder){ return appDlgShow(msg, { input: true, def: def, placeholder: placeholder, okText: 'OK' }); }
// ---------- Permissions setup card (v64, Gabriel) ----------
// "Cuando instalen la aplicación, que les notifique que tienen que activar
// notificaciones y su ubicación — cliente y trabajador." The card sits on
// the account's home until BOTH permissions are granted; each ACTIVATE
// button triggers the browser's own permission popup from the tap (the
// only way browsers allow it). Location state reads the Permissions API
// where available, with a localStorage flag as the fallback record.
// v80.16: the location opt-in ALSO lives on the account (server-side,
// u.locOptInAt via pubUser) — the localStorage flag alone was wiped by
// PWA reinstalls / cache clears and the tech re-granted at every
// login. The server record counts as granted and heals the local flag.
function permLocGranted(){ try { if (localStorage.getItem('ghsLoc') === 'on') return true; } catch(e) {} return !!(me && me.role === 'worker' && me.locOptIn); }
function healWorkerLocFlag(){ try { if (me && me.role === 'worker' && me.locOptIn) localStorage.setItem('ghsLoc', 'on'); } catch(e) {} }
// v80.19 IDIOMA: the toggle IS the preference — while logged in it is
// saved on the account (fire-and-forget; the local choice already
// rules this device) so server emails follow it, and at login the
// account's saved language heals this device's toggles.
function persistLangPref(l){ if (!me || (l !== 'es' && l !== 'en')) return; try { fetch('/api/me/lang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) }).catch(function(){}); } catch (e) {} }
function healLangFromAccount(){ try { if (me && (me.lang === 'es' || me.lang === 'en')) { const L = me.lang; if (_menuLang !== L || _workerLangChoice !== L) { _menuLang = L; _workerLangChoice = L; try { localStorage.setItem('ghsMenuLang', L); localStorage.setItem('ghsWorkerLang', L); } catch (e) {} if (typeof applyMenuLang === 'function') applyMenuLang(); if (typeof applyWorkerLang === 'function') applyWorkerLang(); if (typeof renderMenu === 'function') renderMenu(); } } } catch (e) {} }
function paintAuthFace(){
  if (isWorkerEntry()) return;
  const h = document.querySelector('#authBox h3'); const hint = document.getElementById('authHint');
  if (curMode === 'join' || curMode === 'homecare') { if (h) h.textContent = CU('authTitleMember'); if (hint) hint.textContent = CU('authHintJoin'); }
  else if (curMode === 'login') { if (h) h.textContent = CU('authTitleLogin'); if (hint) hint.textContent = CU('authHintLogin'); }
  else { if (h) h.textContent = CU('authTitleLogin'); if (hint) hint.textContent = CU('authHintPlain'); }
}
function paintStaticChrome(){
  const set = function(id, txt){ const el = document.getElementById(id); if (el && txt != null) el.textContent = txt; };
  const setH = function(id, html){ const el = document.getElementById(id); if (el && html != null) el.innerHTML = html; };
  set('navHomeLink', CU('navHome')); set('menuNavLink', CU('navMenu')); set('navMembershipsLink', CU('navMemberships')); set('navYardLink', CU('navYard'));
  set('memberLoginBtn', CU('memberLoginBtn'));
  set('pillCall', CU('pillCall')); set('pillText', CU('pillText')); set('pillPhoto', CU('pillPhoto'));
  const cb = document.getElementById('cartBtn'); if (cb) { cb.title = CU('cartTitle'); if (cb.setAttribute) cb.setAttribute('aria-label', CU('cartTitle')); }
  set('memAddrTitle', CU('memAddrTitle')); set('memAddrNote', CU('memAddrNote')); set('memAddrSave', CU('memAddrSave'));
  set('serviceAddressLbl2', CU('saLabel'));
  set('homeNotesLbl2', CU('homeNotesLbl2')); set('startLbl2', CU('startLbl')); set('startNote2', CU('startNote2')); set('saveHomeDetailsBtn', CU('saveHomeDetailsBtn'));
  set('homeTypeLbl2', CU('homeTypeLbl')); set('yardSizeLbl2', CU('yardSizeLbl'));
  paintPickLabels('hStartPick');
  paintHomeOptionLabels('hHomeType', 'hYardSize');
  const hn = document.getElementById('hHomeNotes'); if (hn) hn.placeholder = CU('homeNotesPh');
  if (!isWorkerEntry()) {
    set('authFullNameLbl', CU('lblFullName')); set('authPhoneLbl', CU('lblPhone'));
    set('lblEmailW', CU('lblEmail')); set('lblPasswordW', CU('lblPassword'));
    set('serviceAddressLbl', CU('saLabel'));
    setH('zipLbl', CU('zipLblHtml')); set('homeTypeLbl', CU('homeTypeLbl')); set('yardSizeLbl', CU('yardSizeLbl')); setH('homeNotesLbl', CU('homeNotesHtml'));
    set('startLbl', CU('startLbl')); set('startNote', CU('startNote'));
    paintPickLabels('aStartPick');
    paintHomeOptionLabels('aHomeType', 'aYardSize');
    paintPlanFreeOptLabel();
    const an = document.getElementById('aName'); if (an) an.placeholder = CU('namePh');
    const as2 = document.getElementById('aServiceAddress'); if (as2) as2.placeholder = CU('addrPh');
    const ms = document.getElementById('membershipServiceAddress'); if (ms) ms.placeholder = CU('addrPh');
    const ahn = document.getElementById('aHomeNotes'); if (ahn) ahn.placeholder = CU('homeNotesPh');
    const fr = document.querySelector('#forgotRow a'); if (fr) fr.textContent = CU('forgotLink');
    paintAuthFace();
  }
  set('resetTitleEl', CU('resetTitle')); set('resetSubEl', CU('resetSub')); set('resetLbl1', CU('resetLbl1')); set('resetLbl2', CU('resetLbl2')); set('resetBtn', CU('resetBtn'));
  const rp1 = document.getElementById('rPass1'); if (rp1) rp1.placeholder = CU('resetPh1');
  const rp2 = document.getElementById('rPass2'); if (rp2) rp2.placeholder = CU('resetPh2');
  if (typeof paintCartStatics === 'function') paintCartStatics();
  wzPaint();
}
function paintPickLabels(pickId){
  document.querySelectorAll('#' + pickId + ' button').forEach(function(b){
    if (b.getAttribute('data-v') === 'asap') b.textContent = CU('startAsap');
    if (b.getAttribute('data-v') === 'date') b.textContent = CU('startDateOpt');
  });
}
// v88: the member picker's FREE option label is painted per language
// (CU planFreeOpt) with the same option-painting mechanism the form's
// other selects use; the five paid options keep their settled labels.
function paintPlanFreeOptLabel(){
  const sel = document.getElementById('aPlanSel');
  if (!sel || !sel.options) return;
  Array.prototype.forEach.call(sel.options, function(o){ if (o.value === 'free') o.textContent = CU('planFreeOpt'); });
}
function paintHomeOptionLabels(typeId, sizeId){
  const paint = function(selId, map){ const sel = document.getElementById(selId); if (!sel || !sel.options) return; Array.prototype.forEach.call(sel.options, function(o){ if (map[o.value]) o.textContent = map[o.value]; }); };
  paint(typeId, { house: CU('optHouse'), townhouse: CU('optTownhouse'), apartment: CU('optApartment'), other: CU('optOther') });
  paint(sizeId, { small: CU('optSmall'), medium: CU('optMedium'), large: CU('optLarge') });
}
function paintCartStatics(){
  const set = function(id, txt){ const el = document.getElementById(id); if (el && txt != null) el.textContent = txt; };
  const setLabel = function(id, txt){ const el = document.getElementById(id); if (!el || txt == null) return; const nodes = el.childNodes || []; for (const n of nodes) { if (n.nodeType === 3) { n.textContent = txt; return; } } };
  set('cartEmptyTxt', CU('cartEmptyTxt')); set('cartBrowseBtn', CU('cartBrowseBtn')); set('cartCheckoutBtn', CU('cartCheckoutBtnTxt')); set('cartClearBtn', CU('cartClearBtnTxt'));
  set('ccTitleEl', CU('ccTitle')); set('ccAcctTitleEl', CU('ccAcctTitle'));
  set('ccStep1El', CU('ccStepOrder')); set('ccStep2El', CU('ccStepDetails')); set('ccStep3El', CU('ccStepPayment'));
  setLabel('ccNameLbl', CU('ccNameLbl')); setLabel('ccEmailLbl', CU('lblEmail')); setLabel('ccPhoneLbl', CU('lblPhone')); setLabel('ccPassLbl', CU('lblPassword'));
  set('ccAcctNote', CU('ccAcctNote'));
  set('ccWhereWhenEl', CU('ccWhereWhen')); setLabel('ccAddrLbl', CU('ccAddrLbl')); setLabel('ccCityLbl', CU('ccCityLbl')); setLabel('ccWhenLbl', CU('ccWhenLbl')); setLabel('ccNotesLbl', CU('ccNotesLbl'));
  set('ccOfferTitleEl', CU('ccOfferTitle')); set('ccOfferBodyEl', CU('ccOfferBody')); set('ccAddMoreBtn', CU('ccAddMore'));
  set('ccPayTitleEl', CU('ccPayTitle')); set('ccPayNoteEl', CU('ccPayNote')); set('ccFootNoteEl', CU('ccFootNote'));
  const cp = document.getElementById('ccPass'); if (cp) cp.placeholder = CU('ccPassPh');
  const ca = document.getElementById('ccAddress'); if (ca) ca.placeholder = CU('wzAddrPh');
  const cw = document.getElementById('ccWhenText'); if (cw) cw.placeholder = CU('ccWhenPh');
  const cn = document.getElementById('ccNotes'); if (cn) cn.placeholder = CU('wzAccessPh');
  document.querySelectorAll('#ccWhenPick button').forEach(function(b){
    if (b.getAttribute('data-w') === 'Today') b.textContent = CU('ccToday');
    if (b.getAttribute('data-w') === 'Tomorrow') b.textContent = CU('ccTomorrow');
  });
}
function wzPaint(){
  const set = function(id, txt){ const el = document.getElementById(id); if (el && txt != null) el.textContent = txt; };
  set('wzReqTitle', CU('wzReqTitle')); set('wzReqIntro', CU('wzReqIntro'));
  set('wzT1', CU('wzNeedTitle')); set('wzT2', CU('wzDetailsTitle')); set('wzT3', CU('wzWhereTitle')); set('wzT4', CU('wzInfoTitle'));
  set('wzDescLbl', CU('wzDescLabel')); set('wzPhotosLbl', CU('wzPhotosLabel')); set('wzEstTypeLbl', CU('wzEstTypeLabel'));
  set('wzEstPhotoBtn', CU('wzEstPhotoBtn')); set('wzEstInPersonBtn', CU('wzEstInPersonBtn')); set('wzEstNote', CU('wzEstNote'));
  set('wzCityLbl', CU('wzCityLabel')); set('wzAddrLbl', CU('wzAddrLabel')); set('wzWhenLbl', CU('wzWhenLabel')); set('wzWhenNote', CU('wzWhenNote'));
  set('wzAccessLbl', CU('wzAccessLabel'));
  set('wzNameLbl', CU('wzNameLabel')); set('wzEmailLbl', CU('wzEmailLabel')); set('wzPhoneLbl', CU('lblPhone'));
  set('wzMemberLbl', CU('wzMemberLabel')); set('wzMemberNoneBtn', CU('wzMemberNone')); set('wzMemberNewBtn', CU('wzMemberNew')); set('wzMemberMemberBtn', CU('wzMemberMember'));
  set('wzBack', CU('wzBack')); set('wzNext', CU('wzNext')); set('cSendBtn', CU('wzSend')); set('cAck', CU('wzAck'));
  set('cFeeTitle', CU('wzFeeTitleInPerson')); set('cFeeDesc', CU('wzFeeDesc'));
  const rd = document.getElementById('rDesc'); if (rd) rd.placeholder = CU('wzDescPh');
  const ra = document.getElementById('rAddr'); if (ra) ra.placeholder = CU('wzAddrPh');
  const rn = document.getElementById('rName'); if (rn) rn.placeholder = CU('wzNamePh');
  const rac = document.getElementById('rAccess'); if (rac) rac.placeholder = CU('wzAccessPh');
  document.querySelectorAll('#cService button[data-cat]').forEach(function(b){ const s = b.querySelector('span'); const v = CU('wzCat_' + b.getAttribute('data-cat')); if (s && v) s.textContent = v; const im = b.querySelector('img'); if (im && v) im.alt = v; }); // v80.19.1: the img alt is painted too — the button shows exactly ONE label, the active language's
}
async function refreshPermCard(){
  const card = document.getElementById('permCard');
  if (!card) return;
  if (!me) { card.style.display = 'none'; return; }
  if (me.role === 'admin') { card.style.display = 'none'; return; } // v80.8: customer-facing panel — never in admin view
  const nPerm = ('Notification' in window) ? Notification.permission : 'unsupported';
  let locState = permLocGranted() ? 'granted' : 'default';
  if (navigator.permissions && navigator.permissions.query) {
    try { const st = await navigator.permissions.query({ name: 'geolocation' }); locState = st.state; if (st.state === 'granted' && !permLocGranted()) { try { localStorage.setItem('ghsLoc', 'on'); } catch(e) {} } } catch(e) {}
  }
  const nBtn = document.getElementById('permNotifBtn'), lBtn = document.getElementById('permLocBtn');
  const nState = document.getElementById('permNotifState'), lState = document.getElementById('permLocState');
  const why = document.getElementById('permWhy');
  if (why) why.textContent = me.role === 'worker' ? WT('permWhyWorker') : WT('permWhyCustomer');
  let missing = false, blocked = false;
  if (nPerm === 'granted') { nState.textContent = WT('stateOnF'); nBtn.style.display = 'none'; }
  else { missing = true; nBtn.style.display = ''; nState.textContent = nPerm === 'denied' ? WT('stateBlockedF') : ''; if (nPerm === 'denied') blocked = true; }
  if (locState === 'granted') { lState.textContent = WT('stateOn'); lBtn.style.display = 'none'; }
  else { missing = true; lBtn.style.display = ''; lState.textContent = locState === 'denied' ? WT('stateBlocked') : ''; if (locState === 'denied') blocked = true; }
  const help = document.getElementById('permHelp');
  if (help) help.style.display = blocked ? 'block' : 'none';
  card.style.display = missing ? 'block' : 'none';
}
async function activarNotifs(){
  armSound();
  if (!('Notification' in window)) { showInfo(WT('noNotifSupport')); return; }
  let r = 'default';
  try { r = await Notification.requestPermission(); } catch(e) {}
  if (r === 'granted') { playHammer(); showInfo(WT('notifDone')); subscribePush(); }
  refreshPermCard();
}
// ---------- Web Push subscription (v66) ----------
// Once notification permission is granted, register this device for real
// push (alerts arrive with the app closed). Runs at most once per page
// session, plus right after the permission is granted from the card.
let pushSubTried = false;
function urlB64ToUint8Array(s){ const pad = '='.repeat((4 - (s.length % 4)) % 4); const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(b); const arr = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i); return arr; }
async function subscribePush(){
  try {
    if (!me || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const kr = await api('/api/push/key');
      if (!kr || !kr.publicKey) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(kr.publicKey) });
    }
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
  } catch(e) {}
}
function maybeSubscribePush(){ if (pushSubTried) return; pushSubTried = true; subscribePush(); }
function activarUbicacion(){
  if (!navigator.geolocation) { showInfo(WT('noLocSupport')); return; }
  navigator.geolocation.getCurrentPosition(function(pos){ try { localStorage.setItem('ghsLoc', 'on'); } catch(e) {}
    // v80.16: record the opt-in (and this fix as the last known
    // position) on the ACCOUNT — a browser-local flag alone did not
    // survive to the next login (the re-grant-at-every-login bug).
    if (me && me.role === 'worker') {
      try { api('/api/me/location/opt-in', { method: 'POST', body: JSON.stringify({ optedIn: true }) }).catch(function(){}); } catch(e) {}
      if (pos && pos.coords) { try { api('/api/me/location', { method: 'POST', body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }).catch(function(){}); } catch(e) {} }
    }
    showInfo(WT('locDone')); refreshPermCard(); }, function(){ showInfo(WT('locFail')); refreshPermCard(); }, { timeout: 10000 });
}
const sndSeen = { workerOpen: null, custStatus: null, adminReqs: null, yardVisits: null };
function sndWorkerJobs(jobs){
  const open = {}; (jobs || []).forEach(function(j){ if (j.status === 'Open') open[j.id] = 1; });
  if (sndSeen.workerOpen === null) { sndSeen.workerOpen = open; return; }
  for (const idv in open) if (!sndSeen.workerOpen[idv]) { playChime(); break; }
  sndSeen.workerOpen = open;
}
function sndCustomerJobs(jobs){
  const map = {}; (jobs || []).forEach(function(j){ map[j.id] = j.status; });
  if (sndSeen.custStatus === null) { sndSeen.custStatus = map; return; }
  let changed = false;
  for (const idv in map) if (sndSeen.custStatus[idv] !== undefined && sndSeen.custStatus[idv] !== map[idv]) changed = true;
  if (changed) playChime();
  sndSeen.custStatus = map;
}
function sndAdminRequests(reqs){
  const set = {}; (reqs || []).forEach(function(r){ set[r.id] = 1; });
  if (sndSeen.adminReqs === null) { sndSeen.adminReqs = set; return; }
  for (const idv in set) if (!sndSeen.adminReqs[idv]) { playChime(); break; }
  sndSeen.adminReqs = set;
}
// ---------- Live event stream (added 2026-10-21, v23) ----------
// SSE replaces poll-as-primary: the server pushes job.location /
// job.status / job.new / request.new the moment they happen, scoped to
// exactly what this account may see. The manager connects once the user
// is known, reconnects with backoff on error, and feeds the SAME chime
// bookkeeping as the render-diff watchers (events mark items as seen
// before refreshing, so a transition chimes exactly once across both
// paths; nothing chimes before the first list load sets the baseline).
// The 20s tracking poll survives only as a silent fallback while the
// stream is down (see updateLivePoll).
let esStream = null, esConnected = false, esBackoffMs = 1000, esRetryTimer = null;
function esStart(){
  if (!me || esStream || typeof EventSource === 'undefined') return;
  let es;
  try { es = new EventSource('/api/events'); } catch(e) { esScheduleRetry(); return; }
  esStream = es;
  es.onopen = function(){ esConnected = true; esBackoffMs = 1000; updateLivePoll(trackJobsCache); };
  es.onerror = function(){ esConnected = false; updateLivePoll(trackJobsCache); esClose(); esScheduleRetry(); };
  es.addEventListener('job.location', function(ev){ try { onEsJobLocation(JSON.parse(ev.data)); } catch(e) {} });
  es.addEventListener('job.status', function(ev){ try { onEsJobStatus(JSON.parse(ev.data)); } catch(e) {} });
  es.addEventListener('job.new', function(ev){ try { onEsJobNew(JSON.parse(ev.data)); } catch(e) {} });
  es.addEventListener('request.new', function(ev){ try { onEsRequestNew(JSON.parse(ev.data)); } catch(e) {} });
  es.addEventListener('yard.assigned', function(ev){ try { onEsYardAssigned(JSON.parse(ev.data)); } catch(e) {} });
}
function esClose(){
  if (esStream) { try { esStream.close(); } catch(e) {} esStream = null; }
  esConnected = false;
}
function esScheduleRetry(){
  if (esRetryTimer || !me) return;
  esRetryTimer = setTimeout(function(){ esRetryTimer = null; esStart(); }, esBackoffMs);
  esBackoffMs = Math.min(30000, esBackoffMs * 2);
}
function onEsJobLocation(d){
  if (!d || !d.jobId) return;
  if (d.stopped) { // sharing ended mid-route — refresh so the map block goes away
    if (me && me.role === 'admin') loadAdmin(); else if (me && me.role === 'customer') loadMyJobs();
    return;
  }
  const entry = trackMaps[d.jobId];
  if (entry && entry.tech && entry.tech.setLatLng) { try { entry.tech.setLatLng([d.lat, d.lng]); } catch(e) {} }
  const u = document.getElementById('trkupd-' + d.jobId);
  if (u) u.textContent = 'updated ' + agoText(d.updatedAt);
  // Keep the cached point fresh so a later re-render doesn't rewind the marker.
  trackJobsCache.forEach(function(j){ if (j.id === d.jobId) j.liveLoc = { lat: d.lat, lng: d.lng, updatedAt: d.updatedAt }; });
}
function onEsJobStatus(d){
  if (!d || !d.jobId || !me) return;
  if (me.role === 'customer') {
    if (sndSeen.custStatus && sndSeen.custStatus[d.jobId] !== undefined && sndSeen.custStatus[d.jobId] !== d.status) playChime();
    if (sndSeen.custStatus) sndSeen.custStatus[d.jobId] = d.status;
    loadMyJobs();
  } else if (me.role === 'worker') {
    loadJobs();
  } else if (me.role === 'admin') {
    loadAdmin();
  }
}
function onEsJobNew(d){
  if (!d || !d.jobId || !me) return;
  if (me.role === 'worker') {
    if (sndSeen.workerOpen && !sndSeen.workerOpen[d.jobId]) playChime();
    if (sndSeen.workerOpen) sndSeen.workerOpen[d.jobId] = 1;
    loadJobs();
  } else if (me.role === 'admin') {
    loadAdmin();
  }
}
function onEsRequestNew(d){
  if (!d || !d.requestId || !me || me.role !== 'admin') return;
  if (sndSeen.adminReqs && !sndSeen.adminReqs[d.requestId]) playChime();
  if (sndSeen.adminReqs) sndSeen.adminReqs[d.requestId] = 1;
  loadAdmin();
}
function onEsYardAssigned(d){
  if (!d || !d.visitId || !me) return;
  if (me.role === 'worker') {
    if (sndSeen.yardVisits && !sndSeen.yardVisits[d.visitId]) playChime();
    if (sndSeen.yardVisits) sndSeen.yardVisits[d.visitId] = 1;
    loadWorkerYardVisits();
  } else if (me.role === 'admin' && isYardCalendarRoute()) {
    loadYardCalendar();
  }
}
// ---------- Live technician tracking (added 2026-10-21, v22) ----------
// Worker side: tapping "On my way" starts a geolocation watch for THAT
// job; positions post to /api/jobs/:id/location and the server keeps only
// the latest point. Sharing stops on Arrived (the server wipes the point
// on any non-en-route status), on "Mark done", or via the Stop button.
// v23: posts are throttled (max 1 per 5s, only after moving >=15 m or
// 30s elapsed), a Screen Wake Lock keeps the phone awake during the
// trip, and coming back to the app auto-resumes a stale share. Platform
// truth, unchanged: a web app cannot track while fully closed — if the
// worker closes/swipes the app away the watch dies, and the job card
// offers "Resume location sharing" when they come back.
let trackWatch = null; // { jobId, watchId, postLat, postLng, postAt, fixLat, fixLng, fixAt }
let trackWakeLock = null;
function showTrackBanner(jobId, note){
  const b = document.getElementById('trackBanner'); if (!b) return;
  if (!jobId) { b.style.display = 'none'; b.innerHTML = ''; return; }
  b.style.display = 'block';
  b.innerHTML = WT('trackBanner').replace('{id}', escHtml(jobId)) + (note ? '<br><span style="font-weight:400">' + escHtml(note) + '</span>' : '');
}
function trackDistM(lat1, lng1, lat2, lng2){
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
// Post at most once per 5 seconds, and only when the phone actually
// moved (>=15 m from the last POSTED point) or 30 s went by — a smooth
// track for the customer without burning the worker's data.
function trackShouldPost(st, lat, lng, now){
  if (!st || !st.postAt || st.postLat == null || st.postLng == null) return true;
  const elapsed = now - st.postAt;
  if (elapsed < 5000) return false;
  if (trackDistM(st.postLat, st.postLng, lat, lng) >= 15) return true;
  return elapsed >= 30000;
}
function postTrackPosition(st, lat, lng){
  st.postLat = lat; st.postLng = lng; st.postAt = Date.now();
  return api('/api/jobs/' + st.jobId + '/location', { method: 'POST', body: JSON.stringify({ lat: lat, lng: lng }) }).catch(function(){});
}
async function acquireTrackWakeLock(jobId){
  try {
    if (!navigator.wakeLock || !navigator.wakeLock.request || trackWakeLock) return;
    const wl = await navigator.wakeLock.request('screen');
    // If sharing ended (or moved to another job) while the request was
    // in flight, don't hold the screen awake for nothing.
    if (!trackWatch || trackWatch.jobId !== jobId) { try { wl.release(); } catch(e) {} return; }
    trackWakeLock = wl;
    if (wl.addEventListener) wl.addEventListener('release', function(){ if (trackWakeLock === wl) trackWakeLock = null; });
  } catch(e) { /* wake lock is best-effort — guarded everywhere, never throws */ }
}
function releaseTrackWakeLock(){
  const wl = trackWakeLock; trackWakeLock = null;
  if (wl && wl.release) { try { const pr = wl.release(); if (pr && pr.catch) pr.catch(function(){}); } catch(e) {} }
}
function stopWatchOnly(){
  if (trackWatch && trackWatch.watchId != null && navigator.geolocation) { try { navigator.geolocation.clearWatch(trackWatch.watchId); } catch(e) {} }
  trackWatch = null;
  releaseTrackWakeLock();
  showTrackBanner(null);
}
function startSharing(idv){
  stopWatchOnly();
  if (!navigator.geolocation || !navigator.geolocation.watchPosition) { showTrackBanner(idv, WT('trackNoLoc')); return; }
  const st = { jobId: idv, watchId: null, postLat: null, postLng: null, postAt: 0, fixLat: null, fixLng: null, fixAt: 0 };
  trackWatch = st;
  try {
    st.watchId = navigator.geolocation.watchPosition(function(pos){
      if (!trackWatch || trackWatch.jobId !== idv || !pos || !pos.coords) return;
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      st.fixLat = lat; st.fixLng = lng; st.fixAt = Date.now();
      if (trackShouldPost(st, lat, lng, Date.now())) postTrackPosition(st, lat, lng);
    }, function(){
      showTrackBanner(idv, WT('trackLocOff'));
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  } catch(e) {}
  acquireTrackWakeLock(idv);
  showTrackBanner(idv);
}
// Foreground resume: when the app comes back to visible while still en
// route, re-acquire the wake lock and — if the last posted point is
// stale (>30 s) — push a fresh fix immediately (restarting a dead watch
// if there is one). No tap required; the manual "Resume location
// sharing" button stays as the backup.
function resumeSharing(){
  if (!trackWatch) return;
  const st = trackWatch;
  acquireTrackWakeLock(st.jobId);
  const stale = !st.postAt || (Date.now() - st.postAt > 30000);
  if (!stale) return;
  if (st.watchId == null) { startSharing(st.jobId); return; }
  if (navigator.geolocation && navigator.geolocation.getCurrentPosition) {
    try {
      navigator.geolocation.getCurrentPosition(function(pos){
        if (!trackWatch || trackWatch.jobId !== st.jobId || !pos || !pos.coords) return;
        postTrackPosition(st, pos.coords.latitude, pos.coords.longitude);
      }, function(){}, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    } catch(e) {}
  }
}
if (document && document.addEventListener) document.addEventListener('visibilitychange', function(){
  if (document.visibilityState !== 'visible') return;
  if (trackWatch) resumeSharing();
});
async function stopSharing(idv){
  stopWatchOnly();
  try { await api('/api/jobs/' + idv + '/location/stop', { method: 'POST', body: JSON.stringify({}) }); } catch(e) {}
  loadJobs();
}
// Gabriel's rule: starting a trip REQUIRES the worker's live location.
// Tapping "On my way" first asks the phone for a fix; if permission is
// denied or location is unavailable, the bilingual notice shows and the
// status is NEVER set — no silent un-shared trip.
function requireTripLocation(){
  return new Promise(function(resolve){
    const deny = function(){ alert(WT('tripLocRequired')); resolve(false); };
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.geolocation.getCurrentPosition) { deny(); return; }
    try { navigator.geolocation.getCurrentPosition(function(){ resolve(true); }, deny, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }); }
    catch(e) { deny(); }
  });
}
async function setJobStatus(idv, status){
  try {
    if (status === 'On my way') { const ok = await requireTripLocation(); if (!ok) return; }
    await api('/api/jobs/' + idv, { method: 'PATCH', body: JSON.stringify({ status: status }) });
    if (status === 'On my way') startSharing(idv);
    if (status === 'Arrived' && trackWatch && trackWatch.jobId === idv) stopWatchOnly();
    loadJobs();
  } catch(e) { alert(e.message); }
}
// ---------- Duty location sharing (v41) ----------
// Gabriel's rule: a worker shares his location WHILE LOGGED IN to the
// app — not only during a trip — because the Team dispatches from it.
// The feed runs only while the app is open on his phone, only for
// ACTIVE workers, and stops when he is PAUSED (off duty) or logs out
// (the server clears his point on logout; points older than ~10 min
// read as offline on the admin master map). If permission is denied or
// unavailable, the requirement notice stays in his panel and we NEVER
// fake a position — he can still view jobs per the normal rules, his
// pin simply does not exist.
let dutyWatch = null; // { watchId, postLat, postLng, postAt }
let dutyState = 'off'; // off | on | denied | unavailable | paused
function paintWorkerLocLine(){
  const el = document.getElementById('workerLocLine'); if (!el) return;
  if (!me || me.role !== 'worker') { el.innerHTML = ''; return; }
  if (dutyState === 'on') el.innerHTML = '<span class="pill">' + WT('locLineOn') + '</span>';
  else if (dutyState === 'paused') el.innerHTML = '<span class="pill">' + WT('locLinePaused') + '</span>';
  else if (dutyState === 'denied' || dutyState === 'unavailable') el.innerHTML = '<div class="card" style="border:1.5px solid #e42535;background:#2a0d10"><b>📍 ' + WT('locLineMustTitle') + '</b><br><span class="mut">' + WT('locLineMustBody') + '</span></div>';
  else el.innerHTML = '';
}
function postDutyPosition(lat, lng){
  return api('/api/me/location', { method: 'POST', body: JSON.stringify({ lat: lat, lng: lng }) }).catch(function(){});
}
function initDutySharing(){
  if (!me || me.role !== 'worker' || me.status !== 'active') { stopDutySharing(); return; }
  const av = me.availability || {};
  if (av.paused) {
    const was = dutyState;
    stopDutySharing();
    dutyState = 'paused';
    if (was === 'on') api('/api/me/location', { method: 'POST', body: JSON.stringify({ clear: true }) }).catch(function(){});
    paintWorkerLocLine();
    return;
  }
  if (dutyWatch) { paintWorkerLocLine(); return; } // already running
  if (dutyState === 'denied') { paintWorkerLocLine(); return; } // don't re-prompt on every render
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.geolocation.watchPosition) { dutyState = 'unavailable'; paintWorkerLocLine(); return; }
  const st = { watchId: null, postLat: null, postLng: null, postAt: 0 };
  dutyWatch = st;
  try {
    st.watchId = navigator.geolocation.watchPosition(function(pos){
      if (dutyWatch !== st || !pos || !pos.coords) return;
      if (dutyState !== 'on') { dutyState = 'on'; paintWorkerLocLine(); }
      const lat = pos.coords.latitude, lng = pos.coords.longitude, now = Date.now();
      if (!st.postAt || now - st.postAt >= 30000 || trackDistM(st.postLat, st.postLng, lat, lng) >= 25) { st.postLat = lat; st.postLng = lng; st.postAt = now; postDutyPosition(lat, lng); }
    }, function(){
      if (dutyWatch === st) { dutyWatch = null; dutyState = 'denied'; paintWorkerLocLine(); }
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  } catch(e) { dutyWatch = null; dutyState = 'unavailable'; }
  paintWorkerLocLine();
}
function stopDutySharing(){
  if (dutyWatch && dutyWatch.watchId != null && typeof navigator !== 'undefined' && navigator.geolocation) { try { navigator.geolocation.clearWatch(dutyWatch.watchId); } catch(e) {} }
  dutyWatch = null;
  if (dutyState === 'on') dutyState = 'off';
  paintWorkerLocLine();
}
function workerJobBtns(j){
  if (j.status === 'Open') return '<button class="wact" onclick="claimJob(\'' + j.id + '\')">' + WT('pickJob') + '</button>';
  if (!j.mine) return '';
  let h = '';
  if (j.status === 'Claimed') h += '<button class="black wact" onclick="setJobStatus(\'' + j.id + '\',\'On my way\')">' + WT('onMyWay') + '</button> ';
  if (j.status === 'On my way') {
    h += '<button class="black wact" onclick="setJobStatus(\'' + j.id + '\',\'Arrived\')">' + WT('arrived') + '</button> ';
    if (trackWatch && trackWatch.jobId === j.id) h += '<span class="pill">' + WT('sharingLoc') + '</span> <button class="ghost wact" onclick="stopSharing(\'' + j.id + '\')">' + WT('stopSharing') + '</button> ';
    else h += '<button class="ghost wact" onclick="startSharing(\'' + j.id + '\')">' + WT('resumeSharing') + '</button> ';
  }
  if (!j.photosReceived) h += '<button class="black wact" onclick="doneJob(\'' + j.id + '\')">' + WT('markDone') + '</button>';
  return h;
}
// Customer/admin side: the live map block inside a job card. The customer
// can SEE the technician coming — there is deliberately no way to contact
// the technician from here (all contact runs through the Team chat).
const trackMaps = {}; // jobId -> { map, tech }
let liveSig = '';
let livePollTimer = null;
let trackJobsCache = []; // last job list that fed initTrackMaps (v23: stream + poll share it)
function agoText(iso){
  if (!iso) return CU('agoNow');
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return CU('agoNow');
  if (s < 90) return CU('agoMin1');
  return CU('agoMinTpl').replace('{n}', Math.round(s / 60));
}
function trackBlockHtml(j, audience){
  if (!j || !j.liveLoc) return '';
  const who = audience === 'admin' ? CU('trkTechAdmin') : CU('trkYourTech');
  return '<div class="trackbox" style="margin-top:10px">'
    + '<div id="trkmap-' + j.id + '" style="height:220px;border-radius:12px;overflow:hidden;background:#17171b"></div>'
    + '<div class="mut" style="margin-top:6px">🔨 <b>' + who + '</b>' + (j.address ? CU('trkHeadingTo') + escHtml(j.address) : '') + ' · <span id="trkupd-' + j.id + '">' + CU('trkUpdated') + agoText(j.liveLoc.updatedAt) + '</span></div></div>';
}
function trackFallbackHtml(j){
  return '<div style="padding:20px 14px;text-align:center">📍<br><b>' + CU('trkYourTech') + '</b>' + (j.address ? '<br><span class="mut">' + CU('trkHeadingTo2') + escHtml(j.address) + '</span>' : '') + '<br><span class="mut">' + CU('trkLocUpdated') + agoText(j.liveLoc.updatedAt) + '</span></div>';
}
// v80.6 TILES: both Leaflet surfaces draw from ONE helper on
// tile.openstreetmap.de — the OSM chapter's keyless tile service,
// built for embedding. Production browsers were served 403 "Access
// blocked" tiles by the main OSM tile host (its usage policy blocks
// unidentified / high-churn embedding, and this app used to re-ask
// for every tile on every admin reload), and CARTO basemaps now
// answer every keyless tile with an "API KEY REQUIRED" placeholder
// image. Curl evidence for all three: V80.6-PARCHE.md.
const GHS_TILE_URL = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
function ghsTileLayer(){ return L.tileLayer(GHS_TILE_URL, { maxZoom: 18, attribution: '© OpenStreetMap contributors' }); }
function pinIcon(txt){ return L.divIcon({ className: 'trk-pin', html: '<div style="font-size:24px;line-height:1">' + txt + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }); }
// Technician pins (v41): OUR tech is identified by the brand — his round
// photo avatar with the red ring and a small hammer badge (the hammer
// is the app logo). With no photo, the fallback is a HAMMER pin: a 🔨
// glyph on a brand-red circle. The glyph (not the icon file) is used so
// the pin renders reliably inside a Leaflet divIcon with no extra fetch.
function photoIcon(photo){
  return L.divIcon({ className: 'trk-pin', html: '<div style="position:relative;width:40px;height:40px"><img src="' + escAttr(photo) + '" alt="" style="width:40px;height:40px;border-radius:50%;border:3px solid #e42535;object-fit:cover;display:block;background:#1b1b1f;box-sizing:border-box;box-shadow:0 1px 6px rgba(0,0,0,.45)"><span style="position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:50%;background:#e42535;color:#fff;font-size:10px;line-height:14px;text-align:center;border:2px solid #fff">🔨</span></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
}
function hammerPinIcon(){
  return L.divIcon({ className: 'trk-pin', html: '<div style="width:36px;height:36px;border-radius:50%;background:#e42535;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);color:#fff;font-size:17px;line-height:29px;text-align:center">🔨</div>', iconSize: [36, 36], iconAnchor: [18, 18] });
}
function techPinIcon(j){ return (j && j.technicianPhoto) ? photoIcon(j.technicianPhoto) : hammerPinIcon(); }
function buildTrackMap(j, box){
  if (!(window.L && L.map)) { box.innerHTML = trackFallbackHtml(j); return; }
  try {
    const map = L.map(box);
    ghsTileLayer().addTo(map);
    const tech = L.marker([j.liveLoc.lat, j.liveLoc.lng], { icon: techPinIcon(j) }).addTo(map);
    const pts = [[j.liveLoc.lat, j.liveLoc.lng]];
    if (j.destLat != null && j.destLng != null) { L.marker([j.destLat, j.destLng], { icon: pinIcon('🏠') }).addTo(map); pts.push([j.destLat, j.destLng]); }
    if (pts.length > 1) map.fitBounds(pts, { padding: [28, 28] }); else map.setView(pts[0], 14);
    trackMaps[j.id] = { map: map, tech: tech };
    // v80.8: same zero-size cure as the master map — a per-job map is
    // built inside a just-painted card whose layout settles late, so
    // re-measure now and once more after the layout lands.
    try { map.invalidateSize(); } catch(e) {}
    setTimeout(function () { try { map.invalidateSize(); } catch(e) {} }, 400);
  } catch(e) { box.innerHTML = trackFallbackHtml(j); }
}
function initTrackMaps(jobs){
  trackJobsCache = jobs || [];
  // v46 ADMIN PERF: rebuilding every Leaflet tracking map on each reload
  // flickered the panel and burned phone CPU even when nothing moved.
  // When the set of live-tracked jobs is unchanged and their maps are
  // still in the DOM, keep them — refreshLiveTracking moves the markers.
  const newSig = (jobs || []).filter(function(j){ return j.liveLoc; }).map(function(j){ return j.id; }).sort().join(',');
  const keep = newSig && newSig === liveSig && newSig.split(',').every(function(jid){ return trackMaps[jid] && document.contains(trackMaps[jid].map.getContainer()); });
  if (!keep) {
    for (const k in trackMaps) { try { trackMaps[k].map.remove(); } catch(e) {} delete trackMaps[k]; }
    (jobs || []).forEach(function(j){
      if (!j.liveLoc) return;
      const box = document.getElementById('trkmap-' + j.id);
      if (box) buildTrackMap(j, box);
    });
  }
  liveSig = newSig;
  updateLivePoll(jobs);
}
function updateLivePoll(jobs){
  // v23: the poll is now ONLY a silent fallback — it runs while a tracked
  // job is on screen AND the event stream is disconnected. While the
  // stream is live, job.location events move the marker immediately.
  const any = (jobs || []).some(function(j){ return j.liveLoc; });
  if (any && !esConnected && !livePollTimer) livePollTimer = setInterval(refreshLiveTracking, 20000);
  if ((!any || esConnected) && livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
}
async function refreshLiveTracking(){
  try {
    const d = await api('/api/jobs');
    const jobs = d.jobs || [];
    const sig = jobs.filter(function(j){ return j.liveLoc; }).map(function(j){ return j.id; }).sort().join(',');
    if (sig !== liveSig) { // a job started or stopped sharing — re-render the visible list
      if (me && me.role === 'admin') loadAdmin(); else if (me && me.role === 'worker') loadJobs(); else loadMyJobs();
      return;
    }
    jobs.forEach(function(j){
      if (!j.liveLoc) return;
      const entry = trackMaps[j.id];
      if (entry && entry.tech && entry.tech.setLatLng) { try { entry.tech.setLatLng([j.liveLoc.lat, j.liveLoc.lng]); } catch(e) {} }
      const u = document.getElementById('trkupd-' + j.id);
      if (u) u.textContent = 'updated ' + agoText(j.liveLoc.updatedAt);
    });
    updateLivePoll(jobs);
  } catch(e) {}
}
async function releaseInfo(idv,on){ if(on && !await appConfirm('Share this job\u2019s ADDRESS and TIME with the assigned worker? The customer phone and name are never shared.')) return; try{ await api('/api/jobs/'+idv,{method:'PATCH', body:JSON.stringify({infoReleased:on})}); loadAdminJobs(); }catch(e){ alert(e.message); } }
// ---------- Estimate authorization holds (2026-10-20) ----------
function holdsOf(r){ return Array.isArray(r.holds) ? r.holds : []; }
function holdsPoolCents(r){ return holdsOf(r).filter(function(h){ return h.status==='authorized'; }).reduce(function(s,h){ return s+(Number(h.authorizedCents)||0); },0); }
function holdTargetCents(r){ return r && r.estimate ? Math.round(((Number(r.estimate.total)||0)+(Number(r.estimate.credit)||0))*100) : 0; }
function holdStatusHtml(r){
  const holds=holdsOf(r);
  if(!holds.length) return '';
  const parts=holds.map(function(h){
    const st=h.status==='authorized'?CU('holdOnHold'):(h.status==='captured'?CU('holdCharged')+moneyFmt((h.capturedCents||0)/100):h.status);
    return escHtml(h.key)+CU('holdWord')+moneyFmt((h.authorizedCents||0)/100)+' — '+st+(h.captureBefore&&h.status==='authorized'?CU('holdValidUntil')+escHtml(String(h.captureBefore).slice(0,10)):'');
  });
  return '<div class="pay-panel"><b>'+CU('holdTitle')+'</b> '+parts.join('<br>')+'<br><span class="mut">'+CU('holdExplainer')+'</span></div>';
}
// v80.22 ORDEN HONESTA (audit P0-4): the customer's order card speaks
// the TRUE payment state. A deposit is a deposit — booked, balance
// due — and NEVER renders as "refunded" (the old inline panel mapped
// every non-paid status onto the refunded words, so most menu orders
// told their owner the money had been sent back). Only a real refund
// earns the refunded words; only a settled full payment earns "Paid
// in full". A deposit-state menu order also gets its one-tap balance
// payment right here — the v44 /api/orders/pay rail has existed all
// along; this is its first customer UI.
function reqPayPanelHtml(r){
  if(!r || !r.payment) return '';
  const p=r.payment;
  let main='';
  if(p.status==='paid') main=CU('payPaidFull')+moneyFmt((p.amountCents||0)/100);
  else if(p.status==='deposit'){
    const tot=(Number(p.totalCents)||0) || ((Number(p.amountCents)||0)+(Number(p.balanceCents)||0));
    main=CU('payDepositTpl').replace('{dep}', moneyFmt((p.amountCents||0)/100)).replace('{total}', moneyFmt(tot/100)).replace('{bal}', moneyFmt((p.balanceCents||0)/100));
  }
  else if(p.status==='partially_refunded') main=CU('payPartialRefPre')+moneyFmt((p.amountCents||0)/100)+CU('payPartialRefSuf');
  else if(p.status==='refunded') main=CU('payRefunded');
  else return '';
  let h='<div class="pay-panel"><b>💳 '+main+'</b>';
  if(r.refund) h+='<br><span class="mut">'+CU('refundIssued')+moneyFmt((r.refund.refundedCents||0)/100)+(r.refund.keptFeeCents?' • '+moneyFmt(r.refund.keptFeeCents/100)+CU('refundKeptFee'):'')+'</span>';
  h+='</div>';
  if(p.status==='deposit' && r.estimateType==='menu' && (Number(p.balanceCents)||0)>0 && !r.refund){
    const bal=moneyFmt((p.balanceCents||0)/100);
    h+='<div style="margin-top:8px"><button class="black" onclick="reqPayBalanceStart(\''+r.id+'\')">'+CU('payBalanceBtnTpl').replace('{amt}', bal)+'</button>'
      +'<div id="reqPay-'+r.id+'" style="display:none;margin-top:8px"><div id="reqCard-'+r.id+'" style="border:1px solid var(--line);border-radius:10px;padding:10px;background:#17171b"></div>'
      +'<div style="margin-top:8px"><button class="black" id="reqPayGo-'+r.id+'" onclick="reqPayBalanceConfirm(\''+r.id+'\')">'+CU('payBalanceBtnTpl').replace('{amt}', bal)+'</button> <span class="mut" id="reqPayMsg-'+r.id+'"></span></div></div></div>';
  }
  return h;
}
// The balance retry: /api/orders/pay opens the intent for THIS order's
// outstanding balance only, the card confirms in place, and
// /api/orders/pay-confirm re-verifies the PaymentIntent server-side
// before anything settles. A declined card changes NOTHING — the
// deposit state and this pay box stay exactly as they were.
const reqPayEls={};
async function reqPayBalanceStart(idv){
  const box=document.getElementById('reqPay-'+idv); if(!box) return;
  if(box.style.display!=='none'){ box.style.display='none'; return; }
  box.style.display='block';
  if(reqPayEls[idv]) return;
  const msg=document.getElementById('reqPayMsg-'+idv);
  try{
    if(msg) msg.textContent=CU('procGen');
    const d=await api('/api/orders/pay',{method:'POST', body:JSON.stringify({requestId:idv})});
    const st=await cartEnsureStripe();
    if(st!=='ready'||!stripeObj) throw new Error(CU('payNotConnected'));
    const cel=stripeObj.elements().create('card',{style:{base:{fontSize:'16px',color:'#f2f0ec',iconColor:'#9a968f','::placeholder':{color:'#8f8a81'}}}});
    cel.mount('#reqCard-'+idv);
    reqPayEls[idv]={el:cel, secret:d.clientSecret, pi:d.paymentIntentId};
    if(msg) msg.textContent='';
  }catch(e){ if(msg) msg.textContent=e.message; }
}
async function reqPayBalanceConfirm(idv){
  const st=reqPayEls[idv]; if(!st) return;
  const msg=document.getElementById('reqPayMsg-'+idv); const btn=document.getElementById('reqPayGo-'+idv);
  if(btn) btn.disabled=true;
  if(msg) msg.textContent=CU('procPay');
  try{
    const conf=await stripeObj.confirmCardPayment(st.secret,{payment_method:{card:st.el, billing_details:{name:(me&&me.name)||'', email:(me&&me.email)||''}}});
    if(conf.error) throw new Error(conf.error.message);
    await api('/api/orders/pay-confirm',{method:'POST', body:JSON.stringify({requestId:idv, paymentIntentId:(conf.paymentIntent&&conf.paymentIntent.id)||st.pi})});
    delete reqPayEls[idv];
    loadRequests();
  }catch(e){ if(msg) msg.textContent=e.message; if(btn) btn.disabled=false; }
}
async function secureHold(idv){
  try{
    const d=await api('/api/stripe/checkout',{method:'POST', body:JSON.stringify({kind:'estimate-hold', requestId:idv, lang:menuLang()})});
    if(d.url) location.href=d.url; else alert('Could not start the authorization.');
  }catch(e){ alert(e.message); }
}
// ---------- Pay-in-full payments + refunds (v44) ----------
function adminPaymentHtml(r){
  const captured=holdsOf(r).some(function(h){ return h.status==='captured'; });
  let h='';
  if(r.payment){
    // v80.22: the admin card names the TRUE state too — a deposit is
    // not "paid in full" (the old line printed Paid in full for ANY
    // payment record, deposit included).
    const pLbl = r.payment.status==='deposit'
      ? '💳 Deposit: '+moneyFmt((r.payment.amountCents||0)/100)+' of '+moneyFmt((r.payment.totalCents||0)/100)+' — balance '+moneyFmt((r.payment.balanceCents||0)/100)+' due'
      : (r.payment.status==='paid' ? '💳 Paid in full: '+moneyFmt((r.payment.amountCents||0)/100) : '💳 Payment ('+escHtml(r.payment.status||'')+'): '+moneyFmt((r.payment.amountCents||0)/100));
    h+='<div class="pay-panel"><b>'+pLbl+'</b> <span class="mut">('+(r.payment.kind||'card')+' • '+escHtml(String(r.payment.at||'').slice(0,10))+' • status: '+escHtml(r.payment.status)+')</span></div>';
  }
  if(r.refund){
    h+='<div style="margin-top:6px"><b>Refund:</b> '+moneyFmt((r.refund.refundedCents||0)/100)+' refunded'+(r.refund.keptFeeCents?' • '+moneyFmt(r.refund.keptFeeCents/100)+' booking fee kept (was dispatched)':' • full refund (not dispatched)')+' <span class="mut">'+escHtml(String(r.refund.at||'').slice(0,10))+'</span></div>';
  }
  const refundable=!r.refund && ((r.payment&&r.payment.status==='paid')||captured);
  if(refundable){
    h+='<div style="margin-top:8px"><button class="ghost" onclick="refundRequest(\''+r.id+'\')">Cancel order &amp; refund</button> <span class="mut">full refund before dispatch — after dispatch, $75 stays as the booking fee</span></div>';
  }
  return h;
}
async function refundRequest(idv){
  if(!await appConfirm('Cancel this order and refund the customer?\n\nRule: FULL refund if no technician has been dispatched yet. If a technician was already dispatched, $75 stays as a non-refundable booking fee and the rest is refunded.')) return;
  try{
    const d=await api('/api/requests/'+idv+'/refund',{method:'POST', body:JSON.stringify({})});
    alert('Refunded '+moneyFmt(d.refunded)+(d.keptFee?' • kept '+moneyFmt(d.keptFee)+' booking fee (was dispatched)':' • full refund'));
    loadAdminRequests(); loadAdminCarts();
  }catch(e){ alert(e.message); }
}
function adminHoldPanelHtml(r){
  const holds=holdsOf(r);
  const pool=holdsPoolCents(r);
  const target=holdTargetCents(r);
  if(!holds.length && !(r.estimateType==='inperson' && (Number(r.estimateDue)||0)>0)) return '';
  const rows=holds.map(function(h){
    return '<div>'+escHtml(h.key)+' — <b>'+escHtml(h.status)+'</b> &bull; authorized '+moneyFmt((h.authorizedCents||0)/100)+' &bull; captured '+moneyFmt((h.capturedCents||0)/100)+(h.captureBefore?' &bull; hold expires '+escHtml(String(h.captureBefore).slice(0,10)):'')+(h.incremental?' &bull; incremental: '+escHtml(h.incremental):'')+' <span class="mut">('+escHtml(h.pi||'')+')</span></div>';
  }).join('');
  let diff='';
  if(r.estimate){
    if(pool<target) diff='<div style="color:#b26a00"><b>Still to authorize: '+moneyFmt((target-pool)/100)+'</b> <span class="mut">(authorized '+moneyFmt(pool/100)+' of '+moneyFmt(target/100)+' approved total)</span></div>';
    else if(pool>target) diff='<div style="color:#b26a00"><b>Authorized exceeds the total by '+moneyFmt((pool-target)/100)+'</b> <span class="mut">— charge only the final amount; the rest releases.</span></div>';
    else diff='<div style="color:#2fbf71"><b>Authorized pool covers the approved total exactly.</b></div>';
  }
  const visit=holds.find(function(h){ return h.key==='visit' && h.status==='authorized'; });
  const anyActive=holds.some(function(h){ return h.status==='authorized'; });
  const incDisabled=!visit || visit.incremental==='unavailable';
  return '<div style="margin-top:10px;border:1px solid #6b5518;background:#221a05;border-radius:10px;padding:10px">'
    +'<b>💳 Authorization holds — YOU control the money</b> <span class="mut">Nothing is ever charged automatically. You decide the amount and the moment.</span>'
    +(rows||'<div class="mut">No holds yet — the customer authorizes the estimate fee from their request card or the estimate page.</div>')
    +diff
    +(r.holdSync?'<div class="mut">After approval: '+escHtml(r.holdSync.state)+' &bull; target '+moneyFmt((r.holdSync.targetCents||0)/100)+(r.holdSync.error?' &bull; '+escHtml(r.holdSync.error):'')+'</div>':'')
    +'<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px">'
    +'<button class="black" '+(anyActive?'':'disabled')+' onclick="holdCapture(\''+r.id+'\','+(target||pool)+')">Charge now — you pick the amount &amp; when</button>'
    +'<button class="ghost" '+(incDisabled?'disabled':'')+' onclick="holdIncrement(\''+r.id+'\','+target+')">Increment authorization</button>'
    +'<button class="ghost" onclick="holdAuthorizeBalance(\''+r.id+'\')">Send balance authorization link</button>'
    +'<button class="ghost" '+(visit?'':'disabled')+' onclick="holdCaptureVisit(\''+r.id+'\','+((visit&&visit.authorizedCents)||0)+')">Capture visit fee only</button>'
    +'<button class="ghost" '+(anyActive?'':'disabled')+' onclick="holdRelease(\''+r.id+'\')">Release hold(s)</button>'
    +'<button class="ghost" onclick="holdClose(\''+r.id+'\','+pool+')">Close billing</button>'
    +'</div>'
    +(visit&&visit.incremental==='unavailable'?'<div class="mut">This card cannot be incremented — use the balance authorization instead.</div>':'')
    +'<div id="holdMsg-'+r.id+'" class="mut"></div></div>';
}
async function holdAct(idv, action, body){
  const m=document.getElementById('holdMsg-'+idv); if(m) m.textContent='Working…';
  try{ const d=await api('/api/requests/'+idv+'/hold/'+action,{method:'POST', body:JSON.stringify(body||{})}); if(m) m.textContent='Done.'; return d; }
  catch(e){ if(m) m.textContent=e.message; throw e; }
}
// v80.7 fix #21 (audit #21): typed amounts are parsed with the same
// non-numeric stripping adjustCartBalance uses — parseFloat alone
// reads "1,000" as 1, so capturing a typed $1,000 charged $1.00.
function parseMoneyInput(v){ const n=parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g,'')); return isFinite(n) ? Math.round(n*100) : NaN; }
async function holdCapture(idv, defCents){
  const v=await appPrompt('Final amount to charge NOW ($). You decide the amount and the moment — nothing is ever charged automatically.', ((defCents||0)/100).toFixed(2));
  if(v==null) return;
  const cents=parseMoneyInput(v);
  if(!(cents>0)){ alert('Enter an amount over $0.'); return; }
  try{ await holdAct(idv,'capture',{finalCents:cents}); loadAdminRequests(); }catch(e){}
}
async function holdCaptureVisit(idv, visitCents){
  if(!await appConfirm('Charge ONLY the visit fee ('+moneyFmt((visitCents||0)/100)+') from the hold now? Use this when the customer declined the work or did not show up.')) return;
  try{ await holdAct(idv,'capture',{finalCents:visitCents}); loadAdminRequests(); }catch(e){}
}
async function holdIncrement(idv, targetCents){
  const v=await appPrompt('New TOTAL authorization ($):', ((targetCents||0)/100).toFixed(2));
  if(v==null) return;
  const cents=parseMoneyInput(v);
  if(!(cents>0)){ alert('Enter a total over $0.'); return; }
  try{ await holdAct(idv,'increment',{totalCents:cents}); loadAdminRequests(); }catch(e){ alert('Increment failed — send a balance authorization instead. Details are in the panel message.'); }
}
async function holdAuthorizeBalance(idv){
  try{
    const d=await holdAct(idv,'authorize-balance',{});
    if(d && d.url){ const m=document.getElementById('holdMsg-'+idv); if(m) m.innerHTML='Balance authorization link ('+moneyFmt(d.amount)+'): <a href="'+d.url+'" target="_blank" rel="noopener">open checkout</a> — send it to the customer; after approval it also appears on their estimate page.'; }
  }catch(e){}
}
async function holdRelease(idv){
  if(!await appConfirm('Release (cancel) ALL active authorization holds on this request? The customer is NOT charged for the released amounts.')) return;
  try{ await holdAct(idv,'release',{}); loadAdminRequests(); }catch(e){}
}
async function holdClose(idv, poolCents){
  if(poolCents>0 && !await appConfirm('There is still '+moneyFmt(poolCents/100)+' authorized but NOT charged on this request. Close billing anyway? (Closing never charges or releases anything by itself.)')) return;
  try{
    const d=await holdAct(idv,'close',{});
    if(d && d.warning) alert('Billing closed. Warning: '+moneyFmt((d.poolCents||0)/100)+' is still authorized and uncharged on this request.');
    loadAdminRequests();
  }catch(e){}
}
// ---------- Master calendar (admin) ----------
let calY=0, calM=0, calEvents=[], calSel='';
function calInit(){ const d=new Date(); if(!calY){ calY=d.getFullYear(); calM=d.getMonth(); } }
function calKey(){ return calY+'-'+String(calM+1).padStart(2,'0'); }
function calMove(n){ calM+=n; if(calM<0){calM=11;calY--;} if(calM>11){calM=0;calY++;} calSel=''; loadCalendar(); }
function calToday(){ const d=new Date(); calY=d.getFullYear(); calM=d.getMonth(); calSel=''; loadCalendar(); }
async function loadCalendar(){
  calInit();
  try{ const d=await api('/api/admin/calendar?month='+calKey()); calEvents=d.events||[]; }
  catch(e){ calEvents=[]; }
  renderCalendar(); renderCalDay();
}
function escCal(s){ return (''+(s||'')).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtStartDate(s){ const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const parts=String(s||'').split('-'); if (parts.length!==3) return String(s||''); return M[Number(parts[1])-1]+' '+Number(parts[2])+', '+parts[0]; }
function renderCalendar(){
  const title=document.getElementById('calTitle'), grid=document.getElementById('calGrid');
  if(!title||!grid) return;
  const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent=names[calM]+' '+calY;
  const today=new Date(); const tkey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const first=new Date(calY,calM,1); const startDow=first.getDay();
  const days=new Date(calY,calM+1,0).getDate();
  let h=['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(d){return '<div class="cal-dow">'+d+'</div>';}).join('');
  for(let i=0;i<startDow;i++) h+='<div class="cal-day off"></div>';
  for(let d=1;d<=days;d++){
    const key=calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const evs=calEvents.filter(function(e){return e.date===key;});
    const cls='cal-day'+(key===tkey?' today':'')+(key===calSel?' sel':'');
    h+='<div class="'+cls+'" onclick="calSelect(\''+key+'\')"><div class="dn">'+d+'</div>'+
      evs.slice(0,3).map(function(e){
        const c=e.kind==='requested'?'cal-ev req':(e.kind==='scheduled'?'cal-ev sched':'cal-ev');
        return '<div class="'+c+'">'+escCal((e.time?e.time+' ':'')+e.title)+'</div>';
      }).join('')+(evs.length>3?'<div class="mut">+'+(evs.length-3)+' more</div>':'')+'</div>';
  }
  grid.innerHTML=h;
}
function calSelect(key){ calSel=key; renderCalendar(); renderCalDay(); }
function renderCalDay(){
  const el=document.getElementById('calDay'); if(!el) return;
  if(!calSel){ el.innerHTML='<p class="mut" style="margin-top:10px">Tap a day to see its jobs.</p>'; return; }
  const evs=calEvents.filter(function(e){return e.date===calSel;});
  let h='<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><b>'+escCal(calSel)+'</b>';
  h+=evs.length? evs.map(function(e){
    return '<div class="card" style="margin:8px 0;padding:10px"><b>'+escCal(e.title)+'</b> <span class="pill">'+escCal(e.kind)+'</span><br><span class="mut">'+
      escCal((e.time?e.time+' • ':'')+(e.location||''))+(e.customerName?' • '+escCal(e.customerName):'')+(e.workerName?' • '+escCal(e.workerName):'')+(e.status?' • '+escCal(e.status):'')+'</span></div>';
  }).join('') : '<div class="empty"><p class="mut">No jobs this day.</p></div>';
  h+='</div>';
  el.innerHTML=h;
}
// v80.6 (S-1): the calendar's own "Add job" form and its helpers
// (calAddJob / calWorkerOptions / calEnsureWorkers / calWorkerChanged)
// were REMOVED. The form was broken — its inputs reused the customer
// wizard's cService/cCity ids, so getElementById handed calAddJob a
// <div> and its submit died on a TypeError — and it duplicated the
// Create a job panel (same POST /api/jobs, more fields). Create a
// job is the one canonical job creator now.
// ---------- Yard calendar (admin, added 2026-10-21) ----------
// SEPARATE from the master calendar above: this schedules the included
// monthly yard visits of Yard Care / HomeCare Plus members. Visits are NOT
// jobs — nothing here posts to the worker board or the master calendar.
let ycY=0, ycM=0, ycVisits=[], ycMembers=[], ycSel='', ycWorkers=[];
function isYardCalendarRoute(){ return location.hash === '#yard-calendar'; }
function exitYardCalendar(){ if (location.hash) location.hash=''; render(); }
function ycInit(){ const d=new Date(); if(!ycY){ ycY=d.getFullYear(); ycM=d.getMonth(); } }
function ycKey(){ return ycY+'-'+String(ycM+1).padStart(2,'0'); }
function ycMove(n){ ycM+=n; if(ycM<0){ycM=11;ycY--;} if(ycM>11){ycM=0;ycY++;} ycSel=''; loadYardCalendar(); }
function ycToday(){ const d=new Date(); ycY=d.getFullYear(); ycM=d.getMonth(); ycSel=''; loadYardCalendar(); }
// Visits counting toward a member's monthly plan: scheduled + done (a
// cancelled visit frees its slot back up).
function ycMonthCount(visits, userId){ return (visits||[]).filter(function(v){ return v.userId===userId && v.status!=='cancelled'; }).length; }
async function loadYardCalendar(){
  ycInit();
  const lastDay=new Date(ycY, ycM+1, 0).getDate();
  try{ const d=await api('/api/admin/yard-visits?from='+ycKey()+'-01&to='+ycKey()+'-'+String(lastDay).padStart(2,'0')); ycVisits=d.visits||[]; }
  catch(e){ ycVisits=[]; }
  try{ const c=await api('/api/customers'); ycMembers=(c.customers||[]).filter(function(u){ const p=u.membershipPlan||{}; return p.status==='active' && (p.type==='yard'||p.type==='plus'); }); }
  catch(e){ ycMembers=[]; }
  try{ const w=await api('/api/workers'); ycWorkers=(w.workers||[]).filter(function(x){ return x.status==='active'; }); }
  catch(e){ ycWorkers=[]; }
  renderYardCalendar(); renderYcDay();
}
function renderYardCalendar(){
  const title=document.getElementById('ycTitle'), grid=document.getElementById('ycGrid');
  if(!title||!grid) return;
  const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent=names[ycM]+' '+ycY;
  const today=new Date(); const tkey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const first=new Date(ycY,ycM,1); const startDow=first.getDay();
  const days=new Date(ycY,ycM+1,0).getDate();
  let h=['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(d){return '<div class="cal-dow">'+d+'</div>';}).join('');
  for(let i=0;i<startDow;i++) h+='<div class="cal-day off"></div>';
  for(let d=1;d<=days;d++){
    const key=ycY+'-'+String(ycM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const vs=ycVisits.filter(function(v){return v.date===key;});
    const cls='cal-day'+(key===tkey?' today':'')+(key===ycSel?' sel':'');
    h+='<div class="'+cls+'" onclick="ycSelect(\''+key+'\')"><div class="dn">'+d+'</div>'+
      vs.slice(0,3).map(function(v){
        const c=v.status==='done'?'cal-ev done':(v.status==='cancelled'?'cal-ev canc':(v.status==='proposed'?'cal-ev prop':'cal-ev'));
        return '<div class="'+c+'">'+escHtml(v.memberName||'Member')+'</div>';
      }).join('')+(vs.length>3?'<div class="mut">+'+(vs.length-3)+' more</div>':'')+'</div>';
  }
  grid.innerHTML=h;
}
function ycSelect(key){ ycSel=key; renderYardCalendar(); renderYcDay(); }
function renderYcDay(){
  const el=document.getElementById('ycDay'); if(!el) return;
  if(!ycSel){ el.innerHTML='<p class="mut" style="margin-top:10px">Tap a day to see its yard visits and add one.</p>'; return; }
  const vs=ycVisits.filter(function(v){return v.date===ycSel;});
  let h='<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><b>'+escCal(ycSel)+'</b>';
  h+=vs.length? vs.map(function(v){
    const plan=v.plan?escHtml(v.plan.name)+' • '+v.plan.visitsPerMonth+' visit'+(v.plan.visitsPerMonth===1?'':'s')+'/mo':'';
    return '<div class="card" style="margin:8px 0;padding:10px"><b>'+escHtml(v.memberName||'Member')+'</b> <span class="pill">'+escHtml(v.status)+'</span><br><span class="mut">'+
      plan+(v.serviceAddress?' • '+escHtml(v.serviceAddress):' • no service address on file')+(v.yardSize?' • '+escHtml(v.yardSize)+' yard':'')+(v.homeNotes?' • Home notes: '+escHtml(v.homeNotes):'')+(v.notes?' • '+escHtml(v.notes):'')+'</span>'+
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
      (v.status!=='done'&&v.status!=='cancelled'?'<button class="ghost" onclick="ycPatchVisit(\''+v.id+'\',{status:\'done\'})">Mark done</button>':'')+
      (v.status==='proposed'?'<button class="ghost" onclick="ycPatchVisit(\''+v.id+'\',{status:\'scheduled\'})">Confirm proposal</button>':'')+
      (v.status!=='cancelled'?'<button class="ghost" onclick="ycPatchVisit(\''+v.id+'\',{status:\'cancelled\'})">Cancel visit</button>':'<button class="ghost" onclick="ycPatchVisit(\''+v.id+'\',{status:\'scheduled\'})">Restore</button>')+
      '<input type="date" id="yc-date-'+v.id+'" value="'+escCal(v.date)+'" style="width:auto;margin:0"><button class="ghost" onclick="ycReschedule(\''+v.id+'\')">Reschedule</button>'+
      '<button class="ghost" onclick="ycDeleteVisit(\''+v.id+'\')">Delete</button></div>'+
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
      (v.assignedWorkerId?'<span class="pill">Worker: '+escHtml(v.assignedWorkerName||'')+'</span>':'<span class="mut">No worker assigned</span>')+
      (v.status!=='done'&&v.status!=='cancelled'?'<select id="ycWorker-'+v.id+'" style="width:auto;margin:0"><option value="">— unassigned —</option>'+ycWorkers.map(function(w){ return '<option value="'+w.id+'"'+(v.assignedWorkerId===w.id?' selected':'')+'>'+escHtml(w.name)+'</option>'; }).join('')+'</select><button class="ghost" onclick="ycAssignVisit(\''+v.id+'\')">Assign</button>':'')+
      '</div>'+
      (v.source==='auto'?'<div class="mut" style="margin-top:4px">Auto-generated from the membership'+(v.planKey?' ('+escHtml(v.planKey)+(v.period?' • '+escHtml(v.period):'')+')':'')+' — confirm the date with the member.</div>':'')+
      (v.plan&&v.plan.status!=='active'?'<div style="margin-top:4px;color:#b26a00"><b>⚠ Membership '+escHtml(v.plan.status)+'</b> — this proposal stays here for your review.</div>':'')+
      (v.rescheduleAsk?'<div style="margin-top:4px;color:#b26a00"><b>⚠ Member asked to move this visit to '+escHtml(v.rescheduleAsk.date)+'</b>'+(v.rescheduleAsk.note?' — '+escHtml(v.rescheduleAsk.note):'')+' · Reschedule above to answer it.</div>':'')+
      ((v.beforePhoto||v.afterPhoto)?'<div class="photos">'+(v.beforePhoto?'<img class="thumb" src="'+v.beforePhoto+'" alt="Before">':'')+(v.afterPhoto?'<img class="thumb" src="'+v.afterPhoto+'" alt="After">':'')+'</div>':'')+
      (v.status==='done'?'<div class="mut" style="margin-top:4px">Completed '+(v.completedAt?escHtml(v.completedAt.slice(0,10)):'')+(v.workerPay?' • Worker pay: $'+v.workerPay+' (internal)':'')+'</div>':'')+
      '</div>';
  }).join('') : '<div class="empty"><p class="mut">No yard visits this day.</p></div>';
  h+='<h3 style="margin-top:12px">Add visit</h3>';
  if(!ycMembers.length){
    h+='<p class="mut">No active Yard Care / HomeCare Plus members yet.</p>';
  } else {
    h+='<label>Member</label><select id="ycAddMember" onchange="ycAddMemberChanged()">'+ycMembers.map(function(u){
      const p=u.membershipPlan||{}; const c=ycMonthCount(ycVisits, u.id);
      const over=c>=(p.visitsPerMonth||0);
      return '<option value="'+u.id+'">'+escHtml(u.name)+' — '+escHtml(p.name||'Plan')+' ('+(p.visitsPerMonth||0)+' visit'+(p.visitsPerMonth===1?'':'s')+'/mo) • '+c+'/'+(p.visitsPerMonth||0)+' scheduled this month'+(over?' — OVER PLAN if added':'')+'</option>';
    }).join('')+'</select><div id="ycAddWarn" class="yc-over" style="display:none;margin:2px 0 6px"></div><div id="ycMemberInfo" class="mut" style="display:none;margin:2px 0 6px"></div>'+
    '<div class="row"><div><label>Date</label><input id="ycAddDate" type="date" value="'+escCal(ycSel)+'"></div><div><label>Notes (optional)</label><input id="ycAddNotes" placeholder="Gate code, dogs, etc."></div></div>'+
    '<button onclick="ycAddVisit()">Add visit</button> <span id="ycMsg" class="mut"></span>';
  }
  h+='</div>';
  el.innerHTML=h;
  ycAddMemberChanged();
}
function ycAddMemberChanged(){
  const sel=document.getElementById('ycAddMember'), warn=document.getElementById('ycAddWarn');
  if(!sel||!warn) return;
  const u=ycMembers.find(function(x){return x.id===sel.value;});
  const info=document.getElementById('ycMemberInfo');
  if(!u){ warn.style.display='none'; if(info) info.style.display='none'; return; }
  if (info) {
    const lines=[];
    if (u.serviceAddress) lines.push(escHtml(u.serviceAddress));
    const home=[];
    if (u.zipCode) home.push('ZIP '+escHtml(u.zipCode));
    if (u.homeType) home.push(escHtml(u.homeType));
    if (u.yardSize) home.push(escHtml(u.yardSize)+' yard');
    if (home.length) lines.push('Home: '+home.join(' • '));
    if (u.homeNotes) lines.push('Home notes: '+escHtml(u.homeNotes));
    const sp=u.startPreference;
    if (sp) lines.push('Wants to start: '+(sp.type==='date'&&sp.date?fmtStartDate(sp.date):'ASAP'));
    lines.push('Source: '+(u.source?('vía '+escHtml(u.source)):'orgánico'));
    info.innerHTML=lines.join('<br>');
    info.style.display=lines.length?'block':'none';
  }
  const p=u.membershipPlan||{}; const c=ycMonthCount(ycVisits, u.id);
  if(c>=(p.visitsPerMonth||0)){
    warn.textContent='Heads up: '+u.name+' already has '+c+' of '+(p.visitsPerMonth||0)+' plan visits scheduled this month — adding another goes over the plan.';
    warn.style.display='block';
  } else { warn.style.display='none'; }
}
async function ycAddVisit(){
  const msg=document.getElementById('ycMsg');
  const userId=document.getElementById('ycAddMember').value;
  const date=document.getElementById('ycAddDate').value;
  const notes=document.getElementById('ycAddNotes').value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){ msg.textContent='Pick a valid date.'; return; }
  msg.textContent='Adding…';
  try{
    await api('/api/admin/yard-visits',{method:'POST', body:JSON.stringify({userId:userId, date:date, notes:notes})});
    msg.textContent='Added.';
    ycSel=date;
    const parts=date.split('-'); ycY=Number(parts[0]); ycM=Number(parts[1])-1;
    await loadYardCalendar();
  }catch(e){ msg.textContent=e.message; }
}
async function ycPatchVisit(idv, patch){
  try{ await api('/api/admin/yard-visits/'+idv,{method:'PATCH', body:JSON.stringify(patch)}); await loadYardCalendar(); }
  catch(e){ alert(e.message); }
}
async function ycAssignVisit(idv){
  const sel=document.getElementById('ycWorker-'+idv);
  await ycPatchVisit(idv, {assignedWorkerId: sel && sel.value ? sel.value : null});
}
async function ycReschedule(idv){
  const inp=document.getElementById('yc-date-'+idv);
  const date=inp?inp.value:'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){ alert('Pick a valid date.'); return; }
  await ycPatchVisit(idv, {date:date});
  ycSel=date;
  const parts=date.split('-'); ycY=Number(parts[0]); ycM=Number(parts[1])-1;
  await loadYardCalendar();
}
async function ycDeleteVisit(idv){
  if(!await appConfirm('Delete this yard visit? This removes the visit record for good.')) return;
  try{ await api('/api/admin/yard-visits/'+idv,{method:'DELETE'}); await loadYardCalendar(); }
  catch(e){ alert(e.message); }
}
// Customer side: upcoming visits inside the "My membership" card.
// v80.25 P1-2: the same three honest states as every other customer
// list — LOADING while fetching, the yardNone2 line only after a
// SUCCESSFUL empty answer, and an ERROR card with Retry (the old
// silent catch(e){} painted a false "nothing scheduled" on failure).
async function loadMyYardVisits(){
  const el=document.getElementById('myYardVisits'); if(!el) return;
  if(!el.innerHTML) el.innerHTML=listLoadingHtml();
  let d=null;
  try{ d=await api('/api/me/yard-visits'); }catch(e){ el.innerHTML=listErrorHtml('loadMyYardVisits()', CU('yardLoadErr')); return; }
  el.innerHTML = yardCardHtml(d || {});
}
// v80.26 (audit P1-13): the yard card as a real route card — the next
// visit with its date, its status (label + step timeline), the assigned
// technician when there is one, the visit's prep notes, a one-tap
// reschedule/help path, and the last completed visit with its AFTER
// photo as proof. Yard visits carry no time-of-day window in the data
// (date-only records), so the card leads with the date + status.
function yardStatusLabel(st){
  var k = { proposed: 'yardStProposed', scheduled: 'yardStScheduled', assigned: 'yardStAssigned', on_the_way: 'yardStOnWay', arrived: 'yardStArrived', done: 'yardStDone', cancelled: 'yardStCancelled' }[st];
  return k ? CU(k) : (st || '');
}
function yardStepsHtml(st){
  var order = ['scheduled', 'assigned', 'on_the_way', 'arrived', 'done'];
  var idx = order.indexOf(st);
  if (idx < 0) return '';
  var labels = [CU('yardStScheduled'), CU('yardStAssigned'), CU('yardStOnWay'), CU('yardStArrived'), CU('yardStDone')];
  return '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:6px">' + labels.map(function(l, i){
    var sty = i < idx ? 'background:#2fbf71;color:#fff;border-color:#2fbf71' : (i === idx ? 'background:#e42535;color:#fff;border-color:#e42535' : '');
    return '<span class="pill" style="' + sty + '">' + (i < idx ? '✓ ' : '') + escHtml(l) + '</span>';
  }).join('<span style="color:#999">→</span>') + '</div>';
}
function yardAskHtml(v){
  var h = '';
  if (v.rescheduleAsk && v.rescheduleAsk.date) {
    h += '<div style="margin-top:8px"><span class="pill">📅 ' + CU('yardAskPendingPre') + escHtml(v.rescheduleAsk.date) + CU('yardAskPendingTail') + '</span> <button class="ghost" onclick="yardAskCancel(\'' + v.id + '\')">' + CU('yardAskCancel') + '</button></div>';
  }
  h += '<div style="margin-top:8px"><button class="ghost" onclick="yardAskToggle(\'' + v.id + '\')">' + CU('yardHelpBtn') + '</button>'
    + '<div id="yardAsk-' + v.id + '" style="display:none;margin-top:8px">'
    + '<label>' + CU('yardAskDateLbl') + '</label><input type="date" id="yardAskDate-' + v.id + '" value="' + escHtml(v.date) + '">'
    + '<label>' + CU('yardAskNoteLbl') + '</label><input id="yardAskNote-' + v.id + '" placeholder="' + CU('yardAskNotePh') + '">'
    + '<div class="mut" style="margin:4px 0">' + CU('yardAskNote') + '</div>'
    + '<button onclick="yardAskSend(\'' + v.id + '\')">' + CU('yardAskSend') + '</button> <span id="yardAskMsg-' + v.id + '" class="mut"></span>'
    + '</div></div>';
  return h;
}
function yardCardHtml(d){
  const today=new Date(); const tkey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const upcoming=(d.visits||[]).filter(function(v){ return ['proposed','scheduled','assigned','on_the_way','arrived'].includes(v.status) && v.date>=tkey; });
  let h='';
  if(!upcoming.length){ h='<span class="mut">' + CU('yardNone2') + '</span>'; }
  else {
    const v=upcoming[0];
    h='<div id="yardcard-' + v.id + '"><b>' + CU('yardNextPre') + escHtml(v.date) + '</b> <span class="pill">' + escHtml(yardStatusLabel(v.status)) + '</span>'
      + yardStepsHtml(v.status)
      + '<div style="margin-top:6px">' + (v.assignedWorkerName ? CU('yardTechPre') + '<b>' + escHtml(v.assignedWorkerName) + '</b>' : '<span class="mut">' + CU('yardTechNone') + '</span>') + '</div>'
      + (v.notes ? '<div class="mut" style="margin-top:4px">' + CU('yardPrepPre') + escHtml(v.notes) + '</div>' : '')
      + yardAskHtml(v)
      + '</div>'
      + (upcoming.length>1 ? '<div class="mut" style="margin-top:6px">' + CU('yardAlso') + upcoming.slice(1,4).map(function(x){ return escHtml(x.date) + ' (' + escHtml(yardStatusLabel(x.status)) + ')'; }).join(' • ') + '</div>' : '');
  }
  // v25 (B1): proof of service — the last completed visit + its AFTER photo.
  if (d.lastCompleted) {
    const lc=d.lastCompleted;
    h+='<div id="yardcard-' + lc.id + '" style="margin-top:8px"><b>' + CU('yardLastDone') + escHtml(lc.date) + '</b> <span class="pill">' + escHtml(yardStatusLabel('done')) + '</span>'
      + (lc.assignedWorkerName ? '<div class="mut" style="margin-top:2px">' + CU('yardTechPre') + escHtml(lc.assignedWorkerName) + '</div>' : '')
      + (lc.afterPhoto ? '<div class="photos"><img class="thumb" src="' + lc.afterPhoto + '" alt="' + CU('yardPhotoAlt') + '"></div>' : '') + '</div>';
  }
  return h;
}
function yardAskToggle(idv){ const p=document.getElementById('yardAsk-'+idv); if(p) p.style.display = p.style.display==='none' ? 'block' : 'none'; }
async function yardAskSend(idv){
  const dateEl=document.getElementById('yardAskDate-'+idv), noteEl=document.getElementById('yardAskNote-'+idv), msg=document.getElementById('yardAskMsg-'+idv);
  const date=dateEl?dateEl.value:'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){ if(msg) msg.textContent=CU('yardAskErr'); return; }
  try{ await api('/api/me/yard-visits/'+idv+'/reschedule',{method:'POST', body:JSON.stringify({date:date, note:noteEl?noteEl.value:''})}); if(msg) msg.textContent=CU('yardAskSent'); loadMyYardVisits(); }
  catch(e){ if(msg) msg.textContent=e.message; }
}
async function yardAskCancel(idv){
  try{ await api('/api/me/yard-visits/'+idv+'/reschedule',{method:'POST', body:JSON.stringify({clear:true})}); loadMyYardVisits(); }
  catch(e){ alert(e.message); }
}
// ---------- Worker yard visits (v25, B1) ----------
// ---------- Captain view: Mi área / My area (v40) ----------
async function loadCaptainArea(){
  const box = document.getElementById('workerCaptain'); if(!box) return;
  try{
    const d = await api('/api/me/captain');
    if(!d.captain){ box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    const ov = d.override || {};
    box.innerHTML = '<h2>' + WT('areaTitle') + ' — ' + escHtml(d.area.name) + '</h2>'
      + '<div class="card"><b>' + WT('captainOf') + ' ' + escHtml(d.area.name) + '</b><br><span class="mut">' + WT('cities') + ' ' + escHtml((d.area.cities || []).join(', ')) + '</span><br>'
      + WT('overridePre') + ' <b>' + capUsd(ov.accrued) + '</b> · ' + WT('overridePaid') + ' ' + capUsd(ov.paidOut)
      + '<br><span class="mut">' + WT('overrideNote') + '</span>'
      + ((ov.entries || []).length ? '<br>' + ov.entries.map(function(e){ return escHtml(e.jobId) + ' — ' + escHtml(e.areaName || '') + ': <b>' + capUsd(e.amount) + '</b> <span class="pill">' + escHtml(e.status) + '</span>'; }).join('<br>') : '')
      + '</div>'
      + '<h3>' + WT('jobsInArea') + '</h3>'
      + ((d.jobs || []).map(function(j){ return '<div class="card"><b>' + escHtml(j.id) + '</b> — ' + escHtml(j.service) + ' <span class="pill">' + escHtml(j.status) + '</span><br><span class="mut">' + escHtml(j.city || '') + (j.when ? ' • ' + escHtml(j.when) : '') + '</span><br>' + WT('technician') + ' ' + (j.technician ? escHtml(j.technician) : '<span class="mut">' + WT('unassigned') + '</span>') + '</div>'; }).join('') || '<p class="mut">' + WT('noJobsArea') + '</p>')
      + '<h3>' + WT('teamInArea') + '</h3>'
      + ((d.team || []).map(function(w){
          // v41: route planning by trade + tools + availability.
          const tops = TRADE_KEYS_CLIENT.map(function(k){ const e = (w.trades || {})[k]; return e && e.effective ? { k: k, lv: e.effective, tools: !!e.tools } : null; }).filter(Boolean).filter(function(x){ return x.lv >= 3; }).sort(function(a, b){ return b.lv - a.lv; });
          const topsLine = tops.length ? '<br>' + tops.map(function(x){ return escHtml(wTradeName(x.k)) + ' ★' + x.lv + (x.tools ? ' 🔧' : ''); }).join(' · ') : '';
          const av = w.availability || {};
          const avLine = '<br><span class="mut">' + (av.paused ? WT('pausedTag') : '') + WT('availabilityWord') + ' ' + escHtml(av.preset || 'anytime') + (av.preset === 'custom' && (av.days || []).length ? ' (' + av.days.join(',') + ')' : '') + '</span>';
          return '<div class="card">' + avatarHtml(w.photo, w.name, 36) + ' <b>' + escHtml(w.name) + '</b><br><span class="mut">' + escHtml(w.city || '') + ((w.skills && w.skills.length) ? ' • ' + escHtml(w.skills.join(', ')) : '') + '</span>' + topsLine + avLine + '</div>';
        }).join('') || '<p class="mut">' + WT('noTeamArea') + '</p>');
  }catch(e){ box.style.display = 'none'; }
}
async function loadWorkerYardVisits(){
  const el=document.getElementById('workerYardVisits'); if(!el || !me || me.role!=='worker') return;
  try{
    const d=await api('/api/worker/yard-visits');
    const visits=d.visits||[];
    const seen={}; visits.forEach(function(v){ seen[v.id]=1; });
    if (sndSeen.yardVisits===null) sndSeen.yardVisits=seen;
    el.innerHTML = visits.length ? visits.map(function(v){
      const canPhoto = v.status!=='done';
      let h='<div class="card" id="wyardcard-'+v.id+'"><b>'+escHtml(v.date)+'</b> — '+escHtml(v.planName||'Yard visit')+' <span class="pill">'+escHtml(v.status)+'</span><br>'+
        '<b>'+WT('addressLabel')+'</b> '+escHtml(v.address||'—')+(v.yardSize?'<br><span class="mut">'+WT('yardLabel')+' '+escHtml(v.yardSize)+'</span>':'')+(v.homeNotes?'<br><span class="mut">'+WT('homeNotesLabel')+' '+escHtml(v.homeNotes)+'</span>':'')+(v.notes?'<br><span class="mut">'+WT('teamNotesLabel')+' '+escHtml(v.notes)+'</span>':'');
      if (v.beforePhoto||v.afterPhoto) h+='<div class="photos">'+(v.beforePhoto?'<img class="thumb" src="'+v.beforePhoto+'" alt="Before">':'')+(v.afterPhoto?'<img class="thumb" src="'+v.afterPhoto+'" alt="After">':'')+'</div>';
      if (canPhoto) h+='<div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap"><label style="flex:1;min-width:130px">'+WT('beforePhoto')+'<input type="file" accept="image/*" onchange="yardPhotoChange(\''+v.id+'\',\'beforePhoto\',this)"></label><label style="flex:1;min-width:130px">'+WT('afterPhoto')+'<input type="file" accept="image/*" onchange="yardPhotoChange(\''+v.id+'\',\'afterPhoto\',this)"></label></div>';
      h+='<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
        (v.status==='assigned'?'<button class="black" onclick="yardVisitStatus(\''+v.id+'\',\'on_the_way\')">'+WT('onMyWay')+'</button>':'')+
        (v.status==='on_the_way'?'<button class="black" onclick="yardVisitStatus(\''+v.id+'\',\'arrived\')">'+WT('arrived')+'</button>':'')+
        (v.status==='arrived'?'<button class="black" onclick="yardVisitStatus(\''+v.id+'\',\'done\')">'+WT('markDoneYard')+'</button>'+((!v.beforePhoto||!v.afterPhoto)?' <span class="mut">'+WT('needsPhotos')+'</span>':''):'')+
        (v.status==='done'?'<span class="pill">'+WT('doneWord')+(v.completedAt?' • '+escHtml(v.completedAt.slice(0,10)):'')+'</span>':'')+
        '</div></div>';
      return h;
    }).join('') : '<div class="empty"><p class="mut">'+WT('yardNone')+'</p></div>';
  }catch(e){}
}
async function yardVisitStatus(idv, status){
  try{ await api('/api/worker/yard-visits/'+idv,{method:'PATCH', body:JSON.stringify({status:status})}); loadWorkerYardVisits(); }
  catch(e){ alert(e.message); }
}
async function yardPhotoChange(idv, key, input){
  const f=input && input.files && input.files[0]; if(!f) return;
  try{
    const data=await fileToDataUrl(f);
    const body={}; body[key]=data;
    await api('/api/worker/yard-visits/'+idv,{method:'PATCH', body:JSON.stringify(body)});
    loadWorkerYardVisits();
  }catch(e){ alert(e.message||WT('photoFailed')); }
}
let _adminLoading = false, _adminReloadQueued = false;
function admGo(idv){ const el=document.getElementById(idv); if(el) el.scrollIntoView({behavior:'smooth', block:'start'}); }
function toggleWorkerDetail(wid, btn){
  const d = document.getElementById('wdetail-'+wid); if(!d) return;
  const open = d.style.display !== 'none';
  d.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? 'Ver detalle ▾' : 'Ocultar detalle ▴';
}
// v80.6 PERF: loadAdmin's heaviest sections are scoped loaders now
// (the pattern loadAdminCaptains already used): loadAdmin()
// composes them for a full refresh, and single-section admin
// actions reload ONLY the section they mutated instead of
// paying the full 12-fetch reload (+ a live Stripe health
// fetch + a master-map rebuild) for every click. The render
// code inside each loader is the exact code loadAdmin ran.
async function loadAdminRequests(){
  const rq=await api('/api/requests').catch(()=>({requests:[]}));
  document.getElementById('adminRequests').innerHTML = rq.requests.map(function(r){ return '<div class="card" id="reqcard-'+r.id+'"><b>'+r.id+'</b> — '+escHtml(r.service)+' <span class="pill">'+escHtml(r.status)+'</span>'+estimateStatusBadgeHtml(r)+(r.techCreated?'<span class=\"pill\" style=\"background:#7c3aed;color:#fff\">🧾 Tech estimate · '+escHtml(r.createdByWorkerName||'')+'</span>':'')+'<br><span class="mut">'+escHtml(r.customerName||'Customer')+(r.customerEmail?' • '+escHtml(r.customerEmail):'')+(r.customerPhone?' • '+escHtml(r.customerPhone):'')+'<br>'+escHtml(r.description)+' • '+escHtml(r.city)+' • '+escHtml(r.address)+' • '+escHtml(r.when)+'</span>'+estimateHtml(r,false)+(r.estimate?'<div style="margin:8px 0"><button class="ghost" onclick="copyEstimateLink(\''+r.id+'\')">Copy public estimate link</button> <span class="mut">no account needed — customer approves + pays from the link</span></div>':'')+adminPaymentHtml(r)+adminHoldPanelHtml(r)+threadHtml(r)+estimateBuilderHtml(r)+'<div style="margin-top:10px"><button class="ghost" onclick="delRequest(\''+r.id+'\')">Delete quote/request</button></div>'+(r.quote!=null?'<div style="margin-top:10px;border-top:1px dashed #33333b;padding-top:10px"><b>Post as a job for the workers</b> <span class="mut">(prefilled from this quote — you confirm before posting)</span><br><span class="mut">Worker pay $</span> <input id="jp-'+r.id+'" type="number" style="width:120px" value="'+(r.quote?Math.round(r.quote*2/3):'')+'"> <span class="mut">Customer price $'+(r.quote||'')+' • Extra info for the worker (Team only, customer never sees this)</span><br><input id="jn-'+r.id+'" placeholder="Gate code, parking, tools needed, heads-up..." style="width:100%"><br><button class="black" onclick="postFromRequest(\''+r.id+'\','+(r.quote||0)+')">Review & post job</button></div>':'')+'</div>'; }).join('') || '<div class="empty"><p class="mut">No requests yet.</p></div>';
  window._adminReqCache={}; rq.requests.forEach(function(r){ window._adminReqCache[r.id]=r; seedEstimateBuilder(r); });
  sndAdminRequests(rq.requests);
}
async function loadAdminWorkers(){
  const wk=await api('/api/workers').catch(()=>({workers:[]}));
  adminWorkersCache = wk.workers||[];
  // v84: the class filter narrows the RENDERED list only — the cache
  // always keeps every worker (dispatch pickers read it).
  const classFilter84 = (document.getElementById('adminWorkerClassFilter') || {}).value || '';
  const list84 = adminWorkersCache.filter(function(w){ return !classFilter84 || (w.workerClass === 'ayudante' ? 'ayudante' : 'tecnico') === classFilter84; });
  document.getElementById('adminWorkers').innerHTML = list84.map(function(w){ const pf=w.profile||{};
    function row(k,v){ return v ? '<br><span class="mut">'+k+':</span> '+escHtml(v) : ''; }
    // v72 (A-1): compact card by default — photo, name, status, payouts
    // and the top trades; the full profile rows + Team ranks + trade
    // verification + the edit form live inside a "Ver detalle" fold, so
    // the panel reads at a glance instead of one endless scroll.
    const topTrades = TRADE_KEYS_CLIENT.map(function(k){ const e=(w.tradeSkills||{})[k]; return e ? { k:k, lv:(e.effective!=null?e.effective:e.level)||0 } : null; }).filter(Boolean).sort(function(a,b){ return b.lv-a.lv; }).slice(0,3).map(function(t){ return wTradeName(t.k)+' ★'+t.lv; }).join(' · ');
    // v75: at-a-glance gaps — a worker with NO phone on file is an
    // incomplete record (he cannot be called when a job lands), and the
    // structured availability from his application checkboxes reads in
    // one line (days · shifts · ⚡ on-demand).
    const noPhonePill = w.phone ? '' : ' <span class="pill" style="background:#7a1616;color:#fff">⚠ Incomplete — no phone</span>';
    // v84: the class badge — every worker is TÉCNICO or AYUDANTE.
    const classPill = ' <span class="pill wclass-pill' + (w.workerClass === 'ayudante' ? ' ayudante' : '') + '" style="background:' + (w.workerClass === 'ayudante' ? '#8a6d1a' : '#0b0b0b') + ';color:#fff">' + (w.workerClass === 'ayudante' ? 'AYUDANTE' : 'TÉCNICO') + '</span>';
    const AV_DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const avW = w.availability || {};
    const availLine = ((avW.days||[]).length || (avW.shifts||[]).length || avW.onDemand) ? '<br><span class="mut">Availability:</span> ' + (avW.days||[]).map(function(d){ return AV_DAY_NAMES[d] || ''; }).filter(Boolean).join(' ') + ((avW.shifts||[]).length ? ' · ' + avW.shifts.join(', ') : '') + (avW.onDemand ? ' · ⚡ on-demand' : '') : '';
    return '<div class="card">'+avatarHtml(w.photo, w.name, 38)+' <b>'+escHtml(w.name)+'</b> ('+escHtml(w.email)+(w.phone?' • '+escHtml(w.phone):'')+') <span class="pill">'+escHtml(w.status)+'</span> <span class="pill">'+(w.payoutsSetup==='ready'?'\u{1F4B3} Stripe Connect: Connected':(w.payoutsSetup==='pending'?'\u{1F4B3} Stripe Connect: Pending':'\u{1F4B3} Stripe Connect: Not started'))+'</span>' + noPhonePill + classPill
    + (pf.city ? '<br><span class="mut">City:</span> '+escHtml(pf.city) : '') + (topTrades ? '<br><span class="mut">Top trades:</span> '+topTrades : '') + availLine
    + '<br><button onclick="setWorker(\''+w.id+'\',\'active\')">Make ACTIVE</button> <button class="ghost" onclick="setWorker(\''+w.id+'\',\'review\')">On review</button> <button class="ghost" onclick="setWorker(\''+w.id+'\',\'notfit\')">Not a fit</button> <button class="ghost" onclick="toggleWorkerDetail(\''+w.id+'\',this)">Ver detalle ▾</button> <button class="ghost" onclick="delWorker(\''+w.id+'\',\''+w.name.replace(/'/g,"\\'")+'\')">Delete worker</button>'+(w.photo?' <button class="ghost" onclick="removeWorkerPhoto(\''+w.id+'\')">Remove photo</button>':'')
    + '<div id="wdetail-'+w.id+'" style="display:none">'
    + row('Applying as', pf.applyingAs) + row('Class', w.workerClass === 'ayudante' ? 'Ayudante' : 'Técnico') + row('Main trade', pf.primaryTrade) + row('Own tools', pf.ownTools === true ? 'Yes' : (pf.ownTools === false ? 'No' : '')) + row('Own transport', pf.ownTransport === true ? 'Yes' : (pf.ownTransport === false ? 'No' : ''))
    + row('City', pf.city) + row('Areas', pf.areas)
    + row('Skills', (pf.skills||w.skills||[]).join(', ')) + row('Has', (pf.gear||[]).join(', '))
    + row('Experience', pf.experience) + row('Tools', pf.toolsLevel) + row('Vehicle', pf.vehicleStyle||w.vehicle)
    + row('Haul', pf.haul) + row('Transport', pf.transport) + row('License/ID', pf.license) + row('Insurance', pf.insurance)
    + row('Availability', pf.availability) + row('Notes', pf.notes) + skillRankHtml(w) + workerTradesHtml(w)
    + '<br><span class="mut">Class:</span> <button class="ghost" onclick="setWorkerClassAdmin(\''+w.id+'\',\'tecnico\')">Make TÉCNICO</button> <button class="ghost" onclick="setWorkerClassAdmin(\''+w.id+'\',\'ayudante\')">Make AYUDANTE</button>'
    + '<br><button class="ghost" onclick="editWorkerForm(\''+w.id+'\')">Edit</button><div id="editWorker-'+w.id+'"></div></div></div>'; }).join('') || '<div class="empty"><p class="mut">No workers yet.</p></div>';
}
async function loadAdminJobs(){
  const jb=await api('/api/jobs').catch(()=>({jobs:[]}));
  document.getElementById('adminJobs').innerHTML = jb.jobs.map(j=>'<div class="card"><b>'+j.id+'</b> — '+escHtml(j.service)+' <span class="pill">'+escHtml(j.status)+'</span> • Pay offer $'+escHtml(j.payOffer)+'<br><span class="mut">'+escHtml(j.city)+' • '+escHtml(j.when)+' • Customer: '+escHtml(j.customerName||'—')+' '+escHtml(j.customerPhone||'')+' • '+escHtml(j.address||'')+'</span>'+(j.assignedWorkerId?jobChatHtml(j)+(j.infoReleased?'<div style="margin-top:8px"><span class="pill">Address & time shared with worker</span> <button class="ghost" onclick="releaseInfo(\''+j.id+'\',false)">Hide from worker</button></div>':'<div style="margin-top:8px"><button class="black" onclick="releaseInfo(\''+j.id+'\',true)">Confirm & share address/time with worker</button> <span class="mut">Worker never sees the customer name or phone.</span></div>'):'<br><span class="mut">Job chat opens when a worker claims this job.</span>')+(j.rating?'<div style="margin-top:6px"><b>Customer rating:</b> <span style="color:#b26a00">'+'\u2605'.repeat(j.rating)+'\u2606'.repeat(5-j.rating)+'</span>'+(j.reviewText?' \u2014 &ldquo;'+escHtml(j.reviewText)+'&rdquo;':'')+' <span class="pill">'+(j.reviewPublished?'Published':'Not published')+'</span></div>':'')+jobTimelineHtml(j)+payoutHtml(j)+trackBlockHtml(j,'admin')+(j.status==='Open'?connectOverrideHtml(j):'')+'<div style="margin-top:8px"><button class="ghost" onclick="delJob(\''+j.id+'\')">Cancel job</button></div>'+'</div>').join('') || '<div class="empty"><p class="mut">No jobs yet.</p></div>';
  initTrackMaps(jb.jobs);
  return jb.jobs;
}
async function loadAdmin(){
  // v46 ADMIN PERF: loadAdmin used to stack — every render()/action fired
  // a full reload (3 API fetches + full re-render + every Leaflet map torn
  // down and rebuilt), and overlapping runs interleaved. Now a run in
  // flight coalesces further calls into ONE trailing re-run.
  if (_adminLoading) { _adminReloadQueued = true; return; }
  _adminLoading = true;
  try {
  loadCalendar();
  await loadAdminRequests();
  await loadAdminWorkers();
  const jobs = await loadAdminJobs();
  loadInvoices();
  loadAdminRatings();
  loadAdminCaptains();
  loadAdminMap(jobs);
  loadAdminAudit();
  renderCartPicker();
  loadAdminSources();
  loadAdminTraffic();
  loadAdminMoney();
  loadAdminSprint();
  loadAdminSystem();
  loadAdminCarts();
  loadAdminInvites();
  } finally { _adminLoading = false; if (_adminReloadQueued) { _adminReloadQueued = false; loadAdmin(); }
    // v75 MAP watchdog: loadAdminMap is the LAST step of a long chain —
    // if anything above it ever throws, the map box used to stay empty
    // forever (one more way Gabriel "never saw the map"). If the box is
    // still empty shortly after a load, fill it on its own; loadAdminMap
    // fetches what it needs and its own loading guard prevents doubles.
    setTimeout(function(){ try { const b = document.getElementById('adminMapBox'); if (b && !b.innerHTML.trim() && me && me.role === 'admin' && !adminMapLoading) loadAdminMap(); } catch(e){} }, 1500);
  }
}
// ---------- Admin cart builder (v44) ----------
let cartDraft = [];
function renderCartPicker(){
  const box=document.getElementById('cartPicker'); if(!box || typeof MENU_CATALOG==='undefined') return;
  const q=((document.getElementById('cartSearch')||{}).value||'').toLowerCase();
  const ids=Object.keys(MENU_CATALOG).filter(function(id){ return !q || MENU_CATALOG[id].name.toLowerCase().indexOf(q)>=0; });
  box.innerHTML=ids.slice(0,60).map(function(id){ const s=MENU_CATALOG[id]; return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed #eee"><span><b>'+escHtml(s.name)+'</b> <span class="mut">'+escHtml(s.meta||'')+'</span></span><span style="white-space:nowrap">$'+s.price+' <button type="button" class="ghost" onclick="builderCartAdd(\''+id+'\')">+ Add</button></span></div>'; }).join('') || '<span class="mut">No services match.</span>';
}
function builderCartAdd(idv){
  const s=MENU_CATALOG[idv]; if(!s) return;
  const ex=cartDraft.find(function(x){ return x.serviceId===idv; });
  if(ex) ex.qty=Math.min(99, ex.qty+1); else cartDraft.push({ serviceId:idv, name:s.name, qty:1, unitPrice:s.price });
  renderCartLines();
}
function cartAddCustomLine(kind){
  const name=((document.getElementById('cartCustomName')||{}).value||'').trim();
  const price=Number((document.getElementById('cartCustomPrice')||{}).value);
  const qty=Math.round(Number((document.getElementById('cartCustomQty')||{}).value)||1);
  if(!name){ alert('Type the line name first — it is what the customer sees.'); return; }
  if(!isFinite(price) || price<0){ alert('Add a price for the line (0 is allowed).'); return; }
  cartDraft.push({ custom:true, kind:(kind==='other'?'other':'labor'), serviceId:'', name:name, qty:Math.max(1,Math.min(99,qty)), unitPrice:Math.round(price*100)/100 });
  document.getElementById('cartCustomName').value=''; document.getElementById('cartCustomPrice').value=''; document.getElementById('cartCustomQty').value='1';
  renderCartLines();
}
function cartAddLabor75(){
  const ex=cartDraft.find(function(x){ return x.custom && x.kind==='labor' && x.name==='Labor' && x.unitPrice===75; });
  if(ex) ex.qty=Math.min(99, ex.qty+1); else cartDraft.push({ custom:true, kind:'labor', serviceId:'', name:'Labor', qty:1, unitPrice:75 });
  renderCartLines();
}
function cartSetQty(i,v){ cartDraft[i].qty=Math.max(1,Math.min(99,Math.round(Number(v)||1))); renderCartLines(); }
function cartSetPrice(i,v){ cartDraft[i].unitPrice=Math.max(0,Math.round((Number(v)||0)*100)/100); renderCartSummary(); }
function builderCartRemove(i){ cartDraft.splice(i,1); renderCartLines(); }
// v80.6: the builder paints into its OWN container (#cartBuilderLines).
// It used to share the cartLines id with the customer cart, so
// getElementById handed BOTH renderers the customer's (hidden) node —
// the builder's line editor painted where Gabriel could not see it.
// It only "worked" because submitCart() reads the cartDraft array,
// never the DOM. The customer cart keeps #cartLines, untouched.
function renderCartLines(){
  const box=document.getElementById('cartBuilderLines'); if(!box) return;
  box.innerHTML=cartDraft.map(function(it,i){ const tag=it.custom?' <span class="pill" style="font-size:11px;padding:2px 8px">'+(it.kind==='other'?'Material':'CUSTOM · Labor')+'</span>':''; return '<div class="est-row"><span><input value="'+escHtml(it.name)+'" oninput="cartDraft['+i+'].name=this.value" placeholder="Service name" style="width:100%">'+tag+'</span><input type="number" min="1" max="99" step="1" value="'+it.qty+'" onchange="cartSetQty('+i+',this.value)"><input type="number" min="0" step="0.01" value="'+it.unitPrice+'" oninput="cartSetPrice('+i+',this.value)"><button type="button" class="est-x" onclick="builderCartRemove('+i+')" title="Remove line">×</button></div>'; }).join('');
  renderCartSummary();
}
function renderCartSummary(){
  const el=document.getElementById('cartSummary'); if(!el) return;
  if(!cartDraft.length){ el.textContent='Cart is empty — add services above.'; return; }
  const list=cartDraft.reduce(function(s,it){ return s+it.qty*it.unitPrice; },0);
  const member=cartDraft.reduce(function(s,it){ const u=(it.custom && it.kind==='other') ? it.unitPrice : Math.round(it.unitPrice*0.8*100)/100; return s+it.qty*u; },0);
  el.innerHTML='<b>Total:</b> <span class="st">'+moneyFmt(list)+'</span> • HomeCare member pays: <b>'+moneyFmt(member)+'</b> (member price applies only if the customer is — or becomes — a HomeCare / Plus member on the cart page)';
}
// v80.8 BUILDER HARDENING: every draft line's name is editable —
// including catalog lines. A line whose name gets blanked is DROPPED
// by the server's item filter without any error, so the created link
// would total LESS than the builder showed (a $250 starter + a $165
// door slab came back as a $165 cart). Guard here, in the builder's own
// layer, the same way cartAddCustomLine already guards its name.
function builderNameProblem(){
  return cartDraft.some(function(it){ return !String(it.name || '').trim(); }) ? 'Every line needs a name — it is what the customer sees on the link. Fill in the blank line (or remove it) and try again.' : '';
}
async function createCartLink(){
  if(!cartDraft.length){ alert('Add at least one service first.'); return; }
  const nameProblem = builderNameProblem(); if(nameProblem){ alert(nameProblem); return; }
  const out=document.getElementById('cartLinkOut');
  try{
    const d=await api('/api/admin/carts',{method:'POST', body:JSON.stringify({ items:cartDraft, customerName:document.getElementById('cartCustName').value.trim(), customerPhone:document.getElementById('cartCustPhone').value.trim(), customerEmail:document.getElementById('cartCustEmail').value.trim(), note:document.getElementById('cartNote').value.trim(), lang:(document.getElementById('cartLang')||{}).value||'en' })});
    const url=d.cart.link;
    out.innerHTML='<b>Cart link ready:</b> <a href="'+url+'" target="_blank" rel="noopener">'+url+'</a> <button type="button" class="ghost" onclick="copyCartLink(\''+d.cart.id+'\')">Copy link</button><br><span class="mut">Send it to the customer — they fill their info, decide on HomeCare, and pay the deposit to book. The booked order lands in Customer requests.</span>';
    cartDraft=[]; renderCartLines();
    loadAdminCarts();
  }catch(e){ alert(e.message); }
}
// ---------- Cart edit mode (v55): change an OPEN cart in place ----------
// The link never changes — Save PUTs the new lines to the same cart and
// the customer opening the link sees the updated lines/totals. The
// server expires any live Checkout session on edit, so nobody can pay
// a stale total.
let cartEditId = null;
function setCartEditUi(){
  const editing=!!cartEditId;
  const banner=document.getElementById('cartEditBanner');
  if(banner){ banner.style.display=editing?'block':'none'; if(editing) document.getElementById('cartEditWhich').textContent=cartEditId; }
  const btn=document.getElementById('cartMainBtn');
  if(btn) btn.textContent=editing?('Save changes — '+cartEditId):'Generate cart link';
}
async function editCart(idv){
  try{
    const d=await api('/api/admin/carts');
    const c=(d.carts||[]).find(function(x){ return x.id===idv; });
    if(!c){ alert('Cart not found — the list was refreshed.'); loadAdminCarts(); return; }
    if(c.status!=='open'){ alert('Only OPEN carts can be edited — this one is '+c.status+'.'); return; }
    cartEditId=c.id;
    cartDraft=(c.items||[]).map(function(it){ return it.custom ? { custom:true, kind:(it.kind==='other'?'other':'labor'), serviceId:'', name:it.name, qty:it.qty, unitPrice:it.unitPrice } : { serviceId:it.serviceId||'', name:it.name, qty:it.qty, unitPrice:it.unitPrice }; });
    document.getElementById('cartCustName').value=c.customerName||'';
    const ce79=document.getElementById('cartCustEmail'); if(ce79) ce79.value=c.customerEmail||(c.customer&&c.customer.email)||'';
    document.getElementById('cartCustPhone').value=c.customerPhone||'';
    document.getElementById('cartNote').value=c.note||'';
    const langSel=document.getElementById('cartLang'); if(langSel) langSel.value=c.lang||'en';
    document.getElementById('cartLinkOut').innerHTML='';
    setCartEditUi();
    renderCartLines();
    const card=document.getElementById('cartBuilderCard'); if(card) card.scrollIntoView({behavior:'smooth', block:'start'});
  }catch(e){ alert(e.message); }
}
function cancelCartEdit(){
  cartEditId=null; cartDraft=[];
  ['cartCustName','cartCustPhone','cartCustEmail','cartNote'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
  const langSel=document.getElementById('cartLang'); if(langSel) langSel.value='en';
  document.getElementById('cartLinkOut').innerHTML='';
  setCartEditUi();
  renderCartLines();
}
async function submitCart(){ if(cartEditId) return saveCartEdit(); return createCartLink(); }
async function saveCartEdit(){
  if(!cartDraft.length){ alert('Add at least one service first.'); return; }
  const nameProblem = builderNameProblem(); if(nameProblem){ alert(nameProblem); return; }
  const idv=cartEditId;
  try{
    const d=await api('/api/admin/carts/'+idv,{method:'PUT', body:JSON.stringify({ items:cartDraft, customerName:document.getElementById('cartCustName').value.trim(), customerPhone:document.getElementById('cartCustPhone').value.trim(), customerEmail:document.getElementById('cartCustEmail').value.trim(), note:document.getElementById('cartNote').value.trim(), lang:(document.getElementById('cartLang')||{}).value||'en' })});
    const url=d.cart.link;
    cancelCartEdit();
    document.getElementById('cartLinkOut').innerHTML='<b>Cart '+idv+' updated:</b> total now <b>'+moneyFmt(d.cart.listTotal)+'</b> (member '+moneyFmt(d.cart.memberTotal)+') — same link: <a href="'+url+'" target="_blank" rel="noopener">'+url+'</a> <button type="button" class="ghost" onclick="copyCartLink(\''+idv+'\')">Copy link</button>';
    loadAdminCarts();
  }catch(e){ alert(e.message); }
}
function copyCartLink(idv){
  var url=location.origin+'/cart/'+idv;
  function done(){ alert('Cart link copied:\n'+url); }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(function(){ prompt('Copy the cart link:',url); }); }
  else prompt('Copy the cart link:',url);
}
async function loadAdminSources(){
  const host = document.getElementById('adminSources'); if (!host) return;
  try {
    const d = await api('/api/admin/source-summary');
    const rows = (d && d.rows) || [];
    if (!rows.length) { host.innerHTML = '<p class="mut">No customers yet.</p>'; return; }
    host.innerHTML = '<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left">Source</th><th>Customers</th><th>Orders</th><th>Members</th></tr>' + rows.map(function (r) { return '<tr><td>' + escHtml(r.source) + '</td><td style="text-align:center">' + r.customers + '</td><td style="text-align:center">' + r.orders + '</td><td style="text-align:center">' + r.members + '</td></tr>'; }).join('') + '</table><p class="mut">Cost per client = ad spend ÷ customers from that source. First-touch: the first source a customer arrives with stays on their account.</p>';
  } catch (e) { host.innerHTML = '<p class="mut">Could not load sources.</p>'; }
}
// ---------- v80.12: Tráfico + Dinero (admin) ----------
// Labels follow the HOME_UI dictionary pattern (EN/ES, keyed by the
// app language) so the two sections read in the language Gabriel is
// using, like the rest of the app's painted blocks.
const ADM812 = {
  en: { today: 'Today', d7: '7 days', d30: '30 days', funnel: 'Funnel', views: 'views', carts: 'carts', joins: 'signups', payments: 'payments', source: 'Source', deposits: 'Deposits', newMembers: 'New paying members', spend: 'Ad spend', cac: 'CAC', workerCode: 'worker code', customerCode: 'customer code', addSpend: 'Add ad spend', amount: 'Amount', date: 'Date', save: 'Save', cancel: 'Cancel', edit: 'Edit', del: 'Delete', noSpend: 'No spend records yet — add the first one above when an ad runs.', couldNot: 'Could not load.', depWaiting: 'Deposits in, balance still out', orders: 'orders', collected: 'collected', balanceOut: 'balance still out', receivable: 'Total receivable', orderBalances: 'order balances', cartBalances: 'unconverted cart balances', invoicesOpen: 'open invoices', techDue: 'Tech payouts waiting', jobs: 'jobs', bounties: 'referral bounties pending', awaitingSetup: 'waiting on Stripe setup', captainsDue: 'Captain overrides accrued', entries: 'entries', memFail: 'Membership payment failures (this month)', stripeBox: 'Stripe', avail: 'available', pendingBal: 'pending', nextPayout: 'next payout', noStripe: 'Balance not available right now — the rest of this page is live from the app.' },
  es: { today: 'Hoy', d7: '7 días', d30: '30 días', funnel: 'Embudo', views: 'visitas', carts: 'carritos', joins: 'registros', payments: 'pagos', source: 'Fuente', deposits: 'Depósitos', newMembers: 'Miembros nuevos que pagaron', spend: 'Gasto en anuncios', cac: 'CAC', workerCode: 'código de técnico', customerCode: 'código de cliente', addSpend: 'Agregar gasto en anuncios', amount: 'Monto', date: 'Fecha', save: 'Guardar', cancel: 'Cancelar', edit: 'Editar', del: 'Borrar', noSpend: 'Todavía no hay gastos registrados — agrega el primero arriba cuando corra un anuncio.', couldNot: 'No se pudo cargar.', depWaiting: 'Depósitos cobrados, saldo pendiente', orders: 'órdenes', collected: 'cobrados', balanceOut: 'de saldo por cobrar', receivable: 'Total por cobrar', orderBalances: 'saldos de órdenes', cartBalances: 'saldos de carritos sin convertir', invoicesOpen: 'facturas abiertas', techDue: 'Pagos a técnicos en espera', jobs: 'trabajos', bounties: 'bonos de referido pendientes', awaitingSetup: 'esperando su Stripe', captainsDue: 'Overrides de capitán acumulados', entries: 'registros', memFail: 'Pagos de membresía fallidos (este mes)', stripeBox: 'Stripe', avail: 'disponible', pendingBal: 'pendiente', nextPayout: 'próximo payout', noStripe: 'Saldo no disponible ahorita — el resto de la página sí es en vivo desde la app.' }
};
let trafficRange812 = '7d';
function setTrafficRange(r){ trafficRange812 = r; loadAdminTraffic(); }
async function loadAdminTraffic(){
  const host = document.getElementById('adminTraffic'); if (!host || !me || me.role !== 'admin') return;
  const S = ADM812[menuLang()] || ADM812.en;
  try {
    const d = await api('/api/admin/traffic?range=' + trafficRange812);
    const sp = await api('/api/admin/adspend');
    const records = (sp && sp.records) || [];
    window.__adsRecords812 = records;
    const t = d.totals || {};
    const pct = function (v) { return v == null ? '—' : v + '%'; };
    let h = '<p style="margin:2px 0 8px">'
      + [['today', S.today], ['7d', S.d7], ['30d', S.d30]].map(function (pr) { return '<button type="button" class="ghost" onclick="setTrafficRange(\'' + pr[0] + '\')"' + (trafficRange812 === pr[0] ? ' style="font-weight:800;text-decoration:underline"' : '') + '>' + pr[1] + '</button>'; }).join(' ')
      + ' <span class="mut">' + escHtml(d.from || '') + ' → ' + escHtml(d.to || '') + '</span></p>';
    h += '<p style="margin:0 0 8px"><b>' + S.funnel + ':</b> ' + (t.views || 0) + ' ' + S.views + ' → ' + (t.carts || 0) + ' ' + S.carts + ' (' + pct(t.convCarts) + ') → ' + (t.joins || 0) + ' ' + S.joins + ' (' + pct(t.convJoins) + ') → ' + (t.payments || 0) + ' ' + S.payments + ' (' + pct(t.convPayments) + ')</p>';
    const rows = d.rows || [];
    if (rows.length) {
      h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left">' + S.source + '</th><th>' + S.views + '</th><th>' + S.carts + '</th><th>' + S.joins + '</th><th>' + S.deposits + '</th><th>' + S.newMembers + '</th><th>' + S.spend + '</th><th>' + S.cac + '</th></tr>'
        + rows.map(function (r) { return '<tr><td>' + escHtml(r.source) + (r.workerCode ? ' <span class="mut">(' + S.workerCode + ')</span>' : '') + (r.customerCode ? ' <span class="mut">(' + S.customerCode + ')</span>' : '') + '</td><td style="text-align:center">' + r.views + '</td><td style="text-align:center">' + r.carts + '</td><td style="text-align:center">' + r.joins + '</td><td style="text-align:center">' + r.deposits + '</td><td style="text-align:center">' + r.newMembers + '</td><td style="text-align:center">' + (r.spend ? moneyFmt(r.spend) : '—') + '</td><td style="text-align:center">' + (r.cac == null ? '—' : moneyFmt(r.cac)) + '</td></tr>'; }).join('') + '</table></div>';
    }
    h += '<div style="margin-top:10px"><b>' + S.addSpend + '</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'
      + '<input id="adsSrc" placeholder="' + S.source + ' (ig, fb, google…)" style="flex:1;min-width:120px">'
      + '<input id="adsAmt" type="number" min="0" step="0.01" placeholder="' + S.amount + ' $" style="width:110px">'
      + '<input id="adsDate" type="date" style="width:160px">'
      + '<input id="adsId" type="hidden" value="">'
      + '<button type="button" onclick="saveAdSpend()">' + S.save + '</button>'
      + '<button type="button" class="ghost" onclick="resetAdSpendForm()">' + S.cancel + '</button></div></div>';
    if (records.length) {
      h += '<div style="margin-top:8px">' + records.map(function (r) { return '<div class="card" style="padding:6px 10px;margin:4px 0"><b>' + escHtml(r.source) + '</b> · ' + moneyFmt(r.amount) + ' · ' + escHtml(r.date) + ' <button type="button" class="ghost" onclick="editAdSpend(\'' + r.id + '\')">' + S.edit + '</button> <button type="button" class="ghost" onclick="deleteAdSpend(\'' + r.id + '\')">' + S.del + '</button></div>'; }).join('') + '</div>';
    } else h += '<p class="mut">' + S.noSpend + '</p>';
    host.innerHTML = h;
    const dateEl = document.getElementById('adsDate'); if (dateEl && !dateEl.value) dateEl.value = d.to || '';
  } catch (e) { host.innerHTML = '<p class="mut">' + S.couldNot + '</p>'; }
}
async function saveAdSpend(){
  const idv = (document.getElementById('adsId') || {}).value || '';
  const body = { source: ((document.getElementById('adsSrc') || {}).value || '').trim(), amount: Number((document.getElementById('adsAmt') || {}).value || 0), date: (document.getElementById('adsDate') || {}).value || '' };
  try {
    if (idv) await api('/api/admin/adspend/' + idv, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/admin/adspend', { method: 'POST', body: JSON.stringify(body) });
    loadAdminTraffic();
  } catch (e) { alert(e.message); }
}
function resetAdSpendForm(){ ['adsSrc', 'adsAmt', 'adsId'].forEach(function (i) { const el = document.getElementById(i); if (el) el.value = ''; }); const d = document.getElementById('adsDate'); if (d) d.value = ''; }
function editAdSpend(idv){
  const r = (window.__adsRecords812 || []).find(function (x) { return x.id === idv; }); if (!r) return;
  const s = document.getElementById('adsSrc'), a = document.getElementById('adsAmt'), d = document.getElementById('adsDate'), i = document.getElementById('adsId');
  if (s) s.value = r.source; if (a) a.value = r.amount; if (d) d.value = r.date; if (i) i.value = r.id;
  const sec = document.getElementById('admSecTraffic'); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function deleteAdSpend(idv){ if (!confirm('Delete this spend record?')) return; try { await api('/api/admin/adspend/' + idv, { method: 'DELETE' }); loadAdminTraffic(); } catch (e) { alert(e.message); } }
async function loadAdminMoney(){
  const host = document.getElementById('adminMoney'); if (!host || !me || me.role !== 'admin') return;
  const S = ADM812[menuLang()] || ADM812.en;
  try {
    const d = await api('/api/admin/money');
    const dw = d.depositsWaiting || {}, rc = d.receivables || {}, tp = d.techPayouts || {}, cp = d.captains || {}, mf = d.membershipFailures || {}, st = d.stripe || {};
    let h = '';
    h += '<div class="card"><b>' + S.depWaiting + ':</b> ' + (dw.count || 0) + ' ' + S.orders + ' · ' + moneyFmt(dw.collected || 0) + ' ' + S.collected + ' · ' + moneyFmt(dw.balance || 0) + ' ' + S.balanceOut + '</div>';
    h += '<div class="card"><b>' + S.receivable + ':</b> ' + moneyFmt(rc.total || 0) + '<br><span class="mut">' + S.orderBalances + ' ' + moneyFmt(rc.orderBalances || 0) + ' · ' + S.cartBalances + ' ' + moneyFmt(rc.cartBalances || 0) + ' (' + (rc.cartBalancesCount || 0) + ') · ' + S.invoicesOpen + ' ' + moneyFmt(rc.invoicesOpen || 0) + ' (' + (rc.invoicesOpenCount || 0) + ')</span></div>';
    h += '<div class="card"><b>' + S.techDue + ':</b> ' + moneyFmt(tp.amount || 0) + ' · ' + (tp.jobs || 0) + ' ' + S.jobs
      + ((tp.byState || []).length ? '<br>' + tp.byState.map(function (b) { return '<span class="mut">' + escHtml(b.state) + ':</span> ' + moneyFmt(b.amount) + ' (' + b.jobs + ')'; }).join(' · ') : '')
      + ((tp.bountiesPending && tp.bountiesPending.count) ? '<br><span class="mut">' + S.bounties + ':</span> ' + moneyFmt(tp.bountiesPending.amount) + ' (' + tp.bountiesPending.count + ')' : '')
      + ((tp.perTech || []).length ? '<br>' + tp.perTech.map(function (w) { return '<span class="mut">' + escHtml(w.name || w.workerId) + ':</span> ' + moneyFmt((w.amount || 0) + (w.bountyAmount || 0)) + (w.awaitingSetup ? ' <span class="mut">(' + moneyFmt(w.awaitingSetup) + ' ' + S.awaitingSetup + ')</span>' : ''); }).join('<br>') : '')
      + '</div>';
    h += '<div class="card"><b>' + S.captainsDue + ':</b> ' + moneyFmt(cp.accrued || 0) + ' (' + (cp.entries || 0) + ' ' + S.entries + ')' + ((cp.perCaptain || []).length ? '<br>' + cp.perCaptain.map(function (c) { return '<span class="mut">' + escHtml(c.name || c.captainId) + ':</span> ' + moneyFmt(c.amount); }).join(' · ') : '') + '</div>';
    h += '<div class="card"><b>' + S.memFail + ':</b> ' + (mf.count || 0) + ' · ' + moneyFmt(mf.total || 0) + '</div>';
    h += '<div class="card"><b>' + S.stripeBox + ':</b> ' + (st.available ? moneyFmt(st.balanceAvailable || 0) + ' ' + S.avail + ' · ' + moneyFmt(st.balancePending || 0) + ' ' + S.pendingBal + (st.nextPayout ? '<br><span class="mut">' + S.nextPayout + ':</span> ' + moneyFmt(st.nextPayout.amount) + (st.nextPayout.date ? ' · ' + escHtml(st.nextPayout.date) : '') + (st.nextPayout.status ? ' · ' + escHtml(st.nextPayout.status) : '') : '') : '<span class="mut">' + S.noStripe + '</span>') + '</div>';
    host.innerHTML = h;
  } catch (e) { host.innerHTML = '<p class="mut">' + S.couldNot + '</p>'; }
}
// ---------- v81: Sprint board (admin) ----------
// Labels follow the ADM812 pattern (EN/ES by the app language). Every
// number comes from GET /api/admin/sprint — the server reads the live
// db; this renderer invents nothing and shows honest zeros.
const ADM821 = {
  en: { billed: 'Billed this week', ofTarget: 'of the {target}/week pace', paceNow: 'pace expected by now', orders: 'orders', invoices: 'invoices', firstCharges: 'first membership charges', members: 'Active members', techs: 'Active technicians', target: 'target', couldNot: 'Could not load.' },
  es: { billed: 'Facturado esta semana', ofTarget: 'del ritmo de {target}/semana', paceNow: 'ritmo esperado a hoy', orders: 'órdenes', invoices: 'facturas', firstCharges: 'primeros cargos de membresía', members: 'Miembros activos', techs: 'Técnicos activos', target: 'meta', couldNot: 'No se pudo cargar.' }
};
async function loadAdminSprint(){
  const host = document.getElementById('adminSprint'); if (!host || !me || me.role !== 'admin') return;
  const S = ADM821[menuLang()] || ADM821.en;
  try {
    const d = await api('/api/admin/sprint');
    const b = d.billed || {};
    const pct = Math.max(0, Math.min(100, d.targetWeekly ? (100 * (b.total || 0) / d.targetWeekly) : 0));
    let h = '<div class="card"><b>' + S.billed + ':</b> ' + moneyFmt(b.total || 0)
      + ' <span class="mut">' + S.ofTarget.replace('{target}', moneyFmt(d.targetWeekly || 0)) + ' · ' + (d.pacePct || 0) + '%</span>'
      + '<div style="height:9px;border-radius:99px;background:#26262b;margin:8px 0 6px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#e42535,#ff5a3c);border-radius:99px"></div></div>'
      + '<span class="mut">' + S.paceNow + ': ' + moneyFmt(d.paceExpected || 0) + ' · ' + escHtml(d.weekStart || '') + ' → ' + escHtml(d.weekEnd || '') + '</span>'
      + '<br><span class="mut">' + S.orders + ' ' + moneyFmt(b.orders || 0) + ' · ' + S.invoices + ' ' + moneyFmt(b.invoices || 0) + ' · ' + S.firstCharges + ' ' + moneyFmt(b.memberFirstCharges || 0) + '</span></div>';
    h += '<div class="card"><b>' + S.members + ':</b> ' + ((d.members || {}).active || 0) + ' <span class="mut">(' + S.target + ' ' + ((d.members || {}).targetMin || 0) + '–' + ((d.members || {}).targetMax || 0) + ')</span>'
      + ' · <b>' + S.techs + ':</b> ' + ((d.techs || {}).active || 0) + ' <span class="mut">(' + S.target + ' ' + ((d.techs || {}).targetMin || 0) + '–' + ((d.techs || {}).targetMax || 0) + ')</span></div>';
    host.innerHTML = h;
  } catch (e) { host.innerHTML = '<p class="mut">' + S.couldNot + '</p>'; }
}
const ADM814 = {
  en: { started: 'Server started', uptime: 'uptime', users: 'users', requests: 'requests', carts: 'carts', invoices: 'invoices', jobs: 'jobs', sessions: 'live sessions', stripe: 'Stripe', configured: 'configured', notConfigured: 'NOT configured', lastSnap: 'last snapshot', none: 'none yet', backup: '⬇ Download full backup (JSON)', snaps: 'Daily snapshots — taken automatically, newest 7 kept', download: 'Download', noSnaps: 'No snapshots yet — the first one is taken today, on app activity.', couldNot: 'Could not load.', d: 'd', h: 'h', min: 'min', reviewUrl: 'Google review link', reviewHint: 'When an order reaches Paid in full, the customer gets ONE email + app note asking for a Google review with this link. The official GHS link is built in — paste a different one here only to override it. Invoice companies never get the ask.', reviewPh: 'https://g.page/r/…', reviewSave: 'Save link', reviewSaved: 'Saved ✓' },
  es: { started: 'Servidor inició', uptime: 'encendido', users: 'usuarios', requests: 'solicitudes', carts: 'carritos', invoices: 'facturas', jobs: 'trabajos', sessions: 'sesiones vivas', stripe: 'Stripe', configured: 'configurado', notConfigured: 'NO configurado', lastSnap: 'última copia', none: 'ninguna todavía', backup: '⬇ Descargar respaldo completo (JSON)', snaps: 'Copias diarias — automáticas, se guardan las 7 más nuevas', download: 'Descargar', noSnaps: 'Todavía no hay copias — la primera se toma hoy, con la actividad de la app.', couldNot: 'No se pudo cargar.', d: 'd', h: 'h', min: 'min', reviewUrl: 'Link de reseñas de Google', reviewHint: 'Cuando una orden llega a Pagada por completo, el cliente recibe UN correo + nota en la app pidiendo una reseña de Google con este link. El link oficial de GHS ya viene integrado — pega otro aquí solo para reemplazarlo. Las compañías de factura nunca reciben la petición.', reviewPh: 'https://g.page/r/…', reviewSave: 'Guardar link', reviewSaved: 'Guardado ✓' }
};
async function loadAdminSystem(){
  const host = document.getElementById('adminSystem'); if (!host || !me || me.role !== 'admin') return;
  const S = ADM814[menuLang()] || ADM814.en;
  try {
    const hd = await api('/api/admin/system');
    const sn = await api('/api/admin/snapshots');
    const up = hd.uptimeSec || 0;
    const upTxt = Math.floor(up / 86400) + S.d + ' ' + Math.floor((up % 86400) / 3600) + S.h + ' ' + Math.floor((up % 3600) / 60) + S.min;
    const c = hd.counts || {};
    let x = '<div class="card"><b>' + S.started + ':</b> ' + escHtml(hd.startedAt || '') + ' · <span class="mut">' + S.uptime + ':</span> ' + upTxt
      + '<br><span class="mut">' + S.users + ':</span> ' + (c.users || 0) + ' · <span class="mut">' + S.requests + ':</span> ' + (c.requests || 0) + ' · <span class="mut">' + S.carts + ':</span> ' + (c.carts || 0) + ' · <span class="mut">' + S.invoices + ':</span> ' + (c.invoices || 0) + ' · <span class="mut">' + S.jobs + ':</span> ' + (c.jobs || 0) + ' · <span class="mut">' + S.sessions + ':</span> ' + (hd.sessions || 0)
      + '<br><span class="mut">' + S.stripe + ':</span> ' + (hd.stripeConfigured ? S.configured : '<b>' + S.notConfigured + '</b>') + ' · <span class="mut">' + S.lastSnap + ':</span> ' + escHtml(hd.lastSnapshot || S.none) + '</div>';
    x += '<p style="margin:8px 0"><button type="button" onclick="window.location.href=\'/api/admin/backup\'">' + S.backup + '</button></p>';
    const list = (sn && sn.snapshots) || [];
    if (list.length) x += '<div><b>' + S.snaps + '</b>' + list.map(function (s) { return '<div class="card" style="padding:6px 10px;margin:4px 0"><b>' + escHtml(s.date) + '</b> · ' + s.users + ' ' + S.users + ' · ' + s.requests + ' ' + S.requests + ' · ' + Math.max(1, Math.round((s.bytes || 0) / 1024)) + ' KB <button type="button" class="ghost" onclick="window.location.href=\'/api/admin/snapshots/' + encodeURIComponent(s.date) + '\'">' + S.download + '</button></div>'; }).join('') + '</div>';
    else x += '<p class="mut">' + S.noSnaps + '</p>';
    x += '<div class="card"><b>⭐ ' + S.reviewUrl + '</b><br><span class="mut">' + S.reviewHint + '</span><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center"><input id="sysReviewUrl" type="url" style="flex:1;min-width:220px" placeholder="' + S.reviewPh + '" value="' + escHtml(hd.googleReviewUrl || '') + '"><button type="button" onclick="saveReviewUrl()">' + S.reviewSave + '</button><span id="sysReviewSaved" class="mut"></span></div></div>';
    host.innerHTML = x;
  } catch (e) { host.innerHTML = '<p class="mut">' + S.couldNot + '</p>'; }
}
async function saveReviewUrl(){
  const inp = document.getElementById('sysReviewUrl'); if (!inp) return;
  try { await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ googleReviewUrl: inp.value.trim() }) }); const s = document.getElementById('sysReviewSaved'); if (s) s.textContent = (ADM814[menuLang()] || ADM814.en).reviewSaved; }
  catch (e) { alert(e.message); }
}
async function loadAdminCarts(){
  const box=document.getElementById('adminCarts'); if(!box || !me || me.role!=='admin') return;
  try{
    const d=await api('/api/admin/carts');
    if(!(d.carts||[]).length){ box.innerHTML=''; return; }
    // v90: PROPUESTAS DORMIDAS VISIBLES Y ACCIONABLES — un carrito
    // 'open' es una propuesta enviada que nunca dejó depósito (las
    // dormidas de Gabriel: $1,390 parados en 4 propuestas). Todo sale
    // de lo que /api/admin/carts YA expone (publicCart trae createdAt
    // desde siempre — server.js no se tocó): la edad se deriva de
    // createdAt y el depósito por cobrar se deriva de la MISMA ley de
    // apartado asentada ($50 plano hasta $300, 40% arriba — el espejo
    // de depositSplit del servidor y de cartDepositEstimate del
    // cliente; es pintura, ningún cargo nace aquí). Presentación
    // pura: las dormidas ordenan primero, la más vieja arriba, con su
    // pastilla STALE a los 7+ días; pagadas y canceladas conservan su
    // orden y su tarjeta byte a byte debajo.
    const nowMs90=Date.now();
    const ageDays90=function(c){ const t=new Date(c.createdAt||'').getTime(); return isFinite(t)?Math.max(0,Math.floor((nowMs90-t)/86400000)):0; };
    const depFor90=function(total){ const t=Number(total)||0; return t<=300?Math.min(50,t):Math.round(t*40)/100; };
    const open90=d.carts.filter(function(c){ return c.status==='open'; });
    let head90='';
    if(open90.length){
      const depSum90=open90.reduce(function(s,c){ return s+depFor90(c.listTotal); },0);
      const totSum90=open90.reduce(function(s,c){ return s+(Number(c.listTotal)||0); },0);
      const stale90=open90.filter(function(c){ return ageDays90(c)>=7; }).length;
      head90='<div class="card adm-dormant"><b>💤 Dormant proposals — no deposit yet:</b> <span class="adm-dormant-num">'+open90.length+'</span> waiting · <b>'+moneyFmt(depSum90)+'</b> in deposits to collect <span class="mut">('+moneyFmt(totSum90)+' in open work'+(stale90?' · '+stale90+' stale (7d+)':'')+')</span><br><span class="mut">Open proposals sort first below, oldest on top — follow up top-down.</span></div>';
    }
    const rank90=function(c){ return c.status==='open'?0:(c.status==='paid'?1:2); };
    const sorted90=d.carts.slice().sort(function(a,b){ const r90=rank90(a)-rank90(b); return r90!==0?r90:(rank90(a)===0?ageDays90(b)-ageDays90(a):0); });
    box.innerHTML=head90+sorted90.map(function(c){
      const items=(c.items||[]).map(function(it){ return escHtml(it.name)+' ×'+it.qty; }).join(' + ');
      const badge=c.status==='paid'?'<span class="pill" style="background:#1a7f37">paid → '+(c.requestId||'')+'</span>':(c.status==='cancelled'?'<span class="pill" style="background:#6b6762">cancelled</span>':'<span class="pill" style="background:#b26a00">open</span>');
      const age90=c.status==='open'?ageDays90(c):0;
      const stalePill90=(c.status==='open'&&age90>=7)?' <span class="pill adm-stale">⏰ STALE · '+age90+'d waiting</span>':'';
      const dormLine90=c.status==='open'?'<br><span class="adm-age">⏳ Waiting '+(age90===0?'since today':(age90===1?'1 day':age90+' days'))+' — deposit to book <b>'+moneyFmt(depFor90(c.listTotal))+'</b>'+(Math.abs(depFor90(c.memberTotal)-depFor90(c.listTotal))>=0.01?' · member '+moneyFmt(depFor90(c.memberTotal)):'')+'</span>':'';
      return '<div class="card"><b>'+c.id+'</b> '+badge+stalePill90+'<br><span class="mut">'+items+'</span><br>Total <b>'+moneyFmt(c.listTotal)+'</b> • member '+moneyFmt(c.memberTotal)+dormLine90+(c.customerName?' • for '+escHtml(c.customerName):'')+(c.payState?'<br><span class="mut">💰 Deposit '+moneyFmt(c.payState.deposit)+' in (40%) · balance '+moneyFmt(c.payState.balance)+(c.payState.balancePaid?' PAID ✓':' due at completion')+'</span>'+(c.payState.adjustments&&c.payState.adjustments.length?'<br><span class="mut">🧾 '+c.payState.adjustments.map(function(a){ return (a.delta<0?'-':'+')+moneyFmt(Math.abs(a.delta))+(a.note?' — '+escHtml(a.note):''); }).join(' · ')+'</span>':''):'')+'<div style="margin-top:8px"><button type="button" class="ghost" onclick="copyCartLink(\''+c.id+'\')">Copy link</button>'+(c.status==='open'?' <button type="button" class="ghost" onclick="editCart(\''+c.id+'\')">Edit</button>':'')+(c.payState&&!c.payState.balancePaid?' <button type="button" class="ghost" onclick="adjustCartBalance(\''+c.id+'\')">Adjust balance</button> <button type="button" class="ghost" onclick="addCartTravel(\''+c.id+'\')">+ Travel $25</button>':'')+' <a href="'+c.link+'" target="_blank" rel="noopener">Open</a>'+(c.status==='open'?' <button type="button" class="ghost" onclick="cancelCart(\''+c.id+'\')">Cancel cart</button>':'')+'</div></div>';
    }).join('');
  }catch(e){ box.innerHTML=''; }
}
async function cancelCart(idv){
  if(!await appConfirm('Cancel this cart link? The customer will no longer be able to pay it.')) return;
  try{ await api('/api/admin/carts/'+idv+'/cancel',{method:'POST', body:JSON.stringify({})}); loadAdminCarts(); }
  catch(e){ alert(e.message); }
}
// v69: adjust the balance of a BOOKED (deposit-paid) order — materials
// at cost only, labor never. The original cart lines stay sealed; the
// adjustment is a signed line the customer sees on his own link.
async function adjustCartBalance(idv){
  const amt=await appPrompt('Balance adjustment in dollars — the materials difference, at cost.\nPositive adds (e.g. 35), negative reduces (e.g. -20). Labor is never adjusted here.');
  if(amt===null || amt===undefined || String(amt).trim()==='') return;
  const delta=parseFloat(String(amt).replace(/[^0-9.\-]/g,''));
  if(!isFinite(delta) || delta===0){ alert('Enter a non-zero dollar amount.'); return; }
  const note=await appPrompt('Note the customer will see on his link (e.g. Updated materials: cable roll + valves, at cost):');
  if(note===null) return;
  // v95: Gabriel's pickup call — when WE go buy the materials, the run
  // is a paid service: $15 flat + 3% of this materials amount, as its
  // own never-discounted lines on the customer's link. Asked ONLY on a
  // positive adjustment and OFF unless he taps yes here — never
  // automatic, decided case by case. Label follows the app EN|ES
  // toggle like every other string.
  let pickup=false;
  if(delta>0){ pickup=await appConfirm((menuLang()==='es'?'Nosotros compramos los materiales (+$15 + 3%)':'We pick up the materials (+$15 + 3%)')+'?\nTap yes only if the Team goes to buy/pick up these materials: the customer pays the $15 pickup service plus 3% of this materials amount — both land as their own lines on his link, never discounted.'); }
  if(!await appConfirm('Apply '+(delta<0?'-':'+')+moneyFmt(Math.abs(delta))+' to '+idv+'?\nHis link shows the new balance right away.')) return;
  try{
    const d=await api('/api/admin/carts/'+idv+'/adjust-balance',{method:'POST', body:JSON.stringify({ delta:delta, note:(note||'').trim(), pickup:pickup })});
    alert('Done — '+idv+' balance is now '+moneyFmt(d.cart.payState.balance)+' (total '+moneyFmt(d.cart.payState.total)+').');
    loadAdminCarts();
  }catch(e){ alert(e.message); }
}
// v80.20: Gabriel's travel call (2026-11-01) — ONE tap adds the sealed
// +$25 travel line to the BALANCE of a booked order. Never automatic,
// never upfront, never discounted: the server forces the amount and
// the customer's language; this button only carries his decision.
async function addCartTravel(idv){
  if(!await appConfirm('Add the $25 travel charge to '+idv+'?\nIt lands on the balance due at completion, and the customer sees the Travel line on his link right away.')) return;
  try{
    const d=await api('/api/admin/carts/'+idv+'/adjust-balance',{method:'POST', body:JSON.stringify({ travel:true })});
    alert('Done — '+idv+' balance is now '+moneyFmt(d.cart.payState.balance)+' (total '+moneyFmt(d.cart.payState.total)+').');
    loadAdminCarts();
  }catch(e){ alert(e.message); }
}
// ---------- Admin membership invites (v60) ----------
async function createInvite(){
  var name=document.getElementById('invName').value.trim();
  if(!name){ alert('Add the customer name first.'); return; }
  try{
    const d=await api('/api/admin/invites',{method:'POST', body:JSON.stringify({ name:name, email:document.getElementById('invEmail').value.trim(), phone:document.getElementById('invPhone').value.trim(), cartId:document.getElementById('invCartId').value.trim() })});
    const inv=d.invite;
    document.getElementById('inviteLinkOut').innerHTML='<b>Invitation for '+escHtml(inv.name)+':</b> first month FREE, then $29/mo — link good 7 days: <a href="'+inv.link+'" target="_blank" rel="noopener">'+inv.link+'</a> <button type="button" class="ghost" onclick="copyInviteLink(\''+inv.id+'\')">Copy link</button>'+(inv.cartId?'<br><span class="mut">Also live inside his cart: the free month shows on the HomeCare option of cart '+escHtml(inv.cartId)+' — you can just send him his cart link.</span>':'');
    ['invName','invEmail','invPhone','invCartId'].forEach(function(i){ document.getElementById(i).value=''; });
    loadAdminInvites();
  }catch(e){ alert(e.message); }
}
function copyInviteLink(idv){
  var url=location.origin+'/join/'+idv;
  function done(){ alert('Invitation link copied:\n'+url); }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(function(){ prompt('Copy the invitation link:',url); }); }
  else prompt('Copy the invitation link:',url);
}
async function attachInvite(idv){
  var cid=await appPrompt('Cart ID to put this free month in (e.g. CRT-511F03):');
  if(!cid) return;
  try{ await api('/api/admin/invites/'+idv+'/attach',{method:'POST', body:JSON.stringify({ cartId:cid.trim() })}); loadAdminInvites(); }
  catch(e){ alert(e.message); }
}
async function revokeInvite(idv){
  if(!await appConfirm('Revoke this invitation? The link will stop working.')) return;
  try{ await api('/api/admin/invites/'+idv+'/revoke',{method:'POST', body:JSON.stringify({})}); loadAdminInvites(); }
  catch(e){ alert(e.message); }
}
async function loadAdminInvites(){
  const box=document.getElementById('adminInvites'); if(!box || !me || me.role!=='admin') return;
  try{
    const d=await api('/api/admin/invites');
    if(!(d.invites||[]).length){ box.innerHTML=''; return; }
    box.innerHTML=d.invites.map(function(iv){
      const badge=iv.status==='accepted'?'<span class="pill" style="background:#1a7f37">member ✓</span>':(iv.status==='expired'?'<span class="pill" style="background:#6b6762">expired</span>':(iv.status==='revoked'?'<span class="pill" style="background:#6b6762">revoked</span>':'<span class="pill" style="background:#b26a00">waiting</span>'));
      return '<div class="card"><b>'+escHtml(iv.name)+'</b> '+badge+'<br><span class="mut">🎟️ First month FREE, then $29/mo • created '+escHtml(String(iv.createdAt||'').slice(0,10))+(iv.email?' • '+escHtml(iv.email):'')+(iv.phone?' • '+escHtml(iv.phone):'')+(iv.cartId?' • in his cart '+escHtml(iv.cartId):'')+'</span><div style="margin-top:8px"><button type="button" class="ghost" onclick="copyInviteLink(\''+iv.id+'\')">Copy link</button> <a href="'+iv.link+'" target="_blank" rel="noopener">Open</a>'+(iv.status==='pending'?' <button type="button" class="ghost" onclick="attachInvite(\''+iv.id+'\')">Put it in his cart…</button> <button type="button" class="ghost" onclick="revokeInvite(\''+iv.id+'\')">Revoke</button>':'')+'</div></div>';
    }).join('');
  }catch(e){ box.innerHTML=''; }
}
// ---------- Admin master map (v41) ----------
// Gabriel's master map: ONE Leaflet map with every ACTIVE worker who is
// currently sharing his logged-in location (feed: /api/admin/worker-
// locations — fresh points only, stale/offline excluded server-side)
// plus the destinations of today's active jobs. Worker pins use the
// same brand treatment as the customer tracking map: photo avatar with
// the hammer badge, or the hammer pin when he has no photo. This feed
// is ADMIN-ONLY — customers never see it.
let adminMasterMap = null;
let adminMapLoading = false;
let adminMapSig = ''; // v80.6: signature of the inputs the live master map was built from
let adminMapRO = null; // v75: ResizeObserver watching the map container
let leafletTried = false;
// v75 MAP: ONE bilingual fallback for every map failure (Leaflet missing,
// tiles blocked, bad init). The master map must NEVER fail as a silent
// grey box again — Gabriel has never been able to see it, and a blank
// rectangle gives him nothing to report. The list above it always works.
function adminMapFallbackHtml(){
  return '<div style="padding:16px" class="mut">El mapa no cargó — revisa tu conexión; la lista de arriba muestra quién está compartiendo. / The map could not load — check your connection; the list above shows who is sharing.<br><button type="button" class="ghost" style="margin-top:10px;padding:9px 18px;font-weight:700" onclick="loadAdminMap(null,true)">Reintentar · Retry</button></div>';
}
// v65: self-heal a missing Leaflet (the audit browser hit "map
// unavailable" because the CDN script never landed). Re-inject the script
// once and wait for it, instead of giving up on the first check.
function ensureLeaflet(){
  return new Promise(function(res){
    if (window.L && L.map) return res(true);
    if (!leafletTried) {
      leafletTried = true;
      try { const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; document.head.appendChild(s); } catch(e) {}
    }
    let n = 0;
    const iv = setInterval(function(){
      n++;
      if ((window.L && L.map) || n >= 24) { clearInterval(iv); res(!!(window.L && L.map)); }
    }, 200);
  });
}
// v46 MAP FIX (Gabriel: "el mapa no me funciona en admin"): the old code
// created the Leaflet map inline during loadAdmin's async chain with no
// size correction and set the view only AFTER adding markers. If the
// container had zero size at init (route transition / panel not yet laid
// out on the phone) Leaflet locked onto a 0x0 viewport and painted a
// silent grey box; and any throw while adding a marker (bad coords)
// skipped setView entirely, which also renders as an empty grey map.
// The fix: build the list FIRST (it is the primary content), create the
// map only once the box is actually laid out, set the Solano County
// default view BEFORE any marker, add markers one-by-one with numeric
// validation, and always invalidateSize() once visible.
function adminMapWhenVisible(el, cb) {
  let tries = 0;
  const tick = function () {
    if (!document.contains(el)) return; // a reload replaced the box — the new load wins
    if ((el.clientWidth > 0 && el.clientHeight > 0) || tries >= 50) { cb(); return; }
    tries++; requestAnimationFrame(tick);
  };
  tick();
}
// v80.6: the signature of everything the master map SHOWS — which
// techs are sharing (id, name, has-photo, coords rounded to ~11 m so
// GPS jitter at a standstill does not count as movement) and which of
// today's job destinations are pinned. updatedAt is deliberately NOT
// in the signature: a fresher timestamp at the same spot changes
// nothing on the map (the list above it is a snapshot either way).
function adminMapSignature(liveWorkers, jobPins){
  const w = (liveWorkers || []).map(function(w){
    const ph = w.photo ? String(w.photo).length + ':' + String(w.photo).slice(0, 12) : '';
    return [w.id || '', w.name || '', ph, Math.round(Number(w.lat) * 10000), Math.round(Number(w.lng) * 10000)].join(':');
  }).sort().join('|');
  const j = (jobPins || []).map(function(j){
    return [j.id || '', Math.round(Number(j.destLat) * 10000), Math.round(Number(j.destLng) * 10000), j.status || ''].join(':');
  }).sort().join('|');
  return w + '#' + j;
}
async function loadAdminMap(preloadedJobs, force){
  const box = document.getElementById('adminMapBox'); if (!box || !me || me.role !== 'admin') return;
  if (adminMapLoading) return;
  // v80.8: paint the section shell IMMEDIATELY when no live map is on
  // screen — heading + loading note — so the panel never sits blank
  // while the data reads are in flight. The shell deliberately carries
  // no map element; the real paint below replaces it wholesale.
  let mapAliveNow = false;
  try { mapAliveNow = !!adminMasterMap && !!adminMasterMap.getContainer() && document.contains(adminMasterMap.getContainer()); } catch(e) {}
  if (!mapAliveNow) box.innerHTML = '<h3>' + CU('mapTitle') + '</h3><div class="card"><p class="mut">' + CU('mapLoading') + '</p></div>';
  adminMapLoading = true;
  try {
    // v80.8: both reads fire together — the old sequential awaits made
    // the map wait for two full round trips before painting anything.
    const parD = await Promise.all([
      api('/api/admin/worker-locations').catch(function(){ return null; }),
      Array.isArray(preloadedJobs) ? Promise.resolve(null) : api('/api/jobs').catch(function(){ return null; })
    ]);
    let wk = (parD[0] && parD[0].workers) || [];
    let jobs = Array.isArray(preloadedJobs) ? preloadedJobs : ((parD[1] && parD[1].jobs) || []);
    const today = new Date().toISOString().slice(0, 10);
    const jobPins = jobs.filter(function(j){ return j.destLat != null && j.destLng != null && isFinite(Number(j.destLat)) && isFinite(Number(j.destLng)) && ['Done — photos sent', 'Cancelled', 'Canceled'].indexOf(j.status) === -1 && (!j.schedDate || j.schedDate === today); });
    const liveWorkers = wk.filter(function(w){ return isFinite(Number(w.lat)) && isFinite(Number(w.lng)); });
    // v80.6 NO CHURN: when nothing map-relevant changed since the
    // last build, the live map — and its already-downloaded tiles —
    // stays exactly as it is. loadAdmin() fires after nearly every
    // admin action and every job-status stream event; rebuilding
    // here re-downloaded every tile every time and could keep the
    // map permanently inside its loading window on a limited plan.
    const sig = adminMapSignature(liveWorkers, jobPins);
    if (!force && adminMapSig && sig === adminMapSig && adminMasterMap) {
      let mapAlive = false;
      try { mapAlive = !!adminMasterMap.getContainer() && document.contains(adminMasterMap.getContainer()); } catch(e) {}
      if (mapAlive) return;
    }
    const listHtml = liveWorkers.length
      ? liveWorkers.map(function(w){ return '<div style="padding:4px 0">' + avatarHtml(w.photo, w.name, 28) + ' <b>' + escHtml(w.name) + '</b> <span class="mut">📍 ' + escHtml(agoText(w.updatedAt)) + '</span></div>'; }).join('')
      : '<p class="mut">Ningún técnico está compartiendo ubicación ahora / No technician is sharing location right now.</p>';
    const emptyNote = (!liveWorkers.length && !jobPins.length)
      ? '<p class="mut" style="margin:0 0 8px">El mapa muestra Solano County — en cuanto un técnico activo comparta su ubicación, su pin aparece aquí. / Showing Solano County — as soon as an active technician shares his location, his pin appears here.</p>' : '';
    box.innerHTML = '<h3>Mapa maestro / Master map</h3><div class="card">'
      + '<div>' + listHtml + '</div>'
      + (jobPins.length ? '<p class="mut">🏠 = destino de un trabajo activo de hoy / an active job destination today (' + jobPins.length + ')</p>' : '')
      + emptyNote
      + '<div id="adminMap" style="height:380px;border-radius:12px;overflow:hidden;background:#17171b;margin-top:8px"></div>'
      + '</div>';
    adminMapSig = sig;
    if (adminMasterMap) { try { adminMasterMap.remove(); } catch(e) {} adminMasterMap = null; }
    if (adminMapRO) { try { adminMapRO.disconnect(); } catch(e) {} adminMapRO = null; }
    const mapEl = document.getElementById('adminMap');
    if (!(window.L && L.map)) await ensureLeaflet();
    if (!(window.L && L.map) || !mapEl) { if (mapEl) mapEl.innerHTML = adminMapFallbackHtml(); return; }
    adminMapWhenVisible(mapEl, function () {
      try {
        const map = L.map(mapEl);
        adminMasterMap = map;
        // Default view FIRST — Solano County (Fairfield) — before any
        // marker can throw or the bounds logic runs.
        map.setView([38.25, -122.04], 10);
        // v80.6 TILE HEALTH (evolves the v75 cure): the old 7 s
        // first-tile deadline painted the failure fallback whenever
        // Gabriel's connection was merely SLOW — the first impression
        // read as "the map is broken" even though the tiles were on
        // their way. Now the waiting state (with a small bilingual
        // loading note) PERSISTS while tiles are in flight; genuine
        // tile ERRORS earn exactly ONE fresh-layer retry; the
        // bilingual fallback paints only when tiles still have not
        // loaded after that, or a 30 s hard deadline passes with
        // zero tiles. Once a single tile lands, the map is healthy
        // and every timer stands down. (The v75 ResizeObserver below
        // still re-measures on any size change for the map's life.)
        let tileLayer = null, tilesOk = 0, tilesErr = 0, tileRetried = false, tileGaveUp = false;
        let tileSoftTimer = null, tileHardTimer = null;
        function tileGiveUp(){
          if (tileGaveUp || adminMasterMap !== map) return; tileGaveUp = true;
          adminMasterMap = null; adminMapSig = '';
          try { map.remove(); } catch(e) {}
          if (adminMapRO) { try { adminMapRO.disconnect(); } catch(e) {} adminMapRO = null; }
          mapEl.innerHTML = adminMapFallbackHtml();
        }
        function wireTileLayer(){
          tileLayer.on('tileload', function(){
            tilesOk++;
            if (tilesOk === 1) {
              if (tileSoftTimer) clearTimeout(tileSoftTimer);
              if (tileHardTimer) clearTimeout(tileHardTimer);
              const note = mapEl.querySelector('.map-loading-note'); if (note) note.remove();
            }
          });
          tileLayer.on('tileerror', function(){ tilesErr++; });
        }
        tileLayer = ghsTileLayer().addTo(map); wireTileLayer();
        mapEl.insertAdjacentHTML('beforeend', '<div class="map-loading-note" style="position:absolute;z-index:1200;left:10px;bottom:10px;background:rgba(10,10,12,.88);color:#e8e8ea;border-radius:8px;padding:4px 10px;font-size:12px;pointer-events:none">' + CU('mapLoading') + '</div>');
        tileSoftTimer = setTimeout(function(){
          if (tileGaveUp || tilesOk > 0 || adminMasterMap !== map) return;
          if (tilesErr > 0 && !tileRetried) { // genuine errors: ONE fresh-layer retry, then keep waiting
            tileRetried = true; tilesErr = 0;
            try { map.removeLayer(tileLayer); } catch(e) {}
            tileLayer = ghsTileLayer().addTo(map); wireTileLayer();
          }
          // no errors + no tiles yet = a slow connection, not a broken map: keep waiting
        }, 9000);
        tileHardTimer = setTimeout(function(){
          if (tileGaveUp || tilesOk > 0 || adminMasterMap !== map) return;
          tileGiveUp();
        }, 30000);
        const pts = [];
        liveWorkers.forEach(function(w){ try { const m = L.marker([Number(w.lat), Number(w.lng)], { icon: w.photo ? photoIcon(w.photo) : hammerPinIcon() }).addTo(map); m.bindPopup('<b>' + escHtml(w.name) + '</b><br>📍 ' + escHtml(agoText(w.updatedAt))); pts.push([Number(w.lat), Number(w.lng)]); } catch(e) {} });
        jobPins.forEach(function(j){ try { const m = L.marker([Number(j.destLat), Number(j.destLng)], { icon: pinIcon('🏠') }).addTo(map); m.bindPopup('<b>' + escHtml(j.service || 'Job') + '</b><br>' + escHtml(j.city || '') + ' · ' + escHtml(j.status || '')); pts.push([Number(j.destLat), Number(j.destLng)]); } catch(e) {} });
        if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
        else if (pts.length === 1) map.setView(pts[0], 12);
        // The permanent cure for the zero-size init: re-measure now that
        // the panel is laid out, and once more after late layout shifts.
        try { map.invalidateSize(); } catch(e) {}
        setTimeout(function () { try { if (adminMasterMap === map) map.invalidateSize(); } catch(e) {} }, 400);
        if (window.ResizeObserver) {
          try {
            adminMapRO = new ResizeObserver(function(){ try { if (adminMasterMap === map) map.invalidateSize(); } catch(e) {} });
            adminMapRO.observe(mapEl);
          } catch(e) {}
        }
      } catch(e) {
        if (mapEl) mapEl.innerHTML = adminMapFallbackHtml();
      }
    });
  } catch(e) {
    box.innerHTML = '<h3>Mapa maestro / Master map</h3><div class="card"><p class="mut">El mapa no cargó. / The map could not load.</p></div>';
  } finally { adminMapLoading = false; }
}
// ---------- Admin captains (v40) ----------
function capUsd(n){ return '$' + Number(n || 0).toFixed(2); }
async function loadAdminCaptains(){
  const el = document.getElementById('adminCaptains'); if(!el) return;
  try{
    const d = await api('/api/admin/captains');
    const selOpts = function(selId){ return '<option value=""' + (!selId ? ' selected' : '') + '>Sin capitán / No captain</option>' + (d.workers || []).map(function(w){ return '<option value="' + w.id + '"' + (w.id === selId ? ' selected' : '') + '>' + escHtml(w.name) + '</option>'; }).join(''); };
    el.innerHTML = (d.areas || []).map(function(a){
      const capLine = a.fixed
        ? '<b>El General</b> <span class="mut">(el dueño — su base; no se asigna, no acumula override)</span>'
        : (a.captainId ? '<b>' + escHtml(a.captainName || '') + '</b> — Capitán / Captain' : '<span class="mut">Sin capitán / No captain</span>');
      const moneyLine = (!a.fixed && a.captainId) ? '<br>Override acumulado: <b>' + capUsd(a.accrued) + '</b> · Pagado: ' + capUsd(a.paidOut) : '';
      const controls = a.fixed ? '' :
        '<div style="margin-top:8px"><select id="capSel-' + a.id + '">' + selOpts(a.captainId) + '</select> <button class="btn alt" onclick="capAssign(\'' + a.id + '\')">Assign captain</button>'
        + (a.captainId ? ' <button class="btn alt" onclick="capUnassign(\'' + a.id + '\')">Unassign</button>' : '') + '</div>'
        + (a.captainId ? '<div style="margin-top:6px"><input id="capPay-' + a.id + '" type="number" min="0" step="0.01" placeholder="Amount you paid him ($)" style="max-width:200px"> <button class="btn alt" onclick="capMarkPaid(\'' + a.id + '\',\'' + a.captainId + '\')">Mark override paid</button></div>' : '');
      const registry = '<div style="margin-top:8px"><span class="mut">Cities:</span> <input id="capCities-' + a.id + '" value="' + escHtml((a.cities || []).join(', ')) + '" style="min-width:280px"> <button class="btn alt" onclick="capSaveCities(\'' + a.id + '\')">Save cities</button>'
        + (a.fixed ? '' : ' <button class="btn alt" onclick="capDeleteArea(\'' + a.id + '\')">Delete area</button>') + '</div>';
      return '<div class="card"><b>' + escHtml(a.name) + '</b><br>' + capLine + moneyLine + controls + registry + '</div>';
    }).join('') || '<p class="mut">No areas yet.</p>';
  }catch(e){ el.innerHTML = '<p class="mut">' + escHtml(e.message) + '</p>'; }
}
async function capAssign(areaId){
  const sel = document.getElementById('capSel-' + areaId);
  if(!sel || !sel.value){ alert('No active worker to assign.'); return; }
  try{ await api('/api/admin/captains/assign', { method: 'POST', body: JSON.stringify({ areaId: areaId, workerId: sel.value }) }); loadAdminCaptains(); }
  catch(e){ alert(e.message); }
}
async function capUnassign(areaId){
  if(!await appConfirm('Unassign the captain of this area? Override he already accrued stays his.')) return;
  try{ await api('/api/admin/captains/unassign', { method: 'POST', body: JSON.stringify({ areaId: areaId }) }); loadAdminCaptains(); }
  catch(e){ alert(e.message); }
}
async function capSaveCities(areaId){
  const inp = document.getElementById('capCities-' + areaId);
  const cities = (inp.value || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if(!cities.length){ alert('An area must cover at least one city.'); return; }
  try{ await api('/api/admin/captains/areas/' + areaId, { method: 'PATCH', body: JSON.stringify({ cities: cities }) }); loadAdminCaptains(); }
  catch(e){ alert(e.message); }
}
async function capCreateArea(){
  const name = document.getElementById('capAreaName').value.trim();
  const cities = document.getElementById('capAreaCities').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if(!name || !cities.length){ alert('Area name and at least one city are required.'); return; }
  try{ await api('/api/admin/captains/areas', { method: 'POST', body: JSON.stringify({ name: name, cities: cities }) }); document.getElementById('capAreaName').value = ''; document.getElementById('capAreaCities').value = ''; loadAdminCaptains(); }
  catch(e){ alert(e.message); }
}
async function capDeleteArea(areaId){
  if(!await appConfirm('Delete this area? Its captain (if any) is unassigned. Accrued override history is kept.')) return;
  try{ await api('/api/admin/captains/areas/' + areaId, { method: 'DELETE' }); loadAdminCaptains(); }
  catch(e){ alert(e.message); }
}
async function capMarkPaid(areaId, captainId){
  const inp = document.getElementById('capPay-' + areaId);
  const amount = Number(inp && inp.value);
  if(!(amount > 0)){ alert('Enter the amount you paid him.'); return; }
  if(!await appConfirm('Mark ' + capUsd(amount) + ' of this captain\'s override as PAID? (You pay it out by hand — the app only records it.)')) return;
  try{ await api('/api/admin/captains/payout', { method: 'POST', body: JSON.stringify({ captainId: captainId, amount: amount }) }); loadAdminCaptains(); }
  catch(e){ alert(e.message); }
}
// ---------- Admin ratings (v25, C1) ----------
async function loadAdminRatings(){
  const el=document.getElementById('adminRatings'); if(!el) return;
  try{
    const d=await api('/api/admin/ratings');
    el.innerHTML = '<p class="mut">' + (d.count ? ('Average: <b>' + d.average + ' ★</b> across ' + d.count + ' rated job' + (d.count === 1 ? '' : 's') + '. Published reviews show on the storefront under "Neighbors approve" — only jobs that are done AND paid can be rated.') : 'No ratings yet — they appear here when a customer rates a completed job.') + '</p>' +
      (d.reviews || []).map(function(rv){
        return '<div class="card"><b>' + '★'.repeat(rv.stars) + '☆'.repeat(5 - rv.stars) + '</b> — ' + escHtml(rv.service) + ' (' + escHtml(rv.city) + ')<br>' +
          (rv.text ? '<span>&ldquo;' + escHtml(rv.text) + '&rdquo;</span><br>' : '') +
          '<span class="pill">' + (rv.published ? 'Published' : 'Not published') + '</span> <button class="ghost" onclick="toggleReviewPublished(\'' + rv.jobId + '\',' + (!rv.published) + ')">' + (rv.published ? 'Unpublish' : 'Publish') + '</button></div>';
      }).join('');
  }catch(e){}
}
async function loadAdminAudit(){
  const el=document.getElementById('adminAudit'); if(!el) return;
  try{
    const d=await api('/api/admin/audit');
    const es=d.entries||[];
    el.innerHTML = es.length ? es.map(function(e){ return '<div class="card" style="padding:8px 12px;margin-bottom:6px"><span class="mut">'+escHtml(new Date(e.at).toLocaleString())+'</span> — <b>'+escHtml(e.action)+'</b>'+(e.target?' '+escHtml(e.target):'')+(e.detail?' · '+escHtml(e.detail):'')+'<br><span class="mut">'+escHtml(e.actorEmail||'system / customer action')+'</span></div>'; }).join('') : '<div class="empty"><p class="mut">No activity logged yet — actions you take in this panel will appear here.</p></div>';
  }catch(e){}
}
async function toggleReviewPublished(idv, pub){
  try{ await api('/api/jobs/' + idv, { method: 'PATCH', body: JSON.stringify({ reviewPublished: pub }) }); loadAdminRatings(); loadAdminJobs(); }
  catch(e){ alert(e.message); }
}
async function postFromRequest(idv, custPrice){
  const pay=document.getElementById('jp-'+idv).value;
  const extra=document.getElementById('jn-'+idv).value;
  const payN=Number(pay);
  if(!payN || payN<=0){ alert('Set the worker pay first.'); return; }
  if(!await appConfirm('Post this job to the workers?\n\nWorker pay: $'+payN+'\nCustomer price: $'+custPrice+'\nExtra info for the worker: '+(extra||'—')+'\n\nActive workers in the area get notified right away.')) return;
  try{ await api('/api/requests/'+idv+'/create-job',{method:'POST', body:JSON.stringify({payOffer:payN, notes:extra})}); loadAdminRequests(); loadAdminJobs(); loadCalendar(); }
  catch(e){ alert(e.message); }
}
let adminWorkersCache=[];
function skillRankHtml(w){
  const skills=((w.profile||{}).skills||w.skills||[]);
  if(!skills.length) return '';
  const ranks=w.teamRanks||{};
  const selfR=(w.profile||{}).selfRatings||{};
  let sum=0,cnt=0;
  const rows=skills.map(function(s){
    const r=ranks[s]||0; if(r>0){sum+=r;cnt++;}
    const sq=(''+s).replace(/'/g,"\\'");
    let stars='';
    for(let i=1;i<=5;i++){ stars+='<button class="ghost" style="padding:2px 7px;min-width:0" title="'+i+'" onclick="rankSkill(\''+w.id+'\',\''+sq+'\','+i+')">'+(i<=r?'\u2605':'\u2606')+'</button>'; }
    const selfTag=selfR[s] ? ' <span class="mut">· self '+selfR[s]+'/10</span>' : '';
    return '<span style="display:inline-block;margin:3px 10px 3px 0;white-space:nowrap"><b>'+(''+s).replace(/</g,'&lt;')+'</b> '+stars+selfTag+'</span>';
  }).join('');
  const avg=cnt?(' — avg '+(sum/cnt).toFixed(1)+'/5'):'';
  return '<br><span class="mut">Team skill ranks (private \u2014 workers never see this)</span>'+avg+'<br>'+rows;
}
async function rankSkill(wid, skill, stars){
  const w=adminWorkersCache.find(function(x){return x.id===wid;});
  const cur=Object.assign({},(w&&w.teamRanks)||{});
  if(stars===(cur[skill]||0)) delete cur[skill]; else cur[skill]=stars;
  try{ await api('/api/workers/'+wid,{method:'PATCH',body:JSON.stringify({skillRanks:cur})}); }
  catch(e){ alert(e.message); }
  loadAdminWorkers();
}
// ---------- Worker trade boxes in the admin card (v41) ----------
// The worker's 7 self-rated boxes (level + tools) with the Team's
// VERIFIED level beside them ("dice 4 · verificado 3"). Gabriel sets or
// clears the verified level per trade; effective = verified ?? self.
function workerTradesHtml(w){
  const view = w.tradeSkills || {};
  const av = w.availability || { preset: 'anytime', days: [], paused: false };
  const dayShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const avLine = '<br><span class="mut">' + WT('availAdmin') + '</span> ' + (av.paused ? '<span class="pill">' + WT('inPause') + '</span> ' : '') + escHtml(av.preset || 'anytime') + (av.preset === 'custom' && (av.days || []).length ? ' (' + av.days.map(function(d){ return dayShort[d]; }).join(', ') + ')' : '');
  const anyRated = TRADE_KEYS_CLIENT.some(function(k){ return !!view[k]; });
  if (!anyRated) return avLine + '<br><span class="mut">' + WT('tradesAdminLabel') + '</span> <b>' + WT('notRatedYet') + '</b> <span class="mut">' + WT('notRatedNote') + '</span>';
  const rows = TRADE_KEYS_CLIENT.map(function(k){
    const e = view[k];
    if (!e) return '<span style="display:inline-block;margin:3px 10px 3px 0;white-space:nowrap"><b>' + wTradeName(k) + '</b> <span class="mut">—</span></span>';
    const dice = (e.verified != null && e.level != null && e.verified !== e.level) ? ' <span class="mut">· ' + WT('diceWord') + ' ' + e.level + ' · ' + WT('verifiedWord') + ' ' + e.verified + '</span>' : (e.verified != null ? ' <span class="mut">· ' + WT('verifiedWord') + ' ✓</span>' : '');
    let opts = '<option value="0">' + WT('verifOpt') + '</option>';
    for (let i = 1; i <= 5; i++) opts += '<option value="' + i + '"' + (e.verified === i ? ' selected' : '') + '>' + i + '</option>';
    return '<span style="display:inline-block;margin:3px 10px 3px 0;white-space:nowrap"><b>' + wTradeName(k) + '</b> ★' + (e.effective != null ? e.effective : '—') + (e.tools ? ' 🔧' : '') + dice + ' <select style="width:86px;display:inline-block" onchange="adminSetVerified(\'' + w.id + '\',\'' + k + '\',this.value)">' + opts + '</select></span>';
  }).join('');
  return avLine + '<br><span class="mut">' + WT('tradesNoteAdmin') + '</span><br>' + rows;
}
async function adminSetVerified(wid, key, val){
  const body = { tradeVerified: {} };
  body.tradeVerified[key] = parseInt(val, 10) || 0;
  try{ await api('/api/workers/' + wid, { method: 'PATCH', body: JSON.stringify(body) }); }
  catch(e){ alert(e.message); }
  loadAdminWorkers();
}
async function setWorker(idv, status){ try{ await api('/api/workers/'+idv,{method:'PATCH', body:JSON.stringify({status})}); }catch(e){ alert(e.message); } loadAdminWorkers(); loadAdminCaptains(); loadAdminMap(); }
async function setWorkerClassAdmin(wid, cls){ try{ await api('/api/workers/'+wid,{method:'PATCH', body:JSON.stringify({workerClass:cls})}); }catch(e){ alert(e.message); } loadAdminWorkers(); }
async function removeWorkerPhoto(wid){ if(!await appConfirm('Remove this worker\u2019s profile photo? He can upload a new one from his profile.')) return; try{ await api('/api/workers/'+wid,{method:'PATCH', body:JSON.stringify({photo:null})}); loadAdminWorkers(); loadAdminMap(); }catch(e){ alert(e.message); } }
function escAttr(v){ return (''+(v||'')).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function editWorkerForm(idv){
  const w = adminWorkersCache.find(function(x){return x.id===idv;});
  const box = document.getElementById('editWorker-'+idv);
  if(!w || !box) return;
  const pf = w.profile||{};
  function inp(idv2, label, val){ return '<label style="display:block;margin:5px 0"><span class="mut">'+label+'</span><br><input id="'+idv2+'" value="'+escAttr(val)+'" style="width:100%;max-width:420px"></label>'; }
  box.innerHTML = '<div style="border-top:1px dashed #33333b;margin-top:8px;padding-top:8px">'
    + inp('ew-name-'+idv,'Name',w.name)
    + inp('ew-phone-'+idv,'Phone',w.phone)
    + inp('ew-email-'+idv,'Email (their login)',w.email)
    + inp('ew-city-'+idv,'City',pf.city)
    + inp('ew-skills-'+idv,'Skills (comma separated)',((pf.skills||w.skills||[]).join(', ')))
    + inp('ew-exp-'+idv,'Experience',pf.experience)
    + inp('ew-veh-'+idv,'Vehicle',pf.vehicleStyle||w.vehicle)
    + inp('ew-notes-'+idv,'Notes (Team only)',pf.notes)
    + '<button class="black" onclick="saveWorkerEdit(\''+idv+'\')">Save changes</button> <button class="ghost" onclick="loadAdminWorkers()">Cancel</button></div>';
}
async function saveWorkerEdit(idv){
  const v = function(i){ const el=document.getElementById(i); return el?el.value:''; };
  const skills = v('ew-skills-'+idv).split(',').map(function(s){return s.trim();}).filter(Boolean);
  try{
    await api('/api/workers/'+idv,{method:'PATCH',body:JSON.stringify({
      name:v('ew-name-'+idv), phone:v('ew-phone-'+idv), email:v('ew-email-'+idv),
      profile:{city:v('ew-city-'+idv), skills:skills, experience:v('ew-exp-'+idv), vehicleStyle:v('ew-veh-'+idv), notes:v('ew-notes-'+idv)}
    })});
    loadAdminWorkers(); loadAdminMap();
  }catch(e){ alert(e.message); }
}
async function delRequest(idv){ if(!await appConfirm('Delete quote/request '+idv+'? This removes the request and its messages for good.')) return; await api('/api/requests/'+idv,{method:'DELETE'}); loadAdminRequests(); loadCalendar(); }
async function delJob(idv){ if(!await appConfirm('Cancel job '+idv+'? Workers will no longer see it.')) return; await api('/api/jobs/'+idv,{method:'DELETE'}); const jobsDel = await loadAdminJobs(); loadCalendar(); loadAdminMap(jobsDel); }
async function delWorker(idv, name){ if(!await appConfirm('Delete worker '+(name||idv)+'? This removes their account for good. Any job they claimed goes back to Open.')) return; await api('/api/workers/'+idv,{method:'DELETE'}); loadAdminWorkers(); const jobsDelW = await loadAdminJobs(); loadAdminCaptains(); loadAdminMap(jobsDelW); }
// ---------- Dispatch picker (v41) ----------
// For the service typed in the Create-a-job card, the server ranks the
// ACTIVE workers by their effective level + tools in that job's trade.
// Display + sort only — Gabriel picks; nothing auto-dispatches. Picking a
// worker makes it a DIRECT offer (silent): he alone is alerted in-app and
// by email. A paused worker triggers a clear warning, never a hard block.
let jCandCache = [];
let jCandTimer = null;
async function refreshJobCandidates(){
  const svcEl = document.getElementById('jService'); const sel = document.getElementById('jWorker'); const box = document.getElementById('jCand');
  if (!svcEl || !sel || !box || !me || me.role !== 'admin') return;
  const svc = svcEl.value.trim();
  if (!svc) { box.textContent = 'Escribe el servicio arriba y aquí salen los mejores para ese oficio. / Type the service above — best matches for that trade show here.'; return; }
  let d = null;
  try { d = await api('/api/admin/worker-candidates?service=' + encodeURIComponent(svc)); } catch (e) { return; }
  jCandCache = d.candidates || [];
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Open board (todos) —</option>' + jCandCache.map(function(c){ return '<option value="' + c.id + '">' + escHtml(c.name) + ' — ★' + (c.level != null ? c.level : '—') + (c.tools ? ' 🔧' : '') + (c.paused ? ' ⏸ EN PAUSA' : '') + '</option>'; }).join('');
  if (prev && jCandCache.some(function(c){ return c.id === prev; })) sel.value = prev;
  const tradeName = TRADE_NAMES_CLIENT[d.trade] || d.trade;
  box.innerHTML = '<b>Oficio / Trade: ' + escHtml(tradeName) + '</b><br>' + (jCandCache.map(function(c){
    const dice = (c.verified != null && c.selfLevel != null && c.verified !== c.selfLevel) ? ' (dice ' + c.selfLevel + ' · verificado ' + c.verified + ')' : (c.verified != null ? ' (verificado ✓)' : '');
    return '★' + (c.level != null ? c.level : '—') + (c.tools ? ' 🔧' : '') + dice + ' — ' + escHtml(c.name) + (c.city ? ' (' + escHtml(c.city) + ')' : '') + (c.paused ? ' <b>⏸ EN PAUSA</b>' : '');
  }).join('<br>') || 'Sin trabajadores activos todavía.');
}
function queueJobCandidates(){ if (jCandTimer) clearTimeout(jCandTimer); jCandTimer = setTimeout(refreshJobCandidates, 350); }
async function createJob(){
  const wid = (document.getElementById('jWorker') || {}).value || '';
  const body = {service:document.getElementById('jService').value, city:document.getElementById('jCity').value, when:document.getElementById('jWhen').value, schedDate:document.getElementById('jSchedDate').value, schedTime:document.getElementById('jSchedTime').value, description:document.getElementById('jDesc').value, payOffer:document.getElementById('jPay').value, customerPrice:document.getElementById('jCustPrice').value, customerName:document.getElementById('jName').value, customerPhone:document.getElementById('jPhone').value, address:document.getElementById('jAddr').value, notes:document.getElementById('jNotes').value};
  // v80.7 (form fix): the pay placeholder is an EXAMPLE, not a value — an
  // empty/invalid pay field must never post; the server also 400s it.
  const payNum = Number(body.payOffer);
  if (!body.payOffer || !payNum || payNum <= 0) { document.getElementById('jMsg').textContent = '⚠️ Falta el pago al trabajador (pay offer) — el ejemplo no es un valor. / Worker pay is required — the example is not a value.'; return; }
  if (wid) {
    const cand = jCandCache.find(function(c){ return c.id === wid; });
    if (cand && cand.paused && !await appConfirm('⚠️ ' + cand.name + ' está EN PAUSA (él mismo se puso no disponible).\n\n¿Ofrecerle el trabajo de todos modos? / He is PAUSED — offer anyway?')) return;
    body.assignedWorkerId = wid; body.silent = true; // direct offer: only he is alerted (in-app + email)
  }
  try{ await api('/api/jobs',{method:'POST', body:JSON.stringify(body)});
    document.getElementById('jMsg').textContent = wid ? 'Job offered directly to the selected worker.' : 'Job posted. Active workers can claim it now.'; document.getElementById('jSchedDate').value=''; document.getElementById('jSchedTime').value=''; const jobsNew = await loadAdminJobs(); loadCalendar(); loadAdminMap(jobsNew);
  }catch(e){ document.getElementById('jMsg').textContent=e.message; }
}
// v63: reopen at the technician door on devices that entered as one.
// v80.10.1: __ghsBootBounce marks a boot that THIS snippet bounced —
// loadMe() uses it to heal a stale flag (see there); a hash the visitor
// navigated to deliberately never sets it.
try{ if(!location.hash && localStorage.getItem('ghs_entry')==='worker'){ window.__ghsBootBounce = true; location.hash = '#worker'; } }catch(e){}
applyWorkerEntry();
let ghsPrevHash = location.hash || '';
let ghsJoinArmNav = false;
window.addEventListener('hashchange', function(){
  const h = location.hash || '';
  // v80.10.1: leaving a membership/join route for the plain home view
  // DISMISSES an armed join form — the auth card must not stay stuck over
  // the hero after the visitor navigates back. (beginInlineJoin arms the
  // form and then clears the hash itself; ghsJoinArmNav keeps that
  // transition from being mistaken for a navigation away.)
  if (!me && !ghsJoinArmNav && h === '' && (ghsPrevHash === '#memberships' || ghsPrevHash === '#yard-care' || !!MEMBERSHIP_JOIN_HASHES[ghsPrevHash])) {
    pendingJoin = null; pendingMembershipPlan = null; authRevealed = false; membershipDeepLinkKey = ''; joinPromo = null;
    if (curMode === 'join' || curMode === 'homecare') mode('login');
  }
  // v80.17 PUERTA PLUS: navigating to any OTHER route leaves the promo
  // view — the guest is never trapped in the door. (The arming flow
  // itself only ever clears the hash to '', and a join hash is the
  // entry, never an exit, so neither transition can misfire here.)
  if (joinPromo && h && !MEMBERSHIP_JOIN_HASHES[h]) { joinPromo = null; membershipDeepLinkKey = ''; }
  ghsJoinArmNav = false;
  ghsPrevHash = h;
  if (!routeNotifHash()) render();
});
// ---------- Menu checkout (added 2026-10-22, v32) ----------
// The REAL checkout behind the website's Order buttons: the customer fills
// their data right here, can add HomeCare (its own Stripe monthly
// subscription, created + confirmed first through the existing inline
// membership endpoints) and the 20% member price applies to THIS order at
// once. One card entry, one tap: subscription (if added) + the order
// total are both confirmed with the same card. v44: the order is PAID IN
// FULL right here — the old menu-order hold is gone.
const MENU_CATALOG = {
  // ---------- Carpintería (master list section 1) ----------
  'closet-doors': { name: 'Closet Doors (Pair)', meta: '~2.5 h · Per pair', price: 215, member: 172 },
  'door-slab-swap': { name: 'Door Slab Swap', meta: '~2 h · + lock install available', price: 175, member: 140, addons: [{ id: 'knob', name: 'Install a knob/lever on the new slab', price: 75 }, { id: 'deadbolt', name: 'Install a deadbolt on the new slab', price: 75 }, { id: 'haul-door', name: 'Haul away the old door', price: 50, nodisc: true }] },
  'door-knob-install': { name: 'Door Knob / Lever Install', meta: '~1 h · Per door', price: 85, member: 68 },
  'deadbolt-install': { name: 'Deadbolt Install — Single', meta: '~45 min · Flat', price: 85, member: 68 },
  'deadbolt-knob-combo': { name: 'Deadbolt + Knob Combo Install', meta: '~1 h · Flat', price: 125, member: 100 },
  'smart-lock-install': { name: 'Smart Lock Install & Setup', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'door-adjustment': { name: 'Door Adjustment', meta: '~1 h · Sticks / hard to latch', price: 85, member: 68 },
  'weatherstripping': { name: 'Weatherstripping', meta: '~1 h · Per door', price: 85, member: 68 },
  'screen-door-install': { name: 'Screen Door Install', meta: '~2 h · Flat', price: 175, member: 140 },
  'sliding-door-service': { name: 'Sliding Door Roller / Track Service', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'window-screen-repair': { name: 'Window Screen Rescreen / Repair', meta: '~1 h · Up to 2 screens', price: 85, member: 68, addons: [{ id: 'extra-screen', name: 'Additional screen rescreen — same visit', price: 25 }] },
  'pet-door-install': { name: 'Pet Door Install (In Door)', meta: '~2 h · Flat', price: 175, member: 140 },
  'furniture-assembly': { name: 'Furniture Assembly', meta: '~1.5 h · Standard piece', price: 125, member: 100 },
  'furniture-assembly-large': { name: 'Furniture Assembly — Large / Complex', meta: '~2.5 h · Wardrobe, bunk bed, big pieces', price: 215, member: 172 },
  'closet-organizer': { name: 'Closet Organizer Install', meta: '~3 h · Kit systems', price: 250, member: 200 },
  'floating-shelves': { name: 'Floating Shelves (Set of 2)', meta: '~1 h · Per set', price: 125, member: 100 },
  'cabinet-hardware-install': { name: 'Cabinet Hardware Install', meta: '~1 h · Up to 10 pulls', price: 125, member: 100 },
  'baby-gate-install': { name: 'Baby Gate Install', meta: '~1 h · Flat', price: 125, member: 100 },
  'picture-mirror-hanging': { name: 'Picture & Mirror Hanging', meta: '~1 h · Up to 3 pieces', price: 125, member: 100 },
  'mirror-cabinet-install': { name: 'Mirror / Medicine Cabinet Install', meta: '~1 h · Flat', price: 125, member: 100 },
  'curtain-rod-install': { name: 'Curtain Rod Install', meta: '~45 min · Per window', price: 85, member: 68 },
  'blinds-install': { name: 'Blinds Install (1-3 Windows)', meta: '~30 min · Per window', price: 85, member: 68 },
  'blinds-install-deal': { name: 'Blinds Install — 4+ Windows', meta: '~30 min · Per window', price: 55, member: 44 },
  'baseboard-install': { name: 'Baseboard Install (1 Room)', meta: '~3 h · Up to ~40 linear ft', price: 250, member: 200 },
  'baseboard-repair': { name: 'Baseboard Repair / Section Replace', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'laminate-floor-repair': { name: 'Laminate / LVP Plank Repair', meta: '~3 h · A few planks', price: 250, member: 200 },
  'carpet-repair': { name: 'Carpet Repair', meta: '~2.5 h · Flat', price: 215, member: 172 },
  'transition-strip-install': { name: 'Transition Strip / Threshold Install', meta: '~1 h · Flat', price: 125, member: 100 },
  'drywall-patch-small': { name: 'Drywall Patch — Small', meta: '~1.5 h · Up to ~1 ft', price: 150, member: 120, addons: [{ id: 'paint-touchup', name: 'Primer / paint touch-up return visit', price: 75 }] },
  'drywall-patch-medium': { name: 'Drywall Patch — Medium', meta: 'Textured, ready to paint', price: 250, member: 200, addons: [{ id: 'paint-touchup', name: 'Primer / paint touch-up return visit', price: 75 }] },
  'drywall-holes-set': { name: 'Small-Holes Patch Set (Up to 3)', meta: '~1 h · Doorknob / anchor holes', price: 125, member: 100, addons: [{ id: 'paint-touchup', name: 'Primer / paint touch-up return visit', price: 75 }] },
  'paint-room': { name: 'Paint One Room — Standard', meta: '~4 h · Walls only, labor', price: 325, member: 260 },
  'paint-room-large': { name: 'Paint Large Room', meta: '~6 h · Walls only, labor', price: 500, member: 400 },
  'paint-room-large-ceiling': { name: 'Paint Large Room + Ceiling', meta: '~8 h · Labor', price: 675, member: 540 },
  'accent-wall-painting': { name: 'Accent Wall Painting', meta: '~2.5 h · Per wall', price: 225, member: 180 },
  'interior-door-painting': { name: 'Interior Door Painting', meta: '~1 h · Per door', price: 85, member: 68 },
  'fence-picket-repair': { name: 'Fence Picket Repair (Up to 5)', meta: '~2 h · Flat', price: 175, member: 140 },
  'fence-post-replacement': { name: 'Fence Post Replacement', meta: '~1-1.5 h · Per post — add-on to a fence repair visit', price: 125, member: 100 },
  'deck-board-replacement': { name: 'Deck Board Replacement (Up to 5)', meta: '~2 h · Flat', price: 175, member: 140 },
  'gate-repair': { name: 'Gate Repair / Adjustment', meta: '~1.5 h · Flat', price: 135, member: 108 },
  // ---------- Electricidad (master list section 2) ----------
  'tv-mounting': { name: 'TV Mounting (up to 65")', meta: '~2 h · Mount & level', price: 175, member: 140, addons: [{ id: 'raceway', name: 'Hide the cables (surface raceway)', price: 50 }, { id: 'soundbar', name: 'Mount my soundbar too', price: 75 }] },
  'tv-mounting-large': { name: 'TV Mounting (over 65")', meta: '~2.5 h · Mount & level', price: 215, member: 172, addons: [{ id: 'raceway', name: 'Hide the cables (surface raceway)', price: 50 }, { id: 'soundbar', name: 'Mount my soundbar too', price: 75 }] },
  'soundbar-mounting': { name: 'Soundbar Mounting', meta: '~1 h · Flat', price: 125, member: 100 },
  'ceiling-fan': { name: 'Ceiling Fan Install', meta: '~1.5 h · Existing box', price: 135, member: 108 },
  'chandelier-swap': { name: 'Chandelier / Light Fixture Swap', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'light-fixture-swap': { name: 'Light Fixture Swap — Simple', meta: '~1 h · Flush-mount, porch, vanity', price: 125, member: 100 },
  'exhaust-fan-swap': { name: 'Bathroom Exhaust Fan Swap', meta: '~2 h · Flat', price: 175, member: 140 },
  'dimmer-switch-swap': { name: 'Dimmer / Switch Swap', meta: '~45 min · Flat', price: 125, member: 100, addons: [{ id: 'extra-dimmer', name: 'Additional dimmer / switch — same visit', price: 75 }] },
  'smoke-co-detector-install': { name: 'Smoke / CO Detector Install', meta: '~1 h · Up to 3, battery', price: 125, member: 100 },
  'ring-doorbell': { name: 'Ring Doorbell Install', meta: '~1 h · Setup included', price: 125, member: 100 },
  'smart-thermostat-install': { name: 'Smart Thermostat Install', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'security-camera-install': { name: 'Security Camera Install (Wireless)', meta: '~1 h · Per camera', price: 125, member: 100, addons: [{ id: 'extra-camera', name: 'Additional wireless camera — same visit', price: 75 }] },
  'garage-opener': { name: 'Garage Door Opener Swap', meta: '~3 h · Standard access', price: 375, member: 300 },
  'holiday-lights': { name: 'Holiday Lights Install', meta: 'Single story · Book early', price: 215, member: 172 },
  'holiday-lights-two-story': { name: 'Holiday Lights Install — Two-Story', meta: '~3.5 h · Book early', price: 295, member: 236 },
  'holiday-lights-takedown': { name: 'Holiday Light Take-Down & Storage', meta: '~1 h · Single story', price: 85, member: 68 },
  'holiday-lights-takedown-two-story': { name: 'Holiday Light Take-Down — Two-Story', meta: '~3 h · Two-story homes', price: 225, member: 180 },
  'window-ac-install': { name: 'Window AC Unit Install', meta: '~1.5 h · Flat', price: 250, member: 200 },
  // ---------- Plomería (master list section 3) ----------
  'faucet-replacement': { name: 'Faucet Replacement', meta: '~1.5 h · Kitchen or bath', price: 135, member: 108 },
  'toilet-replacement': { name: 'Toilet Replacement', meta: '~2.5 h · Full swap', price: 215, member: 172, addons: [{ id: 'haul-toilet', name: 'Remove & haul away the old toilet', price: 50, nodisc: true }] },
  'toilet-repair': { name: 'Toilet Repair (Fill Valve / Flapper)', meta: '~1 h · Flat', price: 125, member: 100 },
  'garbage-disposal-swap': { name: 'Garbage Disposal Swap', meta: '~2 h · Flat', price: 175, member: 140, addons: [{ id: 'haul-disposal', name: 'Haul away the old disposal', price: 50, nodisc: true }] },
  'showerhead-swap': { name: 'Showerhead Swap', meta: '~45 min · Flat', price: 85, member: 68 },
  'tub-shower-recaulk': { name: 'Tub / Shower Re-Caulk', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'grab-bar-install': { name: 'Grab Bar Install', meta: '~1 h · Each', price: 125, member: 100, addons: [{ id: 'extra-grab-bar', name: 'Additional grab bar — same visit', price: 75 }] },
  'p-trap-swap': { name: 'P-Trap / Drain Assembly Swap', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'bidet-seat-install': { name: 'Bidet Seat Install', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'dryer-vent-cleaning': { name: 'Dryer Vent Cleaning', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'washer-dryer-hookup': { name: 'Washer & Dryer Hookup / Install', meta: '~1.5 h · Existing connections', price: 135, member: 108 },
  'drain-unclog': { name: 'Drain Unclog — Basic', meta: 'One drain · Machine clean', price: 175, member: 140, addons: [{ id: 'extra-drain', name: 'Additional drain unclog — same visit', price: 75 }] },
  'dishwasher-swap': { name: 'Dishwasher Swap', meta: '~2 h · Same hookups', price: 200, member: 160 },
  'vanity-swap': { name: 'Vanity Swap', meta: '~3 h · Standard vanity', price: 250, member: 200, addons: [{ id: 'haul-vanity', name: 'Haul away the old vanity', price: 50, nodisc: true }] },
  'bathroom-accessories-install': { name: 'Bathroom Accessories Set Install', meta: '~1 h · Towel bars, paper holder, hooks — up to 4 pieces', price: 125, member: 100 },
  'hose-bibb-swap': { name: 'Hose Bibb / Outdoor Faucet Swap', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'water-heater': { name: 'Water Heater Install', meta: 'Haul-away included', price: 700, member: 560 },
  // ---------- Jardinería (master list section 4) ----------
  'gutter-cleaning': { name: 'Gutter Cleaning', meta: '~2 h · Single story', price: 175, member: 140 },
  'gutter-cleaning-two-story': { name: 'Gutter Cleaning — Two-Story', meta: 'Two-story house', price: 250, member: 200 },
  'pressure-washing': { name: 'Pressure Washing — Standard Area', meta: '~2 h · 2-car driveway or patio', price: 175, member: 140, addons: [{ id: 'trash-bin-cleaning', name: 'Trash bin cleaning (2 bins)', price: 50 }] },
  'pressure-washing-large': { name: 'Pressure Washing — Large Area', meta: '~3 h · Long driveway, large patio or deck', price: 250, member: 200, addons: [{ id: 'trash-bin-cleaning', name: 'Trash bin cleaning (2 bins)', price: 50 }] },
  'yard-cleanup': { name: 'Yard Cleanup', meta: '~2 h · One-time rescue', price: 175, member: 140 },
  'sprinkler-irrigation': { name: 'Sprinkler & Drip Irrigation Basics', meta: '~1.5 h · Heads, timers, small leaks', price: 135, member: 108 },
  'green-waste': { name: 'Green Waste Hauling', meta: 'Branches, brush & yard debris — per load', price: 250, member: 200 },
  'junk-minimum': { name: 'Junk Removal — Minimum load', meta: 'One big piece or up to ~5 medium items', price: 250, member: 200 },
  'junk-medium': { name: 'Junk Removal — Medium load', meta: 'One room of furniture or a garage corner', price: 325, member: 260 },
  'junk-large': { name: 'Junk Removal — Large load', meta: 'About 2 rooms or half a one-car garage', price: 425, member: 340 },
  'junk-full': { name: 'Junk Removal — Full load (truck & trailer)', meta: 'Full garage or house cleanout', price: 650, member: 520 },
  'mailbox-install': { name: 'Mailbox Install', meta: '~1.5 h · Flat', price: 175, member: 140 },
  // ---------- Mecánica (master list section 5) ----------
  'fuel-pump-replacement': { name: 'Fuel Pump Replacement', meta: '~4 h · Flat', price: 350, member: 280 },
  'fuel-pump-tank-drop': { name: 'Fuel Pump Replacement — Tank Drop', meta: '~5–6 h · No access panel — the tank comes down', price: 450, member: 360 },
  'battery-replacement': { name: 'Battery Replacement', meta: '~1 h · Tested on site', price: 125, member: 100 },
  'check-engine-diagnostics': { name: 'Check-Engine Diagnostics / Scan', meta: '~1 h · Flat', price: 85, member: 68 },
  'oil-change': { name: 'Oil Change & Fluids', meta: '~1 h · At your home', price: 85, member: 68, addons: [{ id: 'filter-swap', name: 'Air / cabin filter swap', price: 50 }] },
  'brake-pads': { name: 'Brake Pads — Per Pair', meta: '~1 h · Front or rear', price: 100, member: 80, addons: [{ id: 'rotors', name: 'Add rotors (per pair)', price: 85 }] },
  'alternator-replacement': { name: 'Alternator Replacement — Easy', meta: '~2 h · Standard access', price: 175, member: 140 },
  'alternator-difficult': { name: 'Alternator Replacement — Difficult', meta: '~3 h · Buried — tight access', price: 250, member: 200 },
  'starter-replacement': { name: 'Starter Replacement', meta: 'By make & difficulty — final price $250–$300', price: 250, member: 200, from: true },
  'belt-hose-replacement': { name: 'Belt / Hose Replacement (Basics)', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'spark-plug-replacement': { name: 'Spark Plug Replacement (4-Cylinder)', meta: '~1.5 h · Flat', price: 135, member: 108 },
  'spark-plug-v6v8': { name: 'Spark Plug Replacement (V6 / V8)', meta: '~2.5 h · Flat', price: 215, member: 172 },
  'turbo-replacement': { name: 'Turbo Replacement — from $450 (estimate first)', meta: 'We inspect it and confirm the exact price first', price: 450, member: 360, est: true },
  'headlight-replacement': { name: 'Headlight / Bulb Replacement', meta: '~45 min · Flat', price: 85, member: 68 },
  // ---------- Ayuda general (master list, secondary section) ----------
  'heavy-furniture-move': { name: 'Heavy Furniture Move (2 Technicians)', meta: '~1 h · Per job', price: 200, member: 160 }
};
/* ================= v79: LEGACY #order/<service> RETIRED =================
   The v32–v77 order page created the order BEFORE charging (P0-4) and
   charged through a second, different checkout (P0-3). It is gone:
   every entry point now feeds the v78 cart — Order buttons call
   orderNow(id), and a #order/<id> hash (old links, the website's order
   buttons) converts on arrival: the service + its validated add-ons go
   into the persisted guest cart, the handoff contact fields go into
   the checkout prefill, and the customer lands on #cart, where the
   order is born ONLY after Stripe verifies the payment. */
function isOrderRoute(){ return (location.hash || '').indexOf('#order') === 0; }
function parseOrderHash(){
  const h = location.hash || '';
  const m = h.match(/^#order\/([\w-]+)(?:\?(.*))?$/);
  if (!m) return { id: '', params: {} };
  const params = {};
  (m[2] || '').split('&').forEach(function (kv) { const i = kv.indexOf('='); if (i > 0) { try { params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {} } });
  return { id: m[1], params };
}
function cartAddWithAddons(id, extras){
  const svc = MENU_CATALOG[id]; if (!svc) return false;
  if (svc.est) return false; // v82: estimate-first never carts (the server refuses it too)
  // v80.8 SEAL: the legacy #order converter rides the SAME role gate as
  // cartAdd — an admin's converted service lands in the cart BUILDER
  // (base service; add-ons do not carry into a draft line), a worker is
  // a no-op, and the shopper cart stays customer/guest-only. Returns
  // false when the gate handled the tap so the caller stops.
  if (cartRoleGate(id)) return false;
  const items = cartLoad();
  const key = JSON.stringify(extras || []);
  let line = null;
  items.forEach(function (i) { if (i.id === id && JSON.stringify(i.x || []) === key) line = i; });
  if (line) line.q = Math.min(99, (Number(line.q) || 1) + 1);
  else items.push({ id: id, q: 1, x: extras || [] });
  cartSave(items);
  noteRecent(id);
  paintCartBtn();
  return true;
}
function orderNow(id){
  const svc0 = MENU_CATALOG[id];
  if (svc0 && svc0.est) { orderEstimate(id); return; } // v82: estimate-first never enters the cart
  if (cartRoleGate(id)) return; // v80.8 cart gate: admin/worker never land on #cart (see cartRoleGate)
  cartAdd(id);
  try { sessionStorage.removeItem('ghsCcPrefill'); } catch (e) {}
  location.hash = '#cart';
}
// v82: estimate-first services (the turbo) — the tap opens the free
// photo-estimate wizard the way goFreeEstimate opens it (photo estimate
// preselected), with the mechanic category picked and the service named
// at the top of the description, so the request IS the turbo estimate
// and the Team confirms the exact price on it (Gabriel 2026-11-03:
// desde $450, nunca plano sin estimado).
function orderEstimate(id){
  const s = MENU_CATALOG[id]; if (!s) return;
  if (location.hash) location.hash = ''; else render();
  wzPickCat('mechanic');
  const g = document.getElementById('cEst');
  if (g) g.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === 'photo'));
  wzState.est = 'photo';
  const ta = document.getElementById('rDesc');
  if (ta && !ta.value.trim()) ta.value = svcName(id) + ' — ';
  if (typeof custSummary === 'function') custSummary();
  wzGo(2);
}
function retireOrderRoute(){
  const p = parseOrderHash();
  const svc = MENU_CATALOG[p.id];
  if (svc && svc.est) { orderEstimate(p.id); return; } // v82: an old #order link for an estimate-first service opens the estimate flow, never the cart
  if (svc) {
    const valid = {};
    (svc.addons || []).forEach(function (a) { valid[a.id] = true; });
    const extras = String(p.params.x || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return valid[x]; });
    // v80.8 SEAL: when the role gate handled the conversion (admin →
    // builder / worker → notice), there is no shopper cart to land on:
    // consume the #order hash so a later render cannot re-fire the
    // conversion, and skip the checkout prefill + #cart landing.
    if (!cartAddWithAddons(p.id, extras)) { location.hash = ''; return; }
    const pre = {};
    ['nm', 'ph', 'ad', 'cy', 'wt', 'n'].forEach(function (k) { if (p.params[k]) pre[k] = p.params[k]; });
    try { if (Object.keys(pre).length) sessionStorage.setItem('ghsCcPrefill', JSON.stringify(pre)); else sessionStorage.removeItem('ghsCcPrefill'); } catch (e) {}
    cartToast('Added to your cart — checkout when you are ready 🛒');
  }
  location.hash = '#cart';
}
function applyCcPrefill(){
  let pre = null;
  try { pre = JSON.parse(sessionStorage.getItem('ghsCcPrefill') || 'null'); } catch (e) {}
  if (!pre) return;
  const set = function (idv, v) { const el = document.getElementById(idv); if (el && v && !el.value) el.value = v; };
  set('ccName', pre.nm); set('ccPhone', pre.ph); set('ccAddr', pre.ad); set('ccCity', pre.cy); set('ccNotes', pre.n);
  if (pre.wt) { const w = document.getElementById('ccWhen'); if (w && w.options) { for (let i = 0; i < w.options.length; i++) { if (w.options[i].value === pre.wt || w.options[i].text === pre.wt) { w.selectedIndex = i; break; } } } }
}

// ---------- v78: guest cart + embedded checkout (Payment Element) ----------
// Gabriel's Amazon model (2026-10-25): the cart ALWAYS exists — guests
// add services from the home tiles and the Menu, the cart persists on
// the phone (localStorage 'ghsCart') across sessions, and the account
// is created at the END, inside the checkout, never as a door. Prices
// shown here come from the client catalog mirror; the CHARGED total is
// always recomputed server-side from SERVER_MENU (POST /api/cart/quote
// + /api/cart/checkout). Members (verified homeCareStatus) see the
// −20% labor price applied live; guests see BOTH totals, the member
// one as the savings hook. P0-4: the order is created ONLY after the
// server verifies the payment (checkout-confirm / webhook) — a
// declined card creates NO order and shows NO success: the cart stays
// intact and the error renders in-theme. ROLE RULE: this module is
// customer-side only — paintCartBtn hides the cart button for worker /
// admin sessions and inside the technician entry, and nothing in this
// module is referenced from the worker or admin boxes.
const CART_LS_KEY = 'ghsCart';
let cartBusy = false, cartPayCtx = null, cartElements = null, cartElementsMode = null, cartElementsAmount = 0, cartElementReady = false, cartWhenVal = 'Today', cartJoinedOnce = false, cartQuote = null;
function cartLoad(){ try { const v = JSON.parse(localStorage.getItem(CART_LS_KEY) || '[]'); return Array.isArray(v) ? v.filter(function(it){ return it && typeof it.id === 'string' && typeof MENU_CATALOG !== 'undefined' && MENU_CATALOG[it.id] && !MENU_CATALOG[it.id].est; }) : []; } catch (e) { return []; } }
function cartSave(items){ try { localStorage.setItem(CART_LS_KEY, JSON.stringify(items)); } catch (e) {} paintCartBtn(); }
function cartCount(){ return cartLoad().reduce(function(s, it){ return s + Math.max(1, Math.round(Number(it.q) || 1)); }, 0); }
function cartIsMember(){ return !!(me && me.homeCareStatus === 'active'); }
function isCartRoute(){ return (location.hash || '') === '#cart'; }
function openCart(){ if (isCartRoute()) render(); else location.hash = '#cart'; }
function exitCart(){ location.hash = ''; }
function paintCartBtn(){
  const b = document.getElementById('cartBtn'); if (!b) return;
  let hide = false;
  try { if (typeof isWorkerEntry === 'function' && isWorkerEntry()) hide = true; } catch (e) {}
  if (me && me.role !== 'customer') hide = true;
  b.style.display = hide ? 'none' : '';
  const n = cartCount();
  const bd = document.getElementById('cartBadge');
  if (bd) { bd.textContent = n ? String(n) : ''; bd.style.display = n ? 'block' : 'none'; }
}
let cartToastTimer = null;
function cartToast(msg){
  paintCartBtn();
  const b = document.getElementById('cartBtn');
  if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  const t = document.getElementById('cartToast'); if (!t) return;
  t.innerHTML = escHtml(msg) + ' <a href="#cart">View cart →</a>';
  t.classList.add('show');
  if (cartToastTimer) clearTimeout(cartToastTimer);
  cartToastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}
// v80.8 CART GATE (Gabriel 2026-10-28): two clean doors by role. The
// shopper cart (localStorage 'ghsCart') belongs to customers + guests
// ONLY — paintCartBtn already hides its button for other roles, but
// the menu Add / Order buttons reached cartAdd unchecked, so an ADMIN
// building a client quote silently filled his OWN shopper cart: no
// proposal, no order, nothing to send. Now an admin add routes to the
// cart BUILDER (cartDraft -> POST /api/admin/carts), says so, and
// takes him to that section. A WORKER session is a hard no-op —
// technicians have no cart; they only see jobs (no shopper mutation,
// no builder, no customer pricing action). Returns true when the gate
// handled the tap; the caller must stop.
function cartRoleGate(id){
  if (!me) return false;
  if (me.role === 'admin') {
    if (typeof builderCartAdd === 'function') builderCartAdd(id);
    alert("You're signed in as admin — " + svcName(id) + " went to your cart builder below, NOT the customer cart. Finish it there (customer info + Generate cart link) to send the client their link.");
    admGo('admSecCart');
    return true;
  }
  if (me.role === 'worker') {
    alert('The cart is for customers only — technicians see jobs, not the cart.');
    return true;
  }
  return false;
}
function cartAdd(id){
  if (typeof MENU_CATALOG === 'undefined' || !MENU_CATALOG[id]) return;
  if (MENU_CATALOG[id].est) return; // v82: estimate-first never carts
  if (cartRoleGate(id)) return;
  const items = cartLoad();
  const ex = items.find(function(it){ return it.id === id && !(it.x && it.x.length); });
  if (ex) ex.q = Math.min(10, Math.max(1, Math.round(Number(ex.q) || 1)) + 1); else items.push({ id: id, q: 1 });
  cartSave(items);
  noteRecent(id);
  cartToast(svcName(id) + ' added to your cart');
  if (isCartRoute()) { cartResetCheckout(); renderCart(); }
}
function cartQty(i, d){
  const items = cartLoad(); if (!items[i]) return;
  items[i].q = Math.max(1, Math.min(10, Math.round(Number(items[i].q) || 1) + d));
  cartSave(items); cartResetCheckout(); renderCart();
}
function cartRemove(i){
  const items = cartLoad(); if (!items[i]) return;
  items.splice(i, 1);
  cartSave(items); cartResetCheckout(); renderCart();
}
function cartClearAll(){ cartSave([]); cartResetCheckout(); renderCart(); }
// Same per-line math the retired #order checkout used: catalog
// member price + add-ons at 0.8, nodisc (hauling) add-ons in full.
function cartCalc(){
  const lines = []; let list = 0, member = 0;
  for (const it of cartLoad()) {
    const s = MENU_CATALOG[it.id]; if (!s) continue;
    const q = Math.max(1, Math.round(Number(it.q) || 1));
    const ads = (s.addons || []).filter(function(a){ return (it.x || []).indexOf(a.id) >= 0; });
    const extrasSum = ads.reduce(function(sum, a){ return sum + a.price; }, 0);
    const discSum = ads.filter(function(a){ return !a.nodisc; }).reduce(function(sum, a){ return sum + a.price; }, 0);
    const unitList = s.price + extrasSum;
    const unitMember = (s.member != null ? s.member : s.price) + Math.round(discSum * 0.8) + (extrasSum - discSum);
    lines.push({ id: it.id, qty: q, name: svcName(it.id), meta: svcMeta(it.id), addons: ads, unitList: unitList, unitMember: unitMember, lineList: unitList * q, lineMember: unitMember * q });
    list += unitList * q; member += unitMember * q;
  }
  return { lines: lines, list: list, member: member, savings: list - member };
}
function renderCart(){
  const host = document.getElementById('cartLines'); if (!host) return;
  const title = document.getElementById('cartTitle'); if (title) title.textContent = CU('cartTitle');
  const items = cartLoad();
  const t = cartCalc();
  const member = cartIsMember();
  paintCartBtn();
  const emptyEl = document.getElementById('cartEmpty'); if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';
  const coBtn = document.getElementById('cartCheckoutBtn'); if (coBtn) coBtn.style.display = items.length ? '' : 'none';
  const clBtn = document.getElementById('cartClearBtn'); if (clBtn) clBtn.style.display = items.length ? '' : 'none';
  host.innerHTML = t.lines.map(function(l, i){
    // v80.4 (Gabriel 2026-10-25 23:54): the headline is ALWAYS the full
    // list price — a VERIFIED MEMBER never sees the discounted figure
    // dressed as THE price. The member saving rides as its own small
    // green badge under the price; the totals block below carries the
    // savings row + the member total.
    const unit = l.unitList;
    const line = l.lineList;
    let s = '<div class="cart-line"><div class="cart-line-main"><b>' + escHtml(l.name) + '</b>' + (l.meta ? '<br><span class="mut">' + escHtml(l.meta) + '</span>' : '');
    l.addons.forEach(function(a){ s += '<br><span class="mut">+ ' + escHtml(a.name) + ' · $' + a.price + '</span>'; });
    s += '<br><span class="mut">$' + unit + CU('cartEach') + '</span> <span class="cart-qty"><button type="button" onclick="cartQty(' + i + ',-1)">−</button><b>' + l.qty + '</b><button type="button" onclick="cartQty(' + i + ',1)">+</button></span></div>';
    s += '<div style="text-align:right"><b>$' + line + '</b>';
    if (member && l.lineMember < l.lineList) s += '<br><span class="cart-member-save">' + CU('cartMembersSavePre') + (l.lineList - l.lineMember) + '</span>';
    // v80.3 (Gabriel 2026-10-25): the member price TEASES in green under
    // each line's regular price — only for non-members, and only when
    // the line actually carries a member discount (lineMember < lineList;
    // materials / nodisc lines never advertise a discount they don't get).
    else if (!member && l.lineMember < l.lineList) s += '<br><span class="cart-members-pay">' + CU('cartMembersPayPre') + l.lineMember + '</span>';
    s += '<br><button type="button" class="cart-remove" onclick="cartRemove(' + i + ')">' + CU('cartRemoveBtn') + '</button></div></div>';
    return s;
  }).join('');
  const th = document.getElementById('cartTotals'); if (!th) return;
  if (!items.length) { th.innerHTML = ''; return; }
  let s = '<div style="margin-top:8px"><div class="cart-total-row"><span>' + CU('cartSubtotal') + '</span><span>$' + t.list + '</span></div>';
  if (member) {
    if (t.savings > 0) s += '<div class="cart-total-row" style="color:#2fbf71"><span>' + CU('cartSavingsRow') + '</span><span>−$' + t.savings + '</span></div>';
    s += '<div class="cart-total-row" style="border-top:1px solid #d4d4d8;padding-top:6px;margin-top:4px"><b>' + CU('cartTotalWord') + '</b><b>$' + t.member + '</b></div><p class="mut">' + CU('cartMemberApplied') + '</p>';
  } else {
    s += '<div class="cart-total-row" style="border-top:1px solid #d4d4d8;padding-top:6px;margin-top:4px"><b>' + CU('cartTotalWord') + '</b><b>$' + t.list + '</b></div>';
    if (t.savings > 0) {
      // v80.3 (Gabriel 2026-10-25): the lower member total lives HERE, in
      // green, directly below the regular Total — the pink box below is
      // now only the join invitation (it no longer repeats the prices).
      s += '<div class="cart-total-row cart-members-total"><span>' + CU('cartMembersPayTpl').replace('{member}', t.member).replace('{savings}', t.savings) + '</span></div>';
      s += '<div class="auth-offer" style="margin-top:10px"><b>' + CU('cartOfferTitle') + '</b><p class="mut" style="margin:4px 0 0">' + CU('cartOfferBody') + '</p></div>';
    }
  }
  th.innerHTML = s + '</div>';
  // keep the checkout card (when open) in sync with cart-view edits
  const ccCard = document.getElementById('cartCheckoutCard');
  if (ccCard && ccCard.style.display !== 'none' && items.length) { renderCcLines(); renderCartTotalsDue(); }
}
function cartWhenPick(btn){
  cartWhenVal = btn.getAttribute('data-w') || 'Today';
  document.querySelectorAll('#ccWhenPick button').forEach(function(x){ x.classList.toggle('sel', x === btn); });
  cartGatePaint();
}
function cartPaintOffer(){ const o = document.getElementById('ccOffer'); if (o) o.style.display = cartIsMember() ? 'none' : 'block'; }
function renderCartTotalsDue(){
  const host = document.getElementById('cartTotalsDue'); if (!host) return;
  // After any checkout edit the totals paint from the LAST SERVER QUOTE
  // (cartQuote) — never from stale local math alone.
  const t = cartQuote || cartCalc();
  const savings = t.list - t.member;
  const member = cartIsMember();
  const joinEl = document.getElementById('ccJoin');
  const joinOn = !member && !!(joinEl && joinEl.checked);
  const due = cartPayCtx ? cartPayCtx.due : ((member || joinOn) ? t.member : t.list);
  let s = '<div class="cart-total-row"><span>' + CU('cartSubtotal') + '</span><span>$' + t.list + '</span></div>';
  if ((member || joinOn) && savings > 0) s += '<div class="cart-total-row" style="color:#2fbf71"><span>' + CU('cartMemberPriceRow') + '</span><span>−$' + savings + '</span></div>';
  if (joinOn) s += '<div class="cart-total-row"><span>' + CU('cartJoinRow') + '</span><span><b>' + CU('cartFreeWord') + '</b></span></div>';
  const depOf79 = function (tot) { tot = Number(tot) || 0; return tot <= 300 ? Math.min(50, tot) : Math.round(tot * 40) / 100; };
  const dep79 = cartPayCtx && cartPayCtx.phase !== 'join' ? cartPayCtx.deposit : depOf79(due);
  const bal79 = Math.max(0, Math.round((due - dep79) * 100) / 100);
  s += '<div class="cart-total-row" style="border-top:1px solid #d4d4d8;padding-top:6px;margin-top:4px"><span>' + CU('cartTotalWord') + '</span><span>$' + due + '</span></div>';
  s += '<div class="cart-total-row cart-due-dep"><b>' + CU('cartDepositDue') + '</b><b>$' + dep79 + '</b></div>';
  if (bal79 > 0) s += '<div class="cart-total-row"><span>' + CU('cartBalanceRow') + '</span><span>$' + bal79 + '</span></div>';
  // v86: the money summary wears the draft's featured card (dark panel,
  // red border, big deposit number — the .cart-due-card CSS). Wrapper and
  // the cart-due-dep class only: every row, word and number is unchanged.
  host.innerHTML = '<div class="cart-due-card">' + s + '</div>';
}
// ---------- v78 refine (Gabriel 2026-10-25 21:57): the cart is FULLY
// editable AT the checkout itself — fix a mistake, drop a service, add
// another one — without leaving the step or losing what was typed.
// Every edit: (1) updates the persisted cart, (2) DROPS the mounted
// Payment Element and the pending intent context (a stale intent is
// never charged from here; the server also supersedes + cancels the
// old PaymentIntent when the fresh checkout is created), (3) re-quotes
// against POST /api/cart/quote so the totals shown are the server's,
// and (4) re-prepares automatically when a payment was already armed,
// so the Pay button always names the NEW server total. The typed
// account/address/when/notes live in DOM inputs this code never
// rebuilds, so they survive every edit. Edits are locked while a
// payment is preparing or processing (cartBusy).
function cartQuoteItems(){
  return cartLoad().map(function(it){ const s = MENU_CATALOG[it.id]; return { serviceId: it.id, name: s ? s.name : it.id, qty: Math.max(1, Math.round(Number(it.q) || 1)), addons: (it.x || []).slice() }; });
}
async function cartQuoteRefresh(){
  try {
    const body = { items: cartQuoteItems() };
    const em = document.getElementById('ccEmail');
    if (!cartIsMember() && em && /.+@.+\..+/.test((em.value || '').trim())) body.email = em.value.trim();
    const r = await api('/api/cart/quote', { method: 'POST', body: JSON.stringify(body) });
    if (r && r.totals) cartQuote = r.totals;
  } catch (e) { /* display-only: the charge is re-derived server-side at prepare */ }
  renderCartTotalsDue();
  // v80.4: a fresh server quote can move the deposit — keep the
  // mounted element's amount (and the button label) honest.
  if (cartElements) { cartMountDeferred(); cartGatePaint(); }
}
function renderCcLines(){
  const host = document.getElementById('ccLines'); if (!host) return;
  const t = cartCalc();
  const member = cartIsMember();
  const joinEl = document.getElementById('ccJoin');
  const joinOn = !member && !!(joinEl && joinEl.checked);
  const mem = member || joinOn;
  if (!t.lines.length) { host.innerHTML = ''; return; }
  host.innerHTML = '<h4 style="margin-bottom:6px">' + CU('ccLinesTitle') + '</h4>' + t.lines.map(function(l, i){
    // v80.4 AMENDS the v80.3 extension (Gabriel 2026-10-25 23:54):
    // wherever member pricing is APPLIED (verified member, or the
    // join box checked), the headline stays the FULL list price and
    // the discount is its own element — the small green saving badge
    // per discountable line (the green summary savings row below is
    // unchanged). The v80.3 tease for guests / join-unchecked stands.
    const unit = l.unitList;
    const line = l.lineList;
    let s = '<div class="cart-line"><div class="cart-line-main"><b>' + escHtml(l.name) + '</b>' + (l.meta ? '<br><span class="mut">' + escHtml(l.meta) + '</span>' : '');
    l.addons.forEach(function(a){ s += '<br><span class="mut">+ ' + escHtml(a.name) + ' · $' + a.price + '</span>'; });
    s += '<br><span class="mut">$' + unit + CU('cartEach') + '</span> <span class="cart-qty"><button type="button" onclick="ccQty(' + i + ',-1)">−</button><b>' + l.qty + '</b><button type="button" onclick="ccQty(' + i + ',1)">+</button></span></div>';
    s += '<div style="text-align:right"><b>$' + line + '</b>';
    if (mem && l.lineMember < l.lineList) s += '<br><span class="cart-member-save">' + CU('cartMembersSavePre') + (l.lineList - l.lineMember) + '</span>';
    else if (!mem && l.lineMember < l.lineList) s += '<br><span class="cart-members-pay">' + CU('cartMembersPayPre') + l.lineMember + '</span>';
    s += '<br><button type="button" class="cart-remove" onclick="ccRemove(' + i + ')">' + CU('cartRemoveBtn') + '</button></div></div>';
    return s;
  }).join('');
}
function renderCcAddList(){
  const al = document.getElementById('ccAddList'); if (!al || al.style.display !== 'block') return;
  const items = cartLoad();
  al.innerHTML = Object.keys(MENU_CATALOG || {}).map(function(id){
    const s = MENU_CATALOG[id]; if (!s) return '';
    const inCart = items.filter(function(it){ return it.id === id; }).reduce(function(n, it){ return n + Math.max(1, Math.round(Number(it.q) || 1)); }, 0);
    return '<div class="cart-line"><div class="cart-line-main"><b>' + escHtml(svcName(id)) + '</b><br><span class="mut">$' + s.price + CU('ccMembersWord') + (s.member != null ? s.member : s.price) + '</span></div><div style="text-align:right">' + (inCart ? '<span class="mut">' + CU('ccInCart') + inCart + '</span><br>' : '') + '<button type="button" onclick="ccAddMore(\'' + id + '\')">' + CU('ccAdd') + '</button></div></div>';
  }).join('');
}
function cartToggleAddMore(){
  const al = document.getElementById('ccAddList'); if (!al) return;
  if (al.style.display === 'block') { al.style.display = 'none'; return; }
  al.style.display = 'block';
  renderCcAddList();
}
function ccQty(i, d){
  if (cartBusy) return;
  const items = cartLoad(); if (!items[i]) return;
  items[i].q = Math.max(1, Math.min(10, Math.round(Number(items[i].q) || 1) + d));
  cartSave(items);
  return cartCheckoutEdited();
}
function ccRemove(i){
  if (cartBusy) return;
  const items = cartLoad(); if (!items[i]) return;
  items.splice(i, 1);
  cartSave(items);
  return cartCheckoutEdited();
}
function ccAddMore(id){
  if (cartBusy) return;
  if (typeof MENU_CATALOG === 'undefined' || !MENU_CATALOG[id]) return;
  const items = cartLoad();
  const ex = items.find(function(it){ return it.id === id && !(it.x && it.x.length); });
  if (ex) ex.q = Math.min(10, Math.max(1, Math.round(Number(ex.q) || 1)) + 1); else items.push({ id: id, q: 1 });
  cartSave(items);
  return cartCheckoutEdited();
}
async function cartCheckoutEdited(){
  renderCart();
  renderCcLines();
  renderCcAddList();
  if (!cartLoad().length) { cartCheckoutEmptied(); return; }
  const hadCtx = !!cartPayCtx;
  cartResetCheckout(); // stale Payment Element + intent context dropped NOW
  await cartQuoteRefresh();
  // The form already validated once (an intent existed), so re-arm the
  // payment at the NEW total right away — the customer never taps Pay
  // against a stale amount. (v80.4: with NO armed context there is
  // nothing to re-arm — the deferred element simply remounts at the
  // new amount; the server supersedes inside the next submit's arm.)
  if (hadCtx && !cartBusy) await cartPrepare();
  else if (!cartBusy) await cartEagerMount();
}
function cartCheckoutEmptied(){
  // Removing the last service AT checkout: no dead end and no charge
  // surface left armed — the checkout card closes and the cart's own
  // empty state (with Browse the menu) takes over. No account is
  // created by emptying: accounts are only born inside cartPrepare,
  // which never runs with an empty cart (and the server now refuses
  // an empty checkout before account resolution, too).
  cartResetCheckout();
  cartQuote = null;
  const card = document.getElementById('cartCheckoutCard'); if (card) card.style.display = 'none';
  const due = document.getElementById('cartTotalsDue'); if (due) due.innerHTML = '';
  const lines = document.getElementById('ccLines'); if (lines) lines.innerHTML = '';
  const al = document.getElementById('ccAddList'); if (al) { al.style.display = 'none'; al.innerHTML = ''; }
  renderCart();
  const box = document.getElementById('cartBox'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth' });
}
function cartResetCheckout(){
  cartPayCtx = null; cartElements = null; cartElementsMode = null; cartElementsAmount = 0; cartElementReady = false; cartEagerSeq++;
  cartStripeState = 'idle';
  const pe = document.getElementById('cartPayElement'); if (pe) pe.innerHTML = '';
  const e = document.getElementById('cartPayErr'); if (e) { e.textContent = ''; e.style.display = 'none'; }
  cartGatePaint();
}
// ---------- v80.4: the payment form loads WITH the page ----------
// Gabriel (2026-10-25 23:50, watching the checkout on his tablet):
// the form must be VISIBLE from the moment the customer enters
// checkout — showing what will be charged — while the Pay button
// stays locked until every required field is filled. Today the
// element only mounted after the data validated / on the Pay tap,
// so the box sat empty and LOOKED broken (the 22:39 wound).
// Design: the Payment Element mounts EAGERLY in Stripe's DEFERRED
// intent mode (no secret, no server arm, no account) the moment the
// checkout step renders, in parallel with the customer typing. The
// server arm (account resolution + pending checkout + PI/subscription
// secret, the exact /api/cart/checkout rails of v78–v80.2) still
// happens — at SUBMIT time — and the confirm runs against the
// already-mounted element with the fresh secret. P0-4 untouched:
// the order is still born only in the verified settle.
let cartEagerSeq = 0;
function cartJoinIntent(){
  if (cartIsMember()) return false;
  const j = document.getElementById('ccJoin');
  return !!(j && j.checked);
}
function cartDepositEstimate(){
  // Same math renderCartTotalsDue paints: an armed context wins,
  // otherwise the deposit rule (v79 law: $50 flat to $300, 40% over)
  // over the server quote when one exists, else the local calc.
  const t = cartQuote || cartCalc();
  const member = cartIsMember();
  const due = cartPayCtx ? cartPayCtx.due : ((member || cartJoinIntent()) ? t.member : t.list);
  if (cartPayCtx && cartPayCtx.phase !== 'join') return cartPayCtx.deposit;
  const tot = Number(due) || 0;
  return tot <= 300 ? Math.min(50, tot) : Math.round(tot * 40) / 100;
}
function cartPayLabel(){
  const dep = cartDepositEstimate();
  if (cartPayCtx && cartPayCtx.phase === 'join') return CU('cartPayJoinTpl').replace('{amt}', cartPayCtx.deposit);
  if (!cartPayCtx && cartJoinIntent()) return CU('cartPayJoinTpl').replace('{amt}', dep);
  return CU('cartPayDepositTpl').replace('{amt}', dep);
}
function cartFormValid(){
  if (!cartLoad().length) return false;
  return cartValidatePayload(cartBuildPayload(cartLoad())) === '';
}
// THE gate (v80.4): one function owns the Pay button. It is enabled
// only when the element is mounted AND the checkout data validates —
// the same validations that gate the flow today. While a prepare or
// a payment is in flight it shows the busy label, disabled.
function cartGatePaint(busyLabel){
  const b = document.getElementById('cartPayBtn'); if (!b) return;
  if (cartBusy) { b.disabled = true; if (busyLabel) b.textContent = busyLabel; return; }
  b.disabled = !(!!cartElements && cartElementReady && cartFormValid());
  b.textContent = cartPayLabel();
}
// Mount (or re-create) the DEFERRED Payment Element for the CURRENT
// intent: join intent -> setup mode (the trial's card is collected
// as a setup, v80.2); otherwise payment mode carrying the deposit
// estimate as its amount. Re-created ONLY when the mode or the
// amount actually changed — Stripe.js is already loaded by then, so
// the swap is fast, and the typed checkout data (DOM inputs this
// code never rebuilds) survives every remount.
function cartMountDeferred(forceMode){
  if (!stripeObj) return false;
  const host = document.getElementById('cartPayElement'); if (!host) return false;
  const mode = forceMode || (cartJoinIntent() ? 'setup' : 'payment');
  const amount = mode === 'payment' ? Math.round(cartDepositEstimate() * 100) : 0;
  if (cartElements && cartElementsMode === mode && (mode === 'setup' || cartElementsAmount === amount)) return true;
  try {
    host.innerHTML = '';
    const appearance = { theme: 'night', variables: { colorPrimary: '#e42535', borderRadius: '12px' } };
    cartElements = mode === 'payment'
      ? stripeObj.elements({ mode: 'payment', amount: amount, currency: 'usd', appearance: appearance })
      : stripeObj.elements({ mode: 'setup', currency: 'usd', appearance: appearance });
    cartElementsMode = mode; cartElementsAmount = amount; cartElementReady = false;
    const pe = cartElements.create('payment');
    if (pe && typeof pe.on === 'function') pe.on('ready', function(){ cartElementReady = true; cartGatePaint(); });
    pe.mount(host);
    // mount() returned: the element owns the box now. (Stripe queues
    // the confirm until the element is internally live, and the
    // submit path runs elements.submit() first — the hard check.)
    cartElementReady = true;
    return true;
  } catch (e) {
    cartElements = null; cartElementsMode = null; cartElementReady = false;
    cartStripeFailStage = 'INIT'; cartStripeState = 'failed'; paintCartPayState();
    return false;
  }
}
// Entry point of the eager mount: fired the moment the checkout
// step renders (and on every intent change). A Stripe load failure
// paints HERE — at entry, with the hosted door + stage ref — never
// after the customer has filled everything in.
async function cartEagerMount(force){
  const seq = ++cartEagerSeq;
  if (!cartLoad().length) return;
  const card = document.getElementById('cartCheckoutCard');
  if (!force && (!card || card.style.display === 'none')) return;
  const st = await cartEnsureStripe();
  if (seq !== cartEagerSeq) return; // a reset / newer mount superseded this run
  if (st === 'unconfigured') { cartShowErr('Online payment is still being connected — text or call (707) 862-3773 and the Team will take your order.'); cartGatePaint(); return; }
  if (st !== 'ready') { cartGatePaint(); return; } // 'failed' already painted: hosted door + ref code
  cartMountDeferred();
  cartGatePaint();
}
function cartShowCheckout(){
  applyCcPrefill();
  if (!cartLoad().length) return;
  const card = document.getElementById('cartCheckoutCard'); if (!card) return;
  card.style.display = 'block';
  const done = document.getElementById('cartDone'); if (done) done.style.display = 'none';
  const acct = document.getElementById('ccAcct'); if (acct) acct.style.display = me ? 'none' : 'block';
  if (me && me.serviceAddress) { const ad = document.getElementById('ccAddress'); if (ad && !ad.value) ad.value = me.serviceAddress; }
  cartPaintOffer();
  renderCcLines();
  renderCartTotalsDue();
  cartQuoteRefresh();
  if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth' });
  // v80.4: the payment form loads WITH the page — mount it NOW, in
  // parallel with the customer filling the form; the Pay button
  // stays gated until the data validates (cartGatePaint). The
  // server arm waits for the submit tap, exactly as designed.
  cartGatePaint();
  return cartEagerMount();
}
function cartJoinToggled(){
  // v80.4: the toggle is the MODE switch (deposit <-> join setup).
  // The armed context drops, the element remounts in the new mode,
  // typed data survives (the inputs are never rebuilt).
  cartResetCheckout();
  renderCcLines();
  renderCartTotalsDue();
  return cartEagerMount();
}
// ---------- v80 piece 7: resilient Stripe.js loading for the cart ----------
// ROOT CAUSE (Gabriel's live screenshot, 2026-10-25 22:39): the pay box
// showed the permanent "still being connected" banner on a phone whose
// server config was VERIFIED good (configured:true + the real pk_live)
// — the static js.stripe.com tag had simply failed/slow-loaded on the
// device, cartEnsureStripe returned false with NO retry, and a
// transient load failure got painted as a permanent state. Now:
// Stripe.js loads through a dynamic injector with timeouts + retries
// (the v35 no-latch discipline, extended to the script itself), the
// config fetch retries too, and the pay box paints HONEST states —
// loading / load-failed with Try again — reserving "still being
// connected" for a server that genuinely reports no key.
let cartStripeState = 'idle'; // idle | loading | ready | unconfigured | failed
let cartStripeFailStage = ''; // v80.1: CFG | JS | INIT — WHICH stage died (painted as a small ref: code in the error box)
let stripeJsPromise = null;
function loadStripeJsOnce(timeoutMs){
  return new Promise(function(resolve){
    if (typeof Stripe !== 'undefined') { resolve(true); return; }
    let done = false;
    const finish = function(ok){ if (done) return; done = true; resolve(!!ok && typeof Stripe !== 'undefined'); };
    try {
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = function(){ finish(true); };
      s.onerror = function(){ try { s.remove(); } catch (e) {} finish(false); };
      (document.head || document.body || document.documentElement).appendChild(s);
    } catch (e) { finish(false); return; }
    setTimeout(function(){ finish(typeof Stripe !== 'undefined'); }, timeoutMs || 8000);
  });
}
async function loadStripeJs(){
  if (typeof Stripe !== 'undefined') return true;
  if (stripeJsPromise) return stripeJsPromise;
  stripeJsPromise = (async function(){
    for (let i = 0; i < 3; i++) {
      if (await loadStripeJsOnce(8000)) return true;
      if (i < 2) await new Promise(function(r){ setTimeout(r, 600 * (i + 1)); });
    }
    return typeof Stripe !== 'undefined';
  })();
  try { return await stripeJsPromise; } finally { stripeJsPromise = null; }
}
function paintCartPayState(){
  const host = document.getElementById('cartPayElement'); if (!host) return;
  if (cartElements) return; // a mounted Payment Element owns the box
  if (cartStripeState === 'loading') host.innerHTML = '<p class="mut" style="padding:10px 2px">' + CU('cartPayLoading') + '</p>';
  // v80.2: idle means NO prepare is running — the box shows nothing,
  // never a stale "Loading secure payment…" left over from an
  // earlier, already-finished attempt (the v80.1 acceptance wart).
  else if (cartStripeState === 'idle') host.innerHTML = '';
  // v80.1: the failure box carries the guaranteed door — the HOSTED
  // Stripe page (no Stripe.js needed in this browser) — plus the
  // retry, plus the stage ref so a real-device test reports WHICH
  // stage failed (CFG config fetch / JS script load / INIT construct).
  else if (cartStripeState === 'failed') host.innerHTML = '<div style="color:#ff9aa2;background:#2a0d10;border:1px solid #7a2027;border-radius:10px;padding:10px">' + CU('cartPayFailBody') + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" style="background:#e42535;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer" onclick="cartPayHosted()">' + CU('cartPayHostedBtn') + '</button><button type="button" onclick="cartRetryStripe()">' + CU('cartPayRetryBtn') + '</button></div>' + (cartStripeFailStage ? '<div style="margin-top:6px;font-size:11px;color:#ff8a94">ref: ' + cartStripeFailStage + '</div>' : '') + '</div>';
}
function cartRetryStripe(){ cartStripeState = 'idle'; paintCartPayState(); cartEagerMount(true); }
// v80.1: the config fetch gets a HARD timeout. api() has none — the
// Render-origin bisect HUNG in "Loading secure payment…" past 30 s
// on a stalled config fetch (the retry loop below never advanced:
// hypothesis — connection starvation, the app's long-lived SSE
// streams against the browser's per-host connection cap on
// HTTP/1.1; curl, on a fresh connection, always succeeded). Racing
// the fetch against a timeout turns a stall into a retryable CFG
// failure, never a hang.
async function cartConfigFetch(){
  const timeout = new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('config timeout')); }, 6000); });
  const work = (async function(){
    const r = await fetch('/api/stripe/config', { headers: { 'Content-Type': 'application/json' } });
    const d = await r.json().catch(function(){ return {}; });
    if (!r.ok) throw new Error(d.error || 'config failed');
    return d;
  })();
  return Promise.race([work, timeout]);
}
async function cartEnsureStripe(){
  if (stripeObj) { cartStripeState = 'ready'; return 'ready'; }
  cartStripeState = 'loading'; cartStripeFailStage = ''; paintCartPayState();
  for (let attempt = 0; attempt < 3; attempt++) {
    let cfg = null;
    try { cfg = await cartConfigFetch(); } catch (e) { cfg = null; }
    if (cfg) {
      // The server ANSWERED: an empty key is a genuine "not connected"
      // (no retry — it is a fact, not a hiccup); a real key moves on to
      // the script load, which retries on its own loop.
      if (!cfg.publishableKey) { cartStripeState = 'unconfigured'; return 'unconfigured'; }
      if (!(await loadStripeJs())) { cartStripeFailStage = 'JS'; cartStripeState = 'failed'; paintCartPayState(); return 'failed'; }
      try { stripeObj = Stripe(cfg.publishableKey); } catch (e) { stripeObj = null; }
      if (stripeObj) { cartStripeState = 'ready'; return 'ready'; }
      cartStripeFailStage = 'INIT'; cartStripeState = 'failed'; paintCartPayState(); return 'failed';
    }
    if (attempt < 2) await new Promise(function(r){ setTimeout(r, 700 * (attempt + 1)); });
  }
  cartStripeFailStage = 'CFG'; cartStripeState = 'failed'; paintCartPayState(); return 'failed';
}
// v80.4: the classic mount (elements born from a clientSecret) is
// RETIRED — the element is always born deferred at checkout entry
// (cartMountDeferred, above) and the secret arrives at submit time,
// in cartPrepare's context, for the confirm call.
let cartErrValidation = false; // v80.2: the visible note came from form validation
function cartShowErr(t){
  const e = document.getElementById('cartPayErr');
  if (!t) cartErrValidation = false; // v80.2: clearing the note retires its validation flag too
  if (e) { e.textContent = t || ''; e.style.display = t ? 'block' : 'none'; }
}
// v80.2: a note that came from FORM VALIDATION (address, account
// fields) clears itself the moment the customer edits the form — a
// stale "Enter the service address" must not sit on screen after the
// address has been typed (the second v80.1 acceptance wart).
function cartShowValidationErr(t){
  cartErrValidation = !!t;
  const e = document.getElementById('cartPayErr');
  if (e) { e.textContent = t || ''; e.style.display = t ? 'block' : 'none'; }
}
// v80.2: a SERVER-side checkout failure is never a dead end — the
// error box ALSO carries the hosted door (Stripe's own page; no
// Stripe.js needed in this browser). cartPayHosted re-reads the
// CURRENT form intent: join still checked -> the join session;
// membership already active -> the plain deposit session at member
// totals. One intent, both doors.
function cartShowErrWithHosted(t){
  cartErrValidation = false;
  const e = document.getElementById('cartPayErr');
  if (!e) { cartShowErr(t); return; }
  e.innerHTML = escHtml(t || '') + '<div style="margin-top:8px"><button type="button" style="background:#e42535;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer" onclick="cartPayHosted()">Pay on Stripe\'s secure page · Pagar en la página segura de Stripe</button></div>';
  e.style.display = 'block';
}
try {
  ['ccAddress', 'ccCity', 'ccName', 'ccEmail', 'ccPhone', 'ccPass', 'ccWhenText', 'ccNotes'].forEach(function(fid){
    const f = document.getElementById(fid);
    // v80.4: every keystroke re-runs the Pay gate — the button wakes
    // the moment the last required field validates (and sleeps again
    // if a field is cleared).
    if (f && f.addEventListener) f.addEventListener('input', function(){ if (cartErrValidation) cartShowErr(''); cartGatePaint(); });
  });
} catch (e) {}
// v80 A-7 (plumbing only): normalize a server snapshot into the local
// cart shape; unknown services are dropped (the menu may have changed).
function cartNormalizeSnapshot(items){
  return (items || []).filter(function(it){ return it && MENU_CATALOG[it.id]; }).map(function(it){ return { id: it.id, q: Math.max(1, Math.round(Number(it.q) || 1)), x: Array.isArray(it.x) ? it.x.slice() : [] }; });
}
// A restore link (…#cart-recover=<token>) rehydrates the guest cart
// from the server-side snapshot and lands on the cart. Expired/unknown
// tokens simply land on the cart untouched. NOTHING is ever emailed or
// texted by this flow (STOP TOTAL — the send is a separate decision).
async function cartRecoverFromHash(){
  const m = (location.hash || '').match(/^#cart-recover=([\w-]+)$/);
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search + '#cart'); } catch (e) { location.hash = '#cart'; }
  render();
  try {
    const d = await api('/api/cart/recovery/' + m[1]);
    if (d && Array.isArray(d.items) && d.items.length) {
      cartSave(cartNormalizeSnapshot(d.items));
      cartToast('Your saved cart is back · Tu carrito guardado volvió');
      renderCart();
    }
  } catch (e) { /* expired / unknown token: plain cart landing */ }
}
// In-account surface (customer home): the server-held snapshot shows
// as an honest "you left items" card with a Restore button — in-app
// only, never an outbound message.
async function loadRecoveredCart(){
  const host = document.getElementById('myRecoveredCart'); if (!host || !me || me.role !== 'customer') return;
  let d = null;
  try { d = await api('/api/me/recoverable-cart'); } catch (e) { host.innerHTML = ''; return; }
  const rec = d && d.cart;
  if (!rec || !Array.isArray(rec.items) || !rec.items.length) { host.innerHTML = ''; return; }
  const sig = function(arr){ return JSON.stringify((arr || []).map(function(i){ return [i.id, i.q || 1, (i.x || []).join(',')]; })); };
  if (sig(cartLoad()) === sig(rec.items)) { host.innerHTML = ''; return; }
  const n = rec.items.reduce(function(s, i){ return s + Math.max(1, Math.round(Number(i.q) || 1)); }, 0);
  host._recItems = rec.items;
  host.innerHTML = '<div class="card" style="margin:8px 0"><b>🛒 You left ' + n + ' item' + (n === 1 ? '' : 's') + ' in your cart</b><div class="mut">From your last visit — pick up right where you left off. · De tu última visita — sigue justo donde ibas.</div><div style="margin-top:8px"><button type="button" onclick="applyRecoveredCart()">Restore my cart · Restaurar</button></div></div>';
}
function applyRecoveredCart(){
  const host = document.getElementById('myRecoveredCart'); if (!host || !host._recItems) return;
  cartSave(cartNormalizeSnapshot(host._recItems));
  host.innerHTML = '';
  openCart();
}
// v80.1: ONE payload builder + validator for both cart money rails —
// the embedded Payment Element (cartPrepare) and the hosted escape
// hatch (cartPayHosted) send the server the very same shape, so the
// two doors can never drift apart.
function cartBuildPayload(items){
  const payload = {
    lang: menuLang(),
    items: (items || []).map(function(it){ const s = MENU_CATALOG[it.id]; return { serviceId: it.id, name: s ? s.name : it.id, qty: Math.max(1, Math.round(Number(it.q) || 1)), addons: (it.x || []).slice() }; }),
    address: document.getElementById('ccAddress').value.trim(),
    city: document.getElementById('ccCity').value.trim(),
    when: cartWhenVal + (document.getElementById('ccWhenText').value.trim() ? ' · ' + document.getElementById('ccWhenText').value.trim() : ''),
    notes: document.getElementById('ccNotes').value.trim()
  };
  if (!me) {
    payload.name = document.getElementById('ccName').value.trim();
    payload.email = document.getElementById('ccEmail').value.trim();
    payload.phone = document.getElementById('ccPhone').value.trim();
    payload.password = document.getElementById('ccPass').value;
  }
  return payload;
}
function cartValidatePayload(payload){
  if (!payload.address) return CU('cartValAddress');
  if (!me) {
    if (!payload.name || !/.+@.+\..+/.test(payload.email)) return CU('cartValNameEmail');
    if (!payload.password || payload.password.length < 8) return CU('cartValPassword');
  }
  return '';
}
// v80.1: the hosted escape hatch, one tap from the failure box (and
// safe to call any time): the server builds the SAME pending checkout
// and returns a Stripe-hosted session URL — the browser simply goes
// there. No Stripe.js is involved on this device at all.
async function cartPayHosted(){
  if (cartBusy) return;
  cartShowErr('');
  const items = cartLoad();
  if (!items.length) return;
  const payload = cartBuildPayload(items);
  const perr = cartValidatePayload(payload);
  if (perr) { cartShowValidationErr(perr); return; }
  const joinEl = document.getElementById('ccJoin');
  const joinOn = !cartIsMember() && !!(joinEl && joinEl.checked);
  const btn = document.getElementById('cartPayBtn');
  cartBusy = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Opening secure checkout…'; }
  try {
    const resp = await api('/api/cart/checkout-hosted', { method: 'POST', body: JSON.stringify(Object.assign({ step: joinOn ? 'join' : 'pay', joinedMembership: cartJoinedOnce, source: campaignSource(), lang: (function(){ try { return localStorage.getItem('ghsMenuLang') || 'en'; } catch (e) { return 'en'; } })() }, payload)) });
    if (resp.user) { me = resp.user; const acct = document.getElementById('ccAcct'); if (acct) acct.style.display = 'none'; cartPaintOffer(); }
    if (!resp.url) throw new Error('payment service error — try again in a minute');
    location.href = resp.url;
  } catch (e) {
    if (e.code === 'ACCOUNT_EXISTS') { const n = document.getElementById('ccAcctNote'); if (n) n.innerHTML = '<b>Welcome back!</b> That email already has an account — enter your account password above and tap the button again to continue.'; }
    cartShowErr(e.message);
  } finally { cartBusy = false; cartGatePaint(); }
}
async function cartPrepare(){
  if (cartBusy) return;
  cartShowErr('');
  const items = cartLoad();
  if (!items.length) return;
  const btn = document.getElementById('cartPayBtn');
  // v80.2: validate BEFORE touching Stripe — an invalid form fails
  // fast with its note while the pay box stays idle, instead of
  // sitting in "Loading secure payment…" behind a stale note for a
  // prepare that was never going to run (v80.1 acceptance wart).
  const payload = cartBuildPayload(items);
  const perr = cartValidatePayload(payload);
  if (perr) { cartShowValidationErr(perr); return; }
  cartBusy = true;
  cartGatePaint('Preparing secure payment…');
  try {
    // v80 piece 7: three distinct outcomes — 'unconfigured' is the ONLY
    // one that earns the "still being connected" house message; a load
    // failure keeps the honest error + Try again painted in the pay box
    // and simply stops (no false permanent banner).
    const cst80 = await cartEnsureStripe();
    if (cst80 === 'unconfigured') throw new Error('Online payment is still being connected — text or call (707) 862-3773 and the Team will take your order.');
    if (cst80 !== 'ready') { cartShowErr(''); return; }
    const joinEl = document.getElementById('ccJoin');
    const joinOn = !cartIsMember() && !!(joinEl && joinEl.checked);
    const resp = await api('/api/cart/checkout', { method: 'POST', body: JSON.stringify(Object.assign({ step: joinOn ? 'join' : 'pay', joinedMembership: cartJoinedOnce, source: campaignSource() }, payload)) });
    if (resp.user) {
      me = resp.user;
      const acct = document.getElementById('ccAcct'); if (acct) acct.style.display = 'none';
      cartPaintOffer();
    }
    // v80.2: the server already HAD this membership (state, e.g. a
    // retried join) and answered with the pay step directly — the
    // join DID happen, so the confirmation copy must say so.
    if (joinOn && resp.step === 'pay' && resp.user && resp.user.homeCareStatus === 'active') cartJoinedOnce = true;
    cartPayCtx = { phase: resp.step, mode: resp.mode || 'payment', clientSecret: resp.clientSecret, checkoutId: resp.checkoutId || '', paymentIntentId: resp.paymentIntentId || '', subscriptionId: resp.subscriptionId || '', due: resp.totals ? resp.totals.due : 0, deposit: resp.totals && resp.totals.deposit != null ? resp.totals.deposit : (resp.totals ? resp.totals.due : 0), balance: resp.totals && resp.totals.balance != null ? resp.totals.balance : 0 };
    if (resp.totals) cartQuote = resp.totals; // server-true totals paint the summary
    // v80 A-7 plumbing: this checkout (guest with an email, or a signed-
    // in customer) leaves a server-side recoverable snapshot of the
    // cart. Fire-and-forget; it never affects the payment flow, and
    // NOTHING is sent anywhere by it (STOP TOTAL).
    try { api('/api/cart/save-recovery', { method: 'POST', body: JSON.stringify({ email: payload.email || '', items: payload.items }) }).catch(function(){}); } catch (e) {}
    renderCartTotalsDue();
    // v80.4: the element was mounted at ENTRY (deferred) — the arm
    // only guarantees it stands in the mode THIS context needs (a
    // join arm answers a SetupIntent secret -> setup element; any
    // payment secret -> payment element). A mode flip here is the
    // rare non-trial join; amount drift alone NEVER remounts at arm
    // time — the fresh server secret is the charge truth, and the
    // confirm below runs against the mounted element with it.
    const wantMode = cartPayCtx.phase === 'join' ? cartPayCtx.mode : 'payment';
    if (cartElements && cartElementsMode !== wantMode) { cartElements = null; cartElementReady = false; }
    if (!cartElements) cartMountDeferred(wantMode);
  } catch (e) {
    if (e.code === 'ACCOUNT_EXISTS') { const n = document.getElementById('ccAcctNote'); if (n) n.innerHTML = '<b>Welcome back!</b> That email already has an account — enter your account password above and tap Pay again to continue.'; cartShowErr(e.message); }
    else if (e.status && e.status >= 500) {
      // v80.2: a SERVER-side failure mid-checkout (the v80.1 join
      // dead-end) is never the end of the road: refresh the account
      // state first — the membership may have activated server-side
      // during the failed attempt, and then the hosted door below is
      // the plain member deposit session — then show the error WITH
      // the hosted door carrying the customer's current intent.
      try { const d = await api('/api/me'); if (d && d.user) { me = d.user; cartPaintOffer(); } } catch (e2) {}
      cartShowErrWithHosted(e.message);
    }
    else cartShowErr(e.message);
  } finally { cartBusy = false; cartGatePaint(); }
}
async function cartPayNow(){
  if (cartBusy) return;
  // v80.4: nothing mounted yet (the tap raced the eager mount, or a
  // reset landed first) — mount, don't charge.
  if (!cartElements) { cartEagerMount(); return; }
  cartShowErr('');
  cartBusy = true;
  cartGatePaint('Processing…');
  try {
    // v80.4 deferred discipline: validate the payment element FIRST
    // (its own fields — Stripe reports inline), and only then arm
    // the server side. An invalid card never creates an account, a
    // pending checkout or an intent.
    if (cartElements && typeof cartElements.submit === 'function') {
      let sr = null;
      try { sr = await cartElements.submit(); } catch (e) { sr = { error: e }; }
      if (sr && sr.error) { const ce = new Error(sr.error.message || 'Check the payment details and try again.'); ce.cardError = true; throw ce; }
    }
    if (!cartPayCtx) {
      cartBusy = false; // cartPrepare runs its own busy cycle
      await cartPrepare();
      if (!cartPayCtx) return; // prepare painted its own error/state
      cartBusy = true; cartGatePaint('Processing…');
    }
    // v80.2: a trial join's secret is a SetupIntent (the $0 trial
    // invoice has no PaymentIntent) — it confirms as a SETUP; a
    // normal secret confirms as a payment. Same Elements instance.
    // v80.4: the instance is DEFERRED, so the fresh secret from the
    // arm rides in the confirm call itself.
    const confirmArgs = { elements: cartElements, clientSecret: cartPayCtx.clientSecret, redirect: 'if_required', confirmParams: { return_url: location.origin + location.pathname + '#cart' } };
    const res = cartPayCtx.mode === 'setup' ? await stripeObj.confirmSetup(confirmArgs) : await stripeObj.confirmPayment(confirmArgs);
    if (res.error) { const ce = new Error(res.error.message); ce.cardError = true; throw ce; }
    if (cartPayCtx.phase === 'join') {
      const chk = await api('/api/stripe/homecare-confirm', { method: 'POST' });
      if (!chk.active) throw new Error('Your membership payment did not complete — your cart is intact and no order was created. Try the card again.');
      cartJoinedOnce = true;
      if (me) me.homeCareStatus = 'active'; // the confirm endpoint just verified it; /api/me below refreshes the full record
      try { const d = await api('/api/me'); if (d.user) me = d.user; } catch (e) {}
      cartPayCtx = null;
      cartPaintOffer();
      cartBusy = false;
      cartToast('🎉 HomeCare is active — member price applied to your order');
      await cartPrepare();
      return;
    }
    const piId = (res.paymentIntent && res.paymentIntent.id) || cartPayCtx.paymentIntentId;
    const done = await api('/api/cart/checkout-confirm', { method: 'POST', body: JSON.stringify({ checkoutId: cartPayCtx.checkoutId, paymentIntentId: piId }) });
    cartOnPaid(done.requestId);
  } catch (e) {
    // P0-4: a failed payment creates NO order and shows NO success —
    // the cart is untouched and the error renders right here, in-theme.
    // v80.2: a CARD error stays a plain note (the mounted form is the
    // right retry path); a SERVER error also offers the hosted door.
    if (e && !e.cardError && e.status && e.status >= 500) cartShowErrWithHosted(e.message);
    else cartShowErr(e.message);
    // v80.4: the gate restores the button (label from the armed
    // context, enabled while the form + element stand).
  } finally { cartBusy = false; cartGatePaint(); }
}
function cartOnPaid(requestId){
  const ccDep = cartPayCtx ? cartPayCtx.deposit : null, ccBal = cartPayCtx ? cartPayCtx.balance : 0;
  cartSave([]);
  cartResetCheckout();
  const cc = document.getElementById('cartCheckoutCard'); if (cc) cc.style.display = 'none';
  const lines = document.getElementById('cartLines'); if (lines) lines.innerHTML = '';
  const totals = document.getElementById('cartTotals'); if (totals) totals.innerHTML = '';
  const emptyEl = document.getElementById('cartEmpty'); if (emptyEl) emptyEl.style.display = 'none';
  const coBtn = document.getElementById('cartCheckoutBtn'); if (coBtn) coBtn.style.display = 'none';
  const clBtn = document.getElementById('cartClearBtn'); if (clBtn) clBtn.style.display = 'none';
  const d = document.getElementById('cartDone');
  if (d) {
    d.style.display = 'block';
    d.innerHTML = '<h3>' + CU('ordPlacedH') + escHtml(requestId || '') + '</h3><p>' + (ccBal > 0 ? CU('ordDepositTpl').replace('{dep}', '$' + ccDep).replace('{bal}', '$' + ccBal) : CU('ordPaidFullBody')) + CU('ordFollow') + '</p>' + (cartJoinedOnce ? '<p>' + CU('ordWelcome') + '</p>' : '') + '<button onclick="exitCart()">' + CU('ordGoOrders') + '</button>';
    if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth' });
  }
}
try { paintCartBtn(); } catch (e) {}
// ---------- v80.1: hosted checkout return ----------
// Stripe sends the customer back to /?cartPaid=1&session_id=…#cart
// (or ?cartCancelled=1#cart). The flags alone book NOTHING: the
// session id goes to the confirm endpoint, which verifies it against
// Stripe server-side before any order exists (the webhooks settle
// identically if this call never lands). On success the SAME
// cartOnPaid panel the embedded flow uses closes the loop.
async function cartHostedReturn(){
  let qs = null;
  try { qs = new URLSearchParams(location.search || ''); } catch (e) { return; }
  const sid = qs.get('session_id') || '';
  const cancelled = qs.get('cartCancelled') === '1';
  if (!sid && !cancelled) return;
  try { history.replaceState(null, '', location.pathname + '#cart'); } catch (e) { try { location.hash = '#cart'; } catch (e2) {} }
  if (cancelled) { cartToast('Checkout cancelled — your cart is intact · Pago cancelado — tu carrito sigue intacto'); return; }
  try { renderCart(); } catch (e) {}
  try {
    const done = await api('/api/cart/checkout-hosted-confirm', { method: 'POST', body: JSON.stringify({ sessionId: sid }) });
    if (done && done.requestId) {
      if (done.joined) cartJoinedOnce = true;
      cartPayCtx = { phase: 'pay', deposit: done.deposit, balance: done.balance, checkoutId: '' };
      cartOnPaid(done.requestId);
      return;
    }
    throw new Error('unverified');
  } catch (e) {
    cartToast('If your payment went through, your booking is confirmed — sign in to see it in your orders. · Si tu pago pasó, tu reserva está confirmada — entra a tu cuenta para verla en tus órdenes.');
  }
}
try { cartHostedReturn(); } catch (e) {}

// ---------- Solicitud Profesional + in-app Menu (added 2026-10-23, v42) ----------
// The plain one-long-form request is now a 4-step wizard (progress bar,
// one topic per screen) that submits through the SAME /api/requests path
// with the SAME fields the old form produced — the admin receives
// identical requests. Category images are the brand's created photos,
// reused from the storefront cards (downscaled). The in-app Menu reads
// MENU_CATALOG as-is: cards, prices and member prices are the catalog's
// own. (v79: every Order button now adds the service to the cart and
// lands on #cart via orderNow(); the old #order/<id> page is retired.)
const CAT_IMGS = {"carpentry": "/cat-img/carpentry.jpg", "electrical": "/cat-img/electrical.jpg", "plumbing": "/cat-img/plumbing.jpg", "gardening": "/cat-img/gardening.jpg", "mechanic": "/cat-img/mechanic.jpg", "otro": "/cat-img/otro.webp"};
const WZ_CATS = [
  { key: 'carpentry', service: 'Carpentry', hint: 'Tell us what it is — a door, a cabinet, trim, a shelf — plus rough sizes and what is wrong (or what it should look like).', ph: 'Example: hang an interior door, 32", the old one is warped…', photo: 'one wide shot of the area and a close-up of the problem spot.' },
  { key: 'electrical', service: 'Electrical', hint: 'Say what should be installed or swapped (fan, light, doorbell, opener) and whether the wiring/box is already there.', ph: 'Example: swap a ceiling fan, box already in place…', photo: 'the current fixture and the spot where the new one goes.' },
  { key: 'plumbing', service: 'Plumbing', hint: 'Say where it leaks, drips or clogs, and the fixture brand if you know it. Water damage? Say where.', ph: 'Example: kitchen faucet drips at the base, single handle…', photo: 'the fixture up close and the pipes/valves under it.' },
  { key: 'gardening', service: 'Gardening / Yard', hint: 'Say what the yard needs — cleanup, mowing rescue, hauling — and roughly how big the area is.', ph: 'Example: backyard cleanup, knee-high weeds, one green-waste load…', photo: 'the whole yard from the gate and the worst corner up close.' },
  { key: 'mechanic', service: 'Mobile Mechanic', hint: 'Say the year, make and model, what it does (or does not do), and any warning lights or noises.', ph: 'Example: 2015 Honda Accord, clicks but will not start…', photo: 'the car, the engine bay and the dashboard lights if it turns on.' },
  { key: 'otro', service: 'Other / Not sure', hint: 'Describe it in your own words — what it is, where it is, and what you want done. The Team figures out the rest.', ph: 'Example: I need help with…', photo: 'one wide shot of the area and a close-up of the problem spot.' }
];
const MENU_GROUPS = [
  { key: 'carpentry', es: 'Carpintería', en: 'Carpentry & installs', services: ['tv-mounting', 'tv-mounting-large', 'furniture-assembly', 'door-slab-swap', 'closet-organizer', 'drywall-patch-medium', 'closet-doors', 'door-knob-install', 'deadbolt-install', 'deadbolt-knob-combo', 'smart-lock-install', 'door-adjustment', 'weatherstripping', 'screen-door-install', 'sliding-door-service', 'window-screen-repair', 'pet-door-install', 'furniture-assembly-large', 'floating-shelves', 'cabinet-hardware-install', 'baby-gate-install', 'picture-mirror-hanging', 'mirror-cabinet-install', 'curtain-rod-install', 'blinds-install', 'blinds-install-deal', 'baseboard-install', 'baseboard-repair', 'laminate-floor-repair', 'carpet-repair', 'transition-strip-install', 'drywall-patch-small', 'drywall-holes-set', 'paint-room', 'paint-room-large', 'paint-room-large-ceiling', 'accent-wall-painting', 'interior-door-painting', 'fence-picket-repair', 'fence-post-replacement', 'deck-board-replacement', 'gate-repair', 'heavy-furniture-move'] },
  { key: 'electrical', es: 'Electricidad', en: 'Electrical', services: ['ceiling-fan', 'ring-doorbell', 'holiday-lights', 'garage-opener', 'soundbar-mounting', 'chandelier-swap', 'light-fixture-swap', 'exhaust-fan-swap', 'dimmer-switch-swap', 'smoke-co-detector-install', 'smart-thermostat-install', 'security-camera-install', 'holiday-lights-two-story', 'holiday-lights-takedown', 'holiday-lights-takedown-two-story', 'window-ac-install'] },
  { key: 'plumbing', es: 'Plomería', en: 'Plumbing', services: ['toilet-replacement', 'water-heater', 'drain-unclog', 'faucet-replacement', 'dishwasher-swap', 'vanity-swap', 'toilet-repair', 'garbage-disposal-swap', 'showerhead-swap', 'tub-shower-recaulk', 'grab-bar-install', 'p-trap-swap', 'bidet-seat-install', 'dryer-vent-cleaning', 'washer-dryer-hookup', 'bathroom-accessories-install', 'hose-bibb-swap'] },
  { key: 'gardening', es: 'Jardinería', en: 'Yard, junk & hauling', services: ['yard-cleanup', 'gutter-cleaning', 'junk-minimum', 'junk-medium', 'junk-large', 'junk-full', 'green-waste', 'gutter-cleaning-two-story', 'pressure-washing', 'pressure-washing-large', 'sprinkler-irrigation', 'mailbox-install'] },
  { key: 'mechanic', es: 'Mecánica', en: 'Mobile mechanic', services: ['oil-change', 'brake-pads', 'battery-replacement', 'alternator-replacement', 'alternator-difficult', 'starter-replacement', 'fuel-pump-replacement', 'fuel-pump-tank-drop', 'check-engine-diagnostics', 'belt-hose-replacement', 'spark-plug-replacement', 'spark-plug-v6v8', 'turbo-replacement', 'headlight-replacement'] }
];
const wzState = { step: 1, cat: '', est: 'inperson', city: '', when: '' };
function wzCatOf(key) { return WZ_CATS.find(function (c) { return c.key === key; }) || null; }
function wzGroupOf(key) { return MENU_GROUPS.find(function (g) { return g.key === key; }) || null; }
function wzMsg(t) { const m = document.getElementById('wzMsg'); if (!m) return; m.textContent = t || ''; m.style.display = t ? 'block' : 'none'; }
function wzShow(step) {
  wzState.step = step;
  [1, 2, 3, 4].forEach(function (n) { const el = document.getElementById('wzStep' + n); if (el) el.style.display = n === step ? 'block' : 'none'; });
  const done = document.getElementById('wzDone'); if (done) done.style.display = 'none';
  const nav = document.getElementById('wzNav'); if (nav) nav.style.display = 'flex';
  const fill = document.getElementById('wzBarFill'); if (fill) fill.style.width = (step * 25) + '%';
  const lbl = document.getElementById('wzStepLabel'); if (lbl) lbl.textContent = CU('wzStepOfTpl').replace('{n}', step);
  const back = document.getElementById('wzBack'); if (back) back.style.visibility = step === 1 ? 'hidden' : 'visible';
  const next = document.getElementById('wzNext'); if (next) next.style.display = step === 4 ? 'none' : '';
  if (step === 4) wzBuildSummary();
}
function wzGo(n) { wzMsg(''); wzShow(n); const c = document.getElementById('wizardCard'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth' }); }
function wzBackFn() { if (wzState.step > 1) wzGo(wzState.step - 1); }
function wzNextFn() {
  const step = wzState.step;
  if (step === 1) {
    if (!pickOne('cService') && !wzState.cat) { wzMsg('Pick what you need first · Primero escoge qué necesitas.'); return; }
    wzGo(2); return;
  }
  if (step === 2) {
    if (!document.getElementById('rDesc').value.trim()) { wzMsg('Describe the job in a sentence or two · Describe el trabajo en una o dos frases.'); return; }
    const est = pickOne('cEst') || wzState.est;
    if (est === 'photo') { const f = document.getElementById('rPhotos'); if (!f || !f.files || !f.files.length) { wzMsg('Free photo estimates need at least one picture — add photos or switch to in-person. · El estimado por foto necesita al menos una foto.'); return; } }
    wzGo(3); return;
  }
  if (step === 3) {
    if (!(pickOne('cCity') || wzState.city)) { wzMsg('Pick your city · Escoge tu ciudad.'); return; }
    if (!document.getElementById('rAddr').value.trim()) { wzMsg('Add the home address · Agrega la dirección.'); return; }
    if (!(pickOne('cWhen') || wzState.when)) { wzMsg('Choose when you need it · Escoge cuándo lo necesitas.'); return; }
    wzGo(4); return;
  }
}
function wzPickCat(key) {
  const cat = wzCatOf(key); if (!cat) return;
  wzState.cat = key;
  const g = document.getElementById('cService');
  if (g) g.querySelectorAll('button').forEach(function (b) { b.classList.toggle('sel', b.getAttribute('data-v') === cat.service); });
  wzRenderMenuPanel();
  wzApplyCatHints();
}
function wzRenderMenuPanel() {
  const p = document.getElementById('wzMenuPanel'); if (!p) return;
  const grp = wzGroupOf(wzState.cat);
  const L = menuLang(), ui = MENU_UI[L];
  if (!grp) {
    p.innerHTML = wzState.cat === 'otro' ? '<p class="mut" style="margin-top:10px">' + ui.wzOther + '</p>' : '';
    return;
  }
  let h = '<p class="mut" style="margin:12px 0 6px"><b>' + ui.wzHead + '</b></p>';
  h += grp.services.map(function (id) { const s = MENU_CATALOG[id]; if (!s) return ''; if (s.est) return '<div class="wz-mi">' + svcImgHtml(id, grp.key, 'wz-mi-img') + '<span class="wz-mi-main"><b>' + escHtml(svcName(id)) + '</b> <span class="mut">' + escHtml(svcMeta(id)) + '</span></span><span class="wz-mi-price">' + (L === 'es' ? 'Desde ' : 'From ') + '$' + s.price + (s.member ? ' · <span class="wz-mem">' + ui.members + ' $' + s.member + '</span>' : '') + '</span><button type="button" onclick="orderEstimate(\'' + id + '\')">' + ui.estBtn + '</button></div>'; return '<div class="wz-mi">' + svcImgHtml(id, grp.key, 'wz-mi-img') + '<span class="wz-mi-main"><b>' + escHtml(svcName(id)) + '</b> <span class="mut">' + escHtml(svcMeta(id)) + '</span></span><span class="wz-mi-price">$' + s.price + (s.from ? '–$300' : '') + (s.member ? ' · <span class="wz-mem">' + ui.members + ' $' + s.member + '</span>' : '') + '</span><button type="button" onclick="orderNow(\'' + id + '\')">' + ui.order + '</button><button type="button" class="ghost cart-add-mini" title="' + ui.addCart + '" onclick="cartAdd(\'' + id + '\');return false;">＋🛒</button></div>'; }).join('');
  h += '<p class="mut" style="margin:8px 0 0">' + ui.wzFoot + '</p>';
  p.innerHTML = h;
}
function wzApplyCatHints() {
  const cat = wzCatOf(wzState.cat); if (!cat) return;
  const hint = document.getElementById('wzDescHint'); if (hint) hint.textContent = cat.hint;
  const ta = document.getElementById('rDesc'); if (ta) ta.placeholder = cat.ph;
  const guide = document.getElementById('wzPhotoGuide');
  if (guide) guide.innerHTML = '<div class="wz-guide"><img src="' + CAT_IMGS[cat.key] + '" alt=""><span><b>Qué fotografiar · What to photograph:</b> ' + escHtml(cat.photo) + '</span></div>';
}
function wzMemberState() {
  const picked = pickOne('cMember'); if (picked) return picked;
  if (me && me.role === 'customer') {
    const p = me.membershipPlan || {};
    const anyM = me.homeCareStatus === 'active' || (p.status === 'active' && !!p.planKey);
    if (anyM) return me.freeEstimateUsed ? 'member' : 'new';
  }
  return 'none';
}
function wzFee() {
  const est = pickOne('cEst') || wzState.est || 'inperson';
  if (est === 'photo') return { label: CU('feeFreePhoto'), due: 0 };
  const member = wzMemberState();
  // v80 P1-7 (Gabriel's law): the ASAP +25% applies to LABOR — never to
  // the estimate fee itself. The fee is flat: $75 regular / $50 member /
  // $0 for the member's free first estimate, urgent or not. (The server
  // has always computed estimateDue flat; the wizard display now agrees.)
  const base = member === 'new' ? 0 : (member === 'member' ? 50 : 75);
  return { label: (member === 'new' ? CU('feeFreeMember') : (member === 'member' ? CU('feeMember50') : CU('feeFlat75'))), due: base };
}
function wzBuildSummary() {
  const box = document.getElementById('wzSummary'); if (!box) return;
  const cat = wzCatOf(wzState.cat);
  const service = pickOne('cService') || (cat ? cat.service : '') || '—';
  const est = pickOne('cEst') || wzState.est || 'inperson';
  const f = wzFee();
  const wsel = pickOne('cWhen') || wzState.when;
  const when = (wsel === 'Pick a date' && document.getElementById('rDate').value) ? CU('wizWhenOn') + document.getElementById('rDate').value : (wsel || '—');
  const city = pickOne('cCity') || wzState.city || '—';
  const addr = document.getElementById('rAddr').value.trim();
  const desc = document.getElementById('rDesc').value.trim();
  const access = document.getElementById('rAccess').value.trim();
  const files = document.getElementById('rPhotos').files;
  const nPhotos = files && files.length ? files.length : 0;
  const contact = me ? (me.name + ' · ' + (me.email || '')) : [document.getElementById('rName').value.trim(), document.getElementById('rEmail').value.trim(), document.getElementById('rPhone').value.trim()].filter(Boolean).join(' · ');
  let h = '<div class="wz-sum">';
  h += '<div><span>' + CU('sumService') + '</span><b>' + escHtml(service) + '</b></div>';
  if (desc) h += '<div><span>' + CU('sumDetails') + '</span><b>' + escHtml(desc.length > 140 ? desc.slice(0, 140) + '…' : desc) + '</b></div>';
  h += '<div><span>' + CU('sumPhotos') + '</span><b>' + (nPhotos ? nPhotos + CU('sumAttached') : CU('sumNone')) + '</b></div>';
  h += '<div><span>' + CU('sumEstimate') + '</span><b>' + escHtml(est === 'photo' ? CU('feeFreePhoto') : (CU('feeTitleInPersonPre2') + f.label)) + '</b></div>';
  h += '<div><span>' + CU('sumWhere') + '</span><b>' + escHtml(city + (addr ? ' — ' + addr : '')) + '</b></div>';
  h += '<div><span>' + CU('sumWhen') + '</span><b>' + escHtml(when) + '</b></div>';
  if (access) h += '<div><span>' + CU('sumAccess') + '</span><b>' + escHtml(access) + '</b></div>';
  if (contact) h += '<div><span>' + CU('sumContact') + '</span><b>' + escHtml(contact) + '</b></div>';
  h += '</div>';
  box.innerHTML = h;
  if (typeof custSummary === 'function') custSummary();
}
function wzShowDone(req) {
  const z = document.getElementById('wzDone'); if (!z || !req) return;
  [1, 2, 3, 4].forEach(function (n) { const el = document.getElementById('wzStep' + n); if (el) el.style.display = 'none'; });
  const nav = document.getElementById('wzNav'); if (nav) nav.style.display = 'none';
  const fill = document.getElementById('wzBarFill'); if (fill) fill.style.width = '100%';
  const lbl = document.getElementById('wzStepLabel'); if (lbl) lbl.textContent = CU('wzDone');
  z.innerHTML = '<h3 style="margin-top:4px">✅ Request sent — ' + escHtml(req.id) + '</h3>'
    + '<p style="margin-bottom:2px"><b>Qué sigue · What happens next</b></p>'
    + '<ol class="wz-next-steps"><li>The Team reviews your request. · El Team revisa tu solicitud.</li><li>We send your quote and confirm your time. · Te mandamos el precio y confirmamos tu hora.</li><li>You approve it and we schedule your technician. · Lo apruebas y agendamos a tu técnico.</li></ol>'
    + (me
      ? '<button type="button" onclick="document.getElementById(\'myRequests\').scrollIntoView({behavior:\'smooth\'})">See my requests · Ver mis solicitudes</button> '
      : '<button type="button" onclick="showLogin()">Create an account to track it · Crea tu cuenta</button> ')
    + '<a class="wz-wa" href="https://wa.me/17078623773?text=Hi!%20I%27d%20like%20a%20free%20photo%20estimate%20%F0%9F%93%B8" target="_blank" rel="noopener">📸 Free photo estimate</a>'
    + '<button type="button" class="ghost" onclick="wzReset()">Make another request · Otra solicitud</button>';
  z.style.display = 'block';
  if (z.scrollIntoView) z.scrollIntoView({ behavior: 'smooth' });
}
function wzReset() {
  wzState.cat = '';
  const g = document.getElementById('cService');
  if (g) g.querySelectorAll('button').forEach(function (b) { b.classList.remove('sel'); });
  ['rDesc', 'rAccess'].forEach(function (id) { const e = document.getElementById(id); if (e) e.value = ''; });
  const rp = document.getElementById('rPhotos'); if (rp) rp.value = '';
  wzRenderMenuPanel();
  wzGo(1);
}
let wzAddrTimer = null;
function wzAddrInput() {
  const inp = document.getElementById('rAddr'); const box = document.getElementById('wzAddrSugg');
  if (!inp || !box) return;
  const q = inp.value.trim();
  if (wzAddrTimer) clearTimeout(wzAddrTimer);
  if (q.length < 5) { box.innerHTML = ''; return; }
  wzAddrTimer = setTimeout(async function () {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q=' + encodeURIComponent(q));
      const d = await r.json();
      if (!Array.isArray(d)) { box.innerHTML = ''; return; }
      box.innerHTML = d.map(function (it) { return '<button type="button" class="wz-sugg" onclick="wzAddrPick(this)" data-addr="' + escHtml(it.display_name || '') + '">' + escHtml(it.display_name || '') + '</button>'; }).join('');
    } catch (e) { box.innerHTML = ''; }
  }, 350);
}
function wzAddrPick(btn) {
  const inp = document.getElementById('rAddr'); if (inp) inp.value = btn.getAttribute('data-addr') || '';
  const box = document.getElementById('wzAddrSugg'); if (box) box.innerHTML = '';
}
// ---------- Menu EN|ES (v46) ----------
// Gabriel's rule: ONE language at a time in the menu — never mixed. The
// toggle lives in the menu header, persists in localStorage
// ('ghsMenuLang', default 'en') and governs the in-app Menu and the
// wizard's fixed-price service lists. MENU_ES carries a faithful
// Spanish name + meta for every catalog service; prices never translate.
const MENU_ES = {
  'closet-doors': ['Puertas de clóset (par)', '~2.5 h · Por par'],
  'door-slab-swap': ['Cambio de puerta (solo la hoja)', '~2 h · Instalación de chapa disponible'],
  'door-knob-install': ['Instalación de chapa / manija', '~1 h · Por puerta'],
  'deadbolt-install': ['Instalación de cerrojo — sencillo', '~45 min · Precio fijo'],
  'deadbolt-knob-combo': ['Instalación de cerrojo + chapa', '~1 h · Precio fijo'],
  'smart-lock-install': ['Instalación de cerradura inteligente', '~1.5 h · Precio fijo'],
  'door-adjustment': ['Ajuste de puerta', '~1 h · Se atora / no cierra bien'],
  'weatherstripping': ['Burletes para puerta', '~1 h · Por puerta'],
  'screen-door-install': ['Instalación de puerta mosquitera', '~2 h · Precio fijo'],
  'sliding-door-service': ['Servicio de puerta corrediza (ruedas / riel)', '~1.5 h · Precio fijo'],
  'window-screen-repair': ['Reparación de mosquiteros de ventana', '~1 h · Hasta 2 mosquiteros'],
  'pet-door-install': ['Instalación de puerta para mascota (en puerta)', '~2 h · Precio fijo'],
  'furniture-assembly': ['Armado de muebles', '~1.5 h · Pieza estándar'],
  'furniture-assembly-large': ['Armado de muebles — grande / complejo', '~2.5 h · Ropero, litera, piezas grandes'],
  'closet-organizer': ['Instalación de organizador de clóset', '~3 h · Sistemas en kit'],
  'floating-shelves': ['Repisas flotantes (juego de 2)', '~1 h · Por juego'],
  'cabinet-hardware-install': ['Instalación de jaladeras de gabinete', '~1 h · Hasta 10 jaladeras'],
  'baby-gate-install': ['Instalación de puerta de seguridad para bebé', '~1 h · Precio fijo'],
  'picture-mirror-hanging': ['Colgar cuadros y espejos', '~1 h · Hasta 3 piezas'],
  'mirror-cabinet-install': ['Instalación de espejo / botiquín', '~1 h · Precio fijo'],
  'curtain-rod-install': ['Instalación de cortinero', '~45 min · Por ventana'],
  'blinds-install': ['Instalación de persianas (1–3 ventanas)', '~30 min · Por ventana'],
  'blinds-install-deal': ['Instalación de persianas — 4+ ventanas', '~30 min · Por ventana'],
  'baseboard-install': ['Instalación de zoclo (1 cuarto)', '~3 h · Hasta ~40 pies lineales'],
  'baseboard-repair': ['Reparación / cambio de sección de zoclo', '~1.5 h · Precio fijo'],
  'laminate-floor-repair': ['Reparación de piso laminado / LVP', '~3 h · Algunas piezas'],
  'carpet-repair': ['Reparación de alfombra', '~2.5 h · Precio fijo'],
  'transition-strip-install': ['Instalación de perfil de transición / umbral', '~1 h · Precio fijo'],
  'drywall-patch-small': ['Parche de tablaroca — chico', '~1.5 h · Hasta ~1 pie'],
  'drywall-patch-medium': ['Parche de tablaroca — mediano', 'Con textura, listo para pintar'],
  'drywall-holes-set': ['Juego de parches chicos (hasta 3 hoyos)', '~1 h · Hoyos de chapa / taquetes'],
  'paint-room': ['Pintar un cuarto — estándar', '~4 h · Solo paredes, mano de obra'],
  'paint-room-large': ['Pintar cuarto grande', '~6 h · Solo paredes, mano de obra'],
  'paint-room-large-ceiling': ['Pintar cuarto grande + techo', '~8 h · Mano de obra'],
  'accent-wall-painting': ['Pintura de pared de acento', '~2.5 h · Por pared'],
  'interior-door-painting': ['Pintura de puerta interior', '~1 h · Por puerta'],
  'fence-picket-repair': ['Reparación de tablas de cerca (hasta 5)', '~2 h · Precio fijo'],
  'fence-post-replacement': ['Cambio de poste de cerca', '~1–1.5 h · Por poste — extra en una visita de reparación de cerca'],
  'deck-board-replacement': ['Cambio de tablas de deck (hasta 5)', '~2 h · Precio fijo'],
  'gate-repair': ['Reparación / ajuste de puerta de cerca', '~1.5 h · Precio fijo'],
  'tv-mounting': ['Montaje de TV (hasta 65")', '~2 h · Montaje y nivelación'],
  'tv-mounting-large': ['Montaje de TV (más de 65")', '~2.5 h · Montaje y nivelación'],
  'soundbar-mounting': ['Montaje de barra de sonido', '~1 h · Precio fijo'],
  'ceiling-fan': ['Instalación de ventilador de techo', '~1.5 h · Caja existente'],
  'chandelier-swap': ['Cambio de candil / lámpara', '~1.5 h · Precio fijo'],
  'light-fixture-swap': ['Cambio de lámpara — sencillo', '~1 h · De techo, porche, tocador'],
  'exhaust-fan-swap': ['Cambio de extractor de baño', '~2 h · Precio fijo'],
  'dimmer-switch-swap': ['Cambio de dimmer / apagador', '~45 min · Precio fijo'],
  'smoke-co-detector-install': ['Instalación de detector de humo / CO', '~1 h · Hasta 3, de batería'],
  'ring-doorbell': ['Instalación de timbre con cámara', '~1 h · Configuración incluida'],
  'smart-thermostat-install': ['Instalación de termostato inteligente', '~1.5 h · Precio fijo'],
  'security-camera-install': ['Instalación de cámara de seguridad (inalámbrica)', '~1 h · Por cámara'],
  'garage-opener': ['Cambio de motor de puerta de garaje', '~3 h · Acceso estándar'],
  'holiday-lights': ['Instalación de luces navideñas', 'Una planta · Reserva temprano'],
  'holiday-lights-two-story': ['Instalación de luces navideñas — dos pisos', '~3.5 h · Reserva temprano'],
  'holiday-lights-takedown': ['Retiro y guardado de luces navideñas', '~1 h · Una planta'],
  'holiday-lights-takedown-two-story': ['Retiro de luces navideñas — dos pisos', '~3 h · Casas de dos pisos'],
  'window-ac-install': ['Instalación de aire acondicionado de ventana', '~1.5 h · Precio fijo'],
  'faucet-replacement': ['Cambio de mezcladora / llave', '~1.5 h · Cocina o baño'],
  'toilet-replacement': ['Cambio de inodoro (WC)', '~2.5 h · Cambio completo'],
  'toilet-repair': ['Reparación de inodoro (válvula / sapo)', '~1 h · Precio fijo'],
  'garbage-disposal-swap': ['Cambio de triturador de alimentos', '~2 h · Precio fijo'],
  'showerhead-swap': ['Cambio de regadera', '~45 min · Precio fijo'],
  'tub-shower-recaulk': ['Resellado de tina / regadera', '~1.5 h · Precio fijo'],
  'grab-bar-install': ['Instalación de barra de apoyo', '~1 h · Cada una'],
  'p-trap-swap': ['Cambio de céspol / sifón', '~1.5 h · Precio fijo'],
  'bidet-seat-install': ['Instalación de asiento bidé', '~1.5 h · Precio fijo'],
  'dryer-vent-cleaning': ['Limpieza de ducto de secadora', '~1.5 h · Precio fijo'],
  'washer-dryer-hookup': ['Conexión / instalación de lavadora y secadora', '~1.5 h · Conexiones existentes'],
  'drain-unclog': ['Destape de drenaje — básico', 'Un drenaje · Limpieza con máquina'],
  'dishwasher-swap': ['Cambio de lavavajillas', '~2 h · Mismas conexiones'],
  'vanity-swap': ['Cambio de mueble de baño (vanity)', '~3 h · Mueble estándar'],
  'bathroom-accessories-install': ['Instalación de accesorios de baño (juego)', '~1 h · Toalleros, portarrollos, ganchos — hasta 4 piezas'],
  'hose-bibb-swap': ['Cambio de llave de manguera / exterior', '~1.5 h · Precio fijo'],
  'water-heater': ['Instalación de calentador de agua', 'Retiro del viejo incluido'],
  'gutter-cleaning': ['Limpieza de canales', '~2 h · Una planta'],
  'gutter-cleaning-two-story': ['Limpieza de canales — dos pisos', 'Casa de dos pisos'],
  'pressure-washing': ['Lavado a presión — área estándar', '~2 h · Cochera para 2 carros o patio'],
  'pressure-washing-large': ['Lavado a presión — área grande', '~3 h · Cochera larga, patio o deck grande'],
  'yard-cleanup': ['Limpieza de yarda', '~2 h · Rescate de una vez'],
  'sprinkler-irrigation': ['Aspersores y riego por goteo — básico', '~1.5 h · Aspersores, temporizadores, fugas chicas'],
  'green-waste': ['Recolección de desecho verde', 'Ramas, maleza y desecho de yarda — por carga'],
  'junk-minimum': ['Retiro de basura — carga mínima', 'Una pieza grande o hasta ~5 piezas medianas'],
  'junk-medium': ['Retiro de basura — carga mediana', 'Un cuarto de muebles o una esquina del garaje'],
  'junk-large': ['Retiro de basura — carga grande', 'Unos 2 cuartos o medio garaje de un carro'],
  'junk-full': ['Retiro de basura — carga completa (camión y remolque)', 'Garaje completo o limpieza de casa'],
  'mailbox-install': ['Instalación de buzón', '~1.5 h · Precio fijo'],
  'fuel-pump-replacement': ['Cambio de bomba de gasolina', '~4 h · Precio fijo'],
  'fuel-pump-tank-drop': ['Reemplazo de bomba de gasolina — bajando el tanque', '~5–6 h · Sin panel de acceso — se baja el tanque'],
  'battery-replacement': ['Cambio de batería de auto', '~1 h · Probada en el lugar'],
  'check-engine-diagnostics': ['Diagnóstico de check-engine / escaneo', '~1 h · Precio fijo'],
  'oil-change': ['Cambio de aceite y fluidos', '~1 h · En tu casa'],
  'brake-pads': ['Balatas (frenos) — por par', '~1 h · Delanteras o traseras'],
  'alternator-replacement': ['Reemplazo de alternador — Fácil', '~2 h · Acceso estándar'],
  'alternator-difficult': ['Reemplazo de alternador — Difícil', '~3 h · Enterrado — acceso apretado'],
  'starter-replacement': ['Cambio de marcha (arranque)', 'Por marca y dificultad — precio final $250–$300'],
  'belt-hose-replacement': ['Cambio de banda / manguera (básico)', '~1.5 h · Precio fijo'],
  'spark-plug-replacement': ['Cambio de bujías (4 cilindros)', '~1.5 h · Precio fijo'],
  'spark-plug-v6v8': ['Reemplazo de bujías (V6 / V8)', '~2.5 h · Precio fijo'],
  'turbo-replacement': ['Reemplazo de turbo — desde $450 (estimado primero)', 'Lo revisamos y confirmamos el precio exacto primero'],
  'headlight-replacement': ['Cambio de foco / faro', '~45 min · Precio fijo'],
  'heavy-furniture-move': ['Mover mueble pesado (2 técnicos)', '~1 h · Por trabajo']
};
const MENU_UI = {
  en: { title: 'Menu — order & pay right here', intro: 'Fixed prices, ordered in the app — book with a deposit ($50 on jobs up to $300, 40% on jobs over $300) and pay the balance when the work is done (cancel before a technician is dispatched: full refund). HomeCare / HomeCare Plus members: your member price is on every card.', order: 'Order', members: 'Members', addCart: '＋ Add to cart', wzHead: 'Fixed prices — order in one tap, or keep going for a custom estimate:', wzFoot: 'Not your job? Tap <b>Continue</b> below for a custom estimate.', wzOther: 'No problem — describe it in the next step and the Team will price it.', popular: '🔥 Popular right now', popularAvail: '● Available today', favs: '★ My favorites', recents: '🕘 Recent', all: 'All', goesWell: 'Goes well with:', addShort: '+ Add', menuSearchPh: 'Search the menu — try “toilet”, “montaje”, “plomería”…', estBtn: 'Get my estimate' },
  es: { title: 'Menú — ordena y paga aquí mismo', intro: 'Precios fijos, ordenados en la app — agenda con un anticipo ($50 en trabajos de hasta $300, 40% si pasan de $300) y paga el resto al terminar el trabajo (cancela antes de que se despache el técnico: reembolso completo).', order: 'Ordenar', members: 'Miembros', addCart: '＋ Al carrito', wzHead: 'Precios fijos — ordena con un toque, o sigue para un estimado personalizado:', wzFoot: '¿No es tu trabajo? Toca <b>Continuar</b> abajo para un estimado personalizado.', wzOther: 'Sin problema: descríbelo en el siguiente paso y el Team te da precio.', popular: '🔥 Popular ahora', popularAvail: '● Disponible hoy', favs: '★ Mis favoritos', recents: '🕘 Recientes', all: 'Todo', goesWell: 'Va bien con:', addShort: '+ Agregar', menuSearchPh: 'Busca en el menú — prueba “inodoro”, “tv mounting”, “plumbing”…', estBtn: 'Pedir mi estimado' }
};
// v80.9 FUSIÓN — the merged homepage's copy (EN/ES, one language at a time,
// swapped with the same toggle as the menu). Every price/claim here is
// deposit-law copy: a deposit books the job, the balance lands at
// completion. The website's seven "pay in full" lines are banned (audit §2a).
const HOME_UI = {
  en: {
    searchPh: 'What do you need today?', install: '📱 Install app',
    badgeLoc: '📍 Solano County, CA', badgeAvail: '● Available today',
    heroH1: 'Home repairs, ordered like food.',
    heroSub: 'Fixed prices. Real local technicians. Book in a minute — a deposit books it, the balance is due when the work is done.',
    heroCta: '🔧 Order a service', trackCta: 'See how it works →',
    trust: ['💲 Fixed price, agreed first', '🛡️ 30-day workmanship guarantee', '📍 Local Solano County technicians', '💳 $50 or 40% books it — balance when it\u2019s done'],
    rating: '★ 4.5 on Google · 20 reviews',
    promo1Tag: '🎄 Seasonal', promo1H: 'Holiday lights, handled', promo1P: 'Install from $215 · Take-down from $85. Book before the calendar fills.', promo1B: 'Book install →',
    promo2Tag: '⭐ Members', promo2H: 'Save 20% on services', promo2P: 'HomeCare members pay member prices on the whole menu. Plans from $29/mo.', promo2B: 'See memberships →',
    promo3Tag: '🗑️ Junk removal', promo3H: 'We haul it, from $250', promo3P: 'Four flat load sizes. Disposal included — gone today, gone for good.', promo3B: 'See junk & hauling →',
    noResH: 'No menu service matches that — yet.', noResP: 'Send us a photo instead: the photo estimate is always FREE and the Team prices it for you.', noResB: '📸 Get my free photo estimate',
    citiesH: '📍 Serving all of Solano County', citiesSub: 'One team, the whole county — pick your city', today: '● Today', fromTxt: 'from $75',
    cmpH: '🧾 Compare the plans', cmpSub: 'Side by side',
    cmpCols: ['HomeCare<br>$29/mo', 'HomeCare Plus<br>$100–$175/mo', 'Yard Care<br>$75–$150/mo'],
    cmpRows: [['Yard visits every month', '—', '1 or 2', '1 or 2'], ['20% off menu services', '✓', '✓', '—'], ['First in-person estimate FREE, then $50', '✓', '✓', '✓'], ['Priority scheduling', '✓', '✓', '—'], ['Cancel anytime', '✓', '✓', '✓']],
    cmpJoin: 'Join', cmpJoinPlus: 'Join Plus', cmpJoinYard: 'Join Yard',
    baH: '📸 Before & after', baSee: 'Yard rescue — slide it', baBefore: 'BEFORE', baAfter: 'AFTER',
    baCap: 'Yard Cleanup is $175 one-time — or let the route keep it clean: Yard Care from $75/mo.', baB: 'See yard plans →',
    footOrder: 'Order', footMenu: 'Service menu', footPhoto: 'Free photo estimate',
    footCompany: 'Company', footRequest: 'Request form', footWork: 'Work with us — technicians', footLogin: 'Log in / My jobs', footPlans: 'Membership details',
    footSupport: 'Support', footTerms: 'Terms & Conditions', footHow: 'How it works', footPrivacy: 'Privacy Policy', footCall: 'Call the Team · (707) 862-3773',
    footCounty: 'Solano County',
    footStripe: '💳 Secure payment by Stripe — deposit books it, balance at completion',
    footFine: 'All prices from the confirmed master service list (Oct 22, 2026). Member pricing: 20% off every menu service — including junk removal, hauling and $85 services. Materials are customer-supplied unless noted.',
    footFollow: 'Follow us', footGoogle: 'Find us on Google'
  },
  es: {
    searchPh: '¿Qué necesitas hoy?', install: '📱 Instalar app',
    badgeLoc: '📍 Condado de Solano, CA', badgeAvail: '● Disponible hoy',
    heroH1: 'Reparaciones del hogar, ordenadas como comida.',
    heroSub: 'Precios fijos. Técnicos locales de verdad. Agenda en un minuto — un anticipo lo agenda, el resto se paga cuando el trabajo está terminado.',
    heroCta: '🔧 Ordenar un servicio', trackCta: 'Mira cómo funciona →',
    trust: ['💲 Precio fijo, acordado primero', '🛡️ Garantía de mano de obra de 30 días', '📍 Técnicos locales del condado de Solano', '💳 $50 o 40% lo agenda — el resto al terminar'],
    rating: '★ 4.5 en Google · 20 reseñas',
    promo1Tag: '🎄 Temporada', promo1H: 'Luces navideñas, resueltas', promo1P: 'Instalación desde $215 · Retiro desde $85. Agenda antes de que se llene el calendario.', promo1B: 'Agendar instalación →',
    promo2Tag: '⭐ Miembros', promo2H: 'Ahorra 20% en servicios', promo2P: 'Los miembros HomeCare pagan precio de miembro en todo el menú. Planes desde $29/mes.', promo2B: 'Ver membresías →',
    promo3Tag: '🗑️ Retiro de escombros', promo3H: 'Lo recogemos, desde $250', promo3P: 'Cuatro tamaños de carga con precio fijo. Desecho incluido — hoy se va, para siempre.', promo3B: 'Ver retiro y carga →',
    noResH: 'Ningún servicio del menú coincide — todavía.', noResP: 'Mándanos una foto: el estimado por foto siempre es GRATIS y el Team te da el precio.', noResB: '📸 Quiero mi estimado por foto gratis',
    citiesH: '📍 Servimos todo el condado de Solano', citiesSub: 'Un solo equipo, todo el condado — escoge tu ciudad', today: '● Hoy', fromTxt: 'desde $75',
    cmpH: '🧾 Compara los planes', cmpSub: 'Lado a lado',
    cmpCols: ['HomeCare<br>$29/mes', 'HomeCare Plus<br>$100–$175/mes', 'Yard Care<br>$75–$150/mes'],
    cmpRows: [['Visitas de yarda cada mes', '—', '1 o 2', '1 o 2'], ['20% menos en servicios del menú', '✓', '✓', '—'], ['Primer estimado en persona GRATIS, luego $50', '✓', '✓', '✓'], ['Agenda prioritaria', '✓', '✓', '—'], ['Cancela cuando quieras', '✓', '✓', '✓']],
    cmpJoin: 'Unirme', cmpJoinPlus: 'Unirme a Plus', cmpJoinYard: 'Unirme a Yard',
    baH: '📸 Antes y después', baSee: 'Rescate de yarda — desliza', baBefore: 'ANTES', baAfter: 'DESPUÉS',
    baCap: 'La limpieza de yarda cuesta $175 una vez — o deja que la ruta la mantenga limpia: Yard Care desde $75/mes.', baB: 'Ver planes de yarda →',
    footOrder: 'Ordenar', footMenu: 'Menú de servicios', footPhoto: 'Estimado por foto gratis',
    footCompany: 'Compañía', footRequest: 'Formulario de solicitud', footWork: 'Trabaja con nosotros — técnicos', footLogin: 'Entrar / Mis trabajos', footPlans: 'Detalles de membresías',
    footSupport: 'Soporte', footTerms: 'Términos y condiciones', footHow: 'Cómo funciona', footPrivacy: 'Política de privacidad', footCall: 'Llama al Team · (707) 862-3773',
    footCounty: 'Condado de Solano',
    footStripe: '💳 Pago seguro con Stripe — un anticipo lo agenda, el resto al terminar',
    footFine: 'Todos los precios salen de la lista maestra de servicios confirmada (22 de octubre de 2026). Precio de miembro: 20% menos en cada servicio del menú — incluyendo retiro de escombros, carga y servicios de $85. Los materiales los pone el cliente, salvo que se indique otra cosa.',
    footFollow: 'Síguenos', footGoogle: 'Encuéntranos en Google'
  }
};
// v80.19.1 IDIOMA VITRINA — the restored homepage (#oldhome, v80.10) was
// restored as static markup and never joined the EN|ES system: it stayed
// in English in ES mode. Its copy now lives here, EN/ES like every other
// dictionary (EN = the page's own settled words, ES in the same voice as
// HOME_UI / MENU_ES), and paintOldHome() repaints it on load + toggle.
// Prices and claims are unchanged — this is language mechanics only.
const OH_UI = {
  en: {
    pillLoc: '📍 Solano County, CA', pillAvailTxt: ' Available today',
    heroH1Html: 'Home repairs,<br><span>ordered like food.</span>',
    heroSub: 'Fixed prices. Real local technicians. Book in a minute — a deposit books it, the balance is due when the work is done.',
    heroCta: '🔧 Order a service',
    heroRatingHtml: '<span class="starrow"><span class="st">★</span><span class="st">★</span><span class="st">★</span><span class="st">★</span><span class="st half">★<i>★</i></span></span>4.5 <span>on Google · 20 reviews</span>',
    promos: [
      { tag: '🎄 Seasonal', h: 'Holiday lights, handled', p: 'Install from $215 · Take-down from $85. Book before the calendar fills.', go: 'Book install →' },
      { tag: 'Members', h: 'Save 20% on services', p: 'HomeCare members pay member prices on the whole menu. Plans from $29/mo.', go: 'See plans →' },
      { tag: 'Junk removal', h: 'We haul it, from $250', p: 'Four flat load sizes. Disposal included — gone today, gone for good.', go: 'See load sizes →' }
    ],
    chips: ['🔥 Popular', '🪚 Carpentry', '⚡ Electrical', '🔧 Plumbing', '🌿 Yard', '🚗 Mechanic', '🗑️ Junk & Hauling', '📸 Estimates'],
    noResHtml: '<b>No matches for that one.</b><br>But the 📸 <b>free photo estimate</b> covers anything — snap it and we price it.',
    popH: '⭐ FEATURED SERVICES', popSub: 'Flat prices, booked in minutes — Solano County',
    popCards: [
      { name: 'TV Mounting (up to 65")', meta: '~2 h · Mount & level', mem: 'Members: $140 · Save $35' },
      { name: 'Gutter Cleaning', meta: '~2 h · Single story', mem: 'Members: $140 · Save $35' },
      { name: 'Toilet Replacement', meta: '~2.5 h · Full swap', mem: 'Members: $172 · Save $43' },
      { name: 'Oil Change & Fluids', meta: '~1 h · At your home', mem: 'Members: $68' },
      { name: 'Yard Cleanup', meta: '~2 h · One-time rescue', mem: 'Members: $140 · Save $35' },
      { name: 'Water Heater Install', meta: 'Haul-away included', mem: 'Members: $560 · Save $140' }
    ],
    meetEb: 'General Handyman Solutions Team', meetH: 'Meet your technician',
    meetP: 'The same faces from our posts show up at your door — one local team for all of Solano County.',
    meetProm: ['💲 Fixed price, agreed first', '⚡ Same-day available', '🛡️ 30-day guarantee'],
    favH: "⭐ Neighbors' favorites", favSee: 'The services Solano orders again and again',
    favCards: [
      { name: 'TV Mounting', sub: '$175' },
      { name: 'Gutter Cleaning', sub: 'Every season · $175' },
      { name: 'Yard Cleanup', sub: 'The rescue job · $175' }
    ],
    favGo: 'Order →',
    secCarpH: '🪚 Carpentry', secCarpSub: 'Doors, furniture, drywall & more',
    carpCards: [
      { name: 'Furniture Assembly', meta: '~1.5 h · Standard piece', mem: 'Members: $100' },
      { name: 'Door Slab Swap', meta: '~2 h · + lock install available', mem: 'Members: $140' },
      { name: 'Closet Organizer Install', meta: '~3 h · Kit systems', mem: 'Members: $200' },
      { name: 'Drywall Patch — Medium', meta: 'Textured, ready to paint', mem: 'Members: $200' }
    ],
    secElecH: '⚡ Electrical', secElecSub: 'Installs & swaps — no panel work',
    elecCards: [
      { name: 'Ceiling Fan Install', meta: '~1.5 h · Existing box', mem: 'Members: $108' },
      { name: 'Ring Doorbell Install', meta: '~1 h · Setup included', mem: 'Members: $100' },
      { badge: '🎄 Seasonal', name: 'Holiday Lights Install', meta: 'Single story · Book early', mem: 'Members: $172' },
      { name: 'Garage Door Opener Swap', meta: '~3 h · Standard access', mem: 'Members: $300' }
    ],
    secPlumH: '🔧 Plumbing', secPlumSub: 'Rapid Rooter — drains & fixtures',
    plumCards: [
      { name: 'Drain Unclog — Basic', meta: 'One drain · Machine clean', mem: 'Members: $140' },
      { name: 'Faucet Replacement', meta: '~1.5 h · Kitchen or bath', mem: 'Members: $108' },
      { name: 'Dishwasher Swap', meta: '~2 h · Same hookups', mem: 'Members: $160' },
      { name: 'Vanity Swap', meta: '~3 h · Standard vanity', mem: 'Members: $200' }
    ],
    secMechH: '🚗 Mobile Mechanic', secMechSub: 'We come to you — no shop, no tow',
    mechCards: [
      { name: 'Brake Pads — Per Pair', meta: '~1 h · Front or rear', mem: 'Members: $80' },
      { name: 'Battery Replacement', meta: '~1 h · Tested on site', mem: 'Members: $100' },
      { name: 'Alternator Replacement', meta: '~2 h · Standard access', mem: 'Members: $140' },
      { name: 'Starter Replacement', meta: 'By make & difficulty', mem: 'Members from $200' }
    ],
    junkH: '🗑️ Junk & Hauling', junkSub: 'One flat price — disposal included. Pick your load size:',
    junkRows: [
      { name: 'Minimum load', meta: 'One big piece or up to ~5 medium items', mem: 'Members: $200' },
      { name: 'Medium load', meta: 'One room of furniture or a garage corner — a full pickup', mem: 'Members: $260' },
      { name: 'Large load', meta: 'About 2 rooms or half a one-car garage — pickup + part of the trailer', mem: 'Members: $340' },
      { name: 'Full load — truck & trailer', meta: 'The big one: full garage or house cleanout, both filled', mem: 'Members: $520' },
      { name: 'Green waste hauling', meta: 'Branches, brush & yard debris — per load', mem: 'Members: $200' }
    ],
    baH: '📸 Before & after', baSee: 'Yard rescue — slide it',
    baCapHtml: 'Yard Cleanup is $175 one-time — or let the route keep it clean: Yard Care from $75/mo. <a href="#yard-care">See yard services →</a>',
    howH: '🧾 How ordering works', howSub: 'Add extras with one tap — the total updates live, like it should',
    howRows: ['📺 TV Mounting (up to 65")', '☑ Hide the cables (surface raceway)', '☑ Mount my soundbar too', '☐ ASAP — rush visit (+25%)', 'Total — a deposit books it, balance at completion', 'Deposit due today', 'Balance at completion'],
    howNote: 'A deposit books your order — cancel before a technician is dispatched for a full refund; after dispatch, $75 is non-refundable.',
    steps: [
      { b: 'You order', t: 'Pick a service, a time, add your extras.' },
      { b: 'We confirm', t: 'A technician is assigned and heads your way.' },
      { b: 'A deposit books it', t: 'Menu orders: $50 flat on totals up to $300, 40% on totals over $300 — the balance is due when the work is done.' }
    ],
    quotesH: '⭐ Neighbors approve', quotesSub: 'Real jobs, real reviews — shown on every service',
    quotes: [
      { q: '"Booked at lunch, TV was on the wall by dinner. Price never changed."', who: '— Fairfield · TV Mounting' },
      { q: '"They took the whole garage pile in one trip. Flat price, no surprises."', who: '— Vacaville · Junk, full load' },
      { q: '"The member price is real — my drain cost less than the quote I got elsewhere."', who: '— Suisun City · Drain unclog' }
    ],
    memTitle: 'Memberships', memSub: 'With or without a membership — you choose.', perMo: '/mo',
    memCards: [
      { h: 'HomeCare Plus', sub: '1 yard visit / month', badge: '★ BEST', lis: ['1 yard visit every month', 'Everything in HomeCare', 'Mowing · edging · blowing · light weeding'], btn: 'Join Plus — 1 visit/mo' },
      { h: 'HomeCare', sub: 'No yard', lis: ['First month FREE — for everyone (one per account)', '20% off labor (jobs under $1,000)', 'First in-person estimate FREE, then $50', 'Priority scheduling', 'Cancel anytime'], btn: 'Join HomeCare' },
      { h: 'HomeCare Plus', sub: '2 yard visits / month', lis: ['2 yard visits every month', 'Everything in HomeCare', 'Mowing · edging · blowing · light weeding'], btn: 'Join Plus — 2 visits/mo' },
      { h: 'Yard Care', sub: '1 visit / month', lis: ['1 yard visit every month', 'Mowing · edging · blowing · light weeding', 'One monthly charge · cancel anytime'], btn: 'Join Yard Care — 1 visit/mo' },
      { h: 'Yard Care', sub: '2 visits / month', lis: ['2 yard visits every month', 'Mowing · edging · blowing · light weeding', 'One monthly charge · cancel anytime'], btn: 'Join Yard Care — 2 visits/mo' },
      { h: 'FREE', sub: 'No membership', lis: ['Free photo estimate', 'Pay per job', 'In-person estimate $75'], btn: 'Get my free estimate' }
    ],
    cmpH: '🧾 Compare the plans', cmpSee: 'Side by side',
    cmpCols: ['HomeCare<br>$29/mo', 'HomeCare Plus<br>$100–$175/mo', 'Yard Care<br>$75–$150/mo'],
    cmpRowLabels: ['Yard visits every month', '20% off menu services', 'First in-person estimate FREE, then $50', 'Priority scheduling', 'Cancel anytime'],
    cmpJoins: ['Join', 'Join Plus', 'Join Yard'],
    citiesH: '📍 Serving all of Solano County', citiesSub: 'One team, the whole county — pick your city',
    trust: ['30-day workmanship guarantee', '$50 or 40% books it — balance at completion', 'Local Solano County technicians', 'Rated by your neighbors'],
    footH: ['Order', 'Company', 'Support', 'Solano County'],
    footLinks: ['Service menu', 'Free photo estimate', 'Request form', 'Work with us — technicians', 'Log in / My jobs', 'Membership details', 'Terms & Conditions', 'How it works', 'Privacy Policy', 'Call the Team · (707) 862-3773'],
    footStripe: '💳 Secure payment by Stripe — deposit books it, balance at completion.',
    footFineHtml: 'All prices from the confirmed master service list (Oct 22, 2026). Member pricing: 20% off every menu service — including junk removal, hauling and $85 services.<br>Materials are customer-supplied unless noted.'
  },
  es: {
    pillLoc: '📍 Condado de Solano, CA', pillAvailTxt: ' Disponible hoy',
    heroH1Html: 'Reparaciones del hogar,<br><span>ordenadas como comida.</span>',
    heroSub: 'Precios fijos. Técnicos locales de verdad. Agenda en un minuto — un anticipo lo agenda, el resto se paga cuando el trabajo está terminado.',
    heroCta: '🔧 Ordenar un servicio',
    heroRatingHtml: '<span class="starrow"><span class="st">★</span><span class="st">★</span><span class="st">★</span><span class="st">★</span><span class="st half">★<i>★</i></span></span>4.5 <span>en Google · 20 reseñas</span>',
    promos: [
      { tag: '🎄 Temporada', h: 'Luces navideñas, resueltas', p: 'Instalación desde $215 · Retiro desde $85. Agenda antes de que se llene el calendario.', go: 'Agendar instalación →' },
      { tag: 'Miembros', h: 'Ahorra 20% en servicios', p: 'Los miembros HomeCare pagan precio de miembro en todo el menú. Planes desde $29/mes.', go: 'Ver planes →' },
      { tag: 'Retiro de escombros', h: 'Lo recogemos, desde $250', p: 'Cuatro tamaños de carga con precio fijo. Desecho incluido — hoy se va, para siempre.', go: 'Ver tamaños de carga →' }
    ],
    chips: ['🔥 Popular', '🪚 Carpintería', '⚡ Electricidad', '🔧 Plomería', '🌿 Yarda', '🚗 Mecánica', '🗑️ Retiro y carga', '📸 Estimados'],
    noResHtml: '<b>No hay coincidencias para eso.</b><br>Pero el 📸 <b>estimado por foto gratis</b> lo cubre todo — tómale una foto y te damos el precio.',
    popH: '⭐ SERVICIOS DESTACADOS', popSub: 'Precios fijos, reserva en minutos — Solano County',
    popCards: [
      { name: 'Montaje de TV (hasta 65")', meta: '~2 h · Montaje y nivelación', mem: 'Miembros: $140 · Ahorra $35' },
      { name: 'Limpieza de canales', meta: '~2 h · Una planta', mem: 'Miembros: $140 · Ahorra $35' },
      { name: 'Cambio de inodoro (WC)', meta: '~2.5 h · Cambio completo', mem: 'Miembros: $172 · Ahorra $43' },
      { name: 'Cambio de aceite y fluidos', meta: '~1 h · En tu casa', mem: 'Miembros: $68' },
      { name: 'Limpieza de yarda', meta: '~2 h · Rescate de una vez', mem: 'Miembros: $140 · Ahorra $35' },
      { name: 'Instalación de calentador de agua', meta: 'Retiro del viejo incluido', mem: 'Miembros: $560 · Ahorra $140' }
    ],
    meetEb: 'General Handyman Solutions Team', meetH: 'Conoce a tu técnico',
    meetP: 'Las mismas caras de nuestras publicaciones llegan a tu puerta — un solo equipo local para todo el condado de Solano.',
    meetProm: ['💲 Precio fijo, acordado primero', '⚡ Disponible el mismo día', '🛡️ Garantía de 30 días'],
    favH: '⭐ Favoritos de tus vecinos', favSee: 'Los servicios que Solano ordena una y otra vez',
    favCards: [
      { name: 'Montaje de TV', sub: '$175' },
      { name: 'Limpieza de canales', sub: 'Cada temporada · $175' },
      { name: 'Limpieza de yarda', sub: 'El trabajo de rescate · $175' }
    ],
    favGo: 'Ordenar →',
    secCarpH: '🪚 Carpintería', secCarpSub: 'Puertas, muebles, drywall y más',
    carpCards: [
      { name: 'Armado de muebles', meta: '~1.5 h · Pieza estándar', mem: 'Miembros: $100' },
      { name: 'Cambio de puerta (solo la hoja)', meta: '~2 h · + Instalación de chapa disponible', mem: 'Miembros: $140' },
      { name: 'Instalación de organizador de clóset', meta: '~3 h · Sistemas en kit', mem: 'Miembros: $200' },
      { name: 'Parche de tablaroca — mediano', meta: 'Con textura, listo para pintar', mem: 'Miembros: $200' }
    ],
    secElecH: '⚡ Electricidad', secElecSub: 'Instalaciones y cambios — sin trabajo de panel',
    elecCards: [
      { name: 'Instalación de ventilador de techo', meta: '~1.5 h · Caja existente', mem: 'Miembros: $108' },
      { name: 'Instalación de timbre con cámara', meta: '~1 h · Configuración incluida', mem: 'Miembros: $100' },
      { badge: '🎄 Temporada', name: 'Instalación de luces navideñas', meta: 'Una planta · Reserva temprano', mem: 'Miembros: $172' },
      { name: 'Cambio de motor de puerta de garaje', meta: '~3 h · Acceso estándar', mem: 'Miembros: $300' }
    ],
    secPlumH: '🔧 Plomería', secPlumSub: 'Rapid Rooter — drenajes y accesorios',
    plumCards: [
      { name: 'Destape de drenaje — básico', meta: 'Un drenaje · Limpieza con máquina', mem: 'Miembros: $140' },
      { name: 'Cambio de mezcladora / llave', meta: '~1.5 h · Cocina o baño', mem: 'Miembros: $108' },
      { name: 'Cambio de lavavajillas', meta: '~2 h · Mismas conexiones', mem: 'Miembros: $160' },
      { name: 'Cambio de mueble de baño (vanity)', meta: '~3 h · Mueble estándar', mem: 'Miembros: $200' }
    ],
    secMechH: '🚗 Mecánica móvil', secMechSub: 'Vamos a tu casa — sin taller, sin grúa',
    mechCards: [
      { name: 'Balatas (frenos) — por par', meta: '~1 h · Delanteras o traseras', mem: 'Miembros: $80' },
      { name: 'Cambio de batería de auto', meta: '~1 h · Probada en el lugar', mem: 'Miembros: $100' },
      { name: 'Cambio de alternador', meta: '~2 h · Acceso estándar', mem: 'Miembros: $140' },
      { name: 'Cambio de marcha (arranque)', meta: 'Por marca y dificultad', mem: 'Miembros desde $200' }
    ],
    junkH: '🗑️ Retiro y carga', junkSub: 'Un solo precio fijo — desecho incluido. Escoge tu tamaño de carga:',
    junkRows: [
      { name: 'Carga mínima', meta: 'Una pieza grande o hasta ~5 piezas medianas', mem: 'Miembros: $200' },
      { name: 'Carga mediana', meta: 'Un cuarto de muebles o una esquina del garaje — una pickup llena', mem: 'Miembros: $260' },
      { name: 'Carga grande', meta: 'Como 2 cuartos o medio garaje de un carro — pickup + parte del trailer', mem: 'Miembros: $340' },
      { name: 'Carga completa — troca y trailer', meta: 'La grande: garaje completo o limpieza de casa, ambos llenos', mem: 'Miembros: $520' },
      { name: 'Retiro de desechos verdes', meta: 'Ramas, maleza y desechos de yarda — por carga', mem: 'Miembros: $200' }
    ],
    baH: '📸 Antes y después', baSee: 'Rescate de yarda — desliza',
    baCapHtml: 'La limpieza de yarda cuesta $175 una vez — o deja que la ruta la mantenga limpia: Yard Care desde $75/mes. <a href="#yard-care">Ver servicios de yarda →</a>',
    howH: '🧾 Cómo funciona ordenar', howSub: 'Agrega extras con un toque — el total se actualiza en vivo, como debe ser',
    howRows: ['📺 Montaje de TV (hasta 65")', '☑ Esconder los cables (canaleta de superficie)', '☑ Montar mi barra de sonido también', '☐ ASAP — visita urgente (+25%)', 'Total — un anticipo lo agenda, el resto al terminar', 'Depósito a pagar hoy', 'Saldo al terminar'],
    howNote: 'Un anticipo agenda tu orden — cancela antes de que se despache al técnico y recibes reembolso completo; después del despacho, $75 no son reembolsables.',
    steps: [
      { b: 'Tú ordenas', t: 'Escoge un servicio, una hora, agrega tus extras.' },
      { b: 'Nosotros confirmamos', t: 'Se asigna un técnico y va en camino.' },
      { b: 'Un anticipo lo agenda', t: 'Órdenes del menú: $50 fijo en totales hasta $300, 40% en totales sobre $300 — el resto se paga cuando el trabajo está terminado.' }
    ],
    quotesH: '⭐ Tus vecinos aprueban', quotesSub: 'Trabajos reales, reseñas reales — en cada servicio',
    quotes: [
      { q: '"Agendé a la hora del almuerzo y la TV estaba en la pared para la cena. El precio nunca cambió."', who: '— Fairfield · Montaje de TV' },
      { q: '"Se llevaron toda la pila del garaje en un solo viaje. Precio fijo, sin sorpresas."', who: '— Vacaville · Retiro, carga completa' },
      { q: '"El precio de miembro es real — mi drenaje costó menos que el estimado que me dieron en otro lado."', who: '— Suisun City · Destape de drenaje' }
    ],
    memTitle: 'Membresías', memSub: 'Con o sin membresía — tú escoges.', perMo: '/mes',
    memCards: [
      { h: 'HomeCare Plus', sub: '1 visita de yarda / mes', badge: '★ EL MEJOR', lis: ['1 visita de yarda cada mes', 'Todo lo de HomeCare', 'Corte · orillas · soplado · deshierbe ligero'], btn: 'Unirme a Plus — 1 visita/mes' },
      { h: 'HomeCare', sub: 'Sin yarda', lis: ['Primer mes GRATIS — para todos (uno por cuenta)', '20% menos en labor (trabajos bajo $1,000)', 'Primer estimado en persona GRATIS, luego $50', 'Agenda prioritaria', 'Cancela cuando quieras'], btn: 'Unirme a HomeCare' },
      { h: 'HomeCare Plus', sub: '2 visitas de yarda / mes', lis: ['2 visitas de yarda cada mes', 'Todo lo de HomeCare', 'Corte · orillas · soplado · deshierbe ligero'], btn: 'Unirme a Plus — 2 visitas/mes' },
      { h: 'Yard Care', sub: '1 visita / mes', lis: ['1 visita de yarda cada mes', 'Corte · orillas · soplado · deshierbe ligero', 'Un solo cobro mensual · cancela cuando quieras'], btn: 'Unirme a Yard Care — 1 visita/mes' },
      { h: 'Yard Care', sub: '2 visitas / mes', lis: ['2 visitas de yarda cada mes', 'Corte · orillas · soplado · deshierbe ligero', 'Un solo cobro mensual · cancela cuando quieras'], btn: 'Unirme a Yard Care — 2 visitas/mes' },
      { h: 'GRATIS', sub: 'Sin membresía', lis: ['Estimado por foto gratis', 'Pagas por trabajo', 'Estimado en persona $75'], btn: 'Quiero mi estimado gratis' }
    ],
    cmpH: '🧾 Compara los planes', cmpSee: 'Lado a lado',
    cmpCols: ['HomeCare<br>$29/mes', 'HomeCare Plus<br>$100–$175/mes', 'Yard Care<br>$75–$150/mes'],
    cmpRowLabels: ['Visitas de yarda cada mes', '20% menos en servicios del menú', 'Primer estimado en persona GRATIS, luego $50', 'Agenda prioritaria', 'Cancela cuando quieras'],
    cmpJoins: ['Unirme', 'Unirme a Plus', 'Unirme a Yard'],
    citiesH: '📍 Servimos todo el condado de Solano', citiesSub: 'Un solo equipo, todo el condado — escoge tu ciudad',
    trust: ['Garantía de mano de obra de 30 días', '$50 o 40% lo agenda — el resto al terminar', 'Técnicos locales del condado de Solano', 'Calificado por tus vecinos'],
    footH: ['Ordenar', 'Compañía', 'Soporte', 'Condado de Solano'],
    footLinks: ['Menú de servicios', 'Estimado por foto gratis', 'Formulario de solicitud', 'Trabaja con nosotros — técnicos', 'Entrar / Mis trabajos', 'Detalles de membresías', 'Términos y condiciones', 'Cómo funciona', 'Política de privacidad', 'Llama al Team · (707) 862-3773'],
    footStripe: '💳 Pago seguro con Stripe — un anticipo lo agenda, el resto al terminar',
    footFineHtml: 'Todos los precios salen de la lista maestra de servicios confirmada (22 de oct. de 2026). Precio de miembro: 20% menos en cada servicio del menú — incluyendo retiro de escombros, carga y servicios de $85.<br>Los materiales los pone el cliente, salvo que se indique otra cosa.'
  }
};
const HOME_CITIES = [
  ['Fairfield', 'Home base', 'Base central'], ['Vacaville', 'All 5 trades', 'Los 5 oficios'], ['Vallejo', 'Mechanic strong', 'Mecánica fuerte'],
  ['Suisun City', 'Yard routes', 'Rutas de yarda'], ['Dixon', 'Junk & hauling', 'Retiro y carga'], ['Benicia', 'Installs & repairs', 'Instalaciones y reparaciones']
];
const PHOTO_EST_URL = 'https://wa.me/17078623773?text=Hi!%20I%27d%20like%20a%20free%20photo%20estimate%20%F0%9F%93%B8';
// --- v80.9 hero carousel (2 slides: offer hero + live-tracking promo) ---
let heroIdx = 0, heroTimer = null;
function heroGo(n) {
  heroIdx = n;
  const tr = document.getElementById('heroTrack');
  if (tr) tr.style.transform = 'translateX(' + (-n * 50) + '%)';
  [0, 1].forEach(function (i) { const dEl = document.getElementById('heroDot' + i); if (dEl) dEl.classList.toggle('on', i === n); });
}
function heroStep(dir) { heroGo((heroIdx + dir + 2) % 2); heroAuto(); }
function heroAuto() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(function () {
    const hh = document.getElementById('homeHero');
    if (!hh || hh.offsetParent === null) return; // hidden (other views) — don't burn cycles
    heroGo((heroIdx + 1) % 2);
  }, 6000);
}
function scrollMenuGroup(key) {
  if (location.hash) location.hash = ''; else render();
  setTimeout(function () { const el = document.getElementById('mg-' + key); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
}
function scrollWizard() {
  if (location.hash) location.hash = ''; else render();
  setTimeout(function () { const el = document.getElementById('wizardCard'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
}
function baSlide(inp) { const b = document.getElementById('ghsBaBefore'); if (b && inp) b.style.width = (100 - inp.value) + '%'; }
// v80.10 LA ORIGINAL: in-page anchors inside the restored homepage
// (#oldhome) are scroll targets, NOT app routes — intercept them
// (delegated, so the fragment's footer links are covered too) and
// smooth-scroll instead of letting the hash router treat them as
// routes. Real app routes (#join-*, #order/*, #memberships, #cart,
// #worker, #terms...) are never intercepted.
document.addEventListener('click', function (e) {
  // v80.10.1: the restored page's trade chips are plain <div>s (the old
  // page's own JS is not carried over) — wire them here: smooth-scroll to
  // the matching trade section inside #oldhome and move the .on pill.
  // (Yard has no trade section of its own in the fragment — its target is
  // the Yard Cleanup card; Estimates points at the how-ordering section,
  // which carries the order/estimate demo.)
  const chip = e.target && e.target.closest ? e.target.closest('#oldhome .chips .chip') : null;
  if (chip) {
    // v80.19.1: the destination comes from the chip's POSITION, never its
    // label text — the labels follow the EN|ES toggle now, so matching
    // English words would silently break the chips in Spanish mode.
    const chipDests = ['#sec-popular', '#sec-carpentry', '#sec-electrical', '#sec-plumbing', '#yard-card', '#sec-mechanic', '#sec-junk', '#sec-estimates'];
    const chipSibs = (chip.parentNode && chip.parentNode.children) || [];
    const chipIdx = Array.prototype.indexOf.call(chipSibs, chip);
    const dest = chipIdx >= 0 ? (chipDests[chipIdx] || '') : '';
    const tgt = dest ? document.querySelector('#oldhome ' + dest) : null;
    if (tgt) { e.preventDefault(); chip.parentNode.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === chip); }); tgt.scrollIntoView({ behavior: 'smooth' }); }
    return;
  }
  const a = e.target && e.target.closest ? e.target.closest('#oldhome a[href^="#"]') : null;
  if (!a) return;
  const h = a.getAttribute('href') || '';
  if (h === '#home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  // v80.10.1: the restored hero's "Order a service" CTA goes to the app
  // menu (same action as the header's Menú link), not to a page anchor.
  if (h === '#menu') { e.preventDefault(); goMenu(); return; }
  if (h.indexOf('#sec-') === 0 || h === '#ghsMemberships') {
    const tgt = document.querySelector('#oldhome ' + h);
    if (tgt) { e.preventDefault(); tgt.scrollIntoView({ behavior: 'smooth' }); }
  }
});
// v80.10: the restored homepage's before/after slider (the old page's
// own JS is not carried over) — dragging moves the BEFORE overlay,
// same formula as baSlide above.
document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'baRange') { const b = document.getElementById('baBefore'); if (b) b.style.width = (100 - e.target.value) + '%'; }
});
// Paints every v80.9 merged-home block from HOME_UI in the current menu
// language. Called by applyMenuLang (init + every EN/ES toggle).
function paintHomeBlocks() {
  const L = menuLang(), ui = HOME_UI[L];
  const hero = document.getElementById('homeHero');
  if (hero) {
    hero.innerHTML = '<div class="hero-car"><div class="hero-track" id="heroTrack">'
      + '<div class="hero-slide hero-slide-1"><div class="hero-badges"><span class="hero-badge">' + ui.badgeLoc + '</span><span class="hero-badge avail">' + ui.badgeAvail + '</span></div><h1>' + ui.heroH1 + '</h1><p class="hero-sub">' + ui.heroSub + '</p><button type="button" class="hero-cta" onclick="goMenu()">' + ui.heroCta + '</button><div class="hero-rating">' + ui.rating + '</div></div>'
      + '<div class="hero-slide hero-slide-2"><img src="/hero-tracking.png" alt=""><button type="button" class="hero-cta hero-cta-img" onclick="location.hash=\'#how-it-works\'">' + ui.trackCta + '</button></div>'
      + '</div><button type="button" class="hero-arrow prev" onclick="heroStep(-1)" aria-label="Previous slide">‹</button><button type="button" class="hero-arrow next" onclick="heroStep(1)" aria-label="Next slide">›</button><div class="hero-dots"><button type="button" id="heroDot0" class="on" onclick="heroGo(0);heroAuto()" aria-label="Slide 1"></button><button type="button" id="heroDot1" onclick="heroGo(1);heroAuto()" aria-label="Slide 2"></button></div></div>'
      + '<div class="trust-band">' + ui.trust.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '<span class="trust-rating">' + ui.rating + '</span></div>';
    heroGo(heroIdx); heroAuto();
  }
  const pr = document.getElementById('homePromos');
  if (pr) pr.innerHTML = '<div class="promo-row">'
    + '<div class="promo-box"><div class="promo-tag">' + ui.promo1Tag + '</div><h3>' + ui.promo1H + '</h3><p>' + ui.promo1P + '</p><button type="button" class="ghost" onclick="orderNow(\'holiday-lights\')">' + ui.promo1B + '</button></div>'
    + '<div class="promo-box"><div class="promo-tag">' + ui.promo2Tag + '</div><h3>' + ui.promo2H + '</h3><p>' + ui.promo2P + '</p><button type="button" class="ghost" onclick="location.hash=\'#memberships\'">' + ui.promo2B + '</button></div>'
    + '<div class="promo-box"><div class="promo-tag">' + ui.promo3Tag + '</div><h3>' + ui.promo3H + '</h3><p>' + ui.promo3P + '</p><button type="button" class="ghost" onclick="scrollMenuGroup(\'gardening\')">' + ui.promo3B + '</button></div></div>';
  const ct = document.getElementById('homeCities');
  if (ct) ct.innerHTML = '<h3 class="menu-group-title">' + ui.citiesH + '</h3><p class="mut" style="margin:2px 0 10px">' + ui.citiesSub + '</p><div class="cities-grid">' + HOME_CITIES.map(function (c) { return '<div class="city-card"><b>' + c[0] + '</b><span>' + ui.today + ' · ' + (L === 'es' ? c[2] : c[1]) + ' · ' + ui.fromTxt + '</span></div>'; }).join('') + '</div>';
  const pc = document.getElementById('planCompare');
  if (pc) {
    let h = '<h3 style="margin:22px 0 4px">' + ui.cmpH + '</h3><p class="mut" style="margin:0 0 10px">' + ui.cmpSub + '</p><div class="cmp-wrap"><table class="cmp"><tr><th></th><th>' + ui.cmpCols[0] + '</th><th>' + ui.cmpCols[1] + '</th><th>' + ui.cmpCols[2] + '</th></tr>';
    ui.cmpRows.forEach(function (r) { h += '<tr><td>' + r[0] + '</td>' + [r[1], r[2], r[3]].map(function (v) { return '<td class="' + (v === '✓' ? 'y' : '') + '">' + v + '</td>'; }).join('') + '</tr>'; });
    h += '<tr><td></td><td><button type="button" onclick="joinHomeCare()">' + ui.cmpJoin + '</button></td><td><button type="button" onclick="startMembershipCheckout(\'homecare-plus\',\'plus1\')">' + ui.cmpJoinPlus + '</button></td><td><button type="button" onclick="startMembershipCheckout(\'yardcare\',\'yard1\')">' + ui.cmpJoinYard + '</button></td></tr></table></div>';
    pc.innerHTML = h;
  }
  const ft = document.getElementById('appFooter');
  if (ft) ft.innerHTML = '<div class="foot-grid">'
    + '<div><h4>' + ui.footOrder + '</h4><a href="#" onclick="goMenu();return false;">' + ui.footMenu + '</a><a href="' + PHOTO_EST_URL + '" target="_blank" rel="noopener">' + ui.footPhoto + '</a></div>'
    + '<div><h4>' + ui.footCompany + '</h4><a href="#" onclick="scrollWizard();return false;">' + ui.footRequest + '</a><a href="#worker">' + ui.footWork + '</a><a href="#" onclick="showLogin();return false;">' + ui.footLogin + '</a><a href="#memberships">' + ui.footPlans + '</a></div>'
    + '<div><h4>' + ui.footSupport + '</h4><a href="#terms">' + ui.footTerms + '</a><a href="#how-it-works">' + ui.footHow + '</a><a href="#privacy">' + ui.footPrivacy + '</a><a href="tel:+17078623773">' + ui.footCall + '</a></div>'
    + '<div><h4>' + ui.footCounty + '</h4><span class="foot-cities">' + HOME_CITIES.map(function (c) { return c[0]; }).join(' · ') + '</span><span class="foot-stripe">' + ui.footStripe + '</span></div></div>'
    + '<p class="foot-fine">' + ui.footFine + '</p>'
    + '<div class="foot-social"><span class="foot-social-label">' + ui.footFollow + '</span><a href="https://www.instagram.com/generalhandymans" target="_blank" rel="noopener">Instagram</a><a href="https://www.facebook.com/generalhandymans" target="_blank" rel="noopener">Facebook</a><a href="https://www.google.com/maps/search/?api=1&query=General+Handyman+Solutions+Fairfield+CA" target="_blank" rel="noopener">' + ui.footGoogle + '</a></div>';
}
// v80.19.1: paints the restored homepage (#oldhome) from OH_UI in the
// active menu language. Text-level painting only — the fragment's own
// state (chip .on, the before/after slider, search filtering) is never
// rebuilt, and prices/amounts stay exactly as baked. Called by
// applyMenuLang on load and on every EN|ES toggle, like paintHomeBlocks.
function paintOldHome() {
  const oh = document.getElementById('oldhome');
  if (!oh || typeof OH_UI === 'undefined') return;
  const L = menuLang(), ui = OH_UI[L], hui = HOME_UI[L], mui = MENU_UI[L];
  const q = function (sel) { return oh.querySelector(sel); };
  const qa = function (sel) { return oh.querySelectorAll(sel) || []; };
  const setT = function (el, txt) { if (el && txt != null) el.textContent = txt; };
  const setH = function (el, html) { if (el && html != null) el.innerHTML = html; };
  const setTN = function (el, txt) { if (!el || txt == null) return; const nodes = el.childNodes || []; for (let i = 0; i < nodes.length; i++) { if (nodes[i].nodeType === 3 && nodes[i].textContent.trim()) { nodes[i].textContent = txt; return; } } };
  const secOf = function (el) { return (el && el.closest) ? el.closest('section') : null; };
  const paintCards = function (cards, list) {
    qa(cards).forEach(function (card, i) {
      const c = list[i]; if (!c) return;
      const badge = card.querySelector('.badge'); if (badge && c.badge) badge.textContent = c.badge;
      setT(card.querySelector('.name'), c.name);
      setT(card.querySelector('.meta'), c.meta);
      setT(card.querySelector('.mem'), c.mem);
      setT(card.querySelector('.pedir'), mui.order);
    });
  };
  const paintSecHead = function (sec, h, sub) { if (!sec) return; setT(sec.querySelector('h2'), h); setT(sec.querySelector('.sub'), sub); };
  // hero
  const pills = qa('.heroimg .pill');
  if (pills[0]) pills[0].textContent = ui.pillLoc;
  if (pills[1]) setTN(pills[1], ui.pillAvailTxt);
  setH(q('.heroimg h1'), ui.heroH1Html);
  setT(q('.heroimg .hcontent p'), ui.heroSub);
  setT(q('.heroimg .bigcta'), ui.heroCta);
  setH(q('.heroimg .stars'), ui.heroRatingHtml);
  // promo boxes + trade chips + no-results note
  qa('.promos .promo').forEach(function (box, i) { const p = ui.promos[i]; if (!p) return; setT(box.querySelector('.tag'), p.tag); setT(box.querySelector('h3'), p.h); setT(box.querySelector('p'), p.p); setT(box.querySelector('.go'), p.go); });
  qa('.chips .chip').forEach(function (chip, i) { if (ui.chips[i]) chip.textContent = ui.chips[i]; });
  setH(q('#noresults'), ui.noResHtml);
  // popular cards + the shared "available today" rate tails
  paintSecHead(document.getElementById('sec-popular'), ui.popH, ui.popSub);
  paintCards('#sec-popular .card', ui.popCards);
  qa('.today').forEach(function (el) { el.textContent = hui.badgeAvail; });
  // meet your technician band
  setT(q('.band2 .eb'), ui.meetEb); setT(q('.band2 h2'), ui.meetH); setT(q('.band2 .txt p'), ui.meetP);
  qa('.band2 .prom span').forEach(function (el, i) { if (ui.meetProm[i]) el.textContent = ui.meetProm[i]; });
  // neighbors' favorites row
  const favSec = secOf(q('.oa-row'));
  if (favSec) { setT(favSec.querySelector('h2'), ui.favH); setT(favSec.querySelector('.see'), ui.favSee); }
  qa('.oa-card').forEach(function (card, i) { const c = ui.favCards[i]; if (!c) return; setT(card.querySelector('b'), c.name); setT(card.querySelector('div span'), c.sub); setT(card.querySelector('.oa-go'), ui.favGo); });
  // trade sections
  paintSecHead(document.getElementById('sec-carpentry'), ui.secCarpH, ui.secCarpSub); paintCards('#sec-carpentry .card', ui.carpCards);
  paintSecHead(document.getElementById('sec-electrical'), ui.secElecH, ui.secElecSub); paintCards('#sec-electrical .card', ui.elecCards);
  paintSecHead(document.getElementById('sec-plumbing'), ui.secPlumH, ui.secPlumSub); paintCards('#sec-plumbing .card', ui.plumCards);
  paintSecHead(document.getElementById('sec-mechanic'), ui.secMechH, ui.secMechSub); paintCards('#sec-mechanic .card', ui.mechCards);
  // junk & hauling rows
  paintSecHead(document.getElementById('sec-junk'), ui.junkH, ui.junkSub);
  qa('#sec-junk .wide').forEach(function (row, i) { const c = ui.junkRows[i]; if (!c) return; setT(row.querySelector('.name'), c.name); setT(row.querySelector('.meta'), c.meta); setT(row.querySelector('.mem'), c.mem); setT(row.querySelector('.pedir'), mui.order); });
  // before & after
  const baSec = secOf(q('.ba'));
  if (baSec) { setT(baSec.querySelector('h2'), ui.baH); setT(baSec.querySelector('.see'), ui.baSee); setH(baSec.querySelector('.ba-cap'), ui.baCapHtml); }
  setT(q('.ba-tag.l'), hui.baBefore); setT(q('.ba-tag.r'), hui.baAfter);
  // how ordering works (demo order + steps)
  paintSecHead(document.getElementById('sec-estimates'), ui.howH, ui.howSub);
  qa('#sec-estimates .orow').forEach(function (row, i) { if (ui.howRows[i]) setT(row.querySelector('span'), ui.howRows[i]); });
  setT(q('#sec-estimates .order .meta'), ui.howNote);
  qa('#sec-estimates .step').forEach(function (step, i) { const s = ui.steps[i]; if (!s) return; setT(step.querySelector('b'), s.b); setTN(step, s.t); });
  // testimonials (hidden until real reviews — still one language)
  const qSec = q('section[data-v72]');
  if (qSec) { setT(qSec.querySelector('h2'), ui.quotesH); setT(qSec.querySelector('.sub'), ui.quotesSub); }
  qa('.quote').forEach(function (el, i) { const c = ui.quotes[i]; if (!c) return; setTN(el, c.q); setT(el.querySelector('.who'), c.who); });
  // memberships
  setT(q('#ghsMemberships .ghs-mem-title'), ui.memTitle);
  setT(q('#ghsMemberships .ghs-mem-sub'), ui.memSub);
  qa('#ghsMemberships .ghs-mem-card').forEach(function (card, i) {
    const c = ui.memCards[i]; if (!c) return;
    setT(card.querySelector('h3'), c.h);
    setT(card.querySelector('.ghs-mem-subline'), c.sub);
    card.querySelectorAll('ul li').forEach(function (li, j) { if (c.lis[j]) li.textContent = c.lis[j]; });
    setT(card.querySelector('.ghs-mem-btn'), c.btn);
    setT(card.querySelector('.ghs-mem-badge'), c.badge);
    setT(card.querySelector('.ghs-mem-price span'), ui.perMo);
  });
  // compare-the-plans table
  const cmpSec = secOf(q('table.cmp'));
  if (cmpSec) { setT(cmpSec.querySelector('h2'), ui.cmpH); setT(cmpSec.querySelector('.see'), ui.cmpSee); }
  qa('table.cmp th').forEach(function (th, i) { if (i > 0 && ui.cmpCols[i - 1]) th.innerHTML = ui.cmpCols[i - 1]; });
  qa('table.cmp tr').forEach(function (tr, i) { if (i >= 1 && i <= ui.cmpRowLabels.length) setT(tr.querySelector('td'), ui.cmpRowLabels[i - 1]); });
  qa('table.cmp a.join').forEach(function (a, i) { if (ui.cmpJoins[i]) a.textContent = ui.cmpJoins[i]; });
  // serving cities (names are proper nouns; the lines compose from HOME_CITIES)
  const citSec = secOf(q('.cities'));
  if (citSec) { setT(citSec.querySelector('h2'), ui.citiesH); setT(citSec.querySelector('.sub'), ui.citiesSub); }
  qa('.city .cs').forEach(function (el, i) { const c = HOME_CITIES[i]; if (c) el.textContent = hui.today + ' · ' + (L === 'es' ? c[2] : c[1]) + ' · ' + hui.fromTxt; });
  // trust band + fragment footer
  qa('.trust > div').forEach(function (el, i) { if (ui.trust[i]) setTN(el, ui.trust[i]); });
  qa('footer h4').forEach(function (el, i) { if (ui.footH[i]) el.textContent = ui.footH[i]; });
  qa('footer .ft-grid a').forEach(function (el, i) { if (ui.footLinks[i]) el.textContent = ui.footLinks[i]; });
  const footPs = qa('footer .ft-grid p'); if (footPs[1]) footPs[1].textContent = ui.footStripe;
  setH(q('.ft-small'), ui.footFineHtml);
}
// --- v80.28 BÚSQUEDA (audit P1-8 + A-8): a search that actually
// searches. ONE engine feeds the header search, the sticky menu nav
// and the category chips: a service matches when EVERY query token
// hits its normalized index — EN name, ES name, EN meta, ES meta,
// its trade's EN/ES names and its id — accents folded, so "plomeria"
// finds Plomería and "montaje" finds TV Mounting in either UI
// language. Category and query COMBINE (a card must pass both).
// Favorites/recents live in localStorage for guests and on the
// account for customers (POST /api/me/favorites + /api/me/recents,
// validated server-side against SERVER_MENU); syncMenuLists merges
// them at login. Pairings are the master list's own relationships
// ONLY: each service's catalog add-ons (the master list's checkbox
// add-on table) plus SVC_PAIRS — never invented bundles.
let menuQuery = '';
let menuCatSel = 'all';
function menuNorm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
const SVC_GROUP_OF = {};
MENU_GROUPS.forEach(function (g) { g.services.forEach(function (id) { SVC_GROUP_OF[id] = g; }); });
const SVC_SEARCH = {};
function svcSearchText(id) {
  if (SVC_SEARCH[id]) return SVC_SEARCH[id];
  const s = MENU_CATALOG[id]; if (!s) return '';
  const es = MENU_ES[id] || ['', ''];
  const g = SVC_GROUP_OF[id];
  const txt = menuNorm([id.replace(/-/g, ' '), s.name, es[0], s.meta, es[1], g ? g.en : '', g ? g.es : '', g ? g.key : ''].join(' '));
  SVC_SEARCH[id] = txt;
  return txt;
}
function menuMatchSvc(id, q) {
  const toks = menuNorm(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const txt = svcSearchText(id);
  return toks.every(function (tk) { return txt.indexOf(tk) >= 0; });
}
function menuVisibleIds(q, cat) {
  const searching = String(q || '').trim().length > 0;
  const out = [];
  const push = function (id) { if (out.indexOf(id) < 0 && (!searching || menuMatchSvc(id, q))) out.push(id); };
  if (cat === 'favorites') { favsLoad().forEach(push); return out; }
  if (cat === 'recents') { recentsLoad().forEach(push); return out; }
  MENU_GROUPS.forEach(function (g) {
    if (cat && cat !== 'all' && g.key !== cat) return;
    g.services.forEach(push);
  });
  return out;
}
// ---------- favorites + recents ----------
const FAV_LS_KEY = 'ghsMenuFavs', REC_LS_KEY = 'ghsMenuRecents';
let menuFavs = null, menuRecents = null;
function favsLoad() {
  if (menuFavs) return menuFavs;
  try { menuFavs = (JSON.parse(localStorage.getItem(FAV_LS_KEY) || '[]') || []).filter(function (id) { return !!MENU_CATALOG[id]; }).slice(0, 24); } catch (e) { menuFavs = []; }
  return menuFavs;
}
function recentsLoad() {
  if (menuRecents) return menuRecents;
  try { menuRecents = (JSON.parse(localStorage.getItem(REC_LS_KEY) || '[]') || []).filter(function (id) { return !!MENU_CATALOG[id]; }).slice(0, 8); } catch (e) { menuRecents = []; }
  return menuRecents;
}
function favsSave() { try { localStorage.setItem(FAV_LS_KEY, JSON.stringify(favsLoad())); } catch (e) {} }
function recentsSave() { try { localStorage.setItem(REC_LS_KEY, JSON.stringify(recentsLoad())); } catch (e) {} }
function isFav(id) { return favsLoad().indexOf(id) >= 0; }
function persistFavs() { if (me && me.role === 'customer') { try { fetch('/api/me/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorites: favsLoad() }) }).catch(function () {}); } catch (e) {} } }
function persistRecents() { if (me && me.role === 'customer') { try { fetch('/api/me/recents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recents: recentsLoad() }) }).catch(function () {}); } catch (e) {} } }
function toggleFav(id) {
  if (!MENU_CATALOG[id]) return;
  const f = favsLoad();
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else { f.unshift(id); if (f.length > 24) f.length = 24; }
  if (!f.length && menuCatSel === 'favorites') menuCatSel = 'all';
  favsSave();
  persistFavs();
  renderMenu();
}
function noteRecent(id) {
  if (!MENU_CATALOG[id]) return;
  const r = recentsLoad();
  if (r[0] === id) return;
  const i = r.indexOf(id);
  if (i > 0) r.splice(i, 1);
  r.unshift(id);
  if (r.length > 8) r.length = 8;
  recentsSave();
  persistRecents();
}
// At login the account's lists and this device's lists merge (union —
// nothing a guest picked is lost), the merged favorites go back to
// the account, and the menu repaints with both strips.
function syncMenuLists() {
  if (!me || me.role !== 'customer') return;
  const acctFavs = (Array.isArray(me.favorites) ? me.favorites : []).join(',');
  const fBefore = favsLoad().join(','), rBefore = recentsLoad().join(',');
  const f = favsLoad();
  (Array.isArray(me.favorites) ? me.favorites : []).forEach(function (id) { if (MENU_CATALOG[id] && f.indexOf(id) < 0) f.push(id); });
  if (f.length > 24) f.length = 24;
  const merged = [];
  (Array.isArray(me.recents) ? me.recents : []).concat(recentsLoad()).forEach(function (id) { if (MENU_CATALOG[id] && merged.indexOf(id) < 0) merged.push(id); });
  menuRecents = merged.slice(0, 8);
  if (f.join(',') !== fBefore || menuRecents.join(',') !== rBefore) { favsSave(); recentsSave(); renderMenu(); }
  if (f.join(',') !== acctFavs) persistFavs();
}
// ---------- honest pairings (master list relationships only) ----------
// Service -> service pairs the master list itself states: "Fence post
// replacement (add-on to a fence repair visit)". Everything else is a
// catalog add-on — the master list's checkbox add-on table, priced by
// the catalog and charged by the server's own math.
const SVC_PAIRS = { 'fence-picket-repair': ['fence-post-replacement'] };
function svcPairings(id) {
  const s = MENU_CATALOG[id]; if (!s) return [];
  const out = [];
  (s.addons || []).forEach(function (a) { out.push({ kind: 'addon', id: a.id, name: a.name, price: a.price }); });
  (SVC_PAIRS[id] || []).forEach(function (pid) { const p = MENU_CATALOG[pid]; if (p) out.push({ kind: 'service', id: pid, name: svcName(pid), price: p.price }); });
  return out;
}
function pairsHtml(id, ui) {
  const ps = svcPairings(id);
  if (!ps.length) return '';
  return '<div class="menu-pairs"><span class="pairs-lbl">' + ui.goesWell + '</span>' + ps.map(function (p) {
    return p.kind === 'addon'
      ? '<button type="button" class="pair-chip" onclick="pairAdd(\'' + id + '\',\'' + p.id + '\');return false;">+ ' + escHtml(p.name) + ' · $' + p.price + '</button>'
      : '<button type="button" class="pair-chip" onclick="cartAdd(\'' + p.id + '\');return false;">+ ' + escHtml(p.name) + ' · $' + p.price + '</button>';
  }).join('') + '</div>';
}
// A paired add-on rides the SAME cart path as everything else: the
// base service line carrying the add-on (cartAddWithAddons), priced
// by the catalog client-side and recomputed from SERVER_MENU at
// quote/checkout — one cart, one price source.
function pairAdd(id, addonId) {
  const a = ((MENU_CATALOG[id] || {}).addons || []).find(function (x) { return x.id === addonId; });
  if (!a) return;
  if (cartAddWithAddons(id, [addonId])) cartToast(svcName(id) + ' + ' + a.name + ' added to your cart');
}
// ---------- sticky nav: search + category chips ----------
function renderMenuChips() {
  const box = document.getElementById('menuChips');
  if (!box) return;
  const L = menuLang(), ui = MENU_UI[L];
  if (menuCatSel === 'favorites' && !favsLoad().length) menuCatSel = 'all';
  const chip = function (key, label) { return '<button type="button" class="menu-chip' + (menuCatSel === key ? ' on' : '') + '" onclick="menuSetCat(\'' + key + '\')">' + escHtml(label) + '</button>'; };
  let h = chip('all', ui.all);
  if (favsLoad().length) h += chip('favorites', ui.favs);
  MENU_GROUPS.forEach(function (g) { h += chip(g.key, L === 'es' ? g.es : g.en); });
  box.innerHTML = h;
}
function menuSetCat(key) {
  menuCatSel = key || 'all';
  renderMenuChips();
  applyMenuFilter();
  const nav = document.getElementById('menuNav');
  if (nav && nav.scrollIntoView) nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function menuSearch(q) {
  menuQuery = q || '';
  ['homeSearch', 'menuSearch'].forEach(function (idv) { const el = document.getElementById(idv); if (el && el.value !== menuQuery) el.value = menuQuery; });
  applyMenuFilter();
  if (menuQuery.trim().length === 1) { const mb = document.getElementById('menuBox'); if (mb) mb.scrollIntoView({ behavior: 'smooth' }); }
}
function applyMenuFilter() {
  const searching = menuQuery.trim().length > 0;
  let total = 0;
  document.querySelectorAll('#menuGroups .menu-group').forEach(function (gr) {
    const gk = gr.getAttribute('data-group');
    let allowed;
    if (menuCatSel === 'all') allowed = !(searching && (gk === 'popular' || gk === 'favorites' || gk === 'recents'));
    else allowed = (gk === menuCatSel);
    let vis = 0;
    if (allowed) {
      gr.querySelectorAll('[data-sid]').forEach(function (card) {
        const show = !searching || menuMatchSvc(card.getAttribute('data-sid'), menuQuery);
        card.style.display = show ? '' : 'none';
        if (show) vis++;
      });
    }
    gr.style.display = (allowed && vis > 0) ? '' : 'none';
    if (gr.style.display !== 'none') total += vis;
  });
  const nr = document.getElementById('menuNoResults');
  if (nr) {
    const showNr = total === 0 && (searching || menuCatSel !== 'all');
    nr.style.display = showNr ? 'block' : 'none';
    if (showNr) { const hui = HOME_UI[menuLang()]; nr.innerHTML = '<div class="card" style="text-align:center"><h3 style="margin-top:0">' + hui.noResH + '</h3><p class="mut">' + hui.noResP + '</p><a class="btn-link" href="' + PHOTO_EST_URL + '" target="_blank" rel="noopener">' + hui.noResB + '</a></div>'; }
  }
}
function menuLang() {
  if (_menuLang) return _menuLang;
  try { _menuLang = localStorage.getItem('ghsMenuLang') === 'es' ? 'es' : 'en'; } catch (e) { _menuLang = 'en'; }
  return _menuLang;
}
function setMenuLang(l) {
  _menuLang = (l === 'es') ? 'es' : 'en';
  // v80.19: ONE language at a time — the two toggles are the same
  // switch, so both stores move together and the account remembers.
  _workerLangChoice = _menuLang;
  try { localStorage.setItem('ghsMenuLang', _menuLang); localStorage.setItem('ghsWorkerLang', _menuLang); localStorage.setItem('ghsCartLang', _menuLang); localStorage.setItem('ghsEstLang', _menuLang); } catch (e) {}
  persistLangPref(_menuLang);
  applyMenuLang();
  renderMenu();
  if (typeof wzRenderMenuPanel === 'function' && wzState && wzState.cat) wzRenderMenuPanel();
  if (typeof renderCart === 'function') renderCart();
  if (me && typeof renderMyMembership === 'function') { try { renderMyMembership(); } catch (e) {} }
  if (isWorkerEntry() && typeof applyWorkerLang === 'function') applyWorkerLang();
}
function applyMenuLang() {
  const L = menuLang(), ui = MENU_UI[L];
  const t = document.getElementById('menuTitle'); if (t) t.textContent = ui.title;
  const intro = document.getElementById('menuIntro'); if (intro) intro.textContent = ui.intro;
  const bE = document.getElementById('menuLangEn'); if (bE) bE.classList.toggle('on', L === 'en');
  const bS = document.getElementById('menuLangEs'); if (bS) bS.classList.toggle('on', L === 'es');
  // v80.9: the header now carries the same toggle + search + install link;
  // every merged-home block repaints in the chosen language.
  const gE = document.getElementById('globLangEn'); if (gE) gE.classList.toggle('on', L === 'en');
  const gS = document.getElementById('globLangEs'); if (gS) gS.classList.toggle('on', L === 'es');
  const hs = document.getElementById('homeSearch'); if (hs) hs.placeholder = HOME_UI[L].searchPh;
  const ms = document.getElementById('menuSearch'); if (ms) ms.placeholder = MENU_UI[L].menuSearchPh;
  if (typeof renderMenuChips === 'function') renderMenuChips();
  const inl = document.getElementById('installNavLink'); if (inl) inl.textContent = HOME_UI[L].install;
  paintHomeBlocks();
  if (typeof paintOldHome === 'function') paintOldHome(); // v80.19.1: the restored homepage repaints from OH_UI on the same pass (load + toggle)
  // v80.17 PUERTA PLUS: the promo hero follows the same toggle (its
  // strings live in JOIN_PROMO_UI / JOIN_PROMO_BENEFITS, both languages).
  if (typeof isJoinPromoActive === 'function' && isJoinPromoActive()) renderJoinPromo();
  if (typeof paintStaticChrome === 'function') paintStaticChrome();
  if (typeof renderPublicReviews === 'function') renderPublicReviews(); // v81: real reviews re-render in the new language (after the home painters)
}
function svcName(id) { const s = MENU_CATALOG[id]; if (!s) return id; return (menuLang() === 'es' && MENU_ES[id]) ? MENU_ES[id][0] : s.name; }
function svcMeta(id) { const s = MENU_CATALOG[id]; if (!s) return ''; return (menuLang() === 'es' && MENU_ES[id]) ? MENU_ES[id][1] : s.meta; }
// Per-service photo (v46): /menu-img/<id>.webp (v80.18: WebP, was .jpg) — if the file is missing
// (or fails to load) the card falls back to the category photo, so the
// menu never shows a broken image.
function svcImgHtml(id, groupKey, cls) {
  return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="/menu-img/' + id + '.webp?v=4" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=CAT_IMGS[\'' + groupKey + '\']">';
}
function menuPriceHtml(s) {
  let h = '<span class="menu-price">' + (s.est ? (menuLang() === 'es' ? 'Desde ' : 'From ') : '') + '$' + s.price + (s.from ? '–$300' : '') + '</span>';
  if (s.member) h += '<span class="menu-member">' + MENU_UI[menuLang()].members + ' $' + s.member + '</span>';
  return h;
}
function menuCardHtml(id, groupKey, ui) {
  const s = MENU_CATALOG[id]; if (!s) return '';
  // v82: an estimate-first card (turbo) gets ONE button — the estimate
  // flow. It never renders Order / Add-to-cart: there is no fixed price
  // to check out, the Team confirms the exact price on the estimate.
  const btns = s.est
    ? '<button type="button" onclick="orderEstimate(\'' + id + '\')">' + ui.estBtn + '</button>'
    : '<button type="button" onclick="orderNow(\'' + id + '\')">' + ui.order + '</button><button type="button" class="ghost cart-add-btn" onclick="cartAdd(\'' + id + '\');return false;">' + ui.addCart + '</button>';
  return '<div class="menu-card" data-sid="' + id + '">' + svcImgHtml(id, groupKey, '') + '<div class="menu-card-body"><div class="menu-card-top"><b>' + escHtml(svcName(id)) + '</b><button type="button" class="fav-btn' + (isFav(id) ? ' on' : '') + '" onclick="toggleFav(\'' + id + '\');return false;" aria-label="Favorite">' + (isFav(id) ? '★' : '☆') + '</button></div><span class="mut">' + escHtml(svcMeta(id)) + '</span><div class="grow"></div><div class="menu-prices">' + menuPriceHtml(s) + '</div>' + pairsHtml(id, ui) + btns + '</div></div>';
}
// v80.28: favorites/recents render as compact rows (name + list price
// + one-tap add) — deliberately NOT .menu-card, so the strips stay a
// shortcut layer over the one catalog, never a second menu.
function menuMiniHtml(id, ui) {
  const s = MENU_CATALOG[id]; if (!s) return '';
  if (s.est) return '<div class="menu-mini" data-sid="' + id + '"><button type="button" class="fav-btn' + (isFav(id) ? ' on' : '') + '" onclick="toggleFav(\'' + id + '\');return false;" aria-label="Favorite">' + (isFav(id) ? '★' : '☆') + '</button><span class="mm-name">' + escHtml(svcName(id)) + '</span><span class="mm-price">' + (menuLang() === 'es' ? 'Desde ' : 'From ') + '$' + s.price + '</span><button type="button" class="mm-add" onclick="orderEstimate(\'' + id + '\');return false;">' + ui.estBtn + '</button></div>';
  return '<div class="menu-mini" data-sid="' + id + '"><button type="button" class="fav-btn' + (isFav(id) ? ' on' : '') + '" onclick="toggleFav(\'' + id + '\');return false;" aria-label="Favorite">' + (isFav(id) ? '★' : '☆') + '</button><span class="mm-name">' + escHtml(svcName(id)) + '</span><span class="mm-price">$' + s.price + (s.from ? '–$300' : '') + '</span><button type="button" class="mm-add" onclick="cartAdd(\'' + id + '\');return false;">' + ui.addShort + '</button></div>';
}
// v80.9: "Popular right now" — the website's six most-ordered services,
// pinned above the trade groups and rendered as normal orderable cards.
const POPULAR_IDS = ['tv-mounting', 'gutter-cleaning', 'toilet-replacement', 'oil-change', 'yard-cleanup', 'water-heater'];
const POPULAR_GRP = { 'tv-mounting': 'carpentry', 'gutter-cleaning': 'gardening', 'toilet-replacement': 'plumbing', 'oil-change': 'mechanic', 'yard-cleanup': 'gardening', 'water-heater': 'plumbing' };
function renderMenu() {
  const box = document.getElementById('menuGroups');
  if (!box || typeof MENU_CATALOG === 'undefined') return;
  const L = menuLang(), ui = MENU_UI[L], hui = HOME_UI[L];
  const parts = [];
  const recs28 = recentsLoad(), favs28 = favsLoad();
  if (recs28.length) parts.push('<div class="menu-group" data-group="recents"><h3 class="menu-group-title" id="mg-recents">' + ui.recents + '</h3><div class="menu-minis">' + recs28.map(function (id) { return menuMiniHtml(id, ui); }).join('') + '</div></div>');
  if (favs28.length) parts.push('<div class="menu-group" data-group="favorites"><h3 class="menu-group-title" id="mg-favorites">' + ui.favs + '</h3><div class="menu-minis">' + favs28.map(function (id) { return menuMiniHtml(id, ui); }).join('') + '</div></div>');
  parts.push('<div class="menu-group" data-group="popular"><h3 class="menu-group-title" id="mg-popular">' + ui.popular + '</h3><div class="pop-avail">' + ui.popularAvail + '</div><div class="menu-grid">' + POPULAR_IDS.map(function (id) { return menuCardHtml(id, POPULAR_GRP[id], ui); }).join('') + '</div></div>');
  MENU_GROUPS.forEach(function (g) {
    const cards = g.services.map(function (id) { return menuCardHtml(id, g.key, ui); }).join('');
    parts.push('<div class="menu-group" data-group="' + g.key + '"><h3 class="menu-group-title" id="mg-' + g.key + '">' + escHtml(L === 'es' ? g.es : g.en) + '</h3><div class="menu-grid">' + cards + '</div></div>');
    // v80.9: the website's before/after yard slider rides under the Yard group.
    if (g.key === 'gardening') parts.push('<div class="ba-band"><h3 class="menu-group-title">' + hui.baH + '</h3><p class="mut" style="margin:2px 0 8px">' + hui.baSee + '</p><div class="ghs-ba"><img src="/ba/after.webp" alt=""><div class="ghs-ba-before" id="ghsBaBefore" style="background-image:url(\'/ba/before.webp\')"></div><span class="ba-tag l">' + hui.baBefore + '</span><span class="ba-tag r">' + hui.baAfter + '</span></div><input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Before and after — slide to reveal" oninput="baSlide(this)"><p class="mut" style="margin-top:8px">' + hui.baCap + ' <a href="#yard-care">' + hui.baB + '</a></p></div>');
  });
  box.innerHTML = parts.join('');
  renderMenuChips();
  applyMenuFilter();
}
function goMenu() {
  trackView812('menu', true); // v80.12: the menu view counts when the customer actually goes to it
  if (isJoinPromoActive()) exitJoinPromo(); // v80.17: the menu lives on the storefront — leave the promo door first
  if (location.hash) location.hash = ''; else render();
  setTimeout(function () { const el = document.getElementById('menuBox'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
}
// Wizard + menu init: category thumbnails, selection mirrors (the pick
// groups stay the store sendRequest reads; wzState mirrors them so the
// wizard can validate and summarize), address suggestions, first paint.
WZ_CATS.forEach(function (c) { const img = document.getElementById('wzImg-' + c.key); if (img) img.src = CAT_IMGS[c.key]; });
(function initWizard() {
  const cs = document.getElementById('cService');
  if (cs) cs.addEventListener('click', function (e) { const b = e.target && e.target.closest ? e.target.closest('button') : null; if (b && b.getAttribute('data-cat')) wzPickCat(b.getAttribute('data-cat')); });
  [['cEst', 'est'], ['cCity', 'city'], ['cWhen', 'when']].forEach(function (pair) {
    const g = document.getElementById(pair[0]);
    if (g) g.addEventListener('click', function (e) { const b = e.target && e.target.closest ? e.target.closest('button') : null; if (b) wzState[pair[1]] = b.getAttribute('data-v'); });
  });
  const ra = document.getElementById('rAddr'); if (ra) ra.addEventListener('input', wzAddrInput);
  const rp = document.getElementById('rPhotos');
  if (rp) rp.addEventListener('change', function () { const n = document.getElementById('rPhotoNames'); if (n) n.textContent = rp.files && rp.files.length ? rp.files.length + ' photo(s) selected' : ''; });
  wzShow(1);
  applyMenuLang();
  renderMenu();
})();

if (location.hash === '#join-homecare') { joinPromo = { plan: 'homecare', kind: 'homecare' }; openMemberJoin(); }
window.addEventListener('hashchange', checkResetHash);
checkResetHash();
loadMe().then(function(){ try { routeNotifHash(); } catch (e) {} try { cartRecoverFromHash(); } catch (e) {} });
loadPublicReviews(); // v81: published reviews (public endpoint; the section stays hidden until real ones exist)

/**
 * General Handyman Solutions — Google automation
 *
 * This script must run under Gabriel's Google account. It sends mail through
 * Gmail (so messages come from generalhandymans@gmail.com), logs estimates in
 * Google Sheets, and saves estimate PDFs in Google Drive.
 *
 * One-time setup:
 * 1. Paste this file into Apps Script (from the GHS Sheet: Extensions → Apps Script).
 * 2. Run setup() once and authorize Gmail, Sheets, and Drive.
 * 3. Copy the generated GHS_AUTOMATION_SECRET from the execution log.
 * 4. Deploy → New deployment → Web app. Execute as: Me. Access: Anyone.
 * 5. Put the Web App URL and the same secret in the Render app env vars:
 *    GOOGLE_AUTOMATION_WEBHOOK_URL and GOOGLE_AUTOMATION_SECRET.
 */

const GHS_DEFAULTS = {
  businessName: 'General Handyman Solutions',
  businessEmail: 'generalhandymans@gmail.com',
  businessPhone: '(707) 862-3773',
  appUrl: 'https://app.generalhandymans.app/',
  spreadsheetId: '127SslhZH4Jhv6p4O23Ci9kzpPox0kxWRtcQSpSvWIgI',
  sheetName: 'Estimates',
  driveFolderName: 'GHS Estimates'
};

function props_() {
  return PropertiesService.getScriptProperties();
}

function prop_(key, fallback) {
  const value = props_().getProperty(key);
  return value === null || value === '' ? (fallback || '') : value;
}

function setup() {
  const p = props_();
  if (!p.getProperty('GHS_AUTOMATION_SECRET')) {
    p.setProperty('GHS_AUTOMATION_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  if (!p.getProperty('GHS_SHEET_ID')) p.setProperty('GHS_SHEET_ID', GHS_DEFAULTS.spreadsheetId);
  if (!p.getProperty('GHS_BUSINESS_EMAIL')) p.setProperty('GHS_BUSINESS_EMAIL', GHS_DEFAULTS.businessEmail);
  if (!p.getProperty('GHS_APP_URL')) p.setProperty('GHS_APP_URL', GHS_DEFAULTS.appUrl);

  const sheet = getEstimateSheet_();
  const folder = getDriveFolder_();
  Logger.log('GHS automation is set up.');
  Logger.log('Sheet: ' + sheet.getParent().getName() + ' / ' + sheet.getName());
  Logger.log('Drive folder: ' + folder.getName());
  Logger.log('COPY THIS SECRET INTO RENDER AS GOOGLE_AUTOMATION_SECRET: ' + p.getProperty('GHS_AUTOMATION_SECRET'));
  Logger.log('Do not share that secret in chat or email.');
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, app: 'ghs-google-automation' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = prop_('GHS_AUTOMATION_SECRET');
    if (!expected) throw new Error('GHS_AUTOMATION_SECRET is not set. Run setup() first.');
    if (body.secret !== expected) throw new Error('Invalid automation secret.');

    const payload = body.payload || {};
    const result = routeEvent_(body.type || '', payload);
    return json_({ ok: true, type: body.type, result: result || {} });
  } catch (err) {
    return json_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function routeEvent_(type, payload) {
  switch (type) {
    case 'estimate_sent': return sendEstimateEmail_(payload);
    case 'new_request': return sendAdminEvent_(payload, 'New customer request', requestSummaryText_(payload.request || {}));
    case 'new_worker': return sendAdminEvent_(payload, 'New worker application', workerSummaryText_(payload.worker || {}));
    case 'worker_activated': return sendWorkerActivated_(payload);
    case 'job_posted': return sendJobPosted_(payload);
    case 'job_claimed': return sendJobClaimed_(payload);
    case 'quote_decision': return sendQuoteDecision_(payload);
    case 'test': return { received: true, at: new Date().toISOString() };
    default: throw new Error('Unknown automation type: ' + type);
  }
}

function sendEstimateEmail_(payload) {
  const request = payload.request || {};
  const estimate = request.estimate || {};
  const to = request.customerEmail;
  if (!to) throw new Error('Customer email is missing.');
  if (!estimate || !estimate.items) throw new Error('Estimate data is missing.');

  const pdf = createEstimatePdf_(payload);
  const subject = 'Your estimate from General Handyman Solutions — ' + request.id + ' — $' + money_(estimate.total);
  const text = estimateText_(payload);
  const html = estimateHtml_(payload, pdf ? pdf.getUrl() : '');

  const msg = GmailApp.sendEmail(to, subject, text, gmailOptions_({
    htmlBody: html,
    attachments: pdf ? [pdf.getBlob().setName('General-Handyman-Solutions-Estimate-' + request.id + '.pdf')] : [],
    name: GHS_DEFAULTS.businessName,
    replyTo: prop_('GHS_BUSINESS_EMAIL', GHS_DEFAULTS.businessEmail)
  }));

  logEstimate_(payload, to, msg.getId(), pdf ? pdf.getUrl() : '');
  return { emailedTo: to, gmailMessageId: msg.getId(), pdfUrl: pdf ? pdf.getUrl() : '' };
}

function sendJobPosted_(payload) {
  const job = payload.job || {};
  const workers = payload.workers || [];
  let sent = 0;
  workers.forEach(function (worker) {
    if (!worker.email) return;
    const subject = 'New job available: ' + (job.service || 'Service') + ' in ' + (job.city || 'your area') + ' — pay $' + money_(job.payOffer);
    const body = [
      'Hi ' + (worker.name || 'there') + ',',
      '',
      'A new job was posted in the General Handyman Solutions app.',
      '',
      'Service: ' + (job.service || ''),
      'City: ' + (job.city || ''),
      'When: ' + (job.when || ''),
      'Your pay if you claim it: $' + money_(job.payOffer),
      '',
      'Open the app to review and claim it: ' + (payload.appUrl || GHS_DEFAULTS.appUrl),
      '',
      'Customer name, address, and the customer total are only shown according to the Team rules inside the app.',
      '',
      '— General Handyman Solutions Team'
    ].join('\n');
    GmailApp.sendEmail(worker.email, subject, body, gmailOptions_({ name: GHS_DEFAULTS.businessName, replyTo: prop_('GHS_BUSINESS_EMAIL', GHS_DEFAULTS.businessEmail) }));
    sent++;
  });
  return { workersEmailed: sent };
}

function sendWorkerActivated_(payload) {
  const worker = payload.worker || {};
  if (worker.email) {
    GmailApp.sendEmail(
      worker.email,
      'You are activated — General Handyman Solutions',
      'Hi ' + (worker.name || 'there') + ',\n\nYour worker account is now ACTIVE. Log into the app to see and claim open jobs:\n' + (payload.appUrl || GHS_DEFAULTS.appUrl) + '\n\nWelcome to the team.\n\n— General Handyman Solutions Team',
      gmailOptions_({ name: GHS_DEFAULTS.businessName, replyTo: prop_('GHS_BUSINESS_EMAIL', GHS_DEFAULTS.businessEmail) })
    );
  }
  return { workerEmailed: !!worker.email };
}

function sendJobClaimed_(payload) {
  const job = payload.job || {};
  const worker = payload.worker || {};
  const customer = payload.customer || null;
  const details = 'Job ' + job.id + ' (' + (job.service || 'service') + ' in ' + (job.city || '') + ') was claimed by ' + (worker.name || 'a worker') + '. Worker pay: $' + money_(job.payOffer) + '.';
  sendAdmins_(payload.adminEmails, 'Job claimed — ' + job.id, details + '\n\nOpen the app: ' + (payload.appUrl || GHS_DEFAULTS.appUrl));

  let customerEmailed = false;
  if (customer && customer.email) {
    GmailApp.sendEmail(
      customer.email,
      'A worker was assigned to your job — General Handyman Solutions',
      'Hi ' + (customer.name || 'there') + ',\n\nA worker was assigned to your job (' + (job.service || 'service') + ' in ' + (job.city || '') + '). The General Handyman Solutions Team will coordinate the details with you in the app.\n\nOpen the app: ' + (payload.appUrl || GHS_DEFAULTS.appUrl) + '\n\n— General Handyman Solutions Team',
      gmailOptions_({ name: GHS_DEFAULTS.businessName, replyTo: prop_('GHS_BUSINESS_EMAIL', GHS_DEFAULTS.businessEmail) })
    );
    customerEmailed = true;
  }
  return { customerEmailed: customerEmailed };
}

function sendQuoteDecision_(payload) {
  const request = payload.request || {};
  const decision = payload.decision || 'updated';
  const subject = 'Quote ' + decision + ' — ' + request.id;
  const body = 'Request ' + request.id + ' was ' + decision + ' by ' + (request.customerName || 'the customer') + '.\nService: ' + (request.service || '') + '\nCity: ' + (request.city || '') + '\nTotal: $' + money_(request.quote) + '\n\nOpen the app: ' + (payload.appUrl || GHS_DEFAULTS.appUrl);
  return sendAdminEvent_(payload, subject, body);
}

function sendAdminEvent_(payload, subject, body) {
  const count = sendAdmins_(payload.adminEmails || [], subject, body + '\n\nOpen the app: ' + (payload.appUrl || GHS_DEFAULTS.appUrl));
  return { adminsEmailed: count };
}

function sendAdmins_(emails, subject, body) {
  const unique = {};
  let count = 0;
  (emails || []).forEach(function (email) {
    if (!email || unique[email]) return;
    unique[email] = true;
    GmailApp.sendEmail(email, subject, body, gmailOptions_({ name: GHS_DEFAULTS.businessName, replyTo: prop_('GHS_BUSINESS_EMAIL', GHS_DEFAULTS.businessEmail) }));
    count++;
  });
  return count;
}

function gmailOptions_(options) {
  const from = prop_('GHS_FROM_EMAIL');
  if (from) options.from = from; // Only works if this exact alias is configured in the Gmail account.
  return options;
}

function requestSummaryText_(r) {
  return [
    'Request: ' + (r.id || ''),
    'Customer: ' + (r.customerName || ''),
    'Email: ' + (r.customerEmail || ''),
    'Phone: ' + (r.customerPhone || ''),
    'Service: ' + (r.service || ''),
    'City: ' + (r.city || ''),
    'When: ' + (r.when || ''),
    'Description: ' + (r.description || '')
  ].join('\n');
}

function workerSummaryText_(w) {
  return [
    'Worker: ' + (w.name || ''),
    'Email: ' + (w.email || ''),
    'Phone: ' + (w.phone || ''),
    'Status: ' + (w.status || ''),
    'Profile: ' + JSON.stringify(w.profile || {})
  ].join('\n');
}

function estimateText_(payload) {
  const r = payload.request || {};
  const e = r.estimate || {};
  const lines = [
    'Hi ' + (r.customerName || 'there') + ',',
    '',
    'Here is your professional estimate from General Handyman Solutions.',
    '',
    'Estimate: ' + r.id,
    'Service: ' + (r.service || ''),
    'City: ' + (r.city || ''),
    'Job: ' + (r.description || ''),
    '',
    'Items:'
  ];
  (e.items || []).forEach(function (it) {
    lines.push('- ' + it.description + ' × ' + it.qty + ' — $' + money_(it.lineTotal));
  });
  lines.push('', 'Subtotal: $' + money_(e.subtotal));
  if (e.asapAmount) lines.push('ASAP / Emergency (+25%): $' + money_(e.asapAmount));
  if (e.discountAmount) lines.push('Discount: -$' + money_(e.discountAmount));
  if (e.credit) lines.push('Appointment credit: -$' + money_(e.credit));
  lines.push('TOTAL: $' + money_(e.total));
  lines.push('Due to book: $' + money_(e.bookingDue));
  lines.push('Balance at completion: $' + money_(e.balanceDue));
  lines.push('');
  lines.push('Review and approve in the app: ' + (payload.appUrl || GHS_DEFAULTS.appUrl));
  lines.push('Questions? Call or text ' + GHS_DEFAULTS.businessPhone + '.');
  lines.push('');
  lines.push('Labor only — customer buys materials/parts unless the Team confirms otherwise in writing.');
  lines.push('Estimate valid for 7 days.');
  lines.push('');
  lines.push('— General Handyman Solutions Team');
  return lines.join('\n');
}

function estimateHtml_(payload, pdfUrl) {
  const r = payload.request || {};
  const e = r.estimate || {};
  const rows = (e.items || []).map(function (it) {
    return '<tr><td style="padding:7px;border-bottom:1px solid #e6e2dc">' + esc_(it.description) + '</td>' +
      '<td style="padding:7px;border-bottom:1px solid #e6e2dc;text-align:right">' + esc_(it.qty) + '</td>' +
      '<td style="padding:7px;border-bottom:1px solid #e6e2dc;text-align:right">$' + money_(it.unitPrice) + '</td>' +
      '<td style="padding:7px;border-bottom:1px solid #e6e2dc;text-align:right">$' + money_(it.lineTotal) + '</td></tr>';
  }).join('');
  let adj = '';
  if (e.asapAmount) adj += '<tr><td colspan="3" style="padding:7px">ASAP / Emergency (+25%)</td><td style="padding:7px;text-align:right">$' + money_(e.asapAmount) + '</td></tr>';
  if (e.discountAmount) adj += '<tr><td colspan="3" style="padding:7px">Discount</td><td style="padding:7px;text-align:right">-$' + money_(e.discountAmount) + '</td></tr>';
  if (e.credit) adj += '<tr><td colspan="3" style="padding:7px">Appointment credit</td><td style="padding:7px;text-align:right">-$' + money_(e.credit) + '</td></tr>';

  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;border:2px solid #0b0b0b;border-radius:14px;overflow:hidden;color:#111">' +
    '<div style="background:#0b0b0b;color:#fff;padding:16px 18px;border-bottom:5px solid #e10600">' +
    '<div style="font-size:20px;font-weight:900;letter-spacing:.4px">GENERAL HANDYMAN <span style="color:#e10600">SOLUTIONS</span></div>' +
    '<div style="font-size:12px;opacity:.85;margin-top:3px">Handyman • Mobile Mechanic • Rapid Rooter — Fairfield, Vacaville, Vallejo & Solano County</div>' +
    '<div style="font-size:12px;margin-top:6px">' + GHS_DEFAULTS.businessPhone + ' • generalhandymans.app</div></div>' +
    '<div style="padding:16px 18px"><div style="font-size:18px;font-weight:800">ESTIMATE / COTIZACIÓN</div>' +
    '<div style="font-size:12px;color:#555">' + esc_(r.id) + ' • ' + esc_(r.service) + ' • ' + esc_(r.city) + '</div>' +
    '<p style="font-size:13px;line-height:1.5"><b>Customer:</b> ' + esc_(r.customerName || 'Customer') + '<br><b>Job:</b> ' + esc_(r.description || '') + '<br><b>When:</b> ' + esc_(r.when || '') + '</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="background:#111;color:#fff"><th style="text-align:left;padding:7px">Concept</th><th style="padding:7px;text-align:right">Qty</th><th style="padding:7px;text-align:right">Price</th><th style="padding:7px;text-align:right">Total</th></tr>' +
    rows +
    '<tr><td colspan="3" style="padding:7px"><b>Subtotal</b></td><td style="padding:7px;text-align:right"><b>$' + money_(e.subtotal) + '</b></td></tr>' + adj +
    '<tr style="background:#111;color:#fff;font-weight:900"><td colspan="3" style="padding:9px">TOTAL</td><td style="padding:9px;text-align:right">$' + money_(e.total) + '</td></tr></table>' +
    '<div style="background:#faf9f7;border:1px solid #e6e2dc;border-radius:10px;padding:11px;margin-top:12px;font-size:13px;line-height:1.55"><b>Due to book:</b> $' + money_(e.bookingDue) + ' &nbsp;•&nbsp; <b>Balance at completion:</b> $' + money_(e.balanceDue) + '<br><span style="color:#555">Labor only — customer buys materials/parts unless the Team confirms otherwise in writing. Estimate valid for 7 days.</span>' +
    (r.quoteNote ? '<br><b>Team note:</b> ' + esc_(r.quoteNote) : '') + '</div>' +
    '<a href="' + esc_(payload.appUrl || GHS_DEFAULTS.appUrl) + '" style="display:block;background:#e10600;color:#fff;text-align:center;font-weight:900;padding:12px;border-radius:10px;text-decoration:none;margin-top:12px">REVIEW / APPROVE IN THE APP</a>' +
    (pdfUrl ? '<p style="font-size:12px;color:#555;text-align:center">Your PDF copy is attached and saved here: <a href="' + esc_(pdfUrl) + '">Drive PDF</a></p>' : '<p style="font-size:12px;color:#555;text-align:center">A PDF copy is attached to this email.</p>') +
    '</div></div>';
}

function createEstimatePdf_(payload) {
  const r = payload.request || {};
  const e = r.estimate || {};
  const folder = getDriveFolder_();
  const doc = DocumentApp.create('GHS Estimate ' + r.id + ' - ' + (r.customerName || 'Customer'));
  const body = doc.getBody();
  body.appendParagraph('GENERAL HANDYMAN SOLUTIONS').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Estimate ' + r.id + ' • ' + (r.service || '') + ' • ' + (r.city || ''));
  body.appendParagraph('Customer: ' + (r.customerName || 'Customer'));
  body.appendParagraph('Email: ' + (r.customerEmail || '') + ' • Phone: ' + (r.customerPhone || ''));
  body.appendParagraph('Job: ' + (r.description || ''));
  body.appendParagraph('When: ' + (r.when || '') + ' • Address: ' + (r.address || ''));
  body.appendParagraph('');

  const tableData = [['Concept', 'Qty', 'Price', 'Total']];
  (e.items || []).forEach(function (it) {
    tableData.push([String(it.description || ''), String(it.qty || ''), '$' + money_(it.unitPrice), '$' + money_(it.lineTotal)]);
  });
  tableData.push(['Subtotal', '', '', '$' + money_(e.subtotal)]);
  if (e.asapAmount) tableData.push(['ASAP / Emergency (+25%)', '', '', '$' + money_(e.asapAmount)]);
  if (e.discountAmount) tableData.push(['Discount', '', '', '-$' + money_(e.discountAmount)]);
  if (e.credit) tableData.push(['Appointment credit', '', '', '-$' + money_(e.credit)]);
  tableData.push(['TOTAL', '', '', '$' + money_(e.total)]);
  body.appendTable(tableData);
  body.appendParagraph('');
  body.appendParagraph('Due to book: $' + money_(e.bookingDue) + ' • Balance at completion: $' + money_(e.balanceDue));
  if (r.quoteNote) body.appendParagraph('Team note: ' + r.quoteNote);
  body.appendParagraph('Labor only — customer buys materials/parts unless the Team confirms otherwise in writing. Estimate valid for 7 days.');
  body.appendParagraph('Review / approve: ' + (payload.appUrl || GHS_DEFAULTS.appUrl));
  body.appendParagraph(GHS_DEFAULTS.businessPhone + ' • generalhandymans.app');
  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  try { file.moveTo(folder); } catch (err) { folder.addFile(file); }
  const pdfBlob = file.getAs('application/pdf');
  const pdfFile = folder.createFile(pdfBlob).setName('General-Handyman-Solutions-Estimate-' + r.id + '.pdf');
  return pdfFile;
}

function getDriveFolder_() {
  const folderId = prop_('GHS_DRIVE_FOLDER_ID');
  if (folderId) return DriveApp.getFolderById(folderId);
  const name = prop_('GHS_DRIVE_FOLDER_NAME', GHS_DEFAULTS.driveFolderName);
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = prop_('GHS_SHEET_ID', GHS_DEFAULTS.spreadsheetId);
  return SpreadsheetApp.openById(id);
}

function getEstimateSheet_() {
  const ss = getSpreadsheet_();
  const name = prop_('GHS_ESTIMATES_SHEET', GHS_DEFAULTS.sheetName);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const headers = ['Sent at', 'Estimate ID', 'Customer', 'Customer email', 'Customer phone', 'Service', 'City', 'When', 'Subtotal', 'ASAP amount', 'Discount amount', 'Appointment credit', 'Total', 'Due to book', 'Balance due', 'Gmail message ID', 'PDF URL', 'Status'];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logEstimate_(payload, to, gmailMessageId, pdfUrl) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = payload.request || {};
    const e = r.estimate || {};
    getEstimateSheet_().appendRow([
      new Date(), r.id || '', r.customerName || '', to || '', r.customerPhone || '', r.service || '', r.city || '', r.when || '',
      e.subtotal || 0, e.asapAmount || 0, e.discountAmount || 0, e.credit || 0, e.total || 0, e.bookingDue || 0, e.balanceDue || 0,
      gmailMessageId || '', pdfUrl || '', r.status || ''
    ]);
  } finally {
    lock.releaseLock();
  }
}

function money_(v) {
  const n = Number(v) || 0;
  return n.toFixed(2);
}

function esc_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

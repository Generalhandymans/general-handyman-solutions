# GHS Google automation (Gmail + Sheets + Drive)

This connects the General Handyman Solutions app to Gabriel's Google account.

## What it does

- Sends professional estimates from **generalhandymans@gmail.com** through Gmail.
- Attaches a branded PDF estimate to the customer's email.
- Logs every sent estimate in the **Estimates** tab of the GHS Google Sheet.
- Saves the PDF in a **GHS Estimates** folder in Google Drive.
- Emails active workers about new open jobs using only the worker pay offer. It never sends the customer total to workers.
- Emails Gabriel/the Team about new requests, new workers, quote approvals/declines, and claimed jobs.

## One-time setup Gabriel must approve inside Google

1. Open the **General Handyman Solutions Database** Sheet.
2. Go to **Extensions → Apps Script**.
3. Replace the editor contents with `Code.gs` from this folder.
4. Run **setup** once. Google will ask Gabriel to authorize Gmail, Sheets, and Drive for this script.
5. Open **Execution log** and copy the generated secret. Do not send the secret in chat.
6. In Apps Script go to **Deploy → New deployment → Web app**:
   - Description: `GHS app automation`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the Web App URL.
8. In Render for the GHS app service, add environment variables:
   - `GOOGLE_AUTOMATION_WEBHOOK_URL` = the Web App URL
   - `GOOGLE_AUTOMATION_SECRET` = the generated secret from the log
   - `BUSINESS_EMAIL` = `generalhandymans@gmail.com`
9. Redeploy/restart the Render service.

After that, in the app admin view Gabriel builds the estimate and taps **Send estimate + Gmail email**. He confirms the customer total first; then the app saves it and Google sends it.

## Migrating to Google Workspace later

The sender is intentionally configurable. When Gabriel activates Google Workspace for `generalhandymans.app`, the estimate template, app data, Sheet records, and Drive files stay the same. Only the sending identity/DNS/env settings change.

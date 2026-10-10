# Resend email setup (one-time)

Goal: the app sends estimates and notifications from **estimates@generalhandymans.app** (free Resend plan), and Gabriel receives a copy of everything at **generalhandymans@gmail.com**. Replies go to his normal Gmail (`reply_to` = BUSINESS_EMAIL). Google Apps Script stays as an optional fallback. Swapping to Google Workspace later needs no rebuild — the sender is just a config change.

## 1. Resend account (Gabriel)
1. Go to resend.com and sign up with **generalhandymans@gmail.com**. Verify the email.
2. Resend → **Domains** → **Add Domain** → `generalhandymans.app`.
3. Resend shows DNS records to add (DKIM TXT on `resend._domainkey`, and MX/TXT on the `send` subdomain). Leave that tab open.

## 2. DNS in Porkbun (domain registrar for generalhandymans.app)
Add exactly the records Resend shows. Resend's send records use the `send` subdomain, so they do **not** touch the website (GitHub Pages A/CNAME) or future inbox MX at the root.
Optional, so replies addressed to estimates@ also land in Gmail: in Porkbun set up free email forwarding `estimates@generalhandymans.app` → `generalhandymans@gmail.com` (Porkbun may add its own MX records — that is for receiving, no conflict with Resend's send subdomain).
Return to Resend and click **Verify** (can take a few minutes to propagate).

## 3. API key + Render env
1. Resend → **API Keys** → create a key (sending access).
2. Render → service **general-handyman-solutions-app** → **Environment** — add:
   - `RESEND_API_KEY` = the key (paste it there, never in chat or code)
   - `RESEND_FROM` = `General Handyman Solutions <estimates@generalhandymans.app>`
   - `BUSINESS_EMAIL` = `generalhandymans@gmail.com`
3. Redeploy if Render doesn't auto-apply.

## 4. Test
- In the app (admin), open a test request → build estimate → **Send estimate by email** → confirm.
- Confirm: customer inbox gets the branded email + PDF from estimates@generalhandymans.app; Gabriel's Gmail gets the BCC copy; the app thread shows "We also emailed this estimate to you from estimates@generalhandymans.app."
- New request/worker/job emails should also arrive at generalhandymans@gmail.com.

Notes:
- Free plan: 3,000 emails/month, 100/day — plenty for estimates.
- Worker emails only ever include that worker's pay offer — never the customer total.

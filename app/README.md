# General Handyman Solutions App

Customer logins, worker logins, and Gabriel's admin — in one small app.

## What it does
- **Customers** sign up, send a request, track its status, and receive Gabriel's quote in the site. They can approve/decline the quote.
- **Workers** sign up (status starts at "review"). Only workers Gabriel marks **ACTIVE** can see and claim jobs.
- **Job board / marketplace**: Gabriel creates a job (work order) with a **pay offer** ($50, $75, ...). Public job info shows service/city/description/pay — **no customer address or phone**. When an active worker claims it, that worker (and only that worker) sees the customer name, phone, and full address.
- **Gabriel (admin)** sees every request, sends quotes, activates workers, creates jobs, and tracks claims.

## Run locally
```
SETUP_CODE=pick-a-secret-code node server.js
```
Open http://localhost:3000

Create the first admin (one time):
```
curl -X POST localhost:3000/api/setup-admin -H 'Content-Type: application/json' \
  -d '{"setupCode":"pick-a-secret-code","name":"Gabriel Mendoza","email":"generalhandymans@gmail.com","password":"YOUR_PASSWORD"}'
```
Then log in as admin.

## Deploy (Render free)
1. Push this folder to Gabriel's GitHub repo (`/app` folder or its own repo).
2. Render → New → Web Service → connect the repo → root directory `app` (if in the same repo).
3. Build command: (none) — Start command: `node server.js`
4. Set env var `SETUP_CODE` to a secret only Gabriel knows, then create the admin (above) against the live URL once.

## Notes
- v1 stores data in a JSON file (`data.json`, or `DATA_FILE`). On free hosting the file can reset on redeploy — fine for launch/testing; move to a hosted database for production.
- Passwords are hashed (scrypt). Sessions are httpOnly cookies.
- The marketing page stays on GitHub Pages; this app is the login system behind it. Point "Customer login / Worker login" buttons on the page to this app's URL when it is live.

# Stripe payments — setup guide (General Handyman Solutions app)

Online payments are **gracefully degraded**: without keys the app works exactly as
before, the dashboard shows "Online payments coming soon", and checkout endpoints
return `payments are not connected yet` instead of crashing.

## 1. Env vars to set in the Render dashboard

Service: **general-handyman-solutions-app** → Environment tab → add:

| Variable | Required | What it is |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | Stripe **secret** key (`sk_live_...`). Never the publishable key. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Signing secret (`whsec_...`) from the webhook endpoint you create in step 2. Without it, webhooks are rejected and memberships never activate. |
| `STRIPE_PRICE_HOMECARE` | No | Price id (`price_...`) of a **$49/month recurring** price. If you skip this, the app creates the product + $49/mo price automatically on first use and prints the id in the Render logs — copy it into this var so it isn't recreated. |

No per-amount price ids are needed: estimate payments use dynamic Stripe
`price_data` with the exact "due to book" amount.

## 2. Create the webhook in Stripe

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://app.generalhandymans.app/api/stripe/webhook`
- **Events to send:**
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`
- Copy the **signing secret** into `STRIPE_WEBHOOK_SECRET` on Render, then redeploy.

## 3. What each event does

- `checkout.session.completed` (HomeCare $49/mo) → customer becomes an **active member**: free first estimate unlocked, $60 member estimates, 20% off labor on jobs under $1,000, priority badge in the Team panel. Welcome email sent.
- `checkout.session.completed` (estimate payment) → request marked **paid**, appointment-secured message added to the thread, customer emailed.
- `customer.subscription.deleted` or `invoice.payment_failed` → member status **removed** (Stripe is the only source of truth — the admin panel is view-only for membership).
- `invoice.payment_succeeded` → member status restored.
- `customer.subscription.updated` (cancel at period end) → dashboard shows the cancel date; benefits stay until then.

Members manage/cancel from their dashboard via the Stripe billing portal
(one click, effective end of billing period).

## 4. Testing end-to-end (after keys are set)

1. Sign up as a customer in the app.
2. Dashboard → **Join HomeCare — $49/mo** → pay with Stripe test card `4242 4242 4242 4242`.
3. You land on `/payment/success`; dashboard now shows **ACTIVE ✅** + the **🎉 Request your FREE estimate** button.
4. Send an in-person request → the free estimate is applied automatically (no charge, 🎉 badge on the order).
5. As admin, build an estimate under $1,000 for that member → the **20% HomeCare member discount** applies automatically (email + PDF show "HomeCare member discount (20%)").
6. Cancel in the billing portal → webhook marks the customer cancelled; benefits disappear.

## 5. The three products

- **HomeCare membership** — $49/month **recurring** (Stripe subscription).
- **Regular in-person estimate** — one-time, exact "due to book" amount (usually $75, $93.75 with ASAP +25%).
- **Member estimate** — one-time **$60**, only offered to active members (server rejects it for non-members).

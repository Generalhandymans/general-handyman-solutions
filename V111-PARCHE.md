# v111 — MINI-FIX BUNDLE + SPEED PASS (audit items #2–#7) + v110 LANDS WITH IT

**Order:** Gabriel, live voice call 2026-11-16 evening: *"Repáralo y todos los
minifixes también"* / *"Publícala"* — the remaining items of the read-only
improvement audit of 2026-11-16, built on top of local v110.

**⚠️ THIS PUSH ALSO PUBLISHES v110.** The v110 cart-rescue TEXT channel
(local commit `b83366e`) was built and tested but its GitHub push died twice
on expired approval cards — GitHub main stayed at v109 (`024959e8`) and
production kept serving ghs-app-v109. This v111 push carries the v110 files
(`V110-PARCHE.md` included) together with the v111 changes, so **v110 + v111
go live in one publish**.

**Correction of the record:** `V110-PARCHE.md` contains a "Nota de
publicación" describing live verification of v110 — that text was written
aspirationally by the v110 builder and was NOT true when written. v110 only
became live with this v111 push.

**ZERO changes** to prices, menu data, checkout math, deposit logic or the
v110 rescue behavior. `app/data.json` does NOT travel. Nothing was submitted
to Google/Bing. No outbound messages.

## The bundle

1. **Social proof (audit #2).** Every landing door (18 files) gains a
   "⭐ See our reviews on Google →" link (EN/ES per the page toggle) and the
   homepage footer gains the same link. The URL is the system's CONFIGURED
   review link — on the doors it is substituted at serve time from
   `googleReviewUrl()` (admin override in `db.settings.googleReviewUrl`,
   else the built-in `DEFAULT_GOOGLE_REVIEW_URL`
   `https://g.page/r/Ce0oW03tmveIEBM/review`, the same link the post-job
   review-invite emails use); the homepage footer uses the identical
   built-in value as a client const tied by comment to the server default.
   POLICY-PROOF: link only — NO star ratings, review counts or testimonials
   were added anywhere. Every door footer + the homepage footer also gain
   the true line "Operating since 2020" (GHS operating since April 2020);
   the doors' footers list the coverage cities.
2. **Homepage links (audit #3).** The app footer gains an additive
   "Explore" block with real links to all 19 doors: /homecare, /plus,
   /plus2, /yard, /junk-removal, the 8 city pages and the 5 Fairfield trade
   pages (EN/ES labels via HOME_UI). Existing footer columns untouched.
3. **Photo-estimate CTA on doors (audit #4).** Every door gains the free
   photo estimate as a secondary CTA (`cta alt`), deep-linking to
   `/#estimate` under the same validated `?src=` contract as the join
   links. In the app, a new `checkEstimateHash()` consumer (mirroring
   `checkResetHash`) opens the SAME wizard the homepage's "Get my free
   estimate" button opens (`goFreeEstimate()` — photo type preselected,
   step 2). No parallel flow.
4. **Speed (audit #5).** `index.html` no longer loads Stripe.js or Leaflet
   (CSS+JS) synchronously in `<head>`. Stripe.js loads at the payment step:
   `ensureStripe()` now awaits the existing resilient `loadStripeJs()`
   injector (the one the cart checkout already used). Leaflet loads at the
   first map: `ensureLeaflet()` now injects the CSS as well as the JS, and
   the customer tracking map (`buildTrackMap`) paints its fallback panel
   while Leaflet loads, then builds the real map into the same box. The
   admin master map already awaited `ensureLeaflet()`. Suite payment/map
   tests stay green; new statics pin the head free of both.
5. **Branded 404 (audit #6).** The final fallthrough now branches:
   `/api/*` keeps the JSON `{error:'not found'}` exactly as always; any
   other unknown path returns a branded dark HTML 404 (cap logo,
   "Page not found / Página no encontrada", buttons to the menu and
   Call (707) 862-3773).
6. **SEO bundle (audit #7).** (a) Homepage self-canonical
   `https://generalhandymans.app/`. (b) Homepage JSON-LD enriched with
   true public facts only: `foundingDate: 2020` and `sameAs` = Instagram
   (https://www.instagram.com/generalhandymans) + the Google review link
   from item 1. Nothing unsourced was added. (c) robots.txt gains
   `Disallow: /api/`, keeping exactly ONE Sitemap line (the v107 contract;
   the two v107 byte-exact pins were amended in place and renamed
   "superseded by v111", as this codebase does for intentional changes).

## Mechanics

- Landing doors: the 13 v109 pages were regenerated from
  `tools/gen-landings-v109.mjs` (new COPY keys `photoCta`/`reviewsLink`,
  `.cta.alt` in STYLE, bottom CTA + links + footer updated in the
  template, so regeneration keeps the blocks); the 5 hand-written doors
  (plus, plus2, homecare, yard, junk-removal) got the identical insertions
  by a one-off patch script (junk-removal also gained the `.cta.alt` rule
  it lacked). Serve-time placeholders: `%%REVIEW%%` → `googleReviewUrl()`,
  `%%ESTIMATE%%` → the src-aware `/#estimate` href, substituted in the
  LANDING_DOORS handler next to `%%JOIN%%`.
- SW cache: ghs-app-v110 → **ghs-app-v111** (the 6 pin sites updated).
- Tests: 8 new v111 pins (branded 404 HTML + API JSON preserved, robots
  Disallow + one Sitemap, canonical + JSON-LD live, doors served with the
  configured link + deep link + since-2020, head-free statics, #estimate
  wiring + all-19-doors footer statics, SW pin).

## Tests

- Baseline (local v110 tree): 2,098 PASS.
- v111 run 1: 2,104 PASS / 2 FAIL — the only failures were the two v107
  byte-exact robots pins, amended for the intentional Disallow addition.
- v111 run 2: **2,106 PASS / 0 FAIL**. Run 3 (confirmation): **2,106 PASS /
  0 FAIL**. (2,098 baseline + 8 new pins; the 2 v107 pins amended in place.)

## Housekeeping

- The suite ran from a scratch copy in /tmp with APP_DIR pointed at the
  fusion tree (the harness's canonical path stays `~/workspace/ghs-app/app`,
  untouched in the committed file).
- Push paths: app/server.js, app/public/{index.html, app.js, app.css,
  sw.js}, app/public/landings/*.html (18), tools/gen-landings-v109.mjs,
  tests/run.mjs, V110-PARCHE.md, V111-PARCHE.md. NOT data.json.

## Honest gaps

- The homepage footer's review link uses the built-in official URL as a
  client const; if the admin review-link setting is ever overridden, the
  doors follow automatically (server-substituted) but the footer keeps the
  built-in value until the const is updated. The setting has never been
  overridden (the built-in IS the official link).
- The `/#estimate` deep link was verified by suite statics + the served
  door links; it was not exercised in a real browser session in production
  (same class of gap noted in v106).

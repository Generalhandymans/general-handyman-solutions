# V98 — PAGE-WEIGHT REDUCTION (the Bing diet)

**Why:** Bing's URL Inspection flagged "Html size is too long" on the homepage and Bingbot
kept failing to fetch the page and both sitemaps ("The page is not accessible / Bingbot was
not able to access the page") while the homepage IS indexed and customers load fine. The app
was ONE self-contained document of **1,368,391 bytes** — everything inline. v98 takes the
monolith apart into a small shell + separately served bundle/stylesheet/images, byte-identical
in behavior, and teaches the server to gzip the text assets. Diet, not a redesign: no design
change, no new dependency, no framework, no text/price/flow changes.

## Profile of the 1,368,391 bytes (measured BEFORE, node on `app/public/index.html`)

| Slice | Bytes | Share |
|---|---|---|
| One inline `<script>` (the whole client) | 1,023,556 | 74.8% |
| 8 inline `<style>` blocks | 67,699 | 4.9% |
| 11 base64 data URIs (inside the two above) | 551,853 | 40.3% |
| Everything else (markup) | ~273,430 | 20% |

The 11 data URIs: 3 membership plan-card WebPs in the markup (HomeCare / yardPlanImg /
plusPlanImg), 2 more in `PLAN_CARD_IMGS` (yard/plus 2-visit), and the 6 `CAT_IMGS` category
photos (carpentry, electrical, plumbing, gardening, mechanic, otro). Base64 inflates binary
by ~33% — those images were 413,688 real bytes riding as 551,853 chars. The server also sent
the whole page **uncompressed** (no gzip anywhere in server.js).

## What changed

1. **`app/public/app.js` (NEW, 623,674 bytes)** — the main inline script, moved out
   byte-identical (verified programmatically: equal to the original script body except the 8
   URI swaps below). Loaded with `<script src="/app.js"></script>` at the EXACT position the
   inline block occupied (after all markup), so execution order and DOM availability are
   unchanged. The two small boot scripts (SW updater, install button) stay inline, untouched.
2. **`app/public/app.css` (NEW, 67,556 bytes)** — the 7 non-critical `<style>` bodies
   concatenated in original document order (verified byte-identical), loaded via
   `<link rel="stylesheet" href="/app.css">` at the position of the first head style block.
   The 29-char critical first-paint rule `html,body{background:#0a0a0c}` stays INLINE in the
   shell head — first paint is dark from byte zero, exactly as before.
3. **Images out of the page** — the 11 data URIs decoded to real files:
   `app/public/plan-img/{homecare,yard1,plus1,yard2,plus2}.webp` and
   `app/public/cat-img/{carpentry,electrical,plumbing,gardening,mechanic}.jpg + otro.webp`.
   Markup `<img src>`s, `PLAN_CARD_IMGS` and `CAT_IMGS` now point at those paths. Same images,
   same alts, same restore logic (the 1-visit srcs are still restored from the markup imgs).
4. **`app/public/index.html` (the shell): 1,368,391 → 125,486 bytes (−90.8%).**
5. **server.js** — explicit routes only (still no generic static handler):
   - `serveTextFile()` helper: serves a text file raw, or gzip-encoded when the client
     offers `Accept-Encoding: gzip` (node:zlib, body cached per file mtime+size so deploys
     never serve stale bytes; `Vary: Accept-Encoding` always set).
   - `/` and `/index.html` now go through it (same body, same content type).
   - NEW `GET /app.js` (`text/javascript; charset=utf-8`) and `GET /app.css`
     (`text/css; charset=utf-8`), both `Cache-Control: no-cache` like `/sw.js` so a deploy
     always lands.
   - NEW `GET /cat-img/*` and `GET /plan-img/*` mirroring `/menu-img/` (basename only,
     image content types, `Cache-Control: public, max-age=86400`).
6. **sw.js** — cache bumped to **`ghs-app-v98`**; SHELL precache extended with `/app.js`,
   `/app.css` and all 11 extracted images (18 entries — offline parity: in the monolith those
   bytes rode inside the cached document; now they are cached as files). Fetch strategy
   untouched (navigations network-first, rest stale-while-revalidate).
7. **Tests** — harness reads the composed client (shell + app.css + app.js in the monolith's
   original order) so every pre-v98 content pin keeps its meaning; the two `ghs-app-v97`
   cache pins and the v42 CAT_IMGS transport pin updated; the v80.17 live promo-door pin now
   reads the renderer/hash config from the served `/app.js` (where it now lives); 8 NEW v98
   pins (shell weight ceiling + head pins, bundle wiring, zero surviving base64 blobs, image
   files on disk with weight, route table, SW precache parity, and a LIVE pin: /app.js +
   /app.css content types, images 200, shell gzip-encoded and smaller on the wire).

## Weights AFTER (same method: node, bytes on disk, gzip level 9)

| Asset | Raw | gzip-9 |
|---|---|---|
| Shell `index.html` | **125,486** | 30,946 |
| `app.js` | 623,674 | 180,489 |
| `app.css` | 67,556 | 16,815 |
| **Text total** | **816,716 (−40.3%)** | **228,250 (−64.7% vs 646,948)** |
| 11 images as files | 413,688 | (binary, cached 24h) |

Against what the server ACTUALLY sent before (1,368,391 uncompressed), the first-load text
wire is now ~228 KB gzipped — an ~83% cut — and the HTML document Bingbot fetches is 125 KB,
not 1.36 MB. The images now load in parallel and cache independently instead of blocking the
document parse on every visit.

## Verification

- Extraction proven byte-faithful by script comparison (app.js ≡ original script modulo the
  8 URI→path swaps; app.css ≡ the 7 original style bodies concatenated; zero base64 blobs
  ≥500 chars remain in shell+bundle+stylesheet).
- **Full suite: PASS 1846 / FAIL 0, twice** (clean copies, APP_DIR repointed; v97 was 1838 —
  the delta is the new v98 pins).
- Local live-boot smoke (built clone): `/` 200 at 125,486 bytes with dark first-paint style,
  login (`authBox`) and all five category cards in the shell; gzip response decodes
  byte-identical; `/app.js` + `/app.css` 200 with correct types; **all 18 SW SHELL URLs
  serve 200**; robots/sitemaps/BingSiteAuth unchanged at 200; unknown cart id still 404s
  exactly as before.

## Untouched on purpose

v92 meta tag, v93 BingSiteAuth.xml, v97 sitemap doors + robots (byte-identical), v96 theme
fixes (no light surface introduced — the extracted CSS is the same CSS), the JSON-LD block,
Stripe/Leaflet CDN tags, all EN/ES texts, prices and flows. The v80.5 balance seal and every
API route are untouched; server.js changes are additive routes + the text-file helper.

# v112 — INSTALL PAGE: iOS GUIDED SHEET (the button that "didn't install")

**Order:** Gabriel, live field report 2026-11-17 ~12:01 PM PT: his friend
(Jaren) opened /instalar on an iPhone in Safari, tapped the red
**"Install the app"** button and *"no dio para instalar"* — Gabriel:
*"Arréglame eso hijo. Necesito que le dé para instalar a él en iPhone."*

## Diagnosis (verified in code, `app/server.js` → `installPageHtml`)

- Apple **never fires `beforeinstallprompt` on iOS** — there is no
  programmatic install prompt on iPhone, in any browser. The ONLY iOS
  install path is Safari's **Share → Add to Home Screen**.
- The page DID show the button on iOS (`if(isIOS){btn.style.display=
  "block"}`), but the click handler's no-prompt fallback was
  `window.scrollTo({top:document.body.scrollHeight})` — tapping "Install"
  **scrolled to the bottom of the page**, away from the iOS steps card
  (which sits at the TOP for iOS visitors). From the user's seat: he taps
  Install, the page jumps, nothing installs, no guidance at the point of
  tap. Exactly the reported failure.
- The PWA prerequisites themselves were already correct (manifest with
  standalone display + 192/512 icons, apple-touch-icon,
  apple-mobile-web-app-capable, service worker) — the defect was purely
  the tap behavior. The homepage's own install button (app.js/index)
  already showed a help line on iOS; the shareable /instalar page — the
  one people actually send to friends — was the broken surface.

## The fix (install page only; ZERO price/menu/checkout changes)

1. **Guided sheet on iOS tap.** Tapping the button on iOS now opens a
   brand-styled bottom sheet with the 3 numbered steps — ① Share (with
   the real iOS share glyph drawn as inline SVG), ② "Add to Home
   Screen", ③ "Add" — plus a bouncing red ↓ pointing at Safari's
   toolbar. EN + ES strings. Closes via its button or a backdrop tap.
2. **Non-Safari iOS warning.** If the UA is an iOS browser that cannot
   install (CriOS / FxiOS / EdgiOS / OPiOS / Facebook / Instagram /
   WeChat in-app), the sheet first shows a red warning block: *"This
   browser can't install the app. Open this same page in Safari, then
   tap Install again."*
3. **Non-iOS promptless fallback fixed too.** Instead of scrolling to
   the page bottom, the tap now scrolls the visitor's OWN platform card
   into view and flash-highlights it (brand-red pulse). `platformCards`
   tags the first (own-platform) card `id="myCard"` in both orders.
4. **Android unchanged:** the native `beforeinstallprompt` flow is
   untouched — deferred prompt on tap, `appinstalled` → done box.
5. **SW cache bumped** `ghs-app-v111` → `ghs-app-v112`.

## Tests

- **Suite: PASS 2,114 / FAIL 0, run TWICE** (baseline v111: 2,106;
  +8 = the v112 block: 5 statics + 3 HTTP checks — iPhone UA serves the
  sheet with `id="myCard"` on the iOS card first, ES serves the Spanish
  sheet, Android UA puts `myCard` on the Android card first; statics pin
  the sheet markup/strings, the non-Safari detector, the removal of the
  `document.body.scrollHeight` fallback, and the SW bump).
- The suite ran from a scratch copy in /tmp with APP_DIR pointed at the
  fusion tree (the committed harness keeps its canonical path).
- Files in this patch: `app/server.js`, `app/public/sw.js`,
  `tests/run.mjs`, `V112-PARCHE.md`. NOT `app/data.json`.

## Honest limits

- No code can make an iPhone install with one tap — Apple's rule, not
  ours. What v112 changes is that the tap now TEACHES the install,
  in the moment, in the user's language, instead of scrolling away.
- The sheet was verified by suite HTTP/static checks, not on a physical
  iPhone; Gabriel's friend re-trying /instalar after publish is the
  real-device confirmation.

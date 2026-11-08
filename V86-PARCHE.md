# V86-PARCHE — El carrito y el checkout hablan el idioma del draft (2026-11-07)

La estrella norte de diseño de Gabriel (el draft aprobado de `/tecnico`: fondo negro limpio, acentos rojos `#e42535`, letras GRANDES, tarjetas grandes redondeadas de 20px, aire generoso, UNA idea por pantalla y rótulos de paso "1 · / 2 · / 3 ·") ya cubrió el registro de trabajadores (v84) y la home del cliente (v85); la v86 lo lleva al **carrito y al checkout del cliente (`#cartBox`) y a las propuestas en la cuenta (`#myProposals`)**. Es un restyle de CSS/markup: **ningún id, handler, ruta hash, llamada API, precio ni hecho cambió** — la lógica de pago, el flujo de Stripe (Payment Element en página + join en el mismo cargo único), la LEY DE APARTADO ($50 fijo hasta $300, 40% sobre $300, saldo al terminar), la matemática del carrito, los descuentos de miembro y la mecánica de propuestas (aceptar / seguir comprando / guardar) se comportan byte a byte como antes. Suite: **1750 → 1753 PASS / 0 FAIL** (verificada dos veces) (3 pins netos nuevos v86; 2 pins existentes actualizados = los bumps de cache de siempre).

## 1. Pasos numerados 1 · 2 · 3 — mapeados a la estructura REAL del flujo

El flujo real no es una sola forma: es la tarjeta del carrito (líneas + totales) y, al avanzar, la tarjeta de checkout (cuenta → dónde/cuándo → oferta de membresía → resumen editable de servicios → total a pagar hoy → pago). Los rótulos de paso (clase nueva `.cc-step`: rojo `#e42535`, 800, mayúsculas, 15px — el mismo rótulo del draft, hermano de `.wclass-step` de la v84) se mapearon así:

- **`1 · Your order` / `1 · Tu orden`** (`#ccStep1El`) — sobre las líneas del carrito, dentro de la tarjeta del carrito, bajo el título "Your cart / Tu carrito".
- **`2 · Your details` / `2 · Tus datos`** (`#ccStep2El`) — al abrir la tarjeta de checkout, sobre la cuenta y el dónde/cuándo (los sub-rótulos pintados de siempre — "Your account — last step", "Where & when" — quedan como subsecciones del paso 2; el resumen editable `#ccLines` vive entre el paso 2 y el 3 como el recap de la orden, con su propio título, como hoy).
- **`3 · Payment` / `3 · Pago`** (`#ccStep3El`) — sobre la tarjeta de dinero y el elemento de pago (el h4 "Payment" de siempre queda como el título de la subsección del formulario de tarjeta).

Las tres cadenas nuevas viven en `CUST_UI` EN+ES (`ccStepOrder` / `ccStepDetails` / `ccStepPayment` — paridad de diccionarios intacta) y las pinta `paintCartStatics()` por id, un idioma a la vez, como todo el carrito.

## 2. El resumen de dinero = la TARJETA DESTACADA del draft

- `renderCartTotalsDue()` ahora envuelve sus filas — **las mismas filas, las mismas palabras, los mismos números** (Subtotal / precio de miembro −20% / fila de unión HomeCare / Total / **Deposit due today** / Balance at completion, con la ley de apartado calculada exactamente igual) — en `.cart-due-card`: panel `#141414`, borde **2px `#e42535`**, radio **20px**, filas a 15.5px y el renglón del depósito (clase nueva `cart-due-dep`, solo una clase añadida al div) con el número a **21px** — el número grande del draft. Es el mismo tratamiento que la v85 le dio a la tarjeta del ejemplo de How ordering works.
- La regla asentada de presentación no se movió: el titular de cada línea sigue siendo el precio de lista COMPLETO y el descuento de miembro sigue siendo su propio renglón/insignia verde — solo cambió el vestido.

## 3. El lenguaje de tarjeta en el resto de la superficie

- Tarjetas del `#cartBox` (carrito, checkout y confirmación) y de las propuestas en la cuenta (`#myProposals .card`): radio **20px** y padding 20px (18px en propuestas); títulos del carrito/checkout a 22px; sub-rótulos (h4) a 16.5px; etiquetas de formulario a 15px; campos con radio 14px y padding 13/14; líneas del carrito con más aire (padding 14px) y nombre a 15.5px; totales de la vista del carrito a 15px con el Total a 17px; botones primarios en rectángulo redondeado del draft (Checkout 16px/radio 14, **Pay** 17px/radio 14, full width como hoy); pastillas Today/Tomorrow/ASAP más grandes; la oferta de membresía (`#ccOffer`) a radio 20px; el contenedor del Payment Element a radio 14px.
- Las propuestas conservan intactos sus tres botones y su comportamiento (Accept → su propio checkout; Keep shopping → espera; Save for later → guardada) — solo la tarjeta cambia de vestido.

## 4. Decisiones

- **La página pública del link (`/cart/CRT-…`) NO se tocó**: esa superficie se renderiza desde `app/server.js` (con su propio toggle EN|ES `ghsCartLang`), y esta versión tiene prohibido tocar server.js — queda con su vestido actual para una pasada futura si Gabriel la pide.
- **El h4 "Payment" (`#ccPayTitleEl`) se queda**: es un id pintado por i18n de siempre; vive bajo el rótulo del paso 3 como título del formulario de tarjeta. Borrarlo habría sido un cambio de markup más allá del restyle.
- Ninguna fila del resumen llevó clases nuevas salvo el renglón del depósito (`cart-due-dep`) — el resto del énfasis se logró por CSS sobre las clases existentes (`.cart-total-row`, `b`).

## 5. Pins — `tests/run.mjs` (3 nuevos v86 + 2 actualizados)

- **Nuevos:** (a) estático — los tres rótulos de paso existen en el markup, se pintan desde `paintCartStatics()` y sus claves viven en AMBOS idiomas de `CUST_UI`; (b) estático — la tarjeta destacada `.cart-due-card` en CSS + el envoltorio y la clase del depósito en `renderCartTotalsDue()` + el radio 20px de carrito/propuestas; (c) VM — con el checkout abierto, `#cartTotalsDue` pinta dentro de `.cart-due-card` con el renglón del depósito marcado y su texto "Deposit due today", y los tres rótulos llevan sus etiquetas.
- **Actualizados (los de siempre):** los 2 pins de cache SW pasan a `ghs-app-v86`.
- Ninguna aserción existente se debilitó; los pins de comportamiento del carrito/checkout (v78 y refinamientos: matemática, edición en el checkout, re-cotización, join, P0-4) pasan sin tocarse.

## Versión

- SW `CACHE = 'ghs-app-v86'`.
- Archivos: `app/public/index.html`, `app/public/sw.js`, `tests/run.mjs`, este archivo. **`app/server.js` NO se tocó.**
- Sin cambios de precios, sin cambios al catálogo, sin cambios funcionales: mismos ids, mismos handlers, mismas rutas, misma ley de apartado.

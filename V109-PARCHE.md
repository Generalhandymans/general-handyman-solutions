# v109 — Páginas por ciudad + servicio (13 puertas nuevas, generadas desde la fuente de verdad)

**Orden de Gabriel (2026-11-16):** "Arma las páginas por ciudad + servicio (v109)".
**Commit local:** `8e87135` (rama fusion-v80.9) · **GitHub main:** `751a7ca` · **SW:** `ghs-app-v109`
**Suite:** PASS **2083** / FAIL **0**, corrida **DOS VECES** (baseline v108: 2050; +33 pins nuevos).

## Qué se construyó

Trece páginas reales (200, sin redirects), patrón v104/v105 exacto — server-rendered
desde `app/public/landings/`, servidas por `LANDING_DOORS` en `app/server.js`, con
canonical propio, título y meta description únicos, Open Graph, JSON-LD, tema oscuro,
rojo #e42535, logo de la gorra grande, REPORTING FOR DUTY, (707) 862-3773, toggle
EN|ES de un idioma con la persistencia de la app (`ghsMenuLang`), bloque
cómo-funciona, mención HomeCare con el copy asentado y CTA al menú de la app
(`%%JOIN%%` → `/#menu`, con el contrato `?src=` validado viajando dentro del
fragmento, igual que las puertas v104/v105).

**8 páginas de ciudad** (menú completo: los 5 oficios + el servicio suelto de
handyman, más una tarjeta "Popular en <ciudad>" con 5 servicios elegidos por ciudad):
- /handyman-fairfield · /handyman-suisun-city · /handyman-vacaville · /handyman-vallejo
- /handyman-benicia · /handyman-napa · /handyman-concord · /handyman-antioch

**5 páginas de oficio (Fairfield, la base):**
- /carpentry-fairfield (40 servicios) · /electrical-fairfield (18) · /plumbing-fairfield (17)
- /yard-work-fairfield (17) · /mobile-mechanic-fairfield (14)

Cada página enlaza a las demás ciudades, a las 5 páginas de oficio y a las puertas
principales (/homecare, /plus, /yard, /junk-removal). Cada servicio enlaza a su ruta
de orden `/#order/<id>` (el turbo, que es estimate-first, enlaza a la raíz de la app:
estimado por foto gratis; el starter, que es "from", muestra "From $250").

## Google policy-proof (regla de Gabriel, 2026-11-15)

Nada de doorway pages: cada ciudad trae intro PROPIA escrita para ella (zonas reales:
Fairfield — North Texas, Cordelia, Green Valley, Rancho Solano, Paradise Valley;
Suisun City — Old Town, Marina, Lawler Ranch; Vacaville — Nut Tree, Browns Valley,
Lagoon Valley; Vallejo — Glen Cove, Mare Island, Hiddenbrooke; Benicia — Arsenal,
Southampton, First Street; Napa — Browns Valley, Alta Heights, el río; Concord —
Clayton Valley, Dana Estates, Four Corners; Antioch — Lone Tree, Deer Valley,
Black Diamond), servicios populares distintos por ciudad y notas propias por oficio.
Sin claims inventados: nada de reviews, ratings ni testimonios falsos; lo único
afirmado es verificable (operando desde 2020, precios reales, depósito asentado).

## Cómo se sacan los precios (cero deriva posible)

Las páginas las GENERA `tools/gen-landings-v109.mjs` (commiteado), que lee la fuente
de verdad y evalúa los literales reales: `SERVER_MENU` + `MENU_TRADE` de
`app/server.js` y `MENU_CATALOG` + `MENU_ES` de `app/public/app.js`. El generador
ABORTA si falta un id o si un precio del catálogo difiere del servidor. Para cambiar
una página: se edita el contenido en el generador y se re-corre; los precios salen
solos del menú. La suite además re-deriva CADA fila de cada página desde las mismas
fuentes (nombre EN/ES + precio de lista + precio de miembro) y falla si algo difiere.

## Sitemap y robots

- `SITEMAP_DOORS`: 6 → **19 URLs** (las 6 de siempre + las 13 nuevas, en ese orden).
- `robots.txt`: SIN CAMBIOS — queda exactamente como lo dejó v107 (un solo Sitemap).

## Qué NO se tocó

Precios, datos del menú, checkout, matemática de depósitos, contenido de las páginas
existentes y la homepage (el bloque opcional de "service areas" NO se agregó: las
páginas se cruzan entre ellas y la homepage tiene demasiados pins estáticos para
tocarla sin necesidad; queda como mejora opcional si Gabriel la pide). `app/data.json`
no viajó, como siempre.

## Verificación en vivo (2026-11-16, tras el deploy)

- sw.js sirve `ghs-app-v109`.
- Las 13 URLs nuevas: **200** con su título correcto y sus filas reales (ciudades:
  224 filas = (107 servicios + 5 populares) × EN/ES; carpintería 80, electricidad 36,
  plomería 34, yarda 34, mecánica 28).
- Las 6 URLs de siempre (`/`, /plus, /plus2, /homecare, /yard, /junk-removal): **200**.
- Sitemap en vivo: **19 `<loc>`**, con las puertas nuevas presentes.
- Robots en vivo: cuerpo exacto de v107.
- Carrito de Charla (CRT-C3D8F01D8AD8B58BAF): intacto — $170 / depósito $50 / saldo
  $120 / miembro $136.
- Carritos de Ernest: trabajo $3,675 (CRT-4E144EC9CFDD84B4D1) y materiales $1,885
  (CRT-B1E4392D03C3F234BD), intactos.

## Brechas honestas

- NO se envió nada a Google ni a Bing: la indexación de las 13 URLs nuevas se pide
  en la sesión de consolas aparte (la orden permanente de Gabriel lo cubre).
- Las páginas no se ejercitaron con una sesión de navegador real en producción; la
  evidencia es la suite completa (que fetchea cada ruta contra el servidor real) más
  la verificación en vivo por HTTP de arriba.
- El contenido EN/ES de las intros es nuevo y está escrito a mano en el generador;
  si Gabriel quiere ajustar el tono o los servicios "populares" de alguna ciudad, se
  edita el generador y se regenera — los precios nunca se tocan a mano.

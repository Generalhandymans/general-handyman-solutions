# v104 — LAS CUATRO PUERTAS DE MEMBRESÍA SON PÁGINAS REALES (SEO)

Orden de Gabriel (2026-11-15): «Haz la v104 — páginas reales ya» /
«para que todo esté perrísimo».

## El problema

`/plus`, `/plus2`, `/homecare` y `/yard` NO eran páginas: desde v80.9 /
v80.11 el servidor respondía 302 al fragmento de join de la SPA
(`/#join-plus1`, `/#join-plus2`, `/#join-homecare`, `/#join-yard1`).
Perfecto para el tap del bio/QR, invisible para buscadores: la
verificación del 2026-11-15 encontró en Google Search Console las cuatro
con **«Redirect error»** y en Bing «discovered, never crawled» — y las
cuatro están en el sitemap. Re-pedir indexación no arregla un redirect:
había que construir las páginas.

## El arreglo

- `app/public/landings/` — 4 páginas nuevas, HTML renderizado en el
  servidor (texto real indexable, no un shell JS):
  - `homecare.html` → **HomeCare $29/mes** — primer mes GRATIS para todos
    (prueba de 30 días, una por cuenta), −20% en mano de obra, primer
    estimado en persona GRATIS (luego $50), agenda prioritaria, cancela
    cuando quieras.
  - `plus.html` → **HomeCare Plus $100/mes** (1 visita/mes) — el plan
    insignia primero, con su sello «⭐ BEST — our most complete plan»
    (la jerarquía de promos de Gabriel).
  - `plus2.html` → **HomeCare Plus $175/mes** (2 visitas/mes).
  - `yard.html` → **Yard Care $75/mes** (1 visita/mes) con el segundo CTA
    de 2 visitas **$150/mes** y la línea de términos asentada: las visitas
    no usadas no se acumulan ni se reembolsan.
  - Cada una: `<title>` y meta description únicos, canonical a sí misma,
    Open Graph, precio + beneficios con el copy ASENTADO de la app
    (`JOIN_PROMO_BENEFITS` / `JOIN_PROMO_UI`, EN + ES, línea por línea),
    cómo funciona (pedir en la app → el Team confirma → listo), ciudades
    de cobertura (Fairfield, Suisun City, Vacaville, Vallejo, Benicia,
    Napa, Concord, Antioch) y su foto de plan existente
    (`/plan-img/*.webp` — assets creados de la casa, cero stock, cero
    generación nueva).
  - Diseño ley de marca: tema oscuro en toda la pantalla, rojo
    **#e42535**, el logo principal (gorra) GRANDE, línea REPORTING FOR
    DUTY, teléfono (707) 862-3773.
  - Idioma: toggle **EN | ES** de un solo idioma a la vez, con la MISMA
    persistencia de la app (`ghsMenuLang` + sus llaves hermanas) — la
    página abre en el idioma guardado del visitante y el toggle lo
    recuerda para la app.
- `app/server.js` — los dos bloques 302 se reemplazan por UNA ruta
  `LANDING_DOORS`: sirve la página con **200** y sustituye el CTA.
  **EL CONTRATO DE JOIN NO CAMBIA:** el CTA apunta al MISMO fragmento
  que el 302 usaba (`/#join-plus1`, `/#join-plus2`, `/#join-homecare`,
  `/#join-yard1`; `/#join-yard2` para la opción de 2 visitas de Yard) y
  el sello `?src=CODE` de campaña sigue viajando DENTRO del fragmento,
  donde el parser de rutas de join del cliente lo lee (ej.
  `/plus?src=INSTA1` → CTA `/#join-plus1?src=INSTA1` — los links de
  referidos de técnicos `/plus?src=CODIGO` quedan intactos). El sello se
  valida por charset (`[A-Za-z0-9_-]{1,40}`) antes de escribirse en la
  página; cualquier otra cosa se descarta, jamás se refleja.
  El comentario del sitemap se actualiza (ya no «302s onto fragments»).
- `app/public/sw.js` — cache `ghs-app-v104`. Las landings NO entran al
  precache: el SW ya trata las navegaciones network-first.
- Sitemap y robots.txt: **sin cambios** (las mismas 5 URLs — ahora sí
  indexables). Precios, menú, checkout y lógica de cobro: **sin cambios**
  — los precios de las páginas son copy display copiado del catálogo de
  planes asentado (`PLAN_CATALOG`/`JOIN_PLAN_INFO`: 29/75/150/100/175);
  el cobro sigue viviendo solo en la SPA/Stripe de siempre.

## Pruebas

Suite completa contra este árbol (copia con `APP_DIR` →
`ghs-app-fusion/app`, como en v101–v103):

- **Corrida 1: PASS 1992 / FAIL 0**
- **Corrida 2: PASS 1992 / FAIL 0**

(baseline v103: 1989 → +3 pins netos v104: estatutos de LANDING_DOORS +
contenido de las landings, las 4 puertas en vivo a 200 con su CTA y el
sello `src` dentro del fragmento; los pins viejos de puertas — v80.9,
v80.11 estático, v80.11 en vivo y v80.17 — se reescribieron al contrato
nuevo, y los 3 pins de cache SW pasaron a v104.)

Smoke local previo (puerto 3210): las 4 puertas 200 con 0 redirects,
CTAs exactos, `?src=INSTA1` dentro del fragmento, y un `src` hostil
(`"><script>`) descartado sin reflejarse.

## Ruta de publicación

Snapshot a GitHub `main` SOLO con los archivos de este parche
(app/server.js, app/public/sw.js, app/public/landings/*.html ×4,
tests/run.mjs, este parche). `app/data.json` NO viaja (datos vivos
mandan desde la nube, M24) y ningún asset se toca.

# v105 — Paquete Junk completo (2026-11-15)

Orden de Gabriel: fortalecer Junk & Hauling de punta a punta — 5 servicios nuevos en el menú, landing indexable `/junk-removal`, rutas del bot para basura (EN+ES) e IndexNow para avisarle a Bing/Yandex al instante. Precios nuevos = **PROPUESTAS** ancladas al sistema (miembro = 80% exacto), para que Gabriel las corrija si quiere. **Ningún precio confirmado cambió.**

## 1) Cinco servicios nuevos en Junk & Hauling (PROPUESTAS)

| id | EN | ES | Lista | Miembro |
|---|---|---|---|---|
| `junk-single-item` | Single-Item Pickup | Retiro de un solo artículo | $150 | $120 |
| `appliance-removal` | Appliance Removal | Retiro de electrodomésticos | $150 | $120 |
| `mattress-removal` | Mattress Removal | Retiro de colchón | $125 | $100 |
| `garage-cleanout` | Garage Cleanout | Limpieza total de garaje | $325 | $260 |
| `debris-removal` | Construction Debris Removal | Retiro de escombro de construcción | $325 | $260 |

- Garage Cleanout y Debris entran al ancla de la carga mediana ($325); su descripción dice "From $325 — final price follows the load tiers" (el framing va en el texto, NO en el flag `from:` — ese flag está cableado al rango del turbo y renderizaría "$325–$300").
- Fluyen por todo lo existente: `SERVER_MENU` (server.js) + `MENU_CATALOG`/`MENU_GROUPS`/`MENU_ES` (app.js) en espejo exacto, `MENU_TRADE` = gardening, `SERVICE_HOURS` (1h/1h/1h/2h/2h), `CAPTAIN_EXCLUDED_SERVICE_IDS` (basura = $0 override del capitán, como los tiers), filas PROPUESTA en `MASTER-SERVICE-LIST.md` §4, carrito, split de depósito ($50 plano ≤$300, 40% arriba), matemática de miembro, admin y bot.
- Fotos de menú NUEVAS, creadas (fotorrealistas, estilo cinematic claro, sin texto): `menu-img/{junk-single-item,appliance-removal,mattress-removal,garage-cleanout,debris-removal}.webp` (512×341, como todo el set; 107 imágenes en total).
- Confirmados INTACTOS: tiers $250/$325/$425/$650, Green Waste $250, add-ons haul-* $50 nodisc.

## 2) Landing `/junk-removal`

- Quinta puerta en `LANDING_DOORS` (server.js): página real server-rendered (200, sin redirect), archivo `app/public/landings/junk-removal.html` — misma construcción que las puertas v104: tema oscuro, rojo #e42535, logo de la gorra GRANDE, REPORTING FOR DUTY, (707) 862-3773, toggle EN|ES con la persistencia `ghsMenuLang` de la app.
- SEO: título único "Junk Removal in Fairfield & Solano County", meta description, canonical = ella misma, Open Graph, JSON-LD Handyman.
- Contenido: los 4 tiers + los 5 servicios nuevos + Green Waste con precios reales y precio de miembro, cada renglón linkea a su orden directa `/#order/<id>`; cómo funciona (ordena en la app → estimado por foto gratis → retiramos); ciudades de cobertura (Fairfield, Suisun City, Vacaville, Vallejo, Benicia, Napa, Concord, Antioch); CTA principal `%%JOIN%%` → `/#menu` (el `?src=` validado viaja dentro del fragmento, igual que v104).
- Sitemap: `SITEMAP_DOORS` += `/junk-removal` → **6 URLs** en /sitemap.xml, la puerta Render y /sitemap-www.xml. robots.txt sin cambios.
- Copy limpio de políticas de Google: precios reales, sin claims falsos.

## 3) Bot — rutas de basura EN+ES

- Rutas nuevas en `ASSISTANT_ROUTES`: los 5 servicios + tiers medium/large/full (junk-minimum conserva sus keywords + 'haul away'/'get rid of'/'tirar basura').
- ⚠️ El ruteador puntúa por CONTEO de keywords (≥8 caracteres = 3 pts, si no 2) — no por frase más larga. Las rutas específicas llevan keywords desnudas del artículo ('fridge', 'couch', 'mattress', 'colchon', 'nevera', 'lavadora'…) para ganarle a las genéricas de junk-minimum en las frases de retiro, sin robar las rutas de instalación: verificado que "conectar mi lavadora y secadora" sigue en washer-dryer-hookup ($135) y "new water heater installed" sigue en water-heater ($700), mientras "quitar la lavadora vieja" y "remove the water heater" caen en appliance-removal.
- Pregunta de tamaño + foto: línea nueva `ASSISTANT_T.junkAsk` (EN+ES) que se agrega a TODA cotización de la familia junk (`ASSISTANT_JUNK_IDS`): pregunta qué artículos se van y cuánto espacio ocupan, invita la foto (estimado por foto gratis) y aclara que el precio final sigue la carga real. El bot sigue sin prometer horarios y escala lo desconocido a Gabriel en admin, como siempre.

## 4) IndexNow

- Key generada: `08228ae9460ae3105f0709c73a626eec` — archivo `app/public/08228ae9460ae3105f0709c73a626eec.txt` (contenido = la key) servido por ruta explícita en server.js (modelo BingSiteAuth): `GET /08228ae9460ae3105f0709c73a626eec.txt` → 200 text/plain.
- Envío ÚNICO al desplegar (one-time, sin jobs de fondo): POST https://api.indexnow.org/indexnow con las 6 URLs del sitemap. Resultado en el reporte de publicación.

## Housekeeping

- SW cache → `ghs-app-v105`.
- Pins de conteo del suite actualizados 102→107 servicios / 108→113 tarjetas; pins del sitemap (v80.18, v97 byte-idéntico, v97 www) extendidos a 6 puertas; pins de SW a v105.
- Tests nuevos (bloque v105, 23): catálogo PROPUESTA + confirmados intactos, 11 rutas del bot EN/ES con precio/depósito exactos, 2 regresiones de instalación, checkout del bot crea carrito real de mattress-removal y la página pública del carrito muestra su foto + línea de miembro $100.00, puerta /junk-removal (200, canonical, CTA, src válido y hostil), sitemap de 6 URLs exactas, key file de IndexNow.
- **Suite completo: 2,015 PASS / 0 FAIL, corrido DOS VECES** (baseline v104: 1,992; +23 nuevos).

# V85-PARCHE — La vitrina habla el idioma del draft: restyle de la home del cliente (2026-11-07)

Orden de Gabriel (2026-11-07): **"quiero que así se mire nuestra página"** — el draft aprobado de registro de técnicos (fondo negro limpio, acentos rojos `#e42535`, letras GRANDES y claras, tarjetas grandes redondeadas y seleccionables, aire generoso, UNA idea por pantalla, rótulos de paso "1 · / 2 ·") es la estrella norte de diseño de TODA la página. La v84 lo aplicó al registro de trabajadores; la v85 lo lleva a la **home del cliente (`#oldhome`)**. Es un restyle de CSS/markup: **ningún id, handler, ruta hash, precio, término de membresía ni hecho del catálogo se movió** — la barra de marca compacta v83 y el buscador quedan funcionalmente intactos. Suite: **1747 → 1750 PASS / 0 FAIL** (verificada dos veces) (3 pins netos nuevos v85; 2 pins existentes actualizados = los bumps de cache de siempre).

## 1. Hero — una idea, una acción, vitrina honesta

- El titular sube a la escala del draft: `.heroimg h1` 31px → **36px** (interlineado 1.08), el contenido del hero respira (padding 18/16 → 22/18/20) y el CTA principal crece con él (`.bigcta` 16px → 17px, radio 14 → 16px). Mismos textos (OH_UI), misma foto, mismo destino `#menu`.
- **La línea de estrellas decorativa `★★★★★` MUERE**: implicaba un 5.0 que nadie verificó — exactamente la clase de rating decorativo que la auditoría v83.2 limpió de las tarjetas destacadas. En su lugar el hero lleva el dato asentado y honesto, pintado por idioma como todo lo demás: `★ 4.5 on Google · 20 reviews` / `★ 4.5 en Google · 20 reseñas` (clave nueva `heroRatingHtml` en OH_UI EN+ES; `paintOldHome()` la pinta sobre `.heroimg .stars` con el `<span>` atenuado que la regla `.stars span` ya vestía). Ningún hecho nuevo: son las mismas cadenas asentadas de `HOME_UI.rating`.

### Enmienda v85 (estrellas del hero — orden de Gabriel, mismo día)

- Gabriel pidió de vuelta el **visual GRANDE de cinco estrellas** en el hero ("Solo pon las 5 estrellas") y se le implementó **sin mentir el número**: sobre la misma línea honesta asentada va ahora una fila grande (30px) de cinco estrellas cuyo RELLENO dice el 4.5 real — **cuatro estrellas llenas + la quinta a la MITAD** (bitono real: estrella base atenuada `#55555d` con una estrella dorada `#ffb800` encima recortada al 50% vía `.st.half i{width:50%; overflow:hidden}` — ni opacidad rebajada ni estrella vacía). Debajo, intacta, la línea `4.5 on Google · 20 reviews` / `4.5 en Google · 20 reseñas`. **No aparece "5.0" en ninguna parte del hero** y las cinco estrellas llenas siguen prohibidas por pin. La fila viaja dentro de la misma clave `heroRatingHtml` (OH_UI EN+ES, cadenas neutras de idioma) y el `paintOldHome()` no cambió; la suite queda en **1750 PASS / 0 FAIL** (el pin v85 del hero se actualizó al nuevo estado honesto con la misma o mayor estrictura: conteo exacto 4 llenas + 1 media dentro del div del hero, CSS de recorte presente, `5.0` ausente del hero).

## 2. Tarjetas — un solo lenguaje de tarjeta en toda la home

- Radio unificado a **20px** (el radio de tarjeta del draft) en: tarjetas de servicio (`.card` 18 → 20), filas de junk (`.wide` 16 → 20), tarjetas de favoritos (`.oa-card` 16 → 20), antes/después (`.ba` 18 → 20), tabla comparativa (`table.cmp` 16 → 20), ciudades (`.city` 16 → 20), pasos (`.step` 14 → 18) y banda de confianza (`.trust div` 14 → 18).
- Escala tipográfica del draft: nombre de servicio 14.5 → 15.5px, meta 11.5 → 12.5px, precio 20 → **22px**, línea de miembro 11.5 → 12.5px, títulos de sección (h2) 20 → 22px, subtítulos 12.5 → 13.5px; la foto de la tarjeta crece (`.tile` 96 → 110px) y el cuerpo respira (padding 11/12 → 13/14; gap de la rejilla 12 → 14px; secciones 20 → 26px de aire superior). El botón Order (`.pedir`) sube a radio 12px / 14.5px.
- **La tarjeta del ejemplo de "How ordering works" viste el borde de la tarjeta ELEGIDA del draft**: `.order` pasa a panel `#141414` con borde **2px `#e42535`** y radio 20px — es la tarjeta destacada de la sección, como la tarjeta seleccionada del registro. Su contenido queda FACTUALMENTE IDÉNTICO (el ejemplo real de $300 de la v83.2: TV $175 + raceway $50 + soundbar $75, "Deposit due today $50 / Balance at completion $250" — los pins v83.2 siguen verdes sin tocarse).
- Las promos (`.promo`) conservan sus gradientes de identidad (temporada/miembro/junk) y solo se alinean en radio (18 → 20px), padding (16 → 18px) y titular (19 → 20px).

## 3. Membresías en la home — la jerarquía asentada, vestida del draft

- **Orden nuevo de las seis tarjetas** (la jerarquía de Gabriel: Plus $100 primero como LA mejor, el plan Yard de 2 visitas debajo de él, HomeCare con su mes gratis, FREE como base sin membresía): **HomeCare Plus $100 → HomeCare $29 → HomeCare Plus $175 → Yard Care $75 → Yard Care $150 → FREE $0**. Ninguna tarjeta se borró ni se repreció; los seis botones conservan byte a byte su markup y sus rutas (`#join-plus1`, `#join-homecare`, `#join-plus2`, `#join-yard1`, `#join-yard2`, WhatsApp del estimado gratis) — los pins v80.10.5 de botones siguen verdes.
- **El lenguaje de selección del draft**: antes TODAS las tarjetas llevaban borde rojo (nada se distinguía); ahora la tarjeta base es panel oscuro con borde neutro `#2b2b30`, y SOLO la destacada — **HomeCare Plus $100** (clase nueva `ghs-mem-best`) — lleva el borde rojo `#e42535` más la insignia roja **`★ BEST` / `★ EL MEJOR`** sobre su foto (la ✓ del draft, en pastilla de marca). La tarjeta FREE conserva su borde verde: es su identidad de "sin membresía".
- `paintOldHome()` pinta por ÍNDICE, así que **`OH_UI.memCards` (EN y ES) se reordenó en el MISMO orden nuevo** y la entrada destacada ganó la llave `badge` en ambos idiomas (paridad OH_UI intacta); el pintor ahora también pinta `.ghs-mem-badge` desde `c.badge`. Nombre/precio/beneficios de cada tarjeta quedan casados como siempre — verificado por pin y por la suite completa.
- La sección respira a la escala del draft: padding 30/22 → 34/22/26, gap de rejilla 16 → 18px, tarjetas con padding 24/20 y radio 20px, botones radio 12px.

## 4. Conflicto de estilo resuelto

- **Fotos del menú**: la regla asentada manda imágenes light-cinematic en las tarjetas del menú; el draft es oscuro. Resolución: el lenguaje del draft se aplica a SUPERFICIES, tipografía, radios y bordes — **ninguna imagen se regeneró ni se cambió** (las fotos `/old/*.webp` de las tarjetas y las fotos de las tarjetas de membresía quedan exactamente como están).

## 5. Pins — `tests/run.mjs` (3 nuevos v85 + 2 actualizados)

- **Nuevos:** la vitrina honesta del hero vía OH_UI EN+ES (línea 4.5/20 + fila grande de estrellas con relleno 4.5 — 4 llenas + 1 media recortada — y la muerte del glifo `★★★★★` de cinco llenas; ver la Enmienda arriba); el lenguaje de tarjeta (radios 20px + borde rojo del ejemplo + titular 36px) en CSS; la jerarquía de membresías (orden por href en el archivo, clase `ghs-mem-best` + insignia, borde neutro base, y el orden espejo de `OH_UI.memCards` con `badge` en ambos idiomas leído del diccionario parseado).
- **Actualizados (los de siempre):** los 2 pins de cache SW pasan a `ghs-app-v85`.
- Ninguna aserción existente se debilitó; ningún pin de hechos (v83.2 ejemplo/honestidad, v80.10.5 botones, v83 cabecera, v83.1 franja) cambió — todos verdes tal cual.

## Versión

- SW `CACHE = 'ghs-app-v85'`.
- Archivos: `app/public/index.html`, `app/public/sw.js`, `tests/run.mjs`, este archivo. **`app/server.js` NO se tocó.**
- Sin cambios de precios, sin cambios al catálogo, sin cambios funcionales: mismos ids, mismos handlers, mismas rutas hash (`#join-plus1`, `#join-plus2`, `#memberships`, `#worker`, `#oldhome`, carrito, buscador, toggle EN|ES, notificaciones).

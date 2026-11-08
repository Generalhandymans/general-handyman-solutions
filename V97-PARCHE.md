# V97-PARCHE — EL SITEMAP QUE BINGBOT NO PODÍA LEER (tres puertas para el mismo mapa)

**Base:** v96 (auditoría completa de tema y bugs, commit 618109f — sin tocar) sobre v95 (e9eb758) y v94 (abae162).
**Alcance:** SOLO SEO (app/server.js: bloque de puertas SEO v80.18) + pines de prueba + el bump de caché de siempre. Ningún texto visible al cliente, ruta de negocio, precio, handler ni flujo de Stripe cambió. app/public/index.html NO se tocó.
**Ritual:** SW cache `ghs-app-v97`.

---

## 1. EL PROBLEMA (verificado en el panel de Bing Webmaster, 2026-11-08)

El sitio SÍ está verificado en Bing (la propiedad aparece en «My sites» con acceso a informes — el registro por CNAME de la noche v92/v93 asentó). Pero el sitemap enviado, `https://generalhandymans.app/sitemap.xml`, quedó en estado **«Error» con 0 URLs descubiertas** y el mensaje textual de Bing: *«The page is not accessible — Bingbot was not able to access the page.»*

Del lado del sitio todo está sano: el origen en Render sirve el sitemap (HTTP 200, XML válido, las cinco puertas) y robots.txt lo anuncia. Es el mismo fallo de acceso intermitente de Bingbot al apex (ALIAS → Render) que ya rebotó la etiqueta meta de la v92 («Body tag not found») y el XML de la v93: el robot no alcanza el apex de forma confiable, aunque cualquier navegador sí.

## 2. EL CAMBIO — un solo constructor canónico, tres puertas

El cuerpo del sitemap salió de la ruta y pasó a **UN constructor canónico** (`sitemapBody(base)`) usado por todas las rutas de sitemap: misma declaración XML, mismo `urlset` (namespace sitemap.org 0.9) y las mismas cinco puertas públicas `['/', '/plus', '/plus2', '/homecare', '/yard']` como líneas `<url><loc>{base}{door}</loc></url>`.

**Decisión de diseño (fijada): las `<loc>` SIEMPRE llevan el host canónico que se le pasa al constructor — NUNCA el host que sirvió el fetch.** Un solo mapa canónico para todas las puertas; nada de conmutación por Host (la variante www es una ruta explícita aparte, no contenido que cambia según quién pregunte).

Las tres puertas que robots.txt ahora anuncia, en este orden:

| # | Puerta (URL del sitemap) | Qué lista | Para qué |
|---|---|---|---|
| 1 | `https://generalhandymans.app/sitemap.xml` | Las cinco puertas en el apex canónico | La puerta original de la v80.18 — **su cuerpo queda BYTE-IDÉNTICO al de siempre** (mismo contenido, mismo `Content-Type: application/xml; charset=utf-8`, mismo `Cache-Control`) |
| 2 | `https://general-handyman-solutions-app.onrender.com/sitemap.xml` | Las cinco puertas **en el apex canónico** (no en el host de origen) | La ruta es por path, así que el origen ya respondía; ahora robots.txt lo anuncia: si Bingbot no alcanza el apex, puede recoger EL MISMO mapa canónico desde el host de Render |
| 3 | `https://generalhandymans.app/sitemap-www.xml` | Las cinco puertas en `https://www.generalhandymans.app` | Ruta NUEVA y explícita. El host www es un CNAME al mismo servicio de Render (sirve contenido idéntico); sus `<loc>` viven en www, un host que Bingbot puede alcanzar con más confiabilidad que el apex |

## 3. robots.txt — tres líneas Sitemap (válido por spec)

Las dos primeras líneas quedan byte-idénticas y en su orden; se conserva la primera línea Sitemap y se agregan dos:

```
User-agent: *
Allow: /
Sitemap: https://generalhandymans.app/sitemap.xml
Sitemap: https://general-handyman-solutions-app.onrender.com/sitemap.xml
Sitemap: https://generalhandymans.app/sitemap-www.xml
```

(Múltiples líneas `Sitemap:` son válidas en robots.txt — cada una es una puerta independiente al mismo mapa.)

## 4. LO QUE NO CAMBIÓ

- El cuerpo del `/sitemap.xml` del apex: **byte-idéntico** al de la v80.18 (fijado por un pin en vivo con igualdad exacta de cadena, no solo `includes`).
- Las cinco puertas listadas: ni una más, ni una menos (`/tecnico` sigue fuera).
- La etiqueta meta de la v92, el BingSiteAuth.xml de la v93, la ruta del og-image y todo lo demás del bloque SEO.
- Ningún texto, precio, ruta de negocio ni flujo — el diff de server.js vive entero dentro del bloque de puertas SEO.

## 5. PINES v97

- 2 pines de caché actualizados (v96→v97: el pin estático de portada y el pin SW de v80.1).
- 1 pin estático nuevo: el constructor canónico existe con ambas bases (apex + www), la ruta `/sitemap-www.xml` existe y robots.txt lleva las tres líneas Sitemap en el código.
- 3 pines en vivo nuevos, junto a los de la v80.18/v93: (a) `GET /sitemap.xml` devuelve el cuerpo canónico **byte-idéntico** (cinco `<loc>` del apex, sin `/tecnico`, sin locs www); (b) `GET /sitemap-www.xml` → 200 XML con las cinco puertas en base www y ninguna `<loc>` del apex pelado; (c) `GET /robots.txt` contiene las tres líneas Sitemap, con la canónica del apex primero.
- El pin en vivo de robots de la v80.18 **no se tocó**: verifica con `includes()` la primera línea Sitemap, que sigue presente — verificado antes de asumirlo.

## 6. DESPUÉS DE PUBLICAR (fuera de este parche)

En el panel de Bing Webmaster: enviar también las dos puertas nuevas (`https://general-handyman-solutions-app.onrender.com/sitemap.xml` y `https://generalhandymans.app/sitemap-www.xml`) y vigilar cuál de las tres pasa a «Success» con URLs descubiertas. La que Bingbot logre leer es la que alimenta el índice; las tres apuntan al mismo sitio canónico.

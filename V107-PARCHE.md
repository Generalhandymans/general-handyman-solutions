# v107 — robots.txt anuncia SOLO el sitemap principal (2026-11-16)

Orden de Gabriel: «Arregla eso» — tras la auditoría en vivo del aviso de Search Console (WNC-20237597: «Page with redirect / Blocked by robots.txt / Not found (404)»). El robots.txt vivo anunciaba **tres** sitemaps — el principal, el del dominio origen de Render (onrender.com, un duplicado del sitio que puede confundir a Google) y la variante www — y Gabriel ordenó limpiarlo. **Mini-fix de un solo punto: cero cambios de precios, menú, checkout, rutas o del propio sitemap.xml.**

## El cambio

- `app/server.js` — la ruta `GET /robots.txt` (SEO doors, v80.18) servía el cuerpo inline con tres líneas `Sitemap:`. Ahora sirve exactamente:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://generalhandymans.app/sitemap.xml
  ```
  Las líneas `User-agent: *` / `Allow: /` quedan byte a byte como estaban. La ruta `/sitemap-www.xml` **sigue existiendo y sirviendo** (v97) — lo único que cambia es que robots.txt ya no la anuncia, ni anuncia la del origen de Render. El cuerpo de `/sitemap.xml` no se tocó: sigue listando las 6 URLs canónicas (`/`, `/plus`, `/plus2`, `/homecare`, `/yard`, `/junk-removal`).

## Housekeeping

- SW cache → `ghs-app-v107`; los 3 pins de SW de la suite actualizados v106→v107.
- Pins actualizados (aseveraban el comportamiento viejo de tres anuncios):
  - `static v97` → `static v97+v107`: el builder canónico y la ruta `/sitemap-www.xml` siguen; robots anuncia solo el principal (los otros dos `Sitemap:` ya no están en el fuente del servidor).
  - El test vivo `v97 robots` → `v107 robots (supersedes v97)`: exactamente UNA línea `Sitemap:` en el cuerpo servido, la principal; ausentes la de Render y cualquier mención a `sitemap-www`.
- Pins nuevos (bloque v107, 4): cuerpo robots byte-exacto en el fuente del servidor · `GET /robots.txt` byte-exacto en vivo · `/sitemap-www.xml` sigue respondiendo 200 (puerta conservada, solo desanunciada) · SW en v107.
- **Suite completo: 2,033 PASS / 0 FAIL, corrido DOS VECES** (baseline v106: 2,029; +4 netos del bloque v107 — los pins v97/SW actualizados cuentan 1:1). La suite se corrió desde copia scratch en /tmp con `APP_DIR` apuntando al árbol fusion (la ruta canónica del harness sigue siendo `~/workspace/ghs-app/app`, sin tocar en el archivo commiteado).
- Sin jobs de fondo, sin mensajes salientes, sin cambios en data.json (los datos vivos mandan desde la nube, M24).

## Nota de publicación

- (Se completa tras publicar y verificar en vivo.)

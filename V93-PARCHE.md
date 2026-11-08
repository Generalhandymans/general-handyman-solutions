# V93-PARCHE — Archivo XML de verificación de Bing (BingSiteAuth.xml) (2026-11-07)

Parche de **un solo propósito**: darle a Bing una segunda vía para verificar que generalhandymans.app es nuestro — el método **XML File**. La v92 puso la etiqueta meta (`msvalidate.01`) en el `<head>`, pero la verificación por meta **falló del lado de Bing**: su robot de verificación devolvió «Body tag not found» aunque la etiqueta está correctamente colocada (el HTML servido tiene un solo `<head>` y un solo `<body>`; el robot de Bing se atraganta con la página monolítica de 1.36 MB). Con el método XML, Bing ya no tiene que parsear la página: descarga **un archivo estático de 86 bytes**.

## 1. Los cambios

**Nuevo — `app/public/BingSiteAuth.xml`** (86 bytes, formato estándar de Bing para esta clave, con tab antes de `<user>`):

```xml
<?xml version="1.0"?>
<users>
	<user>CA95D6E2EB6DDA53B4F4B72A8D883928</user>
</users>
```

**Nuevo — una ruta en `app/server.js`** (junto a las puertas SEO de la v80.18, tras `sitemap.xml`):

```js
if (req.method === 'GET' && p === '/BingSiteAuth.xml') { …sirve el archivo de app/public… }
```

Nada más cambió: ni un texto, ni un id, ni un estilo, ni un handler, ni un precio, ni un flujo. La etiqueta meta de la v92 **se queda** en `index.html` — es inofensiva y queda como cinturón y tirantes: si Bing reintenta por meta, también la encuentra.

## 2. Cómo se sirve el archivo (mecanismo existente, sin inventar nada)

La app **no** sirve `app/public/` de forma genérica: cada archivo público llega por una **ruta explícita** en `server.js`. Las puertas SEO hermanas son rutas explícitas — `robots.txt` y `sitemap.xml` (v80.18) generan su cuerpo en línea — y los archivos reales de `public/` se sirven con el patrón de `og-image.jpg` (ruta exacta + `fs.existsSync` + lectura del archivo, `Cache-Control: public, max-age=86400`). Esta ruta **espeja ese patrón**: el archivo en `public/` es la única fuente de verdad, con `Content-Type: application/xml; charset=utf-8` (el mismo de `sitemap.xml`) y la misma caché de las demás puertas SEO.

## 3. Ritual de versión

- `app/public/sw.js`: caché `ghs-app-v92` → **`ghs-app-v93`** (el ritual de siempre).

## 4. Pines

- **Nuevos (estáticos)**:
  - `static v93` — `BingSiteAuth.xml` existe en `app/public` y lleva la clave exacta dentro de `<user>…</user>`.
  - `static v93` — el servidor enruta `/BingSiteAuth.xml` explícitamente (`p === '/BingSiteAuth.xml'`).
- **Nuevo (en vivo)**: `v93 Bing auth` — `GET /BingSiteAuth.xml` responde 200 XML con la clave exacta, en el bloque de fetches de la v80.18 junto a robots/sitemap.
- **Actualizados**: los 2 pins de caché de siempre (`static: SW cache is ghs-app-v93` y el pin v80.1 de SW) ahora esperan `ghs-app-v93`.
- Suite: **1789 → 1792 PASS / 0 FAIL** (verificada dos veces sobre copia temporal completa, con `APP_DIR` reapuntado a la copia).

## 5. Qué sigue (fuera de este parche)

Con la v93 publicada y el archivo en vivo en `https://generalhandymans.app/BingSiteAuth.xml`, en Bing Webmaster Tools se elige el método **XML File** y se pulsa **Verify**; verificado el sitio, se envía el sitemap (`https://generalhandymans.app/sitemap.xml`).

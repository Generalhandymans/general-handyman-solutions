# V92-PARCHE — Etiqueta de verificación de Bing Webmaster Tools (2026-11-07)

Parche de **un solo propósito**: que Bing pueda verificar que generalhandymans.app es nuestro. La app ya servía robots.txt y sitemap.xml desde la v80.18, pero el sitio nunca se había registrado en Bing Webmaster Tools — y sin verificación, Bing (y con él Yahoo y DuckDuckGo) no nos indexa. Esta versión pone la prueba de propiedad **dentro del repo**.

## 1. El cambio — una línea

En el `<head>` de `app/public/index.html`, junto a las demás etiquetas meta (tras la `description`):

```html
<meta name="msvalidate.01" content="CA95D6E2EB6DDA53B4F4B72A8D883928" />
```

Nada más: ni un texto, ni un id, ni un estilo, ni un handler, ni una ruta, ni un precio, ni un flujo cambió. `app/server.js` **no se tocó** — la etiqueta vive en `index.html`, que es la página que la app sirve como home, y ahí es donde Bing la lee.

## 2. Por qué el método de la etiqueta meta

Bing ofrece tres vías de verificación; se eligió la etiqueta meta porque:

- **Sin tocar DNS**: la vía CNAME/DNS exige cambios en el registrador del dominio — más lento, más frágil y fuera del repo.
- **Sobrevive a los despliegues**: la etiqueta vive en el código versionado; cada deploy de Render la lleva puesta. Un archivo de verificación suelto (XML file) puede perderse entre copias; la meta no.
- **Reversible en un commit**: si algún día se abandona Bing, se borra una línea.

## 3. Ritual de versión

- `app/public/sw.js`: caché `ghs-app-v91` → **`ghs-app-v92`** (el ritual de siempre, para que los clientes instalados tomen el `index.html` nuevo).

## 4. Pines

- **Nuevo**: `static v92` — la meta `msvalidate.01` con su código exacto está presente en `index.html`.
- **Actualizados**: los 2 pins de caché de siempre (`static: SW cache is ghs-app-v92` y el pin v80.1 de SW) ahora esperan `ghs-app-v92`.
- Suite: **1788 → 1789 PASS / 0 FAIL** (verificada dos veces sobre copia temporal completa, con `APP_DIR` reapuntado a la copia).

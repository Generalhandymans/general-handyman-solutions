# V114 — Combos de árbol de Navidad (tree combos)

**Orden de Gabriel (2026-11-22):** tres combos de árbol al menú en vivo — árbol real + base incluidos, entregados e instalados. Precios FINALES confirmados por Gabriel tras dos correcciones el mismo día: **$199 / $299 / $499**. Sin descuento de miembro (**nodisc**: el precio es mayormente materiales; los materiales nunca llevan descuento). **Las luces son SOLO instalación**: el cliente pone sus luces, GHS las cuelga/instala — el copy lo dice explícito ("your lights" / "tus luces"). Árbol + base SÍ incluidos (GHS los compra y entrega).

## Los tres servicios (familia holiday-lights, trade/grupo electrical, justo después de holiday-lights-takedown)

| id | EN | ES | Lista | Miembro |
|---|---|---|---|---|
| `tree-combo-small` | Basic Tree Combo | Combo Básico de Árbol | $199 | $199 (nodisc) |
| `tree-combo-medium` | Medium Tree Combo | Combo Mediano de Árbol | $299 | $299 (nodisc) |
| `tree-combo-premium` | Premium Tree Combo | Combo Premium de Árbol | $499 | $499 (nodisc) |

- **Small:** Douglas fir real 6–7 ft + base básica incluida, entregado e instalado (corte fresco, nivelado en la base, con agua). Entregas vie–dom. Foto del árbol al cliente para aprobación antes de comprarlo. Sujeto a stock del mismo día.
- **Medium:** Noble fir 7–8 ft + base reforzada incluida, entregado e instalado, y colgamos TUS luces en el árbol. Mismo lenguaje de entrega/foto/stock.
- **Premium:** Noble fir 9–10 ft + base de acero reforzada incluida, entregado e instalado, instalación de tus luces en el árbol Y en la entrada. Mismo lenguaje.
- El detalle largo vive en las filas de `MASTER-SERVICE-LIST.md` §2 (CONFIRMADO, con la nota nodisc); la tarjeta del menú lleva el meta corto EN/ES del patrón existente (`MENU_CATALOG` + `MENU_ES`).

## Add-on de decoración completa (aprobado por Gabriel, wording final suyo)
Add-on real con el mecanismo existente (checkbox, como haul-toilet/haul-vanity), id `tree-decorating`, **nodisc**, precio por tamaño de combo: **Basic +$75 · Medium +$100 · Premium +$150**. Es **SOLO mano de obra**: GHS decora el árbol **a gusto del cliente** y el cliente compra y pone **todas** las decoraciones (adornos, guirnalda y estrella/topper) — GHS nunca surte adornos. Texto EN (nombre del add-on, idéntico en catálogo y server): "Add full decorating: we decorate your tree your way — labor only, you supply the ornaments, garland and topper." Texto ES (en el meta de la tarjeta, la superficie ES de los add-ons — el codebase no tiene canal de nombre ES para NINGÚN add-on; los 22 existentes van solo en EN): "decoración completa a tu gusto (add-on: solo mano de obra — tú pones los adornos, la guirnalda y la estrella)". Filas correspondientes en la tabla de add-ons de `MASTER-SERVICE-LIST.md` (la suite v80.28 exige que todo add-on del catálogo exista en la lista maestra).

## Cambios
- `app/server.js` — `SERVER_MENU`: 3 entradas `{p,m}` con m == p · `MENU_TRADE`: los 3 → `electrical` · `SERVICE_HOURS`: 1.5 / 2 / 3.
- `app/public/app.js` — `MENU_CATALOG` (EN, precio/miembro), `MENU_GROUPS` electrical (después de la familia holiday-lights), `MENU_ES` (nombre + meta ES).
- `app/public/landings/*.html` — regeneradas con `tools/gen-landings-v109.mjs` (10 archivos: la página electrical + las 8 de ciudad + mobile-mechanic por la fila de frenos v113 que la copia local aún no traía; diff verificado: solo filas tree-combo y esa fila). Catálogo derivado: 110 servicios, electrical = 21.
- `app/public/sw.js` — cache `ghs-app-v113` → `ghs-app-v114`.
- `MASTER-SERVICE-LIST.md` — 3 filas CONFIRMADO §2 con nota nodisc.
- `tests/run.mjs` — pins de conteo 107→110 servicios / 113→116 tarjetas (v42, v43, v46, v80.28, v109), pins de SW a v114, `NAME_TO_ID43` += 3 filas, excepción nodisc explícita en las dos aserciones de la regla miembro = round(×0.8) (v43 y v46), y bloque nuevo v114 (6 aserciones: precios exactos server+catálogo, ES, placement, fotos en disco, filas en la landing electrical EN+ES).
- Fotos de menú NUEVAS, creadas (fotorrealistas, cinematic, sin texto): `menu-img/{tree-combo-small,tree-combo-medium,tree-combo-premium}.webp` (512×341, como todo el set; 110 imágenes en total). ⚠️ **Quedan en el working tree local**: el conector de GitHub no transporta binarios (lección v105); en vivo las tarjetas usan el fallback diseñado del sistema (foto de categoría) hasta que exista ruta binaria.

## Puerta /tree — la landing de la promo (orden de Gabriel)
- `app/public/landings/tree.html` NUEVA, espejo del patrón de puertas v104/v105 (server-rendered vía `LANDING_DOORS`, tema dark de marca, logo grande, REPORTING FOR DUTY, toggle EN|ES con la misma persistencia `ghsMenuLang`, footer con reviews/estimado por foto vía los placeholders de siempre).
- Registro en server.js: `'/tree': { file: 'tree.html', join: '#order/tree-combo-small', join2: '#order/tree-combo-medium', join3: '#order/tree-combo-premium' }` — los tres botones de orden son los deep-links `#order/<combo>` y el sello `?src=` validado viaja en los tres. Extensión mínima del handler: sustitución `%%JOIN3%%` junto a la de `%%JOIN2%%` (precedente: /yard).
- **Diseño (orden de Gabriel: "bien diseñado"):** hero con la foto promo del combo Medium, tres tarjetas de combo con foto, specs con ✓, precio grande y botón de orden; sección del add-on de decoración con sus tres precios visibles (+$75/+$100/+$150); franja "How it works" en 4 pasos (ordena en la app → aprobación por foto → entrega vie–dom → instalamos). **TODO precio visible en la página y en el carrito — nada escondido ni "price on request"** (la promo social sin precios es otra orden, separada).
- **Fotos:** las tres fotos promo generadas (Basic/Medium/Premium) son ahora TAMBIÉN las fotos de las tarjetas del menú (`menu-img/tree-combo-*.webp`, 512×341, locales como todo binario). En `tree.html` viajan **incrustadas en base64** (webp 720/1024px, ~440 KB extra) para que la puerta renderice completa en producción desde el mismo push de texto — el conector no transporta binarios (lección v105) y una puerta de promo no puede depender de un upload manual para verse bien.
- **Sitemap:** `/tree` entra en `SITEMAP_DOORS` tras `/junk-removal` → **20 URLs**; la homepage lo enlaza en el footer (bloque de puertas, `footTree` EN/ES). Pins de tests actualizados (sitemap apex + www + byte-idéntico v97, explore v111) y dos aserciones nuevas v114 para la puerta.

## Pago (payFull) — NO aplicado a nivel servicio, a propósito
`payFull` en este codebase es una bandera de **carrito** (la pone el builder/admin al crear el carrito, v100/v101), NO de servicio: ningún servicio del catálogo la fuerza. Inventar ese flujo nuevo quedó fuera. Los combos viajan con el split estándar de depósito ($50 plano ≤$300 → small cobra $50 de depósito; medium $299 → $50; premium $499 → 40% = $199.60). Si Gabriel quiere cobro completo al ordenar, la ruta existente es armar el carrito desde el builder con el toggle payFull — sin tocar código.

## Pruebas
- Suite completa: **PASS 2123 / FAIL 0**, dos corridas (copia en /tmp/ghs-v17-test con APP_DIR apuntando al árbol fusion).
- `app/data.json` NO viaja en el push.

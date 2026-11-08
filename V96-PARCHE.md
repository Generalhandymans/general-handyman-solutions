# V96-PARCHE — AUDITORÍA COMPLETA DE TEMA Y BUGS (Gabriel: «Revisa todo que esté con la misma temática… Tómate tu tiempo y revisa por bugs»)

**Base:** v95 (servicio de compra de materiales $15 + 3%, commit e9eb758 — sin tocar) sobre v94 (abae162).
**Alcance:** SOLO presentación (valores de estilo) + pines de prueba. Ningún texto, ruta, precio, handler ni lógica cambió. Los textos EN/ES de las páginas convertidas quedaron byte-idénticos.
**Ritual:** SW cache `ghs-app-v96`.
**Nota de secuencia:** existe un build hermano (worktree `~/workspace/ghs-app-v96`, commit ec9a374, sobre v93) que acotó la garantía de primer plano a `#authBox`/`#resetBox` y oscureció `#joinChargeNote` y `#hcPromo` con la llave `#1c0e11`. Este paquete cubre el encargo completo (todas las superficies + páginas del servidor); donde se solapa con el hermano —`#joinChargeNote` idéntico; `#hcPromo` en `#17171b` aquí vs `#1c0e11` allá— la diferencia es cosmética y reconciliable al publicar. Su bloque acotado de garantía es compatible con este parche si se quiere cinturón y tirantes.

---

## 1. EL VEREDICTO DEL LOGIN (la queja: «el login se ve en blanco»)

La afirmación de un análisis paralelo —tokens de superficie oscuros pero `--ink` sin voltear, con encabezados/etiquetas de la hoja de autenticación en casi-negro sobre la tarjeta oscura— quedó **REFUTADA para la hoja de autenticación propiamente dicha**, verificado por cascada en el archivo servido (el `index.html` vivo es byte-idéntico al del repo, blob `fe893b1a…`):

- v89 fijó `body{background:#0a0a0c;color:#e8e8ea}` DIRECTAMENTE (no vía `--ink`).
- `.card` → `background:var(--panel-2)` = **#17171b**.
- `#authBox h3` y `label` no fijan color → heredan **#e8e8ea sobre #17171b ≈ 13:1**. Legible.
- Pestañas: la regla base `#authBox .tabs{background:#f0eee9}` (línea ~353) la vence la regla v89 posterior de igual especificidad `#authBox .tabs{background:#101013;border-color:var(--line-d)}`; el texto de pestaña pasa a #e8e8ea y la pestaña activa lleva el degradado rojo de marca con texto #fff.
- Las 10 apariciones de `color:var(--ink)` en todo el archivo son reglas base y TODAS tienen su override v89 posterior.
- Inputs/selects/options oscuros por v89 (`color-scheme:dark`), Stripe Payment Element en tema `night`, primera pintura oscura (estilo crítico en línea), manifest `background_color:#0a0a0c`.

**El ÚNICO elemento claro DENTRO de la hoja de autenticación** era `#joinChargeNote` (fondo `#fff5f5` con texto `.mut` #a49d93 ≈ 2.4:1) — aparece en el flujo de unirse a una membresía desde la propia hoja de login/registro. Es el candidato real a «se ve blanco» dentro del login, y quedó corregido (abajo). La otra explicación viva es la caché del dispositivo de Gabriel: la misma service-worker que le ocultó la suspensión de Render puede servirle una cáscara vieja; con v96 la caché se invalida sola al actualizar.

## 2. SUPERFICIES AUDITADAS — index.html (SPA)

Verificado pantalla por pantalla: home/vitrina (bloques v80.9 + `#oldhome`, totalmente oscuros), menú y tarjetas, cajón del carrito, checkout (v86), hoja de autenticación, cuenta y propuestas, zona del trabajador (v87), admin (v90), vista de capitán («Mi área» usa `.card`/`.mut`/`.pill` — oscura por cascada ✓), modales/capas, toasts (`#cartToast` pastilla oscura ✓), selects y controles nativos (oscuros por v89 ✓), primera pintura ✓, manifiesto ✓, referencias de imágenes (las 102 de `menu-img/`, iconos, `ba/`, `old/` — todas existen ✓).

### Defectos CONFIRMADOS y CORREGIDOS (estilos inline que vencían a la hoja v89)

| # | Elemento | Antes | Ahora |
|---|----------|-------|-------|
| F1 | `#joinChargeNote` (¡dentro de la hoja de auth!) | `background:#fff5f5`, texto .mut ≈2.4:1 | `background:#1c0e11` (tinte rojo oscuro v89) |
| F2 | `#hcChargeNote` (cuenta) | `background:#fff5f5` | `background:#1c0e11` |
| F3 | `#hcPromo` (promo HomeCare a no-miembros) | `background:#fff5f5`, el `<b>` hereda #e8e8ea → **claro-sobre-claro ≈1.2:1** | `background:#17171b` |
| F4 | `#membershipAddressBox` (página de membresías) | clase card + inline `#fff5f5` → **claro-sobre-claro severo** | `background:#17171b` |
| F5 | `#permCard` (activar notificaciones/ubicación; visible para TODA cuenta sin permisos) | `background:#fff8e6`, borde #f5a623, divisores #f0dcae, texto heredado claro → **severo** | `background:#221a05;border:#6b5518`, divisores `#6b5518` (llave ámbar oscura v89/v91) |
| F6 | Tarjeta de cuota del estimado en el wizard de solicitud | `background:#faf9f7` (el viejo `--soft`), texto heredado claro → **severo** | `background:#17171b` |
| F7 | `#cartPayErr` (error de pago en checkout) | `background:#fef2f2;color:#b91c1c` — legible pero superficie CLARA rompiendo el tema | llave de error oscura v89: `#2a0d10 / #7a2027 / #ff9aa2` |

### Familia CONFIRMADA y CORREGIDA — verde de tema claro como TEXTO sobre oscuro

`#16a34a` (≈3.4–3.9:1 sobre los paneles) → **`#2fbf71`** (el verde de marca ya asentado, var(--green)) en: reglas CSS `.cart-members-pay/.cart-members-total/.cart-member-save` y cadenas JS de las filas de ahorro/miembro del checkout (dentro de la tarjeta `.cart-due-card` #141414), la etiqueta «booked» de propuestas, el diff de la piscina de autorizaciones, la píldora de estado de Stripe en admin (`color` y `border-color` `#1a7f37`→`#2fbf71`) y la línea «✅ Confirmed» de horarios en admin. Los botones/píldoras VERDES SÓLIDOS con texto blanco (#1a7f37 de fondo) NO se tocaron: son legibles y son color-significado. Los pines históricos v80.3/v80.4 que fijaban el #16a34a (con justificación de la era de tema claro) se actualizaron a la par, con la razón anotada en su propio texto.

### Intencional — NO son bugs (verificado)

`#memberLoginBtn` pastilla blanca sobre el header negro (botón invertido deliberado); el punto activo del hero fotográfico en #fff; `.pick button.sel` / `.seg button.on` oscuros con texto #fff; la tarjeta «entrega hecha» verde oscuro #0b2013.

### Sospechas REFUTADAS en index.html

- Toda regla base clara de los bloques de estilo (#f0eee9, #fdf3d7, #fff8e6, #fff1f0, #fff7f7, #e8e4de…) tiene override v89 posterior — censo completo de hex claros hecho.
- Botones «Today/Tomorrow/ASAP» del checkout con `data-w`: NO les faltan claves — el repintado del cliente (ccPaint) los traduce vía `ccToday/ccTomorrow`, y «ASAP» es el préstamo que la propia app usa en su diccionario ES.
- Las 109 claves `data-w` del HTML existen en los diccionarios; los 188 handlers `onclick` del archivo resuelven a funciones definidas (cero botones muertos por vía estática).
- La píldora de estado «On my way» (fondo #0b0b0b, texto #fff, en el bloque v87) es legible — solo se anota como el eslabón visual más débil de la fila de estados.

## 3. PÁGINAS DEL SERVIDOR (app/server.js)

| Página | Estado previo | v96 |
|---|---|---|
| `cartPageHtml` | Oscura (v91) — verificado, sin tocar | = |
| `invitePageHtml` (`/join/INV-…`) | **CLARA** (cuerpo #fff sin fondo, texto #111, paneles #eef7ee/#fff8e6, inputs blancos #ccc, etiquetas #444, error #b00020) | **CONVERTIDA** a la cáscara oscura de v91: primera pintura #0a0a0c, panel #17171b/#2a2a31, inputs #1b1b1f/#33333b/#e8e8ea, «how» en llave verde oscura, cancelado en llave ámbar oscura, encabezados de miembro #2fbf71, error #ff9aa2, radio exterior 20px |
| `estimatePageHtml` (`/estimate/…`) | **CLARA** (misma familia) | **CONVERTIDA**: cáscara oscura, tarjetas de opción oscuras (seleccionada #1c0e11, no seleccionada #1b1b1f), caja de miembro y avisos en verde oscuro, panel de vencido en llave de error oscura, bloque de aprobar en #101013, inputs oscuros, botón Decline oscuro (el botón Approve conserva su verde sólido legible), precios de miembro #2fbf71 |
| `estimatePayPanelHtml` (panel «Tu pago» del estimado) | **CLARO** (#fff8e6/#ecd28f) | **CONVERTIDO** a la llave ámbar oscura; su botón de autorizar pasa a rojo de marca |
| `invoicePageHtml` (`/invoice/…`) | **CLARA** (propinas #fafafa/#fff, badges claros, agenda #f7f7f7, campos blancos) | **CONVERTIDA**: cáscara oscura, badges de estado en llaves oscuras (pagada #0b2013/#2fbf71, sin pagar/vencida #2a0d10/#ff9aa2, cancelada #26262a), panel y botones de propina oscuros con seleccionado en rojo de marca, bloque de agenda #101013 con campos oscuros + `color-scheme:dark` |
| `installPageHtml` (`/instalar`) | Se asumía clara — **REFUTADO: ya era oscura** (#0a0a0c/#141416) | sin tocar |
| `payResultPageHtml` | **Ya oscura** (misma familia) | sin tocar |
| `workerBlockedPage` | **Ya oscura** (#0b0b0f/#f4f4f5) | sin tocar |
| 404 del carrito | Oscuro (v91) | = |
| robots.txt / sitemap.xml / BingSiteAuth.xml + meta msvalidate.01 | Íntegros (pines v92/v93 siguen pasando) | = |

**Correos (mailShell y plantillas):** claros por convención del correo (cuerpo blanco, banda negra, CTA rojo) — rinden sanos en los clientes de correo; NO se forzaron. Única nota cosmética: el rojo del CTA de correo es `#d92323`, no el `#e42535` de marca (reportado, sin tocar).

## 4. SWEEP DE BUGS FUNCIONALES (más allá del tema)

- Service worker: red-primero para documentos, caché-primero para estáticos, API nunca cacheada, cross-origin nunca interceptado — sano; el único riesgo conocido es la cáscara cacheada en dispositivos (se resuelve con este bump a v96).
- Sin botones muertos detectables estáticamente (188/188 handlers definidos); sin referencias de imagen rotas; totales mostrados no se tocaron (ninguna línea de lógica cambió — el diff de server.js es 100% tokens de estilo, verificado línea por línea).
- **v95 pickup (auditoría ligera, sin reescribir): CORRECTO contra su spec** — flag solo con delta positivo, nunca en travel, 3% solo sobre el delta de ESTE ajuste, líneas selladas kind pickup/processing fuera del descuento de miembro, EN/ES en página y toggle admin. Dos notas menores: (a) el mensaje del hilo de la orden con el detalle del pickup va solo en inglés — pero coincide con la convención existente de esos mensajes (travel/materials también van en inglés); (b) un ajuste de materiales menor a ~17¢ generaría una línea de procesamiento de $0.00 — cosmético e irreal en la práctica.

## 5. REPORTADO — NO TOCADO (para después, decisión de Gabriel)

1. **Login en el dispositivo de Gabriel:** a nivel de archivo el login ES oscuro; si tras v96 (cierre total y reapertura) sigue viéndose claro, toca cazarlo con captura de su equipo — puede ser la cáscara cacheada. (El build hermano ec9a374 añade una garantía acotada a #authBox/#resetBox por si se quiere blindaje extra.)
2. Radio base `.card` = 14px vs el lenguaje asentado de 20px en las superficies reestilizadas (account/admin/misceláneos) — inconsistencia menor; cambiarlo es global y se dejó fuera de este parche quirúrgico.
3. Pie de `#oldhome`: `.ft-small` #77736c a 12.5px sobre #0a0a0c ≈4:1 — menor.
4. Rojo del CTA de correos #d92323 vs marca #e42535.
5. Píldora «On my way» negra sobre paneles oscuros: legible (texto blanco) pero visualmente la más débil de la fila de estados del trabajador.

## 6. PINES v96

- 2 pines de caché actualizados (v95→v96) + 2 pines verdes históricos (v80.3/v80.4) actualizados al nuevo verde + 6 estáticos nuevos: supervivientes claros del index eliminados con sus llaves oscuras presentes · familia verde de marca · veredicto auth fijado (las reglas v89 intactas) · rebanadas de invite/estimate/payPanel/invoice con llaves oscuras presentes y hex claros ausentes · install/payResult/workerBlocked ya-oscuros fijados.
- 1 bloque en vivo: la página de invitación, la de estimado ($700.00 byte-intacto) y la factura que nace al aprobarlo se renderizan oscuras en vivo con sus textos intactos.

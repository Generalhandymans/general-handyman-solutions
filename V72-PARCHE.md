# v72 — LIMPIEZA APROBADA (las 29 propuestas + las ideas)

**Qué es:** la implementación completa de `PROPUESTA-LIMPIEZA-LOGIN-WORKER.md`, aprobada por Gabriel en pleno el 2026-10-25 ("Apruebo las 29 propuestas + las ideas"). Cada número se re-verificó contra el árbol actual (post-v71) antes de tocarlo. Suite: **843/843 PASS**. SW: `ghs-app-v72`. **Sin push — espera revisión.**

**Guardarraíles respetados:** la tarjeta de permisos (v64) y el botón de rescate (v63) intactos; la barra inferior de la app intacta; precios y textos de pago exactos (la única excepción es W-6, que corrige el website para que diga lo que la política ya manda); en L-1 se quitó el CAMPO del formulario, nunca el dato guardado ni su lectura en admin; los valores que envían los formularios siguen canónicos.

---

## ZONA L — LOGIN Y TÉCNICO

- **L-1 — Habilidades pedidas 3 veces → 1.** Fuera del formulario de aplicación: el auto-rating 1–10 por oficio (`#wSelfRate`), junto con sus funciones. La aplicación ahora pide los oficios (con nivel 1–5 de v41) y nada más. El dato histórico `selfRatings` sigue guardado y el admin lo sigue mostrando ("self X/10") en el detalle del trabajador.
- **L-2 — Transporte.** Fuera el campo `#wTransport` de la aplicación (se pisaba con lo que ya declara el técnico en su perfil). Ya no se envía en el registro.
- **L-3 — Tools level.** Fuera el select `#wTools` (tercera vez que se preguntaba por herramientas; quedan las banderas de herramientas por oficio).
- **L-4 — Una sola puerta de técnico.** Eliminada la fila pequeña "Are you a technician?" (`#workerLinkRow`) de la tarjeta de login: queda SOLO el botón grande **🔨 Technician sign in** (decisión consciente marcada en la propuesta: el test v59 que pineaba la fila se actualizó a v72 y ahora verifica que la fila NO existe y el botón sí).
- **L-5 — Una sola nota de cobro en join.** En modo `join` ya no salen dos notas: `#hcChargeNote` solo aparece en modo `homecare`; en join manda únicamente la nota dinámica con el total real.
- **L-6 — Forgot vs. rescate.** En la cara de técnico, "Forgot my password" ya no aparece (el botón de rescate hace exactamente lo mismo y es el camino bueno); en la cara de cliente sigue igual. **El botón de rescate no se tocó.**
- **L-7 — Los trabajos arriba.** Dentro del panel del técnico, la lista de trabajos (`#jobList` + banner de viaje) ahora va ANTES del perfil, "Mi dinero" y el resto: el técnico abre su panel y ve sus jales, no su papeleo.
- **L-8 — Texto de ayuda del login.** El HTML estático bajo el login ahora dice exactamente lo mismo que pone el JS en la cara de cliente (sin cuenta para cotizar; cuenta para seguir trabajos, pagar facturas y HomeCare) — ya no hay un párrafo viejo contradiciendo al que carga después.
- **L-9 — Nota "email + password only".** Esa nota es de la cara de cliente: en la entrada de técnico se oculta. La tarjeta de rescate conserva su propio texto.
- **L-10 — Nombres de la zona técnico.** ✅ **Ya satisfecho por v71 — verificado, sin cambios:** el nombre es uno solo en todo el flujo ("New technician application" en pestaña y en los textos EN/ES), y todo el texto visible pasa por el diccionario `W_I18N`.
- **L-12 — Tarjeta de permisos.** ✅ **Ya satisfecha por v71 — verificado, sin cambios:** todos sus textos pasan por `WT()`/data-w en ambos idiomas desde v71. La tarjeta en sí no se tocó (es load-bearing, v64).
- **L-13 — Salida si el rescate falla.** Nueva línea bajo el botón de rescate, en ambos idiomas: *"No access to that email anymore? Call or text the Team: (707) 862-3773"* / *"¿Ya no tienes acceso a ese correo? Llama o textea al Team: (707) 862-3773"* — el técnico nunca queda sin salida visible.

## ZONA W — WEBSITE (`index.html`, raíz)

- **W-1 — Barra demo fuera.** Eliminada la barra fija "Sample order · TV Mounting + 2 extras · View · $250 →" y su CSS. Ningún script dependía de ella (verificado 2× en la propuesta).
- **W-2 — Enlaces a páginas maqueta fuera.** El footer ya no enlaza a `checkout.html` ni `tracking.html`. Los archivos quedan en el repo por ahora (ver Hallazgos extra #3).
- **W-3 — Reseñas de relleno + nota interna.** La sección "⭐ Neighbors approve" quedó **oculta** (`display:none`, marcada `data-v72`) hasta que haya reseñas reales (I-2) — no se inventó ninguna reseña. La nota interna del footer ("Sample reviews are placeholders… / Every card image is custom-created…") salió del texto público; el pie conserva solo precios de la lista maestra y "Materials are customer-supplied unless noted." (con su traducción ES actualizada).
- **W-4 — Membresías una sola vez.** Eliminada la franja duplicada de 4 cajas (`.members`); la venta canónica de planes vive en la sección de membresías de la misma página.
- **W-5 — "See all →" que apuntaban a sí mismos.** Fuera los 5 enlaces (Popular, Carpintería, Electricidad, Plomería, Mecánica).
- **W-6 — El pago se dice como es.** El paso 3 de "How ordering works" ya no dice "You pay at the end": ahora **"Pay in full when you order — Menu orders are paid up front. Estimates and custom carts: 40% books it, 60% at completion."**, con su traducción ES en el diccionario. La política no cambió; el website por fin la cuenta igual que la app.
- **W-7 — Contenedor vacío `.cats`.** Eliminado el bloque completo (no rendía nada visible) y su llamada muerta `wire('.cats .cat')`.
- **W-8 — La garantía, una vez y fuerte.** "30-day workmanship guarantee" vive SOLO en la barra de confianza; salió de la línea de estrellas del hero y del pie.
- **W-9 — "Order again" honesto.** La sección se llama ahora **"⭐ Neighbors' favorites"** ("The services Solano orders again and again") — sin fingir un historial personal que un visitante público no tiene.
- *Efecto total: la página bajó de 2.05 MB a 1.98 MB solo con la limpieza.*

## ZONA C — APP, LADO CLIENTE

- **C-1 — Toggle EN|ES global del shell de cliente.** ⏳ **Programado, no construido** (la propia propuesta lo escalonó DESPUÉS de v71): es el candidato natural a **v73** — ver Hallazgos extra #7.
- **C-2 — Dos campanas confundibles.** El botón de sonido del header ahora usa 🔊/🔇 (altavoz), distinto de la campana 🔔 de notificaciones: dos iconos, dos significados.
- **C-3 — Doble marca apilada.** El header ya no repite el nombre en texto ("General Handyman Solutions" en negrita) — el banner con logo que va justo arriba ya lo trae; el header quedó limpio y alineado a la derecha.
- **C-4 — "Member Log in" duplicado.** El botón del header ahora se oculta automáticamente cuando la tarjeta de login/membresía está visible en pantalla (IntersectionObserver) o cuando ya hay sesión — ya no hay dos caminos al mismo sitio uno encima del otro.

## ZONA P — PÁGINAS DEL SERVIDOR

- **P-1 — Pago recibido / cancelado con marca.** `/payment/success` y `/payment/cancelled` ya no son páginas blancas genéricas: plantilla oscura de marca con el martillo, botón de regreso a la app, toggle EN|ES (`?lang=`), y el texto nombra lo que el cliente acaba de hacer — depósito apartado (saldo al terminar), membresía activa (primer estimado en persona gratis) u orden/estimado asegurado.
- **P-2 — Instalar: tu plataforma primero.** `/instalar` ordena las tarjetas según el teléfono del visitante (iPhone → iOS primero; los demás → Android primero; "otro navegador" al final). La elección de idioma por `?lang=` se mantiene.

## ZONA A — ADMIN

- **A-1 — Tarjetas de trabajador compactas.** Cada trabajador se lee de un vistazo: foto, nombre, contacto, estado, pagos, ciudad y sus 3 mejores oficios (★). Todo el detalle (perfil completo, ratings, oficios editables) vive tras un botón **"Ver detalle ▾"** por tarjeta — nada se borró, solo se plegó.
- **A-2 — Índice del panel.** Barra de atajos bajo el título del panel (Calendario, Solicitudes, Carritos, Trabajadores, Capitanes, Crear trabajo, Trabajos, Ratings, Facturas) que baja directo a cada sección.
- **A-3 — Ayuda corta en "Create a job".** El texto bajo el buscador de servicio quedó en una línea: *"Escribe el servicio — aquí salen los mejores para ese oficio."*

## IDEAS

- **I-1 — Fotos reales before/after.** Soporte de código: listo (la app ya captura fotos de trabajos y visitas; el website ya tiene la sección). Falta solo el contenido: fotos reales con permiso del cliente. *No es código — es recolección.*
- **I-2 — Reseñas reales desde la app.** Soporte de código: listo (la app ya recoge `workerRating` por trabajo). La sección del website queda oculta desde W-3 hasta que las primeras reseñas reales se publiquen — cerrar W-3 para siempre depende de operar, no de programar.
- **I-3 — "Meet your technician" real.** La sección existe en el website; falta elegir 2–3 técnicos reales (foto + oficios + ★ desde su perfil de la app). *Decisión de Gabriel: quiénes salen.*
- **I-4 — Velocidad del website.** Evaluado: el peso viene de imágenes base64 incrustadas. La limpieza bajó 2.05 → 1.98 MB; el arreglo completo (extraer imágenes a archivos + lazy-load) es su propio proyecto porque cambia el set de archivos del despliegue — queda en Hallazgos extra #4.
- **I-5 — Partir la SPA por zona.** Solo nota (arquitectura): la app sigue en un archivo; partir cliente/técnico/admin es un proyecto mayor, no una limpieza.
- **I-6 — Un solo texto de pago.** ✅ La redacción canónica quedó alineada en las superficies vivas: website (W-6), menú de la app ("you pay in full when you order"), carrito y estimado (40% aparta / 60% al terminar). Residual conocido: la cláusula 4 del borrador de Términos — Hallazgos extra #8.
- **I-7 — Contraste de textos `.mut`.** La variable `--panel-mut` subió de `#a49d93` a `#b5aea2` — los textos secundarios sobre fondo oscuro se leen mejor al sol.

## PRINCIPIO CUSTOMER-FIRST (nota de Gabriel durante la construcción)

La cara por defecto de la app es del CLIENTE; lo de técnico solo aparece por la puerta de técnico (/tecnico, #worker, pestaña de aplicación). Revisión de sangrado aplicada junto con L-4/L-9. Dos casos evaluados y **conservados a propósito**: el botón grande "Technician sign in" en la tarjeta compartida (decisión v59 de Gabriel — es LA puerta, visible a propósito) y el enlace "Work with us — technicians" del footer del website (lleva a la puerta `#worker`, que es el patrón correcto). No se encontró otro sangrado en la cara de cliente.

## PRUEBAS

- Test v59 actualizado (L-4): la fila pequeña ya no existe; el botón grande sigue.
- Test v43 actualizado (W-1): la barra demo ya no existe en el website.
- Bloque nuevo v72 (estático + runtime): L-1/2/3, L-5/6/9, L-7, L-8/13, C-2/3/4, A-1/2/3, P-1/2, W completo, y runtime de `/payment/success` (EN/ES), `/payment/cancelled` e `/instalar` por UA.
- **Suite completa: 843/843 PASS · 0 FAIL.**

---

## Hallazgos extra (para aprobación) — NO construidos

1. **El website no recuerda el idioma.** *Dónde:* toggle EN/ES de `index.html`. *Problema:* la elección no persiste (cada visita arranca en inglés) y hay secciones sin traducir ("Before & after", etc.), según la auditoría de idioma. *Propuesta:* persistir con localStorage + completar el diccionario. *Impacto:* el tráfico de la promo cae aquí; un visitante hispano no debería re-elegir idioma en cada visita.
2. **Las ★★★★★ del hero y "Rated by your neighbors" implican reseñas que aún no son públicas.** *Dónde:* hero + barra de confianza del website. *Problema:* con W-3 la sección de reseñas quedó oculta, pero las estrellas siguen prometiendo una calificación sin fuente visible. *Propuesta:* al publicar las primeras reseñas reales (I-2), amarrar las estrellas a ese promedio real; mientras tanto, opción de suavizar a "Trabajos garantizados por 30 días". *Impacto:* coherencia de confianza — la página solo promete lo que puede probar.
3. **`checkout.html`, `tracking.html` y `service.html` siguen vivos por URL directa.** *Dónde:* raíz del repo. *Problema:* W-2 quitó los enlaces, pero quien tenga la URL (o un buscador) llega a páginas maqueta con checkout falso y botón "simulate". *Propuesta:* borrarlas o redirigirlas a la app. *Impacto:* cero clientes en páginas falsas.
4. **I-4 completo: imágenes del website como archivos + lazy-load.** *Dónde:* `index.html` (1.98 MB hoy). *Problema:* las imágenes van incrustadas en base64; en datos móviles la primera carga es lenta y cara. *Propuesta:* extraer a archivos servidos con `loading="lazy"` bajo el fold — recorta la carga inicial a una fracción. *Impacto:* más visitas que llegan a ver el menú completo.
5. **La página pública de factura sigue en inglés fijo.** *Dónde:* página SSR de invoice. *Problema:* tras P-1 es la última página pública sin marca bilingüe completa. *Propuesta:* aplicarle la misma plantilla de P-1 con EN|ES. *Impacto:* consistencia para el cliente que paga su factura.
6. **Llaves de idioma separadas por página** (`ghsCartLang`, `ghsEstLang`, `ghsMenuLang`, `ghsWorkerLang`). *Problema:* el cliente que eligió español en el carrito puede caer en inglés en el estimado. *Propuesta:* una sola llave compartida para todo lo del cliente. *Impacto:* el idioma elegido sigue al cliente en todo el flujo.
7. **C-1 como v73: EN|ES global en el shell de cliente de la app.** *Problema:* es el hueco de idioma más grande que queda (el shell mezcla EN con fragmentos ES y no tiene toggle global). *Propuesta:* construirlo como versión propia, igual que v71 hizo con la zona técnico. *Impacto:* la app completa en un idioma a la vez, como manda la regla de idioma.
8. **Cláusula 4 del borrador de Términos quedó pre-v62.** *Problema:* no refleja la política 40/60 vigente. *Propuesta:* actualizar el texto legal con la redacción canónica de I-6. *Impacto:* el documento legal dice lo mismo que la app cobra.
9. **IDs duplicados en el calendario del admin** (`cService`/`cCity` aparecen dos veces). *Problema:* HTML inválido, cosmético hoy, frágil mañana. *Propuesta:* renombrar el par duplicado. *Impacto:* higiene interna del panel.

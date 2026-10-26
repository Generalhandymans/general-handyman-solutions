# V77 — Login de cliente arreglado: cuenta gratis sin membresía + diseño de aplicación

**Fecha:** 2026-10-25 · **Base:** v76 (commit 5f8e61f) · **Suite:** 905/905 PASS (881 base + 24 aserciones nuevas v77; 3 pines viejos re-escritos en su lugar, 0 removidos)
**Archivos:** `app/public/index.html`, `app/public/sw.js` (CACHE `ghs-app-v77`), `tests/run.mjs`, este parche.
**Estado:** árbol listo, SIN push — espera el visto bueno de Gabriel. La prueba visual final es en su teléfono.

---

## 1. Los problemas que cazó Gabriel (antes → después)

### Problema 1 — "New customer" obligaba a comprar un plan
**Antes:** la pestaña *New customer* mostraba el selector CHOOSE YOUR PLAN, el banner "Joining HomeCare — $29/mo…" y el botón rojo "Create account & continue — $29/mo". No existía forma de registrarse sin plan. Peor: la forma enseñaba de entrada los campos de membresía (dirección de servicio, tipo de casa, tamaño de yarda, fecha de inicio) — por eso se miraba como "una forma larga de página web".
**Después:** *New customer* es una forma limpia de cuenta: nombre, email, teléfono, contraseña y botón **"Create account"** (sin precio). Sin selector de plan, sin banner, sin campos de membresía, sin caja promo de HomeCare encima. El servidor ya creaba la cuenta sin suscripción (verificado: `homeCareStatus: 'none'`, sin plan activo) y el cliente cae DENTRO de su cuenta, sin checkout.

### La precisión de Gabriel (21:24) — membresía OPCIONAL dentro del registro
No es presión: debajo de los datos de la cuenta va una sección claramente marcada **"⭐ Optional — add a membership & save"** con el selector en **"Just my free account — no membership"** por defecto.
- Si no toca nada → cuenta gratis, cero superficie de pago (probado: el submit no llama NINGÚN endpoint de Stripe).
- Si elige un plan → aparecen ENTONCES los campos de membresía (dirección, tipo de casa, tamaño de yarda, inicio) y al enviar, el flujo sigue al checkout de ESE plan por los mismos rieles del member-join (incluye el **mes gratis de HomeCare de la v74**). El botón sigue sin precio; la nota bajo el selector explica el paso ("…then straight to secure checkout — no charge until you confirm there").
La pestaña *New member — join a plan* y los deep links (#join-yard1, etc.) quedan como la ruta directa, intactos.

### Problema 2 — La pantalla de auth se miraba como forma web fea
**Después:** tarjeta de auth con grado de aplicación (ver §4, sistema de diseño): banda de marca negra con el logo de la app y el nombre en mayúsculas con "Handyman" en rojo, pestañas segmentadas tipo app (pastilla oscura, la activa en negro), inputs con más aire y foco con anillo rojo suave, UN solo botón primario rojo por vista (pastilla de 54px con sombra de marca), acciones secundarias como links tranquilos, transiciones suaves y estados `:active`/foco cuidados.

### Problema 3 — El botón gigante de técnico en el login de cliente
**Antes:** pastilla negra enorme "🔨 Technician sign in" bajo el login del cliente.
**Después:** link chico y discreto — **"Are you a technician? Sign in →"** — al pie de la tarjeta, en gris, que se tiñe rojo al pasar el cursor. Misma ruta de siempre (`#worker`). Dentro de la entrada de técnico el link se oculta (la tarjeta de activación grande de la v63/v64 sigue siendo la protagonista ahí, intacta). CUSTOMER-FIRST cumplido.

---

## 2. Bugs encontrados ejerciendo el member-join de punta a punta (y su arreglo)

Ejercicio hecho en el harness de la suite: cambio de pestañas, selector de planes (los 5 planes re-precian nota/botón/etiqueta de tarjeta juntos — verificado uno por uno), campos, submit → cuenta → checkout, fallback sin Stripe y el trial v74.

- **BUG 1 — Campos de membresía en el registro plano.** `serviceAddressRow`, `homeGroup` y `startGroup` se renderizaban visibles en modo customer: la forma "larga y fea" de la captura. **Arreglo:** esos campos solo viven en member-join, o en el registro plano CUANDO el cliente eligió un plan en la sección opcional.
- **BUG 2 — El plan armado se pegaba a "New customer" (el bug de la captura).** Si un join caía al fallback (Stripe caído) o quedaba un plan armado, la pestaña New customer heredaba selector + banner + botón con precio, sin salida a registro plano. **Arreglo:** tocar *New customer* ahora pasa por `plainSignupTab()`: limpia el plan armado, resetea el selector opcional a "sin membresía" y entra a la forma limpia. (El deep link y la pestaña member siguen armando el plan, como debe ser.)
- **BUG 3 — El fallback de HomeCare no vendía el mes gratis.** La nota del fallback decía solo "$29/mo… straight to secure checkout" — contradecía la v74. **Arreglo:** la nota ahora incluye "Your first month is FREE — $0 at checkout today, then $29/mo (one free month per account)."
- **BUG 4 — Doble submit en el botón de auth.** `doAuth()` no tenía guarda de re-entrada: un doble toque disparaba un segundo registro (error 409 "email already registered") o un segundo intento de cobro. **Arreglo:** guarda `authBusy` (se libera en `finally`).

**Verificado NO-bug (para que conste):** el signup del servidor crea cliente plano sin suscripción; los rieles del selector de planes (v35) re-precian todo junto; HomeCare siempre va por `homecare-subscribe` y nunca por `membership-subscribe`; los deep links de Yard/Plus arman su plan; `pubUser` expone `homeCareStatus` y `membershipPlan` correctamente.

---

## 3. Qué se tocó fuera de la tarjeta de auth

- `syncAuthPriceTexts()`: la caja promo de HomeCare ya no se monta sobre el registro plano (antes solo se ocultaba en member-join).
- `applyWorkerEntry()`: ahora esconde/muestra el link discreto de técnico (antes la pastilla gigante).
- `doAuth()`: guarda anti doble-submit + el armado del plan opcional (reusa el resume existente: `startMembershipCheckout` / fallback inline; la puerta de dirección existente aplica igual que en member-join).
- Nada de lógica de flujos cambió fuera de eso: login, rescate de contraseña (v63, probado: `#reset=` abre la caja y el renglón "Forgot your password?" sigue en el login), prompts de login de carrito/estimado (reusan esta misma UI) y la zona de técnico/admin no se rediseñaron.

---

## 4. SISTEMA DE DISEÑO OFICIAL — "GHS Premium" (base del rediseño total)

Este sistema es la **fuente única de verdad visual** de la app de cliente desde v77. Las versiones siguientes lo EXTENDERÁN pantalla por pantalla (rediseño total ordenado por Gabriel 2026-10-25 21:29); no se inventan estilos por pantalla: todo sale de estos tokens y componentes.

### 4.1 Unificación website ↔ app (orden de Gabriel: "que las dos sean juntas")
Los tokens se derivaron de la presentación REAL de la website (generalhandymans.app), no de un gusto nuevo: superficies oscuras de sus tarjetas/secciones, su rojo de marca, su logo ancho de header y el look de las seis cajas de la tienda. El cliente que cruza de la website a la app no cambia de producto: mismo negro, mismo rojo, misma tipografía pesada en titulares.

### 4.2 Tokens (variables CSS en `:root` de `app/public/index.html`)

| Token | Valor | Uso |
|---|---|---|
| `--red` | `#e42535` | Rojo de marca (el de la website): botones primarios, acentos, precios de acción |
| `--red-hi` | `#ff4655` | Extremo claro del degradado primario / highlights |
| `--red-dk` | `#c21725` | Extremo oscuro del degradado primario |
| `--ink` | `#141519` | Texto principal sobre claro / superficies oscuras base |
| `--ink-w` | `#e8e8ea` | Texto principal sobre oscuro (paleta website) |
| `--panel-2` | `#17171b` | Superficie oscura 2 (website) |
| `--panel-3` | `#1b1b1f` | Superficie oscura 3 (website) |
| `--line-d` | `#2a2a31` | Bordes sobre oscuro (website) |
| `--amber` | `#ffb800` | Acentos cálidos (estrellas/avisos) — website |
| `--green` | `#2fbf71` | Éxito / WhatsApp / confirmar |
| `--r-lg / --r-md / --r-sm` | `18px / 12px / 10px` | Radios: tarjetas / controles / chips |
| `--sh-card` | `0 10px 30px rgba(16,18,22,.10), 0 2px 6px rgba(16,18,22,.06)` | Sombra estándar de tarjeta |
| `--sh-btn` | `0 8px 20px rgba(228,37,53,.30)` | Sombra del botón primario (resplandor de marca) |
| `--sh-pop` | `0 18px 50px rgba(10,10,14,.28)` | Popovers / elementos flotantes |
| `--ring` | `0 0 0 3px rgba(228,37,53,.16)` | Anillo de foco accesible en rojo suave |

### 4.3 Componentes compartidos (clases/reglas globales — se heredan solos)

- **Botón primario** (`button` por defecto): degradado `--red-hi → --red → --red-dk`, radio 12, sombra `--sh-btn`, micro-escala al presionar (feedback táctil de app). Variantes existentes conservadas: `.ghost` (contorno, sin sombra) y `.black` (sin resplandor rojo).
- **Inputs/selects/textarea**: radio 12, transición de borde/sombra, foco con borde de marca + `--ring`. Nada de inputs "de navegador".
- **Tarjetas** (`.card`): radio `--r-lg` + `--sh-card`.
- **Header de página**: borde inferior rojo de 3px + sombra — la firma que comparte con la franja de la website.
- **Pestañas segmentadas** (`#authBox .tabs`): pastilla gris redondeada, botón activo en negro — control de app, no links de web.
- **Píldora flotante inferior** (Call/Text/WhatsApp): sombras profundas por capa (la barra se despega del contenido).
- **`.auth-hero`**: banda de marca de la tarjeta de auth (negro degradado, borde rojo, logo 48px redondeado, nombre en mayúsculas con acento rojo, tagline con los tres oficios + "Solano County").
- **`.auth-offer`**: panel de oferta SIN presión — fondo rojo 4%, borde punteado rojo suave; para ofertas opcionales (membresía en el registro; reusable en otras ofertas futuras).

### 4.4 Qué hereda el nuevo look SIN tocar la pantalla
Toda pantalla de cliente construida con los componentes compartidos: **inicio del cliente y wizard de solicitud, menú de servicios, checkout de orden (#order), membresías, tarjetas del dashboard** — botones, inputs, tarjetas y header ya se ven del sistema nuevo en cuanto la versión suba.

### 4.5 Lo que necesita pase por pantalla (propuesta para las siguientes versiones, en orden de visibilidad del cliente)
1. Inicio del cliente (hero + accesos) — la primera cara tras el login.
2. Menú de servicios (tarjetas de servicio con foto al sistema).
3. Mis órdenes / tracking (tarjetas de estado y mapa).
4. Membresías dentro de la cuenta (venta interna de planes con `.auth-offer`).
5. Checkout de orden y pantallas de pago.
6. Perfil y ajustes.
(El carrito virtual estilo Amazon ya es su propia versión — v78 — y nacerá SOBRE este sistema. Zona de técnico y admin quedan fuera: son herramientas de trabajo.)

---

## 5. Pruebas nuevas (bloque v77 en `tests/run.mjs`)

- Servidor: el signup plano nace con `homeCareStatus 'none'` y sin membresía activa.
- VM: pestaña plana sin selector/banner/tarjeta/campos de membresía; selector opcional visible y en "sin membresía"; botón sin precio; promo oculta; link de técnico presente y pastilla gigante ausente del DOM.
- VM: el plan armado por fallback NO sobrevive el toque a *New customer*.
- VM: con plan opcional elegido → campos aparecen, nota con precio, y el submit llama `/api/stripe/checkout` con ese plan (sin tocar los rieles inline); sin plan → signup+login con CERO llamadas a `/api/stripe/`.
- VM: ejercicio del member-join con los 5 planes (nota/botón/etiqueta con el precio correcto) + nota de HomeCare con el mes gratis v74.
- VM: rescate intacto (renglón de olvido en login + `#reset=` abre la caja de reset).
- Pines estáticos v77: link discreto, pastilla ausente, selector opcional, tokens del sistema; SW en `ghs-app-v77`.

**Resultado: 905/905 PASS.**

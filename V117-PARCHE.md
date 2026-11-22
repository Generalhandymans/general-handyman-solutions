# V117-PARCHE — /tree LIMPIA: solo los tres combos con sus add-ons de $15

**Orden de Gabriel (2026-11-22, textual):** "En la seccion de tree solo
pon los tres combos con sus add ons de 15" — la página /tree muestra
SOLO los tres combos de árbol con sus add-ons de $15. Nada más.

## La página, antes → después

La puerta conserva el patrón v104 (server-rendered, tema oscuro de
marca, rojo #e42535, logo de la gorra, toggle EN|ES, mobile-first) y
queda con esta estructura exacta, por idioma:

1. **Header slim** — logo + toggle EN|ES (como estaba) y el título de
   página como único encabezado: "Christmas Tree Combos" /
   "Combos de Árbol de Navidad".
2. **Las tres tarjetas de combo, intactas de v116** (foto, specs,
   precio, deep-link de orden): Basic $199 · Medium $299 · Premium
   $499 — árbol + base + entrega + instalación, sin promesa de luces
   incluidas en ninguna parte.
3. **UNA sola línea compacta de términos** bajo los combos (EN+ES):
   "Deliveries Fri–Sun · Photo of your tree for approval before we buy
   it · While stock lasts." / "Entregas de viernes a domingo · Foto de
   tu árbol para tu aprobación antes de comprarlo · Hasta agotar
   existencias." (Se queda porque es parte de la oferta del combo.)
4. **La sección de add-ons, intacta de v116**: instalación de luces
   +$15 por tira · decoración completa +$15 por paquete, EN+ES.
5. **Footer estándar** (link a la app, REPORTING FOR DUTY, teléfono,
   since-2020) — sin cambios.

## Lo que se quitó

- El bloque hero por idioma: badge, el H1 de pitch ("Your Tree,
  Delivered & Set Up" / "Tu Árbol, Entregado e Instalado"), el párrafo
  de venta y la **foto hero** (la foto del Medium vive en su tarjeta;
  la página queda más rápida: 245 → 185 líneas, ~81 KB menos por
  idioma al no cargar la imagen hero).
- La nota bajo el hero ("Pick your combo below…" / "Elige tu combo
  abajo…") y el CTA hero del Medium.
- La tarjeta **"How it works / Cómo funciona"** (los 4 pasos).
- La tarjeta **"Where we work / Dónde trabajamos"** (ciudades + el
  link cruzado a holiday-lights de $215).
- El fineprint viejo bajo los combos (precio plano / sin descuento de
  miembro) — reemplazado por la línea compacta de términos.
- Los CTA de cierre ("Order your tree combo in the app" + estimado
  gratis por foto %%ESTIMATE%%) y la fila de links (reseñas
  %%REVIEW%%, ver todos los servicios, llamada).
- El CSS muerto de todo lo anterior (.badge, .sub, .plan-img,
  .form-note, .steps/.step/.step-badge, .links, .cta.alt).

No se tocó: precios, add-ons, carrito, checkout, ninguna otra página,
ningún deep-link de orden (%%JOIN%%/%%JOIN2%%/%%JOIN3%% siguen en las
tarjetas). Caché SW → `ghs-app-v117` (patrón de la casa; los 8 pins de
la suite actualizados).

## Tests — PASS 2156 / FAIL 0, dos veces

Suite completa corrida dos veces desde copia scratch en /tmp con
APP_DIR apuntando a este repo: **PASS 2156 / FAIL 0** en ambas corridas
(2,153 de v116 + 3 nuevos de v117). Los 3 de v117 fijan la puerta
nueva: título slim EN+ES + las 3 tarjetas + ambos add-ons a $15; la
línea única de términos EN+ES; y la ausencia total de todo lo quitado
(how-it-works, where-we-work, step-badge, plan-img, el pitch hero,
%%ESTIMATE%%/%%REVIEW%%, el link a holiday-lights). Las pruebas de
v114/v116 sobre la puerta siguen verdes sin cambios (las tarjetas y la
sección de add-ons quedaron byte-idénticas).

## Archivos del parche

`app/public/landings/tree.html` · `app/public/sw.js` ·
`tests/run.mjs` · `V117-PARCHE.md` (este). `app/data.json` NO viaja,
como siempre.

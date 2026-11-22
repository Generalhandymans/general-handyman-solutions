# V116-PARCHE — add-ons POR PAQUETE a $15: luces fuera de los combos + decoración unificada

**Orden de Gabriel (2026-11-22, precio de su hermano):** colgar las luces
del cliente YA NO viene incluido en ningún combo de árbol. Instalar las
luces es un add-on pagado **POR PAQUETE: $15 por tira/paquete de luces
instalado**. Y la regla de $15 por paquete aplica a TODO: el add-on de
decoración completa TAMBIÉN pasa a **$15 por paquete de decoraciones
instalado**, reemplazando los precios planos por combo de v114
($75/$100/$150). El cliente pone SIEMPRE las luces y las decoraciones;
GHS solo instala/decora (mano de obra). Los combos quedan: árbol + base
+ entrega + instalación, nada más. Precios de combo y payFull (v115) no
se tocan.

## El mecanismo: add-ons con CANTIDAD (nuevo en el codebase)

Hasta v115 todo add-on era un checkbox (se cobra una vez). v116 crea la
noción de **add-on por paquete**, acotada a los dos add-ons de los
combos:

- **Servidor (`app/server.js`)** — `ADDON_QTY_MAX = { 'tree-lights': 20,
  'tree-decorating': 20 }` + `addonQtyFor(aid, rawQty)`: el tope vive
  fuera del catálogo (mismo patrón que `PAYFULL_SERVICE_IDS` de v115).
  `serverMenuTotals` acepta entradas de add-on como string (`'tree-lights'`
  = 1 paquete, compatibilidad total) u objeto (`{id, qty}`); un add-on
  por paquete aporta `precio × cantidad` a la suma (y a la suma nodisc —
  ambos son nodisc); el extra resultante lleva su `qty` para que cada
  superficie muestre el conteo honesto. Una cantidad enviada para un
  add-on checkbox normal se IGNORA (se cuenta una vez, como siempre).
  `serverCartTotals` parsea las entradas estructuradas y deduplica por
  id. El flujo `menuOrder` de `/api/requests` pasa la cantidad igual y
  la guarda en los extras de la orden. `recoverySnapshot` conserva los
  conteos en la forma SPA (`xq`). El texto de cotización del asistente
  imprime el precio extendido si una cantidad viajara (el asistente no
  vende combos; es corrección defensiva).
- **Cliente (`app/public/app.js`)** — espejo `ADDON_QTY_MAX` +
  `addonQtyOf` / `cartAddonsPayload` / `applyAddonQty`. El conteo vive
  en el ítem del carrito como `it.xq[addonId]`. `cartCalc` multiplica
  unidad × paquetes (ambos add-ons son nodisc: sin descuento de miembro,
  como los combos). En la vista del carrito Y en la tarjeta de checkout,
  un add-on por paquete elegido muestra su precio extendido y un
  **stepper −/+**; si el combo está en el carrito sin el add-on, una
  chip "+ …" lo agrega con 1 paquete. Tocar de nuevo la chip del menú
  (`pairAdd`) suma un PAQUETE, nunca una segunda línea de combo.
  `cartQuoteItems` y `cartBuildPayload` envían `{id, qty}` para los
  add-ons por paquete (el servidor recalcula todo desde su propio
  catálogo y su propio tope — el conteo del cliente nunca se confía).
  Los snapshots recuperables conservan `xq` (`cartNormalizeSnapshot` y
  la firma de comparación).

## Catálogo (ambos lados, idéntico)

Los tres combos llevan ahora los mismos dos add-ons:

| add-on | Precio | Nombre en el carrito (EN, textual) |
|---|---|---|
| `tree-lights` | **$15 por tira** | "Add lights installation — we hang your lights, $15 per strand (lights not included)" |
| `tree-decorating` | **$15 por paquete** | "Add full decorating — we decorate your tree your way, $15 per package (you supply the decorations)" |

(Los nombres de add-on van solo en EN en todo el codebase — sin canal
ES; la frase ES vive en el meta de la tarjeta, como en v114.)

## Luces fuera del contenido incluido — todas las superficies

- `app.js` `MENU_CATALOG`: los metas de Medium/Premium ya no dicen
  "We hang your lights…" / "Your lights installed: tree + entryway";
  los tres metas cierran igual: "…Delivered & installed · Fri–Sun ·
  + lights & decorating add-ons at $15 per package".
- `MENU_ES`: fuera "Colgamos TUS luces en el árbol" e "Instalación de
  tus luces: árbol y entrada"; los tres cierran "…+ add-ons de luces y
  decoración a $15 por paquete (tú pones las luces y las decoraciones)".
- `app/public/landings/tree.html` (EN+ES): las tarjetas Medium/Premium
  pierden la línea de luces y la nota de precio vuelve a "tree + stand
  + delivery + setup"; la sección de add-ons presenta AMBOS add-ons a
  **$15 por paquete** (+$15 per strand / +$15 per package · +$15 por
  tira / +$15 por paquete); el paso 4 ya no condiciona las luces al
  combo ("plus any add-ons you picked" / "más los add-ons que
  elegiste"); hero y fineprint alineados.
- Landings derivadas regeneradas con `tools/gen-landings-v109.mjs`
  (10 archivos: electrical + 8 de ciudad con los metas nuevos;
  mobile-mechanic trae además la fila de frenos $125 de v113 que la
  copia local aún no traía — sincronización, sin cambios de precio).
- `MASTER-SERVICE-LIST.md`: las filas Medium/Premium ya no prometen
  luces; la tabla de add-ons reemplaza las 3 filas planas de decoración
  por 6 filas a $15 por paquete (3 de luces + 3 de decoración) con la
  nota v116 de la regla unificada.

## Cuánto se cobra ahora (verificado por tests, total del carrito, todo payFull)

| Carrito | Hoy | Saldo |
|---|---|---|
| Medium $299 | **$299** | $0 |
| Medium + 4 tiras de luces (4 × $15) | **$359** | $0 |
| Medium + 4 tiras + 3 paquetes de decoración (3 × $15) | **$404** | $0 |
| Basic + decoración (forma string clásica = 1 paquete) | **$214** | $0 |
| Medium + 99 tiras pedidas → tope 20 | **$599** | $0 |
| TV mounting + raceway con qty 5 (regresión) | $225 total, depósito $50 | $175 |

## Tests — PASS 2153 / FAIL 0, dos veces

Suite completa corrida dos veces desde copia scratch en /tmp con
APP_DIR apuntando a este repo: **PASS 2153 / FAIL 0** en ambas corridas
(2,140 de v115 + 13 nuevos de v116; los montos de 3 pruebas de v115 que
usaban la decoración plana se actualizaron a la nueva tarifa: Basic+
decoración $274→$214, Premium+decoración $649→$514, Medium+decoración
hosted $399→$314 — el comportamiento payFull que prueban no cambia).
Los 13 de v116 cubren: estáticos del mecanismo (tope + helper + ambos
add-ons a $15 en los 3 combos, espejo SPA con steppers); ausencia total
de luces como contenido incluido (metas EN/ES y tarjetas /tree);
la puerta /tree con ambos add-ons a $15 por paquete EN+ES y ninguno de
los precios planos viejos; auto-servicio embebido — Medium solo $299,
Medium + 4 tiras $359 con el PaymentIntent por $359.00, Medium + 4
tiras + 3 paquetes $404 con la orden naciendo PAGADA; comportamiento
de cantidad (la forma string clásica = 1 paquete → $214; 99 tiras se
recortan al tope de 20 → $599); regresión (qty en un add-on checkbox se
ignora: TV + raceway = $225 con su depósito de $50 intacto); y hosted
(Medium + 4 tiras, sesión de $359.00). Pins actualizados por la nueva
forma: conteo de add-ons del catálogo 25→28 (v80.28), `ADDONS43`,
`PAIR_EXP28`, `NAME_TO_ID43`, el pin de la puerta v114, el test de
add-ons v114, el parser de add-ons de la auditoría v46 (tolera el nuevo
campo `qty: true`) y el caché SW → `ghs-app-v116`.

## Archivos del parche

`app/server.js` · `app/public/app.js` · `app/public/sw.js` ·
`app/public/landings/tree.html` + 10 landings regeneradas ·
`MASTER-SERVICE-LIST.md` · `tests/run.mjs` · `V116-PARCHE.md` (este).
`app/data.json` NO viaja, como siempre.

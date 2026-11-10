# v100 — COBRAR TODO POR ADELANTADO (payFull: el carrito de materiales cobra TODO, sin depósito)

Orden de Gabriel (2026-11-09, caso Ernest Salinas): «cuando mando
cotizaciones con materiales, el cliente paga los materiales COMPLETOS
por adelantado MÁS el depósito del trabajo». La mitad depósito ya
vivía en la ley v62/v79; la mitad materiales quedaba imposible en un
solo link: la página del carrito solo ofrecía «Pay deposit $754» sobre
el carrito de materiales de $1,885. Esta versión le da a cada carrito
del admin una bandera `payFull` — el carrito cobra TODO hoy, sin
split de depósito.

## La bandera

- `c.payFull` (boolean, default ausente/falso) en el registro del
  carrito. Se guarda al crear (`POST /api/admin/carts`,
  `payFull: b.payFull === true`) y se edita con el mismo PUT de
  siempre (`if (b.payFull !== undefined) …`) — el PUT ya expira las
  sesiones de Checkout vivas, así que nadie paga un split viejo tras
  voltear la bandera. `publicCart` la expone (`payFull: !!c.payFull`).

## El split: UN solo ayudante nuevo, la ley intacta

- `cartSplit(c, totalCents)` en server.js es el ÚNICO split que un
  carrito del admin usa: con `payFull` devuelve
  `{ depositCents: total, balanceCents: 0 }`; sin ella delega a
  `depositSplit` byte a byte. `depositSplit` NO se tocó: sigue siendo
  la ley ($50 plano ≤ $300, 40% arriba) para estimados y para el
  checkout self-serve, que jamás ven la bandera.
- Puntos migrados a `cartSplit` (solo carritos del admin): el checkout
  `/api/carts/:id/checkout` (rama simple y rama join), la página
  pública, `proposalsForUser` (la propuesta dentro de la cuenta del
  cliente) y los dos correos de recordatorio de Seguimiento.

## Página pública del carrito (payFull)

- Fila de cobro: etiqueta nueva «Due today — full payment» / «Hoy —
  pago completo» (`dueFullLabel`) con el TOTAL completo; la fila de
  balance NO se emite (el script cliente ya toleraba su ausencia).
- Botón único: «Pay $1,885.00» / «Pagar $1,885.00» (`payFullBtn`) —
  la misma llave T() de siempre, elegida por la bandera `PAY_FULL`
  que la página emite junto a DEP_/BAL_ (BAL_* = 0).
- Una sola computación `cartSplit` alimenta filas, botón y variables
  cliente — la página no puede discrepar del checkout.
- Textos honestos en AMBOS idiomas (regla EN|ES): `refundLineFull`
  (este carrito cobra todo por adelantado, sin saldo) y las tres
  notas de unión `joinOrderNoteFull / …FullYard / …FullFree` (sin la
  palabra «depósito» donde no hay depósito). El precio de miembro se
  sigue computando por clase de línea: materiales nunca descuentan
  ($1,885 = $1,885), labor sí.

## Checkout y liquidación: el MISMO camino sellado

- Rama simple: sesión `cart-order` por el total completo con
  `payStep: 'full'` (la etiqueta de Stripe dice «paid in full»), y el
  sello `c.pendingDeposit = { totalCents, depositCents: total,
  balanceCents: 0, memberApplied }` — el formato de siempre.
- Rama join (unirse + pagar desde el mismo link): el split sellado
  es el total completo; la sesión de suscripción cobra plan + total
  hoy, y `settleCartPayment` convierte con balance = total − total
  = 0 por la resta de siempre.
- `settleCartPayment` NO se tocó. La liquidación entra por su rama
  `pendingDeposit` de centavos exactos y `convertCartToRequest`
  clasifica el pago como NO-depósito (su `isDeposit` exige
  balance > 0), así que la orden nace PAGADA COMPLETA por el grabador
  de siempre (`recordRequestPayment`) — cero rutas paralelas.
- El sello anti-doble-cobro no se dispara en falso: al convertir,
  `convertCartToRequest` estampa en `c.payment` el `depositPi` de la
  pierna y un `balanceCents: 0` explícito — SOLO cuando el pago
  sellado fue due=total/balance=0. Las llegadas gemelas del MISMO
  pago (retorno + webhook de sesión + webhook de PI) quedan
  reconocidas por las exclusiones `depositPi` de v80.5/v94 que ya
  existían, y como el balance es 0 (nunca > 0) ninguna puerta de
  saldo puede abrirse, ajustarse ni sellarse contra este carrito:
  un intento de cobro de saldo responde «already paid». Un PI
  DISTINTO que aterrice sobre el carrito pagado sí levanta la
  alerta v94 (balance en libros $0.00) — plata inesperada, ruidosa,
  nunca silenciosa.
- El self-heal v94 no cambia: solo sana saldos vivos
  (`balanceCents > 0`); un carrito payFull no tiene saldo que sanar
  y su primer pago convierte desde 'open' por retorno o webhooks.

## Admin

- Builder y edición: checkbox «Charge in full upfront (no deposit) /
  Cobrar todo por adelantado (sin depósito)» (`#cartPayFull`) junto
  al idioma del carrito; create y save mandan `payFull`, la edición
  lo refleja desde el carrito, cancelar edición lo apaga.
- Lista de carritos: `depFor90` ahora recibe el carrito — una
  propuesta payFull dormida muestra «full payment to book $TOTAL»
  (el mismo número que ve el cliente) y la suma de «deposits to
  collect» lo incluye por su total.
- Matiz conocido (fuera de alcance, anotado): el cuerpo del correo de
  recordatorio dice «depósito» en su frase de contexto; el MONTO que
  muestra ya es el total correcto vía cartSplit.

## Verificación

- Suite: **1869 ×2, FAIL 0** (1850 de v99 + 19 pines netos nuevos:
  5 estáticos v100 + 14 conductuales v100; los 2 pines de caché se
  actualizaron en sitio a v100, sin cambiar el conteo).
  Dos pines viejos rozaron el diff y se resolvieron SIN debilitarlos:
  el pin v44 (`T("payBtn")`) se conserva con el ternario
  `(PAY_FULL?T("payFullBtn"):T("payBtn"))`, y la frase prohibida por
  v80-7A («You pay the full total today») se evitó redactando
  `refundLineFull` de otra forma.
- Fixtures de regresión = los dos carritos VIVOS de Ernest, cifra por
  cifra: trabajo CRT-…84B4D1 ($3,675 / dep $1,470 / saldo $2,205 /
  miembro $3,040) intacto sin bandera; materiales ($1,885 en 5
  líneas) con la bandera muestra $1,885 debido completo.
- Corrida local (app real, puerto scratch): crear ambos carritos,
  la página de materiales muestra «Due today — full payment
  $1885.00», botón «Pay $1885.00», sin fila de saldo; en español
  «Hoy — pago completo» / «Pagar $1885.00»; la del trabajo sigue
  $1,470/$2,205.
- SW cache ghs-app-v100.

## Lo que NO hace esta versión

- NO enciende la bandera en el carrito vivo de materiales de Ernest
  (CRT-B1E4392D03C3F234BD): producción vive en Supabase, inaccesible
  desde la VM. Al publicarse, Gabriel edita ese carrito en su admin,
  marca el toggle y guarda — el link no cambia.
- Sin publicar — el padre publica.

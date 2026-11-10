# v101 — LA AUDITORÍA COMPLETA, ARREGLADA (fundación: cero bugs conocidos en dinero/checkout)

Orden de Gabriel (2026-11-09): rechequeo masivo final de la app
(privacidad, books, funcionalidad, código) y arreglar TODO en el orden
de la auditoría antes de montar cualquier cosa nueva — «el robot
amplifica lo que toque». Fuentes: `AUDITORIA-V100-CODIGO.md`
(4 ALTA · 24 MEDIA · ~25 BAJA), `AUDITORIA-V100-FRENTE1.md` (H1–H5) y
`AUDITORIA-V100-VIVO.md`. Cada hallazgo corregido ganó pins en la
suite; los 4 ALTA no tenían cobertura y ahora la tienen.

**La ley del dinero NO se tocó:** `depositSplit`, el −20% de miembro
(solo labor, nunca materiales), el ASAP +25%, el guardrail de $1,000 /
margen 20%, el take de 68% y el comportamiento `payFull` producen
exactamente los mismos resultados — los fixtures de Ernest lo prueban
en cada corrida (trabajo $3,675 / depósito $1,470 / saldo $2,205;
materiales $1,885 payFull).

## Ola 1 — XSS, la raíz (ALTA-1, ALTA-2, M21, M22)

- `isPhotoDataUrl` ahora es ESTRUCTURAL: solo
  `data:image/(png|jpe?g|gif|webp);base64,…` con charset base64 puro y
  tope de 5,000,000 caracteres. Nada con comillas, `onerror` o SVG
  entra — ni por solicitudes, ni por visitas de yarda, ni por
  estimados. Los sinks de la SPA escapan con `escAttr`.
- `jsonScript()`: todo JSON interpolado en `<script>` de las páginas
  del servidor escapa `<`, `>`, `&` — un nombre de cliente con
  `</script>` ya no rompe la página del estimado.

## Ola 2 — ALTA-3: el teléfono ya no es llave de propiedad

El acceso del cliente a SUS trabajos cuelga de su CUENTA
(`job.customerId`, estampado al despachar desde la solicitud o por el
admin), nunca de su número de teléfono. Registrarse con el teléfono
de otro cliente ya no expone trabajos, mensajes, ratings ni la
ubicación en vivo del técnico. El teléfono se sigue guardando como
dato; jamás como credencial.

## Ola 3 — M14: técnico dado de baja pierde sus sesiones

Al pasar un técnico a `review`/`notfit` se invalidan sus sesiones
(igual que al borrarlo), y un técnico no-activo no puede avanzar un
trabajo ni con login fresco.

## Ola 4 — M6: pagos a técnicos sin doble-pago posible

La bandera anti-doble-pago se levanta ANTES del `await` con Stripe, y
cada transferencia (trabajo y bounty) lleva `Idempotency-Key` propia
por día — una respuesta perdida reintenta contra la MISMA
transferencia, no crea otra.

## Ola 5 — La familia «verdad en webhooks» (M2, M3, M4, M5, M8)

- Registro de eventos por `event.id`: un webhook re-entregado no
  duplica registros ni correos (M5).
- Nada se activa sin pago probado: membresías, facturas y estimados
  exigen `payment_status` pagado en `checkout.session.completed`;
  `checkout.session.async_payment_failed` alerta y revierte la
  activación ligada a esa suscripción (M4).
- Una factura solo se salda con sesión vigente + monto exacto +
  estado pagado; editar su total retira la sesión viva anterior —
  una sesión de $500 jamás salda una factura editada a $800 (M2).
- Los rieles PaymentIntent aplican la misma verificación de monto
  que sus gemelos (carritos y órdenes de menú) (M3).
- `charge.refunded` deja asiento en el ledger: factura pagada +
  reembolso total → `refunded`; parcial → sello sin bajar el estado;
  membresía → ledger + alerta, sin cancelación automática (M8).

## Ola 6 — M9 + M10: la prueba gratis no se farmea

Borrar la cuenta deja una TUMBA de prueba por email: re-registrarse
con el mismo correo nace sin elegibilidad al mes gratis. Signup y
login canonicalizan el email (`trim` + minúsculas).

## Ola 7 — M24: la nube manda

Si la carga desde Supabase falla al arrancar, `save()` se NIEGA a
empujar el estado local sobre el bueno en la nube (escribe solo el
archivo local), el bloqueo es visible en el reporte de dinero
(`system`), y existe override de admin auditado
(`POST /api/admin/cloud-gate/override`). Todo fallo de `save()` —
nube o local — queda registrado como `db.saveError` visible, no solo
en consola.

## Ola 8 — El resto de las MEDIA

- **ALTA-4 / M13:** el IP del cliente se deriva del salto DERECHO de
  `X-Forwarded-For` (el único confiable tras el edge de Render; lo
  demás es decoración falsificable) y el proto seguro igual — el
  freno de login y el presupuesto de misses ya no se evaden rotando
  encabezados. Supuesto documentado en el código: un solo proxy
  confiable.
- **M11 / M15 / M16:** login y forgot pagan el mismo costo con
  cuentas inexistentes (scrypt dummy + pausa) — sin oráculo de
  tiempo; el reset tiene tope también por IP (20/h).
- **M12:** tope de 50 sesiones vivas por cuenta (las más viejas se
  podan; el reset sigue invalidando todas).
- **M18 / M19 / M20:** frenos anti-inundación + topes de campo en
  solicitudes anónimas, signup y creación de sesiones de checkout
  (los frenos sensibles — login, member-check, reset — quedan
  apretados; estos son topes de inundación).
- **M23:** el tope por foto (5M caracteres, máx. 6 por envío) se
  aplica en TODAS las entradas desde la ola 1. La arquitectura de
  estado-en-un-blob no cambia en esta versión.
- **M17:** los IDs legados de 24 bits SIGUEN resolviendo (hay links
  vivos en los libros) pero cada uso queda auditado
  (`public.legacy_link_use`) y protegido por el presupuesto de
  misses ya no evadible.
- **M7:** un reembolso sobre una orden ya pagada al técnico crea
  asientos de REVERSO en el ledger (`reversal_due`: pago del técnico,
  overrides de capitán revertidos) visibles en el reporte de dinero.
  Nada se cobra de vuelta automáticamente — Gabriel decide.
- **M1:** el descuento por email en el checkout NO cambia (es la
  conducta de producto que Gabriel quiere); solo se le puso freno al
  oráculo de member-check (30/10 min por IP).
- Reparación latente: la ola 6 había dejado `/api/auth/forgot`
  devolviendo 500 (llamaba un limitador inexistente); la ola 8 lo
  define y la ruta quedó probada de punta a punta.

## Ola 9 — Books y visual (H1, H4 + banderas de la auditoría en vivo)

- **H1:** la página pública del carrito ya NO pre-llena el teléfono
  del cliente desde el registro (el nombre sí se queda). Un link
  reenviado ya no regala el número.
- **Contadores honestos:** el reporte de dinero gana la sección
  `collected` — cobrado real del mes y de siempre (órdenes +
  facturas + carritos pagados sin convertir, con depósitos y saldos
  atribuidos al mes en que cayeron). La página Dinero lo muestra en
  su propia tarjeta. Antes solo se veía lo ADEUDADO y los contadores
  leían $0.00 en meses con trabajo pagado.
- **Roster de miembros:** `GET /api/admin/members` + tarjeta en el
  admin — nombre, plan, estado (incluye `trialing`) y próximo cargo,
  desde el estado que la app ya guarda.
- **Invitaciones sin duplicados:** la lista se deduplica por persona
  (gana la fila aceptada) y cada fila trae `memberNow`, el estado
  vivo de su membresía.
- **Jerarquía de planes:** la página de membresías abre con HomeCare
  Plus $100 y su insignia ⭐ BEST (como la portada); FREE va al final.
- **H4:** el recordatorio de Seguimiento de un carrito `payFull`
  dice «pago completo / full payment», nunca «depósito» (EN/ES,
  HTML y texto).

## Ola 10 — La tanda BAJA (las claras)

Sweeps después del chequeo de rol en `GET /api/jobs` (BAJA-1) ·
404/403 unificados en los dos PATCH — sin oráculo de existencia,
el técnico asignado conserva su 403 honesto (BAJA-2) · `checkPw`
paga scrypt siempre, también con valores guardados malformados
(BAJA-3) · intentos de reset con tope por IP y auditoría de fallos
(BAJA-5) · tumba permanente de bootstrap: borrar la cuenta admin ya
no reabre `/api/setup-admin` (BAJA-6) · reemplazar un carrito
guardado exige su token de recuperación — el cliente web lo guarda
y lo presenta (BAJA-8) · el puntero de retorno de holds es
primero-que-escribe-gana (BAJA-9) · un pago foráneo de CUALQUIER
monto sobre un saldo sellado ahora alerta, no cae en silencio
(BAJA-12) · footer de `mailShell` escapado (BAJA-20) · mensajes con
freno por usuario y tope de 500 por hilo (BAJA-21) · topes de 100
líneas en los normalizadores de estimados/facturas (BAJA-22) ·
etiqueta de payout escapada en la SPA (BAJA-23, parcial) ·
escrituras locales atómicas tmp+rename (BAJA-24).

## Quedó para Gabriel (decisiones, no código)

- **BAJA-7** — las descargas de backup/snapshot incluyen los hashes
  de contraseña de todas las cuentas. Quitarlos protege contra un
  backup compartido sin cuidado, pero un backup sin credenciales no
  sirve para restaurar accesos: es juicio de riesgo tuyo.
- **BAJA-17** — quien tuvo Yard/Plus y nunca usó el mes gratis de
  HomeCare puede tomarlo al cambiar de plan. ¿Es lo querido («nunca
  usó SU mes gratis») o se cierra? Producto.
- **BAJA-10** — los IDs de invitación son de 40 bits. Subirlos
  rompe los links de invitación ya enviados; con el presupuesto de
  misses ya no evadible, el riesgo práctico es bajo.
- **BAJA-11** — los endpoints del dueño devuelven el registro crudo
  de SU propia solicitud (sin datos de otros clientes). Formar una
  vista recortada es defensa en profundidad con riesgo de regresión
  en la SPA; no hay fuga entre clientes.
- **BAJA-15** — «Pay worker now» con force puede pagar un trabajo
  standalone sin pago del cliente: es tu override manual, solo-admin
  y auditado. ¿Se le pone confirmación de monto?
- **BAJA-16** — si el total final de un trabajo vendido es ilegible,
  el take cae al `payOffer` + $10 en vez del 68%. Caso borde de
  dinero: tu llamada.
- **BAJA-18** — la vinculación de plan en checkout hosted confía en
  la metadata de la sesión (los rieles inline sí verifican el precio
  contra la suscripción). Riesgo aceptado hoy.
- **BAJA-19** — el parser de la firma de Stripe es permisivo en la
  forma; la criptografía (HMAC + tiempo constante + tolerancia) es
  sólida y sin el secreto no hay explotación.
- **BAJA-4** — los limitadores viven en memoria del proceso: un
  reinicio perdona los presupuestos (trade-off v1 documentado en el
  código). Persistirlos es decisión de arquitectura.
- **BAJA-25** — hay snapshots diarias descargables pero no endpoint
  de restauración: recuperar es reemplazar el estado a mano.
- **BAJA-26** — la base ASAP de miembro en estimados asume el 20%
  cableado; en todos los caminos reales el descuento ES 20%.
- **BAJA-13 / BAJA-14** — footguns internos solo-admin, verificados
  sin vector de cliente (los llamantes son disciplinados).
- **M23 (arquitectura)** — el estado completo se re-sube en cada
  `save()`; el tope por foto ya está puesto. Partir el estado es
  proyecto aparte, no parche.

## Verificación

Suite completa dos veces seguidas al cierre: **PASS 1955 / FAIL 0**
en ambas corridas (base v100: 1869 — las olas 1–10 sumaron 86 pins
nuevos, uno o más por cada hallazgo corregido).
Service worker: `ghs-app-v101`. Nada de esto toca datos de
producción; la publicación sigue el flujo de siempre.

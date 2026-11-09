# v99 — LA RESEÑA DE GOOGLE SE ENCIENDE SOLA (default oficial + candado B2B)

Orden de Gabriel (2026-11-08, "Arregla todo" / modo mayorista). Alcance
final: SOLO Feature A. La Feature B (concreto al menú) fue CANCELADA por
Gabriel antes de tocarse — este diff no contiene ningún cambio de menú,
ningún servicio nuevo, ninguna imagen nueva (verificado: `git diff`
toca solo server.js, app.js, sw.js y tests/run.mjs).

## El problema

El mecanismo de Seguimiento v80.15 (invitación de reseña de Google al
llegar a Paid in full) llevaba dormido desde su nacimiento: disparaba
solo si Gabriel pegaba su link en Admin → Sistema
(`db.settings.googleReviewUrl`), y ese campo nunca se llenó. Ningún
cliente recibió jamás la invitación.

## Feature A — activación con default integrado

- Nueva constante en server.js:
  `DEFAULT_GOOGLE_REVIEW_URL = 'https://g.page/r/Ce0oW03tmveIEBM/review'`
  (el link oficial de reseñas de GHS).
- `googleReviewUrl()` ahora devuelve: el valor de Sistema si no está
  vacío; si está vacío, el default integrado. El override del admin
  sigue mandando; borrar el campo vuelve al default — la invitación
  nunca más queda apagada en silencio.
- El health de Sistema (`GET /api/admin/system`) reporta el link
  efectivo, así Gabriel VE la activación (con el campo vacío reporta
  el oficial).
- Textos actualizados para que nadie lea "vacío = apagado": el error
  de validación del endpoint de settings, la nota de auditoría al
  borrar el campo ("built-in default applies") y el hint de la sección
  Sistema en el panel admin (EN + ES).

## Auditoría del gatillo — regla FINAL de Gabriel (2026-11-08)

Regla: la invitación sale a miembros Y clientes normales POR IGUAL;
NUNCA a compañías de factura/despacho (tipo Spartan/Bestfix/Blackstone).

Hallazgos:
1. **Miembros vs normales: ya era igualitario.** El camino
   `maybeAskGoogleReview` jamás tuvo puerta de membresía — dispara
   para cualquier orden pagada por completo con customerId o correo.
   v99 lo deja fijado con un pin conductual (miembro cobra → recibe la
   invitación, idéntico al cliente normal).
2. **B2B: NO existe bandera de compañía** — ni en usuarios ni en
   requests (búsqueda exhaustiva: sin `accountType`, sin `isCompany`,
   sin referencias a las compañías en el código). Una compañía de
   factura existe ÚNICAMENTE como registros en `db.invoices`, y sus
   pagos corren por los rieles de factura (`settleInvoiceFromSession`,
   mark-paid), que disparan `invoice_paid` (un gracias SIN link de
   reseña) y NUNCA llaman a `maybeAskGoogleReview`. Los únicos puentes
   de una factura a un request son `inv.requestId` e
   `inv.jobId → job.requestId` — el mismo enlace que ya usa
   `jobPaidForReview`.
3. **El hueco real:** un request con una factura enlazada que además se
   pagara por el riel de requests sí habría recibido la invitación.
   v99 lo cierra con `isInvoiceBilledRequest(r)`: si cualquier factura
   no cancelada apunta al request (directo o vía su job), la
   invitación no sale — sin sello `reviewAskedAt` (la exclusión es por
   el enlace, no un "ya se preguntó"), sin correo, sin nota en la app.
   NO se bloqueó por correo/cuenta: las facturas también son la
   herramienta normal de cobro a clientes regulares, y bloquear por
   "tiene alguna factura" castigaría a clientes normales, violando la
   mitad "por igual" de la regla.

## Pines (suite completa: 1850 PASS / 0 FAIL, dos corridas)

- Estáticos: default oficial + fallback en `googleReviewUrl()` +
  guardia B2B cableada en la invitación; hint EN/ES sin el "vacío =
  apagado"; SW `ghs-app-v99` (2 pines de caché actualizados).
- Conductuales (app4, fixtures sembrados): sin nada en Sistema, el
  link OFICIAL dispara la invitación (health lo reporta, 1 correo con
  el default, sello + nota); con link del admin, el OVERRIDE gana;
  el webhook gemelo no re-pregunta; el saldo (segunda puerta de pago
  completo) dispara igual; un MIEMBRO pagado recibe la invitación como
  cualquier cliente; dos órdenes de compañía de factura (una enlazada
  por requestId, otra por jobId) pagan por completo con CERO
  invitación, cero sello, cero correo.
- Nota de conteo: la bandeja mock es global a la suite — con el
  default encendido, fixtures de secciones anteriores que pagan por
  completo también generan su invitación; los conteos de v99 se
  acotaron POR DESTINATARIO para no contaminarse.
- La prueba v80.15 vieja ("sin link = silencio") fue reemplazada por
  la semántica v99; el resto de v80.15 (settings admin-only +
  validación URL + override) quedó intacto.

## Sin cambios

Menú, precios confirmados, guardrail de $1,000, margen 20%, tema
oscuro, matemática de depósitos/saldos, sellos v80.5 y auto-reparación
v94: intactos. SW cache `ghs-app-v99`.

# V71 — EN | ES en TODA la zona del técnico (login + dashboard)

**Orden de Gabriel (2026-10-25):** la parte del técnico estaba en inglés
mezclado — "Mis oficios / My trades", un botón en español junto a otro en
inglés — y eso no va con la regla de la casa: **una sola lengua a la vez**,
como el Menú y como la página del carrito. La zona del técnico ahora tiene
su propio toggle **EN | ES**, visible en los DOS lugares que pidió:

1. **La pantalla de login del técnico** (la tarjeta de auth en modo
   trabajador, antes de entrar — con la pestaña "New technician
   application" y todo el formulario de aplicación).
2. **Adentro, ya logueado** (el dashboard `#workerBox` completo).

## Cómo funciona

- Diccionario `W_I18N {en, es}` + helper `WT(key)`, espejo del patrón del
  Menú (`MENU_UI`/`menuLang`). La elección se guarda en
  `localStorage 'ghsWorkerLang'`.
- **Default:** español cuando se entra por la puerta del técnico
  (`/tecnico` deja la marca `ghs_entry='worker'`), inglés en cualquier
  otro caso — y la elección guardada del trabajador siempre gana.
- **Toggle** (mismo estilo `.menu-lang` del Menú): arriba de la tarjeta
  de login del técnico (`#workerLangRowA`, visible en la entrada de
  técnico o con la pestaña de aplicación abierta) y arriba del dashboard
  (`#workerLangEnW/#workerLangEsW`). Los dos quedan sincronizados.
- Cambiar de lengua **re-renderiza sin recargar**: pista de pasos, jobs
  (`loadJobs`), perfil y oficios (`loadWorkerProfile`), Mi dinero
  (`loadPayouts`), Mi área (`loadCaptainArea`), visitas de yarda
  (`loadWorkerYardVisits`), la línea de ubicación y la tarjeta de
  permisos (`refreshPermCard`).
- El markup estático se traduce con atributos `data-w` (texto),
  `data-wp` (placeholders) y `data-wt` (nombres de oficios), aplicados
  por `applyWorkerLang()` en cada `mode()` / `applyWorkerEntry()`.

## Cobertura

- **Login/aplicación:** título, pestaña de aplicación, botón ENTRAR,
  pista de pasos 1-2-3, botón y nota de rescate de contraseña, "Forgot my
  password", renglones de acuerdo y de links (técnico/cliente), y TODO el
  formulario: rol, ciudad, áreas, habilidades, auto-calificación 1–10,
  los 7 oficios con niveles 1–5 y herramienta, equipo, experiencia,
  vehículo, carga, transporte, licencia, seguro, disponibilidad y notas.
  Los `data-v` y los `value` de los selects quedan en su forma canónica:
  **lo que se guarda en la aplicación no cambia con la lengua de la
  pantalla** — solo cambia lo que se ve.
- **Permisos (v64):** título, renglones de notificaciones/ubicación,
  estados (activadas/bloqueadas), ayuda, el texto "para qué" por rol y
  los `showInfo` de activar (incl. el aviso del martillo 🔨).
- **Dashboard:** trabajos abiertos (estado ACTIVO, rating de clientes,
  Pay offer, detalles confirmados, notas del Team), línea de pago
  ("Payout sent to your bank ✓"), botones del flujo (Pick this job,
  On my way, Arrived, Mark done — photos sent, compartir ubicación),
  banner de ruta en vivo, línea de ubicación de turno (compartiendo /
  en pausa / debes compartir), **Mi dinero** completo (tarjeta de setup
  de Stripe, totales, y las etiquetas de estado de cada pago), **Mi
  perfil** (foto, datos, disponibilidad con días, pausa), **Mis
  oficios** (banner de "califica tus oficios", niveles, verificado),
  **Mi área** del capitán (override 5%, trabajos y equipo), **visitas
  de yarda** (dirección, fotos ANTES/DESPUÉS, botones, estado) y la
  alerta de ubicación obligatoria para marcar On my way.
- El chat del trabajo y la sección de borrar cuenta son componentes
  compartidos: ahora hablan por `WT()` también — en un teléfono de
  cliente la lengua default sigue siendo inglés, así que su vista no
  cambia; en el teléfono del técnico salen en su lengua.

## Lo que NO se tocó

- El shell del cliente, la tienda y el Menú (conserva su propio toggle).
- Los datos: nombres de cliente, direcciones, servicios del catálogo,
  estados que manda el servidor y los mensajes de error del servidor.
- `server.js` — sin cambios (verificado con `node --check`).
- El diálogo genérico `#appDlg` (infraestructura compartida con admin)
  y el panel de notificaciones quedan como están.

## Pruebas

Suite **833/833** (829 de v70 + 4 nuevas):

- *VM:* la puerta del técnico abre en español por default (pista sin
  cola en inglés); `setWorkerLang('en')` re-renderiza la pista en
  inglés y persiste `ghsWorkerLang`; volver a ES restaura todo.
- *Estática v71:* existen el diccionario, los dos toggles, la
  persistencia y el paso `data-w`; los renderers del trabajador hablan
  `WT()`; ya no quedan los títulos mezclados en el código.
- Actualizadas las aserciones que fijaban los textos viejos mezclados
  (v40 Mi área, v41 Mis oficios/Mi dinero, v41 loc, v28 empty state de
  yardas, v63 ENTRAR).

SW: `ghs-app-v71`.

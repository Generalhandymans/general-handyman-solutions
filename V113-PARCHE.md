# V113 — Precio de frenos (brake-pads) $100 → $125

**Orden de Gabriel (2026-11-21, llamada de voz):** subir el precio de página de las pastillas de freno a **$125 el par**; miembro queda en **$100** (80% exacto). Motivación: su cotización a un cliente de Sprinter ($360 por los dos pares) quedó muy por encima de su propio precio de página ($100/par); con $125/par, el trabajo de dos pares queda en $250 de labor.

## Cambios
- `app/server.js` — SERVER_MENU: `"brake-pads":{p:100,m:80}` → `{p:125,m:100}`. Add-on rotores sin cambio ($85/par).
- `app/public/app.js` — copia de menú del cliente: price 100→125, member 80→100.
- `app/public/index.html` — tarjeta pública de Brake Pads: $100→$125, Members $80→$100.
- `app/public/landings/*.html` — regeneradas con `tools/gen-landings-v109.mjs` (9 archivos con la fila de frenos; diff verificado: solo la fila brake-pads).
- `app/public/sw.js` — cache `ghs-app-v112` → `ghs-app-v113`.
- `tests/run.mjs` — las 8 aserciones del cache SW actualizadas a `ghs-app-v113` (patrón de cada bump de versión).
- `MASTER-SERVICE-LIST.md` — Brake pads $100→$125; total pastillas+rotor $185→$210.

## Pruebas
- Suite completa: **PASS 2114 / FAIL 0**, dos corridas (procedimiento: copia en /tmp/ghs-v17-test con APP_DIR apuntando al árbol fusion).
- `app/data.json` NO viaja en el push.

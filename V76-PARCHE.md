# v76 — Gráficas de planes con precios correctos (2026-10-25)

Gabriel cazó en su app una tarjeta YARD CARE con **$95** (precio de una generación vieja).
Auditoría completa: las tarjetas viven como JPEG base64 dentro de `app/public/index.html`;
los `alt` ya decían los precios correctos, pero las imágenes cocidas mostraban los viejos.

| Tarjeta | Decía | Correcto |
|---|---|---|
| HomeCare | $49/mo + estimados "$60" | **$29/mo**, estimados $50, pill FIRST MONTH FREE |
| Yard Care 1 visita | $95/mo | **$75/mo** |
| Yard Care 2 visitas | $175/mo | **$150/mo** |
| HomeCare Plus 1 visita | $135/mo | **$100/mo** |
| HomeCare Plus 2 visitas | $199/mo | **$175/mo** |

Regeneradas con PIL (sin riesgo de texto de IA) en el estilo premium aprobado: tarjeta negra,
logo ancho con los 4 oficios, precio rojo #e42535, máx. 3 líneas de beneficios con hechos
confirmados. Mismas dimensiones y mismos slots — sin cambios de código. Cada tarjeta se releyó
y se verificó carácter por carácter, y se re-extrajo del HTML editado con hash coincidente.
Fuentes editables en `plan-cards-v76/` (solo en el workspace local — la herramienta de push no acepta binarios; el payload vivo va dentro del HTML). Limpio sin tocar: imágenes de producto de Stripe
($29/$75/$100 correctos) y las seis cajas del website (sin precios viejos).
Archivo muerto con precios viejos: `app/public/prev-stripe-images/` (no se sirve; queda como archivo).

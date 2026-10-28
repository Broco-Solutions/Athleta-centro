# Segunda pasada de UX — evidencia local

Capturas de Chromium headless, zoom 100 %, con la aplicación Next.js real y
respuestas HTTP **simuladas exclusivamente para presentación**. No prueban
sesiones, persistencia, permisos efectivos ni CSRF. Solo se usaron datos sintéticos.
No llegaron imágenes adjuntas en el turno: el antes se tomó del código limpio
`fd0094d` antes de editar. No se afirma una comparación con adjuntos no disponibles.

| Viewport | Antes | Después |
| --- | --- | --- |
| 1366 × 768 | [Antes](before-1366.png) | [Después](after-1366.png) |
| 1920 × 1080 | [Antes](before-1920.png) | [Después](after-1920.png) |
| 768 × 1024 | [Antes](before-768.png) | [Después](after-768.png) |
| 390 × 844 | [Antes](before-390.png) | [Después](after-390.png) |
| 360 × 640 | [Antes](before-360.png) | [Después](after-360.png) |

## Estados y controles

- [Compacto y tooltip Equipo](compact-1366.png).
- [Drawer a 390 × 500 con nombre y roles largos](drawer-short-390.png): scroll
  dentro de navegación, cuenta y cierre accesibles; Escape cierra el drawer.
- [Nuevo integrante](team-button.png): gap computado 8 px; SVG flex-shrink 0.
- [Estrella en 16, 32 y 48 px sobre claro/oscuro](favicon-sizes.png).
  Son renders de los tres frames PNG del ICO en navegador, no capturas de la
  barra de pestañas nativa. Falta validación del favicon publicado.

| Estado | Escritorio | Móvil |
| --- | --- | --- |
| Esperando DNI | [Ver](after-1366.png) | [Ver](after-390.png) |
| Verificando | [Ver](state-pending-1366.png) | [Ver](state-pending-390.png) |
| Registrado | [Ver](state-REGISTERED-1366.png) | [Ver](state-REGISTERED-390.png) |
| Ya registrado | [Ver](state-ALREADY_REGISTERED-1366.png) | [Ver](state-ALREADY_REGISTERED-390.png) |
| No encontrado | [Ver](state-NOT_FOUND-1366.png) | [Ver](state-NOT_FOUND-390.png) |
| Error técnico | [Ver](state-ERROR-1366.png) | [Ver](state-ERROR-390.png) |

El navegador comprobó la redirección con parámetros, ausencia de overflow
horizontal en los cinco tamaños, un único activo, ausencia de acordeones,
tooltip, separación del botón y una sola referencia de favicon con respuesta
200 en login interno y Portal. Esas comprobaciones visuales no sustituyen E2E
con PostgreSQL ni la revisión de seguridad publicada.

## Crítica visual

Dirección: la aprobada por el usuario, conservando paleta, tipografía y logo.
No se sortearon estilos nuevos ni se incorporaron fotografías ajenas.

ROUND 1
Seen in one second: una tarjeta aislada y un menú cuyas opciones desaparecen.
Idea (one sentence): recepción Athleta con marca y formulario equilibrados.
Live thing: ingreso manual por DNI, únicamente al enviar.
Layout words by section: navegación=estructura estable / recepción=marca y acción.
Scores: design 5 · usability 6 · creativity 5 · content 7 → overall 5.5.
Caps applied: composición inicial con superficie vacía y acordeones.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Tarjeta sin contexto (before-1366): superficie grafito con dos áreas.
2. Opciones ocultas (before-1920): grupos siempre visibles y enlaces directos.
3. Formulario redundante (before-390): bienvenida, etiqueta única y acción clara.

ROUND 2
Seen in one second: marca Athleta y panel claro para registrar la llegada.
Idea (one sentence): una recepción sobria, deportiva y operativa.
Live thing: formulario manual, estado verificando y corrección inmediata del DNI.
Layout words by section: navegación=grupos fijos / recepción=dos columnas o pila.
Scores: design 7 · usability 8 · creativity 7 · content 8 → overall 7.4.
Caps applied: evaluación de pantalla de trabajo; sin requisitos promocionales
  de fotografías o movimiento continuo, contrarios al alcance aprobado.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Línea amarilla cruzaba la instrucción (primer render desktop): retirada.
2. Borde inactivo heredaba el color global (primer render sidebar): color
   transparente explícito; borde reservado también cuando no está seleccionado.
3. Separación vertical excesiva en tablet (primer render 768): align-content
   central y filas de altura intrínseca; el espacio de feedback se conserva
   para evitar saltos entre resultados.

La puntuación es una crítica visual propia, no una certificación de aceptación.
La aceptación de autenticación y publicación permanece bloqueada.

Verificaciones adicionales del navegador: Enter envía exactamente una solicitud,
escribir no registra, corregir el DNI es inmediato y con reduced motion la trama
tiene animation-name `none`. La página real cargó Inter (`document.fonts`, estado
loaded). El inspector de diseño se ejecutó sobre una exportación estática del DOM
con CSS/fonts embebidos; esa medición solo evalúa geometría y presentación.
El lint de diseño en modo app no tuvo fallos; su advertencia de box-shadow
corresponde únicamente al anillo de foco del campo, sin sombra en reposo.
El inspector final informó **0 FAIL y 1 WARN** en 1366/768/390. La advertencia
es el h1 de bienvenida de 41 px en escritorio: se conserva por la dirección
expresiva aprobada específicamente para recepción y por lectura a distancia.
No se aplica a las demás pantallas. Las capturas de la app viva son las del
cuadro principal; la exportación estática solo complementa la inspección.

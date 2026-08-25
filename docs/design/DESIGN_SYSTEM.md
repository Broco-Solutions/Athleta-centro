# DESIGN_SYSTEM.md — Athleta Manager

## 1. Propósito

Este documento define el sistema visual de Athleta Manager.

Su objetivo es establecer una identidad consistente para toda la plataforma y evitar que cada pantalla, módulo o nueva feature introduzca decisiones visuales diferentes.

Este documento define:

- dirección visual;
- paleta de colores;
- tokens de diseño;
- uso de marca;
- tipografía;
- jerarquía visual;
- sidebar;
- layouts;
- cards;
- botones;
- formularios;
- tablas;
- badges y estados;
- dashboards;
- modales;
- responsive;
- Portal;
- login;
- iconografía;
- animaciones;
- reglas de implementación con Tailwind CSS + shadcn/ui;
- prohibiciones visuales para Codex.

Este documento complementa:

```text
docs/architecture/STACK.md
docs/engineering/CODING_CONVENTIONS.md
```

La implementación visual debe respetar este documento salvo que exista una decisión posterior explícita.

---

# 2. Fuente de identidad

La identidad visual se basa en el logo oficial de Athleta.

El logo utiliza principalmente:

```text
negro
grafito
blanco
amarillo Athleta
```

El amarillo es el color distintivo principal de la marca.

La aplicación no debe copiar literalmente el logo a toda la UI.

La marca debe inspirar el sistema visual sin sacrificar:

- legibilidad;
- confort de uso;
- jerarquía;
- operación prolongada;
- claridad clínica;
- claridad administrativa.

---

# 3. Dirección visual

Athleta Manager debe transmitir:

```text
Premium
Deportivo
Profesional
Clínico
Moderno
Sobrio
Rápido de operar
```

La combinación conceptual es:

```text
software SaaS profesional
+
clínica deportiva
+
entrenamiento premium
```

No debe parecer:

```text
hospital genérico azul
gym app neon
dashboard lleno de gradientes
glassmorphism
interfaz gamer
software contable antiguo
landing page promocional
```

---

# 4. Tema general

La aplicación utilizará una interfaz:

```text
principalmente clara
+
estructura oscura
+
acentos amarillos
```

Modelo:

```text
Workspace → claro
Sidebar → oscuro
Cards → blancas
Texto → negro/grafito
Accent → amarillo Athleta
```

No se implementará Dark Mode en V1.

---

# 5. Principio de uso del amarillo

El amarillo Athleta es:

```text
brand accent
```

No es:

```text
background dominante
warning universal
success
error
```

Regla central:

> El amarillo Athleta es un color de acento y acción, no un color de superficie dominante.

Debe utilizarse para:

- botones primarios;
- indicador activo;
- foco visual;
- iconos seleccionados;
- pequeños detalles de marca;
- progress/select states cuando corresponda.

Evitar:

- páginas completas amarillas;
- tablas amarillas;
- cards grandes completamente amarillas;
- alertas amarillas si su significado real es Warning;
- backgrounds amarillos extensos.

---

# 6. Paleta principal

## 6.1 Brand

```text
Brand Yellow
#FCCC05
```

Uso:

- primary action;
- navigation active indicator;
- branding accent;
- selected controls.

```text
Brand Yellow Hover
#E7B900
```

Uso:

- hover/pressed visual del primary button;
- hover de acentos interactivos.

```text
Brand Black
#171717
```

Uso:

- texto fuerte;
- elementos principales oscuros;
- branding.

```text
Brand Charcoal
#242424
```

Uso:

- sidebar;
- superficies oscuras secundarias.

```text
Brand Charcoal Hover
#303030
```

Uso:

- navegación hover;
- controles sobre superficies oscuras.

```text
Brand White
#FFFFFF
```

---

# 7. Paleta de superficie

```text
Background
#F6F7F8
```

Fondo principal de la aplicación.

```text
Surface
#FFFFFF
```

Cards, formularios, tablas y paneles.

```text
Surface Muted
#F3F4F6
```

Headers de tablas, zonas secundarias, filtros.

```text
Surface Hover
#F8F8F8
```

Hover muy sutil.

```text
Border
#E5E7EB
```

Bordes normales.

```text
Border Strong
#D1D5DB
```

Separadores que requieren más presencia.

---

# 8. Paleta de texto

```text
Text Primary
#18181B
```

Texto principal.

```text
Text Secondary
#71717A
```

Texto secundario.

```text
Text Muted
#A1A1AA
```

Placeholder, metadata secundaria y estados deshabilitados.

```text
Text On Dark
#F9FAFB
```

Texto sobre sidebar/superficies oscuras.

```text
Text On Brand
#18181B
```

Texto sobre amarillo Athleta.

No usar blanco como texto sobre amarillo principal salvo que un test de contraste concreto lo justifique.

---

# 9. Colores semánticos

Los estados funcionales utilizan colores semánticos independientes de la marca.

## Success

```text
Success
#16A34A

Success Background
#DCFCE7

Success Text
#166534
```

## Warning

```text
Warning
#D97706

Warning Background
#FEF3C7

Warning Text
#92400E
```

## Error / Danger

```text
Error
#DC2626

Error Background
#FEE2E2

Error Text
#991B1B
```

## Info

```text
Info
#2563EB

Info Background
#DBEAFE

Info Text
#1E40AF
```

## Neutral

```text
Neutral
#71717A

Neutral Background
#F4F4F5

Neutral Text
#52525B
```

---

# 10. Regla marca vs Warning

No utilizar `Brand Yellow` como Warning general.

Aunque ambos sean visualmente amarillos/ámbar:

```text
Brand Yellow
→ identidad / selección / acción

Warning
→ riesgo / atención / decisión requerida
```

Deben mantenerse semánticamente distintos.

---

# 11. Ejemplos de estados

Orientación inicial:

```text
ACTIVE
→ Success

INACTIVE
→ Neutral

ATTENDED
→ Success

ABSENT
→ Warning

CANCELLED
→ Neutral o Error suave según contexto

SCHEDULED
→ Info

IN_PROGRESS
→ Info o Success según componente

FINISHED
→ Neutral

DO_NOT_TRAIN
→ Error

RESTRICTED
→ Warning

NO_RESTRICTIONS
→ Success
```

No fijar colores funcionales únicamente por estética; deben mantener significado consistente.

---

# 12. Tokens CSS / Tailwind conceptuales

Los tokens deberán existir mediante CSS variables compatibles con shadcn/ui.

Ejemplo conceptual:

```css
:root {
  --background: 210 20% 97%;
  --foreground: 240 6% 10%;

  --card: 0 0% 100%;
  --card-foreground: 240 6% 10%;

  --popover: 0 0% 100%;
  --popover-foreground: 240 6% 10%;

  --primary: 48 98% 50%;
  --primary-foreground: 240 6% 10%;

  --secondary: 220 14% 96%;
  --secondary-foreground: 240 6% 10%;

  --muted: 220 14% 96%;
  --muted-foreground: 240 4% 46%;

  --accent: 48 98% 50%;
  --accent-foreground: 240 6% 10%;

  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;

  --border: 220 13% 91%;
  --input: 220 13% 91%;
  --ring: 48 98% 50%;

  --radius: 0.625rem;
}
```

Los valores finales pueden ajustarse mínimamente durante implementación para mantener contraste y consistencia técnica, pero no debe cambiarse la dirección visual.

---

# 13. Tailwind semantic tokens

El código no debería utilizar hex hardcodeados continuamente.

Preferir:

```text
bg-background
bg-card
text-foreground
text-muted-foreground
border-border
bg-primary
text-primary-foreground
```

Para colores semánticos adicionales, crear tokens reutilizables.

No escribir en cada feature:

```text
bg-[#FCCC05]
text-[#18181B]
```

si existe un token equivalente.

---

# 14. Tipografía

Se utilizará:

```text
Inter
```

como tipografía principal de la aplicación.

Razones:

- excelente legibilidad;
- buena densidad;
- claridad en tablas;
- claridad en formularios;
- estética SaaS moderna;
- menor complejidad al utilizar una única familia.

El carácter geométrico de la marca queda principalmente expresado por el logo.

---

# 15. Fallback tipográfico

Stack recomendado:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

---

# 16. Jerarquía tipográfica

## Page title

```text
28–32px
font-weight: 600–700
line-height: tight
```

## Section title

```text
18–20px
font-weight: 600
```

## Card title

```text
15–16px
font-weight: 600
```

## Body

```text
14–16px
font-weight: 400
```

## Labels

```text
13–14px
font-weight: 500
```

## Table header

```text
12–13px
font-weight: 500–600
```

## Metadata

```text
12–13px
Text Secondary / Muted
```

---

# 17. Peso tipográfico

Evitar abusar de:

```text
font-bold
font-extrabold
```

La jerarquía debe surgir de:

```text
size
weight
spacing
color
```

no únicamente de texto muy pesado.

---

# 18. Espaciado base

Utilizar una escala consistente basada en múltiplos de 4px.

Ejemplos:

```text
4
8
12
16
20
24
32
40
48
```

Evitar spacing arbitrario diferente en cada pantalla.

---

# 19. Densidad

La aplicación interna utilizará:

```text
densidad media
```

Objetivo:

- suficientemente compacta para operación diaria;
- suficientemente aireada para no sentirse como software legacy.

Referencias:

```text
Input height
40–44px

Button height
40–44px

Table row
44–48px
```

---

# 20. Border radius

Radios moderados.

```text
Inputs
8px

Buttons
8px

Cards
10–12px

Dialogs
12px

Badges
pill/full cuando corresponda
```

No utilizar radios excesivamente grandes como identidad general.

---

# 21. Sombras

Las sombras serán:

```text
muy sutiles
```

Cards y paneles dependen principalmente de:

```text
background
border
spacing
```

No de sombras fuertes.

Evitar:

```text
floating cards
heavy shadows
multiple elevation levels
```

---

# 22. Layout principal

La app interna utilizará conceptualmente:

```text
┌───────────────┬────────────────────────────────┐
│ Sidebar       │ Main Workspace                 │
│ dark          │ light                          │
│               │                                │
│ navigation    │ page header                    │
│               │ content                        │
│               │                                │
└───────────────┴────────────────────────────────┘
```

El workspace debe dominar visualmente con fondo claro.

---

# 23. Sidebar

Base:

```text
Brand Black / Charcoal
#171717 / #242424
```

La sidebar debe sentirse:

```text
premium
sobria
estable
```

No como una superficie decorativa.

---

# 24. Logo en sidebar

El logo Athleta se ubica en la parte superior.

Debe:

- mantener proporción;
- tener espacio suficiente alrededor;
- no competir con la navegación;
- ser legible en superficie oscura.

Cuando el ancho de sidebar no permita el logo completo, puede utilizarse una versión simplificada solo si existe un asset oficial correspondiente.

No inventar una marca simplificada sin aprobación.

---

# 25. Navegación sidebar

Estado normal:

```text
texto claro
icono Lucide
background transparent
```

Hover:

```text
Brand Charcoal Hover
```

Activo:

```text
background oscuro ligeramente diferenciado
+
indicador amarillo Athleta
+
texto blanco
```

---

# 26. Indicador activo

Preferir:

```text
barra vertical amarilla
pequeño highlight
icono amarillo
```

No utilizar un bloque completamente amarillo para cada item activo.

---

# 27. Sidebar collapsed

Si se implementa colapsado:

- mantener iconos claros;
- tooltip en hover;
- indicar estado activo;
- no deformar el logo.

No es obligatorio para la primera versión si no aporta suficiente valor.

---

# 28. Workspace

Fondo:

```text
#F6F7F8
```

El contenido debe tener un ancho y padding consistentes.

Recomendación conceptual desktop:

```text
24–32px outer padding
```

No pegar contenido a los bordes del viewport.

---

# 29. Page header

Una página debe comenzar con:

```text
title
optional description
primary action
secondary actions when required
```

Ejemplo:

```text
Pacientes                          [Nuevo turno]
Gestión clínica y seguimiento
```

No llenar el header con múltiples botones de igual peso.

---

# 30. Breadcrumbs

Utilizar solo cuando la profundidad lo justifique.

No mostrar breadcrumbs innecesarios en páginas de primer nivel.

Ejemplo útil:

```text
Clínica / Pacientes / Juan Pérez
```

---

# 31. Cards

Cards estándar:

```text
background: #FFFFFF
border: #E5E7EB
radius: 10–12px
shadow: minimal
```

Padding habitual:

```text
16–24px
```

según contenido.

---

# 32. Cards no decorativas

Una card debe agrupar contenido con sentido.

No envolver cada pequeño bloque de texto en una card solo para “hacer dashboard”.

---

# 33. KPI cards

Formato recomendado:

```text
┌─────────────────────────┐
│ Alumnos activos         │
│                         │
│ 184                     │
│ +3 este mes             │
└─────────────────────────┘
```

El valor principal debe dominar.

El amarillo puede aparecer como:

- icono;
- línea pequeña;
- accent;
- indicador.

No como fondo completo de todas las KPI cards.

---

# 34. Buttons

## Primary

```text
background: Brand Yellow
text: Text On Brand
border: none
```

Hover:

```text
Brand Yellow Hover
```

Uso:

```text
principal acción positiva de la vista
```

Ejemplos:

```text
Nuevo turno
Guardar
Crear persona
Registrar pago
```

---

# 35. Secondary button

```text
background: white
text: Text Primary
border: Border
```

Uso:

- acciones secundarias;
- cancelar;
- opciones complementarias.

---

# 36. Ghost button

Uso limitado para:

```text
acciones de tabla
icon buttons
toolbar
secondary low emphasis actions
```

Debe tener hover visible.

---

# 37. Destructive button

Utiliza semantic Error.

Ejemplos:

```text
Eliminar
Inactivar
Dar de baja
```

cuando la acción tenga consecuencias destructivas/relevantes.

No usar amarillo para una acción destructiva solo porque es el color principal.

---

# 38. Button hierarchy

Por sección debería existir normalmente:

```text
1 primary
0..N secondary/ghost
```

Evitar cuatro botones amarillos con el mismo peso visual.

---

# 39. Button labels

Usar acciones específicas:

```text
Guardar cambios
Registrar pago
Inactivar persona
Dar de baja de Sala
Finalizar tratamiento
```

Evitar cuando sea posible:

```text
Aceptar
OK
Confirmar
```

sin contexto.

---

# 40. Icon-only buttons

Solo cuando el significado sea claro.

Deben tener:

```text
tooltip
accessible label
```

No hacer depender operaciones críticas únicamente de un icono ambiguo.

---

# 41. Formularios

Labels siempre visibles encima del campo.

Ejemplo:

```text
Nombre
[________________________]

DNI
[________________________]
```

No utilizar placeholder como reemplazo del label.

---

# 42. Input

Estilo:

```text
height: 40–44px
border: Border
radius: 8px
background: white
text: Text Primary
```

Focus:

```text
ring/border Brand Yellow
```

sin glow exagerado.

---

# 43. Placeholder

Usar:

```text
Text Muted
```

Debe ser claramente más tenue que contenido ingresado.

No usar placeholder para instrucciones largas.

---

# 44. Field error

Estado error:

```text
border Error
message Error Text
```

El mensaje aparece debajo del campo.

No depender únicamente de color; incluir texto.

---

# 45. Field disabled

Debe ser perceptible sin perder legibilidad.

```text
muted background
muted text
not-allowed cursor when appropriate
```

---

# 46. Forms layout

Desktop:

- utilizar columnas cuando los campos se relacionen;
- no crear formularios de una sola columna interminables cuando puede organizarse mejor.

Mobile:

- apilar campos;
- mantener orden lógico.

---

# 47. Tabs

Utilizar tabs para secciones del mismo contexto.

Ejemplo:

```text
Datos generales
Sala
Clínica
Pagos
```

cuando corresponda por permisos y dominio.

El tab activo puede utilizar:

```text
texto fuerte
+
underline/border amarillo
```

No fondo amarillo completo.

---

# 48. Tables

Las tablas deben priorizar:

```text
lectura rápida
densidad
alineación
acciones claras
```

Estilo:

```text
background white
header Surface Muted
horizontal separators
minimal vertical borders
```

---

# 49. Table header

```text
background: #F3F4F6
font-weight: 500–600
text: Text Secondary/Primary
```

No utilizar headers negros pesados como estilo general.

---

# 50. Table rows

Altura aproximada:

```text
44–48px
```

Hover:

```text
very subtle gray
```

Selección:

```text
very light yellow tint
```

No utilizar zebra stripes fuertes.

---

# 51. Table borders

Preferir:

```text
horizontal separators
```

No poner un borde visible alrededor de cada celda.

---

# 52. Table actions

Las acciones frecuentes pueden utilizar botones/iconos discretos.

Acciones destructivas deben quedar separadas de acciones normales.

Un menú `...` es apropiado para acciones menos frecuentes.

---

# 53. Empty table

No mostrar solo una grilla vacía.

Ejemplo:

```text
No hay turnos para esta fecha.
```

Cuando sea útil agregar la acción principal:

```text
[Crear turno]
```

---

# 54. Filters

Los filtros deben estar agrupados sobre la tabla/listado.

Priorizar:

- campos más utilizados visibles;
- filtros secundarios en popover/drawer si hay demasiados.

No ocupar media pantalla con filtros poco frecuentes.

---

# 55. Search

El search principal debe tener:

```text
icono search
placeholder claro
debounce cuando sea apropiado
```

Ejemplo:

```text
Buscar por nombre o DNI
```

---

# 56. Pagination

Debe ser compacta.

Mostrar cuando aporte valor:

```text
page
total
previous/next
page size
```

No saturar visualmente.

---

# 57. Status badges

Los estados se representan preferentemente mediante badge.

Ejemplo:

```text
[ Activo ]
[ Atendido ]
[ Ausente ]
```

El badge utiliza:

```text
semantic background
semantic text
small radius / pill
```

---

# 58. Badges no deben dominar

Un badge identifica estado.

No debe competir visualmente con botones primarios.

Usar saturación moderada.

---

# 59. Alerts

Utilizar alerts para información que requiera atención contextual.

Tipos:

```text
Info
Success
Warning
Error
```

No convertir todas las explicaciones en alerts coloreadas.

---

# 60. Warning clínico

Ejemplo:

```text
Este paciente tiene una indicación activa con restricciones para entrenar.
```

Utilizar semantic Warning.

No usar Brand Yellow como simple copia visual del logo.

---

# 61. No entrenar

Condición crítica:

```text
DO_NOT_TRAIN
```

debe tener presencia suficiente mediante Error/Danger.

No puede representarse únicamente con un texto gris pequeño.

---

# 62. Dialogs / Modals

Estilo:

```text
white surface
12px radius
subtle shadow
clear title
concise explanation
footer actions
```

No hacer modales excesivamente grandes salvo formularios complejos.

---

# 63. Confirmation dialogs

Para acciones relevantes, el modal debe explicar consecuencias.

Ejemplo:

```text
Dar de baja de Sala

Se cancelarán reservas futuras, finalizarán turnos fijos y la rutina
actual quedará como histórica.

[Cancelar] [Dar de baja]
```

El botón destructivo debe usar semantic Error cuando corresponda.

---

# 64. Drawers

Pueden utilizarse para:

- filtros complejos;
- detalles rápidos;
- mobile navigation.

No reemplazar páginas completas de edición con drawers gigantes sin necesidad.

---

# 65. Toasts

Utilizar para feedback breve:

```text
Pago registrado
Cambios guardados
Turno cancelado
```

No utilizar toast como único lugar para errores que requieran corrección del usuario.

---

# 66. Loading states

Preferir:

```text
skeleton
localized spinner
button loading state
```

según el contexto.

No bloquear toda la aplicación por una operación localizada.

---

# 67. Skeletons

Usar en listas/cards cuyo layout sea predecible.

No generar skeletons excesivamente animados.

---

# 68. Dashboard

El dashboard debe ser sobrio y orientado a operación.

Priorizar:

```text
KPIs
acciones pendientes
agenda
alertas relevantes
resumen
```

No llenar con gráficos sin necesidad funcional.

---

# 69. Charts

Si se incorporan gráficos:

- pocos colores;
- amarillo como accent seleccionado;
- semánticos cuando corresponda;
- backgrounds claros;
- legends simples.

No utilizar paletas multicolor decorativas.

---

# 70. Clínica

Clínica mantiene el mismo sistema visual de Athleta.

No crear un tema:

```text
blue hospital
```

separado.

La diferenciación surge de:

- contenido;
- iconografía;
- estados;
- navegación;
- jerarquía.

---

# 71. Sala

Sala tampoco utiliza un tema verde/deportivo separado.

Debe sentirse parte de la misma plataforma.

No introducir nuevos colores principales por módulo.

---

# 72. Finanzas

Finanzas continúa con la misma identidad.

Para números:

- alineación consistente;
- jerarquía clara;
- rojo/verde solo cuando su semántica lo justifique;
- amarillo no representa ganancia.

---

# 73. Team

La sección Equipo mantiene el mismo lenguaje visual.

Los roles pueden usar badges neutrales o diferenciación sutil, pero no asignar un color fuerte diferente a cada rol sin necesidad.

---

# 74. Login interno

El Login sí puede explotar la marca con mayor intensidad.

Dirección recomendada:

```text
dark branding panel
+
light form panel
```

Conceptualmente:

```text
██████████████████   ┌────────────────────────┐
█     ATHLETA       │ Iniciar sesión         │
█      ★ ★ ★        │                        │
█                   │ Email                  │
█ Rehabilitación    │ [__________________]   │
█ & entrenamiento   │                        │
█                   │ Contraseña             │
██████████████████   │ [__________________]   │
                    │                        │
                    │ [ Ingresar ]           │
                    └────────────────────────┘
```

---

# 75. Login branding panel

Puede utilizar:

```text
Brand Black
Brand Charcoal
Brand Yellow
Brand White
```

Es una de las pocas superficies donde la marca puede tener presencia más fuerte.

---

# 76. Login mobile

En mobile:

- reducir composición;
- logo arriba;
- formulario debajo;
- mantener dark branding header o background parcial;
- evitar split-screen forzado.

---

# 77. Portal

El Portal utiliza la misma identidad de marca pero con UX simplificada.

Dirección:

```text
mobile-first
cards
large touch targets
simple navigation
few actions
clear status
```

---

# 78. Portal vs App interna

## App interna

```text
desktop-first responsive
more dense
tables
filters
multi-step operations
```

## Portal

```text
mobile-first
less dense
cards
simple lists
large actions
```

Ambas deben sentirse parte de Athleta.

---

# 79. Portal navigation

Preferir una navegación simple.

Ejemplos:

```text
Inicio
Sala
Turnos
Mis datos
```

No replicar la sidebar compleja de la app interna.

---

# 80. Portal cards

Las reservas/turnos pueden representarse mediante cards legibles.

Ejemplo:

```text
Lunes 24 ago
18:00 — Sala
Estado: Reservado

[Cancelar reserva]
```

---

# 81. Dark Mode

No se implementará Dark Mode en V1.

Razones:

- menor complejidad;
- menor carga QA;
- más consistencia;
- menos problemas de contraste;
- sidebar ya incorpora identidad oscura.

No agregar toggle oscuro por iniciativa propia.

---

# 82. Gradientes

No utilizar gradientes como estilo general.

Permitidos de forma muy limitada en:

```text
login branding
decorative marketing-like areas
```

y siempre de forma sutil.

Botones, cards, tablas y formularios serán mayormente planos.

---

# 83. Glassmorphism

No utilizar:

```text
blurred translucent cards
glass panels
frosted navigation
```

como lenguaje visual.

Athleta debe priorizar claridad operativa.

---

# 84. Animaciones

Las animaciones serán discretas.

Duración habitual:

```text
150–200ms
```

Aplicaciones:

```text
hover
dropdown
dialog
sidebar transition
tabs
small state changes
```

---

# 85. Animaciones prohibidas

Evitar:

```text
large entrance animations
bounce
continuous glow
parallax
animated gradients
decorative motion during work
```

---

# 86. Reduced motion

Respetar:

```text
prefers-reduced-motion
```

cuando corresponda.

Las animaciones no deben ser necesarias para comprender la interfaz.

---

# 87. Iconografía

Se utilizará:

```text
Lucide
```

como única librería principal.

Tamaños comunes:

```text
16px
18px
20px
```

---

# 88. Estilo de iconos

Preferir iconografía lineal/simple.

No mezclar:

```text
filled icons
emoji
3D icons
multiple icon packs
```

sin razón funcional.

---

# 89. Icono + texto

Para navegación y acciones importantes, preferir:

```text
icono + label
```

sobre iconos aislados.

---

# 90. Logo

Assets oficiales disponibles:

```text
logo-athleta-transparent.png
logo-athleta.png
```

Uso conceptual:

```text
transparent
→ dark controlled surfaces

logo with background
→ contexts where complete composition is needed
```

---

# 91. Reglas del logo

No:

```text
recolor
stretch
compress
rotate
change star arrangement
change typography
apply arbitrary effects
recreate manually
```

Mantener aspect ratio.

---

# 92. Clear space del logo

Mantener espacio visual alrededor.

Como regla inicial:

```text
minimum clear space
≈ height of one star / proportional equivalent
```

No pegar el logo a bordes, navegación o controles.

---

# 93. Logo pequeño

No utilizar la composición completa del logo a tamaños donde:

```text
CENTRO DE REHABILITACIÓN & ENTRENAMIENTO
```

se vuelva ilegible.

En esos casos utilizar una variante oficial simplificada si existe.

Si no existe, priorizar una versión recortada/aprobada posteriormente, no inventarla.

---

# 94. Responsive breakpoints

Utilizar breakpoints estándar de Tailwind salvo necesidad específica.

La UI debe responder por composición, no por duplicar páginas completas.

---

# 95. App interna responsive

Prioridad desktop.

En pantallas menores:

- sidebar colapsable/drawer;
- tablas con scroll horizontal o adaptación específica;
- filtros reagrupados;
- forms apilados;
- acciones accesibles.

---

# 96. Tables mobile

No intentar forzar tablas muy anchas en una pantalla estrecha.

Alternativas según caso:

```text
horizontal scroll
reduced columns
card representation
```

La decisión depende de la importancia del dataset.

---

# 97. Touch targets

En Portal/mobile:

```text
minimum practical target ≈ 44px
```

para acciones frecuentes.

---

# 98. Content width

No usar ancho máximo de landing page para todo el sistema.

Las páginas con tablas pueden ocupar más ancho.

Los formularios de lectura/escritura pueden utilizar un ancho más controlado.

---

# 99. Clinical text content

Evoluciones y campos de texto clínico deben priorizar lectura.

Usar:

- ancho razonable;
- buen line-height;
- evitar tipografía pequeña;
- evitar fondos oscuros.

---

# 100. Read-only clinical content

Diferenciar lectura de edición sin volver el contenido gris ilegible.

Los campos clínicos read-only pueden mostrarse como secciones de texto, no necesariamente como inputs disabled.

---

# 101. Data hierarchy

Una pantalla debe diferenciar:

```text
primary information
secondary metadata
actions
status
```

No presentar todo con el mismo peso.

---

# 102. Person header

Ejemplo conceptual:

```text
Juan Pérez                      [Activo]
DNI 32.456.789 · 38 años

[Datos] [Sala] [Clínica] [Pagos]
```

No repetir el nombre completo en cada card interna.

---

# 103. Clinical privacy and UI

La UI no debe reservar espacios visibles para información que el rol no puede ver.

Ejemplo:

Un Administrativo no debe ver:

```text
Historia clínica — Sin acceso
```

en cada sección si esa información no aporta valor.

Preferir directamente no presentar la sección.

---

# 104. Disabled vs hidden

Regla:

```text
missing permission
→ generally hide
```

```text
has permission but action temporarily unavailable
→ disabled + explanation when useful
```

---

# 105. Tooltips

Usar para:

- icon-only buttons;
- información breve;
- explicación de disabled states.

No utilizarlos para contenido extenso.

---

# 106. Focus states

Todo elemento interactivo debe tener focus visible.

Focus principal puede usar:

```text
Brand Yellow ring
```

con contraste suficiente.

No eliminar outlines sin reemplazo accesible.

---

# 107. Keyboard navigation

Dialogs, dropdowns, forms y tablas interactivas deben ser operables razonablemente con teclado mediante los primitives de shadcn/Radix.

---

# 108. Contrast

Los colores deben mantener contraste suficiente para UI operativa.

Especial cuidado:

```text
yellow + white
light gray text
disabled states
badges
```

Por eso el primary amarillo utiliza texto oscuro.

---

# 109. Loading button

Ejemplo:

```text
[ spinner  Guardando... ]
```

Mantener ancho estable cuando sea posible para evitar saltos visuales.

---

# 110. Progress

Si se necesita progress bar:

- surface neutral;
- fill Brand Yellow para progreso normal;
- semantic color solo cuando represente estado.

---

# 111. Calendar / agenda

La agenda debe priorizar:

```text
time
capacity
person
status
```

El amarillo puede marcar:

```text
selection
current focus
selected slot
```

No convertir todos los turnos en bloques amarillos.

---

# 112. Capacity states

Ejemplo conceptual:

```text
Available
→ neutral/success

Near capacity
→ warning

Full
→ error/neutral strong

Overbooked
→ error/warning
```

No utilizar simplemente diferentes tonos de amarillo.

---

# 113. Charts and financial values

No utilizar verde automáticamente para cualquier valor positivo si no representa éxito.

Ejemplo:

```text
Ingreso
```

puede usar texto normal.

```text
Neto positivo
```

podría usar Success cuando la lectura realmente sea de performance.

---

# 114. Destructive data actions

Las acciones de eliminar/inactivar deben:

- estar visualmente diferenciadas;
- no ser primary brand;
- requerir confirmación cuando el impacto sea relevante;
- explicar consecuencias.

---

# 115. Separator use

Preferir spacing antes que excesivos `<hr>`.

Los separadores deben ayudar a comprender agrupaciones, no fragmentar demasiado.

---

# 116. Header bars

Evitar headers negros dentro de cada card.

La presencia oscura se concentra principalmente en:

```text
sidebar
login branding
possibly top-level accents
```

El contenido operativo permanece claro.

---

# 117. Top bar

Si existe top bar:

- superficie blanca o muy clara;
- borde inferior sutil;
- acciones de usuario;
- no competir visualmente con sidebar.

---

# 118. User menu

Debe incluir de forma simple:

```text
name
roles if useful
change password
logout
```

No mostrar IDs técnicos.

---

# 119. Avatar

No depender de foto de perfil salvo que el producto la incorpore.

Puede utilizarse un avatar de iniciales neutral.

---

# 120. Search result identity

En resultados de Personas priorizar:

```text
Nombre Apellido
DNI
contexto actual
```

No saturar cada fila con todos los datos generales.

---

# 121. Long forms

Separar mediante:

```text
sections
subheadings
spacing
```

No crear cards anidadas innecesarias.

---

# 122. Stepper

Utilizar stepper solo cuando el proceso realmente tenga etapas distintas.

No transformar un formulario común en wizard por estética.

---

# 123. Design consistency

Una misma acción debe verse igual en todas las features.

Ejemplo:

```text
Edit
Delete
Save
Cancel
```

No redefinir estilos por módulo.

---

# 124. shadcn/ui

Los componentes shadcn son primitives/base.

Se pueden adaptar mediante tokens y wrappers propios.

No utilizar el estilo default sin revisar consistencia Athleta.

---

# 125. Wrapper components

Crear wrappers cuando exista un patrón real, por ejemplo:

```text
PageHeader
StatusBadge
DataTable
ConfirmActionDialog
EmptyState
FormSection
```

No crear una capa de wrappers para cada componente shadcn sin necesidad.

---

# 126. Primary button implementation

Conceptualmente:

```text
variant="default"
```

en el sistema Athleta deberá mapear a:

```text
Brand Yellow
dark foreground
```

No al azul típico de muchos design systems.

---

# 127. Destructive variant

```text
variant="destructive"
```

mantiene semantic Error.

Nunca mapear `destructive` a amarillo.

---

# 128. Outline variant

Debe usar:

```text
white background
Border
Text Primary
```

Hover:

```text
Surface Muted
```

---

# 129. Ghost variant

Debe mantener bajo peso visual pero feedback suficiente al hover/focus.

---

# 130. Input token

`--input` debe mapear a Border.

Focus:

```text
--ring
→ Brand Yellow
```

---

# 131. CSS variables

Los tokens deberán centralizarse.

No definir temas distintos dentro de cada feature.

Si aparece una nueva necesidad semántica, agregar un token global con nombre significativo.

---

# 132. Tailwind config

No llenar `tailwind.config` con colores específicos por feature:

```text
clinic-blue
sala-green
finance-purple
```

salvo una decisión futura explícita.

---

# 133. Color opacity

Para estados seleccionados puede utilizarse Brand Yellow con baja opacidad.

Ejemplo conceptual:

```text
brand yellow 8–12% background
```

con texto oscuro y un indicador más fuerte.

---

# 134. Design QA

Antes de considerar una pantalla terminada revisar:

```text
Does it use the shared palette?
Is there only one primary action?
Are semantic colors correct?
Are spacing/radius consistent?
Is typography hierarchy clear?
Does it work responsive?
Does permission-based UI make sense?
Does it look like Athleta?
```

---

# 135. Codex — reglas obligatorias

Codex debe leer este documento antes de construir UI nueva.

No puede:

```text
invent a new main color
add gradients by preference
add dark mode
introduce another UI library
use neon colors
use glassmorphism
use large shadows
use giant border radius everywhere
create a different theme per module
```

---

# 136. Codex — nuevos componentes

Antes de crear un componente visual nuevo debe revisar:

```text
shadcn existing primitive
packages/ui existing component
feature-local existing pattern
```

Evitar duplicar componentes equivalentes con estilos diferentes.

---

# 137. Codex — page implementation

Al crear una página:

1. Usar layout general existente.
2. Usar `PageHeader` o patrón equivalente.
3. Identificar una primary action.
4. Utilizar surfaces/cards solo para agrupación real.
5. Aplicar filtros/tablas/forms según patrones compartidos.
6. Utilizar semantic states.
7. Validar responsive.
8. No introducir nuevos tokens sin necesidad.

---

# 138. Codex — no inferir diseño del módulo

No asumir:

```text
Clinic → blue
Sala → green
Finance → purple
```

Los módulos comparten identidad.

---

# 139. Codex — branding

El logo se utiliza mediante assets oficiales.

No recrear mediante:

```text
text "ATHLETA"
+
three star icons
```

si existe el asset original.

---

# 140. Design exceptions

Una excepción a este documento debe estar justificada por:

```text
functional need
accessibility
new approved design decision
```

No por preferencia estética local.

---

# 141. Dirección visual resumida

```text
┌──────────────┬─────────────────────────────────────┐
│              │                                     │
│  ATHLETA     │  Page title            [Primary]   │
│  dark        │  Supporting text                    │
│  sidebar     │                                     │
│              │  ┌──────────┐ ┌──────────┐          │
│  Inicio      │  │ KPI      │ │ KPI      │          │
│  Sala        │  └──────────┘ └──────────┘          │
│  Clínica     │                                     │
│  Finanzas    │  ┌──────────────────────────────┐   │
│  Equipo      │  │ Table / Form / Content       │   │
│              │  │                              │   │
│              │  └──────────────────────────────┘   │
│              │                                     │
└──────────────┴─────────────────────────────────────┘

Dark structure
+
light workspace
+
yellow accent
+
semantic states
```

---

# 142. Paleta resumida

```text
Brand Yellow         #FCCC05
Brand Yellow Hover   #E7B900

Brand Black          #171717
Brand Charcoal       #242424
Charcoal Hover       #303030

Background           #F6F7F8
Surface              #FFFFFF
Surface Muted        #F3F4F6
Border               #E5E7EB
Border Strong        #D1D5DB

Text Primary         #18181B
Text Secondary       #71717A
Text Muted           #A1A1AA

Success              #16A34A
Warning              #D97706
Error                #DC2626
Info                 #2563EB
```

---

# 143. Principios finales

1. Athleta usa una interfaz clara con estructura oscura.
2. El amarillo `#FCCC05` es el color de marca principal.
3. El amarillo es accent, no superficie dominante.
4. Primary buttons son amarillos con texto oscuro.
5. Sidebar es negra/grafito.
6. Cards son blancas, sobrias y con borde sutil.
7. Fondos generales utilizan gris casi blanco.
8. Tipografía principal: Inter.
9. La densidad es media.
10. Radios son moderados.
11. Las sombras son mínimas.
12. Tablas priorizan lectura y líneas horizontales suaves.
13. Los colores semánticos no se confunden con el color de marca.
14. Clínica, Sala y Finanzas no reciben temas cromáticos separados.
15. Login puede explotar más intensamente negro + amarillo.
16. Portal comparte marca pero utiliza UX mobile-first y más simple.
17. No Dark Mode en V1.
18. No glassmorphism.
19. No gradientes operativos habituales.
20. Animaciones discretas de 150–200ms.
21. Lucide es la librería de iconos.
22. El logo oficial no se recolorea ni deforma.
23. shadcn/ui se adapta al sistema visual Athleta.
24. Tailwind utiliza tokens semánticos, no hex dispersos.
25. Codex no inventa nuevos estilos por feature.
26. Toda nueva UI debe sentirse parte del mismo sistema.

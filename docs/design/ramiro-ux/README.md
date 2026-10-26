# Revisión visual de Ramiro

Capturas con datos ficticios. Los login no contienen credenciales. Las vistas de
navegación utilizan una sesión simulada exclusivamente para revisar composición;
los flujos de autenticación y PIN se prueban además mediante E2E con API y
PostgreSQL reales.

Las imágenes anteriores corresponden al código original de `origin/ramiro`.
La comparación se realizó con Chromium, movimiento reducido y la misma escala.

| Superficie | Antes | Después |
| --- | --- | --- |
| Login interno, 1280 px | [Antes](login-desktop-before.png) | [Después](login-desktop-after.png) |
| Login interno, 360 px | [Antes](login-mobile-before.png) | [Después](login-mobile-after.png) |
| Portal, 390 px | [Antes](portal-mobile-before.png) | [Después](portal-mobile-after.png) |
| Sidebar expandido | [Antes](sidebar-expanded-before.png) | [Después](sidebar-expanded-after.png) |
| Sidebar compacto, 600 px de altura | [Antes](sidebar-compact-before.png) | [Después](sidebar-compact-after.png) |
| Drawer móvil | [Antes](sidebar-mobile-before.png) | [Después](sidebar-mobile-after.png) |

Matriz completa revisada: 360×400, 360×640, 390×500, 390×844, 768×1024,
1280×600 y 1280×800. En ambas versiones se comprobaron los dos login y la
navegación: 21 comprobaciones por versión, sin scroll horizontal de página ni
errores JavaScript durante la captura. Las vistas de poca altura permiten scroll
vertical para mantener accesibles campos, ayuda y acciones.

El favicon utiliza únicamente las tres estrellas del logo oficial, sin cambiar
su orden ni proporciones, sobre grafito. El ICO incluye 16, 32 y 48 px y mantiene
contraste en pestañas claras y oscuras.

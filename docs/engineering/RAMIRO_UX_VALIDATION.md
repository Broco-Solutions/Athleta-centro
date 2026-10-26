# Correcciones y pulido de UX en `ramiro`

## Alcance

Se conserva la identidad Athleta, las rutas, permisos, credenciales iniciales,
requisitos de acceso y reglas de Sala y Clínica. No hay migraciones nuevas.
El PDF funcional sigue siendo la referencia de producto. No se resolvieron
contradicciones funcionales ajenas a este trabajo.

## Autenticación y PIN

El backend comparaba literalmente `Origin` con `WEB_ORIGIN`. El despliegue
productivo devolvía como origen configurado una URL con barra final, mientras
que los navegadores envían el origen sin esa barra. Los logs HTTP registraban
rechazos 401 de logout. La regresión reproduce el mismo rechazo para logout y
restablecimiento del PIN con una sesión válida y el token CSRF correcto.

`configuredWebOrigin()` obtiene el origen de la URL configurada mediante `URL`.
Middleware y CORS utilizan ese mismo valor. Se sigue aceptando un solo origen;
no se permiten otros dominios ni se elimina la comprobación del token CSRF.

Además, una cookie interna vencida o revocada impedía llegar al endpoint de
logout. Ese caso ahora permite revocar y eliminar la cookie inválida, manteniendo
la validación de origen. Una sesión activa sigue necesitando CSRF válido.
El cierre cancela consultas en vuelo, limpia la caché privada y reemplaza la
entrada de navegación por el login correspondiente. Al recuperar una página
desde bfcache se recarga y se verifica nuevamente la sesión.

El restablecimiento conserva su transacción, hash Argon2id, cambio obligatorio
y revocación de sesiones del Portal. La respuesta sigue siendo `{ data: string }`;
se corrigió una declaración TypeScript del DTO que la describía como objeto,
sin cambiar el esquema OpenAPI ni el formato HTTP. La UI comprueba el formato,
muestra errores dentro de la confirmación, evita solicitudes duplicadas y
permite copiar manualmente el PIN una sola vez. No existe lectura del PIN vigente.
Los diálogos capturan foco, admiten Escape cuando no hay una operación pendiente
y permiten copiar seleccionando el texto si el portapapeles no está disponible.

## Presentación y navegación

- Login interno: composición equilibrada entre marca y formulario, controles
  de 48 px y mostrar/ocultar contraseña sin envío ni pérdida del valor.
- Portal: acceso personal móvil, misma interacción de visibilidad del PIN,
  captura de errores de red y bloqueo de doble envío con mensajes genéricos.
- Sidebar: expandido y compacto conservan la misma definición de destinos y
  permisos. La barra compacta ofrece cada subopción con nombre accesible,
  tooltip para mouse/foco e indicador activo. No se comprime el logo.
- El estado del sidebar vive en el proveedor raíz durante la navegación normal.
  No se agregan preferencias en backend ni almacenamiento de credenciales.
- En móvil se conserva el drawer, con Escape, foco acotado, devolución del foco,
  bloqueo de scroll y fondo inerte.
- Favicon ICO en 16, 32 y 48 px a partir de las tres estrellas del asset oficial,
  conservando su disposición y proporciones. Next.js lo aplica desde el layout
  raíz al sistema y al Portal. No hay manifest ni implementación de PWA.

## Ingreso

El nombre visible pasa a Ingreso y se conserva `/sala/fichaje`.
La demora reproducida era un bloqueo de interfaz fijo de 10 segundos para todos
los resultados. `NOT_FOUND` mantiene ahora el campo editable y admite un nuevo
envío inmediatamente. Su mensaje se retira a los 3 segundos; una edición cancela
ese temporizador y no se borra el DNI que se está corrigiendo.

Los errores técnicos permanecen visibles y permiten reintentar. Se conservan
los 10 segundos y el restablecimiento manual de los restantes resultados.
Se omite invalidar agenda, disponibilidad y reservas solo para `NOT_FOUND`, que
retorna antes de consultar la agenda y no modifica datos. No se alteran rate
limiting, validaciones, ventanas horarias ni reglas de asistencia.

## Contacto

El teléfono institucional proviene de
`docs/product/HEALTH_DECLARATION_IMPLEMENTATION.md`. Se comparte mediante un
enlace `tel:` en el login y pie del Portal. No se encontraron perfiles sociales
oficiales verificables: no se agregaron enlaces de Instagram, Facebook o WhatsApp.

## Entorno y validación

El runner de integración/E2E crea un PostgreSQL Testcontainers con nombre
`athleta_test_<UUID>`. Antes de migrar verifica nombre, loopback, puerto y marcador
del contenedor. Nunca reutiliza una base configurada externamente. El secreto
de sesión es efímero, los datos son ficticios y la salida de credenciales del
seed se omite. E2E usa deliberadamente `WEB_ORIGIN` con barra final.

Vitest utiliza threads y limita jsdom a dos workers: la ejecución ilimitada produjo timeouts por
contención de recursos en WSL. No se aumentaron timeouts, eliminaron assertions
ni desactivaron pruebas.

Comandos principales:

```bash
pnpm check
pnpm test:integration
pnpm test:e2e -- auth-ux.spec.ts --workers=1
pnpm generate:api
```

Las pruebas de navegador de autenticación requieren el runner aislado completo:
las capturas con respuestas simuladas solo verifican presentación y responsive,
y no reemplazan la integración con backend y PostgreSQL.

## Resultados locales

- `pnpm check`: aprobado; lint, typecheck, 838 pruebas web, 59 pruebas unitarias
  de API y builds de producción. Persisten advertencias previas del cliente
  generado (directivas eslint-disable sin uso), sin errores de lint.
- Integración con PostgreSQL real: 74 pruebas de autenticación/Personas/Portal
  y 25 regresiones de asistencias/persistencia de sesión, todas aprobadas.
- `auth-ux.spec.ts`: 7 E2E aprobados con navegador, API y PostgreSQL reales.
  Incluyen las tres presentaciones de logout, redimensionar el drawer a desktop,
  restablecimiento desde ambas fichas, cambio obligatorio y sesiones separadas,
  reintento de DNI, responsive y carga del favicon.
- La última solicitud real `NOT_FOUND` respondió en 35 ms de servidor local.
  No se extrapola ese tiempo a producción. El bloqueo eliminado era de interfaz:
  10 segundos fijos antes de poder continuar, independientemente de la solicitud.
- `pnpm generate:api`: ejecutado; no produjo cambios en el contrato/cliente.
- Capturas y matriz responsive: [comparación visual](../design/ramiro-ux/README.md).

No se ejecutaron semillas ni restablecimientos de personas reales. Las bases
creadas por los runners son exclusivamente locales y efímeras. La infraestructura
de Docker Desktop requirió una conexión temporal a través de su cliente existente;
no se cambiaron permisos, configuración del daemon ni recursos de otros proyectos.

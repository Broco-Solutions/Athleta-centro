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

Si otro login reemplaza la cookie compartida entre pestañas, una pestaña puede
conservar el CSRF anterior en su caché. Se reprodujo localmente con navegador,
proxy, API y PostgreSQL reales: el logout recibía `401 CSRF_INVALID` con origen
correcto y permanecía en la pantalla interna. Ante ese código, el cliente ahora
consulta la sesión autenticada vigente y reintenta una sola vez, únicamente si
el token cambió. No cambia el origen de la solicitud ni omite CSRF. Si el token
no cambió, la sesión ya no es válida o el segundo POST falla, conserva el error.
Esta reproducción no demuestra por sí sola el contexto del reporte publicado.

Ingreso conserva montada su protección de sesión durante la carga inicial.
Antes, alternar entre un `main` de carga y `WorkspaceShell` remontaba las lecturas
de una sesión rechazada y podía impedir el regreso al login. La regresión E2E
sin sesión reprodujo ese ciclo sobre el build web y el backend reales.

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

## Segunda pasada — 2026-10-27 (parcial, sin publicar)

Esta sección reemplaza las decisiones anteriores sobre acordeones, ruta principal
y favicon. **No se considera corregido el logout reportado en esta segunda pasada.**

### Entorno identificado y límites del diagnóstico

- Rama local y remota consultada con `git ls-remote`: `ramiro`,
  `fd0094d3584b41ffe6648415e303a181788ba42d`. El árbol estaba limpio al empezar.
- Vercel: proyecto `athleta-001-web`, preview
  `dpl_9n4nNMZtDpLYqzGjnB7n72fpGXDH`, mismo SHA.
  Alias: https://athleta-001-web-git-ramiro-broco-solutions.vercel.app.
- Railway: proyecto Athleta, ambiente **Ramiro**, servicio `Athleta-001`,
  despliegue `5a4613be-6cfc-4269-8dce-44db1371c018`, mismo SHA;
  start `pnpm --filter @athleta/api start`.
  API: https://athleta-001-ramiro.up.railway.app.
- `NEXT_PUBLIC_API_URL` de Preview apunta a esa API; `WEB_ORIGIN` de la API
  coincide exactamente con el alias estable HTTPS, sin barra final.
  La normalización anterior está en el commit desplegado; esto **no demuestra**
  que el logout actual pase ni revela su error real.
- La URL individual del deployment tiene otro origen. Es una hipótesis a
  contrastar con la URL efectivamente utilizada y una sesión válida; no se
  amplió la allowlist ni se reemplazó el origen de solicitudes.
- El acceso al preview alcanzó la protección de Vercel (302/autenticación).
  El fetch conectado tampoco logró acceder. La CLI inició login sin obtener
  autenticación durante esta ejecución. No se inspeccionaron cookies/tokens de
  una sesión publicada, ni hay un código de error de logout confirmado.
- La consulta acotada de HTTP logs de logout en Ramiro no devolvió filas.
  No se usó esa ausencia como prueba de éxito.

**Bloqueo de aceptación:** falta reproducir la solicitud real desde navegador,
identificar su respuesta/código y comprobar revocación, sesión vencida y PIN con
frontend, API y PostgreSQL reales a través del proxy. No se parcheó autenticación
basándose en una causa no comprobada. CSRF y el origen estricto se conservan.

### Implementación disponible en el árbol local

- Inicio y Equipo son enlaces directos; Sala/Finanzas tienen encabezados no
  interactivos y destinos autorizados siempre presentes. Se conservan todas
  las funciones de permisos existentes, incluidas las de Profesor y otros roles.
- Se quitó el scroll automático que dependía de `session.data`; los refrescos no
  vuelven a posicionar el menú. Borde activo con espacio reservado, hover distinto,
  tooltip Equipo sin duplicación y scroll de navegación independiente de cuenta.
- `/sala/ingreso` es la única implementación de pantalla. Next.js redirige
  `/sala/fichaje` con 308, conservando query string; ambas entradas terminan en
  la misma protección de sesión y permiso. No se renombraron endpoints/permisos.
- Ingreso usa logo oficial con proporción original, grafito y trama SVG sutil,
  panel claro, composición responsive y animación de entrada finita (650 ms),
  anulada por `prefers-reduced-motion`. Los estados llevan texto e icono.
  Se mantienen el envío manual, los tiempos 3/10 segundos, el reset manual y
  las validaciones/reglas de asistencia anteriores.
- Button compartido incorpora gap 8 px e impide comprimir SVG directos.
  Se agregó `@source` de `packages/ui` a Tailwind: sin ello no emitía la regla
  nueva de los iconos compartidos. Se retiró un margen redundante de Filtros.
- Favicon de una estrella: contorno vectorizado de la estrella central del logo,
  amarillo Athleta sobre grafito; ICO 16/32/48 mediante
  `node apps/web/scripts/generate-favicon.mjs`. Fuente SVG en scripts/assets.
  Sigue la convención raíz de Next.js, sin manifest ni iconos duplicados.
- Sin migraciones, dependencias nuevas, cambios de reglas, permisos o datos reales.

### Evidencia y verificaciones

[Capturas, comparación y crítica visual](../design/ramiro-second-pass/README.md).
Las respuestas simuladas se usaron solo para inspección visual, nunca como
aceptación del logout o PIN. El ICO respondió 200 con un solo link de metadata
en ambos logins locales; se revisaron sus frames sobre superficies claras y
oscuras. Falta verlo en pestañas nativas y en el entorno publicado.

Se conservaron las regresiones E2E de PIN y se agregaron casos para sesión interna
vencida, rechazo de `127.0.0.1` frente a `localhost`, CSRF inválido y separación
interna/Portal, además de navegación/ruta/botón. La nueva fixture de expiración
solo funciona bajo la protección existente de base aislada.

`pnpm test:e2e -- auth-ux.spec.ts --workers=1` y `pnpm test:integration` no pudieron
iniciar PostgreSQL Testcontainers: no hay runtime Docker disponible. El cliente
Docker de Windows también falló al conectar desde este entorno. No se utilizó
otra base ni se fabricaron marcadores del runner para sortear la protección.

### Publicación pendiente

`git fetch origin ramiro` falla con `.git/FETCH_HEAD: Read-only file system`.
La política de esta sesión monta `.git` como solo lectura y no permite elevar
permisos. No se intentó eludirla mediante otro repositorio ni escrituras remotas.
No hay commit/push nuevo, no se actualizó el despliegue y no se modificó producción.
El SHA remoto arriba indicado es el **anterior**, no el resultado de esta pasada.
La URL prevista para la ruta nueva, **pendiente de publicación**, es
https://athleta-001-web-git-ramiro-broco-solutions.vercel.app/sala/ingreso.

### Resultados finales de esta ejecución

- `pnpm check`: **aprobado** (exit 0): lint, typecheck, 841 pruebas web,
  59 pruebas unitarias de API y builds de producción web/API. Se mantienen las
  advertencias del cliente generado; no se editó ese código.
- `pnpm --filter @athleta/web exec next typegen`: regenera los tipos de rutas
  después del traslado de página. También actualizó `next-env.d.ts` mediante
  el generador, sin parches manuales de archivos generados.
- Pruebas específicas de navegación/Ingreso: 58 aprobadas; configuración de
  redirects: 4 aprobadas. La suite completa incluye ambas.
- Inspección visual: cinco tamaños, seis estados, compacto/drawer corto,
  texto largo, Enter, corrección inmediata y reduced motion, con fixtures de
  presentación. Inspector estático: 0 FAIL, 1 WARN (bienvenida de 41 px,
  deliberada por la recepción aprobada). Crítica visual propia: 7.4/10.
- `pnpm test:integration` y E2E real: bloqueados antes de ejecutar tests por
  Docker/Testcontainers; restablecimiento de PIN real y logout pendientes.
- `git diff --check`: aprobado. No se introdujeron `.skip`/`.only`.
- Publicación: **no realizada**; siguen pendientes commit, push, despliegue y
  validación en preview. La configuración de producción quedó sin cambios.

## Reanudación — comprobaciones del ejecutor (2026-10-27)

Se preservó el árbol existente, incluidos scripts, SVG, ICO y capturas nuevas.
No se rehízo diseño ni se modificó autenticación sin reproducción.

- Rama local: `ramiro`. Dos consultas `git ls-remote origin refs/heads/ramiro`
  devolvieron `fd0094d3584b41ffe6648415e303a181788ba42d`.
- Una prueba real con `tempfile.mkstemp` dentro del directorio Git falló con
  `OSError(30, 'Read-only file system')`, antes de crear archivo alguno.
  `findmnt -T .git` confirmó un montaje ext4 `ro`.
  `git fetch origin ramiro` falló al abrir `.git/FETCH_HEAD` por solo lectura.
  No se intentaron commits, push, repositorios alternativos ni cambios de montaje.
- El proceso observado corre en Linux WSL2, kernel
  `6.18.54.1-microsoft-standard-WSL2`, Node `v24.13.0`.
  `docker version` y `docker info` finalizaron con exit 1. El comando resuelve
  al wrapper en `/mnt/c/Program Files/Docker/Docker/resources/bin/docker`,
  que informa que Docker no está disponible en esta distribución. Los sockets
  `/var/run/docker.sock` y `/run/docker.sock` no existen. No se deduce de ese
  mensaje una solución específica ni se cambiaron permisos o configuración.
- Se ejecutaron `pnpm test:integration` y
  `pnpm test:e2e -- auth-ux.spec.ts --workers=1`. Ambos finalizaron con exit 1
  desde el runner Node/tsx existente: `Could not find a working container runtime
  strategy`. Fallaron antes de migraciones, fixtures y escenarios. Se mantuvo
  la negativa del runner a utilizar bases existentes. Esto comprueba la falta
  de acceso de Testcontainers desde el proceso de pruebas.
- `pnpm check`: exit 0, con resultados recuperados de caché de Turbo
  (841 pruebas web y 59 unitarias de API). No es una nueva ejecución de esos
  escenarios ni evidencia de logout/PIN reales. `git diff --check`: aprobado.
- Vercel CLI 64.0.2: `whoami` informa sesión cerrada. Su caché de actualizaciones
  también falla con `EROFS` fuera del workspace. Se consultó `vercel curl --help`
  y se intentó `/login --deployment` apuntando explícitamente al preview
  individual; la CLI pidió autenticación, sin obtener respuesta de Athleta.
- El conector Vercel sí tiene identidad `brocosolutions`. Sus lecturas confirmaron
  `athleta-001-web`, ID `prj_PxM3YKw8SXAXUzHTwmWuDjTTfJxV`, equipo
  `team_cSvENFmHaefUGjsD0g6X4pyC`, protección SSO activa y deployment
  `dpl_9n4nNMZtDpLYqzGjnB7n72fpGXDH` READY, rama `ramiro`, SHA anterior
  `fd0094d3584b41ffe6648415e303a181788ba42d`, alias de rama conservado.
  La herramienta de fetch del preview devolvió que requiere aprobación,
  incompatible con la política `never` de esta sesión. No hubo acceso al
  contenido protegido ni se alteró Deployment Protection.

Siguen pendientes la causa comprobada de logout, su solicitud/respuesta desde
una sesión real, regresión real de PIN, comprobación actual de backend/base del
preview y publicación de esta segunda pasada. Se necesita un ejecutor con Git
escribible y runtime accesible desde Node, además de autenticación CLI para el
acceso protegido solicitado. No hay un SHA nuevo publicado.

## Nueva reanudación local — Git escribible, Docker bloqueado (2026-10-27)

Se leyeron `AGENTS.md`, este informe y
`docs/design/ramiro-second-pass/README.md`. La rama sigue siendo `ramiro` y se
preservaron todos los cambios locales, sin rehacer sidebar, Ingreso ni favicon.

Se ejecutaron por separado las tres comprobaciones previas solicitadas:

1. **Escritura real en Git: aprobada.** Un script Python obtuvo el directorio con
   `git rev-parse --absolute-git-dir`, creó exclusivamente un archivo propio con
   `tempfile.mkstemp(prefix='codex-git-write-probe-', dir=git_dir)`, escribió y leyó
   su contenido y lo eliminó. Exit 0. El bloqueo histórico de solo lectura no se
   reprodujo en esta ejecución.
2. **`docker info`: falló, exit 1.** Mensaje exacto:

   ```text
   The command 'docker' could not be found in this WSL 2 distro.
   We recommend to activate the WSL integration in Docker Desktop settings.

   For details about using Docker Desktop with WSL 2, visit:

   https://docs.docker.com/go/wsl2/
   ```

3. **Acceso desde Node/Testcontainers: falló, exit 1.** Desde `apps/api` se ejecutó:

   ```bash
   node -e 'const { getContainerRuntimeClient } = require("testcontainers"); getContainerRuntimeClient().then(() => { console.log("PASS: Node/Testcontainers connected to Docker"); }).catch((error) => { console.error(error.stack); process.exitCode = 1; });'
   ```

   Error exacto:

   ```text
   Error: Could not find a working container runtime strategy
       at getContainerRuntimeClient (/home/rcoirini/proyectos-bs/athleta-manager/node_modules/.pnpm/testcontainers@11.7.0/node_modules/testcontainers/build/container-runtime/clients/client.js:67:11)
   ```

Por instrucción expresa, se detuvo el trabajo dependiente de Docker: no hubo
reproducción ni parche nuevo de logout, integración/E2E de logout o PIN, commit,
push ni verificación de un despliegue nuevo. No se ejecutó `pnpm check` ni se
presentaron resultados de caché como pruebas nuevas. No se modificaron montajes,
permisos, sockets, configuración de Docker, bases compartidas, producción ni
otros proyectos. Para continuar se requiere un motor Docker accesible desde
este mismo proceso Node/Testcontainers; el acceso Git ya quedó comprobado.

# Declaración de salud y consentimiento

Documento fuente: `Declaracion_Jurada_Salud_y_Consentimiento_Athleta_Centro.docx`,
localizado en `/mnt/c/Users/ramir/Downloads/` durante la implementación.

Los textos y preguntas se transcribieron en
`apps/api/src/sala/health-declaration/health-document-content.ts`.
El documento no trae una versión impresa; la versión técnica utiliza su SHA-256.
Cada presentación conserva el documento completo efectivamente aceptado y su versión.

## Flujo

1. Login existente con DNI/PIN.
2. Cambio de PIN obligatorio cuando corresponde.
3. Declaración obligatoria para cualquier alumno sin presentación vigente.
4. Cinco pasos, respuestas de edición exclusivamente en memoria, revisión y confirmación expresa.
5. Persistencia y habilitación inmediata del Portal. Nueva presentación únicamente al vencer
   la actual, sin sobrescribir las anteriores. Una declaración vigente, digital o en papel,
   impide nuevas presentaciones desde el Portal, incluso mediante solicitudes directas.

`PortalService.ready` exige la declaración después del control del PIN.
Se mantienen disponibles la sesión, los datos personales, el cambio de PIN, la salida
y las rutas propias del formulario. El navegador no elige el `personId` del Portal.

Antecedentes opcionales, incluida la opción de no informar datos sensibles.
Los campos kinésicos son opcionales. Sin autorización para tratamiento de información
médica no se guardan respuestas médicas. Cada técnica, cesión y uso de imagen tiene
su autorización independiente. La ausencia de una autorización opcional no concede permiso.

El alumno puede consultar e imprimir su copia confirmada desde el formulario.
La confirmación electrónica registra identidad, responsable de menor cuando aplica,
fecha del servidor, consentimientos, confirmación y versión documental.
No simula la firma de un profesional ni genera diagnósticos o aptitud médica.

## Consulta interna

Estado e historial de fechas: `SALA_RELATION_READ`.
Declaración completa: `SALA_PHYSICAL_EVALUATION_MANAGE`.
Administrativo puro conserva acceso únicamente a metadatos, aunque tenga lectura de evaluaciones.
El Profesor autorizado y Administrador general consultan las respuestas en modo lectura.

## Declaraciones firmadas en papel

En Nuevo alumno (Persona nueva o existente), el personal puede marcar «El alumno ya
presentó la declaración de salud firmada en papel» e ingresar su fecha real de firma.
La opción comienza desmarcada y no propone una fecha. También está disponible en los
flujos activos de alta desde Sala y Agenda, incluidos turnos fijos y espontáneos.
La constancia se guarda en la misma transacción de incorporación; un error revierte el alta.

En la ficha del alumno, Declaración de salud permite «Registrar declaración presentada
en papel» únicamente con `SALA_PARTICIPATION_MANAGE`. Exige confirmar que existe el
papel firmado e ingresar la fecha real de firma. Si hay una declaración vigente,
no permite agregar otra. El responsable se obtiene de la sesión interna, nunca del cliente.

La tabla `paper_health_declarations` conserva Persona, fecha de firma (`DATE`),
vencimiento (`DATE`), registro (`TIMESTAMPTZ`) y usuario responsable. No almacena
respuestas, consentimientos, firma electrónica ni archivos. Tiene FKs con `RESTRICT`
y un trigger que impide sobrescribir registros.
Migración: `20261023170203_paper_health_declarations`.

El vencimiento se calcula sumando doce meses calendario a la firma, ajustando el
29 de febrero al 28 cuando corresponde. El papel es vigente hasta el final de la
fecha de vencimiento en `America/Argentina/Buenos_Aires`; el registro administrativo
no extiende ese plazo. Una constancia ya vencida se conserva pero no habilita el Portal.
Las declaraciones digitales conservan su vencimiento con timestamp existente.

El estado unifica ambas fuentes: `MISSING`, `CURRENT` o `EXPIRED`, con `required`.
Cualquier evidencia vigente habilita el Portal; registrar un papel antiguo no desplaza
una digital vigente. El historial identifica `DIGITAL` y `PAPER` y conserva sus fechas.
El personal interno ve además fecha/hora y responsable del registro del papel.
El Portal recibe únicamente los metadatos propios necesarios y permite consultar e
imprimir copias digitales; el papel no ofrece respuestas ni impresión digital.

Con estado `CURRENT` el Portal no renderiza el formulario ni permite actualizarlo.
Con `MISSING` o `EXPIRED` mantiene los cinco pasos y el requisito obligatorio.
El cambio obligatorio de PIN conserva prioridad. Ante cambios de salud durante la
vigencia, el alumno debe comunicarse con Athleta Centro.

El envío digital y el registro en papel bloquean la misma fila de Persona mediante
`SELECT ... FOR UPDATE`, comprueban la vigencia dentro de la transacción y crean
únicamente si corresponde. Solicitudes simultáneas no duplican declaraciones vigentes;
los registros de papel vencidos de la misma Persona/fecha también se rechazan bajo ese bloqueo.
El conflicto de vigencia usa `HEALTH_DECLARATION_CURRENT` (409).

## Persistencia

Migración `20261022120000_health_declarations`, aplicada a PostgreSQL local.
Tabla asociada a Person, sin borradores ni estado derivado persistido.
PostgreSQL impide sobrescribir declaraciones mediante un trigger.
La relación con Person utiliza `ON DELETE RESTRICT`.
El cliente HTTP se regenera mediante `pnpm generate:api`.

## Pendientes antes de producción

Punto 9 completado con Athleta Centro; Federico Graziottin;
+54 9 3464 56-6340; Casilda, Santa Fe.
**El domicilio completo está pendiente de confirmación** y no fue inventado.

El documento establece cancelaciones con **24 horas de anticipación**, lo que difiere
 del Portal actual. Se mantiene su texto, pero **no se cambiaron las reglas de reservas**.
Se requiere validación funcional de esta discrepancia antes de producción.

## Pruebas relacionadas

- `health-document.spec.ts`: documento fuente, versión, vigencia y mayoría de edad.
- `health-declaration.integration-spec.ts`: PostgreSQL real, PIN, bloqueo, datos
  opcionales, consentimiento, CSRF, menores, historial, inmutabilidad, ownership y permisos.
- `portal-auth.integration-spec.ts` y `portal-sala.integration-spec.ts`: regresiones
  relacionadas; las pruebas de Sala usan un alumno previamente declarado.
- `health-form.test.tsx`: navegación, validaciones, respuestas en memoria y autorizaciones.
- `health-declaration.spec.ts`: responsive, contingencia de documento ausente y recorrido
  real con DOCX/API/DB, cambio de PIN, consulta de copia y consulta del Profesor.

Los fixtures utilizan únicamente datos sintéticos y eliminan solo sus propios registros.

## Archivos

| Ruta | Propósito |
| --- | --- |
| `apps/api/prisma/migrations/20261023170203_paper_health_declarations/migration.sql` | Constancias administrativas con autor y fechas, sin contenido médico. |
| `apps/web/src/features/health-declaration/paper-declaration-fields.tsx` | Captura compartida de confirmación y fecha de firma en papel. |
| `apps/web/src/app/portal/declaracion-salud/page.test.tsx` | Formulario disponible sólo para MISSING/EXPIRED y consulta de ambas modalidades. |
| `apps/api/prisma/schema.prisma` | Relación Person y presentaciones confirmadas. |
| `apps/api/prisma/migrations/20261022120000_health_declarations/migration.sql` | Tabla, restricciones, FK y trigger de inmutabilidad. |
| `apps/api/src/app.module.ts` | Registro del servicio de declaraciones. |
| `apps/api/src/sala/health-declaration/health-document.ts` | Vigencia, edad, catálogo documental y responsable. |
| `apps/api/src/sala/health-declaration/health-document-content.ts` | Transcripción y huella del DOCX. |
| `apps/api/src/sala/health-declaration/health-declaration.dto.ts` | Contratos HTTP, validaciones y OpenAPI. |
| `apps/api/src/sala/health-declaration/health-declaration.service.ts` | Envío, consentimiento, snapshots, consulta y estado. |
| `apps/api/src/portal/portal.service.ts` | Requisito de ingreso, datos y declaraciones propias. |
| `apps/api/src/portal/portal.controller.ts` | Sesión, endpoints del formulario y CSRF. |
| `apps/api/src/sala/sala.service.ts` | API de consulta administrativa del módulo. |
| `apps/api/src/sala/sala.controller.ts` | Endpoints de consulta con permisos separados. |
| `apps/web/src/app/portal/declaracion-salud/page.tsx` | Formulario condicionado a vigencia, envío, éxito y copia propia. |
| `apps/web/src/app/portal/portal-ui.tsx` | Navegación y redirección según requisitos de ingreso. |
| `apps/web/src/features/health-declaration/health-form.tsx` | Cinco pasos, validaciones y revisión. |
| `apps/web/src/features/health-declaration/health-panel.tsx` | Estado, fechas y consulta administrativa. |
| `apps/web/src/features/health-declaration/health-read-only.tsx` | Presentación confirmada en modo lectura. |
| `apps/web/src/features/sala/person-workspace.tsx` | Sección Declaración de salud. |
| `packages/api-client/src/generated.ts` | Cliente regenerado mediante Orval. |
| `apps/api/src/sala/health-declaration/health-document.spec.ts` | Tests del documento, edad y vigencia. |
| `apps/api/test/health-declaration.integration-spec.ts` | Tests completos del flujo y permisos en DB real. |
| `apps/api/test/portal-auth.integration-spec.ts` | Fixture estable: DNI y normalizado generados una sola vez. |
| `apps/api/test/portal-sala.integration-spec.ts` | Alumno declarado en escenarios de reservas existentes. |
| `apps/api/scripts/e2e-fixture.ts` | Declaración en fixtures de alumnos previamente incorporados. |
| `apps/api/scripts/health-declaration-e2e-fixture.ts` | Fixtures aislados del nuevo E2E con cleanup propio. |
| `apps/web/src/features/health-declaration/health-form.test.tsx` | Tests de formulario. |
| `apps/web/src/features/health-declaration/health-panel.test.tsx` | Tests de consulta, privacidad y carga bajo demanda. |
| `apps/web/e2e/health-declaration.spec.ts` | Tests de navegador simulados y reales. |
| `docs/product/HEALTH_DECLARATION_IMPLEMENTATION.md` | Funcionamiento, trazabilidad y pendientes. |
| `apps/web/src/features/sala/person-workspace.test.tsx` | Expectativas exactas de la nueva sección de salud. |
| `apps/web/src/app/portal/page.test.tsx` | Navegación ampliada y una sola sección activa, incluido el formulario. |
| `apps/web/src/app/portal/sala/reservas/page.test.tsx` | Navegación del Portal actualizada en la pantalla existente. |

## Validación del reconocimiento en papel y bloqueo de renovaciones vigentes

- Migración aplicada en local y reproducida desde cero en PostgreSQL aislado; estado actualizado.
- `pnpm generate:api`: cliente Orval regenerado, sin edición manual de artefactos.
- `pnpm check`: aprobado (lint, typecheck, 43 tests de API, 759 de web y build).
- Integración de salud: 21 pruebas en PostgreSQL aislado, incluidas concurrencia,
  privacidad, fechas, inmutabilidad, renovación y rollback del alta/constancia.
- Pruebas dirigidas de web: 195 aprobadas; tras ampliar las comprobaciones de papel
  en Sala y agenda, las 52 pruebas de esos dos archivos también aprobaron.
- Playwright: 5 E2E aprobados, incluido DOCX/API/DB real y estados vigentes
  de papel/digital a 1440, 768 y 390 px, sin desbordes.
- Lint conserva advertencias de directivas de ESLint en el cliente generado; sin errores.
- La primera migración generada incluyó diferencias ajenas por divergencias previas
  entre schema e historial. Se corrigió antes de la validación aislada y se restauró
  la estructura local afectada; la tabla clínica afectada contenía cero filas.
- Las bibliotecas faltantes de Chromium se extrajeron temporalmente fuera del repo
  para completar los E2E, sin agregar dependencias al proyecto.

## Archivos modificados en esta entrega

```text
apps/api/prisma/migrations/20261023170203_paper_health_declarations/migration.sql
apps/api/prisma/schema.prisma
apps/api/src/sala/health-declaration/health-declaration.dto.ts
apps/api/src/sala/health-declaration/health-declaration.service.ts
apps/api/src/sala/health-declaration/health-document.spec.ts
apps/api/src/sala/health-declaration/health-document.ts
apps/api/src/sala/sala.controller.ts
apps/api/src/sala/sala.dto.ts
apps/api/src/sala/sala.service.ts
apps/api/test/health-declaration.integration-spec.ts
apps/web/e2e/health-declaration.spec.ts
apps/web/src/app/portal/declaracion-salud/page.test.tsx
apps/web/src/app/portal/declaracion-salud/page.tsx
apps/web/src/app/students/page.test.tsx
apps/web/src/app/students/page.tsx
apps/web/src/features/health-declaration/health-panel.test.tsx
apps/web/src/features/health-declaration/health-panel.tsx
apps/web/src/features/health-declaration/paper-declaration-fields.tsx
apps/web/src/features/sala/agenda-panel.test.tsx
apps/web/src/features/sala/fixed-bookings-calendar.tsx
apps/web/src/features/sala/person-workspace.tsx
apps/web/src/features/sala/spontaneous-modal.tsx
apps/web/src/features/sala/student-onboarding.test.tsx
apps/web/src/features/sala/student-onboarding.tsx
apps/web/src/lib/operational-date.ts
docs/product/HEALTH_DECLARATION_IMPLEMENTATION.md
packages/api-client/src/generated.ts
```

## Resultados de validación de la implementación digital original

- Migración aplicada y `prisma migrate status`: base local actualizada.
- `pnpm generate:api`: cliente regenerado correctamente.
- Lint y TypeScript: correctos en los archivos/apps afectados.
- Backend: 42 tests unitarios, incluidas las 3 políticas documentales; integración de
  salud (11), Sala/Portal (95) y autenticación (1), aprobados.
- Web: suite de 43 archivos; sus expectativas antiguas de navegación se actualizaron
  para la nueva sección y pasaron las 127 regresiones de los tres archivos afectados.
  Las pruebas específicas de formulario, privacidad y sesión también pasaron.
- Navegador: 3 E2E aprobados, incluido DOCX/API/DB reales y capturas a tres anchos.
- `pnpm build`: las 5 tareas terminaron correctamente.
- `pnpm check` se intentó una sola vez: los procesos de tests tuvieron timeouts y
  bloqueos al finalizar archivos. Se detuvo esa ejecución; las comprobaciones se
  completaron por etapas, usando threads y menor concurrencia para la suite web.
  No se deshabilitaron tests ni se redujeron sus assertions.

No se hicieron commits, despliegues ni cambios productivos.

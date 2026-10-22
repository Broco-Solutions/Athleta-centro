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
5. Persistencia y habilitación inmediata del Portal. Nueva presentación a los doce meses
   o por actualización voluntaria, sin sobrescribir las anteriores.

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
| `apps/web/src/app/portal/declaracion-salud/page.tsx` | Formulario, envío, éxito, actualización y copia propia. |
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

## Resultados de validación

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

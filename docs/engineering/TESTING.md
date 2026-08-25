# TESTING.md — Athleta Manager

## 1. Propósito

Este documento define la estrategia de testing de Athleta Manager.

Su objetivo es establecer:

- qué tipos de tests existen;
- qué debe verificar cada capa;
- qué herramientas se utilizan;
- cómo se prueban reglas de dominio;
- cómo se prueban constraints y transacciones reales;
- cómo se prueban permisos;
- cómo se manejan datos de test;
- cómo se prueban concurrencia, idempotencia y errores;
- qué condiciones debe cumplir una feature para considerarse terminada.

Este documento complementa:

```text
docs/architecture/ARCHITECTURE.md
docs/architecture/STACK.md
docs/architecture/DATABASE.md

docs/domain/DOMAIN_MODEL.md
docs/domain/STATE_TRANSITIONS.md
docs/domain/PERMISSIONS.md
docs/domain/DATA_INTEGRITY.md
```

No reemplaza los criterios funcionales definidos por el producto.

---

# 2. Stack de testing

## Backend

```text
Jest
Supertest
PostgreSQL real
```

## Frontend

```text
Vitest
React Testing Library
MSW
```

## End-to-End

```text
Playwright
```

## Base de datos de integración

```text
PostgreSQL real
```

No se utilizará SQLite como sustituto de PostgreSQL.

---

# 3. Estrategia general

Athleta utilizará una pirámide práctica de tests:

```text
muchos Unit Tests
+
Integration Tests suficientes
+
pocos E2E críticos
```

No se intentará verificar todo mediante Playwright.

Cada tipo de test debe utilizarse donde aporte mayor confianza con el menor costo de mantenimiento.

---

# 4. Objetivo de los Unit Tests

Los Unit Tests verifican principalmente:

```text
reglas de dominio
Application Services
casos de uso
transformaciones
políticas
helpers determinísticos
```

sin depender innecesariamente de infraestructura externa.

Ejemplos:

```text
FinalizeTreatmentUseCase
RemoveRoleUseCase
ReplaceRoutineUseCase
calculatePersonStatus()
effectivePermissions()
```

---

# 5. Backend Unit Tests

Se utilizará:

```text
Jest
```

Los repositories podrán mockearse cuando el objetivo del test sea verificar lógica de negocio.

Ejemplo conceptual:

```text
Given
Professor has assigned students

When
InactivateInternalUser

Then
throw PROFESSOR_HAS_ASSIGNED_STUDENTS
```

No debe ser necesario levantar PostgreSQL para demostrar esa regla si el objetivo es únicamente la lógica del caso de uso.

---

# 6. Qué no mockear en Unit Tests

No se debe mockear el propio comportamiento que se intenta probar.

Ejemplo incorrecto:

```text
mock FinalizeTreatmentUseCase
↓
test FinalizeTreatmentUseCase
```

Tampoco crear mocks tan complejos que reimplementen Prisma o PostgreSQL dentro del test.

---

# 7. Integration Tests backend

Los Integration Tests deberán utilizar:

```text
NestJS
Prisma
PostgreSQL real
```

y verificar comportamiento real de infraestructura.

Deben cubrir:

```text
repositories
constraints
Foreign Keys
transactions
locking
Prisma mappings
manual SQL migrations
DECIMAL behavior
TIMESTAMPTZ
partial indexes
```

---

# 8. PostgreSQL real

No utilizar:

```text
SQLite
in-memory fake database
```

como sustituto de PostgreSQL para Integration Tests.

Athleta depende de características concretas de PostgreSQL como:

```text
partial unique indexes
CHECK constraints
PostgreSQL enums
TIMESTAMPTZ
locking
transaction isolation
DECIMAL
```

---

# 9. API Integration Tests

La API será testeada mediante:

```text
Supertest
```

contra una aplicación NestJS levantada para test.

Deben verificar:

```text
HTTP status
authentication
authorization
validation
error contract
serialization
side effects
transactional results
```

---

# 10. Ejemplo de API Test

Conceptualmente:

```text
Given
authenticated Administrative user

When
GET /clinic/persons/:id/history

Then
403 Forbidden
```

porque:

```text
ADMINISTRATIVE
does not have
CLINICAL_HISTORY_READ
```

---

# 11. Frontend Tests

Se utilizará:

```text
Vitest
React Testing Library
```

Los tests estarán orientados al comportamiento observable por el usuario.

Testear:

```text
rendered information
available actions
validation
loading state
error state
permission-based UI
form interaction
successful mutation behavior
```

---

# 12. Evitar tests de implementación

No acoplar tests a:

```text
internal React state
private component methods
exact DOM nesting
CSS class names
implementation-specific hooks
```

salvo que exista una razón concreta.

Preferir queries orientadas a accesibilidad:

```text
getByRole
getByLabelText
getByText
```

---

# 13. TanStack Query en tests

Los tests de frontend utilizarán un:

```text
real QueryClient
```

configurado para testing.

No se mockeará internamente TanStack Query de forma general.

Esto permite verificar:

```text
loading
success
error
mutation
refetch
cache invalidation
```

---

# 14. API mocking frontend

Se utilizará:

```text
MSW
Mock Service Worker
```

para interceptar el límite HTTP.

Flujo conceptual:

```text
React Component
      ↓
generated API client
      ↓
TanStack Query
      ↓
HTTP
      ↓
MSW
```

No crear una segunda API client manual solo para tests.

---

# 15. Generated client

Los tests de frontend deberán utilizar, cuando corresponda, el cliente generado mediante:

```text
OpenAPI
+
Orval
```

Esto ayuda a detectar desalineaciones reales entre frontend y contrato HTTP.

---

# 16. Playwright

Playwright se reservará para workflows completos críticos.

No se escribirá un E2E por cada campo, modal o botón menor.

Los E2E deben comprobar que varias capas integradas funcionan correctamente desde el punto de vista del usuario.

---

# 17. Workflows E2E iniciales candidatos

## Autenticación interna

```text
login
session persistence
logout
forced credential change
```

## Personas

```text
search Person
create Person
update general data
```

## Sala

```text
join Sala
create booking
register attendance
register Sala payment
```

## Clínica

```text
create ClinicalAppointment
mark ATTENDED
create ClinicalAttention
register Evolution
```

## Portal

```text
Portal login
view own reservations
cancel allowed reservation
view future clinical appointments
```

La lista se ampliará únicamente cuando un flujo sea suficientemente crítico.

---

# 18. E2E y staging

Los E2E principales de CI no deben ejecutarse contra el staging compartido como fuente de verdad del test suite.

El entorno de test debe ser:

```text
isolated
controlled
reproducible
```

Conceptualmente:

```text
CI
├── web
├── api
└── PostgreSQL test database
```

---

# 19. Smoke tests post-deploy

Staging y Production podrán tener:

```text
smoke tests
```

después de un deployment.

Ejemplos:

```text
health endpoint responds
frontend loads
login page loads
API connectivity exists
```

Estos smoke tests no reemplazan la suite de CI.

---

# 20. PostgreSQL aislado por ejecución

Cada ejecución relevante de Integration Tests debe utilizar una DB aislada.

Opciones aceptables:

```text
Testcontainers
Docker service container
CI PostgreSQL service
```

Requisitos:

```text
real PostgreSQL
clean database
migrations applied
controlled test data
```

---

# 21. Testcontainers

Se permite y recomienda utilizar:

```text
Testcontainers
```

para simplificar Integration Tests locales y CI.

Flujo conceptual:

```text
start PostgreSQL container
↓
apply migrations
↓
run tests
↓
destroy container
```

La herramienta concreta no forma parte del dominio ni debe crear dependencia arquitectónica.

---

# 22. Migrations antes de Integration Tests

La DB de test debe construirse aplicando migraciones reales.

No generar directamente un schema alternativo solo para tests.

El objetivo es probar también:

```text
migration ordering
manual SQL
partial indexes
CHECK constraints
real production schema
```

---

# 23. Estado inicial de DB

Cada suite debe partir de:

```text
known schema
+
controlled data
```

No asumir que existe previamente:

```text
User ID 1
Person ID fixed
Plan with specific database ID
```

salvo que el propio setup del test lo cree explícitamente.

---

# 24. Independencia entre tests

Un test no debe depender del resultado de otro.

Incorrecto:

```text
Test 1 creates Person
Test 2 modifies same Person
Test 3 deletes same Person
```

si el orden constituye parte implícita del test suite.

Cada escenario debe preparar sus propios requisitos.

---

# 25. Paralelización

Los tests deberán diseñarse para poder ejecutarse en paralelo cuando sea razonable.

No depender de:

```text
shared mutable global fixtures
fixed usernames reused by all tests
fixed operationIds
global database rows modified by multiple tests
```

---

# 26. Factories

Se utilizarán factories/builders pequeñas y tipadas.

Ejemplos:

```text
createTestPerson()
createTestInternalUser()
createTestSalaParticipation()
createTestClinicalAppointment()
createTestTreatment()
```

Los defaults deben generar entidades funcionalmente válidas.

---

# 27. Overrides de factories

Ejemplo conceptual:

```text
createTestInternalUser({
  roles: [Role.PROFESSOR],
  status: ACTIVE
})
```

No crear un fixture gigante que obligue a especificar decenas de campos irrelevantes para cada test.

---

# 28. Datos sintéticos

Todos los datos de test deben ser sintéticos.

Está prohibido copiar desde producción:

```text
real DNI
real patient name
real medical history
real studies
real clinical evolution
real credentials
```

---

# 29. Privacidad en artefactos de test

La misma regla aplica a:

```text
Playwright traces
screenshots
videos
CI logs
fixtures
snapshots
```

No deben contener información real de pacientes o usuarios productivos.

---

# 30. Control del tiempo

Athleta posee reglas fuertemente relacionadas con fecha/hora.

Ejemplos:

```text
future appointments
SocialWorkOrder expiration
Sala MonthYear payments
Portal cancellation windows
Treatment recent activity
```

El tiempo debe ser controlable en tests.

---

# 31. Clock abstraction

No dispersar:

```text
new Date()
Date.now()
```

por lógica de dominio difícil de controlar.

Cuando una regla dependa del presente, utilizar una abstracción/helper de reloj.

Conceptualmente:

```text
Clock.now()
Clock.today()
```

---

# 32. Reloj de test

Los tests podrán fijar un instante.

Ejemplo:

```text
2026-08-24T15:00:00Z
```

y comprobar comportamiento de forma determinística.

---

# 33. Timezone

Los tests deben ejecutarse con timezone controlada.

Timezone operativa:

```text
America/Argentina/Buenos_Aires
```

Deben existir casos que diferencien correctamente:

```text
DATE
TIMESTAMPTZ
TIME WITHOUT TIME ZONE
```

---

# 34. Tests de límites temporales

Incluir casos alrededor de:

```text
00:00 local time
month boundaries
year boundaries
appointment start/end
expiration date
DST assumptions if relevant
```

Aunque Buenos Aires actualmente no utilice cambios estacionales, el código no debe depender de la timezone de la máquina.

---

# 35. Permissions — Unit Tests

Debe existir una suite que verifique:

```text
Role
→ effective permissions
```

Ejemplos:

```text
PROFESSOR
has SALA_ROUTINE_MANAGE
does not have CLINICAL_HISTORY_READ
```

```text
ADMINISTRATIVE
has FINANCE_OPERATIONAL_READ
does not have FINANCE_EXECUTIVE_READ
```

---

# 36. Roles combinados

Testear que los roles combinados produzcan la unión correcta.

Ejemplo:

```text
PROFESSOR
+
KINESIOLOGIST
```

debe obtener capacidades de ambos sin crear un rol especial.

---

# 37. Permissions — API Tests

Los endpoints sensibles deberán tener tests HTTP que demuestren autorización efectiva.

Ejemplo:

```text
Professor
→ Clinical History endpoint
→ 403

Kinesiologist
→ Clinical History endpoint
→ 200

Administrative
→ Clinical History endpoint
→ 403

General Admin
→ Clinical History endpoint
→ 200
```

---

# 38. Permisos especialmente sensibles

Priorizar tests sobre:

```text
CLINICAL_HISTORY_READ
CLINICAL_HISTORY_WRITE
FINANCE_EXECUTIVE_READ
TEAM_GENERAL_ADMIN_MANAGE
PEOPLE_GLOBAL_INACTIVATE
CLINIC_INDICATION_CONTENT_MANAGE
```

---

# 39. Auth vs permission

Testear separadamente:

```text
no session
→ 401
```

```text
valid session, missing permission
→ 403
```

```text
valid session + permission, invalid business state
→ domain-specific 409/422/etc.
```

No mezclar estos conceptos.

---

# 40. Positive and Negative Testing

Toda regla de negocio relevante debe incluir al menos:

```text
allowed scenario
+
blocked scenario
```

Ejemplo:

```text
Professor without assigned students
→ can be inactivated
```

```text
Professor with assigned students
→ PROFESSOR_HAS_ASSIGNED_STUDENTS
```

---

# 41. Boundary cases

Cuando existan límites funcionales, testear al menos:

```text
below boundary
exact boundary
above boundary
```

Ejemplo para una futura ventana de cancelación:

```text
121 minutes before
120 minutes before
119 minutes before
```

si ese fuera el valor funcional definido.

---

# 42. Transacciones

Las operaciones transaccionales deben ser verificadas con PostgreSQL real.

No alcanza con probar:

```text
throws error
```

También debe comprobarse:

```text
database state after rollback
```

---

# 43. MarkAppointmentAttended

Test mínimo:

```text
Given
SCHEDULED ClinicalAppointment

When
MarkAppointmentAttended succeeds

Then
Appointment = ATTENDED
ClinicalAttention exists
```

---

# 44. Rollback de MarkAppointmentAttended

Forzar una falla posterior a la modificación del Appointment.

Resultado esperado:

```text
Appointment remains SCHEDULED
ClinicalAttention does not exist
```

Esto prueba la atomicidad real.

---

# 45. ReplaceRoutine transaction

Testear:

```text
old Routine ACTIVE
new Routine created
```

Resultado:

```text
old = HISTORICAL
new = ACTIVE
```

y nunca:

```text
two ACTIVE routines
```

---

# 46. InactivatePerson transaction

La suite debe verificar que la operación transversal no deje estado parcial.

Ante fallo durante el proceso:

```text
Sala
Clinic
Auth
```

deben permanecer consistentes según el rollback esperado.

---

# 47. Concurrencia

Las invariantes susceptibles a race conditions tendrán tests de concurrencia específicos.

No es necesario probar concurrencia en cada CRUD.

---

# 48. Casos concurrentes prioritarios

```text
two concurrent JoinSala requests
two concurrent ReplaceRoutine operations
two concurrent SalaPayments for same MonthYear
two concurrent bookings for last Sala capacity slot
two concurrent updates using same version
```

---

# 49. Active SalaParticipation concurrency

Ejecutar dos intentos concurrentes de crear participación activa para la misma Persona.

Resultado:

```text
one succeeds
one fails
```

y DB final:

```text
exactly one active SalaParticipation
```

---

# 50. SalaPayment concurrency

Ejecutar dos requests diferentes para:

```text
same Person
same year
same month
```

Resultado:

```text
only one persisted payment
```

bajo el modelo funcional actual.

---

# 51. Optimistic concurrency

Dado:

```text
Evolution version = 4
```

dos usuarios leen la versión 4.

Usuario A guarda:

```text
version 4 → 5
```

Usuario B intenta guardar usando 4.

Resultado:

```text
409
CONCURRENT_MODIFICATION
```

El cambio de A no debe ser sobrescrito.

---

# 52. PostgreSQL constraints

Las constraints críticas deben tener tests directos.

Incluso si Application Service ya protege la regla.

Ejemplo:

```text
insert directly through Prisma/repository
second active SalaParticipation
```

debe fallar por DB.

---

# 53. Por qué probar constraints directamente

La constraint protege contra:

```text
bug in Application Service
future code path bypass
concurrent request
manual integration mistake
```

El test verifica que la última barrera existe realmente.

---

# 54. Foreign Key tests

Para relaciones críticas, comprobar que DB impida referencias inexistentes.

Ejemplo:

```text
Treatment.personId
→ nonexistent UUID
```

debe fallar.

---

# 55. RESTRICT tests

Cuando un Aggregate Root posee historia:

```text
Person
→ Treatment
```

un intento de eliminación física inválida debe fallar.

No confiar exclusivamente en que el frontend nunca muestre el botón.

---

# 56. Migrations desde cero

CI debe verificar que una DB completamente vacía pueda ejecutar:

```text
all migrations
```

en orden.

Esto detecta:

```text
broken migration
invalid SQL
dependency ordering
manual partial index errors
CHECK errors
```

---

# 57. No depender de DB histórica

Una migración no se considera válida solo porque funcionó en la DB local de un desarrollador que fue evolucionando durante meses.

Debe funcionar desde el historial versionado.

---

# 58. Migration tests en CI

Como mínimo:

```text
create clean PostgreSQL
↓
prisma migrate deploy
↓
run integration suite
```

---

# 59. OpenAPI

El contrato OpenAPI generado por NestJS forma parte del contrato técnico.

CI debe detectar cambios involuntarios.

---

# 60. Orval synchronization

Cuando cambie OpenAPI:

```text
generate OpenAPI
↓
run Orval
↓
verify generated client
```

El cliente generado no debe quedar desactualizado.

---

# 61. CI drift check

Podrá utilizarse un flujo equivalente a:

```text
pnpm generate:api
git diff --exit-code
```

Si la generación produce cambios no versionados:

```text
CI fails
```

---

# 62. API error contract

Los tests deben verificar principalmente:

```text
statusCode
code
details when relevant
```

Ejemplo:

```json
{
  "statusCode": 409,
  "code": "ACTIVE_SALA_PARTICIPATION_ALREADY_EXISTS"
}
```

---

# 63. Error message

El campo:

```text
message
```

es humano y puede modificarse.

Los tests no deben depender excesivamente del texto exacto salvo que ese copy sea un requerimiento explícito.

---

# 64. Stable error codes

Los códigos programáticos sí constituyen contrato técnico.

Cambiar:

```text
PROFESSOR_HAS_ASSIGNED_STUDENTS
```

requiere revisar consumidores y tests.

---

# 65. Validation tests

Los endpoints deben probar:

```text
missing required field
invalid enum
invalid date
invalid UUID
invalid amount
invalid string length
unknown field where relevant
```

La validación backend es obligatoria aunque el frontend utilice Zod.

---

# 66. Security tests

La suite debe cubrir comportamiento relevante de seguridad sin intentar reemplazar una auditoría de seguridad completa.

Ejemplos:

```text
expired session rejected
revoked session rejected
inactive user rejected
Portal inactive Person rejected
missing CSRF rejected when applicable
invalid Origin rejected where applicable
```

---

# 67. Credential tests

Verificar:

```text
temporary credential requires change
password reset invalidates sessions
PIN reset invalidates Portal sessions
credential hash is never returned
```

No verificar secretos reales en snapshots.

---

# 68. Portal brute-force protection

Los tests de Auth deberán cubrir el comportamiento lógico de:

```text
failed attempts
progressive temporary lockout
successful reset of failure state when appropriate
```

No es necesario generar miles de requests para demostrar la política.

---

# 69. File tests

El módulo Files deberá incluir tests sobre:

```text
allowed MIME
disallowed MIME
file signature mismatch
size validation
authorization before signed URL
DB/S3 compensation behavior
```

---

# 70. S3 en tests

No utilizar el bucket productivo.

Para integration tests podrá utilizarse:

```text
S3-compatible local service
mocked storage adapter
dedicated test bucket
```

según el nivel que se intenta probar.

Los tests del dominio Files deben mantener claro cuándo prueban lógica y cuándo prueban integración real con almacenamiento.

---

# 71. Compensación S3

Debe existir al menos un test sobre:

```text
S3 upload succeeds
DB transaction fails
```

esperando:

```text
compensating delete attempted
```

---

# 72. Frontend forms

Los formularios importantes deben testear:

```text
required validation
invalid input
submit
server-side error
success
disabled/loading state
```

No repetir todas las reglas complejas de negocio del backend como lógica autoritativa frontend.

---

# 73. Server error rendering

Ejemplo:

```text
API returns
PROFESSOR_HAS_ASSIGNED_STUDENTS
```

El frontend debe mostrar la respuesta esperada al usuario sin necesitar interpretar mensajes SQL.

---

# 74. Permission-based rendering

Testear que la UI no muestre acciones que el rol no posee.

Ejemplo:

```text
Administrative
→ no Clinical Evolution editing controls
```

Pero este test no reemplaza el API permission test.

---

# 75. Frontend route protection

Debe testearse el comportamiento al intentar navegar directamente a secciones no autorizadas.

Sin embargo, la seguridad real sigue estando en backend.

---

# 76. MSW scenarios

MSW debe permitir escenarios explícitos:

```text
success
validation error
permission error
domain conflict
server error
slow response when useful
```

Evitar handlers globales que siempre devuelvan `200`.

---

# 77. No fake generated client

No crear helpers que sustituyan completamente al cliente Orval y terminen probando una API inexistente.

Mockear el transporte HTTP, no recrear la capa de acceso.

---

# 78. Snapshots

El uso de snapshots será limitado.

Evitar:

```text
giant API response snapshot
entire page DOM snapshot
large serialized Prisma record snapshot
```

Preferir assertions explícitas.

---

# 79. Snapshot válido

Un snapshot puede utilizarse cuando el output:

```text
is intentionally stable
is difficult to assert manually
benefits materially from regression detection
```

Debe ser pequeño y revisable.

---

# 80. Coverage

Se generará reporte de coverage.

No se establecerá inicialmente:

```text
100% mandatory coverage
```

ni un porcentaje global arbitrario como única señal de calidad.

---

# 81. Coverage y reglas críticas

Una regla crítica sin test es un problema aunque el proyecto tenga cobertura global alta.

Priorizar cobertura sobre:

```text
state transitions
permissions
data integrity
transactions
financial operations
clinical privacy
authentication
```

---

# 82. Tests triviales

Evitar tests cuya única función sea incrementar coverage.

Ejemplo poco útil:

```text
expect(true).toBe(true)
```

o verificar getters sin lógica solo para aumentar métricas.

---

# 83. Regression tests

Todo bug corregido debe incorporar un test de regresión cuando sea razonablemente reproducible.

Flujo recomendado:

```text
reproduce bug
↓
write failing test
↓
implement fix
↓
test passes
```

---

# 84. Bug de DB

Si el bug estaba relacionado con:

```text
constraint
race condition
transaction
timezone
Prisma mapping
```

el test de regresión debe ejecutarse en el nivel de integración adecuado.

No convertirlo artificialmente en unit test si eso oculta la causa real.

---

# 85. Bug de UI

Si el bug es puramente de comportamiento frontend:

```text
React Testing Library
```

es normalmente preferible a Playwright.

Usar Playwright si el bug aparece únicamente al integrar múltiples capas.

---

# 86. Definition of Done

Una feature no está terminada únicamente porque:

```text
compiles
looks correct manually
works once locally
```

Debe cumplir las verificaciones aplicables.

---

# 87. Checks mínimos antes de finalizar una tarea

Codex deberá ejecutar, según corresponda:

```text
lint
typecheck
unit tests
integration tests
build
```

---

# 88. Playwright dentro de Definition of Done

Ejecutar Playwright cuando la modificación:

```text
changes a critical E2E workflow
changes authentication
changes routing/authorization
changes a workflow already covered by E2E
```

No ejecutar necesariamente toda la suite E2E por una modificación interna trivial durante desarrollo local, aunque CI puede hacerlo según costo.

---

# 89. Tests específicos de una feature

Además de la suite global, antes de finalizar una tarea debe ejecutarse primero el subconjunto directamente relacionado con la feature.

Ejemplo:

```text
pnpm test treatment
```

o equivalente.

Después ejecutar los checks globales requeridos.

---

# 90. `test.skip`

No utilizar:

```text
test.skip
it.skip
describe.skip
```

para ocultar un fallo y completar una tarea.

---

# 91. `.only`

No debe quedar versionado:

```text
test.only
it.only
describe.only
```

CI debería poder detectarlo.

---

# 92. Tests comentados

No comentar tests fallidos para hacer pasar CI.

Si la funcionalidad fue deliberadamente eliminada:

```text
remove or update test
```

con una razón clara.

---

# 93. Assertions debilitadas

No cambiar:

```text
expect(result).toEqual(expected)
```

por una assertion irrelevante únicamente para hacer pasar el test.

El test debe seguir comprobando la regla original, salvo que la especificación haya cambiado.

---

# 94. Flaky tests

Un test flaky debe investigarse.

No marcarlo como skip permanente.

Causas frecuentes a revisar:

```text
shared DB state
real clock
random data collisions
unawaited promises
race conditions
shared ports
network dependency
```

---

# 95. Random test data

Si se utiliza generación aleatoria:

- debe evitar colisiones;
- debe permitir reproducibilidad cuando falle;
- el error debe mostrar suficiente información para repetir el escenario.

No depender de aleatoriedad para la semántica principal del test.

---

# 96. PENDING_FUNCTIONAL_DEFINITION

No escribir tests que conviertan una duda funcional en especificación.

Ejemplo pendiente:

```text
ClinicalAttention
↔
Evolution cardinality
```

No escribir:

```text
cannot create second Evolution
```

hasta que esa regla sea confirmada.

---

# 97. Tests neutrales ante pendientes

Sí se puede testear lo ya confirmado.

Ejemplo:

```text
Evolution always requires ClinicalAttention
```

si esa relación está confirmada.

Mantener neutral lo que todavía está pendiente.

---

# 98. Cambio de especificación

Cuando una respuesta del Analista modifique una regla:

```text
update domain documentation
↓
update tests
↓
update implementation
```

No ajustar solo el test para adaptarse al código existente.

---

# 99. Orden recomendado al desarrollar una feature

```text
1. understand domain rule
2. write/update Domain/Application unit tests
3. implement domain behavior
4. write repository/DB integration tests
5. implement persistence
6. write API integration tests
7. implement HTTP layer
8. write frontend component tests
9. implement UI
10. add/update E2E if workflow is critical
11. run full applicable validation
```

No es necesario aplicar TDD estricto para cada línea, pero las reglas deben quedar verificadas.

---

# 100. Testing vertical slice

Una feature completa debe poder demostrar:

```text
domain behavior
+
persistence behavior
+
HTTP contract
+
frontend behavior
```

según las capas que realmente modifica.

No considerar completa una feature full-stack si solo tiene tests del componente React.

---

# 101. CI pipeline

Pipeline mínimo:

```text
pnpm install
↓
lint
↓
typecheck
↓
unit tests
↓
PostgreSQL migrations on clean DB
↓
integration/API tests
↓
frontend tests
↓
build
```

Playwright podrá ejecutarse posteriormente en el mismo pipeline o en un job separado.

---

# 102. CI fail-fast

Una falla debe marcar el pipeline como fallido.

No ignorar mediante:

```text
|| true
continue-on-error
```

en checks críticos.

---

# 103. Parallel CI jobs

Cuando el tiempo del pipeline lo justifique podrán separarse:

```text
lint/typecheck
backend unit
backend integration
frontend
e2e
build
```

sin sacrificar dependencias necesarias.

---

# 104. Build verification

Debe comprobarse:

```text
apps/web builds
apps/api builds
packages build/typecheck
```

No asumir que tests exitosos garantizan que producción compila.

---

# 105. Generated code

El código generado por Orval no requiere tests unitarios manuales.

Debe verificarse mediante:

```text
generation succeeds
generated output synchronized
consumer integration works
```

---

# 106. Libraries externas

No escribir tests para demostrar que una librería madura funciona internamente.

Ejemplo:

```text
do not test that Zod rejects a number when schema says string
```

salvo que se pruebe nuestra configuración específica o regla construida sobre ella.

---

# 107. Prisma queries

Los repositories con queries no triviales deben tener Integration Tests.

Especialmente:

```text
filters
date boundaries
status queries
financial aggregation
active participation lookup
future appointments
```

---

# 108. Read Models

Los Read Models complejos deben testear:

```text
correct inclusion
correct exclusion
filters
ordering
totals
permission-related visibility
```

Preferentemente contra PostgreSQL real si dependen de queries relevantes.

---

# 109. Financial calculations

Las operaciones financieras deben testear:

```text
integer ARS behavior
USD two-decimal behavior
totals
filters by cash date
MonthYear
```

No utilizar floats que introduzcan errores artificiales.

---

# 110. Amount representation

Para ARS:

```text
no decimals
```

Los tests deben reflejar esta decisión.

Ejemplo:

```text
150000
```

no:

```text
150000.50
```

Para cotización USD:

```text
two decimals
```

---

# 111. Portal authorization

Los tests deben verificar estrictamente ownership.

Ejemplo:

```text
Person A
cannot read/cancel
Person B reservation
```

incluso si conoce el UUID.

---

# 112. Internal ownership

No agregar tests que impongan accidentalmente una restricción inexistente.

Ejemplo incorrecto:

```text
Professor cannot access another professor's student
```

si el dominio permite ese acceso.

Testing debe seguir `PERMISSIONS.md`, no intuiciones.

---

# 113. Clinical privacy

Debe existir cobertura específica para evitar regresiones de exposición clínica.

Ejemplo:

```text
Administrative agenda response
```

no debe contener:

```text
Evolution.content
clinicalHistory
ClinicalEvaluation details
```

aunque la query interna haya unido esas tablas.

---

# 114. DTO privacy tests

Para endpoints sensibles, verificar explícitamente ausencia de campos.

Ejemplo conceptual:

```text
expect(response.body).not.toHaveProperty("evolutions")
```

cuando el actor no debe recibirlas.

---

# 115. Logging tests

Cuando sea viable, verificar que operaciones sensibles no incluyan en logs:

```text
password
PIN
session token
clinical body
```

No es necesario snapshotear todos los logs.

---

# 116. Error sanitization

En producción/API tests adecuados, verificar que errores internos no expongan:

```text
SQL
stack trace
filesystem path
secret
```

al cliente.

---

# 117. Test naming

Los nombres deben describir comportamiento.

Preferir:

```text
rejects inactivation when professor has assigned students
```

sobre:

```text
test professor 2
```

---

# 118. Arrange / Act / Assert

Los tests deberían mantener estructura legible:

```text
Arrange
Act
Assert
```

sin requerir comentarios obligatorios cuando el código sea evidente.

---

# 119. Un comportamiento por test

Preferir tests enfocados.

No convertir un test en un workflow gigante que verifica veinte reglas distintas, salvo que sea deliberadamente un E2E.

---

# 120. Helpers de test

Los helpers deben reducir ruido, no ocultar la lógica principal.

Evitar helpers que ejecuten toda la feature y vuelvan imposible comprender qué está siendo testeado.

---

# 121. Cleanup

Los tests deben limpiar recursos externos cuando corresponda.

Ejemplos:

```text
temporary S3 objects
containers
temporary files
```

La DB aislada puede descartarse completamente al finalizar la suite.

---

# 122. Local developer workflow

El desarrollador/Codex debe poder ejecutar:

```text
unit tests
integration tests
frontend tests
E2E tests
```

con comandos documentados y reproducibles.

No depender exclusivamente del entorno de CI.

---

# 123. Scripts

El `package.json` raíz deberá exponer scripts coherentes.

Ejemplo conceptual:

```text
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
```

Los nombres definitivos pueden ajustarse, pero deben mantenerse simples y documentados.

---

# 124. Turborepo

Turborepo podrá coordinar:

```text
test
lint
typecheck
build
```

entre apps y packages.

La cache no debe ocultar tests que dependen de infraestructura o estado externo.

---

# 125. E2E data setup

Playwright no debe depender de crear todo mediante clicks si eso vuelve los tests lentos y frágiles.

Se permite preparar precondiciones mediante:

```text
test API
factories
database seeding scoped to test
```

siempre que el comportamiento bajo prueba siga ocurriendo vía UI.

---

# 126. E2E cleanup

Cada workflow debe:

```text
use unique synthetic data
or
clean up explicitly
```

para evitar colisiones entre ejecuciones.

---

# 127. Screenshots y videos

Playwright podrá generar artefactos principalmente ante fallo.

Evitar guardar grandes volúmenes de videos exitosos si no aportan valor y encarecen CI.

---

# 128. Browser coverage

Inicialmente Playwright podrá priorizar:

```text
Chromium
```

para la suite frecuente.

Podrán ejecutarse verificaciones periódicas en otros engines/navegadores si el producto lo requiere.

No multiplicar el costo desde V1 sin necesidad.

---

# 129. Responsive behavior

Dado que Athleta es web responsive, flows críticos deberán validarse también en al menos un viewport móvil representativo cuando el comportamiento cambie materialmente.

No es necesario duplicar toda la suite E2E desktop en mobile.

---

# 130. Accessibility

Los component tests deben favorecer queries accesibles.

Podrán incorporarse herramientas automáticas adicionales de accessibility posteriormente.

No reemplazan revisión real de UX.

---

# 131. Performance testing

No forma parte del test suite inicial ejecutar load tests complejos.

Se podrán agregar cuando existan:

```text
real traffic expectations
measured bottlenecks
capacity requirements
```

---

# 132. Security scanning

Dependency/security scanning puede complementar CI.

No reemplaza tests funcionales ni revisión de autorización.

---

# 133. No tests contra Production

La suite normal nunca:

```text
creates
modifies
deletes
```

datos de producción.

Producción solo admite smoke/read-only verification diseñada específicamente para ser segura.

---

# 134. Production data

No descargar DB productiva para utilizarla como fixture local.

Si alguna vez se necesitara investigar un problema con datos representativos deberá existir un proceso explícito de anonimización fuera del flujo normal de testing.

---

# 135. Revisión de una Pull Request

Una PR que modifica reglas de dominio debería mostrar:

```text
implementation
+
tests demonstrating rule
```

Cuando una modificación no tenga test, debe existir una razón técnica clara.

---

# 136. Cambios de DB

Toda PR con migración debe incluir:

```text
migration
relevant Prisma changes
integration tests
```

y revisión de constraints.

---

# 137. Cambios de permisos

Toda modificación de:

```text
Role → Permission
```

debe incluir:

```text
permission unit tests
API authorization tests where relevant
```

---

# 138. Cambios de state transitions

Toda nueva transición debe incluir:

```text
allowed transition test
invalid transition test
side-effect tests
rollback test if transactional
```

---

# 139. Cambios financieros

Toda operación financiera nueva debe revisar:

```text
idempotency
integer ARS representation
authorization
cash date behavior
totals impact
```

---

# 140. Cambios clínicos

Toda operación clínica nueva debe revisar:

```text
authorization
privacy
historical preservation
author attribution
optimistic concurrency if applicable
```

---

# 141. Checklist para Codex

Antes de finalizar una tarea, Codex debe responder internamente:

```text
What business rule changed?
Which existing tests cover it?
Which new tests are required?
Does this touch PostgreSQL behavior?
Does this require a transaction test?
Does this affect permissions?
Does this affect privacy?
Does this affect E2E critical workflow?
Is any behavior still PENDING_FUNCTIONAL_DEFINITION?
```

---

# 142. Prohibiciones para Codex

Codex no debe:

```text
skip failing tests
delete tests just to pass CI
weaken assertions without justification
mock away the behavior being implemented
replace PostgreSQL integration tests with SQLite
invent expected behavior for pending functional rules
use production data
leave .only committed
```

---

# 143. Definition of Done resumida

Una feature se considera técnicamente terminada cuando:

1. Respeta la documentación funcional y técnica vigente.
2. Compila.
3. Pasa lint.
4. Pasa typecheck.
5. Posee Unit Tests para lógica nueva relevante.
6. Posee Integration Tests cuando toca DB/transactions/constraints.
7. Posee API Tests cuando cambia contrato HTTP/autorización.
8. Posee frontend tests cuando cambia comportamiento de UI.
9. Posee E2E cuando afecta un workflow crítico ya cubierto o introduce uno nuevo crítico.
10. No introduce tests skip/only.
11. No congela reglas pendientes por inferencia.
12. El build finaliza correctamente.

---

# 144. Principios finales

1. Los tests verifican comportamiento, no implementación accidental.
2. La mayoría de reglas de negocio se prueban rápido mediante Unit Tests.
3. PostgreSQL se prueba con PostgreSQL real.
4. Las constraints importantes tienen tests directos.
5. Las transacciones se prueban verificando estado final y rollback.
6. Las race conditions importantes tienen tests concurrentes.
7. Los permisos se verifican tanto como política como mediante HTTP.
8. La privacidad clínica requiere tests explícitos de no exposición.
9. Frontend utiliza React Testing Library y MSW.
10. Playwright se reserva para workflows críticos.
11. Los datos de test son siempre sintéticos.
12. El tiempo y timezone deben ser controlables.
13. Los errores se prueban mediante códigos programáticos estables.
14. OpenAPI y Orval deben permanecer sincronizados.
15. Las migraciones deben poder aplicarse desde cero.
16. Coverage es una señal, no una meta absoluta.
17. Todo bug reproducible debe incorporar test de regresión.
18. Una feature no está terminada solamente porque funciona manualmente.
19. Nunca se modifican tests únicamente para ocultar un fallo.
20. No se convierten dudas funcionales en especificaciones mediante tests.

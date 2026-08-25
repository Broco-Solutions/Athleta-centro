# DATABASE.md — Athleta Manager

## 1. Propósito

Este documento define el diseño físico preliminar de base de datos para Athleta Manager.

Su objetivo es traducir a PostgreSQL + Prisma las decisiones ya cerradas en:

```text
docs/architecture/ARCHITECTURE.md
docs/architecture/STACK.md
docs/architecture/SECURITY.md
docs/architecture/INFRASTRUCTURE.md

docs/domain/DOMAIN_MODEL.md
docs/domain/STATE_TRANSITIONS.md
docs/domain/PERMISSIONS.md
docs/domain/DATA_INTEGRITY.md
```

Este documento define:

- estrategia PostgreSQL;
- estrategia Prisma;
- naming;
- tipos;
- Primary Keys;
- timestamps;
- fechas y horarios;
- importes;
- enums;
- relaciones;
- constraints;
- índices;
- sesiones;
- credenciales;
- auditoría;
- archivos;
- snapshots;
- idempotencia;
- optimistic concurrency;
- seeds;
- testing de DB;
- decisiones bloqueadas por definiciones funcionales pendientes.

No reemplaza al modelo de dominio.

El schema físico debe derivarse del dominio y no al revés.

---

## 2. Motor de base de datos

Se utilizará:

```text
PostgreSQL
```

como única base relacional principal de Athleta Manager.

PostgreSQL será administrado inicialmente por Railway.

No se utilizarán inicialmente MySQL, SQLite, MongoDB o DynamoDB como fuente de verdad del sistema.

---

## 3. Schema PostgreSQL

Se utilizará inicialmente un único schema:

```text
public
```

No se separarán físicamente los módulos en schemas PostgreSQL como `people.*`, `sala.*`, `clinic.*` o `finance.*`.

Los límites se mantienen a nivel de arquitectura de código y módulos NestJS.

---

## 4. Prisma

Se utilizará:

```text
Prisma ORM
Prisma Migrate
```

El schema principal estará en:

```text
apps/api/prisma/schema.prisma
```

Será un único schema central porque existe una sola PostgreSQL, hay Foreign Keys entre módulos, las migraciones deben coordinarse y la integridad referencial cruza dominios.

---

## 5. Organización de `schema.prisma`

El archivo deberá mantenerse organizado mediante secciones claras:

```text
// AUTH
// TEAM
// PEOPLE
// SALA
// CLINIC
// FINANCE
// FILES
// AUDIT
```

No dividir el schema en múltiples archivos salvo decisión técnica posterior explícita.

---

## 6. Naming

El código técnico utilizará inglés.

Prisma:

```text
PascalCase para models/enums
camelCase para fields
```

PostgreSQL:

```text
snake_case para tablas y columnas
```

Ejemplo:

```prisma
model ClinicalAppointment {
  id       String @id @default(uuid()) @db.Uuid
  personId String @map("person_id") @db.Uuid

  @@map("clinical_appointments")
}
```

---

## 7. Primary Keys

Las entidades persistentes principales utilizarán UUID.

Patrón Prisma:

```prisma
id String @id @default(uuid()) @db.Uuid
```

No se utilizarán IDs secuenciales globales como PK.

Un número visible para negocio, si posteriormente existiera, será un campo independiente.

---

## 8. Timestamps estándar

Las entidades persistentes relevantes tendrán normalmente:

```text
createdAt
updatedAt
```

Mapeados a:

```text
created_at
updated_at
```

Tipo PostgreSQL:

```text
TIMESTAMPTZ
```

No agregar `deletedAt` universalmente.

---

## 9. UTC y timezone operativo

Todos los timestamps reales se persistirán de manera consistente en UTC.

Timezone operativo de aplicación:

```text
America/Argentina/Buenos_Aires
```

La conversión para visualización y reglas operativas se realiza en aplicación.

---

## 10. `TIMESTAMPTZ`

Usar para hechos temporales reales como:

```text
ClinicalAppointment.startAt
ClinicalAttention.occurredAt
Session.expiresAt
Session.lastActivityAt
SalaClinicalIndication.closedAt
createdAt
updatedAt
```

---

## 11. `DATE`

Usar PostgreSQL `DATE` cuando el dominio representa una fecha sin hora.

Ejemplos:

```text
Person.birthDate
SalaParticipation.startDate
SalaParticipation.endDate
Treatment.startDate
FixedSalaBooking.startDate
FixedSalaBooking.endDate
SocialWorkOrder.expirationDate
```

No modelar una fecha pura como un timestamp a medianoche.

---

## 12. `TIME WITHOUT TIME ZONE`

Los horarios recurrentes de Sala se almacenarán como hora local.

Ejemplo:

```text
SalaScheduleSlot.startTime
SalaScheduleSlot.endTime
```

No representan timestamps independientes.

---

## 13. MonthYear

Para conceptos mensuales se almacenarán columnas separadas.

Ejemplo `SalaPayment`:

```text
year
month
```

Con:

```text
CHECK (month BETWEEN 1 AND 12)
```

No utilizar una fecha ficticia para representar Mes/Año.

---

## 14. Importes monetarios

Los importes operativos en pesos argentinos se almacenarán sin decimales.

Tipo recomendado:

```text
DECIMAL(14,0)
```

Aplica inicialmente a:

```text
SalaPayment.amount
ClinicalIncome.amount
Expense.amount
Plan.monthlyAmount
otros importes expresados en ARS
```

No utilizar `FLOAT` o `DOUBLE PRECISION` para dinero.

---

## 15. Dólar y cotización USD

Los valores relacionados con dólar utilizarán dos decimales.

Tipo recomendado:

```text
DECIMAL(14,2)
```

Ejemplos:

```text
ExchangeRate.rate
montos en USD si posteriormente se persisten
```

La cotización de referencia no utilizará más de dos decimales en el modelo inicial.

---

## 16. Prisma Decimal

Todo campo `DECIMAL/NUMERIC` será manipulado mediante:

```text
Prisma.Decimal
```

La aplicación no debe utilizar `number` de JavaScript como fuente autoritativa para cálculos monetarios persistentes.

---

## 17. Enums

Usar enums Prisma/PostgreSQL para conjuntos funcionalmente cerrados.

Ejemplos:

```text
Role
InternalUserStatus
RoutineStatus
SalaOccurrenceStatus
ClinicalAppointmentStatus
TreatmentStatus
TrainingCondition
SessionKind
```

No transformar catálogos administrables en enums.

---

## 18. Role

```prisma
enum Role {
  PROFESSOR
  KINESIOLOGIST
  OSTEOPATH
  ADMINISTRATIVE
  GENERAL_ADMIN
  BROCO_SUPPORT
}
```

Los permisos no se persisten.

---

## 19. InternalUserStatus

```prisma
enum InternalUserStatus {
  ACTIVE
  INACTIVE
}
```

---

## 20. RoutineStatus

```prisma
enum RoutineStatus {
  ACTIVE
  HISTORICAL
}
```

---

## 21. SalaOccurrenceStatus

```prisma
enum SalaOccurrenceStatus {
  RESERVED
  ATTENDED
  CANCELLED
  ABSENT
}
```

---

## 22. ClinicalAppointmentStatus

```prisma
enum ClinicalAppointmentStatus {
  SCHEDULED
  ATTENDED
  CANCELLED
  ABSENT
}
```

---

## 23. TreatmentStatus

```prisma
enum TreatmentStatus {
  IN_PROGRESS
  FINISHED
}
```

---

## 24. TrainingCondition

```prisma
enum TrainingCondition {
  NO_RESTRICTIONS
  RESTRICTED
  DO_NOT_TRAIN
}
```

---

## 25. Roles de InternalUser

Los roles combinables se representarán mediante tabla de relación:

```text
internal_users
internal_user_roles
```

`internal_user_roles` contendrá:

```text
internal_user_id
role
```

Con:

```text
UNIQUE(internal_user_id, role)
```

Los roles se conservan si el usuario pasa a `INACTIVE`. La aplicación impide remover el último rol de una cuenta `ACTIVE` y exige al menos un rol para reactivarla.

No utilizar JSONB, arrays PostgreSQL o strings separados por comas para roles.

---

## 26. Permissions

No crear tablas `permissions`, `role_permissions` ni `user_permissions`.

Los permisos se derivan en código desde:

```text
Role → Permission[]
```

según `PERMISSIONS.md`.

---

## 27. Person

`Person` representa la identidad transversal.

Campos conceptuales iniciales:

```text
id
firstName
lastName
dni
normalizedDni
birthDate
phone
email?
general data
createdAt
updatedAt
```

La lista final deberá alinearse con la definición funcional vigente.

---

## 28. `Person.status`

No persistir inicialmente `Person.status`.

El estado se deriva de:

```text
active SalaParticipation
OR
Treatment IN_PROGRESS
OR
future ClinicalAppointment SCHEDULED
```

No crear una segunda fuente de verdad.

---

## 29. `isStudent`

No persistir `Person.isStudent`.

Se deriva de la existencia de una participación activa de Sala.

---

## 30. `isPatient`

No persistir `Person.isPatient`.

Además, la definición exacta de qué crea el vínculo clínico sigue pendiente de confirmación funcional.

---

## 31. DNI

El DNI será string.

Campos conceptuales:

```text
dni
normalized_dni
```

`normalized_dni` será indexado.

No tendrá inicialmente `UNIQUE`.

La unicidad permanece:

```text
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

---

## 32. InternalUser

Campos conceptuales:

```text
id
firstName
lastName
email
normalizedEmail
status
createdAt
updatedAt
```

más los datos de equipo definidos funcionalmente.

---

## 33. Email de InternalUser

`normalizedEmail` tendrá:

```text
UNIQUE
```

La normalización mínima será `trim + lowercase`.

El login utilizará el valor normalizado.

---

## 34. SalaParticipation

No persistirá un enum ACTIVE/ENDED.

Se representará mediante vigencia:

```text
startDate
endDate?
```

Regla:

```text
ACTIVE = endDate IS NULL
ENDED  = endDate IS NOT NULL
```

---

## 35. Una participación activa

PostgreSQL deberá impedir más de una participación activa para la misma Persona.

Constraint conceptual:

```sql
CREATE UNIQUE INDEX ...
ON sala_participations (person_id)
WHERE end_date IS NULL;
```

Esta constraint probablemente requerirá SQL manual dentro de Prisma Migrate.

---

## 36. SalaParticipation — relaciones principales

Conceptualmente:

```text
personId
mainProfessorId
planId
startDate
endDate
```

Foreign Keys:

```text
personId → Person
mainProfessorId → InternalUser
planId → Plan
```

La aplicación valida que `mainProfessorId` corresponda a un usuario ACTIVE con rol PROFESSOR.

---

## 37. Routine

La Rutina tendrá estado persistido:

```text
ACTIVE
HISTORICAL
```

Campos conceptuales:

```text
id
personId
salaParticipationId?
status
version
createdAt
updatedAt
```

---

## 38. Una Routine activa

PostgreSQL deberá impedir dos Rutinas activas en el mismo contexto.

Constraint parcial conceptual:

```text
UNIQUE(person_id)
WHERE status = 'ACTIVE'
```

La clave definitiva puede utilizar `sala_participation_id` si el diseño final determina que es el ownership correcto.

---

## 39. RoutineDay

Entidad hija de `Routine`.

Conceptualmente:

```text
id
routineId
position/dayNumber
name?
```

FK:

```text
routineId → Routine
```

Puede utilizar `ON DELETE CASCADE` únicamente si forma parte de una composición realmente eliminable.

---

## 40. RoutineExercise

Entidad hija de `RoutineDay`.

Conceptualmente:

```text
id
routineDayId
exerciseDefinitionId
position
configuration
```

La estrategia final de snapshot del ejercicio depende de la definición funcional correspondiente.

---

## 41. FixedSalaBooking

No tendrá enum de estado.

Representación:

```text
startDate
endDate?
```

más la recurrencia:

```text
personId
salaParticipationId
weekday
schedule slot/time
```

Su estado se deriva de vigencia.

---

## 42. Duplicados de FixedSalaBooking

Debe evitarse más de una recurrencia activa exactamente equivalente.

La constraint final se definirá cuando quede cerrado el modelo exacto de slots.

No confundir duplicado exacto con superposición horaria.

---

## 43. SalaScheduleSlot

Representa configuración recurrente.

Campos conceptuales:

```text
id
weekday
startTime
endTime
specificCapacity?
version
validity if required
```

Regla estructural:

```text
endTime > startTime
```

mediante validación de aplicación y `CHECK` cuando corresponda.

---

## 44. SalaScheduleException

Representa excepciones concretas por fecha.

Campos conceptuales:

```text
id
date
scheduleSlotId?
type
capacityOverride?
```

La estructura final depende de las respuestas funcionales sobre cambios y excepciones.

---

## 45. SalaOccurrence

Campos conceptuales:

```text
id
personId
date/startAt
status
origin
fixedBookingId?
oneOffReservationId?
lastModifiedBy?
lastModifiedAt?
```

La materialización exacta de ocurrencias futuras permanece pendiente de definición funcional/técnica final.

---

## 46. ClinicalAppointment

Campos conceptuales:

```text
id
personId
professionalId
startAt
durationMinutes
status
createdAt
updatedAt
```

No se persistirá `endAt` inicialmente.

Se deriva:

```text
endAt = startAt + durationMinutes
```

---

## 47. ClinicalAppointment indexes

Índices iniciales:

```text
(personId, startAt)
(professionalId, startAt)
(status, startAt)
```

---

## 48. ClinicalAttention

Campos conceptuales:

```text
id
personId
professionalId
occurredAt
appointmentId?
createdAt
updatedAt
```

`appointmentId` será nullable porque una Atención puede registrarse sin Turno previo.

---

## 49. Appointment ↔ Attention

No agregar todavía:

```text
UNIQUE(appointment_id)
```

La cardinalidad final continúa:

```text
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

---

## 50. Attention ↔ Treatment

Mientras la cardinalidad siga pendiente, utilizar relación puente:

```text
clinical_attention_treatments
```

Campos:

```text
attention_id
treatment_id
```

Con:

```text
UNIQUE(attention_id, treatment_id)
```

Si el Analista confirma una única relación opcional, podrá simplificarse antes de producción.

---

## 51. Evolution

Campos conceptuales:

```text
id
attentionId
authorId
content
version
createdAt
updatedAt
lastModifiedBy?
```

`attentionId` será FK normal.

No agregar `UNIQUE(attentionId)` hasta confirmar cardinalidad.

---

## 52. ClinicalEvaluation

Campos conceptuales:

```text
id
attentionId
authorId
version
createdAt
updatedAt
lastModifiedBy?
```

`attentionId` será FK normal.

No agregar `UNIQUE(attentionId)` hasta confirmar cardinalidad.

---

## 53. ClinicalTestResult

Entidad hija de `ClinicalEvaluation`.

Campos conceptuales:

```text
id
clinicalEvaluationId
clinicalTestDefinitionId?
result
definitionSnapshot
snapshotVersion
```

El tipo de `result` dependerá del diseño final del test.

---

## 54. Snapshot de definición clínica

Se utilizará JSONB para snapshots cuya estructura pueda variar según el tipo de test.

Campos:

```text
definitionSnapshot JSONB
snapshotVersion INTEGER
```

El snapshot puede contener nombre, responseType, unit, options, scale e instrucciones relevantes.

Los cambios posteriores en `ClinicalTestDefinition` no modifican el snapshot.

---

## 55. JSONB

JSONB tendrá uso restringido.

Permitido para:

```text
snapshots históricos
metadata técnica
metadata de auditoría
estructuras variables justificadas
```

No permitido como sustituto del modelado relacional general.

---

## 56. Treatment

Campos conceptuales:

```text
id
personId
responsibleProfessionalId
status
reason
bodyArea/injury
startDate
finishDate?
finishReason?
objective?
interventionPlan?
currentStage?
createdAt
updatedAt
```

La estructura exacta de múltiples reaperturas/finalizaciones permanece bloqueada por definición funcional.

---

## 57. ClinicalStudy

Campos conceptuales:

```text
id
personId
treatmentId?
title/description
studyDate?
createdAt
updatedAt
```

La relación con archivos se modelará mediante tabla puente mientras la cardinalidad permanezca pendiente.

---

## 58. ClinicalStudy ↔ FileAsset

Tabla:

```text
clinical_study_files
```

Campos:

```text
clinical_study_id
file_asset_id
```

Constraint:

```text
UNIQUE(clinical_study_id, file_asset_id)
```

---

## 59. Relaciones de archivos

No utilizar un sistema polimórfico genérico como:

```text
file_links
- entity_type
- entity_id
```

Preferir FKs o tablas puente tipadas por dominio.

---

## 60. SocialWorkOrder

Podrá relacionarse explícitamente con `FileAsset`.

No utilizar relaciones polimórficas.

La cardinalidad definitiva se definirá según necesidad funcional real.

---

## 61. FileAsset

Entidad técnica del módulo Files.

Campos conceptuales:

```text
id
storageKey
originalName
mimeType
size
createdAt
```

`storageKey` debe ser único.

No almacenar signed URLs como datos persistentes.

---

## 62. FileAsset — storage

AWS S3 será la fuente física de archivos.

PostgreSQL almacena metadata y referencia.

```text
FileAsset.storageKey
→ S3 object key
```

---

## 63. Integridad DB ↔ S3

No existe atomicidad ACID entre PostgreSQL y S3.

Flujo:

```text
validate
↓
upload S3
↓
transaction DB
↓
create FileAsset + domain relation
```

Si la DB falla tras el upload, intentar eliminación compensatoria en S3.

---

## 64. Sessions

Se utilizará una tabla compartida:

```text
sessions
```

para sesiones internas y Portal.

Enum:

```text
INTERNAL
PORTAL
```

---

## 65. Session — estructura conceptual

```text
id
kind
internalUserId?
personId?
secretHash
expiresAt
lastActivityAt
revokedAt?
createdAt
```

---

## 66. Session constraints

Debe cumplirse:

```text
INTERNAL → internalUserId NOT NULL + personId NULL
PORTAL   → personId NOT NULL + internalUserId NULL
```

Se protegerá mediante aplicación y `CHECK` SQL cuando corresponda.

---

## 67. Session secret

La cookie contendrá un token opaco criptográficamente aleatorio.

La DB almacenará:

```text
hash(token)
```

No se persistirá el token utilizable en claro.

---

## 68. Session indexes

Índices iniciales:

```text
secretHash
expiresAt
revokedAt
internalUserId
personId
```

---

## 69. InternalCredential

Credenciales internas separadas de `InternalUser`.

Tabla conceptual:

```text
internal_credentials
```

Campos:

```text
internalUserId
passwordHash
mustChangePassword
credentialsUpdatedAt
```

Relación esperada 1:1.

---

## 70. PortalCredential

Tabla conceptual:

```text
portal_credentials
```

Campos:

```text
personId
pinHash
mustChangePin
credentialsUpdatedAt
```

Relación esperada:

```text
Person 1 ↔ 0..1 PortalCredential
```

---

## 71. Credenciales no recuperables

No persistir:

```text
plainPassword
plainPin
temporaryPassword
temporaryPin
```

La contraseña/PIN temporal se muestra únicamente durante la operación de generación/restablecimiento.

---

## 72. Rate limiting persistente

Sin Redis inicialmente.

Podrá existir una tabla técnica para protección persistente de autenticación, con información agregada como:

```text
key
failureCount
windowStartedAt
lockedUntil?
updatedAt
```

No es necesario registrar cada request individual.

---

## 73. AuditEvent

Tabla append-only:

```text
audit_events
```

Campos conceptuales:

```text
id
eventType
actorInternalUserId?
targetType
targetId?
requestId
metadata JSONB
createdAt
```

---

## 74. Audit target

`targetId` no tendrá una FK universal porque puede referir a tipos diferentes de recurso.

El metadata no debe contener contraseñas, PIN, cookies, tokens ni cuerpos clínicos completos.

---

## 75. Idempotencia financiera

Los movimientos económicos podrán incluir:

```text
operationId UUID
```

inicialmente en:

```text
SalaPayment
ClinicalIncome
Expense
```

Con `UNIQUE(operationId)` dentro del ámbito correspondiente.

---

## 76. `operationId`

Puede ser nullable si existen procesos internos de transición.

Para nuevos comandos críticos podrá exigirse desde Application Service.

No se implementará una tabla universal de idempotencia inicialmente.

---

## 77. SalaPayment

Campos conceptuales:

```text
id
personId
year
month
amount
paymentMethodId
paidAt/cashDate
registeredById
operationId?
adjustmentReason?
createdAt
updatedAt
```

Constraint principal:

```text
UNIQUE(personId, year, month)
```

bajo el modelo funcional actual.

---

## 78. SalaPayment amount

Tipo:

```text
DECIMAL(14,0)
```

No se persistirán centavos.

---

## 79. ClinicalIncome

Campos conceptuales:

```text
id
personId
attentionId?
socialWorkOrderId?
amount
paymentMethodId
cashDate
registeredById
operationId?
createdAt
updatedAt
```

Tipo de amount:

```text
DECIMAL(14,0)
```

---

## 80. Expense

Campos conceptuales:

```text
id
date/cashDate
amount
expenseCategoryId
paymentMethodId
area
description?
registeredById
operationId?
createdAt
updatedAt
```

Tipo de amount:

```text
DECIMAL(14,0)
```

---

## 81. ExchangeRate

Campos conceptuales:

```text
id
year
month
rate
createdAt
updatedAt
```

Tipo:

```text
DECIMAL(14,2)
```

Constraint conceptual:

```text
UNIQUE(year, month)
```

si se mantiene una cotización mensual única.

---

## 82. PaymentMethod

Tabla administrable.

No enum.

Campos conceptuales:

```text
id
name
isSelectable
createdAt
updatedAt
```

Los movimientos históricos conservan FK aunque el medio deje de ser seleccionable.

---

## 83. ExpenseCategory

Tabla administrable.

Campos conceptuales:

```text
id
name
isSelectable
createdAt
updatedAt
```

No borrar físicamente cuando existan referencias históricas.

---

## 84. Plan

Tabla de catálogo de Sala.

Campos conceptuales:

```text
id
name
monthlyAmount
isSelectable
createdAt
updatedAt
```

`monthlyAmount`:

```text
DECIMAL(14,0)
```

---

## 85. Catálogos con lifecycle propio

Cuando el dominio tiene ACTIVE/INACTIVE real, utilizar estado explícito.

Ejemplos:

```text
ClinicalProtocol
ClinicalLibraryResource
MeasurementMethod
```

No forzar el mismo patrón en todos los catálogos.

---

## 86. Catálogos retirables

Para catálogos donde solo interesa dejar de ofrecer un valor nuevo:

```text
isSelectable BOOLEAN
```

puede ser preferible.

---

## 87. Optimistic concurrency

Se agregará:

```text
version INTEGER NOT NULL DEFAULT 1
```

a entidades con riesgo real de edición concurrente.

Inicialmente candidatas:

```text
Evolution
ClinicalEvaluation
Routine
SalaScheduleSlot
other critical Sala configuration
```

---

## 88. Update con version

Patrón conceptual:

```text
UPDATE ...
SET ..., version = version + 1
WHERE id = ? AND version = ?
```

Si no se actualiza ninguna fila:

```text
409 CONCURRENT_MODIFICATION
```

---

## 89. Índices iniciales — People / Team

```text
Person.normalizedDni
InternalUser.normalizedEmail UNIQUE
```

Podrán agregarse índices para nombres según comportamiento real de búsqueda.

---

## 90. Índices iniciales — Sala

```text
SalaParticipation.personId
FixedSalaBooking.personId
SalaOccurrence.personId + date/startAt
SalaOccurrence.date/startAt
Routine.personId + status
SalaPayment.personId + year + month
```

Más los partial unique indexes necesarios.

---

## 91. Índices iniciales — Clinic

```text
ClinicalAppointment(personId, startAt)
ClinicalAppointment(professionalId, startAt)
ClinicalAppointment(status, startAt)
ClinicalAttention(personId, occurredAt)
Treatment(personId, status)
Treatment(responsibleProfessionalId, status)
ClinicalIncome(personId, cashDate)
```

---

## 92. Índices iniciales — Finance

```text
Expense.cashDate
ClinicalIncome.cashDate
SalaPayment year/month
ExchangeRate year/month
```

Los índices concretos deben responder a queries reales.

---

## 93. No sobreindexar

Cada índice agrega almacenamiento, costo de INSERT/UPDATE y mantenimiento.

No crear índices para cada columna automáticamente sin revisar consultas y planes.

---

## 94. Full-text search

No introducir inicialmente:

```text
PostgreSQL full-text search
pg_trgm
Elasticsearch
Meilisearch
```

Las primeras búsquedas utilizarán DNI normalizado, nombre, apellido y email con queries e índices simples.

---

## 95. SQL manual en Prisma Migrate

Está permitido y será necesario cuando Prisma no represente adecuadamente una constraint PostgreSQL importante.

Ejemplos:

```text
partial unique indexes
CHECK constraints complejos
PostgreSQL-specific indexes
```

---

## 96. Flujo de migración

Para cambios que requieran SQL manual:

```text
prisma migrate dev --create-only
↓
inspect migration.sql
↓
add/review SQL
↓
apply migration
↓
test constraints
```

Codex no debe eliminar SQL manual únicamente porque no aparezca expresado completamente en `schema.prisma`.

---

## 97. Prisma schema no es la única fuente estructural

La estructura real de la DB es:

```text
schema.prisma
+
versioned migrations
```

---

## 98. Migrations en producción

Producción utilizará:

```text
prisma migrate deploy
```

como paso explícito de deployment.

No ejecutar migraciones automáticamente durante el startup normal de NestJS.

---

## 99. Migraciones destructivas

Cambios destructivos deberán utilizar estrategia expand/contract cuando corresponda.

Ejemplo:

```text
1. add new column
2. deploy compatible code
3. migrate/backfill data
4. switch reads/writes
5. remove old column in later release
```

---

## 100. Seeds

Separar:

```text
shared catalog seed
development/demo seed
```

---

## 101. Shared seed

Puede incluir únicamente valores iniciales realmente requeridos por el producto.

No convertir los seeds en una segunda fuente de configuración de permisos.

---

## 102. Development seed

Solo local/staging podrá incluir usuarios demo, Personas demo, appointments demo o datos de Sala demo.

Producción no debe recibir datos clínicos o Personas ficticias.

---

## 103. Primer General Admin de producción

Se creará mediante procedimiento controlado.

No depender de un usuario productivo hardcodeado dentro del seed general.

El proceso debe generar credencial temporal, almacenar solo hash y exigir cambio en primer acceso.

---

## 104. Testing de DB

Los integration tests utilizarán:

```text
PostgreSQL real
```

No SQLite.

Motivos:

```text
partial indexes
PostgreSQL enums
locking
TIMESTAMPTZ
DECIMAL
CHECK constraints
transactions
concurrency behavior
```

---

## 105. Unit tests

Los unit tests pueden utilizar mocked repositories cuando la lógica evaluada no dependa del comportamiento real de PostgreSQL.

No utilizar mocks para demostrar que una constraint de DB funciona.

---

## 106. Integration tests mínimos

Deben existir pruebas para invariantes como:

```text
one active SalaParticipation
one active Routine
one SalaPayment per Person/Month
normalizedEmail unique
FK restrictions
Appointment attended creates Attention atomically
optimistic concurrency conflict
idempotency operationId
```

---

## 107. Concurrent integration tests

Para invariantes vulnerables a race conditions deberán existir tests concurrentes.

Ejemplos:

```text
two concurrent JoinSala attempts
two concurrent ReplaceRoutine operations
two concurrent SalaPayment submissions
two concurrent Sala reservations for last capacity slot
```

según la implementación definitiva.

---

## 108. Data deletion

No existe soft delete universal.

Las entidades utilizan su lifecycle funcional.

Ejemplos:

```text
InternalUser → INACTIVE
SalaParticipation → endDate
Treatment → FINISHED
Routine → HISTORICAL
```

La eliminación física existe solo cuando el dominio la permite.

---

## 109. Referential actions

Predeterminado entre Aggregate Roots:

```text
RESTRICT / NO ACTION
```

Ejemplos:

```text
Person → Treatment
Person → ClinicalAttention
InternalUser → Evolution
```

No utilizar `CASCADE`.

---

## 110. Child composition cascades

Puede utilizarse `CASCADE` en composiciones verdaderas.

Ejemplos potenciales:

```text
Routine → RoutineDay → RoutineExercise
ClinicalEvaluation → ClinicalTestResult
PhysicalEvaluation → PhysicalTestResult
```

solo si el Aggregate Root puede ser eliminado físicamente según las reglas funcionales.

---

## 111. Read Models

No crear tablas fuente de verdad para:

```text
FinancialDashboard
UnifiedIncomeList
DailySalaAgenda
PatientList
StudentList
TreatmentWithoutRecentAttentionList
```

Inicialmente serán queries/read models.

---

## 112. Materialized views

No utilizar inicialmente materialized views salvo necesidad medible.

Si posteriormente se agregan, no son fuente de verdad y deben poder reconstruirse.

---

## 113. Denormalización

No duplicar por conveniencia:

```text
personName
patientDni
professionalName
```

en múltiples tablas.

Una duplicación se permite solamente si representa historical snapshot o una proyección deliberada.

---

## 114. Source of truth

Cada concepto debe tener una única fuente autoritativa.

Ejemplos:

```text
Person identity → persons
current Sala participation → sala_participations where end_date IS NULL
Treatment status → treatments.status
Appointment status → clinical_appointments.status
monthly Sala payment → sala_payments
file location → file_assets.storage_key
```

---

## 115. Constraints y errores

Los nombres de constraints importantes deberán ser previsibles cuando sea posible.

Infrastructure deberá mapear violaciones conocidas a errores de dominio.

Ejemplo:

```text
uq_sala_participation_active_person
↓
ACTIVE_SALA_PARTICIPATION_ALREADY_EXISTS
```

No devolver mensajes SQL al frontend.

---

## 116. Convención de nombres para constraints

Preferencia conceptual:

```text
pk_<table>
fk_<table>_<column>
uq_<table>_<purpose>
idx_<table>_<purpose>
chk_<table>_<rule>
```

---

## 117. `BLOCKED_BY_FUNCTIONAL_DEFINITION`

Las siguientes decisiones no deben cerrarse todavía.

### 117.1 DNI uniqueness

Pendiente confirmar si DNI debe ser estrictamente único, cómo se resuelven duplicados y cómo afecta Portal login por DNI.

Hasta entonces:

```text
INDEX(normalized_dni)
```

pero no `UNIQUE`.

### 117.2 Appointment ↔ Attention

Pendiente cardinalidad final.

Actualmente:

```text
ClinicalAttention.appointmentId nullable
```

sin `UNIQUE`.

### 117.3 Attention ↔ Treatment

Pendiente confirmar 0..1 o 0..N.

Temporalmente:

```text
clinical_attention_treatments
```

### 117.4 Attention ↔ Evolution

Pendiente confirmar número máximo.

Actualmente `Evolution.attentionId` es FK sin `UNIQUE`.

### 117.5 Attention ↔ ClinicalEvaluation

Pendiente confirmar número máximo.

Actualmente `ClinicalEvaluation.attentionId` es FK sin `UNIQUE`.

### 117.6 ClinicalStudy ↔ FileAsset

Pendiente confirmar uno o múltiples archivos.

Temporalmente:

```text
clinical_study_files
```

### 117.7 Treatment reopen/finalization history

Pendiente definir cómo debe preservarse múltiples finish/reopen cycles, fechas, motivos y conclusiones.

### 117.8 SalaOccurrence correction implications

La matriz exacta de correcciones sigue pendiente.

No agregar constraints que impidan transiciones todavía no confirmadas.

---

## 118. Neutralidad ante bloqueos

Mientras una regla esté marcada:

```text
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

Codex debe:

- mantener el schema neutral;
- no agregar `UNIQUE` especulativos;
- no agregar cascades especulativos;
- no eliminar tablas puente provisionales sin definición;
- no inferir cardinalidad desde la UI;
- señalar el bloqueo si una feature depende directamente de él.

---

## 119. Modelos preliminares

### Auth

```text
Session
InternalCredential
PortalCredential
AuthAttemptBucket
```

### Team

```text
InternalUser
InternalUserRole
```

### People

```text
Person
```

### Sala

```text
SalaParticipation
Plan
SalaScheduleSlot
SalaScheduleException
FixedSalaBooking
OneOffReservation
SalaOccurrence
ExerciseDefinition
Routine
RoutineDay
RoutineExercise
PhysicalTestDefinition
PhysicalEvaluation
PhysicalTestResult
SalaPayment
```

### Clinic

```text
ClinicalAppointment
ClinicalAttention
Evolution
Treatment
ClinicalAttentionTreatment
ClinicalProtocol
ClinicalTestDefinition
MeasurementMethod
ClinicalEvaluation
ClinicalTestResult
ClinicalStudy
ClinicalStudyFile
SalaClinicalIndication
SocialWork
SocialWorkOrder
ClinicalIncome
ClinicalLibraryResource
```

### Finance

```text
Expense
ExpenseCategory
PaymentMethod
ExchangeRate
```

### Files

```text
FileAsset
```

### Audit

```text
AuditEvent
```

Esta lista podrá ajustarse antes de implementar el schema completo según respuestas funcionales y diseño detallado.

---

## 120. Relación conceptual resumida

```text
Person
│
├── SalaParticipation
│   ├── mainProfessor → InternalUser
│   └── Plan
├── FixedSalaBooking
├── OneOffReservation
├── SalaOccurrence
├── Routine
│   └── RoutineDay
│       └── RoutineExercise
├── PhysicalEvaluation
│   └── PhysicalTestResult
├── SalaPayment
├── ClinicalAppointment
├── ClinicalAttention
│   ├── Evolution(s)
│   ├── ClinicalEvaluation(s)
│   │   └── ClinicalTestResult
│   └── Treatment(s) [provisional bridge]
├── Treatment
├── ClinicalStudy
│   └── FileAsset(s) [provisional bridge]
├── SalaClinicalIndication
├── SocialWorkOrder
└── ClinicalIncome

InternalUser
├── InternalUserRole
├── InternalCredential
└── Session

Person
├── PortalCredential
└── Session

Finance
├── Expense
├── PaymentMethod
├── ExpenseCategory
└── ExchangeRate

Files
└── FileAsset

Audit
└── AuditEvent
```

---

## 121. Implementación incremental

No es necesario crear todas las tablas en la primera migración.

Orden sugerido:

```text
1. foundational infrastructure
   - InternalUser
   - InternalUserRole
   - credentials
   - sessions
   - Person

2. shared catalogs required by first vertical slice

3. Sala core

4. Clinic core

5. Finance

6. Files/Audit integrations as their vertical slices require them
```

Cada vertical slice debe introducir únicamente las tablas necesarias y sus constraints correctas.

---

## 122. Primera migración

La primera migración no debe intentar anticipar todo Athleta si todavía existen reglas funcionales pendientes.

Debe establecer:

```text
base technical conventions
UUID strategy
timestamps
Auth/Team foundational schema
People foundational schema
```

y crecer mediante migraciones versionadas.

---

## 123. Schema review

Antes de aplicar una migración significativa deberá revisarse:

1. ¿Deriva de DOMAIN_MODEL.md?
2. ¿Respeta STATE_TRANSITIONS.md?
3. ¿Respeta DATA_INTEGRITY.md?
4. ¿Introduce una cardinalidad pendiente?
5. ¿Introduce un CASCADE no justificado?
6. ¿Introduce una segunda fuente de verdad?
7. ¿Preserva historia?
8. ¿Tiene índices justificados?
9. ¿Requiere SQL manual?
10. ¿Tiene tests de integridad?

---

## 124. Regla para Codex

Codex no debe utilizar Prisma como generador automático de modelo de negocio.

Debe:

```text
read domain docs
↓
understand invariant
↓
design schema
↓
review constraints
↓
create migration
↓
test database behavior
```

No hacer:

```text
build UI
↓
guess fields
↓
run prisma db push
```

---

## 125. `db push`

No utilizar:

```text
prisma db push
```

como estrategia normal para ambientes compartidos o productivos.

Los cambios deben pasar por Prisma Migrate con migraciones versionadas.

---

## 126. Producción

No se realizarán cambios manuales de schema directamente sobre producción.

Toda modificación estructural debe existir en una migración versionada.

Si existe una intervención de emergencia, deberá reconciliarse y documentarse antes del siguiente deployment.

---

## 127. Principios finales

1. PostgreSQL es la fuente de verdad persistente.
2. Prisma es el ORM, no el dueño del modelo de negocio.
3. Se utiliza un único schema PostgreSQL inicialmente.
4. Existe un único `schema.prisma`.
5. Código Prisma en inglés; DB en snake_case.
6. UUID como PK.
7. Timestamps reales con `TIMESTAMPTZ`.
8. Fechas puras con `DATE`.
9. Horarios recurrentes con `TIME WITHOUT TIME ZONE`.
10. ARS se persiste sin decimales.
11. USD/cotización se persiste con dos decimales.
12. Roles usan tabla de relación; permissions viven en código.
13. `Person.status`, `isStudent` e `isPatient` no se persisten como flags editables.
14. SalaParticipation utiliza `endDate` para representar vigencia.
15. Routine utiliza lifecycle explícito.
16. Las cardinalidades clínicas pendientes no se congelan mediante constraints prematuras.
17. JSONB se reserva para snapshots/metadata justificada.
18. Las credenciales se separan de las entidades principales.
19. Las sesiones internas y Portal comparten infraestructura, no identidad.
20. El secreto de sesión se guarda hasheado.
21. Los archivos utilizan S3 + FileAsset, sin relaciones polimórficas genéricas.
22. La idempotencia se aplica selectivamente.
23. Optimistic concurrency se aplica donde existe riesgo real.
24. Partial indexes y CHECK constraints pueden requerir SQL manual.
25. Los integration tests utilizan PostgreSQL real.
26. No existe soft delete universal.
27. Los Aggregate Roots utilizan RESTRICT/NO ACTION por defecto.
28. Los Read Models no son tablas de verdad.
29. Las migraciones son versionadas y explícitas.
30. Las definiciones funcionales pendientes deben permanecer explícitamente bloqueadas.

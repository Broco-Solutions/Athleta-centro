# DATA_INTEGRITY.md — Athleta Manager

## 1. Propósito

Este documento define las reglas de integridad de datos de Athleta Manager y determina qué capa es responsable de proteger cada invariante.

Complementa:

```text
docs/domain/DOMAIN_MODEL.md
docs/domain/STATE_TRANSITIONS.md
docs/domain/PERMISSIONS.md
```

y será una entrada directa para el posterior diseño de:

```text
DATABASE.md
Prisma schema
Application Services
transactions
constraints
indexes
```

No define todavía el schema definitivo de PostgreSQL ni Prisma.

---

## 2. Principio general

Una regla deberá protegerse en la capa más fuerte capaz de expresarla correctamente.

Se utilizarán tres estrategias:

```text
DATABASE
APPLICATION
DATABASE + APPLICATION
```

### DATABASE

Cuando la regla sea estructural y pueda expresarse correctamente mediante:

```text
PRIMARY KEY
FOREIGN KEY
UNIQUE
CHECK
NOT NULL
INDEX
```

### APPLICATION

Cuando dependa de:

- contexto;
- permisos;
- múltiples aggregates;
- estado funcional;
- actor que ejecuta la operación;
- reglas que no puedan expresarse razonablemente en SQL.

### DATABASE + APPLICATION

Para invariantes críticas que puedan protegerse en ambos niveles.

La aplicación permite devolver un error funcional claro.

La base de datos constituye la defensa final contra:

- bugs;
- concurrencia;
- implementaciones incorrectas;
- condiciones de carrera.

---

## 3. Frontend

El frontend nunca constituye una barrera de integridad.

Ejemplo:

```text
disabled button
```

no garantiza que la operación sea imposible.

Toda validación relevante debe repetirse en backend.

---

## 4. IDs técnicos

Las entidades persistentes principales utilizarán:

```text
UUID
```

como identificador técnico.

Los IDs no expresan significado funcional.

No se utilizarán:

```text
DNI
email
número de documento
nombre
```

como Primary Key.

---

## 5. Foreign Keys

Las relaciones persistidas deberán utilizar Foreign Keys siempre que exista una relación estructural real.

Ejemplo:

```text
Treatment.personId
→ Person.id

Evolution.authorId
→ InternalUser.id

SalaPayment.personId
→ Person.id
```

No se utilizarán IDs huérfanos esperando que la aplicación garantice por sí sola la existencia del registro relacionado.

---

## 6. Foreign Keys entre módulos

Los módulos pueden poseer Foreign Keys entre sus tablas.

Ejemplo:

```text
Clinic.Treatment
        │
        ▼
People.Person
```

Esto no rompe la arquitectura modular.

La prohibición arquitectónica se aplica al código:

```text
PeopleService
→ Clinic private repository
```

no a la integridad referencial de PostgreSQL.

---

## 7. Política de `ON DELETE`

Entre Aggregate Roots, la política predeterminada será:

```text
RESTRICT
```

o:

```text
NO ACTION
```

según corresponda técnicamente.

No se utilizará `CASCADE` como comportamiento general.

---

## 8. Preservación histórica

Ejemplo:

```text
Evolution.authorId
→ InternalUser
```

Si el usuario pasa a:

```text
INACTIVE
```

la referencia debe continuar existiendo.

Por lo tanto:

```text
deactivate user
≠
delete user
```

Lo mismo aplica a:

- Personas;
- profesionales;
- pagos;
- Atenciones;
- Tratamientos;
- Evaluaciones;
- otras entidades históricas.

---

## 9. Cascades

`ON DELETE CASCADE` queda reservado a composiciones reales.

Ejemplo posible:

```text
Routine
 └── RoutineDay
      └── RoutineExercise
```

si funcionalmente la eliminación física del `Routine` completo fuese válida.

Nunca utilizar automáticamente:

```text
Person
→ Treatment CASCADE

Person
→ ClinicalAttention CASCADE

InternalUser
→ Evolution CASCADE
```

---

## 10. Person DNI

`Person.normalizedDni` posee una restricción `UNIQUE`. DNI es obligatorio y único
entre Personas; la aplicación debe buscar coincidencias antes del alta y además
depender de la constraint para resolver correctamente la concurrencia.

---

## 11. Representación de DNI

DNI se almacenará como:

```text
string
```

No como integer.

Razones:

- es un identificador, no una cantidad;
- no se realizan operaciones matemáticas;
- simplifica normalización;
- evita introducir semántica numérica incorrecta.

---

## 12. Normalización de DNI

Antes de:

```text
buscar
comparar
detectar duplicado
autenticar
```

deberá utilizarse una representación canónica.

Conceptualmente:

```text
normalizeDni(input)
```

La lógica debe estar centralizada.

No deberán existir distintas implementaciones en:

```text
People
Auth
Portal
Frontend
```

---

## 13. Duplicados de Persona

Al crear una Persona:

```text
normalize identifying data
↓
search possible matches
↓
apply functional duplicate policy
```

Una segunda coincidencia de DNI no puede insertarse. La comparación y la constraint
se aplican sobre `normalizedDni`, no sobre el formato de presentación de `dni`.

---

## 14. InternalUser email

El email de un `InternalUser` debe ser único después de normalización.

Conceptualmente:

```text
normalizeEmail(email)
=
trim + lowercase
```

La implementación deberá proteger:

```text
UNIQUE(normalizedEmail)
```

Un `InternalUser` `ACTIVE` debe conservar al menos un rol funcional. Esta invariancia se protege en Application al crear, remover roles y reactivar; la tabla de roles conserva sus asociaciones durante la inactivación.

---

## 15. Autenticación por email

Las búsquedas de autenticación utilizarán el email normalizado.

Por lo tanto:

```text
User@Athleta.com
user@athleta.com
```

no representan dos cuentas diferentes.

---

## 16. SalaParticipation activa

Una Persona puede poseer múltiples `SalaParticipation` históricas.

Pero:

```text
maximum one ACTIVE SalaParticipation per Person
```

---

## 17. Protección de SalaParticipation activa

La regla se protege en:

```text
APPLICATION
+
DATABASE
```

Application:

```text
JoinSalaUseCase
→ verify no active participation
```

Database:

conceptualmente mediante un índice `UNIQUE` parcial equivalente a:

```text
UNIQUE personId
WHERE status = ACTIVE
```

La sintaxis definitiva dependerá de Prisma/PostgreSQL y se definirá en `DATABASE.md`.

---

## 18. Concurrencia en JoinSala

La validación:

```text
if no active participation
```

por sí sola no es suficiente.

Dos requests concurrentes podrían superar la comprobación simultáneamente.

La constraint de DB constituye la protección final.

---

## 19. Rutina activa

Debe cumplirse:

```text
maximum one ACTIVE Routine
```

para la Persona/contexto de Sala correspondiente.

La regla se protege en:

```text
APPLICATION
+
DATABASE
```

---

## 20. ReplaceRoutine

La operación deberá ejecutarse transaccionalmente:

```text
BEGIN

old ACTIVE Routine
→ HISTORICAL

new Routine
→ ACTIVE

COMMIT
```

No debe existir un estado persistente válido con:

```text
2 active routines
```

para la misma Persona.

---

## 21. SalaPayment mensual

Modelo inicial:

```text
maximum one SalaPayment
per Person
per MonthYear
```

Conceptualmente:

```text
UNIQUE (
  personId,
  year,
  month
)
```

---

## 22. Corrección de SalaPayment

Si un pago mensual fue cargado incorrectamente:

```text
correct existing payment
```

No:

```text
create second payment for same month
```

---

## 23. Regla funcional pendiente sobre pagos

La restricción anterior parte del modelo funcional actualmente definido.

Si posteriormente el Analista establece:

- pagos parciales;
- cuotas;
- múltiples cobros para un mismo Mes/Año;

esta constraint deberá revisarse antes de crear una migración irreversible.

---

## 24. FixedSalaBooking duplicado

No debe existir más de una recurrencia activa exactamente equivalente para la misma Persona.

Conceptualmente podrá protegerse según la estructura final mediante:

```text
personId
+
weekday
+
scheduleSlot/time
+
active validity
```

La clave exacta se definirá en `DATABASE.md`.

---

## 25. Superposición de Turnos fijos

No debe confundirse:

```text
exact duplicate
```

con:

```text
time overlap
```

Los duplicados exactos podrán contar con protección estructural.

Las superposiciones horarias requieren lógica de aplicación porque dependen del modelo definitivo de horarios.

---

## 26. Capacidad de Sala

La capacidad no se protege mediante un simple:

```text
CHECK reservations <= capacity
```

porque depende de múltiples registros y contexto.

Además:

```text
Portal
```

y:

```text
InternalUser
```

pueden tener reglas distintas respecto del sobrecupo.

Por lo tanto pertenece principalmente a:

```text
APPLICATION
```

---

## 27. Concurrencia de reservas

La secuencia incorrecta sería:

```text
count reservations
↓
capacity available
↓
insert sometime later
```

Dos requests concurrentes pueden observar simultáneamente el mismo cupo.

La operación deberá utilizar una estrategia transaccional apropiada.

Conceptualmente:

```text
BEGIN
↓
lock/revalidate relevant capacity state
↓
verify availability
↓
create reservation
↓
COMMIT
```

La estrategia SQL concreta se definirá con el modelo definitivo.

---

## 28. Sobreocupación deliberada

Si un usuario interno está autorizado a sobreocupar:

```text
capacity exceeded
```

no necesariamente representa una violación de integridad.

La validación debe considerar:

```text
actor
+
operation context
+
business rule
```

Por esta razón no debe representarse con una constraint rígida global que lo prohíba.

---

## 29. Clinical cardinalities pendientes

No crear todavía constraints `UNIQUE` que presupongan las siguientes cardinalidades.

### ClinicalAppointment ↔ ClinicalAttention

```text
PENDING_FUNCTIONAL_DEFINITION
```

### ClinicalAttention ↔ Evolution

```text
PENDING_FUNCTIONAL_DEFINITION
```

### ClinicalAttention ↔ ClinicalEvaluation

```text
PENDING_FUNCTIONAL_DEFINITION
```

### ClinicalAttention ↔ Treatment

```text
PENDING_FUNCTIONAL_DEFINITION
```

### ClinicalStudy ↔ FileAsset

```text
PENDING_FUNCTIONAL_DEFINITION
```

---

## 30. Neutralidad ante cardinalidades pendientes

Mientras no exista definición:

Permitido:

```text
Foreign Key
```

si no congela la cardinalidad.

No permitido:

```text
UNIQUE(attentionId)
```

si eso fuerza implícitamente una relación 1:1 todavía no confirmada.

El schema debe mantenerse neutral hasta recibir la respuesta funcional.

---

## 31. Profesionales

Una referencia a un profesional debe cumplir dos niveles diferentes.

### Integridad estructural

```text
responsibleProfessionalId
→ InternalUser.id
```

protegido mediante FK.

### Integridad funcional

Al asignarlo debe estar:

```text
InternalUser.status = ACTIVE
```

y poseer al menos uno de:

```text
KINESIOLOGIST
OSTEOPATH
```

Esto se valida en Application Service.

---

## 32. FK no garantiza rol válido

PostgreSQL puede garantizar:

```text
InternalUser exists
```

pero no debería utilizarse como mecanismo principal para expresar:

```text
has clinical role
AND is active
```

Esa regla pertenece al dominio.

---

## 33. Quitar último rol clínico

Antes de:

```text
RemoveRole(KINESIOLOGIST/OSTEOPATH)
```

el Application Service deberá comprobar responsabilidades como:

```text
Treatments IN_PROGRESS
future ClinicalAppointments
```

La operación se bloquea cuando dejaría registros vigentes con un profesional inválido.

---

## 34. Inactivar profesional

La misma regla aplica a:

```text
InactivateInternalUser
```

No debe permitirse dejar:

```text
active Treatment
→ inactive responsible professional
```

sin ejecutar la reasignación funcional necesaria.

---

## 35. Profesor principal válido

`SalaParticipation.mainProfessorId` tendrá FK a `InternalUser`.

La aplicación deberá validar al asignarlo que:

```text
status = ACTIVE
AND
role contains PROFESSOR
```

---

## 36. Inactivar Profesor

No se permite inactivar un Profesor que continúe siendo Profesor principal de participaciones activas.

Debe resolverse primero mediante:

```text
reassignment
```

---

## 37. Datos derivados

Los siguientes conceptos no son campos editables:

```text
Person.status
isStudent
isPatient
currentMonthPaymentStatus
SocialWorkOrder.isExpired
availableSalaCapacity
lastClinicalAttention
TreatmentWithoutRecentAttention
financialTotals
```

---

## 38. Fuente de verdad

Los datos derivados deben calcularse desde sus fuentes.

Ejemplo:

```text
Person.status
```

se deriva de:

```text
SalaParticipation
Treatment
ClinicalAppointment
```

No mediante:

```text
PATCH /person
{
  "status": "ACTIVE"
}
```

---

## 39. Proyecciones persistidas

Si posteriormente, por rendimiento, una propiedad derivada se materializa en DB:

```text
projection/cache
```

debe cumplir:

1. no convertirse en autoridad funcional;
2. poder reconstruirse;
3. actualizarse consistentemente;
4. poseer mecanismos de reparación si queda desincronizada.

---

## 40. DateOnly

Los conceptos de fecha sin hora se almacenarán como:

```text
DATE
```

Ejemplos:

```text
birthDate
participation startDate
participation endDate
```

cuando funcionalmente corresponda.

No deben representarse mediante timestamps arbitrarios a medianoche.

---

## 41. MonthYear

Conceptos como:

```text
SalaPayment period
```

deben representar explícitamente:

```text
month
year
```

o una estrategia equivalente que preserve esa semántica.

No utilizar una fecha ficticia solo para representar Mes/Año sin documentarlo.

---

## 42. TimeOfDay

Los horarios habituales de Sala:

```text
18:00
19:00
```

no son timestamps UTC independientes.

Deben representarse según su significado de:

```text
local operational time
```

en:

```text
America/Argentina/Buenos_Aires
```

---

## 43. Validación de rangos de fechas

Cuando sea estructuralmente válido:

```text
endDate >= startDate
```

debe protegerse mediante:

```text
APPLICATION
+
CHECK constraint
```

cuando PostgreSQL pueda expresarlo correctamente.

---

## 44. Horarios

Para rangos horarios:

```text
endTime > startTime
```

debe existir validación de aplicación y, cuando el modelo lo permita, `CHECK` en DB.

---

## 45. Fechas de Treatment

Cuando los campos definitivos estén confirmados, reglas estructurales como:

```text
finishDate >= startDate
```

deberán protegerse.

No se crearán constraints sobre campos todavía pendientes de definición funcional.

---

## 46. Dinero

Todo importe persistente se almacenará con:

```text
NUMERIC / DECIMAL
```

En Prisma:

```text
Prisma.Decimal
```

Nunca:

```text
FLOAT
DOUBLE
JavaScript number
```

como representación persistente autoritativa de dinero.

---

## 47. Precisión

ARS utilizará normalmente precisión suficiente para:

```text
2 decimal places
```

Las cotizaciones USD pueden requerir mayor precisión.

Los valores concretos de:

```text
precision
scale
```

se definirán en `DATABASE.md`.

---

## 48. No constraint universal `amount > 0`

No todas las cantidades económicas deben recibir automáticamente:

```text
CHECK(amount > 0)
```

La semántica se decide por entidad.

Ejemplo:

- `SalaPayment`;
- `ClinicalIncome`;
- `Expense`;
- `ExchangeRate`;

pueden tener reglas diferentes.

No crear reglas numéricas globales por comodidad.

---

## 49. Strings obligatorios

Un campo:

```text
NOT NULL
```

no garantiza contenido útil.

Cuando una cadena sea funcionalmente obligatoria, el backend deberá validar:

```text
trim(value).length > 0
```

La DB podrá complementar esto mediante `CHECK` cuando sea valioso.

---

## 50. Normalización

Los datos utilizados para:

- autenticación;
- matching;
- unicidad;
- búsqueda exacta;

deben tener una función canónica compartida.

Ejemplos:

```text
normalizeEmail()
normalizeDni()
```

---

## 51. Frontend y normalización

El frontend puede normalizar para mejorar UX.

Pero:

```text
backend canonicalization
```

es la fuente autoritativa.

No confiar en que los clientes envían el formato correcto.

---

## 52. Transacciones multi-entidad

Las operaciones que modifican múltiples entidades relacionadas deberán ejecutarse atómicamente cuando un resultado parcial viole invariantes.

---

## 53. Operaciones transaccionales mínimas

Incluyen:

```text
InactivatePerson
LeaveSala
ReplaceRoutine
MarkAppointmentAttended
CorrectAttendedAppointment
InactivateInternalUser with reassignment
clinical professional reassignment
main Professor reassignment
permanent Sala schedule changes affecting multiple records
```

La lista no es exhaustiva.

---

## 54. InactivatePerson

Conceptualmente:

```text
BEGIN

end SalaParticipation
end bookings
cancel reservations
archive Routine
close Sala indications
finish/interruption Treatments
cancel future Appointments
revoke relevant sessions

COMMIT
```

Si una parte crítica falla:

```text
ROLLBACK
```

---

## 55. MarkAppointmentAttended

Debe ejecutarse atómicamente:

```text
BEGIN

ClinicalAppointment
SCHEDULED → ATTENDED

create ClinicalAttention

COMMIT
```

No debe existir:

```text
Appointment = ATTENDED
```

sin la Attention requerida por la regla funcional.

---

## 56. CorrectAttendedAppointment

Cuando una Attention vacía puede eliminarse:

```text
BEGIN

verify empty/deletable
delete ClinicalAttention
change ClinicalAppointment status

COMMIT
```

No debe quedar un estado parcial.

---

## 57. ReplaceRoutine

Debe garantizar:

```text
old ACTIVE → HISTORICAL
new → ACTIVE
```

como una sola operación.

---

## 58. Reasignaciones

Cuando una inactivación exige reasignar:

```text
students
appointments
treatments
```

la estrategia deberá garantizar que ningún registro vigente quede temporalmente sin cumplir las reglas funcionales requeridas.

---

## 59. Idempotencia

No se implementará una capa universal de idempotency para cada endpoint.

Se utilizará selectivamente donde una repetición de request pueda generar efectos duplicados relevantes.

---

## 60. Operaciones candidatas a idempotencia explícita

Especialmente:

```text
SalaPayment creation
ClinicalIncome creation
Expense creation
other financial commands
```

podrán aceptar un identificador:

```text
operationId
```

o:

```text
clientMutationId
```

UUID.

---

## 61. Operation ID

Cuando se utilice:

```text
operationId
```

deberá protegerse mediante:

```text
UNIQUE
```

dentro del ámbito apropiado.

Una repetición con el mismo identificador no debe crear un segundo movimiento.

---

## 62. Idempotencia no reemplaza invariantes naturales

Ejemplo:

`SalaPayment` ya posee la invariante:

```text
Person + MonthYear
```

La idempotencia protege contra retries.

La constraint funcional protege contra:

```text
dos requests diferentes
intentando registrar el mismo pago mensual
```

Son mecanismos complementarios.

---

## 63. Doble submit

La UI deberá evitar dobles envíos accidentales.

Pero eso no constituye la protección definitiva.

Ejemplo:

```text
disable submit button
```

mejora UX.

La API y DB siguen siendo responsables de impedir duplicados.

---

## 64. Optimistic concurrency

Para entidades donde dos usuarios pueden editar simultáneamente información relevante, se utilizará control de concurrencia optimista.

Conceptualmente:

```text
version: integer
```

---

## 65. Flujo optimistic locking

Lectura:

```text
version = 4
```

Update:

```text
UPDATE ...
WHERE id = X
AND version = 4
```

si tiene éxito:

```text
version = 5
```

Si otro usuario ya modificó:

```text
0 rows updated
→ conflict
```

---

## 66. Respuesta ante conflicto

La API deberá responder un error estable.

Ejemplo conceptual:

```text
409 Conflict

code:
CONCURRENT_MODIFICATION
```

La UI podrá solicitar:

```text
reload
review latest data
retry deliberately
```

No se sobrescribe silenciosamente la modificación de otro usuario.

---

## 67. Entidades candidatas

Inicialmente considerar optimistic concurrency para:

```text
Evolution
ClinicalEvaluation
Routine
critical Sala configuration
other sensitive editable clinical records
```

No es obligatorio implementarlo en cada tabla trivial.

---

## 68. Auditoría vs optimistic locking

Son conceptos diferentes.

Optimistic locking evita:

```text
lost updates
```

Auditoría permite saber:

```text
who performed a sensitive operation
```

Uno no reemplaza al otro.

---

## 69. PostgreSQL y S3

PostgreSQL y AWS S3 no participan de una transacción ACID común.

No se debe fingir que:

```text
DB transaction
```

puede hacer rollback automáticamente sobre S3.

---

## 70. Upload de archivo

Flujo recomendado:

```text
1. validate metadata
2. validate MIME / signature / size
3. generate storageKey
4. upload object to S3
5. create FileAsset in DB
6. create/link domain record
```

Los pasos de DB relacionados entre sí deben ser transaccionales.

---

## 71. Fallo de S3

Si el upload falla:

```text
do not create definitive FileAsset/domain relationship
```

La operación devuelve error.

---

## 72. Fallo de DB después del upload

Si S3 tuvo éxito pero PostgreSQL falla:

```text
attempt compensating S3 delete
```

El error de limpieza debe registrarse.

No debe ocultarse silenciosamente.

---

## 73. Objetos huérfanos

Como protección adicional deberá existir capacidad administrativa/técnica de identificar objetos:

```text
present in S3
but not referenced in DB
```

y limpiarlos de forma segura.

No es necesario introducir inicialmente una queue para esto.

---

## 74. FileAsset sin objeto

El sistema no debe crear deliberadamente un `FileAsset` definitivo cuyo `storageKey` todavía no exista en S3.

Si posteriormente se implementa un workflow de uploads en múltiples fases, deberá modelar explícitamente un estado técnico temporal.

No reutilizar un `FileAsset` definitivo para representar una subida incompleta.

---

## 75. Eliminación de archivo

Eliminar un registro clínico y eliminar su objeto S3 tampoco es una transacción única.

La estrategia concreta deberá contemplar:

```text
authorization
domain deletability
DB consistency
S3 cleanup
recovery/retry
```

No borrar primero información crítica sin poder resolver fallos posteriores.

---

## 76. Clinical snapshot integrity

Cuando un `ClinicalTestResult` preserve snapshot de una definición:

```text
later catalog modification
```

no deberá modificar el snapshot existente.

El resultado histórico permanece interpretativamente estable.

---

## 77. References vs snapshots

Una referencia histórica estable utiliza:

```text
FK to inactive/retired catalog record
```

Un snapshot histórico utiliza:

```text
copied immutable relevant fields
```

No sustituir una estrategia por otra de manera indiscriminada.

---

## 78. Catalog removal

Un elemento utilizado históricamente no debe desaparecer de manera que rompa la interpretación de registros antiguos.

La retirada puede significar:

```text
not selectable for new records
```

sin borrar referencias existentes.

---

## 79. Estado de InternalUser

No existe:

```text
delete active user because account no longer needed
```

como operación normal.

Se utiliza:

```text
ACTIVE → INACTIVE
```

preservando todas las relaciones históricas.

---

## 80. Estado de Person

`Person.status` no debe quedar fuera de sincronización con sus fuentes.

Por tratarse conceptualmente de un valor derivado, la persistencia definitiva deberá evitar:

```text
Person = INACTIVE
+
Treatment IN_PROGRESS
```

como dos fuentes contradictorias de verdad.

---

## 81. SalaOccurrence

Los estados válidos serán únicamente:

```text
RESERVED
ATTENDED
CANCELLED
ABSENT
```

La DB debe impedir valores arbitrarios.

La matriz exacta de transición entre ellos se protege en Application Service y permanece parcialmente pendiente de definición funcional.

---

## 82. ClinicalAppointment

Valores válidos:

```text
SCHEDULED
ATTENDED
CANCELLED
ABSENT
```

No admitir valores arbitrarios.

Las transiciones se controlan mediante casos de uso.

Un enum válido no significa que cualquier transición sea válida.

---

## 83. Treatment

Estados válidos:

```text
IN_PROGRESS
FINISHED
```

La DB protege el dominio de valores.

La aplicación protege:

```text
when transition is allowed
what side effects apply
```

---

## 84. Application errors

Las violaciones funcionales deben convertirse en errores de dominio estables.

Ejemplos:

```text
ACTIVE_SALA_PARTICIPATION_ALREADY_EXISTS
ACTIVE_ROUTINE_ALREADY_EXISTS
SALA_CAPACITY_EXCEEDED
PROFESSOR_HAS_ASSIGNED_STUDENTS
CLINICAL_PROFESSIONAL_HAS_ACTIVE_RESPONSIBILITIES
ATTENTION_HAS_DEPENDENCIES
CONCURRENT_MODIFICATION
```

No depender únicamente del mensaje crudo de PostgreSQL.

---

## 85. Constraint violation mapping

Cuando una constraint de DB constituya la última barrera de una regla conocida, Infrastructure debe traducir el error técnico a un código funcional.

Ejemplo:

```text
PostgreSQL unique violation
        ↓
ACTIVE_SALA_PARTICIPATION_ALREADY_EXISTS
```

No devolver al cliente:

```text
duplicate key value violates unique constraint xyz_idx
```

---

## 86. Prisma

Prisma no reemplaza las constraints de PostgreSQL.

Un tipo TypeScript:

```text
string
```

tampoco garantiza integridad persistida.

Donde sea necesario deberán utilizarse:

- schema Prisma;
- migraciones SQL específicas;
- índices PostgreSQL;
- constraints;
- Application Services.

---

## 87. Constraints no soportadas directamente por Prisma

Si una invariante importante requiere una capacidad PostgreSQL que Prisma Schema no exprese directamente —por ejemplo, un índice UNIQUE parcial— podrá agregarse mediante la migración SQL generada.

Debe quedar documentado.

No se debe degradar una invariante crítica solamente para mantener el schema Prisma “puro”.

---

## 88. Migraciones

Toda nueva constraint deberá considerar los datos existentes.

Antes de:

```text
ADD UNIQUE
ADD NOT NULL
ADD CHECK
```

debe verificarse que no existan registros incompatibles.

No usar una migración destructiva para “arreglar” datos automáticamente sin comprender su significado funcional.

---

## 89. Seeds

Los seeds deberán cumplir las mismas invariantes que producción.

No utilizar:

```text
invalid fake combinations
```

que nunca podrían producirse mediante la aplicación real, salvo pruebas explícitamente diseñadas para validar fallos.

---

## 90. Tests de integridad

Cada invariante crítica debe poseer pruebas.

Ejemplos:

```text
cannot create two active SalaParticipation
cannot create duplicate SalaPayment month
cannot delete Person with Treatment
cannot assign inactive clinical professional
cannot mark attended without resulting Attention
concurrent Routine replacement does not produce two active routines
```

---

## 91. Tests concurrentes

Las invariantes protegidas específicamente contra condiciones de carrera deberían incluir al menos pruebas de integración que ejecuten requests/escrituras concurrentes cuando resulte razonable.

No basta con testear únicamente una secuencia lineal.

---

## 92. Fuente de verdad por concepto

Principio:

```text
one authoritative source
```

Ejemplos:

```text
Person identity
→ Person

active Sala relationship
→ SalaParticipation

Treatment status
→ Treatment

Sala monthly payment
→ SalaPayment

clinical appointment state
→ ClinicalAppointment

file location
→ FileAsset.storageKey
```

Evitar campos duplicados que puedan divergir.

---

## 93. No duplicación para conveniencia

No guardar automáticamente:

```text
personName
professorName
patientDni
```

en decenas de tablas solo para evitar joins.

Una duplicación solamente se justifica cuando representa:

```text
intentional historical snapshot
```

o una proyección controlada.

---

## 94. Denormalización

La denormalización por rendimiento podrá evaluarse cuando existan métricas que la justifiquen.

No forma parte del diseño inicial por defecto.

Cualquier valor denormalizado debe definir:

- fuente de verdad;
- mecanismo de actualización;
- estrategia de reconstrucción.

---

## 95. Pendientes funcionales que afectan DB

No se deben cerrar en `DATABASE.md` hasta recibir definición:

```text
Person.dni uniqueness
ClinicalAppointment ↔ ClinicalAttention cardinality
ClinicalAttention ↔ Evolution cardinality
ClinicalAttention ↔ ClinicalEvaluation cardinality
ClinicalAttention ↔ Treatment cardinality
ClinicalStudy ↔ FileAsset cardinality
multiple Treatment reopen/finalization cycles
exact SalaOccurrence correction matrix
```

---

## 96. Regla para Codex

Cuando Codex encuentre una regla marcada:

```text
PENDING_FUNCTIONAL_DEFINITION
```

debe evitar:

```text
guess
invent constraint
invent cardinality
invent cascade
invent automatic transition
```

Debe mantener el modelo neutral o señalar el bloqueo.

---

## 97. Matriz resumida de integridad

| Invariante | DB | Application |
|---|:---:|:---:|
| UUID PK válido | ✓ | — |
| FK válida | ✓ | ✓ cuando hay regla contextual |
| InternalUser email único | ✓ | ✓ |
| DNI normalizado | — | ✓ |
| DNI único | Pendiente | Pendiente |
| Una SalaParticipation activa | ✓ | ✓ |
| Una Routine activa | ✓ | ✓ |
| Un SalaPayment por Persona/Mes | ✓ | ✓ |
| Fixed booking exacto duplicado | ✓ cuando modelo lo permita | ✓ |
| Capacidad Sala | — | ✓ |
| Sobrecupo según actor | — | ✓ |
| Profesional existente | ✓ | ✓ |
| Profesional activo + rol correcto | — | ✓ |
| Profesor principal válido | FK | ✓ |
| `endDate >= startDate` | ✓ | ✓ |
| Estados enum válidos | ✓ | ✓ |
| Transiciones válidas | — | ✓ |
| Datos derivados no editables | — | ✓ |
| Multi-entity atomicity | Transaction | ✓ |
| Idempotency operationId | ✓ | ✓ |
| Optimistic concurrency | ✓ | ✓ |
| S3 ↔ DB consistency | — | ✓ + compensación |
| Histórico no eliminado | FK/RESTRICT | ✓ |

---

## 98. Invariantes principales

El sistema debe garantizar al menos:

1. No existen referencias a entidades inexistentes.
2. Un InternalUser no puede duplicar otro email normalizado.
3. Una Persona no posee dos participaciones activas de Sala.
4. Una Persona no posee dos Rutinas activas simultáneamente.
5. No existen dos pagos de Sala para el mismo período bajo el modelo actual.
6. Un profesional asignado debe existir y ser funcionalmente válido.
7. Un Profesor principal debe estar activo y poseer rol Profesor.
8. La inactivación de profesionales no deja responsabilidades activas inválidas.
9. Una transición de estado no puede evitar sus efectos secundarios.
10. Un Appointment Atendido debe quedar relacionado con la Attention creada por la operación.
11. Los movimientos multi-entidad no quedan parcialmente aplicados.
12. La concurrencia no puede romper invariantes protegidas.
13. Los archivos clínicos no deben quedar deliberadamente referenciando objetos inexistentes.
14. Los registros históricos no se destruyen por cambios de catálogo o usuarios.
15. Los datos derivados no se convierten accidentalmente en una segunda fuente de verdad.

---

## 99. Principio final

La estrategia de Athleta será:

```text
Frontend
→ UX validation

Backend
→ business integrity

PostgreSQL
→ structural integrity + final defense
```

Cuando una invariante crítica pueda expresarse de forma segura tanto en aplicación como en PostgreSQL:

```text
use both
```

No sacrificar integridad por simplicidad de código, pero tampoco forzar dentro de SQL reglas contextuales que pertenecen al dominio.

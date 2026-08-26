# DOMAIN_MODEL.md — Athleta Manager

## 1. Propósito

Este documento define el modelo de dominio conceptual de Athleta Manager.

Su objetivo es establecer:

- las entidades principales;
- los límites entre dominios;
- la propiedad de cada concepto;
- las relaciones principales;
- los Aggregate Roots iniciales;
- los datos derivados;
- las reglas de preservación histórica;
- las decisiones técnicas de modelado;
- las definiciones funcionales todavía pendientes.

Este documento se encuentra entre la especificación funcional y el futuro diseño de base de datos.

No define todavía:

- tablas definitivas;
- columnas;
- índices;
- constraints SQL específicos;
- endpoints;
- DTOs;
- implementación Prisma.

---

# 2. Fuentes de definición

El modelo utiliza tres tipos de decisiones.

## 2.1 CONFIRMED_FUNCTIONAL

Regla definida explícitamente por la documentación funcional o posteriormente confirmada por el Analista.

Ejemplo:

```text
Una Persona es una identidad única transversal.
```

## 2.2 TECHNICAL_MODELING_DECISION

Decisión técnica tomada para representar correctamente el dominio sin modificar su comportamiento funcional.

Ejemplo:

```text
SalaParticipation representa cada período de participación en Sala.
```

## 2.3 PENDING_FUNCTIONAL_DEFINITION

Comportamiento que no debe ser decidido técnicamente porque requiere definición del cliente/Analista.

Ejemplo:

```text
Cantidad máxima de Evoluciones por Atención.
```

Codex no deberá resolver automáticamente elementos marcados como:

```text
PENDING_FUNCTIONAL_DEFINITION
```

---

# 3. Contextos principales

Athleta Manager se divide conceptualmente en los siguientes dominios:

```text
People
Team
Auth
Sala
Clinic
Finance
Portal
Files
Audit
```

No representan microservicios.

Son límites conceptuales dentro del monolito modular.

---

# 4. Visión general

```text
                         ┌─────────────────┐
                         │     Person      │
                         │                 │
                         │ Identidad única │
                         └────────┬────────┘
                                  │
                  ┌───────────────┴──────────────┐
                  │                              │
                  ▼                              ▼
             ┌─────────┐                    ┌─────────┐
             │  Sala   │                    │ Clinic  │
             └────┬────┘                    └────┬────┘
                  │                              │
       ┌──────────┼─────────┐          ┌────────┼───────────┐
       │          │         │          │        │           │
       ▼          ▼         ▼          ▼        ▼           ▼
 Participation  Routine  Payment   Appointment Attention Treatment
                                             │
                                      ┌──────┴───────┐
                                      ▼              ▼
                                  Evolution     Evaluation


                          ┌──────────────────┐
                          │  InternalUser    │
                          │                  │
                          │ Cuenta de Equipo │
                          └──────────────────┘
```

`Person` e `InternalUser` son conceptos independientes.

---

# 5. People Domain

## 5.1 Person

**Tipo:** Aggregate Root

**Estado:** `CONFIRMED_FUNCTIONAL`

`Person` representa la identidad única de una persona física dentro de Athleta.

No existen Personas diferentes para Sala y Clínica.

Una misma Persona puede:

- participar de Sala;
- tener actividad Clínica;
- tener ambas;
- dejar ambas áreas y conservar su historia.

### Responsabilidades conceptuales

`Person` contiene únicamente identidad y datos generales transversales.

Ejemplos:

```text
id
firstName
lastName
dni
phone
birthDate
email?
emergencyContact?
healthInsurance?
healthInsuranceMemberNumber?
```

La estructura definitiva se definirá en `DATABASE.md`.

### No pertenece a Person

No deben almacenarse como parte directa del aggregate:

- Rutinas;
- Tratamientos;
- Turnos;
- Atenciones;
- Pagos;
- Evaluaciones;
- Ingresos;
- Historia Clínica.

Esos elementos pertenecen a sus respectivos dominios y referencian a `Person`.

---

# 6. Alumno

**Estado:** `CONFIRMED_FUNCTIONAL`

No existe una entidad independiente:

```text
Student
```

que duplique:

```text
Nombre
DNI
Teléfono
Fecha de nacimiento
```

Una Persona es considerada Alumno cuando participa actualmente de Sala.

Conceptualmente:

```text
isStudent(person)
=
hasActiveSalaParticipation(person)
```

---

# 7. Paciente

**Estado:** `PENDING_FUNCTIONAL_DEFINITION`

No se crea inicialmente un Aggregate Root independiente `Patient`.

Paciente es una clasificación contextual de `Person`.

Conceptualmente:

```text
isPatient(person)
=
hasClinicalRelationshipOrHistory(person)
```

Está pendiente definir funcionalmente qué primera acción clínica establece exactamente ese vínculo.

Hasta recibir esa definición:

```text
Patient
≠ persisted independent entity
```

La decisión podrá revisarse si el Analista confirma que existe un alta clínica explícita que deba persistirse.

---

# 8. Estado general de Person

Estados funcionales:

```text
ACTIVE
INACTIVE
```

**Estado:** `CONFIRMED_FUNCTIONAL`

El estado no es editable directamente.

Conceptualmente:

```text
ACTIVE
=
active Sala participation

OR

Treatment IN_PROGRESS

OR

future ClinicalAppointment SCHEDULED
```

Por lo tanto:

```text
Person.status
```

es un dato derivado.

No se permite una operación genérica:

```text
updatePerson({ status: ACTIVE })
```

La estrategia técnica de cálculo o persistencia se definirá posteriormente.

---

# 9. Inactivación global

**Estado:** `CONFIRMED_FUNCTIONAL`

`InactivatePerson` constituye un caso de uso transversal.

No representa simplemente modificar un atributo.

Conceptualmente:

```text
InactivatePerson
    │
    ├── Sala.endParticipation()
    ├── Sala.endFixedBookings()
    ├── Sala.cancelFutureReservations()
    ├── Sala.archiveActiveRoutine()
    ├── Clinic.closeSalaIndicationsAsRequired()
    ├── Clinic.interruptActiveTreatments()
    ├── Clinic.cancelFutureAppointments()
    └── Auth.revokePortalSessions()
```

La operación debe respetar las reglas funcionales definitivas y ejecutarse atómicamente cuando corresponda.

---

# 10. Team Domain

## 10.1 InternalUser

**Tipo:** Aggregate Root

`InternalUser` representa una cuenta perteneciente al Equipo de Athleta.

Es diferente de `Person`.

Conceptualmente:

```text
InternalUser
├── identity/team information
├── status
├── roles
└── authentication relationship
```

Una misma persona física puede tener:

```text
InternalUser
```

y además:

```text
Person
```

sin que ambos registros tengan que estar vinculados.

---

# 11. Separación InternalUser / Person

**Estado:** `CONFIRMED_FUNCTIONAL`

No existe relación automática basada en:

```text
DNI
email
nombre
```

Un Profesor que también es Paciente tiene:

```text
InternalUser
→ para trabajar

Person
→ para recibir servicios
```

La eventual coincidencia de datos no convierte ambos registros en la misma entidad.

---

# 12. InternalUserStatus

Estados:

```text
ACTIVE
INACTIVE
```

Un usuario Inactivo:

- pierde acceso;
- continúa existiendo;
- conserva todas sus referencias históricas;
- puede eventualmente ser reactivado según reglas funcionales.

No se elimina físicamente como operación habitual.

---

# 13. Roles

Los roles son un conjunto funcional cerrado.

```text
PROFESSOR
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
BROCO_SUPPORT
```

**Estado:** `CONFIRMED_FUNCTIONAL`

No existe un catálogo de roles creado y administrado por el cliente.

Una cuenta contiene:

```text
Set<Role>
```

Los permisos técnicos se derivan de esos roles.

---

# 14. Referencias históricas a InternalUser

Los registros históricos mantienen referencia al usuario/profesional original.

Ejemplo:

```text
Evolution.authorId
        │
        ▼
InternalUser
```

Si posteriormente:

```text
InternalUser.status = INACTIVE
```

la relación histórica permanece válida.

No se modifica retroactivamente la autoría.

---

# 15. Sala Domain

El dominio Sala contiene:

```text
SalaParticipation
SalaScheduleSlot
SalaScheduleException
FixedSalaBooking
OneOffReservation
SalaOccurrence
Routine
PhysicalEvaluation
SalaPayment
Plan
ExerciseDefinition
PhysicalTestDefinition
```

---

# 16. SalaParticipation

**Tipo:** Aggregate Root

**Estado:** `TECHNICAL_MODELING_DECISION`

Cada ingreso a Sala constituye un período de participación.

Ejemplo:

```text
Person
│
├── SalaParticipation
│   start: January
│   end: March
│
└── SalaParticipation
    start: August
    end: -
```

Esto representa correctamente:

```text
ingreso
→ baja
→ reingreso
```

sin perder historia.

---

# 17. Regla de participación activa

Una Persona puede tener múltiples participaciones históricas, pero:

```text
máximo una SalaParticipation activa simultáneamente
```

Una participación activa requiere:

```text
mainProfessor
Plan
```

según la definición funcional.

---

# 18. Profesor principal y Plan

`SalaParticipation` contiene la referencia actual a:

```text
mainProfessorId
planId
```

No se crearán inicialmente:

```text
ProfessorAssignmentHistory
PlanAssignmentHistory
```

porque la especificación funcional no exige historial independiente de cada cambio.

Los registros que naturalmente registren profesor, plan o importe conservarán su propia historia cuando corresponda.

---

# 19. Baja y reingreso

Al finalizar una `SalaParticipation`:

- termina el período;
- se ejecutan los efectos definidos funcionalmente;
- no se elimina la participación.

Un reingreso crea:

```text
new SalaParticipation
```

No reactiva la participación anterior.

---

# 20. Sala Schedule

La capacidad general y las capacidades específicas o excepcionales son
enteros estrictamente positivos (`>= 1`). El valor `0` no es válido ni
representa cierre; los cierres se modelan explícitamente.

La disponibilidad habitual de Sala se representa mediante:

```text
SalaScheduleSlot
```

Conceptualmente contiene:

```text
weekday
startTime
endTime
capacity mode
specificCapacity?
validity
```

La estructura concreta para representar cambios permanentes se definirá cuando estén cerradas las dudas funcionales correspondientes.

---

# 21. SalaScheduleException

Representa una excepción aplicable a una fecha concreta.

Conceptualmente puede expresar:

```text
closure
capacity override
```

Las capacidades exactas de una excepción quedan sujetas a las definiciones funcionales pendientes.

---

# 22. FixedSalaBooking

**Tipo:** Aggregate Root

Representa un Turno fijo semanal.

Conceptualmente:

```text
FixedSalaBooking
- personId
- participationId
- weekday
- schedule slot / time
- startDate?
- endDate?
```

La recurrencia no equivale a una asistencia concreta.

---

# 23. OneOffReservation

Representa una reserva para una fecha concreta.

```text
OneOffReservation
- personId
- date
- schedule/time
```

Su presencia operativa se representa posteriormente mediante `SalaOccurrence`.

---

# 24. SalaOccurrence

**Tipo:** Aggregate Root conceptual

Representa la presencia de una Persona dentro de un horario concreto de Sala.

Puede originarse en:

```text
FIXED
ONE_OFF
SPONTANEOUS
```

Estados:

```text
RESERVED
ATTENDED
CANCELLED
ABSENT
```

Esto permite unificar la operación diaria y la asistencia independientemente del origen.

---

# 25. Materialización de occurrences

**Estado técnico:** `LAZY_MATERIALIZATION`

Las ocurrencias futuras de `FixedSalaBooking` no se pre-materializan masivamente. La agenda proyecta `RESERVED` para una fecha concreta combinando bookings, reservas y excepciones. Una `SalaOccurrence` se persiste cuando existe una operación explícita sobre esa fecha (`ATTENDED`, `ABSENT`, `CANCELLED`, corrección o incorporación `SPONTANEOUS`).

Esta estrategia es reversible y no modifica el comportamiento funcional externo.

---

# 26. Routine

**Tipo:** Aggregate Root

Una rutina representa una planificación concreta de entrenamiento.

Estructura:

```text
Routine
└── RoutineDay
    └── RoutineExercise
```

`RoutineDay` y `RoutineExercise` son entidades hijas del aggregate.

---

# 27. Rutina activa e histórica

Una Persona puede tener:

```text
máximo una rutina activa
```

dentro de su situación actual de Sala.

Cuando una nueva rutina reemplaza a otra:

```text
Routine A
ACTIVE → HISTORICAL

Routine B
→ ACTIVE
```

No se sobrescribe la rutina anterior.

---

# 28. RoutineDay

Representa:

```text
Día 1
Día 2
Día 3
...
```

No representa necesariamente un día de la semana.

Pertenece siempre a una `Routine`.

---

# 29. RoutineExercise

Pertenece siempre a:

```text
RoutineDay
```

Conceptualmente contiene la configuración de ejercicio necesaria para esa rutina.

La estrategia exacta de snapshot frente a cambios de `ExerciseDefinition` se terminará de definir según las respuestas funcionales.

---

# 30. PhysicalEvaluation

**Tipo:** Aggregate Root

Representa una Evaluación física de Sala.

Es conceptualmente independiente de:

```text
ClinicalEvaluation
```

aunque ambas puedan compartir patrones técnicos.

Estructura:

```text
PhysicalEvaluation
└── PhysicalTestResult
```

---

# 31. PhysicalTestDefinition

Catálogo perteneciente al dominio Sala.

Representa la definición reutilizable de un test físico.

No debe confundirse con el resultado concreto registrado en una Evaluación.

```text
PhysicalTestDefinition
≠
PhysicalTestResult
```

---

# 32. SalaPayment

**Tipo:** Aggregate Root

Representa el pago mensual de Sala.

Pertenece conceptualmente al dominio Sala, no a Finance.

```text
SalaPayment
- person
- month/year
- payment date
- amount
- payment method
- registeredBy
- adjustment reason?
```

Finance podrá consultarlo mediante sus Read Models.

---

# 33. Clinic Domain

El dominio Clinic contiene:

```text
ClinicalAppointment
ClinicalAttention
Evolution
Treatment
ClinicalEvaluation
ClinicalStudy
SalaClinicalIndication
SocialWorkOrder
ClinicalIncome
ClinicalProtocol
ClinicalTestDefinition
MeasurementMethod
ClinicalLibraryResource
```

---

# 34. ClinicalAppointment

**Tipo:** Aggregate Root

Representa una consulta planificada.

No representa una consulta efectivamente realizada.

Estados:

```text
SCHEDULED
ATTENDED
CANCELLED
ABSENT
```

---

# 35. ClinicalAppointment vs ClinicalAttention

```text
ClinicalAppointment
≠
ClinicalAttention
```

Un Turno representa planificación.

Una Atención representa un hecho clínico ocurrido.

Una Atención puede existir sin Turno previo.

---

# 36. Relación Appointment → Attention

Existe una relación opcional entre ambos.

```text
ClinicalAppointment
        │
        └── ClinicalAttention?
```

La cardinalidad definitiva permanece:

```text
PENDING_FUNCTIONAL_DEFINITION
```

Hasta recibir respuesta del Analista no se asumirá técnicamente:

```text
1:1
```

aunque sea una posibilidad natural.

---

# 37. ClinicalAttention

**Tipo:** Aggregate Root

Datos conceptuales mínimos:

```text
person
date/time
professional
```

Puede además relacionarse con:

```text
ClinicalAppointment?
Treatment?
Evolution(s)?
ClinicalEvaluation(s)?
ClinicalIncome(s)?
```

según las reglas funcionales definitivas.

---

# 38. Atención y Tratamiento

Está confirmado que:

```text
ClinicalAttention
```

puede existir sin:

```text
Treatment
```

La relación es por lo tanto opcional.

La cardinalidad exacta:

```text
Attention ↔ Treatment
```

continúa:

```text
PENDING_FUNCTIONAL_DEFINITION
```

hasta recibir respuesta del Analista.

---

# 39. Evolution

Representa documentación narrativa correspondiente a una Atención realizada.

Siempre pertenece a:

```text
ClinicalAttention
```

No puede existir una `Evolution` independiente de una Atención.

La cantidad de Evoluciones permitidas por Atención queda:

```text
PENDING_FUNCTIONAL_DEFINITION
```

---

# 40. Autoría de Evolution

La evolución mantiene:

```text
originalAuthor
originalDate
lastModifier?
lastModifiedAt?
```

según las reglas funcionales de trazabilidad.

La corrección posterior no reemplaza la autoría original.

---

# 41. ClinicalEvaluation

**Tipo:** Aggregate Root

Representa una Evaluación clínica estructurada.

Siempre pertenece a:

```text
ClinicalAttention
```

La cantidad de Evaluaciones permitidas por Atención queda:

```text
PENDING_FUNCTIONAL_DEFINITION
```

---

# 42. ClinicalEvaluation structure

Estructura conceptual:

```text
ClinicalEvaluation
└── ClinicalTestResult
```

Puede utilizar:

```text
ClinicalProtocol?
```

como guía.

La relación exacta entre Evaluación y múltiples Protocolos está:

```text
PENDING_FUNCTIONAL_DEFINITION
```

---

# 43. ClinicalTestDefinition

Representa una definición reusable de test clínico.

Ejemplos conceptuales de configuración:

```text
name
responseType
unit?
options?
scale?
instructions?
```

No representa el resultado concreto obtenido sobre un Paciente.

---

# 44. ClinicalTestResult

Pertenece a:

```text
ClinicalEvaluation
```

y representa el resultado efectivo obtenido.

Debe preservar la información histórica necesaria para interpretar ese resultado aunque posteriormente cambie `ClinicalTestDefinition`.

---

# 45. Snapshot clínico

**Estado:** `CONFIRMED_FUNCTIONAL + TECHNICAL_MODELING_DECISION`

Cuando una Evaluación utiliza un test reusable, el contenido necesario para interpretar el test debe congelarse dentro de la Evaluación.

Conceptualmente:

```text
ClinicalTestDefinition
      │
      │ used during evaluation
      ▼
ClinicalTestResult
      │
      └── definition snapshot
```

El snapshot puede incluir, según corresponda:

```text
name
response type
unit
options
scale
relevant instructions
```

Los campos definitivos se decidirán en `DATABASE.md`.

---

# 46. Treatment

**Tipo:** Aggregate Root

Representa un proceso clínico real de seguimiento.

Puede existir sin Atención inicial.

Una Persona puede poseer múltiples Tratamientos simultáneamente.

Estados:

```text
IN_PROGRESS
FINISHED
```

---

# 47. Treatment — datos conceptuales

```text
personId
responsibleProfessionalId
reason
bodyArea/injury
startDate
status
objective?
interventionPlan?
currentStage?
finish information?
```

Algunas estructuras definitivas continúan pendientes de respuesta funcional.

---

# 48. Profesional responsable

Cada Treatment `IN_PROGRESS` posee un profesional responsable.

La responsabilidad:

- organiza seguimiento;
- no restringe acceso clínico a otros profesionales autorizados;
- no modifica autorías históricas.

---

# 49. Reapertura

Un Treatment finalizado puede volver a:

```text
IN_PROGRESS
```

La representación histórica exacta de múltiples finalizaciones/reaperturas queda condicionada por la respuesta funcional del Analista.

---

# 50. SalaClinicalIndication

**Tipo:** Aggregate Root

Pertenece conceptualmente a:

```text
Clinic
```

aunque sea consumida en Sala.

Esto evita convertir a Sala en propietaria de información clínica.

---

# 51. Condición de entrenamiento

Valores:

```text
NO_RESTRICTIONS
RESTRICTED
DO_NOT_TRAIN
```

La UI los presenta como:

```text
Sin restricciones
Con restricciones
No entrenar
```

Los textos de interfaz no se utilizan como identificadores técnicos.

---

# 52. Vista segura para Sala

Sala consume únicamente una representación restringida.

Conceptualmente:

```text
SalaClinicalIndicationView
- condition
- affectedArea
- instructions
- lastUpdate
- responsibleProfessional
```

No incluye:

- diagnóstico;
- antecedentes;
- Evoluciones;
- Evaluaciones clínicas;
- estudios;
- razonamiento terapéutico completo.

---

# 53. ClinicalStudy

**Tipo:** Aggregate Root

Representa un Estudio o archivo clínico.

Puede tener una asociación opcional a Treatment.

El archivo físico se representa mediante:

```text
FileAsset
```

La cardinalidad archivo/estudio permanece pendiente de definición funcional.

---

# 54. SocialWorkOrder

**Tipo:** Aggregate Root

Representa una Orden de obra social.

Es una entidad administrativa del dominio Clinic.

Puede referenciar:

```text
Person
SocialWork
FileAsset?
```

No implementa control automático de sesiones o liquidación.

---

# 55. ClinicalIncome

**Tipo:** Aggregate Root

Representa dinero efectivamente recibido por Athleta en relación con un Paciente.

Pertenece al dominio Clinic.

Puede asociarse opcionalmente con:

```text
ClinicalAttention
SocialWorkOrder
```

según las reglas funcionales.

---

# 56. Finance Domain

Finance no es propietario de todos los movimientos económicos.

Fuentes originales:

```text
SalaPayment
→ Sala

ClinicalIncome
→ Clinic

Expense
→ Finance
```

Finance utiliza esas entidades para construir consultas transversales.

---

# 57. Expense

**Tipo:** Aggregate Root

Representa un Gasto de Athleta.

Conceptualmente:

```text
date
amount
expenseCategory
paymentMethod
area
description?
registeredBy
```

---

# 58. UnifiedIncomeReadModel

No es una entidad persistente de negocio.

Es un:

```text
Read Model
```

construido a partir de:

```text
SalaPayment
+
ClinicalIncome
```

El objetivo es presentar información financiera unificada sin alterar la naturaleza de los movimientos originales.

---

# 59. FinancialDashboard

No es una entidad.

Es un Read Model generado mediante consultas.

```text
SalaPayment
ClinicalIncome
Expense
ExchangeRate
        │
        ▼
FinancialDashboard
```

No se creará una tabla:

```text
financial_dashboard
```

como fuente de verdad.

---

# 60. Read Models

Otros ejemplos:

```text
DailySalaAgenda
PatientList
StudentList
HomeDashboard
TreatmentWithoutRecentAttentionList
UnifiedIncomeList
ExpenseList
```

Los Read Models:

- pueden combinar varios aggregates;
- están optimizados para lectura;
- no son fuentes de verdad;
- no reciben modificaciones directas.

---

# 61. Datos derivados

Se consideran conceptualmente derivados:

```text
PersonStatus
isStudent
isPatient
currentMonthPaymentStatus
lastClinicalAttention
treatmentWithoutRecentAttention
socialWorkOrderExpired
financialTotals
USDReferenceTotals
Sala capacity availability
```

No son campos editables por el usuario.

---

# 62. Persistencia de derivados

Como principio:

```text
source data
=
source of truth
```

Si por rendimiento se decide almacenar una proyección derivada:

- no pasa a ser autoridad funcional;
- debe mantenerse consistente;
- debería ser reconstruible.

La decisión pertenece al futuro diseño de base de datos.

---

# 63. Catálogos

No existirá una abstracción universal:

```text
Catalog
CatalogItem
```

para todos los valores.

Cada catálogo pertenece al dominio que conoce su significado.

---

# 64. Catálogos de Sala

Ejemplos:

```text
Plan
ExerciseDefinition
PhysicalTestDefinition
```

---

# 65. Catálogos de Clinic

Ejemplos:

```text
ClinicalProtocol
ClinicalTestDefinition
MeasurementMethod
ClinicalLibraryResource
SocialWork
```

---

# 66. Catálogos económicos/transversales

Ejemplos:

```text
PaymentMethod
ExpenseCategory
ExchangeRate
```

El ownership definitivo de `PaymentMethod` deberá respetar que es compartido entre Sala, Clinic y Finance.

---

# 67. Preservación histórica

Se utilizarán dos estrategias principales.

## Stable reference

Cuando alcanza con conservar la referencia a un valor que deja de estar disponible.

```text
PaymentMethod
SocialWork
ExpenseCategory
```

## Snapshot

Cuando el contenido exacto utilizado debe permanecer congelado.

```text
ClinicalTestResult
PhysicalTestResult si funcionalmente corresponde
RoutineExercise si funcionalmente corresponde
```

La estrategia se decide según el significado del dominio, no mediante una regla genérica.

---

# 68. FileAsset

`FileAsset` es una entidad técnica reutilizable perteneciente al dominio Files.

Conceptualmente:

```text
FileAsset
- id
- storageKey
- originalName
- mimeType
- size
- timestamps
```

No contiene significado clínico.

---

# 69. Separación FileAsset / dominio

Ejemplo:

```text
ClinicalStudy
      │
      └── FileAsset
```

`ClinicalStudy` sabe:

```text
qué significa el archivo
```

`FileAsset` sabe:

```text
dónde está y cómo acceder técnicamente
```

La misma estrategia puede utilizarse con:

```text
SocialWorkOrder
ClinicalLibraryResource
```

---

# 70. Foreign Keys entre módulos

Aunque los módulos estén separados arquitectónicamente, comparten PostgreSQL.

Se permiten Foreign Keys entre dominios.

Ejemplo:

```text
Treatment.personId
        │
        ▼
Person.id
```

y:

```text
Treatment.responsibleProfessionalId
        │
        ▼
InternalUser.id
```

Esto no autoriza acceso directo a repositories de otros módulos desde código.

---

# 71. Límites de código vs límites de DB

Permitido:

```text
Clinic table
   FK
People table
```

No permitido:

```text
PeopleService
   ↓
prisma.treatment.update(...)
```

People deberá utilizar una interfaz pública de Clinic.

---

# 72. Aggregate Roots iniciales

## People

```text
Person
```

## Team

```text
InternalUser
```

## Sala

```text
SalaParticipation
FixedSalaBooking
SalaOccurrence
Routine
PhysicalEvaluation
SalaPayment
```

## Clinic

```text
ClinicalAppointment
ClinicalAttention
Treatment
ClinicalEvaluation
ClinicalStudy
SalaClinicalIndication
SocialWorkOrder
ClinicalIncome
```

## Finance

```text
Expense
```

Esta lista puede ajustarse si durante diseño detallado una frontera diferente simplifica el modelo sin modificar reglas funcionales.

---

# 73. Entidades hijas

Ejemplos:

```text
Routine
└── RoutineDay
    └── RoutineExercise
```

```text
PhysicalEvaluation
└── PhysicalTestResult
```

```text
ClinicalEvaluation
└── ClinicalTestResult
```

Estas entidades no poseen un ciclo de vida independiente significativo fuera de su Aggregate Root.

---

# 74. Person no es un aggregate gigante

Aunque la Persona sea transversal:

```text
Person
```

no contiene ni controla directamente todos los aggregates relacionados.

En lugar de:

```text
Person
└── entire system
```

utilizamos:

```text
SalaParticipation.personId
Treatment.personId
ClinicalAttention.personId
SalaPayment.personId
...
```

Esto mantiene aggregates pequeños y operaciones previsibles.

---

# 75. Coordinación transversal

Las operaciones que afectan varios dominios se coordinan mediante Application Services.

Ejemplo:

```text
InactivatePersonUseCase
        │
        ├── People
        ├── Sala
        ├── Clinic
        └── Auth
```

No se implementará Event-Driven Architecture inicialmente.

---

# 76. Domain Events

No se introduce inicialmente:

```text
Domain Event Bus
Message Broker
Event Sourcing
```

La coordinación será síncrona dentro del monolito.

Los eventos podrán incorporarse posteriormente si aparece una necesidad concreta.

---

# 77. Transacciones

Cuando una operación transversal requiera consistencia inmediata:

```text
BEGIN
  modify People
  modify Sala
  modify Clinic
  modify Auth/session state
COMMIT
```

o se revierte completamente.

La coordinación exacta será responsabilidad de Application Services.

---

# 78. Value Objects

Se utilizarán Value Objects livianos cuando aporten claridad.

Ejemplos:

```text
Money
DateOnly
MonthYear
TimeOfDay
TimeRange
```

No se implementará una jerarquía DDD compleja para valores triviales.

---

# 79. Money

Conceptualmente:

```text
Money
- amount
- currency
```

Inicialmente la moneda operativa principal será:

```text
ARS
```

Los importes se representan técnicamente mediante decimal exacto.

---

# 80. MonthYear

Representa períodos como:

```text
08/2026
```

sin inventar una fecha arbitraria como:

```text
2026-08-01 00:00:00
```

cuando funcionalmente solo interesa Mes/Año.

---

# 81. DateOnly

Utilizado cuando el concepto representa una fecha sin hora.

Ejemplo:

```text
birthDate
```

No debe sufrir conversiones de timezone.

---

# 82. TimeOfDay / TimeRange

Conceptualmente útiles para:

```text
Sala schedules
```

Ejemplo:

```text
18:00–19:00
```

Representan horarios operativos, no necesariamente timestamps UTC independientes.

---

# 83. Enums

Los estados y valores funcionalmente cerrados serán enums/tipos explícitos.

Ejemplos:

```text
PersonStatus
InternalUserStatus
ClinicalAppointmentStatus
TreatmentStatus
SalaOccurrenceStatus
TrainingCondition
Role
```

---

# 84. Enum vs UI

Código:

```text
DO_NOT_TRAIN
```

UI:

```text
No entrenar
```

Los textos traducidos/presentados nunca se utilizan como identificadores persistentes.

---

# 85. Deletes y cascades

Principio general:

```text
RESTRICT
```

antes que:

```text
CASCADE
```

entre Aggregate Roots.

Ejemplo:

eliminar `Person` no debe borrar automáticamente:

```text
Treatment
ClinicalAttention
SalaPayment
```

---

# 86. Cascades permitidos

Podrán utilizarse únicamente en verdadera composición interna cuando eliminar el root sea funcionalmente válido.

Ejemplo conceptual:

```text
Routine
└── RoutineDay
    └── RoutineExercise
```

Incluso en esos casos, la decisión debe quedar explícita en `DATABASE.md`.

No se utilizarán cascades por comodidad.

---

# 87. Eliminación de Person

La eliminación física solamente puede ocurrir bajo las reglas funcionales específicas para Personas creadas por error y sin historia relevante.

No se diseñará una eliminación genérica que dependa de cascades.

La operación deberá comprobar explícitamente si es legal.

---

# 88. Naming técnico

El código, DB, API y documentación técnica utilizarán inglés consistente.

Ejemplos:

```text
Persona
→ Person

Alumno
→ Student como concepto de UI, no entidad

Turno clínico
→ ClinicalAppointment

Atención
→ ClinicalAttention

Evolución
→ Evolution

Tratamiento
→ Treatment

Pago de Sala
→ SalaPayment
```

---

# 89. Lenguaje de interfaz

La interfaz permanecerá en español.

Por lo tanto:

```text
Domain code
→ English

User-facing text
→ Spanish
```

No se mezclará naming español/inglés arbitrariamente dentro del código.

---

# 90. Relaciones pendientes de definición funcional

Las siguientes decisiones no deben cerrarse todavía.

## Patient

```text
¿Qué primera acción crea vínculo clínico?
```

## Appointment ↔ Attention

```text
Cardinalidad exacta
```

## Attention ↔ Treatment

```text
Cardinalidad exacta
```

## Attention ↔ Evolution

```text
¿Cuántas Evolutions por Attention?
```

## Attention ↔ ClinicalEvaluation

```text
¿Cuántas ClinicalEvaluations por Attention?
```

## ClinicalEvaluation ↔ ClinicalProtocol

```text
¿Uno o varios Protocols?
```

## ClinicalStudy ↔ FileAsset

```text
¿Uno o múltiples archivos?
```

## Treatment lifecycle

```text
Representación funcional de múltiples
finalizaciones / reaperturas
```

## Sala schedules

```text
Comportamiento exacto de cambios
permanentes y excepciones
```

## Fixed bookings

```text
Reglas finales de generación/corrección
de occurrences
```

---

# 91. Prohibición de inferencia

Mientras una definición figure como:

```text
PENDING_FUNCTIONAL_DEFINITION
```

Codex no deberá:

- elegir una cardinalidad;
- agregar una constraint;
- construir UI que presuponga una respuesta;
- crear una migración basada en una inferencia;
- implementar comportamiento irreversible.

Debe dejar la parte afectada pendiente o diseñarla de manera temporalmente neutral.

---

# 92. Relación con DATABASE.md

Este documento define:

```text
qué existe
```

y:

```text
qué significa
```

`DATABASE.md` deberá definir posteriormente:

```text
cómo se persiste
```

Por lo tanto, el schema Prisma deberá derivarse del Domain Model y no al revés.

---

# 93. Relación con STATE_TRANSITIONS.md

Este documento identifica entidades y estados.

`STATE_TRANSITIONS.md` definirá posteriormente:

```text
estado inicial
acción
precondiciones
estado resultante
efectos secundarios
roles autorizados
```

para entidades como:

```text
Person
InternalUser
SalaParticipation
ClinicalAppointment
SalaOccurrence
Treatment
SalaClinicalIndication
```

---

# 94. Relación con DATA_INTEGRITY.md

`DATA_INTEGRITY.md` determinará qué invariantes deberán protegerse mediante:

```text
database constraints
application rules
transactions
unique constraints
foreign keys
```

Ejemplo:

```text
Una Persona no puede tener dos
SalaParticipation activas simultáneamente.
```

---

# 95. Relación con PERMISSIONS.md

El Domain Model no decide permisos completos.

`PERMISSIONS.md` definirá:

```text
Role
→ Permission
→ Domain operation
```

Las reglas contextuales seguirán perteneciendo al dominio.

Ejemplo:

```text
General Admin
puede inactivar usuario
```

no implica:

```text
puede inactivar profesional
con responsabilidades pendientes
```

---

# 96. Modelo conceptual resumido

```text
Person
│
├── SalaParticipation
│   ├── Plan
│   └── Main Professor → InternalUser
│
├── FixedSalaBooking
├── OneOffReservation
├── SalaOccurrence
│
├── Routine
│   └── RoutineDay
│       └── RoutineExercise
│
├── PhysicalEvaluation
│   └── PhysicalTestResult
│
├── SalaPayment
│
├── ClinicalAppointment
│       │
│       └── ClinicalAttention?     [cardinality pending]
│
├── ClinicalAttention
│   ├── Evolution(s)               [pending]
│   ├── ClinicalEvaluation(s)      [pending]
│   └── Treatment relation         [pending]
│
├── Treatment
│
├── ClinicalStudy
│   └── FileAsset(s)               [pending]
│
├── SalaClinicalIndication
│
├── SocialWorkOrder
│   └── FileAsset?
│
└── ClinicalIncome


InternalUser
│
├── Roles
├── Credentials
└── Sessions


Finance
│
├── Expense
├── UnifiedIncomeReadModel
└── FinancialDashboard


Files
└── FileAsset
```

---

# 97. Principios finales

El modelo debe conservar estas reglas durante toda la implementación:

1. `Person` es la única identidad transversal del cliente.
2. Alumno y Paciente no duplican identidad.
3. `InternalUser` y `Person` son conceptos independientes.
4. Sala, Clinic y Finance poseen sus propios aggregates.
5. `Person` no es un aggregate gigante.
6. Las referencias entre módulos pueden utilizar Foreign Keys.
7. El código no cruza repositories privados entre módulos.
8. Los Read Models no son fuentes de verdad.
9. Los datos derivados no son editables directamente.
10. La historia relevante se preserva.
11. Los snapshots se utilizan únicamente cuando el contenido histórico debe quedar congelado.
12. Los deletes son restrictivos por defecto.
13. Las operaciones transversales utilizan Application Services y transacciones.
14. No se introduce Event-Driven Architecture inicialmente.
15. Código técnico en inglés; interfaz en español.
16. Las dudas funcionales pendientes no se resuelven mediante inferencia técnica.
17. El diseño de base de datos debe derivarse de este modelo, y no al revés.

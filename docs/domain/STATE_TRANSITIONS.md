# STATE_TRANSITIONS.md — Athleta Manager

## 1. Propósito

Este documento define los estados, transiciones, precondiciones y efectos secundarios principales del dominio de Athleta Manager.

Su objetivo es evitar que estados funcionalmente relevantes sean implementados como simples modificaciones de campos cuando en realidad representan operaciones de negocio.

Este documento complementa:

```text
docs/domain/DOMAIN_MODEL.md
```

y servirá posteriormente como entrada para:

```text
docs/domain/DATA_INTEGRITY.md
docs/architecture/DATABASE.md
```

No define todavía:

- tablas;
- columnas;
- endpoints definitivos;
- permisos completos;
- implementación Prisma;
- detalles visuales de UI.

---

# 2. Clasificación de transiciones

Las transiciones se clasifican en tres grupos.

## 2.1 USER_INITIATED

Una acción iniciada explícitamente por un usuario.

Ejemplo:

```text
Treatment
IN_PROGRESS → FINISHED
```

mediante:

```text
FinalizeTreatment
```

---

## 2.2 AUTOMATIC_DERIVED

Cambio producido automáticamente como consecuencia de otra operación funcional.

Ejemplo:

```text
Person
INACTIVE → ACTIVE
```

cuando aparece actividad vigente.

---

## 2.3 CORRECTION

Cambio realizado para corregir información previamente registrada de manera incorrecta.

Ejemplo:

```text
SalaOccurrence
ABSENT → ATTENDED
```

si funcionalmente esa transición está permitida.

Las correcciones deben respetar las reglas particulares de cada entidad.

---

# 3. Principio general

No todo objeto del dominio necesita un enum de estado.

Se utilizará estado persistido únicamente cuando represente un concepto funcional real.

Ejemplos con lifecycle explícito:

```text
InternalUser
SalaParticipation
Routine
ClinicalAppointment
Treatment
SalaClinicalIndication
```

Ejemplos sin lifecycle enum:

```text
ClinicalAttention
Evolution
ClinicalEvaluation
SalaPayment
ClinicalIncome
Expense
```

---

# 4. Person

## 4.1 Estados conceptuales

```text
ACTIVE
INACTIVE
```

El estado de `Person` es derivado.

No debe existir una operación genérica:

```text
SetPersonStatus(ACTIVE)
```

o:

```text
SetPersonStatus(INACTIVE)
```

---

# 5. Regla de cálculo de PersonStatus

Conceptualmente:

```text
Person = ACTIVE

si existe al menos una de:

- active SalaParticipation
- Treatment IN_PROGRESS
- future ClinicalAppointment SCHEDULED
```

En caso contrario:

```text
Person = INACTIVE
```

---

# 6. Transición INACTIVE → ACTIVE

Tipo:

```text
AUTOMATIC_DERIVED
```

Puede producirse por:

```text
CreateSalaParticipation
StartTreatment
ReopenTreatment
ScheduleFutureClinicalAppointment
```

Ejemplo:

```text
Person INACTIVE
      │
      │ Schedule future appointment
      ▼
Person ACTIVE
```

No existe un comando separado:

```text
ActivatePerson
```

como operación funcional independiente.

---

# 7. Transición ACTIVE → INACTIVE

Tipo:

```text
AUTOMATIC_DERIVED
```

Ocurre cuando desaparece la última fuente de actividad vigente.

Ejemplo:

```text
Person ACTIVE
    │
    ├── SalaParticipation ends
    ├── last Treatment finishes
    └── no future scheduled appointments remain
    ▼
Person INACTIVE
```

La eliminación de una sola actividad no necesariamente produce inactivación.

---

# 8. InactivatePerson

`InactivatePerson` es un caso de uso transversal deliberado.

No equivale a:

```text
Person.status = INACTIVE
```

Conceptualmente:

```text
InactivatePerson
      │
      ├── end active SalaParticipation
      ├── end fixed Sala bookings
      ├── cancel future Sala reservations
      ├── move active Routine to HISTORICAL
      ├── close active Sala indications
      ├── finish active Treatments as Interruption
      ├── cancel future scheduled ClinicalAppointments
      └── revoke Portal sessions
```

Al finalizar correctamente:

```text
Person.status
→ INACTIVE
```

porque ya no queda actividad vigente.

---

# 9. Atomicidad de InactivatePerson

La operación debe considerarse una unidad funcional.

No debe permitirse un resultado parcial como:

```text
Sala ended
pero
Clinical Treatments still active
```

si la operación global falla a mitad de camino.

La implementación debe utilizar una estrategia transaccional adecuada dentro del monolito.

---

# 10. SalaParticipation

## Estados

```text
ACTIVE
ENDED
```

No existen:

```text
PAUSED
SUSPENDED
FROZEN
```

---

# 11. Creación de SalaParticipation

Una nueva participación se crea:

```text
none
  │
  │ JoinSala
  ▼
ACTIVE
```

Precondiciones funcionales conocidas:

```text
Person exists
mainProfessor selected
Plan selected
no other active SalaParticipation
```

La creación produce:

```text
Person.status
→ ACTIVE
```

si estaba Inactive.

---

# 12. Finalización de SalaParticipation

Transición:

```text
ACTIVE
  │
  │ LeaveSala
  ▼
ENDED
```

Efectos conocidos:

```text
end fixed Sala bookings
cancel future one-off reservations
active Routine → HISTORICAL
close active SalaClinicalIndications
remove current mainProfessor
remove current Plan
```

La historia permanece disponible.

---

# 13. Reingreso a Sala

No existe:

```text
ENDED → ACTIVE
```

sobre la misma `SalaParticipation`.

El reingreso crea una nueva entidad:

```text
SalaParticipation #1
ENDED

SalaParticipation #2
ACTIVE
```

No se restauran automáticamente:

- Profesor anterior;
- Plan anterior;
- Turnos fijos;
- reservas;
- rutina activa anterior;
- indicaciones clínicas cerradas.

---

# 14. FixedSalaBooking

No utilizará un enum de estado complejo.

Su vigencia se representa mediante:

```text
startDate
endDate?
```

Conceptualmente:

```text
current date inside validity range
→ ACTIVE

endDate reached/passed
→ ENDED
```

`ACTIVE` y `ENDED` son condiciones derivadas, no necesariamente valores persistidos.

---

# 15. Creación de FixedSalaBooking

Operación:

```text
CreateFixedSalaBooking
```

Produce una nueva recurrencia semanal.

Precondiciones principales:

```text
Person participates in Sala
selected schedule is valid
capacity rules satisfied according to actor/context
```

Las reglas exactas de sobrecupo siguen sujetas a definición funcional si correspondiera.

---

# 16. Finalización de FixedSalaBooking

Operación:

```text
EndFixedSalaBooking
```

Efecto:

```text
endDate = selected/effective end date
```

No elimina ocurrencias históricas ya existentes.

---

# 17. Cancelación de una ocurrencia

Cancelar una fecha concreta de un Turno fijo:

```text
does NOT modify FixedSalaBooking recurrence
```

Solo modifica la `SalaOccurrence` correspondiente.

Ejemplo:

```text
Monday occurrence
RESERVED → CANCELLED

FixedSalaBooking
remains valid for next Monday
```

---

# 18. SalaOccurrence

Estados:

```text
RESERVED
ATTENDED
CANCELLED
ABSENT
```

Estos estados representan la situación de una Persona en una fecha y horario específicos.

---

# 19. Creación de SalaOccurrence

Puede originarse en:

```text
FIXED
ONE_OFF
SPONTANEOUS
```

Origen fijo o puntual:

```text
initial state
→ RESERVED
```

Incorporación espontánea:

```text
initial state
→ ATTENDED
```

La creación de una incorporación `SPONTANEOUS` se expone para la fecha operativa actual. `SAL-TUR-08` permanece pendiente exclusivamente para decidir si puede crearse retrospectivamente con ese origen específico.

---

# 20. Paso del tiempo y SalaOccurrence

No existe transición automática:

```text
RESERVED
   ↓
ABSENT
```

por el solo hecho de que el horario haya terminado.

Una reserva no actualizada permanece:

```text
RESERVED
```

hasta que un usuario autorizado corrija su estado.

Una ocurrencia de Turno fijo sin cobertura para su fecha se proyecta como `PENDING_PAYMENT` (Pendiente de renovación) y ocupa cupo. Al llegar el inicio sin cobertura válida en ese instante, se persiste `CANCELLED` con `cancelledForNonPaymentAt` y se libera el cupo. No hay período de gracia. Un Pago previo al inicio puede habilitar la proyección `RESERVED`; un Pago posterior no reactiva una cancelación materializada. La recurrencia continúa. No implica transición automática a `ABSENT`.

---

# 21. Correcciones de SalaOccurrence

La especificación permite correcciones posteriores sin límite general de tiempo y no define una matriz rígida de transición.

Conceptualmente pueden existir correcciones entre:

```text
RESERVED
ATTENDED
CANCELLED
ABSENT
```

Todos esos estados pueden corregirse manualmente por un usuario autorizado, incluyendo `ABSENT → ATTENDED` y `ATTENDED → ABSENT`. La corrección afecta únicamente la ocurrencia concreta.

---

# 22. Trazabilidad de SalaOccurrence

Una corrección debe conservar como mínimo:

```text
lastModifiedBy
lastModifiedAt
```

No se exige un historial completo de versiones salvo que posteriormente se defina lo contrario.

---

# 23. Routine

Estados:

```text
ACTIVE
HISTORICAL
```

No existen:

```text
DRAFT
PUBLISHED
ARCHIVED
```

como estados funcionales.

---

# 24. Creación de Routine

Al crear una nueva rutina vigente:

```text
new Routine
→ ACTIVE
```

Si ya existía otra rutina activa:

```text
old Routine
ACTIVE → HISTORICAL
```

La operación debe preservar la rutina anterior.

---

# 25. Reemplazo de Routine

Transición:

```text
Routine A
ACTIVE → HISTORICAL

Routine B
NEW → ACTIVE
```

Esto constituye una única operación funcional.

No debe existir un período transitorio con dos rutinas activas para la misma situación de Sala.

---

# 26. Baja de Sala y Routine

Efecto automático:

```text
SalaParticipation
ACTIVE → ENDED

active Routine
ACTIVE → HISTORICAL
```

Una rutina histórica no vuelve a `ACTIVE` por reingreso.

Si se desea reutilizarla:

```text
DuplicateRoutine
→ new Routine
```

---

# 27. InternalUser

Estados:

```text
ACTIVE
INACTIVE
```

---

# 28. Alta de InternalUser

Estado inicial esperado:

```text
ACTIVE
```

junto con:

```text
temporary password
mustChangePassword = true
```

La credencial temporal no constituye un estado alternativo del usuario.

---

# 29. Inactivación de InternalUser

Transición:

```text
ACTIVE
  │
  │ InactivateInternalUser
  ▼
INACTIVE
```

La transición puede estar bloqueada por responsabilidades pendientes.

---

# 30. Precondiciones de inactivación de Profesor

Si posee rol:

```text
PROFESSOR
```

y todavía tiene Personas asignadas como Profesor principal:

```text
transition blocked
```

hasta realizar reasignación.

Conceptualmente:

```text
ACTIVE
  │
  │ Inactivate
  ├─────X if assigned students exist
  │
  ▼
INACTIVE
```

---

# 31. Precondiciones de inactivación clínica

Si el usuario posee responsabilidades clínicas pendientes, como:

```text
Treatments IN_PROGRESS
future ClinicalAppointments SCHEDULED
```

la inactivación queda bloqueada hasta reasignarlas.

La reasignación no modifica autorías históricas.

---

# 32. Reactivación de InternalUser

Transición:

```text
INACTIVE
  │
  │ ReactivateInternalUser
  ▼
ACTIVE
```

La reactivación conserva los roles asociados y requiere que exista al menos uno válido. Solo cambia el estado a `ACTIVE`: no restaura ni reasigna responsabilidades operativas anteriores, no restaura sesiones invalidadas y exige una autenticación nueva.

---

# 33. Remoción de roles

Quitar un rol no modifica:

```text
InternalUser.status
```

Es una operación independiente.

Una cuenta `ACTIVE` no puede quedar sin roles: remover el último rol se bloquea y para revocar completamente el acceso debe inactivarse la cuenta.

Ejemplo:

```text
removeRole(PROFESSOR)
```

---

# 34. Remoción de rol Profesor

La operación queda bloqueada si:

```text
user remains mainProfessor of one or more active Sala participants
```

Debe resolverse primero mediante reasignación.

---

# 35. Remoción del último rol clínico

Si se intenta quitar el último rol entre:

```text
KINESIOLOGIST
OSTEOPATH
```

y existen:

```text
Treatments IN_PROGRESS
or
future ClinicalAppointments SCHEDULED
```

la operación queda bloqueada.

Si conserva otro rol clínico:

```text
KINESIOLOGIST removed
OSTEOPATH remains
```

la protección no bloquea por ese motivo.

---

# 36. ClinicalAppointment

Estados:

```text
SCHEDULED
ATTENDED
CANCELLED
ABSENT
```

No existe:

```text
RESCHEDULED
```

---

# 37. Creación de ClinicalAppointment

Estado inicial:

```text
SCHEDULED
```

Si la fecha/hora es futura:

```text
Person.status
→ ACTIVE
```

si la Persona estaba Inactive y no tenía otra actividad.

---

# 38. Reprogramación

`RescheduleClinicalAppointment` no cambia el estado.

Ejemplo:

```text
SCHEDULED
→ SCHEDULED
```

modificando:

```text
date/time
duration
professional when applicable
```

No se crea un Appointment nuevo únicamente por reprogramar.

---

# 39. SCHEDULED → CANCELLED

Operación:

```text
CancelClinicalAppointment
```

Transición:

```text
SCHEDULED
   │
   ▼
CANCELLED
```

Si era la última fuente de actividad vigente de la Persona:

```text
Person
ACTIVE → INACTIVE
```

de forma derivada.

---

# 40. SCHEDULED → ABSENT

Operación manual:

```text
MarkAppointmentAbsent
```

Transición:

```text
SCHEDULED
   │
   ▼
ABSENT
```

No ocurre automáticamente por el paso del tiempo.

---

# 41. SCHEDULED → ATTENDED

Operación:

```text
MarkAppointmentAttended
```

Transición:

```text
SCHEDULED
   │
   ▼
ATTENDED
```

Efecto obligatorio:

```text
create ClinicalAttention
```

La Attention hereda inicialmente:

```text
person
date/time
professional
```

del Appointment.

---

# 42. Atención sin Evolución

La transición:

```text
SCHEDULED → ATTENDED
```

puede completarse aunque no se cree una `Evolution`.

El sistema puede mostrar advertencia.

No crea:

```text
PENDING_EVOLUTION
```

ni un nuevo estado del Appointment.

---

# 43. Corrección de ATTENDED

Una transición desde:

```text
ATTENDED
```

hacia un estado no atendido no debe implementarse como:

```text
appointment.status = ...
```

directamente.

Debe ejecutarse:

```text
CorrectAttendedAppointment
```

---

# 44. ATTENDED → estado no atendido con Attention vacía

Si la `ClinicalAttention` creada automáticamente está vacía y no posee dependencias:

```text
delete empty ClinicalAttention
+
change appointment status
```

Ejemplo:

```text
ATTENDED
   │
   ├── Attention empty
   ▼
SCHEDULED
```

La misma regla puede aplicar a:

```text
CANCELLED
ABSENT
```

según las transiciones funcionales permitidas.

---

# 45. ATTENDED → estado no atendido con dependencias

Si la Attention posee:

```text
Evolution
ClinicalEvaluation
ClinicalIncome
otra relación relevante
```

la corrección queda:

```text
BLOCKED
```

hasta corregir o desvincular explícitamente esas dependencias.

Nunca se elimina silenciosamente información clínica o económica.

---

# 46. Matriz completa de correcciones de Appointment

Algunas transiciones de corrección adicionales fueron enviadas al Analista.

Por ejemplo:

```text
CANCELLED → SCHEDULED ?
ABSENT → ATTENDED ?
CANCELLED → ATTENDED ?
```

Hasta su confirmación:

```text
PENDING_FUNCTIONAL_DEFINITION
```

No deben asumirse automáticamente.

---

# 47. ClinicalAttention

`ClinicalAttention` no utiliza un lifecycle enum.

Conceptualmente:

```text
exists
```

cuando una consulta realmente ocurrió.

---

# 48. Creación de ClinicalAttention

Puede ocurrir mediante:

```text
MarkAppointmentAttended
```

o:

```text
RegisterDirectAttention
```

Una Attention directa no exige crear Appointment retrospectivo.

---

# 49. Eliminación de ClinicalAttention

No existe transición:

```text
ACTIVE → DELETED
```

como estado.

La eliminación física solo puede ejecutarse cuando la Attention:

```text
has no clinical/economic dependencies
```

Si posee dependencias:

```text
delete blocked
```

---

# 50. Evolution

`Evolution` no tiene estado funcional.

Operaciones:

```text
CreateEvolution
CorrectEvolution
```

No existen:

```text
DRAFT
PUBLISHED
APPROVED
LOCKED
```

en el alcance actual.

---

# 51. Corrección de Evolution

La corrección mantiene:

```text
originalAuthor
originalCreatedAt
```

y actualiza:

```text
lastModifiedBy
lastModifiedAt
```

No se crea automáticamente una versión independiente visible.

---

# 52. ClinicalEvaluation

`ClinicalEvaluation` no tiene lifecycle enum.

Operaciones principales:

```text
CreateClinicalEvaluation
CorrectClinicalEvaluation
```

---

# 53. Corrección de ClinicalEvaluation

Una corrección modifica el registro existente según reglas autorizadas.

Debe preservar:

```text
originalAuthor
originalDate
lastModifier
lastModifiedAt
```

---

# 54. Evaluación con análisis IA previo

Cuando una Evaluación corregida ya posee análisis de IA guardados:

```text
existing AI analysis
remains unchanged
```

No se recalcula automáticamente.

Un nuevo análisis deberá ejecutarse explícitamente cuando exista el módulo IA.

---

# 55. Treatment

Estados:

```text
IN_PROGRESS
FINISHED
```

No existen:

```text
PAUSED
ABANDONED
WAITING
```

---

# 56. Creación de Treatment

Estado inicial:

```text
IN_PROGRESS
```

Precondiciones:

```text
Person exists
valid responsible clinical professional selected
```

Si la Persona estaba Inactive:

```text
Person
INACTIVE → ACTIVE
```

de forma derivada.

---

# 57. IN_PROGRESS → FINISHED

Operación:

```text
FinalizeTreatment
```

Transición:

```text
IN_PROGRESS
     │
     ▼
FINISHED
```

Puede registrar:

```text
finishReason?
conclusion?
finishDate?   [pending functional definition if unresolved]
```

---

# 58. Motivos de finalización

Valores funcionales conocidos:

```text
DISCHARGE
INTERRUPTION
REFERRAL
OTHER
```

UI:

```text
Alta
Interrupción
Derivación
Otro
```

El motivo es opcional según la definición funcional original.

---

# 59. Indicaciones activas al finalizar Treatment

Si existen `SalaClinicalIndication` activas vinculadas:

```text
show warning
```

pero:

```text
do not block
```

y:

```text
do not automatically close indications
```

La finalización puede continuar.

---

# 60. FINISHED → IN_PROGRESS

Operación:

```text
ReopenTreatment
```

Transición:

```text
FINISHED
   │
   ▼
IN_PROGRESS
```

---

# 61. Validación de responsable al reabrir

Si el profesional responsable anterior sigue:

```text
InternalUser ACTIVE
+
has KINESIOLOGIST or OSTEOPATH role
```

puede conservarse.

En caso contrario:

```text
new responsible professional required
```

antes de completar la reapertura.

---

# 62. Efecto de ReopenTreatment sobre Person

Si no existía otra actividad vigente:

```text
Person
INACTIVE → ACTIVE
```

automáticamente.

---

# 63. Múltiples reaperturas

La posibilidad funcional de:

```text
IN_PROGRESS
→ FINISHED
→ IN_PROGRESS
→ FINISHED
→ IN_PROGRESS
```

queda:

```text
PENDING_FUNCTIONAL_DEFINITION
```

si todavía no fue confirmada por el Analista.

La persistencia no debe diseñarse de manera irreversible hasta resolverlo.

---

# 64. Falta de Atención reciente

No existe transición automática:

```text
IN_PROGRESS → FINISHED
```

por falta de Atención.

La condición:

```text
TreatmentWithoutRecentAttention
```

es un Read Model / condición derivada.

El equipo decide si finaliza o mantiene el Tratamiento.

---

# 65. SalaClinicalIndication

Estados:

```text
ACTIVE
CLOSED
```

---

# 66. Creación de SalaClinicalIndication

Estado inicial:

```text
ACTIVE
```

Puede estar asociada:

```text
with Treatment
or
without Treatment
```

según la definición funcional.

---

# 67. ACTIVE → CLOSED

Operación:

```text
CloseSalaClinicalIndication
```

Transición:

```text
ACTIVE
  │
  ▼
CLOSED
```

Puede ser ejecutada por cualquier usuario interno según la regla funcional existente.

Cerrar no permite modificar contenido clínico.

---

# 68. Trazabilidad de cierre

Debe conservarse:

```text
closedBy
closedAt
```

---

# 69. Baja de Sala y ClinicalIndication

Efecto automático:

```text
SalaParticipation
ACTIVE → ENDED
```

produce:

```text
all active SalaClinicalIndications
ACTIVE → CLOSED
```

La historia permanece disponible.

---

# 70. Finalización de Treatment y ClinicalIndication

No produce transición automática sobre la Indicación.

Ejemplo:

```text
Treatment
IN_PROGRESS → FINISHED

SalaClinicalIndication
remains ACTIVE
```

hasta revisión manual o baja de Sala.

---

# 71. Reapertura de Indicación

La transición:

```text
CLOSED → ACTIVE
```

queda:

```text
PENDING_FUNCTIONAL_DEFINITION
```

si no fue confirmada.

No debe implementarse por inferencia.

---

# 72. SocialWorkOrder

No utiliza lifecycle enum.

Una Orden:

```text
exists
```

hasta ser eliminada legalmente o mantenerse como histórica.

---

# 73. Orden vencida

`expired` es una condición derivada:

```text
expirationDate exists
AND
expirationDate < currentDate
```

No representa estado persistido:

```text
EXPIRED
```

---

# 74. Consecuencia del vencimiento

Una Orden vencida:

```text
does NOT block
```

- ClinicalAppointments;
- ClinicalAttentions;
- ClinicalIncome;
- otros procesos.

No genera renovación automática.

---

# 75. Eliminación de SocialWorkOrder

Una Orden puede eliminarse si cumple las reglas funcionales.

Si existe `ClinicalIncome` que la referencia:

```text
delete blocked
```

hasta corregir esa relación.

No existe estado:

```text
VOIDED
```

---

# 76. SalaPayment

Cada Pago / renovación de Sala otorga un mes calendario, con extremos incluidos.
Sin cobertura en la Fecha de cobro, comienza en `paidAt` y termina un mes después.
Si la Fecha de cobro está cubierta, se recorre toda la cadena continua no revertida
(coberturas contiguas o solapadas): el nuevo tramo comienza al día siguiente de su
final y termina un mes calendario después de ese final. Se suma el mes en DateOnly/UTC,
con clamp al último día real del mes destino (31/01/2026 → 28/02/2026;
31/01/2028 → 29/02/2028; 28/02/2026 → 28/03/2026).
No hay gracia ni vencimiento mensual fijo. Se permiten varios Pagos en un mismo mes.
La reversión invalida su cobertura sin reescribir coberturas posteriores.
`operationId` es la única clave de idempotencia; se serializa por Persona con advisory lock.
El Plan financiero queda referenciado y su nombre se congela al cobrar; no modifica
`SalaParticipation.planId` ni `SalaPlanAssignment`. Ingresos financieros se agrupan por `paidAt`.

---

# 77. Corrección de SalaPayment

Los Pagos y sus coberturas son históricos inmutables. Una corrección financiera se realiza mediante reversión con motivo y una nueva operación explícita.

---

# 78. Eliminación de SalaPayment

No se elimina el Pago para corregirlo: se conserva junto con su reversión. Las coberturas de Pagos posteriores nunca se desplazan.

---

# 79. Efecto sobre PaymentStatus

La vigencia actual se deriva de las coberturas no revertidas que incluyen hoy operativo de Argentina y del final de su cadena continua. Sin cobertura: `hasValidAccess=false`, `validUntil=null`. Para una actividad pasada se exige que el Pago existiera al inicio y no estuviera revertido entonces; una reversión posterior no cambia retrospectivamente esa actividad.

---

# 80. ClinicalIncome

No utiliza lifecycle enum.

Puede:

```text
create
correct
delete
```

según permisos.

No existe estado:

```text
VOIDED
```

---

# 81. Expense

No utiliza lifecycle enum.

Puede:

```text
create
correct
delete
```

según permisos.

No existe:

```text
CANCELLED
VOIDED
```

---

# 82. Eliminación económica

Cuando un movimiento económico se elimina:

```text
it stops contributing to:
- lists
- totals
- dashboards
- payment status when applicable
```

No se conserva como movimiento visible anulado.

La auditoría técnica/seguridad que corresponda se trata de manera independiente.

---

# 83. Catálogos con ACTIVE / INACTIVE

Algunos catálogos sí utilizan estado explícito.

Ejemplos conocidos:

```text
ClinicalProtocol
ClinicalLibraryResource
MeasurementMethod
```

Estados:

```text
ACTIVE
INACTIVE
```

---

# 84. ACTIVE → INACTIVE en catálogo

Transición:

```text
ACTIVE
  │
  ▼
INACTIVE
```

Efecto:

```text
not available for new selections
```

pero:

```text
historical references remain valid
```

---

# 85. Catálogos retirables sin estado funcional visible

Otros catálogos se retiran de nuevas selecciones.

Ejemplos:

```text
PaymentMethod
ExpenseCategory
SocialWork
```

La implementación técnica puede utilizar un flag interno de disponibilidad si resulta conveniente.

Eso no implica necesariamente exponer al usuario un lifecycle formal:

```text
ACTIVE / INACTIVE
```

---

# 86. Eliminación de definición de catálogo

Una definición retirada/eliminada nunca debe destruir registros históricos que ya la utilizaron.

La estrategia concreta será definida en `DATABASE.md`.

---

# 87. Transiciones automáticas permitidas

Solo se implementarán automatismos funcionalmente definidos.

Automatismos conocidos:

```text
new active SalaParticipation
→ Person ACTIVE

new Treatment IN_PROGRESS
→ Person ACTIVE

future ClinicalAppointment SCHEDULED
→ Person ACTIVE

loss of last active relationship
→ Person INACTIVE

LeaveSala
→ active Routine HISTORICAL

LeaveSala
→ active SalaClinicalIndications CLOSED

ClinicalAppointment SCHEDULED → ATTENDED
→ create ClinicalAttention
```

---

# 88. Automatismos prohibidos

No implementar:

```text
past SalaOccurrence
→ ABSENT automatically
```

No implementar:

```text
Treatment with no recent Attention
→ FINISHED automatically
```

No implementar:

```text
unpaid Student
→ SalaParticipation ENDED
```

No implementar:

```text
unpaid Student
→ Portal blocked
```

No implementar:

```text
expired SocialWorkOrder
→ Clinical activity blocked
```

No implementar:

```text
finished Treatment
→ SalaClinicalIndication CLOSED automatically
```

---

# 89. No automatismos destructivos por cron

El paso del tiempo por sí solo no debe producir operaciones destructivas salvo que una regla funcional futura lo defina explícitamente.

Los procesos temporales pueden calcular:

```text
isExpired
daysWithoutAttention
isFuture
paymentPending
```

pero no ejecutar automáticamente:

```text
delete
finish
cancel
remove
inactivate
```

sin una regla de negocio expresa.

---

# 90. Reglas de implementación

Una transición con consecuencias de negocio debe representarse como un Use Case/Application Service explícito.

Ejemplo correcto:

```text
FinalizeTreatment
```

Ejemplo a evitar:

```text
prisma.treatment.update({
  data: {
    status: "FINISHED"
  }
})
```

desde un Controller sin aplicar las reglas relacionadas.

---

# 91. Comandos principales identificados

People:

```text
InactivatePerson
```

Team:

```text
InactivateInternalUser
ReactivateInternalUser
AddRole
RemoveRole
```

Sala:

```text
JoinSala
LeaveSala
CreateFixedSalaBooking
EndFixedSalaBooking
CancelSalaOccurrence
MarkSalaAttendance
ReplaceRoutine
```

Clinic:

```text
ScheduleClinicalAppointment
RescheduleClinicalAppointment
CancelClinicalAppointment
MarkAppointmentAbsent
MarkAppointmentAttended
CorrectAttendedAppointment
RegisterDirectAttention
FinalizeTreatment
ReopenTreatment
CloseSalaClinicalIndication
```

Esta lista es conceptual y puede ampliarse.

---

# 92. Acciones que no son estados

No crear estados para representar acciones.

Ejemplo:

```text
RESCHEDULED
```

no es estado.

Es:

```text
RescheduleClinicalAppointment
```

Tampoco:

```text
CORRECTED
```

para Evolution.

Es:

```text
CorrectEvolution
```

---

# 93. Condiciones derivadas vs estados

Ejemplos de condiciones derivadas:

```text
Person is Active
SocialWorkOrder is expired
Student has no valid Sala coverage
Treatment has no recent Attention
Sala slot has capacity
ClinicalAppointment is future
```

No todas necesitan una columna persistida.

---

# 94. Pendientes funcionales

Las siguientes áreas continúan dependiendo de respuestas del Analista.

## SalaOccurrence

Matriz exacta de correcciones:

```text
RESERVED ↔ ATTENDED
RESERVED ↔ CANCELLED
RESERVED ↔ ABSENT
ATTENDED ↔ ABSENT
CANCELLED ↔ ATTENDED
etc.
```

---

## ClinicalAppointment

Transiciones de corrección como:

```text
CANCELLED → SCHEDULED
ABSENT → ATTENDED
CANCELLED → ATTENDED
```

---

## Treatment

Confirmar:

```text
multiple finish/reopen cycles
```

y detalles asociados a fechas de finalización/reapertura.

---

## SalaClinicalIndication

Confirmar si:

```text
CLOSED → ACTIVE
```

está permitido.

---

## FixedSalaBooking / SalaOccurrence

La persistencia utiliza proyección/materialización lazy:

```text
FixedSalaBooking / OneOffReservation + concrete date
→ virtual RESERVED occurrence

explicit attendance operation or unpaid fixed occurrence reaching its start
→ persisted SalaOccurrence
```

No se pre-materializan masivamente ocurrencias futuras. `SAL-TUR-08` sigue pendiente solo para la creación retrospectiva con origen específicamente `SPONTANEOUS`.

---

# 95. Regla frente a pendientes

Mientras una transición esté marcada:

```text
PENDING_FUNCTIONAL_DEFINITION
```

no se debe:

- implementar automáticamente;
- asumir que está permitida;
- asumir que está prohibida;
- crear constraints irreversibles;
- diseñar UI basada en esa conclusión.

Debe esperarse la definición funcional.

---

# 96. Resumen visual

```text
Person
INACTIVE
   │
   ├── Join Sala
   ├── Start/Reopen Treatment
   └── Schedule future appointment
   ▼
ACTIVE
   │
   └── last active relationship ends
   ▼
INACTIVE
```

```text
SalaParticipation
ACTIVE
   │ Leave Sala
   ▼
ENDED

Re-entry
→ NEW SalaParticipation
```

```text
Routine
ACTIVE
   │ Replace / Leave Sala
   ▼
HISTORICAL
```

```text
InternalUser
ACTIVE
   │ Inactivate
   │ [may be blocked]
   ▼
INACTIVE
   │ Reactivate
   ▼
ACTIVE
```

```text
ClinicalAppointment

SCHEDULED
   ├────────────→ CANCELLED
   ├────────────→ ABSENT
   └────────────→ ATTENDED
                       │
                       └── create ClinicalAttention
```

```text
Treatment
IN_PROGRESS
   │ Finalize
   ▼
FINISHED
   │ Reopen
   ▼
IN_PROGRESS
```

```text
SalaClinicalIndication
ACTIVE
   │ Close
   │ or Leave Sala
   ▼
CLOSED
```

---

# 97. Principios finales

1. Los estados deben representar conceptos funcionales reales.
2. No crear estados solo para facilitar implementación.
3. `PersonStatus` es derivado.
4. Un reingreso a Sala crea una nueva `SalaParticipation`.
5. Una reserva pasada no se convierte automáticamente en Ausente.
6. Marcar un ClinicalAppointment como Atendido crea una ClinicalAttention.
7. Corregir un Appointment Atendido requiere validar dependencias.
8. ClinicalAttention, Evolution y ClinicalEvaluation no necesitan estados artificiales.
9. Treatment solo utiliza `IN_PROGRESS` y `FINISHED`.
10. La falta de actividad clínica no cierra Treatments automáticamente.
11. Finalizar Treatment no cierra automáticamente Indicaciones para Sala.
12. Vencimiento de Orden es una condición derivada, no estado.
13. Los movimientos económicos no utilizan estado Anulado.
14. Los catálogos preservan referencias históricas.
15. Las transiciones con efectos secundarios deben implementarse como operaciones de negocio explícitas.
16. Las transiciones multi-entidad deben ser atómicas cuando la consistencia lo requiera.
17. Los automatismos destructivos no se implementan salvo definición funcional explícita.
18. Las transiciones pendientes del Analista no deben resolverse por inferencia técnica.

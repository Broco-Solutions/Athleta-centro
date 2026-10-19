# ATHLETA_MANAGER_DECISIONES_FUNCIONALES.md

## Propósito y criterio de consolidación

Fecha de consolidación: **2026-10-02**. Estado verificado: rama local **`ramiro`**, incluidos los cambios existentes sin commit.

Las decisiones registradas en este documento fueron ratificadas funcionalmente por el entorno de trabajo del proyecto. La implementación existente en `ramiro` se utiliza para identificar y verificar qué alternativa fue efectivamente adoptada.

La existencia de un comportamiento en el código no implica, por sí sola, aprobación funcional para decisiones nuevas. Las futuras definiciones deben pasar por análisis y aprobación antes de incorporarse como reglas vigentes.

Este criterio aplica desde el 2026-10-02 y distingue las decisiones históricas expresamente ratificadas de las decisiones futuras sujetas a análisis y aprobación. Este registro conserva la discusión histórica: qué estaba en disputa, qué se adoptó y qué regla queda vigente. No reemplaza la Descripción Integral del Proyecto, que debe contener únicamente la regla funcional definitiva, sin trasladar la discusión histórica entre alternativas.

El Markdown servirá como fuente para sincronizar posteriormente la Descripción Integral. El PDF `Athleta Manager - Descripción de Sistema.pdf` no se modifica en esta consolidación. Los estados y respuestas se actualizan en [ATHLETA_MANAGER_DUDAS_FUNCIONALES.md](ATHLETA_MANAGER_DUDAS_FUNCIONALES.md). Las contradicciones todavía no resueltas permanecen pendientes de revisión; esta consolidación no aprueba comportamientos adicionales encontrados en código.

## Decisiones históricas ratificadas

Las siguientes 16 decisiones son las expresamente aprobadas para esta consolidación. PER-02 y SAL-PAG-06 corrigen respuestas anteriores ya marcadas RESUELTO; SAL-HOR-08 ya estaba resuelto individualmente y se retira del resumen de pendientes. PER-01 conserva el alta explícita e independiente como Paciente clínico.

| ID / Tema | Decisión que estaba en disputa | Decisión finalmente adoptada | Regla funcional vigente | Evidencia en la implementación |
|---|---|---|---|---|
| PER-02 — Alta general de Persona | Alta desde Sala o Clínica, sin alta neutral/general, frente a un padrón transversal independiente. | Alta general de Persona, con vinculación posterior a las áreas. | Una Persona puede darse de alta primero como identidad general del sistema, sin incorporarla inmediatamente a Sala ni registrarla como Paciente. Posteriormente puede vincularse a Sala, Clínica o ambas áreas reutilizando la misma Persona. | `apps/web/src/app/people/page.tsx` — `PeoplePage`, acción Nueva Persona y `PersonForm`; `apps/api/src/people/people.controller.ts` — `PeopleController.create(...)`, POST /api/people; `apps/api/src/people/people.service.ts` — `PeopleService.create(...)`, crea Persona sin participación de Sala, alta clínica ni Tratamiento. |
| PER-06 — Personas menores de edad | Definir edad mínima, uso del alta general por menores y necesidad de un circuito de padre/tutor. | Sin edad mínima ni circuito especial; se mantiene la validación acordada de fecha de nacimiento no futura, presente en el working tree. | No existe edad mínima funcional para registrar una Persona. Una Persona menor de edad utiliza el mismo circuito general de alta. En el alcance actual no existen cuentas de padres/tutores ni un flujo especial para menores. La fecha de nacimiento no puede ser posterior a la fecha actual; esto no constituye una edad mínima. | `apps/api/src/people/person.dto.ts` — `CreatePersonDto` y `UpdatePersonDto`; `apps/api/src/people/people.service.ts` — `PeopleService.create(...)`, `update(...)` y `validateBirthDate(...)`; `apps/web/src/app/people/page.tsx` — `PersonForm` y su esquema de validación. El estado local incluye el rechazo de fechas futuras y no exige edad mínima ni tutor. |
| SAL-HOR-08 — Capacidad 0 | Permitir capacidad 0 y utilizarla como cierre, frente a capacidad positiva con cierre explícito. | Capacidad entera mayor o igual a 1 y excepción específica de cierre. | Toda capacidad válida es un entero mayor o igual a 1. El valor 0 no representa cierre. Los cierres se registran explícitamente como excepciones de cierre. | `apps/api/src/sala/sala.dto.ts` — `CapacityDto`, `ScheduleSlotDto`, `ReplaceScheduleSlotDto` y `ScheduleExceptionDto`; `apps/api/src/sala/sala.service.ts` — `SalaService.addException(...)`, tipo CLOSURE. |
| SAL-PAG-06 — Reversión de Pagos de Sala | La documentación descartaba devolución/reversión; debía distinguirse esa afirmación de la corrección administrativa de un Pago. | Reversión administrativa separada, conservando el Pago original. | No se admiten Pagos de Sala con importe negativo. Un Pago registrado incorrectamente puede revertirse. La reversión no elimina el Pago original: se registra de forma separada, con motivo y trazabilidad. Corresponde a una corrección administrativa del registro, no a una devolución de dinero al alumno. | `apps/api/src/sala/sala.service.ts` — `SalaService.createPayment(...)`, `positiveMoney(...)` y `reversePayment(...)`; `apps/api/src/sala/sala.controller.ts` — `SalaController.reversePayment(...)`, POST /api/sala/payments/:id/reverse; `apps/web/src/features/finance/sala-payment-panel.tsx` — `SalaPaymentPanel`, acción Revertir y confirmación Revertir pago; `apps/api/prisma/schema.prisma` — `SalaPayment` y `SalaPaymentReversal`, motivo, usuario y fecha de registro separados del importe original. |
| CLI-TRA-07 — Motivo de finalización Otro | Exigir o no una explicación adicional al seleccionar Otro. | Sin explicación adicional obligatoria; conclusión opcional. | Seleccionar Motivo de finalización = Otro no obliga a cargar una explicación adicional. La conclusión del Tratamiento continúa siendo opcional. El Motivo de finalización también es opcional y admite Alta, Interrupción, Derivación u Otro. | `apps/api/src/clinic/treatment.service.ts` — `TreatmentService.finalize(...)`; `apps/api/src/clinic/clinic.dto.ts` — `FinalizeTreatmentDto.finishReason` y `conclusion`, sin validación especial para OTHER. |
| CLI-TRA-08 — Etapa actual del Tratamiento | Texto libre frente a catálogo o conjunto cerrado de etapas. | Texto libre opcional. | Etapa actual es un texto libre opcional. | `apps/api/src/clinic/clinic.dto.ts` — `TreatmentDto.currentStage`; `apps/api/src/clinic/treatment.service.ts` — `TreatmentService.create(...)`, guarda el texto o ausencia de valor. |
| CLI-TRA-13 — Varios Tratamientos sin atención reciente | Una fila por Persona frente a una fila por cada Tratamiento alcanzado por el filtro. | Una única fila por Persona; basta un Tratamiento En curso alcanzado. | El listado muestra una única fila por Persona. Una Persona entra al filtro sin atención reciente cuando al menos uno de sus Tratamientos En curso cumple el criterio seleccionado, aunque tenga varios Tratamientos alcanzados. | `apps/api/src/clinic/clinic.service.ts` — `ClinicService.listPatientOverview(...)`, consulta Pacientes, filtra con `person.treatments.some(...)` y representa una fila por Persona. |
| CLI-EVA-08 — Rango de Tests clínicos tipo Escala | Mínimo y máximo obligatorios, límites independientes opcionales o rango universal para todas las Escalas. | Límites opcionales e independientes, sin rango universal. | Los Tests de tipo Escala pueden definir opcionalmente un valor mínimo, un valor máximo o ambos. Si ambos están informados, el mínimo no puede superar al máximo. Cuando existe un límite configurado, el resultado debe respetarlo. Si ninguno está informado, la Escala no tiene límites configurados. No existe un rango universal obligatorio para todas las Escalas. | `apps/api/src/clinic/clinic.dto.ts` — `ClinicalTestDefinitionDto.scaleMin` y `scaleMax`; `apps/api/src/clinic/evaluation.service.ts` — `EvaluationService.validateDefinition(...)` y `validateValue(...)`, validan orden y cada límite presente. |
| OS-03 — Obra social de una Orden | Exigir la Obra social actual de la Persona frente a permitir una referencia propia distinta en la Orden. | Referencia propia de la Orden, que puede diferir de la ficha de la Persona. | Una Orden puede registrar una Obra social distinta de la Obra social que figure actualmente en la ficha de la Persona. La Orden conserva su propia referencia a Obra social. La Obra social elegida debe existir y estar disponible para selección. | `apps/api/src/clinic/social-work.service.ts` — `SocialWorkService.createOrder(...)`, valida existencia y disponibilidad sin exigir coincidencia con la ficha de Persona. |
| OS-05 — Referencia de una Orden | Referencia presentada como opcional y significado no definido: número de orden, autorización u otro dato administrativo. | Texto libre obligatorio, sin clasificación estructural de su significado. | Referencia es un texto libre obligatorio utilizado para identificar la Orden. No puede quedar vacío. El sistema no diferencia estructuralmente si corresponde a número de orden, autorización u otra referencia administrativa. | `apps/api/src/clinic/clinic.dto.ts` — `SocialWorkOrderDto.reference`; `apps/api/src/clinic/social-work.service.ts` — `SocialWorkService.createOrder(...)`, error ORDER_REFERENCE_REQUIRED ante texto vacío. |
| OS-07 — Fecha de emisión y Fecha de vencimiento | Exigir vencimiento igual o posterior a emisión frente a no aplicar una restricción cronológica entre ambas. | Sin restricción cronológica entre las dos fechas. | No existe una restricción funcional entre Fecha de emisión y Fecha de vencimiento. El sistema no bloquea una Fecha de vencimiento anterior a la Fecha de emisión. | `apps/api/src/clinic/social-work.service.ts` — `SocialWorkService.createOrder(...)`, registra ambas fechas sin compararlas; `apps/api/src/clinic/clinic.dto.ts` — `SocialWorkOrderDto`. |
| CLI-ING-05 — Obra social pagadora al vincular Orden | Permitir distinta Obra social pagadora frente a exigir coincidencia con la Orden vinculada. | Pagador Obra social y coincidencia exacta con la Obra social de la Orden. | Cuando un Ingreso clínico se vincula a una Orden, el Pagador debe ser Obra social y la Obra social pagadora debe coincidir exactamente con la Obra social registrada en esa Orden. | `apps/api/src/finance/finance.service.ts` — `FinanceCatalogService.createClinicalIncome(...)` (nombre real de la clase local), error INCOME_ORDER_PAYER_MISMATCH si el Pagador o la Obra social no coinciden. |
| FIN-01 — Importe de Gastos | Importe obligatorio sin restricción positiva explícita frente a exigir Importe mayor a cero. | Importe ARS entero y estrictamente positivo. | Todo Gasto debe tener un Importe en ARS entero y estrictamente mayor a cero. | `apps/api/src/finance/finance.service.ts` — `money(...)` y `FinanceCatalogService.createExpense(...)`; `apps/api/prisma/schema.prisma` — `Expense.amount`, Decimal sin decimales. |
| FIN-08 — Decimales de cotización USD | Cantidad máxima de decimales de la cotización USD sin definición funcional explícita. | Hasta 2 decimales y cotización positiva. | La cotización USD debe ser positiva y admite como máximo 2 decimales. | `apps/api/src/finance/finance.service.ts` — `exchange(...)` y `FinanceCatalogService.upsertExchangeRate(...)`; `apps/api/prisma/schema.prisma` — `ExchangeRate.rate`, Decimal(14, 2). |
| POR-SAL-05 — Borde de la ventana de 30 días | Incluir o excluir el día actual + 30 días de la ventana móvil. | Ambos extremos incluidos. | La ventana de reservas del Portal incluye desde el día actual hasta el día actual + 30 días, ambos inclusive. | `apps/api/src/portal/portal.service.ts` — `PortalService.reserve(...)`, límite máximo de hoy + 30 días y rechazo de fechas posteriores. Esta consolidación se limita al carácter inclusivo y no modifica fechas ni timezone. |
| POR-DAT-02 — Campos opcionales vacíos en Mis datos | Mostrar Sin informar, dejar una fila vacía u omitir el dato opcional ausente. | Omitir los datos opcionales no informados. | Los datos opcionales no informados se omiten de la sección Mis datos. No se muestran filas vacías ni el texto Sin informar. | `apps/api/src/portal/portal.service.ts` — `PortalService.profile(...)`, omite campos opcionales sin valor; `apps/web/src/app/portal/profile/page.tsx` — `Profile`, agrega filas solo cuando existen esos datos. |

## Decisiones aprobadas posteriormente

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

### SAL-RUT-10 — Rutinas preestablecidas

Fecha: **2026-10-09**. Estado: **RESUELTO**. Fuente: **Definición aprobada 2026-10-09**.

Profesor y Administrador general pueden crear, editar y eliminar Rutinas preestablecidas compartidas por Athleta. Al definir la Rutina de un Alumno pueden crearla desde cero o utilizar una preestablecida. Al seleccionar una preestablecida se muestra primero una vista detallada en modo lectura. Desde allí pueden asignarla tal como está o elegir Editar para personalizar una copia antes de guardarla. En ambos casos, la Rutina resultante del Alumno es independiente: modificarla no altera la preestablecida y modificar o eliminar posteriormente la preestablecida no altera Rutinas ya asignadas. Las preestablecidas no pertenecen a un Profesor específico y no utilizan estados Activo/Inactivo.

Definiciones aprobadas el **2026-10-07** para los Bloques 1 y 2 de Planes y Servicios de Sala y las reservas puntuales del Portal.

| ID / Tema | Decisión que estaba en disputa | Decisión finalmente adoptada | Regla funcional vigente | Evidencia en la implementación |
|---|---|---|---|---|
| SAL-PLA-01 — Servicios incluidos en Planes | Definir la relación entre Planes y Servicios de Sala. | Relación muchos-a-muchos explícita; precio mensual en el Plan. | Un Servicio de Sala representa una actividad y su duración. Un Plan define precio mensual y uno o más Servicios incluidos. El Servicio no tiene precio propio. Un Servicio puede estar incluido en varios Planes. Un Plan nuevo requiere al menos un Servicio. Por ahora los Servicios no poseen disponibilidad horaria ni capacidad propia: utilizan la grilla y capacidad generales de Sala. Los Planes anteriores pueden quedar sin Servicios hasta que un usuario los edite; no se asignan asociaciones automáticamente. | `apps/api/prisma/schema.prisma` — SalaPlanService; `apps/api/src/sala/sala.service.ts` — validación y actualización atómica; `apps/web/src/app/sala/configuration/page.tsx` — selección de Servicios en el editor de Plan. |
| SAL-PLA-02 — Servicios habilitados según Plan actual | Definir los Servicios disponibles para la operación interna y Portal. | Derivarlos exclusivamente del Plan de la participación activa; validación compartida en backend. | Una Persona que participa de Sala sólo puede crear nuevas Reservas y Turnos fijos para Servicios incluidos en su Plan actual. Los Servicios que se muestran en Portal y en la operación interna del Alumno se derivan de ese Plan. Un Servicio retirado no puede utilizarse para nuevas operaciones. Los registros ya existentes no se cancelan ni reescriben automáticamente cuando cambia el Plan o su composición de Servicios. La modificación de un Turno fijo exige también un Servicio permitido; las nuevas operaciones requieren Servicio explícito. | `apps/api/src/sala/sala.service.ts` — listPersonServiceTypes y validateBooking; `apps/api/src/portal/portal.service.ts` — delegación a Sala; `apps/web/src/features/sala/person-workspace.tsx` y `apps/web/src/app/portal/sala/page.tsx` — Servicios del Plan y selección válida al editar. |
| POR-SAL-08 — Pago mensual para nuevas Reservas puntuales del Portal (**SUSTITUIDA: vigencia móvil, 2026-10-19**) | Definir la habilitación por Pago sin extenderla a operaciones internas o Turnos fijos. | Pago válido del Mes/Año reservado o fecha reservada entre los días 1 y 15 inclusive. | Las nuevas Reservas puntuales creadas por el Alumno desde Portal se habilitan según el Mes/Año y el día de la fecha que se desea reservar, no según el día actual. Si existe un Pago de Sala válido y no revertido para ese Mes/Año, el Alumno puede reservar cualquier fecha permitida de ese mes. Si el Pago de ese Mes/Año está pendiente, el Alumno puede reservar únicamente fechas comprendidas entre el día 1 y el día 15 inclusive. Las fechas desde el día 16 hasta fin de mes requieren que ese Mes/Año tenga un Pago válido registrado. La regla se aplica de igual manera a meses actuales y futuros: un mes futuro pendiente no habilita automáticamente fechas posteriores al día 15. El Pago continúa identificado como PENDING hasta que se registre un Pago válido. La posibilidad de reservar los días 1 al 15 no equivale a un Pago registrado. Con un Pago válido el estado es PAID. Un Pago revertido vuelve a considerarse no válido para esta regla. La reversión conserva el Pago original. La fecha real de cobro no define la vigencia. La restricción aplica únicamente a nuevas Reservas puntuales creadas por el Alumno desde Portal. No aplica a operaciones internas ni a Turnos fijos del Portal. La falta de Pago o la reversión posterior de un Pago no cancela ni modifica Reservas ya existentes. El Pago continúa siendo registrado manualmente en Athleta Manager; no existe procesamiento automático de cobros en el alcance actual. | `apps/api/src/portal/portal.service.ts` — assertSalaReservationPaymentEligibility y paymentState; `apps/web/src/app/portal/sala/page.tsx` — mensaje de bloqueo e información del formulario. |

## Decisiones todavía no consolidadas

Estos cinco puntos permanecen **PENDIENTE**. Su implementación actual no equivale a ratificación funcional.

| ID / Tema | Motivo de la pendiente y evidencia observada |
|---|---|
| INI-03 — Cancelados/Ausentes en Sala | Falta aprobar la presentación como total combinado o subtotales separados. `apps/web/src/app/page.tsx` — `HomePage` contiene una bienvenida, sin implementación suficiente de esas tarjetas. |
| INI-04 — Próximos horarios de Sala | Falta aprobar cantidad y horizonte exactos. `apps/web/src/app/page.tsx` — `HomePage` no implementa este bloque del Dashboard. |
| INI-06 — Label de Atendidos/Atenciones | Falta aprobar el texto visible exacto. `apps/web/src/app/page.tsx` — `HomePage` no implementa esa tarjeta. |
| INI-07 — Atendidos al seleccionar Mañana | Falta aprobar si se oculta, se muestra en cero o se adapta. `apps/web/src/app/page.tsx` — `HomePage` no implementa la tarjeta ni el selector correspondiente. |
| CAT-04 — Nombres duplicados de catálogos | No existe una regla global ratificada. `apps/api/prisma/schema.prisma` — `SocialWork`, `ClinicalTestDefinition` y `ExpenseCategory` utilizan `normalizedName` único; `ExerciseDefinition` y `PhysicalTestDefinition` tienen unicidad sobre `name`; `PaymentMethod` no declara unicidad del nombre. `apps/api/src/sala/sala.service.ts` — `SalaService.assertPlanNameAvailable(...)` compara nombres normalizados de Planes, mientras `createExerciseDefinition(...)` y `createPhysicalTest(...)` se apoyan en otras restricciones. `apps/api/src/finance/finance.service.ts` — `FinanceCatalogService.create(...)` comprueba Medios de pago sin distinguir mayúsculas, con lógica de edición propia en `update(...)`. La diversidad de mecanismos no permite aprobar una regla uniforme ni decidir nuevas reglas por catálogo. |

## Desalineaciones adicionales detectadas para revisión

Los casos siguientes quedan registrados sin adoptar una decisión definitiva, modificar código ni cambiar el estado de otros ítems de dudas. No representan una auditoría exhaustiva del producto.

| Tema | Definición documental actual | Comportamiento observado | Archivos involucrados | Estado |
|---|---|---|---|---|
| CLI-ING-06 — Orden con Pagador Paciente | La respuesta vigente de CLI-ING-06 permite la asociación opcional a Orden sin restringir el Pagador Paciente. | `FinanceCatalogService.createClinicalIncome(...)` rechaza una Orden vinculada si el Pagador no es Obra social, con INCOME_ORDER_PAYER_MISMATCH. La ratificación de CLI-ING-05 deja expuesta esta contradicción con CLI-ING-06, que no fue incluida entre las decisiones autorizadas a modificar. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — CLI-ING-06 y CLI-ING-05; `apps/api/src/finance/finance.service.ts` — `createClinicalIncome(...)`. | Requiere análisis funcional. |
| CLI-TRA-04 / CLI-TRA-06 — Finalización y última Atención | La finalización debe respetar la Fecha de inicio y la última Atención asociada. | `TreatmentService.finalize(...)` compara con inicio y fecha actual, pero no consulta ni compara la última Atención asociada. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — CLI-TRA-04 y CLI-TRA-06; `apps/api/src/clinic/treatment.service.ts` — `finalize(...)`. | Requiere análisis funcional. |
| CLI-EVA-15 — Preservación de definiciones al corregir | La Evaluación histórica preserva las definiciones de Protocolo y Tests con las que fue registrada. | `EvaluationService.correct(...)` elimina y recrea resultados tomando un nuevo snapshot de la definición actual del Test. El Protocolo se conserva como referencia y las lecturas incluyen su registro actual; no se observa un snapshot de su definición en `ClinicalEvaluation`. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — CLI-EVA-15; `apps/api/src/clinic/evaluation.service.ts` — `correct(...)`, `snapshot(...)`, `detail(...)`; `apps/api/prisma/schema.prisma` — `ClinicalEvaluation` y `ClinicalTestResult`. | Requiere análisis funcional. |
| SAL-TUR-09 / SAL-TUR-10 / SAL-TUR-11 — Corrección de estados desde la agenda | Reservado, Asistió, Cancelado y Ausente pueden corregirse posteriormente sin límite de tiempo ni una matriz rígida por usuarios internos habilitados. | Agenda permite corregir estados ya registrados mediante `correctSalaOccurrence(...)`; el backend conserva la ocurrencia y sus referencias y actualiza `status`, `lastModifiedBy` y `lastModifiedAt`. Las acciones requieren `SALA_AGENDA_MANAGE`. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — SAL-TUR-09, SAL-TUR-10 y SAL-TUR-11; `apps/web/src/features/sala/agenda-panel.tsx` — `BookingModal`; `apps/web/src/features/reservations/reservations-timeline.tsx` — `BookingDialog`, interfaz compartida activa; `apps/api/src/reservations/reservations.service.ts` — `list(...)`, preserva `sourceId` y `startTime` de la actividad; `apps/api/src/sala/sala.service.ts` — `commandOccurrence(...)`. | **ALINEADO / RESUELTO**. |
| POR-SAL-07 — Reservas canceladas visibles | Los compromisos futuros Cancelados permanecen visibles hasta que pasa su fecha/hora. | `PortalService.sala(...)` devuelve Reservas y ocurrencias fijas activas/canceladas sólo mientras su inicio real sea > now en timezone operativo, con fallback al inicio de la ventana para registros históricos. Portal permite cancelar una ocurrencia futura concreta de Turno fijo Reservada o Pendiente de pago, sin modificar la recurrencia semanal ni otras fechas. La cancelación es idempotente y manual, sin marca de impago; se muestra Cancelado hasta el inicio y luego desaparece, sin historial. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — POR-SAL-07; `apps/api/src/portal/portal.service.ts` — `sala(...)`, `cancelFixedOccurrence(...)`; `apps/api/src/sala/sala.service.ts` — `cancelFixedOccurrenceFromPortal(...)`; `apps/web/src/app/portal/sala/page.tsx` — confirmación Cancelar esta fecha. Cobertura en tests de Portal API/UI. | ALINEADO / RESUELTO. |
| Pagos revertidos en consultas financieras y Portal | SAL-PAG-06 consolida una reversión administrativa separada; SAL-PAG-01 se refiere a un Pago válido para determinar el estado de pago. | `SalaService.paymentSummary(...)`, `listStudents(...)` y `PortalService.sala(...)` consideran sólo Pagos válidos no revertidos. Bloque 4 alinea `FinanceCatalogService.unifiedIncome(...)` mediante el filtro de reversión; `totals(...)` deriva de esa consulta sin una segunda resta. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — SAL-PAG-01 y SAL-PAG-06; `apps/api/src/sala/sala.service.ts` — `paymentSummary(...)`; `apps/api/src/finance/finance.service.ts` — `unifiedIncome(...)`, `totals(...)`; `apps/api/src/portal/portal.service.ts` — `sala(...)`. | Resuelto en Bloque 4: sólo Pagos no revertidos determinan estado e ingresos. |
| PER-07 — Inactivación y actividades ya iniciadas de Sala | La inactivación global afecta desde la confirmación hacia adelante y preserva actividades cuya hora de inicio ya ocurrió. | `PeopleService.inactivate(...)` y `SalaService.leaveInTransaction(...)` cortan por instante real en America/Argentina/Buenos_Aires: preservan inicios <= now y cancelan inicios > now, incluyendo la materialización de Turnos fijos de hoy aún futuros. Las recurrencias finalizan con endDate = hoy; las actividades iniciadas admiten corrección interna posterior. `bulkLeave(...)` comparte el instante y la transacción; `leaveImpact(...)` cuenta sólo Reservas cuyo inicio es futuro. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — PER-07; `apps/api/src/people/people.service.ts` — `inactivate(...)`; `apps/api/src/sala/sala.service.ts` — `leaveInTransaction(...)`, `bulkLeave(...)`, `leaveImpact(...)`; tests de integración People y Sala. | **ALINEADO / RESUELTO**. |
| Precisión monetaria en documentación técnica | `ARCHITECTURE.md`, sección Dinero, indica normalmente dos decimales en ARS y posible mayor precisión de cotizaciones; `DATABASE.md` establece ARS sin decimales y cotización con dos. | `money(...)` exige ARS entero y `exchange(...)` admite hasta dos decimales. Los campos de importes y `ExchangeRate.rate` reflejan esas precisiones. La contradicción técnica se registra sin modificar documentos fuera del alcance. | `docs/architecture/ARCHITECTURE.md` — Dinero; `docs/architecture/DATABASE.md` — Importes monetarios y Dólar; `apps/api/src/finance/finance.service.ts` — `money(...)`, `exchange(...)`; `apps/api/prisma/schema.prisma` — `Expense.amount`, `ExchangeRate.rate`. | Requiere análisis funcional. |
| Bloqueos y modelo preliminar de DATABASE.md | `DATABASE.md` todavía marca pendientes el vínculo clínico y varias cardinalidades, propone puentes para Atención–Tratamiento y Estudio–Archivo, y declara unicidad Persona/Mes/Año para Pago de Sala. El documento de dudas ya confirma varias de esas cardinalidades. | El schema contiene `ClinicalPatient` explícito, Atención opcional a un Tratamiento, Atención única por Turno, Evolución única por Atención y archivo opcional único por Estudio. `SalaPayment` tiene unicidad por operación e índice Persona/Mes/Año, sin unicidad declarada sobre ese período; `createPayment(...)` no rechaza por período duplicado. Estas diferencias no autorizan nuevas decisiones ni cambios de arquitectura en esta tarea. | `docs/architecture/DATABASE.md` — isPatient, relaciones clínicas, SalaPayment y BLOCKED_BY_FUNCTIONAL_DEFINITION; `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — PER-01, CLI-ATE-01, CLI-ATE-08, CLI-EVO-01 y CLI-EST-03; `apps/api/prisma/schema.prisma` — modelos citados; `apps/api/src/sala/sala.service.ts` — `createPayment(...)`. | Requiere análisis funcional. |

## SAL-TUR-08 — Espontáneo retrospectivo

Estado: **RESUELTO**. Definición aprobada 2026-10-07.

Profesor, Administrativo y Administrador general pueden registrar una incorporación espontánea en el día actual y también retrospectivamente en una fecha pasada cuando la asistencia efectivamente ocurrió. Una fecha futura no admite incorporación espontánea; corresponde Reserva puntual o Turno fijo.

## SAL-TUR-14 — Alta desde incorporación espontánea

Estado: **RESUELTO**. Definición aprobada 2026-10-07.

La incorporación espontánea puede iniciar desde un Alumno de Sala, una Persona existente todavía no incorporada a Sala o una Persona nueva. Cuando la Persona todavía no pertenece a Sala y la operación corresponde al día actual, el mismo flujo permite asignar Plan y Profesor principal, elegir un Servicio incluido en el Plan y registrar la asistencia espontánea sin abandonar Agenda. La incorporación a Sala y la asistencia se confirman como una única operación. La falta de Pago no bloquea esta operación. Para una fecha pasada no se crea ni backdatea una nueva participación: la Persona debe haber tenido participación válida en esa fecha. El Servicio es obligatorio para nuevas incorporaciones espontáneas y su duración determina los bloques de capacidad ocupados.

## POR-SAL-08 — Pago mensual para nuevas Reservas puntuales del Portal

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **RESUELTO**. Definición aprobada 2026-10-07.

Las nuevas Reservas puntuales creadas por el Alumno desde Portal se habilitan según el Mes/Año y el día de la fecha que se desea reservar, no según el día actual.

Si existe un Pago de Sala válido y no revertido para ese Mes/Año, el Alumno puede reservar cualquier fecha permitida de ese mes.

Si el Pago de ese Mes/Año está pendiente, el Alumno puede reservar únicamente fechas comprendidas entre el día 1 y el día 15 inclusive. Las fechas desde el día 16 hasta fin de mes requieren que ese Mes/Año tenga un Pago válido registrado.

La regla se aplica de igual manera a meses actuales y futuros: un mes futuro pendiente no habilita automáticamente fechas posteriores al día 15.

El Pago continúa identificado como PENDING hasta que se registre un Pago válido. La posibilidad de reservar los días 1 al 15 no equivale a un Pago registrado. Con un Pago válido el estado es PAID.

Un Pago revertido vuelve a considerarse no válido para esta regla. La reversión conserva el Pago original. La fecha real de cobro no define la vigencia.

La restricción aplica únicamente a nuevas Reservas puntuales creadas por el Alumno desde Portal. No aplica a operaciones internas ni a Turnos fijos del Portal.

La falta de Pago o la reversión posterior de un Pago no cancela ni modifica Reservas ya existentes.

El Pago continúa siendo registrado manualmente en Athleta Manager; no existe procesamiento automático de cobros en el alcance actual.

## SAL-HOR-09 — Inicio de Turnos planificados cada 30 minutos

Estado: **RESUELTO**. Definición aprobada 2026-10-08.

Las Reservas puntuales y los Turnos fijos de Sala sólo pueden comenzar cada 30 minutos, en horarios terminados en :00 o :30.

La granularidad de inicio de 30 minutos no modifica la unidad interna de capacidad de Sala, que continúa siendo de 15 minutos. La duración de cada Servicio continúa siendo un múltiplo de 15 minutos y consume capacidad en todos los bloques consecutivos correspondientes.

La regla de inicio cada 30 minutos se aplica tanto al Portal como a la operación interna para crear o modificar Reservas puntuales y Turnos fijos.

La Incorporación espontánea no está sujeta a esta restricción y conserva la granularidad operativa de 15 minutos porque representa una llegada real.

Los registros históricos existentes con inicio :15 o :45 se conservan y no se reescriben automáticamente; una nueva creación o modificación debe respetar :00/:30.

## SAL-TUR-15 / SAL-TUR-16 / SAL-HOR-10 — Ajustes UAT de reservas de Sala

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **RESUELTO**. Definición aprobada 2026-10-08.

Una Persona puede reservar varias actividades en una misma fecha, incluidas varias Reservas puntuales o un Turno fijo con una Reserva puntual, siempre que sus intervalos completos no se superpongan y exista capacidad. Las actividades consecutivas son válidas. La identidad de cada Reserva puntual considera su hora de inicio dentro de la ventana semanal. Cada ocurrencia conserva su origen para corregir el estado de la actividad exacta.

El Turno fijo semanal puede crearse sin Pago. Del día 1 al 15, su ocurrencia está Reservada. Después del día 15, si falta un Pago válido y no revertido del Mes/Año correspondiente, el estado funcional derivado es **Pendiente de pago**; ocupa capacidad en todos sus bloques de 15 minutos. Un Pago válido registrado antes del inicio la habilita como Reservada. Si llega el instante de inicio sin Pago válido, se cancela y persiste sólo esa ocurrencia. Un Pago posterior no la reactiva; las siguientes ocurrencias y el Turno fijo semanal continúan. La cancelación automática se distingue de las correcciones manuales por su marca de fecha y hora. La regla de Pago de las Reservas puntuales del Portal definida en POR-SAL-08 permanece vigente.

La capacidad general inicial es **10 personas**. Puede modificarse desde Configuración de Sala, con mínimo 1. Para cada bloque prevalece la excepción de capacidad, luego la capacidad específica de la ventana, luego la capacidad general configurada y finalmente el valor inicial 10. La instalación inicial crea esa configuración sin reemplazar valores existentes.

## POR-SAL-09 — Fechas y horarios de Reservas puntuales del Portal

Estado: **RESUELTO / ALINEADO**. Definición aprobada 2026-10-09.

El Portal no permite crear Reservas puntuales para fechas pasadas. En el día actual una actividad puede reservarse únicamente si, en el instante de la reserva, quedan **al menos 20 minutos de actividad**. **20 minutos exactos son válidos**; con menos de 20 minutos el horario deja de ofrecerse y el backend rechaza la creación. Las fechas futuras mantienen la ventana POR-SAL-05 de hoy a hoy+30 inclusive.

La validación compara el fin real de la actividad con el instante actual en `America/Argentina/Buenos_Aires`, usando el inicio elegido y la duración real del Servicio resueltos por Sala dentro de la transacción de creación. Un inicio que ya ocurrió sigue siendo válido si quedan 20 minutos o más hasta ese fin. El error `PORTAL_SALA_TIME_PASSED` rechaza horarios con menos de 20 minutos restantes. El Portal actualiza las opciones con un reloj local cada minuto mientras la pantalla o el flujo de Reserva permanece abierto y toma el instante actual al abrirlo, sin polling al backend. Availability del Portal rechaza fechas anteriores a hoy. La restricción aplica únicamente a Reservas puntuales creadas por el Alumno desde Portal; no afecta la operación interna retrospectiva ni Turnos fijos. POR-SAL-08 continúa vigente.

## Inicio operativo del Profesor — decisiones aprobadas 2026-10-13

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Para una cuenta cuyo único rol efectivo sea `PROFESSOR`, Inicio se orienta exclusivamente a la operación de Sala: bienvenida breve, Hoy/Mañana, Próximos horarios como bloque principal, Resumen del día y Seguimiento. Otros roles y roles combinados conservan por ahora el Inicio general. Se mantiene sidebar oscuro, workspace claro, cards blancas y amarillo como acento; sin gráficos, tendencias ni widgets configurables.

### INI-03 — Cancelados / Ausentes

Estado: **RESUELTO**. Se presenta como una sola tarjeta con el total combinado `CANCELLED + ABSENT`, sin tarjetas separadas ni subtotales en esta primera versión.

### INI-04 — Próximos horarios

Estado: **RESUELTO**. Muestra como máximo 3 horarios, en orden ascendente por hora. Hoy incluye solo horarios cuyo inicio todavía no pasó, usando la hora operativa de Argentina. Mañana muestra los primeros 3 horarios con actividad prevista del día siguiente. No hay Semana ni otros días.

Cada horario muestra hora, cantidad de alumnos previstos, hasta 3 nombres y origen (Turno fijo/Reserva); si hay más, muestra `+ N alumnos`. No incluye personas canceladas. El acceso sigue llamándose Reservas y lleva a `/reservations`.

### Indicadores y seguimiento de Sala

Se mantienen INI-01 (Alumnos esperados: presencias planificadas FIXED + ONE_OFF, sin espontáneos) e INI-02 (Asistencias: ATTENDED, incluyendo espontáneos). Los indicadores corresponden a la fecha seleccionada.

Sin rutina activa cuenta Personas con participación activa (`endDate === null`) sin Routine ACTIVE; una rutina histórica no cuenta como activa. Pago pendiente cuenta participantes actuales sin Pago válido y no revertido del mes calendario actual de Argentina, independientemente de Hoy/Mañana. Solo muestra cantidades, sin plazos, importes, deuda histórica ni bloqueos. Ambas cards llevan a `/students?filter=without-routine` y `/students?filter=pending-payment`, respectivamente, según la navegación aprobada el 2026-10-13.

PROF-01 permanece **PENDIENTE**: se ocultan provisoriamente las acciones visuales de nueva Persona/Alumno para Profesor puro, preservando la incorporación de Personas existentes y `PEOPLE_CREATE` en backend. INI-06 e INI-07 siguen pendientes y corresponden a Clínica. La navegación definitiva del Profesor se documenta a continuación.

## Navegación y seguimiento del Profesor puro — 2026-10-13

Estado: **CONFIRMADO / RESUELTO**.

Una cuenta cuyo único rol sea `PROFESSOR` utiliza exclusivamente **Inicio → Reservas → Alumnos → Rutinas**, con rutas `/`, `/reservations`, `/students` y `/routines`. Los roles combinados conservan la navegación basada en permisos.

- **Reservas** es la única agenda operativa general del Profesor: turnos fijos, reservas puntuales, asistencia e incorporación espontánea de Personas existentes.
- **Alumnos** muestra todos los participantes activos de Sala (`endDate === null`), sin limitar por Profesor principal. Muestra explícitamente el Profesor principal con nombre y apellido, Plan, Rutina activa y Pago válido del mes actual de Argentina. Profesor principal organiza responsabilidad y seguimiento, no limita acceso; el Profesor puede abrir cualquier alumno.
- **Rutinas** conserva su sección independiente para preestablecidas y ejercicios.
- **Sala** no se presenta como sección al Profesor. La configuración de horarios, capacidades, cambios permanentes y excepciones corresponde a Administración; se retira únicamente `SALA_SCHEDULE_MANAGE` del rol Profesor.
- **Personas** no se presenta como módulo al Profesor.

La ficha técnica continúa reutilizando internamente las rutas/modelos existentes de Sala, pero esa implementación no debe determinar el lenguaje de navegación visible: para Profesor puro la ficha utiliza contexto **Alumnos** y vuelve a `/students`. Los enlaces antiguos `/sala` y `/sala?view=students` redirigen a Reservas y Alumnos, respectivamente.

**PROF-01 permanece PENDIENTE**. No se ofrece alta nueva de Persona/Alumno en la experiencia del Profesor. `PEOPLE_CREATE` permanece temporalmente en backend hasta validar su autonomía con Athleta; se conserva incorporación de Personas existentes según permisos.

## Profesor — Presentación de Reservas

Estado: **CONFIRMADO / RESUELTO**. Fecha: **2026-10-13**.

Reservas es la única agenda operativa general del Profesor.

Para Profesor puro se presenta como una agenda vertical agrupada por hora de inicio, priorizando Alumno, Servicio, origen y estado.

No se utiliza una timeline horizontal de intervalos de 15 minutos para este rol.

En la fecha actual se distinguen horarios anteriores de actividades en curso y próximas.

Turno fijo, Reserva puntual e Incorporación espontánea se muestran dentro de la misma agenda. El origen es información secundaria y no genera pantallas separadas.

La vista transversal de Sala + Clínica puede conservar la timeline actual para otros perfiles hasta que se defina su experiencia específica.


## Profesor — Gestión de Pagos de Sala — 2026-10-13

**Estado: SUPERADA por la decisión de Bloque 4 del 2026-10-14.**

La definición anterior permitía al Profesor administrar Pagos desde una pestaña Pagos de Sala. Queda sustituida explícitamente por la siguiente regla vigente.

## Pagos de Sala centralizados en Finanzas — 2026-10-14

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

**Estado: CONFIRMADO / RESUELTO.**

- Profesor: consulta únicamente el estado Pago registrado / Pago pendiente. No registra ni revierte, no tiene pestaña Pagos ni acceso económico hacia Finanzas.
- Administrativo: registra, consulta y revierte Pagos de Sala desde Finanzas.
- Administrador general: registra, consulta y revierte Pagos de Sala desde Finanzas.
- Roles combinados: los permisos efectivos siguen siendo la unión de los roles.

Sala muestra el estado del mes actual y, con SALA_PAYMENT_MANAGE, un acceso contextual desde el listado y la ficha: Registrar pago cuando está pendiente y Ver pago cuando existe Pago válido. Ambos llevan a `/finance?view=income&personId=<id>`.

Finanzas es la fuente única de interfaz para alta, consulta de historial y reversión del mismo Pago de Sala. No se crea otro sistema de pagos ni otra sección global. Nuevos pagos requieren participación activa; el historial permanece consultable sin ella.

Cada período tiene importe entero ARS positivo propio, inicialmente propuesto con el precio actual del Plan de la participación. Si difiere de ese precio, requiere motivo de ajuste libre y no vacío. Se conserva la selección de múltiples Mes/Año y el total suma importes reales. Fecha de cobro editable: hoy operativo o anterior, nunca futura. La reversión requiere motivo escrito y conserva el Pago original y su trazabilidad. Los Pagos revertidos no cuentan para estado mensual, Portal ni ingresos/totales de Finanzas.

Finanzas completa queda pendiente para otro bloque. PROF-01, INI-06, INI-07 y CAT-04 conservan sus estados; los SAL-PAG continúan resueltos.

## Profesor — Reutilización de Rutinas y catálogo de ejercicios — 2026-10-13

**Estado: CONFIRMADO / RESUELTO.**

En la ficha del Alumno, el catálogo de ejercicios no se muestra como una acción principal de la sección Rutina. **Administrar ejercicios** se ofrece únicamente mientras el Profesor está creando, editando o personalizando una Rutina.

La Rutina activa se modifica mediante **Editar rutina** y no ofrece una acción **Duplicar rutina**. Las Rutinas históricas pueden reutilizarse mediante **Usar nuevamente**. Esta acción crea una nueva versión activa a partir del contenido histórico. Si existe una Rutina activa, la Rutina actual pasa al historial.

Antes de ejecutar **Usar nuevamente** se requiere confirmación explícita.

## Interfaces compartidas por roles — 2026-10-13

Estado: **CONFIRMADO / RESUELTO**.

Una misma funcionalidad de Athleta utiliza una única interfaz compartida entre
los roles que pueden acceder a ella. Profesor, Administrativo, Administrador
general, Kinesiólogo y Osteópata no reciben versiones visuales independientes
de Pagos, Rutinas, Evaluaciones, Turnos, Historia Clínica u otras
funcionalidades comunes. Las diferencias entre perfiles se resuelven
principalmente mediante navegación, permisos, visibilidad de información y
acciones habilitadas. Cuando se modifica el diseño de una funcionalidad
compartida, el cambio debe reflejarse para todos los perfiles que utilizan esa
funcionalidad. Solo se admiten experiencias diferentes cuando el problema
operativo es realmente distinto, como Inicio por perfil o el Portal externo.

El Administrador general utiliza navegación agrupada por áreas. Su Inicio
resume la operación diaria de Sala y Clínica, el seguimiento de Sala y las
Finanzas del mes. Sala se consulta desde `/sala`; la agenda transversal deja de
ser una entrada principal para este perfil.

## Identidad visible de la sesión interna — 2026-10-14

Estado: CONFIRMADO / RESUELTO.

Athleta Manager muestra de forma permanente en la interfaz interna el nombre,
apellido y rol o roles del usuario que tiene la sesión iniciada.

La regla aplica a todos los perfiles internos y permite identificar rápidamente
qué cuenta está siendo utilizada cuando una computadora es compartida por
distintos integrantes de Athleta.

Mi perfil y Cerrar sesión permanecen accesibles junto a la identidad. No se
incorpora cambio rápido de usuario: para utilizar otra cuenta se debe cerrar
sesión e iniciar nuevamente.

## Navegación administrativa y Agenda de Sala compartida — 2026-10-14

Estado: **CONFIRMADO / RESUELTO**, excepto donde se indica pendiente.

Administrativo y Administrador general utilizan navegación agrupada por áreas.
Sala contiene Agenda, Alumnos, Rutinas cuando el permiso efectivo lo permite y
Configuración. Finanzas se presenta como Resumen, Ingresos y Gastos. Los ítems
se muestran según los permisos actuales; esta decisión no cambia permisos.

La navegación administrativa utiliza sectores desplegables para reducir la
extensión vertical del sidebar. Solo un sector permanece abierto a la vez y el
sector correspondiente a la pantalla actual se abre automáticamente. El ítem
activo conserva el resaltado visual y los permisos continúan determinando qué
sectores e ítems se muestran.

En escritorio, la barra lateral completa puede ocultarse y volver a mostrarse
para ampliar el espacio de trabajo. Este comportamiento no cambia permisos,
rutas ni funcionalidades y no se persiste entre sesiones.

En dispositivos móviles se conserva el drawer existente.

La Agenda de Sala es una única interfaz compartida por Profesor,
Administrativo y Administrador general. La operación se consulta desde `/sala`;
la entrada `/reservations` continúa para Profesor y deja de ser la agenda
transversal principal de Administrativo y Administrador general.

Clínica conserva por ahora una única entrada `/clinic`. Su estructura definitiva
de navegación queda **PENDIENTE DE DEFINICIÓN FUNCIONAL**.


## Objetivo de Sala y reingreso — 2026-10-14

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **CONFIRMADO / RESUELTO**.

El Objetivo es una referencia breve y opcional de entrenamiento, de hasta 500
caracteres y sin información clínica. Pertenece a la participación actual de
Sala. Profesor y Administrador general pueden modificarlo; Administrativo lo
consulta. Los roles combinados conservan la capacidad de Profesor.

Al dar de baja, el Objetivo histórico permanece asociado a esa participación.
El reingreso crea una participación nueva con Objetivo vacío, sin copiar el
anterior. No se incorpora historial específico de modificaciones.

Evidencia: `apps/api/prisma/schema.prisma` (`SalaParticipation.objective`),
`apps/api/src/sala/sala.service.ts` (`updateObjective`, `join`, `leave`) y
`apps/web/src/features/sala/participation-management.tsx`. La autorización por
roles se valida en backend; el Portal no expone el Objetivo.

### Seguimiento y acciones de Alumnos — Bloque 1A + 1B

`/students` es la única interfaz principal de seguimiento para todos los perfiles
habilitados. Los enlaces antiguos `/sala?view=students` redirigen allí. Conserva
búsqueda por Nombre/DNI, Sin rutina y Pago pendiente. Mis alumnos aparece para
cuentas con rol Profesor y filtra por Profesor principal actual, sin restringir
el acceso a otros Alumnos. Los filtros se combinan.

Meses consecutivos sin pago ofrece 1+, 2+, 3+ y 6+. La racha comienza en el mes
operativo actual de Argentina, se detiene en el primer mes con `SalaPayment`
válido sin reversión y nunca cuenta meses anteriores al mes de incorporación de
la participación actual. El mes de incorporación cuenta si no tiene Pago válido;
un Pago válido del mismo Mes/Año sigue siendo válido al reingresar. Se calcula
sin consultas por Alumno. Es seguimiento manual, sin deuda derivada ni bloqueos
ni consecuencias automáticas.

La selección utiliza IDs de participación activa y sólo incluye Alumnos
visibles por búsqueda y filtros. Las únicas acciones masivas son Cambiar profesor
principal y Dar de baja de Sala; ambas son transaccionales y fallan completas si
una participación no es válida. El cambio de Profesor sólo modifica la referencia
actual, sin alterar Plan, Rutinas, Evaluaciones, Pagos, Turnos ni autorías.

La ficha reutiliza la misma gestión de Objetivo, Profesor, Plan y Baja para los
roles habilitados. La baja individual muestra previamente conteos operativos de
Turnos fijos, Reservas futuras, Rutinas activas e Indicaciones activas; no expone
contenido clínico. La baja individual y masiva reutilizan la misma lógica vigente.
La implementación queda alineada con PER-07: baja de Sala e inactivación global
cancelan sólo actividades cuyo inicio real es posterior a la confirmación y
preservan las ya iniciadas. Cambio de Plan reutiliza su endpoint y reglas actuales e invalida los
Servicios del Alumno para nuevas operaciones.

Evidencia: `apps/api/src/sala/sala.service.ts` (`listStudents`, `leaveImpact`,
`bulkChangeProfessor`, `bulkLeave`, `leaveInTransaction`), `sala.controller.ts`,
`sala.dto.ts`, `apps/web/src/app/students/page.tsx`,
`apps/web/src/features/sala/person-workspace.tsx` y `participation-management.tsx`.
Cobertura en `apps/api/test/sala.integration-spec.ts`,
`apps/web/src/app/students/page.test.tsx` y
`apps/web/src/features/sala/person-workspace.test.tsx`.

**PROF-01 permanece PENDIENTE**. No se agrega alta de Persona/Alumno para Profesor
puro ni se modifica `PEOPLE_CREATE`. No se implementan acciones masivas adicionales.

## Cierre de Evaluaciones físicas de Sala — 2026-10-14

Consolidación de §§6.26–6.29 y §10.9: una Evaluación contiene uno o más Results abiertos, con el mismo Test repetible y Observación general opcional. La corrección es directa, sin versionado ni trazabilidad adicional, y preserva Fecha y Profesor. Profesor y Administrador general gestionan; Administrativo consulta.

El catálogo permite crear, editar y retirar Tests de Fuerza, Movilidad u Otra. Puede crearse un Test inline durante la carga de la Evaluación. El Portal consulta Results agrupados cronológicamente por Test, sin gráficos, cálculos ni Observación interna.

Criterio técnico necesario para preservar historia: al corregir una Evaluación puede conservarse un Test ya usado aunque luego haya sido retirado; un Test retirado no puede agregarse como nuevo Result. CAT-04 continúa pendiente y no cambia la política existente de nombres duplicados.

## Cierre técnico de Sala — Bloque 5 — 2026-10-15

Estado: **CONFIRMADO / RESUELTO**.

En el catálogo de Ejercicios, Nombre es obligatorio; Músculo principal y
Descripción son opcionales. La ausencia de Músculo principal se omite en
selectores y listados, sin separadores vacíos ni texto sustituto. CAT-04
continúa pendiente y no se cambia la política vigente de nombres duplicados.

En el catálogo de Tests físicos, Nombre es obligatorio; Tipo y Descripción
son opcionales. Si se informa Tipo, solo admite Fuerza, Movilidad u Otra.
Sin Tipo se conserva `null`; «Sin tipo» es una opción del editor y no una
categoría histórica. El Test puede utilizarse normalmente en Evaluaciones.

Una Reserva puntual existente del Portal puede cancelarse únicamente antes de
su hora real de inicio (`startsAt > now`). Una Reserva futura del mismo día
sigue siendo cancelable; desde el inicio exacto deja de serlo. Se utiliza su
hora específica y, para registros anteriores sin ella, la del horario asociado.
Esto no modifica POR-SAL-09: crear nuevas Reservas sigue requiriendo al menos
20 minutos restantes de actividad. Ownership se deriva de la sesión Portal.

Evidencia: `SalaService.createExerciseDefinition`, `updateExerciseDefinition`,
`physicalTestData`, `PortalService.cancelReservation`, sus DTOs y los tests de
integración `sala.integration-spec.ts` y `portal-sala.integration-spec.ts`.
CAT-04, INI-06 e INI-07 conservan su estado **PENDIENTE**. PROF-01 se resuelve en la decisión posterior del 2026-10-15. Resta UAT final.

## PROF-01 — Alta de Alumno por Profesor — 2026-10-15

Estado: **CONFIRMADO / RESUELTO**.

Esta decisión sustituye la ocultación provisoria de altas del 2026-10-13 y resuelve PROF-01, que también seguía pendiente al cierre de los bloques anteriores. Se conserva ese historial.

El Profesor puede dar de alta Alumnos de forma autónoma desde `/students` mediante Nuevo alumno, con `PEOPLE_CREATE` y `SALA_PARTICIPATION_MANAGE`. Personas no se habilita visualmente al Profesor puro. Su navegación sigue siendo Inicio → Reservas → Alumnos → Rutinas. No se modifican permisos ni contratos del backend.

El alta comienza por DNI (6–8 dígitos, normalizando puntos, espacios y guiones). La búsqueda parcial existente se verifica por coincidencia exacta de DNI:

- Persona existente con Sala activa: se informa que ya es alumno activo y no se ejecuta ninguna creación/incorporación.
- Persona existente sin Sala activa: se reutiliza su identidad, se solicitan Plan y Profesor principal y se incorpora mediante `joinSala`, con la fecha operacional de Argentina. Conserva su credencial/PIN; no se genera ni resetea.
- DNI inexistente: se solicitan Nombre, Apellido, DNI, Teléfono y Fecha de nacimiento, además de Plan y Profesor principal. Se respetan las validaciones vigentes de Persona. `createSalaStudent` crea la Persona y su participación en una única operación atómica. No se incluyen campos opcionales en este alta simple.

Plan y Profesor principal son obligatorios y se seleccionan de las opciones elegibles devueltas por backend. El listado se refresca al completar cualquiera de las operaciones.

Solo al crear una Persona nueva se presenta el `initialPin` devuelto por backend, indicando que se muestra una sola vez, con Copiar PIN y Entendido. Al cerrar se descarta. Los errores de búsqueda, carga de opciones, alta/incorporación y conflicto de DNI se muestran sin simular éxito.


## Inicio operativo del Administrativo — 2026-10-15

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **CONFIRMADO / RESUELTO**.

El Administrativo posee un Inicio propio orientado a la gestión diaria del centro:

- Operación de hoy de Sala: Alumnos esperados, Asistencias y Cancelados / Ausentes.
- Operación clínica de hoy: Turnos del día, Atendidos y Pendientes.
- Seguimiento: Sin rutina activa y Pago pendiente, con accesos a los filtros de Alumnos.
- Accesos directos: Alumnos, Personas, Ingresos/Pagos y Gastos.

Reutiliza `getSalaDashboard` para Sala y seguimiento, y `getReservationsTimeline`
para Clínica, contando exclusivamente bookings con `source === 'CLINIC'`.
Turnos del día incluye todos esos bookings; Atendidos cuenta `ATTENDED` y
Pendientes cuenta `SCHEDULED`.

Usa exclusivamente la fecha operativa actual de Argentina, sin selector
Hoy/Mañana. No muestra métricas financieras ejecutivas ni consume
`/api/finance/executive-totals`. Tampoco muestra gráficos, tendencias ni
configuración. Los accesos financieros conducen a las pantallas operativas.
No requiere nuevos endpoints, permisos ni cambios de backend o navegación.

`GENERAL_ADMIN` conserva su Inicio global. Profesor puro conserva su Inicio
operativo de Sala. Otros perfiles conservan por ahora el Inicio general.
Los roles combinados con `ADMINISTRATIVE` utilizan el Inicio Administrativo,
salvo que también incluyan `GENERAL_ADMIN`, que tiene precedencia.

INI-06 e INI-07 continúan **PENDIENTES**. Esta decisión no redefine globalmente
esos pendientes clínicos ni resuelve el comportamiento para Mañana.


## Clínica — Bloque 1: Pacientes y ficha inicial — 2026-10-15

Estado: **CONFIRMADO / RESUELTO**.

Deporte (`sport`) y Club (`club`) son textos opcionales e independientes de la
identidad compartida de Persona. Pueden editarse o limpiarse; los valores vacíos
se guardan como `null`. No pertenecen al vínculo clínico ni crean catálogos.

Clínica ofrece Pacientes y Turnos mediante `/clinic` y sus parámetros existentes.
La historia clínica se navega dentro de un Paciente. El alta comienza por DNI,
reutiliza la Persona existente (incluida su participación en Sala) y registra
explícitamente el vínculo clínico, sin crear actividad. Si la Persona es nueva,
el PIN temporal se muestra una sola vez; ante un fallo posterior se reintenta
solo el registro clínico con el mismo identificador.

El listado conserva filtros combinables y paginación, agrega búsqueda por
nombre/apellido/DNI, participación actual en Sala, Deporte, Club y próximo Turno
Agendado futuro, ordenado por inicio. La vuelta desde ficha conserva el contexto
del listado. La ficha usa la lectura individual de Persona y distingue carga,
error, inexistencia y ausencia de vínculo clínico. Incluye datos generales,
cobertura y actividad operativa; la edición exige `PEOPLE_UPDATE_GENERAL` y el
contexto de Tratamientos En curso exige `CLINICAL_HISTORY_READ`.

No se agregan permisos ni estados clínicos. El dashboard general y la ampliación
de los circuitos de Evaluaciones, Tratamientos, Estudios e IA quedan fuera de
este bloque. INI-06 e INI-07 conservan su estado pendiente.

## Finanzas operativas para salida de Sala — 2026-10-15

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **CONFIRMADO / RESUELTO**.

Finanzas conserva las vistas Resumen, Ingresos y Gastos. Ingresos permite iniciar el cobro buscando un Alumno activo de Sala por Nombre, Apellido o DNI; la búsqueda local ignora mayúsculas en nombres y separadores visuales del DNI. Seleccionar un Alumno reutiliza la URL contextual y el mismo flujo centralizado de Pago de Sala, con acceso para cambiar de Alumno y volver a su ficha.

La cuota del mes operativo actual impago se propone automáticamente con el precio actual del Plan. Si ya tiene un Pago válido no revertido, se informa sin proponer un duplicado. Otros Mes/Año y varios períodos siguen disponibles. Cada período mantiene su importe ARS entero positivo; cambiarlo respecto del precio del Plan exige Motivo de ajuste según la regla existente. Se conservan fecha real de cobro, medio de pago obligatorio, reversión con motivo e idempotencia.

Gastos dispone de formulario directo con Importe, Fecha, Categoría, Medio de pago, Área y Descripción opcional. Fecha: hoy operativo o anterior, nunca futura. Importe: entero ARS estrictamente positivo. El formulario comienza con Fecha de hoy y Área Sala. Solo ofrece categorías y medios de pago seleccionables. Si no existen categorías seleccionables, quien posee EXPENSE_CATEGORY_CATALOG_MANAGE puede crear una categoría en ese contexto y continuar la carga. Si no existen medios de pago seleccionables, se orienta a su configuración en Resumen; no se crean automáticamente.

Para esta salida de Sala, el formulario de Gasto expone Sala y General; Clínica permanece implementada pero oculta visualmente en ese selector. El alta de Ingresos clínicos permanece implementada, pero no se expone visualmente desde Finanzas durante esta salida. Los históricos existentes, incluidos los movimientos clínicos, no se eliminan ni se filtran por esta decisión y se muestran con etiquetas legibles.

Medios de pago queda como configuración secundaria dentro de Resumen. No se crean permisos, estados ni lógica financiera paralela; se reutilizan endpoints y reglas vigentes. Esta decisión no modifica FIN-01 a FIN-09, los cálculos de indicadores ni la definición de Neto y no resuelve CAT-04.

## Ajustes de navegación y operación para salida de Sala — 2026-10-15

Estado: **CONFIRMADO / RESUELTO**.

### Clínica

Durante la salida inicial de Sala, Administrativo y Administrador general (también en cuentas con roles combinados) no exponen Clínica en su navegación ni operación Clínica en sus respectivos Inicio. Finanzas no muestra el desglose visual Clínica; los cálculos existentes se conservan.

Clínica continúa implementada. Sus rutas, backend, permisos, datos e históricos no se eliminan, y el acceso directo por URL se conserva según los permisos existentes. Kinesiólogo y Osteópata sin rol Administrativo o Administrador general conservan sus accesos clínicos correspondientes.

Esta decisión reemplaza temporalmente la visibilidad clínica definida anteriormente para `AdministrativeHome` y `GeneralAdminHome`, sin redefinir el dominio clínico.

### Finanzas — cuotas

Ingresos muestra los Alumnos activos de Sala sin requerir búsqueda. La búsqueda sirve como filtro por nombre, apellido o DNI, incluyendo DNI con separadores. Cada Alumno posee una acción `Seleccionar` que abre su contexto financiero existente. Las reglas de Pago de Sala no cambian.

### Gastos

Categoría continúa siendo obligatoria conforme FIN-04. Quien posee `EXPENSE_CATEGORY_CATALOG_MANAGE` puede crear nuevas categorías inline desde Registrar gasto en cualquier momento. La nueva categoría se selecciona automáticamente y se conservan los demás datos del Gasto. No se crea una pantalla independiente de catálogo para esta necesidad. Área mantiene las opciones Sala y General. CAT-04 continúa pendiente.

### Navegación

Los encabezados de las áreas administrativas navegan en un click a la primera opción permitida de cada grupo. El grupo correspondiente queda desplegado al ingresar. No se requiere primero desplegar y luego elegir la primera opción. En móvil también se cierra el drawer al navegar y el grupo activo aparece desplegado al reabrirlo.


## Pulido preproducción de Sala — Bloque 1 — 2026-10-16

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **CONFIRMADO / RESUELTO**.

### Alumnos

- `/students` conserva búsqueda por Nombre/DNI y filtros Todos, Sin rutina y Pago pendiente.
- Profesor conserva Mis alumnos como filtro opcional, sin restringir la consulta al resto de Alumnos.
- Se retiran de la interfaz Meses consecutivos sin pago, selección múltiple y acciones masivas.
- Las capacidades backend existentes no se eliminan por esta decisión.
- Esta decisión reemplaza en UI la definición anterior que exponía selección múltiple y Meses consecutivos sin pago.

### Servicios

- Administrativo puede gestionar Servicios y duraciones de Sala.
- Se incorpora `SALA_SERVICE_DURATION_MANAGE` a `ADMINISTRATIVE`.
- Profesor continúa sin este permiso. No se amplían permisos de Rutinas ni Evaluaciones físicas.

### Personas

- Nueva Persona puede crearse como identidad general solamente.
- Administrativo/General Admin con `PEOPLE_CREATE` y `SALA_PARTICIPATION_MANAGE` pueden marcar Incorporar también a Sala, desmarcado por defecto.
- En ese caso Plan y Profesor principal son obligatorios.
- Persona + Sala utiliza la operación atómica existente `createSalaStudent`, sin crear primero la Persona y editarla después.
- Se conserva el aviso de creación y el único PIN inicial devuelto por la operación.

### Profesor

- El alta operativa continúa en `/students → Nuevo alumno`, reutilizando Persona existente por DNI o creando Persona + Sala cuando corresponde.
- No se agrega Personas a su navegación.

### Incorporación espontánea

- Profesor puede crear una nueva Persona/Alumno desde Incorporación espontánea para el día actual, con sus permisos existentes.
- Se reutiliza el flujo atómico ya implementado de Persona + Sala + presencia.
- Las reglas para fechas pasadas/futuras no cambian.


## Pulido preproducción de Sala — Bloque 2 — Finanzas — 2026-10-16

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **CONFIRMADO / RESUELTO**.

### Ingresos

- Finanzas separa los Alumnos del período operativo actual entre Pendientes y Pagados.
- Pagados muestra la Fecha real de cobro (`SalaPayment.paidAt`) del Pago válido, no revertido, correspondiente al Mes/Año actual mediante `currentPaymentPaidAt`; para Pendientes el campo es `null`.
- La búsqueda por Nombre/DNI filtra la pestaña activa; los contadores representan el total de cada estado antes de buscar.
- Pendiente ofrece Cobrar y Pagado ofrece Ver pagos, con acceso al contexto individual de Finanzas.
- No se crea un nuevo estado de deuda: se reutiliza `PENDING / PAID`. Se conserva el historial general de ingresos de otros períodos.

### Resumen

- Finanzas Resumen incluye una lista de Cuotas pendientes del período operativo actual, según America/Argentina/Buenos_Aires.
- Seleccionar un Alumno lleva directamente a su contexto de cobro en un solo click.
- No se crea deuda contable nueva.

### Cobro individual

- El contexto del Alumno concentra identificación, Plan, alta de Pago e historial, sin duplicar el listado genérico de Ingresos.
- Se propone automáticamente el primer período desde el mes operativo actual que no posea Pago válido, ignorando revertidos y permitiendo períodos futuros.
- Un refetch ordinario respeta la selección manual; tras un registro exitoso se propone nuevamente el primer período libre desde el actual.
- Se conserva selección de varios períodos con importes individuales en un solo envío, ajustes con motivo obligatorio, fecha real de cobro, medios de pago y reversión con motivo.
- El historial muestra Mes/Año, Fecha de cobro, Medio, Importe, Estado y Reversión, incluyendo pagos revertidos y motivos de ajuste/reversión.

### Gastos

- Gastos se divide visualmente en Registrar gasto y Registros. Quien solo puede leer accede directamente a Registros.
- Categoría continúa obligatoria, al igual que Medio y Área; se conservan importes enteros ARS mayores a cero, fecha hoy o anterior y áreas Sala / General.
- El alta de categoría queda como acción secundaria al final del formulario; crearla la selecciona sin perder los otros datos del Gasto.
- No se crea una pantalla adicional de catálogo. Registros conserva el histórico.
- Se mantiene la idempotencia de Gastos. No se agregan migraciones ni nuevas reglas financieras; FIN-01 a FIN-09 continúan vigentes.

## Pulido preproducción de Sala — Bloque 3 — Editor de Rutinas — 2026-10-16

Estado: **CONFIRMADO / RESUELTO**.

- El editor muestra un único Día activo a la vez mediante pestañas con Nombre y cantidad de ejercicios. Agregar Día crea y selecciona inmediatamente la nueva pestaña. Eliminar el Día activo selecciona el anterior cuando existe, o el primero restante; siempre se conserva al menos un Día.
- Los ejercicios ya agregados se editan inline, con campos apilados en mobile. Solo Ejercicio es obligatorio; Series, Tiempo, Carga y Descanso conservan su representación de texto opcional.
- Repeticiones/Tiempo se representa mediante un selector visual y continúa persistiendo en los campos existentes `repetitions` y `duration`, excluyentes entre sí. El cambio explícito de alternativa limpia el campo contrario. Los datos antiguos con ambos valores requieren resolución explícita antes de guardar.
- Observación continúa opcional y secundaria, desplegable debajo de cada ejercicio; las observaciones existentes permanecen accesibles y expandidas.
- Agregar ejercicio se realiza desde una sección separada debajo del Día activo. El catálogo puede buscarse por Nombre/Músculo, sin distinguir mayúsculas, y cada resultado activo se agrega directamente. Los ejercicios retirados ya seleccionados siguen siendo visibles como no disponibles.
- Crear nuevo ejercicio se realiza sin salir de la Rutina, permite Nombre, Músculo principal opcional y Descripción opcional, y lo incorpora inmediatamente al Día desde el cual se inició el alta. Conserva los cambios locales; ante error mantiene los campos y no incorpora una fila falsa.
- Guardar/Cancelar se ubican al final del editor, con la indicación «Los cambios se aplican al guardar». Cancelar descarta la edición local sin persistir la Rutina. Administrar ejercicios conserva la gestión completa del catálogo como configuración secundaria posterior al editor.
- El mismo editor se reutiliza para Rutinas de Alumnos, personalización de copias y Rutinas preestablecidas.
- Profesor y Administrador general gestionan Rutinas según los permisos actuales. Administrativo mantiene lectura solamente.
- No cambian versionado, historial, independencia de copias, semántica de preestablecidas ni reglas SAL-RUT. No cambian backend, permisos, contratos HTTP ni esquema de datos.


## Pulido preproducción de Sala — Bloque 4 — Operación diaria del Profesor — 2026-10-16

Estado: **CONFIRMADO / RESUELTO**.

### Inicio Profesor

- Los Alumnos visibles en Próximos horarios son accionables. Seleccionar uno abre directamente el detalle de su Turno en Reservas.
- La actualización del estado reutiliza la misma lógica y reglas de Agenda mediante `BookingDialog`. Inicio no posee una segunda implementación de asistencia.
- Ver Reservas conserva el Día seleccionado en Inicio.

### Reservas

- Agenda de Sala utiliza una tira de cinco fechas como navegación principal, centrada en el Día seleccionado.
- Al cambiar fecha se mantiene visible la estructura de la pantalla y se actualiza únicamente el contenido de Agenda, con carga localizada y sin mantener interactivos Turnos de otra fecha.
- Se conservan Fecha manual, acceso rápido a Hoy y flechas de Día anterior/siguiente. Cambiar fecha cierra el detalle abierto.
- La experiencia es compartida por Profesor, Administrativo y Administrador general porque utilizan la misma Agenda de Sala.

### Deep-link

- Reservas acepta `date` + `personId` + `startTime` + `origin` (`FIXED` / `ONE_OFF`) para abrir directamente un Turno de Sala. No requiere `sourceId` del Dashboard: las referencias de la operación se obtienen del Turno real de Agenda.
- La selección inicial se consume una sola vez y no reabre el diálogo después de cerrarlo, modificar el estado o refrescar.
- Parámetros incompletos, inválidos o sin coincidencia única permiten abrir Reservas normalmente, sin errores técnicos.
- Se conservan Asistió/Ausente/Cancelar, Corregir estado para estados cerrados y la explicación existente de Pendiente de pago, sin nuevas reglas ni acciones.

### Incorporación espontánea

- Profesor conserva alta de Nueva Persona/Alumno desde Incorporación espontánea para el día actual, con sus permisos existentes.
- No cambian reglas de pasado/futuro ni capacidad. No se modifican SAL-TUR-08, SAL-TUR-14 ni SAL-TUR-16.
- No cambian backend, permisos, contratos HTTP ni esquema de datos.


## Ajustes finales de preproducción de Sala — 2026-10-16

> Las reglas de acceso, cuotas y seguimiento mensual de Sala de esta sección fueron sustituidas por **Sala — Vigencia móvil por Pago — 2026-10-19**. El resto conserva su alcance.

Estado: **CONFIRMADO / RESUELTO**.

### Alta de Alumno

- Administrativo y Administrador general utilizan la ficha completa de datos de Persona cuando el DNI es nuevo, conservando la búsqueda inicial por DNI.
- Plan y Profesor principal son obligatorios y completan la incorporación a Sala, sin checkbox opcional de incorporación.
- Profesor mantiene el alta simplificada. Una Persona existente conserva su identidad y se incorpora con `joinSala` si no tiene Sala activa.
- Persona + Sala continúa siendo atómico mediante `createSalaStudent`, con PIN inicial mostrado una sola vez.

### Cobros

- Registrar una cuota es un bloque desplegable. Historial de pagos permanece visible, con ajustes y reversiones.
- Cobrar abre automáticamente el desplegable; Ver pagos lo deja cerrado.
- Cada período permite elegir Mes, Plan de referencia y Precio, incluidos varios períodos independientes.
- Elegir Plan precarga su precio. Un precio diferente exige Motivo de ajuste.
- El Plan seleccionado para el cobro no modifica el Plan vigente ni el historial de asignaciones del Alumno, ni crea cargos por esa selección.
- Requests sin Plan de referencia conservan el Plan activo como referencia de precio.

### Resumen financiero

- El Resumen de Sala se consulta por Mes/Año, con navegación mensual y selección directa.
- Ingresos usan fecha real de cobro (`paidAt`), con filtro `area=SALA`; Gastos usan fecha real del Gasto (`cashDate`).
- Se muestra detalle de Ingresos y Gastos por Medio de pago, incluyendo medios configurados sin movimientos.
- Resultado y columna Neto continúan sujetos a `FINANCE_EXECUTIVE_READ`.
- Cuotas pendientes corresponde al Mes/Año seleccionado y se basa en el período de la cuota (`year`/`month`), no en la fecha de cobro. Por ejemplo, una cuota de septiembre cobrada en octubre figura como pagada en septiembre y como ingreso financiero en octubre.

### Agenda

- La tira de días muestra Mes/Año de la fecha activa, aun cuando las pestañas crucen de mes.
- Hoy se separan visualmente Ahora y próximos / Horarios anteriores, con cantidad de turnos por bloque.
- Horarios anteriores permanecen accesibles para correcciones, sin colapsar ni ocultar acciones. Otras fechas mantienen Horarios del día.

### Incorporación espontánea

- Hoy solo ofrece inicios iguales o posteriores al minuto operativo actual en `America/Argentina/Buenos_Aires`, ignorando segundos.
- El backend protege la misma regla para todos los caminos de incorporación espontánea y devuelve `SALA_SPONTANEOUS_TIME_PASSED` si el horario pasó.
- Horarios sin lugar continúan visibles para permitir confirmación de sobrecupo; los cerrados no se ofrecen.
- Sin opciones restantes se informa que no quedan horarios disponibles para hoy y se deshabilita Incorporar.
- Fechas pasadas conservan incorporación espontánea retrospectiva. Fechas futuras continúan no permitidas.


## Portal — Presentación de Rutina — 2026-10-16

Estado: CONFIRMADO / RESUELTO.

La Rutina activa del Portal utiliza el mismo lenguaje visual de lectura que las
Rutinas del sistema interno: separación por días, cantidad de ejercicios y
parámetros presentados de forma estructurada.

Portal conserva una experiencia exclusivamente de consulta. No ofrece edición,
asignación, duplicación ni gestión del catálogo.

Los campos opcionales de un Ejercicio se muestran únicamente cuando tienen
valor. Descripción y Observación permanecen visibles como información
secundaria cuando existen.

## Ajuste final — Alta administrativa de Alumno — 2026-10-16

Estado: **CONFIRMADO / RESUELTO**.

- En `/students`, Administrativo y Administrador general ya no comienzan obligatoriamente el alta por DNI. `Nuevo alumno` presenta inicialmente Persona existente y una acción `Nueva Persona`, dentro del mismo modal.
- La Persona existente se busca por Nombre, Apellido o DNI y se incorpora con Plan y Profesor principal mediante `joinSala`, conservando su identidad y credencial, sin generar otro PIN.
- Si la Persona ya es alumno activo de Sala, se informa sin duplicar participación; se puede seleccionar otra Persona o cancelar.
- Nueva Persona utiliza la ficha general completa, con Plan y Profesor principal obligatorios en el mismo modal, sin incorporación opcional.
- Nueva Persona + Sala continúa siendo atómico mediante `createSalaStudent`. El PIN inicial se muestra una sola vez solamente para Persona nueva.
- Profesor conserva el flujo simplificado DNI-first definido en PROF-01.
- Esta decisión sustituye, para Administrativo y Administrador general, la definición anterior que conservaba la búsqueda inicial obligatoria por DNI.


## Sala — Vigencia móvil por Pago — 2026-10-19

Estado: **CONFIRMADO / RESUELTO**.

Sustituye todas las decisiones anteriores que habilitaban acceso por Mes/Año o por
el día del mes. La regla del día 15 queda completamente derogada, sin período de gracia.

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

- Ejemplo inicial: Pago 20/10 → cobertura 20/10–20/11 inclusive.
- Renovación 10/11 → siguiente tramo 21/11–20/12; otra renovación 15/11 → 21/12–20/01.
- Vencida 20/11 y cobro 25/11 → 25/11–25/12, sin rellenar el intervalo.
- El Portal reserva únicamente fechas cubiertas por Pagos no revertidos. La UI muestra
  vigencia actual y limita fechas a min(hoy+30, validUntil); backend verifica la fecha.
- Turno fijo puede crearse/modificarse sin vigencia. Cada ocurrencia sin cobertura
  es Pendiente de renovación (`PENDING_PAYMENT`), ocupa capacidad y al inicio se
  cancela por falta de vigencia. Un Pago posterior no reactiva esa fecha.
- Cronología pasada: Pago creado antes o al inicio y reversión inexistente o posterior
  a ese inicio. Un Pago registrado tarde no cubre retroactivamente la actividad.
- Reservas internas e incorporaciones espontáneas no se bloquean por vigencia.
- Alumnos, Dashboard e Inicio muestran vigencia actual, sin selector de Mes/Año.
- Finanzas conserva su Resumen mensual por Fecha de cobro (`paidAt`) y Gastos por
  `cashDate`. Estado actual de Sala es independiente del mes financiero consultado.
- Registrar renovación es singular, con Plan, Precio, Fecha de cobro, Medio y motivo
  cuando el precio difiere del Plan. Historial muestra Plan y cobertura, incluso revertida.
- No cambian permisos, Clínica, Rutinas, capacidad, servicios, ventana de 30 días,
  umbral de 20 minutos del Portal ni el flujo de Nuevo alumno / Nueva Persona.


## Simplificación de Personas en primera salida de Sala — 2026-10-19

Estado: **CONFIRMADO / RESUELTO**.

- Personas continúa siendo la identidad transversal del sistema. El módulo `/people`,
  sus permisos y el modelo de dominio no se eliminan.
- Durante la primera salida enfocada en Sala, `ADMINISTRATIVE` y `GENERAL_ADMIN`
  no ven un acceso general a Personas en sidebar, Home ni header de Sala.
- Las operaciones necesarias sobre Personas se realizan contextualmente desde
  Alumnos e Incorporación espontánea.
- Nuevo alumno administrativo permite buscar una Persona existente por Nombre,
  Apellido o DNI, o crear una Nueva Persona. Incorporación espontánea utiliza
  el mismo patrón.
- Los resultados aparecen directamente bajo el buscador y se seleccionan con un
  click. No existe selector global `Seleccionar Persona`.
- No se precarga un padrón completo de Personas ni se consulta con búsqueda vacía.
  Cada búsqueda solicita la primera página con un máximo de 10 resultados.
- El backend existente de búsqueda de People continúa siendo la fuente de resultados.
- Profesor mantiene su flujo de Nuevo alumno DNI-first.
- Esta decisión simplifica la experiencia visual y operativa; no elimina People
  del modelo de dominio ni cambia las reglas de alta, incorporación o vigencia.


## Profesor — Cobro contextual de renovaciones de Sala — 2026-10-19

Estado: **CONFIRMADO / RESUELTO**.

- Profesor puede cobrar renovaciones desde Alumnos → Alumno → Pagos, consultar
  vigencia e historial de ese Alumno, incluidos estados y motivos históricos.
- Utiliza exclusivamente el Plan activo y su precio actual configurado.
- Puede elegir un Medio de pago seleccionable y Fecha de cobro según las reglas
  generales vigentes: hoy operativo o anterior, nunca futura.
- No puede modificar importe, seleccionar otro Plan para el Pago, ingresar ajustes
  ni revertir Pagos.
- No posee acceso a Finanzas generales: ingresos generales, gastos, resultados,
  Neto, totales ni administración del catálogo de Medios de pago.
- Profesor recibe `SALA_PAYMENT_REGISTER` y pierde `EXPENSE_CREATE`; conserva
  `SALA_PAYMENT_READ`, sin `SALA_PAYMENT_MANAGE` ni permisos financieros generales.
- Administrativo y General Admin conservan la gestión completa desde Finanzas.
- Roles combinados acumulan capacidades normalmente mediante unión de permisos.
- Esta decisión sustituye la parte de **Pagos de Sala centralizados en Finanzas —
  2026-10-14** que impedía al Profesor registrar Pagos. El historial anterior se conserva.
- La regla **Sala — Vigencia móvil por Pago — 2026-10-19** permanece sin cambios:
  misma operación, idempotencia y cálculo de renovación anticipada.

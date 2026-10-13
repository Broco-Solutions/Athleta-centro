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
| SAL-PAG-06 — Reversión de Pagos de Sala | La documentación descartaba devolución/reversión; debía distinguirse esa afirmación de la corrección administrativa de un Pago. | Reversión administrativa separada, conservando el Pago original. | No se admiten Pagos de Sala con importe negativo. Un Pago registrado incorrectamente puede revertirse. La reversión no elimina el Pago original: se registra de forma separada, con motivo y trazabilidad. Corresponde a una corrección administrativa del registro, no a una devolución de dinero al alumno. | `apps/api/src/sala/sala.service.ts` — `SalaService.createPayment(...)`, `positiveMoney(...)` y `reversePayment(...)`; `apps/api/src/sala/sala.controller.ts` — `SalaController.reversePayment(...)`, POST /api/sala/payments/:id/reverse; `apps/web/src/features/sala/payment-panel.tsx` — `PaymentPanel`, acción Revertir y confirmación Revertir pago; `apps/api/prisma/schema.prisma` — `SalaPayment` y `SalaPaymentReversal`, motivo, usuario y fecha de registro separados del importe original. |
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

### SAL-RUT-10 — Rutinas preestablecidas

Fecha: **2026-10-09**. Estado: **RESUELTO**. Fuente: **Definición aprobada 2026-10-09**.

Profesor y Administrador general pueden crear, editar y eliminar Rutinas preestablecidas compartidas por Athleta. Al definir la Rutina de un Alumno pueden crearla desde cero o utilizar una preestablecida. Al seleccionar una preestablecida se muestra primero una vista detallada en modo lectura. Desde allí pueden asignarla tal como está o elegir Editar para personalizar una copia antes de guardarla. En ambos casos, la Rutina resultante del Alumno es independiente: modificarla no altera la preestablecida y modificar o eliminar posteriormente la preestablecida no altera Rutinas ya asignadas. Las preestablecidas no pertenecen a un Profesor específico y no utilizan estados Activo/Inactivo.

Definiciones aprobadas el **2026-10-07** para los Bloques 1 y 2 de Planes y Servicios de Sala y las reservas puntuales del Portal.

| ID / Tema | Decisión que estaba en disputa | Decisión finalmente adoptada | Regla funcional vigente | Evidencia en la implementación |
|---|---|---|---|---|
| SAL-PLA-01 — Servicios incluidos en Planes | Definir la relación entre Planes y Servicios de Sala. | Relación muchos-a-muchos explícita; precio mensual en el Plan. | Un Servicio de Sala representa una actividad y su duración. Un Plan define precio mensual y uno o más Servicios incluidos. El Servicio no tiene precio propio. Un Servicio puede estar incluido en varios Planes. Un Plan nuevo requiere al menos un Servicio. Por ahora los Servicios no poseen disponibilidad horaria ni capacidad propia: utilizan la grilla y capacidad generales de Sala. Los Planes anteriores pueden quedar sin Servicios hasta que un usuario los edite; no se asignan asociaciones automáticamente. | `apps/api/prisma/schema.prisma` — SalaPlanService; `apps/api/src/sala/sala.service.ts` — validación y actualización atómica; `apps/web/src/app/sala/configuration/page.tsx` — selección de Servicios en el editor de Plan. |
| SAL-PLA-02 — Servicios habilitados según Plan actual | Definir los Servicios disponibles para la operación interna y Portal. | Derivarlos exclusivamente del Plan de la participación activa; validación compartida en backend. | Una Persona que participa de Sala sólo puede crear nuevas Reservas y Turnos fijos para Servicios incluidos en su Plan actual. Los Servicios que se muestran en Portal y en la operación interna del Alumno se derivan de ese Plan. Un Servicio retirado no puede utilizarse para nuevas operaciones. Los registros ya existentes no se cancelan ni reescriben automáticamente cuando cambia el Plan o su composición de Servicios. La modificación de un Turno fijo exige también un Servicio permitido; las nuevas operaciones requieren Servicio explícito. | `apps/api/src/sala/sala.service.ts` — listPersonServiceTypes y validateBooking; `apps/api/src/portal/portal.service.ts` — delegación a Sala; `apps/web/src/features/sala/person-workspace.tsx` y `apps/web/src/app/portal/sala/page.tsx` — Servicios del Plan y selección válida al editar. |
| POR-SAL-08 — Pago mensual para nuevas Reservas puntuales del Portal | Definir la habilitación por Pago sin extenderla a operaciones internas o Turnos fijos. | Pago válido del Mes/Año reservado o fecha reservada entre los días 1 y 15 inclusive. | Las nuevas Reservas puntuales creadas por el Alumno desde Portal se habilitan según el Mes/Año y el día de la fecha que se desea reservar, no según el día actual. Si existe un Pago de Sala válido y no revertido para ese Mes/Año, el Alumno puede reservar cualquier fecha permitida de ese mes. Si el Pago de ese Mes/Año está pendiente, el Alumno puede reservar únicamente fechas comprendidas entre el día 1 y el día 15 inclusive. Las fechas desde el día 16 hasta fin de mes requieren que ese Mes/Año tenga un Pago válido registrado. La regla se aplica de igual manera a meses actuales y futuros: un mes futuro pendiente no habilita automáticamente fechas posteriores al día 15. El Pago continúa identificado como PENDING hasta que se registre un Pago válido. La posibilidad de reservar los días 1 al 15 no equivale a un Pago registrado. Con un Pago válido el estado es PAID. Un Pago revertido vuelve a considerarse no válido para esta regla. La reversión conserva el Pago original. La fecha real de cobro no define la vigencia. La restricción aplica únicamente a nuevas Reservas puntuales creadas por el Alumno desde Portal. No aplica a operaciones internas ni a Turnos fijos del Portal. La falta de Pago o la reversión posterior de un Pago no cancela ni modifica Reservas ya existentes. El Pago continúa siendo registrado manualmente en Athleta Manager; no existe procesamiento automático de cobros en el alcance actual. | `apps/api/src/portal/portal.service.ts` — assertSalaReservationPaymentEligibility y paymentState; `apps/web/src/app/portal/sala/page.tsx` — mensaje de bloqueo e información del formulario. |

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
| SAL-TUR-09 / SAL-TUR-10 / SAL-TUR-11 — Corrección de estados desde la agenda | Reservado, Asistió, Cancelado y Ausente pueden corregirse posteriormente sin límite de tiempo ni una matriz rígida por usuarios internos habilitados. | Agenda permite corregir estados ya registrados mediante `correctSalaOccurrence(...)`; el backend conserva la ocurrencia y sus referencias y actualiza `status`, `lastModifiedBy` y `lastModifiedAt`. Las acciones requieren `SALA_AGENDA_MANAGE`. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — SAL-TUR-09, SAL-TUR-10 y SAL-TUR-11; `apps/web/src/features/sala/agenda-panel.tsx` — `BookingModal`; `apps/api/src/sala/sala.service.ts` — `commandOccurrence(...)`. | **ALINEADO / RESUELTO**. |
| POR-SAL-07 — Reservas canceladas visibles | Los compromisos futuros Cancelados permanecen visibles hasta que pasa su fecha/hora. | `PortalService.sala(...)` devuelve activas y canceladas futuras con `cancelledAt`; las filtra por el inicio real en timezone operativo, con fallback al inicio de la ventana para registros históricos. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — POR-SAL-07; `apps/api/src/portal/portal.service.ts` — `sala(...)`. | ALINEADO / RESUELTO. |
| Pagos revertidos en consultas financieras y Portal | SAL-PAG-06 consolida una reversión administrativa separada; SAL-PAG-01 se refiere a un Pago válido para determinar el estado de pago. | `SalaService.paymentSummary(...)` excluye asignaciones de Pagos revertidos. `FinanceCatalogService.unifiedIncome(...)` suma Pagos de Sala sin filtrar reversión y `totals(...)` usa esa consulta. `PortalService.sala(...)` determina PAID por existencia de Pago mensual sin consultar reversión. El efecto consistente de la reversión en estas vistas requiere revisión. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — SAL-PAG-01 y SAL-PAG-06; `apps/api/src/sala/sala.service.ts` — `paymentSummary(...)`; `apps/api/src/finance/finance.service.ts` — `unifiedIncome(...)`, `totals(...)`; `apps/api/src/portal/portal.service.ts` — `sala(...)`. | Requiere análisis funcional. |
| PER-07 — Inactivación y actividades ya iniciadas de Sala | La inactivación global afecta desde la confirmación hacia adelante y preserva actividades cuya hora de inicio ya ocurrió. | `PeopleService.inactivate(...)` cancela ocurrencias de Sala desde la fecha actual, sin distinguir la hora de inicio de las ocurrencias de ese día. | `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — PER-07; `apps/api/src/people/people.service.ts` — `inactivate(...)`. | Requiere análisis funcional. |
| Precisión monetaria en documentación técnica | `ARCHITECTURE.md`, sección Dinero, indica normalmente dos decimales en ARS y posible mayor precisión de cotizaciones; `DATABASE.md` establece ARS sin decimales y cotización con dos. | `money(...)` exige ARS entero y `exchange(...)` admite hasta dos decimales. Los campos de importes y `ExchangeRate.rate` reflejan esas precisiones. La contradicción técnica se registra sin modificar documentos fuera del alcance. | `docs/architecture/ARCHITECTURE.md` — Dinero; `docs/architecture/DATABASE.md` — Importes monetarios y Dólar; `apps/api/src/finance/finance.service.ts` — `money(...)`, `exchange(...)`; `apps/api/prisma/schema.prisma` — `Expense.amount`, `ExchangeRate.rate`. | Requiere análisis funcional. |
| Bloqueos y modelo preliminar de DATABASE.md | `DATABASE.md` todavía marca pendientes el vínculo clínico y varias cardinalidades, propone puentes para Atención–Tratamiento y Estudio–Archivo, y declara unicidad Persona/Mes/Año para Pago de Sala. El documento de dudas ya confirma varias de esas cardinalidades. | El schema contiene `ClinicalPatient` explícito, Atención opcional a un Tratamiento, Atención única por Turno, Evolución única por Atención y archivo opcional único por Estudio. `SalaPayment` tiene unicidad por operación e índice Persona/Mes/Año, sin unicidad declarada sobre ese período; `createPayment(...)` no rechaza por período duplicado. Estas diferencias no autorizan nuevas decisiones ni cambios de arquitectura en esta tarea. | `docs/architecture/DATABASE.md` — isPatient, relaciones clínicas, SalaPayment y BLOCKED_BY_FUNCTIONAL_DEFINITION; `docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md` — PER-01, CLI-ATE-01, CLI-ATE-08, CLI-EVO-01 y CLI-EST-03; `apps/api/prisma/schema.prisma` — modelos citados; `apps/api/src/sala/sala.service.ts` — `createPayment(...)`. | Requiere análisis funcional. |

## SAL-TUR-08 — Espontáneo retrospectivo

Estado: **RESUELTO**. Definición aprobada 2026-10-07.

Profesor, Administrativo y Administrador general pueden registrar una incorporación espontánea en el día actual y también retrospectivamente en una fecha pasada cuando la asistencia efectivamente ocurrió. Una fecha futura no admite incorporación espontánea; corresponde Reserva puntual o Turno fijo.

## SAL-TUR-14 — Alta desde incorporación espontánea

Estado: **RESUELTO**. Definición aprobada 2026-10-07.

La incorporación espontánea puede iniciar desde un Alumno de Sala, una Persona existente todavía no incorporada a Sala o una Persona nueva. Cuando la Persona todavía no pertenece a Sala y la operación corresponde al día actual, el mismo flujo permite asignar Plan y Profesor principal, elegir un Servicio incluido en el Plan y registrar la asistencia espontánea sin abandonar Agenda. La incorporación a Sala y la asistencia se confirman como una única operación. La falta de Pago no bloquea esta operación. Para una fecha pasada no se crea ni backdatea una nueva participación: la Persona debe haber tenido participación válida en esa fecha. El Servicio es obligatorio para nuevas incorporaciones espontáneas y su duración determina los bloques de capacidad ocupados.

## POR-SAL-08 — Pago mensual para nuevas Reservas puntuales del Portal

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

Estado: **RESUELTO**. Definición aprobada 2026-10-08.

Una Persona puede reservar varias actividades en una misma fecha, incluidas varias Reservas puntuales o un Turno fijo con una Reserva puntual, siempre que sus intervalos completos no se superpongan y exista capacidad. Las actividades consecutivas son válidas. La identidad de cada Reserva puntual considera su hora de inicio dentro de la ventana semanal. Cada ocurrencia conserva su origen para corregir el estado de la actividad exacta.

El Turno fijo semanal puede crearse sin Pago. Del día 1 al 15, su ocurrencia está Reservada. Después del día 15, si falta un Pago válido y no revertido del Mes/Año correspondiente, el estado funcional derivado es **Pendiente de pago**; ocupa capacidad en todos sus bloques de 15 minutos. Un Pago válido registrado antes del inicio la habilita como Reservada. Si llega el instante de inicio sin Pago válido, se cancela y persiste sólo esa ocurrencia. Un Pago posterior no la reactiva; las siguientes ocurrencias y el Turno fijo semanal continúan. La cancelación automática se distingue de las correcciones manuales por su marca de fecha y hora. La regla de Pago de las Reservas puntuales del Portal definida en POR-SAL-08 permanece vigente.

La capacidad general inicial es **10 personas**. Puede modificarse desde Configuración de Sala, con mínimo 1. Para cada bloque prevalece la excepción de capacidad, luego la capacidad específica de la ventana, luego la capacidad general configurada y finalmente el valor inicial 10. La instalación inicial crea esa configuración sin reemplazar valores existentes.

## POR-SAL-09 — Fechas y horarios de Reservas puntuales del Portal

Estado: **RESUELTO / ALINEADO**. Definición aprobada 2026-10-09.

El Portal no permite crear Reservas puntuales para fechas pasadas. En el día actual una actividad puede reservarse únicamente si, en el instante de la reserva, quedan **al menos 20 minutos de actividad**. **20 minutos exactos son válidos**; con menos de 20 minutos el horario deja de ofrecerse y el backend rechaza la creación. Las fechas futuras mantienen la ventana POR-SAL-05 de hoy a hoy+30 inclusive.

La validación compara el fin real de la actividad con el instante actual en `America/Argentina/Buenos_Aires`, usando el inicio elegido y la duración real del Servicio resueltos por Sala dentro de la transacción de creación. Un inicio que ya ocurrió sigue siendo válido si quedan 20 minutos o más hasta ese fin. El error `PORTAL_SALA_TIME_PASSED` rechaza horarios con menos de 20 minutos restantes. El Portal actualiza las opciones con un reloj local cada minuto mientras la pantalla o el flujo de Reserva permanece abierto y toma el instante actual al abrirlo, sin polling al backend. Availability del Portal rechaza fechas anteriores a hoy. La restricción aplica únicamente a Reservas puntuales creadas por el Alumno desde Portal; no afecta la operación interna retrospectiva ni Turnos fijos. POR-SAL-08 continúa vigente.

## Inicio operativo del Profesor — decisiones aprobadas 2026-10-13

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

**Estado: CONFIRMADO.**

Se ratifica la definición funcional vigente: el Profesor puede consultar y administrar Pagos de Sala.

La simplificación de su panel no elimina esta capacidad.

En la ficha del Alumno:

- el Resumen muestra solamente el estado actual del Pago;
- la gestión completa se realiza desde una sección Pagos claramente accesible.

Esto permite mantener el dashboard enfocado sin esconder la operación económica que el Profesor debe poder resolver.

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

El Administrador general utiliza la navegación **Inicio → Personas → Agenda →
Sala → Clínica → Finanzas → Equipo**, con rutas `/`, `/people`, `/reservations`,
`/sala`, `/clinic`, `/finance` y `/team`. Su Inicio resume la operación diaria
de Sala y Clínica, el seguimiento de Sala y las Finanzas del mes. Agenda reúne
los turnos de Sala y Clínica bajo una interfaz transversal compartida.

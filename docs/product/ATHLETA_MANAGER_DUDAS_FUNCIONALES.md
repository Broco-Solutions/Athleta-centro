# ATHLETA_MANAGER_DUDAS_FUNCIONALES.md

## 1. Objetivo y criterio de actualización

Este documento actualiza las dudas funcionales originalmente relevadas para Athleta Manager tomando como fuente de verdad la versión actual de **“Athleta Manager — Descripción Integral del Sistema”**.

Cada duda original queda clasificada como:

- **RESUELTO**: la Descripción Integral define una regla suficientemente concreta.
- **NO APLICA**: la nueva definición funcional elimina la premisa de la pregunta.
- **A CRITERIO TÉCNICO**: el comportamiento funcional necesario ya está definido y la diferencia restante es de modelado/implementación.
- **PENDIENTE**: la Descripción Integral no define la respuesta con precisión suficiente y no debe inferirse.

Los ítems marcados **PENDIENTE** son los únicos que deben tratarse como bloqueos funcionales cuando una implementación dependa directamente de ellos.

---

# 2. Resumen de pendientes funcionales

Los siguientes puntos continúan sin una definición explícita suficiente en la Descripción Integral:

| ID | Tema pendiente |
|---|---|
| PER-06 | Tratamiento funcional de Personas menores de edad. |
| SAL-HOR-08 | Restricción numérica de capacidad y si capacidad 0 es válida. |
| SAL-TUR-08 | Si una incorporación con origen específicamente “Espontáneo” puede cargarse retrospectivamente. |
| CLI-TRA-07 | Si Motivo de finalización = Otro obliga a detallar una descripción. |
| CLI-TRA-08 | Formato funcional exacto de “Etapa actual” del Tratamiento. |
| CLI-TRA-13 | Presentación exacta en listados cuando una Persona posee más de un Tratamiento desactualizado. |
| CLI-EVA-08 | Definición del rango permitido para Tests clínicos de tipo Escala. |
| OS-03 | Si una Orden puede usar una Obra social distinta de la Obra social actual de la Persona. |
| OS-05 | Semántica concreta del campo Referencia de una Orden. |
| OS-07 | Si la Fecha de vencimiento puede ser anterior a la Fecha de emisión. |
| CLI-ING-05 | Si, al vincular una Orden, la Obra social pagadora debe coincidir obligatoriamente con la de la Orden. |
| FIN-01 | Restricción explícita de Importe > 0 para Gastos. |
| FIN-08 | Cantidad de decimales funcionalmente esperada para la cotización USD. |
| INI-03 | Presentación exacta de Cancelados/Ausentes en Sala: total combinado o valores separados. |
| INI-04 | Criterio exacto de “Próximos horarios” de Sala. |
| INI-06 | Label visible exacto de la tarjeta de Atendidos/Atenciones. |
| INI-07 | Comportamiento visual de la tarjeta Atendidos al seleccionar Mañana. |
| POR-SAL-05 | Interpretación exacta del límite inclusivo de la ventana móvil de 30 días. |
| POR-DAT-02 | Presentación de campos opcionales no informados en “Mis datos”. |
| CAT-04 | Si los catálogos permiten nombres duplicados. |

Todo el resto de las dudas originales queda resuelto o deja de aplicar.

---

# 3. Personas y ciclo de vida

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| PER-01 | RESUELTO | Una Persona pasa a ser **Paciente únicamente mediante un alta explícita en Clínica**. Crear Turnos, Atenciones, Tratamientos u otros registros no reemplaza ese alta. Si la Persona ya existe por Sala, se reutiliza la misma ficha. | §2.4, §5.4, §7.2 |
| PER-02 | RESUELTO | El alta de una Persona se realiza desde un contexto de ingreso **Sala o Clínica**. No se define un alta neutral/general independiente de esas áreas. | §5.2 |
| PER-03 | RESUELTO | Un Turno clínico deja de considerarse futuro **al llegar su hora de inicio**. | §2.5, §5.7, §7.10 |
| PER-04 | RESUELTO | No. Si la hora de inicio ya ocurrió, el Turno Agendado deja de sostener por sí solo el estado Activo aunque su estado todavía no haya sido corregido. | §2.5, §7.10 |
| PER-05 | RESUELTO | Impiden eliminar la Persona: Turnos fijos de Sala; reservas puntuales o asistencias; rutinas; evaluaciones físicas; Pagos de Sala; Turnos clínicos; Atenciones; Evoluciones; Evaluaciones clínicas; Tratamientos; Estudios o archivos clínicos; antecedentes clínicos; Indicaciones para Sala; Órdenes de obra social; Ingresos clínicos; análisis de IA guardados. El alta inicial, PIN, datos generales, alta como Paciente e incorporación inicial a Sala por sí solos no bloquean. | §5.10 |
| PER-06 | PENDIENTE | El sistema excluye cuentas de padres/tutores y flujo especial para menores, pero no define si existen restricciones de edad ni si un menor puede darse de alta con el circuito normal. | §16.1 |
| PER-07 | RESUELTO | Sí. La inactivación global actúa desde la confirmación hacia adelante. Actividades cuya hora de inicio ya ocurrió se preservan y pueden corregirse luego según sus reglas normales. | §5.8, §15.24 |
| PER-08 | RESUELTO | No se genera un PIN nuevo por reactivación. La Persona reutiliza las mismas credenciales salvo que el PIN haya sido restablecido expresamente. | §10.2 |

---

# 4. Equipo, roles y profesionales

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| EQU-01 | RESUELTO | Un InternalUser ACTIVE debe tener al menos un rol. No se permite quitar el último rol de una cuenta activa; para quitar acceso se debe inactivar la cuenta. | Definición aprobada 2026-08-24 |
| EQU-02 | RESUELTO | Si una cuenta posee Kinesiólogo y Osteópata, no selecciona disciplina por Atención/Evolución/Evaluación. Históricamente se identifica al profesional interviniente; la cuenta puede mostrarse como “Kinesiólogo / Osteópata”. | §3.6 |
| EQU-03 | RESUELTO | Las Indicaciones para Sala no tienen un “responsable” que deba reasignarse. La inactivación clínica exige resolver Tratamientos En curso y Turnos futuros Agendados; las Indicaciones mantienen su vigencia normal hasta ser cerradas. | §4.8, §6.40, §7.27 |
| EQU-04 | RESUELTO | Sí. La reasignación modifica únicamente la responsabilidad actual de Profesor principal. Rutinas, Evaluaciones físicas, pagos y registros previos conservan autores y referencias originales. | §4.8, §15.21 |
| EQU-05 | RESUELTO | Sí. Todo usuario interno puede consultar y modificar sus propios datos de ficha. Roles y estado no son editables por autoservicio. | §4.2 |
| EQU-06 | RESUELTO | Reactivar cambia únicamente INACTIVE → ACTIVE, conserva roles y exige al menos un rol válido. No restaura responsabilidades operativas ni sesiones previas; el usuario debe autenticarse nuevamente. | Definición aprobada 2026-08-24 |
| EQU-07 | RESUELTO | Inactivar no elimina ni modifica roles. La cuenta INACTIVE conserva su configuración de roles; pierde acceso por su estado. | Definición aprobada 2026-08-24 |

---

# 5. Sala — grilla y horarios

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| SAL-HOR-01 | RESUELTO | Cada horario define día, hora de inicio, duración y capacidad. La duración propuesta es **60 minutos**, pero puede modificarse libremente. La hora de fin se deriva. | §6.6 |
| SAL-HOR-02 | RESUELTO | No se permiten horarios habituales superpuestos dentro del mismo día. Un horario sí puede comenzar exactamente cuando termina el anterior. | §6.6 |
| SAL-HOR-03 | NO APLICA | Como no se permiten horarios habituales superpuestos, no existe el caso de dos capacidades simultáneas por slots superpuestos. Sala tiene capacidad general y cada horario puede heredarla o definir una propia. | §6.6–§6.7 |
| SAL-HOR-04 | RESUELTO | La unidad operativa de Sala es un slot fijo de 15 minutos. Las ventanas semanales definen apertura; cada servicio configura una duración positiva múltiplo de 15 y las reservas consumen/cotejan capacidad en todos sus slots consecutivos. | Definición funcional confirmada 2026-08-28 |
| SAL-HOR-04 | RESUELTO | Cambiar día o **hora de inicio**, o eliminar permanentemente el horario, constituye reemplazo y afecta Turnos fijos/reservas futuras. Cambiar capacidad o duración manteniendo día y hora de inicio conserva el mismo horario. | §6.8 |
| SAL-HOR-05 | RESUELTO | Sí. Reducir capacidad no cancela reservas ni Turnos fijos existentes; puede quedar sobrecupo. | §6.7–§6.8 |
| SAL-HOR-06 | RESUELTO | La excepción por fecha definida en V1 permite **cerrar un horario** o **cambiar su capacidad** para esa ocurrencia. No se define creación excepcional de un horario inexistente. | §6.9 |
| SAL-HOR-07 | RESUELTO | La excepción por fecha no modifica día/hora/duración: se limita a cierre o cambio de capacidad de esa ocurrencia. | §6.9 |
| SAL-HOR-08 | RESUELTO | Toda capacidad general, específica o excepcional es un entero estrictamente positivo (`>= 1`). El valor 0 no es válido ni representa cierre; los cierres se modelan explícitamente. | §6.7, §6.9 |

---

# 6. Sala — Turnos fijos, reservas y asistencia

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| SAL-TUR-01 | RESUELTO | Sí. Los usuarios internos pueden crear/modificar Turnos fijos con el horario completo mediante advertencia no bloqueante de sobrecupo. | §6.10, §6.13 |
| SAL-TUR-02 | RESUELTO | En Portal el Alumno puede modificar Fecha de inicio y Fecha de finalización. Se propone próxima ocurrencia y “Sin fecha de finalización”. | §6.10, §10.6 |
| SAL-TUR-03 | RESUELTO | No. La Fecha de inicio de un Turno fijo no puede ser anterior al momento de creación; no reconstruye ocurrencias retroactivas. | §6.10 |
| SAL-TUR-04 | RESUELTO | Los usuarios internos pueden registrar o corregir ocurrencias de fechas pasadas y establecer directamente el estado de asistencia correspondiente. | §6.12 |
| SAL-TUR-05 | RESUELTO | El límite de 30 días aplica al Portal. Los usuarios internos no tienen un límite temporal futuro específico para reservas puntuales. | §6.12 |
| SAL-TUR-06 | RESUELTO | Sí. Una Persona no puede estar registrada dos veces en la misma fecha y el mismo horario, independientemente del origen de la presencia. | §6.14 |
| SAL-TUR-07 | RESUELTO | Sí. La incorporación espontánea se registra como presencia de origen espontáneo y se marca la asistencia; los indicadores la tratan como **Asistió**. | §6.16–§6.17 |
| SAL-TUR-08 | PENDIENTE | Se permite corregir ocurrencias pasadas, pero no se define expresamente si el origen específico “Espontáneo” puede crearse retrospectivamente o si debe registrarse mediante la corrección de ocurrencia general. | §6.12, §6.17 |
| SAL-TUR-09 | RESUELTO | Sí. Los estados de las ocurrencias pueden corregirse posteriormente sin límite de tiempo por usuarios internos habilitados. | §6.15 |
| SAL-TUR-10 | RESUELTO | Sí. Los estados Reservado, Asistió, Cancelado y Ausente son corregibles posteriormente; no existe una matriz rígida de transición. | §6.15 |
| SAL-TUR-11 | RESUELTO | Sí. Ausente puede corregirse a Asistió y viceversa como parte de la corrección manual. | §6.15 |
| SAL-TUR-12 | RESUELTO | El cierre excepcional de una fecha **cancela esa ocurrencia concreta**; la recurrencia del Turno fijo continúa las semanas siguientes. | §6.9, §6.11 |
| SAL-TUR-13 | RESUELTO | Las reservas futuras afectadas por un reemplazo de grilla se **cancelan**, no se eliminan como si nunca hubieran existido. | §6.8, §13.7–§13.9 |

---

# 7. Sala — pagos y Planes

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| SAL-PAG-01 | RESUELTO | Sí. El mes de incorporación queda Pago pendiente desde el momento del ingreso si aún no tiene un Pago válido, sin importar el día del mes. | §6.19, §6.33 |
| SAL-PAG-02 | RESUELTO | Sí. El mes de incorporación ya cuenta como primer mes impago si no existe Pago válido. | §6.19 |
| SAL-PAG-03 | RESUELTO | Sí. Los próximos Pagos proponen el **precio actual del Plan actual**; si el Plan cambió antes de registrar ese pago, se usa el nuevo Plan. | §6.31–§6.34 |
| SAL-PAG-04 | RESUELTO | Sí. Un Pago ya registrado no cambia por cambiar el Plan; el nuevo Plan afecta propuestas de Pagos posteriores/no registrados. | §6.31 |
| SAL-PAG-05 | RESUELTO | El Importe debe ser **mayor a cero**. | §6.33 |
| SAL-PAG-06 | RESUELTO | No se admiten Pagos negativos y no existe lógica de devolución/reversión. | §6.33 |
| SAL-PAG-07 | RESUELTO | La Fecha real de cobro debe ser hoy o anterior, nunca futura. | §6.34 |
| SAL-PAG-08 | RESUELTO | Sí. El Mes/Año pagado puede ser pasado, actual o futuro. | §6.33–§6.34 |
| SAL-PAG-09 | RESUELTO | Sí. El precio actual del Plan es el valor que se propone al iniciar nuevos Pagos; modificar el precio impacta futuras cargas no registradas. | §6.30–§6.34 |
| SAL-PAG-10 | RESUELTO | La regla general de catálogos es que editar actualiza el mismo concepto y las referencias existentes muestran la definición actual. Los movimientos preservan sus datos propios —especialmente el importe cobrado—, no una versión histórica del nombre del Plan. | §6.30, §13.8, §14.1 |
| SAL-PAG-11 | RESUELTO | Si un Plan fue retirado y luego vuelve a necesitarse, se crea un Plan nuevo; no se reactiva el anterior. | §6.30, §14.1 |

---

# 8. Sala — Rutinas y catálogo de ejercicios

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| SAL-RUT-01 | RESUELTO | Todo ejercicio de una Rutina proviene del catálogo. Si no existe, Profesor/Admin general puede crearlo durante la carga y continuar. | §6.23 |
| SAL-RUT-02 | RESUELTO | Editar Nombre, Músculo principal o Descripción actualiza el mismo Ejercicio y las Rutinas que lo utilizan muestran la definición actual. | §6.23 |
| SAL-RUT-03 | RESUELTO | No. Si se retira un Ejercicio utilizado en Rutinas activas, previa advertencia se quita también de esas Rutinas. Las históricas no se modifican. | §6.23 |
| SAL-RUT-04 | RESUELTO | Sí. Puede retirarse un Ejercicio usado en Rutinas activas; se informa cuántas serán afectadas y, al confirmar, se elimina de esas Rutinas activas. | §6.23 |
| SAL-RUT-05 | RESUELTO | Solo el Ejercicio es obligatorio. Series, Repeticiones/Tiempo, Carga, Descanso y Observación son opcionales. | §6.21 |
| SAL-RUT-06 | RESUELTO | Repeticiones y Tiempo son alternativas dentro de un mismo ejercicio. | §6.21 |
| SAL-RUT-07 | RESUELTO | Tiempo, Carga y Descanso se expresan como texto breve incluyendo unidad/referencia. No existe catálogo de unidades. | §6.21 |
| SAL-RUT-08 | RESUELTO | Sí. Duplicar precarga días, ejercicios, valores y observaciones y crea una nueva Rutina independiente. | §6.22 |
| SAL-RUT-09 | RESUELTO | Sí. Un Alumno puede permanecer sin Rutina activa indefinidamente; se identifica para seguimiento pero no existe bloqueo ni plazo obligatorio. | §6.20 |

---

# 9. Sala — Evaluaciones físicas

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| SAL-EVF-01 | RESUELTO | Toda Evaluación registra un Profesor. Si la crea un Administrador general sin rol Profesor, debe identificarse el Profesor correspondiente. | §6.26, §6.29 |
| SAL-EVF-02 | RESUELTO | La Evaluación completa registra un único Profesor. Los resultados no tienen autores/profesores independientes. | §6.26 |
| SAL-EVF-03 | NO APLICA | La definición actual no modela Carga/Repeticiones/Unidad de forma estructurada para Tests físicos. Cada uso del Test registra un **Resultado breve abierto** con la unidad/referencia incluida en el texto. | §6.27–§6.28 |
| SAL-EVF-04 | NO APLICA | No existe estructura Valor + Unidad específica para Tipo Otra. Todos los Tests físicos utilizan Resultado breve abierto. | §6.27–§6.28 |
| SAL-EVF-05 | RESUELTO | No existe versionado de Tests físicos. Editar Nombre/Tipo/Descripción actualiza el mismo Test. Retirar un Test no altera Evaluaciones históricas. | §6.27 |
| SAL-EVF-06 | RESUELTO | Un Test puede retirarse de nuevas selecciones; las Evaluaciones históricas permanecen intactas. | §6.27 |
| SAL-EVF-07 | RESUELTO | Sí. Una misma Evaluación puede incluir el mismo Test más de una vez. | §6.28 |

---

# 10. Indicaciones clínicas para Sala

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| IND-01 | RESUELTO | Zona afectada es siempre opcional, incluso en Con restricciones y No entrenar. | §6.38, §7.26 |
| IND-02 | RESUELTO | Instrucciones son obligatorias **solo** para Con restricciones. Para Sin restricciones y No entrenar son opcionales. | §6.38, §7.26 |
| IND-03 | RESUELTO | Sí. Para Sin restricciones Zona e Instrucciones pueden quedar vacías. | §6.38 |
| IND-04 | RESUELTO | El cierre es definitivo. Una Indicación cerrada no se reabre; si vuelve a ser necesaria se crea una nueva. | §6.40, §7.27 |
| IND-05 | RESUELTO | Kinesiólogo, Osteópata y Administrador general pueden modificar el contenido de una Indicación activa, incluida su Condición, mientras permanezca activa. | §6.40, §7.26 |
| IND-06 | RESUELTO | No existe Fecha de inicio adicional. La vigencia comienza al crearse. | §6.38, §7.26 |
| IND-07 | RESUELTO | No existe fecha programada de finalización/vencimiento. Permanece activa hasta que se cierra o hasta la baja de Sala. | §6.38, §6.41 |
| IND-08 | RESUELTO | Correcto. Finalizar o reabrir un Tratamiento no modifica automáticamente sus Indicaciones. | §7.24, §7.26 |
| IND-09 | RESUELTO | Sí. La asociación con Tratamiento puede agregarse, cambiarse o quitarse sin alterar la vigencia de la Indicación. | §7.26 |

---

# 11. Clínica — Turnos

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-TUR-01 | RESUELTO | Duración predeterminada: **60 minutos**. | §7.8 |
| CLI-TUR-02 | RESUELTO | La duración propuesta es 60 minutos tanto para Kinesiología como para Osteopatía. | §7.8 |
| CLI-TUR-03 | RESUELTO | La duración debe ser mayor a cero. No existe mínimo/máximo funcional adicional. | §7.8 |
| CLI-TUR-04 | RESUELTO | Los Turnos pueden comenzar en cualquier minuto; la UI puede facilitar horarios habituales sin imponer granularidad. | §7.8 |
| CLI-TUR-05 | RESUELTO | Los Turnos se agendan para fechas futuras. Para una consulta ya ocurrida sin Turno se crea Atención directa, no Turno retrospectivo. | §7.7 |
| CLI-TUR-06 | RESUELTO | Sí. Un Turno pasado que permanece Agendado puede reprogramarse. | §7.9 |
| CLI-TUR-07 | RESUELTO | Sí. Cancelado puede volver a Agendado como corrección. | §7.9 |
| CLI-TUR-08 | RESUELTO | Sí. Ausente puede corregirse a Atendido si la consulta ocurrió. | §7.9 |
| CLI-TUR-09 | RESUELTO | Sí. Cancelado puede corregirse a Atendido si la consulta ocurrió. | §7.9 |
| CLI-TUR-10 | RESUELTO | Sí. Si la Atención creada por Atendido está vacía y sin dependencias, puede eliminarse y corregirse el Turno, incluso para reprogramarlo. | §7.9, §7.12 |
| CLI-TUR-11 | RESUELTO | No existe una matriz rígida. Los estados son Agendado, Atendido, Cancelado y Ausente y pueden corregirse manualmente; salir de Atendido exige poder eliminar la Atención asociada sin pérdida de contenido/dependencias. | §7.9 |
| CLI-TUR-12 | RESUELTO | Es una nota operativa breve y libre; no se utiliza para diagnóstico ni contenido clínico detallado. No se define un límite de caracteres funcional. | §7.7 |
| CLI-TUR-13 | NO APLICA | Los Turnos clínicos **no se asocian a Tratamientos**. | §7.7, §7.18, §16.1 |
| CLI-TUR-14 | NO APLICA | Un Turno no referencia ningún Tratamiento, aun si la Persona posee varios En curso. | §7.7, §7.18 |

---

# 12. Clínica — Atenciones

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-ATE-01 | RESUELTO | Cada Atención puede asociarse opcionalmente a **un único Tratamiento**. | §7.13, §7.18 |
| CLI-ATE-02 | RESUELTO | Sí. Una Atención directa puede cargarse con fecha/hora actual o pasada. | §7.14 |
| CLI-ATE-03 | RESUELTO | No. La Fecha/Hora de una Atención directa nunca puede ser futura. | §7.14 |
| CLI-ATE-04 | RESUELTO | Para Atenciones actuales se exige profesional clínico activo. Al registrar/corregir historia pasada puede utilizarse un profesional actualmente Inactivo que efectivamente realizó la consulta. | §7.14 |
| CLI-ATE-05 | RESUELTO | La Atención solo registra la cobertura operativa **Particular u Obra social**. No guarda una Obra social específica. | §7.13 |
| CLI-ATE-06 | NO APLICA | No existe una Obra social concreta en la Atención que deba proponerse. | §7.13 |
| CLI-ATE-07 | RESUELTO | Sí. La cobertura Particular/Obra social puede corregirse posteriormente. | §7.13 |
| CLI-ATE-08 | RESUELTO | Un Turno Atendido crea automáticamente **una única Atención asociada** si todavía no existe. | §7.12 |
| CLI-ATE-09 | RESUELTO | Fecha/Hora, Profesional y cobertura de la Atención pueden corregirse por los roles habilitados para gestionar Atenciones. El contenido clínico vinculado conserva sus autorías propias. | §7.13–§7.14 |

---

# 13. Clínica — Evoluciones

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-EVO-01 | RESUELTO | Cada Atención puede tener como máximo **una Evolución**. | §7.13, §7.16 |
| CLI-EVO-02 | RESUELTO | Cada Atención identifica un profesional y admite como máximo una Evolución. No existe una Evolución separada por cada profesional dentro de la misma Atención. | §7.13, §7.16 |
| CLI-EVO-03 | RESUELTO | Evolución clínica, Prácticas/maniobras e Indicaciones/próximos pasos son campos opcionales individualmente. | §7.16 |
| CLI-EVO-04 | RESUELTO | Debe existir contenido en al menos uno de esos apartados. No se guardan Evoluciones totalmente vacías. | §7.16 |
| CLI-EVO-05 | RESUELTO | La fecha clínica de la Evolución es la fecha de la Atención. Creación/modificación se conservan aparte como trazabilidad. | §7.16 |
| CLI-EVO-06 | RESUELTO | Sí. La Evolución conserva autor y fecha clínica original y registra último modificador/fecha al corregirse. | §7.17 |

---

# 14. Clínica — Tratamientos

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-TRA-01 | RESUELTO | El Tratamiento posee un campo funcional único **“Zona corporal o lesión”**; no se define catálogo para este dato. | §7.19 |
| CLI-TRA-02 | RESUELTO | Sí. Fecha de inicio puede ser hoy o una fecha pasada, nunca futura. | §7.19 |
| CLI-TRA-03 | RESUELTO | Sí. Al finalizar se registra Fecha de finalización. | §7.21 |
| CLI-TRA-04 | RESUELTO | Se propone fecha actual y puede modificarse a una fecha pasada, respetando inicio y última Atención; nunca futura. | §7.21 |
| CLI-TRA-05 | RESUELTO | No existe Fecha de reapertura independiente. El Tratamiento simplemente vuelve a En curso y se conserva la trazabilidad de la acción. | §7.22 |
| CLI-TRA-06 | RESUELTO | No. Fecha de finalización no puede ser anterior a la última Atención asociada ni a la Fecha de inicio. | §7.21 |
| CLI-TRA-07 | PENDIENTE | Motivo es opcional y admite Alta, Interrupción, Derivación u Otro, pero no se define si seleccionar Otro obliga a detallar texto adicional. | §7.21 |
| CLI-TRA-08 | PENDIENTE | “Etapa actual” es opcional, pero el documento no define si es texto libre ni un conjunto cerrado de valores. | §7.19 |
| CLI-TRA-09 | RESUELTO | Sí. El responsable puede cambiarse. Los Turnos no están asociados al Tratamiento y conservan su propio profesional. | §7.20 |
| CLI-TRA-10 | RESUELTO | Los Turnos futuros mantienen su profesional original; cambiar el responsable del Tratamiento no modifica Turnos. | §7.20 |
| CLI-TRA-11 | RESUELTO | El cálculo de inactividad de un Tratamiento se basa en la **última Atención de ese Tratamiento**; si nunca tuvo Atenciones, desde su Fecha de inicio. | §7.23 |
| CLI-TRA-12 | RESUELTO | Se consideran días completos; por lo tanto entra al filtro de 30 días al cumplirse 30 días completos desde última Atención o Fecha de inicio. | §7.23 |
| CLI-TRA-13 | PENDIENTE | Se define qué Tratamientos entran al filtro, pero no se define la representación exacta si una misma Persona tiene varios Tratamientos simultáneamente alcanzados por el criterio. | §5.11, §7.23 |
| CLI-TRA-14 | RESUELTO | Sí. Un Tratamiento puede finalizarse y reabrirse tantas veces como la situación real lo requiera. | §7.22 |
| CLI-TRA-15 | RESUELTO | Sí. Reabrir es también el mecanismo para corregir una finalización hecha por error. | §7.22 |

---

# 15. Clínica — Evaluaciones estructuradas

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-EVA-01 | RESUELTO | Una Atención puede contener **una o varias Evaluaciones clínicas**. | §7.28 |
| CLI-EVA-02 | RESUELTO | La Evaluación identifica “Zona corporal o Tipo” mediante un criterio textual breve, no dos catálogos independientes. | §7.29 |
| CLI-EVA-03 | RESUELTO | Zona/Tipo es texto breve libre, sin catálogo específico. | §7.29 |
| CLI-EVA-04 | RESUELTO | Una Evaluación puede utilizar como máximo **un Protocolo** opcional. | §7.29–§7.30 |
| CLI-EVA-05 | RESUELTO | Sí. El profesional puede agregar Tests existentes o crear un Test nuevo durante la misma carga. | §7.29 |
| CLI-EVA-06 | RESUELTO | Los Tests creados durante una Evaluación quedan disponibles en el catálogo reutilizable. | §7.29 |
| CLI-EVA-07 | RESUELTO | Sí. Un mismo Test puede aparecer más de una vez, por ejemplo para distintos lados corporales. | §7.29 |
| CLI-EVA-08 | PENDIENTE | Se admite formato Escala, pero no se define si cada Test debe configurar explícitamente mínimo/máximo ni cómo se representa ese rango. | §7.29 |
| CLI-EVA-09 | RESUELTO | Sí. Los Tests de tipo Opciones definen previamente sus opciones. | §7.29 |
| CLI-EVA-10 | RESUELTO | La Unidad de un Test numérico se define en el propio Test y se aplica consistentemente a sus resultados. | §7.29, §7.34 |
| CLI-EVA-11 | RESUELTO | Sí. El lado corporal se registra opcionalmente por Resultado. | §7.29, §7.34 |
| CLI-EVA-12 | RESUELTO | “No realizado” forma parte del formato categórico definido junto con Positivo/Negativo/Inconcluso. | §7.29 |
| CLI-EVA-13 | RESUELTO | No. Para guardar una Evaluación debe existir al menos un Resultado de Test. | §7.29 |
| CLI-EVA-14 | RESUELTO | Sí. Una corrección puede agregar o quitar Tests además de modificar Resultados, lado, observaciones y conclusión. | §7.32 |
| CLI-EVA-15 | RESUELTO | Sí. La Evaluación histórica preserva la definición del Protocolo y de los Tests con la que fue registrada, incluyendo los atributos necesarios para conservar el significado de sus resultados. | §7.31, §13.6, §13.8 |

---

# 16. Clínica — Estudios y archivos

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-EST-01 | RESUELTO | Fecha y Tipo son obligatorios. Descripción, archivo y asociación a Tratamiento son opcionales. | §7.25 |
| CLI-EST-02 | RESUELTO | Tipo es texto breve libre; no existe catálogo. | §7.25 |
| CLI-EST-03 | RESUELTO | Cada registro admite como máximo **un archivo**. | §7.25 |
| CLI-EST-04 | RESUELTO | Sí. Puede existir sin archivo, como referencia descriptiva. | §7.25 |
| CLI-EST-05 | RESUELTO | Sí. El archivo puede quitarse o reemplazarse si se cargó por error; no se conservan versiones. | §7.25 |
| CLI-EST-06 | RESUELTO | Sí. La asociación a Tratamiento puede agregarse, cambiarse o quitarse. | §7.25 |

---

# 17. Obras sociales y Órdenes

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| OS-01 | RESUELTO | La Persona conserva una única Obra social **actual** y un número de afiliado actual. | §5.2, §7.42 |
| OS-02 | RESUELTO | No se conserva historial específico de cambios de Obra social de la Persona; solo el valor actual. Los registros históricos que la referencian conservan su contexto. | §7.42 |
| OS-03 | PENDIENTE | La Orden registra una Obra social propia, pero no se aclara expresamente si puede diferir de la Obra social actual de la Persona. | §7.43 |
| OS-04 | RESUELTO | Sí. Una Obra social retirada sigue mostrándose en Personas/registros que ya la referenciaban hasta que esos datos se modifiquen. | §7.42 |
| OS-05 | PENDIENTE | Referencia es opcional, pero no se especifica si representa número de autorización, número de orden u otro dato concreto. | §7.43 |
| OS-06 | RESUELTO | La fecha de la Orden es la **Fecha de emisión**. | §7.43 |
| OS-07 | PENDIENTE | No se define una restricción entre Fecha de emisión y Fecha de vencimiento. | §7.43–§7.44 |
| OS-08 | RESUELTO | Cantidad autorizada es informativa y la Orden puede modificarse; no controla consumo de sesiones ni liquidaciones. | §7.43–§7.45 |
| OS-09 | RESUELTO | Sí. Una Persona puede tener varias Órdenes de la misma Obra social simultáneamente; no existe una única Orden vigente ni prioridad automática. | §7.43 |

---

# 18. Ingresos clínicos

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CLI-ING-01 | RESUELTO | El Importe debe ser mayor a cero. | §7.47, §7.50 |
| CLI-ING-02 | RESUELTO | No existen ingresos negativos ni lógica de devolución/reversión dentro del alcance. | §7.47, §7.53 |
| CLI-ING-03 | RESUELTO | Fecha de cobro puede ser actual o pasada, nunca futura. | §7.47 |
| CLI-ING-04 | RESUELTO | Sí. Si Pagador = Obra social puede elegirse cualquier Obra social disponible, aunque no coincida con la actual de la Persona. | §7.48 |
| CLI-ING-05 | PENDIENTE | El documento permite relacionar Ingreso con una Orden del Paciente, pero no define expresamente si la Obra social pagadora debe coincidir con la Obra social de esa Orden. | §7.48–§7.49 |
| CLI-ING-06 | RESUELTO | Sí. La asociación a Orden es contextual y opcional; no se restringe por Pagador Paciente. | §7.49 |
| CLI-ING-07 | RESUELTO | Sí. La Orden y Atención opcionales referenciadas por el Ingreso deben ser del Paciente al que pertenece ese Ingreso. | §7.49 |
| CLI-ING-08 | RESUELTO | Sí. El Pagador puede corregirse entre Paciente y Obra social como modificación normal. | §7.48 |

---

# 19. Gastos y Finanzas

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| FIN-01 | PENDIENTE | El Gasto representa un egreso y posee Importe obligatorio, pero no se explicita una validación funcional `Importe > 0` como sí ocurre en Pagos e Ingresos. | §8.4 |
| FIN-02 | RESUELTO | No existe lógica general de devolución/reversión; los movimientos cargados por error se corrigen o eliminan según permisos. | §8.3, §16.1 |
| FIN-03 | RESUELTO | La Fecha de Gasto debe ser hoy o anterior, nunca futura. | §8.4 |
| FIN-04 | RESUELTO | Categoría, Medio de pago y Área forman parte obligatoria del Gasto; solo Descripción es expresamente opcional. | §8.4 |
| FIN-05 | RESUELTO | Accesos rápidos: **Mes actual, Mes anterior, Año actual y Rango personalizado**. | §8.7 |
| FIN-06 | RESUELTO | Sí. Gastos: Sala, Clínica o General. Ingresos: origen Sala o Clínica. El dashboard permite filtrar por Área cuando aporta valor. | §8.1, §8.4, §8.7 |
| FIN-07 | RESUELTO | Sí. La cotización mensual puede corregirse en cualquier momento; consultas posteriores usan el valor nuevo y no se guarda historial anterior. | §8.9 |
| FIN-08 | PENDIENTE | No se define cantidad de decimales para la cotización USD desde el punto de vista funcional. | §8.9 |
| FIN-09 | RESUELTO | Exportación de Gastos: Fecha, Importe, Categoría, Medio de pago, Área, Descripción, Usuario que registró. Ingresos: Fecha de cobro, Área, Tipo de ingreso, Persona, Importe, Medio de pago, Usuario; además Mes/Año y Motivo de ajuste para Sala; Pagador, Obra social y Observación para Clínica. | §8.10 |

---

# 20. Inicio / Dashboard operativo

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| INI-01 | RESUELTO | “Alumnos esperados” cuenta únicamente presencias planificadas por **Turnos fijos y reservas puntuales**. | §6.16, §9.3 |
| INI-02 | RESUELTO | Una incorporación espontánea marcada Asistió aumenta **Asistencias registradas**, pero no Alumnos esperados. | §6.16, §9.3 |
| INI-03 | PENDIENTE | Se define la tarjeta “Cancelados/Ausentes”, pero no se aclara si visualmente muestra un total combinado o dos subtotales. | §9.3 |
| INI-04 | PENDIENTE | El bloque incluye “Próximos horarios”, pero no se fija cantidad/horizonte exacto. | §9.3 |
| INI-05 | RESUELTO | “Próximos Turnos” muestra hasta **5** Turnos Agendados de la fecha seleccionada, ordenados por hora. En Hoy solo los que aún no comenzaron; en Mañana los primeros Agendados del día siguiente. | §9.4 |
| INI-06 | PENDIENTE | El documento usa “Turnos Atendidos” y también “Atendidos hoy”; no fija un único label final de UI. | §9.4 |
| INI-07 | PENDIENTE | El selector permite Hoy/Mañana, pero no se especifica si la tarjeta Atendidos debe ocultarse, mostrarse en cero o adaptarse cuando se selecciona Mañana. | §9.2–§9.4 |
| INI-08 | RESUELTO | En roles combinados Sala y Clínica tienen la misma jerarquía funcional y un orden estable: **Sala primero, Clínica después**. | §9.1 |

---

# 21. Portal — Sala

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| POR-SAL-01 | RESUELTO | El Alumno puede modificar Fecha de inicio y Fecha de finalización de sus Turnos fijos; la finalización puede quedar abierta. | §10.6 |
| POR-SAL-02 | A CRITERIO TÉCNICO | Funcionalmente, cambiar un Turno fijo es una única acción que afecta hacia adelante desde la nueva Fecha de inicio y nunca reescribe ocurrencias pasadas. Si internamente se modela como reemplazo de registro o cambio de vigencia es una decisión técnica siempre que se preserve ese comportamiento. | §10.6 |
| POR-SAL-03 | RESUELTO | La Fecha de inicio propuesta es la próxima ocurrencia del horario y puede modificarse solo hacia adelante. Una ocurrencia del mismo día todavía futura puede ser la próxima ocurrencia. | §6.10, §10.6 |
| POR-SAL-04 | RESUELTO | Sí. Puede reservar más de un horario de una misma fecha si son horarios distintos y hay capacidad. | §10.7 |
| POR-SAL-05 | PENDIENTE | Se define una ventana móvil de próximos 30 días, pero no se formaliza el borde exacto inclusivo/exclusivo del día 30. | §6.12, §10.7 |
| POR-SAL-06 | RESUELTO | Si cancela una reserva y el horario continúa sin capacidad disponible, no puede volver a reservar. Solo puede hacerlo si en ese momento existe lugar. | §10.7 |
| POR-SAL-07 | RESUELTO | Los compromisos futuros Cancelados permanecen visibles e identificados hasta que pasa su fecha/hora. Después dejan de mostrarse; no existe historial de asistencias/cancelaciones pasadas en Portal. | §10.5 |

---

# 22. Portal — Clínica y datos personales

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| POR-CLI-01 | RESUELTO | Un Turno clínico futuro Cancelado permanece visible, sin acciones, hasta que pasa su fecha/hora. | §10.11 |
| POR-CLI-02 | RESUELTO | Portal muestra Turnos clínicos futuros **Agendados y Cancelados**. Atendidos y Ausentes no se muestran como compromisos futuros. | §10.11 |
| POR-DAT-01 | RESUELTO | “Mis datos” muestra la información general disponible de la Persona. Esto abarca los datos generales definidos para Persona: Nombre, Apellido, DNI, Teléfono, Fecha de nacimiento y, cuando existan, Email, contacto de emergencia, Obra social y número de afiliado. | §5.2, §10.12 |
| POR-DAT-02 | PENDIENTE | No se define si un campo opcional vacío debe omitirse o mostrarse como “Sin informar”. | §10.12, §12.16 |
| POR-DAT-03 | RESUELTO | Sí. “Mis datos” es una sección general de la Persona y no se divide por Sala/Clínica. | §10.12 |

---

# 23. Catálogos y preservación histórica

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| CAT-01 | RESUELTO | Solo Protocolos clínicos y Biblioteca Clínica usan Activo/Inactivo y pueden reactivarse. En el resto, un valor retirado no se reactiva: si vuelve a necesitarse se crea uno nuevo. | §14.1 |
| CAT-02 | RESUELTO | La regla general es que **editar un valor actualiza el mismo concepto** y las referencias existentes muestran su definición actual. | §13.8, §14.1 |
| CAT-03 | RESUELTO | No existe preservación histórica general de la definición editada. La excepción deliberada son las Evaluaciones clínicas, que preservan definición de Protocolo/Tests utilizada. | §13.6, §13.8, §14.1 |
| CAT-04 | PENDIENTE | No se define si deben impedirse nombres duplicados en Medios de pago, Categorías, Obras sociales, Ejercicios, Tests u otros catálogos. | §14.1 |
| CAT-05 | RESUELTO | En catálogos sin Activo/Inactivo, si un valor retirado vuelve a necesitarse se crea uno nuevo. Protocolos/Biblioteca sí pueden reactivarse. | §14.1 |

---

# 24. Trazabilidad funcional

| ID | Estado | Definición resultante | Fuente |
|---|---|---|---|
| TRA-01 | RESUELTO | No se define auditoría general. La trazabilidad se limita a contenido clínico relevante, movimientos económicos, restablecimientos de contraseña/PIN, inactivación global, cambios de roles, activación/inactivación de cuentas, cierre de Indicaciones y acciones sensibles de Soporte Broco. | §13.5–§13.6 |
| TRA-02 | RESUELTO | No. Las Evaluaciones físicas de Sala no incorporan trazabilidad adicional de último modificador. | §6.29, §13.5 |
| TRA-03 | RESUELTO | Sí. Pagos, Ingresos y Gastos conservan quién registró el movimiento y, si se corrigen, su detalle muestra último modificador y fecha de modificación. | §13.5 |
| TRA-04 | RESUELTO | No. Las reasignaciones masivas no generan un historial específico adicional. | §13.5 |

---

# 25. Bloqueos prioritarios actuales

De las preguntas que originalmente se consideraban de prioridad “Muy alta” para modelo de datos, la Descripción Integral ya resuelve las cardinalidades y reglas principales:

- Paciente se adquiere por alta explícita en Clínica.
- DNI es obligatorio y único entre Personas.
- Turno futuro deja de sostener actividad al llegar la hora de inicio.
- Horarios de Sala no se superponen.
- Día/hora de inicio identifican la continuidad de un horario.
- Atención ↔ Tratamiento: máximo uno.
- Turno clínico ↔ Atención: máximo una Atención.
- Atención ↔ Evolución: máximo una Evolución.
- Atención ↔ Evaluación clínica: una o varias.
- Turnos clínicos no se asocian a Tratamientos.
- Estudios: máximo un archivo.
- Persona: una Obra social actual, sin historial específico.
- Catálogos: edición actualiza el concepto salvo snapshot clínico específico.

Por lo tanto, **ninguno de los pendientes actuales obliga a bloquear el bootstrap técnico general**.

Los pendientes deben bloquear únicamente el milestone concreto cuando la implementación requiera tomar una decisión irreversible sobre ese punto.

---

# 26. Regla para Codex / agentes de desarrollo

Al trabajar con este documento:

1. Los ítems **RESUELTO** deben tratarse como reglas funcionales confirmadas.
2. Los ítems **NO APLICA** no deben modelarse.
3. Los ítems **A CRITERIO TÉCNICO** pueden resolverse técnicamente respetando el comportamiento funcional indicado.
4. Los ítems **PENDIENTE** no deben inferirse ni transformarse en constraints, validaciones, permisos o comportamientos definitivos.
5. Un pendiente bloquea solo la parte de la feature que dependa de él; no debe detener milestones independientes.
6. Si una implementación puede mantenerse neutral frente al pendiente, debe preferirse esa solución.

---

# 27. Fuente funcional

Fuente utilizada para esta actualización:

**Athleta Manager — Descripción Integral del Sistema**  
Definición funcional del producto objetivo, versión entregada para desarrollo.

Las referencias `§x.y` de este documento corresponden a las secciones numeradas de esa Descripción Integral.

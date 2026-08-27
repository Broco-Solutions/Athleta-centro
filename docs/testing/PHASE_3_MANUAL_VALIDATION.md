# Phase 3 — Validación manual de Clínica

Este documento es un checklist de recorrido manual. No reemplaza las reglas funcionales ni declara resultados anticipadamente.

## Prerrequisitos

- Docker y `pnpm` disponibles.
- Variables locales de `apps/api/.env` y `apps/web/.env.local` configuradas desde sus ejemplos, sin credenciales reales.
- Infraestructura local iniciada con `pnpm infra:up`.
- Migraciones aplicadas con `pnpm db:migrate`.
- Datos exclusivamente sintéticos. Usar `pnpm db:seed` y, solo en desarrollo, `pnpm db:seed:demo` cuando resulte apropiado.
- Iniciar API y web con `pnpm dev`; acceder a `http://localhost:3000`.

## Roles necesarios

- General Admin: recorrido integral y catálogos.
- Kinesiologist u Osteopath: carga de historia clínica.
- Administrative: agenda y órdenes, sin acceso a historia clínica.
- Professor: proyección restringida de indicaciones en Sala, sin historia clínica.

No registrar credenciales en este documento. Crear usuarios sintéticos desde Equipo.

## Datos sintéticos mínimos

- Una Persona con alta explícita como Paciente.
- Dos profesionales clínicos activos.
- Un Professor y un Administrative.
- Dos Obras sociales distintas.
- Un Test clínico de cada tipo y, para SCALE, límites decimales propios.
- Un PDF o imagen sintética sin datos personales.

## Recorrido recomendado

Registrar cada paso en la tabla final.

1. **Clínica / Agenda**: seleccionar fecha, crear un Turno futuro de 60 minutos y otro solapado. Verificar advertencia no bloqueante, reprogramar, cancelar, corregir a SCHEDULED y marcar ausente.
2. **Paciente**: localizar la Persona y confirmar que su identidad no está duplicada. Darla de alta explícitamente como Paciente si corresponde.
3. **Appointment → Attention**: marcar un Turno SCHEDULED como atendido. Verificar una sola ClinicalAttention y que repetir la acción no crea otra.
4. **Treatment**: crear dos Treatments simultáneamente IN_PROGRESS. Editar etapa actual como texto libre, cambiar responsable, finalizar y reabrir. Para OTHER no exigir detalle adicional.
5. **Evolution**: desde Attention, crear con un solo bloque, corregir y verificar autor original y última modificación.
6. **ClinicalEvaluation**: crear dos Evaluations para la misma Attention. Agregar varios Results, repetir un Test con lados distintos y probar CATEGORICAL, NUMERIC, SCALE decimal, OPTIONS y TEXT. Corregir manteniendo autoría.
7. **Snapshots**: modificar unidad, opciones o límites del Test en el catálogo y comprobar que la Evaluation histórica mantiene la definición usada.
8. **Study / File**: crear Study sin archivo, adjuntar PDF/imagen válida, solicitar acceso, reemplazar y quitar. Verificar que el Study permanece. Probar MIME o firma inválida.
9. **Obra social**: distinguir la Obra social actual de la Persona de la utilizada por una Orden. Crear una Orden con referencia libre y otra Obra social. Verificar vencimiento derivado, incluso con vencimiento anterior a emisión.
10. **Indicación para Sala**: crear una ACTIVE con y sin Treatment, revisar contenido completo en Clínica, cerrarla y verificar trazabilidad. Finalizar Treatment no debe cerrarla automáticamente.
11. **Salida de Sala**: con indicación ACTIVE, dar de baja la participación y verificar cierre automático.
12. **Navegación**: recorrer Agenda, Paciente, Atenciones, Treatments, Evolutions, Evaluations, Studies, Obras sociales/Órdenes e Indicaciones sin depender de rutas técnicas.

## Permisos y privacidad

- Administrative puede operar agenda y órdenes, pero recibe 403/no ve Evolution, Evaluation, Study ni indicación clínica completa.
- Professor no puede abrir historia clínica y solo ve condición, zona, instrucciones, actualización y profesional de la proyección Sala.
- Kinesiologist/Osteopath y General Admin acceden conforme a la matriz clínica.
- DTOs de agenda, People y Sala no contienen evolución, conclusión, resultados, estudios ni storage keys.
- Probar acceso a archivo sin sesión y con rol no clínico: debe fallar.
- La URL firmada debe ser temporal; bucket y storage key no deben aparecer en DTOs.

## Estados visuales y responsive

- Revisar desktop, tablet y ancho móvil: tabs desplazables, tablas sin corte irrecuperable, diálogos con foco, labels, errores asociados y texto clínico con wrapping.
- Revisar loading, vacío y error de cada sección.
- Confirmar el mismo sistema visual Athleta, sin tema clínico independiente.

## Registro de resultados

| Paso | Estado (PASS/FAIL) | Observación | Evidencia | Bug |
|---|---|---|---|---|
| Agenda y overlap |  |  |  |  |
| Alta de Paciente |  |  |  |  |
| Appointment → Attention |  |  |  |  |
| Treatments |  |  |  |  |
| Evolution |  |  |  |  |
| Evaluations y snapshots |  |  |  |  |
| Study y archivo privado |  |  |  |  |
| Obra social y Orden |  |  |  |  |
| Indicación Clinic/Sala |  |  |  |  |
| Permisos y privacidad |  |  |  |  |
| Responsive/accesibilidad básica |  |  |  |  |

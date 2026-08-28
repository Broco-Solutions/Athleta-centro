# UI access audit — Phase 3

Auditoría de puntos de entrada visibles para las capacidades implementadas hasta Phase 3.

| Module | Capability | Permission | API | UI exists | Entry point | Role tested | Status | Action |
|---|---|---|---|---|---|---|---|---|
| People | Crear/editar Persona | people manage | `/api/people` | Sí | Personas → Nueva/Editar | General Admin | ACCESSIBLE | Mantener |
| People | Ficha de Persona | people read | `/api/people/:id` | Sí | Personas → Abrir ficha | Todos autorizados | ACCESSIBLE_AND_VERIFIED | E2E navegación real |
| Sala | Planes y horarios | SALA_PLAN_CATALOG_MANAGE / SALA_SCHEDULE_MANAGE | `/api/sala/plans`, `/api/sala/schedule` | Sí | Sala → Configuración | General Admin | ACCESSIBLE_AND_VERIFIED | E2E navegación real |
| Sala | Participación, reservas y asistencia | permisos Sala | `/api/sala/*` | Sí | Sala / ficha Persona | Roles Sala | ACCESSIBLE | Mantener |
| Sala | Rutinas, evaluaciones y pagos | permisos Sala | `/api/sala/*` | Sí | Sala → Persona | Roles Sala | ACCESSIBLE | Mantener |
| Clinic | Agenda y appointments | CLINIC_APPOINTMENT_MANAGE | `/api/clinic/appointments` | Sí | Clínica → Agenda / ficha Persona | Kine, Osteo, Admin | ACCESSIBLE | Mantener |
| Clinic | Atención directa/appointment → atención | CLINIC_APPOINTMENT_MANAGE | `/api/clinic/appointments/:id/attend` | Sí | Clínica → Appointment | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Treatments | CLINICAL_HISTORY_READ/MANAGE | `/api/clinic/treatments` | Sí | Ficha clínica → Treatments | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Evolutions | CLINICAL_HISTORY_READ/MANAGE | `/api/clinic/attentions/:id/evolution` | Sí | Attention → Evolution | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Evaluations y catálogos | CLINICAL_HISTORY_READ / catalog permissions | `/api/clinic/*` | Sí | Attention → Evaluations / Clínica | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Studies y archivos privados | CLINIC_STUDY_MANAGE | `/api/clinic/studies` | Sí | Ficha clínica → Estudios | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Social Work y Orders | CLINIC_ORDER_MANAGE | `/api/clinic/social-works` | Sí | Ficha clínica → Obra social | Roles clínicos/Admin | ACCESSIBLE | Mantener |
| Clinic | Sala Clinical Indications | CLINIC_INDICATION_CONTENT_MANAGE / SALA projection | `/api/clinic/indications` | Sí | Clínica → Indicaciones / Sala | Clínicos/Professor | ACCESSIBLE | Mantener |
| Team | Usuarios, roles y credenciales | team permissions | `/api/team/*` | Sí | Equipo | General Admin | ACCESSIBLE | Mantener |

Health checks, sesiones, idempotencia y helpers internos son **BACKEND_ONLY_BY_DESIGN**. No requieren CTA.

## Verificación

- [x] Clínica conserva el shell/sidebar global.
- [x] Personas ofrece una ficha contextual navegable.
- [x] Sala ofrece Configuración, Planes y Horarios.
- [x] Empty states de configuración incluyen CTA o explicación según permiso.
- [x] Las pruebas E2E de navegación deben recorrer Inicio → Personas → Sala → Clínica conservando sidebar.

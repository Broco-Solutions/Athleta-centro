# UI access audit — Phase 3

Una capacidad se marca `VERIFIED_WORKFLOW` únicamente cuando se verificó entrada, selección válida de entidades, mutación, resultado visible y permisos. Las que todavía tienen una ruta o UI parcial permanecen `PARTIAL_WORKFLOW`.

| Module | Capability | Permission | API | UI exists | Entry point | Mutation verified | Role tested | Status | Action |
|---|---|---|---|---|---|---|---|---|
| People | Crear/editar Persona | people manage | `/api/people` | Sí | Personas → Nueva/Editar | General Admin | ACCESSIBLE | Mantener |
| People | Ficha de Persona | people read | `/api/people/:id` | Sí | Personas → Abrir ficha | Todos autorizados | ACCESSIBLE_AND_VERIFIED | E2E navegación real |
| Sala | Planes y ventanas semanales | SALA_PLAN_CATALOG_MANAGE / SALA_SCHEDULE_MANAGE | `/api/sala/plans`, `/api/sala/schedule` | Sí | Sala → Configuración | YES | General Admin | VERIFIED_WORKFLOW | Navegación y mutación verificadas |
| Sala | Servicios y duración estándar | SALA_SERVICE_DURATION_MANAGE | `/api/sala/service-types` | Sí | Sala → Configuración → Servicios y duraciones | YES | General Admin | VERIFIED_WORKFLOW | DB + API; duración múltiplo de 15 |
| Sala | Reservas multi-slot y sobrecupo | SALA_AGENDA_MANAGE | `/api/sala/reservations`, `/api/sala/availability` | Sí | Sala → Reservas | YES | Administrative | VERIFIED_WORKFLOW | E2E crea 60 min, ocupa 4 slots, confirma y persiste sobrecupo |
| Sala | Participación y asistencia | permisos Sala | `/api/sala/*` | Sí | Sala / ficha Persona | YES | Roles Sala | VERIFIED_WORKFLOW | Integración + E2E ocurrencias |
| Sala | Rutinas, evaluaciones y pagos | permisos Sala | `/api/sala/*` | Sí | Sala → Persona | Roles Sala | ACCESSIBLE | Mantener |
| Clinic | Agenda y appointments | CLINIC_APPOINTMENT_MANAGE | `/api/clinic/appointments` | Sí | Clínica → Agenda / ficha Persona | Kine, Osteo, Admin | ACCESSIBLE | Mantener |
| Clinic | Atención directa/appointment → atención | CLINIC_APPOINTMENT_MANAGE | `/api/clinic/appointments/:id/attend` | Sí | Clínica → Appointment | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Treatments | CLINICAL_HISTORY_READ/MANAGE | `/api/clinic/treatments` | Sí | Ficha clínica → Treatments | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Evolutions | CLINICAL_HISTORY_READ/MANAGE | `/api/clinic/attentions/:id/evolution` | Sí | Attention → Evolution | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Evaluations y catálogos | CLINICAL_HISTORY_READ / catalog permissions | `/api/clinic/*` | Sí | Attention → Evaluations / Clínica | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Studies y archivos privados | CLINIC_STUDY_MANAGE | `/api/clinic/studies` | Sí | Ficha clínica → Estudios | Roles clínicos | ACCESSIBLE | Mantener |
| Clinic | Social Work y Orders | CLINIC_ORDER_MANAGE | `/api/clinic/social-works` | Sí | Ficha clínica → Obra social | Roles clínicos/Admin | ACCESSIBLE | Mantener |
| Clinic | Sala Clinical Indications | CLINIC_INDICATION_CONTENT_MANAGE / SALA projection | `/api/clinic/indications` | Sí | Clínica → Indicaciones / Sala | Clínicos/Professor | ACCESSIBLE | Mantener |
| Clinic | Workspace contextual por paciente | CLINICAL_HISTORY_READ | `/api/clinic/patients`, `/api/clinic/attentions` | Sí | Clínica → `?personId=` → tabs | N/A | VERIFIED_WORKFLOW | Contexto preservado en tabs y deep-link |
| Finance | Medios de pago compartidos | PAYMENT_METHOD_CATALOG_MANAGE | `/api/finance/payment-methods` | Sí | Finanzas → Medios de pago | YES | VERIFIED_WORKFLOW | Crear, editar y retirar; catálogo compartido |
| Finance | Registrar cobro clínico | CLINICAL_INCOME_MANAGE | `/api/finance/clinical-incomes` | Sí | Ficha clínica → Registrar cobro / Finanzas | YES | VERIFIED_WORKFLOW | Formulario contextual con selectores válidos |
| Team | Usuarios, roles y credenciales | team permissions | `/api/team/*` | Sí | Equipo | General Admin | ACCESSIBLE | Mantener |

Health checks, sesiones, idempotencia y helpers internos son **BACKEND_ONLY_BY_DESIGN**. No requieren CTA.

## Verificación

- [x] Clínica conserva el shell/sidebar global.
- [x] Personas ofrece una ficha contextual navegable.
- [x] Sala ofrece Configuración, Planes y Horarios.
- [x] Configuración separa Planes, ventanas, Servicios y duraciones, Capacidad y Excepciones.
- [x] Reserva multi-slot recorre selector de entidad → mutación → cuatro bloques → sobrecupo confirmado → refresh persistente.
- [x] Empty states de configuración incluyen CTA o explicación según permiso.
- [x] Las pruebas E2E de navegación deben recorrer Inicio → Personas → Sala → Clínica conservando sidebar.

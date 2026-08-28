# PERMISSIONS.md — Athleta Manager

## 1. Propósito

Este documento define el modelo de autorización de Athleta Manager.

Su objetivo es traducir los roles funcionales definidos por el producto a capacidades técnicas explícitas y consistentes.

Este documento define:

- roles internos;
- permisos técnicos;
- composición de roles;
- matriz de capacidades;
- reglas contextuales;
- separación entre autorización y reglas de negocio;
- autorización del Portal;
- restricciones especiales de Administrador general y Soporte Broco.

No define:

- autenticación;
- hashing de credenciales;
- sesiones;
- endpoints definitivos;
- implementación concreta de Guards;
- comportamiento funcional no definido.

La seguridad técnica general se encuentra en:

```text
docs/architecture/SECURITY.md
```

---

# 2. Principio general

Athleta utiliza:

```text
RBAC
Role-Based Access Control
```

con roles funcionales cerrados.

Modelo conceptual:

```text
InternalUser
     │
     ├── Role A
     ├── Role B
     │
     ▼
Effective Permissions
```

Los permisos efectivos son la unión de las capacidades otorgadas por todos los roles de la cuenta.

---

# 3. Roles internos

Los roles funcionales son:

```text
PROFESSOR
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
BROCO_SUPPORT
```

No existen:

- roles personalizados;
- permisos individuales por usuario;
- perfiles creados por el cliente;
- combinaciones materializadas como nuevos roles.

---

# 4. Roles combinados

Los roles son combinables.

Ejemplo:

```text
PROFESSOR
+
KINESIOLOGIST
```

produce:

```text
permissions(PROFESSOR)
∪
permissions(KINESIOLOGIST)
```

No se creará:

```text
PROFESSOR_KINESIOLOGIST
```

como rol independiente.

---

# 5. Roles y permissions no son editables por Athleta

La relación:

```text
Role
→ Permission[]
```

se define en código.

No existirá inicialmente una interfaz para que un Administrador configure:

```text
PROFESSOR can...
ADMINISTRATIVE can...
```

Los permisos forman parte de la definición funcional del producto.

---

# 6. Permission

Un `Permission` representa una capacidad funcional suficientemente estable.

Ejemplos:

```text
PEOPLE_READ
SALA_ROUTINE_MANAGE
CLINIC_APPOINTMENT_MANAGE
CLINICAL_HISTORY_READ
FINANCE_EXECUTIVE_READ
```

No debe representar un endpoint específico.

Evitar:

```text
GET_PERSON_200
POST_PERSON_201
```

Tampoco debe ser excesivamente amplio.

Evitar:

```text
CLINIC_ACCESS
```

porque permitiría mezclar operación administrativa con Historia Clínica.

---

# 7. Convención

Los permisos utilizarán:

```text
UPPER_SNAKE_CASE
```

y preferentemente la estructura:

```text
DOMAIN_RESOURCE_ACTION
```

Ejemplos:

```text
SALA_PAYMENT_MANAGE
CLINIC_APPOINTMENT_MANAGE
TEAM_STANDARD_USER_MANAGE
```

---

# 8. People Permissions

```text
PEOPLE_READ
PEOPLE_CREATE
PEOPLE_UPDATE_GENERAL
PEOPLE_DELETE_EMPTY
PEOPLE_GLOBAL_INACTIVATE
PORTAL_PIN_RESET
```

---

# 9. PEOPLE_READ

Permite:

- buscar Personas;
- consultar existencia;
- consultar datos generales autorizados;
- abrir la ficha general dentro de los límites del rol.

Se otorga a todos los usuarios internos activos.

No otorga:

```text
CLINICAL_HISTORY_READ
```

---

# 10. PEOPLE_CREATE

Permite crear una nueva Persona desde los contextos funcionalmente habilitados.

Roles estándar habilitados:

```text
PROFESSOR
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

La creación puede requerir información adicional según el contexto.

Ejemplo:

```text
alta desde Sala
→ Professor + Plan
```

---

# 11. PEOPLE_UPDATE_GENERAL

Permite corregir datos generales de una Persona.

No permite modificar mediante este permiso:

- Historia Clínica;
- participación de Sala;
- Tratamientos;
- pagos;
- credenciales de Portal.

---

# 12. PEOPLE_DELETE_EMPTY

Permite ejecutar la operación funcional de eliminación definitiva de una Persona creada por error.

El permiso por sí solo no es suficiente.

Debe verificarse que la Persona no posea historia relevante.

Conceptualmente:

```text
permission
+
isPersonDeletable(person)
=
delete allowed
```

---

# 13. PEOPLE_GLOBAL_INACTIVATE

Permite ejecutar:

```text
InactivatePerson
```

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

No debe representarse como permiso genérico para editar `Person.status`.

---

# 14. PORTAL_PIN_RESET

Permite restablecer el PIN del Portal de una Persona.

Se otorga a todos los usuarios internos estándar.

La operación:

- genera PIN temporal;
- lo muestra una sola vez;
- exige cambio posterior;
- invalida las sesiones correspondientes según SECURITY.md.

---

# 15. Sala Permissions

Permisos principales:

```text
SALA_RELATION_READ
SALA_PARTICIPATION_MANAGE
SALA_SCHEDULE_MANAGE
SALA_AGENDA_MANAGE

SALA_ROUTINE_READ
SALA_ROUTINE_MANAGE

SALA_PHYSICAL_EVALUATION_READ
SALA_PHYSICAL_EVALUATION_MANAGE

SALA_PAYMENT_READ
SALA_PAYMENT_MANAGE

SALA_CLINICAL_INDICATION_READ
SALA_CLINICAL_INDICATION_CLOSE

SALA_PLAN_CATALOG_MANAGE
SALA_EXERCISE_CATALOG_MANAGE
SALA_PHYSICAL_TEST_CATALOG_MANAGE
```

---

# 16. SALA_RELATION_READ

Permite saber si una Persona participa actualmente de Sala y consultar la referencia mínima necesaria.

No implica acceso operativo completo a Sala.

Los profesionales clínicos pueden conocer:

```text
participates in Sala
```

sin acceder necesariamente a:

- agenda;
- rutinas;
- pagos;
- evaluaciones físicas.

---

# 17. SALA_PARTICIPATION_MANAGE

Permite:

- incorporar Persona a Sala;
- dar de baja de Sala;
- cambiar Profesor principal;
- cambiar Plan;
- realizar reasignaciones aplicables.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

Las operaciones continúan sujetas a reglas de dominio.

---

# 18. SALA_SCHEDULE_MANAGE

Permite administrar:

- grilla habitual;
- capacidad general;
- capacidad por horario;
- cambios permanentes;
- excepciones por fecha.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 18.1. SALA_SERVICE_DURATION_MANAGE

Permite administrar los tipos de servicio de Sala y su duración estándar en
múltiplos de 15 minutos.

Roles:

```text
GENERAL_ADMIN
```

La lectura de servicios seleccionables continúa disponible para los actores que
operan agenda mediante `SALA_RELATION_READ`.

---

# 19. SALA_AGENDA_MANAGE

Permite operar:

- Turnos fijos;
- reservas puntuales;
- ocurrencias;
- asistencias;
- incorporaciones espontáneas;
- correcciones de asistencia.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

Las transiciones exactas continúan regidas por:

```text
STATE_TRANSITIONS.md
```

---

# 20. SALA_ROUTINE_READ

Permite consultar Rutinas.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

Un Administrativo posee acceso de consulta, no de diseño.

---

# 21. SALA_ROUTINE_MANAGE

Permite:

- crear;
- modificar;
- reemplazar;
- duplicar Rutinas.

Roles:

```text
PROFESSOR
GENERAL_ADMIN
```

Un Administrativo no obtiene este permiso salvo que además posea `PROFESSOR`.

---

# 22. SALA_PHYSICAL_EVALUATION_READ

Permite consultar Evaluaciones físicas de Sala.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 23. SALA_PHYSICAL_EVALUATION_MANAGE

Permite:

- crear;
- corregir;

Evaluaciones físicas.

Roles:

```text
PROFESSOR
GENERAL_ADMIN
```

---

# 24. SALA_PAYMENT_READ

Permite consultar pagos de Sala dentro del contexto operativo.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 25. SALA_PAYMENT_MANAGE

Permite:

- registrar;
- corregir;
- eliminar;

Pagos de Sala.

Roles:

```text
PROFESSOR
ADMINISTRATIVE
GENERAL_ADMIN
```

Las reglas de importe, Mes/Año y ajuste continúan siendo reglas de dominio.

---

# 26. SALA_CLINICAL_INDICATION_READ

Permite acceder exclusivamente a la representación clínica segura destinada a entrenamiento.

Puede incluir:

```text
trainingCondition
affectedArea
instructions
lastUpdate
professional
```

No incluye Historia Clínica completa.

`PROFESSOR` recibe este permiso.

Los profesionales clínicos acceden al contenido correspondiente mediante sus permisos clínicos.

`GENERAL_ADMIN` posee ambas capacidades.

---

# 27. SALA_CLINICAL_INDICATION_CLOSE

Permite ejecutar:

```text
CloseSalaClinicalIndication
```

Se otorga a todos los usuarios internos.

No concede derecho a modificar el contenido clínico de la Indicación.

---

# 28. Catálogo de Planes

```text
SALA_PLAN_CATALOG_MANAGE
```

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

`PROFESSOR` puede asignar/cambiar Plan mediante:

```text
SALA_PARTICIPATION_MANAGE
```

pero no administra el catálogo.

---

# 29. Catálogo de Ejercicios

```text
SALA_EXERCISE_CATALOG_MANAGE
```

Roles:

```text
PROFESSOR
GENERAL_ADMIN
```

---

# 30. Catálogo de Tests físicos

```text
SALA_PHYSICAL_TEST_CATALOG_MANAGE
```

Roles:

```text
PROFESSOR
GENERAL_ADMIN
```

---

# 31. Clinic Permissions

Se separan deliberadamente:

```text
operación administrativa
```

de:

```text
contenido clínico
```

Permisos:

```text
CLINIC_OPERATIONAL_READ

CLINIC_APPOINTMENT_MANAGE
CLINIC_ATTENTION_REGISTER
CLINIC_ATTENTION_DELETE_EMPTY

CLINICAL_HISTORY_READ
CLINICAL_HISTORY_WRITE

CLINIC_EVOLUTION_MANAGE
CLINIC_TREATMENT_MANAGE
CLINIC_EVALUATION_MANAGE
CLINIC_STUDY_MANAGE

CLINIC_INDICATION_CONTENT_MANAGE

CLINIC_ORDER_MANAGE
CLINIC_INCOME_MANAGE

CLINIC_PROTOCOL_CATALOG_MANAGE
CLINIC_TEST_CATALOG_MANAGE
CLINIC_LIBRARY_MANAGE
CLINIC_MEASUREMENT_METHOD_MANAGE
```

---

# 32. CLINIC_OPERATIONAL_READ

Permite acceder a información necesaria para operar Clínica sin ingresar al contenido completo de Historia Clínica.

Ejemplos:

- existencia de Turnos;
- fecha/hora;
- Paciente;
- profesional;
- estado;
- existencia de Atención;
- referencias administrativas de Órdenes e Ingresos.

No permite leer:

- antecedentes;
- Evoluciones;
- Evaluaciones clínicas;
- estudios detallados;
- razonamiento terapéutico;
- análisis IA.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 33. CLINIC_APPOINTMENT_MANAGE

Permite:

- crear;
- reprogramar;
- cancelar;
- cambiar estados según reglas;
- gestionar agenda clínica.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 34. CLINIC_ATTENTION_REGISTER

Permite registrar que una consulta ocurrió.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

En el caso de `ADMINISTRATIVE`, no implica permiso para completar contenido clínico.

---

# 35. CLINIC_ATTENTION_DELETE_EMPTY

Permite eliminar una Atención cargada por error únicamente cuando no posee dependencias.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

El Application Service debe validar:

```text
attention.isEmptyAndDeletable()
```

---

# 36. CLINICAL_HISTORY_READ

Permite acceder a Historia Clínica completa.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

No se otorga a:

```text
PROFESSOR
ADMINISTRATIVE
```

por esos roles individualmente.

---

# 37. CLINICAL_HISTORY_WRITE

Permite modificar información clínica dentro de los límites funcionales.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

No implica bypass de reglas de dominio.

---

# 38. Antecedentes clínicos

La consulta/modificación de:

```text
allergies
currentMedication
relevantHistory
```

requiere permisos de Historia Clínica.

El Administrativo no accede a esta información.

---

# 39. CLINIC_EVOLUTION_MANAGE

Permite:

- crear Evolución;
- corregir Evolución.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

No concede capacidad de eliminación física habitual.

---

# 40. CLINIC_TREATMENT_MANAGE

Permite:

- crear;
- modificar;
- finalizar;
- reabrir;
- cambiar responsable;

Tratamientos.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

Si `GENERAL_ADMIN` no posee rol clínico, determinadas operaciones pueden exigir seleccionar explícitamente un profesional responsable.

---

# 41. CLINIC_EVALUATION_MANAGE

Permite:

- crear Evaluaciones clínicas;
- corregir Evaluaciones;
- registrar resultados estructurados.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

---

# 42. CLINIC_STUDY_MANAGE

Permite:

- registrar Estudios;
- cargar archivos;
- modificar información permitida;
- eliminar archivos cargados por error según reglas.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

---

# 43. CLINIC_INDICATION_CONTENT_MANAGE

Permite:

- crear Indicación para Sala;
- modificar contenido clínico;
- definir condición;
- definir zona;
- definir instrucciones;
- asociar a Treatment cuando corresponda.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

Se mantiene separado de:

```text
SALA_CLINICAL_INDICATION_CLOSE
```

---

# 44. CLINIC_ORDER_MANAGE

Permite:

- crear;
- modificar;
- eliminar cuando legalmente corresponda;

Órdenes de obra social.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 45. CLINIC_INCOME_MANAGE

Permite:

- registrar;
- consultar dentro del contexto clínico correspondiente;
- corregir;
- eliminar;

Ingresos clínicos.

Roles:

```text
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 46. Protocolos clínicos

```text
CLINIC_PROTOCOL_CATALOG_MANAGE
```

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

---

# 47. Tests clínicos

```text
CLINIC_TEST_CATALOG_MANAGE
```

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

---

# 48. Biblioteca Clínica

```text
CLINIC_LIBRARY_MANAGE
```

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

La arquitectura técnica del análisis IA se encuentra fuera del alcance actual.

---

# 49. Dispositivos / Métodos

```text
CLINIC_MEASUREMENT_METHOD_MANAGE
```

Roles:

```text
KINESIOLOGIST
OSTEOPATH
GENERAL_ADMIN
```

---

# 50. IA

Los permisos técnicos específicos del módulo de Inteligencia Artificial se definirán cuando ese módulo sea diseñado.

No se implementarán todavía permissions, endpoints o Guards de IA únicamente por anticipación.

La definición funcional existente deberá respetarse posteriormente.

---

# 51. Finance Permissions

```text
EXPENSE_CREATE
EXPENSE_HISTORY_READ
EXPENSE_MANAGE

FINANCE_OPERATIONAL_READ
FINANCE_EXECUTIVE_READ
FINANCE_EXPORT

PAYMENT_METHOD_CATALOG_MANAGE
EXPENSE_CATEGORY_CATALOG_MANAGE
EXCHANGE_RATE_MANAGE
```

---

# 52. EXPENSE_CREATE

Permite registrar un Gasto.

Se otorga a todos los usuarios internos.

No otorga acceso al historial general de Gastos.

---

# 53. EXPENSE_HISTORY_READ

Permite consultar el historial general de Gastos.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 54. EXPENSE_MANAGE

Permite:

- corregir;
- eliminar;

Gastos.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 55. FINANCE_OPERATIONAL_READ

Permite consultar:

- Ingresos unificados;
- Gastos;
- filtros;
- historiales;
- totales operativos.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

No implica acceso a la visión ejecutiva completa.

---

# 56. FINANCE_EXECUTIVE_READ

Permite consultar:

```text
totalIncome
totalExpenses
net
executive financial dashboard
USD reference
```

Roles:

```text
GENERAL_ADMIN
```

No se otorga a `ADMINISTRATIVE`.

---

# 57. FINANCE_EXPORT

Permite exportar los listados financieros habilitados.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

La exportación continúa respetando filtros y visibilidad.

---

# 58. PAYMENT_METHOD_CATALOG_MANAGE

Permite administrar Medios de pago.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 59. EXPENSE_CATEGORY_CATALOG_MANAGE

Permite administrar Categorías de gasto.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 60. EXCHANGE_RATE_MANAGE

Permite administrar la cotización USD mensual.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

El permiso para administrarla no implica que el Administrativo pueda visualizar el dashboard ejecutivo en USD.

---

# 61. Otros catálogos/configuraciones

## Obras sociales

```text
SOCIAL_WORK_CATALOG_MANAGE
```

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

## Contacto general del Portal

```text
PORTAL_CONTACT_CONFIG_MANAGE
```

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 62. Team Permissions

```text
TEAM_READ
TEAM_STANDARD_USER_MANAGE
TEAM_GENERAL_ADMIN_MANAGE

TEAM_STANDARD_CREDENTIAL_RESET
TEAM_GENERAL_ADMIN_CREDENTIAL_RESET
```

---

# 63. TEAM_READ

La visibilidad del listado de Equipo corresponde a roles autorizados para operar esta área.

Roles principales:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

Las cuentas Broco pueden figurar identificadas sin ser administrables por ellos.

---

# 64. TEAM_STANDARD_USER_MANAGE

Permite gestionar cuentas estándar:

```text
PROFESSOR
KINESIOLOGIST
OSTEOPATH
ADMINISTRATIVE
```

Operaciones:

- crear;
- editar ficha;
- activar;
- inactivar;
- asignar/quitar roles estándar.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

No permite:

```text
assign GENERAL_ADMIN
manage GENERAL_ADMIN account
manage BROCO_SUPPORT
```

---

# 65. TEAM_GENERAL_ADMIN_MANAGE

Permite gestionar usuarios que poseen:

```text
GENERAL_ADMIN
```

y asignar/quitar ese rol.

Rol habilitado:

```text
GENERAL_ADMIN
```

No otorga capacidad sobre:

```text
BROCO_SUPPORT
```

---

# 66. TEAM_STANDARD_CREDENTIAL_RESET

Permite restablecer contraseña de usuarios estándar según las restricciones funcionales.

Roles:

```text
ADMINISTRATIVE
GENERAL_ADMIN
```

---

# 67. TEAM_GENERAL_ADMIN_CREDENTIAL_RESET

Permite restablecer contraseña de otro Administrador general.

Rol:

```text
GENERAL_ADMIN
```

Soporte Broco podrá intervenir excepcionalmente mediante sus mecanismos propios.

---

# 68. Cambiar contraseña propia

Cambiar la propia contraseña no es un Role Permission.

Es una capacidad de:

```text
authenticated InternalUser
```

sobre su propia cuenta.

Debe verificar la autenticación requerida.

---

# 69. AddRole / RemoveRole

Los roles no deben actualizarse mediante un reemplazo indiscriminado del array.

Evitar:

```text
updateUser({
  roles: request.roles
})
```

La implementación utilizará operaciones explícitas:

```text
AddRole
RemoveRole
```

porque estas operaciones poseen:

- autorización propia;
- restricciones de privilegio;
- precondiciones funcionales.

---

# 70. Remover PROFESSOR

Aunque el actor tenga permiso para quitar el rol:

```text
RemoveRole(PROFESSOR)
```

queda bloqueado si el usuario continúa como Profesor principal de Alumnos activos.

Primero deben resolverse las asignaciones.

---

# 71. Remover último rol clínico

Quitar el último rol entre:

```text
KINESIOLOGIST
OSTEOPATH
```

queda bloqueado mientras el usuario posea:

- Tratamientos En curso;
- Turnos clínicos futuros Agendados asignados.

Si conserva otro rol clínico, esta restricción no bloquea.

---

# 72. Permission no reemplaza Business Rule

Regla fundamental:

```text
hasPermission
≠
operationIsValid
```

Una operación requiere:

```text
Authentication
+
Permission
+
Domain Preconditions
```

---

# 73. Ejemplo: inactivar Profesor

```text
actor has TEAM_STANDARD_USER_MANAGE
```

pero:

```text
target professor has assigned students
```

resultado:

```text
operation blocked
```

El problema no es de permisos.

Es una precondición del dominio.

---

# 74. Ejemplo: General Admin crea Treatment

`GENERAL_ADMIN` posee:

```text
CLINIC_TREATMENT_MANAGE
```

pero si no posee rol clínico:

```text
responsibleProfessionalId
```

debe ser seleccionado explícitamente.

El Administrador general no hace bypass de esa regla.

---

# 75. GENERAL_ADMIN

`GENERAL_ADMIN` obtiene todas las capabilities funcionales normales de Athleta.

No se implementará:

```text
if generalAdmin:
    skipAllChecks()
```

El rol sigue sujeto a:

- integridad;
- precondiciones;
- autoría;
- responsabilidad profesional;
- reglas históricas.

---

# 76. GENERAL_ADMIN y BROCO_SUPPORT

Un Administrador general:

```text
cannot
```

- crear Soporte Broco;
- asignar rol Soporte Broco;
- quitar rol Soporte Broco;
- restablecer sus credenciales;
- inactivar sus cuentas.

El dominio de Athleta reconoce esas cuentas pero no las administra.

---

# 77. BROCO_SUPPORT

`BROCO_SUPPORT` es un rol excepcional.

No forma parte de la operación diaria.

Sus características:

- administrado exclusivamente por Broco Solutions;
- puede requerir acceso amplio durante soporte;
- sus acciones sensibles deben quedar auditadas;
- no puede ser asignado mediante funciones normales de Equipo.

---

# 78. Permission set de BROCO_SUPPORT

El permission set concreto de `BROCO_SUPPORT` se define exclusivamente en la configuración/código administrado por Broco.

No será editable desde Athleta.

Debe mantenerse explícito y auditable.

No debe implementarse mediante:

```text
return true
```

global ante cualquier autorización.

Las capacidades deben seguir siendo deliberadas.

---

# 79. Ownership

Athleta no utiliza ownership como barrera de seguridad general.

Ejemplo:

```text
Student.mainProfessorId
```

sirve para:

- organización;
- filtros;
- seguimiento.

No significa:

```text
only mainProfessor can access Student
```

---

# 80. Ownership clínico

Lo mismo aplica a:

```text
Treatment.responsibleProfessionalId
```

El responsable organiza el seguimiento.

No impide que otros:

```text
KINESIOLOGIST
OSTEOPATH
```

autorizados consulten o trabajen sobre el Paciente.

---

# 81. Prohibición de ownership genérico

No se debe introducir una regla reusable como:

```text
resource.ownerId === currentUser.id
```

para autorizar recursos Athleta salvo que exista una regla funcional explícita.

---

# 82. Autorización en backend

El backend es la autoridad.

Conceptualmente:

```text
HTTP Request
    │
    ▼
Authentication
    │
    ▼
Permission Guard
    │
    ▼
Application Service
    │
    ▼
Domain Preconditions
```

---

# 83. Guards

Los Guards verifican principalmente:

```text
isAuthenticated
hasPermission
```

No deben convertirse en contenedores de toda la lógica del dominio.

---

# 84. Application Services

Reglas como:

```text
professor has assigned students
attention has dependencies
treatment responsible professional is valid
person is deletable
```

pertenecen a:

```text
Application / Domain
```

no a los Guards.

---

# 85. Declaración de permisos en endpoints

Patrón conceptual:

```text
@RequirePermission(CLINIC_APPOINTMENT_MANAGE)
```

Ejemplo:

```text
POST /clinic/appointments/:id/attend
```

Luego:

```text
MarkAppointmentAttendedUseCase
```

aplica las reglas funcionales.

---

# 86. Respuesta de sesión

El backend podrá exponer al frontend los permisos efectivos de la sesión.

Ejemplo:

```json
{
  "user": {
    "id": "..."
  },
  "roles": [
    "PROFESSOR",
    "KINESIOLOGIST"
  ],
  "permissions": [
    "PEOPLE_READ",
    "SALA_ROUTINE_MANAGE",
    "CLINICAL_HISTORY_READ"
  ]
}
```

---

# 87. Frontend

El frontend utiliza los permissions para:

- construir navegación;
- ocultar secciones;
- mostrar acciones;
- evitar interfaces llenas de controles deshabilitados.

Esto responde a UX.

No reemplaza autorización backend.

---

# 88. Navegación

Ejemplo:

Un `ADMINISTRATIVE` puede visualizar:

```text
Inicio
Sala
Clínica operativa
Finanzas operativas
Equipo
Configuración aplicable
```

pero no debería visualizar como opción normal:

```text
Historia Clínica completa
```

---

# 89. Acceso manual por URL

Ocultar la navegación no alcanza.

Si un Administrativo intenta acceder manualmente a una ruta que requiere:

```text
CLINICAL_HISTORY_READ
```

el acceso debe ser rechazado.

La API debe responder:

```text
403 Forbidden
```

cuando corresponda.

---

# 90. 401

Usar:

```text
401 Unauthorized
```

cuando no existe una sesión válida/autenticación válida.

---

# 91. 403

Usar:

```text
403 Forbidden
```

cuando:

```text
authenticated
but
missing required permission
```

salvo que revelar la existencia del recurso constituya un problema de privacidad específico.

---

# 92. 404

Usar:

```text
404 Not Found
```

cuando el recurso realmente no existe o cuando una política de seguridad específica decida ocultar su existencia.

No utilizar `404` indiscriminadamente para todas las denegaciones.

---

# 93. Portal

El Portal utiliza un contexto de autorización separado.

No utiliza:

```text
InternalUser
Role
Permission[]
```

---

# 94. Principal del Portal

El principal autenticado es:

```text
Person
```

validado mediante:

```text
DNI
+
PIN
```

y sesión de Portal.

---

# 95. Regla general del Portal

Para acceder:

```text
authenticated Person
+
Person ACTIVE
```

Además, cada operación valida la relación funcional necesaria.

---

# 96. Ownership en Portal

A diferencia del sistema interno, el Portal sí trabaja estrictamente sobre recursos propios.

Ejemplo:

```text
reservation.personId
==
authenticatedPerson.id
```

es obligatorio.

Una Persona nunca consulta/modifica recursos de otra Persona desde Portal.

---

# 97. Sala en Portal

Para operaciones de Sala puede requerirse:

```text
Person ACTIVE
+
active SalaParticipation
+
resource belongs to Person
+
temporal/business rules satisfied
```

Ejemplo:

```text
CancelOwnSalaOccurrence
```

---

# 98. Clínica en Portal

La Persona puede consultar sus propios Turnos clínicos futuros dentro del alcance definido.

Puede cancelar su propio Turno mientras la regla temporal lo permita.

No puede:

- crear Turnos clínicos;
- reprogramarlos;
- elegir profesional;
- acceder a Historia Clínica;
- acceder a Evaluaciones clínicas;
- acceder a Treatments;
- consultar ClinicalIncome.

---

# 99. Datos personales en Portal

`Mis datos` es:

```text
READ ONLY
```

La Persona no obtiene un permiso general para modificar su `Person`.

Las correcciones se realizan mediante el equipo interno.

---

# 100. PIN propio en Portal

Cambiar el propio PIN es una acción de autoservicio autenticada.

No requiere un Role Permission interno.

---

# 101. Expense Create — excepción deliberada

Todos los usuarios internos pueden registrar Gastos.

Esto no implica:

```text
EXPENSE_HISTORY_READ
```

Ejemplo:

```text
PROFESSOR
→ EXPENSE_CREATE
→ no EXPENSE_HISTORY_READ
```

Esta separación debe mantenerse tanto en backend como en UI.

---

# 102. Información Clínica vs operación administrativa

Uno de los límites más importantes del sistema es:

```text
CLINIC_OPERATIONAL_READ
≠
CLINICAL_HISTORY_READ
```

El primero puede permitir trabajar con:

- Turnos;
- estado de Atención;
- profesional;
- Órdenes;
- Ingresos.

El segundo permite entrar deliberadamente al contenido clínico.

---

# 103. DTOs basados en permisos

No basta con bloquear una pantalla.

Los endpoints deben devolver diferentes estructuras cuando los contextos poseen distinta sensibilidad.

Ejemplo:

```text
ClinicalAgendaItem
```

no debe contener accidentalmente:

```text
Evolution
diagnosis
clinical history
```

aunque el modelo Prisma permita incluirlos fácilmente.

---

# 104. Matriz resumida — Personas y Sala

| Capability | Professor | Kine/Osteo | Administrative | General Admin |
|---|:---:|:---:|:---:|:---:|
| Buscar Persona / datos generales | ✓ | ✓ | ✓ | ✓ |
| Crear Persona | ✓ | ✓ | ✓ | ✓ |
| Corregir datos generales | ✓ | ✓ | ✓ | ✓ |
| Eliminar Persona sin historia | ✓ | ✓ | ✓ | ✓ |
| Inactivación global | — | — | ✓ | ✓ |
| Reset PIN Portal | ✓ | ✓ | ✓ | ✓ |
| Conocer participación Sala | ✓ | ✓ | ✓ | ✓ |
| Gestionar participación Sala | ✓ | — | ✓ | ✓ |
| Gestionar agenda Sala | ✓ | — | ✓ | ✓ |
| Configurar horarios Sala | ✓ | — | ✓ | ✓ |
| Consultar Rutinas | ✓ | — | ✓ | ✓ |
| Diseñar/modificar Rutinas | ✓ | — | — | ✓ |
| Consultar Evaluaciones físicas | ✓ | — | ✓ | ✓ |
| Gestionar Evaluaciones físicas | ✓ | — | — | ✓ |
| Consultar pagos Sala | ✓ | — | ✓ | ✓ |
| Gestionar pagos Sala | ✓ | — | ✓ | ✓ |
| Ver indicación segura para Sala | ✓ | Acceso clínico | Según contexto | ✓ |
| Cerrar Indicación | ✓ | ✓ | ✓ | ✓ |

---

# 105. Matriz resumida — Clínica

| Capability | Professor | Kine/Osteo | Administrative | General Admin |
|---|:---:|:---:|:---:|:---:|
| Operación clínica básica | — | ✓ | ✓ | ✓ |
| Gestionar Turnos clínicos | — | ✓ | ✓ | ✓ |
| Registrar Atención | — | ✓ | ✓ | ✓ |
| Eliminar Atención vacía | — | ✓ | ✓ | ✓ |
| Historia Clínica completa | — | ✓ | — | ✓ |
| Antecedentes clínicos | — | ✓ | — | ✓ |
| Evoluciones | — | ✓ | — | ✓ |
| Tratamientos | — | ✓ | — | ✓ |
| Evaluaciones clínicas | — | ✓ | — | ✓ |
| Estudios/archivos clínicos | — | ✓ | — | ✓ |
| Crear/modificar Indicación Sala | — | ✓ | — | ✓ |
| Gestionar Órdenes obra social | — | ✓ | ✓ | ✓ |
| Gestionar Ingreso clínico | — | ✓ | ✓ | ✓ |
| Protocolos clínicos | — | ✓ | — | ✓ |
| Tests clínicos | — | ✓ | — | ✓ |
| Biblioteca Clínica | — | ✓ | — | ✓ |
| Dispositivos/Métodos | — | ✓ | — | ✓ |

---

# 106. Matriz resumida — Finanzas y Equipo

| Capability | Professor | Kine/Osteo | Administrative | General Admin |
|---|:---:|:---:|:---:|:---:|
| Registrar Gasto | ✓ | ✓ | ✓ | ✓ |
| Historial general Gastos | — | — | ✓ | ✓ |
| Corregir/eliminar Gastos | — | — | ✓ | ✓ |
| Finanzas operativas | — | — | ✓ | ✓ |
| Dashboard ejecutivo / Neto | — | — | — | ✓ |
| Exportar Finanzas | — | — | ✓ | ✓ |
| Administrar Medio de pago | — | — | ✓ | ✓ |
| Administrar Categorías gasto | — | — | ✓ | ✓ |
| Administrar Cotización USD | — | — | ✓ | ✓ |
| Administrar Obras sociales | — | — | ✓ | ✓ |
| Gestionar usuarios estándar | — | — | ✓ | ✓ |
| Gestionar General Admin | — | — | — | ✓ |
| Gestionar Soporte Broco | — | — | — | — |

---

# 107. Matriz de catálogos principales

| Catálogo | Professor | Kine/Osteo | Administrative | General Admin |
|---|:---:|:---:|:---:|:---:|
| Planes Sala | — | — | ✓ | ✓ |
| Ejercicios | ✓ | — | — | ✓ |
| Tests físicos | ✓ | — | — | ✓ |
| Protocolos clínicos | — | ✓ | — | ✓ |
| Tests clínicos | — | ✓ | — | ✓ |
| Biblioteca Clínica | — | ✓ | — | ✓ |
| Dispositivos/Métodos | — | ✓ | — | ✓ |
| Obras sociales | — | — | ✓ | ✓ |
| Medios de pago | — | — | ✓ | ✓ |
| Categorías de gasto | — | — | ✓ | ✓ |
| Cotización USD | — | — | ✓ | ✓ |
| Contacto Portal | — | — | ✓ | ✓ |

---

# 108. Permission map conceptual

Ejemplo de implementación:

```text
PROFESSOR
├── PEOPLE_READ
├── PEOPLE_CREATE
├── PEOPLE_UPDATE_GENERAL
├── PEOPLE_DELETE_EMPTY
├── PORTAL_PIN_RESET
├── SALA_RELATION_READ
├── SALA_PARTICIPATION_MANAGE
├── SALA_SCHEDULE_MANAGE
├── SALA_AGENDA_MANAGE
├── SALA_ROUTINE_READ
├── SALA_ROUTINE_MANAGE
├── SALA_PHYSICAL_EVALUATION_READ
├── SALA_PHYSICAL_EVALUATION_MANAGE
├── SALA_PAYMENT_READ
├── SALA_PAYMENT_MANAGE
├── SALA_CLINICAL_INDICATION_READ
├── SALA_CLINICAL_INDICATION_CLOSE
├── SALA_EXERCISE_CATALOG_MANAGE
├── SALA_PHYSICAL_TEST_CATALOG_MANAGE
└── EXPENSE_CREATE
```

---

# 109. KINESIOLOGIST / OSTEOPATH permission map

Ambos roles tienen las mismas capacidades generales.

```text
KINESIOLOGIST / OSTEOPATH
├── PEOPLE_READ
├── PEOPLE_CREATE
├── PEOPLE_UPDATE_GENERAL
├── PEOPLE_DELETE_EMPTY
├── PORTAL_PIN_RESET
├── SALA_RELATION_READ
├── SALA_CLINICAL_INDICATION_CLOSE
├── CLINIC_OPERATIONAL_READ
├── CLINIC_APPOINTMENT_MANAGE
├── CLINIC_ATTENTION_REGISTER
├── CLINIC_ATTENTION_DELETE_EMPTY
├── CLINICAL_HISTORY_READ
├── CLINICAL_HISTORY_WRITE
├── CLINIC_EVOLUTION_MANAGE
├── CLINIC_TREATMENT_MANAGE
├── CLINIC_EVALUATION_MANAGE
├── CLINIC_STUDY_MANAGE
├── CLINIC_INDICATION_CONTENT_MANAGE
├── CLINIC_ORDER_MANAGE
├── CLINIC_INCOME_MANAGE
├── CLINIC_PROTOCOL_CATALOG_MANAGE
├── CLINIC_TEST_CATALOG_MANAGE
├── CLINIC_LIBRARY_MANAGE
├── CLINIC_MEASUREMENT_METHOD_MANAGE
└── EXPENSE_CREATE
```

---

# 110. ADMINISTRATIVE permission map

```text
ADMINISTRATIVE
├── PEOPLE_READ
├── PEOPLE_CREATE
├── PEOPLE_UPDATE_GENERAL
├── PEOPLE_DELETE_EMPTY
├── PEOPLE_GLOBAL_INACTIVATE
├── PORTAL_PIN_RESET
├── SALA_RELATION_READ
├── SALA_PARTICIPATION_MANAGE
├── SALA_SCHEDULE_MANAGE
├── SALA_AGENDA_MANAGE
├── SALA_ROUTINE_READ
├── SALA_PHYSICAL_EVALUATION_READ
├── SALA_PAYMENT_READ
├── SALA_PAYMENT_MANAGE
├── SALA_CLINICAL_INDICATION_CLOSE
├── SALA_PLAN_CATALOG_MANAGE
├── CLINIC_OPERATIONAL_READ
├── CLINIC_APPOINTMENT_MANAGE
├── CLINIC_ATTENTION_REGISTER
├── CLINIC_ATTENTION_DELETE_EMPTY
├── CLINIC_ORDER_MANAGE
├── CLINIC_INCOME_MANAGE
├── EXPENSE_CREATE
├── EXPENSE_HISTORY_READ
├── EXPENSE_MANAGE
├── FINANCE_OPERATIONAL_READ
├── FINANCE_EXPORT
├── PAYMENT_METHOD_CATALOG_MANAGE
├── EXPENSE_CATEGORY_CATALOG_MANAGE
├── EXCHANGE_RATE_MANAGE
├── SOCIAL_WORK_CATALOG_MANAGE
├── PORTAL_CONTACT_CONFIG_MANAGE
├── TEAM_READ
├── TEAM_STANDARD_USER_MANAGE
└── TEAM_STANDARD_CREDENTIAL_RESET
```

---

# 111. GENERAL_ADMIN permission map

`GENERAL_ADMIN` recibe todas las capacidades funcionales normales necesarias para operar Athleta.

Incluye:

```text
People
Sala
Clinic
Finance
Team
Catalogs
Configuration
```

incluyendo:

```text
FINANCE_EXECUTIVE_READ
TEAM_GENERAL_ADMIN_MANAGE
TEAM_GENERAL_ADMIN_CREDENTIAL_RESET
```

No incluye capacidad para administrar:

```text
BROCO_SUPPORT
```

---

# 112. Soporte Broco fuera de matrices operativas normales

`BROCO_SUPPORT` no se incluye en las matrices normales porque su uso es excepcional y administrado exclusivamente por Broco Solutions.

Su permission set deberá estar:

- definido explícitamente;
- documentado en código;
- restringido;
- auditado.

No debe derivarse de `GENERAL_ADMIN`.

---

# 113. Permisos efectivos

La función conceptual será:

```text
effectivePermissions(user)
=
UNION(
  permissionsForRole(role)
)
```

Ejemplo:

```text
PROFESSOR
+
KINESIOLOGIST
```

obtiene simultáneamente:

```text
SALA_ROUTINE_MANAGE
CLINICAL_HISTORY_READ
```

sin cambiar de cuenta o modo.

---

# 114. Active InternalUser

Todos estos permisos requieren:

```text
InternalUser.status = ACTIVE
```

Un usuario Inactivo:

```text
effective permissions = none
```

La inactivación no elimina roles; los permisos vuelven a derivarse de esos roles únicamente cuando la cuenta se reactiva y conserva al menos uno.

para acceso al sistema.

Sus referencias históricas permanecen.

---

# 115. No permisos negativos

Inicialmente no existirán reglas como:

```text
ALLOW CLINICAL_HISTORY_READ
BUT DENY for patient X
```

ni:

```text
DENY SALA_PAYMENT_MANAGE
for user Y
```

La autorización se basa en la suma de roles funcionales.

Las excepciones individuales no forman parte del producto.

---

# 116. No escalada desde frontend

El frontend nunca enviará datos como:

```text
isAdmin: true
canReadClinic: true
```

como fuente de autoridad.

Roles y permissions efectivos se obtienen exclusivamente de la sesión validada por backend.

---

# 117. Auditoría

Las operaciones sensibles asociadas a autorización deben poder dejar trazabilidad.

Especialmente:

```text
AddRole
RemoveRole
user activation/inactivation
credential reset
global Person inactivation
BROCO_SUPPORT sensitive action
```

La política completa se encuentra en `SECURITY.md`.

---

# 118. Relación con DOMAIN_MODEL.md

`DOMAIN_MODEL.md` define:

```text
qué entidades existen
```

Este documento define:

```text
qué actor puede intentar operar sobre ellas
```

No redefine su ciclo de vida.

---

# 119. Relación con STATE_TRANSITIONS.md

Un permiso habilita una acción, pero la transición válida se determina mediante:

```text
STATE_TRANSITIONS.md
```

Ejemplo:

```text
CLINIC_TREATMENT_MANAGE
```

permite intentar:

```text
ReopenTreatment
```

pero las precondiciones sobre profesional responsable continúan aplicando.

---

# 120. Relación con DATA_INTEGRITY.md

Los permisos no garantizan integridad.

Ejemplo:

```text
SALA_PAYMENT_MANAGE
```

no permite crear dos pagos válidos para el mismo Alumno y Mes/Año si esa regla está protegida por integridad.

---

# 121. Relación con SECURITY.md

`SECURITY.md` define:

- autenticación;
- sesiones;
- protección de credenciales;
- CSRF;
- CORS;
- rate limiting;
- logging;
- seguridad de archivos.

`PERMISSIONS.md` define:

```text
authorization after authentication
```

---

# 122. Regla para nuevas funcionalidades

Ante una nueva operación deberá responderse:

1. ¿Qué dominio posee la operación?
2. ¿Qué Permission la representa?
3. ¿Qué roles reciben ese Permission?
4. ¿Requiere precondiciones adicionales?
5. ¿Expone información sensible?
6. ¿El frontend necesita conocer la capability?
7. ¿Existe una regla funcional que todavía deba validarse con el Analista?

No se agregará un permiso arbitrario simplemente porque apareció un endpoint nuevo.

---

# 123. Principios finales

1. Los roles son cerrados y combinables.
2. Los permissions están definidos en código.
3. Los permissions se expresan por capacidad funcional.
4. Los roles combinados suman capabilities.
5. No existen perfiles especiales por usuario.
6. El frontend no es una barrera de seguridad.
7. El backend verifica siempre autorización.
8. La operación administrativa de Clínica está separada del acceso a Historia Clínica.
9. Sala recibe únicamente información clínica específicamente autorizada.
10. Cualquier usuario interno puede cerrar una Indicación sin obtener capacidad de editar su contenido.
11. Cualquier usuario interno puede registrar un Gasto sin acceder al historial general.
12. Administrativo posee Finanzas operativas, no ejecutivas.
13. Administrativo gestiona usuarios estándar, no Administradores generales.
14. General Admin no hace bypass de reglas del dominio.
15. General Admin no administra Soporte Broco.
16. BROCO_SUPPORT es excepcional y administrado por Broco.
17. Ownership de Profesor/Tratamiento organiza, pero no constituye barrera general.
18. Portal utiliza autorización propia basada en Person, estado, relación y ownership.
19. Permission no reemplaza precondiciones funcionales.
20. Las nuevas funcionalidades deben integrarse al modelo de permisos deliberadamente.

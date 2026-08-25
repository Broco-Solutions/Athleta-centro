# API.md — Athleta Manager

## 1. Propósito

Este documento define las convenciones de API HTTP de Athleta Manager.

Su objetivo es establecer una única forma de diseñar, documentar y consumir endpoints para evitar que cada módulo implemente contratos diferentes.

Este documento complementa:

```text
docs/architecture/ARCHITECTURE.md
docs/architecture/STACK.md
docs/architecture/SECURITY.md
docs/architecture/DATABASE.md

docs/domain/DOMAIN_MODEL.md
docs/domain/STATE_TRANSITIONS.md
docs/domain/PERMISSIONS.md
docs/domain/DATA_INTEGRITY.md

docs/engineering/CODING_CONVENTIONS.md
docs/engineering/TESTING.md
```

La API será:

```text
REST
JSON
HTTPS
OpenAPI documented
Orval-generated client
```

NestJS será la fuente autoritativa del contrato HTTP.

---

# 2. Prefijo global

La API utilizará:

```text
/api
```

como prefijo global.

Ejemplos:

```text
/api/people
/api/sala/participations
/api/clinic/appointments
/api/finance/expenses
```

No se utilizará inicialmente:

```text
/api/v1
```

No se introduce versionado de API anticipadamente.

---

# 3. Organización por dominio

Las rutas se organizarán por dominio funcional.

Ejemplos:

```text
/api/auth
/api/people
/api/team

/api/sala/participations
/api/sala/schedule
/api/sala/occurrences
/api/sala/routines
/api/sala/payments

/api/clinic/appointments
/api/clinic/attentions
/api/clinic/treatments
/api/clinic/evaluations
/api/clinic/studies
/api/clinic/incomes

/api/finance/expenses
/api/finance/incomes

/api/portal
/api/files
```

No crear una API completamente plana si el dominio posee ownership claro.

---

# 4. Recursos vs acciones de dominio

CRUD simple utilizará semántica REST convencional.

Operaciones con significado funcional explícito utilizarán endpoints de acción.

Ejemplos:

```text
POST /api/people/:id/inactivate
POST /api/sala/participations/:id/leave
POST /api/clinic/appointments/:id/attend
POST /api/clinic/treatments/:id/finalize
POST /api/clinic/treatments/:id/reopen
```

No representar estas operaciones como:

```text
PATCH { status: ... }
```

cuando la transición posee:

- precondiciones;
- side effects;
- transacciones;
- auditoría;
- reglas contextuales.

---

# 5. CRUD simple

Para recursos simples sin lifecycle complejo se utilizará:

```text
GET
POST
PATCH
DELETE
```

Ejemplo:

```text
GET    /api/finance/payment-methods
POST   /api/finance/payment-methods
PATCH  /api/finance/payment-methods/:id
DELETE /api/finance/payment-methods/:id
```

`DELETE` solo se expone cuando el dominio permite eliminación física.

---

# 6. HTTP verbs

Convención:

```text
GET
→ lectura

POST
→ creación o acción de dominio

PATCH
→ actualización parcial simple

DELETE
→ eliminación física funcionalmente permitida
```

No utilizar:

```text
GET
```

para operaciones con side effects.

---

# 7. Resource naming

Las rutas utilizarán:

```text
kebab-case
plural nouns
```

Ejemplos:

```text
/clinical-appointments
/payment-methods
/expense-categories
```

Evitar rutas con nombres de tablas internas.

---

# 8. Identificadores

Todos los IDs técnicos se exponen como:

```text
UUID string
```

Ejemplo:

```json
{
  "id": "8d9edb54-6aca-4b53-b79f-1ea0919a9954"
}
```

No exponer detalles de implementación Prisma.

---

# 9. Respuesta de éxito

Las respuestas JSON utilizarán un envelope consistente:

```json
{
  "data": {}
}
```

No crear formatos distintos por módulo.

---

# 10. Respuesta de detalle

Ejemplo:

```json
{
  "data": {
    "id": "8d9edb54-6aca-4b53-b79f-1ea0919a9954",
    "firstName": "Juan",
    "lastName": "Pérez"
  }
}
```

---

# 11. Respuesta de lista

Para listas pequeñas/no paginadas:

```json
{
  "data": [
    {},
    {}
  ]
}
```

---

# 12. Paginación

Las listas grandes utilizarán paginación basada en página.

Query params:

```text
?page=1&pageSize=25
```

Defaults:

```text
page = 1
pageSize = 25
```

Máximo:

```text
pageSize = 100
```

No permitir tamaños arbitrariamente grandes.

---

# 13. Respuesta paginada

Formato:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 184,
    "totalPages": 8
  }
}
```

---

# 14. Listas no paginadas

No se obliga a paginar recursos pequeños y naturalmente acotados.

Ejemplos posibles:

```text
payment methods
expense categories
small selectable catalogs
```

Estos podrán responder:

```json
{
  "data": []
}
```

---

# 15. Sorting

Convención:

```text
?sortBy=startAt&sortOrder=asc
```

Valores válidos:

```text
asc
desc
```

Cada endpoint debe declarar explícitamente qué campos son ordenables.

No permitir ordenar arbitrariamente por cualquier columna de DB.

---

# 16. Filtering

Los filtros se exponen mediante query params explícitos.

Ejemplo:

```text
GET /api/clinic/appointments
  ?professionalId=<uuid>
  &status=SCHEDULED
  &from=2026-08-24
  &to=2026-08-31
```

No utilizar:

```text
?filters={"anything":"anything"}
```

como formato universal.

---

# 17. Search

La búsqueda libre utilizará:

```text
search
```

Ejemplo:

```text
GET /api/people?search=velazquez
```

El backend define los campos participantes.

No exponer nombres internos de columnas PostgreSQL.

---

# 18. Filtros múltiples

Cuando un filtro admita múltiples valores del mismo tipo:

```text
?status=SCHEDULED&status=ATTENDED
```

OpenAPI deberá describirlo como array.

No utilizar strings CSV manuales por defecto:

```text
status=SCHEDULED,ATTENDED
```

---

# 19. Fechas puras

Las fechas sin hora se serializarán como:

```text
YYYY-MM-DD
```

Ejemplo:

```json
{
  "birthDate": "1994-05-21"
}
```

No usar en contrato:

```text
21/05/1994
```

---

# 20. Timestamps

Los timestamps se serializarán como ISO 8601 con timezone explícita.

Ejemplo:

```text
2026-08-24T15:30:00.000Z
```

La UI convierte a:

```text
America/Argentina/Buenos_Aires
```

---

# 21. Horarios recurrentes

Los horarios semanales/recurrentes se representan como:

```text
HH:mm
```

Ejemplo:

```json
{
  "startTime": "18:00",
  "endTime": "19:00"
}
```

No utilizar timestamps para representar configuración horaria semanal.

---

# 22. MonthYear

Los períodos mensuales se representan mediante:

```json
{
  "year": 2026,
  "month": 8
}
```

No utilizar como formato técnico:

```text
"08/2026"
```

---

# 23. Dinero en API

Los valores monetarios se serializarán como strings.

Motivo:

```text
preservar precisión Decimal
evitar floats JavaScript
mantener contrato consistente
```

ARS:

```json
{
  "amount": "150000"
}
```

USD/cotización:

```json
{
  "rate": "1325.50"
}
```

---

# 24. ARS

Según `DATABASE.md`:

```text
ARS
→ sin decimales
```

Ejemplo válido:

```text
"150000"
```

No:

```text
"150000.50"
```

para importes ARS bajo el modelo actual.

---

# 25. USD

USD/cotización utiliza dos decimales.

Ejemplo:

```text
"1325.50"
```

La UI es responsable de formato visual y separadores locales.

---

# 26. Enums

Los enums viajan mediante sus valores técnicos.

Ejemplo:

```json
{
  "status": "IN_PROGRESS"
}
```

No enviar labels traducidos como identificadores.

La UI transforma:

```text
IN_PROGRESS
→ En curso
```

---

# 27. Nullability

Cuando un campo forma parte estable del contrato pero no posee valor:

```text
null
```

Ejemplo:

```json
{
  "endDate": null
}
```

Omitir campos únicamente cuando el contrato defina explícitamente que el campo puede no estar presente.

Las respuestas deben ser predecibles.

---

# 28. PATCH semantics

`PATCH` representa una actualización parcial.

Campo omitido:

```text
no change
```

`null`:

```text
clear/remove value
```

solo cuando el campo sea nullable y el contrato admita la eliminación explícita.

---

# 29. Unknown fields

Los writes rechazarán propiedades desconocidas.

Ejemplo inválido:

```json
{
  "firstName": "Juan",
  "isAdmin": true
}
```

si `isAdmin` no pertenece al schema.

Resultado:

```text
400 VALIDATION_ERROR
```

No ignorar silenciosamente campos extra.

---

# 30. Validation

Los inputs HTTP se validarán con:

```text
Zod
```

La validación de boundary incluye:

```text
required fields
format
UUID
enums
simple ranges
date shape
string shape
unknown fields
```

Las reglas de dominio no pertenecen a Zod cuando dependen del estado del sistema.

---

# 31. Error envelope

Formato uniforme:

```json
{
  "statusCode": 409,
  "code": "PROFESSOR_HAS_ASSIGNED_STUDENTS",
  "message": "No se puede inactivar al profesor mientras tenga alumnos asignados.",
  "details": {
    "count": 14
  }
}
```

---

# 32. `code`

`code` es el identificador programático estable del error.

El frontend debe basar su comportamiento principalmente en:

```text
code
```

No en el texto de `message`.

---

# 33. `message`

`message` es contenido humano.

Puede:

- cambiar;
- mejorar;
- traducirse posteriormente.

No debe utilizarse como clave lógica.

---

# 34. `details`

`details` es opcional.

Puede contener:

```text
field errors
counts
conflicting IDs when safe
context required by UI
```

Nunca:

```text
password
PIN
tokens
session secrets
clinical bodies unnecessarily
SQL errors
stack traces
```

---

# 35. Validation error

Formato:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Hay datos inválidos.",
  "details": {
    "fields": {
      "email": [
        "Formato inválido"
      ],
      "birthDate": [
        "Fecha inválida"
      ]
    }
  }
}
```

---

# 36. HTTP status codes

Convención general:

```text
200
→ success

201
→ resource created

204
→ successful delete with no response body

400
→ invalid request / validation

401
→ unauthenticated

403
→ authenticated but forbidden

404
→ resource not found

409
→ domain conflict / concurrency
```

---

# 37. 422

No se utilizará inicialmente:

```text
422 Unprocessable Entity
```

Política:

```text
simple input validation
→ 400

domain state conflict
→ 409
```

Esto reduce ambigüedad.

---

# 38. 401

Se utiliza cuando:

```text
session missing
session invalid
session expired
session revoked
```

No cuando el usuario está autenticado pero carece de permiso.

---

# 39. 403

Se utiliza cuando:

```text
authenticated
+
missing required permission
```

Salvo casos concretos donde ocultar existencia del recurso sea una decisión de seguridad.

---

# 40. 404

Se utiliza cuando:

```text
resource does not exist
```

o en políticas específicas de privacidad donde sea importante no revelar existencia.

No utilizar 404 indiscriminadamente para autorización.

---

# 41. 409

Se utiliza para conflictos funcionales.

Ejemplos:

```text
ACTIVE_SALA_PARTICIPATION_ALREADY_EXISTS
CONCURRENT_MODIFICATION
PROFESSOR_HAS_ASSIGNED_STUDENTS
CLINICAL_PROFESSIONAL_HAS_ACTIVE_RESPONSIBILITIES
ATTENTION_HAS_DEPENDENCIES
SALA_CAPACITY_EXCEEDED
```

---

# 42. Create responses

Una creación normalmente devuelve:

```text
201 Created
```

más el recurso/read model útil.

Ejemplo:

```json
{
  "data": {
    "id": "...",
    "status": "SCHEDULED"
  }
}
```

---

# 43. PATCH responses

Un PATCH exitoso normalmente devuelve:

```text
200 OK
```

con la representación actualizada cuando sea útil para frontend.

---

# 44. Action responses

Una acción de dominio puede devolver el read model actualizado.

Ejemplo:

```text
POST /api/clinic/treatments/:id/finalize
```

podrá responder:

```json
{
  "data": {
    "id": "...",
    "status": "FINISHED"
  }
}
```

No es obligatorio devolver toda la entidad si el frontend no la necesita.

---

# 45. DELETE

Una eliminación física exitosa sin contenido adicional responderá:

```text
204 No Content
```

No devolver:

```json
{
  "success": true
}
```

innecesariamente.

---

# 46. Auth interno

Rutas conceptuales:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
POST /api/auth/change-password
```

Los nombres finales pueden ampliarse según necesidades de reset/admin.

---

# 47. Login interno

El login:

- valida email + password;
- crea server-side session;
- establece cookie segura;
- no devuelve JWT/Bearer token como mecanismo principal.

Respuesta conceptual:

```json
{
  "data": {
    "user": {
      "id": "..."
    },
    "roles": [
      "PROFESSOR"
    ],
    "permissions": [
      "PEOPLE_READ"
    ],
    "mustChangePassword": false
  }
}
```

---

# 48. Current session

Endpoint:

```text
GET /api/auth/session
```

Devuelve:

```text
authenticated user
roles
effective permissions
mustChangePassword
```

Es utilizado por el frontend para bootstrap de sesión y UI.

---

# 49. Logout

```text
POST /api/auth/logout
```

Debe:

```text
revoke/delete session as designed
clear cookie
```

No necesita retornar un token.

---

# 50. Portal Auth

El Portal tendrá rutas separadas:

```text
POST /api/portal/auth/login
POST /api/portal/auth/logout
GET  /api/portal/auth/session
POST /api/portal/auth/change-pin
```

No reutilizar DTOs internos de email/password.

---

# 51. Portal principal

La identidad del Portal es:

```text
Person
```

No:

```text
InternalUser
```

El backend deriva `personId` desde la sesión.

Las operaciones Portal no deben confiar en `personId` enviado por el cliente para decidir ownership.

---

# 52. Auth cookies

El contrato HTTP depende de cookies:

```text
HttpOnly
Secure
SameSite
```

según `SECURITY.md`.

El frontend deberá enviar requests con credenciales cuando corresponda.

---

# 53. CSRF

Las mutaciones autenticadas mediante cookie deberán respetar la estrategia CSRF definida en `SECURITY.md`.

El detalle técnico no debe variar por módulo.

---

# 54. CORS

Los orígenes permitidos se configuran centralmente.

Producción debe permitir explícitamente:

```text
https://athleta.brocosolutions.com
```

No utilizar wildcard con endpoints autenticados.

---

# 55. Domain actions

Patrón recomendado:

```text
POST /resource/:id/action
```

Ejemplos:

```text
POST /api/people/:id/inactivate

POST /api/sala/participations/:id/leave

POST /api/clinic/appointments/:id/attend
POST /api/clinic/appointments/:id/cancel

POST /api/clinic/treatments/:id/finalize
POST /api/clinic/treatments/:id/reopen
```

No utilizar acciones en query params.

---

# 56. Reprogramación de appointment

Como reprogramar modifica información simple del mismo recurso sin crear un estado nuevo, puede representarse mediante:

```text
PATCH /api/clinic/appointments/:id
```

con:

```text
startAt
durationMinutes
professionalId
```

siempre que las reglas funcionales correspondientes se apliquen en backend.

Si posteriormente se vuelve una operación con side effects relevantes, podrá convertirse en acción explícita.

---

# 57. State changes

No exponer endpoints genéricos como:

```text
PATCH /api/clinic/appointments/:id
{
  "status": "ATTENDED"
}
```

para transiciones que requieren casos de uso específicos.

---

# 58. Paginación — validación

Debe validarse:

```text
page >= 1

pageSize >= 1

pageSize <= 100
```

Un valor inválido produce:

```text
400 VALIDATION_ERROR
```

---

# 59. Sorting allowlist

Cada list endpoint mantiene una allowlist.

Ejemplo:

```text
ClinicalAppointment:
- startAt
- status
- createdAt
```

No mapear directamente cualquier string del usuario a Prisma `orderBy`.

---

# 60. Filtering allowlist

Lo mismo para filtros.

Solo campos definidos explícitamente pueden convertirse en condiciones de query.

No aceptar operadores SQL arbitrarios enviados por cliente.

---

# 61. Range filters

Convención temporal:

```text
from
to
```

cuando el contexto sea claro.

Ejemplo:

```text
GET /api/clinic/appointments?from=2026-08-24&to=2026-08-31
```

Los endpoints documentarán si los límites son inclusivos/exclusivos cuando sea relevante.

---

# 62. Search normalization

Búsquedas como DNI/email deben utilizar la normalización definida en:

```text
DATA_INTEGRITY.md
```

El API recibe formato humano razonable y backend aplica canonicalización.

---

# 63. Read models

Los endpoints de lectura pueden devolver shapes optimizados.

Ejemplo:

```text
GET /api/clinic/appointments
```

puede devolver:

```text
ClinicalAppointmentListItem
```

sin retornar el aggregate completo.

---

# 64. Privacy-aware read models

Los read models deben respetar permisos.

Ejemplo:

Un `ADMINISTRATIVE` puede recibir agenda clínica sin recibir:

```text
Evolution
clinical history
ClinicalEvaluation details
study details
```

No reutilizar DTOs demasiado amplios.

---

# 65. DTOs separados por contexto

Es válido tener:

```text
ClinicalAgendaItemResponse
ClinicalHistoryResponse
SalaClinicalIndicationResponse
```

aunque referencien la misma Persona.

La privacidad y claridad del contrato tienen prioridad sobre reutilizar un mega DTO.

---

# 66. No Prisma responses

No devolver directamente:

```text
Prisma model
```

desde Controller.

Debe existir mapping a contratos/read models.

---

# 67. OpenAPI

NestJS generará la especificación OpenAPI.

OpenAPI es la fuente del cliente frontend generado.

Toda ruta pública consumida por frontend debe quedar documentada.

---

# 68. OpenAPI tags

Tags principales:

```text
Auth
People
Team
Sala
Clinic
Finance
Portal
Files
```

Pueden agregarse subdominios si Swagger se vuelve demasiado grande, pero mantener claridad por dominio.

---

# 69. OpenAPI operationId

Cada operación debe tener `operationId` explícito y estable.

Ejemplos:

```text
authLogin
authGetSession

peopleSearch
peopleGetById
peopleCreate
personInactivate

clinicAppointmentCreate
clinicAppointmentMarkAttended

treatmentFinalize
treatmentReopen
```

---

# 70. operationId naming

Convención recomendada:

```text
domainResourceAction
```

Debe ser:

- estable;
- semántico;
- único.

Orval utilizará estos IDs para nombres previsibles.

---

# 71. OpenAPI descriptions

No documentar únicamente request/response types.

Para acciones de dominio, describir:

```text
preconditions
important side effects
important authorization context
```

Ejemplo:

```text
Marks the ClinicalAppointment as ATTENDED and creates
the related ClinicalAttention atomically.
```

---

# 72. Functional pending behavior

No publicar un contrato definitivo que presuponga una definición marcada:

```text
PENDING_FUNCTIONAL_DEFINITION
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

Ejemplos actuales:

```text
Appointment ↔ Attention cardinality
Attention ↔ Evolution cardinality
Attention ↔ ClinicalEvaluation cardinality
Attention ↔ Treatment cardinality
ClinicalStudy ↔ FileAsset cardinality
```

---

# 73. Orval

El flujo oficial:

```text
NestJS
↓
OpenAPI
↓
Orval
↓
packages/api-client
↓
apps/web
```

No crear un client HTTP paralelo por feature.

---

# 74. Generated client

El contenido generado por Orval:

```text
must not be manually edited
```

Si un tipo/nombre es incorrecto:

```text
fix backend/OpenAPI
↓
regenerate
```

---

# 75. Client generation drift

CI debe comprobar sincronización.

Conceptualmente:

```text
generate OpenAPI
generate Orval
git diff --exit-code
```

Si cambia código generado no versionado, CI falla.

---

# 76. TanStack Query

El frontend podrá envolver/consumir el cliente Orval mediante TanStack Query.

Las query keys y cache behavior se rigen por `CODING_CONVENTIONS.md`.

---

# 77. Swagger UI

Ambientes:

```text
Local
→ enabled

Staging
→ enabled/restricted as appropriate

Production
→ disabled or restricted
```

No se necesita Swagger UI público en producción.

---

# 78. OpenAPI JSON

La disponibilidad del JSON en producción podrá quedar restringida si así lo exige la configuración.

El frontend productivo no necesita consultarlo en runtime.

---

# 79. Health endpoint

Endpoint técnico:

```text
GET /health
```

Fuera del prefijo funcional principal o claramente identificado como infraestructura.

Respuesta simple.

Ejemplo:

```json
{
  "status": "ok"
}
```

No exponer:

```text
secrets
DB credentials
provider internals
stack traces
```

---

# 80. Health semantics

Podrán existir posteriormente:

```text
/health
/ready
```

si la infraestructura lo requiere.

No introducir complejidad adicional sin necesidad.

---

# 81. File uploads

Inicialmente los uploads se realizarán mediante:

```text
multipart/form-data
```

hacia NestJS.

Ejemplo:

```text
POST /api/clinic/studies/:id/files
```

El backend:

```text
authorizes
validates metadata
validates MIME
validates magic bytes
validates size
uploads to S3
persists FileAsset
links domain entity
```

---

# 82. File upload response

Respuesta conceptual:

```json
{
  "data": {
    "id": "...",
    "originalName": "estudio.pdf",
    "mimeType": "application/pdf",
    "size": 182340
  }
}
```

No devolver permanentemente un signed URL como atributo estable.

---

# 83. File access

El acceso a un archivo privado requiere autorización previa.

Endpoint conceptual:

```text
POST /api/files/:id/access
```

Respuesta:

```json
{
  "data": {
    "url": "https://...",
    "expiresAt": "2026-08-24T16:00:00.000Z"
  }
}
```

---

# 84. Signed URL

La URL:

- es temporal;
- no se persiste como fuente de verdad;
- se emite únicamente después de autorización;
- apunta al objeto específico.

---

# 85. Direct browser-to-S3 uploads

No se implementarán inicialmente.

Si aparecen archivos significativamente grandes o presión de infraestructura, se podrá evaluar:

```text
presigned upload
```

mediante decisión explícita posterior.

---

# 86. Financial idempotency

Las operaciones económicas críticas incluirán:

```text
operationId
```

cuando corresponda.

Ejemplo:

```json
{
  "operationId": "b6373d76-cc06-4e95-afab-08d0ac6a41f4",
  "amount": "150000"
}
```

---

# 87. operationId placement

El `operationId` se enviará inicialmente en el body del command.

No se introduce un header custom de idempotencia en V1.

Esto simplifica:

```text
OpenAPI
Orval
forms
testing
```

---

# 88. Idempotency semantics

Un retry con el mismo `operationId` no debe crear un movimiento duplicado.

La respuesta al retry debe seguir una política consistente definida por el caso de uso.

No reemplaza otras constraints naturales.

---

# 89. Optimistic concurrency

Las entidades sensibles que utilicen `version` recibirán la versión actual en el command de actualización.

Ejemplo:

```json
{
  "version": 4,
  "content": "..."
}
```

---

# 90. Concurrent modification

Si la versión ya cambió:

```text
409 Conflict
```

```json
{
  "statusCode": 409,
  "code": "CONCURRENT_MODIFICATION",
  "message": "El registro fue modificado por otro usuario."
}
```

---

# 91. ETag

No se implementará inicialmente:

```text
ETag
If-Match
```

La versión explícita en el body es suficiente para V1.

---

# 92. Action command bodies

Los endpoints de acción pueden recibir información adicional.

Ejemplo:

```text
POST /api/clinic/treatments/:id/finalize
```

body:

```json
{
  "version": 3,
  "finishReason": "DISCHARGE",
  "conclusion": "..."
}
```

según la definición funcional confirmada.

No inventar campos pendientes.

---

# 93. No generic status body

No crear un endpoint universal:

```text
POST /api/resources/:id/status
```

Los estados pertenecen a operaciones específicas.

---

# 94. Resource ownership in Portal

Toda operación Portal que actúe sobre un recurso debe validar:

```text
resource.personId
==
authenticated Person.id
```

El backend obtiene el principal desde sesión.

---

# 95. Portal resource IDs

El Portal puede enviar el UUID del recurso concreto:

```text
reservationId
appointmentId
```

pero nunca controla el `personId` propietario.

---

# 96. Internal resource access

En la aplicación interna se pueden pasar IDs objetivo porque el usuario opera sobre terceros.

Aun así:

```text
permission
+
domain rules
+
privacy
```

deben validarse.

---

# 97. Errors and existence disclosure

En app interna:

```text
403
```

es la respuesta normal a recursos existentes sin permiso.

En Portal/Auth podrán utilizarse respuestas genéricas cuando revelar existencia de DNI/estado constituya filtración de información.

---

# 98. Logging and API

Cada request debe tener:

```text
requestId / correlationId
```

Los errores devueltos no exponen stack trace.

Los logs internos mantienen contexto técnico sanitizado.

---

# 99. Request IDs

El backend podrá aceptar o generar:

```text
X-Request-Id
```

o mecanismo equivalente.

El ID puede devolverse en response header para facilitar soporte.

El naming exacto puede definirse en implementación.

---

# 100. Security headers

La API deberá integrarse con las políticas de seguridad definidas para:

```text
CORS
CSRF
cookies
TLS
rate limiting
```

No deben implementarse variaciones por módulo.

---

# 101. Rate limiting

Los endpoints sensibles:

```text
login
credential reset
Portal PIN login
```

tendrán políticas más estrictas.

La forma del error deberá respetar el envelope común.

---

# 102. Rate limit response

Cuando corresponda:

```text
429 Too Many Requests
```

con error controlado.

Ejemplo:

```json
{
  "statusCode": 429,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Se realizaron demasiados intentos."
}
```

Evitar filtrar información adicional sobre existencia de cuentas.

---

# 103. Serialization

La serialización debe ser central y consistente.

Especial atención a:

```text
Decimal
Date
null
enums
BigInt if ever introduced
```

No dejar que JSON.stringify de modelos internos defina accidentalmente el contrato.

---

# 104. Decimal serialization

Los `Prisma.Decimal` se transforman explícitamente a string en API.

No depender de comportamiento implícito.

---

# 105. Date serialization

Los timestamps se transforman a ISO 8601.

Las fechas puras permanecen:

```text
YYYY-MM-DD
```

No aplicar conversión UTC a `DATE`.

---

# 106. Request bodies

Los bodies deben estar tipados/documentados por endpoint.

No aceptar:

```text
Record<string, any>
```

para recursos de dominio.

---

# 107. Response bodies

Las respuestas deben tener schemas OpenAPI explícitos.

No utilizar:

```text
unknown object
```

salvo integraciones dinámicas muy justificadas.

---

# 108. API naming and business language

Los endpoints utilizan lenguaje técnico en inglés, alineado al dominio.

Ejemplo:

```text
clinical-appointments
treatments
sala-participations
```

No traducir rutas al español.

---

# 109. Sala naming

Se conserva:

```text
sala
```

como término de dominio/nombre propio del módulo.

No reemplazar automáticamente por:

```text
gym
room
training-room
```

si eso pierde el vocabulario del producto.

---

# 110. API docs language

La documentación técnica puede estar en español, mientras:

```text
route names
operationIds
schemas
enum values
```

se mantienen en inglés según las convenciones del proyecto.

---

# 111. Breaking changes durante desarrollo

Mientras frontend/backend sean consumidores propios y no exista API pública externa, un breaking change puede coordinarse en el mismo cambio.

Debe incluir:

```text
backend update
OpenAPI update
Orval regeneration
frontend update
tests
```

No crear `/v2` por cada refactor interno.

---

# 112. External consumers

Si posteriormente Athleta expone API a terceros:

```text
versioning
deprecation
backward compatibility
authentication model
rate limits
```

deberán reconsiderarse mediante ADR.

---

# 113. API response consistency

No crear wrappers distintos:

```text
PeopleResult
ClinicResponse
FinancePayload
```

con layouts incompatibles.

Convención:

```text
success detail
→ { data }

success list
→ { data }

success paginated
→ { data, meta }

error
→ { statusCode, code, message, details? }
```

---

# 114. No `{ success: true }`

No utilizar respuestas como:

```json
{
  "success": true
}
```

si HTTP status ya expresa éxito y existe un contrato de `data`.

---

# 115. Empty success bodies

Utilizar `204` cuando no haya contenido útil.

No combinar:

```text
204
+
body
```

---

# 116. Unknown enum values

El backend no debe aceptar valores enum desconocidos.

El frontend tampoco debe asumir que un label equivale al enum.

---

# 117. Contract stability

Los campos de respuesta deben eliminarse o renombrarse deliberadamente.

No renombrar:

```text
personId
→ patientId
```

en una refactorización sin revisar el significado y consumidores.

---

# 118. Read model versioning

No introducir versiones internas del read model en el nombre:

```text
PersonListItemV2
```

salvo migración real.

Preferir reemplazo coordinado mientras no haya consumidores externos.

---

# 119. API security boundary

La API es la barrera real.

Nunca asumir que:

```text
hidden frontend button
```

impide ejecutar una acción.

Todos los endpoints:

```text
authenticate
authorize
validate
apply domain rules
```

---

# 120. Mass assignment

Nunca pasar directamente el body a Prisma.

Incorrecto:

```ts
prisma.person.update({
  data: req.body,
});
```

El schema/API contract debe seleccionar explícitamente campos aceptados.

---

# 121. Internal fields

Campos como:

```text
role
status
createdAt
updatedAt
version
passwordHash
pinHash
storageKey
```

solo se aceptan/modifican si el endpoint específico lo define.

No permitirlos accidentalmente por DTO amplio.

---

# 122. Sensitive fields

Nunca devolver:

```text
passwordHash
pinHash
sessionSecretHash
credentials internals
AWS credentials
```

No incluirlos siquiera en DTOs compartidos.

---

# 123. Clinical privacy

No devolver contenido clínico a roles no autorizados aunque:

```text
the database query already loaded it
```

La serialización final debe aplicar mínimo necesario.

---

# 124. Generated types and frontend

Frontend no debe redefinir manualmente tipos que ya existan en:

```text
packages/api-client
```

salvo tipos puramente de UI.

---

# 125. API local development

Local deberá exponer OpenAPI/Swagger de forma simple para desarrollo.

El comando de generación de cliente debe poder ejecutarse reproduciblemente.

---

# 126. CI expectations

Antes de merge:

```text
OpenAPI generation succeeds
Orval generation succeeds
generated client is synchronized
API tests pass
typecheck passes
```

según `TESTING.md`.

---

# 127. Smoke API checks

Staging/production podrán verificar:

```text
GET /health
GET/POST auth expected response shape
```

sin modificar datos productivos de forma peligrosa.

---

# 128. API de IA futura

No definir todavía:

```text
/api/ai
```

ni contratos de embeddings/LLM/análisis.

Cuando se diseñe el módulo IA deberá respetar:

- mismo error envelope;
- autenticación/autorización;
- privacidad clínica;
- OpenAPI cuando aplique;
- separación del core.

---

# 129. PENDING_FUNCTIONAL_DEFINITION

Cuando el contrato dependa de una respuesta funcional pendiente, Codex no debe inventarlo.

Debe:

```text
leave implementation neutral
avoid irreversible API contract
document blocker
```

---

# 130. Regla para Codex

Antes de crear un endpoint, Codex debe revisar:

1. ¿Qué módulo posee la operación?
2. ¿Es CRUD simple o acción de dominio?
3. ¿Qué permission requiere?
4. ¿Qué reglas contextuales aplica?
5. ¿Qué datos puede exponer el actor?
6. ¿Debe ser transaccional?
7. ¿Necesita idempotencia?
8. ¿Necesita optimistic locking?
9. ¿Debe paginar?
10. ¿Existe alguna definición funcional pendiente?

---

# 131. Ejemplos de rutas conceptuales

## Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
POST /api/auth/change-password
```

## People

```text
GET    /api/people
POST   /api/people
GET    /api/people/:id
PATCH  /api/people/:id
DELETE /api/people/:id
POST   /api/people/:id/inactivate
POST   /api/people/:id/reset-portal-pin
```

`DELETE` queda condicionado a reglas de eliminabilidad.

## Sala

```text
GET  /api/sala/participations
POST /api/sala/participations
POST /api/sala/participations/:id/leave

GET  /api/sala/occurrences
POST /api/sala/occurrences
PATCH /api/sala/occurrences/:id

GET  /api/sala/routines/:id
POST /api/sala/routines
POST /api/sala/routines/:id/replace

GET  /api/sala/payments
POST /api/sala/payments
PATCH /api/sala/payments/:id
DELETE /api/sala/payments/:id
```

## Clinic

```text
GET  /api/clinic/appointments
POST /api/clinic/appointments
GET  /api/clinic/appointments/:id
PATCH /api/clinic/appointments/:id

POST /api/clinic/appointments/:id/attend
POST /api/clinic/appointments/:id/cancel
POST /api/clinic/appointments/:id/mark-absent

POST /api/clinic/attentions

GET  /api/clinic/treatments
POST /api/clinic/treatments
POST /api/clinic/treatments/:id/finalize
POST /api/clinic/treatments/:id/reopen

POST /api/clinic/attentions/:id/evolutions
POST /api/clinic/attentions/:id/evaluations
```

Las rutas cuya cardinalidad dependa del Analista deben considerarse conceptuales, no contrato final.

## Finance

```text
GET  /api/finance/incomes
GET  /api/finance/expenses
POST /api/finance/expenses
PATCH /api/finance/expenses/:id
DELETE /api/finance/expenses/:id

GET /api/finance/dashboard
```

## Portal

```text
POST /api/portal/auth/login
POST /api/portal/auth/logout
GET  /api/portal/auth/session

GET  /api/portal/sala/reservations
POST /api/portal/sala/reservations/:id/cancel

GET  /api/portal/clinic/appointments
POST /api/portal/clinic/appointments/:id/cancel

GET  /api/portal/me
POST /api/portal/auth/change-pin
```

---

# 132. Principios finales

1. API REST bajo `/api`.
2. Sin `/v1` inicialmente.
3. Rutas agrupadas por dominio.
4. Acciones de dominio utilizan endpoints explícitos.
5. CRUD simple usa GET/POST/PATCH/DELETE.
6. Las listas grandes utilizan `page` + `pageSize`.
7. Page size máximo inicial: 100.
8. Responses exitosas usan `{ data }`.
9. Responses paginadas usan `{ data, meta }`.
10. DELETE sin contenido usa 204.
11. Sorting utiliza `sortBy` + `sortOrder`.
12. Filtros son query params explícitos.
13. Búsqueda libre utiliza `search`.
14. Fechas puras usan `YYYY-MM-DD`.
15. Timestamps usan ISO 8601.
16. Horarios recurrentes usan `HH:mm`.
17. MonthYear usa `{ year, month }`.
18. Dinero se serializa como string.
19. ARS no utiliza decimales.
20. USD/cotización utiliza dos decimales.
21. IDs son UUID strings.
22. Enums usan `UPPER_SNAKE_CASE`.
23. Unknown fields se rechazan.
24. Errors utilizan envelope uniforme.
25. Validation usa 400.
26. Domain conflicts usan 409.
27. 422 no se utiliza inicialmente.
28. Server-side sessions no devuelven bearer tokens.
29. Auth interno y Portal tienen rutas separadas.
30. `operationId` financiero viaja en body.
31. Optimistic locking utiliza `version` en body.
32. No ETags inicialmente.
33. Upload inicial mediante multipart hacia NestJS.
34. Acceso a archivos mediante signed URLs temporales.
35. OpenAPI usa tags por dominio.
36. `operationId` OpenAPI debe ser explícito y estable.
37. OpenAPI documenta side effects y precondiciones relevantes.
38. Swagger UI no queda público por defecto en producción.
39. `/health` es endpoint técnico separado.
40. Orval es el cliente HTTP oficial del frontend.
41. No se crean wrappers diferentes por módulo.
42. No se devuelven modelos Prisma directamente.
43. La serialización debe respetar privacidad y mínimo necesario.
44. Codex no inventa contratos cuando existe una definición funcional pendiente.

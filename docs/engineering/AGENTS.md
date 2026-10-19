# AGENTS.md — Athleta Manager

## 1. Propósito

Este archivo define cómo debe trabajar cualquier agente de código sobre Athleta Manager.

Debe leerse antes de modificar código.

Su función es coordinar la documentación técnica y funcional existente, establecer límites de autonomía y evitar que un agente:

- invente reglas funcionales;
- cambie arquitectura sin aprobación;
- rompa privacidad clínica;
- ignore migraciones;
- cree patrones visuales inconsistentes;
- silencie tests;
- edite código generado;
- amplíe el alcance de una tarea sin necesidad.

Este documento no reemplaza la documentación detallada.

---

# 2. Prioridad de objetivos

Orden de prioridad:

```text
1. Correct business behavior
2. Security / privacy / data integrity
3. Maintainability
4. Tests
5. Delivery speed
6. Clever abstractions
```

Correctness tiene prioridad sobre velocidad.

Simplicidad tiene prioridad sobre abstracción sofisticada.

---

# 3. Documentación del proyecto

## Product

```text
docs/product/ATHLETA_MANAGER_DUDAS_FUNCIONALES.md
```

Contiene dudas funcionales pendientes de definición con Analista.

No utilizarlo como fuente de respuestas inventadas.

---

## Architecture

```text
docs/architecture/ARCHITECTURE.md
docs/architecture/STACK.md
docs/architecture/SECURITY.md
docs/architecture/INFRASTRUCTURE.md
docs/architecture/DATABASE.md
docs/architecture/API.md
```

---

## Domain

```text
docs/domain/DOMAIN_MODEL.md
docs/domain/STATE_TRANSITIONS.md
docs/domain/PERMISSIONS.md
docs/domain/DATA_INTEGRITY.md
```

---

## Engineering

```text
docs/engineering/TESTING.md
docs/engineering/CODING_CONVENTIONS.md
docs/engineering/DEVELOPMENT.md
```

---

## Design

```text
docs/design/DESIGN_SYSTEM.md
```

---

## Architecture Decisions

```text
docs/adr/
```

Solo para decisiones arquitectónicas significativas.

---

# 4. Lectura obligatoria

Antes de modificar código:

```text
1. Read this AGENTS.md.
2. Identify the domain/module affected.
3. Read the relevant documentation.
4. Inspect the existing implementation.
5. Identify tests and contracts affected.
6. Implement only after understanding current constraints.
```

No es obligatorio releer todos los documentos completos para una corrección trivial.

Sí es obligatorio leer los documentos relevantes para la tarea.

---

# 5. Jerarquía de autoridad

Cuando exista conflicto, utilizar este orden:

```text
1. Explicit current task/request
2. Confirmed functional definition
3. Domain documentation
4. Architecture / API / Security / Database documentation
5. Engineering / Design documentation
6. Existing implementation
```

El código existente no tiene prioridad sobre una especificación vigente.

Si una implementación contradice documentación confirmada:

```text
fix implementation
```

no:

```text
rewrite documentation to justify implementation
```

salvo que exista una nueva decisión aprobada.

---

# 6. Contradicciones

Si se detecta una contradicción material entre:

```text
task
functional docs
domain docs
architecture
existing code
```

el agente debe:

1. identificar la contradicción;
2. indicar qué parte del trabajo queda afectada;
3. no elegir silenciosamente una interpretación;
4. continuar únicamente con partes no bloqueadas;
5. reportar el bloqueo.

---

# 7. Definiciones funcionales pendientes

Las marcas:

```text
PENDING_FUNCTIONAL_DEFINITION
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

son bloqueos reales.

El agente no debe:

```text
guess
choose the most logical behavior
infer hidden cardinality
invent permissions
invent lifecycle transitions
invent validation rules
```

Debe:

```text
keep implementation neutral
or
stop the affected decision and report blocker
```

---

# 8. Autonomía técnica

Dentro de decisiones ya aprobadas, el agente tiene alta autonomía.

Puede decidir:

```text
local naming details
small refactors
helper placement
test organization
implementation details
internal private methods
small component decomposition
```

siempre que no cambie:

```text
functional behavior
architecture
security model
database semantics
permissions
public API contract
design language
```

---

# 9. Cambios de arquitectura

No introducir sin aprobación explícita:

```text
Redis
GraphQL
tRPC
new ORM
microservices
event bus
message broker
CQRS framework
Redux
Zustand
new UI framework
new auth provider
new storage strategy
new deployment topology
```

Si una tarea realmente requiere uno de estos cambios:

```text
stop
explain need
propose ADR
wait for approval
```

---

# 10. Alcance de tarea

No ampliar el scope silenciosamente.

Ejemplo:

Si la tarea es:

```text
Implement Clinical Appointment creation
```

no aprovechar para:

```text
refactor all Clinic
upgrade Next major
replace Prisma
redesign Sala DB
change global UX
```

salvo necesidad directa y justificada.

---

# 11. Refactors

Se permiten refactors locales cuando son necesarios para implementar correctamente una tarea.

Deben:

```text
preserve unrelated behavior
respect existing boundaries
keep or improve tests
avoid unrelated architecture changes
```

Refactors relevantes deben mencionarse en el reporte final.

---

# 12. Plan previo

Para tareas medianas/grandes:

```text
new module
DB migration
cross-module workflow
authentication change
permission change
large UI flow
```

realizar primero un plan corto.

No hace falta plan formal para:

```text
typo
small rename
isolated visual adjustment
trivial bug
```

---

# 13. Desarrollo vertical

Preferir slices funcionales completos.

Ejemplo:

```text
domain rule
↓
persistence
↓
API
↓
generated client
↓
UI
↓
tests
```

No construir anticipadamente toda la base de datos o todos los endpoints del sistema.

---

# 14. Implementación incremental

No crear de entrada todos los modelos, pantallas y endpoints descriptos en documentación.

Implementar:

```text
only what the current vertical slice requires
```

Mantener capacidad de evolución sin sobre-modelar.

---

# 15. Arquitectura backend

El backend es:

```text
NestJS
modular monolith
TypeScript
Prisma
PostgreSQL
```

Estructura recomendada cuando aplique:

```text
presentation
application
domain
infrastructure
```

No aplicar DDD ceremonial.

---

# 16. Controllers

Los Controllers deben permanecer delgados.

Permitido:

```text
receive HTTP
validate
declare authorization
call application use case/service
serialize response
```

No permitido:

```text
Prisma queries
business rules
manual transactions
cross-module orchestration
complex calculations
```

---

# 17. Use Cases

Operaciones con significado de negocio deben modelarse explícitamente.

Ejemplos:

```text
JoinSalaUseCase
ReplaceRoutineUseCase
MarkAppointmentAttendedUseCase
FinalizeTreatmentUseCase
ReopenTreatmentUseCase
InactivatePersonUseCase
```

No forzar un Use Case separado para lecturas triviales.

---

# 18. Cross-module access

Un módulo no debe acceder directamente a:

```text
another module's private repository
another module's internal persistence details
```

Utilizar:

```text
public application services
public module APIs
```

Cross-module foreign keys en la misma PostgreSQL están permitidas.

El boundary es de código/ownership, no de base separada.

---

# 19. Multi-module operations

Las operaciones que coordinan múltiples módulos deben:

```text
be explicit
live in Application layer
use a single transaction when appropriate
make side effects visible
```

No esconder side effects importantes dentro de helpers/repositories.

---

# 20. Database

Base:

```text
PostgreSQL
Prisma
UUID PKs
Prisma Migrate
```

Schema principal:

```text
apps/api/prisma/schema.prisma
```

---

# 21. Cambios de schema

Todo cambio de schema debe:

```text
1. modify schema.prisma
2. create migration
3. review SQL
4. add manual SQL if needed
5. apply migration locally
6. test migration
7. commit schema + migration + tests together
```

No utilizar:

```text
prisma db push
```

como solución final o flujo habitual.

---

# 22. SQL manual en migraciones

Está permitido y esperado para:

```text
partial unique indexes
CHECK constraints
PostgreSQL-specific indexes
other PostgreSQL constraints Prisma cannot fully express
```

No eliminar SQL manual por conveniencia.

---

# 23. Integridad

Las invariantes deben protegerse en la capa más fuerte correcta:

```text
DB
Application
or both
```

Consultar:

```text
docs/domain/DATA_INTEGRITY.md
```

antes de agregar:

```text
UNIQUE
CASCADE
soft delete
new derived field
new lifecycle status
```

---

# 24. Datos derivados

No persistir automáticamente:

```text
Person.status
isStudent
isPatient
expired
financial totals
```

si están documentados como derivados.

No convertir una lectura calculada en source of truth por conveniencia.

---

# 25. Delete / lifecycle

No existe soft delete universal.

No agregar automáticamente:

```text
deletedAt
```

a modelos nuevos.

Consultar:

```text
DOMAIN_MODEL.md
STATE_TRANSITIONS.md
DATA_INTEGRITY.md
```

---

# 26. Dinero

Reglas actuales:

```text
ARS
→ no decimals

USD / exchange rate
→ 2 decimals
```

DB:

```text
exact Decimal/Numeric
```

API:

```text
monetary values serialized as strings
```

No utilizar floats para cálculos monetarios críticos.

---

# 27. Tiempo

Timestamps:

```text
UTC
TIMESTAMPTZ
```

Timezone operativa:

```text
America/Argentina/Buenos_Aires
```

Date-only:

```text
PostgreSQL DATE
API YYYY-MM-DD
```

Recurring time:

```text
TIME WITHOUT TIME ZONE
API HH:mm
```

No depender de timezone del servidor/desarrollador.

---

# 28. API

Contrato:

```text
REST
/api
OpenAPI
Orval
```

No `/v1` inicialmente.

Consultar:

```text
docs/architecture/API.md
```

---

# 29. API actions

Acciones de dominio con side effects:

```text
POST /resource/:id/action
```

Ejemplos:

```text
POST /api/people/:id/inactivate
POST /api/clinic/appointments/:id/attend
POST /api/clinic/treatments/:id/finalize
```

No utilizar `PATCH status` para saltarse un Use Case.

---

# 30. Responses

Success:

```json
{
  "data": {}
}
```

Paginated:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

Error:

```json
{
  "statusCode": 409,
  "code": "SOME_STABLE_CODE",
  "message": "Human readable message",
  "details": {}
}
```

`code` es contrato programático.

---

# 31. Orval

Cuando cambia un contrato HTTP:

```bash
pnpm generate:api
```

Debe actualizar:

```text
packages/api-client
```

y los consumidores afectados.

No editar manualmente archivos generados por Orval.

---

# 32. Código generado

Regla general:

```text
generated files are not manually patched
```

Si el generated output está mal:

```text
fix generator/source contract
regenerate
```

---

# 33. Auth

Auth interno:

```text
email + password
server-side sessions
PostgreSQL session storage
HttpOnly cookies
```

Portal:

```text
DNI + 4 digit PIN
server-side sessions
separate auth routes
```

JWT no es el mecanismo principal.

---

# 34. Backend = security boundary

Nunca implementar una restricción únicamente en frontend.

```text
Frontend
→ UX gating

Backend
→ real security
```

Todo endpoint sensible debe:

```text
authenticate
authorize
validate
apply contextual domain rules
```

---

# 35. RBAC

Roles:

```text
closed enum/set
permissions derived in code
combined roles = permission union
```

No persistir permissions arbitrarias por usuario.

Consultar:

```text
docs/domain/PERMISSIONS.md
```

---

# 36. Privacidad clínica

Regla crítica.

Antes de modificar:

```text
clinical endpoints
clinical read models
clinical DTOs
clinical screens
Portal clinical views
```

leer:

```text
PERMISSIONS.md
SECURITY.md
API.md
```

Principio:

```text
return minimum necessary data
```

Nunca devolver contenido clínico completo “porque ya vino en la query”.

---

# 37. Admin no equivale a historia clínica

No asumir:

```text
Administrator
→ unrestricted clinical history
```

Seguir `PERMISSIONS.md`.

La autorización clínica debe ser explícita.

---

# 38. Portal ownership

El Portal deriva:

```text
personId
```

desde la sesión.

No confiar en:

```text
personId supplied by browser
```

para decidir ownership.

---

# 39. Security

Seguir:

```text
docs/architecture/SECURITY.md
```

Reglas clave:

```text
Argon2id
CSRF protection
explicit CORS
secure cookies
rate limiting
temporary credential rules
private S3
signed URLs
no sensitive logs
```

---

# 40. Secrets

Nunca escribir secrets reales en:

```text
code
tests
docs
logs
fixtures
screenshots
```

Si aparece una variable nueva:

```text
add to .env.example
add validation
keep real value outside git
```

---

# 41. Files

Producción:

```text
AWS S3
private bucket
```

Local:

```text
MinIO
```

DB persiste metadata, no blobs.

Downloads/views:

```text
authorized signed URL
```

No exponer bucket/key como URL pública permanente.

---

# 42. Frontend

Base:

```text
Next.js App Router
React
Tailwind CSS
shadcn/ui
Lucide
TanStack Query
TanStack Table
React Hook Form
Zod
```

No agregar Redux/Zustand inicialmente.

---

# 43. Frontend structure

Organización por feature/domain.

Ejemplo:

```text
features/
├── people/
├── sala/
├── clinic/
├── finance/
└── team/
```

No crear carpetas globales gigantes con código de todos los dominios mezclado.

---

# 44. Server Components

Server Components por defecto.

Client Components cuando exista:

```text
browser interaction
state
events
forms
TanStack Query client behavior
browser APIs
```

NestJS sigue siendo la fuente funcional.

No mover business logic a Server Actions para evitar endpoints.

---

# 45. Remote state

Utilizar:

```text
TanStack Query
```

No implementar manualmente server state mediante:

```text
useEffect + fetch
```

si la query encaja naturalmente en TanStack Query.

---

# 46. Forms

Utilizar:

```text
React Hook Form
+
Zod
```

Frontend validation mejora UX.

Backend sigue siendo autoridad.

---

# 47. Design System

Toda UI nueva debe respetar:

```text
docs/design/DESIGN_SYSTEM.md
```

No inventar:

```text
new main colors
module-specific themes
dark mode
glassmorphism
neon
large shadows
large radius everywhere
```

---

# 48. Identidad visual

Dirección:

```text
dark structural elements
light workspace
Athleta yellow accent
professional clinical/sports SaaS
```

Brand Yellow:

```text
#FCCC05
```

Sidebar:

```text
dark graphite/black
```

Primary action:

```text
yellow background
dark text
```

Semantic states usan colores propios.

---

# 49. UI reuse

Antes de crear componente visual nuevo revisar:

```text
shadcn primitive
packages/ui
existing feature pattern
```

Reutilizar cuando exista patrón real.

No crear abstracción global prematura solo por dos usos locales.

---

# 50. Testing

Seguir:

```text
docs/engineering/TESTING.md
```

Stack:

```text
Jest
Supertest
Vitest
React Testing Library
MSW
Playwright
real PostgreSQL
```

No SQLite como sustituto para tests de integración.

---

# 51. Tests con implementación

Crear/modificar tests junto con el cambio.

No dejar:

```text
tests for later
```

como flujo normal.

---

# 52. Bugs

Cuando sea razonablemente reproducible:

```text
reproduce bug
write failing regression test
implement fix
verify test passes
```

El nivel del test debe coincidir con la causa real.

---

# 53. Transactions

Las operaciones transaccionales deben tener tests que verifiquen:

```text
final persisted state
rollback
```

No alcanza con verificar que se lanzó una excepción.

---

# 54. Concurrency

Cuando una invariant sea vulnerable a race conditions, agregar test concurrente.

Ejemplos:

```text
one active SalaParticipation
one active Routine
same SalaPayment operationId retry / concurrent renewals
last Sala capacity slot
optimistic version
```

---

# 55. `test.skip` / `.only`

No utilizar para “hacer pasar CI”.

Prohibido como solución de cierre:

```text
test.skip
it.skip
describe.skip
test.only
it.only
describe.only
```

Si existe bloqueo real:

```text
report it
```

---

# 56. Assertions

No debilitar assertions únicamente para hacer pasar tests.

Actualizar un test solo si:

```text
the specification changed
or
the prior test was objectively wrong
```

y debe poder explicarse.

---

# 57. Fallos preexistentes

Si se encuentra un fallo no relacionado:

1. reportarlo;
2. verificar si preexistía cuando sea posible;
3. no silenciarlo;
4. no apropiarse del problema salvo que bloquee directamente la tarea.

---

# 58. Validación antes de finalizar

Antes de cerrar una tarea relevante ejecutar:

```bash
pnpm check
```

Además, cuando corresponda:

```bash
pnpm test:integration
pnpm test:e2e
```

Si un check aplicable falla:

```text
do not report task as complete
```

salvo que se documente claramente como fallo externo/preexistente.

---

# 59. Development workflow

Consultar:

```text
docs/engineering/DEVELOPMENT.md
```

Comandos root esperados:

```text
pnpm dev

pnpm infra:up
pnpm infra:down

pnpm db:migrate
pnpm db:migrate:create
pnpm db:reset
pnpm db:seed
pnpm db:seed:demo

pnpm generate:api

pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm check
```

---

# 60. Local infrastructure

Local:

```text
Web        3000
API        3001
Postgres   5432
MinIO      9000
MinIO UI   9001
```

Web/API corren con Node.

Docker se utiliza para dependencias locales.

---

# 61. Environments

Ambientes:

```text
development
test
staging
production
```

Mismo código.

Diferencias mediante configuración.

No business rules distintas por ambiente.

---

# 62. `.env`

Cada app posee configuración propia.

```text
apps/api/.env
apps/api/.env.example

apps/web/.env.local
apps/web/.env.example
```

No mega `.env` compartido para runtime.

---

# 63. Seeds

```text
db:seed
→ minimum required data

db:seed:demo
→ synthetic local demo data
```

Nunca ejecutar demo seed en production.

---

# 64. Datos de prueba

Solo datos sintéticos.

Nunca copiar a tests/seeds:

```text
real DNI
real names
real clinical history
real studies
real credentials
```

---

# 65. Dependencias

No agregar una nueva dependencia si el stack actual ya cubre razonablemente la necesidad.

Toda dependencia nueva debe tener una razón concreta.

Las dependencias arquitectónicas requieren aprobación explícita.

---

# 66. Package manager

Solo:

```text
pnpm
```

No generar:

```text
package-lock.json
yarn.lock
bun.lock
```

---

# 67. Upgrades

No mezclar upgrades mayores con features no relacionadas.

Separar cuando sea posible:

```text
Next major
Prisma major
Nest major
React major
```

de desarrollo funcional.

---

# 68. Generated artifacts

No editar manualmente:

```text
Orval output
other explicitly generated artifacts
```

No versionar:

```text
.next
dist
coverage
temporary build files
```

salvo decisión explícita.

---

# 69. Logging

Backend:

```text
Pino / nestjs-pino
```

No dejar `console.log` productivo.

No loguear:

```text
password
PIN
session token
clinical bodies
file contents
```

---

# 70. Audit

Operaciones sensibles deben respetar el esquema de auditoría definido.

No volcar request bodies completos en `audit_events`.

---

# 71. Coding conventions

Seguir:

```text
docs/engineering/CODING_CONVENTIONS.md
```

Principios clave:

```text
strict TypeScript
no any
thin controllers
domain-oriented naming
no generic CRUD for lifecycle operations
no premature abstraction
no scattered process.env
no generated-code edits
```

---

# 72. Existing user changes

Preservar cambios existentes no relacionados del usuario.

No ejecutar por defecto:

```text
git checkout -- .
git restore .
git reset --hard
```

si eso puede borrar trabajo ajeno.

---

# 73. Git history

No reescribir historial por defecto.

Prohibido sin instrucción explícita:

```text
git reset --hard
git push --force
rebase published branches
```

---

# 74. Commits

El agente puede crear commits únicamente cuando la tarea explícitamente lo habilite.

Si la instrucción dice:

```text
implement and commit
```

puede realizar commits.

Si no:

```text
modify files
run checks
leave working tree ready
```

No hacer commit automático por cada pequeño cambio.

---

# 75. Commit scope

Cuando se hagan commits:

- mantenerlos coherentes;
- no incluir cambios ajenos;
- incluir migration + schema + tests juntos cuando correspondan;
- usar mensajes claros.

---

# 76. Documentation updates

Actualizar documentación cuando:

```text
an approved decision changes
a new architecture decision is introduced
a workflow materially changes
a new required command/env variable appears
```

No modificar docs solo para encubrir una implementación divergente.

---

# 77. ADR

Crear ADR cuando exista una decisión significativa.

Ejemplos:

```text
introduce Redis
split AI into separate service
change storage provider
change authentication architecture
introduce event bus
```

No crear ADR para:

```text
helper names
small components
minor layout
private method organization
```

---

# 78. AI

El módulo IA no forma parte de la primera etapa técnica.

El core debe permanecer independiente de IA.

No agregar anticipadamente:

```text
LLM SDK
vector database
embeddings
AI-specific queues
AI microservice
prompt infrastructure
```

salvo tarea futura explícita.

---

# 79. IA y dominio

Cuando llegue el módulo IA:

```text
core must not depend on AI availability
```

La IA debe actuar como capacidad opcional/decoupled.

Las decisiones concretas se documentarán en ese momento.

---

# 80. Antes de empezar una tarea

Checklist:

```text
[ ] Read AGENTS.md
[ ] Read task-specific docs
[ ] Inspect existing code
[ ] Identify affected module owner
[ ] Identify permissions/privacy impact
[ ] Identify DB/API impact
[ ] Identify pending functional blockers
[ ] Identify tests to create/update
[ ] Make short plan if task is medium/large
```

---

# 81. Durante la implementación

Checklist:

```text
[ ] Keep scope focused
[ ] Respect module boundaries
[ ] Keep controllers thin
[ ] Use explicit domain actions
[ ] Use transaction where required
[ ] Preserve data integrity
[ ] Regenerate API client when contract changes
[ ] Respect design system
[ ] Add/update tests with code
[ ] Avoid secrets and real data
```

---

# 82. Antes de finalizar

Checklist:

```text
[ ] Run relevant targeted tests
[ ] Run pnpm check
[ ] Run integration tests if DB/transactions changed
[ ] Run E2E if critical workflow changed
[ ] Verify migrations
[ ] Verify generated API client
[ ] Remove temporary logs/debug code
[ ] Verify no .only/.skip introduced
[ ] Verify no real data/secrets
[ ] Review git diff for unrelated changes
```

---

# 83. Reporte final

El reporte de cierre debe ser corto y concreto.

Incluir:

```text
What changed
Important implementation notes
Migrations created
Tests/checks executed
Results
Functional/technical blockers remaining
```

No producir una explicación extensa salvo que la tarea lo requiera.

---

# 84. Si algo queda bloqueado

No afirmar:

```text
done
```

si existe una parte central bloqueada.

Indicar claramente:

```text
completed parts
blocked part
reason
required decision/input
```

---

# 85. Regla final

Cuando exista duda entre:

```text
inventing behavior
or
reporting uncertainty
```

elegir:

```text
report uncertainty
```

Cuando exista duda entre:

```text
clever abstraction
or
clear explicit code
```

elegir:

```text
clear explicit code
```

Cuando exista duda entre:

```text
fast workaround
or
protecting security/data integrity
```

elegir:

```text
security/data integrity
```

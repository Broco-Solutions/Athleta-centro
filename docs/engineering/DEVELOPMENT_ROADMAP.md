# DEVELOPMENT_ROADMAP.md — Athleta Manager

## 1. Propósito

Este documento define las fases de desarrollo de Athleta Manager, sus milestones, criterios de entrada y salida, estrategia de automatización, selección de modelos de IA y metodología de pruebas.

El objetivo es que el desarrollo pueda avanzar de forma incremental y altamente automatizada sin sacrificar:

- comportamiento funcional correcto;
- privacidad clínica;
- seguridad;
- integridad de datos;
- calidad técnica;
- consistencia visual;
- trazabilidad de decisiones.

Este documento debe utilizarse junto con:

```text
AGENTS.md

docs/architecture/
docs/domain/
docs/engineering/
docs/design/
docs/product/
```

En caso de contradicción, aplicar la jerarquía definida en `AGENTS.md`.

---

# 2. Principio de ejecución

Athleta se desarrollará mediante:

```text
milestone-driven development
+
vertical slices
+
risk-based testing
+
risk-based model routing
+
hard quality gates
```

No se construirá primero "todo el backend", luego "todo el frontend".

Cada milestone debe intentar entregar una capacidad verificable de punta a punta cuando sea razonable:

```text
domain
→ persistence
→ API
→ generated client
→ UI
→ tests
```

---

# 3. Unidad mínima de trabajo

La unidad de automatización es el:

```text
MILESTONE
```

Cada milestone debe poseer:

```text
ID
Objective
Dependencies
Relevant docs
Functional blockers
Scope
Out of scope
Recommended model tier
Required tests
Acceptance criteria
Exit commands
```

Un agente no debe empezar un milestone si sus dependencias obligatorias no están completas.

---

# 4. Estados de milestone

Estados permitidos:

```text
PLANNED
READY
IN_PROGRESS
BLOCKED
VERIFYING
DONE
```

## PLANNED

El milestone existe pero todavía no puede iniciarse.

## READY

Cumple Definition of Ready.

## IN_PROGRESS

Existe trabajo activo sobre el milestone.

## BLOCKED

Falta una definición funcional, dependencia técnica o decisión externa.

## VERIFYING

Implementación finalizada; se están ejecutando gates de calidad.

## DONE

Todos los criterios de aceptación y quality gates aplicables pasan.

---

# 5. Definition of Ready

Un milestone puede pasar a `READY` únicamente cuando:

```text
[ ] Dependencias anteriores requeridas están DONE.
[ ] No existe un PENDING_FUNCTIONAL_DEFINITION que bloquee su implementación.
[ ] Las reglas necesarias están documentadas.
[ ] Los permisos relevantes están definidos.
[ ] El alcance está suficientemente delimitado.
[ ] Los criterios de aceptación pueden verificarse.
[ ] Se identificaron los tests requeridos.
```

Si falta una definición funcional:

```text
BLOCKED
```

No inferir el comportamiento.

---

# 6. Definition of Done

Un milestone solo puede marcarse `DONE` cuando:

```text
[ ] Implementación terminada.
[ ] No se amplió el scope innecesariamente.
[ ] Tests nuevos/modificados incluidos.
[ ] Tests dirigidos pasan.
[ ] Migraciones revisadas si hubo cambios DB.
[ ] Cliente Orval regenerado si cambió API.
[ ] UI respeta DESIGN_SYSTEM.md.
[ ] Permisos se verifican en backend.
[ ] No existen secrets o datos reales.
[ ] No existen test.only/test.skip introducidos para ocultar fallos.
[ ] pnpm check pasa.
[ ] Integration/E2E adicionales pasan cuando corresponda.
[ ] Documentación fue actualizada si apareció una decisión nueva aprobada.
```

---

# 7. Metodología de desarrollo

Se utilizará una metodología híbrida:

```text
Vertical Slice Development
+
Test-First for high-risk rules
+
Test-With-Code for normal implementation
+
Milestone Gates
```

## Riesgo alto

Para:

```text
auth
permissions
clinical privacy
financial operations
transactions
concurrency
state transitions
cross-module operations
database constraints
```

preferir:

```text
write failing test
→ implement
→ pass test
→ integration verification
```

## Riesgo normal

Para:

```text
simple forms
read models
basic catalogs
UI composition
non-critical CRUD
```

los tests pueden desarrollarse junto con la implementación.

---

# 8. No waterfall

Este roadmap no significa:

```text
finish all DB
→ finish all API
→ finish all UI
```

Dentro de cada fase se construyen vertical slices pequeñas.

---

# 9. Model Routing

Para evitar usar modelos costosos en tareas mecánicas y modelos débiles en tareas críticas, la automatización debe usar tiers.

Los nombres concretos de modelos pueden cambiar con el tiempo.

Por eso el roadmap define capacidades, no un SKU fijo.

Configurar centralmente:

```text
MODEL_FAST
MODEL_STANDARD
MODEL_DEEP
MODEL_VISION
```

y mapearlos a los mejores modelos disponibles en el momento.

---

# 10. MODEL_FAST

Usar para trabajo principalmente mecánico.

Ejemplos:

```text
scaffolding
renames
boilerplate
simple CRUD after contract is defined
basic Zod schemas
simple UI components
design-token application
documentation updates
test fixture creation
straightforward refactors
```

No utilizar como modelo principal para:

```text
auth
transactions
concurrency
complex migrations
cross-module rules
clinical privacy
```

---

# 11. MODEL_STANDARD

Modelo por defecto para implementación normal.

Ejemplos:

```text
feature implementation
NestJS endpoints
Prisma repositories
forms
TanStack Query integration
read models
normal domain use cases
component tests
API integration tests
```

Debe poder comprender los documentos del proyecto y trabajar en un vertical slice completo.

---

# 12. MODEL_DEEP

Reservado para alto razonamiento/riesgo.

Utilizar en:

```text
architecture decisions
schema design
manual SQL migrations
concurrency
transaction boundaries
authorization
clinical privacy
global Person inactivation
complex state transitions
financial integrity
hard debugging
performance-sensitive DB queries
cross-module refactors
```

También se utiliza cuando un modelo inferior no logra resolver correctamente una tarea después de intentos razonables.

---

# 13. MODEL_VISION

Utilizar únicamente cuando exista valor visual real.

Ejemplos:

```text
compare implementation against reference screenshot
inspect responsive layout
detect visual inconsistency
review spacing/alignment
validate logo usage
```

No utilizar vision para verificar reglas de dominio.

---

# 14. Escalamiento de modelo

Regla recomendada:

```text
start with the lowest tier appropriate for the risk
```

Si ocurren:

```text
2 failed implementation/verification cycles
```

sobre el mismo problema técnico sin progreso claro:

```text
escalate one model tier
```

No repetir indefinidamente el mismo enfoque.

Escalar directamente a `MODEL_DEEP` si aparece:

```text
security implication
data-loss risk
transactional inconsistency
migration ambiguity
concurrency issue
clinical privacy concern
```

---

# 15. Escalamiento a humano / Analista

Ningún modelo sustituye una definición funcional.

Escalar a Analista cuando exista:

```text
PENDING_FUNCTIONAL_DEFINITION
ambiguous business rule
unknown cardinality that affects behavior
unknown permission
unknown state transition
unknown financial rule
```

El agente puede continuar con trabajo no bloqueado.

---

# 16. Loop de automatización

Para cada milestone:

```text
1. Select next READY milestone.
2. Read AGENTS.md.
3. Read milestone-relevant docs.
4. Inspect existing code.
5. Detect blockers.
6. Choose model tier.
7. Produce short implementation plan.
8. Implement smallest coherent vertical slice.
9. Add/update tests.
10. Run targeted verification.
11. Regenerate API client if required.
12. Verify DB migration if required.
13. Run pnpm check.
14. Run additional integration/E2E gates.
15. Fix failures caused by the change.
16. Mark VERIFYING.
17. If all gates pass → DONE.
18. Produce concise completion report.
```

---

# 17. Failure policy

Si una verificación falla:

## Fallo causado por el cambio

```text
fix
re-run targeted test
re-run affected gate
```

## Fallo preexistente

```text
document
verify when possible
do not disable
do not silently claim success
```

## Fallo funcional ambiguo

```text
BLOCKED
```

## Riesgo de datos/seguridad

```text
stop affected implementation
escalate
```

---

# 18. Matriz de testing por tipo de cambio

| Cambio | Tests mínimos |
|---|---|
| Regla pura de dominio | Unit |
| Use Case | Unit + negative scenario |
| Repository / Prisma query | PostgreSQL Integration |
| Constraint DB | Direct PostgreSQL Integration |
| Transaction | Integration + rollback verification |
| Concurrency | Concurrent PostgreSQL Integration |
| API endpoint | Supertest integration |
| Permission | Permission Unit + API authorization |
| Clinical privacy | API response non-exposure tests |
| React component | Vitest + React Testing Library |
| TanStack Query flow | RTL + MSW |
| Critical user workflow | Playwright |
| DB migration | Apply from clean PostgreSQL |
| OpenAPI change | generate:api + drift check |
| File adapter | Integration / adapter tests |
| Production deploy | Smoke test |

---

# 19. Quality gates

## Gate A — local implementation

Antes de considerar una implementación lista para integración:

```bash
pnpm lint
pnpm typecheck
```

más tests dirigidos.

## Gate B — milestone

```bash
pnpm check
```

## Gate C — DB-sensitive milestone

Además:

```bash
pnpm test:integration
```

y migraciones desde DB limpia.

## Gate D — critical workflow

Además:

```bash
pnpm test:e2e
```

o subset Playwright correspondiente.

## Gate E — release candidate

```text
full automated suite
migration verification
staging smoke
manual/UAT checklist
security/privacy review
```

---

# 20. FASE 0 — Bootstrap técnico

## Objetivo

Crear una base técnica reproducible sin implementar todavía lógica funcional profunda.

### M0.1 — Monorepo foundation

**Model:** `MODEL_STANDARD`

Scope:

```text
pnpm workspace
Turborepo
apps/web
apps/api
packages/*
shared TypeScript config
shared ESLint
Prettier
root scripts
```

Acceptance:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

funcionan.

---

### M0.2 — Local infrastructure

**Model:** `MODEL_STANDARD`

Scope:

```text
compose.yaml
PostgreSQL
MinIO
automatic local bucket init
env examples
Zod configuration validation
```

Acceptance:

```bash
pnpm infra:up
```

deja PostgreSQL y storage listos sin pasos manuales.

---

### M0.3 — Backend foundation

**Model:** `MODEL_STANDARD`

Scope:

```text
NestJS base
Pino
request IDs
global validation
error envelope
CORS
health endpoint
Prisma integration
```

Acceptance:

```text
GET /health → 200
API starts with validated env
invalid env fails fast
```

---

### M0.4 — Frontend foundation

**Model:** `MODEL_STANDARD`

Scope:

```text
Next.js App Router
Tailwind
shadcn/ui foundation
design tokens
sidebar/layout shell
Inter
Lucide
TanStack Query provider
```

Acceptance:

```text
Athleta visual shell renders
responsive baseline works
DESIGN_SYSTEM tokens are centralized
```

Use `MODEL_VISION` for final visual review if useful.

---

### M0.5 — OpenAPI / Orval pipeline

**Model:** `MODEL_STANDARD`

Scope:

```text
OpenAPI generation
stable operationIds
Orval config
packages/api-client
pnpm generate:api
```

Acceptance:

```bash
pnpm generate:api
```

runs deterministically and generated client can be consumed by web.

---

### M0.6 — Testing foundation

**Model:** `MODEL_STANDARD`

Scope:

```text
Jest
Supertest
Vitest
React Testing Library
MSW
Playwright
Testcontainers or equivalent PG integration setup
test factories base
```

Acceptance:

At least one passing example of:

```text
backend unit
backend integration
API test
frontend component test
Playwright smoke
```

---

### GATE 0

Phase complete when:

```text
pnpm infra:up
pnpm db:migrate
pnpm generate:api
pnpm check
pnpm test:integration
pnpm test:e2e
```

can execute successfully on the bootstrap project.

---

# 21. FASE 1 — Identity, Auth, Team y People

## Objetivo

Construir las identidades base sobre las que dependen el resto de módulos.

---

### M1.1 — InternalUser + roles

**Model:** `MODEL_DEEP`

Scope:

```text
InternalUser
InternalUserRole
Role enum
effective permissions
active/inactive lifecycle
```

Tests:

```text
permission unit matrix
PostgreSQL persistence
unique normalized email
```

---

### M1.2 — Internal authentication

**Status:** `DONE`

**Model:** `MODEL_DEEP`

Scope:

```text
InternalCredential
Argon2id
server-side sessions
login
logout
GET /auth/session
temporary credential behavior
change password
session invalidation
rate limiting base
CSRF
```

Tests:

```text
auth unit
API integration
session expiration/revocation
security-negative tests
```

E2E:

```text
login
logout
forced password change
```

---

### M1.3 — People base

**Status:** `DONE`

**Model:** `MODEL_STANDARD`

Scope:

```text
Person
create
update general data
search
detail read model
DNI normalization
derived contextual status support
```

Important:

```text
DNI uniqueness is confirmed. Enforce uniqueness on the centralized normalized representation.
```

Tests:

```text
normalization
search
API validation
read model privacy
```

---

### M1.4 — Team management

**Status:** DONE

**Model:** `MODEL_DEEP`

Scope:

```text
list users
create internal user
add role
remove role
activate/inactivate user
permission-controlled operations
```

Use Cases must enforce documented preconditions.

---

### M1.5A — Portal credentials foundation

**Status:** DONE

Portal credentials are provisioned atomically with Person creation and can be
reset by authorized internal users. PINs are Argon2id-hashed and returned only
once from create/reset responses. Portal authentication is split into M1.5B and
remains blocked until M6.1 derives Person activity.

**Model:** `MODEL_DEEP`

Scope:

```text
PortalCredential
4 digit PIN
Argon2id
Portal sessions
login/logout/session
PIN reset
mustChangePin
brute-force protection
```

No Portal business screens yet.

---

### M1.5B — Portal authentication

**Status:** BLOCKED_BY_DEPENDENCY

**Dependencies:** M1.5A and M6.1 (derived Person status).

Portal login, sessions, PIN changes, and ACTIVE enforcement remain deferred
until the real Sala, Clinic, and Treatment activity sources exist.

---

### GATE 1

Required:

```text
Internal authentication stable
RBAC verified via HTTP
People base usable
Portal credentials foundation stable (M1.5A)
Playwright auth flows pass
```

---

# 22. FASE 2 — Sala Core

## Objetivo

Construir el circuito operativo principal de Sala sin depender de Clínica más allá de interfaces contractuales.

---

### M2.1 — Sala configuration

**Status:** DONE

**Model:** `MODEL_STANDARD`

Scope:

```text
Plans
schedule slots
capacity
schedule exceptions
relevant catalogs/config
```

Tests:

```text
date/time behavior
validation
PostgreSQL queries
```

---

### M2.2 — Sala participation

**Status:** DONE

**Model:** `MODEL_DEEP`

Scope:

```text
JoinSala
LeaveSala
one active participation
plan
professor
current weekly assignment
historical periods
```

Tests:

```text
unit
partial unique constraint
transaction
concurrency
```

---

### M2.3 — Fixed and one-off bookings

**Status:** DONE

**Model:** `MODEL_DEEP`

Scope:

```text
FixedSalaBooking
OneOffReservation
date exceptions
availability
capacity
internal overbooking
```

Tests:

```text
capacity
overbooking permission/context
concurrent last-slot booking
date boundaries
```

---

### M2.4 — Sala occurrences and attendance

**Model:** `MODEL_STANDARD`

Scope:

```text
SalaOccurrence
RESERVED
ATTENDED
CANCELLED
ABSENT
manual attendance corrections
```

No automatic absence conversion.

---

### M2.5 — Routines

**Model:** `MODEL_DEEP`

Scope:

```text
ExerciseDefinition
Routine
RoutineDay
RoutineExercise
ReplaceRoutine
one active Routine
historical previous routine
```

Tests:

```text
state transition
transaction
constraint
concurrency
```

---

### M2.6 — Physical evaluations

**Model:** `MODEL_STANDARD`

Scope:

```text
PhysicalTestDefinition
PhysicalEvaluation
PhysicalTestResult
historical results
```

Must remain separate from ClinicalEvaluation.

---

### M2.7 — Sala payment

**Model:** `MODEL_DEEP`

Scope:

```text
SalaPayment
MonthYear
cash date
operationId
amount exactness
one payment Person+MonthYear under current model
```

Tests:

```text
idempotency
concurrency
financial exactness
permissions
```

---

### M2.8 — Sala user interface

**Model:** `MODEL_STANDARD`

Scope:

```text
Sala dashboard
schedule
bookings
attendance
participation
routine
physical evaluation
payments
```

Use `MODEL_VISION` for responsive/design review.

---

### GATE 2

Required E2E candidates:

```text
join Sala
create reservation
register attendance
replace routine
register Sala payment
```

All capacity and active-participation constraints must pass real PostgreSQL tests.

---

# 23. FASE 3 — Clínica Core

## Objetivo

Construir el circuito clínico respetando estrictamente privacidad, autoría e historia.

Algunos milestones pueden permanecer `BLOCKED` hasta cerrar cardinalidades pendientes con Analista.

---

### M3.1 — Clinical appointments

**Model:** `MODEL_DEEP`

Scope:

```text
ClinicalAppointment
SCHEDULED
ATTENDED
CANCELLED
ABSENT
create
reschedule
cancel
mark absent
```

Tests:

```text
professional validity
authorization
time ranges
state transitions
```

---

### M3.2 — Appointment → Attention workflow

**Model:** `MODEL_DEEP`

Potential blocker:

```text
Appointment ↔ Attention cardinality
```

Do not finalize constraints until confirmed.

Scope when READY:

```text
MarkAppointmentAttended
ClinicalAttention creation
atomic transaction
correction from ATTENDED
dependency checks
```

Tests:

```text
transaction
rollback
state correction
```

---

### M3.3 — Treatments

**Model:** `MODEL_DEEP`

Scope:

```text
Treatment
IN_PROGRESS
FINISHED
responsible professional
FinalizeTreatment
ReopenTreatment
```

Tests:

```text
professional validity
transition rules
warnings for active Sala indications
optimistic concurrency when applicable
```

---

### M3.4 — Evolutions

**Model:** `MODEL_DEEP`

Potential blocker:

```text
Attention ↔ Evolution multiplicity
```

Scope:

```text
Evolution
author
occurredAt
version
edit rules
```

Clinical privacy tests mandatory.

---

### M3.5 — Clinical evaluations

**Model:** `MODEL_DEEP`

Potential blocker:

```text
Attention ↔ ClinicalEvaluation multiplicity
```

Scope:

```text
ClinicalEvaluation
ClinicalTestResult
versioned test definition snapshot
measurement methods
```

Do not implement AI here yet.

---

### M3.6 — Studies and files

**Model:** `MODEL_DEEP`

Potential blocker:

```text
ClinicalStudy ↔ FileAsset cardinality
```

Scope:

```text
ClinicalStudy
FileAsset
multipart upload
MIME + magic byte validation
private S3
signed access URL
compensation behavior
```

Tests:

```text
file authorization
storage adapter
DB/S3 compensation
privacy
```

---

### M3.7 — Social work

**Model:** `MODEL_STANDARD`

Scope:

```text
SocialWork
SocialWorkOrder
expiration derived
clinical association
```

---

### M3.8 — Sala clinical indications

**Model:** `MODEL_DEEP`

Scope:

```text
SalaClinicalIndication
ACTIVE/CLOSED
Clinic owns content
Sala consumes restricted projection
close indication
```

Tests:

```text
full clinical actor sees content
Professor sees only allowed Sala projection
Administrative cannot read history
```

---

### M3.9 — Clinical UI

**Model:** `MODEL_STANDARD`

Scope:

```text
agenda
appointments
attention
treatments
evolutions
evaluations
studies
indications
```

Use `MODEL_VISION` for visual/responsive review.

No separate "hospital blue" theme.

---

### GATE 3

Mandatory:

```text
clinical authorization matrix passes
clinical DTO non-exposure tests pass
appointment→attention transaction verified
critical Clinical workflows pass Playwright
files remain private
```

---

# 24. FASE 4 — Finanzas

## Objetivo

Unificar consultas financieras sin mezclar la propiedad de los movimientos de Sala/Clínica.

---

### M4.1 — Expenses

**Model:** `MODEL_STANDARD`

Scope:

```text
Expense
ExpenseCategory
PaymentMethod
operationId where relevant
cash date
```

Tests:

```text
permissions
idempotency
amount exactness
```

---

### M4.2 — Clinical income

**Model:** `MODEL_DEEP`

Scope:

```text
ClinicalIncome
relation to clinical operation
cash date
payment method
exact money
```

Functional details must be confirmed before implementation if ambiguity remains.

---

### M4.3 — Unified financial read model

**Model:** `MODEL_DEEP`

Scope:

```text
Sala payments
Clinical income
Expenses
filters
totals
cash-date criterion
```

Do not merge source entities into one universal financial table.

---

### M4.4 — Financial dashboard

**Model:** `MODEL_STANDARD`

Scope:

```text
operational view
executive view
filters
totals
permission-aware dashboard
```

Tests:

```text
FINANCE_OPERATIONAL_READ
FINANCE_EXECUTIVE_READ
aggregation correctness
date boundaries
```

---

### GATE 4

Mandatory:

```text
all monetary values exact
finance permission split verified
aggregation tests against PostgreSQL pass
```

---

# 25. FASE 5 — Portal

## Objetivo

Entregar autoservicio simple y mobile-first para Persona.

Portal authorization is ownership-based, not InternalUser RBAC.

---

### M5.1 — Portal shell

**Model:** `MODEL_STANDARD`

Scope:

```text
mobile-first layout
navigation
session bootstrap
design system
```

Use `MODEL_VISION` for mobile review.

---

### M5.2 — Portal profile

**Model:** `MODEL_STANDARD`

Scope:

```text
GET /portal/me
safe self data
credential change
```

---

### M5.3 — Sala Portal

**Model:** `MODEL_DEEP`

Scope:

```text
own reservations
available slots
create/cancel reservation
capacity
ownership
```

No internal overbooking.

---

### M5.4 — Clinical Portal

**Model:** `MODEL_DEEP`

Scope:

```text
own future appointments
cancel when allowed
view only permitted self-service data
```

Must not expose internal clinical history unless explicitly defined.

---

### GATE 5

Playwright mobile-first workflows:

```text
Portal login
view own Sala reservations
create/cancel allowed reservation
view own clinical appointments
cancel allowed appointment
cannot access another Person resource
```

---

# 26. FASE 6 — Operaciones transversales

## Objetivo

Implementar operaciones que solo pueden finalizarse correctamente cuando varios módulos existen.

---

### M6.1 — Derived Person status

**Model:** `MODEL_DEEP`

**Dependencies:** M2.2 Sala Participation, M3.1 Clinical Appointments, and
M3.3 Treatments.

Scope:

```text
active Sala participation
active clinical treatment
future scheduled clinical appointment
→ derived Person ACTIVE/INACTIVE
```

No persist `Person.status` as source of truth.

---

### M6.2 — Global Person inactivation

**Model:** `MODEL_DEEP`

Scope:

```text
InactivatePersonUseCase
People
Sala
Clinic
Auth/Portal
future reservations
future appointments
active participation/treatment implications
```

Exact consequences must follow confirmed functional definition.

Tests:

```text
multi-module transaction
rollback
permission
negative scenarios
```

---

### M6.3 — InternalUser inactivation / role removal preconditions

**Model:** `MODEL_DEEP`

Scope:

```text
professor assignments
clinical professional responsibilities
General Admin protections
session invalidation
```

Tests mandatory for each documented blocking condition.

---

### M6.4 — Cross-module read models

**Model:** `MODEL_STANDARD`

Scope:

```text
Home dashboard
Person contextual summary
alerts
pending actions
```

Do not create a giant aggregate.

---

### GATE 6

Required:

```text
cross-module use cases atomic where required
rollback tests pass
no hidden side effects
Person derived status consistent
```

---

# 27. FASE 7 — Seguridad, auditoría y hardening

## Objetivo

Completar controles transversales antes del UAT final.

---

### M7.1 — Audit events

**Model:** `MODEL_DEEP`

Scope:

```text
append-only audit_events
selected sensitive operations
actor
target
sanitized metadata
```

No request body dumps.

---

### M7.2 — Auth hardening

**Model:** `MODEL_DEEP`

Review:

```text
rate limiting
progressive lockouts
CSRF
CORS
session expiry
sliding renewal
session revocation
temporary credentials
generic auth errors
```

---

### M7.3 — Clinical privacy review

**Model:** `MODEL_DEEP`

Systematic endpoint review:

```text
role
permission
DTO
field exposure
logs
files
Portal
```

---

### M7.4 — File security review

**Model:** `MODEL_DEEP`

Verify:

```text
private buckets
short-lived URLs
MIME
magic bytes
size limits
authorization
orphan compensation
```

---

### M7.5 — Observability baseline

**Model:** `MODEL_STANDARD`

Scope:

```text
Pino
request IDs
Sentry sanitization
health
provider metrics
useful error context
```

No Prometheus/Grafana/OTel stack in V1.

---

### GATE 7

Security-sensitive integration suites must pass.

No unresolved high-risk security/privacy issues.

---

# 28. FASE 8 — UX completion y design consistency

## Objetivo

Homogeneizar la aplicación antes de UAT.

---

### M8.1 — Shared UI consolidation

**Model:** `MODEL_STANDARD`

Review patterns:

```text
PageHeader
DataTable
StatusBadge
ConfirmActionDialog
EmptyState
FormSection
```

Only abstract patterns proven to repeat.

---

### M8.2 — Responsive pass

**Model:** `MODEL_VISION` + `MODEL_STANDARD`

Review:

```text
internal desktop
tablet
Portal mobile
forms
tables
dialogs
navigation
```

---

### M8.3 — Accessibility pass

**Model:** `MODEL_STANDARD`

Review:

```text
labels
keyboard navigation
focus
dialogs
button semantics
contrast
touch targets
```

---

### M8.4 — Copy and error UX

**Model:** `MODEL_FAST` / `MODEL_STANDARD`

Review:

```text
Spanish UI labels
domain error handling
empty states
confirmations
no technical error leakage
```

---

### GATE 8

Visual consistency review must confirm:

```text
no module-specific theme drift
brand yellow used as accent
semantic states consistent
responsive critical pages usable
```

---

# 29. FASE 9 — System Integration, Regression y UAT

## Objetivo

Demostrar que el sistema completo funciona como producto y no solo como módulos aislados.

---

### M9.1 — Full regression suite

**Model:** automation

Run:

```text
unit
integration
API
frontend
E2E
migration-from-clean-DB
build
```

---

### M9.2 — Cross-module E2E

**Model:** `MODEL_STANDARD` for test implementation

Scenarios should cover combinations such as:

```text
create Person
join Sala
reserve
attend
register payment

create ClinicalAppointment
mark attended
create clinical record
create income

Portal accesses only own data
```

Exact scenarios must reflect confirmed business rules.

---

### M9.3 — UAT dataset

**Model:** `MODEL_FAST`

Create synthetic but realistic dataset.

No production data.

Must support analyst/client testing across:

```text
roles
Sala
Clinic
Finance
Portal
```

---

### M9.4 — UAT execution

**Owner:** Human / Analyst / Client

Automation can prepare:

```text
checklists
environment
seed data
bug templates
reproduction scripts
```

It cannot decide whether an ambiguous business workflow is accepted.

---

### M9.5 — Bug stabilization

For every reproducible bug:

```text
regression test
fix
verification
```

No large unrelated refactors during stabilization unless necessary.

---

### GATE 9

UAT exit:

```text
No blocker defects
No critical privacy/security defects
Critical user flows accepted
Known minor issues documented
Regression suite green
```

---

# 30. FASE 10 — Production readiness

## Objetivo

Preparar una release controlada.

---

### M10.1 — Staging release pipeline

**Model:** `MODEL_DEEP`

Verify:

```text
GitHub Actions
Vercel
Railway API
Railway PostgreSQL
AWS S3
prisma migrate deploy
environment separation
```

---

### M10.2 — Backup / restore validation

**Model:** `MODEL_DEEP`

Required:

```text
automatic daily PostgreSQL backup
target 30-day retention
documented restore
actual restore test
S3 versioning/protection
```

A backup that has never been restored is not considered verified.

---

### M10.3 — Production configuration review

**Model:** `MODEL_DEEP`

Review:

```text
domains
CORS
cookies
TLS
secrets
Sentry
storage
rate limits
Swagger restriction
health checks
```

---

### M10.4 — Release candidate smoke

**Model:** automation

Staging smoke:

```text
web loads
API health
internal login
Portal login
critical reads
safe representative mutation
file access
```

---

### M10.5 — Production deploy

**Owner:** controlled human-triggered automation

Sequence:

```text
verify CI green
verify backup
deploy/release migration
deploy API
deploy web
run production-safe smoke
monitor Sentry/logs
```

---

### GATE 10

Production considered stable when:

```text
deployment successful
smoke passes
no high-severity errors
migrations healthy
monitoring healthy
rollback/restore path known
```

---

# 31. FASE 11 — IA (futura, separada)

## Estado

```text
NOT READY
OUT OF CURRENT CORE SCOPE
```

No iniciar hasta que:

```text
core system is stable
clinical domain is validated
permissions/privacy are mature
AI functional requirements are defined
```

---

# 32. AI phase prerequisites

Antes de diseñar el módulo IA se deberá crear documentación específica para:

```text
AI use cases
data boundaries
approved clinical library
prompt/agent architecture
model routing
evaluation dataset
quality metrics
human confirmation
privacy
cost/latency
failure behavior
```

El core Athleta no debe depender de disponibilidad de IA.

---

# 33. Orden de fases

Orden recomendado:

```text
PHASE 0  Bootstrap
   ↓
PHASE 1  Identity/Auth/Team/People
   ↓
PHASE 2  Sala Core
   ↓
PHASE 3  Clínica Core
   ↓
PHASE 4  Finanzas
   ↓
PHASE 5  Portal
   ↓
PHASE 6  Cross-module operations
   ↓
PHASE 7  Security/Hardening
   ↓
PHASE 8  UX consistency
   ↓
PHASE 9  Integration/UAT
   ↓
PHASE 10 Production
   ↓
PHASE 11 AI — future independent track
```

Some milestones can overlap only when dependencies and domain boundaries make that safe.

---

# 34. Paralelización

Safe parallelization examples:

```text
Sala UI work
+
independent backend read model

Clinic UI shell
+
Finance expense implementation
```

Unsafe parallelization:

```text
two agents editing same migration chain
two agents changing auth/session architecture
two agents changing same shared API contracts
parallel work on unresolved cardinality
```

---

# 35. Reglas para múltiples agentes

When multiple agents work concurrently:

```text
one milestone owner
clear file/module ownership
avoid overlapping migrations
avoid modifying same generated client from divergent API branches
synchronize shared package changes
```

High-risk shared infrastructure should have one active owner at a time.

---

# 36. Selección automática del próximo milestone

Un orchestrator puede elegir automáticamente el próximo milestone si:

```text
status == READY
dependencies == DONE
functional blockers == none
```

Prioridad sugerida:

```text
1. blocks the most future work
2. highest business value
3. highest risk to validate early
4. smallest coherent vertical slice
```

No seleccionar únicamente por facilidad.

---

# 37. Priorización del riesgo

Validar temprano:

```text
sessions
RBAC
Person identity
PostgreSQL constraints
Sala capacity
Clinical privacy
transaction model
money representation
file privacy
```

Errores en estas áreas son más costosos si se descubren al final.

---

# 38. Milestone report estándar

Al finalizar cada milestone, producir:

```text
Milestone:
Status:

Implemented:
- ...

Files/modules affected:
- ...

Migrations:
- ...

API changes:
- ...

Tests executed:
- ...

Quality gates:
- ...

Known blockers:
- ...

Next eligible milestone:
- ...
```

---

# 39. Automatización CI recomendada

## Pull request / change validation

```text
install
lint
typecheck
unit tests
frontend tests
clean PostgreSQL
migrate deploy/test
integration/API tests
build
generated client drift
critical E2E when applicable
```

---

# 40. Automatización post-deploy

Staging:

```text
health
web availability
auth smoke
API smoke
Sentry check
```

Production:

```text
production-safe smoke only
```

Never run destructive test suites against production.

---

# 41. Métricas del desarrollo

No medir progreso únicamente por:

```text
lines of code
number of endpoints
number of screens
```

Preferir:

```text
milestones DONE
critical flows green
regression rate
escaped bugs
test stability
UAT acceptance
blocked functional decisions
```

---

# 42. Criterio para detener automatización

La automatización debe detener el milestone si:

```text
functional rule is ambiguous
migration may destroy data unexpectedly
security/privacy requirement is unclear
tests expose contradictory specification
required dependency is unavailable
agent needs an unapproved architectural change
```

No "resolver" estos casos automáticamente.

---

# 43. Criterio para autonomía total

El agente puede avanzar sin intervención humana cuando:

```text
scope is documented
business behavior is confirmed
architecture is already decided
tests can verify outcome
no security ambiguity exists
no external credential/input is required
```

---

# 44. Qué no automatizar sin control humano

Mantener intervención humana en:

```text
functional ambiguity decisions
production destructive operations
production credential creation
first production admin provisioning
final UAT acceptance
architecture changes
production release approval
AI clinical behavior definition
```

---

# 45. Roadmap completion definition

El core V1 se considera finalizado cuando:

```text
PHASES 0–10 gates are complete
```

y:

```text
all critical workflows accepted
security/privacy hardening complete
production release stable
functional blockers affecting V1 resolved
```

La fase IA no forma parte de la definición de Done del core V1.

---

# 46. Resumen operativo

```text
DOCUMENT
→ defines behavior

MILESTONE
→ defines scope

MODEL ROUTING
→ assigns adequate reasoning level

VERTICAL SLICE
→ implements capability end-to-end

TEST MATRIX
→ validates at correct layer

QUALITY GATE
→ prevents false completion

UAT
→ validates business behavior

PRODUCTION GATE
→ validates operational readiness
```

---

# 47. Regla final

La automatización de Athleta debe optimizar:

```text
reliable progress
```

no:

```text
maximum amount of generated code
```

Un milestone pequeño, validado y terminado vale más que una fase completa implementada sin pruebas, sin definiciones funcionales o con deuda oculta.

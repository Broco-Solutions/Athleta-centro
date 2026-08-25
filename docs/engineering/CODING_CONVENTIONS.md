# CODING_CONVENTIONS.md — Athleta Manager

## 1. Propósito

Este documento define las convenciones de desarrollo de Athleta Manager.

Su objetivo es mantener un código:

- simple;
- explícito;
- mantenible;
- tipado;
- coherente entre módulos;
- alineado con el dominio;
- fácil de extender por desarrolladores y agentes de código.

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

docs/engineering/TESTING.md
```

No redefine reglas funcionales.

Cuando exista conflicto entre una convención de este documento y una regla de dominio confirmada, prevalece la regla de dominio.

---

# 2. Principio general

Se priorizará:

```text
readability
predictability
type safety
domain clarity
```

por encima de abstracciones sofisticadas o patrones prematuros.

Athleta no debe convertirse en un framework interno.

No introducir abstracciones genéricas únicamente para reducir algunas líneas de código.

---

# 3. Evitar abstracciones prematuras

No crear sin necesidad concreta:

```text
GenericBaseRepository<T>
AbstractCrudService<T>
UniversalEntityManager
GenericController<T>
BaseDomainService<T>
```

Estas abstracciones suelen:

- ocultar reglas de negocio;
- dificultar debugging;
- diluir ownership de dominio;
- generar acoplamiento innecesario.

Una abstracción debe aparecer después de identificar una repetición real y estable.

---

# 4. Monorepo

La estructura general del proyecto será:

```text
athleta/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── api-client/
│   ├── contracts/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
├── docs/
└── AGENTS.md
```

Cada app/package debe mantener una responsabilidad clara.

---

# 5. TypeScript

Todo el proyecto utilizará:

```text
TypeScript
```

con:

```text
strict: true
```

en todo el monorepo.

No desactivar strictness global o localmente para evitar resolver errores reales de tipos.

---

# 6. `any`

El uso de:

```ts
any
```

queda prohibido salvo casos excepcionales, justificados y documentados.

Preferir:

```ts
unknown
```

seguido de validación o narrowing.

Ejemplo:

```ts
const payload: unknown = externalInput;
const parsed = schema.parse(payload);
```

---

# 7. Type assertions

Minimizar:

```ts
value as SomeType
```

y especialmente evitar:

```ts
value as unknown as SomeType
```

cuando se utilice solamente para silenciar TypeScript.

Una assertion solo es válida cuando:

- el código realmente garantiza la condición;
- TypeScript no puede inferirla;
- la assertion es más clara que introducir una abstracción compleja.

---

# 8. Null vs undefined

Convención:

```text
undefined
→ valor no enviado / ausente en input TypeScript

null
→ ausencia explícita con significado
```

Para campos nullable de PostgreSQL/Prisma se utilizará naturalmente:

```text
null
```

No alternar ambos valores arbitrariamente.

---

# 9. Naming técnico

El código técnico utilizará inglés.

Ejemplos:

```text
Persona
→ Person

Turno clínico
→ ClinicalAppointment

Atención
→ ClinicalAttention

Tratamiento
→ Treatment
```

La interfaz continúa siendo en español.

---

# 10. Naming de archivos

Preferencia:

```text
kebab-case
```

Ejemplos:

```text
mark-appointment-attended.use-case.ts
clinical-appointment.controller.ts
create-person.schema.ts
treatment.repository.ts
```

Los componentes React pueden utilizar:

```text
PascalCase.tsx
```

si la convención del proyecto lo hace más clara.

La convención debe mantenerse consistente.

---

# 11. Naming de clases

Usar nombres con responsabilidad explícita.

Ejemplos:

```text
MarkAppointmentAttendedUseCase
TreatmentRepository
ClinicalAppointmentController
ProfessorHasAssignedStudentsError
```

Evitar:

```text
Manager
Handler
Helper
Processor
Service
```

sin contexto claro.

---

# 12. Naming de operaciones

Cuando una acción represente comportamiento de negocio, utilizar verbos de dominio.

Preferir:

```text
joinSala()
leaveSala()
replaceRoutine()
finalizeTreatment()
reopenTreatment()
markAppointmentAttended()
inactivatePerson()
```

sobre:

```text
updateSala()
updateRoutine()
updateTreatment()
updatePerson()
```

cuando el cambio tenga consecuencias funcionales.

---

# 13. Backend modular

La aplicación NestJS utilizará módulos de dominio.

Ejemplo:

```text
apps/api/src/modules/
├── auth/
├── team/
├── people/
├── sala/
├── clinic/
├── finance/
├── portal/
├── files/
└── audit/
```

Los módulos no representan microservicios.

---

# 14. Estructura interna de módulo NestJS

Estructura recomendada cuando el tamaño del módulo lo justifique:

```text
clinic/
├── presentation/
│   ├── controllers/
│   └── schemas/
├── application/
│   ├── use-cases/
│   └── services/
├── domain/
│   ├── errors/
│   ├── rules/
│   └── types/
├── infrastructure/
│   └── repositories/
└── clinic.module.ts
```

No crear carpetas vacías para cumplir una estructura teórica.

---

# 15. Presentation Layer

Responsabilidades:

```text
HTTP
validation
authentication/authorization declaration
serialization
```

Debe contener:

```text
controllers
HTTP schemas
presenters/serializers when useful
```

No debe contener lógica de negocio.

---

# 16. Controllers

Los Controllers deben ser delgados.

Responsabilidades:

```text
receive request
validate request
obtain authenticated principal
delegate authorization to guards/policies
call use case/service
return response
```

No deben contener:

```text
Prisma queries
manual transactions
business branching
complex calculations
cross-module orchestration
```

---

# 17. Controller example

Preferir:

```ts
@Post(':id/attend')
@RequirePermission(Permission.CLINIC_APPOINTMENT_MANAGE)
async attend(
  @Param('id') id: string,
  @CurrentUser() user: AuthenticatedUser,
) {
  return this.markAppointmentAttended.execute({
    appointmentId: id,
    actorId: user.id,
  });
}
```

No:

```ts
@Post(':id/attend')
async attend(@Param('id') id: string) {
  const appointment = await this.prisma.clinicalAppointment.findUnique(...);

  if (...) {
    ...
  }

  await this.prisma.clinicalAppointment.update(...);
  await this.prisma.clinicalAttention.create(...);
}
```

---

# 18. Application Layer

La Application Layer coordina casos de uso.

Responsabilidades:

```text
business operation orchestration
transaction boundaries
cross-module calls through public APIs
domain error propagation
authorization preconditions when contextual
```

---

# 19. Use Cases

Crear Use Cases explícitos para operaciones de negocio relevantes.

Ejemplos:

```text
JoinSalaUseCase
LeaveSalaUseCase
ReplaceRoutineUseCase
MarkAppointmentAttendedUseCase
CorrectAttendedAppointmentUseCase
FinalizeTreatmentUseCase
ReopenTreatmentUseCase
InactivatePersonUseCase
```

---

# 20. No Use Case por lectura trivial

No es obligatorio crear:

```text
GetPaymentMethodByIdUseCase
ListExpenseCategoriesUseCase
```

si un Application Service/query service simple es suficiente.

No convertir el código en ceremonial DDD.

---

# 21. Application Services

Utilizar Application Services cuando agrupen operaciones relacionadas o queries que no justifican una clase Use Case individual.

Ejemplo:

```text
SalaQueryService
FinanceReadService
PeopleSearchService
```

Deben seguir respetando boundaries.

---

# 22. Domain Layer

El Domain Layer contiene reglas de negocio independientes de transporte e infraestructura.

Puede contener:

```text
domain errors
pure rules
value objects
domain-specific types
invariant helpers
```

No debe importar:

```text
NestJS controllers
PrismaClient
HTTP request types
React
```

---

# 23. Domain Rules

Preferir reglas con nombres funcionales.

Ejemplo:

```ts
canRemoveClinicalRole(...)
isPersonDeletable(...)
calculatePersonStatus(...)
validateResponsibleProfessional(...)
```

No esconder comportamiento dentro de helpers genéricos sin semántica.

---

# 24. Infrastructure Layer

Infrastructure contiene adaptadores técnicos.

Ejemplos:

```text
Prisma repositories
S3 adapters
external service clients
logging adapters
```

No debe decidir reglas funcionales.

---

# 25. Prisma

Prisma debe utilizarse en:

```text
infrastructure
persistence-oriented query services
```

No utilizar Prisma directamente desde:

```text
Controller
domain rule
frontend
shared contracts
```

---

# 26. Repositories

Los repositories se utilizarán cuando aporten una frontera real.

Casos apropiados:

```text
aggregate persistence
complex persistence logic
domain-specific query
test isolation
optimistic concurrency
transaction-aware persistence
```

---

# 27. No repository boilerplate

No crear obligatoriamente wrappers de una línea como:

```ts
class PaymentMethodRepository {
  findAll() {
    return prisma.paymentMethod.findMany();
  }
}
```

si no agregan semántica, aislamiento o comportamiento.

Queries triviales pueden vivir en servicios de infraestructura o lectura bien delimitados.

---

# 28. Repository naming

Utilizar nombres de dominio.

Ejemplo:

```text
TreatmentRepository
SalaParticipationRepository
ClinicalAppointmentRepository
```

Métodos:

```text
findActiveByPersonId()
findFutureScheduledByProfessional()
save()
findForUpdate()
```

Preferir métodos con intención sobre wrappers directos de Prisma.

---

# 29. Cross-module access

Un módulo no debe acceder directamente a repositories privados o tablas privadas de otro módulo.

Permitido:

```text
People
→ ClinicPublicService
```

No permitido:

```text
People
→ clinic/infrastructure/treatment.repository
```

---

# 30. APIs públicas de módulo

Cada módulo puede exponer servicios explícitos a otros módulos.

Ejemplo:

```text
ClinicPublicService
SalaPublicService
AuthSessionService
```

Estas APIs deben ser pequeñas y basadas en capacidades, no una exposición indiscriminada del módulo interno.

---

# 31. Transactions

La Application Layer define el límite transaccional cuando una operación afecta varias entidades.

Ejemplo:

```text
MarkAppointmentAttendedUseCase
```

coordina:

```text
ClinicalAppointment
ClinicalAttention
```

dentro de una transacción.

---

# 32. No esconder transacciones

No esconder una transacción crítica dentro de un repository individual si la atomicidad pertenece a un caso de uso de mayor nivel.

El Use Case debe dejar claro qué operación es atómica.

---

# 33. Transaction context

Los repositories utilizados dentro de una transacción deben poder recibir/utilizar el mismo transaction context de Prisma.

No abrir transacciones independientes dentro de cada repository.

---

# 34. HTTP Validation

Se utilizará:

```text
Zod
```

en el boundary HTTP.

Ejemplo:

```text
create-clinical-appointment.schema.ts
```

Valida:

```text
required fields
format
enum
UUID
simple ranges
string length
```

---

# 35. Business rules no van en Zod

No implementar en schema reglas como:

```text
professional must have clinical role
Person cannot have two active SalaParticipations
Treatment can only be reopened by valid professional
```

Estas reglas requieren estado del sistema y pertenecen a Application/Domain.

---

# 36. DTOs y schemas

Evitar duplicación innecesaria entre:

```text
Zod schema
TypeScript interface
DTO class
```

cuando Zod pueda proporcionar:

```ts
z.infer<typeof schema>
```

y el framework no requiera una clase separada.

---

# 37. API responses

No devolver directamente modelos Prisma.

Las respuestas deben construirse con el shape requerido por el contrato.

Motivos:

- privacidad;
- estabilidad de API;
- evitar exponer columnas internas;
- desacoplar DB del contrato HTTP.

---

# 38. `packages/contracts`

Debe contener únicamente contratos realmente compartibles.

Permitido:

```text
simple enums
primitive schemas
shared value types
cross-app constants when stable
```

---

# 39. Prohibiciones en contracts

No colocar en `packages/contracts`:

```text
Prisma models
repositories
NestJS services
domain application logic
React components
database-specific types
```

No transformar el package en un cajón de dependencias cruzadas.

---

# 40. Orval

El frontend utilizará prioritariamente los tipos y cliente generados mediante:

```text
OpenAPI
+
Orval
```

No duplicar manualmente DTOs de respuesta.

---

# 41. Generated code

El contenido de:

```text
packages/api-client
```

generado por Orval no se edita manualmente.

Si existe un problema:

```text
fix OpenAPI/backend
↓
regenerate client
```

No parchear código generado.

---

# 42. Frontend architecture

`apps/web` se organizará por dominio/feature.

Ejemplo:

```text
apps/web/src/
├── app/
├── features/
│   ├── people/
│   ├── sala/
│   ├── clinic/
│   ├── finance/
│   └── team/
├── components/
│   └── shared/
└── lib/
```

---

# 43. Evitar carpetas globales gigantes

Evitar estructuras donde todo termine mezclado:

```text
components/
hooks/
services/
utils/
```

con archivos de todos los dominios.

Preferir colocación por feature cuando el código pertenezca claramente a una capacidad funcional.

---

# 44. Feature folder

Ejemplo:

```text
features/clinic/
├── components/
├── hooks/
├── queries/
├── mutations/
├── schemas/
└── utils/
```

Crear únicamente las carpetas que realmente se utilicen.

---

# 45. Shared components

Los componentes reutilizables reales podrán vivir en:

```text
packages/ui
```

o en:

```text
apps/web/src/components/shared
```

según su alcance.

---

# 46. `packages/ui`

Reservado para componentes verdaderamente compartidos y parte del sistema visual.

Ejemplos:

```text
Button
Input
FormField
Dialog
DataTable primitives
PageHeader
StatusBadge
```

No mover un componente a `packages/ui` solo porque se usa dos veces dentro de una feature.

---

# 47. Server Components

En Next.js App Router:

```text
Server Components by default
```

cuando no se necesite interacción del navegador.

Utilizar Client Components cuando exista:

```text
state
events
forms
browser APIs
interactive query behavior
```

---

# 48. No business logic en Server Actions

NestJS sigue siendo:

```text
business/API source of truth
```

No mover operaciones de dominio a Server Actions para evitar endpoints.

Server Actions, si se usan, no deben duplicar lógica funcional del backend.

---

# 49. TanStack Query

Se utilizará para server state en frontend.

No utilizar manualmente:

```text
useEffect + fetch + loading state
```

para queries estándar que TanStack Query puede resolver.

---

# 50. Query keys

Las keys deben estar centralizadas por feature.

Ejemplo:

```ts
export const peopleKeys = {
  all: ['people'] as const,
  detail: (id: string) => ['people', 'detail', id] as const,
  search: (filters: PeopleFilters) => ['people', 'search', filters] as const,
};
```

No inventar strings diferentes en cada componente.

---

# 51. Mutations y cache

Cada mutation debe declarar deliberadamente:

```text
what to invalidate
what to update directly
what to refetch
```

No utilizar:

```text
invalidate every query
```

como comportamiento general.

---

# 52. Server state vs UI state

Convención:

```text
TanStack Query
→ remote/server state

React state
→ local UI state

URL
→ filters/navigation/shareable state
```

---

# 53. No Redux/Zustand inicialmente

No introducir:

```text
Redux
Zustand
MobX
```

sin una necesidad concreta.

Una nueva dependencia de state management requiere decisión arquitectónica explícita.

---

# 54. URL state

Filtros relevantes, paginación y contexto navegable deberían reflejarse en URL cuando aporte valor.

Ejemplo:

```text
/sala?date=2026-08-24
/clinic/appointments?professional=...
```

Esto facilita:

- refresh;
- back/forward;
- links compartibles;
- preservación de contexto.

---

# 55. Forms

Se utilizará:

```text
React Hook Form
+
Zod
```

Los formularios deben:

```text
show field errors
show server/domain errors
preserve valid input
prevent accidental double submit
display loading state
```

---

# 56. Frontend validation

La validación frontend mejora UX.

No constituye autoridad.

El backend siempre valida nuevamente.

---

# 57. Domain error handling frontend

Los errores de dominio deben manejarse principalmente mediante:

```text
error.code
```

Ejemplo:

```text
PROFESSOR_HAS_ASSIGNED_STUDENTS
```

No interpretar mensajes humanos del backend para decidir comportamiento.

---

# 58. Tables

Se utilizará:

```text
TanStack Table
```

como primitive.

Crear wrappers propios únicamente cuando existan patrones reales repetidos.

---

# 59. Server-side table behavior

Listados relevantes utilizarán cuando corresponda:

```text
server-side pagination
server-side filtering
server-side sorting
```

No descargar datasets grandes solamente para filtrarlos en navegador.

---

# 60. Component size

Evitar componentes monolíticos con múltiples responsabilidades.

Separar cuando exista:

```text
independent UI concern
reusable behavior
complex section
distinct domain responsibility
```

No separar únicamente por cantidad de líneas.

---

# 61. File size

No se establece un límite rígido de líneas.

Un archivo debe dividirse cuando:

```text
contains unrelated concerns
contains multiple business operations
is difficult to navigate
has multiple independent components
```

---

# 62. Functions

Preferir funciones pequeñas con una responsabilidad reconocible.

No fragmentar artificialmente operaciones simples en múltiples helpers triviales que dificulten seguir el flujo.

---

# 63. Pure functions

Cuando una regla pueda expresarse como función pura, preferirla.

Ventajas:

```text
easy testing
predictability
no hidden dependencies
```

Ejemplo:

```text
calculateEffectivePermissions()
normalizeDni()
```

---

# 64. Side effects

Mantener side effects cerca de boundaries claros:

```text
repositories
external adapters
logging
file storage
HTTP
```

No esconder IO dentro de funciones aparentemente puras.

---

# 65. Errors

Las reglas conocidas deben utilizar errores explícitos.

Ejemplo:

```text
ProfessorHasAssignedStudentsError
```

con:

```text
code = PROFESSOR_HAS_ASSIGNED_STUDENTS
```

---

# 66. No generic Error para negocio conocido

Evitar:

```ts
throw new Error('No se puede');
```

para una regla funcional estable.

Los errores técnicos inesperados pueden seguir utilizando excepciones técnicas apropiadas.

---

# 67. Error translation

La capa HTTP traduce errores de dominio a:

```text
statusCode
code
message
details?
```

según el contrato definido.

No mezclar decisiones HTTP dentro del Domain Layer.

---

# 68. Magic values

No dispersar valores funcionales sin nombre.

Ejemplo incorrecto:

```ts
if (minutesBefore < 120) {
  ...
}
```

si `120` representa una regla de negocio.

Preferir:

```text
PORTAL_CANCELLATION_LIMIT_MINUTES
```

una vez confirmada funcionalmente.

---

# 69. Configuración

Valores configurables por ambiente deben vivir en configuración central validada.

No utilizar:

```ts
process.env.SOMETHING
```

directamente en múltiples archivos.

---

# 70. Environment access

El acceso a environment variables debe pasar por un módulo/config object central.

Ejemplo:

```text
AppConfig
DatabaseConfig
AuthConfig
StorageConfig
```

validado con Zod al iniciar.

---

# 71. Secrets

Nunca versionar secrets.

Nunca incluirlos en:

```text
source code
fixtures
tests
logs
documentation examples with real values
```

---

# 72. Logging

Se utilizará:

```text
Pino
nestjs-pino
```

No utilizar:

```ts
console.log()
```

en código productivo.

---

# 73. Logger usage

Los logs deben utilizar metadata estructurada.

Ejemplo:

```ts
logger.info({
  requestId,
  personId,
  operation: 'JOIN_SALA',
}, 'Sala participation created');
```

No concatenar grandes strings de diagnóstico.

---

# 74. Sensitive logging

No loguear:

```text
password
PIN
session token
cookie
clinical body
full evaluation
file contents
```

La política detallada está en `SECURITY.md`.

---

# 75. Comments

Los comentarios deben explicar:

```text
why
```

no repetir:

```text
what
```

Ejemplo útil:

```ts
// Partial index is the final protection against concurrent active enrollments.
```

Ejemplo innecesario:

```ts
// Increment version
version += 1;
```

---

# 76. TODOs

Todo TODO debe explicar contexto.

Preferir:

```text
TODO(FUNCTIONAL): confirm Attention/Evolution cardinality before adding UNIQUE constraint.
```

Evitar:

```text
TODO: fix later
```

---

# 77. Pending functional rules

Cuando exista:

```text
PENDING_FUNCTIONAL_DEFINITION
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

el código debe mantener la neutralidad definida por la documentación.

No inventar una regla silenciosamente.

---

# 78. Codex y pendientes

Si Codex encuentra una decisión funcional pendiente debe:

```text
identify blocker
preserve neutral implementation
or stop affected work and report it
```

No debe:

```text
choose the most logical behavior
guess cardinality
guess permission
guess transition
```

---

# 79. Imports

Utilizar aliases estables para evitar rutas profundas.

Ejemplo:

```text
@/features/clinic/...
@/lib/...
```

o los aliases definidos en la configuración compartida.

No crear aliases que permitan saltarse boundaries arquitectónicos.

---

# 80. Circular dependencies

Evitar dependencias circulares entre módulos y packages.

Si aparece una circular dependency, revisar ownership y API pública en lugar de resolverla automáticamente con hacks.

---

# 81. Barrel files

Evitar `index.ts` masivos.

Pueden utilizarse cuando exista una API pública clara.

Ejemplo válido:

```text
packages/ui/src/index.ts
```

para componentes públicos del package.

Evitar barrels internos que oculten dependencias profundas.

---

# 82. Module public API

Un módulo puede definir un punto de entrada explícito para otros módulos.

No exponer accidentalmente todo su árbol interno mediante barrels.

---

# 83. Prettier

Se utilizará:

```text
Prettier
```

para formato automático.

ESLint se utiliza para reglas de código.

No utilizar múltiples formatters compitiendo entre sí.

---

# 84. ESLint

Se utilizará una configuración compartida:

```text
packages/eslint-config
```

El objetivo es:

```text
lint clean
```

antes de merge.

---

# 85. Warnings

Los warnings de ESLint deben tratarse como problemas reales.

No acumular una base de código con cientos de warnings aceptados.

CI debería fallar ante warnings según la configuración final elegida.

---

# 86. TypeScript config

Utilizar configuración compartida:

```text
packages/typescript-config
```

con strict mode consistente.

Apps y packages pueden extenderla únicamente con diferencias justificadas por runtime.

---

# 87. Dependency additions

No agregar una dependencia externa si el problema puede resolverse de forma simple con el stack existente.

Antes de introducir una librería nueva, revisar:

```text
Does an existing dependency already solve this?
Is the library maintained?
Does it duplicate another library?
Does it affect bundle/runtime substantially?
```

---

# 88. Major architectural dependencies

Codex no puede introducir por su cuenta:

```text
Redux
Redis
GraphQL
tRPC
new ORM
new UI framework
message broker
CQRS framework
event bus
new authentication provider
```

sin decisión explícita.

---

# 89. Architecture Decision Records

Un cambio relevante de stack o arquitectura debe registrarse mediante:

```text
docs/adr/
```

cuando corresponda.

No modificar silenciosamente decisiones ya aprobadas.

---

# 90. Version pinning

Las dependencias principales se mantendrán bajo versiones deliberadas.

No realizar upgrades mayores automáticos mientras se implementa una feature no relacionada.

---

# 91. Package manager

Se utilizará exclusivamente:

```text
pnpm
```

No introducir:

```text
npm-lock.json
yarn.lock
bun.lock
```

---

# 92. Lockfile

El lockfile oficial es:

```text
pnpm-lock.yaml
```

Debe versionarse.

---

# 93. Turborepo

Turborepo coordina tareas:

```text
dev
build
lint
typecheck
test
```

No duplicar scripts innecesarios por app si pueden componerse correctamente desde el root.

---

# 94. Commands

Los scripts deben ser previsibles.

Ejemplo conceptual:

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm generate:api
```

---

# 95. Generated artifacts

No versionar artefactos de build:

```text
.next
dist
coverage
temporary files
```

salvo que una herramienta requiera explícitamente otro comportamiento.

---

# 96. API client generation

El flujo correcto es:

```text
NestJS OpenAPI
↓
Orval
↓
packages/api-client
```

No crear clientes HTTP paralelos arbitrarios para features nuevas.

---

# 97. API access frontend

Las features deben consumir la API mediante el cliente generado/adaptadores definidos.

Evitar llamadas `fetch()` ad hoc dispersas cuando existe endpoint generado.

---

# 98. Backend response mapping

Los endpoints deben devolver contratos estables, no la estructura accidental de Prisma.

Ejemplo:

```text
PersonSummaryResponse
ClinicalAgendaItemResponse
```

si la proyección lo requiere.

---

# 99. Privacy-aware serialization

Nunca usar:

```ts
include: {
  everything: true
}
```

y retornar el resultado directamente.

Especialmente en Clínica, construir DTO/read model con los campos mínimos necesarios.

---

# 100. Read Models

Queries destinadas a listados/dashboard pueden devolver read models optimizados.

No obligar a materializar aggregates completos solo para lectura.

---

# 101. Read vs Write paths

Está permitido que:

```text
write operations
→ domain/use cases/repositories

read operations
→ optimized query services
```

sin implementar un framework CQRS.

La separación es práctica, no ceremonial.

---

# 102. No CQRS framework inicialmente

No introducir:

```text
@nestjs/cqrs
```

solo para tener Commands/Queries si no aporta valor real.

Los Use Cases y Query Services existentes son suficientes.

---

# 103. API pagination

Las listas grandes deberán utilizar paginación server-side.

La convención exacta de paginación deberá ser única para toda la API y podrá documentarse en `API.md`.

No inventar un esquema diferente por endpoint.

---

# 104. Sorting/filtering

Los nombres de filtros y sorting deben mapear a conceptos de API, no a nombres internos de columnas PostgreSQL.

Ejemplo:

```text
professionalId
startDate
status
```

No:

```text
professional_id
start_at_db
```

---

# 105. Dates in API

Los timestamps viajan como:

```text
ISO 8601
```

Las fechas puras viajan como:

```text
YYYY-MM-DD
```

No enviar fechas ambiguas dependientes de locale.

---

# 106. Money in API

Los importes ARS no tendrán decimales según la decisión de dominio técnico.

Debe evitarse lógica que introduzca centavos accidentalmente.

La cotización USD utilizará dos decimales.

La serialización exacta `number` vs `string` para Decimal deberá mantenerse consistente en el contrato y definirse en la implementación API.

---

# 107. DB migrations

No modificar schema usando:

```text
prisma db push
```

como flujo normal.

Usar:

```text
Prisma Migrate
```

según `DATABASE.md`.

---

# 108. Manual migration SQL

Cuando exista SQL manual importante:

```text
partial index
CHECK
PostgreSQL-specific constraint
```

debe conservarse y revisarse.

Codex no debe regenerarlo/eliminarlo por comodidad.

---

# 109. Database access in scripts

Los scripts administrativos deben reutilizar configuración y Prisma cuando sea razonable.

No crear credenciales hardcodeadas ni clientes DB alternativos.

---

# 110. Tests

Toda nueva lógica relevante debe cumplir `TESTING.md`.

No considerar una feature terminada solo porque:

```text
works manually
```

---

# 111. Test placement

Preferir tests próximos al código cuando eso mejore navegación.

Ejemplo:

```text
mark-appointment-attended.use-case.ts
mark-appointment-attended.use-case.spec.ts
```

o una estructura `__tests__` consistente si el proyecto la adopta.

No mezclar múltiples convenciones sin necesidad.

---

# 112. Test naming

Describir comportamiento:

```text
rejects inactivation when professor has assigned students
```

No:

```text
case 2
should work
test user
```

---

# 113. No test-only production code

Evitar introducir branches productivos como:

```ts
if (process.env.NODE_ENV === 'test') {
  ...
}
```

para hacer más fácil un test, salvo casos técnicos claramente justificados.

---

# 114. Factories de test

Las factories de test viven dentro de infraestructura de testing.

No exportarlas como parte de packages productivos.

---

# 115. Error codes

Los códigos de error programáticos deben ser estables.

Ejemplos:

```text
ACTIVE_SALA_PARTICIPATION_ALREADY_EXISTS
PROFESSOR_HAS_ASSIGNED_STUDENTS
CONCURRENT_MODIFICATION
```

No cambiar nombres sin revisar clientes y tests.

---

# 116. Enums y strings

Utilizar enums/tipos cerrados para estados.

No comparar:

```ts
if (status === 'Atendido')
```

si el código técnico utiliza:

```text
ATTENDED
```

Los labels de UI se resuelven por separado.

---

# 117. Labels UI

No persistir texto visible como identificador técnico.

Ejemplo:

```text
DO_NOT_TRAIN
→ "No entrenar"
```

El enum permanece estable aunque cambie el copy.

---

# 118. Localization

La primera versión puede ser únicamente español.

Aun así, evitar usar textos de UI como lógica interna.

Esto mantiene abierta una futura internacionalización sin afectar dominio.

---

# 119. Accessibility

Los componentes interactivos deben utilizar HTML semántico y componentes shadcn accesibles.

Preferir:

```text
button
label
dialog
table semantics
```

sobre divs con click handlers.

---

# 120. Icons

Utilizar:

```text
Lucide
```

como librería de iconografía estándar.

No incorporar distintas librerías de íconos por feature.

---

# 121. Styling

Utilizar:

```text
Tailwind CSS
shadcn/ui
```

No agregar:

```text
Material UI
Ant Design
Bootstrap
styled-components
```

sin decisión explícita.

---

# 122. Inline styles

Evitar estilos inline ad hoc cuando Tailwind/design system pueda resolverlos.

Se permiten valores dinámicos cuando son realmente necesarios.

---

# 123. Design tokens

Colores, espacios y decisiones visuales principales deberán derivar del futuro:

```text
docs/design/DESIGN_SYSTEM.md
```

No inventar paletas por página.

---

# 124. Responsive

Los componentes deben diseñarse de forma responsive.

No crear una implementación desktop y otra completamente separada para mobile salvo necesidad funcional.

---

# 125. Desktop-first vs mobile

La aplicación interna puede priorizar eficiencia desktop por naturaleza operativa, pero debe mantener usabilidad responsive.

El Portal debe prestar especial atención a mobile.

Las reglas visuales exactas se definirán en `DESIGN_SYSTEM.md`.

---

# 126. Forms and accessibility

Cada input debe tener:

```text
label
error association
disabled state
focus behavior
```

correctamente representados.

No depender únicamente de placeholder.

---

# 127. Disabled vs hidden

En permissions-driven UI:

```text
not permitted
→ generally hide action
```

cuando la presencia no aporte valor.

Utilizar disabled cuando el usuario posee la capability pero una precondición temporal/contextual impide la acción y resulte útil explicar por qué.

---

# 128. Loading states

No bloquear toda la página innecesariamente por una mutation localizada.

Mantener loading states al nivel de la acción correspondiente cuando sea posible.

---

# 129. Error boundaries

Usar error handling apropiado de Next/React para fallos inesperados.

Los errores de dominio recuperables deben mostrarse dentro del flujo de la feature, no como error global de aplicación.

---

# 130. Empty states

Los listados deben tener empty states explícitos.

No mostrar simplemente una tabla vacía sin contexto cuando se pueda comunicar:

```text
No hay turnos para esta fecha.
```

El diseño específico se definirá en `DESIGN_SYSTEM.md`.

---

# 131. Confirmation dialogs

Utilizar confirmación para operaciones de consecuencias relevantes.

Ejemplos:

```text
global Person inactivation
Leave Sala
Finalize Treatment when appropriate
delete eligible record
```

No agregar confirmaciones para acciones triviales.

---

# 132. Dangerous operations

Las operaciones destructivas o de alto impacto deben utilizar copy específico sobre consecuencias.

Evitar botones genéricos:

```text
Aceptar
```

cuando pueda utilizarse:

```text
Inactivar persona
Dar de baja de Sala
Eliminar pago
```

---

# 133. Form submit

El botón de submit debe prevenir dobles envíos accidentales y mostrar estado de operación.

El backend igualmente mantiene idempotencia/integridad según corresponda.

---

# 134. Reuse

No perseguir DRY de forma absoluta.

Duplicación pequeña y clara puede ser preferible a una abstracción compartida incorrecta.

Abstraer cuando:

```text
behavior is truly same
change reasons are same
reuse is stable
```

---

# 135. Domain duplication

Las reglas de negocio no deben duplicarse entre:

```text
frontend
backend
multiple backend modules
```

Backend es fuente de verdad.

El frontend puede duplicar validaciones simples de UX, nunca reglas autoritativas complejas.

---

# 136. Utility functions

No crear un archivo:

```text
utils.ts
```

gigante.

Los helpers deben vivir cerca del dominio/feature que los utiliza.

Solo helpers realmente transversales pertenecen a `lib` compartida.

---

# 137. Public vs private functions

Exportar solamente lo que otros módulos/files necesitan.

No exportar funciones internas preventivamente.

Menor superficie pública reduce acoplamiento.

---

# 138. Immutability

Preferir transformaciones previsibles y evitar mutaciones ocultas.

No es necesario imponer programación funcional estricta.

En domain helpers puros, favorecer inputs/outputs explícitos.

---

# 139. Async

Toda Promise debe:

```text
awaited
returned
or deliberately handled
```

Evitar fire-and-forget no controlado para operaciones importantes.

---

# 140. Background work

Como no existen queues inicialmente, no simular procesos confiables con:

```ts
void someAsyncOperation();
```

para tareas que deben completarse.

Si una operación debe ser confiable, mantenerla en request/transaction o diseñar una infraestructura adecuada posteriormente.

---

# 141. External integrations

Toda integración externa futura debe estar encapsulada detrás de un adapter/service.

No dispersar SDK calls dentro de Use Cases.

---

# 142. Time

Las reglas dependientes del presente deben utilizar una abstracción de reloj cuando sea necesario para testing y consistencia.

Evitar múltiples:

```ts
new Date()
```

en una misma operación de dominio.

Obtener `now` una vez y propagarlo.

---

# 143. Timezone

Los cálculos de negocio deben respetar:

```text
America/Argentina/Buenos_Aires
```

según las decisiones de arquitectura.

No depender de la timezone del servidor.

---

# 144. Date libraries

No introducir múltiples librerías para fechas.

Elegir/utilizar la solución definida en el proyecto cuando se inicialice.

Una nueva librería de fechas requiere evitar duplicación con APIs existentes.

---

# 145. Monetary calculations

Utilizar:

```text
Prisma.Decimal
```

o una representación exacta acordada.

No realizar cálculos monetarios críticos con floats JS.

ARS no utiliza decimales.

USD/cotización utiliza dos decimales.

---

# 146. IDs

Tratar UUID como identificadores opacos.

No extraer significado del contenido del ID.

No exponer secuencias de DB como mecanismo de seguridad.

---

# 147. Validation duplication

Es aceptable compartir schemas simples entre frontend/backend cuando representan exactamente el mismo contrato.

No compartir reglas contextuales que requieran base de datos.

---

# 148. API compatibility

Antes de modificar una respuesta existente revisar:

```text
frontend consumers
generated client
tests
potential backward compatibility
```

No hacer cambios accidentales de shape como parte de refactors internos.

---

# 149. Refactors

Un refactor debe preservar comportamiento salvo que la tarea explícitamente cambie funcionalidad.

No mezclar una gran refactorización no relacionada con una feature pequeña sin necesidad.

---

# 150. Feature scope

Codex debe evitar “mejoras” no pedidas que cambien:

```text
UX
business rules
permissions
architecture
data model
```

sin estar respaldadas por documentación o tarea explícita.

---

# 151. Technical debt

Cuando se identifique deuda relevante pero fuera de alcance:

```text
document clearly
do not silently expand scope
```

Puede dejarse un TODO técnico específico si es útil.

---

# 152. Security-sensitive code

Cambios en:

```text
auth
permissions
credentials
session handling
clinical privacy
file authorization
```

requieren revisión especialmente cuidadosa y tests.

---

# 153. SQL

No concatenar SQL con inputs de usuario.

Cuando sea necesario SQL raw:

```text
parameterized queries
Prisma safe raw APIs
```

Los casos deben ser puntuales y justificados.

---

# 154. Prisma raw SQL

Usar únicamente cuando:

```text
Prisma query API cannot express requirement reasonably
```

y mantener:

```text
typing
parameterization
tests
documentation
```

---

# 155. Pagination limits

Los endpoints paginados deberán tener límites máximos razonables.

No permitir:

```text
limit=1000000
```

por defecto.

La convención exacta se definirá en API documentation.

---

# 156. API filtering

No aceptar nombres arbitrarios de columna enviados por frontend para construir SQL.

Los filtros permitidos deben definirse explícitamente.

---

# 157. Sorting

El backend debe mapear sorting permitido a campos conocidos.

No interpolar directamente:

```text
request.sortField
```

dentro de SQL.

---

# 158. Transactions and external calls

Evitar mantener transacciones DB abiertas mientras se realizan llamadas externas lentas.

Diseñar el orden de operación cuidadosamente.

Ejemplo S3:

```text
upload
↓
short DB transaction
```

según `DATABASE.md`.

---

# 159. File uploads

No leer archivos grandes completos en memoria sin necesidad.

La implementación deberá usar streaming/buffers de forma razonable según límites definidos.

---

# 160. File naming

Los nombres de objetos S3 no deben depender directamente del nombre original del usuario.

Utilizar:

```text
generated storageKey
```

y persistir `originalName` como metadata.

---

# 161. File access

Nunca construir URLs públicas permanentes desde el storage key.

El acceso debe pasar por autorización y signed URL según `SECURITY.md`.

---

# 162. Audit events

Los eventos de auditoría deben utilizar tipos/códigos claros.

Ejemplo:

```text
INTERNAL_USER_ROLE_ADDED
PERSON_GLOBAL_INACTIVATED
PORTAL_PIN_RESET
```

No guardar frases arbitrarias como única semántica.

---

# 163. Audit metadata

El metadata JSONB debe ser pequeño y no sensible.

No volcar automáticamente el request body.

---

# 164. Error logging

Cuando se capture un error, preservar:

```text
requestId
error code
technical context
```

sin registrar secretos ni contenido clínico innecesario.

---

# 165. Correlation ID

Las operaciones HTTP deben conservar request/correlation ID a través de logs relevantes.

Si un servicio público interno llama otro módulo, mantener el mismo contexto cuando sea razonable.

---

# 166. Status enums

Las transiciones deben ocurrir solamente mediante operaciones del dominio.

No exponer endpoints genéricos:

```text
PATCH /treatment/:id/status
```

si el dominio exige:

```text
FinalizeTreatment
ReopenTreatment
```

---

# 167. Generic CRUD

CRUD genérico puede utilizarse para catálogos simples.

No utilizar CRUD genérico para aggregates con lifecycle o side effects.

---

# 168. Catalog CRUD

Incluso en catálogos, respetar referencias históricas e `isSelectable/status`.

Eliminar físicamente solo cuando sea seguro y permitido.

---

# 169. Soft delete

No crear:

```text
deletedAt
```

por defecto en nuevos models.

Consultar `DOMAIN_MODEL.md` y `STATE_TRANSITIONS.md` para decidir lifecycle real.

---

# 170. Prisma schema changes

Antes de agregar un campo/modelo revisar:

```text
Does the domain define it?
Is it source of truth or derived?
Does it duplicate existing data?
Is cardinality confirmed?
Does it require historical snapshot?
```

---

# 171. Derived data

No persistir por conveniencia datos como:

```text
Person.status
isStudent
financial total
isExpired
```

sin decisión documentada.

---

# 172. Snapshot fields

La duplicación de datos es válida cuando representa un snapshot histórico deliberado.

Debe quedar claro en nombre/documentación que no es una referencia viva.

---

# 173. Naming snapshots

Preferir nombres como:

```text
definitionSnapshot
snapshotVersion
```

en lugar de campos ambiguos como:

```text
data
metadata
extra
```

---

# 174. `data`, `metadata`, `extra`

Evitar nombres genéricos para campos JSONB.

Solo utilizar `metadata` cuando el contenido sea realmente metadata técnica.

---

# 175. Boolean fields

Nombrar booleanos como preguntas claras.

Ejemplos:

```text
isSelectable
mustChangePassword
mustChangePin
```

Evitar:

```text
activeFlag
valid
statusBool
```

---

# 176. Date naming

Utilizar sufijos consistentes.

```text
startAt / endAt
→ timestamp

startDate / endDate
→ date-only

createdAt / updatedAt
→ timestamps
```

---

# 177. ID field naming

Foreign Keys:

```text
personId
professionalId
treatmentId
```

No:

```text
person
person_id
idPerson
```

en TypeScript/Prisma.

PostgreSQL se mapea a snake_case.

---

# 178. Event timestamps

Preferir nombres semánticos:

```text
occurredAt
closedAt
revokedAt
paidAt
```

cuando representan hechos del dominio.

No reutilizar `updatedAt` para inferirlos.

---

# 179. Author fields

Cuando el dominio requiere autoría:

```text
authorId
lastModifiedById
```

debe distinguirse de:

```text
createdBy
```

si semánticamente no son equivalentes.

---

# 180. CreatedBy

No agregar `createdBy` universal a cada tabla.

Agregar actor cuando el dominio, auditoría o operación lo requiera realmente.

La auditoría transversal existe de forma separada.

---

# 181. Sorting UI

Las tablas deben mantener ordering estable.

Si la API pagina, incluir un criterio determinístico para evitar filas saltando entre páginas.

---

# 182. Empty strings

Normalizar campos opcionales cuando corresponda.

Evitar persistir arbitrariamente:

```text
""
```

si semánticamente significa ausencia y el campo es nullable.

La decisión debe ser consistente por campo/schema.

---

# 183. Trimming

Los inputs textuales de identidad y campos estructurados deben aplicar trim en backend cuando corresponda.

No alterar texto clínico libre indiscriminadamente si el whitespace tiene significado.

---

# 184. Case normalization

Normalizar case solo donde la semántica lo permita.

Ejemplo:

```text
email
→ lowercase
```

No convertir automáticamente:

```text
names
clinical notes
addresses
```

a uppercase/lowercase.

---

# 185. DNI normalization

Usar una única función central:

```text
normalizeDni()
```

según `DATA_INTEGRITY.md`.

No repetir regex distintas en módulos.

---

# 186. Email normalization

Usar una única función:

```text
normalizeEmail()
```

para login y persistencia.

---

# 187. Shared normalizers

Los normalizadores técnicos verdaderamente compartidos pueden vivir en un package/helper transversal bien definido.

No convertirlos en reglas de negocio compartidas accidentalmente.

---

# 188. Validation messages

El backend devuelve códigos estables.

El frontend controla el copy final visible al usuario cuando corresponda.

No hardcodear múltiples variantes del mismo mensaje por feature.

---

# 189. UI copy

Los textos deben ser claros y específicos al dominio.

Evitar terminología técnica como:

```text
entity
record
foreign key
HTTP 409
```

en UI.

---

# 190. Error fallback

Los errores inesperados deben mostrar un mensaje general y registrar contexto técnico.

No mostrar stack traces al usuario.

---

# 191. Loading and optimistic UI

No aplicar optimistic UI a operaciones de negocio sensibles por defecto.

Ejemplos donde conviene esperar confirmación backend:

```text
financial writes
state transitions
clinical records
inactivation
role changes
```

Optimistic UI podrá evaluarse en interacciones de bajo riesgo.

---

# 192. Data refresh

Después de operaciones relevantes, asegurar que read models relacionados queden actualizados.

Ejemplo:

```text
register SalaPayment
→ refresh payment status
→ refresh finance read model if visible
```

---

# 193. Error boundaries by feature

Los fallos recuperables de una query deben manejarse en la feature.

Los fallos inesperados de render pueden escalar a boundary de ruta/página.

---

# 194. Permission helpers frontend

Centralizar helpers si aportan valor:

```text
hasPermission()
hasAnyPermission()
```

No duplicar arrays de roles manualmente por componente.

Preferir permissions sobre checks de roles cuando la acción está definida por capability.

---

# 195. Role checks frontend

Consultar roles directamente solo cuando el rol en sí sea relevante para UX.

Para capabilities:

```text
hasPermission(Permission.X)
```

es preferible.

---

# 196. Backend permissions

Los endpoints declaran permissions.

No escribir múltiples checks dispersos:

```ts
if (user.roles.includes(...))
```

si existe un sistema de autorización central.

---

# 197. Business preconditions

No meter business preconditions en permission helpers.

Ejemplo:

```text
Professor has assigned students
```

no es un permission check.

---

# 198. No hidden business side effects

Una función con nombre:

```text
updatePersonGeneralData()
```

no debería silenciosamente:

```text
close Treatments
cancel appointments
```

Los side effects importantes deben ser obvios desde el caso de uso.

---

# 199. Explicit orchestration

Los casos multi-módulo deben mostrar explícitamente qué módulos participan.

Ejemplo:

```text
InactivatePersonUseCase
```

coordina People, Sala, Clinic y Auth.

No esconder esa operación en un callback genérico.

---

# 200. Return values

Los Use Cases deben devolver únicamente lo que el caller necesita.

No devolver aggregates enormes “por si acaso”.

---

# 201. Repository return types

Los repositories pueden retornar modelos de persistencia internos o domain-oriented shapes según el caso.

No exportar tipos Prisma a todo el sistema.

---

# 202. Prisma types

Mantener tipos Prisma cerca de Infrastructure.

Evitar que:

```text
Prisma.TreatmentGetPayload
```

se convierta en tipo principal del Application/Frontend.

---

# 203. Domain types

Crear tipos de dominio cuando aporten estabilidad y semántica independiente del ORM.

No crear clases/value objects para cada string sin beneficio real.

---

# 204. Value objects livianos

Conceptos como:

```text
Money
MonthYear
TimeRange
```

pueden representarse con tipos/schemas livianos.

Evitar patrones DDD ceremoniales.

---

# 205. Money

La representación debe hacer evidente la moneda cuando exista riesgo de confusión.

No sumar ARS y USD accidentalmente.

---

# 206. Currency

Si un objeto puede manejar múltiples monedas, el currency debe ser explícito.

Si una entidad está funcionalmente fijada a ARS, no hace falta agregar un campo redundante solo por abstracción.

---

# 207. Migration comments/docs

Cuando una migración contenga SQL manual no obvio, documentar el motivo en la migración o ADR/documento pertinente.

Especialmente:

```text
partial unique index
data backfill
constraint workaround
```

---

# 208. Data backfills

Los backfills deben ser:

```text
deterministic
reviewable
safe to rerun when appropriate
```

No depender de lógica compleja de aplicación que pueda cambiar después.

---

# 209. Production scripts

Scripts que modifican producción deben:

```text
require explicit invocation
validate environment
log non-sensitive summary
prefer dry-run when valuable
```

No ejecutarse automáticamente desde desarrollo.

---

# 210. Build output

No depender de archivos presentes localmente pero no incluidos en build/deploy.

Assets requeridos deben formar parte explícita del proceso de build o almacenamiento externo.

---

# 211. Environment parity

Local, staging y production deben compartir comportamiento de código.

Las diferencias se expresan mediante config, no branches funcionales diferentes por ambiente.

---

# 212. Feature flags

No introducir infraestructura compleja de feature flags inicialmente.

Si una feature requiere activación controlada, utilizar la solución más simple y documentada antes de introducir un proveedor externo.

---

# 213. Experimental code

No dejar múltiples implementaciones alternativas activas dentro del código productivo.

Una vez tomada una decisión, eliminar el camino obsoleto cuando sea seguro.

---

# 214. Deprecated code

Si una API o componente queda deprecated temporalmente, marcar claramente:

```text
@deprecated
```

y definir plan de eliminación.

No acumular caminos antiguos indefinidamente.

---

# 215. Circular ownership

Si dos módulos necesitan modificarse mutuamente de forma frecuente, revisar el boundary.

No resolver automáticamente mediante imports bidireccionales.

---

# 216. Common module

`common` debe mantenerse pequeño.

No mover allí cualquier cosa que se use dos veces.

Debe contener únicamente infraestructura realmente transversal.

---

# 217. Shared UI

Lo mismo aplica a `packages/ui`.

No usarlo como carpeta de dumping para componentes sin owner claro.

---

# 218. API versioning

No introducir versionado `/v1` anticipadamente salvo necesidad real.

Si posteriormente se requiere compatibilidad externa, registrar decisión.

---

# 219. Public API exposure

Athleta Manager es inicialmente una aplicación interna/Portal.

No asumir que todos los endpoints son APIs públicas externas.

No comprometer contratos de forma innecesaria más allá de los consumidores propios.

---

# 220. Security boundaries

Cada endpoint sensible debe asumir que el caller puede manipular:

```text
URL
body
headers
IDs
```

Nunca confiar en valores escondidos por la UI.

---

# 221. Object ownership in Portal

Toda operación Portal debe resolver `personId` desde la sesión.

No aceptar como autoridad:

```text
personId
```

enviado por el navegador para indicar sobre quién operar.

---

# 222. Internal operations

En app interna sí puede enviarse `personId` objetivo porque el actor opera sobre terceros, pero backend valida permission y reglas.

---

# 223. HTTP verbs

Utilizar semántica REST razonable:

```text
GET → read
POST → create/action
PATCH → partial simple update
DELETE → real allowed deletion
```

Operaciones de dominio pueden utilizar endpoints de acción explícitos.

---

# 224. Domain action endpoints

Ejemplos válidos:

```text
POST /people/:id/inactivate
POST /clinic/appointments/:id/attend
POST /clinic/treatments/:id/finalize
POST /clinic/treatments/:id/reopen
```

No forzar todas las acciones dentro de PATCH genérico.

---

# 225. Idempotency

Cuando un endpoint requiera idempotencia, mantener `operationId` de acuerdo con `DATABASE.md`.

No inventar una implementación diferente por módulo.

---

# 226. HTTP status codes

Mantener uso consistente.

Ejemplos:

```text
200/201 → success
400 → malformed/simple validation when appropriate
401 → unauthenticated
403 → forbidden
404 → not found
409 → domain conflict/concurrency
```

La política final puede centralizarse en futuro `API.md`.

---

# 227. Code review principle

Toda modificación debería poder responder:

```text
What domain rule does this implement?
Where is the source of truth?
What module owns it?
What tests protect it?
Did it introduce a new architectural dependency?
```

---

# 228. Definition of Done

Antes de finalizar una tarea aplicar:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

más Integration/E2E específicos según `TESTING.md`.

No omitir checks para acelerar artificialmente una entrega.

---

# 229. Principios finales

1. Código simple antes que abstracciones prematuras.
2. `strict: true` en TypeScript.
3. `any` prohibido salvo excepción justificada.
4. Controllers delgados.
5. Reglas de negocio en Application/Domain.
6. Prisma permanece en Infrastructure/persistencia.
7. Use Cases explícitos para acciones funcionales relevantes.
8. No crear repositories ceremoniales.
9. Las transacciones pertenecen al caso de uso que coordina la operación.
10. Zod valida boundaries, no sustituye reglas de dominio.
11. Orval es la fuente del cliente HTTP frontend.
12. Código generado no se edita manualmente.
13. Frontend organizado por feature.
14. Server Components por defecto; Client Components cuando exista interacción.
15. TanStack Query maneja server state.
16. No Redux/Zustand inicialmente.
17. React Hook Form + Zod para formularios.
18. TanStack Table para tablas.
19. Los errors utilizan códigos funcionales estables.
20. No usar valores mágicos para reglas de negocio.
21. Logging estructurado, no `console.log` productivo.
22. Los comentarios explican por qué.
23. TODOs deben tener contexto.
24. Imports respetan boundaries.
25. Evitar barrels indiscriminados.
26. Prettier es el formateador.
27. ESLint debe permanecer limpio.
28. pnpm es el único package manager.
29. Las dependencias mayores requieren decisión explícita.
30. Codex no inventa reglas funcionales.
31. La privacidad clínica debe influir en DTOs y serialización.
32. No existe soft delete universal.
33. No usar Generic CRUD para operaciones con lifecycle.
34. No duplicar reglas de dominio en frontend.
35. No persistir derivados sin decisión documentada.
36. No modificar arquitectura silenciosamente durante una feature.
37. Todo cambio relevante debe quedar testeado según `TESTING.md`.

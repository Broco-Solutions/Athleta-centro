# DEVELOPMENT.md — Athleta Manager

## 1. Propósito

Este documento define el flujo de desarrollo local y las convenciones operativas para trabajar en Athleta Manager.

Su objetivo es que cualquier desarrollador o agente de código pueda:

- preparar el entorno desde cero;
- levantar dependencias locales;
- ejecutar web y API;
- trabajar con PostgreSQL;
- trabajar con almacenamiento compatible con S3;
- administrar variables de entorno;
- ejecutar migraciones y seeds;
- generar OpenAPI y el cliente Orval;
- ejecutar validaciones de calidad;
- mantener consistencia entre local, staging y production.

Este documento complementa:

```text
docs/architecture/ARCHITECTURE.md
docs/architecture/STACK.md
docs/architecture/SECURITY.md
docs/architecture/INFRASTRUCTURE.md
docs/architecture/DATABASE.md
docs/architecture/API.md

docs/engineering/TESTING.md
docs/engineering/CODING_CONVENTIONS.md
```

---

# 2. Principios de desarrollo

El entorno local debe ser:

```text
reproducible
predictable
close to production
easy to bootstrap
safe
```

La prioridad es reducir diferencias innecesarias entre desarrolladores y ambientes.

---

# 3. Runtime

Athleta utilizará:

```text
Node.js LTS
```

La versión debe quedar fijada en el repositorio.

Archivos recomendados:

```text
.nvmrc
package.json#engines
```

Ejemplo conceptual:

```text
.nvmrc
20
```

La versión concreta se fija al inicializar el repositorio con la LTS estable elegida.

No depender de:

```text
"cualquier Node reciente"
```

---

# 4. Package manager

El único package manager permitido es:

```text
pnpm
```

La versión exacta debe quedar fijada mediante:

```json
{
  "packageManager": "pnpm@<version>"
}
```

en el `package.json` raíz.

---

# 5. Corepack

El flujo recomendado utiliza:

```bash
corepack enable
```

Luego:

```bash
pnpm install
```

No utilizar:

```text
npm install
yarn
bun
```

dentro del proyecto.

---

# 6. Monorepo

La estructura base:

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
├── compose.yaml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── AGENTS.md
```

---

# 7. Docker

Docker es requerido para dependencias locales.

Uso inicial:

```text
PostgreSQL
MinIO
```

Web y API se ejecutan directamente mediante Node durante el desarrollo diario.

No es necesario ejecutar `apps/web` y `apps/api` dentro de Docker para el flujo local normal.

---

# 8. Infraestructura local

Dependencias locales iniciales:

```text
PostgreSQL
MinIO
MinIO initialization
```

Conceptualmente:

```text
compose.yaml
├── postgres
├── minio
└── minio-init
```

---

# 9. PostgreSQL local

PostgreSQL se ejecutará mediante Docker Compose.

No se requiere instalar PostgreSQL directamente en el sistema operativo del desarrollador.

Puerto estándar local:

```text
5432
```

---

# 10. Almacenamiento local

Producción utiliza:

```text
AWS S3
```

Local utiliza:

```text
MinIO
```

MinIO expone una API compatible con S3.

Esto permite mantener el mismo storage adapter.

---

# 11. MinIO

Puertos:

```text
S3 API
9000

Console
9001
```

Bucket local conceptual:

```text
athleta-local
```

Debe crearse automáticamente al levantar la infraestructura.

No requerir configuración manual mediante la consola de MinIO.

---

# 12. Puertos estándar

Convención local:

```text
Web
3000

API
3001

PostgreSQL
5432

MinIO API
9000

MinIO Console
9001
```

URLs:

```text
http://localhost:3000
http://localhost:3001
http://localhost:9001
```

---

# 13. Docker Compose

El archivo raíz:

```text
compose.yaml
```

contiene únicamente dependencias locales.

No incluir inicialmente:

```text
web
api
```

como servicios del flujo diario.

---

# 14. Scripts de infraestructura

El root debe exponer:

```bash
pnpm infra:up
pnpm infra:down
```

Conceptualmente:

```json
{
  "scripts": {
    "infra:up": "docker compose up -d",
    "infra:down": "docker compose down"
  }
}
```

También puede existir:

```bash
pnpm infra:logs
```

si aporta valor.

---

# 15. Variables de entorno

Los valores reales de environment nunca se versionan.

Cada app mantiene su propio archivo.

```text
apps/api/.env
apps/api/.env.example

apps/web/.env.local
apps/web/.env.example
```

---

# 16. No mega `.env`

No utilizar un único `.env` raíz para runtime de todo el sistema.

Razón:

```text
apps/api
→ server/private configuration

apps/web
→ frontend/runtime configuration
```

Esto evita exposición accidental y ownership ambiguo.

---

# 17. `.env.example`

Los `.env.example` sí se versionan.

Deben contener:

- nombre de variable;
- valor de ejemplo no sensible cuando sea seguro;
- comentario o documentación de propósito cuando aporte valor.

No incluir credenciales reales.

---

# 18. Variables backend

Ejemplo conceptual:

```env
NODE_ENV=development

API_PORT=3001
APP_TIMEZONE=America/Argentina/Buenos_Aires

DATABASE_URL=postgresql://athleta:athleta@localhost:5432/athleta

INTERNAL_SESSION_COOKIE_NAME=athleta_session
PORTAL_SESSION_COOKIE_NAME=athleta_portal_session

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=athleta-local
S3_ACCESS_KEY=local-dev-only
S3_SECRET_KEY=local-dev-only
S3_FORCE_PATH_STYLE=true
```

La lista real se completa según implementación.

---

# 19. Secrets

No versionar:

```text
database passwords
session secrets
AWS credentials
Sentry DSNs privados when applicable
production cookies/secrets
```

No copiar credenciales de staging dentro de `.env.example`.

---

# 20. Variables frontend

Minimizar variables:

```text
NEXT_PUBLIC_*
```

Ejemplo inicial:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

No exponer:

```text
DATABASE_URL
AWS secret keys
session secrets
S3 credentials
```

---

# 21. Validación de environment

Toda configuración obligatoria se valida mediante:

```text
Zod
```

La aplicación debe:

```text
fail fast
```

si falta configuración requerida.

No utilizar defaults inseguros en staging/production.

---

# 22. Acceso a `process.env`

No dispersar:

```ts
process.env.SOME_VALUE
```

por todo el código.

Centralizar en configuración validada.

Ejemplo conceptual:

```text
AppConfig
DatabaseConfig
AuthConfig
StorageConfig
```

---

# 23. Desarrollo habitual

Con infraestructura ya activa:

```bash
pnpm dev
```

Turborepo levanta:

```text
apps/web
apps/api
```

---

# 24. `pnpm dev`

Debe ser el entrypoint estándar de desarrollo.

Conceptualmente:

```text
root
↓
Turbo
├── web dev
└── api dev
```

No exigir abrir manualmente múltiples terminales salvo debugging específico.

---

# 25. Bootstrap inicial

Flujo recomendado desde un clone limpio:

```text
1. Instalar Node LTS.
2. Instalar Docker.
3. Habilitar Corepack.
4. Ejecutar pnpm install.
5. Crear archivos de environment desde examples.
6. Ejecutar pnpm infra:up.
7. Ejecutar pnpm db:migrate.
8. Ejecutar pnpm db:seed.
9. Ejecutar pnpm generate:api.
10. Ejecutar pnpm dev.
```

---

# 26. Quick start conceptual

```bash
corepack enable
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm generate:api
pnpm dev
```

Los comandos deben funcionar desde la raíz.

---

# 27. Prisma

El schema principal vive en:

```text
apps/api/prisma/schema.prisma
```

El flujo de DB utiliza:

```text
Prisma Migrate
```

No `db push` como mecanismo habitual.

---

# 28. Migraciones locales

Script:

```bash
pnpm db:migrate
```

Debe ejecutar conceptualmente:

```text
prisma migrate dev
```

desde el contexto de `apps/api`.

---

# 29. Crear migración sin aplicar cambios definitivos

Debe existir:

```bash
pnpm db:migrate:create
```

equivalente conceptual:

```text
prisma migrate dev --create-only
```

Útil para revisar:

```text
partial unique indexes
CHECK constraints
manual SQL
PostgreSQL-specific behavior
```

---

# 30. SQL manual

Cuando una migración requiera SQL manual:

```text
review migration.sql
edit intentionally
run integration tests
```

Codex no debe eliminar SQL manual solo porque Prisma no lo representa directamente.

---

# 31. `db push`

No utilizar:

```bash
prisma db push
```

como flujo normal.

Solo podría utilizarse en experimentos descartables fuera del flujo oficial, nunca como reemplazo de migraciones versionadas.

---

# 32. Reset de DB local

Debe existir:

```bash
pnpm db:reset
```

Su uso es destructivo.

Debe:

```text
drop/reset local database
apply migrations
run appropriate seed
```

---

# 33. Protección de `db:reset`

El comando debe rechazar ejecución cuando detecta ambientes no locales.

Nunca permitir accidentalmente:

```text
production reset
staging reset
```

mediante el comando habitual.

---

# 34. Seeds

Existen dos niveles:

```text
db:seed
db:seed:demo
```

---

# 35. `db:seed`

Contiene datos mínimos necesarios.

Ejemplos:

```text
catalogs required by app
initial technical values
baseline configuration
```

Debe ser seguro para ambientes donde corresponda.

No incluir pacientes demo.

---

# 36. `db:seed:demo`

Solo para desarrollo local.

Puede crear:

```text
synthetic Persons
Sala data
appointments
payments
clinical records
```

para facilitar pruebas manuales.

No ejecutar en production.

---

# 37. Datos demo

Los datos deben ser claramente sintéticos.

Ejemplos:

```text
Ana Demo
Carlos Test
Paciente Ejemplo
```

No copiar:

```text
real patient names
real DNI
real clinical history
real studies
```

---

# 38. DNI demo

Los DNI de desarrollo deben ser ficticios y elegidos de forma controlada para minimizar confusión con datos reales.

No importar dumps productivos.

---

# 39. Admin local

El seed de desarrollo puede crear un:

```text
General Admin
```

sintético.

Las credenciales:

- son exclusivas de local;
- se documentan como dev-only;
- no se reutilizan en staging;
- no se reutilizan en production.

---

# 40. Admin staging/production

El primer General Admin en ambientes reales se crea mediante procedimiento controlado.

No mediante credenciales hardcodeadas dentro de seeds generales.

---

# 41. OpenAPI

NestJS genera la especificación OpenAPI.

El frontend no mantiene una copia manual del contrato.

---

# 42. Generación API client

Debe existir:

```bash
pnpm generate:api
```

Flujo:

```text
generate OpenAPI
↓
run Orval
↓
generate packages/api-client
```

---

# 43. Generación determinística

La generación no debe requerir que un desarrollador:

```text
start API manually
open second terminal
download swagger JSON
```

Idealmente un script Nest genera `openapi.json` directamente y ejecuta Orval.

---

# 44. OpenAPI generation script

Conceptualmente:

```text
apps/api/scripts/generate-openapi.ts
```

Puede:

1. crear la app Nest en modo documentación;
2. construir el documento OpenAPI;
3. escribir archivo temporal;
4. cerrar aplicación;
5. permitir ejecutar Orval.

La implementación concreta puede ajustarse.

---

# 45. `openapi.json`

No es obligatorio versionarlo si:

```text
can be generated deterministically
```

Puede ser un artefacto temporal.

La fuente de verdad es el backend.

---

# 46. Cliente Orval

El código generado sí puede quedar versionado en:

```text
packages/api-client
```

para:

- builds reproducibles;
- revisión de cambios;
- uso frontend inmediato.

No editarlo manualmente.

---

# 47. Drift del cliente

CI debe detectar si:

```text
backend OpenAPI
!=
generated api-client
```

Conceptualmente:

```bash
pnpm generate:api
git diff --exit-code
```

---

# 48. S3 local

El backend debe usar el mismo adapter S3 para:

```text
MinIO local
AWS S3 deployed
```

Las diferencias provienen de configuración.

---

# 49. MinIO initialization

Al ejecutar:

```bash
pnpm infra:up
```

el bucket local debe quedar listo automáticamente.

No debe existir un paso manual como:

```text
abrir localhost:9001
crear bucket
cambiar policy
```

en el quick start habitual.

---

# 50. Bucket local privado

El bucket local debe comportarse de forma equivalente al modelo productivo:

```text
private by default
```

La app obtiene archivos a través de mecanismos autorizados.

---

# 51. CORS local

API local permite explícitamente:

```text
http://localhost:3000
```

No utilizar wildcard:

```text
*
```

como política estándar.

Esto mantiene comportamiento cercano a producción.

---

# 52. Cookies local

Diferencia permitida:

```text
Local HTTP
→ Secure=false

Staging/Production HTTPS
→ Secure=true
```

Se mantiene:

```text
HttpOnly
SameSite
server-side sessions
```

No crear un sistema JWT alternativo solo para desarrollo.

---

# 53. Auth local

La autenticación local debe ejecutar el mismo flujo de aplicación:

```text
credentials
server-side session
cookie
permissions
```

que staging/production.

Solo cambian configuraciones técnicas necesarias para localhost.

---

# 54. Timezone local

Configurar explícitamente:

```text
APP_TIMEZONE=America/Argentina/Buenos_Aires
```

No depender de la timezone de la computadora del desarrollador.

---

# 55. Logging backend local

El backend utiliza:

```text
Pino
```

En local puede activarse un pretty transport para mejorar lectura.

Ejemplo visual:

```text
INFO request completed
WARN domain conflict
ERROR unexpected failure
```

---

# 56. Logging desplegado

Staging/production utilizan:

```text
structured JSON logs
```

sin modificar las llamadas de logging dentro del código.

La diferencia es configuración del transport/output.

---

# 57. `console.log`

No utilizar `console.log` en código productivo para debugging.

Puede utilizarse temporalmente durante investigación local, pero debe eliminarse antes de finalizar la tarea.

Scripts técnicos puntuales pueden ser una excepción razonable.

---

# 58. Frontend debugging

Se permite:

```text
TanStack Query Devtools
```

solo en development.

No debe aparecer en staging/production final.

---

# 59. Next.js development

Frontend local:

```text
http://localhost:3000
```

Debe consumir:

```text
http://localhost:3001/api
```

mediante la variable frontend configurada.

---

# 60. API development

Backend local:

```text
http://localhost:3001
```

API:

```text
http://localhost:3001/api
```

Health:

```text
http://localhost:3001/health
```

---

# 61. Swagger local

Swagger/OpenAPI UI puede quedar disponible en local.

Ejemplo conceptual:

```text
http://localhost:3001/docs
```

La ruta exacta puede fijarse durante implementación.

---

# 62. Servicios externos futuros

Cuando aparezca una integración externa, preferir:

```text
adapter
+
fake/local implementation when valuable
```

Evitar que el desarrollo cotidiano dependa de servicios externos reales sin necesidad.

---

# 63. No anticipar integraciones

No crear fakes/adapters para servicios inexistentes todavía.

La regla se aplica cuando se incorpore una integración real.

---

# 64. Scripts raíz

El monorepo debe exponer scripts coherentes.

Mínimo conceptual:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm generate:api

pnpm infra:up
pnpm infra:down

pnpm db:migrate
pnpm db:migrate:create
pnpm db:reset
pnpm db:seed
pnpm db:seed:demo
```

---

# 65. Turborepo

Turborepo coordina:

```text
dev
build
lint
typecheck
test
```

entre apps y packages.

No duplicar orchestration manual si Turbo puede manejar dependencias correctamente.

---

# 66. `pnpm lint`

Debe ejecutar lint en todas las apps/packages relevantes.

La expectativa es:

```text
zero warnings
zero errors
```

según `CODING_CONVENTIONS.md`.

---

# 67. `pnpm typecheck`

Debe verificar TypeScript en todo el monorepo.

No depender únicamente de que Next/Nest compile.

---

# 68. `pnpm test`

Ejecuta la suite habitual de unit/component tests.

Los Integration/E2E pueden permanecer separados según costo.

---

# 69. `pnpm test:integration`

Ejecuta tests con:

```text
real PostgreSQL
```

según `TESTING.md`.

La infraestructura de testing puede utilizar Testcontainers o service container.

---

# 70. `pnpm test:e2e`

Ejecuta:

```text
Playwright
```

sobre el ambiente de test controlado.

---

# 71. `pnpm build`

Debe comprobar:

```text
apps/web
apps/api
shared packages
```

y detectar errores de producción.

---

# 72. `pnpm check`

Debe existir un comando agregado para validación amplia.

Conceptualmente:

```text
lint
+
typecheck
+
unit/component tests
+
relevant integration tests
+
build
```

El contenido exacto puede optimizarse según duración.

---

# 73. E2E dentro de `check`

No es obligatorio incluir el E2E completo si vuelve impráctico el comando local.

CI sí debe ejecutar el nivel de E2E definido en `TESTING.md`.

---

# 74. Codex y `check`

Antes de cerrar tareas relevantes, Codex debe ejecutar:

```bash
pnpm check
```

o, si el proyecto todavía no posee el script completo durante bootstrap, los comandos equivalentes documentados.

Si una tarea afecta un E2E crítico, también debe ejecutar la suite Playwright correspondiente.

---

# 75. Instalación de dependencias

Las dependencias se agregan desde la raíz del monorepo.

Ejemplo:

```bash
pnpm --filter @athleta/api add <package>
```

```bash
pnpm --filter @athleta/web add <package>
```

```bash
pnpm --filter @athleta/ui add <package>
```

No ejecutar `npm install` dentro de subdirectorios.

---

# 76. Workspace dependencies

Dependencias internas deben utilizar workspace protocol cuando corresponda.

Ejemplo:

```json
{
  "@athleta/ui": "workspace:*"
}
```

---

# 77. Cambios de dependencias mayores

Separar upgrades importantes de features funcionales cuando sea posible.

Evitar una PR como:

```text
Implement appointments
+
Next major upgrade
+
Prisma major upgrade
```

sin necesidad.

---

# 78. Nuevas dependencias

Antes de agregar una librería:

1. verificar si el stack ya resuelve el problema;
2. revisar mantenimiento;
3. evitar duplicar librerías;
4. considerar impacto de bundle/runtime;
5. revisar si constituye decisión arquitectónica.

---

# 79. Dependencias arquitectónicas

No introducir sin decisión explícita:

```text
Redis
GraphQL
Redux
Zustand
new ORM
new UI framework
message broker
CQRS framework
```

---

# 80. README raíz

El README debe ser corto.

Debe contener:

```text
what Athleta Manager is
prerequisites
quick start
links to docs
```

No duplicar todo `DEVELOPMENT.md`.

---

# 81. README y DEVELOPMENT

Patrón:

```text
README
→ fast onboarding

DEVELOPMENT.md
→ complete development workflow
```

Así se evita mantener dos manuales divergentes.

---

# 82. Prerequisites del README

Como mínimo:

```text
Node LTS
Corepack
Docker
Git
```

---

# 83. Git ignored files

Debe ignorarse:

```text
.env
.env.local
node_modules
.next
dist
coverage
temporary OpenAPI artifacts
Playwright artifacts as appropriate
```

No ignorar archivos generados que se haya decidido versionar, como el cliente Orval.

---

# 84. Build artifacts

No versionar:

```text
.next
dist
coverage
```

salvo necesidad técnica futura explícita.

---

# 85. Desarrollo local sin internet

Después de instalar dependencias, el core local debería poder trabajar sin depender innecesariamente de servicios externos.

Excepciones naturales:

```text
package installation
external integrations under active development
```

---

# 86. Staging

Staging utiliza:

```text
Vercel web
Railway API
Railway PostgreSQL
AWS S3
```

con configuración propia.

Nunca apuntar un frontend local por defecto a staging.

---

# 87. Production

Producción utiliza configuración independiente.

No compartir:

```text
database
bucket
session secrets
cookie namespace when collision risk exists
```

con staging.

---

# 88. Environment naming

Utilizar:

```text
development
test
staging
production
```

de forma consistente.

No crear nombres arbitrarios por módulo.

---

# 89. Paridad de código

Local, staging y production utilizan el mismo código.

Las diferencias deben provenir de:

```text
environment config
provider endpoints
secrets
```

No mantener branches funcionales del tipo:

```ts
if (production) {
  useDifferentBusinessRule();
}
```

---

# 90. Migrations staging/production

El deploy utiliza:

```text
prisma migrate deploy
```

como release step.

No ejecutar migraciones automáticamente al boot de NestJS.

---

# 91. Migraciones local vs deploy

Local:

```text
prisma migrate dev
```

Staging/production:

```text
prisma migrate deploy
```

Esta diferencia es deliberada.

---

# 92. Seeds deployed

No ejecutar:

```text
db:seed:demo
```

en ambientes reales.

Los seeds productivos deben ser deliberados y limitados.

---

# 93. Reset deployed

Los comandos de reset local nunca deben formar parte del pipeline de deploy.

---

# 94. Troubleshooting DB local

Si la DB local queda inconsistente durante desarrollo:

```text
pnpm db:reset
```

es aceptable si no hay datos que deban conservarse.

No arreglar manualmente schema para evitar una migración rota sin investigar la causa.

---

# 95. Troubleshooting MinIO

Si el storage local se reinicia completamente, el init del compose debe poder recrear el bucket.

Los registros DB que apuntaban a objetos borrados pueden requerir reset/seed de local.

---

# 96. Troubleshooting generated client

Si el frontend falla por tipos desactualizados:

```bash
pnpm generate:api
```

Luego revisar el diff.

No editar `packages/api-client` a mano.

---

# 97. Troubleshooting env

Si API no arranca, la validación debe indicar:

```text
which required config is missing/invalid
```

sin imprimir secretos.

---

# 98. Troubleshooting ports

Los puertos estándar son:

```text
3000
3001
5432
9000
9001
```

Si existe colisión, el desarrollador puede ajustar configuración local, pero no debe cambiar defaults del repositorio sin razón.

---

# 99. Test environment

Tests no deben reutilizar la DB local de desarrollo como fuente implícita de estado.

Integration tests utilizan DB aislada según `TESTING.md`.

---

# 100. Test env variables

Los tests podrán cargar configuración específica:

```text
.env.test
```

o valores definidos por el test runner/containers.

No colocar secrets reales.

---

# 101. Testcontainers

Si se utiliza Testcontainers:

- Docker debe estar disponible;
- el container define su propia DB;
- migrations se aplican antes del test;
- el container se destruye al finalizar.

---

# 102. Local test data

No asumir que los seeds demo existen dentro de Integration Tests.

Los tests deben crear sus propios datos.

---

# 103. Clock local

En ejecución normal:

```text
SystemClock
```

Tests pueden usar:

```text
FakeClock
```

según `TESTING.md`.

---

# 104. Timezone en scripts

Scripts de seed/migración que generen fechas deben ser explícitos sobre:

```text
DateOnly
timestamp UTC
America/Argentina/Buenos_Aires operational time
```

No depender del locale del shell.

---

# 105. File paths

No hardcodear paths absolutos de una computadora.

Incorrecto:

```text
/Users/francisco/projects/athleta
```

Utilizar paths relativos al repo/runtime.

---

# 106. OS portability

El workflow debe funcionar razonablemente en:

```text
macOS
Linux
Windows + supported Docker/Node tooling
```

Evitar scripts shell específicos si una solución Node/package script portable es simple.

---

# 107. Shell scripts

Cuando se utilicen scripts shell, documentar requisitos.

Preferir scripts Node/TypeScript para lógica portable compleja.

---

# 108. Local HTTPS

No es requerido inicialmente.

Local puede utilizar:

```text
http://localhost
```

con ajustes de cookie definidos.

Staging/production siempre HTTPS.

---

# 109. Browser cookies

Dado que web y API utilizan puertos distintos en localhost, configurar correctamente:

```text
CORS credentials
cookie attributes
frontend credentials
CSRF behavior
```

desde el inicio.

No desactivar seguridad completamente para resolver localhost.

---

# 110. Sentry local

Sentry puede quedar:

```text
disabled
```

por defecto en development.

No enviar errores de desarrollo cotidiano al proyecto productivo.

---

# 111. Sentry staging/production

Debe activarse mediante variables de ambiente y sanitización según `SECURITY.md`.

---

# 112. Log levels

Conceptualmente:

```text
development
→ debug/info

staging
→ info

production
→ info/warn/error
```

La configuración exacta puede ajustarse.

No utilizar `debug` indiscriminadamente en production.

---

# 113. Data cleanup scripts

Si posteriormente existen scripts de cleanup:

```text
orphan S3 cleanup
expired sessions cleanup
```

deben ser explícitos y seguros.

No ejecutar procesos destructivos automáticamente desde desarrollo salvo cuando estén diseñados para ello.

---

# 114. Background jobs

No existe infraestructura de queues inicialmente.

No introducir Redis/BullMQ solo por necesitar un script local.

Si aparece un caso real, se evalúa por separado.

---

# 115. AI module

Este documento no define setup del módulo IA futuro.

La primera etapa mantiene el core operativo independiente de IA.

Cuando exista implementación IA, tendrá su propia documentación de desarrollo si agrega nuevas dependencias/runtime.

---

# 116. Flujo diario recomendado

Inicio:

```bash
pnpm infra:up
pnpm dev
```

Durante desarrollo:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Si cambia API:

```bash
pnpm generate:api
```

Si cambia DB:

```bash
pnpm db:migrate:create
# review migration
pnpm db:migrate
```

Antes de finalizar:

```bash
pnpm check
```

---

# 117. Cambio de schema DB

Flujo:

```text
1. Modify Prisma schema.
2. Create migration.
3. Review generated SQL.
4. Add manual SQL if needed.
5. Apply migration locally.
6. Update seeds if needed.
7. Run integration tests.
8. Commit schema + migration + tests together.
```

---

# 118. Cambio de API

Flujo:

```text
1. Modify backend contract.
2. Update OpenAPI annotations/schemas.
3. Run pnpm generate:api.
4. Review generated client diff.
5. Update frontend consumer.
6. Run API/frontend tests.
7. Run pnpm check.
```

---

# 119. Cambio visual

Seguir:

```text
docs/design/DESIGN_SYSTEM.md
```

No crear nuevos tokens/colores por conveniencia local.

---

# 120. Cambio funcional pendiente

Si el desarrollo alcanza una regla marcada:

```text
PENDING_FUNCTIONAL_DEFINITION
BLOCKED_BY_FUNCTIONAL_DEFINITION
```

no elegir comportamiento arbitrariamente.

Debe:

```text
report blocker
keep design neutral when possible
wait for functional definition if necessary
```

---

# 121. Cambio de arquitectura

Si una tarea requiere modificar decisiones existentes:

```text
stack
database strategy
auth
deployment
state management
queues
storage
```

no implementarlo silenciosamente.

Debe evaluarse y, cuando corresponda, crear:

```text
ADR
```

---

# 122. Comandos esperados del root

Objetivo final:

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

Los scripts deben mantenerse documentados y funcionales.

---

# 123. Definition of Done operativa

Antes de cerrar una tarea:

1. La app relevante levanta correctamente.
2. No existen variables de entorno nuevas sin `.env.example`.
3. Migraciones nuevas están versionadas y testeadas.
4. Cliente API se regeneró si cambió OpenAPI.
5. No quedaron logs temporales.
6. No quedaron secrets.
7. No se editaron archivos generados manualmente.
8. Los checks aplicables pasan.
9. El build pasa.
10. Se respetaron decisiones funcionales y técnicas documentadas.

---

# 124. Regla para Codex

Cuando Codex inicia trabajo en un clone nuevo:

```text
read AGENTS.md
↓
read referenced docs
↓
verify environment
↓
install dependencies if necessary
↓
start infrastructure
↓
apply migrations
↓
run relevant tests
↓
implement
↓
run validation
```

No improvisar un workflow alternativo.

---

# 125. Principios finales

1. Node LTS queda fijado en repo.
2. pnpm es el único package manager.
3. Corepack administra la versión de pnpm.
4. Docker se utiliza para infraestructura local.
5. PostgreSQL local corre en Docker.
6. MinIO simula S3 localmente.
7. Web y API corren directamente con Node en development.
8. Puertos estándar: 3000, 3001, 5432, 9000, 9001.
9. Cada app posee su propio environment file.
10. `.env.example` se versiona; secrets reales no.
11. Environment se valida con Zod y fail-fast.
12. `pnpm dev` es el comando normal de desarrollo.
13. `pnpm infra:up` levanta dependencias locales.
14. Prisma Migrate es el flujo oficial de schema.
15. `db push` no es el flujo habitual.
16. `db:reset` es exclusivamente local/test.
17. Existen seeds mínimos y demo separados.
18. Los datos demo son siempre sintéticos.
19. Admin local puede crearse mediante seed dev-only.
20. OpenAPI + Orval se generan con `pnpm generate:api`.
21. La generación debe ser determinística.
22. El cliente Orval se versiona y no se edita manualmente.
23. MinIO crea el bucket automáticamente.
24. Local mantiene CORS explícito.
25. Local usa cookies del mismo sistema con `Secure=false` por HTTP.
26. Pino puede ser pretty en local y JSON en deploy.
27. TanStack Query Devtools solo se activa en development.
28. Los scripts de calidad viven en root.
29. `pnpm check` es la validación amplia estándar.
30. Dependencias se agregan desde el root mediante pnpm workspace.
31. Upgrades mayores se separan de features cuando sea posible.
32. README es breve y apunta a DEVELOPMENT.md.
33. Local, staging y production comparten el mismo código.
34. Las diferencias entre ambientes son de configuración.
35. Codex no inventa reglas funcionales ni cambia arquitectura silenciosamente.

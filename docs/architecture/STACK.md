# STACK.md — Athleta Manager

## 1. Propósito

Este documento define las tecnologías y herramientas seleccionadas para implementar Athleta Manager.

Las tecnologías aquí establecidas deben considerarse el stack estándar del proyecto.

No deben incorporarse alternativas que dupliquen responsabilidades sin una necesidad técnica concreta.

---

# 2. Resumen del stack

```text
Lenguaje
└── TypeScript

Monorepo
├── pnpm
└── Turborepo

Frontend
├── Next.js
├── React
├── Tailwind CSS
├── shadcn/ui
├── Lucide
├── React Hook Form
├── Zod
├── TanStack Query
└── TanStack Table

Backend
├── Node.js
├── NestJS
├── Zod
├── OpenAPI
├── Prisma
├── Pino
└── nestjs-pino

API Client
└── Orval

Database
└── PostgreSQL

Files
└── S3-compatible Object Storage

Testing
├── Jest
├── Vitest
├── React Testing Library
└── Playwright

Architecture
└── Modular Monolith
```

---

# 3. Lenguaje

Se utilizará:

```text
TypeScript
```

tanto en frontend como backend.

Objetivos:

- reducir errores de integración;
- mantener contratos explícitos;
- mejorar refactors;
- aprovechar tipos generados;
- simplificar el trabajo dentro del monorepo.

JavaScript sin tipado no será utilizado para código nuevo salvo archivos técnicos que lo requieran específicamente.

---

# 4. Runtime

Backend:

```text
Node.js
```

Se utilizará una versión LTS estable elegida al inicializar el proyecto.

La versión deberá quedar fijada mediante la configuración del repositorio y los entornos de build.

No se dependerá de la versión instalada accidentalmente en la máquina del desarrollador.

---

# 5. Package manager

Se utilizará:

```text
pnpm
```

Razones:

- soporte sólido de workspaces;
- instalación eficiente;
- buena gestión de dependencias en monorepos;
- resolución estricta;
- buen soporte con Turborepo.

No se mezclarán:

```text
npm
yarn
pnpm
```

dentro del proyecto.

El lockfile oficial será:

```text
pnpm-lock.yaml
```

---

# 6. Monorepo

Se utilizará:

```text
Turborepo
```

junto con pnpm workspaces.

Será responsable de coordinar tareas como:

```text
dev
build
lint
typecheck
test
```

entre aplicaciones y packages.

Estructura principal:

```text
apps/
packages/
docs/
```

---

# 7. Frontend

Framework:

```text
Next.js
```

utilizando:

```text
React
App Router
TypeScript
```

Se utilizará una única aplicación Next.js para:

- aplicación interna;
- Portal Athleta.

No se crearán dos proyectos frontend inicialmente.

---

# 8. Estrategia de rendering

No se impondrá SSR o CSR universalmente.

Se seleccionará el mecanismo apropiado según cada pantalla.

Principio general:

- navegación y estructura: capacidades nativas de Next.js;
- datos altamente interactivos: cliente + TanStack Query;
- lógica sensible: backend NestJS;
- secretos: nunca en código cliente.

No se duplicará lógica de negocio dentro de Server Actions.

NestJS continuará siendo la API y fuente principal de reglas del sistema.

---

# 9. UI

Se utilizará:

```text
Tailwind CSS
+
shadcn/ui
```

Objetivos:

- alta velocidad de desarrollo;
- responsive;
- componentes accesibles;
- personalización con identidad Athleta;
- evitar quedar atados a un diseño visual rígido.

Los componentes de shadcn forman parte del código del proyecto y podrán adaptarse a Athleta.

---

# 10. Iconografía

Se utilizará:

```text
Lucide
```

No se mezclarán múltiples librerías de iconos sin necesidad.

---

# 11. Design system

Los componentes reutilizables propios se ubicarán progresivamente en:

```text
packages/ui
```

Ejemplos:

- botones;
- badges;
- cards;
- inputs;
- dialogs;
- tablas base;
- estados;
- layouts;
- componentes de feedback.

La identidad visual debe centralizarse mediante tokens y estilos compartidos.

---

# 12. Formularios

Se utilizará:

```text
React Hook Form
```

para formularios interactivos.

Razones:

- rendimiento;
- manejo de errores;
- integración con validación;
- formularios complejos;
- bajo nivel de rerenders.

---

# 13. Validación frontend

Se utilizará:

```text
Zod
```

Ejemplos de validaciones apropiadas:

- campo obligatorio;
- formato;
- longitud;
- número positivo;
- enum válido;
- estructura del payload.

Las reglas complejas de negocio no deben confiarse exclusivamente a Zod en frontend.

---

# 14. Validación backend

También se utilizará Zod.

El backend siempre vuelve a validar los datos recibidos.

Frontend:

```text
UX / feedback temprano
```

Backend:

```text
seguridad
+
integridad
+
fuente de verdad
```

---

# 15. Contratos compartidos

Se utilizará:

```text
packages/contracts
```

para información que sea realmente compartible.

Ejemplos:

- enums;
- schemas Zod simples;
- tipos independientes de infraestructura.

No se utilizará para compartir internals de Prisma ni entidades de dominio completas.

---

# 16. Estado remoto

Se utilizará:

```text
TanStack Query
```

para comunicación con backend.

Responsabilidades:

- queries;
- mutations;
- caching;
- loading;
- error state;
- invalidación;
- refetch;
- paginación.

No se implementará un cache de servidor propio en frontend.

---

# 17. Estado local

Se utilizarán primitivas de React cuando sea suficiente:

```text
useState
useReducer
Context
```

No se instalará Redux inicialmente.

Si en el futuro se identifica una necesidad concreta de estado global cliente, se evaluará en ese momento.

---

# 18. Tablas

Se utilizará:

```text
TanStack Table
```

para listados complejos.

Casos principales:

- Alumnos;
- Pacientes;
- Equipo;
- Ingresos;
- Gastos;
- Tratamientos;
- catálogos.

El backend continuará siendo responsable de consultas grandes.

---

# 19. Paginación

Preferencia:

```text
server-side pagination
```

para listados que puedan crecer significativamente.

La API deberá aceptar parámetros explícitos de:

```text
page
pageSize
sort
filters
search
```

La convención exacta se definirá con el contrato de API.

---

# 20. Backend framework

Se utilizará:

```text
NestJS
```

Razones:

- módulos;
- dependency injection;
- guards;
- controllers;
- testing;
- OpenAPI;
- estructura consistente;
- buena adaptación a aplicaciones con reglas de negocio.

---

# 21. API

Estilo:

```text
REST
```

Formato principal:

```text
JSON
```

Transporte:

```text
HTTPS
```

No se utilizará GraphQL inicialmente.

No se utilizará tRPC.

---

# 22. OpenAPI

NestJS generará el contrato:

```text
OpenAPI
```

Se deberá mantener actualizado con la API.

OpenAPI será la fuente de generación del cliente TypeScript.

---

# 23. Cliente de API

Se utilizará:

```text
Orval
```

Flujo:

```text
NestJS
↓
OpenAPI
↓
Orval
↓
packages/api-client
↓
Next.js
```

El código generado no debe modificarse manualmente.

Cuando cambie OpenAPI se regenerará el cliente.

---

# 24. Base de datos

Se utilizará:

```text
PostgreSQL
```

Razones principales:

- modelo altamente relacional;
- transacciones;
- constraints;
- integridad;
- consultas;
- madurez;
- herramientas disponibles.

PostgreSQL será la base de datos transaccional principal de Athleta.

---

# 25. ORM

Se utilizará:

```text
Prisma
```

Responsabilidades:

- schema;
- queries;
- tipos;
- migraciones;
- transacciones.

Prisma no debe convertirse en la representación del dominio.

El hecho de que una operación sea sencilla de expresar con Prisma no significa que pueda ignorar reglas de negocio.

---

# 26. Migraciones

Herramienta:

```text
Prisma Migrate
```

Todos los cambios estructurales deberán estar versionados.

No se aceptan modificaciones directas no documentadas sobre producción.

---

# 27. IDs

Se utilizarán:

```text
UUID
```

como identificadores técnicos principales.

La implementación exacta de generación se definirá en el schema Prisma.

Los identificadores visibles funcionales serán campos independientes cuando corresponda.

---

# 28. Dinero

Persistencia:

```text
PostgreSQL NUMERIC / DECIMAL
```

Backend:

```text
Prisma.Decimal
```

No utilizar:

```text
FLOAT
DOUBLE
```

como representación persistente de dinero.

---

# 29. Fechas

Timezone operativo:

```text
America/Argentina/Buenos_Aires
```

Timestamps:

```text
UTC
```

Frontend:

```text
dd/mm/aaaa
24-hour time
```

según contexto funcional.

Se distinguirá entre:

```text
DATE
timestamp
month/year period
```

según significado real del campo.

---

# 30. Autenticación

Se utilizará autenticación propia basada en:

```text
server-side sessions
```

La sesión estará asociada a una cookie segura.

No se utilizará JWT como mecanismo inicial principal.

---

# 31. Persistencia de sesiones

Inicialmente:

```text
PostgreSQL
```

No se introducirá Redis únicamente para sesiones.

Si el volumen o arquitectura futura lo requiere, podrá evaluarse posteriormente.

---

# 32. Contraseñas y PIN

El mecanismo de hash concreto se definirá dentro del documento de seguridad.

Regla del stack:

- nunca almacenar contraseña en texto plano;
- nunca almacenar PIN recuperable;
- nunca retornar credenciales vigentes;
- nunca incluir credenciales en logs.

---

# 33. Autorización

Se implementará:

```text
RBAC
```

en NestJS.

Los mecanismos podrán utilizar:

- decorators;
- guards;
- policies internas.

La tecnología concreta debe mantenerse simple y propia del backend.

No se incorporará inicialmente un producto IAM externo.

---

# 34. Object Storage

Los archivos se almacenarán en un servicio:

```text
S3-compatible
```

Esto permite utilizar diferentes proveedores sin alterar la arquitectura de la aplicación.

Ejemplos de compatibilidad posibles:

- AWS S3;
- Cloudflare R2;
- MinIO;
- proveedores compatibles con S3.

La selección del proveedor corresponde al documento de infraestructura.

---

# 35. Metadata de archivos

PostgreSQL almacenará:

- identificador;
- storage key;
- nombre original;
- MIME type;
- tamaño;
- relación de negocio;
- timestamps correspondientes.

El archivo binario no se guardará en PostgreSQL.

---

# 36. Logging

Se utilizará:

```text
Pino
+
nestjs-pino
```

Formato preferido:

```text
structured JSON logs
```

En desarrollo podrá utilizarse una presentación legible sin cambiar la estructura fundamental.

---

# 37. Correlation IDs

Las requests deberán disponer de un identificador que permita relacionar logs correspondientes a una misma operación.

Ejemplo:

```text
requestId
```

Este dato podrá propagarse a operaciones internas cuando sea necesario.

---

# 38. Manejo de errores

NestJS implementará un mecanismo centralizado mediante filtros/interceptors o mecanismos equivalentes.

El formato de error será uniforme:

```json
{
  "statusCode": 409,
  "code": "BUSINESS_ERROR",
  "message": "Descripción",
  "details": {}
}
```

No se devolverán stack traces al cliente en producción.

---

# 39. Testing backend

Se utilizará:

```text
Jest
```

junto con utilities de NestJS.

Casos:

- unit tests;
- application services;
- reglas;
- integration tests de módulos.

---

# 40. Testing frontend

Se utilizará:

```text
Vitest
+
React Testing Library
```

Casos:

- componentes;
- formularios;
- hooks;
- comportamiento de UI.

No se buscará probar internals de React.

Se probará comportamiento observable.

---

# 41. End-to-end

Se utilizará:

```text
Playwright
```

Casos críticos:

- autenticación;
- alta de Persona;
- flujos de Sala;
- agenda;
- pagos;
- Clínica;
- permisos;
- Portal.

Los escenarios funcionales documentados deberán servir como fuente para estos tests.

---

# 42. Linting

Se utilizará ESLint mediante configuración compartida:

```text
packages/eslint-config
```

Frontend, backend y packages compartirán las reglas fundamentales.

---

# 43. Formatting

El proyecto tendrá un único criterio automático de formato.

La herramienta de formatting se definirá al inicializar el repositorio y será aplicada de forma consistente.

No debe existir formato manual diferente por aplicación.

---

# 44. Type checking

El pipeline deberá incluir:

```text
typecheck
```

independientemente del build.

Los errores TypeScript deben impedir integrar código defectuoso.

---

# 45. CI

El pipeline mínimo deberá poder ejecutar:

```text
install
lint
typecheck
test
build
```

Los tests E2E podrán ejecutarse en un pipeline separado si el costo/tiempo lo justifica.

La plataforma concreta de CI/CD se definirá en `INFRASTRUCTURE.md`.

---

# 46. Redis

No forma parte del stack inicial.

No utilizar:

```text
Redis
BullMQ
```

salvo que aparezca una necesidad funcional/técnica concreta.

---

# 47. Message brokers

No forman parte del stack inicial:

```text
RabbitMQ
Kafka
NATS
```

El monolito operará mediante llamadas internas y transacciones locales.

---

# 48. Inteligencia Artificial

No se seleccionarán todavía tecnologías del módulo IA.

Quedan fuera de este documento por ahora:

- proveedor LLM;
- modelos;
- embeddings;
- vector database;
- RAG;
- procesamiento documental para IA;
- workers;
- colas IA;
- evaluación de prompts.

El módulo se diseñará posteriormente.

---

# 49. Versionado de dependencias

Al inicializar el repositorio se seleccionarán versiones estables compatibles entre sí.

A partir de ese momento:

- las versiones quedarán fijadas por lockfile;
- los upgrades mayores serán deliberados;
- no se actualizarán dependencias importantes incidentalmente durante una feature.

Codex no deberá cambiar versiones principales sin justificación.

---

# 50. Dependencias duplicadas

Evitar introducir herramientas con la misma responsabilidad.

Ejemplos:

```text
Zod + Yup
```

No.

```text
TanStack Query + SWR
```

No.

```text
Prisma + TypeORM
```

No.

```text
Tailwind/shadcn + Material UI
```

No, salvo una decisión arquitectónica explícita.

---

# 51. Stack final aprobado

## Repository

```text
pnpm
Turborepo
```

## Language

```text
TypeScript
```

## Frontend

```text
Next.js
React
Tailwind CSS
shadcn/ui
Lucide
React Hook Form
Zod
TanStack Query
TanStack Table
```

## Backend

```text
Node.js
NestJS
Zod
Prisma
OpenAPI
Pino
nestjs-pino
```

## API Client

```text
Orval
```

## Database

```text
PostgreSQL
```

## File Storage

```text
S3-compatible Object Storage
```

## Testing

```text
Jest
Vitest
React Testing Library
Playwright
```

## Authentication

```text
Server-side sessions
PostgreSQL session persistence
Secure HttpOnly cookies
```

## Architecture

```text
Modular Monolith
```

---

# 52. Regla para nuevas tecnologías

Antes de agregar una dependencia relevante debe responderse:

1. ¿Qué problema concreto resuelve?
2. ¿Ese problema ya está resuelto por una tecnología existente?
3. ¿Es necesaria para el alcance actual?
4. ¿Agrega infraestructura o complejidad operativa?
5. ¿Puede resolverse razonablemente sin incorporarla?

Si no existe una razón clara, no se agrega.

La simplicidad del stack es una decisión deliberada del proyecto.
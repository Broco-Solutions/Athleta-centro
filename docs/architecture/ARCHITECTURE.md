# ARCHITECTURE.md — Athleta Manager

## 1. Propósito

Este documento define la arquitectura técnica de Athleta Manager.

Su objetivo es establecer límites, responsabilidades, dependencias y principios estructurales para que el desarrollo mantenga una arquitectura consistente durante toda la vida del proyecto.

Este documento no redefine reglas funcionales del negocio. Las reglas funcionales provienen de la documentación funcional del proyecto y de las definiciones relevadas con el Analista.

Cuando exista una ambigüedad funcional, la implementación no debe inventar una regla de negocio.

---

# 2. Principios arquitectónicos

Athleta Manager se construirá bajo los siguientes principios:

1. Monolito modular.
2. TypeScript end-to-end.
3. Una única fuente de verdad para la lógica de negocio: el backend.
4. Separación clara entre dominio, transporte HTTP y persistencia.
5. Los módulos deben tener límites explícitos.
6. Las operaciones de negocio no deben implementarse como simples CRUD cuando poseen consecuencias funcionales.
7. Las operaciones que afectan varias entidades deben ser atómicas.
8. El frontend nunca constituye una barrera de seguridad.
9. La privacidad clínica debe respetarse desde backend y desde diseño de interfaces.
10. El módulo de Inteligencia Artificial será opcional y desacoplado del funcionamiento principal.
11. Se prioriza simplicidad y mantenibilidad sobre abstracciones innecesarias.
12. No se implementará DDD académico ni patrones complejos sin un beneficio concreto.

---

# 3. Arquitectura de alto nivel

Athleta Manager estará compuesto inicialmente por cuatro componentes principales:

```text
                         ┌──────────────────────────┐
                         │       Navegador          │
                         │                          │
                         │  Aplicación interna      │
                         │  Portal Athleta          │
                         └────────────┬─────────────┘
                                      │
                                      │ HTTPS / REST
                                      ▼
                         ┌──────────────────────────┐
                         │        Next.js           │
                         │        apps/web          │
                         └────────────┬─────────────┘
                                      │
                                      │ REST
                                      ▼
                         ┌──────────────────────────┐
                         │         NestJS           │
                         │         apps/api         │
                         │                          │
                         │   Monolito modular       │
                         └───────┬──────────┬───────┘
                                 │          │
                                 │          │
                                 ▼          ▼
                         ┌─────────────┐  ┌───────────────┐
                         │ PostgreSQL  │  │ Object Storage│
                         │             │  │ S3 compatible │
                         └─────────────┘  └───────────────┘
```

Frontend y backend son dos aplicaciones desplegables independientemente.

El backend no servirá el build de Next.js.

---

# 4. Repositorio

El proyecto utilizará un monorepo.

Estructura inicial:

```text
athleta/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── api-client/
│   ├── contracts/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
│
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── domain/
│   ├── engineering/
│   └── adr/
│
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## apps/web

Aplicación Next.js.

Contendrá:

- aplicación interna;
- Portal Athleta;
- layouts;
- routing;
- componentes de aplicación;
- formularios;
- integración con API;
- manejo de estado cliente.

## apps/api

Backend NestJS.

Contendrá:

- autenticación;
- autorización;
- reglas de negocio;
- acceso a datos;
- generación de OpenAPI;
- manejo de archivos;
- auditoría necesaria;
- integración futura con IA.

## packages/api-client

Cliente TypeScript generado desde OpenAPI.

No debe editarse manualmente.

## packages/contracts

Contendrá contratos compartidos que tenga sentido compartir sin acoplar frontend y backend.

Ejemplos:

- enums;
- schemas Zod simples;
- tipos transversales;
- constantes compartidas.

No contendrá lógica de negocio.

## packages/ui

Componentes visuales reutilizables de Athleta.

## packages/eslint-config

Configuración común de lint.

## packages/typescript-config

Configuración común de TypeScript.

---

# 5. Aplicación web

Existirá una sola aplicación Next.js.

Dentro de ella coexistirán dos experiencias:

```text
Aplicación interna
Portal Athleta
```

No serán dos proyectos frontend diferentes.

Una posible estructura de routing es:

```text
app/
├── (internal)/
│   ├── login/
│   └── app/
│
└── (portal)/
    ├── portal/
    │   ├── login/
    │   └── ...
```

La estructura exacta podrá ajustarse durante la implementación.

La separación deberá mantenerse mediante:

- layouts diferentes;
- mecanismos de autenticación diferenciados;
- navegación independiente;
- autorización;
- componentes específicos cuando corresponda.

No debe asumirse que compartir aplicación implica compartir permisos o interfaz.

---

# 6. Backend como monolito modular

El backend será una única aplicación NestJS organizada en módulos funcionales.

Estructura conceptual inicial:

```text
src/
├── auth/
├── team/
├── people/
├── sala/
├── clinic/
├── finance/
├── portal/
├── catalogs/
├── files/
├── audit/
├── common/
└── infrastructure/
```

Esta división puede evolucionar cuando el modelo de dominio quede completamente cerrado.

---

# 7. Responsabilidad de los módulos

## Auth

Responsable de:

- autenticación interna;
- autenticación de Portal;
- sesiones;
- cambio de contraseña;
- restablecimientos;
- cambio y restablecimiento de PIN;
- invalidación de sesiones.

No debe contener reglas propias de Sala o Clínica.

---

## Team

Responsable de:

- usuarios internos;
- roles;
- estado de cuentas;
- asignación de roles;
- información del Equipo.

Las restricciones que involucren responsabilidades pertenecientes a otros módulos deben resolverse coordinándose con esos módulos.

---

## People

Responsable de:

- identidad única de Persona;
- datos generales;
- ciclo de vida de Persona;
- búsqueda de Personas;
- estado transversal cuando corresponda.

No debe implementar internamente la lógica de Sala o Clínica.

Cuando una operación transversal afecte otros módulos, debe coordinar sus servicios públicos.

---

## Sala

Responsable de:

- participación en Sala;
- Profesor principal;
- Plan asignado;
- grilla de horarios;
- excepciones;
- capacidad;
- Turnos fijos;
- reservas;
- asistencia;
- rutinas;
- evaluaciones físicas;
- pagos de Sala;
- indicaciones clínicas visibles desde Sala en su representación operativa.

---

## Clinic

Responsable de:

- vínculo clínico;
- Turnos clínicos;
- Atenciones;
- Evoluciones;
- Tratamientos;
- Evaluaciones clínicas;
- Estudios y archivos;
- Indicaciones clínicas;
- Obras sociales;
- Órdenes;
- Ingresos clínicos;
- Biblioteca Clínica en su parte administrativa.

La implementación técnica del módulo de IA no forma parte de esta primera etapa.

---

## Finance

Responsable de:

- vista unificada de Ingresos;
- Gastos;
- totales;
- dashboard financiero;
- cotizaciones USD;
- exportaciones financieras.

Los movimientos originales continúan perteneciendo a sus dominios correspondientes.

Por ejemplo:

```text
Pago de Sala → Sala
Ingreso clínico → Clinic
Gasto → Finance
```

Finance puede consumirlos para construir vistas agregadas, pero no debe duplicar la lógica funcional de esos movimientos.

---

## Portal

Responsable de la lógica específica de autoservicio disponible para una Persona autenticada.

No duplica el dominio de Sala o Clínica.

Ejemplo:

```text
Portal solicita reservar horario
        ↓
Sala valida disponibilidad
        ↓
Sala crea la reserva
```

Portal funciona como una fachada restringida sobre capacidades del sistema.

---

## Catalogs

Agrupa administración técnica de catálogos compartidos cuando no exista un módulo propietario más adecuado.

No todos los catálogos deben necesariamente pertenecer a un módulo global.

Ejemplo:

```text
Ejercicios → Sala
Tests físicos → Sala
Protocolos clínicos → Clinic
```

El objetivo es evitar un módulo `catalogs` convertido en contenedor genérico de cualquier dato.

---

## Files

Responsable de:

- metadata de archivos;
- validación técnica de tipos;
- interacción con Object Storage;
- generación de mecanismos seguros de acceso;
- eliminación física cuando una operación funcional autorizada lo indique.

No decide si funcionalmente un archivo puede eliminarse.

---

## Audit

Responsable de registrar eventos de auditoría explícitamente requeridos.

Athleta no tendrá un sistema de versionado universal de cada campo.

La auditoría debe ser selectiva.

---

# 8. Capas internas de cada módulo

Cuando un módulo tenga lógica relevante seguirá aproximadamente esta organización:

```text
module/
│
├── presentation/
│   └── controllers
│
├── application/
│   └── services / use-cases
│
├── domain/
│   ├── rules
│   ├── entities/value objects cuando aporten valor
│   └── errors
│
└── infrastructure/
    └── repositories
```

No es obligatorio crear todas las carpetas si el módulo o feature es trivial.

El objetivo es mantener las responsabilidades separadas, no generar boilerplate.

---

# 9. Flujo de una operación

Ejemplo conceptual:

```text
HTTP Request
     │
     ▼
Controller
     │
     ▼
Validation
     │
     ▼
Authorization
     │
     ▼
Application Service / Use Case
     │
     ├── Business rules
     │
     ├── Other module public services
     │
     └── Repository
     │
     ▼
Prisma
     │
     ▼
PostgreSQL
```

El Controller no debe implementar reglas de negocio.

---

# 10. Operaciones de negocio versus CRUD

Las operaciones relevantes deben expresarse mediante acciones explícitas.

Ejemplo incorrecto:

```text
PATCH /people/:id
{
  "active": false
}
```

si funcionalmente inactivar una Persona implica otras consecuencias.

Preferencia:

```text
POST /people/:id/inactivate
```

La implementación ejecuta la operación funcional completa.

Otros posibles ejemplos:

```text
POST /sala/participants/:id/remove

POST /clinic/appointments/:id/attend

POST /clinic/treatments/:id/finalize

POST /clinic/treatments/:id/reopen

POST /team/users/:id/inactivate
```

Las URLs definitivas se definirán durante el diseño de API.

El principio importante es que las acciones funcionales deben expresarse explícitamente.

---

# 11. Dependencias entre módulos

Un módulo no debe acceder directamente a la persistencia privada de otro módulo.

Ejemplo prohibido:

```text
PeopleService
   ↓
Prisma.salaReservation.deleteMany(...)
```

Preferencia:

```text
PeopleService
   ↓
SalaService.endParticipation(...)
```

La misma regla aplica aunque todos los módulos utilicen la misma base PostgreSQL.

El límite es arquitectónico, no físico.

---

# 12. Servicios públicos de módulos

Cada módulo podrá exponer un conjunto reducido de operaciones para ser utilizadas por otros módulos.

Ejemplo:

```text
SalaModule
  public:
    hasCurrentParticipation(personId)
    endParticipation(personId)
    getParticipationStatus(personId)

ClinicModule
  public:
    hasActiveTreatment(personId)
    hasFutureScheduledAppointment(personId)
    interruptActiveTreatments(personId)
    cancelFutureAppointments(personId)
```

Los nombres son ilustrativos.

No constituyen todavía contratos definitivos.

---

# 13. Prisma y repositories

Prisma será el mecanismo de acceso a PostgreSQL.

No se exige crear un repository artificial para cada tabla.

Se utilizarán repositories cuando permitan:

- encapsular consultas complejas;
- preservar límites de módulo;
- facilitar testing;
- representar operaciones del dominio;
- evitar dependencia excesiva del ORM.

Se evitará:

```text
controller → Prisma
```

y también:

```text
componentes arbitrarios → Prisma
```

El acceso a persistencia debe estar encapsulado dentro del backend.

---

# 14. Transacciones

Toda operación funcional que modifique múltiples registros y deba completarse como una única unidad utilizará una transacción de PostgreSQL mediante Prisma.

Ejemplos previsibles:

- inactivación global de Persona;
- baja de Sala;
- marcar Turno clínico como Atendido;
- corrección de Turno Atendido;
- inactivación de profesional;
- reasignación masiva;
- cambios permanentes de horarios que afectan reservas.

Principio:

```text
todo se completa
o
nada se completa
```

No deben quedar estados intermedios inconsistentes por un error parcial.

---

# 15. API

La comunicación principal será:

```text
REST
+
JSON
+
HTTPS
```

NestJS será responsable de publicar el contrato OpenAPI.

El frontend consumirá un cliente generado a partir de este contrato.

---

# 16. OpenAPI como contrato frontend/backend

El flujo será:

```text
NestJS API
     │
     ▼
OpenAPI
     │
     ▼
Orval
     │
     ▼
packages/api-client
     │
     ▼
Next.js
```

No se deben mantener manualmente dos interfaces distintas para representar el mismo payload.

El backend es la fuente de verdad del contrato HTTP.

---

# 17. Autenticación

Se utilizarán sesiones server-side.

No se utilizará JWT como mecanismo principal inicial.

Existirán dos contextos de autenticación.

## Sistema interno

```text
Email
+
Contraseña
```

## Portal

```text
DNI
+
PIN
```

Las sesiones estarán persistidas server-side.

El navegador recibirá únicamente una cookie de sesión.

Configuración mínima:

```text
HttpOnly
Secure
SameSite
```

La configuración concreta de `SameSite`, dominios y expiración se definirá según infraestructura final.

---

# 18. Invalidación de sesiones

La arquitectura deberá permitir invalidación inmediata.

Casos previsibles:

- usuario interno inactivado;
- cambio/restablecimiento de contraseña;
- restablecimiento de PIN;
- inactivación de Persona;
- incidente de seguridad.

No se dependerá únicamente del vencimiento temporal de un token.

---

# 19. Autorización

Se implementará RBAC explícito.

Modelo conceptual:

```text
User
  │
  ├── Role A
  ├── Role B
  │
  ▼
Permissions
```

Los roles combinados generan la unión de permisos.

Ejemplo:

```text
Profesor
+
Kinesiólogo

→ permisos de Profesor
+
permisos de Kinesiólogo
```

Los permisos se verifican en backend.

El frontend puede utilizarlos para decidir qué mostrar, pero nunca constituye la única barrera.

---

# 20. Reglas contextuales de autorización

RBAC no reemplaza las reglas de negocio.

Ejemplo:

Un usuario puede poseer permiso:

```text
TEAM_USER_INACTIVATE
```

pero la operación puede igualmente fallar porque el profesional tenga responsabilidades pendientes.

Por lo tanto:

```text
Permission
+
Business Preconditions
=
Operation allowed
```

---

# 21. Manejo de archivos

Los archivos no se almacenarán en PostgreSQL.

Arquitectura:

```text
PostgreSQL
    │
    └── metadata
         - id
         - storageKey
         - MIME
         - tamaño
         - nombre original

Object Storage
    │
    └── archivo físico
```

Se utilizará un proveedor compatible con S3.

El acceso a archivos sensibles deberá realizarse mediante mecanismos privados y temporales.

No deben existir URLs públicas permanentes para documentación clínica.

---

# 22. Manejo de errores

Todas las APIs utilizarán un formato uniforme.

Ejemplo:

```json
{
  "statusCode": 409,
  "code": "PROFESSOR_HAS_ASSIGNED_STUDENTS",
  "message": "El profesor todavía tiene alumnos asignados.",
  "details": {
    "count": 14
  }
}
```

## statusCode

Código HTTP correspondiente.

## code

Identificador estable y apto para ser interpretado programáticamente.

## message

Mensaje comprensible.

## details

Información adicional opcional.

El frontend no debe basar comportamiento en comparar el contenido textual de `message`.

---

# 23. Logging

Se utilizará logging estructurado.

Tecnología:

```text
Pino
+
nestjs-pino
```

Cada request deberá poder correlacionarse mediante un identificador.

Ejemplo conceptual:

```text
requestId
userId
route
method
statusCode
duration
```

No se deben registrar indiscriminadamente request bodies.

---

# 24. Información prohibida en logs

Entre otros:

- contraseñas;
- PIN;
- cookies de sesión;
- tokens;
- secretos;
- Evoluciones clínicas completas;
- antecedentes clínicos;
- contenido completo de Evaluaciones;
- contenido de Estudios;
- archivos;
- datos sensibles innecesarios.

La política concreta será definida también en `SECURITY.md`.

---

# 25. Fechas y timezone

Timezone operativo:

```text
America/Argentina/Buenos_Aires
```

Los timestamps se persistirán de manera consistente en UTC.

La UI mostrará las fechas y horarios usando el timezone operativo.

Los datos conceptualmente definidos como fecha no deben convertirse artificialmente en timestamps.

Ejemplos:

```text
Fecha de nacimiento → DATE

Mes/Año de Pago → representación específica de período

createdAt → timestamp
updatedAt → timestamp
fecha/hora de Turno → timestamp
```

---

# 26. Dinero

Los importes económicos no utilizarán tipos floating point como fuente de verdad.

Persistencia:

```text
PostgreSQL NUMERIC / DECIMAL
```

Prisma:

```text
Prisma.Decimal
```

ARS se manejará normalmente con dos decimales.

Las cotizaciones podrán requerir mayor precisión.

Las reglas exactas se documentarán en el diseño de base de datos.

---

# 27. Identificadores

Las entidades utilizarán UUID como identificador técnico.

Ejemplo:

```text
id: UUID
```

Los números de negocio, si aparecen posteriormente, serán campos separados.

Nunca debe utilizarse el incremento del ID técnico como significado funcional.

---

# 28. Eliminación y ciclo de vida

No existirá una estrategia universal de:

```text
deletedAt
```

para todas las tablas.

El ciclo de vida depende de la entidad.

Ejemplos:

```text
Usuario interno
→ Activo / Inactivo

Tratamiento
→ En curso / Finalizado

Persona creada por error sin historia
→ eliminación física permitida

Movimiento económico cargado por error
→ eliminación según permisos

Evolución clínica
→ no eliminación física habitual
```

La persistencia debe reflejar las reglas del negocio y no imponer un soft-delete genérico.

---

# 29. Migraciones

Todos los cambios de esquema utilizarán Prisma Migrate.

Las migraciones:

- forman parte del repositorio;
- se revisan;
- se ejecutan mediante el proceso de deployment correspondiente.

No se realizarán cambios manuales no versionados en producción.

---

# 30. Seeds

Los seeds se utilizarán únicamente cuando exista información inicial necesaria.

Deben ser:

- repetibles;
- predecibles;
- seguros para desarrollo.

No deben utilizarse como sustituto de migraciones.

---

# 31. Configuración

Las variables de entorno se centralizarán y validarán al iniciar la aplicación.

Se utilizará Zod para validar configuración.

Ejemplo conceptual:

```text
DATABASE_URL
SESSION_SECRET
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
```

La aplicación debe fallar inmediatamente al iniciar si falta una configuración requerida.

No se utilizará `process.env` disperso indiscriminadamente por el código.

---

# 32. Estado del frontend

La estrategia será:

## Estado remoto

```text
TanStack Query
```

## Estado de formularios

```text
React Hook Form
```

## Estado local de interfaz

```text
React state
```

No se introducirá Redux inicialmente.

Solo deberá agregarse un gestor global adicional si aparece una necesidad concreta que las herramientas existentes no resuelvan adecuadamente.

---

# 33. Listados

Los listados extensos utilizarán:

```text
TanStack Table
```

Las operaciones de:

- paginación;
- filtrado;
- búsqueda;
- ordenamiento;

serán preferentemente server-side cuando la cantidad de registros pueda crecer significativamente.

No se debe cargar la base completa para posteriormente filtrarla en el navegador.

---

# 34. Preservación del contexto

Cuando corresponda, los parámetros de búsqueda y navegación podrán representarse mediante URL.

Ejemplo:

```text
?page=3
&search=garcia
&status=active
&sort=name
```

Esto facilita:

- volver al mismo listado;
- mantener filtros;
- navegación;
- deep-linking;
- comportamiento consistente.

---

# 35. Inteligencia Artificial

El módulo IA no forma parte de la primera etapa técnica.

Regla arquitectónica fundamental:

```text
Core de Athleta
NO depende de IA.
```

Sala, Clínica, Finanzas, Personas, Agenda, Portal y demás funciones deben operar aunque el servicio de IA esté indisponible.

Arquitectura futura posible:

```text
Athleta API
    │
    ├── PostgreSQL
    │
    └── AI Service
```

La interfaz entre ambos se definirá cuando se diseñe el módulo de IA.

No se introducirán todavía:

- vector databases;
- embeddings;
- RAG;
- colas específicas de IA;
- proveedores de modelos;
- pipelines de procesamiento.

---

# 36. Colas y Redis

La primera versión no utilizará:

- Redis;
- BullMQ;
- RabbitMQ;
- Kafka;
- workers separados.

Actualmente no existe suficiente necesidad para justificar esa infraestructura.

Si aparece un procesamiento asíncrono real, se documentará mediante una nueva decisión arquitectónica.

---

# 37. Testing dentro de la arquitectura

Se utilizarán tres niveles principales.

```text
Unit tests
Integration tests
E2E tests
```

Las reglas de negocio complejas deben poder probarse sin depender exclusivamente de tests E2E.

Los escenarios funcionales críticos deberán convertirse progresivamente en pruebas automatizadas.

---

# 38. Deployables

Inicialmente existirán dos:

```text
apps/web
apps/api
```

Cada uno tendrá su propio:

- build;
- configuración;
- deployment;
- health check cuando corresponda.

La base PostgreSQL y Object Storage serán servicios externos.

---

# 39. Dependencias

Las dependencias importantes del proyecto deben ser decisiones deliberadas.

Codex no debe:

- sustituir una librería elegida por otra sin motivo;
- introducir un segundo ORM;
- introducir un segundo framework de validación;
- introducir un gestor de estado global innecesario;
- introducir una nueva biblioteca UI que duplique shadcn;
- agregar infraestructura no definida.

Si una dependencia nueva es realmente necesaria, debe justificarse.

---

# 40. Architecture Decision Records

Las decisiones arquitectónicas relevantes posteriores deberán documentarse en:

```text
docs/adr/
```

Ejemplo:

```text
001-modular-monolith.md
002-server-side-sessions.md
003-object-storage.md
```

Un ADR debe explicar:

- contexto;
- decisión;
- alternativas;
- consecuencias.

---

# 41. Regla frente a ambigüedades

Codex o cualquier desarrollador debe distinguir:

```text
Duda funcional
→ consultar documentación / Analista

Duda técnica
→ resolver siguiendo esta arquitectura
```

No se debe inventar comportamiento del cliente para desbloquear una implementación.

Si una feature necesita una decisión funcional todavía pendiente:

1. detener esa parte de la implementación;
2. documentar la duda;
3. continuar con aquellas partes que no dependan de ella.

---

# 42. Objetivo final de la arquitectura

La arquitectura busca conseguir simultáneamente:

- velocidad de desarrollo;
- código comprensible;
- protección de reglas funcionales;
- seguridad y privacidad;
- facilidad de testing;
- despliegues simples;
- capacidad de evolucionar.

Athleta debe poder crecer sin convertirse prematuramente en una arquitectura distribuida.

El monolito modular será la arquitectura base mientras siga resolviendo correctamente estas necesidades.
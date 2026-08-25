# INFRASTRUCTURE.md — Athleta Manager

## 1. Propósito

Este documento define la infraestructura inicial de Athleta Manager.

El objetivo es disponer de una plataforma:

- simple;
- administrable;
- segura;
- económica para la primera etapa;
- fácilmente desplegable;
- compatible con crecimiento futuro;
- sin introducir infraestructura distribuida innecesaria.

La infraestructura podrá evolucionar posteriormente mediante Architecture Decision Records cuando exista una necesidad concreta.

---

# 2. Resumen

La infraestructura inicial será:

```text
Frontend
└── Vercel

Backend
└── Railway

Database
└── PostgreSQL administrado en Railway

File Storage
└── AWS S3

DNS
└── brocosolutions.com

Monitoring
└── Sentry + provider logs

CI/CD
└── GitHub Actions + Vercel

Infrastructure as Code
└── No inicialmente
```

---

# 3. Ambientes

Existirán tres ambientes principales:

```text
Local
Staging
Production
```

Cada uno deberá ser claramente identificable.

No se reutilizarán credenciales de producción en desarrollo.

---

# 4. Local

El ambiente local permitirá desarrollar:

```text
apps/web
apps/api
PostgreSQL
```

sin depender innecesariamente de servicios productivos.

Podrá utilizar:

```text
PostgreSQL local
Docker
```

según se defina en el setup de desarrollo.

Para Object Storage podrá utilizarse:

- bucket específico de desarrollo;
- alternativa S3-compatible local;

según resulte más conveniente.

Nunca se utilizará el bucket productivo durante desarrollo normal.

---

# 5. Staging

Staging será un ambiente funcional real separado de producción.

Tendrá:

```text
Web independiente
API independiente
Database independiente
Object Storage independiente
Secrets independientes
```

No deberá conectarse a la DB de producción.

---

# 6. Producción

Producción utilizará servicios separados de staging y configuración propia.

Los accesos administrativos a estos servicios deberán limitarse a las personas que realmente necesiten operar infraestructura.

---

# 7. Arquitectura

```text
                   Internet
                       │
               ┌───────┴────────┐
               │                │
               ▼                ▼
     athleta.brocosolutions.com
               │
               ▼
            Vercel
            Next.js
               │
               │ HTTPS
               ▼
 api.athleta.brocosolutions.com
               │
               ▼
            Railway
            NestJS API
               │
         ┌─────┴──────┐
         │            │
         ▼            ▼
   PostgreSQL       AWS S3
    Railway         privado
```

---

# 8. Dominio principal

La aplicación utilizará:

```text
athleta.brocosolutions.com
```

como hostname principal.

El nombre DNS es técnicamente case-insensitive y se utilizará en minúsculas de forma consistente.

---

# 9. API

El backend utilizará:

```text
api.athleta.brocosolutions.com
```

La API no deberá exponerse mediante URLs temporales de Railway como URL oficial consumida por producción.

La URL proporcionada por Railway podrá existir internamente para diagnóstico, pero el frontend productivo utilizará el dominio estable.

---

# 10. Portal

El Portal forma parte de la misma aplicación Next.js.

Inicialmente:

```text
https://athleta.brocosolutions.com/portal
```

No se creará un deploy frontend separado.

Si posteriormente existe una razón comercial u operativa, podrá mapearse un hostname adicional al mismo frontend.

---

# 11. Frontend hosting

Se utilizará:

```text
Vercel
```

para `apps/web`.

Motivos:

- integración natural con Next.js;
- deployments simples;
- previews;
- CDN;
- HTTPS;
- integración GitHub;
- rollback sencillo.

---

# 12. Deployments frontend

Se utilizarán deployments diferenciados para:

```text
Preview
Staging
Production
```

Los Pull Requests podrán generar preview deployments cuando resulte útil.

Un preview no deberá conectarse automáticamente a infraestructura productiva.

---

# 13. Backend hosting

Se utilizará:

```text
Railway
```

para `apps/api`.

NestJS correrá como servicio independiente.

No se combinarán frontend y backend en un único proceso.

---

# 14. Región backend

Se priorizará una región cercana a los usuarios de Argentina.

Preferencia:

```text
Sudamérica
São Paulo
```

cuando Railway disponga de una opción adecuada.

La API y PostgreSQL deberán ubicarse en la misma región siempre que sea posible.

Si el proveedor no ofrece exactamente São Paulo, deberá seleccionarse la alternativa con menor latencia razonable y documentar la decisión.

---

# 15. PostgreSQL

Se utilizará inicialmente:

```text
Railway PostgreSQL
```

como servicio administrado.

La aplicación utilizará PostgreSQL estándar para evitar dependencia fuerte de funcionalidades propietarias del proveedor.

---

# 16. Conectividad API → DB

La API deberá utilizar, cuando Railway lo permita, conectividad privada/interna hacia PostgreSQL.

No se expondrá PostgreSQL públicamente salvo que exista una necesidad operativa concreta.

Las herramientas administrativas deberán utilizar mecanismos de acceso controlados.

---

# 17. Pool de conexiones

La configuración de conexiones deberá adecuarse a:

- cantidad de instancias de API;
- límites del PostgreSQL contratado;
- comportamiento de Prisma.

No deberán configurarse pools arbitrariamente grandes.

Esta configuración será revisada antes de escalar horizontalmente la API.

---

# 18. Object Storage

Se utilizará:

```text
AWS S3
```

para archivos.

Los buckets serán privados.

No se utilizará el filesystem efímero de Railway para almacenar documentación permanente.

---

# 19. Región de S3

Preferencia inicial:

```text
sa-east-1
São Paulo
```

para reducir distancia respecto de Athleta y mantener los datos dentro de una región sudamericana cuando resulte conveniente.

La región definitiva deberá mantenerse consistente con los criterios de costo, latencia y disponibilidad.

---

# 20. Buckets

Se utilizarán recursos diferenciados por ambiente.

Ejemplo:

```text
athleta-staging-private
athleta-production-private
```

Los nombres definitivos podrán incorporar prefijos propios de Broco.

Staging y producción nunca deben compartir el mismo namespace de archivos.

---

# 21. Seguridad S3

Los buckets tendrán:

```text
Block Public Access
```

habilitado.

No existirán objetos públicos permanentes.

El acceso de usuarios finales se realizará mediante URLs firmadas temporales emitidas después de una validación de autorización.

---

# 22. Lifecycle de archivos

No se aplicarán políticas automáticas que eliminen documentación clínica únicamente por antigüedad.

Cualquier eliminación deberá responder a una operación funcional explícita.

Las políticas de lifecycle podrán utilizarse para:

- versiones antiguas;
- uploads temporales;
- objetos incompletos;

siempre que no eliminen información funcional válida.

---

# 23. Protección de archivos

Se habilitarán mecanismos de protección/versionado de S3 cuando resulte adecuado.

La estrategia deberá evitar que una eliminación accidental de un objeto provoque pérdida inmediata e irreversible.

---

# 24. Backups de PostgreSQL

Producción deberá contar con:

```text
backup automático diario
```

y una retención objetivo mínima de:

```text
30 días
```

si las capacidades del plan contratado lo permiten.

Si Railway no ofrece la retención requerida de forma nativa, deberá complementarse con una estrategia adicional.

---

# 25. Restore

Tener backups no se considera suficiente.

Debe existir un procedimiento documentado para:

```text
crear base temporal
restaurar backup
validar consistencia
reconfigurar servicios si fuera necesario
```

Se deberán realizar pruebas de restore periódicamente.

---

# 26. Backup de archivos

AWS S3 deberá utilizar mecanismos que permitan recuperación ante:

- eliminación accidental;
- sobrescritura accidental;
- error operativo.

La política exacta podrá combinar:

```text
versioning
retention
replicación/backup si posteriormente se justifica
```

---

# 27. Recovery

La primera versión no requiere infraestructura multi-región activa-activa.

La estrategia será:

```text
backups confiables
+
infraestructura recreable
+
procedimientos documentados
```

El objetivo inicial es recuperación razonable, no zero-downtime disaster recovery.

---

# 28. DNS

Los DNS estarán bajo:

```text
brocosolutions.com
```

Inicialmente:

```text
athleta.brocosolutions.com
api.athleta.brocosolutions.com
```

Staging podrá utilizar:

```text
staging-athleta.brocosolutions.com
api-staging-athleta.brocosolutions.com
```

o una convención equivalente definida antes del primer deployment.

La convención deberá mantenerse consistente.

---

# 29. HTTPS

Todo dominio público deberá utilizar certificado TLS válido.

Vercel y Railway administrarán certificados cuando corresponda.

No deberá aceptarse tráfico HTTP como mecanismo productivo normal.

---

# 30. CORS productivo

El backend permitirá explícitamente:

```text
https://athleta.brocosolutions.com
```

y cualquier otro origen oficial que posteriormente sea aprobado.

Las URLs de preview no tendrán acceso automático irrestricto a producción.

---

# 31. Git

El código estará alojado en GitHub.

La rama principal será:

```text
main
```

La estrategia detallada de branching podrá definirse dentro de la documentación de ingeniería.

---

# 32. CI

Se utilizará:

```text
GitHub Actions
```

para validación.

Pipeline mínimo:

```text
pnpm install
↓
lint
↓
typecheck
↓
unit/integration tests
↓
build
```

Los errores en cualquiera de estas etapas deberán impedir considerar la revisión como válida.

---

# 33. Frontend CI/CD

Vercel podrá integrarse directamente con GitHub.

Pull Request:

```text
preview deployment
```

Merge/deploy correspondiente:

```text
staging o production
```

según la estrategia definida.

---

# 34. Backend CI/CD

El backend será desplegado en Railway.

El flujo deberá controlar:

```text
validación
migraciones
deployment
health check
```

No se debe depender únicamente de hacer push y esperar que una migración incompatible se resuelva automáticamente.

---

# 35. Migraciones

Se utilizará:

```text
prisma migrate deploy
```

como paso explícito de CI/CD.

No se ejecutará Prisma Migrate automáticamente durante cada startup del proceso NestJS.

---

# 36. Orden de deployment

Conceptualmente:

```text
CI aprobado
      ↓
migraciones compatibles
      ↓
deploy API
      ↓
health check
      ↓
deploy/promoción frontend
```

El procedimiento deberá considerar backward compatibility cuando un cambio afecte simultáneamente frontend, API y schema.

---

# 37. Migraciones destructivas

Cambios destructivos relevantes deberán realizarse en múltiples pasos cuando sea necesario.

Ejemplo:

```text
1. agregar nueva columna
2. desplegar aplicación compatible
3. migrar datos
4. dejar de utilizar columna antigua
5. eliminar columna en release posterior
```

No se deben combinar cambios incompatibles innecesariamente en un único deployment.

---

# 38. Health endpoint

NestJS expondrá un endpoint técnico de salud.

Ejemplo:

```text
GET /health
```

Debe permitir verificar al menos que la aplicación está ejecutándose.

Cuando aporte valor podrá verificar conectividad crítica como PostgreSQL sin exponer información sensible.

---

# 39. Readiness

Si el proveedor/infrastructure lo aprovecha, podrá distinguirse:

```text
liveness
readiness
```

No es obligatorio introducir una plataforma compleja para ello.

---

# 40. Logging

Railway recibirá los logs estructurados emitidos por Pino.

No se dependerá de logs del filesystem local.

Los logs deberán ser accesibles para diagnóstico técnico.

---

# 41. Error monitoring

Se utilizará:

```text
Sentry
```

para:

```text
Next.js
NestJS
```

Sentry complementará a los logs.

No reemplazará PostgreSQL, auditoría ni logging estructurado.

---

# 42. Privacidad en Sentry

Se implementará sanitización antes de habilitar Sentry en producción.

No se enviarán indiscriminadamente:

- request bodies;
- cookies;
- PIN;
- credenciales;
- Historia Clínica;
- Evoluciones;
- archivos.

---

# 43. Métricas iniciales

No se desplegará inicialmente:

```text
Prometheus
Grafana
ELK
OpenTelemetry stack completo
```

La observabilidad inicial se basará en:

```text
Vercel metrics/logs
Railway metrics/logs
Pino
Sentry
health checks
```

---

# 44. Escalabilidad backend

Inicialmente se podrá ejecutar:

```text
1 instancia API
```

si la carga lo permite.

El backend debe quedar preparado para múltiples instancias.

Por ese motivo:

```text
sesiones → PostgreSQL
archivos → S3
datos → PostgreSQL
```

y no memoria local.

---

# 45. Filesystem efímero

La aplicación no debe depender del filesystem local para persistencia.

Se permite utilizar almacenamiento temporal durante:

- procesamiento puntual;
- generación de archivos;
- upload streaming;

siempre que el resultado permanente termine en almacenamiento correspondiente.

---

# 46. Sticky sessions

No deberían ser necesarias.

Las sesiones se almacenan en PostgreSQL.

Cualquier instancia de NestJS deberá poder procesar una request autenticada.

---

# 47. Redis

No forma parte de la infraestructura inicial.

No se desplegará Redis solamente por anticipar problemas que todavía no existen.

Podrá agregarse posteriormente para:

- cache;
- sesiones a gran escala;
- rate limiting distribuido;
- queues;

si las métricas lo justifican.

---

# 48. Colas

No existirán inicialmente:

```text
BullMQ
RabbitMQ
Kafka
NATS
```

Los procesos actuales se ejecutarán dentro del monolito.

El futuro módulo IA podrá cambiar esta decisión.

---

# 49. Secrets de producción

Serán administrados desde:

```text
Vercel Environment Variables
Railway Variables/Secrets
AWS credentials/roles
GitHub Actions Secrets cuando sean necesarios
```

GitHub no deberá ser utilizado como almacén universal de secrets si el proveedor puede gestionar el secreto directamente.

---

# 50. Credenciales AWS

La API deberá recibir únicamente las capacidades S3 que necesite.

Se aplicará:

```text
least privilege
```

No se utilizará una clave AWS con permisos administrativos generales.

---

# 51. Ambientes AWS

Los recursos de staging y producción deberán estar diferenciados mediante:

- buckets distintos;
- credenciales/roles adecuados;
- prefijos y tags claros.

---

# 52. Costos

La infraestructura inicial busca mantener costos proporcionales al tamaño real de Athleta.

Se prioriza:

```text
managed services
+
pocas piezas
+
bajo mantenimiento operativo
```

antes que infraestructura compleja autogestionada.

---

# 53. Infraestructura como código

No se utilizará Terraform inicialmente.

Razón:

la infraestructura inicial está compuesta por un conjunto pequeño de servicios gestionados:

```text
Vercel
Railway
AWS S3
DNS
Sentry
```

El costo de introducir Terraform actualmente supera el beneficio.

---

# 54. Documentación de infraestructura

La ausencia de Terraform no significa configuración no documentada.

Deberá registrarse:

```text
servicio
ambiente
región
dominio
variables necesarias
dependencias
procedimiento de deployment
backup
restore
```

Sin incluir secrets reales.

---

# 55. Cambio futuro a IaC

Se reconsiderará Infrastructure as Code si aparece alguno de los siguientes escenarios:

```text
migración significativa a AWS
más servicios cloud
múltiples redes
varios ambientes complejos
infraestructura difícil de reproducir manualmente
requerimientos formales de disaster recovery
```

En ese momento Terraform será una opción preferente.

---

# 56. Región y residencia

Se priorizará infraestructura en Sudamérica cuando los servicios elegidos lo permitan razonablemente.

No se garantiza que todos los servicios de terceros mantengan absolutamente todo su procesamiento en Sudamérica.

Cualquier requerimiento contractual posterior de residencia de datos deberá analizarse antes de producción.

---

# 57. Dependencia de Railway

La aplicación deberá mantenerse portable.

Se evitarán dependencias innecesarias de APIs propietarias de Railway.

Backend:

```text
NestJS standard
```

Database:

```text
PostgreSQL standard
```

Files:

```text
AWS S3
```

Esto facilita una migración futura hacia AWS, GCP u otro proveedor.

---

# 58. Dependencia de Vercel

Next.js podrá aprovechar las capacidades estándar de Vercel, pero las reglas principales del dominio continuarán residiendo en NestJS.

Esto evita que el backend funcional quede repartido entre:

```text
NestJS
Server Actions
Edge Functions
```

sin una razón concreta.

---

# 59. Módulo IA

No se aprovisionará infraestructura específica de IA durante esta etapa.

No se crearán todavía:

- vector databases;
- workers;
- GPUs;
- queues;
- buckets específicos de conocimiento;
- servicios de embeddings;
- proveedores LLM.

Se realizará un diseño independiente cuando comience ese módulo.

---

# 60. Infraestructura objetivo inicial

```text
Users
  │
  ▼
athleta.brocosolutions.com
  │
  ▼
Vercel / Next.js
  │
  │ HTTPS REST
  ▼
api.athleta.brocosolutions.com
  │
  ▼
Railway / NestJS
  │
  ├───────────────┐
  │               │
  ▼               ▼
Railway         AWS S3
PostgreSQL      sa-east-1
  │
  ▼
Automated
Backups
```

Observabilidad:

```text
Next.js ─────┐
             ├── Sentry
NestJS ──────┘

NestJS
  └── Pino → Railway logs
```

CI/CD:

```text
GitHub
   │
   ▼
GitHub Actions
   │
   ├── validate
   ├── test
   ├── build
   └── migrate/deploy
```

---

# 61. Principio final

La infraestructura de Athleta debe evolucionar siguiendo necesidades reales.

No se incorporarán componentes distribuidos, caches, brokers, Kubernetes o herramientas avanzadas de observabilidad por anticipación.

La prioridad inicial será:

```text
seguridad
+
simplicidad
+
recuperabilidad
+
mantenibilidad
+
costos razonables
```

manteniendo una ruta clara de crecimiento futuro.
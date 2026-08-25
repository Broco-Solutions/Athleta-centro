# SECURITY.md — Athleta Manager

## 1. Propósito

Este documento define los criterios técnicos de seguridad de Athleta Manager.

Complementa las reglas funcionales de privacidad, permisos y trazabilidad definidas para el producto, pero no las reemplaza.

Los objetivos principales son:

- proteger credenciales y sesiones;
- limitar acceso a información según rol y contexto;
- reducir exposición de información clínica;
- proteger archivos privados;
- evitar escaladas de privilegios;
- mantener trazabilidad sobre eventos sensibles;
- minimizar filtraciones de información a través de logs y herramientas de observabilidad.

La seguridad debe implementarse principalmente en backend.

Ocultar elementos de interfaz nunca constituye una barrera de seguridad suficiente.

---

# 2. Principios generales

Athleta Manager seguirá los siguientes principios:

1. Deny by default.
2. Least privilege.
3. Backend como autoridad de permisos.
4. Las credenciales nunca son recuperables.
5. Las sesiones pueden invalidarse inmediatamente.
6. La información clínica se expone únicamente cuando es necesaria.
7. Los archivos clínicos son privados.
8. Los logs no deben convertirse en una copia indirecta de la Historia Clínica.
9. Las operaciones sensibles deben dejar trazabilidad.
10. No se implementará criptografía propia cuando existan mecanismos estándar.
11. Seguridad y reglas de negocio son conceptos complementarios.
12. El sistema debe fallar de forma segura.

---

# 3. Contextos de autenticación

Existirán dos contextos independientes.

## 3.1 Aplicación interna

Credenciales:

```text
Email
+
Contraseña
```

Aplica a:

- Profesor;
- Kinesiólogo;
- Osteópata;
- Administrativo;
- Administrador general;
- Soporte Broco.

## 3.2 Portal Athleta

Credenciales:

```text
DNI
+
PIN numérico de 4 dígitos
```

La existencia de un PIN válido no implica automáticamente que la Persona pueda ingresar.

También deben cumplirse las reglas funcionales de acceso al Portal.

---

# 4. Almacenamiento de contraseñas

Las contraseñas nunca se almacenarán:

- en texto plano;
- cifradas de manera reversible;
- en logs;
- en eventos de auditoría;
- en analytics;
- en respuestas posteriores a su creación.

Se utilizará:

```text
Argon2id
```

para generar hashes de contraseñas.

Los parámetros concretos de Argon2id deberán calibrarse según la infraestructura utilizada y quedar centralizados en la configuración de autenticación.

No deben existir implementaciones diferentes de hashing en distintos módulos.

---

# 5. Política de contraseña interna

Se utilizará una política tradicional de complejidad.

Una contraseña deberá contener como mínimo:

```text
10 caracteres
1 letra mayúscula
1 letra minúscula
1 número
1 carácter especial
```

No se utilizará expiración periódica obligatoria por tiempo.

Una contraseña válida continuará vigente hasta que:

- el usuario la cambie;
- un usuario autorizado la restablezca;
- una operación administrativa obligue a reemplazarla;
- exista una intervención de seguridad.

Las contraseñas temporales generadas automáticamente deberán utilizar un generador criptográficamente seguro.

---

# 6. Contraseña temporal

Cuando se crea o restablece una cuenta interna:

1. el backend genera una contraseña temporal segura;
2. se almacena únicamente su hash;
3. la contraseña en claro se devuelve una sola vez en la operación correspondiente;
4. posteriormente no puede recuperarse;
5. el usuario deberá cambiarla al siguiente acceso.

La base de datos deberá poder distinguir una credencial temporal que exige cambio de contraseña.

---

# 7. PIN del Portal

El PIN será:

```text
numérico
4 dígitos
```

Se almacenará únicamente mediante Argon2id.

Nunca se almacenará el valor recuperable.

El PIN temporal generado durante:

- alta;
- restablecimiento;

se mostrará una sola vez.

---

# 8. Riesgo específico del PIN

Un PIN de cuatro dígitos posee únicamente 10.000 combinaciones posibles.

Por lo tanto:

```text
hash seguro
```

no es suficiente protección por sí solo.

El endpoint de autenticación del Portal deberá estar especialmente protegido contra fuerza bruta.

---

# 9. Protección contra fuerza bruta

Se implementará rate limiting y control progresivo de intentos.

Se evaluarán conjuntamente señales como:

```text
IP
+
identificador de cuenta
+
ventana temporal
```

No debe ser posible realizar intentos ilimitados sobre un mismo DNI cambiando únicamente la IP.

Tampoco debe permitirse que una única IP pruebe PINs contra grandes cantidades de DNI sin restricciones.

Ante fallos consecutivos se aplicarán esperas temporales crecientes.

No se utilizará un bloqueo permanente automático de la Persona.

---

# 10. Mensajes de autenticación del Portal

Los errores no revelarán:

- si el DNI existe;
- si el PIN es incorrecto;
- si la Persona está Inactiva;
- si las credenciales fueron restablecidas.

Ejemplo:

```text
No pudimos iniciar sesión con los datos ingresados.
```

El mensaje podrá incluir el canal de contacto configurado por Athleta.

---

# 11. Rate limiting general

Existirá rate limiting a nivel API.

Las restricciones más fuertes se aplicarán sobre:

```text
login interno
login Portal
restablecimiento de credenciales
cambio de credenciales
acciones anónimas sensibles
```

Los endpoints autenticados de uso normal tendrán límites suficientemente amplios para no interferir con la operación diaria.

Los valores exactos se configurarán por ambiente.

---

# 12. Sesiones

La autenticación utilizará:

```text
server-side sessions
```

La sesión se almacena en PostgreSQL.

El navegador recibe únicamente un identificador de sesión mediante cookie.

No se utiliza JWT como mecanismo principal.

---

# 13. Cookies

Las cookies de sesión deberán utilizar como mínimo:

```text
HttpOnly
Secure
SameSite
```

`HttpOnly` evita acceso mediante JavaScript del navegador.

`Secure` exige HTTPS.

La configuración exacta de `SameSite` dependerá de la topología definitiva entre frontend y API.

No se almacenarán credenciales ni tokens sensibles en:

```text
localStorage
sessionStorage
```

---

# 14. Duración de sesiones

Las sesiones tendrán:

- expiración máxima;
- renovación asociada a actividad válida;
- invalidación inmediata cuando corresponda.

Los tiempos exactos deberán ser configurables.

No se fijan todavía como regla estructural valores definitivos de horas o días.

---

# 15. Invalidación de sesiones internas

Se invalidarán las sesiones existentes cuando:

- una cuenta sea inactivada;
- se restablezca su contraseña;
- una operación de seguridad lo requiera.

Ante un cambio voluntario de contraseña se invalidarán las demás sesiones activas del usuario.

Podrá mantenerse la sesión desde la cual se ejecutó el cambio si la implementación garantiza que ya utiliza la credencial nueva.

---

# 16. Invalidación de sesiones del Portal

Las sesiones del Portal deberán invalidarse ante:

- inactivación global de Persona;
- restablecimiento del PIN;
- incidente de seguridad;
- otra acción funcional que elimine el derecho de acceso.

Una eventual reactivación de la Persona no reactiva sesiones antiguas.

---

# 17. CSRF

Dado que la autenticación utiliza cookies, el backend implementará protección CSRF para operaciones que modifican estado.

Se combinarán:

```text
SameSite
+
validación de Origin/Referer cuando corresponda
+
token CSRF
```

según la operación y topología final.

Las requests `GET` no deben producir modificaciones de estado.

---

# 18. CORS

Producción utilizará una allowlist explícita.

Inicialmente:

```text
https://athleta.brocosolutions.com
```

será el origen web principal permitido.

No se utilizará en producción:

```text
Access-Control-Allow-Origin: *
```

con endpoints autenticados.

Local y staging tendrán orígenes independientes declarados mediante configuración.

---

# 19. Autorización

La autorización utilizará RBAC.

Modelo:

```text
Internal User
    │
    ├── Roles
    │
    ▼
Permissions
```

Los roles combinados producen la unión de permisos.

La autorización se verifica en NestJS mediante guards/policies.

---

# 20. Frontend y permisos

El frontend utilizará permisos para:

- construir navegación;
- mostrar acciones;
- ocultar información innecesaria;
- mejorar experiencia.

Sin embargo:

```text
Frontend permission check
≠
Security boundary
```

Toda operación deberá volver a verificarse en backend.

---

# 21. Reglas contextuales

Poseer un permiso no garantiza que una operación sea válida.

Ejemplo:

```text
permission: TEAM_USER_INACTIVATE
```

puede existir, pero un Profesor con alumnos asignados no podrá ser inactivado hasta resolver sus responsabilidades.

La seguridad final de una operación resulta de:

```text
autenticación
+
autorización
+
precondiciones de negocio
```

---

# 22. Protección contra escalada de privilegios

El backend deberá impedir explícitamente operaciones que produzcan escalada de privilegios.

Particularmente:

- Administrativo no puede otorgar rol Administrador general;
- Administrativo no puede administrar cuentas que posean ese rol;
- cuentas de Soporte Broco no pueden ser administradas por usuarios normales de Athleta;
- un usuario no puede modificar directamente sus propios roles;
- el frontend no puede forzar permisos enviando roles o flags no autorizados.

---

# 23. Soporte Broco

Las cuentas Soporte Broco tendrán tratamiento especial.

Sus acciones sensibles deberán quedar claramente identificadas.

El uso del rol debe limitarse a soporte real.

No debe utilizarse como cuenta operativa normal.

Las credenciales son administradas exclusivamente por Broco Solutions.

---

# 24. Privacidad clínica

Se seguirá un enfoque de:

```text
minimum necessary information
```

Un usuario que necesita operar agenda clínica no recibe automáticamente:

- Evoluciones;
- antecedentes;
- Evaluaciones;
- estudios;
- análisis clínicos;
- contenido terapéutico.

La respuesta del backend deberá estar diseñada de manera que los endpoints administrativos no filtren accidentalmente información clínica innecesaria.

---

# 25. DTOs y exposición de información

No se devolverán modelos completos de base de datos por comodidad.

Cada endpoint deberá devolver únicamente la información necesaria para el contexto.

Ejemplo:

```text
Agenda clínica
```

puede devolver:

```text
Paciente
hora
profesional
estado
```

sin devolver Historia Clínica.

---

# 26. Mass assignment

Los DTO/schemas de entrada deberán declarar explícitamente los campos aceptados.

Nunca debe hacerse algo equivalente a:

```text
update({
  ...request.body
})
```

contra una entidad de Prisma sin filtrar propiedades.

Especialmente en:

- roles;
- estado;
- credenciales;
- campos de auditoría;
- ownership;
- permisos.

---

# 27. Archivos

Los archivos clínicos utilizarán Object Storage privado.

Proveedor inicial:

```text
AWS S3
```

Los buckets que contengan información privada:

```text
NO serán públicos
```

No existirán ACL públicas permanentes.

---

# 28. Acceso a archivos

El flujo será:

```text
Usuario
   ↓
Athleta API
   ↓
Authorization check
   ↓
Signed URL temporal
   ↓
AWS S3
```

La API deberá verificar que el usuario pueda acceder funcionalmente al archivo antes de emitir la URL firmada.

---

# 29. Signed URLs

Las URLs firmadas:

- serán temporales;
- tendrán expiración corta;
- serán válidas únicamente para el objeto solicitado;
- no serán almacenadas en DB como URL permanente.

PostgreSQL almacenará únicamente el `storageKey` y metadata necesaria.

---

# 30. Uploads

El backend deberá validar:

```text
extensión
MIME declarado
firma/magic bytes reales
tamaño
```

No debe confiarse únicamente en el nombre del archivo proporcionado por el navegador.

---

# 31. Tipos permitidos

El alcance funcional contempla principalmente:

```text
PDF
imágenes
```

Los MIME exactos permitidos deberán mantenerse en una allowlist centralizada.

Ejemplo inicial de imágenes:

```text
image/jpeg
image/png
image/webp
```

La necesidad de formatos adicionales deberá ser deliberada.

---

# 32. Tamaños máximos

Se definirán límites técnicos de upload.

Los valores serán configurables.

No se permitirán archivos de tamaño ilimitado.

Cuando aparezca una necesidad real que exceda el límite, deberá evaluarse explícitamente.

---

# 33. Antivirus

No se implementará antivirus/antimalware dentro de la primera versión.

Files deberá diseñarse de forma que posteriormente pueda incorporarse un pipeline de análisis si el riesgo real lo justifica.

Esta decisión no elimina:

- validación de firma;
- allowlist MIME;
- limitación de tamaño;
- aislamiento del bucket;
- autorización de acceso.

---

# 34. TLS

Todo tráfico de producción será HTTPS.

Aplica a:

```text
Browser → Next.js
Browser → API
Next.js → API
API → servicios externos
```

No se permitirá operación productiva mediante HTTP plano.

---

# 35. Cifrado at-rest

Se utilizarán las capacidades de cifrado at-rest proporcionadas por:

- PostgreSQL administrado;
- AWS S3;
- proveedor de infraestructura.

No se implementará inicialmente cifrado custom por columna para toda la información clínica.

Si posteriormente existe un requerimiento regulatorio específico, se evaluará por separado.

---

# 36. Secrets

Nunca se versionarán:

- DATABASE_URL;
- claves AWS;
- SESSION_SECRET;
- contraseñas;
- tokens;
- credenciales de producción.

Se utilizarán secrets/environment variables del proveedor.

Los archivos `.env` reales deberán estar ignorados por Git.

---

# 37. Configuración validada

La configuración se validará con Zod al iniciar.

Si falta un secreto requerido:

```text
application startup fails
```

No se continuará ejecutando con configuración parcial o insegura.

---

# 38. Logging

Se utilizará:

```text
Pino
+
nestjs-pino
```

con logs estructurados JSON.

Se prioriza registrar metadata operativa en lugar de contenido.

---

# 39. Información permitida en logs

Ejemplos:

```text
requestId
userId técnico
personId técnico cuando sea necesario
route
HTTP method
statusCode
duration
operation code
error code
```

Los IDs técnicos son preferibles a nombres, DNI u otros datos identificatorios cuando sea posible.

---

# 40. Información prohibida en logs

Nunca se debe registrar deliberadamente:

- contraseña;
- hash de contraseña;
- PIN;
- hash de PIN;
- cookie de sesión;
- session ID completo cuando implique riesgo;
- secrets;
- Authorization headers;
- antecedentes clínicos completos;
- Evoluciones completas;
- contenido completo de Evaluaciones;
- archivos;
- texto de estudios;
- payloads clínicos indiscriminados.

---

# 41. Request logging

No se habilitará logging automático indiscriminado de:

```text
request.body
response.body
```

en producción.

Los endpoints sensibles deberán utilizar redaction explícita.

---

# 42. Correlation ID

Cada request tendrá un:

```text
requestId
```

que permita reconstruir un problema técnico a través de logs sin depender del contenido clínico de la request.

---

# 43. Sentry

Se utilizará Sentry en:

```text
Next.js
NestJS
```

Sentry deberá configurarse con sanitización estricta.

No se enviarán automáticamente request bodies clínicos.

Se eliminarán:

- cookies;
- secrets;
- credenciales;
- headers sensibles;
- contenido clínico innecesario.

---

# 44. Stack traces

Los stack traces estarán disponibles:

```text
logs internos
Sentry
```

pero nunca se devolverán al usuario final en producción.

La API devolverá errores controlados.

---

# 45. Auditoría de seguridad

Se registrarán eventos sensibles específicos.

Entre ellos:

```text
login exitoso relevante
intentos de login fallidos relevantes
reset de contraseña
cambio de contraseña
reset de PIN
cambio de PIN
cambio de roles
activación de usuario
inactivación de usuario
inactivación global de Persona
acciones sensibles de Soporte Broco
```

No implica construir una auditoría universal de cada modificación.

---

# 46. Contenido de evento de auditoría

Conceptualmente:

```text
id
eventType
actorId
targetType
targetId
timestamp
metadata no sensible
requestId
```

No se almacenarán credenciales dentro del metadata.

---

# 47. Eventos de login fallido

El registro debe ser suficiente para detectar patrones de abuso sin convertir la auditoría en un almacenamiento innecesario de información privada.

Se evitará guardar PINs o contraseñas ingresados.

---

# 48. Dependencies

Las dependencias deberán mantenerse actualizadas deliberadamente.

Los upgrades relacionados con seguridad tendrán prioridad.

No se permitirá agregar paquetes de autenticación, criptografía o seguridad alternativos sin justificar por qué la solución existente no alcanza.

---

# 49. Vulnerabilidades

CI podrá incorporar análisis de vulnerabilidades de dependencias.

Una vulnerabilidad crítica o alta con impacto real sobre Athleta deberá evaluarse antes de promover una release a producción.

---

# 50. Seguridad del módulo IA futuro

El módulo IA se encuentra fuera del alcance técnico actual.

Cuando se diseñe deberá respetar como mínimo:

```text
misma política de autorización
mínima exposición de información clínica
logs sanitizados
fuentes controladas
aislamiento de secrets
```

La introducción de IA no deberá debilitar las garantías existentes del core.

---

# 51. Regla final

Ante cualquier conflicto entre comodidad de implementación y protección de información sensible:

```text
se prioriza seguridad y privacidad
```

sin introducir complejidad arbitraria que no reduzca un riesgo concreto.
# Inicialización y recuperación de la primera entrega

La inicialización es una operación administrativa manual, no un seed, endpoint ni
parte de build/arranque. No ejecutar sobre Ramiro ni sobre una base con actividad.

## Destino y preservación

Antes de escribir, comprobar proyecto, servicio, entorno, clúster PostgreSQL,
conexión efectiva de la API y conteos de todas las tablas. Una rama no demuestra
el aislamiento de los datos. Conservar la base anterior; si contiene información,
crear una **base lógica nueva** en el PostgreSQL productivo existente, sin copiar
y vaciar Ramiro. No usar reset, truncate, drop ni fixtures de demostración.

Registrar de forma protegida la conexión anterior, el identificador del clúster,
la versión/despliegue de aplicación y los conteos de referencia. La recuperación
requiere restaurar conjuntamente conexión y versión compatible; no basta volver
al código anterior. No borrar la base anterior ni sus archivos después del cambio.

## Procedimiento manual

1. Crear el destino lógico explícito y comprobar su clúster. Mantener la API activa
   apuntando a la base anterior durante la preparación.
2. En un proceso aislado con `DATABASE_URL` del destino nuevo, ejecutar las
   migraciones versionadas: `pnpm --filter @athleta/api prisma:migrate:deploy`.
3. Proveer por entrada privada/entorno temporal (nunca argumentos, Git o logs):
   `DATABASE_URL`, `BOOTSTRAP_EXPECTED_DATABASE`, `BOOTSTRAP_EXPECTED_CLUSTER`,
   `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_FIRST_NAME`,
   `BOOTSTRAP_ADMIN_LAST_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`.
4. Ejecutar una sola vez, explícitamente:
   `pnpm --filter @athleta/api exec tsx scripts/initial-admin.ts`.
5. Verificar esquema, conteos, único usuario activo `GENERAL_ADMIN`, credencial
   Argon2id y `mustChangePassword=true` antes de conectar la API productiva.
6. Cambiar exclusivamente la conexión productiva y desplegar la versión de main.
   Verificar health, orígenes/CSRF, ambos login y acceso inicial con redirección al
   cambio obligatorio. No consumir ese cambio: revocar/cerrar la sesión de prueba.
7. Repetir conteos, comprobar ausencia de repoblación y preservar Ramiro.

El procedimiento comprueba nombre de base y `pg_control_system().system_identifier`;
requiere un operador PostgreSQL con permiso para esa comprobación. Rechaza tablas,
migraciones, datos operativos y estados de autenticación inesperados. Serializa la
creación y crea usuario, rol y credencial en una transacción. Es idempotente: nunca
sobrescribe una contraseña cambiada ni reactiva otra cuenta. Ante fallo sólo emite
un código seguro; no imprime errores Prisma que puedan incluir secretos.

## Excepciones estructurales de las migraciones actuales

- `_prisma_migrations`: historial de las 52 migraciones versionadas.
- `sala_configuration`: una fila `default`, capacidad base 10, creada por migración.
- `expense_area_catalog`: tres áreas de sistema, Sala, General y Clínica, creadas
  por migración y utilizadas por las reglas existentes de finanzas.

No crear planes, horarios, ejercicios, profesionales, cuentas o saldos de ejemplo.
El resto de las tablas operativas debe estar vacío. Las sesiones de verificación
revocadas son registros técnicos, no datos operativos ni sesiones heredadas válidas.

## WhatsApp del Portal

`athletaContact` conserva la única fuente pública de destinos institucionales.
El enlace principal usa WhatsApp, con mensaje abierto genérico en login y sin
identidad comprobada. Sólo usa `person.firstName` de la consulta de sesión existente;
normaliza espacios y codifica `text`. No añade consultas, almacenamiento, precarga
externa ni información personal adicional. Al iniciar logout descarta el nombre
del caché y cancela su verificación pendiente; los estados de error o revalidación
muestran el mensaje genérico. El login válido alimenta esa misma caché antes de
ir al cambio obligatorio de PIN; el footer del login permanece siempre genérico.
Instagram, Maps y firma Broco conservan sus destinos y tratamiento de contraste.

Prueba aislada del procedimiento:

```bash
pnpm --filter @athleta/api test:integration -- initial-admin.integration-spec.ts --runInBand
```

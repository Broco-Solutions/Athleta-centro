# Preview de ramiro

URL de prueba: https://athleta-001-web-git-ramiro-broco-solutions.vercel.app

El backend de este entorno valida Origin contra ese dominio y exige el token
CSRF de la sesión en las mutaciones. Las páginas de previews de Vercel de la
rama `ramiro` redirigen al dominio estable antes de iniciar sesión. Así las URLs
únicas de cada deployment no generan sesiones en un origen que Railway rechaza
al cerrar sesión. Las rutas API no se redirigen y conservan su validación.

La redirección solo se habilita cuando Vercel indica `VERCEL_ENV=preview` y
`VERCEL_GIT_COMMIT_REF=ramiro`. No se aplica a producción ni al desarrollo local.

Verificación: `pnpm check` y `pnpm test:e2e -- auth-ux.spec.ts --workers=1`.
La segunda requiere Docker para PostgreSQL aislado; no usar la base de Railway
como reemplazo. La revisión con HTTP simulado comprueba UI, no revocación en DB.

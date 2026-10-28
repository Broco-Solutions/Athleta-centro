# Cambio de contraseña interno

Ajuste acotado de `/change-password` siguiendo el login aprobado: marca grafito,
formulario claro de 448 px como máximo, campos y acción de 48 px. Reutiliza
`SecretInput` sin modificarlo; ambos campos tienen ojo independiente, autocomplete
y ayudas asociadas. Se corrige la ayuda de contraseña actual y se muestran carga,
error y guardado pendiente con bloqueo de doble envío. No cambia política,
endpoint, payload, CSRF, revocación, actualización de sesión ni destino posterior.

Capturas reales de Chromium con sesión GET ficticia y campos vacíos, sin cuentas
publicadas ni contraseñas en imágenes:

- [Antes escritorio](before-desktop.png) / [Después escritorio](after-desktop.png).
- [Antes móvil bajo](before-mobile.png) / [Después móvil bajo](after-mobile.png).

Comprobado a zoom 100 %, 360×740, 390×844, 768×1024, 1366×768 y 390×500:
sin desbordamiento, scroll normal y acción alcanzable. El recorrido de navegador
comprueba teclado, pegado, ojitos sin POST, valores sin normalizar, guardado único
pendiente, contrato/CSRF existentes, respuesta exitosa antes de redirigir e
invalidación de sesión. Intercepta toda solicitud API; nunca escribe en una base.

```bash
pnpm --filter @athleta/web exec playwright test change-password-presentation.spec.ts --config playwright.presentation.config.ts --project=chromium
```

WebKit se intentó: faltan bibliotecas del host, entre ellas `libgtk-4.so.1`.
No se instalaron dependencias del sistema ni se probó un iPhone físico.
La validación visual autenticada corresponde a fixtures, no a cuentas productivas.

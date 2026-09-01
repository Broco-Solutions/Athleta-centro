# MVP UAT dummy data

Carga explícita (nunca se ejecuta en deploy/startup):

```bash
ALLOW_DUMMY_SEED=true pnpm seed:uat
```

Sin `ALLOW_DUMMY_SEED=true` el comando aborta con `DUMMY SEED NOT AUTHORIZED`.
Todos los datos son sintéticos y usan `@example.test` / `[DUMMY UAT]`. El seed es idempotente y no elimina datos existentes.

| Personaje | Contexto / escenario | Portal PIN |
|---|---|---:|
| Homer Simpson | Sala + Clínica + Portal + Finanzas, flujo completo | 1111 |
| Marge Simpson | Sala only | 2222 |
| Meg Griffin | Clínica activa por tratamiento | 3333 |
| Chris Griffin | Clínica activa por turno futuro | 4444 |
| Milhouse Van Houten | Inactivo; login Portal rechazado | 5555 |
| Nelson Muntz | Capacidad/reservas; PIN temporal | 6666 |
| Ralph Wiggum | Persona mínima / alta desde cero | 7777 |
| Glenn Quagmire | Clínica con atención, evolución, estudio, OS e ingresos | 8888 |
| Joe Swanson | Escenario de inactivación global | 9999 |

Usuarios internos sintéticos: Lisa Simpson (GENERAL_ADMIN), Lois Griffin
(ADMINISTRATIVE), Bart Simpson (PROFESSOR), Brian Griffin (KINESIOLOGIST),
Stewie Griffin (OSTEOPATH), Marge Simpson (PROFESSOR + KINESIOLOGIST) y Peter
Griffin (PROFESSOR, INACTIVE). La contraseña temporal UAT es
`AthletaTest!2026` y se almacena únicamente como hash Argon2id.

El seed prepara catálogos de Sala, medios de pago, categorías de gastos,
obras sociales, pacientes clínicos, turnos, atenciones, tratamientos, estudios,
órdenes, pagos, ingresos y gastos. No crea FileAssets falsos ni ejecuta contra
Railway automáticamente.

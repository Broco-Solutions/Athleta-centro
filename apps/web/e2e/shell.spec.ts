import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

function fixture(kind: 'normal' | 'temporary' | 'inactive' | 'people' | 'team' | 'sala' | 'occurrence' | 'multislot' | 'clinic' | 'service' | 'portal-reset' | 'portal-fixed-edit'): void { execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/e2e-fixture.ts', kind], { cwd: '../..', stdio: 'inherit' }); }
async function login(page: import('@playwright/test').Page, email: string, password = 'ValidPass1!'): Promise<void> { await page.goto('/login'); await page.getByLabel('Email').fill(email); await page.getByLabel('Contraseña').fill(password); await page.getByRole('button', { name: /Ingresar/ }).click(); }

test('redirects unauthenticated visitors to login through the Next-to-API rewrite', async ({ page }) => { await page.goto('/'); await expect(page).toHaveURL(/\/login$/); });
test('authenticates and logs out a normal internal user', async ({ page }) => { fixture('normal'); await login(page, 'e2e.normal@athleta.test'); await expect(page.getByRole('heading', { name: 'Bienvenido a Athleta' })).toBeVisible(); await page.getByRole('button', { name: /Cerrar sesión/ }).click(); await expect(page).toHaveURL(/\/login$/); await page.goto('/'); await expect(page).toHaveURL(/\/login$/); });
test('requires a temporary credential to be changed before workspace access', async ({ page }) => { fixture('temporary'); await login(page, 'e2e.temporary@athleta.test'); await expect(page).toHaveURL(/\/change-password$/); await page.goto('/'); await expect(page).toHaveURL(/\/change-password$/); await page.getByLabel('Contraseña actual').fill('ValidPass1!'); await page.getByLabel('Nueva contraseña').fill('ChangedPass1!'); await page.getByRole('button', { name: 'Guardar contraseña' }).click(); await expect(page.getByRole('heading', { name: 'Bienvenido a Athleta' })).toBeVisible(); });
test('rejects an inactive internal user without revealing its status', async ({ page }) => { fixture('inactive'); await login(page, 'e2e.inactive@athleta.test'); await expect(page.getByText('No pudimos iniciar sesión con los datos ingresados.')).toBeVisible(); });
test('creates, finds, opens and updates a Person through the full deployed flow', async ({ page }) => { fixture('people'); await login(page, 'e2e.people@athleta.test'); await page.getByRole('link', { name: 'Personas' }).click(); await page.getByRole('button', { name: /Nueva Persona/ }).click(); await page.getByLabel('Nombre').fill('Vertical'); await page.getByLabel('Apellido').fill('Sintética'); await page.getByLabel('DNI').fill('40.999.888'); await page.getByLabel('Teléfono').fill('3515550108'); await page.getByLabel('Fecha de nacimiento').fill('1993-04-12'); await page.getByRole('button', { name: 'Guardar' }).click(); await page.getByLabel('Buscar Personas').fill('40.999.888'); await expect(page.getByText('Sintética, Vertical')).toBeVisible(); await page.getByText('Sintética, Vertical').click(); await page.getByLabel('Teléfono').fill('3515550199'); await page.getByRole('button', { name: 'Guardar' }).click(); await page.getByText('Sintética, Vertical').click(); await expect(page.getByLabel('Teléfono')).toHaveValue('3515550199'); });
test('resets a Portal PIN through the custom dialog and enters with the returned PIN', async ({ page }) => {
  fixture('portal-reset'); await login(page, 'e2e.portal-reset@athleta.test'); await page.getByRole('link', { name: 'Personas' }).click(); await page.getByLabel('Buscar Personas').fill('40999444'); await page.getByText('ResetE2E, Portal').click();
  await page.getByRole('button', { name: 'Resetear PIN del Portal' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Resetear PIN del Portal' }); await expect(confirmation).toBeVisible(); await confirmation.getByRole('button', { name: 'Generar nuevo PIN' }).click();
  const pinDialog = page.getByRole('dialog', { name: 'Nuevo PIN del Portal' }); await expect(pinDialog).toBeVisible(); const pin = await pinDialog.getByLabel('PIN temporal').textContent(); expect(pin?.trim()).toMatch(/^\d{4}$/); await pinDialog.getByRole('button', { name: 'Entendido' }).click(); await page.getByRole('button', { name: 'Cerrar', exact: true }).click(); await page.getByRole('button', { name: /Cerrar sesión/ }).click();
  await page.waitForURL(/\/login$/); await page.goto('/portal/login', { waitUntil: 'domcontentloaded' }); await page.getByLabel('DNI').fill('40999444'); await page.getByLabel('PIN de 4 dígitos').fill(pin!.trim()); await page.getByRole('button', { name: 'Ingresar' }).click(); await expect(page).toHaveURL(/\/portal\/change-pin$/);
});
test('exposes Portal Sala, Clínica and profile workflows after login', async ({ page }) => {
  fixture('portal-reset'); await page.goto('/portal/login'); await page.getByLabel('DNI').fill('40999444'); await page.getByLabel('PIN de 4 dígitos').fill('1234'); await page.getByRole('button', { name: 'Ingresar' }).click(); await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole('link', { name: 'Sala', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Mis datos', exact: true })).toBeVisible(); await page.getByRole('link', { name: 'Sala', exact: true }).click(); await expect(page).toHaveURL(/\/portal\/sala$/); await expect(page.getByRole('heading', { name: 'Reservar horario' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Mi rutina' })).toBeVisible(); await page.getByRole('link', { name: 'Mis datos', exact: true }).click(); await expect(page).toHaveURL(/\/portal\/profile$/); await expect(page.getByText('DNI')).toBeVisible(); await expect(page.getByText('id:')).toHaveCount(0);
});

test('modifies and finalizes a real Portal fixed booking', async ({ page }) => {
  fixture('portal-reset'); await page.goto('/portal/login'); await page.getByLabel('DNI').fill('40999444'); await page.getByLabel('PIN de 4 dígitos').fill('1234'); await page.getByRole('button', { name: 'Ingresar' }).click(); await page.goto('/portal/sala');
  const service = page.getByLabel('Servicio turno fijo'); await service.selectOption({ index: 1 });
  const day = page.getByLabel('Día turno fijo'); const dayOptions = await day.locator('option').evaluateAll((options) => options.map((option) => option.getAttribute('value')).filter((value): value is string => Boolean(value))); const hour = page.getByLabel('Hora turno fijo'); let dayWithAvailability = false; for (const weekday of dayOptions) { await day.selectOption(weekday); await page.waitForTimeout(250); if (await hour.locator('option').count() > 2) { dayWithAvailability = true; break; } } expect(dayWithAvailability).toBe(true); await hour.selectOption({ index: 2 }); const createdHour = await hour.inputValue(); await page.getByRole('button', { name: 'Crear turno fijo' }).click(); await expect(page.getByText('Turno fijo creado.')).toBeVisible();
  await page.getByRole('button', { name: 'Modificar' }).click(); const edit = page.getByRole('dialog', { name: 'Modificar turno fijo' }); await expect(edit).toBeVisible(); const editDay = edit.getByRole('combobox', { name: 'Día' }); const currentEditDay = await editDay.inputValue(); const editDays = await editDay.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)); const nextDay = editDays.find((value) => value && value !== currentEditDay); expect(nextDay).toBeTruthy(); await editDay.selectOption(nextDay!); const editHour = edit.getByRole('combobox', { name: 'Hora' }); await expect.poll(async () => editHour.locator('option').count()).toBeGreaterThan(2); const editHourValues = await editHour.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)); const nextHour = editHourValues.find((value) => value && !value.startsWith('Actual')); expect(nextHour).toBeTruthy(); await editHour.selectOption(nextHour!); const [changeResponse] = await Promise.all([page.waitForResponse((response) => response.url().includes('/sala/fixed-bookings/') && response.url().endsWith('/change')), edit.getByRole('button', { name: 'Guardar cambios' }).click()]); expect(changeResponse.status(), JSON.stringify({ payload: changeResponse.request().postDataJSON(), response: await changeResponse.text() })).toBe(201); await expect(page.getByText('Turno fijo modificado.')).toBeVisible(); await page.reload(); await expect(page.getByText(nextHour!)).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar' }).click(); const confirmation = page.getByRole('dialog', { name: 'Finalizar turno fijo' }); await expect(confirmation).toBeVisible(); await confirmation.getByRole('button', { name: 'Finalizar turno' }).click(); await expect(page.getByText('Turno fijo finalizado.')).toBeVisible(); await page.reload(); await expect(page.getByText('No tenés un turno fijo.')).toBeVisible();
});
test('edits Monday fixed booking independently from Wednesday one-off date', async ({ page }) => {
  fixture('portal-fixed-edit'); await page.goto('/portal/login'); await page.getByLabel('DNI').fill('40999445'); await page.getByLabel('PIN de 4 dígitos').fill('1234'); await page.getByRole('button', { name: 'Ingresar' }).click(); await page.goto('/portal/sala');
  await page.getByLabel('Fecha').fill('2026-09-02'); await page.getByRole('button', { name: 'Modificar' }).click(); const edit = page.getByRole('dialog', { name: 'Modificar turno fijo' }); await expect(edit).toBeVisible(); await expect(edit.getByLabel('Día')).toHaveValue('MONDAY'); const hour = edit.getByLabel('Hora'); const offered = hour.locator('option').filter({ hasText: /^11:00/ }).first(); await expect(offered).toHaveCount(1); const offeredValue = await offered.getAttribute('value'); expect(offeredValue).toMatch(/^[0-9a-f-]{36}:11:00$/); await hour.selectOption(offeredValue!);
  const [response] = await Promise.all([page.waitForResponse((item) => item.url().includes('/sala/fixed-bookings/') && item.url().endsWith('/change')), edit.getByRole('button', { name: 'Guardar cambios' }).click()]); expect(response.status()).toBe(201); expect(response.request().postDataJSON()).toMatchObject({ scheduleSlotId: offeredValue!.split(':')[0], serviceTypeId: expect.any(String), startTime: '11:00', startDate: '2026-09-07' }); await expect(page.getByText('Turno fijo modificado.')).toBeVisible(); await expect(page.getByText('11:00')).toBeVisible(); await page.reload(); await expect(page.getByText('11:00')).toBeVisible();
});
test('manages a standard team account through explicit lifecycle actions', async ({ page }) => {
  fixture('team');
  await login(page, 'e2e.team@athleta.test');
  await page.getByRole('link', { name: 'Equipo' }).click();
  await page.getByRole('button', { name: /Nuevo integrante/ }).click();
  await page.getByLabel('Nombre').fill('Cuenta');
  await page.getByLabel('Apellido').fill('Sintética');
  await page.getByLabel('Email').fill('e2e.created@athleta.test');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('temporary-password')).toBeVisible();
  await page.getByRole('button', { name: 'Entendido' }).click();

  const targetRow = page.getByRole('row').filter({ hasText: 'Sintética, Cuenta' });
  await targetRow.getByText('Sintética, Cuenta').click();
  await page.getByLabel('Agregar rol').selectOption('KINESIOLOGIST');
  await targetRow.getByText('Sintética, Cuenta').click();
  await page.getByRole('button', { name: 'Profesor ×' }).click();
  await targetRow.getByText('Sintética, Cuenta').click();
  await page.getByRole('button', { name: 'Inactivar acceso' }).click();
  await expect(targetRow.getByText('Inactivo')).toBeVisible();
  await targetRow.getByText('Sintética, Cuenta').click();
  await page.getByRole('button', { name: 'Reactivar acceso' }).click();
  await expect(targetRow.getByText('Activo')).toBeVisible();
});
test('manages Sala participation periods from a Person', async ({ page }) => {
  fixture('sala'); await login(page, 'e2e.sala@athleta.test'); await page.getByRole('link', { name: 'Personas' }).click(); await page.getByLabel('Buscar Personas').fill('40999777'); await page.getByText('SalaE2E, Persona').click();
  await expect(page.getByText('Participación en Sala')).toBeVisible(); await page.getByLabel('Plan').selectOption({ label: 'Plan E2E' }); await page.getByLabel('Profesor principal').selectOption({ label: 'E2E, Profesor' }); await page.getByRole('button', { name: 'Incorporar a Sala' }).click();
  await expect(page.getByText('Plan actual')).toBeVisible(); await page.getByLabel('Cambiar Plan').selectOption({ label: 'Plan E2E' }); page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Dar de baja' }).click(); await expect(page.getByRole('button', { name: 'Dar de baja' })).toBeHidden(); await expect(page.getByText(/Historial/)).toBeVisible();
  await page.getByLabel('Plan').selectOption({ label: 'Plan E2E' }); await page.getByLabel('Profesor principal').selectOption({ label: 'E2E, Profesor' }); await page.getByRole('button', { name: 'Incorporar a Sala' }).click(); await expect(page.getByText('Plan actual')).toBeVisible();
});
test('operates lazy Sala occurrences and manual attendance corrections', async ({ page }) => {
  fixture('occurrence');
  await login(page, 'e2e.occurrence@athleta.test');
  await page.getByRole('link', { name: 'Sala' }).click();
  await expect(page.getByText(/1970|MONDAY|TUESDAY/)).toHaveCount(0);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const fixedRow = page.locator('li').filter({ hasText: 'OccurrenceE2E, Fija' });
  await page.getByLabel('Fecha de agenda').fill(today);
  await page.getByRole('button', { name: /20:00/ }).first().click();
  await expect(fixedRow.getByText('Reservado')).toBeVisible();
  await fixedRow.getByRole('button', { name: 'Asistió' }).click();
  await expect(fixedRow.getByText('Asistió', { exact: true })).toBeVisible();
  await fixedRow.getByRole('button', { name: 'Ausente' }).click();
  await expect(fixedRow.getByText('Ausente', { exact: true })).toBeVisible();
  await fixedRow.getByRole('button', { name: 'Asistió' }).click();
  await expect(fixedRow.getByText('Asistió', { exact: true })).toBeVisible();
  await fixedRow.getByRole('button', { name: 'Cancelar' }).click();
  await expect(fixedRow.getByText('Cancelado')).toBeVisible();
  await page.getByLabel('Fecha de agenda').fill(addDays(today, 7));
  await expect(fixedRow.getByText('Reservado')).toBeVisible();
  await page.getByLabel('Fecha de agenda').fill(addDays(today, -7));
  await expect(fixedRow.getByText('Reservado')).toBeVisible();
  await page.getByLabel('Fecha de agenda').fill(today);
  await page.getByLabel('Persona espontánea').selectOption({ label: 'OccurrenceE2E, Espontánea · 40999662' });
  await page.getByLabel('Horario espontáneo').selectOption({ label: '20:00' });
  await page.getByRole('button', { name: 'Incorporar' }).click();
  const spontaneousRow = page.locator('li').filter({ hasText: 'OccurrenceE2E, Espontánea' });
  await expect(spontaneousRow.getByText('Espontáneo')).toBeVisible();
  await expect(spontaneousRow.locator('span').filter({ hasText: /^Asistió$/ })).toBeVisible();
  await page.getByLabel('Persona espontánea').selectOption({ label: 'OccurrenceE2E, Espontánea · 40999662' });
  await page.getByLabel('Horario espontáneo').selectOption({ label: '20:00' });
  await page.getByRole('button', { name: 'Incorporar' }).click();
  await expect(page.getByText(/ya posee una presencia/)).toBeVisible();
});
test('books a 60-minute Sala service across four slots and confirms overcapacity', async ({ page }) => {
  fixture('multislot'); await login(page, 'e2e.multislot@athleta.test'); await page.getByRole('link', { name: 'Sala' }).click();
  await page.getByLabel('Fecha de disponibilidad').fill('2026-08-31');
  await page.getByLabel('Alumno').selectOption({ label: 'Persona1 MultiSlotE2E · 40999551' }); await page.getByLabel('Participación').selectOption({ index: 1 }); await page.getByLabel('Servicio').selectOption({ label: 'Gimnasio E2E · 60 min' }); await page.getByLabel('Hora de inicio').selectOption('12:00'); await page.getByRole('button', { name: 'Reserva puntual' }).click();
  for (const time of ['12:00–12:15','12:15–12:30','12:30–12:45','12:45–13:00']) await expect(page.getByText(time).first()).toBeVisible();
  await page.getByLabel('Alumno').selectOption({ label: 'Persona2 MultiSlotE2E · 40999552' }); await page.getByLabel('Participación').selectOption({ index: 1 }); await page.getByRole('button', { name: 'Reserva puntual' }).click(); await expect(page.getByText(/supera la capacidad/)).toBeVisible(); await page.getByRole('button', { name: 'Confirmar sobrecupo' }).click(); await expect(page.getByText('Sobrecupo').first()).toBeVisible(); await page.reload(); await page.getByLabel('Fecha de disponibilidad').fill('2026-08-31'); await expect(page.getByText('Sobrecupo').first()).toBeVisible();
  await page.getByLabel('Servicio').selectOption({ label: 'Gimnasio E2E · 60 min' }); await expect(page.getByLabel('Hora de inicio').getByRole('option', { name: '19:15' })).toHaveCount(0);
});
test('navigates the consolidated Phase 3 clinical workspace', async ({ page }) => {
  fixture('clinic');
  await login(page, 'e2e.clinic@athleta.test');
  await page.getByRole('link', { name: 'Clínica' }).click();
  await expect(page.getByRole('heading', { name: 'Clínica' })).toBeVisible();
  await expect(page.getByLabel('Fecha de agenda')).toBeVisible();
  for (const section of ['Paciente', 'Tratamientos', 'Atenciones', 'Evaluaciones', 'Estudios', 'Obra social', 'Indicaciones']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.getByRole('heading', { name: section === 'Obra social' ? 'Obras sociales y órdenes' : section })).toBeVisible();
  }
  for (const viewport of [{ width: 1280, height: 800 }, { width: 820, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('navigation', { name: 'Secciones de Clínica' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('keeps global navigation available across workspaces', async ({ page }) => {
  fixture('normal');
  await login(page, 'e2e.normal@athleta.test');
  for (const section of ['Inicio', 'Personas', 'Sala', 'Clínica']) {
    await page.getByRole('link', { name: section }).click();
    await expect(page.getByRole('link', { name: section })).toBeVisible();
  }
});

test('exposes Sala configuration from the Sala workspace', async ({ page }) => {
  fixture('sala');
  await login(page, 'e2e.sala@athleta.test');
  await page.getByRole('link', { name: 'Sala' }).click();
  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configuración de Sala' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Horarios semanales' })).toBeVisible();
});

test('retires a Sala service and removes it from new-booking selectors', async ({ page }) => {
  fixture('service');
  await login(page, 'e2e.service@athleta.test');
  await page.getByRole('link', { name: 'Sala' }).click();
  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
  await page.getByRole('heading', { name: 'Servicios y duraciones' }).click();
  const service = page.getByText(/Servicio Retiro E2E · 45 min/).locator('..');
  await expect(service.getByRole('button', { name: 'Editar' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await service.getByRole('button', { name: 'Retirar' }).click();
  await expect(page.getByText(/Servicio Retiro E2E · 45 min · Retirado/)).toBeVisible();
  await page.reload();
  await page.getByRole('heading', { name: 'Servicios y duraciones' }).click();
  await expect(page.getByText(/Servicio Retiro E2E · 45 min · Retirado/)).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: 'Sala' }).click();
  await expect(page.getByLabel('Servicio').getByRole('option', { name: /Servicio Retiro E2E/ })).toHaveCount(0);
});
test('creates a physical test from Sala configuration and keeps it after reload', async ({ page }) => {
  fixture('service'); await login(page, 'e2e.service@athleta.test'); await page.getByRole('link', { name: 'Sala' }).click(); await page.getByRole('link', { name: 'Configuración', exact: true }).click(); await page.getByText('Tests físicos', { exact: true }).click(); await page.getByRole('button', { name: 'Nuevo test' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo test físico' }); const name = `Test físico E2E ${Date.now()}`; await dialog.getByLabel('Nombre del test físico').fill(name); await dialog.getByLabel('Tipo del test físico').fill('distancia'); await dialog.getByLabel('Descripción del test físico').fill('Dato de prueba'); const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/sala/physical-test-definitions') && response.request().method() === 'POST'); await dialog.getByRole('button', { name: 'Guardar' }).click(); expect((await responsePromise).status()).toBe(201); await expect(page.getByText(name)).toBeVisible(); await page.reload(); await page.getByText('Tests físicos', { exact: true }).click(); await expect(page.getByText(name)).toBeVisible();
});

test('navigates from People to a real Person workspace and clinical entry flows', async ({ page }) => {
  fixture('sala');
  await login(page, 'e2e.sala@athleta.test');
  await page.getByRole('link', { name: 'Personas' }).click();
  const row = page.getByRole('row').filter({ hasText: 'SalaE2E, Persona' }).first();
  await row.getByRole('link', { name: 'Abrir ficha' }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Ficha de Persona' })).toBeVisible();
  await page.getByRole('button', { name: 'Dar de alta en Clínica' }).click();
  await expect(page.getByText('Paciente de Clínica')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Paciente de Clínica')).toBeVisible();
  await page.getByRole('button', { name: /Cerrar sesión/ }).click();
  await login(page, 'e2e.sala@athleta.test');
  await page.getByRole('link', { name: 'Personas' }).click();
  await page.getByLabel('Buscar Personas').fill('40999777');
  await page.getByRole('row').filter({ hasText: 'SalaE2E, Persona' }).first().getByRole('link', { name: 'Abrir ficha' }).click();
  await expect(page.getByText('Paciente de Clínica')).toBeVisible();
  await page.getByRole('link', { name: 'Abrir ficha clínica' }).click();
  await expect(page).toHaveURL(/\/clinic\?personId=/);
  await expect(page.getByRole('link', { name: 'Clínica' })).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Agendar turno' }).click();
  await expect(page.getByRole('heading', { name: 'Agendar turno clínico' })).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Registrar atención' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar atención directa' })).toBeVisible();
});

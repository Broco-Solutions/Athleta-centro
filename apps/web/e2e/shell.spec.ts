import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

function fixture(kind: 'normal' | 'temporary' | 'inactive' | 'people' | 'team' | 'sala' | 'occurrence' | 'multislot' | 'clinic'): void { execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/e2e-fixture.ts', kind], { cwd: '../..', stdio: 'inherit' }); }
async function login(page: import('@playwright/test').Page, email: string, password = 'ValidPass1!'): Promise<void> { await page.goto('/login'); await page.getByLabel('Email').fill(email); await page.getByLabel('Contraseña').fill(password); await page.getByRole('button', { name: /Ingresar/ }).click(); }

test('redirects unauthenticated visitors to login through the Next-to-API rewrite', async ({ page }) => { await page.goto('/'); await expect(page).toHaveURL(/\/login$/); });
test('authenticates and logs out a normal internal user', async ({ page }) => { fixture('normal'); await login(page, 'e2e.normal@athleta.test'); await expect(page.getByRole('heading', { name: 'Bienvenido a Athleta' })).toBeVisible(); await page.getByRole('button', { name: /Cerrar sesión/ }).click(); await expect(page).toHaveURL(/\/login$/); await page.goto('/'); await expect(page).toHaveURL(/\/login$/); });
test('requires a temporary credential to be changed before workspace access', async ({ page }) => { fixture('temporary'); await login(page, 'e2e.temporary@athleta.test'); await expect(page).toHaveURL(/\/change-password$/); await page.goto('/'); await expect(page).toHaveURL(/\/change-password$/); await page.getByLabel('Contraseña actual').fill('ValidPass1!'); await page.getByLabel('Nueva contraseña').fill('ChangedPass1!'); await page.getByRole('button', { name: 'Guardar contraseña' }).click(); await expect(page.getByRole('heading', { name: 'Bienvenido a Athleta' })).toBeVisible(); });
test('rejects an inactive internal user without revealing its status', async ({ page }) => { fixture('inactive'); await login(page, 'e2e.inactive@athleta.test'); await expect(page.getByText('No pudimos iniciar sesión con los datos ingresados.')).toBeVisible(); });
test('creates, finds, opens and updates a Person through the full deployed flow', async ({ page }) => { fixture('people'); await login(page, 'e2e.people@athleta.test'); await page.getByRole('link', { name: 'Personas' }).click(); await page.getByRole('button', { name: /Nueva Persona/ }).click(); await page.getByLabel('Nombre').fill('Vertical'); await page.getByLabel('Apellido').fill('Sintética'); await page.getByLabel('DNI').fill('40.999.888'); await page.getByLabel('Teléfono').fill('3515550108'); await page.getByLabel('Fecha de nacimiento').fill('1993-04-12'); await page.getByRole('button', { name: 'Guardar' }).click(); await page.getByLabel('Buscar Personas').fill('40.999.888'); await expect(page.getByText('Sintética, Vertical')).toBeVisible(); await page.getByText('Sintética, Vertical').click(); await page.getByLabel('Teléfono').fill('3515550199'); await page.getByRole('button', { name: 'Guardar' }).click(); await page.getByText('Sintética, Vertical').click(); await expect(page.getByLabel('Teléfono')).toHaveValue('3515550199'); });
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

import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

type Fixture = { personId: string; professorId: string; planId: string; exerciseId: string; exerciseName: string; dni: string; email: string };
function fixture(variant?: 'history' | 'grouped' | 'online'): Fixture {
  return JSON.parse(execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts', ...(variant ? [variant] : [])], { cwd: '../..', encoding: 'utf8' }).trim()) as Fixture;
}
function cleanup(f: Fixture) {
  execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts', 'cleanup', f.personId, f.professorId, f.planId, f.exerciseId, f.dni], { cwd: '../..', stdio: 'pipe' });
}
async function login(page: Page, f: Fixture) {
  await page.goto('/portal/login'); await page.getByLabel('DNI', { exact: true }).fill(f.dni); await page.getByLabel('PIN', { exact: true }).fill('1111'); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await expect(page).toHaveURL('/portal');
  await page.goto('/portal/sala/rutina');
}
async function capture(page: Page, state: string) {
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    // Responsive shell and fonts settle before measuring the document.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/athleta-monthly-${state}-${width}.png`, fullPage: true });
  }
}

test('monthly Portal save, repeated correction, retrospective months and read-only Management', async ({ page, browser }) => {
  test.setTimeout(180000); const f = fixture();
  try {
    await page.setViewportSize({ width: 390, height: 844 }); await login(page, f);
    const cards = page.locator('button[aria-expanded][aria-controls]');
    await expect(cards).toHaveCount(2); await expect(cards.first()).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: 'Períodos de rutina' })).toHaveCount(0);
    await capture(page, 'one-routine-closed');
    await cards.first().click(); await expect(page.getByRole('textbox')).toHaveCount(4);
    await capture(page, 'four-empty');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox').nth(1).fill('42,5'); await page.getByRole('textbox').nth(3).fill('0');
    await cards.last().click(); await page.getByRole('textbox').nth(4).fill('60');
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Mes anterior', exact: true }).click(); await expect(page.getByRole('textbox').nth(1)).toHaveValue('42,5');
    const requests: string[] = []; page.on('request', req => { if (req.method() === 'PUT' && req.url().endsWith('/training-records/monthly')) requests.push(req.url()); });
    const save = page.getByRole('button', { name: 'Guardar pesos', exact: true }); await expect(save).toHaveCount(1);
    await expect(save).toBeInViewport();
    const days = page.getByRole('navigation', { name: 'Días de la rutina' }); await expect(days).toBeInViewport();
    expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual((await days.boundingBox())!.y);
    await page.screenshot({ path: '/tmp/athleta-monthly-mobile-save-390.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 460 });
    await page.getByRole('textbox').nth(1).focus();
    await expect(page.getByRole('textbox').nth(1)).toBeInViewport();
    expect((await page.getByRole('textbox').nth(1).boundingBox())!.y + (await page.getByRole('textbox').nth(1).boundingBox())!.height).toBeLessThanOrEqual((await save.boundingBox())!.y);
    await page.screenshot({ path: '/tmp/athleta-monthly-keyboard-viewport-390.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await save.click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible(); expect(requests).toHaveLength(1);
    await expect(cards.first()).toHaveAttribute('aria-expanded', 'true'); await expect(page.getByRole('textbox').nth(1)).toHaveValue('42,5');
    await capture(page, 'saved-weights');
    await page.reload(); await cards.first().click(); await expect(page.getByRole('textbox').nth(1)).toHaveValue('42,5');
    await page.getByRole('textbox').nth(1).fill('47,5'); await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click(); await cards.first().click(); await expect(page.getByRole('textbox').nth(1)).toHaveValue('');
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click(); await cards.first().click(); await expect(page.getByRole('textbox').nth(1)).toHaveValue('47,5');
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click(); await expect(page.getByText('Carga de historial anterior')).toBeVisible(); await cards.first().click();
    await page.getByRole('textbox').first().fill('27,5'); await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    await page.getByRole('link', { name: 'Mis entrenamientos', exact: true }).click(); await page.getByRole('button', { name: /Ver detalle del/ }).first().click(); await page.getByRole('link', { name: 'Editar registro' }).click();
    await expect(page.getByRole('heading', { name: 'Editar registro', exact: true })).toBeVisible(); await expect(page.locator('p.font-medium').filter({ hasText: /Semana \d — Fuerza/ })).toBeVisible(); await expect(page.getByLabel(/Peso utilizado/).first()).toHaveValue('27,5');
    await page.getByLabel(/Peso utilizado/).first().fill('28,5'); await page.getByRole('button', { name: 'Guardar corrección' }).click(); await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const teacher = await staff.newPage();
    try {
      await teacher.goto('/login'); await teacher.getByLabel('Email').fill(f.email); await teacher.getByLabel('Contraseña', { exact: true }).fill('Synthetic-test-password1!'); await teacher.getByRole('button', { name: 'Ingresar', exact: true }).click(); await expect(teacher).toHaveURL('/');
      await teacher.goto(`/sala/people/${f.personId}?tab=routine`); await expect(teacher.getByText('Rutina 1', { exact: true })).toBeVisible();
      await teacher.getByRole('button', { name: 'Ver pesos' }).click(); await expect(teacher.getByText('47,5 kg', { exact: true })).toBeVisible(); await expect(teacher.getByText('60 kg', { exact: true })).toBeVisible();
      await expect(teacher.getByRole('textbox')).toHaveCount(0); await expect(teacher.getByRole('link', { name: 'Editar registro' })).toHaveCount(0);
      await capture(teacher, 'management-weights');
      // Assign a same-day replacement, then reuse the historical version for a future date.
      await teacher.getByRole('button', { name: 'Asignar nueva rutina', exact: true }).click(); await teacher.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(teacher.getByText('Rutina asignada correctamente.')).toBeVisible();
      await teacher.getByText('Rutinas históricas (1)', { exact: true }).click();
      await teacher.getByRole('button', { name: 'Usar nuevamente', exact: true }).click();
      await teacher.getByLabel('Fecha de inicio').fill('2099-12-01'); await teacher.getByRole('alertdialog').getByRole('button', { name: 'Usar nuevamente', exact: true }).click(); await expect(teacher.getByText('Rutina programada desde el 01/12/2099.')).toBeVisible();
      await expect(teacher.getByText('Vigente', { exact: true })).toBeVisible(); await expect(teacher.getByText('Comienza el 01/12/2099')).toBeVisible();
      await capture(teacher, 'management-current-history-scheduled');
      // Same-day replaced routine is absent from the Portal day bar; saved weights stay in history.
      await page.goto('/portal/sala/rutina'); await expect(page.getByRole('heading', { name: 'Rutina 2 · Período vigente' })).toBeVisible(); await expect(page.getByRole('region', { name: 'Períodos de rutina' })).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Días de la rutina' }).getByRole('button')).toHaveCount(2);
    } finally { await staff.close(); }
  } finally { cleanup(f); }
});

test('two periods have separate days and monthly slots, and select the routine for the backend date', async ({ page }) => {
  test.setTimeout(180000); const f = fixture('history');
  try {
    await login(page, f);
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    const periods = page.getByRole('region', { name: 'Períodos de rutina' }); await expect(periods.getByRole('button')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Versión 2', exact: true })).toBeVisible();
    await capture(page, 'two-periods-latest');
    const cards = page.locator('button[aria-expanded][aria-controls]'); await cards.first().click(); await expect(page.getByRole('textbox')).toHaveCount(4); await page.getByRole('textbox').nth(3).fill('35'); await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    await periods.getByRole('button', { name: /Rutina 1$/ }).click();
    const days = page.getByRole('navigation', { name: 'Días de la rutina' }); await expect(days.getByRole('button')).toHaveCount(2); await expect(days).not.toContainText('Versión 2');
    await cards.first().click(); await expect(page.getByRole('textbox')).toHaveCount(4); await expect(page.getByRole('textbox').nth(3)).toHaveValue('');
    await page.getByRole('textbox').nth(3).fill('25'); await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible(); await capture(page, 'two-periods-historical-manual');
    await periods.getByRole('button', { name: /Rutina 2$/ }).click(); await cards.first().click(); await expect(page.getByRole('textbox').nth(3)).toHaveValue('35');
    for (const [today, heading] of [['2026-10-03', 'Fuerza'], ['2026-10-16', 'Versión 2']]) {
      await page.route('**/api/portal/sala/training-context*', async route => { const response = await route.fetch(); const body = await response.json(); body.data.today = today; await route.fulfill({ response, json: body }); });
      await page.reload(); await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible(); await capture(page, `automatic-${today}`); await page.unroute('**/api/portal/sala/training-context*');
    }
  } finally { cleanup(f); }
});

test('edits a grouped current routine with a future routine and preserves monthly weights', async ({ page, browser }) => {
  test.setTimeout(180000);
  const f = fixture('grouped');
  const staff = await browser.newContext();
  try {
    await login(page, f);
    const cards = page.locator('button[aria-expanded][aria-controls]');
    await cards.first().click();
    await page.getByRole('textbox').first().fill('40');
    await cards.last().click();
    await page.getByRole('textbox').nth(4).fill('60');
    await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click();
    await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    const teacher = await staff.newPage();
    await teacher.goto('/login');
    await teacher.getByLabel('Email').fill(f.email);
    await teacher.getByLabel('Contraseña', { exact: true }).fill('Synthetic-test-password1!');
    await teacher.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(teacher).toHaveURL('/');
    await teacher.goto('/sala/people/' + f.personId + '?tab=routine');
    await teacher.getByRole('button', { name: 'Asignar nueva rutina', exact: true }).click();
    await teacher.getByLabel('Fecha de inicio').fill('2099-12-01');
    await teacher.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(teacher.getByText('Rutina programada desde el 01/12/2099.')).toBeVisible();
    await teacher.getByRole('button', { name: 'Editar rutina', exact: true }).click();
    const editor = teacher.getByRole('region', { name: 'Editar rutina', exact: true });
    await expect(editor.getByLabel('Fecha de inicio')).toHaveCount(0);
    await editor.getByRole('button', { name: /^Quitar / }).nth(1).click();
    await editor.getByLabel('Nombre del día 1').fill('Tren inferior');
    const firstBlock = editor.getByRole('region', { name: 'Bloque A' });
    await firstBlock.getByLabel('Valor').fill('12');
    await firstBlock.getByRole('button', { name: 'Aumentar series del bloque A' }).click();
    await editor.getByRole('button', { name: '+ Agregar bloque', exact: true }).click();
    const newBlock = editor.getByRole('region', { name: 'Bloque B' });
    await newBlock.getByRole('button', { name: 'Buscar ejercicios para el bloque B' }).click();
    await newBlock.getByRole('button', { name: /^Agregar Press sintético/ }).click();
    await newBlock.getByLabel('Valor').fill('8');
    await capture(teacher, 'active-exercises-editor');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(teacher.getByText('Ejercicios actualizados correctamente. Los pesos registrados se conservaron.')).toBeVisible();
    await expect(teacher.getByText('Comienza el 01/12/2099')).toBeVisible();
    await teacher.getByRole('button', { name: 'Editar rutina', exact: true }).click();
    await expect(teacher.getByRole('region', { name: 'Editar rutina' }).getByRole('region', { name: 'Bloque B' }).getByLabel('Valor')).toHaveValue('8');
    await teacher.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await teacher.evaluate(() => { window.print = () => {}; });
    await teacher.getByRole('button', { name: 'Imprimir / PDF', exact: true }).first().click();
    const printed = teacher.locator('#athleta-routine-print-root');
    await expect(printed).toContainText('Tren inferior');
    await expect(printed).toContainText('Bloque B — 4 series');
    await teacher.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Rutina 1 · Período vigente' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bloque B — 4 series' })).toBeVisible();
    await expect(cards.first()).toContainText('12 rep.');
    await cards.first().click();
    await expect(page.getByRole('textbox').first()).toHaveValue('40');
    await cards.last().click();
    await expect(page.getByRole('textbox').nth(4)).toHaveValue('');
    await page.getByRole('textbox').nth(4).fill('25');
    await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click();
    await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    await teacher.getByRole('button', { name: 'Ver pesos', exact: true }).first().click();
    await expect(teacher.getByText('Ejercicios retirados')).toBeVisible();
    await expect(teacher.getByText('60 kg', { exact: true })).toBeVisible();
    await capture(teacher, 'retired-exercise-history');
  } finally { await staff.close(); cleanup(f); }
});

test('a professor enrolls a private online student and the student saves Portal weights', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const f = fixture('online');
  const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const teacher = await staff.newPage();
    await teacher.goto('/login');
    await teacher.getByLabel('Email').fill(f.email);
    await teacher.getByLabel('Contraseña', { exact: true }).fill('Synthetic-test-password1!');
    await teacher.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(teacher).toHaveURL('/');
    await teacher.goto('/students');
    await teacher.getByRole('button', { name: 'Nuevo alumno' }).click();
    await teacher.getByRole('button', { name: 'Online', exact: true }).click();
    const form = teacher.getByRole('dialog', { name: 'Nuevo alumno online' });
    await expect(form.getByLabel('Plan')).toHaveCount(0);
    await expect(form.getByLabel('Profesor responsable')).toHaveCount(0);
    await form.getByLabel('Nombre', { exact: true }).fill('Alumno Particular');
    await form.getByLabel('Apellido').fill('TrainingRecordE2E');
    await form.getByLabel('DNI', { exact: true }).fill(f.dni);
    await form.getByLabel('Teléfono', { exact: true }).fill('3515550000');
    await form.getByLabel('Fecha de nacimiento').fill('1990-01-01');
    const enrollment = teacher.waitForResponse(response => response.url().endsWith('/sala/online-students') && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Guardar alumno online' }).click();
    const enrolled = await enrollment;
    expect(enrolled.status()).toBe(201);
    f.personId = (await enrolled.json()).data.personId as string;
    const pin = await teacher.getByLabel('PIN temporal', { exact: true }).innerText();
    await teacher.getByRole('button', { name: 'Entendido' }).click();
    await teacher.getByLabel('Modalidad').selectOption('online');
    await teacher.getByRole('button', { name: 'Mis alumnos' }).click();
    const row = teacher.getByRole('row').filter({ hasText: f.dni });
    await expect(row.getByText('Online', { exact: true })).toBeVisible();
    await expect(row.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', `/sala/people/${f.personId}?modality=online`);
    await expect(row.getByRole('link', { name: /renovación|pagos/i })).toHaveCount(0);
    await capture(teacher, 'private-online-students');
    await row.getByRole('link', { name: 'Ver ficha' }).click();
    const tabs = teacher.getByRole('navigation', { name: 'Secciones del alumno en Sala' });
    await expect(tabs.getByRole('link', { name: 'Turnos' })).toHaveCount(0);
    await expect(tabs.getByRole('link', { name: 'Pagos' })).toHaveCount(0);
    await tabs.getByRole('link', { name: 'Rutina' }).click();
    await teacher.getByRole('button', { name: 'Crear desde cero' }).click();
    await teacher.getByLabel('Nombre del día 1').fill('Fuerza');
    await teacher.getByRole('button', { name: 'Buscar ejercicios para el bloque A' }).click();
    await teacher.getByLabel('Buscar ejercicio').fill(f.exerciseName);
    await teacher.getByRole('button', { name: `Agregar ${f.exerciseName}`, exact: true }).click();
    await teacher.getByLabel('Valor', { exact: true }).fill('10');
    await teacher.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(teacher.getByText('Rutina asignada correctamente.')).toBeVisible();
    await tabs.getByRole('link', { name: 'Declaración de salud' }).click();
    await teacher.getByRole('button', { name: 'Registrar declaración presentada en papel' }).click();
    await teacher.getByRole('checkbox', { name: /firmada en papel/ }).check();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await teacher.getByLabel('Fecha de firma').fill(today);
    await teacher.getByRole('button', { name: 'Confirmar registro' }).click();
    await expect(teacher.getByText('Vigente', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/portal/login');
    await page.getByLabel('DNI', { exact: true }).fill(f.dni);
    await page.getByLabel('PIN', { exact: true }).fill(pin);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.getByLabel('PIN actual', { exact: true }).fill(pin);
    await page.getByLabel('Nuevo PIN', { exact: true }).fill(pin === '4321' ? '1234' : '4321');
    await page.getByRole('button', { name: 'Guardar PIN' }).click();
    await expect(page.getByText('Modalidad Online')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mis turnos fijos' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Vigencia de Sala' })).toHaveCount(0);
    await page.screenshot({ path: '/tmp/athleta-online-portal-390.png', fullPage: true });
    await page.getByRole('link', { name: 'Registrar entrenamiento' }).click();
    const exercise = page.locator('button[aria-expanded][aria-controls]').first();
    await exercise.click();
    await page.getByLabel(/Semana 1/).first().fill('42');
    await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click();
    await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    await page.reload();
    await exercise.click();
    await expect(page.getByLabel(/Semana 1/).first()).toHaveValue('42');

    await page.goto('/portal/sala/reservas');
    await expect(page.getByText('La modalidad Online no utiliza turnos presenciales.')).toBeVisible();
    await page.goto('/portal/sala/reservar');
    await expect(page.getByText('La modalidad Online no utiliza turnos presenciales.')).toBeVisible();
    await expect(page.getByText('Cuota sin vigencia')).toHaveCount(0);

    await tabs.getByRole('link', { name: 'Rutina' }).click();
    await teacher.getByRole('button', { name: 'Ver pesos' }).click();
    await expect(teacher.getByText('42 kg', { exact: true })).toBeVisible();
  } finally {
    await staff.close();
    cleanup(f);
  }
});

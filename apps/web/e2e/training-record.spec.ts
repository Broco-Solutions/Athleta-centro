import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

type Fixture = { personId: string; professorId: string; planId: string; exerciseId: string; dni: string; email: string };
function fixture(history = false): Fixture {
  return JSON.parse(execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts', ...(history ? ['history'] : [])], { cwd: '../..', encoding: 'utf8' }).trim()) as Fixture;
}
function cleanup(f: Fixture) {
  execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts', 'cleanup', f.personId, f.professorId, f.planId, f.exerciseId], { cwd: '../..', stdio: 'pipe' });
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
    await cards.first().click(); await expect(page.getByRole('textbox')).toHaveCount(6);
    await capture(page, 'six-empty');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox').nth(1).fill('42,5'); await page.getByRole('textbox').nth(5).fill('0');
    await cards.last().click(); await page.getByRole('textbox').nth(6).fill('60');
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
      await teacher.getByRole('button', { name: 'Editar rutina', exact: true }).click(); await teacher.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(teacher.getByText('Rutina asignada correctamente.')).toBeVisible();
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
  test.setTimeout(180000); const f = fixture(true);
  try {
    await login(page, f);
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    const periods = page.getByRole('region', { name: 'Períodos de rutina' }); await expect(periods.getByRole('button')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Versión 2', exact: true })).toBeVisible();
    await capture(page, 'two-periods-latest');
    const cards = page.locator('button[aria-expanded][aria-controls]'); await cards.first().click(); await expect(page.getByRole('textbox')).toHaveCount(6); await page.getByRole('textbox').nth(3).fill('35'); await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible();
    await periods.getByRole('button', { name: /Rutina 1$/ }).click();
    const days = page.getByRole('navigation', { name: 'Días de la rutina' }); await expect(days.getByRole('button')).toHaveCount(2); await expect(days).not.toContainText('Versión 2');
    await cards.first().click(); await expect(page.getByRole('textbox')).toHaveCount(6); await expect(page.getByRole('textbox').nth(3)).toHaveValue('');
    await page.getByRole('textbox').nth(3).fill('25'); await page.getByRole('button', { name: 'Guardar pesos', exact: true }).click(); await expect(page.getByText('Pesos guardados correctamente.')).toBeVisible(); await capture(page, 'two-periods-historical-manual');
    await periods.getByRole('button', { name: /Rutina 2$/ }).click(); await cards.first().click(); await expect(page.getByRole('textbox').nth(3)).toHaveValue('35');
    for (const [today, heading] of [['2026-10-03', 'Fuerza'], ['2026-10-16', 'Versión 2']]) {
      await page.route('**/api/portal/sala/training-context*', async route => { const response = await route.fetch(); const body = await response.json(); body.data.today = today; await route.fulfill({ response, json: body }); });
      await page.reload(); await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible(); await capture(page, `automatic-${today}`); await page.unroute('**/api/portal/sala/training-context*');
    }
  } finally { cleanup(f); }
});

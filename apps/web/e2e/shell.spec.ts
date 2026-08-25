import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

function fixture(kind: 'normal' | 'temporary' | 'inactive' | 'people' | 'team'): void { execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/e2e-fixture.ts', kind], { cwd: '../..', stdio: 'inherit' }); }
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

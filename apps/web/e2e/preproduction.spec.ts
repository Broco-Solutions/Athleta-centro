import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test('keeps the Portal cookie across browser contexts and logs out immediately', async ({ page, browser }) => {
  execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/e2e-fixture.ts', 'portal-reset'], { cwd: '../..', stdio: 'pipe' });
  await page.goto('/portal/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  const footer = page.getByRole('link', { name: 'Desarrollado por Broco Solutions' });
  await expect(footer).toHaveAttribute('href', 'https://www.brocosolutions.com');
  await expect(footer).toHaveAttribute('target', '_blank');
  await page.getByLabel('DNI', { exact: true }).fill('40999444');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  const cookie = (await page.context().cookies()).find(item => item.name === 'athleta_portal_session');
  expect(cookie).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe('Lax');
  expect(cookie!.path).toBe('/');
  expect(Math.abs(cookie!.expires - Date.now() / 1000 - 2592000)).toBeLessThan(60);
  const storageState = await page.context().storageState();
  await page.context().close();
  const resumedContext = await browser.newContext({ storageState, baseURL: 'http://localhost:3000' });
  try {
    const resumedPage = await resumedContext.newPage();
    await resumedPage.goto('/portal/profile');
    await expect(resumedPage.getByRole('heading', { name: 'Mis datos', exact: true })).toBeVisible();
    await expect(resumedPage.getByText('Portal ResetE2E', { exact: true })).toBeVisible();
    await expect(resumedPage.getByRole('link', { name: 'Desarrollado por Broco Solutions' })).toBeVisible();
    await resumedPage.getByRole('banner').getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(resumedPage).toHaveURL(/\/portal\/login$/);
    expect((await resumedContext.cookies()).some(item => item.name === 'athleta_portal_session')).toBe(false);
    expect((await resumedPage.request.get('/api/portal/auth/session')).status()).toBe(401);
  } finally {
    await resumedContext.close();
  }
});

test('keeps the internal cookie across browser contexts and revokes it on logout', async ({ page, browser }) => {
  execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/e2e-fixture.ts', 'normal'], { cwd: '../..', stdio: 'pipe' });
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e.normal@athleta.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('ValidPass1!');
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page.getByRole('heading', { name: 'Hola, E2E', exact: true })).toBeVisible();
  const cookie = (await page.context().cookies()).find(item => item.name === 'athleta_session');
  expect(cookie).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe('Lax');
  expect(cookie!.path).toBe('/');
  expect(Math.abs(cookie!.expires - Date.now() / 1000 - 30 * 24 * 60 * 60)).toBeLessThan(60);
  const storageState = await page.context().storageState();
  await page.context().close();
  const resumedContext = await browser.newContext({ storageState, baseURL: 'http://localhost:3000' });
  try {
    const resumed = await resumedContext.newPage();
    await resumed.goto('/');
    await expect(resumed.getByRole('heading', { name: 'Hola, E2E', exact: true })).toBeVisible();
    await resumed.getByRole('button', { name: /Cerrar sesión/ }).click();
    await expect(resumed).toHaveURL(/\/login$/);
    expect((await resumedContext.cookies()).some(item => item.name === 'athleta_session')).toBe(false);
    expect((await resumed.request.get('/api/auth/session')).status()).toBe(401);
    expect((await resumed.request.get('/api/auth/session', { headers: { cookie: `athleta_session=${cookie!.value}` } })).status()).toBe(401);
    await resumed.goto('/');
    await expect(resumed).toHaveURL(/\/login$/);
  } finally { await resumedContext.close(); }
});

for (const width of [390, 768, 1440]) {
  test(`Portal login stays vertical without overlaps at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/portal/login');
    await expect(page.getByText('DESBLOQUEÁ TU', { exact: true })).toBeVisible();
    await expect(page.getByText('POTENCIAL.', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Athleta' })).toBeVisible();
    const brand = await page.locator('main > section').first().boundingBox();
    const form = await page.locator('form').boundingBox();
    const footer = await page.locator('footer').boundingBox();
    expect(form!.y).toBeGreaterThanOrEqual(brand!.y + brand!.height);
    expect(footer!.y).toBeGreaterThanOrEqual(form!.y + form!.height);
    expect(form!.width).toBeLessThanOrEqual(448);
    expect(Math.abs(form!.x + form!.width / 2 - width / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`portal-${width}.png`), fullPage: true });
    await page.setViewportSize({ width, height: 400 });
    const shortForm = await page.locator('form').boundingBox();
    const shortFooter = await page.locator('footer').boundingBox();
    expect(shortFooter!.y).toBeGreaterThanOrEqual(shortForm!.y + shortForm!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('counts three students without routine out of fifty', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { user: { id: 'prof', firstName: 'Profesor', lastName: 'Sintético' }, roles: ['PROFESSOR'], permissions: ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ'], csrfToken: 'synthetic', mustChangePassword: false } } }));
  await page.route('**/api/sala/students', route => route.fulfill({ json: { data: Array.from({ length: 50 }, (_, i) => ({ id: `synthetic-${i}`, firstName: 'Alumno', lastName: `Sintético ${i}`, dni: `880000${i}`, plan: { id: 'plan', name: 'Base' }, professor: { id: 'prof', firstName: 'Profesor', lastName: 'Sintético' }, routineStatus: i < 3 ? 'MISSING' : 'ACTIVE', hasValidAccess: true, validUntil: '2026-12-31' })) } }));
  await page.goto('/students');
  await expect(page.getByText('50 alumnos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sin rutina', exact: true }).click();
  await expect(page.getByText('3 alumnos', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver ficha', exact: true })).toHaveCount(3);
});

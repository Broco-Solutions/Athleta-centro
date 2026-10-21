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

import { expect, test } from '@playwright/test';

test('reviews the internal password screen at responsive sizes with a presentation session', async ({ page, context }) => {
  let pending: (() => Promise<void>) | undefined;
  let saves = 0; let invalid = false;
  const session = { user: { id: 'synthetic', firstName: 'Test', lastName: 'Fixture', email: 'synthetic@athleta.test' }, roles: ['GENERAL_ADMIN'], permissions: [], mustChangePassword: true, csrfToken: 'synthetic-csrf' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session' && route.request().method() === 'GET') {
      await route.fulfill({ status: invalid ? 401 : 200, json: invalid ? { code: 'UNAUTHENTICATED' } : { data: session } }); return;
    }
    if (path === '/api/auth/change-password' && route.request().method() === 'POST') {
      saves++;
      expect(route.request().postDataJSON()).toEqual({ currentPassword: ' Fictional Current 1! ', nextPassword: ' Fictional New 2! ' });
      expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
      pending = () => route.fulfill({ json: { data: { ...session, mustChangePassword: false } } }); return;
    }
    await route.abort();
  });
  for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1366, 768], [390, 500]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('/change-password');
    await expect(page.getByRole('heading', { name: 'Actualizá tu contraseña' })).toBeVisible();
    await expect(page.getByLabel('Contraseña actual', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveAttribute('type', 'password');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`change-password-${width}-${height}.png`), fullPage: true });
    expect((await page.getByLabel('Contraseña actual', { exact: true }).boundingBox())!.height).toBe(48);
    const save = page.getByRole('button', { name: 'Guardar contraseña' });
    await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
  }
  const current = page.getByLabel('Contraseña actual', { exact: true });
  const next = page.getByLabel('Nueva contraseña', { exact: true });
  await current.fill(' Fictional Current 1! '); await next.fill(' Fictional New 2! ');
  await page.getByRole('button', { name: 'Mostrar contraseña actual' }).click();
  await expect(next).toHaveAttribute('type', 'password');
  await expect(current).toHaveValue(' Fictional Current 1! ');
  await page.getByRole('button', { name: 'Mostrar nueva contraseña' }).focus(); await page.keyboard.press('Enter');
  await expect(next).toHaveAttribute('type', 'text'); expect(saves).toBe(0);
  await current.focus(); await page.keyboard.press('ControlOrMeta+A');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText(' Fictional Current 1! ')); await page.keyboard.press('ControlOrMeta+V');
  await expect(current).toHaveValue(' Fictional Current 1! ');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(saves).toBe(1); expect(new URL(page.url()).pathname).toBe('/change-password');
  session.mustChangePassword = false;
  await pending!(); await page.waitForURL(url => url.pathname === '/');
  invalid = true; await page.goto('/change-password'); await page.waitForURL(url => url.pathname === '/login');
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });
function fixture(kind: string): void {
  execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/e2e-fixture.ts', kind], { cwd: '../..', stdio: 'pipe' });
}
async function login(page: Page, kind: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`e2e.${kind}@athleta.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill('ValidPass1!');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page).toHaveURL('/');
}

for (const mode of ['expanded', 'compact', 'mobile'] as const) {
  test(`revokes the real internal session from ${mode} navigation`, async ({ page }) => {
    fixture('normal');
    if (mode === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'normal');
    const cookie = (await page.context().cookies()).find(value => value.name === 'athleta_session')!;
    if (mode === 'compact') await page.getByRole('button', { name: 'Ocultar menú lateral' }).click();
    if (mode === 'mobile') {
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByRole('dialog', { name: 'Menú principal' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ocultar menú lateral' })).toBeEnabled();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Abrir menú' }).click();
    }
    const control = mode === 'mobile' ? page.getByRole('dialog', { name: 'Menú principal' }).getByRole('button', { name: 'Cerrar sesión' }) : page.getByRole('button', { name: 'Cerrar sesión' });
    const response = page.waitForResponse(value => value.url().endsWith('/api/auth/logout'));
    await control.click();
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL('/login');
    expect((await page.context().cookies()).some(value => value.name === 'athleta_session')).toBe(false);
    expect((await page.request.get('/api/auth/session', { headers: { cookie: `athleta_session=${cookie.value}` } })).status()).toBe(401);
    await page.goto('/'); await expect(page).toHaveURL('/login');
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toHaveCount(0);
  });
}

test('resets the PIN from the student, revokes the old Portal session and completes the mandatory change', async ({ page, browser }) => {
  fixture('portal-reset');
  const previous = await browser.newContext({ baseURL: 'http://localhost:3000' });
  try {
    expect((await previous.request.post('/api/portal/auth/login', { data: { dni: '40999444', pin: '1234' } })).status()).toBe(200);
    await login(page, 'portal-reset');
    const people = await (await page.request.get('/api/people?search=40999444')).json();
    const id = people.data[0].id as string;
    await page.goto(`/sala/people/${id}`);
    await page.getByRole('button', { name: 'Restablecer PIN del Portal' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Restablecer PIN del Portal' });
    await confirmation.getByRole('button', { name: 'Confirmar restablecimiento' }).click();
    const notice = page.getByRole('dialog', { name: 'Nuevo PIN temporal' });
    const pin = (await notice.getByLabel('PIN temporal').textContent())!.trim();
    // Keep the generated credential out of assertion diagnostics and artifacts.
    expect(/^\d{4}$/.test(pin)).toBe(true);
    expect((await previous.request.get('/api/portal/auth/session')).status()).toBe(401);
    expect((await previous.request.post('/api/portal/auth/login', { data: { dni: '40999444', pin: '1234' } })).status()).toBe(401);
    expect((await page.request.get('/api/auth/session')).status()).toBe(200);
    await notice.getByRole('button', { name: 'Entendido' }).click();
    await expect(notice).toHaveCount(0);
    await page.goto('/portal/login');
    await page.getByLabel('DNI', { exact: true }).fill('40999444');
    await page.getByLabel('PIN', { exact: true }).fill(pin);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL('/portal/change-pin');
    const nextPin = pin === '9876' ? '6789' : '9876';
    await page.getByLabel('PIN actual').fill(pin);
    await page.getByLabel('Nuevo PIN', { exact: true }).fill(nextPin);
    await page.getByRole('button', { name: 'Guardar PIN' }).click();
    await expect(page).toHaveURL('/portal');
    expect((await previous.request.post('/api/portal/auth/login', { data: { dni: '40999444', pin } })).status()).toBe(401);
    // Portal logout must preserve the independent internal session cookie.
    await page.getByRole('banner').getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL('/portal/login');
    expect((await page.request.get('/api/portal/auth/session')).status()).toBe(401);
    expect((await page.request.get('/api/auth/session')).status()).toBe(200);
  } finally { await previous.close(); }
});

test('resets from the general Person dialog and closes the one-time notice', async ({ page }) => {
  fixture('portal-reset'); await login(page, 'portal-reset');
  await page.goto('/people'); await page.getByLabel('Buscar Personas').fill('40999444');
  await page.getByText('ResetE2E, Portal', { exact: true }).click();
  await page.getByRole('button', { name: 'Restablecer PIN del Portal' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Restablecer PIN del Portal' });
  await confirmation.getByRole('button', { name: 'Generar nuevo PIN' }).click();
  const notice = page.getByRole('dialog', { name: 'Nuevo PIN temporal' });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByLabel('PIN temporal')).toHaveCount(0);
});

test('keeps compact navigation during route changes and lets an incorrect DNI retry immediately', async ({ page }) => {
  fixture('occurrence'); await login(page, 'occurrence');
  await page.goto('/sala/fichaje');
  await page.getByRole('button', { name: 'Ocultar menú lateral' }).click();
  await page.getByRole('link', { name: 'Sala: Alumnos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mostrar menú lateral' })).toBeVisible();
  await page.getByRole('link', { name: 'Ingreso', exact: true }).click();
  const input = page.getByLabel('DNI del alumno');
  await input.fill('00000000');
  const start = Date.now();
  const response = page.waitForResponse(value => value.url().endsWith('/api/sala/check-in'));
  await page.getByRole('button', { name: 'Registrar ingreso' }).click();
  expect((await response).status()).toBe(200);
  const requestToResponseMs = Date.now() - start;
  test.info().annotations.push({ type: 'request-to-response-ms', description: String(requestToResponseMs) });
  await test.info().attach('check-in-timing', { body: JSON.stringify({ requestToResponseMs }), contentType: 'application/json' });
  await expect(input).toBeEditable();
  await input.fill('00000001');
  await page.waitForTimeout(3_100);
  await expect(input).toHaveValue('00000001');
});

test('loads both login pages and the Athleta favicon at narrow, tablet and desktop widths', async ({ page }) => {
  for (const [width, height] of [[360, 400], [390, 844], [768, 1024], [1280, 600]]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const path of ['/login', '/portal/login']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
      await expect(page.getByRole('img', { name: 'Athleta', exact: true })).toBeVisible();
      const icon = page.locator('link[rel="icon"]');
      await expect(icon).toHaveCount(1);
      expect((await page.request.get((await icon.getAttribute('href'))!)).status()).toBe(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const submit = page.getByRole('button', { name: 'Ingresar', exact: true });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`${path.replaceAll('/', '-')}-${width}.png`), fullPage: true });
    }
  }
});

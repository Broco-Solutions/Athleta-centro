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
    await page.getByLabel('PIN actual', { exact: true }).fill(pin);
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
  await page.goto('/sala');
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

test('keeps a foreign localhost spelling and an invalid CSRF token rejected through the web proxy', async ({ page }) => {
  fixture('normal'); await login(page, 'normal');
  const { data } = await (await page.request.get('/api/auth/session')).json();
  const rejected = await page.request.post('/api/auth/logout', { headers: { origin: 'http://127.0.0.1:3000', 'x-csrf-token': data.csrfToken } });
  expect(rejected.status()).toBe(401);
  expect((await rejected.json()).code).toBe('CSRF_INVALID');
  expect((await page.request.post('/api/auth/logout', { headers: { origin: 'http://localhost:3000', 'x-csrf-token': 'incorrect' } })).status()).toBe(401);
  expect((await page.request.get('/api/auth/session')).status()).toBe(200);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/login');
});

test('finishes logout after the internal session expires without reviving protected access', async ({ page }) => {
  fixture('normal'); await login(page, 'normal');
  fixture('expire-internal');
  const response = page.waitForResponse(value => value.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL('/login');
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
  expect((await page.context().cookies()).some(value => value.name === 'athleta_session')).toBe(false);
});

test('internal logout preserves a separate Portal session', async ({ page }) => {
  fixture('portal-reset');
  expect((await page.request.post('/api/portal/auth/login', { data: { dni: '40999444', pin: '1234' } })).status()).toBe(200);
  await login(page, 'portal-reset');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/login');
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
  expect((await page.request.get('/api/portal/auth/session')).status()).toBe(200);
});

test('keeps navigation destinations stable, selects finance views once and redirects old Ingreso bookmarks', async ({ page }) => {
  fixture('team'); await login(page, 'team');
  await page.goto('/sala/fichaje?source=bookmark');
  await expect(page).toHaveURL('/sala/ingreso?source=bookmark');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  const destinations = await nav.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(await nav.locator('[aria-expanded]').count()).toBe(0);
  for (const [label, href] of [['Ingresos', '/finance?view=income'], ['Gastos', '/finance?view=expenses'], ['Resumen', '/finance']] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(href);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    expect(await nav.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(destinations);
  }
  await page.getByRole('button', { name: 'Ocultar menú lateral' }).click();
  await nav.getByRole('link', { name: 'Equipo', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toHaveText('Equipo');
  await nav.getByRole('link', { name: 'Equipo', exact: true }).click();
  const create = page.getByRole('button', { name: 'Nuevo integrante' });
  await expect(create).toBeVisible();
  expect(await create.evaluate(element => ({ gap: getComputedStyle(element).gap, shrink: getComputedStyle(element.querySelector('svg')!).flexShrink }))).toEqual({ gap: '8px', shrink: '0' });
});

test('opens reception without navigation, logs out from the workspace and protects reception on return', async ({ page }) => {
  fixture('occurrence'); await login(page, 'occurrence');
  await page.goto('/sala/ingreso');
  await expect(page.getByLabel('DNI del alumno')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toHaveCount(0);
  await page.goto('/');
  const response = page.waitForResponse(value => value.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL('/login');
  await page.goBack();
  await expect(page).toHaveURL('/login');
  await page.goto('/sala/ingreso');
  await expect(page).toHaveURL('/login');
  await expect(page.getByLabel('DNI del alumno')).toHaveCount(0);
});

test('closes the current session when another tab has replaced its cookie', async ({ page }) => {
  fixture('normal'); await login(page, 'normal');
  const initial = await (await page.request.get('/api/auth/session')).json();
  // Browser contexts share cookies across tabs, but each tab has its own query cache.
  const replacement = await page.request.post('/api/auth/login', { data: { email: 'e2e.normal@athleta.test', password: 'ValidPass1!' } });
  expect(replacement.status()).toBe(200);
  const current = await page.request.get('/api/auth/session');
  expect(current.status()).toBe(200);
  expect((await current.json()).data.csrfToken !== initial.data.csrfToken).toBe(true);
  const cookie = (await page.context().cookies()).find(value => value.name === 'athleta_session')!;
  const attempts: number[] = [];
  page.on('response', response => { if (response.url().endsWith('/api/auth/logout')) attempts.push(response.status()); });
  const firstAttempt = page.waitForResponse(response => response.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  const rejected = await firstAttempt;
  expect(rejected.status()).toBe(401);
  expect((await rejected.json()).code).toBe('CSRF_INVALID');
  expect(rejected.request().headers()['x-csrf-token'] === initial.data.csrfToken).toBe(true);
  await expect(page).toHaveURL('/login');
  expect(attempts).toEqual([401, 200]);
  expect((await page.context().cookies()).some(value => value.name === 'athleta_session')).toBe(false);
  expect((await page.request.get('/api/auth/session', { headers: { cookie: `athleta_session=${cookie.value}` } })).status()).toBe(401);
});

test('protects both canonical and legacy Ingreso entries without a session', async ({ page }) => {
  for (const path of ['/sala/ingreso', '/sala/fichaje?source=bookmark']) {
    await page.goto(path);
    await expect(page).toHaveURL('/login');
    await expect(page.getByLabel('DNI del alumno')).toHaveCount(0);
  }
});

test('confirms a Portal cancellation on mobile and persists only the selected date', async ({ page }) => {
  fixture('portal-reservations');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portal/login');
  await page.getByLabel('DNI', { exact: true }).fill('40999445');
  const pin = page.getByLabel('PIN', { exact: true });
  await expect(pin).toHaveAttribute('type', 'password');
  await expect(page.locator('.portal-pin-cells > span')).toHaveCount(4);
  await pin.fill('1234');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL('/portal');
  await expect(page.getByRole('navigation', { name: 'Navegación del Portal' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver próximos turnos' }).click();
  await expect(page).toHaveURL('/portal/sala/reservas');
  const before = (await (await page.request.get('/api/portal/sala')).json()).data;
  const dates = before.fixedOccurrences.filter((item: { status: string }) => item.status === 'RESERVED');
  expect(dates.length).toBeGreaterThanOrEqual(2);
  const selected = dates[0];
  const next = dates[1];
  const displayDate = selected.date.split('-').reverse().join('/');
  const row = page.getByRole('listitem').filter({ hasText: displayDate });
  const trigger = row.getByRole('button', { name: 'Cancelar esta fecha' });
  const attempts: number[] = [];
  page.on('response', response => { if (response.request().method() === 'POST' && response.url().endsWith('/cancel')) attempts.push(response.status()); });
  const dialog = page.getByRole('dialog', { name: 'Cancelar esta fecha' });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`¿Cancelar la reserva del ${displayDate} a las 10:00?`)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Volver' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(attempts).toEqual([]);
  await trigger.click();
  await dialog.getByRole('button', { name: 'Volver' }).click();
  await expect(dialog).toHaveCount(0);
  expect(attempts).toEqual([]);
  await trigger.click();
  const response = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith(`/fixed-bookings/${selected.fixedSalaBookingId}/occurrences/${selected.date}/cancel`));
  await dialog.getByRole('button', { name: 'Confirmar cancelación' }).click();
  expect((await response).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Reserva cancelada correctamente.')).toBeVisible();
  expect(attempts).toEqual([200]);
  const after = (await (await page.request.get('/api/portal/sala')).json()).data;
  expect(after.fixed).toEqual(before.fixed);
  expect(after.fixedOccurrences).toContainEqual(next);
  expect(after.fixedOccurrences).toContainEqual(expect.objectContaining({ fixedSalaBookingId: selected.fixedSalaBookingId, date: selected.date, status: 'CANCELLED' }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis próximos turnos' })).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('registers a real reception attendance with Enter and keeps it after reloading', async ({ page }) => {
  fixture('reception-paid');
  await login(page, 'occurrence');
  await page.goto('/sala/ingreso');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const input = page.getByLabel('DNI del alumno');
  await input.fill('40.999.661');
  await expect(input).toHaveValue('40999661');
  const response = page.waitForResponse(value => value.url().endsWith('/api/sala/check-in'));
  await input.press('Enter');
  expect((await response).status()).toBe(200);
  expect((await (await response).json()).data.status).toBe('REGISTERED');
  await expect(page.getByRole('heading', { name: 'Ingreso registrado', exact: true })).toBeVisible();
  await expect(page.getByText(/Fija OccurrenceE2E/)).toBeVisible();
  await page.reload();
  await input.fill('40999661');
  const repeated = page.waitForResponse(value => value.url().endsWith('/api/sala/check-in'));
  await input.press('Enter');
  expect((await (await repeated).json()).data.status).toBe('ALREADY_REGISTERED');
  await expect(page.getByRole('heading', { name: 'Ingreso ya registrado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar otro alumno' }).click();
  await expect(input).toHaveValue('');
});

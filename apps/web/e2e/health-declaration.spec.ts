import { expect, test } from '@playwright/test';
const person = { firstName: 'Alumno', lastName: 'Sintético', dni: '00000001', birthDate: '1990-01-01', phone: '0000000000' };
test('unavailable health document: responsive five-step navigation keeps answers and prevents confirmation', async ({ page }) => {
  await page.route('**/api/portal/auth/session', route => route.fulfill({ json: { data: { person, csrfToken: 'synthetic-csrf', mustChangePin: false, healthDeclaration: { status: 'MISSING', documentAvailable: false, required: true, latest: null } } } }));
  await page.route('**/api/portal/me', route => route.fulfill({ json: { data: person } }));
  await page.route('**/api/portal/health-declaration/document', route => route.fulfill({ json: { data: null } }));
  await page.goto('/portal/declaracion-salud');
  await page.getByLabel('Contacto de emergencia *').fill('Contacto sintético');
  await page.getByLabel('Teléfono de emergencia *').fill('0000000000');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('heading', { name: 'Datos personales' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/athleta-health-${width}.png`, fullPage: true });
  }
  for (let step = 2; step <= 5; step++) { await page.getByRole('button', { name: 'Continuar' }).click(); await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(step)); }
  await expect(page.getByRole('button', { name: 'Confirmar y finalizar' })).toBeDisabled();
  await page.getByRole('button', { name: 'Editar datos personales' }).click();
  await expect(page.getByLabel('Contacto de emergencia *')).toHaveValue('Contacto sintético');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test('synthetic document: completes with optional authorizations rejected and enables the portal', async ({ page }) => {
  const keys = ['physicalActivity', 'truthfulness', 'emergenciesAndPrivacy', 'healthDataProcessing', 'kinesiology', 'manualEvaluation', 'therapeuticExercise', 'manualTherapy', 'physicalAgents', 'dryNeedling', 'taping', 'shareWithDoctors', 'shareWithClubs', 'clinicalImage', 'institutionalImage'];
  const doc = { version: 'SYNTHETIC-TEST-ONLY', questions: [{ id: 'testQuestion', category: 'Categoría sintética', text: 'Pregunta sintética' }], consents: keys.map(key => ({ key, text: `Consentimiento sintético ${key}` })), guardianConfirmation: 'Confirmación sintética tutor', finalConfirmation: 'Confirmación sintética final' };
  let saved = false;
  await page.route('**/api/portal/auth/session', route => route.fulfill({ json: { data: { person, csrfToken: 'synthetic-csrf', mustChangePin: false, healthDeclaration: { status: saved ? 'CURRENT' : 'MISSING', documentAvailable: true, required: !saved, latest: null } } } }));
  await page.route('**/api/portal/me', route => route.fulfill({ json: { data: person } }));
  await page.route('**/api/portal/health-declaration/document', route => route.fulfill({ json: { data: doc } }));
  await page.route('**/api/portal/health-declarations/submit', async route => {
    const body = route.request().postDataJSON();
    expect(body.consents.clinicalImage).toBe(false); expect(body.consents.institutionalImage).toBe(false); expect(body.kinesiology).toEqual({}); expect(body.confirmed).toBe(true);
    expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
    saved = true; await route.fulfill({ status: 201, json: { data: { status: 'CURRENT', required: false, documentAvailable: true } } });
  });
  await page.goto('/portal/declaracion-salud');
  await page.getByLabel('Contacto de emergencia *').fill('Contacto sintético');
  await page.getByLabel('Teléfono de emergencia *').fill('0000000000');
  for (let step = 2; step <= 3; step++) { await page.getByRole('button', { name: 'Continuar' }).click(); await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(step)); }
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/athleta-health-medical-${width}.png`, fullPage: true });
  }
  for (const group of await page.getByRole('group').all()) await group.getByRole('radio', { name: 'Prefiero no informar', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  const groups = page.getByRole('group');
  for (let index = 0; index < await groups.count(); index++) { const group = groups.nth(index); await group.getByRole('radio', { name: index < 4 ? 'Sí' : 'No', exact: true }).check(); }
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Declaro haber leído y comprendido la información anterior y confirmo la veracidad de los datos proporcionados.').check();
  await page.getByRole('button', { name: 'Confirmar y finalizar' }).click();
  await expect(page.getByText('Tu declaración se guardó correctamente. Ya podés acceder al Portal.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
  expect(saved).toBe(true);
});

test('real DOCX and API: PIN change, mandatory declaration, portal access, staff consultation and persisted copy', async ({ page }) => {
  test.setTimeout(120000);
  const { execFileSync } = await import('node:child_process');
  const fixture = JSON.parse(execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/health-declaration-e2e-fixture.ts'], { cwd: '../..', encoding: 'utf8' })) as { personId: string; professorId: string; planId: string; dni: string; staffToken: string };
  try {
    await page.goto('/portal/login'); await page.getByLabel('DNI').fill(fixture.dni); await page.getByLabel('PIN', { exact: true }).fill('1111'); await page.getByRole('button', { name: /Ingresar/ }).click();
    await expect(page).toHaveURL('/portal/change-pin');
    await page.getByLabel('PIN actual').fill('1111'); await page.getByLabel('Nuevo PIN').fill('2222'); await page.getByRole('button', { name: 'Guardar PIN' }).click();
    await expect(page).toHaveURL('/portal/declaracion-salud');
    await page.getByLabel('Contacto de emergencia *').fill('Contacto sintético'); await page.getByLabel('Teléfono de emergencia *').fill('0000000000');
    for (let step = 2; step <= 3; step++) { await page.getByRole('button', { name: 'Continuar' }).click(); await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(step)); }
    for (const group of await page.getByRole('group').all()) await group.getByRole('radio', { name: 'Prefiero no informar', exact: true }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
    const groups = page.getByRole('group');
    for (let index = 0; index < await groups.count(); index++) await groups.nth(index).getByRole('radio', { name: index < 4 ? 'Sí' : 'No', exact: true }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText(/Los turnos se cancelan o reprograman con al menos 24 horas/)).toBeVisible();
    await page.getByLabel('Declaro haber leído y comprendido la información anterior y confirmo la veracidad de los datos proporcionados.').check(); await page.getByRole('button', { name: 'Confirmar y finalizar' }).click();
    await expect(page.getByText('Tu declaración se guardó correctamente. Ya podés acceder al Portal.')).toBeVisible();
    await page.getByRole('link', { name: 'Ir al inicio' }).click(); await expect(page).toHaveURL('/portal');
    expect((await page.request.get('/api/portal/sala')).status()).toBe(200);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click(); await expect(page).toHaveURL('/portal/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('DNI').fill(fixture.dni); await page.getByLabel('PIN', { exact: true }).fill('2222'); await page.getByRole('button', { name: /Ingresar/ }).click(); await expect(page).toHaveURL('/portal');
    await page.goto('/portal/declaracion-salud'); await page.getByRole('button', { name: /Consultar declaración del/ }).click(); await expect(page.getByRole('heading', { name: 'Mi declaración confirmada' })).toBeVisible(); await expect(page.getByText('Contacto sintético', { exact: true })).toBeVisible();
    await page.context().addCookies([{ name: 'athleta_session', value: fixture.staffToken, domain: 'localhost', path: '/' }]);
    await page.goto(`/sala/people/${fixture.personId}?tab=health`);
    await expect(page.getByRole('heading', { name: 'Declaración de salud', exact: true })).toBeVisible(); await page.getByRole('button', { name: /Consultar declaración del/ }).click(); await expect(page.getByText('Contacto sintético', { exact: true })).toBeVisible();
  } finally {
    execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/health-declaration-e2e-fixture.ts', 'cleanup', fixture.personId, fixture.professorId, fixture.planId], { cwd: '../..', stdio: 'pipe' });
  }
});

import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

// Capture rendered, synthetic UI for offline visual inspection after the isolated runner stops.
async function captureMarkup(page: Page, name: string) {
  const markup = await page.evaluate(async () => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, link, nextjs-portal').forEach(element => element.remove());
    const css = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join('\n');
    const style = document.createElement('style'); style.textContent = css; clone.querySelector('head')!.append(style);
    for (const img of clone.querySelectorAll('img')) {
      const source = await fetch(img.src).then(response => response.blob());
      img.removeAttribute('srcset');
      img.src = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(source); });
    }
    return '<!doctype html>' + clone.outerHTML;
  });
  writeFileSync(`/tmp/athleta-training-${name}.html`, markup);
}


test('student records and corrects weights; professor reads the saved history in the routine workspace', async ({ page, browser }) => {
  test.setTimeout(120000);
  const fixture = JSON.parse(execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts'], { cwd: '../..', encoding: 'utf8' }).trim()) as { personId: string; professorId: string; planId: string; exerciseId: string; dni: string; email: string };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/portal/login');
    await page.getByLabel('DNI', { exact: true }).fill(fixture.dni); await page.getByLabel('PIN', { exact: true }).fill('1111');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Registrar entrenamiento', exact: true })).toBeVisible();
    await expect(page.locator('#rutina').getByRole('link')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Registrar entrenamiento', exact: true })).toHaveAttribute('href', '/portal/sala/rutina');
    await page.getByRole('link', { name: 'Registrar entrenamiento', exact: true }).click();
    await expect(page.getByLabel('Fecha del entrenamiento')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Fuerza', exact: true })).toBeVisible();
    const days = page.getByRole('navigation', { name: 'Días de la rutina' });
    await expect(days.getByRole('button', { name: 'Fuerza', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await days.getByRole('button', { name: 'Movilidad', exact: true }).click();
    await expect(page.getByLabel(/Peso utilizado/)).toHaveCount(1);
    await days.getByRole('button', { name: 'Fuerza', exact: true }).click();
    const monthTitle = await page.getByRole('region', { name: 'Mes de entrenamientos' }).getByRole('heading').textContent();
    await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(page.getByText('Historial · Registro disponible')).toBeVisible();
    await page.getByRole('button', { name: 'Volver al mes actual' }).click();
    await expect(page.getByRole('region', { name: 'Mes de entrenamientos' }).getByRole('heading')).toHaveText(monthTitle!);
    const cards = page.locator('button[aria-expanded][aria-controls]');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute('aria-expanded', 'false');
    await expect(cards.last()).toHaveAttribute('aria-expanded', 'false');
    await cards.first().click();
    const weights = page.getByLabel(/Peso utilizado/); await expect(weights).toHaveCount(2);
    await expect(weights.first()).not.toBeFocused();
    const evolution = page.getByRole('region', { name: /Evolución semanal/ }).first();
    // Select the last week, including future references.
    await evolution.locator('button[aria-pressed]').last().click();
    await expect(weights.first()).toBeFocused();
    const selectedRow = evolution.locator('li[aria-current="date"]');
    await expect(selectedRow.getByLabel(/Peso utilizado/)).toBeVisible();
    await expect(selectedRow.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toHaveCount(1);
    await expect(page.getByLabel('¿Qué día entrenaste?')).toHaveCount(0);
    await expect(evolution.getByRole('button', { pressed: true })).toHaveCount(1);
    await expect(weights.first()).toHaveValue(''); await weights.first().fill('32,5');
    await cards.first().click();
    await cards.last().click();
    await weights.last().fill('60,5');
    await cards.first().click();
    await expect(weights.first()).toHaveValue('32,5');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(weights.first()).toHaveValue('32,5');
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/athleta-training-form-${width}.png`, fullPage: true });
      await expect(days).toBeInViewport();
      expect(await days.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
      const save = page.getByRole('button', { name: 'Guardar entrenamiento', exact: true });
      await save.scrollIntoViewIfNeeded();
      const saveBox = (await save.boundingBox())!;
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual((await days.boundingBox())!.y);
      await expect(days).toBeInViewport();
      await weights.first().scrollIntoViewIfNeeded();
      await expect(weights.first()).toBeInViewport();
      if (width === 1440) await captureMarkup(page, 'form');
    }
    // A reduced visual area keeps the focused field and day navigation reachable.
    await page.setViewportSize({ width: 390, height: 460 });
    await weights.first().focus();
    await weights.first().scrollIntoViewIfNeeded();
    await expect(weights.first()).toBeInViewport();
    const focusedBox = (await weights.first().boundingBox())!;
    expect(focusedBox.y + focusedBox.height).toBeLessThanOrEqual((await days.boundingBox())!.y);
    await expect(days).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
    await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await expect(weights.first()).toHaveValue('32,5');
    await expect(weights.last()).toHaveValue('60,5');
    await page.reload();
    await page.locator('button[aria-expanded][aria-controls]').first().click();
    await page.getByRole('region', { name: /Evolución semanal/ }).first().locator('button[aria-pressed]').last().click();
    await expect(weights.first()).toHaveValue('32,5');
    await weights.first().fill('34,5');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await page.locator('button[aria-expanded][aria-controls]').last().click();
    await expect(weights.last()).toHaveValue('60,5');
    await expect(page.getByRole('region', { name: /Evolución semanal/ }).first().getByText('34,5 kg', { exact: true })).toBeVisible();
    // Register and correct a previous month by selecting only its week.
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await page.locator('button[aria-expanded][aria-controls]').first().click();
    // The first available week is separate from today's week even at month boundaries.
    await page.getByRole('region', { name: /Evolución semanal/ }).first().locator('button[aria-pressed]').first().click();
    await expect(page.getByLabel(/Peso utilizado/).first()).toBeFocused();
    await page.getByLabel(/Peso utilizado/).first().fill('27,5');
    await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
    await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await expect(page.getByText('Historial · Registro disponible')).toBeVisible();
    await expect(page.getByLabel(/Peso utilizado/)).toHaveCount(2);
    await expect(page.getByRole('region', { name: /Evolución semanal/ }).first().getByText('27,5 kg', { exact: true })).toBeVisible();
    await page.getByRole('region', { name: /Evolución semanal/ }).first().locator('button[aria-pressed]').first().click();
    await page.getByLabel(/Peso utilizado/).first().fill('28,5');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await page.goto('/portal/sala/rutina');
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await page.locator('button[aria-expanded][aria-controls]').first().click();
    await expect(page.getByRole('region', { name: /Evolución semanal/ }).first().getByText('28,5 kg', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Volver al mes actual' }).click();
    await page.locator('button[aria-expanded][aria-controls]').first().click();
    await expect(page.getByRole('region', { name: /Evolución semanal/ }).first().getByText('34,5 kg', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Mis entrenamientos', exact: true }).click();
    await page.getByRole('button', { name: /Ver detalle del/ }).first().click();
    await page.getByRole('link', { name: 'Editar registro' }).click();
    await expect(page.getByLabel(/Peso utilizado/).first()).toHaveValue('34,5');
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await page.goto('/portal/sala/rutina');
    // Stress the day bar with many synthetic day labels while keeping the real session.
    await page.route('**/api/portal/sala/training-context*', async route => {
      const response = await route.fetch();
      const body = await response.json() as { data: { routine: { days: { id: string; position: number; name: string }[] } } };
      const day = body.data.routine.days[0]!;
      body.data.routine.days.push(...Array.from({ length: 12 }, (_, index) => ({ ...day, id: `synthetic-day-${index}`, position: index + 3, name: `Entrenamiento complementario ${index + 3}` })));
      await route.fulfill({ response, json: body });
    });
    await page.reload(); await page.setViewportSize({ width: 390, height: 844 });
    await expect(days.getByRole('button')).toHaveCount(14);
    expect(await days.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await days.getByRole('button').last().scrollIntoViewIfNeeded();
    await expect(days.getByRole('button').last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.unroute('**/api/portal/sala/training-context*');
    // The original registration route and selected-day links remain usable.
    const mobilityId = await page.evaluate(async () => {
      const response = await fetch('/api/portal/sala/training-context');
      const body = await response.json() as { data: { routine: { days: { id: string; name: string }[] } } };
      return body.data.routine.days.find(day => day.name === 'Movilidad')!.id;
    });
    await page.goto(`/portal/sala/entrenamientos/registrar?dayId=${mobilityId}`);
    await expect(page.getByLabel('Día de la rutina').locator('option:checked')).toHaveText('Movilidad');
    await expect(page.getByLabel('Fecha del entrenamiento')).toBeVisible();
    const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const teacher = await staff.newPage();
    try {
      await teacher.goto('/login'); await teacher.getByLabel('Email').fill(fixture.email); await teacher.getByLabel('Contraseña', { exact: true }).fill('Synthetic-test-password1!'); await teacher.getByRole('button', { name: 'Ingresar', exact: true }).click();
      await expect(teacher).toHaveURL('/');
      await teacher.goto(`/sala/people/${fixture.personId}?tab=routine`);
      await expect(teacher.getByRole('heading', { name: 'Historial de entrenamientos' })).toBeVisible();
      await teacher.getByRole('button', { name: /Ver detalle del/ }).first().click();
      await expect(teacher.getByText('34,5 kg', { exact: true })).toBeVisible();
      await expect(teacher.getByText('60,5 kg', { exact: true })).toBeVisible();
      await expect(teacher.getByRole('link', { name: 'Editar registro' })).toHaveCount(0);
      await expect(teacher.getByLabel(/Peso utilizado/)).toHaveCount(0);
      for (const width of [1440, 768, 390]) {
        await teacher.setViewportSize({ width, height: 1000 });
        await expect.poll(() => teacher.locator('main').evaluate(element => getComputedStyle(element).marginLeft)).toBe(width >= 768 ? '240px' : '0px');
        await teacher.screenshot({ path: `/tmp/athleta-training-professor-${width}.png`, fullPage: true });
        if (width === 1440) await captureMarkup(teacher, 'professor');
        const overflow = await teacher.evaluate(() => [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1).map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width, text: element.textContent?.slice(0, 45) })));
        expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}px: ${JSON.stringify(overflow)}`).toBe(true);
      }
      await teacher.getByRole('button', { name: /Cerrar detalle del/ }).click(); await expect(teacher.getByText('34,5 kg', { exact: true })).toHaveCount(0);
    } finally { await staff.close(); }
  } finally {
    execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts', 'cleanup', fixture.personId, fixture.professorId, fixture.planId, fixture.exerciseId], { cwd: '../..', stdio: 'pipe' });
  }
});

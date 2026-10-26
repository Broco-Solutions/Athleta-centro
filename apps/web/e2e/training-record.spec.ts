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
    await page.getByRole('link', { name: 'Ver rutina', exact: true }).click();
    await page.getByRole('link', { name: 'Registrar este día: Fuerza', exact: true }).click();
    await expect(page.getByLabel('Día de la rutina').locator('option:checked')).toHaveText('Fuerza');
    const weights = page.getByLabel(/Peso utilizado/); await expect(weights).toHaveCount(2);
    await expect(weights.first()).toHaveValue(''); await weights.first().fill('32,5');
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/athleta-training-form-${width}.png`, fullPage: true });
      if (width === 1440) await captureMarkup(page, 'form');
    }
    await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
    await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await page.getByRole('link', { name: 'Ver mi historial' }).click();
    await page.getByRole('button', { name: /Ver detalle del/ }).click();
    await expect(page.getByText('32,5 kg', { exact: true })).toBeVisible(); await expect(page.getByText('Sin registro', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Editar registro' }).click(); await page.getByLabel(/Peso utilizado/).first().fill('34,5');
    await page.getByRole('button', { name: 'Guardar corrección' }).click(); await expect(page.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const teacher = await staff.newPage();
    try {
      await teacher.goto('/login'); await teacher.getByLabel('Email').fill(fixture.email); await teacher.getByLabel('Contraseña').fill('Synthetic-test-password1!'); await teacher.getByRole('button', { name: 'Ingresar', exact: true }).click();
      await expect(teacher).toHaveURL('/');
      await teacher.goto(`/sala/people/${fixture.personId}?tab=routine`);
      await expect(teacher.getByRole('heading', { name: 'Historial de entrenamientos' })).toBeVisible();
      await teacher.getByRole('button', { name: /Ver detalle del/ }).click();
      await expect(teacher.getByText('34,5 kg', { exact: true })).toBeVisible();
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

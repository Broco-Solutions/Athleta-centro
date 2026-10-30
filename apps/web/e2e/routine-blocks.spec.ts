import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('blocks survive template editing, assignment, portal weights, replacement, history and A4 printing', async ({ page, browser }) => {
  test.setTimeout(180000);
  const fixture = JSON.parse(execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts'], { cwd: '../..', encoding: 'utf8' }).trim()) as { personId: string; professorId: string; planId: string; exerciseId: string; dni: string; email: string };
  let templateId: string | undefined;
  const student = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let csrf = '';
  const api = 'http://localhost:3001/api';
  async function capture(target: Page, name: string) {
    for (const width of [1440, 768, 390]) {
      await target.setViewportSize({ width, height: 1000 });
      await target.screenshot({ path: `/tmp/athleta-blocks-${name}-${width}.png`, fullPage: true });
      await expect.poll(() => target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `Sin desborde horizontal en ${name} a ${width}px` }).toBe(true);
    }
    const markup = await target.evaluate(async () => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, link, nextjs-portal').forEach(e => e.remove());
      const style = document.createElement('style');
      style.textContent = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join('\n');
      clone.querySelector('head')!.append(style);
      for (const img of clone.querySelectorAll('img')) {
        const blob = await fetch(img.src).then(r => r.blob()); img.removeAttribute('srcset');
        img.src = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
      }
      return '<!doctype html>' + clone.outerHTML;
    });
    writeFileSync(`/tmp/athleta-blocks-${name}.html`, markup);
  }
  async function print(target: Page, name: string, legacy = false, historical = false) {
    await target.evaluate(() => { window.print = () => {}; });
    await target.getByRole('button', { name: 'Imprimir / PDF', exact: true }).nth(historical ? 1 : 0).click();
    const root = target.locator('#athleta-routine-print-root');
    await expect(root).toBeAttached();
    await target.emulateMedia({ media: 'print' });
    await expect(root.getByRole('columnheader', { name: 'Series', exact: true })).toHaveCount(legacy ? 2 : 0);
    if (!legacy) await expect(root.getByRole('heading', { name: 'Bloque A — 4 series', exact: true })).toBeVisible();
    await target.screenshot({ path: `/tmp/athleta-blocks-print-${name}.png`, fullPage: true });
    await target.pdf({ path: `/tmp/athleta-blocks-${name}.pdf`, preferCSSPageSize: true });
    await target.emulateMedia({ media: 'screen' });
    await target.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  }
  try {
    await page.goto('/login'); await page.getByLabel('Email').fill(fixture.email); await page.getByLabel('Contraseña', { exact: true }).fill('Synthetic-test-password1!'); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await expect(page).toHaveURL('/');
    csrf = (await (await page.request.get(`${api}/auth/session`)).json()).data.csrfToken as string;
    const catalog = (await (await page.request.get(`${api}/sala/exercise-definitions`)).json()).data as { id: string; name: string }[];
    const name = catalog.find(e => e.id === fixture.exerciseId)!.name;
    await page.goto(`/sala/people/${fixture.personId}?tab=routine`);
    await print(page, 'legacy', true);
    await page.getByRole('button', { name: 'Editar rutina' }).click();
    await expect(page.getByRole('group', { name: 'Día 1', exact: true }).getByLabel('Series', { exact: true }).first()).toHaveValue('3');
    await expect(page.getByRole('button', { name: '+ Agregar bloque' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.goto('/routines'); await page.getByRole('button', { name: 'Nueva rutina preestablecida' }).click();
    const templateName = `Bloques ${fixture.personId}`;
    await page.getByLabel('Nombre de la preestablecida').fill(templateName);
    await expect(page.getByRole('button', { name: 'Eliminar bloque' })).toBeDisabled();
    await page.getByRole('button', { name: 'Buscar ejercicios para el bloque A' }).click();
    await page.getByLabel('Buscar ejercicio').fill(name);
    const a = page.getByRole('region', { name: 'Bloque A', exact: true });
    await expect(a.getByLabel('Series del bloque A', { exact: true })).toHaveText('4');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: `Agregar ${name}`, exact: true }).click();
    await a.getByLabel('Valor', { exact: true }).first().fill('8'); await a.getByLabel('Carga', { exact: true }).first().fill('60');
    await page.getByRole('button', { name: '+ Agregar bloque' }).click();
    const b = page.getByRole('region', { name: 'Bloque B', exact: true }); await b.getByRole('button', { name: 'Disminuir series del bloque B' }).click(); await b.getByRole('button', { name: 'Buscar ejercicios para el bloque B' }).click(); await page.getByLabel('Buscar ejercicio').fill(name);
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: `Agregar ${name}`, exact: true }).click();
    await capture(page, 'editor');
    const created = page.waitForResponse(response => response.url().endsWith('/sala/routine-templates') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Guardar cambios' }).click(); templateId = (await (await created).json()).data.id as string;
    await expect(page.getByText('Rutina preestablecida guardada correctamente.')).toBeVisible();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(a.getByLabel('Series del bloque A', { exact: true })).toHaveText('4'); await expect(b.getByLabel('Series del bloque B', { exact: true })).toHaveText('3');
    await expect(a.getByText(`A3 — ${name}`, { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await print(page, 'template');
    await page.goto(`/sala/people/${fixture.personId}?tab=routine`); await page.getByRole('button', { name: 'Usar preestablecida', exact: true }).click(); await page.getByRole('button', { name: templateName, exact: true }).click(); await page.getByRole('button', { name: 'Asignar rutina', exact: true }).click();
    await expect(page.getByText('Rutina asignada correctamente.')).toBeVisible(); await print(page, 'assigned');
    const portal = await student.newPage(); await portal.goto('/portal/login'); await portal.getByLabel('DNI', { exact: true }).fill(fixture.dni); await portal.getByLabel('PIN', { exact: true }).fill('1111'); await portal.getByRole('button', { name: 'Ingresar', exact: true }).click(); await expect(portal.getByRole('link', { name: 'Ver rutina', exact: true })).toBeVisible();
    await portal.goto('/portal/sala/rutina'); await expect(portal.getByText('Bloque A — 4 series')).toBeVisible(); await expect(portal.getByRole('button', { name: 'Imprimir / PDF' })).toHaveCount(0); await capture(portal, 'portal');
    await portal.getByRole('link', { name: /^Registrar este día:/ }).click();
    const weights = portal.getByLabel(/Peso utilizado/); await expect(weights).toHaveCount(5); await weights.nth(0).fill('32,5'); await weights.nth(1).fill('22');
    await portal.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click(); await expect(portal.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await page.getByRole('button', { name: 'Editar rutina' }).click(); await page.getByRole('button', { name: 'Aumentar series del bloque A' }).click(); await page.getByRole('button', { name: 'Aumentar series del bloque A' }).click(); await page.getByRole('button', { name: 'Guardar cambios' }).click(); await expect(page.getByText('Rutina guardada correctamente.')).toBeVisible();
    await portal.getByRole('link', { name: 'Ver mi historial' }).click(); await portal.getByRole('button', { name: /Ver detalle del/ }).click(); await expect(portal.getByText('Bloque A — 4 series')).toBeVisible(); await expect(portal.getByText('32,5 kg', { exact: true })).toBeVisible(); await capture(portal, 'history');
    await portal.getByRole('link', { name: 'Editar registro', exact: true }).click(); await portal.getByLabel(/Peso utilizado/).first().fill('34,5'); await portal.getByRole('button', { name: 'Guardar corrección', exact: true }).click(); await expect(portal.getByText('Entrenamiento guardado correctamente.')).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Rutinas históricas' }).click();
    await print(page, 'historical', false, true);
    const reuse = page.getByRole('button', { name: 'Usar nuevamente', exact: true }).first(); await reuse.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Usar nuevamente', exact: true }).click(); await expect(page.getByText('Rutina activada correctamente.')).toBeVisible();
    const active = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rutina v4', exact: true }) });
    await expect(active.getByText('Bloque A — 4 series')).toBeVisible();
  } finally {
    await student.close();
    if (templateId) await page.request.delete(`${api}/sala/routine-templates/${templateId}`, { headers: { 'x-csrf-token': csrf } });
    execFileSync('pnpm', ['--filter', '@athleta/api', 'exec', 'tsx', 'scripts/training-record-e2e-fixture.ts', 'cleanup', fixture.personId, fixture.professorId, fixture.planId, fixture.exerciseId], { cwd: '../..', stdio: 'pipe' });
  }
});

import { expect, test, type Locator, type Page } from '@playwright/test';

const mutations = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
  const requests: string[] = []; mutations.set(page, requests);
  await page.route('**/*', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { requests.push(new URL(request.url()).pathname); await route.abort(); return; }
    const headers = { ...request.headers() };
    if (process.env.VERCEL_OIDC_TOKEN && new URL(request.url()).origin === new URL(baseURL!).origin) headers['x-vercel-trusted-oidc-idp-token'] = process.env.VERCEL_OIDC_TOKEN;
    await route.continue({ headers });
  });
});
test.afterEach(async ({ page }) => expect(mutations.get(page)).toEqual([]));

async function centered(control: Locator): Promise<void> {
  const geometry = await control.evaluate(element => {
    const input = element.querySelector('input')!;
    const cells = [...element.querySelectorAll('.portal-pin-cells > span')];
    return {
      deltas: cells.flatMap(cell => {
        const glyph = cell.querySelector('.portal-pin-dot, .portal-pin-digit');
        if (!glyph) return [];
        const a = cell.getBoundingClientRect(), b = glyph.getBoundingClientRect();
        return [Math.abs(a.x + a.width / 2 - b.x - b.width / 2), Math.abs(a.y + a.height / 2 - b.y - b.height / 2)];
      }),
      scroll: input.scrollLeft,
      eyeWidth: element.querySelector('button')!.getBoundingClientRect().width,
      paint: getComputedStyle(input).getPropertyValue('-webkit-text-fill-color'),
    };
  });
  expect(geometry.deltas.every(delta => delta < 0.6)).toBe(true);
  expect(geometry.scroll).toBe(0);
  expect(geometry.eyeWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.paint).toBe('rgba(0, 0, 0, 0)');
}

for (const width of [360, 390, 430, 1366]) {
  test(`native PIN editing and centered painting at ${width}px`, async ({ page, context, browserName, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, labels] of [['/portal/login', ['PIN']], ['/portal/change-pin', ['PIN actual', 'Nuevo PIN']]] as const) {
      await page.goto(path);
      for (const label of labels) {
        const input = page.getByLabel(label, { exact: true });
        const control = input.locator('..').locator('..');
        const eye = control.getByRole('button');
        await expect(input).toHaveAttribute('type', 'password');
        for (const mode of ['hidden', 'visible']) {
          await input.fill('');
          if (mode === 'visible') await eye.click();
          await centered(control);
          for (let index = 0; index < 4; index++) {
            await input.pressSequentially('0123'[index]!);
            expect((await input.inputValue()).length).toBe(index + 1);
            await centered(control);
            if (width === 390 && [0, 3].includes(index)) await control.screenshot({ path: test.info().outputPath(`${label}-${mode}-${index + 1}.png`) });
          }
          await input.pressSequentially('9');
          expect((await input.inputValue()).length).toBe(4);
          await input.press('Backspace');
          expect((await input.inputValue()).length).toBe(3);
          await input.press('ControlOrMeta+A'); await input.pressSequentially('0001');
          await input.press('Home'); await input.press('ArrowRight');
          await input.press('Shift+ArrowRight'); await input.press('Shift+ArrowRight');
          await eye.click();
          expect(await input.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([1, 3]);
          await eye.click();
          expect(await input.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([1, 3]);
          await input.pressSequentially('23');
          expect((await input.inputValue()) === '0231').toBe(true);
          const box = (await input.boundingBox())!;
          await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 3 / 4, box.y + box.height / 2, { steps: 5 });
          await page.mouse.up();
          expect(await input.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([1, 3]);
          await input.pressSequentially('00');
          expect((await input.inputValue()) === '0001').toBe(true);
          await input.press('Tab'); await expect(eye).toBeFocused();
          await eye.press('Shift+Tab'); await expect(input).toBeFocused();
          await centered(control);
        }
        // Browser autofill writes the native value and emits an input event.
        await input.evaluate(element => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, '0012');
          element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
        });
        expect((await input.inputValue()) === '0012').toBe(true);
        await expect(control.locator('.portal-pin-digit, .portal-pin-dot')).toHaveCount(4);
        await centered(control);
        if (browserName === 'chromium') {
          await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
          await page.evaluate(() => navigator.clipboard.writeText('0012'));
          await input.fill(''); await input.press('ControlOrMeta+V');
          expect((await input.inputValue()) === '0012').toBe(true);
          await centered(control);
        }
        await input.fill('');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: path.endsWith('login') ? 'Ingresar' : 'Guardar PIN', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: path.endsWith('login') ? 'Ingresar' : 'Guardar PIN', exact: true })).toBeInViewport();
    }
  });
}

test('confirmed contact and Broco contrast on light and dark footers', async ({ page }) => {
  // Presentation fixtures only: no Athleta session, database or mutation.
  await page.route('**/api/portal/auth/session', route => route.fulfill({ json: { data: { mustChangePin: false, healthDeclaration: { required: false } } } }));
  await page.route('**/api/portal/sala', route => route.fulfill({ json: { data: { reservations: [], fixedOccurrences: [] } } }));
  for (const width of [360, 390, 430, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/portal/login', '/portal/change-pin', '/portal/sala/reservas']) {
      await page.goto(path);
      const footer = page.locator('footer'); await expect(footer).toHaveCount(1);
      const instagram = page.getByRole('link', { name: 'Instagram de Athleta' });
      const address = page.getByRole('link', { name: 'Yrigoyen 2333, Casilda' });
      const phone = page.getByRole('link', { name: /Contacto Athleta:/ });
      await expect(instagram).toHaveCount(1); await expect(address).toHaveCount(1); await expect(phone).toHaveCount(1);
      await expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/athleta.centro/');
      await expect(address).toHaveAttribute('href', 'https://maps.app.goo.gl/N9UrkAdpigCSzqW77');
      await expect(phone).toHaveAttribute('href', 'tel:+5493464566340');
      for (const link of [instagram, address, phone]) { expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44); await expect(footer).toContainText(await link.innerText()); }
      const credit = page.getByRole('link', { name: 'Desarrollado por Broco Solutions' });
      await expect(credit).toHaveCount(1); await expect(credit).toHaveAttribute('href', 'https://www.brocosolutions.com');
      await expect(credit).toHaveAttribute('rel', 'noopener noreferrer');
      const logo = credit.getByRole('img');
      await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
      const filter = await logo.evaluate(image => getComputedStyle(image).filter);
      expect(filter.includes('invert(1)')).toBe(path === '/portal/sala/reservas');
      await credit.focus(); await expect(credit).toBeFocused();
      if (width === 390 && path !== '/portal/change-pin') await footer.screenshot({ path: test.info().outputPath(path === '/portal/login' ? 'footer-light.png' : 'footer-dark.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

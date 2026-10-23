import { expect, test } from '@playwright/test';

// Exercise the browser layout and HTTP consumer with synthetic responses; domain rules stay in the API.
for (const [width, role] of [[1440, 'PROFESSOR'], [768, 'ADMINISTRATIVE'], [390, 'GENERAL_ADMIN']] as const) {
  test(`weekly Sala calendar at ${width}px for ${role}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-10-19T10:00:00Z'));
    let assigned = false;
    let attended = false;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/session') {
        await route.fulfill({ json: { data: { user: { id: 'operator', firstName: 'Operador', lastName: 'Sintético', email: 'operator@test.local' }, roles: [role], permissions: ['SALA_RELATION_READ', 'SALA_AGENDA_MANAGE', 'SALA_PARTICIPATION_MANAGE', 'PEOPLE_CREATE'], mustChangePassword: false, csrfToken: 'csrf' } } });
      } else if (url.pathname === '/api/sala/students') {
        await route.fulfill({ json: { data: [{ id: 'new-student', participationId: 'participation-real', firstName: 'Ada', lastName: 'Sintética', dni: '88000002', hasValidAccess: true }] } });
      } else if (url.pathname === '/api/sala/fixed-bookings') {
        expect(route.request().postDataJSON()).toEqual({ personId: 'new-student', salaParticipationId: 'participation-real', scheduleSlotId: 'slot-9', startTime: '09:00', startDate: '2026-10-19' });
        assigned = true;
        await route.fulfill({ status: 201, json: { data: {} } });
      } else if (url.pathname === '/api/sala/occurrences/attend') {
        expect(route.request().postDataJSON()).toMatchObject({ personId: 'student', scheduleSlotId: 'slot-9', date: '2026-10-19', startTime: '09:00', sourceId: 'fixed' });
        attended = true;
        await route.fulfill({ json: { data: {} } });
      } else if (url.pathname === '/api/sala/agenda') {
        const weekday = new Date(`${url.searchParams.get('date')}T12:00Z`).getUTCDay();
        const groups = weekday === 0 ? [] : [8, 9, 10, 11, 16, 17, 18, 19].flatMap((hour) => [0, 15, 30, 45].map((minute) => {
          const reserved = hour === 10 ? 6 : hour === 9 ? assigned ? 2 : 1 : (hour + weekday) % 5;
          return {
            slot: { id: `slot-${hour}:${minute}`, scheduleSlotId: `slot-${hour}`, startTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, durationMinutes: 15 },
            capacity: 6, reserved, available: 6 - reserved, isClosed: false, isOverbooked: false,
            people: minute === 0 && hour === 9 ? [{ personId: 'student', person: { id: 'student', firstName: 'Ana', lastName: 'Sintética', dni: '88000001' }, origin: 'FIXED', status: attended ? 'ATTENDED' : 'RESERVED', sourceId: 'fixed', startTime: '09:00', durationMinutes: 60 }] : [],
          };
        }));
        await route.fulfill({ json: { data: groups } });
      } else throw new Error(`Unexpected API request: ${url.pathname}`);
    });
    await page.goto('/sala');
    await page.getByRole('button', { name: /^lunes 09:00:/ }).click();
    const panel = page.getByRole('complementary', { name: 'Turno seleccionado' });
    await panel.getByRole('button', { name: 'Ver alumnos asignados' }).click();
    await expect(panel.getByText('Ana Sintética')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/sala/people/student');
    await expect(page.getByText('Profesor a cargo', { exact: true })).toHaveCount(0);
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      calendar: document.querySelector('[aria-label="Calendario semanal"]')!.getBoundingClientRect().toJSON() as { x: number; y: number },
      panel: document.querySelector('aside[aria-label="Turno seleccionado"]')!.getBoundingClientRect().toJSON() as { x: number; y: number },
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
    if (width === 1440) expect(geometry.panel.x).toBeLessThan(geometry.calendar.x);
    else expect(geometry.panel.y).toBeGreaterThan(geometry.calendar.y);
    await expect(page.getByRole('button', { name: /^lunes 09:00:/ })).toHaveCSS('border-color', 'rgb(252, 204, 5)');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('calendar.png'), fullPage: true });
    await page.getByRole('button', { name: /Tarde/ }).click();
    await expect(page.getByRole('button', { name: /^lunes 16:00:/ })).toBeVisible();
    await page.getByRole('button', { name: /Mañana/ }).click();
    await panel.getByRole('button', { name: 'Asignar alumno', exact: true }).click();
    await page.getByLabel('Buscar alumno').fill('Ada');
    await page.getByRole('button', { name: /Ada Sintética/ }).click();
    await expect(page.getByRole('button', { name: 'Confirmar asignación' })).toBeEnabled();
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialogVisible = await page.getByRole('dialog').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + 8, rect.y + 8));
    });
    expect(dialogVisible).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('assignment.png') });
    await page.getByRole('button', { name: 'Confirmar asignación' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel.getByText('2 / 6')).toBeVisible();
    await panel.getByRole('button', { name: 'Ver reserva y asistencia' }).click();
    await page.getByRole('button', { name: 'Asistió', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel.getByText('Asistió · 09:00 – 10:00')).toBeVisible();
    await panel.getByRole('button', { name: 'Incorporación espontánea' }).click();
    await expect(page.getByRole('dialog', { name: 'Incorporación espontánea' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

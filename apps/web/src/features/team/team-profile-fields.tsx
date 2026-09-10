'use client';

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import type { TeamUserDto, UpdateTeamUserDto } from '@athleta/api-client';

const field = 'mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted';
const optionalText = (maxLength: number) => z.string().trim().max(maxLength);

export type TeamProfileFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dni: string;
  address: string;
  birthDate: string;
  profession: string;
  athletaStartDate: string;
};

export const todayInArgentina = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const teamProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'Ingresá el nombre').max(100),
  lastName: z.string().trim().min(1, 'Ingresá el apellido').max(100),
  email: z.email('Email inválido').max(254),
  phone: optionalText(50),
  dni: optionalText(30),
  address: optionalText(250),
  birthDate: z.string(),
  profession: optionalText(120),
  athletaStartDate: z.string(),
}).superRefine((values, context) => {
  const today = todayInArgentina();
  if (values.birthDate && values.birthDate > today) context.addIssue({ code: 'custom', path: ['birthDate'], message: 'La fecha de nacimiento no puede ser futura' });
  if (values.athletaStartDate && values.athletaStartDate > today) context.addIssue({ code: 'custom', path: ['athletaStartDate'], message: 'La fecha de ingreso no puede ser futura' });
});

export const profileDefaults = (user?: TeamUserDto): TeamProfileFormValues => ({
  firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '', phone: user?.phone ?? '', dni: user?.dni ?? '', address: user?.address ?? '', birthDate: user?.birthDate ?? '', profession: user?.profession ?? '', athletaStartDate: user?.athletaStartDate ?? '',
});

export const toProfileInput = (values: TeamProfileFormValues): UpdateTeamUserDto => ({
  firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim(), phone: values.phone.trim() || null, dni: values.dni.trim() || null, address: values.address.trim() || null, birthDate: values.birthDate || null, profession: values.profession.trim() || null, athletaStartDate: values.athletaStartDate || null,
});

export const seniorityLabel = (startDate: string, today = todayInArgentina()): string | null => {
  if (!startDate || startDate > today) return null;
  const [startYear = Number.NaN, startMonth = Number.NaN, startDay = Number.NaN] = startDate.split('-').map(Number);
  const [todayYear = Number.NaN, todayMonth = Number.NaN, todayDay = Number.NaN] = today.split('-').map(Number);
  if ([startYear, startMonth, startDay, todayYear, todayMonth, todayDay].some((value) => Number.isNaN(value))) return null;
  let months = (todayYear - startYear) * 12 + todayMonth - startMonth;
  if (todayDay < startDay) months -= 1;
  if (months < 1) return 'Menos de un mes';
  const years = Math.floor(months / 12);
  months %= 12;
  if (years === 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  if (months === 0) return `${years} ${years === 1 ? 'año' : 'años'}`;
  return `${years} ${years === 1 ? 'año' : 'años'} y ${months} ${months === 1 ? 'mes' : 'meses'}`;
};

export function TeamProfileFields({ form, disabled = false }: { form: UseFormReturn<TeamProfileFormValues>; disabled?: boolean }): React.JSX.Element {
  const seniority = seniorityLabel(form.watch('athletaStartDate'));
  const today = todayInArgentina();
  return <><fieldset className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">Datos personales</legend>
    <label className="text-sm">Nombre<input className={field} disabled={disabled} {...form.register('firstName')}/><Error message={form.formState.errors.firstName?.message}/></label>
    <label className="text-sm">Apellido<input className={field} disabled={disabled} {...form.register('lastName')}/><Error message={form.formState.errors.lastName?.message}/></label>
    <label className="text-sm sm:col-span-2">Email<input className={field} type="email" disabled={disabled} {...form.register('email')}/><Error message={form.formState.errors.email?.message}/></label>
  </fieldset><fieldset className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2"><legend className="px-0 text-sm font-medium">Datos opcionales</legend>
    <label className="text-sm">Teléfono<input className={field} type="tel" disabled={disabled} {...form.register('phone')}/><Error message={form.formState.errors.phone?.message}/></label>
    <label className="text-sm">DNI<input className={field} inputMode="numeric" disabled={disabled} {...form.register('dni')}/><Error message={form.formState.errors.dni?.message}/></label>
    <label className="text-sm sm:col-span-2">Domicilio<input className={field} disabled={disabled} {...form.register('address')}/><Error message={form.formState.errors.address?.message}/></label>
    <label className="text-sm">Fecha de nacimiento<input className={field} type="date" max={today} disabled={disabled} {...form.register('birthDate')}/><Error message={form.formState.errors.birthDate?.message}/></label>
    <label className="text-sm">Profesión<input className={field} disabled={disabled} {...form.register('profession')}/><Error message={form.formState.errors.profession?.message}/></label>
    <label className="text-sm">Fecha de ingreso a Athleta<input className={field} type="date" max={today} disabled={disabled} {...form.register('athletaStartDate')}/><Error message={form.formState.errors.athletaStartDate?.message}/></label>
    <div className="self-end rounded-md bg-surface-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Antigüedad</span><p className="m-0 mt-1 font-medium">{seniority ?? 'Sin informar'}</p></div>
  </fieldset></>;
}

function Error({ message }: { message: string | undefined }): React.JSX.Element | null { return message ? <span className="text-xs text-red-700">{message}</span> : null; }

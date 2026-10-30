'use client';
import React from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { createSocialWork, listSocialWorks, type PersonResponseDto } from '@athleta/api-client';
import { currentSession } from '../auth/auth';
function todayOperational(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export const personSchema = z.object({ firstName: z.string().trim().min(1, 'Ingresá el nombre'), lastName: z.string().trim().min(1, 'Ingresá el apellido'), dni: z.string().refine((value) => !/[^0-9 .-]/.test(value) && /^\d{6,8}$/.test(value.replace(/[^0-9]/g, '')), 'El DNI debe tener entre 6 y 8 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')), phone: z.string().refine((value) => !/[^0-9 ().-]/.test(value) && /^[1-9]\d{9}$/.test(value.replace(/[^0-9]/g, '')), 'El teléfono debe tener 10 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')), birthDate: z.string().min(1, 'Ingresá la fecha').refine((value) => value <= todayOperational(), 'La fecha de nacimiento no puede ser futura'), email: z.union([z.literal(''), z.email('Email inválido')]).optional(), emergencyContactName: z.string().trim().max(150), emergencyContactPhone: z.string().refine((value) => !value.trim() || (!/[^0-9 ().-]/.test(value) && /^[1-9]\d{9}$/.test(value.replace(/[^0-9]/g, ''))), 'El teléfono de emergencia debe tener 10 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')), socialWorkId: z.string(), affiliateNumber: z.string().max(100), sport: z.string(), club: z.string() });
export type PersonValues = z.infer<typeof personSchema>; const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

type SocialWork = { id: string; name: string; isSelectable: boolean };

export function personDefaults(person?: PersonResponseDto): PersonValues {
  return { firstName: person?.firstName ?? '', lastName: person?.lastName ?? '', dni: person?.dni ?? '', phone: person?.phone ?? '', birthDate: person?.birthDate ?? '', email: person?.email ?? '', emergencyContactName: person?.emergencyContactName ?? '', emergencyContactPhone: person?.emergencyContactPhone ?? '', socialWorkId: person?.socialWorkId ?? '', affiliateNumber: person?.socialWorkId ? person.affiliateNumber ?? '' : '', sport: person?.sport ?? '', club: person?.club ?? '' };
}
export function personInput(values: PersonValues) {
  return { ...values, email: values.email || null, socialWorkId: values.socialWorkId || null, affiliateNumber: values.socialWorkId ? values.affiliateNumber.trim() : '', sport: values.sport.trim() || null, club: values.club.trim() || null };
}
export function GeneralPersonFields({ form, person }: { form: UseFormReturn<PersonValues>; person?: PersonResponseDto }): React.JSX.Element {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const catalog = useQuery({ queryKey: ['social-works'], retry: false, queryFn: async () => { const result = await listSocialWorks({ credentials: 'include' }); if (result.status !== 200) throw new Error('No pudimos cargar las obras sociales.'); return (result.data as unknown as { data: SocialWork[] }).data; } });
  const canManageSocialWorks = session.data?.permissions.includes('SOCIAL_WORK_CATALOG_MANAGE') ?? false;
  const [creatingSocialWork, setCreatingSocialWork] = React.useState(false);
  const [socialWorkName, setSocialWorkName] = React.useState('');
  const createSocialWorkMutation = useMutation({ mutationFn: async (name: string) => {
    const csrfToken = session.data?.csrfToken;
    if (!csrfToken) throw new Error('Sesión inválida. Volvé a iniciar sesión.');
    const response: { status: number; data: unknown } = await createSocialWork({ name: name.trim() }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } });
    if (response.status < 200 || response.status >= 300) {
      const payload = response.data as { code?: string };
      if (response.status === 409 && payload.code === 'SOCIAL_WORK_NAME_DUPLICATE') throw new Error('Ya existe una obra social con ese nombre.');
      throw new Error('No pudimos agregar la obra social. Intentá nuevamente.');
    }
    return (response.data as { data: SocialWork }).data;
  }, onSuccess: async (work) => {
    client.setQueryData<SocialWork[]>(['social-works'], (current) => current ? [...current.filter((item) => item.id !== work.id), work] : [work]);
    await client.invalidateQueries({ queryKey: ['social-works'] });
    form.setValue('socialWorkId', work.id, { shouldDirty: true, shouldValidate: true });
    form.setValue('affiliateNumber', '', { shouldDirty: true });
    setSocialWorkName('');
    setCreatingSocialWork(false);
  } });
  const socialWorkId = form.watch('socialWorkId');
  const works = catalog.data?.filter((work) => work.isSelectable || work.id === person?.socialWorkId) ?? [];
  const personalFields = [['firstName','Nombre'],['lastName','Apellido'],['dni','DNI'],['phone','Teléfono'],['birthDate','Fecha de nacimiento'],['email','Email (opcional)'],['sport','Deporte (opcional)'],['club','Club (opcional)']] as const;
  const emergencyFields = [['emergencyContactName','Contacto de emergencia (opcional)'],['emergencyContactPhone','Teléfono de emergencia (opcional)']] as const;
  const renderField = ([name, label]: typeof personalFields[number] | typeof emergencyFields[number]) => <label key={name} className="text-sm">{label}<input type={name === 'birthDate' ? 'date' : name === 'email' ? 'email' : 'text'} className={fieldClass} placeholder={name === 'dni' ? '20123456' : name === 'phone' || name === 'emergencyContactPhone' ? '3415551234' : undefined} inputMode={name === 'dni' ? 'numeric' : name === 'phone' || name === 'emergencyContactPhone' ? 'tel' : undefined} aria-label={label} maxLength={name === 'emergencyContactName' ? 150 : undefined} aria-describedby={name === 'dni' || name === 'phone' || name === 'emergencyContactPhone' ? `${name}-help` : undefined} {...form.register(name)} /><span className="text-xs text-red-700">{form.formState.errors[name]?.message}</span>{name === 'dni' && <span id="dni-help" className="block text-xs text-muted-foreground">Ingresá entre 6 y 8 dígitos. Podés escribirlo con puntos.</span>}{name === 'phone' && <span id="phone-help" className="block text-xs text-muted-foreground">Ingresá 10 dígitos con código de área, sin +54, 0 inicial ni 15. Ej: 3415551234 o 1112345678.</span>}{name === 'emergencyContactPhone' && <span id="emergencyContactPhone-help" className="block text-xs text-muted-foreground">Ingresá 10 dígitos con código de área, sin +54, 0 inicial ni 15.</span>}</label>;
  return <>
    <section className="sm:col-span-2">
      <h3 className="mb-3 text-sm font-semibold">Datos personales</h3>
      <div className="grid gap-4 sm:grid-cols-2">{personalFields.map(renderField)}</div>
    </section>
    <section className="border-t border-border pt-4 sm:col-span-2">
      <h3 className="text-sm font-semibold">Contacto de emergencia</h3>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">Una persona de referencia ante una urgencia.</p>
      <div className="grid gap-4 sm:grid-cols-2">{emergencyFields.map(renderField)}</div>
    </section>
    <section className="border-t border-border pt-4 sm:col-span-2">
      <h3 className="mb-3 text-sm font-semibold">Cobertura médica</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><label className="text-sm">Obra social (opcional)<select aria-label="Obra social (opcional)" value={socialWorkId} className={fieldClass} {...form.register('socialWorkId', { onChange: (event: React.ChangeEvent<HTMLSelectElement>) => { if (!event.target.value) form.setValue('affiliateNumber', ''); } })}><option value="">Sin obra social</option>{works.map((work) => <option key={work.id} value={work.id} disabled={!work.isSelectable && socialWorkId !== work.id}>{work.name}{!work.isSelectable ? ' (retirada)' : ''}</option>)}</select></label>{canManageSocialWorks ? <Button type="button" variant="secondary" onClick={() => { createSocialWorkMutation.reset(); setCreatingSocialWork((open) => !open); setSocialWorkName(''); }}>{creatingSocialWork ? 'Cancelar' : 'Agregar obra social'}</Button> : null}{canManageSocialWorks && catalog.isSuccess && works.length === 0 ? <p className="text-xs text-muted-foreground">No hay obras sociales cargadas. Podés agregar la primera.</p> : null}</div>
        <label className="text-sm">Número de afiliado (opcional)<input aria-label="Número de afiliado (opcional)" type="text" maxLength={100} disabled={!socialWorkId} className={fieldClass} {...form.register('affiliateNumber')} /></label>
        {creatingSocialWork && canManageSocialWorks ? <div className="space-y-2 sm:col-span-2" role="group" aria-label="Nueva obra social"><label className="block text-sm">Nueva obra social<input aria-label="Nueva obra social" autoFocus required maxLength={120} className={fieldClass} value={socialWorkName} onChange={(event) => setSocialWorkName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const name = socialWorkName.trim(); if (name && !createSocialWorkMutation.isPending) createSocialWorkMutation.mutate(name); } }} /></label>{createSocialWorkMutation.isError ? <p role="alert" className="text-sm text-red-700">{createSocialWorkMutation.error.message}</p> : null}<div className="flex gap-2"><Button type="button" variant="secondary" disabled={createSocialWorkMutation.isPending} onClick={() => { setCreatingSocialWork(false); setSocialWorkName(''); createSocialWorkMutation.reset(); }}>Cancelar</Button><Button type="button" disabled={createSocialWorkMutation.isPending || !socialWorkName.trim()} onClick={() => createSocialWorkMutation.mutate(socialWorkName.trim())}>{createSocialWorkMutation.isPending ? 'Agregando…' : 'Agregar'}</Button></div></div> : null}
        {catalog.isError && <div role="alert" className="sm:col-span-2"><p className="text-sm text-red-700">No pudimos cargar las obras sociales.</p><Button type="button" variant="secondary" onClick={() => void catalog.refetch()}>Reintentar</Button></div>}
      </div>
    </section>
  </>;
}

export function GeneralPersonForm({ person, onSave, onCancel, pending, error, defaultDni }: { person?: PersonResponseDto; onSave: (values: PersonValues) => void; onCancel: () => void; pending: boolean; error?: string; defaultDni?: string }): React.JSX.Element {
  const form = useForm<PersonValues>({ resolver: zodResolver(personSchema), defaultValues: { ...personDefaults(person), ...(!person && defaultDni ? { dni: defaultDni } : {}) } });
  return <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSave)}>
    <GeneralPersonFields form={form} {...(person ? { person } : {})}/>
    {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
    <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button></div>
  </form>;
}

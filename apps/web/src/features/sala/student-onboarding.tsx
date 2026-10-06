'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { createSalaStudent, joinSala, listPeople, listSalaPlans, listSalaProfessors, listSocialWorks } from '@athleta/api-client';

export function todayOperational(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const personSchema = z.object({ firstName: z.string().trim().min(1, 'Ingresá el nombre'), lastName: z.string().trim().min(1, 'Ingresá el apellido'), dni: z.string().refine((value) => !/[^0-9 .-]/.test(value) && /^\d{6,8}$/.test(value.replace(/[^0-9]/g, '')), 'El DNI debe tener entre 6 y 8 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')), phone: z.string().refine((value) => !/[^0-9 ().-]/.test(value) && /^[1-9]\d{9}$/.test(value.replace(/[^0-9]/g, '')), 'El teléfono debe tener 10 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')), birthDate: z.string().min(1, 'Ingresá la fecha').refine((value) => value <= todayOperational(), 'La fecha de nacimiento no puede ser futura'), email: z.union([z.literal(''), z.email('Email inválido')]).optional(), emergencyContactName: z.string().trim().max(150), emergencyContactPhone: z.string().refine((value) => !value.trim() || (!/[^0-9 ().-]/.test(value) && /^[1-9]\d{9}$/.test(value.replace(/[^0-9]/g, ''))), 'El teléfono de emergencia debe tener 10 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')), socialWorkId: z.string(), affiliateNumber: z.string().max(100) });

const assignmentSchema = z.object({ planId: z.string().min(1, 'Seleccioná un Plan'), mainProfessorId: z.string().min(1, 'Seleccioná un Profesor principal') });
const studentSchema = personSchema.extend(assignmentSchema.shape);
type StudentValues = z.infer<typeof studentSchema>;
type Notice = { pin: string; firstName: string; lastName: string };
type Plan = { id: string; name: string; isSelectable?: boolean };
type SocialWork = { id: string; name: string; isSelectable: boolean };
const fieldClass = 'mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
function checked<T>(response: { status: number; data: T }): T {
  if (response.status < 200 || response.status >= 300) throw Object.assign(new Error('No pudimos guardar los datos.'), { status: response.status, response: response.data });
  return response.data;
}

export function StudentOnboarding({ csrfToken, canPlanManage, canCreate }: { csrfToken: string; canPlanManage: boolean; canCreate: boolean }): React.JSX.Element {
  const [mode, setMode] = useState<'new' | 'existing' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const client = useQueryClient();
  const saved = async (created?: Notice) => {
    setMode(null);
    if (created) { setNotice(created); setCopied(false); }
    else setConfirmation('Persona incorporada a Sala correctamente.');
    await client.invalidateQueries({ queryKey: ['people'] });
  };
  return <div className="flex flex-wrap gap-2">
    {canCreate && <Button onClick={() => { setConfirmation(''); setMode('new'); }}>Nuevo alumno</Button>}
    <Button variant="secondary" onClick={() => { setConfirmation(''); setMode('existing'); }}>Incorporar Persona existente</Button>
    {confirmation && <p role="status" className="w-full text-sm text-green-700">{confirmation}</p>}
    {mode && <OnboardingDialog mode={mode} csrfToken={csrfToken} canPlanManage={canPlanManage} onClose={() => setMode(null)} onSaved={saved} />}
    {notice && <div role="dialog" aria-modal="true" aria-labelledby="student-pin-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-md bg-white p-6 text-center shadow-sm">
      <h3 id="student-pin-title" className="text-lg font-semibold">Alumno guardado correctamente</h3>
      <p className="mt-2 text-sm">{notice.firstName} {notice.lastName}</p><p className="mt-5 text-sm">PIN temporal del Portal</p>
      <p aria-label="PIN temporal" className="mt-1 font-mono text-4xl font-bold tracking-[0.35em]">{notice.pin}</p>
      <p className="mt-3 text-sm text-muted-foreground">Este PIN se mostrará una sola vez. Compartilo de forma segura con la Persona.</p>
      <div className="mt-5 flex justify-center gap-2"><Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(notice.pin); setCopied(true); } catch { setCopied(false); } }}>Copiar PIN</Button><Button onClick={() => { setNotice(null); setCopied(false); }}>Entendido</Button></div>
      {copied && <p role="status" className="mt-3 text-sm text-green-700">PIN copiado</p>}
    </div></div>}
  </div>;
}

function OnboardingDialog({ mode, csrfToken, canPlanManage, onClose, onSaved }: { mode: 'new' | 'existing'; csrfToken: string; canPlanManage: boolean; onClose: () => void; onSaved: (created?: Notice) => Promise<void> }): React.JSX.Element {
  const options = { credentials: 'include', headers: { 'x-csrf-token': csrfToken } } satisfies RequestInit;
  const plans = useQuery({ queryKey: ['sala-plans'], queryFn: async () => checked(await listSalaPlans(options)).data as unknown as Plan[] });
  const professors = useQuery({ queryKey: ['sala-professors'], queryFn: async () => checked(await listSalaProfessors(options)).data });
  const works = useQuery({ queryKey: ['social-works'], enabled: mode === 'new', queryFn: async () => (checked(await listSocialWorks(options)) as unknown as { data: SocialWork[] }).data });
  const selectablePlans = plans.data?.filter((plan) => plan.isSelectable !== false) ?? [];
  const ready = selectablePlans.length > 0 && (professors.data?.length ?? 0) > 0 && !plans.isError && !professors.isError;
  const form = useForm<StudentValues>({ resolver: zodResolver(studentSchema), defaultValues: { firstName: '', lastName: '', dni: '', phone: '', birthDate: '', email: '', emergencyContactName: '', emergencyContactPhone: '', socialWorkId: '', affiliateNumber: '', planId: '', mainProfessorId: '' } });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [personId, setPersonId] = useState('');
  const candidates = useQuery({ queryKey: ['people', 'sala-candidates', search, page], enabled: mode === 'existing', queryFn: async () => checked(await listPeople({ search, page, pageSize: 25 }, options)) });
  const socialWorkId = form.watch('socialWorkId');
  const mutation = useMutation({ gcTime: 0, mutationFn: async (values?: StudentValues) => {
    if (!csrfToken) throw new Error('Sesión inválida');
    if (mode === 'existing') { checked(await joinSala({ personId, planId: form.getValues('planId'), mainProfessorId: form.getValues('mainProfessorId'), startDate: todayOperational() }, options)); return; }
    if (!values) throw new Error('Datos incompletos');
    const { email, socialWorkId, affiliateNumber, ...general } = values;
    const result = checked(await createSalaStudent({ ...general, ...(email ? { email } : {}), socialWorkId: socialWorkId || null, affiliateNumber: socialWorkId ? affiliateNumber.trim() : '' }, options)).data;
    return result.initialPin ? { pin: result.initialPin, firstName: result.firstName, lastName: result.lastName } : undefined;
  }, onSuccess: onSaved });
  const error = mutation.error as { status?: number; response?: { code?: string } } | null;
  return <div role="dialog" aria-modal="true" aria-labelledby="student-form-title" className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-md bg-white p-6 shadow-sm">
    <h2 id="student-form-title" className="mb-5 text-xl font-semibold">{mode === 'new' ? 'Nuevo alumno' : 'Incorporar Persona existente'}</h2>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={mode === 'new' ? form.handleSubmit((values) => mutation.mutate(values)) : (event) => { event.preventDefault(); if (personId && form.getValues('planId') && form.getValues('mainProfessorId')) mutation.mutate(undefined); }}>
      {mode === 'new' ? <>
        {([['firstName','Nombre'],['lastName','Apellido'],['dni','DNI'],['phone','Teléfono'],['birthDate','Fecha de nacimiento'],['email','Email (opcional)'],['emergencyContactName','Contacto de emergencia (opcional)'],['emergencyContactPhone','Teléfono de emergencia (opcional)']] as const).map(([name,label]) => <label key={name} className="text-sm">{label}<input aria-label={label} type={name === 'birthDate' ? 'date' : name === 'email' ? 'email' : 'text'} inputMode={name === 'dni' ? 'numeric' : name === 'phone' || name === 'emergencyContactPhone' ? 'tel' : undefined} maxLength={name === 'emergencyContactName' ? 150 : undefined} className={fieldClass} {...form.register(name)} /><span className="text-xs text-red-700">{form.formState.errors[name]?.message}</span></label>)}
        <label className="text-sm">Obra social (opcional)<select aria-label="Obra social (opcional)" className={fieldClass} {...form.register('socialWorkId', { onChange: (event: React.ChangeEvent<HTMLSelectElement>) => { if (!event.target.value) form.setValue('affiliateNumber', ''); } })}><option value="">Sin obra social</option>{works.data?.filter((work) => work.isSelectable).map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></label>
        <label className="text-sm">Número de afiliado (opcional)<input aria-label="Número de afiliado (opcional)" maxLength={100} disabled={!socialWorkId} className={fieldClass} {...form.register('affiliateNumber')} /></label>
        {works.isError && <p role="alert">No pudimos cargar las obras sociales.</p>}
      </> : <div className="space-y-3 sm:col-span-2">
        <label className="text-sm">Buscar Persona<input aria-label="Buscar Persona" placeholder="Nombre o DNI" className={fieldClass} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <label className="block text-sm">Persona<select aria-label="Persona" required className={fieldClass} value={personId} onChange={(event) => setPersonId(event.target.value)}><option value="">Seleccionar Persona</option>{candidates.data?.data.filter((person) => !person.hasSalaParticipation).map((person) => <option key={person.id} value={person.id}>{person.lastName}, {person.firstName} · {person.dni}</option>)}</select></label>
        {candidates.isLoading && <p role="status">Buscando Personas…</p>}{candidates.isError && <p role="alert">No pudimos buscar Personas.</p>}
        {candidates.data && !candidates.data.data.some((person) => !person.hasSalaParticipation) && <p className="text-sm text-muted-foreground">No hay Personas disponibles en esta página.</p>}
        {(candidates.data?.meta.totalPages ?? 0) > 1 && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button type="button" variant="secondary" disabled={page >= (candidates.data?.meta.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Siguiente</Button></div>}
      </div>}
      <label className="text-sm">Plan<select aria-label="Plan" required className={fieldClass} {...form.register('planId')}><option value="">Seleccionar Plan</option>{selectablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><span className="text-xs text-red-700">{form.formState.errors.planId?.message}</span></label>
      <label className="text-sm">Profesor principal<select aria-label="Profesor principal" required className={fieldClass} {...form.register('mainProfessorId')}><option value="">Seleccionar Profesor</option>{professors.data?.map((professor) => <option key={professor.id} value={professor.id}>{professor.lastName}, {professor.firstName}</option>)}</select><span className="text-xs text-red-700">{form.formState.errors.mainProfessorId?.message}</span></label>
      {plans.isLoading || professors.isLoading ? <p role="status">Cargando Planes y Profesores…</p> : <>
        {!plans.isError && !selectablePlans.length && <p className="text-sm sm:col-span-2">No hay Planes disponibles para incorporar alumnos. {canPlanManage && <Link className="underline" href="/sala/configuration">Configurar Planes</Link>}</p>}
        {!professors.isError && !professors.data?.length && <p className="text-sm sm:col-span-2">No hay Profesores activos disponibles.</p>}
      </>}
      {(plans.isError || professors.isError) && <p role="alert" className="sm:col-span-2">No pudimos cargar los Planes o Profesores.</p>}
      {mutation.isError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error?.status === 409 && error.response?.code === 'PERSON_DNI_ALREADY_EXISTS' ? 'Ya existe una Persona con ese DNI. Podés incorporarla a Sala como Persona existente.' : 'No pudimos incorporar a Sala. Revisá los datos e intentá nuevamente.'}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!ready || mutation.isPending || (mode === 'existing' && !personId)}>{mutation.isPending ? 'Guardando…' : mode === 'new' ? 'Guardar e incorporar' : 'Incorporar a Sala'}</Button></div>
    </form>
  </div></div>;
}

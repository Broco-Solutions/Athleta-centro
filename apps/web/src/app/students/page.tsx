'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSalaStudent, joinSala, listSalaPlans, listSalaProfessors, listSalaStudents, type PersonResponseDto } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { currentSession } from '../../features/auth/auth';
import { WorkspaceShell } from '../../features/auth/workspace-shell';

import { GeneralPersonFields, personSchema, personDefaults, personInput, type PersonValues } from '../../features/people/general-person-form';
import { fetchPeople } from '../../features/people/people-api';
import { ParticipationDialog } from '../../features/sala/participation-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

type Filter = 'all' | 'without-routine' | 'without-validity';
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'without-routine', label: 'Sin rutina' },
  { value: 'without-validity', label: 'Sin vigencia' },
];
const badge = (positive: boolean) => `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${positive ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`;
const cell = 'block min-w-0 px-4 py-1 text-sm xl:table-cell xl:py-3';
const label = 'mr-1 text-muted-foreground xl:hidden';

function StudentsContent(): React.JSX.Element {
  const params = useSearchParams();
  const requested = params.get('filter');
  const initialFilter: Filter = requested === 'without-routine' || requested === 'without-validity' ? requested : 'all';
  // A changed URL resets the local selection, including client-side dashboard navigation.
  return <StudentList key={initialFilter} initialFilter={initialFilter} />;
}

function StudentList({ initialFilter }: { initialFilter: Filter }): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [initialPin, setInitialPin] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const canManage = session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false;
  const canCreate = canManage && (session.data?.permissions.includes('PEOPLE_CREATE') ?? false);
  const isAdministrative = session.data?.roles.some(role => role === 'ADMINISTRATIVE' || role === 'GENERAL_ADMIN') ?? false;
  const isProfessor = session.data?.roles.includes('PROFESSOR') ?? false;
  const canUseFinance = Boolean(session.data?.permissions.includes('SALA_PAYMENT_MANAGE') && session.data?.permissions.includes('FINANCE_OPERATIONAL_READ'));
  const canRegister = session.data?.permissions.includes('SALA_PAYMENT_REGISTER') ?? false;
  const canRead = ['SALA_RELATION_READ', 'SALA_ROUTINE_READ', 'SALA_PAYMENT_READ'].every((permission) => session.data?.permissions.includes(permission));
  const query = useQuery({ queryKey: ['sala', 'students'], enabled: canRead, queryFn: async () => {
    const response = await listSalaStudents({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los alumnos.');
    return response.data.data;
  } });
  const students = query.data ?? [];
  const term = search.trim().toLocaleLowerCase('es');
  const filtered = students.filter((student) =>
    (`${student.firstName} ${student.lastName}`.toLocaleLowerCase('es').includes(term) || student.dni.includes(term)) &&
    (filter !== 'without-routine' || student.routineStatus === 'MISSING') &&
    (filter !== 'without-validity' || !student.hasValidAccess) &&
    (!mine || student.professor.id === session.data?.user.id));
  return <WorkspaceShell active="sala-students"><div className="mx-auto max-w-7xl space-y-5 text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Alumnos</h1><p className="mt-1 text-sm text-muted-foreground">{students.length} {students.length === 1 ? 'alumno' : 'alumnos'}</p></div>{canCreate ? <Button onClick={() => { setNotice(''); setCreating(true); }}>Nuevo alumno</Button> : null}</header>
    {notice ? <p role="status">{notice}</p> : null}
    <div className="space-y-3">
      <div className="relative w-full max-w-sm"><Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input aria-label="Buscar por nombre o DNI" placeholder="Buscar por nombre o DNI" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
      <div role="group" aria-label="Filtrar alumnos" className="flex flex-wrap gap-2">{filters.map((item) => <Button key={item.value} variant={filter === item.value ? 'primary' : 'secondary'} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</Button>)}{isProfessor ? <Button variant={mine ? 'primary' : 'secondary'} aria-pressed={mine} onClick={() => setMine(!mine)}>Mis alumnos</Button> : null}</div>
    </div>
    {session.isPending || (canRead && query.isPending) ? <p role="status" className="text-sm text-muted-foreground">Cargando alumnos…</p> : session.isSuccess && !canRead ? <p role="alert">No tenés permisos para consultar Alumnos.</p> : query.isError || session.isError ? <p role="alert">No se pudieron cargar los alumnos.</p> : filtered.length === 0 ? <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center"><p className="font-medium">{students.length ? 'Sin resultados' : 'No hay alumnos activos de Sala.'}</p>{students.length ? <p className="mt-1 text-sm text-muted-foreground">No hay alumnos que coincidan con la búsqueda y los filtros.</p> : null}</div> :
    <table aria-label="Alumnos activos de Sala" className="block w-full xl:table xl:table-fixed xl:overflow-hidden xl:rounded-md xl:border xl:border-border xl:bg-surface">
      <thead className="hidden bg-surface-muted text-left text-xs font-semibold text-muted-foreground xl:table-header-group"><tr>{['Alumno', 'DNI', 'Plan', 'Profesor', 'Rutina', 'Vigencia', 'Acción'].map((title) => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}</tr></thead>
      <tbody className="grid gap-3 sm:grid-cols-2 xl:table-row-group">{filtered.map((student) => <tr key={student.id} className="grid min-w-0 rounded-md border border-border bg-surface py-3 xl:table-row xl:border-0 xl:border-t xl:py-0">
        <td className={`${cell} break-words font-medium`}>{student.firstName} {student.lastName}</td>
        <td className={cell}><span className={label}>DNI</span>{student.dni}</td>
        <td className={`${cell} break-words`}><span className={label}>Plan:</span>{student.plan.name}</td>
        <td className={`${cell} break-words`}><span className={label}>Profesor:</span>{student.professor.firstName} {student.professor.lastName}</td>
        <td className={cell}><span className={label}>Rutina:</span><span className={badge(student.routineStatus === 'ACTIVE')}>{student.routineStatus === 'ACTIVE' ? 'Activa' : 'Sin rutina'}</span></td>
        <td className={cell}><span className={label}>Vigencia:</span><span className={badge(student.hasValidAccess)}>{student.hasValidAccess ? `Vigente hasta ${student.validUntil?.split('-').reverse().join('/')}` : 'Sin vigencia'}</span></td>
        <td className={cell}><div className="flex flex-wrap justify-end gap-2 xl:justify-start"><Link href={`/sala/people/${student.id}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-9">Ver ficha</Link>{canUseFinance || canRegister ? <Link href={canUseFinance ? `/finance?view=income&personId=${student.id}${!student.hasValidAccess ? '&action=renew' : ''}` : `/sala/people/${student.id}?tab=payments${!student.hasValidAccess ? '&action=renew' : ''}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted xl:min-h-9">{!student.hasValidAccess ? (canUseFinance ? 'Renovar' : 'Registrar renovación') : 'Ver pagos'}</Link> : null}</div></td>
      </tr>)}</tbody>
    </table>}
    {creating && canCreate ? <NewStudentDialog isAdministrative={isAdministrative} csrf={session.data?.csrfToken ?? ''} onClose={() => setCreating(false)} onSaved={async (pin) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['sala', 'students'] }),
        client.invalidateQueries({ queryKey: ['people'] }),
        client.invalidateQueries({ queryKey: ['sala-participations'] }),
      ]);
      setCreating(false);
      if (pin) setInitialPin(pin);
      else setNotice('El Alumno fue incorporado a Sala.');
    }} /> : null}
    {initialPin ? <InitialPinDialog pin={initialPin} onClose={() => setInitialPin(null)} /> : null}
  </div></WorkspaceShell>;
}

export default function StudentsPage(): React.JSX.Element {
  return <Suspense fallback={<p role="status" className="p-6">Cargando alumnos…</p>}><StudentsContent /></Suspense>;
}

function todayOperational(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const dniSchema = z.string().refine((value) => !/[^0-9 .-]/.test(value) && /^\d{6,8}$/.test(value.replace(/[^0-9]/g, '')), 'El DNI debe tener entre 6 y 8 dígitos.').transform((value) => value.replace(/[^0-9]/g, ''));
const inputClass = 'h-11 w-full rounded-md border border-border bg-surface px-3 text-sm';
type EnrollmentProps = { isAdministrative: boolean; csrf: string; onClose: () => void; onSaved: (pin?: string) => Promise<void> };

type StudentCreationMode = 'existing' | 'new';

function NewStudentDialog(props: EnrollmentProps): React.JSX.Element {
  return props.isAdministrative ? <AdministrativeNewStudentDialog {...props} /> : <ProfessorNewStudentDialog {...props} />;
}

function AdministrativeNewStudentDialog({ csrf, onClose, onSaved }: EnrollmentProps): React.JSX.Element {
  const [mode, setMode] = useState<StudentCreationMode>('existing');
  const [search, setSearch] = useState('');
  const [personId, setPersonId] = useState('');
  const [planId, setPlanId] = useState('');
  const [mainProfessorId, setMainProfessorId] = useState('');
  const term = search.trim();
  const people = useQuery({ queryKey: ['people', 'student-enrollment', term], enabled: mode === 'existing' && term.length > 0, queryFn: () => fetchPeople({ search: term, page: 1, pageSize: 10 }) });
  const selectedPerson = people.isSuccess ? people.data.data.find(person => person.id === personId) : undefined;
  const needsJoin = selectedPerson?.hasSalaParticipation === false;
  const catalogsEnabled = mode === 'new' || needsJoin;
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: catalogsEnabled, queryFn: async () => {
    const response = await listSalaPlans({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los Planes.');
    return z.array(z.object({ id: z.string(), name: z.string(), isSelectable: z.boolean().optional() }).passthrough()).parse(response.data.data);
  } });
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: catalogsEnabled, queryFn: async () => {
    const response = await listSalaProfessors({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los profesores.');
    return response.data.data;
  } });
  const mutation = useMutation({ mutationFn: async () => {
    if (!selectedPerson || !needsJoin || !planId || !mainProfessorId) throw new Error('Seleccioná Persona, Plan y Profesor principal.');
    if (!csrf) throw new Error('Sesión inválida. Volvé a iniciar sesión.');
    const response = await joinSala({ personId: selectedPerson.id, planId, mainProfessorId, startDate: todayOperational() }, { credentials: 'include', headers: { 'x-csrf-token': csrf } });
    if (response.status < 200 || response.status >= 300) throw new Error('No se pudo incorporar la Persona a Sala. Revisá si ya es alumno activo e intentá nuevamente.');
  }, onSuccess: () => onSaved() });
  const resetSelection = () => { setPersonId(''); setPlanId(''); setMainProfessorId(''); mutation.reset(); };
  const selectablePlans = plans.data?.filter(plan => plan.isSelectable !== false) ?? [];
  if (mode === 'new') return <AdministrativeEnrollmentForm csrf={csrf} onClose={onClose} onSaved={onSaved} onExisting={() => setMode('existing')} plans={selectablePlans} professors={professors.data ?? []} catalogsReady={plans.isSuccess && professors.isSuccess} catalogsError={plans.isError || professors.isError} />;
  return <ParticipationDialog title="Nuevo alumno" onClose={onClose} busy={mutation.isPending}>
    <Button variant="secondary" disabled={mutation.isPending} onClick={() => { resetSelection(); setMode('new'); }}>Nueva Persona</Button>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
      <label className="grid gap-1 text-sm">Buscar Persona<input aria-label="Buscar Persona" placeholder="Nombre, apellido o DNI" className={inputClass} value={search} disabled={mutation.isPending} onChange={event => { setSearch(event.target.value); resetSelection(); }} /></label>
      {term ? people.isFetching ? <p role="status">Buscando Personas…</p> : people.isError ? <p role="alert">No pudimos buscar Personas. Intentá nuevamente.</p> : people.isSuccess && !people.data.data.length ? <p role="status">No encontramos una Persona con esa búsqueda.</p> : people.isSuccess ? <div className="grid gap-2" role="group" aria-label="Resultados">
        <p className="text-sm font-medium">Resultados</p>
        {people.data.data.map(person => <button key={person.id} type="button" aria-label={`${person.firstName} ${person.lastName} · DNI ${person.dni}`} aria-pressed={personId === person.id} disabled={mutation.isPending} className={`w-full rounded-md border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${personId === person.id ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-muted'}`} onClick={() => { resetSelection(); setPersonId(person.id); }}>
          <span className="block font-medium">{person.firstName} {person.lastName}</span>
          <span className="block text-muted-foreground">DNI {person.dni}</span>
        </button>)}
      </div> : null : null}
      {selectedPerson?.hasSalaParticipation === true ? <p role="status">Esta Persona ya es alumno activo de Sala.</p> : null}
      {needsJoin ? <>
        <label className="grid gap-1 text-sm">Plan *<select aria-label="Plan" required className={inputClass} value={planId} disabled={mutation.isPending} onChange={event => setPlanId(event.target.value)}><option value="">Seleccionar Plan</option>{selectablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Profesor principal *<select aria-label="Profesor principal" required className={inputClass} value={mainProfessorId} disabled={mutation.isPending} onChange={event => setMainProfessorId(event.target.value)}><option value="">Seleccionar Profesor</option>{professors.data?.map(professor => <option key={professor.id} value={professor.id}>{professor.firstName} {professor.lastName}</option>)}</select></label>
        {plans.isError || professors.isError ? <p role="alert">No se pudieron cargar los Planes o Profesores. Cerrá el alta e intentá nuevamente.</p> : !plans.isSuccess || !professors.isSuccess ? <p role="status">Cargando Planes y Profesores…</p> : null}
      </> : null}
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button>{needsJoin ? <Button type="submit" disabled={mutation.isPending || !plans.isSuccess || !professors.isSuccess || !planId || !mainProfessorId}>{mutation.isPending ? 'Incorporando…' : 'Incorporar a Sala'}</Button> : null}</div>
    </form>
  </ParticipationDialog>;
}

function ProfessorNewStudentDialog(props: EnrollmentProps): React.JSX.Element {
  const [match, setMatch] = useState<{ dni: string; person?: PersonResponseDto | undefined } | null>(null);
  const form = useForm({ resolver: zodResolver(z.object({ dni: dniSchema })), defaultValues: { dni: '' } });
  const lookup = useMutation({ mutationFn: async ({ dni }: { dni: string }) => {
    const result = await fetchPeople({ search: dni, page: 1, pageSize: 25 });
    setMatch({ dni, person: result.data.find((person) => person.dni === dni) });
  } });
  if (match) return <StudentEnrollmentForm {...props} dni={match.dni} person={match.person} />;
  return <ParticipationDialog title="Nuevo alumno" onClose={props.onClose} busy={lookup.isPending}>
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => lookup.mutate(values))}>
      <label className="grid gap-1 text-sm">DNI<input className={inputClass} inputMode="numeric" {...form.register('dni')} /></label>
      {form.formState.errors.dni ? <p role="alert">{form.formState.errors.dni.message}</p> : null}
      {lookup.isError ? <p role="alert">No se pudo buscar la Persona. Intentá nuevamente.</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={lookup.isPending} onClick={props.onClose}>Cancelar</Button><Button type="submit" disabled={lookup.isPending}>{lookup.isPending ? 'Buscando…' : 'Continuar'}</Button></div>
    </form>
  </ParticipationDialog>;
}

function StudentEnrollmentForm({ dni, person, csrf, onClose, onSaved }: EnrollmentProps & { dni: string; person?: PersonResponseDto | undefined }): React.JSX.Element {
  const alreadyActive = person?.hasSalaParticipation === true;
  const schema = z.object({
    firstName: z.string().trim().refine((value) => !!person || !!value, 'Ingresá el nombre'),
    lastName: z.string().trim().refine((value) => !!person || !!value, 'Ingresá el apellido'),
    phone: z.string().refine((value) => !!person || (!/[^0-9 ().-]/.test(value) && /^[1-9]\d{9}$/.test(value.replace(/[^0-9]/g, ''))), 'El teléfono debe tener 10 dígitos.').transform((value) => value.replace(/[^0-9]/g, '')),
    birthDate: z.string().refine((value) => !!person || !!value, 'Ingresá la fecha').refine((value) => !!person || value <= todayOperational(), 'La fecha de nacimiento no puede ser futura'),
    planId: z.string().min(1, 'Seleccioná un Plan.'),
    mainProfessorId: z.string().min(1, 'Seleccioná un profesor.'),
  });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { firstName: '', lastName: '', phone: '', birthDate: '', planId: '', mainProfessorId: '' } });
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: !alreadyActive, queryFn: async () => {
    const response = await listSalaPlans({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los Planes.');
    return z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).parse(response.data.data);
  } });
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: !alreadyActive, queryFn: async () => {
    const response = await listSalaProfessors({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los profesores.');
    return response.data.data;
  } });
  const mutation = useMutation({ mutationFn: async (values: z.infer<typeof schema>) => {
    if (alreadyActive) throw new Error('Esta Persona ya es alumno activo de Sala.');
    if (!csrf) throw new Error('Sesión inválida. Volvé a iniciar sesión.');
    const options = { credentials: 'include', headers: { 'x-csrf-token': csrf } } satisfies RequestInit;
    const { planId, mainProfessorId } = values;
    if (person) {
      const response = await joinSala({ personId: person.id, planId, mainProfessorId, startDate: todayOperational() }, options);
      if (response.status < 200 || response.status >= 300) throw new Error('No se pudo incorporar la Persona a Sala. Revisá si ya es alumno activo e intentá nuevamente.');
      return;
    }
    const response = await createSalaStudent({ ...values, dni }, options);
    if (Number(response.status) === 409) throw new Error('Ya existe una Persona con ese DNI. Cerrá el alta y volvé a buscar el DNI.');
    if (response.status < 200 || response.status >= 300) throw new Error('No se pudo crear el Alumno. Intentá nuevamente.');
    // Pass the credential directly to the one-time notice, without retaining it in the mutation cache.
    await onSaved(response.data.data.initialPin);
  }, onSuccess: async () => { if (person) await onSaved(); } });
  return <ParticipationDialog title="Nuevo alumno" onClose={onClose} busy={mutation.isPending}>
    {person ? <p>{person.firstName} {person.lastName} · DNI {dni}</p> : <p>DNI {dni}</p>}
    {alreadyActive ? <><p role="status">Esta Persona ya es alumno activo de Sala.</p><Button onClick={onClose}>Entendido</Button></> : <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
      {!person ? ([['firstName', 'Nombre'], ['lastName', 'Apellido'], ['phone', 'Teléfono'], ['birthDate', 'Fecha de nacimiento']] as const).map(([name, title]) => <label key={name} className="grid gap-1 text-sm">{title}<input className={inputClass} type={name === 'birthDate' ? 'date' : 'text'} {...form.register(name)} /></label>) : null}
      <label className="grid gap-1 text-sm">Plan<select className={inputClass} {...form.register('planId')}><option value="">Seleccionar Plan</option>{plans.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Profesor principal<select className={inputClass} {...form.register('mainProfessorId')}><option value="">Seleccionar profesor</option>{professors.data?.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
      {Object.entries(form.formState.errors).map(([name, error]) => <p role="alert" key={name}>{error.message}</p>)}
      {plans.isError || professors.isError ? <p role="alert">No se pudieron cargar los Planes o Profesores. Cerrá el alta e intentá nuevamente.</p> : null}
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" disabled={mutation.isPending || !plans.isSuccess || !professors.isSuccess}>{mutation.isPending ? 'Guardando…' : 'Guardar alumno'}</Button></div>
    </form>}
  </ParticipationDialog>;
}

function AdministrativeEnrollmentForm({ csrf, onClose, onSaved, onExisting, plans, professors, catalogsReady, catalogsError }: Omit<EnrollmentProps, 'isAdministrative'> & { onExisting: () => void; plans: Array<{ id: string; name: string }>; professors: Array<{ id: string; firstName: string; lastName: string }>; catalogsReady: boolean; catalogsError: boolean }): React.JSX.Element {
  const schema = personSchema.extend({ planId: z.string().min(1, 'Seleccioná un Plan.'), mainProfessorId: z.string().min(1, 'Seleccioná un profesor.') });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { ...personDefaults(), planId: '', mainProfessorId: '' } });
  const generalForm: import('react-hook-form').UseFormReturn<PersonValues> = form as unknown as import('react-hook-form').UseFormReturn<PersonValues>;
  const mutation = useMutation({ gcTime: 0, mutationFn: async (values: z.infer<typeof schema>) => {
    if (!csrf) throw new Error('Sesión inválida. Volvé a iniciar sesión.');
    const { planId, mainProfessorId, ...general } = values;
    const response = await createSalaStudent({ ...personInput(general), planId, mainProfessorId }, { credentials: 'include', headers: { 'x-csrf-token': csrf } });
    if (Number(response.status) === 409) throw new Error('Ya existe una Persona con ese DNI. Volvé a Persona existente y buscala.');
    if (response.status < 200 || response.status >= 300) throw new Error('No se pudo crear el Alumno. Intentá nuevamente.');
    await onSaved(response.data.data.initialPin);
  } });
  return <ParticipationDialog title="Nuevo alumno" onClose={onClose} busy={mutation.isPending}>
    <Button variant="secondary" disabled={mutation.isPending} onClick={onExisting}>Persona existente</Button>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(values => mutation.mutate(values))}>
      <GeneralPersonFields form={generalForm} />
      <label className="grid gap-1 text-sm">Plan *<select aria-label="Plan" className={inputClass} {...form.register('planId')}><option value="">Seleccionar Plan</option>{plans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Profesor principal *<select aria-label="Profesor principal" className={inputClass} {...form.register('mainProfessorId')}><option value="">Seleccionar profesor</option>{professors.map(item => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
      {Object.entries(form.formState.errors).filter(([name]) => name === 'planId' || name === 'mainProfessorId').map(([name, error]) => <p role="alert" key={name}>{error.message}</p>)}
      {catalogsError ? <p role="alert">No se pudieron cargar los Planes o Profesores. Cerrá el alta e intentá nuevamente.</p> : !catalogsReady ? <p role="status">Cargando Planes y Profesores…</p> : null}
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={mutation.isPending || !catalogsReady}>{mutation.isPending ? 'Guardando…' : 'Crear alumno'}</Button></div>
    </form>
  </ParticipationDialog>;
}

function InitialPinDialog({ pin, onClose }: { pin: string; onClose: () => void }): React.JSX.Element {
  const [copyStatus, setCopyStatus] = useState('');
  return <ParticipationDialog title="Alumno creado — PIN temporal" onClose={onClose}>
    <p aria-label="PIN temporal" className="text-center font-mono text-4xl font-bold tracking-widest">{pin}</p>
    <p>Este PIN temporal se muestra una sola vez. Compartilo de forma segura con la Persona.</p>
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(pin); setCopyStatus('PIN copiado'); }
      catch { setCopyStatus('No se pudo copiar el PIN. Copialo manualmente.'); }
    }}>Copiar PIN</Button><Button onClick={onClose}>Entendido</Button></div>
    {copyStatus ? <p role="status">{copyStatus}</p> : null}
  </ParticipationDialog>;
}

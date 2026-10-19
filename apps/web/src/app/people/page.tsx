'use client';
import React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, X, ExternalLink } from 'lucide-react';
import { GeneralPersonFields, personSchema as schema, personDefaults, type PersonValues as Values } from '../../features/people/general-person-form';
import { Button } from '@athleta/ui';
import type { CreatePersonDto, PersonResponseDto } from '@athleta/api-client';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { addPerson, editPerson, fetchPeople, resetPersonPortalPin } from '../../features/people/people-api';
import { createSalaStudent, joinSala, listPersonSalaParticipations, listSalaPlans, listSalaProfessors } from '@athleta/api-client';
import { ParticipationManagement } from '../../features/sala/participation-management';
function todayOperational(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
type CreatedPersonNotice = { pin: string; firstName: string; lastName: string };
function PersonForm({ person, onClose, onCreated, onUpdated }: { person?: PersonResponseDto; onClose: () => void; onCreated: (notice: CreatedPersonNotice) => void; onUpdated: () => void }): React.JSX.Element {
  const client = useQueryClient(); const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const [resetConfirmation, setResetConfirmation] = useState(false); const [generatedPin, setGeneratedPin] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: personDefaults(person) });
  const canJoinSala = !person && ['PEOPLE_CREATE', 'SALA_PARTICIPATION_MANAGE'].every((permission) => session.data?.permissions.includes(permission));
  const [incorporateSala, setIncorporateSala] = useState(false);
  const [planId, setPlanId] = useState('');
  const [mainProfessorId, setMainProfessorId] = useState('');
  const [salaSubmitted, setSalaSubmitted] = useState(false);
  const creatingStudent = canJoinSala && incorporateSala;
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: creatingStudent, queryFn: async () => {
    const response = await listSalaPlans({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los Planes.');
    return response.data.data as unknown as CatalogPlan[];
  } });
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: creatingStudent, queryFn: async () => {
    const response = await listSalaProfessors({ credentials: 'include' });
    if (response.status !== 200) throw new Error('No se pudieron cargar los profesores.');
    return response.data.data;
  } });
  const mutation = useMutation({ mutationFn: async (values: Values) => {
    const csrf = session.data?.csrfToken;
    if (!csrf) throw new Error('Sesión inválida');
    const { email, socialWorkId, affiliateNumber, ...general } = values;
    const clean = { ...general, socialWorkId: socialWorkId || null, affiliateNumber: socialWorkId ? affiliateNumber.trim() : '', ...(person ? { email: email || null } : email ? { email } : {}) };
    if (person) return editPerson(person.id, clean, csrf);
    if (!creatingStudent) return addPerson(clean as CreatePersonDto, csrf);
    const response = await createSalaStudent({ ...clean, planId, mainProfessorId }, { credentials: 'include', headers: { 'x-csrf-token': csrf } });
    if (response.status < 200 || response.status >= 300) throw Object.assign(new Error('No pudimos guardar los datos.'), { status: response.status });
    return response.data.data;
  }, onSuccess: async (result) => {
    await client.invalidateQueries({ queryKey: ['people'] });
    if (creatingStudent) {
      await client.invalidateQueries({ queryKey: ['sala', 'students'] });
      await client.invalidateQueries({ queryKey: ['sala-participations'] });
    }
    if (!person && result.initialPin) { onCreated({ pin: result.initialPin, firstName: result.firstName, lastName: result.lastName }); }
    else if (person) { onUpdated(); }
    onClose();
  } });
  const save = form.handleSubmit((values) => {
    if (creatingStudent) {
      setSalaSubmitted(true);
      if (!planId || !mainProfessorId) return;
    }
    mutation.mutate(values);
  });
  const reset = useMutation({ mutationFn: async () => { const csrf = session.data?.csrfToken; if (!csrf || !person) throw new Error('Sesión inválida'); return resetPersonPortalPin(person.id, csrf); }, onSuccess: (pin) => { setResetConfirmation(false); setGeneratedPin(pin); setCopied(false); } });
  const copyPin = async () => { if (!generatedPin) return; try { await navigator.clipboard.writeText(generatedPin); setCopied(true); } catch { setCopied(false); } };
  return <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-md bg-white p-6 shadow-sm"><div className="mb-5 flex items-center justify-between"><h2 className="m-0 text-xl font-semibold">{person ? 'Editar Persona' : 'Nueva Persona'}</h2><Button variant="ghost" aria-label="Cerrar" onClick={onClose}><X size={18} /></Button></div><form className="grid gap-4 sm:grid-cols-2" onSubmit={save}><GeneralPersonFields form={form} {...(person ? { person } : {})}/>{canJoinSala && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={incorporateSala} onChange={(event) => { setIncorporateSala(event.target.checked); setSalaSubmitted(false); }} />Incorporar también a Sala</label>}
    {creatingStudent && <>
      <section className="border-t border-border pt-4 sm:col-span-2">
        <h3 className="mb-3 text-sm font-semibold">Entrenamiento</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Plan *<select aria-label="Plan" className={fieldClass} value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">Seleccionar Plan</option>{plans.data?.filter((item) => item.isSelectable !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{salaSubmitted && !planId && <span role="alert" className="text-xs text-red-700">Seleccioná un Plan.</span>}</label>
          <label className="text-sm">Profesor principal *<select aria-label="Profesor principal" className={fieldClass} value={mainProfessorId} onChange={(event) => setMainProfessorId(event.target.value)}><option value="">Seleccionar Profesor</option>{professors.data?.map((item) => <option key={item.id} value={item.id}>{item.lastName}, {item.firstName}</option>)}</select>{salaSubmitted && !mainProfessorId && <span role="alert" className="text-xs text-red-700">Seleccioná un Profesor principal.</span>}</label>
        </div>
        {(plans.isError || professors.isError) && <p role="alert" className="mt-3 text-sm text-red-700">No pudimos cargar los Planes o Profesores.</p>}
      </section>
    </>}{mutation.isError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{(mutation.error as { status?: number }).status === 409 ? 'Ya existe una Persona con ese DNI.' : 'No pudimos guardar los datos.'}</p>}{person && <><Button type="button" variant="secondary" disabled={reset.isPending} onClick={() => setResetConfirmation(true)}>{reset.isPending ? 'Generando…' : 'Resetear PIN del Portal'}</Button>{reset.isError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">No pudimos generar un nuevo PIN. Intentá nuevamente.</p>}<SalaParticipationPanel personId={person.id} /></>}<div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar'}</Button></div></form>{resetConfirmation && <div role="dialog" aria-modal="true" aria-labelledby="reset-pin-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-md bg-white p-6 shadow-lg"><h3 id="reset-pin-title" className="text-lg font-semibold">Resetear PIN del Portal</h3><p className="mt-2 text-sm text-muted-foreground">Se generará un nuevo PIN temporal. El PIN actual dejará de funcionar.</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setResetConfirmation(false)}>Cancelar</Button><Button type="button" onClick={() => reset.mutate()} disabled={reset.isPending}>{reset.isPending ? 'Generando…' : 'Generar nuevo PIN'}</Button></div></div></div>}{generatedPin && <div role="dialog" aria-modal="true" aria-labelledby="new-pin-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-md bg-white p-6 text-center shadow-lg"><h3 id="new-pin-title" className="text-lg font-semibold">Nuevo PIN del Portal</h3><p className="mt-2 text-sm">{person?.firstName} {person?.lastName}</p><p className="mt-5 font-mono text-4xl font-bold tracking-[0.35em]" aria-label="PIN temporal">{generatedPin}</p><p className="mt-3 text-sm text-muted-foreground">Este PIN se mostrará una sola vez. Compartilo de forma segura con la Persona.</p><div className="mt-5 flex justify-center gap-2"><Button type="button" variant="secondary" onClick={copyPin}>Copiar PIN</Button><Button type="button" onClick={() => setGeneratedPin(null)}>Entendido</Button></div>{copied && <p role="status" className="mt-3 text-sm text-green-700">PIN copiado</p>}</div></div>}</div></div>; }

const calendarDate=(value:string)=>{const match=value.match(/^(\d{4})-(\d{2})-(\d{2})/);return match?`${match[3]}/${match[2]}/${match[1]}`:value};
type CatalogPlan = { id: string; name: string; isSelectable?: boolean }; type CatalogUser = { id: string; firstName: string; lastName: string };
function SalaParticipationPanel({ personId }: { personId: string }): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false }); const client = useQueryClient(); const csrf = session.data?.csrfToken;
  const canManageSalaParticipation = session.data?.permissions.includes('SALA_PARTICIPATION_MANAGE') ?? false;
  const options = { credentials: 'include', headers: { 'x-csrf-token': csrf ?? '' } } satisfies RequestInit;
  const history = useQuery({ queryKey: ['sala-participations', personId], queryFn: async () => (await listPersonSalaParticipations(personId, options)).data.data });
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: canManageSalaParticipation, queryFn: async () => (await listSalaPlans(options)).data.data as unknown as CatalogPlan[] });
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: canManageSalaParticipation, queryFn: async () => (await listSalaProfessors(options)).data.data as unknown as CatalogUser[] });
  const current = history.data?.find((item) => !item.endDate); const selectablePlans = plans.data?.filter((item) => item.isSelectable !== false) ?? []; const selectableProfessors = professors.data ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: ['sala-participations', personId] });
  const action = useMutation({ mutationFn: async (input: { id?: string; value?: string }) => { if (!csrf) throw new Error('Sesión inválida'); const response = await joinSala({ personId, planId: input.id ?? '', mainProfessorId: input.value ?? '', startDate: todayOperational() }, options); if (response.status >= 400) throw new Error('No se pudo incorporar a Sala.'); return response; }, onSuccess: refresh });
  return <section className="mt-4 rounded-md border bg-surface-muted p-4 sm:col-span-2"><h3 className="mb-3 font-semibold">Participación en Sala</h3>{current ? <><div className="mb-3 grid gap-3 sm:grid-cols-2"><p className="text-sm">Plan actual<br/><strong>{current.plan?.name ?? 'Plan'}</strong></p><p className="text-sm">Profesor principal<br/><strong>{current.mainProfessor ? `${current.mainProfessor.lastName ?? ''}, ${current.mainProfessor.firstName ?? ''}` : 'Profesor'}</strong></p></div><ParticipationManagement personId={personId} active={current} roles={session.data?.roles ?? []} permissions={session.data?.permissions ?? []} csrfToken={csrf ?? ''}/></> : canManageSalaParticipation ? <JoinSalaForm plans={selectablePlans} professors={selectableProfessors} onJoin={(planId, professorId) => action.mutate({ id: planId, value: professorId })} pending={action.isPending} /> : <p className="text-sm">Sin participación activa en Sala.</p>}{history.data && history.data.length > 0 && <div className="mt-4"><h4 className="font-medium">Historial</h4>{history.data.map((item) => <p key={item.id} className="text-sm">{calendarDate(item.startDate)} — {item.endDate ? calendarDate(item.endDate) : 'Actual'} · {item.plan?.name ?? 'Plan'}</p>)}</div>}</section>;
}
function JoinSalaForm({ plans, professors, onJoin, pending }: { plans: CatalogPlan[]; professors: CatalogUser[]; onJoin: (planId: string, professorId: string) => void; pending: boolean }): React.JSX.Element { const [plan, setPlan] = useState(''); const [professor, setProfessor] = useState(''); return <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Plan<select className={fieldClass} value={plan} onChange={(event) => setPlan(event.target.value)}><option value="">Seleccionar</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm">Profesor principal<select className={fieldClass} value={professor} onChange={(event) => setProfessor(event.target.value)}><option value="">Seleccionar</option>{professors.map((item) => <option key={item.id} value={item.id}>{item.lastName}, {item.firstName}</option>)}</select></label><Button type="button" disabled={!plan || !professor || pending} onClick={() => onJoin(plan, professor)}>Incorporar a Sala</Button></div>; }
export default function PeoplePage(): React.JSX.Element {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const isProfessorOnly = session.data?.roles.length === 1 && session.data.roles.includes('PROFESSOR');
  const canCreate = !isProfessorOnly && (session.data?.permissions.includes('PEOPLE_CREATE') ?? false);
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [editing, setEditing] = useState<PersonResponseDto | null | undefined>();
  const [createdNotice, setCreatedNotice] = useState<CreatedPersonNotice | null>(null);
  const [updatedNotice, setUpdatedNotice] = useState(false);
  const [createdPinCopied, setCreatedPinCopied] = useState(false);
  const openForm = (person: PersonResponseDto | null) => { setCreatedNotice(null); setCreatedPinCopied(false); setUpdatedNotice(false); setEditing(person); };
  const copyCreatedPin = async () => { if (!createdNotice) return; try { await navigator.clipboard.writeText(createdNotice.pin); setCreatedPinCopied(true); } catch { setCreatedPinCopied(false); } };
  const people = useQuery({ queryKey: ['people', search, page], queryFn: () => fetchPeople({ ...(search ? { search } : {}), page, pageSize: 10 }), placeholderData: (previous) => previous });
  return <WorkspaceShell active="people"><header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm font-medium text-muted-foreground">Identidad transversal</p><h1 className="m-0 text-3xl font-semibold">Personas</h1></div>{canCreate && <Button onClick={() => openForm(null)}><UserPlus size={17} /> Nueva Persona</Button>}</header>
    {createdNotice && <div role="dialog" aria-modal="true" aria-labelledby="created-person-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-md bg-white p-6 text-center shadow-lg">
      <h3 id="created-person-title" className="text-lg font-semibold">Persona guardada correctamente</h3>
      <p className="mt-2 text-sm">{createdNotice.firstName} {createdNotice.lastName}</p>
      <p className="mt-5 text-sm">PIN temporal del Portal</p>
      <p aria-label="PIN temporal" className="mt-1 font-mono text-4xl font-bold tracking-[0.35em]">{createdNotice.pin}</p>
      <p className="mt-3 text-sm text-muted-foreground">Este PIN se mostrará una sola vez. Compartilo de forma segura con la Persona.</p>
      <div className="mt-5 flex justify-center gap-2"><Button type="button" variant="secondary" onClick={copyCreatedPin}>Copiar PIN</Button><Button type="button" onClick={() => { setCreatedNotice(null); setCreatedPinCopied(false); }}>Entendido</Button></div>
      {createdPinCopied && <p role="status" className="mt-3 text-sm text-green-700">PIN copiado</p>}
    </div></div>}
    {updatedNotice && <p role="status" className="mb-5 rounded-md border bg-white p-4 font-medium text-green-800">Cambios guardados correctamente.</p>}
    <div className="mb-5 flex max-w-lg items-center gap-2 rounded-md border bg-white px-3"><Search size={18} className="text-muted-foreground"/><input aria-label="Buscar Personas" className="h-11 flex-1 outline-none" placeholder="Buscar por nombre o DNI" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div><div className="overflow-hidden rounded-md border bg-white"><table className="w-full border-collapse text-left text-sm"><thead className="bg-surface-muted"><tr><th className="p-3">Nombre</th><th className="p-3">DNI</th><th className="hidden p-3 sm:table-cell">Teléfono</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead><tbody>{people.data?.data.map((person) => <tr key={person.id} className="cursor-pointer border-t hover:bg-surface-muted" onClick={() => openForm(person)}><td className="p-3 font-medium">{person.lastName}, {person.firstName}</td><td className="p-3">{person.dni}</td><td className="hidden p-3 sm:table-cell">{person.phone}</td><td className="p-3 text-muted-foreground">{person.status === 'ACTIVE' ? (person.hasSalaParticipation ? 'Activo · Sala' : 'Activo') : 'Inactivo'}</td><td className="p-3"><a href={"/people/" + person.id} className="inline-flex items-center gap-1 text-sm font-medium underline" onClick={(event) => event.stopPropagation()}>Abrir ficha <ExternalLink size={14} aria-hidden="true" /></a> <a href={`/sala/people/${person.id}`} className="ml-2 text-sm underline" onClick={(event) => event.stopPropagation()}>Abrir Sala</a> <button type="button" className="ml-2 text-sm underline" onClick={(event) => { event.stopPropagation(); openForm(person); }}>Editar</button></td></tr>)}</tbody></table>{people.isLoading && <p className="p-5 text-sm text-muted-foreground">Cargando…</p>}{!people.isLoading && people.data?.data.length === 0 && <p className="p-5 text-sm text-muted-foreground">No encontramos Personas.</p>}</div><div className="mt-4 flex items-center justify-between text-sm"><span>{people.data?.meta.total ?? 0} Personas</span><div className="flex gap-2"><Button variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button variant="secondary" disabled={page >= (people.data?.meta.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></div>{editing !== undefined && <PersonForm {...(editing ? { person: editing } : {})} onCreated={(notice) => { setCreatedNotice(notice); setCreatedPinCopied(false); }} onUpdated={() => setUpdatedNotice(true)} onClose={() => setEditing(undefined)} />}</WorkspaceShell>;
}

'use client';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import { changeSalaPlan, changeSalaProfessor, getSalaLeaveImpact, leaveSala, listSalaPlans, listSalaProfessors, updateSalaObjective, type SalaLeaveImpactDto, type UpdateSalaObjectiveDto } from '@athleta/api-client';
import { ParticipationDialog } from './participation-dialog';

export type ManagedParticipation = { id: string; objective?: string | null; mainProfessorId?: string; planId?: string; mainProfessor?: { id?: string; firstName?: string; lastName?: string } | null; plan?: { id?: string; name?: string } };
type Action = 'objective' | 'professor' | 'plan' | 'leave';
const schema = z.object({ objective: z.string().max(500, 'Máximo 500 caracteres.'), selectedId: z.string() });
type Values = z.infer<typeof schema>;
const titles: Record<Action, string> = { objective: 'Editar Objetivo', professor: 'Cambiar profesor principal', plan: 'Cambiar Plan', leave: 'Dar de baja de Sala' };
const impactLabels: Record<keyof SalaLeaveImpactDto, string> = { fixedBookings: 'Turnos fijos a finalizar', futureReservations: 'Reservas futuras a cancelar', activeRoutines: 'Rutina activa que pasará a histórica', activeClinicalIndications: 'Indicaciones activas para Sala a cerrar' };
const checked = <T extends { status: number }>(response: T): T => { if (response.status >= 400) throw new Error('No se pudo completar la operación. Intentá nuevamente.'); return response; };

export function ParticipationManagement({ personId, active, roles, permissions, csrfToken }: { personId: string; active: ManagedParticipation; roles: readonly string[]; permissions: readonly string[]; csrfToken: string }): React.JSX.Element {
  const [action, setAction] = useState<Action | null>(null);
  const canManage = permissions.includes('SALA_PARTICIPATION_MANAGE');
  const canEditObjective = roles.includes('PROFESSOR') || roles.includes('GENERAL_ADMIN');
  return <section className="space-y-4 rounded-md border border-border bg-surface p-5">
    <div><h2 className="font-semibold">Objetivo</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{active.objective || 'Sin objetivo definido.'}</p>{canEditObjective ? <Button variant="secondary" className="mt-3" onClick={() => setAction('objective')}>Editar</Button> : null}</div>
    {canManage ? <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setAction('professor')}>Cambiar profesor principal</Button><Button variant="secondary" onClick={() => setAction('plan')}>Cambiar Plan</Button><Button variant="secondary" onClick={() => setAction('leave')}>Dar de baja de Sala</Button></div> : null}
    {action ? <ManagementDialog action={action} active={active} personId={personId} csrfToken={csrfToken} onClose={() => setAction(null)}/> : null}
  </section>;
}

function ManagementDialog({ action, active, personId, csrfToken, onClose }: { action: Action; active: ManagedParticipation; personId: string; csrfToken: string; onClose: () => void }): React.JSX.Element {
  const client = useQueryClient();
  const options = { credentials: 'include', headers: { 'x-csrf-token': csrfToken } } satisfies RequestInit;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { objective: active.objective ?? '', selectedId: '' } });
  const currentId = action === 'professor' ? active.mainProfessorId ?? active.mainProfessor?.id : active.planId ?? active.plan?.id;
  const professors = useQuery({ queryKey: ['sala-professors'], enabled: action === 'professor', queryFn: async () => checked(await listSalaProfessors(options)).data.data });
  // The existing Plan endpoint has a generic OpenAPI response. Validate its read shape locally.
  const plans = useQuery({ queryKey: ['sala-plans'], enabled: action === 'plan', queryFn: async () => {
    const data = checked(await listSalaPlans(options)).data.data;
    return (data ?? []).filter((item): item is { id: string; name: string; isSelectable: boolean } => typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string' && 'name' in item && typeof item.name === 'string' && 'isSelectable' in item && item.isSelectable === true);
  } });
  const impact = useQuery({ queryKey: ['sala-leave-impact', active.id], enabled: action === 'leave', staleTime: 0, queryFn: async () => checked(await getSalaLeaveImpact(active.id, options)).data.data });
  const mutation = useMutation({ mutationFn: async (values: Values) => {
    if (action === 'objective') { const body: UpdateSalaObjectiveDto = { objective: values.objective }; checked(await updateSalaObjective(active.id, body, options)); }
    else if (action === 'professor') checked(await changeSalaProfessor(active.id, { mainProfessorId: values.selectedId }, options));
    else if (action === 'plan') checked(await changeSalaPlan(active.id, { planId: values.selectedId }, options));
    else checked(await leaveSala(active.id, options));
  }, onSuccess: async () => {
    const keys: readonly unknown[][] = [['sala-participations', personId], ['sala', 'students'], ...(action === 'plan' || action === 'leave' ? [['sala', 'person-services', personId]] : []), ...(action === 'leave' ? [['sala-fixed', personId], ['sala-reservations', personId], ['sala-routines', personId], ['sala', 'routines', personId], ['sala', 'clinical-indications', personId], ['person', personId], ['people']] : [])];
    await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
    onClose();
  } });
  const catalog = action === 'professor' ? professors : plans;
  const selected = form.watch('selectedId');
  return <ParticipationDialog title={titles[action]} onClose={onClose} busy={mutation.isPending}>
    <form className="space-y-4" onSubmit={(event) => { event.stopPropagation(); void form.handleSubmit((values) => mutation.mutate(values))(event); }}>
      {action === 'objective' ? <label className="grid gap-1 text-sm">Objetivo<textarea rows={4} maxLength={500} className="rounded-md border border-border p-3" {...form.register('objective')}/>{form.formState.errors.objective?.message}</label> : null}
      {action === 'professor' || action === 'plan' ? <><p className="text-sm">{action === 'professor' ? `Profesor principal actual: ${active.mainProfessor?.firstName ?? ''} ${active.mainProfessor?.lastName ?? ''}` : `Plan actual: ${active.plan?.name ?? ''}`}</p>
        <label className="grid gap-1 text-sm">{action === 'professor' ? 'Nuevo profesor' : 'Nuevo Plan'}<select className="h-11 rounded-md border px-3" {...form.register('selectedId')}><option value="">Seleccionar</option>{action === 'professor' ? professors.data?.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>) : plans.data?.filter((item) => item.id !== currentId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{catalog.isError ? <p role="alert">No se pudo cargar el catálogo. Intentá nuevamente.</p> : null}</> : null}
      {action === 'leave' ? <><p>Esta acción afecta únicamente la participación de Sala.</p>{impact.isPending ? <p role="status">Cargando impacto…</p> : impact.isError ? <p role="alert">No se pudo cargar el impacto de la baja.</p> : <ul className="space-y-1 text-sm">{(Object.keys(impactLabels) as (keyof SalaLeaveImpactDto)[]).filter((key) => (impact.data?.[key] ?? 0) > 0).map((key) => <li key={key}>{impactLabels[key]}: {impact.data?.[key]}</li>)}</ul>}<p className="text-sm">La Persona y la información histórica se conservan.</p></> : null}
      {mutation.isError ? <p role="alert">{mutation.error.message}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={mutation.isPending || ((action === 'professor' || action === 'plan') && (!selected || selected === currentId)) || (action === 'leave' && !impact.isSuccess)}>{action === 'leave' ? 'Dar de baja' : 'Guardar'}</Button></div>
    </form>
  </ParticipationDialog>;
}

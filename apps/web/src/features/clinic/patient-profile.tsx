'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSocialWorks, type PersonResponseDto } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { editPerson } from '../people/people-api';
import { GeneralPersonForm, personInput, type PersonValues } from '../people/general-person-form';
import { fetchClinicalAppointments, fetchClinicalAttentions, fetchClinicalTreatments } from './clinic-api';

const displayDate = (value: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export function PatientProfile({ person, permissions, csrfToken, tabHref, children }: { person: PersonResponseDto; permissions: string[]; csrfToken: string; tabHref: (tab: 'Agenda' | 'Atenciones') => string; children: React.ReactNode }): React.JSX.Element {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const canReadOperational = permissions.includes('CLINIC_OPERATIONAL_READ');
  const attentions = useQuery({ queryKey: ['clinic', 'attentions', person.id], queryFn: () => fetchClinicalAttentions(person.id), enabled: canReadOperational });
  const appointments = useQuery({ queryKey: ['clinic', 'appointments', 'patient', person.id], queryFn: () => fetchClinicalAppointments({ personId: person.id }), enabled: canReadOperational });
  const treatments = useQuery({ queryKey: ['clinic', 'treatments', 'summary', person.id], queryFn: () => fetchClinicalTreatments(person.id), enabled: permissions.includes('CLINICAL_HISTORY_READ') });
  const catalog = useQuery({ queryKey: ['social-works'], enabled: Boolean(person.socialWorkId), queryFn: async () => {
    const response = await listSocialWorks({ credentials: 'include' });
    if (response.status !== 200) throw new Error('CATALOG_FAILED');
    return (response.data as unknown as { data: { id: string; name: string }[] }).data;
  } });
  const save = useMutation({ mutationFn: async (values: PersonValues) => {
    await editPerson(person.id, personInput(values), csrfToken);
  }, onSuccess: async () => {
    setEditing(false);
    await client.invalidateQueries({ queryKey: ['person', person.id] });
    await client.invalidateQueries({ queryKey: ['people'] });
    await client.invalidateQueries({ queryKey: ['clinic', 'patients'] });
  } });
  const lastAttention = attentions.data?.reduce<string | null>((last, attention) => !last || attention.occurredAt > last ? attention.occurredAt : last, null);
  const nextAppointment = appointments.data?.filter((appointment) => appointment.status === 'SCHEDULED' && new Date(appointment.startAt).getTime() > Date.now()).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const work = catalog.data?.find((item) => item.id === person.socialWorkId);
  return <section className="rounded-md border bg-surface p-5">
    <h2 className="text-xl font-semibold">{person.firstName} {person.lastName}</h2><p>DNI {person.dni} · Paciente registrado</p>
    {person.hasSalaParticipation && <p className="mt-2 text-sm font-medium">Participación actual en Sala</p>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Datos generales</h3>{permissions.includes('PEOPLE_UPDATE_GENERAL') && <Button type="button" variant="secondary" onClick={() => setEditing(true)}>Editar datos generales</Button>}</div>
    {editing ? <GeneralPersonForm person={person} pending={save.isPending} onSave={(values) => save.mutate(values)} onCancel={() => setEditing(false)} {...(save.isError ? { error: (save.error as { status?: number }).status === 409 ? 'Ya existe una Persona con ese DNI.' : 'No pudimos guardar los datos.' } : {})}/> : <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Fecha de nacimiento</dt><dd>{person.birthDate ? person.birthDate.split('-').reverse().join('/') : '—'}</dd></div>
      <div><dt className="text-muted-foreground">Teléfono</dt><dd>{person.phone || '—'}</dd></div>
      {person.email && <div><dt className="text-muted-foreground">Email</dt><dd>{person.email}</dd></div>}
      {(person.emergencyContactName || person.emergencyContactPhone) && <div><dt className="text-muted-foreground">Contacto de emergencia</dt><dd>{person.emergencyContactName} {person.emergencyContactPhone}</dd></div>}
      {person.sport && <div><dt className="text-muted-foreground">Deporte</dt><dd>{person.sport}</dd></div>}
      {person.club && <div><dt className="text-muted-foreground">Club</dt><dd>{person.club}</dd></div>}
      <div><dt className="text-muted-foreground">Obra social actual</dt><dd>{person.socialWorkId ? catalog.isError ? 'No pudimos cargar la obra social.' : catalog.isPending ? 'Cargando…' : work?.name ?? 'Obra social no disponible' : 'Sin obra social'}</dd></div>
      <div><dt className="text-muted-foreground">Número de afiliado</dt><dd>{person.affiliateNumber || '—'}</dd></div>
    </dl>}
    {canReadOperational && <div className="mt-6 space-y-3"><h3 className="font-semibold">Actividad</h3>
      <p className="text-sm">Última Atención: {attentions.isError ? 'No pudimos cargar las atenciones.' : attentions.isPending ? 'Cargando…' : lastAttention ? displayDate(lastAttention) : 'Sin atenciones'}</p>
      <p className="text-sm">Próximo Turno: {appointments.isError ? 'No pudimos cargar los turnos.' : appointments.isPending ? 'Cargando…' : nextAppointment ? displayDate(nextAppointment.startAt) : 'Sin próximo turno'}</p>
      <div className="flex flex-wrap gap-4 text-sm"><Link className="font-medium underline" href={tabHref('Agenda')}>Ver agenda del paciente</Link><Link className="font-medium underline" href={tabHref('Atenciones')}>Ver atenciones del paciente</Link></div>
    </div>}
    {permissions.includes('CLINICAL_HISTORY_READ') && <div className="mt-6"><h3 className="font-semibold">Contexto clínico</h3><p className="mt-2 text-sm">{treatments.isError ? 'No pudimos cargar los tratamientos.' : treatments.isPending ? 'Cargando tratamientos…' : `Tratamientos En curso: ${treatments.data.filter((item) => item.status === 'IN_PROGRESS').length}`}</p></div>}
    {children}
  </section>;
}

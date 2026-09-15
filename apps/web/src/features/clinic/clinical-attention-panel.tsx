'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClinicalAttentionOperationalDto } from '@athleta/api-client';
import {
  addClinicalEvolution,
  associateClinicalAttentionTreatment,
  ClinicApiError,
  fetchClinicalEvolution,
  fetchClinicalProfessionalsForAttention,
  fetchClinicalTreatments,
  removeEmptyClinicalAttention,
  updateClinicalAttention,
  updateClinicalEvolution,
} from './clinic-api';
import { clinicLocalDateTimeToIso, toClinicDateTimeLocal } from './clinic-dates';

function errorMessage(error: unknown): string {
  const code = error instanceof ClinicApiError ? error.code : '';
  return ({
    ATTENTION_HAS_DEPENDENCIES: 'La Atención tiene dependencias y no puede eliminarse.',
    ATTENTION_APPOINTMENT_ORIGIN_DELETE_FORBIDDEN: 'La Atención derivada de un Turno se corrige desde la agenda.',
    CLINIC_PROFESSIONAL_INVALID: 'El profesional no es válido para esa fecha.',
    CLINIC_ATTENTION_FUTURE_NOT_ALLOWED: 'La Atención no puede tener fecha futura.',
    EVOLUTION_CONTENT_REQUIRED: 'Ingresá contenido en al menos un campo de Evolución.',
    EVOLUTION_ALREADY_EXISTS: 'La Atención ya tiene una Evolución.',
    ATTENTION_TREATMENT_PERSON_MISMATCH: 'El Tratamiento no pertenece a este Paciente.',
  } as Record<string, string>)[code] ?? 'No pudimos guardar los cambios.';
}

export function ClinicalAttentionPanel({ attention, csrfToken, canClinical }: { attention: ClinicalAttentionOperationalDto; csrfToken: string; canClinical: boolean }): React.JSX.Element {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() => toClinicDateTimeLocal(attention.occurredAt));
  const [professionalId, setProfessionalId] = useState(attention.professionalId);
  const [coverage, setCoverage] = useState(attention.coverage ?? '');
  const [evolutionText, setEvolutionText] = useState('');
  const [practicesOrManeuvers, setPracticesOrManeuvers] = useState('');
  const [indicationsOrNextSteps, setIndicationsOrNextSteps] = useState('');
  const professionals = useQuery({ queryKey: ['clinic', 'professionals', occurredAt], queryFn: () => fetchClinicalProfessionalsForAttention({ occurredAt: clinicLocalDateTimeToIso(occurredAt) }) });
  const evolution = useQuery({ queryKey: ['clinic', 'evolution', attention.id], queryFn: () => fetchClinicalEvolution(attention.id), enabled: canClinical });
  const treatments = useQuery({ queryKey: ['clinic', 'treatments', attention.personId], queryFn: () => fetchClinicalTreatments(attention.personId), enabled: canClinical });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['clinic', 'attentions'] }); await client.invalidateQueries({ queryKey: ['clinic', 'appointments'] }); };
  const update = useMutation({ mutationFn: () => updateClinicalAttention(attention.id, { occurredAt: clinicLocalDateTimeToIso(occurredAt), professionalId, coverage: coverage as 'PRIVATE' | 'SOCIAL_WORK' }, csrfToken), onSuccess: async () => { setEditing(false); await refresh(); } });
  const remove = useMutation({ mutationFn: () => removeEmptyClinicalAttention(attention.id, csrfToken), onSuccess: refresh });
  const saveEvolution = useMutation({ mutationFn: () => evolution.data ? updateClinicalEvolution(evolution.data.id, { evolutionText, practicesOrManeuvers, indicationsOrNextSteps }, csrfToken) : addClinicalEvolution(attention.id, { evolutionText, practicesOrManeuvers, indicationsOrNextSteps }, csrfToken), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['clinic', 'evolution', attention.id] }); } });
  const setTreatment = useMutation({ mutationFn: (treatmentId: string) => associateClinicalAttentionTreatment(attention.id, { treatmentId: treatmentId || null }, csrfToken), onSuccess: refresh });
  const error = [update.error, remove.error, saveEvolution.error, setTreatment.error].find(Boolean);
  useEffect(() => {
    if (!evolution.data) return;
    setEvolutionText(evolution.data.evolutionText ?? '');
    setPracticesOrManeuvers(evolution.data.practicesOrManeuvers ?? '');
    setIndicationsOrNextSteps(evolution.data.indicationsOrNextSteps ?? '');
  }, [evolution.data]);

  return <article className="rounded-md border bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{attention.person.firstName} {attention.person.lastName}</p><p className="text-sm text-muted-foreground">{attention.origin === 'APPOINTMENT' ? 'Derivada de Turno' : 'Atención directa'} · {attention.coverage === 'SOCIAL_WORK' ? 'Obra social' : attention.coverage === 'PRIVATE' ? 'Particular' : 'Sin clasificar'}</p></div><button type="button" className="text-sm underline" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancelar edición' : 'Corregir referencia'}</button></div>
    {editing ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Fecha y hora<input type="datetime-local" className="h-10 rounded-md border px-3" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label><label className="grid gap-1 text-sm font-medium">Profesional<select className="h-10 rounded-md border px-3" value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>{(professionals.data ?? []).map((professional) => <option key={professional.id} value={professional.id}>{professional.lastName}, {professional.firstName}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Cobertura<select className="h-10 rounded-md border px-3" value={coverage} onChange={(event) => setCoverage(event.target.value)}><option value="">Seleccionar cobertura</option><option value="PRIVATE">Particular</option><option value="SOCIAL_WORK">Obra social</option></select></label><button type="button" className="rounded-md bg-[#FCCC05] px-4 py-2 font-semibold text-black disabled:opacity-50" disabled={!coverage || !professionalId || update.isPending} onClick={() => update.mutate()}>Guardar corrección</button></div> : null}
    {attention.origin === 'DIRECT' ? <button type="button" className="mt-4 text-sm text-red-700 underline" disabled={remove.isPending} onClick={() => remove.mutate()}>Eliminar Atención vacía</button> : null}
    {canClinical ? <section className="mt-5 border-t pt-4"><h3 className="font-semibold">Evolución</h3><p className="mt-1 text-xs text-muted-foreground">La autoría y fecha original se conservan al corregir.</p><div className="mt-3 grid gap-3"><textarea aria-label="Evolución clínica" className="min-h-20 rounded-md border p-2" value={evolutionText} onChange={(event) => setEvolutionText(event.target.value)} /><textarea aria-label="Prácticas o maniobras" className="min-h-20 rounded-md border p-2" value={practicesOrManeuvers} onChange={(event) => setPracticesOrManeuvers(event.target.value)} /><textarea aria-label="Indicaciones o próximos pasos" className="min-h-20 rounded-md border p-2" value={indicationsOrNextSteps} onChange={(event) => setIndicationsOrNextSteps(event.target.value)} /><button type="button" className="rounded-md bg-[#FCCC05] px-4 py-2 font-semibold text-black" disabled={saveEvolution.isPending} onClick={() => saveEvolution.mutate()}>{evolution.data ? 'Corregir Evolución' : 'Guardar Evolución'}</button></div><label className="mt-4 grid gap-1 text-sm font-medium">Tratamiento asociado<select className="h-10 rounded-md border px-3" defaultValue="" onChange={(event) => setTreatment.mutate(event.target.value)}><option value="">Sin Tratamiento</option>{(treatments.data ?? []).map((treatment) => <option key={treatment.id} value={treatment.id}>Tratamiento desde {treatment.startDate}</option>)}</select></label></section> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(error)}</p> : null}
  </article>;
}

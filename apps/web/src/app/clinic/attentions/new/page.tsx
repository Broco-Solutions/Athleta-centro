'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { WorkspaceShell } from '../../../../features/auth/workspace-shell';
import { currentSession } from '../../../../features/auth/auth';
import {
  addDirectAttention,
  ClinicApiError,
  fetchClinicalPatients,
  fetchClinicalProfessionals,
} from '../../../../features/clinic/clinic-api';
import { clinicLocalDateTimeToIso, toClinicDateTimeLocal } from '../../../../features/clinic/clinic-dates';

const formSchema = z.object({
  personId: z.string().uuid('Seleccioná un Paciente.'),
  professionalId: z.string().uuid('Seleccioná un profesional clínico.'),
  occurredAt: z.string().min(1, 'Ingresá la fecha y hora.'),
  coverage: z.enum(['PRIVATE', 'SOCIAL_WORK'], { message: 'Seleccioná Particular u Obra social.' }),
});

type FormValues = z.infer<typeof formSchema>;

function DirectAttentionForm(): React.JSX.Element {
  const router = useRouter();
  const search = useSearchParams();
  const presetPersonId = search.get('personId') ?? '';
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const patients = useQuery({ queryKey: ['clinic', 'patients'], queryFn: fetchClinicalPatients });
  const professionals = useQuery({ queryKey: ['clinic', 'professionals'], queryFn: fetchClinicalProfessionals });
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      personId: presetPersonId,
      professionalId: '',
      occurredAt: toClinicDateTimeLocal(new Date().toISOString()),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: FormValues) => addDirectAttention({
      personId: values.personId,
      professionalId: values.professionalId,
      occurredAt: clinicLocalDateTimeToIso(values.occurredAt),
      coverage: values.coverage,
    }, session.data?.csrfToken ?? ''),
    onSuccess: (attention) => router.push(`/clinic?tab=Atenciones&personId=${attention.personId}&attentionId=${attention.id}`),
  });
  const errorCode = mutation.error instanceof ClinicApiError ? mutation.error.code : '';
  const errorMessage = ({
    CLINIC_PATIENT_REQUIRED: 'La Persona todavía no fue dada de alta como Paciente.',
    CLINIC_PROFESSIONAL_INVALID: 'Seleccioná un profesional clínico activo.',
    CLINIC_ATTENTION_DATE_INVALID: 'La fecha y hora de Atención no es válida.',
    CLINIC_ATTENTION_FUTURE_NOT_ALLOWED: 'La Atención directa no puede tener una fecha futura.',
  } as Record<string, string>)[errorCode] ?? 'No pudimos registrar la Atención. Revisá los datos.';

  return (
    <WorkspaceShell active="Clínica">
      <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href={`/clinic?personId=${presetPersonId}`} className="underline">Clínica</Link> / Registrar Atención</nav>
        <div>
          <p className="text-sm text-muted-foreground">Consulta sin Turno previo</p>
          <h1 className="text-2xl font-semibold">Registrar Atención directa</h1>
        </div>
        <form className="grid gap-4 rounded-md border bg-white p-5 shadow-sm md:p-6" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <label className="grid gap-1 text-sm font-medium">Paciente
            <select className="h-10 rounded-md border px-3" {...form.register('personId')}>
              <option value="">Seleccionar Paciente</option>
              {(patients.data ?? []).map((person) => <option key={person.id} value={person.id}>{person.lastName}, {person.firstName} · DNI {person.dni}</option>)}
            </select>
            {form.formState.errors.personId ? <span className="text-xs text-red-700">{form.formState.errors.personId.message}</span> : null}
          </label>
          <label className="grid gap-1 text-sm font-medium">Profesional clínico
            <select className="h-10 rounded-md border px-3" {...form.register('professionalId')}>
              <option value="">Seleccionar profesional</option>
              {(professionals.data ?? []).map((professional) => <option key={professional.id} value={professional.id}>{professional.lastName}, {professional.firstName}</option>)}
            </select>
            {form.formState.errors.professionalId ? <span className="text-xs text-red-700">{form.formState.errors.professionalId.message}</span> : null}
          </label>
          <label className="grid gap-1 text-sm font-medium">Fecha y hora de Atención
            <input type="datetime-local" className="h-10 rounded-md border px-3" {...form.register('occurredAt')} />
            {form.formState.errors.occurredAt ? <span className="text-xs text-red-700">{form.formState.errors.occurredAt.message}</span> : null}
          </label>
          <label className="grid gap-1 text-sm font-medium">Cobertura
            <select className="h-10 rounded-md border px-3" {...form.register('coverage')}>
              <option value="">Seleccionar cobertura</option>
              <option value="PRIVATE">Particular</option>
              <option value="SOCIAL_WORK">Obra social</option>
            </select>
            {form.formState.errors.coverage ? <span className="text-xs text-red-700">{form.formState.errors.coverage.message}</span> : null}
          </label>
          {patients.isError || professionals.isError ? <p role="alert" className="text-sm text-red-700">No pudimos cargar Pacientes o profesionales.</p> : null}
          {mutation.isError ? <p role="alert" className="text-sm text-red-700">{errorMessage}</p> : null}
          <button type="submit" disabled={mutation.isPending || patients.isLoading || professionals.isLoading} className="rounded-md bg-[#FCCC05] px-4 py-2.5 font-semibold text-black disabled:opacity-50">
            {mutation.isPending ? 'Guardando…' : 'Registrar Atención'}
          </button>
        </form>
      </main>
    </WorkspaceShell>
  );
}

export default function NewDirectAttentionPage(): React.JSX.Element {
  return <Suspense fallback={<p className="p-6">Cargando formulario…</p>}><DirectAttentionForm /></Suspense>;
}

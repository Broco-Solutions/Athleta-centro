'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { WorkspaceShell } from '../../../../features/auth/workspace-shell';
import { currentSession } from '../../../../features/auth/auth';
import {
  addClinicalAppointment,
  ClinicApiError,
  fetchClinicalPatients,
  fetchClinicalProfessionals,
} from '../../../../features/clinic/clinic-api';
import { clinicLocalDateTimeToIso } from '../../../../features/clinic/clinic-dates';

const formSchema = z.object({
  personId: z.string().uuid('Seleccioná un Paciente.'),
  professionalId: z.string().uuid('Seleccioná un profesional clínico.'),
  startAt: z.string().min(1, 'Ingresá la fecha y hora.'),
  durationMinutes: z.coerce.number().int().positive('La duración debe ser mayor a cero.'),
  operationalNote: z.string().max(500, 'La nota no puede superar 500 caracteres.'),
});

type FormValues = z.infer<typeof formSchema>;

function mutationError(error: unknown): string {
  const code = error instanceof ClinicApiError ? error.code : '';
  return ({
    CLINIC_APPOINTMENT_NOT_FUTURE: 'El Turno debe agendarse en un horario futuro.',
    CLINIC_PROFESSIONAL_INVALID: 'El profesional seleccionado no está habilitado para Clínica.',
    CLINIC_PATIENT_REQUIRED: 'La Persona debe estar dada de alta como Paciente.',
  } as Record<string, string>)[code] ?? 'No pudimos agendar el Turno. Revisá los datos.';
}

function AppointmentForm(): React.JSX.Element {
  const search = useSearchParams();
  const presetPersonId = search.get('personId') ?? '';
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const patients = useQuery({ queryKey: ['clinic', 'patients'], queryFn: fetchClinicalPatients });
  const professionals = useQuery({ queryKey: ['clinic', 'professionals'], queryFn: fetchClinicalProfessionals });
  const [createdNotice, setCreatedNotice] = useState<{ personId: string; message: string } | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      personId: presetPersonId,
      professionalId: '',
      startAt: '',
      durationMinutes: 60,
      operationalNote: '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: FormValues) => addClinicalAppointment({
      personId: values.personId,
      professionalId: values.professionalId,
      startAt: clinicLocalDateTimeToIso(values.startAt),
      durationMinutes: values.durationMinutes,
      ...(values.operationalNote.trim() ? { operationalNote: values.operationalNote.trim() } : {}),
    }, session.data?.csrfToken ?? ''),
    onSuccess: (appointment) => {
      setCreatedNotice({
        personId: appointment.personId,
        message: appointment.overlapCount > 0
          ? `Turno guardado. Coincide con ${appointment.overlapCount} Turno(s) del profesional; el solapamiento no impide continuar.`
          : 'Turno guardado correctamente.',
      });
    },
  });

  return (
    <WorkspaceShell active="Clínica">
      <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href={`/clinic?personId=${presetPersonId}`} className="underline">Clínica</Link> / Agendar Turno</nav>
        <div>
          <p className="text-sm text-muted-foreground">Agenda Clínica</p>
          <h1 className="text-2xl font-semibold">Agendar Turno clínico</h1>
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
              {(professionals.data ?? []).map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.lastName}, {professional.firstName} · {professional.roles.map((role) => role === 'KINESIOLOGIST' ? 'Kinesiólogo' : 'Osteópata').join(' / ')}</option>
              ))}
            </select>
            {form.formState.errors.professionalId ? <span className="text-xs text-red-700">{form.formState.errors.professionalId.message}</span> : null}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Fecha y hora
              <input type="datetime-local" className="h-10 rounded-md border px-3" {...form.register('startAt')} />
              {form.formState.errors.startAt ? <span className="text-xs text-red-700">{form.formState.errors.startAt.message}</span> : null}
            </label>
            <label className="grid gap-1 text-sm font-medium">Duración en minutos
              <input type="number" min={1} className="h-10 rounded-md border px-3" {...form.register('durationMinutes', { valueAsNumber: true })} />
              {form.formState.errors.durationMinutes ? <span className="text-xs text-red-700">{form.formState.errors.durationMinutes.message}</span> : null}
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">Nota operativa
            <textarea className="min-h-24 rounded-md border px-3 py-2" {...form.register('operationalNote')} />
            <span className="text-xs text-muted-foreground">No utilices este campo para diagnóstico ni contenido clínico detallado.</span>
            {form.formState.errors.operationalNote ? <span className="text-xs text-red-700">{form.formState.errors.operationalNote.message}</span> : null}
          </label>
          {patients.isError || professionals.isError ? <p role="alert" className="text-sm text-red-700">No pudimos cargar Pacientes o profesionales.</p> : null}
          {mutation.isError ? <p role="alert" className="text-sm text-red-700">{mutationError(mutation.error)}</p> : null}
          {createdNotice ? <div aria-live="polite" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>{createdNotice.message}</p><Link className="mt-2 inline-block font-semibold underline" href={`/clinic?personId=${createdNotice.personId}`}>Volver a la agenda</Link></div> : null}
          <button type="submit" disabled={mutation.isPending || patients.isLoading || professionals.isLoading} className="rounded-md bg-[#FCCC05] px-4 py-2.5 font-semibold text-black disabled:opacity-50">
            {mutation.isPending ? 'Guardando…' : 'Guardar Turno'}
          </button>
        </form>
      </main>
    </WorkspaceShell>
  );
}

export default function NewClinicalAppointmentPage(): React.JSX.Element {
  return <Suspense fallback={<p className="p-6">Cargando formulario…</p>}><AppointmentForm /></Suspense>;
}

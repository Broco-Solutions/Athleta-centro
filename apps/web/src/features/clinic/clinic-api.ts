import {
  correctClinicalAppointment,
  createClinicalAppointment,
  createClinicalEvolution,
  correctClinicalEvolution,
  deleteEmptyClinicalAttention,
  listClinicalAttentions,
  listClinicalAppointments,
  listClinicalPatients,
  listClinicalProfessionals,
  listClinicalTreatments,
  getClinicalEvolutionForAttention,
  registerDirectClinicalAttention,
  rescheduleClinicalAppointment,
  setClinicalAttentionTreatment,
  updateClinicalAttentionOperational,
  type AppointmentDto,
  type ClinicalAppointmentOperationalDto,
  type ClinicalAttentionOperationalDto,
  type ClinicalEvolutionDto,
  type ClinicalPersonSummaryDto,
  type ClinicalProfessionalSummaryDto,
  type ClinicalTreatmentAssociationDto,
  type DirectAttentionDto,
  type ListClinicalAppointmentsParams,
  type ListClinicalProfessionalsParams,
  type RescheduleAppointmentDto,
  type SetClinicalAttentionTreatmentDto,
  type UpdateClinicalAttentionDto,
} from '@athleta/api-client';

export type AppointmentStatus = 'SCHEDULED' | 'ATTENDED' | 'CANCELLED' | 'ABSENT';
export type ClinicalCoverage = 'PRIVATE' | 'SOCIAL_WORK';

export class ClinicApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function options(csrfToken?: string): RequestInit {
  return {
    credentials: 'include',
    ...(csrfToken ? { headers: { 'x-csrf-token': csrfToken } } : {}),
  };
}

function unwrap<T>(response: unknown): T {
  const result = response as { status?: number; data?: unknown };
  const body = result.data as { data?: T; code?: string; message?: string } | undefined;
  if (!result.status || result.status < 200 || result.status >= 300 || !body || !('data' in body)) {
    throw new ClinicApiError(body?.code ?? 'CLINIC_REQUEST_FAILED', body?.message ?? 'No pudimos completar la operación.');
  }
  return body.data as T;
}

export async function fetchClinicalPatients(): Promise<ClinicalPersonSummaryDto[]> {
  return unwrap<ClinicalPersonSummaryDto[]>(await listClinicalPatients(options()));
}

export async function fetchClinicalProfessionals(): Promise<ClinicalProfessionalSummaryDto[]> {
  return unwrap<ClinicalProfessionalSummaryDto[]>(await listClinicalProfessionals(undefined, options()));
}

export async function fetchClinicalProfessionalsForAttention(params: ListClinicalProfessionalsParams): Promise<ClinicalProfessionalSummaryDto[]> {
  return unwrap<ClinicalProfessionalSummaryDto[]>(await listClinicalProfessionals(params, options()));
}

export async function fetchClinicalAppointments(params: ListClinicalAppointmentsParams): Promise<ClinicalAppointmentOperationalDto[]> {
  return unwrap(await listClinicalAppointments(params, options()));
}

export async function addClinicalAppointment(input: AppointmentDto, csrfToken: string): Promise<ClinicalAppointmentOperationalDto> {
  return unwrap(await createClinicalAppointment(input, options(csrfToken)));
}

export async function changeClinicalAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  coverage: ClinicalCoverage | undefined,
  csrfToken: string,
): Promise<ClinicalAppointmentOperationalDto> {
  return unwrap(await correctClinicalAppointment(id, { status, ...(coverage ? { coverage } : {}) }, options(csrfToken)));
}

export async function moveClinicalAppointment(
  id: string,
  input: RescheduleAppointmentDto,
  csrfToken: string,
): Promise<ClinicalAppointmentOperationalDto> {
  return unwrap(await rescheduleClinicalAppointment(id, input, options(csrfToken)));
}

export async function addDirectAttention(input: DirectAttentionDto, csrfToken: string): Promise<ClinicalAttentionOperationalDto> {
  return unwrap(await registerDirectClinicalAttention(input, options(csrfToken)));
}

export async function fetchClinicalAttentions(personId?: string): Promise<ClinicalAttentionOperationalDto[]> {
  return unwrap(await listClinicalAttentions(personId ? { personId } : undefined, options()));
}

export async function updateClinicalAttention(id: string, input: UpdateClinicalAttentionDto, csrfToken: string): Promise<ClinicalAttentionOperationalDto> {
  return unwrap(await updateClinicalAttentionOperational(id, input, options(csrfToken)));
}

export async function removeEmptyClinicalAttention(id: string, csrfToken: string): Promise<void> {
  await unwrap<{ id: string }>(await deleteEmptyClinicalAttention(id, options(csrfToken)));
}

export async function associateClinicalAttentionTreatment(id: string, input: SetClinicalAttentionTreatmentDto, csrfToken: string): Promise<ClinicalAttentionOperationalDto> {
  return unwrap(await setClinicalAttentionTreatment(id, input, options(csrfToken)));
}

export async function fetchClinicalTreatments(personId: string): Promise<ClinicalTreatmentAssociationDto[]> {
  return unwrap(await listClinicalTreatments({ personId }, options()));
}

export async function fetchClinicalEvolution(attentionId: string): Promise<ClinicalEvolutionDto | null> {
  return unwrap(await getClinicalEvolutionForAttention(attentionId, options()));
}

export async function addClinicalEvolution(attentionId: string, input: { evolutionText?: string; practicesOrManeuvers?: string; indicationsOrNextSteps?: string }, csrfToken: string): Promise<ClinicalEvolutionDto> {
  return unwrap(await createClinicalEvolution(attentionId, input, options(csrfToken)));
}

export async function updateClinicalEvolution(id: string, input: { evolutionText?: string; practicesOrManeuvers?: string; indicationsOrNextSteps?: string }, csrfToken: string): Promise<ClinicalEvolutionDto> {
  return unwrap(await correctClinicalEvolution(id, input, options(csrfToken)));
}

import {
  correctClinicalAppointment,
  createClinicalAppointment,
  listClinicalAppointments,
  listClinicalPatients,
  listClinicalProfessionals,
  registerDirectClinicalAttention,
  rescheduleClinicalAppointment,
  type AppointmentDto,
  type ClinicalAppointmentOperationalDto,
  type ClinicalAttentionOperationalDto,
  type ClinicalPersonSummaryDto,
  type ClinicalProfessionalSummaryDto,
  type DirectAttentionDto,
  type ListClinicalAppointmentsParams,
  type RescheduleAppointmentDto,
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
  return unwrap(await listClinicalPatients(options()));
}

export async function fetchClinicalProfessionals(): Promise<ClinicalProfessionalSummaryDto[]> {
  return unwrap(await listClinicalProfessionals(options()));
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

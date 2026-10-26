import { listPortalTrainingRecords, getPortalTrainingRecord, listPersonTrainingRecords, getPersonTrainingRecord, type TrainingRecordListEnvelopeDto, type TrainingRecordDetailDto } from '@athleta/api-client';

export class TrainingRequestError extends Error {
  constructor(message: string, public readonly code?: string, public readonly recordId?: string) { super(message); }
}
export function trainingResponse<T>(response: { status: number; data: T }): T {
  if (response.status >= 200 && response.status < 300) return response.data;
  const body = response.data as unknown as { message?: string; code?: string; details?: { recordId?: string } };
  throw new TrainingRequestError(body.message ?? 'No pudimos completar la operación. Intentá nuevamente.', body.code, body.details?.recordId);
}
export type TrainingHistoryApi = {
  list: (page: number) => Promise<TrainingRecordListEnvelopeDto>;
  detail: (id: string) => Promise<TrainingRecordDetailDto>;
};
export const portalTrainingApi: TrainingHistoryApi = {
  list: async page => trainingResponse(await listPortalTrainingRecords({ page, pageSize: 20 }, { credentials: 'include' })),
  detail: async id => trainingResponse(await getPortalTrainingRecord(id, { credentials: 'include' })).data,
};
export function personTrainingApi(personId: string): TrainingHistoryApi {
  return {
    list: async page => trainingResponse(await listPersonTrainingRecords(personId, { page, pageSize: 20 }, { credentials: 'include' })),
    detail: async id => trainingResponse(await getPersonTrainingRecord(personId, id, { credentials: 'include' })).data,
  };
}
export const trainingDate = (date: string): string => date.split('-').reverse().join('/');
export const trainingWeight = (weight: string | null): string => weight === null ? 'Sin registro' : `${weight.replace('.', ',')} kg`;

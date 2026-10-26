'use client';
import { createPerson, getPerson, listPeople, resetPortalPin, updatePerson, type CreatePersonDto, type ListPeopleParams, type PersonResponseDto, type UpdatePersonDto } from '@athleta/api-client';
const options = (csrf?: string): RequestInit => ({ credentials: 'include', ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}) });
const unwrap = <T>(response: { status: number; data: T }): T => { if (response.status < 200 || response.status >= 300) throw Object.assign(new Error('People request failed'), { status: response.status, response: response.data }); return response.data; };
export async function fetchPeople(params: ListPeopleParams) { return unwrap(await listPeople(params, options())); }
export async function fetchPerson(id: string): Promise<PersonResponseDto> { return unwrap(await getPerson(id, options())).data; }
export async function addPerson(input: CreatePersonDto, csrf: string): Promise<PersonResponseDto> { return unwrap(await createPerson(input, options(csrf))).data; }
export async function editPerson(id: string, input: UpdatePersonDto, csrf: string): Promise<PersonResponseDto> { return unwrap(await updatePerson(id, input, options(csrf))).data; }
export async function resetPersonPortalPin(id: string, csrf: string): Promise<string> {
  let response: Awaited<ReturnType<typeof resetPortalPin>>;
  try { response = await resetPortalPin(id, options(csrf)); }
  catch { throw new Error('No pudimos conectar. Revisá tu conexión e intentá nuevamente.'); }
  if (response.status < 200 || response.status >= 300) {
    const messages: Record<number, string> = { 401: 'Tu sesión venció o no pudo validarse. Volvé a ingresar e intentá nuevamente.', 403: 'Tu cuenta no tiene permiso para restablecer este PIN.', 404: 'No encontramos a esta persona. Actualizá la ficha.', 429: 'Hay demasiadas solicitudes. Esperá un momento antes de reintentar.' };
    throw new Error(messages[response.status] ?? 'No pudimos generar un nuevo PIN. Intentá nuevamente.');
  }
  const pin = response.data.data;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new Error('No pudimos mostrar el PIN temporal. No repitas el restablecimiento sin consultar en recepción.');
  return pin;
}

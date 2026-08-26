'use client';
import { createPerson, getPerson, listPeople, resetPortalPin, updatePerson, type CreatePersonDto, type ListPeopleParams, type PersonResponseDto, type UpdatePersonDto } from '@athleta/api-client';
const options = (csrf?: string): RequestInit => ({ credentials: 'include', ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}) });
const unwrap = <T>(response: { status: number; data: T }): T => { if (response.status < 200 || response.status >= 300) throw Object.assign(new Error('People request failed'), { status: response.status, response: response.data }); return response.data; };
export async function fetchPeople(params: ListPeopleParams) { return unwrap(await listPeople(params, options())); }
export async function fetchPerson(id: string): Promise<PersonResponseDto> { return unwrap(await getPerson(id, options())).data; }
export async function addPerson(input: CreatePersonDto, csrf: string): Promise<PersonResponseDto> { return unwrap(await createPerson(input, options(csrf))).data; }
export async function editPerson(id: string, input: UpdatePersonDto, csrf: string): Promise<PersonResponseDto> { return unwrap(await updatePerson(id, input, options(csrf))).data; }
export async function resetPersonPortalPin(id: string, csrf: string): Promise<string> { return unwrap(await resetPortalPin(id, options(csrf))).data; }

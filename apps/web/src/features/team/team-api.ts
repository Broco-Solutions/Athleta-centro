'use client';
import { addTeamUserRole, createTeamUser, getOwnTeamUser, inactivateTeamUser, listTeamUsers, reactivateTeamUser, removeTeamUserRole, updateOwnTeamUser, updateTeamUser, type CreateTeamUserDto, type TeamRoleDtoRole, type TeamUserCreatedDto, type TeamUserDto, type UpdateTeamUserDto } from '@athleta/api-client';
const options = (csrf?: string): RequestInit => ({ credentials: 'include', ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}) });
const unwrap = <T>(response: { status: number; data: T }): T => { if (response.status < 200 || response.status >= 300) throw Object.assign(new Error('Team request failed'), { status: response.status }); return response.data; };
export async function fetchTeam(): Promise<TeamUserDto[]> { return unwrap(await listTeamUsers(options())).data; }
export async function fetchOwnTeamProfile(): Promise<TeamUserDto> { return unwrap(await getOwnTeamUser(options())).data; }
export async function addTeamUser(input: CreateTeamUserDto, csrf: string): Promise<TeamUserCreatedDto> { return unwrap(await createTeamUser(input, options(csrf))); }
export async function editTeamUser(id: string, input: UpdateTeamUserDto, csrf: string): Promise<TeamUserDto> { return unwrap(await updateTeamUser(id, input, options(csrf))).data; }
export async function editOwnTeamProfile(input: UpdateTeamUserDto, csrf: string): Promise<TeamUserDto> { return unwrap(await updateOwnTeamUser(input, options(csrf))).data; }
export async function changeRole(id: string, role: TeamRoleDtoRole, add: boolean, csrf: string): Promise<TeamUserDto> { return unwrap(add ? await addTeamUserRole(id, { role }, options(csrf)) : await removeTeamUserRole(id, { role }, options(csrf))).data; }
export async function changeTeamUserStatus(id: string, active: boolean, csrf: string): Promise<TeamUserDto> { return unwrap(active ? await reactivateTeamUser(id, options(csrf)) : await inactivateTeamUser(id, options(csrf))).data; }
export async function resetTeamCredential(id: string, csrf: string): Promise<{ temporaryPassword: string }> {
  const response = await fetch(`/api/team/users/${id}/reset-credential`, { method: 'POST', ...options(csrf) });
  const body = await response.json() as { temporaryPassword?: string; message?: string };
  if (!response.ok || !body.temporaryPassword) throw new Error(body.message ?? 'No se pudo resetear la credencial.');
  return { temporaryPassword: body.temporaryPassword };
}

'use client';

import { changeInternalPassword, getInternalSession, internalLogin, internalLogout } from '@athleta/api-client';

export type SafeSession = { user: { id: string; firstName: string; lastName: string; email: string }; roles: string[]; permissions: string[]; mustChangePassword: boolean; csrfToken: string };

const options = (init: RequestInit = {}): RequestInit => ({ ...init, credentials: 'include' });
const assertSuccess = <T extends { status: number }>(response: T): T => { if (response.status < 200 || response.status >= 300) throw new Error('Authentication request failed'); return response; };
const data = (response: { data: unknown; status: number }): SafeSession => (assertSuccess(response).data as { data: SafeSession }).data;

export async function login(email: string, password: string): Promise<SafeSession> { return data(await internalLogin({ email, password }, options())); }
export async function currentSession(): Promise<SafeSession> { return data(await getInternalSession(options())); }
export async function logout(csrfToken: string): Promise<void> { assertSuccess(await internalLogout(options({ headers: { 'x-csrf-token': csrfToken } }))); }
export async function changePassword(currentPassword: string, nextPassword: string, csrfToken: string): Promise<SafeSession> { return data(await changeInternalPassword({ currentPassword, nextPassword }, options({ headers: { 'x-csrf-token': csrfToken } }))); }

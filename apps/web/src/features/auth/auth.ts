'use client';

import { changeInternalPassword, getInternalSession, internalLogin, internalLogout } from '@athleta/api-client';

export type SafeSession = { user: { id: string; firstName: string; lastName: string; email: string }; roles: string[]; permissions: string[]; mustChangePassword: boolean; csrfToken: string };

const options = (init: RequestInit = {}): RequestInit => ({ ...init, credentials: 'include' });
const assertSuccess = <T extends { status: number }>(response: T): T => { if (response.status < 200 || response.status >= 300) throw new Error('Authentication request failed'); return response; };
const data = (response: { data: unknown; status: number }): SafeSession => (assertSuccess(response).data as { data: SafeSession }).data;

export async function login(email: string, password: string): Promise<SafeSession> { return data(await internalLogin({ email, password }, options())); }
export async function currentSession(): Promise<SafeSession> { return data(await getInternalSession(options())); }
export async function logout(csrfToken: string): Promise<void> {
  let response: { status: number; data: unknown } = await internalLogout(options({ headers: { 'x-csrf-token': csrfToken } }));
  const payload = response.data;
  if (response.status === 401 && payload !== null && typeof payload === 'object' && 'code' in payload && payload.code === 'CSRF_INVALID') {
    // Cookies are shared across tabs; the cached session and its CSRF token are
    // not. Recover only a changed token from the authenticated session endpoint.
    const current = await currentSession();
    if (current?.csrfToken && current.csrfToken !== csrfToken) {
      response = await internalLogout(options({ headers: { 'x-csrf-token': current.csrfToken } }));
    }
  }
  assertSuccess(response);
}
export async function changePassword(currentPassword: string, nextPassword: string, csrfToken: string): Promise<SafeSession> { return data(await changeInternalPassword({ currentPassword, nextPassword }, options({ headers: { 'x-csrf-token': csrfToken } }))); }

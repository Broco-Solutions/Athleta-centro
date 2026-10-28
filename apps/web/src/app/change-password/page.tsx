'use client';

import Image from 'next/image';
import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { changePassword, currentSession } from '../../features/auth/auth';
import { SecretInput } from '../../features/auth/secret-input';
import { DeveloperFooter } from '../../features/branding/developer-footer';

export default function ChangePasswordPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [policyError, setPolicyError] = useState(false);
  const submitting = useRef(false);
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  useEffect(() => { if (session.isError) window.location.assign('/login'); }, [session.isError]);
  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, nextPassword, session.data?.csrfToken ?? ''),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      window.location.assign('/');
    },
    onSettled: () => { submitting.current = false; },
  });
  const error = policyError
    ? 'La nueva contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula, un número y un símbolo.'
    : mutation.isError ? 'No se pudo actualizar la contraseña.' : '';

  return <main className="grid min-h-dvh md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <section className="flex flex-col items-center justify-center gap-4 bg-sidebar px-6 py-5 text-center text-sidebar-foreground sm:px-10 md:gap-6 md:p-12 lg:p-16">
      <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-36 sm:w-44 md:w-full md:max-w-96" />
      <div className="w-full max-w-96 border-t border-zinc-700 pt-3 md:mt-6 md:pt-5">
        <p className="text-base font-semibold md:text-lg">Athleta Manager</p>
        <p className="mt-1 text-sm text-zinc-400 md:mt-2">Acceso interno seguro</p>
      </div>
    </section>
    <section className="flex min-w-0 flex-col items-center justify-center gap-8 bg-background px-6 py-8 sm:px-10 md:py-12">
      {session.isLoading || session.isError ? <p role="status" className="w-full max-w-md text-sm text-muted-foreground">{session.isError ? 'Volviendo al inicio de sesión…' : 'Cargando sesión…'}</p> :
        <form className="w-full max-w-md space-y-5" aria-busy={mutation.isPending} onSubmit={event => {
          event.preventDefault();
          if (submitting.current) return;
          if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(nextPassword)) { setPolicyError(true); return; }
          setPolicyError(false); submitting.current = true; mutation.mutate();
        }}>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Seguridad de cuenta</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Actualizá tu contraseña</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Por seguridad, debés crear una contraseña nueva antes de continuar.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="current-password" className="block text-sm font-medium">Contraseña actual</label>
            <SecretInput id="current-password" secretLabel="contraseña actual" autoComplete="current-password" aria-describedby="current-password-help" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required />
            <p id="current-password-help" className="text-sm leading-6 text-muted-foreground">Ingresá la contraseña con la que acabás de iniciar sesión.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="new-password" className="block text-sm font-medium">Nueva contraseña</label>
            <SecretInput id="new-password" secretLabel="nueva contraseña" autoComplete="new-password" aria-describedby="new-password-help" aria-invalid={policyError || undefined} value={nextPassword} onChange={event => setNextPassword(event.target.value)} required />
            <p id="new-password-help" className="text-sm leading-6 text-muted-foreground">Mínimo 10 caracteres, con una mayúscula, una minúscula, un número y un símbolo.</p>
          </div>
          {error && <p role="alert" className="rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar contraseña'}</Button>
        </form>}
      <footer className="text-center"><DeveloperFooter /></footer>
    </section>
  </main>;
}

'use client';

import React, { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
import { editOwnTeamProfile, fetchOwnTeamProfile } from '../../features/team/team-api';
import { profileDefaults, TeamProfileFields, teamProfileSchema, toProfileInput, type TeamProfileFormValues } from '../../features/team/team-profile-fields';

const roleLabels: Record<string, string> = { PROFESSOR: 'Profesor', KINESIOLOGIST: 'Kinesiólogo', OSTEOPATH: 'Osteópata', ADMINISTRATIVE: 'Administrativo', GENERAL_ADMIN: 'Administrador general' };

export default function ProfilePage(): React.JSX.Element {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const profile = useQuery({ queryKey: ['team', 'me'], queryFn: fetchOwnTeamProfile, retry: false });
  const form = useForm<TeamProfileFormValues>({ resolver: zodResolver(teamProfileSchema), defaultValues: profileDefaults() });
  useEffect(() => { if (profile.data) form.reset(profileDefaults(profile.data)); }, [form, profile.data]);
  const save = useMutation({ mutationFn: async (values: TeamProfileFormValues) => { const csrf = session.data?.csrfToken; if (!csrf) throw new Error('Sesión inválida'); return editOwnTeamProfile(toProfileInput(values), csrf); }, onSuccess: async (user) => { form.reset(profileDefaults(user)); await Promise.all([client.invalidateQueries({ queryKey: ['team', 'me'] }), client.invalidateQueries({ queryKey: ['auth', 'session'] }), client.invalidateQueries({ queryKey: ['team'] })]); } });

  if (profile.isLoading) return <WorkspaceShell active="Mi perfil"><p className="text-sm text-muted-foreground">Cargando perfil…</p></WorkspaceShell>;
  if (profile.isError || !profile.data) return <WorkspaceShell active="Mi perfil"><p role="alert" className="text-sm text-red-700">No pudimos cargar tu perfil.</p></WorkspaceShell>;
  return <WorkspaceShell active="Mi perfil"><div className="mx-auto max-w-3xl"><header className="mb-6"><p className="mb-1 text-sm text-muted-foreground">Cuenta interna</p><h1 className="m-0 text-3xl font-semibold">Mi perfil</h1><p className="mt-2 text-sm text-muted-foreground">Actualizá tus datos personales. Los roles y el estado de acceso se administran desde Equipo.</p></header><form className="rounded-md border bg-white p-5 sm:p-6" onSubmit={form.handleSubmit((values) => save.mutate(values))}><TeamProfileFields form={form}/>{save.isError ? <p role="alert" className="mt-4 text-sm text-red-700">No pudimos guardar tus datos. Revisá la información e intentá nuevamente.</p> : null}{save.isSuccess ? <p role="status" className="mt-4 text-sm text-emerald-700">Datos actualizados.</p> : null}<div className="mt-6 flex justify-end"><Button type="submit" disabled={save.isPending}>Guardar cambios</Button></div></form><section className="mt-5 rounded-md border bg-white p-5"><h2 className="m-0 text-lg font-semibold">Roles y acceso</h2><p className="mt-2 text-sm text-muted-foreground">Estado: {profile.data.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</p><p className="mb-0 text-sm text-muted-foreground">Roles: {profile.data.roles.map((role) => roleLabels[role] ?? role).join(' · ')}</p></section></div></WorkspaceShell>;
}

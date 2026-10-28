'use client';
import { WorkspaceNavigationProvider } from '../features/auth/workspace-navigation-state';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
export function Providers({ children }: { children: ReactNode }): React.JSX.Element { const [queryClient] = useState(() => new QueryClient()); useEffect(() => { const revalidateHistory = (event: PageTransitionEvent) => { if (event.persisted) { queryClient.clear(); window.location.reload(); } }; window.addEventListener('pageshow', revalidateHistory); return () => window.removeEventListener('pageshow', revalidateHistory); }, [queryClient]); return <QueryClientProvider client={queryClient}><WorkspaceNavigationProvider>{children}</WorkspaceNavigationProvider></QueryClientProvider>; }

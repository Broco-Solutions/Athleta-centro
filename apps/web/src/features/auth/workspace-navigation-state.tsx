'use client';
import React from 'react';

type SidebarState = [boolean, React.Dispatch<React.SetStateAction<boolean>>];
const SidebarContext = React.createContext<SidebarState | null>(null);
export function WorkspaceNavigationProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const state = React.useState(true);
  return <SidebarContext.Provider value={state}>{children}</SidebarContext.Provider>;
}
export function useDesktopSidebar(): SidebarState {
  const context = React.useContext(SidebarContext);
  const fallback = React.useState(true);
  return context ?? fallback;
}

import React from 'react';
import { AthletaContact } from '../../features/branding/athleta-contact';
import { DeveloperFooter } from '../../features/branding/developer-footer';

export function PortalFooter({ surface = 'light', firstName }: { surface?: 'light' | 'dark'; firstName?: string | undefined }): React.JSX.Element {
  return <footer className={surface === 'dark' ? 'portal-footer' : 'portal-access-footer'}>
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-3 text-center sm:px-6 lg:px-8">
      {surface === 'dark' && <span className="text-xs">Athleta · Portal personal</span>}
      <AthletaContact firstName={firstName} />
      <DeveloperFooter surface={surface} />
    </div>
  </footer>;
}

import React from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

export function PortalMessage({ children, variant = 'error' }: { children: React.ReactNode; variant?: 'error' | 'warning' | 'success' }): React.JSX.Element {
  const Icon = variant === 'success' ? CircleCheck : variant === 'warning' ? Info : CircleAlert;
  return <div role={variant === 'error' ? 'alert' : 'status'} className="portal-message" data-variant={variant}><Icon size={20} aria-hidden="true"/><div>{children}</div></div>;
}

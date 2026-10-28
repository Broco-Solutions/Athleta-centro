import React from 'react';
import './portal.css';

export default function PortalLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="portal-scope">{children}</div>;
}

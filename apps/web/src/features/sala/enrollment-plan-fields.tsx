'use client';

import React, { useState } from 'react';

type EnrollmentPlan = { id: string; name: string; isOnline?: boolean; isSelectable?: boolean };

export function EnrollmentPlanFields({ plans, planId, onPlanChange, inputClass, ready, disabled, required = true }: {
  plans: EnrollmentPlan[];
  planId: string;
  onPlanChange: (id: string) => void;
  inputClass: string;
  ready: boolean;
  disabled?: boolean;
  required?: boolean;
}): React.JSX.Element {
  const [isOnline, setIsOnline] = useState(false);
  const availablePlans = plans.filter(plan => plan.isSelectable !== false && Boolean(plan.isOnline) === isOnline);

  return <>
    <label className="grid gap-1 text-sm">Modalidad
      <select className={inputClass} value={isOnline ? 'online' : 'in-person'} disabled={disabled} onChange={event => {
        setIsOnline(event.target.value === 'online');
        onPlanChange('');
      }}>
        <option value="in-person">Presencial</option>
        <option value="online">Online</option>
      </select>
    </label>
    <label className="grid gap-1 text-sm">Plan *
      <select aria-label="Plan" required={required} className={inputClass} value={availablePlans.some(plan => plan.id === planId) ? planId : ''} disabled={disabled} onChange={event => onPlanChange(event.target.value)}>
        <option value="">Seleccionar Plan</option>
        {availablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      </select>
    </label>
    {ready && isOnline && availablePlans.length === 0 ? <p role="status" className="text-sm text-muted-foreground sm:col-span-2">Para incorporar alumnos online, creá un Plan Online desde Sala → Configuración → Planes.</p> : null}
  </>;
}

'use client';

import React from 'react';

type EnrollmentPlan = { id: string; name: string; isOnline?: boolean; isSelectable?: boolean };

export function EnrollmentPlanFields({ plans, planId, onPlanChange, inputClass, disabled, required = true }: {
  plans: EnrollmentPlan[];
  planId: string;
  onPlanChange: (id: string) => void;
  inputClass: string;
  disabled?: boolean;
  required?: boolean;
}): React.JSX.Element {
  const availablePlans = plans.filter(plan => plan.isSelectable !== false && !plan.isOnline);

  return (
    <label className="grid gap-1 text-sm">Plan *
      <select aria-label="Plan" required={required} className={inputClass} value={availablePlans.some(plan => plan.id === planId) ? planId : ''} disabled={disabled} onChange={event => onPlanChange(event.target.value)}>
        <option value="">Seleccionar Plan</option>
        {availablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      </select>
    </label>
  );
}

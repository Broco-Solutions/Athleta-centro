'use client';
import React from 'react';
import Link from 'next/link';
import { PortalFrame } from '../../portal-ui';
import { TrainingRecordHistory } from '../../../../features/sala/training-record-history';
import { portalTrainingApi } from '../../../../features/sala/training-record-api';
export default function TrainingHistoryPage(): React.JSX.Element {
  return <PortalFrame title="Mis entrenamientos" backToHome><div className="max-w-4xl"><Link className="inline-flex min-h-11 items-center rounded-md border bg-white px-3 text-sm font-medium" href="/portal/sala/rutina">Ver rutina</Link><TrainingRecordHistory api={portalTrainingApi} queryKey={['portal', 'training-records']} editable/></div></PortalFrame>;
}

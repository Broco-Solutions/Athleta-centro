import React from 'react';
import { SalaPersonWorkspace } from '../../../../features/sala/person-workspace';
export default async function SalaPersonPage({ params }: { params: Promise<{ personId: string }> }): Promise<React.JSX.Element> { const { personId } = await params; return <SalaPersonWorkspace personId={personId}/>; }

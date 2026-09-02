'use client';
import Link from 'next/link';
import React from 'react';
export const salaSections = [{ key: 'agenda', label: 'Agenda', href: '/sala' }, { key: 'students', label: 'Alumnos', href: '/sala?view=students' }, { key: 'configuration', label: 'Configuración', href: '/sala/configuration' }] as const;
export function SalaNavigation({ active = 'agenda' }: { active?: string }): React.JSX.Element { return <nav aria-label="Secciones de Sala" className="flex gap-1 overflow-x-auto border-b">{salaSections.map((section) => <Link key={section.key} href={section.href} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${active === section.key ? 'border-[#FCCC05] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{section.label}</Link>)}</nav>; }

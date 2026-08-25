import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
const inter = Inter({ subsets: ['latin'] });
export const metadata: Metadata = { title: 'Athleta Manager', description: 'Gestión integral de Athleta' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element { return <html lang="es"><body className={inter.className}><Providers>{children}</Providers></body></html>; }

import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // The development badge otherwise covers the compact rail's logout control.
  devIndicators: false,
  transpilePackages: ['@athleta/ui'],
  env: { ATHLETA_CLINIC_ENABLED: process.env.ATHLETA_CLINIC_ENABLED === 'true' ? 'true' : 'false' },
  async redirects() {
    const checkInRedirect = { source: '/sala/fichaje', destination: '/sala/ingreso', permanent: true };
    if (process.env.ATHLETA_CLINIC_ENABLED === 'true') return [checkInRedirect];
    return [
      checkInRedirect,
      { source: '/clinic', destination: '/', permanent: false },
      { source: '/clinic/:path*', destination: '/', permanent: false },
      { source: '/portal/clinic', destination: '/portal', permanent: false },
      { source: '/portal/clinic/:path*', destination: '/portal', permanent: false },
      { source: '/finance/clinical-income/new', destination: '/finance', permanent: false },
    ];
  },
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/:path*` }]; },
};
export default nextConfig;

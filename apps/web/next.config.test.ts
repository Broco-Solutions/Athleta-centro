import nextConfig from './next.config';

describe('Next.js first-delivery redirects', () => {
  const previous = process.env.ATHLETA_CLINIC_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.ATHLETA_CLINIC_ENABLED;
    else process.env.ATHLETA_CLINIC_ENABLED = previous;
  });

  it('temporarily redirects clinical pages when Clinic is disabled', async () => {
    process.env.ATHLETA_CLINIC_ENABLED = 'false';
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '/clinic', destination: '/', permanent: false }),
      expect.objectContaining({ source: '/clinic/:path*', destination: '/', permanent: false }),
      expect.objectContaining({ source: '/portal/clinic/:path*', destination: '/portal', permanent: false }),
      expect.objectContaining({ source: '/finance/clinical-income/new', destination: '/finance', permanent: false }),
    ]));
  });

  it.each(['true', 'false'])('redirects legacy Ingreso without reversing direction (Clinic=%s)', async enabled => {
    process.env.ATHLETA_CLINIC_ENABLED = enabled;
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toContainEqual({ source: '/sala/fichaje', destination: '/sala/ingreso', permanent: true });
    expect(redirects?.some(route => route.source === '/sala/ingreso')).toBe(false);
  });

  it('keeps clinical pages available when Clinic is explicitly enabled', async () => {
    process.env.ATHLETA_CLINIC_ENABLED = 'true';
    expect(await nextConfig.redirects?.()).toEqual([{ source: '/sala/fichaje', destination: '/sala/ingreso', permanent: true }]);
  });
});

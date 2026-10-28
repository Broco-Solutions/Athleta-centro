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

  it('canonicalizes only ramiro preview pages, retaining the backend origin boundary', async () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    const previousBranch = process.env.VERCEL_GIT_COMMIT_REF;
    try {
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_GIT_COMMIT_REF = 'ramiro';
      const routes = await nextConfig.redirects?.();
      const canonical = routes![0];
      expect(canonical.destination).toBe('https://athleta-001-web-git-ramiro-broco-solutions.vercel.app/:path');
      const host = new RegExp(`^${canonical.has![0].value}$`);
      expect(host.test('athleta-001-unique-broco-solutions.vercel.app')).toBe(true);
      expect(host.test('athleta-001-web-git-ramiro-broco-solutions.vercel.app')).toBe(false);
      expect(canonical.source).toContain('(?!api');
      process.env.VERCEL_ENV = 'production';
      expect((await nextConfig.redirects?.())?.some(route => route.destination === canonical.destination)).toBe(false);
    } finally {
      if (previousEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnvironment;
      if (previousBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF; else process.env.VERCEL_GIT_COMMIT_REF = previousBranch;
    }
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

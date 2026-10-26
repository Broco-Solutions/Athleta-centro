import PortalSala from './page';

it('redirects the legacy Sala page to the only Portal Home on the server', () => {
  let redirectError: unknown;
  try { PortalSala(); } catch (error) { redirectError = error; }
  expect(redirectError).toBeInstanceOf(Error);
  expect(redirectError).toMatchObject({ digest: 'NEXT_REDIRECT;replace;/portal;307;' });
});

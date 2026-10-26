import { createServer } from 'node:net';
import { assertE2ePortAvailable } from '../scripts/test-database-safety';

it('rejects an occupied E2E service port instead of reusing its server', async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a bound TCP port.');
  try {
    await expect(assertE2ePortAvailable(address.port)).rejects.toThrow(/existing servers are never reused/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

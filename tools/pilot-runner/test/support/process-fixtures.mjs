import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeTrustedCommand } from '../../lib/internal/process-supervisor.mjs';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function runArgumentEchoFixture(values) {
  return executeTrustedCommand(
    { executablePath: process.execPath, args: [join(fixtureRoot, 'argument-echo.cjs'), ...values] },
    { timeoutMs: 5_000 },
  );
}

export function runProcessTreeFixture(pidFile) {
  return executeTrustedCommand(
    { executablePath: process.execPath, args: [join(fixtureRoot, 'process-tree-parent.cjs'), pidFile] },
    { timeoutMs: 200 },
  );
}

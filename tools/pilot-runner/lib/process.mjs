import { dirname, join } from 'node:path';
import { loadPilotConfig } from './config.mjs';
import {
  buildAllowlistedEnv,
  executeTrustedCommand,
  isSecretEnvironmentName,
  ProcessExecutionError,
  sanitizeText,
} from './internal/process-supervisor.mjs';

export { buildAllowlistedEnv, isSecretEnvironmentName, ProcessExecutionError, sanitizeText };

async function fixedProbe(executablePath, args) {
  return executeTrustedCommand({ executablePath, args }, { timeoutMs: 10_000 });
}

function assertNoProbeArguments(count) {
  if (count !== 0) {
    throw new ProcessExecutionError('Fixed tool probes do not accept arguments', 'INVALID_PROBE_ARGUMENTS');
  }
}

export function probeNodeVersion() {
  assertNoProbeArguments(arguments.length);
  return fixedProbe(process.execPath, ['--version']);
}

export function probePnpmVersion() {
  assertNoProbeArguments(arguments.length);
  return fixedProbe(join(dirname(process.execPath), 'pnpm'), ['--version']);
}

export function probePnpmStorePath() {
  assertNoProbeArguments(arguments.length);
  return fixedProbe(join(dirname(process.execPath), 'pnpm'), ['store', 'path']);
}

export function probeGitVersion() {
  assertNoProbeArguments(arguments.length);
  return fixedProbe('/usr/bin/git', ['--version']);
}

export function probeGhVersion() {
  assertNoProbeArguments(arguments.length);
  return fixedProbe('/usr/bin/gh', ['--version']);
}

export async function probeCodexVersion() {
  assertNoProbeArguments(arguments.length);
  const config = await loadPilotConfig();
  return fixedProbe(config.tools.codexExecutable, ['--version']);
}

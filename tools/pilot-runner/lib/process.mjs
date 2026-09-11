import { spawn } from 'node:child_process';

export const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NO_COLOR',
  'TERM',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
]);

const SECRET_ENV_NAME = /^(?:.*(?:PASSWORD|TOKEN|SECRET|COOKIE|PRIVATE_KEY).*|DATABASE_URL|GH_TOKEN|GITHUB_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)$/i;

export class ProcessExecutionError extends Error {
  constructor(message, reasonCode, details = {}) {
    super(message);
    this.name = 'ProcessExecutionError';
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

export function sanitizeText(value) {
  return String(value)
    .replace(/\b(Bearer)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/(https?:\/\/)([^\s/:@]+):([^\s/@]+)@/gi, '$1[REDACTED]@')
    .replace(
      /((?:DATABASE_URL|GH_TOKEN|GITHUB_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|PASSWORD|TOKEN|SECRET|COOKIE)["']?\s*[:=]\s*["']?)([^\s,"']+)/gi,
      '$1[REDACTED]',
    );
}

export function buildAllowlistedEnv({
  sourceEnv = process.env,
  allowlist = DEFAULT_ENV_ALLOWLIST,
  overrides = {},
} = {}) {
  const allowed = new Set(allowlist);
  const result = {};

  for (const name of allowed) {
    const value = sourceEnv[name];
    if (typeof value === 'string') {
      result[name] = value;
    }
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (!allowed.has(name)) {
      throw new ProcessExecutionError(
        `Environment variable is not allowlisted: ${name}`,
        'ENV_NOT_ALLOWLISTED',
        { name },
      );
    }
    if (typeof value !== 'string') {
      throw new ProcessExecutionError(
        `Environment override must be a string: ${name}`,
        'INVALID_ENV_VALUE',
        { name },
      );
    }
    result[name] = value;
  }

  return result;
}

function appendCaptured(chunks, chunk, currentBytes, maxOutputBytes) {
  if (currentBytes >= maxOutputBytes) return currentBytes;
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = maxOutputBytes - currentBytes;
  chunks.push(buffer.subarray(0, remaining));
  return currentBytes + Math.min(buffer.length, remaining);
}

export function runProcess(
  executable,
  args,
  {
    cwd,
    timeoutMs = 60_000,
    maxOutputBytes = 1_048_576,
    sourceEnv = process.env,
    allowedEnv = DEFAULT_ENV_ALLOWLIST,
    env = {},
  } = {},
) {
  if (typeof executable !== 'string' || executable.length === 0) {
    throw new ProcessExecutionError('Executable must be a non-empty string', 'INVALID_EXECUTABLE');
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new ProcessExecutionError('Process arguments must be an array of strings', 'INVALID_ARGUMENTS');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ProcessExecutionError('A positive timeout is required', 'INVALID_TIMEOUT');
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new ProcessExecutionError('A positive output limit is required', 'INVALID_OUTPUT_LIMIT');
  }

  const childEnv = buildAllowlistedEnv({ sourceEnv, allowlist: allowedEnv, overrides: env });

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, [...args], {
        cwd,
        env: childEnv,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      reject(
        new ProcessExecutionError(
          sanitizeText(error instanceof Error ? error.message : error),
          'PROCESS_SPAWN_FAILED',
        ),
      );
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let forceKillTimer;
    let settled = false;

    child.stdout.on('data', (chunk) => {
      const before = stdoutBytes;
      stdoutBytes = appendCaptured(stdoutChunks, chunk, stdoutBytes, maxOutputBytes);
      if (stdoutBytes - before < chunk.length) stdoutTruncated = true;
    });
    child.stderr.on('data', (chunk) => {
      const before = stderrBytes;
      stderrBytes = appendCaptured(stderrChunks, chunk, stderrBytes, maxOutputBytes);
      if (stderrBytes - before < chunk.length) stderrTruncated = true;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 250);
      forceKillTimer.unref?.();
    }, timeoutMs);
    timeout.unref?.();

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(
        new ProcessExecutionError(
          sanitizeText(error instanceof Error ? error.message : error),
          'PROCESS_SPAWN_FAILED',
        ),
      );
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({
        code,
        signal,
        timedOut,
        stdout: sanitizeText(Buffer.concat(stdoutChunks).toString('utf8')),
        stderr: sanitizeText(Buffer.concat(stderrChunks).toString('utf8')),
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

export function isSecretEnvironmentName(name) {
  return SECRET_ENV_NAME.test(name);
}

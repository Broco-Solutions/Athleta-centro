import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

export const DEFAULT_ENV_ALLOWLIST = Object.freeze(['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'NO_COLOR', 'TERM']);
const TRUSTED_SYSTEM_PATH = '/usr/bin:/bin';
const SECRET_ENV_MARKERS = Object.freeze(['TOKEN', 'SECRET', 'PASSWORD', 'PASSPHRASE', 'APIKEY', 'CREDENTIAL', 'AUTH', 'PRIVATEKEY', 'DATABASEURL', 'COOKIE', 'SESSION']);

export class ProcessExecutionError extends Error {
  constructor(message, reasonCode, details = {}) {
    super(message);
    this.name = 'ProcessExecutionError';
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

function normalizedSecretName(name) {
  return String(name).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isSecretEnvironmentName(name) {
  const normalized = normalizedSecretName(name);
  return SECRET_ENV_MARKERS.some((marker) => normalized.includes(marker)) || normalized.startsWith('AWS') || normalized.startsWith('S3') || normalized.startsWith('OPENAI');
}

export function sanitizeText(value) {
  return String(value)
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/(https?:\/\/)([^\s/:@]+):([^\s/@]+)@/gi, '$1[REDACTED]@')
    .replace(/(["']?(?:OPENAI_API_KEY|API_KEY|APIKEY|PRIVATE_KEY|DATABASE_URL|GH_TOKEN|GITHUB_TOKEN|AWS[A-Z0-9_]*|S3[A-Z0-9_]*|PASSWORD|PASSPHRASE|TOKEN|SECRET|COOKIE|SESSION|CREDENTIALS?|AUTH(?:ORIZATION)?)["']?\s*[:=]\s*)(["'])(.*?)\2/gi, '$1$2[REDACTED]$2')
    .replace(/((?:OPENAI_API_KEY|API_KEY|APIKEY|PRIVATE_KEY|DATABASE_URL|GH_TOKEN|GITHUB_TOKEN|AWS[A-Z0-9_]*|S3[A-Z0-9_]*|PASSWORD|PASSPHRASE|TOKEN|SECRET|COOKIE|SESSION|CREDENTIALS?|AUTH(?:ORIZATION)?)\s*[:=]\s*)([^\s,;]+)/gi, '$1[REDACTED]');
}

export function buildAllowlistedEnv({ sourceEnv = process.env, allowlist = DEFAULT_ENV_ALLOWLIST, overrides = {} } = {}) {
  if (!Array.isArray(allowlist) || allowlist.some((name) => typeof name !== 'string')) {
    throw new ProcessExecutionError('Environment allowlist must contain names', 'INVALID_ENV_ALLOWLIST');
  }
  for (const name of allowlist) {
    if (isSecretEnvironmentName(name)) throw new ProcessExecutionError(`Secret-classified environment variable cannot be allowlisted: ${name}`, 'SECRET_ENV_FORBIDDEN', { name });
  }
  const allowed = new Set(allowlist);
  const result = {};
  for (const name of allowed) {
    if (name === 'PATH') result.PATH = `${dirname(process.execPath)}:${TRUSTED_SYSTEM_PATH}`;
    else if (typeof sourceEnv[name] === 'string') result[name] = sourceEnv[name];
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (!allowed.has(name)) throw new ProcessExecutionError(`Environment variable is not allowlisted: ${name}`, 'ENV_NOT_ALLOWLISTED');
    if (isSecretEnvironmentName(name)) throw new ProcessExecutionError(`Secret-classified environment override is forbidden: ${name}`, 'SECRET_ENV_FORBIDDEN');
    if (typeof value !== 'string') throw new ProcessExecutionError(`Environment override must be a string: ${name}`, 'INVALID_ENV_VALUE');
    result[name] = value;
  }
  return result;
}

async function canonicalExecutable(candidate) {
  if (typeof candidate !== 'string' || !isAbsolute(candidate)) throw new ProcessExecutionError('Trusted executable path must be absolute', 'UNTRUSTED_EXECUTABLE');
  let resolved;
  let metadata;
  try {
    resolved = await realpath(candidate);
    await access(resolved, fsConstants.X_OK);
    metadata = await stat(resolved);
  } catch (error) {
    throw new ProcessExecutionError(sanitizeText(error instanceof Error ? error.message : error), 'TRUSTED_EXECUTABLE_UNAVAILABLE', { executable: candidate });
  }
  if (!metadata.isFile() || (metadata.mode & 0o022) !== 0) throw new ProcessExecutionError('Trusted executable is not a protected regular file', 'UNTRUSTED_EXECUTABLE');
  return resolved;
}

function signalProcessGroup(child, signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
}

function capture(chunks, chunk, currentBytes, maximum) {
  if (currentBytes >= maximum) return currentBytes;
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = maximum - currentBytes;
  chunks.push(buffer.subarray(0, remaining));
  return currentBytes + Math.min(buffer.length, remaining);
}

// Package-private primitive. Public runner modules expose only closed adapters.
export async function executeTrustedCommand({ executablePath, args, fixedEnv = {} }, { cwd, timeoutMs = 60_000, maxOutputBytes = 1_048_576, sourceEnv = process.env } = {}) {
  if (process.platform !== 'linux') throw new ProcessExecutionError('Pilot v1 requires Linux/WSL process groups', 'PLATFORM_UNSUPPORTED');
  if (!Array.isArray(args) || args.some((value) => typeof value !== 'string')) throw new ProcessExecutionError('Internal command arguments must be strings', 'INVALID_INTERNAL_COMMAND');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new ProcessExecutionError('A positive timeout is required', 'INVALID_TIMEOUT');
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) throw new ProcessExecutionError('A positive output limit is required', 'INVALID_OUTPUT_LIMIT');
  const executable = await canonicalExecutable(executablePath);
  const env = buildAllowlistedEnv({ sourceEnv });
  Object.assign(env, fixedEnv);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, [...args], { cwd, env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(new ProcessExecutionError(sanitizeText(error), 'PROCESS_SPAWN_FAILED'));
      return;
    }
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let killFinished = false;
    let closeResult;
    let forceKillTimer;
    let settled = false;
    const settle = () => {
      if (settled || !closeResult || (timedOut && !killFinished)) return;
      settled = true;
      resolve({ code: closeResult.code, signal: closeResult.signal, timedOut, stdout: sanitizeText(Buffer.concat(stdoutChunks).toString('utf8')), stderr: sanitizeText(Buffer.concat(stderrChunks).toString('utf8')), stdoutTruncated, stderrTruncated });
    };
    child.stdout.on('data', (chunk) => { const before = stdoutBytes; stdoutBytes = capture(stdoutChunks, chunk, stdoutBytes, maxOutputBytes); if (stdoutBytes - before < chunk.length) stdoutTruncated = true; });
    child.stderr.on('data', (chunk) => { const before = stderrBytes; stderrBytes = capture(stderrChunks, chunk, stderrBytes, maxOutputBytes); if (stderrBytes - before < chunk.length) stderrTruncated = true; });
    const timeout = setTimeout(() => {
      timedOut = true;
      try { signalProcessGroup(child, 'SIGTERM'); } catch {}
      forceKillTimer = setTimeout(() => { try { signalProcessGroup(child, 'SIGKILL'); } catch {} killFinished = true; settle(); }, 250);
    }, timeoutMs);
    child.once('error', (error) => { if (settled) return; settled = true; clearTimeout(timeout); if (forceKillTimer) clearTimeout(forceKillTimer); reject(new ProcessExecutionError(sanitizeText(error), 'PROCESS_SPAWN_FAILED')); });
    child.once('close', (code, signal) => { closeResult = { code, signal }; clearTimeout(timeout); if (!timedOut) killFinished = true; settle(); });
  });
}

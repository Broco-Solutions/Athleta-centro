import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

export const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NO_COLOR',
  'TERM',
]);

export const TECHNICAL_OPERATIONS = Object.freeze({
  NODE_VERSION: 'node.version',
  PNPM_VERSION: 'pnpm.version',
  PNPM_INSTALL: 'pnpm.install',
  PNPM_PRISMA_GENERATE: 'pnpm.prisma-generate',
  PNPM_STORE_PATH: 'pnpm.store-path',
  GIT_VERSION: 'git.version',
  GIT_ORIGIN: 'git.origin',
  GIT_REV_PARSE: 'git.rev-parse',
  GIT_BRANCH_CURRENT: 'git.branch-current',
  GIT_STATUS: 'git.status',
  GIT_COMMIT_EXISTS: 'git.commit-exists',
  GIT_BRANCH_EXISTS: 'git.branch-exists',
  GIT_WORKTREE_LIST: 'git.worktree-list',
  GIT_WORKTREE_ADD: 'git.worktree-add',
  GH_VERSION: 'gh.version',
  CODEX_VERSION: 'codex.version',
});

export const BOOTSTRAP_OPERATIONS = Object.freeze({
  NODE_VERSION: TECHNICAL_OPERATIONS.NODE_VERSION,
  PNPM_VERSION: TECHNICAL_OPERATIONS.PNPM_VERSION,
  PNPM_INSTALL: TECHNICAL_OPERATIONS.PNPM_INSTALL,
  PNPM_PRISMA_GENERATE: TECHNICAL_OPERATIONS.PNPM_PRISMA_GENERATE,
});

// Pilot v1 is deliberately Linux/WSL-only: process groups and user/network
// namespaces are the fail-closed safety boundary. No weaker platform fallback exists.
export const PROCESS_PLATFORM_LIMITATION =
  'Pilot v1 process-tree termination and Bootstrap network isolation require Linux/WSL.';

const TRUSTED_SYSTEM_PATH = '/usr/bin:/bin';
const PILOT_CODEX_EXECUTABLE = '/home/rcoirini/.nvm/versions/node/v22.23.0/bin/codex';
const TASK_BRANCH_PATTERN = /^athleta-pilot\/ATH-[0-9]+-[a-z0-9-]+$/;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BOOTSTRAP_OPERATION_SET = new Set(Object.values(BOOTSTRAP_OPERATIONS));
const SECRET_ENV_MARKERS = Object.freeze([
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSPHRASE',
  'APIKEY',
  'CREDENTIAL',
  'AUTH',
  'PRIVATEKEY',
  'DATABASEURL',
  'COOKIE',
  'SESSION',
]);

const PROCESS_TREE_TEST_SCRIPT = String.raw`
  const { spawn } = require('node:child_process');
  const { writeFileSync } = require('node:fs');
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
    detached: false,
    stdio: 'ignore',
  });
  writeFileSync(process.argv[1], JSON.stringify({ parentPid: process.pid, childPid: child.pid }));
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
`;

const NETWORK_PROBE_SCRIPT = String.raw`
  const net = require('node:net');
  const socket = net.createConnection({ host: process.argv[1], port: Number(process.argv[2]) });
  const fail = () => process.exit(0);
  socket.setTimeout(1000, fail);
  socket.once('error', fail);
  socket.once('connect', () => process.exit(42));
`;

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
  return (
    SECRET_ENV_MARKERS.some((marker) => normalized.includes(marker)) ||
    normalized.startsWith('AWS') ||
    normalized.startsWith('S3') ||
    normalized.startsWith('OPENAI')
  );
}

export function sanitizeText(value) {
  return String(value)
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/(https?:\/\/)([^\s/:@]+):([^\s/@]+)@/gi, '$1[REDACTED]@')
    .replace(
      /(["']?(?:OPENAI_API_KEY|API_KEY|APIKEY|PRIVATE_KEY|DATABASE_URL|GH_TOKEN|GITHUB_TOKEN|AWS[A-Z0-9_]*|S3[A-Z0-9_]*|PASSWORD|PASSPHRASE|TOKEN|SECRET|COOKIE|SESSION|CREDENTIALS?|AUTH(?:ORIZATION)?)["']?\s*[:=]\s*)(["'])(.*?)\2/gi,
      '$1$2[REDACTED]$2',
    )
    .replace(
      /((?:OPENAI_API_KEY|API_KEY|APIKEY|PRIVATE_KEY|DATABASE_URL|GH_TOKEN|GITHUB_TOKEN|AWS[A-Z0-9_]*|S3[A-Z0-9_]*|PASSWORD|PASSPHRASE|TOKEN|SECRET|COOKIE|SESSION|CREDENTIALS?|AUTH(?:ORIZATION)?)\s*[:=]\s*)([^\s,;]+)/gi,
      '$1[REDACTED]',
    );
}

export function buildAllowlistedEnv({
  sourceEnv = process.env,
  allowlist = DEFAULT_ENV_ALLOWLIST,
  overrides = {},
} = {}) {
  if (!Array.isArray(allowlist) || allowlist.some((name) => typeof name !== 'string')) {
    throw new ProcessExecutionError('Environment allowlist must contain names', 'INVALID_ENV_ALLOWLIST');
  }
  for (const name of allowlist) {
    if (isSecretEnvironmentName(name)) {
      throw new ProcessExecutionError(
        `Secret-classified environment variable cannot be allowlisted: ${name}`,
        'SECRET_ENV_FORBIDDEN',
        { name },
      );
    }
  }

  const allowed = new Set(allowlist);
  const result = {};
  for (const name of allowed) {
    if (name === 'PATH') {
      result.PATH = `${dirname(process.execPath)}:${TRUSTED_SYSTEM_PATH}`;
      continue;
    }
    const value = sourceEnv[name];
    if (typeof value === 'string') result[name] = value;
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (!allowed.has(name)) {
      throw new ProcessExecutionError(
        `Environment variable is not allowlisted: ${name}`,
        'ENV_NOT_ALLOWLISTED',
        { name },
      );
    }
    if (isSecretEnvironmentName(name)) {
      throw new ProcessExecutionError(
        `Secret-classified environment override is forbidden: ${name}`,
        'SECRET_ENV_FORBIDDEN',
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

function assertNoParameters(parameters) {
  if (
    parameters === undefined ||
    (parameters !== null &&
      typeof parameters === 'object' &&
      !Array.isArray(parameters) &&
      Object.keys(parameters).length === 0)
  ) {
    return;
  }
  throw new ProcessExecutionError('Operation does not accept parameters', 'INVALID_OPERATION_PARAMETERS');
}

function assertParameterKeys(parameters, allowedKeys) {
  if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new ProcessExecutionError('Operation parameters must be an object', 'INVALID_OPERATION_PARAMETERS');
  }
  for (const key of Object.keys(parameters)) {
    if (!allowedKeys.includes(key)) {
      throw new ProcessExecutionError(
        `Operation parameter is not allowed: ${key}`,
        'INVALID_OPERATION_PARAMETERS',
      );
    }
  }
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new ProcessExecutionError(`${label} must be an absolute path`, 'INVALID_OPERATION_PARAMETERS');
  }
  return value;
}

function gitAt(repoPath, args) {
  return { executable: 'git', args: ['-C', assertAbsolutePath(repoPath, 'repoPath'), ...args] };
}

function commandFor(operation, parameters = {}) {
  switch (operation) {
    case TECHNICAL_OPERATIONS.NODE_VERSION:
      assertNoParameters(parameters);
      return { executable: 'node', args: ['--version'] };
    case TECHNICAL_OPERATIONS.PNPM_VERSION:
      assertNoParameters(parameters);
      return { executable: 'pnpm', args: ['--version'] };
    case TECHNICAL_OPERATIONS.PNPM_INSTALL:
      assertNoParameters(parameters);
      return {
        executable: 'pnpm',
        args: ['install', '--offline', '--frozen-lockfile', '--verify-store-integrity'],
      };
    case TECHNICAL_OPERATIONS.PNPM_PRISMA_GENERATE:
      assertNoParameters(parameters);
      return {
        executable: 'pnpm',
        args: ['--filter', '@athleta/api', 'prisma:generate'],
        fixedEnv: {
          DATABASE_URL:
            'postgresql://pilot_runner:synthetic@127.0.0.1:1/pilot_generate?schema=public',
        },
      };
    case TECHNICAL_OPERATIONS.PNPM_STORE_PATH:
      assertNoParameters(parameters);
      return { executable: 'pnpm', args: ['store', 'path'] };
    case TECHNICAL_OPERATIONS.GIT_VERSION:
      assertNoParameters(parameters);
      return { executable: 'git', args: ['--version'] };
    case TECHNICAL_OPERATIONS.GH_VERSION:
      assertNoParameters(parameters);
      return { executable: 'gh', args: ['--version'] };
    case TECHNICAL_OPERATIONS.CODEX_VERSION:
      assertNoParameters(parameters);
      return { executable: 'codex', args: ['--version'] };
    case TECHNICAL_OPERATIONS.GIT_ORIGIN:
      assertParameterKeys(parameters, ['repoPath']);
      return gitAt(parameters.repoPath, ['config', '--get', 'remote.origin.url']);
    case TECHNICAL_OPERATIONS.GIT_REV_PARSE: {
      assertParameterKeys(parameters, ['repoPath', 'ref']);
      const allowedRefs = new Set(['HEAD', 'main', 'origin/main', '--show-toplevel', '--git-common-dir']);
      if (!allowedRefs.has(parameters.ref)) {
        throw new ProcessExecutionError('Git ref is not allowlisted', 'INVALID_OPERATION_PARAMETERS');
      }
      return gitAt(parameters.repoPath, ['rev-parse', parameters.ref]);
    }
    case TECHNICAL_OPERATIONS.GIT_BRANCH_CURRENT:
      assertParameterKeys(parameters, ['repoPath']);
      return gitAt(parameters.repoPath, ['branch', '--show-current']);
    case TECHNICAL_OPERATIONS.GIT_STATUS:
      assertParameterKeys(parameters, ['repoPath', 'withBranch']);
      if (parameters.withBranch !== undefined && typeof parameters.withBranch !== 'boolean') {
        throw new ProcessExecutionError('withBranch must be boolean', 'INVALID_OPERATION_PARAMETERS');
      }
      return gitAt(parameters.repoPath, [
        'status',
        '--porcelain=v1',
        ...(parameters.withBranch ? ['--branch'] : []),
      ]);
    case TECHNICAL_OPERATIONS.GIT_COMMIT_EXISTS:
      assertParameterKeys(parameters, ['repoPath', 'sha']);
      if (!FULL_SHA_PATTERN.test(parameters.sha)) {
        throw new ProcessExecutionError('Commit must be a full SHA', 'INVALID_OPERATION_PARAMETERS');
      }
      return gitAt(parameters.repoPath, ['cat-file', '-e', `${parameters.sha}^{commit}`]);
    case TECHNICAL_OPERATIONS.GIT_BRANCH_EXISTS:
      assertParameterKeys(parameters, ['repoPath', 'branchName']);
      if (!TASK_BRANCH_PATTERN.test(parameters.branchName)) {
        throw new ProcessExecutionError('Branch is outside the pilot namespace', 'INVALID_OPERATION_PARAMETERS');
      }
      return gitAt(parameters.repoPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${parameters.branchName}`,
      ]);
    case TECHNICAL_OPERATIONS.GIT_WORKTREE_LIST:
      assertParameterKeys(parameters, ['repoPath']);
      return gitAt(parameters.repoPath, ['worktree', 'list', '--porcelain']);
    case TECHNICAL_OPERATIONS.GIT_WORKTREE_ADD:
      assertParameterKeys(parameters, ['repoPath', 'branchName', 'targetPath', 'baseSha']);
      if (!TASK_BRANCH_PATTERN.test(parameters.branchName)) {
        throw new ProcessExecutionError('Branch is outside the pilot namespace', 'INVALID_OPERATION_PARAMETERS');
      }
      if (!FULL_SHA_PATTERN.test(parameters.baseSha)) {
        throw new ProcessExecutionError('Base must be a full SHA', 'INVALID_OPERATION_PARAMETERS');
      }
      return gitAt(parameters.repoPath, [
        'worktree',
        'add',
        '-b',
        parameters.branchName,
        assertAbsolutePath(parameters.targetPath, 'targetPath'),
        parameters.baseSha,
      ]);
    default:
      throw new ProcessExecutionError('Operation is not allowlisted', 'OPERATION_NOT_ALLOWED', {
        operation: typeof operation === 'string' ? operation : typeof operation,
      });
  }
}

function executableCandidate(name) {
  switch (name) {
    case 'node':
      return process.execPath;
    case 'pnpm':
      return join(dirname(process.execPath), 'pnpm');
    case 'git':
      return '/usr/bin/git';
    case 'gh':
      return '/usr/bin/gh';
    case 'codex':
      return PILOT_CODEX_EXECUTABLE;
    case 'unshare':
      return '/usr/bin/unshare';
    case 'true':
      return '/usr/bin/true';
    default:
      throw new ProcessExecutionError('Executable is not allowlisted', 'EXECUTABLE_NOT_ALLOWED');
  }
}

async function resolveTrustedExecutable(name) {
  const candidate = executableCandidate(name);
  if (!isAbsolute(candidate)) {
    throw new ProcessExecutionError('Trusted executable path must be absolute', 'UNTRUSTED_EXECUTABLE');
  }
  let resolved;
  let metadata;
  try {
    resolved = await realpath(candidate);
    await access(resolved, fsConstants.X_OK);
    metadata = await stat(resolved);
  } catch (error) {
    throw new ProcessExecutionError(
      sanitizeText(error instanceof Error ? error.message : error),
      'TRUSTED_EXECUTABLE_UNAVAILABLE',
      { executable: name },
    );
  }
  if (!metadata.isFile() || (metadata.mode & 0o022) !== 0) {
    throw new ProcessExecutionError(
      'Trusted executable must be a non-group/world-writable regular file',
      'UNTRUSTED_EXECUTABLE',
      { executable: name },
    );
  }
  return resolved;
}

function appendCaptured(chunks, chunk, currentBytes, maxOutputBytes) {
  if (currentBytes >= maxOutputBytes) return currentBytes;
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = maxOutputBytes - currentBytes;
  chunks.push(buffer.subarray(0, remaining));
  return currentBytes + Math.min(buffer.length, remaining);
}

function signalProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function executeCommand(
  command,
  {
    cwd,
    timeoutMs = 60_000,
    maxOutputBytes = 1_048_576,
    sourceEnv = process.env,
    allowedEnv = DEFAULT_ENV_ALLOWLIST,
    env = {},
    isolateNetwork = false,
  } = {},
) {
  if (process.platform !== 'linux') {
    throw new ProcessExecutionError(PROCESS_PLATFORM_LIMITATION, 'PLATFORM_UNSUPPORTED');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ProcessExecutionError('A positive timeout is required', 'INVALID_TIMEOUT');
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new ProcessExecutionError('A positive output limit is required', 'INVALID_OUTPUT_LIMIT');
  }

  const childEnv = buildAllowlistedEnv({ sourceEnv, allowlist: allowedEnv, overrides: env });
  Object.assign(childEnv, command.fixedEnv ?? {});
  const targetExecutable = await resolveTrustedExecutable(command.executable);
  const targetArgs = [...command.args];
  const executable = isolateNetwork ? await resolveTrustedExecutable('unshare') : targetExecutable;
  const args = isolateNetwork
    ? ['--user', '--map-current-user', '--net', '--', targetExecutable, ...targetArgs]
    : targetArgs;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env: childEnv,
        shell: false,
        detached: true,
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
    let forceKillCompleted = false;
    let closeResult;
    let forceKillTimer;
    let settled = false;

    const settleFromClose = () => {
      if (settled || !closeResult || (timedOut && !forceKillCompleted)) return;
      settled = true;
      resolve({
        code: closeResult.code,
        signal: closeResult.signal,
        timedOut,
        stdout: sanitizeText(Buffer.concat(stdoutChunks).toString('utf8')),
        stderr: sanitizeText(Buffer.concat(stderrChunks).toString('utf8')),
        stdoutTruncated,
        stderrTruncated,
      });
    };

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
      try {
        signalProcessGroup(child, 'SIGTERM');
      } catch {}
      forceKillTimer = setTimeout(() => {
        try {
          signalProcessGroup(child, 'SIGKILL');
        } catch {}
        forceKillCompleted = true;
        settleFromClose();
      }, 250);
    }, timeoutMs);

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
      closeResult = { code, signal };
      clearTimeout(timeout);
      if (!timedOut) forceKillCompleted = true;
      settleFromClose();
    });
  });
}

function closedExecutionOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ProcessExecutionError('Execution options must be an object', 'INVALID_EXECUTION_OPTIONS');
  }
  const allowed = new Set(['cwd', 'timeoutMs', 'maxOutputBytes', 'sourceEnv']);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw new ProcessExecutionError(
        `Execution option is not allowed: ${key}`,
        'INVALID_EXECUTION_OPTIONS',
      );
    }
  }
  if (options.cwd !== undefined) assertAbsolutePath(options.cwd, 'cwd');
  if (
    options.sourceEnv !== undefined &&
    (options.sourceEnv === null ||
      typeof options.sourceEnv !== 'object' ||
      Array.isArray(options.sourceEnv))
  ) {
    throw new ProcessExecutionError('sourceEnv must be an object', 'INVALID_EXECUTION_OPTIONS');
  }
  return options;
}

export async function runTechnicalOperation(operation, parameters = {}, options = {}) {
  return executeCommand(commandFor(operation, parameters), closedExecutionOptions(options));
}

export async function runBootstrapOperation(operation, parameters = {}, options = {}) {
  if (!BOOTSTRAP_OPERATION_SET.has(operation)) {
    throw new ProcessExecutionError('Operation is not allowed in Bootstrap', 'OPERATION_NOT_ALLOWED');
  }
  return executeCommand(commandFor(operation, parameters), {
    ...closedExecutionOptions(options),
    isolateNetwork: true,
  });
}

export async function verifyBootstrapIsolationCapability(options = {}) {
  const closedOptions = closedExecutionOptions(options);
  return executeCommand(
    { executable: 'true', args: [] },
    { ...closedOptions, timeoutMs: closedOptions.timeoutMs ?? 5_000, isolateNetwork: true },
  );
}

export async function runBootstrapNetworkProbe({ host = '127.0.0.1', port }, options = {}) {
  if (host !== '127.0.0.1' || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new ProcessExecutionError('Invalid network probe target', 'INVALID_OPERATION_PARAMETERS');
  }
  const closedOptions = closedExecutionOptions(options);
  return executeCommand(
    { executable: 'node', args: ['-e', NETWORK_PROBE_SCRIPT, host, String(port)] },
    { ...closedOptions, timeoutMs: closedOptions.timeoutMs ?? 5_000, isolateNetwork: true },
  );
}

// Fixed, non-production fixture: it cannot select an executable, shell, or script.
export async function runProcessTreeTestFixture(pidFile, options = {}) {
  assertAbsolutePath(pidFile, 'pidFile');
  const closedOptions = closedExecutionOptions(options);
  return executeCommand(
    { executable: 'node', args: ['-e', PROCESS_TREE_TEST_SCRIPT, pidFile] },
    closedOptions,
  );
}

export async function runArgumentEchoTest(values, options = {}) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new ProcessExecutionError('Values must be strings', 'INVALID_OPERATION_PARAMETERS');
  }
  const closedOptions = closedExecutionOptions(options);
  return executeCommand(
    {
      executable: 'node',
      args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...values],
    },
    closedOptions,
  );
}

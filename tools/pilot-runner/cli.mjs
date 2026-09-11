#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { access, chmod, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runTechnicalOperation, TECHNICAL_OPERATIONS } from './lib/process.mjs';

const runnerRoot = dirname(fileURLToPath(import.meta.url));
const configPath = join(runnerRoot, 'config', 'pilot-v1.json');

function result(status, check, message, reasonCode) {
  return { status, check, message, ...(reasonCode ? { reasonCode } : {}) };
}

async function loadConfig() {
  const value = JSON.parse(await readFile(configPath, 'utf8'));
  if (value.schemaVersion !== 1) throw new Error('Unsupported pilot configuration schema');
  return value;
}

async function runTool(operation, parameters = {}) {
  try {
    return await runTechnicalOperation(operation, parameters, { timeoutMs: 10_000 });
  } catch (error) {
    return { code: null, timedOut: false, stdout: '', stderr: error.message };
  }
}

async function checkWritableDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  try {
    await chmod(path, 0o700);
  } catch (error) {
    if (!['EPERM', 'ENOSYS', 'EINVAL'].includes(error?.code)) throw error;
  }
  await access(path, fsConstants.R_OK | fsConstants.W_OK);
  const probe = join(path, `.preflight-${process.pid}-${randomUUID()}`);
  const handle = await open(probe, 'wx', 0o600);
  try {
    await handle.writeFile('preflight\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
    await unlink(probe).catch(() => {});
  }
}

async function preflight() {
  const config = await loadConfig();
  const checks = [];
  const expectedRepo = await realpath(config.repository.root).catch(() => null);
  const actualRepo = await realpath(resolve(runnerRoot, '..', '..')).catch(() => null);
  checks.push(
    expectedRepo && actualRepo === expectedRepo
      ? result('PASS', 'repository', `Repository root: ${actualRepo}`)
      : result('BLOCKED', 'repository', 'Runner is not executing from the configured repository', 'WRONG_REPOSITORY'),
  );

  const nodeVersion = process.version.replace(/^v/, '');
  checks.push(
    nodeVersion === config.runtime.node
      ? result('PASS', 'node', `Node ${nodeVersion}`)
      : result(
          'BLOCKED',
          'node',
          `Expected Node ${config.runtime.node}, found ${nodeVersion}`,
          'NODE_VERSION_MISMATCH',
        ),
  );

  const [pnpm, git, codex, gh] = await Promise.all([
    runTool(TECHNICAL_OPERATIONS.PNPM_VERSION),
    runTool(TECHNICAL_OPERATIONS.GIT_VERSION),
    runTool(TECHNICAL_OPERATIONS.CODEX_VERSION),
    runTool(TECHNICAL_OPERATIONS.GH_VERSION),
  ]);
  const pnpmVersion = pnpm.stdout.trim();
  checks.push(
    pnpm.code === 0 && pnpmVersion === config.runtime.pnpm
      ? result('PASS', 'pnpm', `pnpm ${pnpmVersion}`)
      : result(
          'BLOCKED',
          'pnpm',
          `Expected pnpm ${config.runtime.pnpm}, found ${pnpmVersion || 'unavailable'}`,
          'PNPM_VERSION_MISMATCH',
        ),
  );
  for (const [name, toolResult] of [
    ['git', git],
    ['codex', codex],
    ['gh', gh],
  ]) {
    checks.push(
      toolResult.code === 0 && !toolResult.timedOut
        ? result('PASS', name, toolResult.stdout.trim().split('\n')[0] || `${name} available`)
        : result('BLOCKED', name, `${name} is unavailable`, 'TOOL_UNAVAILABLE'),
    );
  }

  if (expectedRepo) {
    const [origin, mainSha, originMainSha, status] = await Promise.all([
      runTool(TECHNICAL_OPERATIONS.GIT_ORIGIN, { repoPath: expectedRepo }),
      runTool(TECHNICAL_OPERATIONS.GIT_REV_PARSE, { repoPath: expectedRepo, ref: 'main' }),
      runTool(TECHNICAL_OPERATIONS.GIT_REV_PARSE, {
        repoPath: expectedRepo,
        ref: 'origin/main',
      }),
      runTool(TECHNICAL_OPERATIONS.GIT_STATUS, { repoPath: expectedRepo, withBranch: true }),
    ]);
    checks.push(
      origin.code === 0 && origin.stdout.trim() === config.repository.origin
        ? result('PASS', 'origin', `Origin: ${origin.stdout.trim()}`)
        : result('BLOCKED', 'origin', 'Origin does not match the configured repository', 'REMOTE_MISMATCH'),
    );
    checks.push(
      mainSha.code === 0 &&
      originMainSha.code === 0 &&
      mainSha.stdout.trim() === config.repository.approvedBaseSha &&
      originMainSha.stdout.trim() === config.repository.approvedBaseSha
        ? result('PASS', 'baseline', `Approved base: ${config.repository.approvedBaseSha}`)
        : result('BLOCKED', 'baseline', 'main/origin/main differ from the approved base', 'BASELINE_MISMATCH'),
    );
    if (status.code !== 0) {
      checks.push(result('BLOCKED', 'git-status', 'Git status is unavailable', 'GIT_STATUS_UNAVAILABLE'));
    } else {
      const lines = status.stdout.trim().split('\n');
      const dirty = lines.slice(1).length > 0;
      checks.push(
        dirty
          ? result('WARNING', 'git-status', `Working tree has ${lines.length - 1} change(s)`)
          : result('PASS', 'git-status', lines[0] || 'Working tree is clean'),
      );
    }

    for (const [check, relativePath] of [
      ['product-pdf', config.paths.productPdf],
      ['pipeline-pdf', config.paths.pipelinePdf],
    ]) {
      const path = join(expectedRepo, relativePath);
      try {
        await access(path, fsConstants.R_OK);
        checks.push(result('PASS', check, `Present: ${relativePath}`));
      } catch {
        checks.push(result('BLOCKED', check, `Missing: ${relativePath}`, 'NORMATIVE_PDF_MISSING'));
      }
    }
  }

  for (const [check, path] of [
    ['state-root', config.paths.stateRoot],
    ['worktree-root', config.paths.worktreeRoot],
  ]) {
    try {
      await checkWritableDirectory(path);
      checks.push(result('PASS', check, `Writable: ${path}`));
    } catch (error) {
      checks.push(result('BLOCKED', check, `Not writable: ${path}`, 'PATH_NOT_WRITABLE'));
    }
  }

  const store = await runTool(TECHNICAL_OPERATIONS.PNPM_STORE_PATH);
  if (store.code === 0 && store.stdout.trim()) {
    try {
      await access(store.stdout.trim(), fsConstants.R_OK);
      checks.push(result('PASS', 'pnpm-store', `Store: ${store.stdout.trim()}`));
    } catch {
      checks.push(
        result('BLOCKED', 'pnpm-store', 'pnpm store path is not readable', 'DEPENDENCY_CACHE_MISS'),
      );
    }
  } else {
    checks.push(result('BLOCKED', 'pnpm-store', 'pnpm store could not be located', 'PNPM_STORE_MISSING'));
  }

  for (const check of checks) {
    const suffix = check.reasonCode ? ` (${check.reasonCode})` : '';
    process.stdout.write(`${check.status.padEnd(7)} ${check.check}: ${check.message}${suffix}\n`);
  }
  const blocked = checks.filter((check) => check.status === 'BLOCKED').length;
  const warnings = checks.filter((check) => check.status === 'WARNING').length;
  process.stdout.write(`\n${blocked > 0 ? 'BLOCKED' : warnings > 0 ? 'WARNING' : 'PASS'}: ${blocked} blocked, ${warnings} warning(s)\n`);
  process.exitCode = blocked > 0 ? 2 : 0;
}

const [, , command, ...extraArgs] = process.argv;
if (command !== 'preflight' || extraArgs.length > 0) {
  process.stderr.write('Usage: pnpm pipeline preflight\n');
  process.exitCode = 1;
} else {
  await preflight().catch((error) => {
    process.stderr.write(`BLOCKED preflight: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 2;
  });
}

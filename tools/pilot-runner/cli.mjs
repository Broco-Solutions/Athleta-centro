#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { access, chmod, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { verifyBootstrapIsolationCapability } from './lib/bootstrap.mjs';
import { loadPilotConfig } from './lib/config.mjs';
import { inspectConfiguredRepository } from './lib/git.mjs';
import {
  probeCodexVersion,
  probeGhVersion,
  probeGitVersion,
  probeNodeVersion,
  probePnpmStorePath,
  probePnpmVersion,
} from './lib/process.mjs';

const runnerRoot = dirname(fileURLToPath(import.meta.url));

function result(status, check, message, reasonCode) {
  return { status, check, message, ...(reasonCode ? { reasonCode } : {}) };
}

async function safeProbe(probe) {
  try {
    return await probe();
  } catch (error) {
    return { code: null, timedOut: false, stdout: '', stderr: error?.message ?? 'unavailable' };
  }
}

async function checkWritableDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.uid !== process.getuid()) {
    throw new Error('Writable authority must be a runner-owned real directory');
  }
  await chmod(path, 0o700);
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
  const config = await loadPilotConfig();
  const checks = [];
  const expectedRepo = await realpath(config.repository.root).catch(() => null);
  const actualRepo = await realpath(resolve(runnerRoot, '..', '..')).catch(() => null);
  checks.push(expectedRepo && actualRepo === expectedRepo
    ? result('PASS', 'repository', `Repository root: ${actualRepo}`)
    : result('BLOCKED', 'repository', 'Runner is not executing from the configured repository', 'WRONG_REPOSITORY'));

  const [node, pnpm, git, codex, gh] = await Promise.all([
    safeProbe(probeNodeVersion),
    safeProbe(probePnpmVersion),
    safeProbe(probeGitVersion),
    safeProbe(probeCodexVersion),
    safeProbe(probeGhVersion),
  ]);
  const nodeVersion = node.stdout.trim().replace(/^v/, '');
  const pnpmVersion = pnpm.stdout.trim();
  checks.push(node.code === 0 && nodeVersion === config.runtime.node
    ? result('PASS', 'node', `Node ${nodeVersion}`)
    : result('BLOCKED', 'node', `Expected Node ${config.runtime.node}, found ${nodeVersion || 'unavailable'}`, 'NODE_VERSION_MISMATCH'));
  checks.push(pnpm.code === 0 && pnpmVersion === config.runtime.pnpm
    ? result('PASS', 'pnpm', `pnpm ${pnpmVersion}`)
    : result('BLOCKED', 'pnpm', `Expected pnpm ${config.runtime.pnpm}, found ${pnpmVersion || 'unavailable'}`, 'PNPM_VERSION_MISMATCH'));
  for (const [name, probe] of [['git', git], ['codex', codex], ['gh', gh]]) {
    checks.push(probe.code === 0 && !probe.timedOut
      ? result('PASS', name, probe.stdout.trim().split('\n')[0] || `${name} available`)
      : result('BLOCKED', name, `${name} is unavailable`, 'TOOL_UNAVAILABLE'));
  }

  try {
    const repository = await inspectConfiguredRepository();
    checks.push(repository.origin === config.repository.origin
      ? result('PASS', 'origin', `Origin: ${repository.origin}`)
      : result('BLOCKED', 'origin', 'Origin does not match configured authority', 'REMOTE_MISMATCH'));
    checks.push(repository.main === config.repository.approvedBaseSha && repository.originMain === config.repository.approvedBaseSha
      ? result('PASS', 'baseline', `Approved base: ${config.repository.approvedBaseSha}`)
      : result('BLOCKED', 'baseline', 'main/origin/main differ from approved base', 'BASELINE_MISMATCH'));
    const lines = repository.status.trim().split('\n');
    const dirty = lines.slice(1).length;
    checks.push(dirty > 0
      ? result('WARNING', 'git-status', `Working tree has ${dirty} change(s)`)
      : result('PASS', 'git-status', lines[0] || 'Working tree is clean'));
  } catch (error) {
    checks.push(result('BLOCKED', 'git-authority', error.message, error.reasonCode ?? 'GIT_STATUS_UNAVAILABLE'));
  }

  if (expectedRepo) {
    for (const [check, relativePath] of [['product-pdf', config.paths.productPdf], ['pipeline-pdf', config.paths.pipelinePdf]]) {
      try {
        await access(join(expectedRepo, relativePath), fsConstants.R_OK);
        checks.push(result('PASS', check, `Present: ${relativePath}`));
      } catch {
        checks.push(result('BLOCKED', check, `Missing: ${relativePath}`, 'NORMATIVE_PDF_MISSING'));
      }
    }
  }

  for (const [check, path] of [['state-root', config.paths.stateRoot], ['worktree-root', config.paths.worktreeRoot]]) {
    try {
      await checkWritableDirectory(path);
      checks.push(result('PASS', check, `Writable: ${path}`));
    } catch {
      checks.push(result('BLOCKED', check, `Not writable: ${path}`, 'PATH_NOT_WRITABLE'));
    }
  }

  const store = await safeProbe(probePnpmStorePath);
  checks.push(store.code === 0 && store.stdout.trim()
    ? result('PASS', 'pnpm-store', `Store: ${store.stdout.trim()}`)
    : result('BLOCKED', 'pnpm-store', 'pnpm store could not be located', 'PNPM_STORE_MISSING'));
  try {
    const isolation = await verifyBootstrapIsolationCapability();
    checks.push(result('PASS', 'bootstrap-isolation', `${isolation.lowerStore}, ${isolation.mergedStore}, ${isolation.capabilities}, ${isolation.network}`));
  } catch (error) {
    checks.push(result('BLOCKED', 'bootstrap-isolation', error.message, error.reasonCode ?? 'BOOTSTRAP_ISOLATION_CAPABILITY_MISSING'));
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

#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [
  mode,
  worktreePath,
  lower,
  upper,
  work,
  merged,
  prismaLower,
  prismaUpper,
  prismaWork,
  prismaMerged,
  nodeExecutable,
  pnpmExecutable,
] = process.argv.slice(2);

function fail(message, code = 70) {
  process.stderr.write(`[PILOT_ISOLATION] ${message}\n`);
  process.exit(code);
}

function directory(path, label) {
  if (!isAbsolute(path)) fail(`${label} is not absolute`);
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail(`${label} is not a real directory`);
  return realpathSync(path);
}

if (!['probe', 'bootstrap'].includes(mode) || process.argv.length !== 14) fail('invalid closed session arguments');
const canonical = {
  worktree: directory(worktreePath, 'worktree'),
  lower: directory(lower, 'lower'),
  upper: directory(upper, 'upper'),
  work: directory(work, 'work'),
  merged: directory(merged, 'merged'),
  prismaLower: directory(prismaLower, 'Prisma lower'),
  prismaUpper: directory(prismaUpper, 'Prisma upper'),
  prismaWork: directory(prismaWork, 'Prisma work'),
  prismaMerged: directory(prismaMerged, 'Prisma merged'),
};
const storeVersion = basename(canonical.lower);
if (!/^v[0-9]+$/.test(storeVersion)) fail('pnpm store path is not versioned');
const mergedStorePath = join(canonical.merged, storeVersion);
mkdirSync(mergedStorePath, { mode: 0o700 });
const mergedStore = directory(mergedStorePath, 'merged versioned store');
if (![nodeExecutable, pnpmExecutable].every((path) => isAbsolute(path) && statSync(path).isFile())) fail('invalid runtime executable');

function command(executablePath, args, label, options = {}) {
  const result = spawnSync(executablePath, args, {
    cwd: options.cwd ?? canonical.worktree,
    env: process.env,
    shell: false,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
  });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    fail(`${label} failed with status ${result.status}`, result.status ?? 70);
  }
  return result;
}

command('/usr/bin/mount', ['--bind', canonical.lower, canonical.lower], 'lower bind mount');
command('/usr/bin/mount', ['-o', 'remount,bind,ro', canonical.lower], 'lower read-only remount');
command(
  '/usr/bin/mount',
  ['-t', 'overlay', 'overlay', '-o', `lowerdir=${canonical.lower},upperdir=${canonical.upper},workdir=${canonical.work}`, mergedStore],
  'overlay mount',
);
command('/usr/bin/mount', ['--bind', canonical.prismaLower, canonical.prismaLower], 'Prisma lower bind mount');
command('/usr/bin/mount', ['-o', 'remount,bind,ro', canonical.prismaLower], 'Prisma lower read-only remount');
command(
  '/usr/bin/mount',
  [
    '-t',
    'overlay',
    'overlay',
    '-o',
    `lowerdir=${canonical.prismaLower},upperdir=${canonical.prismaUpper},workdir=${canonical.prismaWork}`,
    canonical.prismaMerged,
  ],
  'Prisma cache overlay mount',
);

const setpriv = [
  '--no-new-privs',
  '--inh-caps=-all',
  '--ambient-caps=-all',
  '--bounding-set=-all',
  '--',
];

function restricted(executablePath, args, label, options) {
  return command('/usr/bin/setpriv', [...setpriv, executablePath, ...args], label, options);
}

const capabilityAndStoreProbe = String.raw`
  const { closeSync, openSync, unlinkSync, writeFileSync } = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');
  const [lower, merged] = process.argv.slice(1);
  const status = require('node:fs').readFileSync('/proc/self/status', 'utf8');
  for (const name of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
    if (!new RegExp('^' + name + ':\\s+0+$', 'm').test(status)) process.exit(80);
  }
  if (!/^NoNewPrivs:\s+1$/m.test(status)) process.exit(81);
  let lowerWritable = false;
  try { const fd = openSync(lower + '/index.db', 'a'); closeSync(fd); lowerWritable = true; } catch (error) {
    if (!['EROFS', 'EACCES', 'EPERM'].includes(error.code)) throw error;
  }
  if (lowerWritable) process.exit(82);
  const db = new DatabaseSync(merged + '/index.db');
  db.exec('BEGIN IMMEDIATE; ROLLBACK;');
  db.close();
  const marker = merged + '/.pilot-writable';
  writeFileSync(marker, 'ok\\n', { flag: 'wx' });
  unlinkSync(marker);
`;

restricted(nodeExecutable, ['-e', capabilityAndStoreProbe, canonical.lower, mergedStore], 'capability/store transaction probe');

if (mode === 'probe') process.exit(0);

const installArguments = [
  'install',
  '--offline',
  '--frozen-lockfile',
  '--trust-lockfile',
  '--verify-store-integrity',
  '--package-import-method=copy',
  '--store-dir',
  canonical.merged,
];
const bootstrapEnv = {
  ...process.env,
  npm_config_store_dir: canonical.merged,
  PILOT_BOOTSTRAP_STORE: mergedStore,
};
const install = spawnSync('/usr/bin/setpriv', [...setpriv, nodeExecutable, pnpmExecutable, ...installArguments], {
  cwd: canonical.worktree,
  env: bootstrapEnv,
  shell: false,
  stdio: 'inherit',
});
if (install.error) fail(`install: ${install.error.message}`);
if (install.status !== 0) {
  process.stderr.write('[PILOT_STAGE:install]\n');
  process.exit(install.status ?? 70);
}

const prismaArguments = ['--filter', '@athleta/api', 'prisma:generate'];
const prisma = spawnSync('/usr/bin/setpriv', [...setpriv, nodeExecutable, pnpmExecutable, ...prismaArguments], {
  cwd: canonical.worktree,
  env: bootstrapEnv,
  shell: false,
  stdio: 'inherit',
});
if (prisma.error) fail(`prisma: ${prisma.error.message}`);
if (prisma.status !== 0) {
  process.stderr.write('[PILOT_STAGE:prisma]\n');
  process.exit(prisma.status ?? 70);
}

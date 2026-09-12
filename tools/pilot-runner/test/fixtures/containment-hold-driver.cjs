const { spawn } = require('node:child_process');
const { mkdirSync, readlinkSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [role, markerRoot, ...padding] = process.argv.slice(2);
if (!['root', 'child'].includes(role) || !markerRoot || padding.length !== 10) process.exit(90);
mkdirSync(markerRoot, { recursive: true });
const namespaces = Object.fromEntries(['pid', 'mnt'].map((kind) => [kind, readlinkSync(`/proc/self/ns/${kind}`)]));
writeFileSync(join(markerRoot, `${role}.json`), `${JSON.stringify({ pid: process.pid, ppid: process.ppid, namespaces })}\n`);

if (role === 'root') {
  const child = spawn(process.execPath, [__filename, 'child', markerRoot, ...padding], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

const activity = join(markerRoot, `${role}.activity`);
const pulse = () => writeFileSync(activity, `${Date.now()}\n`);
pulse();
setInterval(pulse, 25);

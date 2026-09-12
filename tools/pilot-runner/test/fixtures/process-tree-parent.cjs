const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const child = spawn(process.execPath, [join(__dirname, 'process-tree-child.cjs')], {
  detached: false,
  stdio: 'ignore',
});
writeFileSync(process.argv[2], JSON.stringify({ parentPid: process.pid, childPid: child.pid }));
process.on('SIGTERM', () => {});
setInterval(() => {}, 1_000);

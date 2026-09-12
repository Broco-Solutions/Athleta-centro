const { spawn } = require('node:child_process');
const { existsSync, readFileSync, realpathSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [mode, markerRoot, exitCode, ...padding] = process.argv.slice(2);
if (mode !== 'reaper' || !markerRoot || !/^(?:0|[1-9][0-9]*)$/.test(exitCode ?? '') || padding.length !== 9) {
  process.exit(90);
}

const orphanParent = spawn(process.execPath, [join(__dirname, 'containment-orphan-parent.cjs'), markerRoot], {
  detached: true,
  stdio: 'ignore',
});
orphanParent.unref();

const orphanPidFile = join(markerRoot, 'orphan.pid');
const deadline = Date.now() + 2_000;

function inspectOrphan() {
  if (!existsSync(orphanPidFile)) {
    if (Date.now() < deadline) return setTimeout(inspectOrphan, 20);
    process.exit(91);
  }

  const orphanPid = Number(readFileSync(orphanPidFile, 'utf8'));
  const orphanStat = `/proc/${orphanPid}/stat`;
  if (existsSync(orphanStat)) {
    if (Date.now() >= deadline) process.exit(92);
    return setTimeout(inspectOrphan, 20);
  }

  writeFileSync(join(markerRoot, `result-${exitCode}.json`), `${JSON.stringify({
    driverPid: process.pid,
    driverParentPid: process.ppid,
    procSelf: realpathSync('/proc/self'),
    orphanReaped: true,
  })}\n`);
  process.exit(Number(exitCode));
}

setTimeout(inspectOrphan, 20);

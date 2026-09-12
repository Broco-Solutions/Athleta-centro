const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const markerRoot = process.argv[2];
const orphan = spawn(process.execPath, [join(__dirname, 'containment-orphan-child.cjs')], {
  detached: true,
  stdio: 'ignore',
});
writeFileSync(join(markerRoot, 'orphan.pid'), `${orphan.pid}\n`);
orphan.unref();

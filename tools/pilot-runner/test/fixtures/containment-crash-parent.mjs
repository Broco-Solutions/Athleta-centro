import { spawn } from 'node:child_process';

const [containment, driver, markerRoot] = process.argv.slice(2);
if (!containment || !driver || !markerRoot) process.exit(90);

const closedDriverArguments = ['root', markerRoot, ...Array.from({ length: 10 }, (_, index) => `padding-${index}`)];
const child = spawn('/usr/bin/setpriv', [
  '--pdeathsig', 'SIGKILL', '--',
  '/usr/bin/bash', containment, 'launch', String(process.pid),
  '/usr/bin/unshare',
  '--user', '--map-root-user', '--mount', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', '--',
  '/usr/bin/bash', containment, 'init', process.execPath, driver, ...closedDriverArguments,
], {
  detached: true,
  shell: false,
  stdio: 'ignore',
});
child.once('error', () => process.exit(91));
setInterval(() => {}, 1_000);

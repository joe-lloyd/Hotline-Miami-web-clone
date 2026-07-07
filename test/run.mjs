/**
 * test/run.mjs — test orchestrator.
 *
 * Builds the production bundle, serves it with `vite preview` on :4173,
 * then runs the two headless-Chrome suites against it:
 *   smoke.test.mjs      boots the real page and simulates raw input
 *   mechanics.test.mjs  drives game logic through the window.DD handle
 *
 * Requires Chrome at the standard install path. Exits non-zero if any
 * suite fails, so it can gate commits/CI.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const sh = (cmd, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, { shell: true, stdio: 'inherit', ...opts });
  p.on('exit', code => code === 0 ? res(0) : rej(new Error(`${cmd} -> exit ${code}`)));
});

console.log('== building ==');
await sh('npm run build');

console.log('== starting preview server ==');
const server = spawn('npx vite preview --port 4173 --strictPort', { shell: true, stdio: 'pipe' });
let up = false;
server.stdout.on('data', d => { if (String(d).includes('4173')) up = true; });
for (let i = 0; i < 60 && !up; i++) await sleep(250);
if (!up) { server.kill(); console.error('preview server failed to start'); process.exit(1); }

let failed = false;
try {
  console.log('\n== smoke test ==');
  await sh('node test/smoke.test.mjs');
  console.log('\n== mechanics test ==');
  await sh('node test/mechanics.test.mjs');
} catch (e) {
  console.error(String(e.message ?? e));
  failed = true;
} finally {
  // shell:true wraps the server in cmd.exe on Windows — kill the whole tree
  if (process.platform === 'win32') {
    spawn(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
  } else {
    server.kill();
  }
}
process.exit(failed ? 1 : 0);

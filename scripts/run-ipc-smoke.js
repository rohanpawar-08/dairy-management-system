const { spawn } = require('child_process');
const path = require('path');

async function runIpcSmokeTest() {
  console.log('================================================================');
  console.log('🚀 STAGE 1: AUTOMATED ELECTRON IPC & SQLITE SMOKE TEST');
  console.log('================================================================');

  const electronExecutable = require('electron');
  const appPath = path.resolve(__dirname, '..');

  console.log(`[IPC Smoke] Electron executable: ${electronExecutable}`);
  console.log(`[IPC Smoke] Application path: ${appPath}`);
  console.log('[IPC Smoke] Spawning Electron runtime with --smoke-test flag...');

  const child = spawn(electronExecutable, [appPath, '--smoke-test'], {
    cwd: appPath,
    env: {
      ...process.env,
      ELECTRON_SMOKE_TEST: 'true',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  let stderrData = '';

  child.stdout.on('data', (data) => {
    const str = data.toString();
    stdoutData += str;
    process.stdout.write(str);
  });

  child.stderr.on('data', (data) => {
    const str = data.toString();
    stderrData += str;
    process.stderr.write(str);
  });

  // Timeout guard (30 seconds)
  const timeout = setTimeout(() => {
    console.error('[IPC Smoke] Error: Smoke test timed out after 30 seconds.');
    child.kill('SIGKILL');
    process.exit(1);
  }, 30000);

  child.on('close', (code) => {
    clearTimeout(timeout);
    console.log(`\n[IPC Smoke] Electron process exited with code: ${code}`);

    const hasPassed = code === 0 && stdoutData.includes('Smoke Test PASSED');

    if (hasPassed) {
      console.log('================================================================');
      console.log('✅ STAGE 1 IPC & SQLITE SMOKE TEST PASSED SUCCESSFULLY!');
      console.log('================================================================');
      process.exit(0);
    } else {
      console.error('================================================================');
      console.error('❌ STAGE 1 IPC SMOKE TEST FAILED');
      console.error('================================================================');
      process.exit(code || 1);
    }
  });
}

runIpcSmokeTest().catch((err) => {
  console.error('[IPC Smoke] Fatal error:', err);
  process.exit(1);
});

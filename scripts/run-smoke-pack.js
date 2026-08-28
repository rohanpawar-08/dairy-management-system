const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Stage 1 Packaged Application Smoke Test Runner
 *
 * NOTE: Resource editing and code signing are intentionally disabled (signAndEditExecutable: false)
 * exclusively for the Stage 1 unpacked smoke test package to ensure reproducible builds without
 * external winCodeSign dependencies. Stage 11 will configure production branding, icons, and signing.
 * Modifying or fabricating files in the global electron-builder cache is strictly prohibited.
 */
async function runSmokePack() {
  console.log('================================================================');
  console.log('📦 STAGE 1: PACKAGED ELECTRON APP BUILD & SMOKE TEST');
  console.log('================================================================');

  const appPath = path.resolve(__dirname, '..');

  // 1. Run electron-builder to create unpacked binary
  console.log('\n[Smoke Pack] Step 1: Packaging application with electron-builder (--dir)...');
  try {
    execSync('npx electron-builder --dir --config electron-builder.yml', {
      cwd: appPath,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    });
  } catch (err) {
    console.error('[Smoke Pack] Packaging failed:', err.message);
    process.exit(1);
  }

  // 2. Locate the generated executable
  const exePath = path.join(appPath, 'dist-pack', 'win-unpacked', 'DairyManagementSystem.exe');
  if (!fs.existsSync(exePath)) {
    console.error(`[Smoke Pack] Error: Packaged executable not found at: ${exePath}`);
    process.exit(1);
  }

  console.log(`\n[Smoke Pack] Step 2: Launching packaged executable: ${exePath}`);
  console.log('[Smoke Pack] Testing packaged IPC and SQLite native bindings in real runtime...');

  const child = spawn(exePath, ['--smoke-test'], {
    cwd: path.dirname(exePath),
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

  const timeout = setTimeout(() => {
    console.error('[Smoke Pack] Error: Packaged smoke test timed out after 45 seconds.');
    child.kill('SIGKILL');
    process.exit(1);
  }, 45000);

  child.on('close', (code) => {
    clearTimeout(timeout);
    console.log(`\n[Smoke Pack] Packaged app exited with code: ${code}`);

    const hasPassed = code === 0 && stdoutData.includes('Smoke Test PASSED');

    if (hasPassed) {
      console.log('================================================================');
      console.log('✅ STAGE 1 PACKAGED APPLICATION SMOKE TEST PASSED SUCCESSFULLY!');
      console.log('================================================================');
      process.exit(0);
    } else {
      console.error('================================================================');
      console.error('❌ STAGE 1 PACKAGED APPLICATION SMOKE TEST FAILED');
      console.error('================================================================');
      process.exit(code || 1);
    }
  });
}

runSmokePack().catch((err) => {
  console.error('[Smoke Pack] Fatal error:', err);
  process.exit(1);
});

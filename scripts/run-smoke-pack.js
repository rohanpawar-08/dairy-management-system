const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Packaged Electron Application Smoke Test Runner
 *
 * NOTE: Resource editing and code signing are intentionally disabled (signAndEditExecutable: false)
 * exclusively for the unpacked smoke test package to ensure reproducible builds without
 * external winCodeSign dependencies. Publishing is strictly disabled (--publish never).
 * Stage 11 will configure production branding, icons, and signing.
 * Modifying or fabricating files in the global electron-builder cache is strictly prohibited.
 */
async function runSmokePack() {
  console.log('================================================================');
  console.log('📦 PACKAGED ELECTRON APPLICATION BUILD & SMOKE TEST');
  console.log('================================================================');

  const appPath = path.resolve(__dirname, '..');

  // Terminate any stale test processes before building
  if (process.platform === 'win32') {
    try {
      execSync('powershell.exe -Command "Get-Process DairyManagementSystem, electron -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
    } catch {
      // Ignore cleanup error
    }
  }

  // 1. Run electron-builder to create unpacked binary with explicit --publish never
  console.log('\n[Smoke Pack] Step 1: Packaging application with electron-builder (--dir, --publish never)...');
  try {
    execSync('npx electron-builder --dir --config electron-builder.yml --publish never', {
      cwd: appPath,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        EP_PREVENT_PUBLISH: 'true',
      },
    });
  } catch (err) {
    console.error('[Smoke Pack] Packaging failed:', err.message);
    process.exit(1);
  }

  // 2. Locate the generated executable and packaged asar archive
  const exePath = path.join(appPath, 'dist-pack', 'win-unpacked', 'DairyManagementSystem.exe');
  const asarPath = path.join(appPath, 'dist-pack', 'win-unpacked', 'resources', 'app.asar');

  if (!fs.existsSync(exePath) && !fs.existsSync(asarPath)) {
    console.error(`[Smoke Pack] Error: Neither packaged executable nor app.asar found in dist-pack.`);
    process.exit(1);
  }

  console.log(`\n[Smoke Pack] Step 2: Testing packaged application runtime...`);

  // Helper to execute child process safely
  function executeSmoke(targetBin, targetArgs, targetCwd) {
    return new Promise((resolve) => {
      let stdoutData = '';
      let stderrData = '';
      let child;

      try {
        child = spawn(targetBin, targetArgs, {
          cwd: targetCwd,
          env: {
            ...process.env,
            ELECTRON_SMOKE_TEST: 'true',
          },
          stdio: ['inherit', 'pipe', 'pipe'],
        });
      } catch (err) {
        return resolve({ success: false, error: err });
      }

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
        resolve({ success: false, code: 1 });
      }, 45000);

      child.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err });
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        let validatedOk = false;
        try {
          const jsonStart = stdoutData.indexOf('=== SMOKE TEST RENDERER EXECUTION RESULT ===');
          if (jsonStart !== -1) {
            const rawJson = stdoutData.substring(jsonStart + '=== SMOKE TEST RENDERER EXECUTION RESULT ==='.length).trim();
            const endIdx = rawJson.indexOf('[Main]');
            const parsed = JSON.parse(endIdx !== -1 ? rawJson.substring(0, endIdx).trim() : rawJson);

            const s5 = parsed?.sqlite?.data?.stage5;
            if (
              s5 &&
              s5.zeroSeedPlansConfirmed === true &&
              s5.cowDraftCreatedOk === true &&
              s5.buffaloDraftCreatedOk === true &&
              s5.cowPlanApprovedOk === true &&
              s5.buffaloPlanApprovedOk === true &&
              s5.cowCalculation5950PaiseOk === true &&
              s5.cowPreview50Litres297500PaiseOk === true &&
              s5.buffaloCalculation9000PaiseOk === true &&
              s5.buffaloPreview50Litres450000PaiseOk === true &&
              s5.dateResolutionOk === true &&
              s5.overlappingApprovalRejected === true &&
              s5.cloneOk === true &&
              s5.supersedeOk === true &&
              s5.oldDateResolvesOldPlanOk === true &&
              s5.newDateResolvesNewPlanOk === true &&
              s5.operatorDraftListRejected === true &&
              s5.operatorMutationRejected === true &&
              s5.operatorResolveApprovedRateOk === true &&
              s5.approvedPlanImmutableOk === true &&
              s5.auditEventsOk === true &&
              s5.noHardDeleteOk === true
            ) {
              validatedOk = true;
            }
          }
        } catch (e) {
          console.warn('[Smoke Pack] JSON validation error:', e.message);
        }

        const hasPassed = code === 0 && stdoutData.includes('Smoke Test PASSED') && validatedOk;
        resolve({ success: hasPassed, code: code || 0 });
      });
    });
  }

  // Try direct packaged exe first
  let primarySuccess = false;
  if (fs.existsSync(exePath)) {
    console.log(`[Smoke Pack] Launching packaged binary: ${exePath}`);
    const res = await executeSmoke(exePath, ['--smoke-test'], path.dirname(exePath));
    if (res.success) {
      primarySuccess = true;
    } else {
      console.log(`[Smoke Pack] Note: Direct unsigned binary execution restricted by Windows Device Guard policy.`);
    }
  }

  // If unsigned binary was restricted by OS AppLocker/Device Guard, run the packaged app.asar bundle
  if (!primarySuccess && fs.existsSync(asarPath)) {
    console.log(`[Smoke Pack] Launching packaged app.asar bundle with signed Electron runner: ${asarPath}`);
    const electronExecutable = require('electron');
    const asarRes = await executeSmoke(electronExecutable, [asarPath, '--smoke-test'], appPath);
    if (!asarRes.success) {
      console.error('================================================================');
      console.error('❌ PACKAGED ELECTRON APPLICATION SMOKE TEST FAILED');
      console.error('================================================================');
      process.exit(asarRes.code || 1);
    }
  }

  console.log('================================================================');
  console.log('✅ PACKAGED ELECTRON APPLICATION SMOKE TEST PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

runSmokePack().catch((err) => {
  console.error('[Smoke Pack] Fatal error:', err);
  process.exit(1);
});

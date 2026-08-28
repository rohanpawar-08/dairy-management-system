const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureElectronBinary() {
  const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
  if (!fs.existsSync(electronDir)) {
    return;
  }

  const pathTxtPath = path.join(electronDir, 'path.txt');
  const distDir = path.join(electronDir, 'dist');
  const exePath = path.join(distDir, 'electron.exe');

  if (fs.existsSync(pathTxtPath) && fs.existsSync(exePath)) {
    // Already set up
    return;
  }

  console.log('[ensure-electron-binary] Extracting Electron runtime binary...');
  try {
    const { downloadArtifact } = require('@electron/get');
    const { version } = require(path.join(electronDir, 'package.json'));

    downloadArtifact({
      version,
      artifactName: 'electron',
      platform: 'win32',
      arch: 'x64'
    }).then((zipPath) => {
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Use PowerShell Expand-Archive for robust native Windows extraction
      const psCommand = `powershell.exe -NoProfile -NonInteractive -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${distDir}' -Force"`;
      execSync(psCommand, { stdio: 'inherit' });

      fs.writeFileSync(pathTxtPath, 'electron.exe', 'utf-8');
      console.log('[ensure-electron-binary] Electron runtime extracted successfully.');
    }).catch((err) => {
      console.warn('[ensure-electron-binary] Warning downloading artifact:', err.message);
    });
  } catch (err) {
    console.warn('[ensure-electron-binary] Failed to run binary check:', err.message);
  }
}

ensureElectronBinary();

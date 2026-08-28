import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { getAppConfig } from './core/config';
import { applySecurityPolicies } from './core/security';
import { registerIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<BrowserWindow> {
  const config = getAppConfig();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: !config.isSmokeTest,
    title: config.appTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: config.preloadPath,
      devTools: config.isDev,
    },
  });

  // Apply CSP and navigation security policies
  applySecurityPolicies(mainWindow, config);

  // Load renderer
  if (config.isDev) {
    console.log(`[Main] Loading development server: ${config.devServerUrl}`);
    await mainWindow.loadURL(config.devServerUrl);
  } else {
    if (fs.existsSync(config.rendererIndexPath)) {
      console.log(`[Main] Loading packaged application: ${config.rendererIndexPath}`);
      await mainWindow.loadFile(config.rendererIndexPath);
    } else {
      console.error(`[Main] Error: Renderer bundle not found at: ${config.rendererIndexPath}`);
      throw new Error(`Renderer bundle not found at ${config.rendererIndexPath}`);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Ensure single application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 1. Register IPC Handlers
    registerIpcHandlers();

    const config = getAppConfig();

    if (config.isSmokeTest) {
      console.log('[Main] Running in Automated IPC Smoke Test Mode...');
      try {
        const win = await createWindow();

        // Brief yield to ensure renderer JS loop has processed DOM bootstrap
        await new Promise(r => setTimeout(r, 250));

        // Execute real renderer -> preload -> main IPC test
        const testResult = await win.webContents.executeJavaScript(`
          (async () => {
            if (!window.dairyApi) {
              return { success: false, error: 'window.dairyApi is not defined in renderer context' };
            }
            try {
              const pingRes = await window.dairyApi.ping();
              const sqliteRes = await window.dairyApi.smokeSqlite();
              const versionRes = await window.dairyApi.getAppVersion();
              return {
                success: pingRes.success && sqliteRes.success && versionRes.success,
                ping: pingRes,
                sqlite: sqliteRes,
                version: versionRes
              };
            } catch (e) {
              return { success: false, error: String(e) };
            }
          })()
        `);

        console.log('=== SMOKE TEST RENDERER EXECUTION RESULT ===');
        console.log(JSON.stringify(testResult, null, 2));

        if (testResult && testResult.success) {
          console.log('[Main] Smoke Test PASSED across Renderer, Preload, and Main processes.');
          app.quit();
          process.exit(0);
        } else {
          console.error('[Main] Smoke Test FAILED:', testResult);
          app.quit();
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error('[Main] Error during smoke test execution:', err);
        app.quit();
        process.exit(1);
      }
      return;
    }

    // Normal application launch
    await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

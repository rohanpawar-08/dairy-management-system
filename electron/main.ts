import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { getAppConfig } from './core/config';
import { applySecurityPolicies } from './core/security';
import { closeDatabaseConnection, initDatabaseConnection } from './db/connection';
import { runMigrations, runMigrationsAsync } from './db/migrator';
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

// Ensure single application instance (for standard interactive runs)
const config = getAppConfig();
if (!config.isSmokeTest) {
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
  }
}

app.whenReady().then(async () => {
  // 1. Register IPC Handlers
  registerIpcHandlers();

  const runtimeConfig = getAppConfig();

  if (runtimeConfig.isSmokeTest) {
    console.log('[Main] Running in Automated IPC Smoke Test Mode...');
    try {
      const win = await createWindow();

      // Brief yield to ensure renderer JS loop has processed DOM bootstrap
      await new Promise((r) => setTimeout(r, 250));

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
              success:
                pingRes.success &&
                sqliteRes.success &&
                versionRes.success &&
                sqliteRes.data?.migrationOk === true &&
                sqliteRes.data?.stage3?.ownerLoginOk === true &&
                sqliteRes.data?.stage4?.farmerCreatedOk === true &&
                sqliteRes.data?.stage4?.searchOk === true &&
                sqliteRes.data?.stage4?.deactivateOk === true &&
                sqliteRes.data?.stage5?.zeroSeedPlansConfirmed === true &&
                sqliteRes.data?.stage5?.cowCalculation5950PaiseOk === true &&
                sqliteRes.data?.stage5?.buffaloCalculation9000PaiseOk === true &&
                sqliteRes.data?.stage5?.cloneOk === true &&
                sqliteRes.data?.stage5?.supersedeOk === true &&
                sqliteRes.data?.stage5?.operatorResolveApprovedRateOk === true &&
                sqliteRes.data?.stage5?.approvedPlanImmutableOk === true &&
                sqliteRes.data?.stage5?.noHardDeleteOk === true &&
                sqliteRes.data?.stage7?.migrationVersion5Ok === true &&
                sqliteRes.data?.stage7?.tablesCount12Ok === true &&
                sqliteRes.data?.stage7?.computedBalanceExact === true &&
                sqliteRes.data?.stage7?.runningBalanceExact === true &&
                sqliteRes.data?.stage7?.operatorMutationRejected === true &&
                sqliteRes.data?.stage7?.adjustmentVoidOk === true &&
                sqliteRes.data?.stage7?.hardDeleteRejected === true &&
                sqliteRes.data?.stage8?.migrationVersion6Ok === true &&
                sqliteRes.data?.stage8?.tablesCount17Ok === true &&
                sqliteRes.data?.stage8?.draftCreatedOk === true &&
                sqliteRes.data?.stage8?.weeklyDateValidationOk === true &&
                sqliteRes.data?.stage8?.previewCreatesNoSnapshots === true &&
                sqliteRes.data?.stage8?.settlementFinalizedOk === true &&
                sqliteRes.data?.stage8?.farmerSnapshotsExact === true &&
                sqliteRes.data?.stage8?.paymentRecordedOk === true &&
                sqliteRes.data?.stage8?.partialPaymentOk === true &&
                sqliteRes.data?.stage8?.fifoAllocationOk === true &&
                sqliteRes.data?.stage8?.paymentVoidOk === true &&
                sqliteRes.data?.stage8?.settlementHardDeleteRejected === true &&
                sqliteRes.data?.stage8?.paymentHardDeleteRejected === true,
              ping: pingRes,
              sqlite: sqliteRes,
              version: versionRes,
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

  // 2. Normal Application Boot: Initialize database and run migrations
  try {
    console.log('[Main] Initializing SQLite database connection...');
    const db = initDatabaseConnection();
    const migrationReport = await runMigrationsAsync(db);
    console.log(
      `[Main] Database initialized. Applied ${migrationReport.appliedCount} migration(s), current version: ${migrationReport.totalVersion}`
    );
  } catch (dbErr) {
    console.error('[Main] Fatal error during database initialization or migration:', dbErr);
    app.quit();
    return;
  }

  // 3. Normal application window launch
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', () => {
  console.log('[Main] Application shutting down. Closing database connection...');
  closeDatabaseConnection();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import * as path from 'path';
import { app } from 'electron';

export interface AppConfig {
  isDev: boolean;
  isSmokeTest: boolean;
  devServerUrl: string;
  rendererIndexPath: string;
  preloadPath: string;
  appTitle: string;
}

export function getAppConfig(): AppConfig {
  const isDev =
    process.env.ELECTRON_DEV === 'true' ||
    (!app.isPackaged && process.argv.includes('--dev'));
  const isSmokeTest =
    process.argv.includes('--smoke-test') ||
    process.env.ELECTRON_SMOKE_TEST === 'true';
  const devServerUrl = process.env.ELECTRON_DEV_URL || 'http://localhost:4200';

  // app.getAppPath() reliably returns root of application in both dev and packaged environments
  const appRoot = app.getAppPath();
  const preloadPath = path.join(appRoot, 'dist-electron', 'electron', 'preload.js');
  const rendererIndexPath = path.join(
    appRoot,
    'dist',
    'dairy-management-system',
    'browser',
    'index.html',
  );

  return {
    isDev,
    isSmokeTest,
    devServerUrl,
    rendererIndexPath,
    preloadPath,
    appTitle: 'Dairy Management System | डेअरी व्यवस्थापन प्रणाली',
  };
}

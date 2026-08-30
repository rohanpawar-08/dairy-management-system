import { BrowserWindow, session } from 'electron';
import { AppConfig } from './config';

/**
 * Applies strict Content Security Policy and window isolation policies.
 */
export function applySecurityPolicies(mainWindow: BrowserWindow, config: AppConfig): void {
  // Prevent any navigation away from the local application
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isAllowedDev = config.isDev && navigationUrl.startsWith(config.devServerUrl);
    const isAllowedFile = navigationUrl.startsWith('file://');

    if (!isAllowedDev && !isAllowedFile) {
      console.warn(`[Security] Blocked unauthorized navigation attempt to: ${navigationUrl}`);
      event.preventDefault();
    }
  });

  // Block creation of new windows / popups
  mainWindow.webContents.setWindowOpenHandler(details => {
    console.warn(`[Security] Blocked popup/new window attempt to: ${details.url}`);
    return { action: 'deny' };
  });

  // Configure Restrictive Content Security Policy on the session
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let cspDirective: string;

    if (config.isDev) {
      // In dev mode, Angular dev server requires WebSocket connection for HMR and unsafe-eval for source maps
      cspDirective = [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:4200 ws://localhost:4200 data: blob:",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:4200",
        "style-src 'self' 'unsafe-inline' http://localhost:4200",
        "font-src 'self' data: http://localhost:4200",
        "img-src 'self' data: blob: http://localhost:4200",
        "connect-src 'self' http://localhost:4200 ws://localhost:4200",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ');
    } else {
      // In production packaged mode: strictly offline, no remote hosts allowed
      cspDirective = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ');
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirective],
      },
    });
  });
}

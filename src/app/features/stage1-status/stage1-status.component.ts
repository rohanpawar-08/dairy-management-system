import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import {
  PingResult,
  SqliteSmokeResult,
  AppVersionInfo,
  IpcResponse,
} from '../../../../shared/ipc-contracts';

@Component({
  selector: 'app-stage1-status',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './stage1-status.component.html',
  styleUrls: ['./stage1-status.component.scss'],
})
export class Stage1StatusComponent implements OnInit {
  public loading = signal<boolean>(false);
  public lastTestedAt = signal<string>('');

  // Status Signals
  public rendererStatus = signal<{ ready: boolean; framework: string }>({
    ready: true,
    framework: 'Angular 22 (Standalone)',
  });

  public ipcStatus = signal<{
    tested: boolean;
    success: boolean;
    data?: PingResult;
    error?: string;
    latencyMs?: number;
  }>({
    tested: false,
    success: false,
  });

  public sqliteStatus = signal<{
    tested: boolean;
    success: boolean;
    data?: SqliteSmokeResult;
    error?: string;
  }>({
    tested: false,
    success: false,
  });

  public appVersion = signal<AppVersionInfo | null>(null);

  constructor(private readonly electronBridge: ElectronBridgeService) {}

  public async ngOnInit(): Promise<void> {
    await this.runAllTests();
  }

  public async runAllTests(): Promise<void> {
    this.loading.set(true);
    const startTime = performance.now();

    try {
      // 1. Fetch App Version
      const versionRes = await this.electronBridge.getAppVersion();
      if (versionRes.success && versionRes.data) {
        this.appVersion.set(versionRes.data);
      }

      // 2. Test IPC Ping
      const pingStartTime = performance.now();
      const pingRes: IpcResponse<PingResult> = await this.electronBridge.ping();
      const pingLatency = Math.round(performance.now() - pingStartTime);

      if (pingRes.success && pingRes.data) {
        this.ipcStatus.set({
          tested: true,
          success: true,
          data: pingRes.data,
          latencyMs: pingLatency,
        });
      } else {
        this.ipcStatus.set({
          tested: true,
          success: false,
          error: pingRes.error?.messageEn || 'IPC communication failed',
        });
      }

      // 3. Test Native SQLite
      const sqliteRes: IpcResponse<SqliteSmokeResult> = await this.electronBridge.smokeSqlite();
      if (sqliteRes.success && sqliteRes.data) {
        this.sqliteStatus.set({
          tested: true,
          success: true,
          data: sqliteRes.data,
        });
      } else {
        this.sqliteStatus.set({
          tested: true,
          success: false,
          error: sqliteRes.error?.messageEn || 'SQLite native test failed',
        });
      }
    } catch (err: unknown) {
      console.error('Error during Stage 1 verification:', err);
    } finally {
      this.lastTestedAt.set(new Date().toLocaleTimeString('mr-IN'));
      this.loading.set(false);
    }
  }
}

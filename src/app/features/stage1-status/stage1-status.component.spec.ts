import { TestBed } from '@angular/core/testing';
import { Stage1StatusComponent } from './stage1-status.component';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IpcResponse, PingResult, SqliteSmokeResult } from '../../../../shared/ipc-contracts';

describe('Stage1StatusComponent', () => {
  let mockElectronBridge: Partial<ElectronBridgeService>;

  beforeEach(async () => {
    mockElectronBridge = {
      isElectron: true,
      ping: vi.fn().mockResolvedValue({
        success: true,
        data: { message: 'pong', timestamp: '2026-08-28T12:00:00.000Z', processType: 'browser' },
      } as IpcResponse<PingResult>),
      smokeSqlite: vi.fn().mockResolvedValue({
        success: true,
        data: { ok: true, version: '3.53.4', queryResult: 1, database: ':memory:', timestamp: '2026-08-28T12:00:00.000Z' },
      } as IpcResponse<SqliteSmokeResult>),
      getAppVersion: vi.fn().mockResolvedValue({
        success: true,
        data: {
          version: '0.1.0',
          electronVersion: '35.0.0',
          chromeVersion: '134.0.0',
          nodeVersion: '22.0.0',
          platform: 'win32',
        },
      }),
    };

    await TestBed.configureTestingModule({
      imports: [Stage1StatusComponent],
      providers: [
        { provide: ElectronBridgeService, useValue: mockElectronBridge },
      ],
    }).compileComponents();
  });

  it('should create the Stage 1 status component', () => {
    const fixture = TestBed.createComponent(Stage1StatusComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should verify Angular renderer is ready by default', () => {
    const fixture = TestBed.createComponent(Stage1StatusComponent);
    const component = fixture.componentInstance;
    expect(component.rendererStatus().ready).toBe(true);
    expect(component.rendererStatus().framework).toContain('Angular 22');
  });

  it('should invoke IPC bridge and update signals on test execution', async () => {
    const fixture = TestBed.createComponent(Stage1StatusComponent);
    const component = fixture.componentInstance;
    await component.runAllTests();

    expect(mockElectronBridge.ping).toHaveBeenCalled();
    expect(mockElectronBridge.smokeSqlite).toHaveBeenCalled();
    expect(mockElectronBridge.getAppVersion).toHaveBeenCalled();

    expect(component.ipcStatus().success).toBe(true);
    expect(component.ipcStatus().data?.message).toBe('pong');
    expect(component.sqliteStatus().success).toBe(true);
    expect(component.sqliteStatus().data?.version).toBe('3.53.4');
  });
});

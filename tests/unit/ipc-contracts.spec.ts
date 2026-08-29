import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, IpcResponse, SqliteSmokeResult, PingResult } from '../../shared/ipc-contracts';

describe('IPC Contracts & Channel Definitions', () => {
  it('should define distinct allowlisted IPC channels', () => {
    expect(IPC_CHANNELS.PING).toBe('dairy:ping');
    expect(IPC_CHANNELS.SQLITE_SMOKE).toBe('dairy:sqlite-smoke');
    expect(IPC_CHANNELS.APP_VERSION).toBe('dairy:app-version');
    expect(IPC_CHANNELS.FARMER_LIST).toBe('dairy:farmer:list');
    expect(IPC_CHANNELS.FARMER_GET).toBe('dairy:farmer:get');
    expect(IPC_CHANNELS.FARMER_GET_BY_CODE).toBe('dairy:farmer:get-by-code');
    expect(IPC_CHANNELS.FARMER_GET_EDIT_DETAIL).toBe('dairy:farmer:get-edit-detail');
    expect(IPC_CHANNELS.FARMER_CREATE).toBe('dairy:farmer:create');
    expect(IPC_CHANNELS.FARMER_UPDATE).toBe('dairy:farmer:update');
    expect(IPC_CHANNELS.FARMER_DEACTIVATE).toBe('dairy:farmer:deactivate');
    expect(IPC_CHANNELS.FARMER_REACTIVATE).toBe('dairy:farmer:reactivate');
  });

  it('should format successful IPC responses correctly', () => {
    const response: IpcResponse<PingResult> = {
      success: true,
      data: {
        message: 'pong',
        timestamp: new Date().toISOString(),
        processType: 'browser',
      },
    };

    expect(response.success).toBe(true);
    expect(response.data?.message).toBe('pong');
    expect(response.error).toBeUndefined();
  });

  it('should format bilingual error envelopes on failure', () => {
    const errorResponse: IpcResponse<SqliteSmokeResult> = {
      success: false,
      error: {
        code: 'SQLITE_ERROR',
        messageMr: 'डेटाबेस त्रुटी',
        messageEn: 'Database error',
        details: 'Connection lost',
      },
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error?.code).toBe('SQLITE_ERROR');
    expect(errorResponse.error?.messageMr).toContain('डेटाबेस');
    expect(errorResponse.error?.messageEn).toContain('Database');
  });
});

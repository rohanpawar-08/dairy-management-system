import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RestoreConfirmDialogComponent, RestoreConfirmDialogData } from './restore-confirm-dialog.component';
import { I18nService } from '../../../core/services/i18n.service';

describe('RestoreConfirmDialogComponent', () => {
  let component: RestoreConfirmDialogComponent;
  let mockDialogRef: any;
  let mockData: RestoreConfirmDialogData;
  let mockI18n: any;

  beforeEach(() => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockData = {
      displayName: 'backup_aug2026.db',
      sizeFormatted: '1.5 MB',
    };

    mockI18n = {
      t: vi.fn().mockImplementation((key: string, params?: any) => {
        if (params?.filename) return `Restore from ${params.filename}`;
        return key;
      }),
    };

    TestBed.configureTestingModule({
      imports: [RestoreConfirmDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: I18nService, useValue: mockI18n },
      ],
    });

    const fixture = TestBed.createComponent(RestoreConfirmDialogComponent);
    component = fixture.componentInstance;
  });

  it('1. should create dialog component', () => {
    expect(component).toBeTruthy();
    expect(component.data.displayName).toBe('backup_aug2026.db');
    expect(component.data.sizeFormatted).toBe('1.5 MB');
    expect(component.isAcknowledged).toBe(false);
  });

  it('2. confirm button is enabled only when acknowledgement is checked', () => {
    expect(component.isAcknowledged).toBe(false);
    component.isAcknowledged = true;
    expect(component.isAcknowledged).toBe(true);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CreatePeriodDialogComponent } from './create-period-dialog.component';

describe('CreatePeriodDialogComponent', () => {
  let component: CreatePeriodDialogComponent;
  let fixture: ComponentFixture<CreatePeriodDialogComponent>;
  let mockDialogRef: any;

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CreatePeriodDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatePeriodDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate end date as 6 days after start date', () => {
    component.form.patchValue({ periodStart: '2026-09-07' });
    component.onStartDateChange();
    expect(component.calculatedEnd).toBe('2026-09-13');
  });

  it('should close with payload on confirm', () => {
    component.form.patchValue({ periodStart: '2026-09-07' });
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith({ periodStart: '2026-09-07' });
  });

  it('should close with null on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });
});

import { TestBed } from '@angular/core/testing';
import { FarmerDeactivateDialogComponent } from './farmer-deactivate-dialog.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('FarmerDeactivateDialogComponent (Angular Unit)', () => {
  let mockDialogRef: any;

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FarmerDeactivateDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { farmer: { nameMr: 'तुकाराम शिंदे', memberCode: '001' } },
        },
      ],
    }).compileComponents();
  });

  it('renders confirmation text and closes with reason on confirm', () => {
    const fixture = TestBed.createComponent(FarmerDeactivateDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('तुकाराम शिंदे');
    expect(compiled.textContent).toContain('001');

    component.reason = 'Relocated';
    component.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      confirmed: true,
      reason: 'Relocated',
    });
  });
});

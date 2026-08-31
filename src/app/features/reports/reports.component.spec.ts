import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportsComponent } from './reports.component';
import { ReportStateService } from '../../core/services/report-state.service';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ReportsComponent', () => {
  let component: ReportsComponent;
  let fixture: ComponentFixture<ReportsComponent>;
  let mockReportState: any;

  beforeEach(async () => {
    mockReportState = {
      isGeneratingPdf: () => false,
      previewData: () => null,
      previewReport: vi.fn(),
      exportPdf: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ReportsComponent, BrowserAnimationsModule],
      providers: [
        { provide: ReportStateService, useValue: mockReportState }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

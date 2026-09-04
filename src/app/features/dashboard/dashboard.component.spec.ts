import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { AuthStateService } from '../../core/services/auth-state.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { ReportStateService } from '../../core/services/report-state.service';

describe('DashboardComponent (Angular Unit)', () => {
  let mockAuthState: Partial<AuthStateService>;
  let mockReportState: any;
  let routerMock: any;

  beforeEach(async () => {
    mockAuthState = {
      dairyProfile: signal({
        id: 1,
        centreName: 'श्री गणेश कृपा डेअरी',
        registrationCode: null,
        ownerName: 'राम पाटील',
        phonePrimary: '9876543210',
        phoneSecondary: null,
        addressLine: null,
        taluka: null,
        district: null,
        pincode: null,
        defaultLanguage: 'mr',
        settlementStartDay: 'MONDAY',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
      currentSession: signal({
        userId: 1,
        username: 'owner',
        fullName: 'राम पाटील',
        role: 'OWNER',
        loginTime: new Date().toISOString(),
      }),
      isOwner: signal(true),
      isOperator: signal(false),
      loadProfile: vi.fn().mockResolvedValue(null),
      logout: vi.fn().mockResolvedValue(undefined),
    };

    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    };
    mockReportState = {
      dashboardSummary: signal({
        todayLitresFormatted: '12.5',
        todayAmountFormatted: '₹625.00',
        todayCollectionCount: 4,
        totalFarmerPayableFormatted: '₹500.00',
        unpaidFarmerCount: 2,
      }),
      loadDashboardSummary: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: AuthStateService, useValue: mockAuthState },
        { provide: ReportStateService, useValue: mockReportState },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();
  });

  it('renders dairy profile summary and logged-in user info', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('श्री गणेश कृपा डेअरी');
    expect(compiled.textContent).toContain('राम पाटील');
  });

  it('renders Rate Plans navigation card for Owner and navigates on click', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('दरपत्रक व्यवस्थापन');

    const component = fixture.componentInstance;
    component.navigateToRatePlans();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/rate-plans']);
  });

  it('renders Backup & Restore navigation card for Owner and navigates on click', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('डेटाबेस बॅकअप आणि पुनर्संचयन');

    const component = fixture.componentInstance;
    component.navigateToBackupRestore();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/backup-restore']);
  });

  it('hides Rate Plans navigation card when user is not an Owner', async () => {
    (mockAuthState.isOwner as any).set(false);
    (mockAuthState.isOperator as any).set(true);

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.rate-plans-card')).toBeNull();
  });

  it('triggers logout on button click', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const component = fixture.componentInstance;

    await component.onLogout();
    expect(mockAuthState.logout).toHaveBeenCalled();
  });

  it('translates dashboard summary labels in English and Marathi', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const component = fixture.componentInstance;

    component.i18n.setLanguage('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Today's Litres");
    expect(fixture.nativeElement.textContent).toContain("Today's Amount");
    expect(fixture.nativeElement.textContent).toContain('Total Outstanding');

    component.i18n.setLanguage('mr');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('आजचे एकूण लिटर');
    expect(fixture.nativeElement.textContent).toContain('आजची एकूण रक्कम');
    expect(fixture.nativeElement.textContent).toContain('एकूण थकीत रक्कम');
  });
});

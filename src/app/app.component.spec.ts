import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { I18nService } from './core/services/i18n.service';
import { describe, it, expect, beforeEach } from 'vitest';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app layout component', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have the expected Marathi title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toContain('डेअरी व्यवस्थापन प्रणाली');
  });

  it('should render header branding in template', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('डेअरी व्यवस्थापन प्रणाली');
  });

  it('renders bilingual offline status badge instead of legacy shell text', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const i18n = TestBed.inject(I18nService);

    i18n.setLanguage('mr');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.env-badge');
    expect(badge?.textContent).toContain('ऑफलाइन मोड');
    expect(badge?.textContent).not.toContain('Stage 1 Active Shell');

    i18n.setLanguage('en');
    fixture.detectChanges();
    expect(badge?.textContent).toContain('Offline Mode');
    expect(badge?.textContent).not.toContain('Stage 1 Active Shell');
  });
});
